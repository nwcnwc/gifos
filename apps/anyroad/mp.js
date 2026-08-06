// Anyroad — multiplayer.
//
// This is the part GifOS is genuinely better at than a normal web game: there
// is no game server, no account, and no lobby. The room IS the invite link, the
// host's browser holds the state, and a guest who opens the link lands in the
// same place on Earth as everyone else.
//
// Two things shape the design, both from the platform:
//
//  1. A subscriber re-downloads the WHOLE collection on every change. Position
//     traffic is therefore O(players²) and the sensible move is a low publish
//     rate (5 Hz) with client-side interpolation, not a high one.
//  2. Positions are published as LATITUDE AND LONGITUDE, never as world metres.
//     Each player's world frame is pinned at their own hop point, so metres
//     mean different things in different tabs — geographic coordinates are the
//     only thing that survives the trip.
(function (root) {
  'use strict';

  var PUBLISH_HZ = 5;
  var STALE_MS = 7000;        // a player unheard-from this long stops being drawn
  var FINISH_RADIUS = 30;     // metres

  var me = { id: null, name: 'Driver' };
  var frame = null;
  var others = {};            // id -> { lat, lon, yaw, spd, t, prev, name, tint }
  var raceRec = null;
  var worldRec = null;
  var acc = 0;
  var myResult = null;
  var listeners = [];

  function db(n) { return root.Host.db(n); }

  // A stable colour per player, so the same car is the same colour for everyone
  // watching. Derived from the id rather than assigned, so no coordination.
  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var hue = (h % 360) / 360;
    // HSV -> RGB at fixed saturation/value, kept bright enough to read at range.
    var i6 = Math.floor(hue * 6), f = hue * 6 - i6, s = 0.62, v = 0.95;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var m = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i6 % 6];
    return m;
  }

  function init() {
    root.Host.me().then(function (id) {
      me.id = id.id; me.name = id.name || 'Driver';
    }).catch(function () { me.id = 'local'; });

    db('players').subscribe(function (list) {
      var now = Date.now();
      var seen = {};
      (list || []).forEach(function (p) {
        if (!p || !p.id || p.id === me.id) return;
        seen[p.id] = 1;
        var cur = others[p.id];
        // Keep the previous sample so we can interpolate rather than teleport.
        others[p.id] = {
          lat: p.lat, lon: p.lon, yaw: p.yaw, spd: p.spd || 0, name: p.name || 'Driver',
          t: now, tint: tintFor(p.id),
          prev: cur ? { lat: cur.lat, lon: cur.lon, yaw: cur.yaw, t: cur.t } : null,
        };
      });
      for (var id in others) if (!seen[id]) delete others[id];
    });

    db('race').subscribe(function (list) {
      raceRec = null; worldRec = null;
      (list || []).forEach(function (r) {
        if (r.id === 'race') raceRec = r;
        if (r.id === 'world') worldRec = r;
      });
      // A guest who opened the invite link has no world of their own yet: take
      // the host's. This is what makes the link alone enough to join.
      if (worldRec && !root.App.hasHopped()) {
        root.App.hop(worldRec.lat, worldRec.lon, worldRec.place);
      }
      listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
    });
  }

  // Publish where the world is, so joiners land here too.
  function setFrame(f, lat, lon, place) {
    frame = f;
    myResult = null;
    db('race').put({ id: 'world', lat: lat, lon: lon, place: place || '' }).catch(function () {});
  }

  function tick(car, dt) {
    if (!frame || !me.id) return;
    acc += dt;
    if (acc < 1 / PUBLISH_HZ) return;
    acc = 0;
    var g = frame.toGeo(car.x, car.z);
    db('players').put({
      id: me.id, name: me.name, lat: g.lat, lon: g.lon,
      yaw: car.yaw, spd: Math.abs(car.speed), t: Date.now(),
    }).catch(function () {});
  }

  // Other cars, in MY world frame, interpolated toward their latest sample.
  function ghosts() {
    if (!frame) return [];
    var now = Date.now(), out = [];
    for (var id in others) {
      var o = others[id];
      if (now - o.t > STALE_MS) continue;
      var lat = o.lat, lon = o.lon, yaw = o.yaw;
      if (o.prev) {
        // Extrapolate across the gap between publishes so a ghost glides
        // instead of stepping five times a second.
        var span = Math.max(1, o.t - o.prev.t);
        var k = Math.min(1.6, (now - o.t) / span);
        lat = o.lat + (o.lat - o.prev.lat) * k;
        lon = o.lon + (o.lon - o.prev.lon) * k;
        var dy = ((o.yaw - o.prev.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        yaw = o.yaw + dy * k;
      }
      var w = frame.toWorld(lat, lon);
      var h = root.Terrain.heightAt(frame, w.x, w.z);
      out.push({ x: w.x, y: (h === null ? 0 : h), z: w.z, yaw: yaw, tint: o.tint, name: o.name });
    }
    return out;
  }

  function count() {
    var now = Date.now(), n = 0;
    for (var id in others) if (now - others[id].t <= STALE_MS) n++;
    return n + 1;
  }

  // ---- races ---------------------------------------------------------------
  // A race is two points and a start time. Everything else — who is ahead, who
  // finished — is derived, so there is no authority to disagree with.
  function setRace(startGeo, finishGeo) {
    return db('race').put({
      id: 'race',
      sLat: startGeo.lat, sLon: startGeo.lon,
      fLat: finishGeo.lat, fLon: finishGeo.lon,
      startedAt: Date.now() + 3000,          // a three-second countdown for everyone
      results: [],
    });
  }

  function clearRace() { return db('race').delete('race'); }

  function raceState(car) {
    if (!raceRec || !frame) return null;
    var now = Date.now();
    var fin = frame.toWorld(raceRec.fLat, raceRec.fLon);
    var d = Math.hypot(car.x - fin.x, car.z - fin.z);
    var state = {
      countdown: Math.max(0, raceRec.startedAt - now),
      elapsed: Math.max(0, now - raceRec.startedAt),
      toFinish: d,
      finish: fin,
      start: frame.toWorld(raceRec.sLat, raceRec.sLon),
      results: raceRec.results || [],
      done: !!myResult,
      myTime: myResult,
    };
    if (!myResult && state.countdown === 0 && d < FINISH_RADIUS) {
      myResult = state.elapsed;
      state.done = true; state.myTime = myResult;
      var results = (raceRec.results || []).slice();
      results.push({ id: me.id, name: me.name, ms: myResult });
      results.sort(function (a, b) { return a.ms - b.ms; });
      db('race').put(Object.assign({}, raceRec, { results: results })).catch(function () {});
    }
    return state;
  }

  root.MP = {
    init: init, setFrame: setFrame, tick: tick, ghosts: ghosts, count: count,
    setRace: setRace, clearRace: clearRace, raceState: raceState,
    hasRace: function () { return !!raceRec; },
    onChange: function (cb) { listeners.push(cb); },
    me: function () { return me; },
  };
})(window);
