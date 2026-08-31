/*
 * Matter Sandbox — one room, one world.
 *
 * Host simulates. Guests send taps and drags on THEIR own row. The host
 * writes `world` (read-only). Nobody writes anybody else's row.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var WORLD_HZ = 10;
  var HB_MS = 400;

  var api = null;
  var me = { id: null, name: 'You' };
  var owner = true;
  var others = {};
  var lastWorld = 0;
  var lastPub = 0;
  var cmdN = 0;
  var applied = {};
  var pending = null;
  var drag = null;
  var cursor = { x: 400, y: 300 };
  var onRoster = null;
  var seenAt = {};
  var lastList = [];
  var roomy = false;

  function now() { return Date.now(); }
  function db(n) { return api.db(n); }

  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ', 70%, 64%)';
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  function ingestWorld(list) {
    var rec = null;
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'world') rec = list[i];
    }
    if (!rec || !rec.scene) return;
    if (owner) return;
    root.MSPhysics.applyPoses(rec.scene);
  }

  function honor(p) {
    if (!owner || !p || p.id === me.id) return;
    if (p.cmd && p.cmd.n != null) {
      var key = p.id + ':' + p.cmd.n;
      if (!applied[key]) {
        applied[key] = now();
        var c = p.cmd;
        var Phys = root.MSPhysics;
        if (c.op === 'box') Phys.addBox(c.x, c.y);
        else if (c.op === 'ball') Phys.addBall(c.x, c.y);
        else if (c.op === 'ragdoll') Phys.addRagdoll(c.x, c.y);
        else if (c.op === 'stack') Phys.addStack(c.x, c.y);
        else if (c.op === 'reset') Phys.resetArena();
        else if (c.op === 'grav' && typeof c.g === 'number') {
          Phys.setGravity(c.g);
          if (root.MSUI) root.MSUI.setGravity(c.g, true);
        }
      }
    }
    if (p.drag && p.drag.sid) {
      root.MSPhysics.setRemoteDrag(p.id, p.drag.sid, p.drag.x, p.drag.y);
    } else {
      root.MSPhysics.setRemoteDrag(p.id, null);
    }
  }

  function ingestPlayers(list) {
    lastList = list || [];
    var t = now();
    var players = live(lastList, t);
    var seen = {};
    others = {};
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        color: tintFor(p.id),
        x: p.px, y: p.py,
        tool: p.tool
      };
      honor(p);
    }
    for (var id in seenAt) {
      if (!seen[id] && id !== me.id) root.MSPhysics.setRemoteDrag(id, null);
    }
    if (onRoster) onRoster(roster());
    pushCursors();
  }

  function pushCursors() {
    if (!root.MSUI) return;
    var list = [];
    for (var id in others) {
      var o = others[id];
      if (o.x == null || o.y == null) continue;
      list.push({ x: o.x, y: o.y, name: o.name, color: o.color });
    }
    root.MSUI.setCursors(list);
  }

  function snapshot() {
    var row = {
      id: me.id,
      name: me.name,
      tool: root.MSUI ? root.MSUI.tool() : 'grab',
      px: Math.round(cursor.x),
      py: Math.round(cursor.y),
      at: now()
    };
    if (pending) row.cmd = pending;
    if (drag) row.drag = drag;
    return row;
  }

  function publishPlayer(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPub < HB_MS) return;
    lastPub = t;
    db('players').put(snapshot()).catch(function () {});
  }

  function publishWorld(force) {
    if (!api || !me.id || !owner) return;
    if (!roomy && !force) return;
    var t = now();
    if (!force && t - lastWorld < 1000 / WORLD_HZ) return;
    lastWorld = t;
    db('world').put({
      id: 'world',
      by: me.id,
      scene: root.MSPhysics.exportScene(),
      t: t
    }).catch(function () {});
  }

  function onLocalAction(a) {
    if (!a) return;
    if (a.x != null) cursor.x = a.x;
    if (a.y != null) cursor.y = a.y;
    if (a.op === 'cursor' || a.op === 'move' || a.op === 'down' || a.op === 'up') {
      if (a.op === 'up') drag = null;
      publishPlayer(true);
      return;
    }
    if (a.op === 'drag') {
      drag = { sid: a.sid, x: a.x, y: a.y };
      publishPlayer(true);
      return;
    }
    if (a.op === 'undrag') {
      drag = null;
      publishPlayer(true);
      return;
    }
    if (a.op === 'tool') {
      publishPlayer(true);
      return;
    }
    pending = { n: ++cmdN, op: a.op, x: a.x, y: a.y, g: a.g };
    publishPlayer(true);
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      return owner;
    }).catch(function () { owner = true; return true; }) : Promise.resolve(true);

    return infoP.then(function () {
      return api.me();
    }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'You';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          roomy = countOthers() > 0 || !owner;
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 2200);
        db('players').subscribe(function (list) {
          ingestPlayers(list || []);
          var was = roomy;
          roomy = countOthers() > 0 || !owner;
          if (owner && roomy && !was) publishWorld(true);
          done();
        });
        db('world').subscribe(function (list) {
          ingestWorld(list || []);
        });
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function tick() {
    if (!api || !me.id) return;
    publishPlayer(false);
    if (owner) publishWorld(false);
    pushCursors();
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true }];
    for (var id in others) list.push({ id: id, name: others[id].name, me: false });
    list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return list;
  }

  root.MSNet = {
    init: init,
    tick: tick,
    onAction: onLocalAction,
    onRoster: function (fn) { onRoster = fn; },
    roster: roster,
    me: function () { return me; },
    owner: function () { return owner; },
    live: function () { return !!api && !!me.id && (countOthers() > 0 || !owner); },
    count: function () { return countOthers() + (me.id ? 1 : 0); }
  };
})(window);
