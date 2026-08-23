/*
 * Koil — multiplayer over gifos.db.
 *
 * Upstream's entire network was a C socket server on localhost:6970
 * (serve.js also binds HTTP on :6969). That path is dead. Players replicate
 * through a shared `players` collection hosted by the person who sent the
 * invite. There is no game server.
 *
 * NOBODY WRITES ANYBODY ELSE'S ROW. Each player owns one record:
 *   pose, a short ring of bombs they threw, and the item indices they picked
 *   up. A bomb you see on their row is spawned locally and simulated here.
 *   An item they claim is killed locally. First claim the client sees wins.
 *   Same shape as fps-simple's hit-claims, without the damage: there is
 *   nothing to shoot, so there is nothing to adjudicate.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;
  var STALE_MS = 9000;
  var THROW_RING = 6;
  var CLAIM_TTL = 20000;

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var seq = 0;
  var myGot = [];
  var pendingThrows = [];
  var seenThrows = {}; // "id:n" -> t
  var appliedGot = {}; // "id:itemIndex" (or just itemIndex globally)
  var lastPublished = 0;
  var onRoster = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r2(n) { return Math.round(n * 100) / 100; }

  function hueFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h & 255;
  }

  function spawnFor(id) {
    var spots = [[1.5, 1.5], [1.5, 4.5], [4.5, 4.5], [5.5, 6.5], [0.5, 0.5], [6.5, 3.5]];
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
    return spots[h % spots.length];
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve(null);
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Player';
      var sp = spawnFor(me.id);
      root.Koil.me.id = me.id;
      root.Koil.me.name = me.name;
      root.Koil.me.x = sp[0];
      root.Koil.me.y = sp[1];
      root.Koil.me.hue = hueFor(me.id);
      var settled = false;
      return new Promise(function (resolve) {
        var done = function (list) { if (!settled) { settled = true; resolve(list || []); } };
        setTimeout(function () { done([]); }, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done(list || []);
        });
      });
    }).catch(function () { return null; });
  }

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      drainGot(p);
      drainThrows(p);
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        x: p.x, y: p.y, dir: p.dir || 0, moving: p.mv || 0, hue: p.hue || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        prev: cur ? { x: cur.x, y: cur.y, dir: cur.dir, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) {
        root.Koil.dropOther(id);
        delete others[id];
      }
    }
    paintOthers();
    if (onRoster) onRoster(roster());
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, dir: o.dir };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var dd = ((o.dir - o.prev.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      dir: o.prev.dir + dd * a
    };
  }

  function paintOthers() {
    for (var id in others) {
      var p = poseOf(others[id]);
      root.Koil.setOther(id, {
        x: p.x, y: p.y, dir: p.dir,
        moving: others[id].moving, hue: others[id].hue, name: others[id].name
      });
    }
  }

  function drainGot(p) {
    if (!p.got || !p.got.length) return;
    for (var i = 0; i < p.got.length; i++) {
      var idx = p.got[i] | 0;
      var key = p.id + ':' + idx;
      if (appliedGot[key]) continue;
      appliedGot[key] = now();
      root.Koil.killItem(idx);
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in appliedGot) if (appliedGot[k] < cutoff) delete appliedGot[k];
  }

  function drainThrows(p) {
    if (!p.throws || !p.throws.length) return;
    for (var i = 0; i < p.throws.length; i++) {
      var th = p.throws[i];
      if (!th) continue;
      var key = p.id + ':' + th.n;
      if (seenThrows[key]) continue;
      seenThrows[key] = now();
      root.Koil.spawnRemoteBomb(th);
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in seenThrows) if (seenThrows[k] < cutoff) delete seenThrows[k];
  }

  function claimItem(index) {
    if (myGot.indexOf(index) < 0) myGot.push(index);
    publish(true);
  }

  function claimThrow(spawned) {
    pendingThrows.push({
      n: ++seq,
      x: r2(spawned.x), y: r2(spawned.y), z: r2(spawned.z),
      dx: r2(spawned.dx), dy: r2(spawned.dy), dz: r2(spawned.dz),
      life: r2(spawned.life)
    });
    if (pendingThrows.length > THROW_RING) pendingThrows.shift();
    publish(true);
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var p = root.Koil.me;
    db('players').put({
      id: me.id, name: me.name,
      x: r2(p.x), y: r2(p.y), dir: r2(p.dir),
      mv: p.moving | 0, hue: p.hue | 0,
      got: myGot.slice(),
      throws: pendingThrows.slice(),
      t: t
    }).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    paintOthers();
    publish(false);
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true }];
    for (var id in others) list.push({ id: id, name: others[id].name, me: false });
    return list;
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    claimItem: claimItem,
    claimThrow: claimThrow,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { var n = 0; for (var k in others) n++; return n + 1; },
    live: function () { return !!api && !!me.id; },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
