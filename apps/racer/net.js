/*
 * Racer — netplay.
 *
 * There is no game server. Each player owns exactly one row in `players` and
 * only ever writes that row — position, speed, lap, finish time. The host
 * writes the `race` record (read-only for guests) to start a countdown.
 * The board is assembled by READING everyone else's row, never by writing it.
 *
 * A subscriber re-downloads the whole collection on every change, so publish
 * is 6 Hz with interpolation, not a high tick. Comfortable for a handful of
 * friends on a link; not a claim about competitive netcode.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;
  var STALE_MS = 9000;
  var COUNTDOWN_MS = 3000;

  var api = null;
  var me = { id: null, name: 'Driver' };
  var others = {};
  var raceRec = null;
  var myFinish = null;
  var myRaceAt = 0;
  var acc = 0;
  var onRace = null;
  var onRoster = null;
  var isHost = false;
  var started = false;

  function db(n) {
    try { return api && api.db ? api.db(n) : null; } catch (e) { return null; }
  }

  function tintFor(id) {
    var h = 0;
    id = String(id || '');
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360) / 360;
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  function init() {
    api = root.gifos;
    if (!api || !api.db || !api.me) {
      isHost = true;
      return Promise.resolve({ host: true, others: 0 });
    }
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Driver';
      var p = db('players');
      var r = db('race');
      if (p) p.subscribe(function (list) { ingestPlayers(list || []); });
      if (r) r.subscribe(function (list) { ingestRace(list || []); });
      // Probe: a read-only collection refuses a guest. The host is the
      // only one who can start a race, so we need to know which we are
      // before we show the button. The probe id is not 'race', so it
      // cannot clobber a race that is already on.
      if (!r) { isHost = true; return { host: true, others: 0 }; }
      return r.put({ id: 'host-probe', by: me.id, t: Date.now() }).then(function () {
        isHost = true;
        return r.delete('host-probe').catch(function () {});
      }).then(function () {
        return { host: true, others: count() - 1 };
      }).catch(function () {
        isHost = false;
        return { host: false, others: count() - 1 };
      });
    }).catch(function () {
      isHost = true;
      return { host: true, others: 0 };
    });
  }

  function ingestPlayers(list) {
    var t = Date.now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.z !== p.z || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Driver',
        x: p.x, z: p.z, spd: p.spd || 0,
        lap: p.lap || 0, fin: p.fin || 0, raceAt: p.raceAt || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t, hue: tintFor(p.id),
        prev: cur ? { x: cur.x, z: cur.z, spd: cur.spd, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || Date.now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function ingestRace(list) {
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'race') rec = list[i];
    }
    var prev = raceRec && raceRec.startedAt;
    raceRec = rec;
    if (raceRec && raceRec.startedAt !== prev) {
      myFinish = null;
      myRaceAt = raceRec.startedAt;
    }
    if (onRace) onRace(raceState());
  }

  function publish(st, force) {
    var p = db('players');
    if (!p || !me.id) return;
    var now = Date.now();
    if (!force) {
      acc += st && st.dt ? st.dt : 0;
      if (acc < 1 / PUBLISH_HZ) return;
      acc = 0;
    }
    p.put({
      id: me.id,
      name: me.name,
      x: r2(st.x),
      z: Math.round(st.z),
      spd: Math.round(st.speed),
      lap: st.lap || 0,
      fin: myFinish || 0,
      raceAt: myRaceAt || 0,
      t: now
    }).catch(function () {});
  }

  function ghosts() {
    if (!root.Racer) return [];
    var now = Date.now(), out = [], tl = (root.Racer.state().trackLength) || 1;
    for (var id in others) {
      var o = others[id];
      if (now - o.seen > STALE_MS) continue;
      var x = o.x, z = o.z, spd = o.spd;
      if (o.prev) {
        var span = Math.max(1, o.t - o.prev.t);
        var k = Math.min(1.4, (now - o.t) / span);
        x = o.x + (o.x - o.prev.x) * k;
        // z wraps the track; interpolate the short way.
        var dz = o.z - o.prev.z;
        if (dz >  tl / 2) dz -= tl;
        if (dz < -tl / 2) dz += tl;
        z = o.z + dz * k;
        if (z < 0) z += tl;
        if (z >= tl) z -= tl;
        spd = o.spd + (o.spd - o.prev.spd) * k;
      }
      out.push({
        id: o.id,
        name: o.name,
        offset: x,
        z: z,
        speed: spd,
        sprite: root.Racer.spriteFor(o.id)
      });
    }
    return out;
  }

  function count() {
    var now = Date.now(), n = 0;
    for (var id in others) if (now - others[id].seen <= STALE_MS) n++;
    return n + 1;
  }

  function roster() {
    var now = Date.now(), list = [{
      id: me.id, name: me.name, mine: true,
      fin: myFinish || 0, lap: 0, raceAt: myRaceAt
    }];
    var st = root.Racer ? root.Racer.state() : null;
    if (st) list[0].lap = st.lap;
    for (var id in others) {
      var o = others[id];
      if (now - o.seen > STALE_MS) continue;
      list.push({ id: o.id, name: o.name, mine: false, fin: o.fin || 0, lap: o.lap || 0, raceAt: o.raceAt || 0 });
    }
    return list;
  }

  function startRace() {
    var r = db('race');
    var startedAt = Date.now() + COUNTDOWN_MS;
    myFinish = null;
    myRaceAt = startedAt;
    var rec = { id: 'race', startedAt: startedAt, by: me.name, byId: me.id, nLaps: 1 };
    if (!r) {
      raceRec = rec;
      if (onRace) onRace(raceState());
      return Promise.resolve(true);
    }
    return r.put(rec).then(function () { isHost = true; return true; })
      .catch(function () { return false; });
  }

  function markFinished(ms) {
    if (myFinish) return;
    myFinish = Math.round(ms);
    var st = root.Racer ? root.Racer.state() : { x: 0, z: 0, speed: 0, lap: 1 };
    st.dt = 1;
    publish(st, true);
    if (onRoster) onRoster(roster());
  }

  function raceState() {
    if (!raceRec || !raceRec.startedAt) return null;
    var now = Date.now();
    var countdown = Math.max(0, raceRec.startedAt - now);
    var elapsed = Math.max(0, now - raceRec.startedAt);
    var board = [];
    var people = roster();
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      if (p.raceAt === raceRec.startedAt && p.fin) board.push({ name: p.name, ms: p.fin, mine: p.mine, id: p.id });
    }
    board.sort(function (a, b) { return a.ms - b.ms; });
    return {
      startedAt: raceRec.startedAt,
      countdown: countdown,
      elapsed: elapsed,
      running: countdown === 0,
      nLaps: raceRec.nLaps || 1,
      by: raceRec.by,
      mine: myFinish,
      board: board
    };
  }

  root.Net = {
    init: init,
    publish: publish,
    ghosts: ghosts,
    count: count,
    roster: roster,
    startRace: startRace,
    markFinished: markFinished,
    raceState: raceState,
    isHost: function () { return isHost; },
    me: function () { return me; },
    onRace: function (cb) { onRace = cb; },
    onRoster: function (cb) { onRoster = cb; }
  };
})(window);
