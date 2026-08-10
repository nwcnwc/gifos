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
  var celebrated = {};      // finishes already announced, so a republish is quiet
  var finishCb = null;
  var noteCb = null;   // room-level news the player must be told (a followed hop)
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
      drainHits(list || []);
      var now = Date.now();
      var seen = {};
      (list || []).forEach(function (p) {
        if (!p || !p.id || p.id === me.id) return;
        seen[p.id] = 1;
        var cur = others[p.id];
        // Staleness is measured by when WE last saw this record CHANGE, not by
        // the sender's timestamp and not by when the collection was delivered.
        //  - The sender's clock is not ours; peers are independent devices.
        //  - Stamping `now` on every delivery makes every record permanently
        //    fresh, so a driver who left months ago is still parked on the road
        //    in every future session (their row lives on in the host's db).
        var moved = !cur || cur.lat !== p.lat || cur.lon !== p.lon || cur.stamp !== p.t;
        others[p.id] = {
          lat: p.lat, lon: p.lon, yaw: p.yaw, spd: p.spd || 0, name: p.name || 'Driver',
          stamp: p.t, seen: moved ? now : cur.seen, t: now, tint: tintFor(p.id),
          prev: cur ? { lat: cur.lat, lon: cur.lon, yaw: cur.yaw, t: cur.t } : null,
        };
      });
      for (var id in others) if (!seen[id]) delete others[id];
    });

    db('race').subscribe(function (list) {
      var prevStart = raceRec && raceRec.startedAt;
      var prevResults = (raceRec && raceRec.results || []).length;
      raceRec = null; worldRec = null;
      (list || []).forEach(function (r) {
        if (r.id === 'race') raceRec = r;
        if (r.id === 'world') worldRec = r;
      });
      // A NEW RACE CLEARS YOUR RESULT. myResult was only ever reset on a hop,
      // so once you crossed a finish line you were "finished" forever: start
      // another race and the arrow never came back, because your own copy still
      // believed you had already done it. Keyed on startedAt, which is minted
      // fresh by setRace.
      if (raceRec && raceRec.startedAt !== prevStart) {
        myResult = null;
        celebrated = {};
      }
      // Somebody crossed the line. Everyone should know — a race where only the
      // winner finds out is not an event, it is a private notification.
      if (raceRec && finishCb) {
        var res = raceRec.results || [];
        if (res.length > prevResults) {
          for (var i = prevResults; i < res.length; i++) {
            var r2 = res[i];
            if (!r2 || celebrated[r2.id + ':' + r2.ms]) continue;
            celebrated[r2.id + ':' + r2.ms] = 1;
            finishCb({ name: r2.name, ms: r2.ms, place: i + 1,
                       mine: r2.id === me.id, total: res.length });
          }
        }
      }
      // A guest who opened the invite link has no world of their own yet: take
      // the host's. This is what makes the link alone enough to join.
      if (worldRec && isFinite(worldRec.lat) && isFinite(worldRec.lon) && !root.App.hasHopped()) {
        root.App.hop(worldRec.lat, worldRec.lon, worldRec.place);
        myWorld = { lat: worldRec.lat, lon: worldRec.lon };
      } else if (worldRec && isFinite(worldRec.lat) && isFinite(worldRec.lon)
                 && worldRec.byId && worldRec.byId !== me.id && myWorld
                 && farFrom(myWorld, worldRec) && root.App.hasHopped()) {
        // …AND THE ROOM MOVES TOGETHER AFTER THAT. This only ever ran for a
        // player who had never hopped, so the moment BOTH had, a teleport by
        // one silently stranded the other: their ghost is drawn from lat/lon
        // in MY frame, which after their hop is thousands of kilometres away,
        // where no terrain is loaded — so ghosts() skipped them forever while
        // count() (which has no terrain test) still said two players. "Not
        // able to see the other player after a while… may have been after
        // teleporting." Following is what "we are driving together" means.
        //
        // LOOP-SAFE: hop() publishes the world again under MY id, the other
        // side sees coordinates it already has, farFrom() is false, and the
        // exchange stops. The distance gate is what does it — not a flag.
        myWorld = { lat: worldRec.lat, lon: worldRec.lon };
        root.App.hop(worldRec.lat, worldRec.lon, worldRec.place);
        if (noteCb) noteCb((worldRec.by || 'They') + ' hopped to ' + (worldRec.place || 'somewhere else') + ' — following.');
      }
      listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
    });
  }

  // Publish where the world is, so joiners land here too — and so everyone
  // already here can FOLLOW (see the race subscription). `byId` is what keeps
  // that from being a hall of mirrors: a client never follows its own write.
  var myWorld = null;
  function setFrame(f, lat, lon, place) {
    frame = f;
    myResult = null;
    myWorld = { lat: lat, lon: lon };
    db('race').put({ id: 'world', lat: lat, lon: lon, place: place || '',
                     by: me.name, byId: me.id, at: Date.now() }).catch(function () {});
  }

  // Two worlds are "the same place" if you could plausibly drive between them.
  // A hop is a teleport — cities apart — so anything under a kilometre is the
  // same world re-published (a re-pin, a rejoin) and must not move anybody.
  function farFrom(a, b) {
    if (!a || !b || b.lat == null || b.lon == null) return false;
    var dLat = (b.lat - a.lat) * 111320;
    var dLon = (b.lon - a.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon) > 1000;
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
      // Shots I have FIRED, on my own row. Nobody ever writes to anybody
      // else's record: every player owns exactly one row and reads the rest,
      // which is the same shape the ghosts already use and needs no authority
      // to arbitrate. You claim a hit; the other browser decides what to do
      // about it. Among friends over a link that is the right trade — anyone
      // running a modified copy can ignore it, and nothing else breaks.
      hits: myShots,
    }).catch(function () {});
  }

  // Other cars, in MY world frame, interpolated toward their latest sample.
  // Shots I have fired recently, kept short — this rides on every publish at
  // 5 Hz, so it is a rolling window and not a log.
  var myShots = [];
  function shoot(targetId) {
    if (!targetId) return;
    myShots.push({ t: targetId, at: Date.now() });
    if (myShots.length > 6) myShots.shift();
  }

  // Hits fired AT ME that I have not applied yet. Keyed on the shot's own
  // timestamp so a row republished five times a second cannot land the same
  // shot five times.
  var seenShot = {}, hitCb = null;
  function drainHits(rows) {
    if (!hitCb || !me.id) return;
    var landed = 0, now = Date.now();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.id === me.id || !r.hits) continue;
      for (var h = 0; h < r.hits.length; h++) {
        var s = r.hits[h];
        if (!s || s.t !== me.id) continue;
        var key = r.id + ':' + s.at;
        if (seenShot[key]) continue;
        // Ignore anything stale: a row that arrives late must not replay a
        // volley from a minute ago the moment you reconnect.
        if (now - s.at > 15000) { seenShot[key] = 1; continue; }
        seenShot[key] = 1;
        landed++;
      }
    }
    if (landed) hitCb(landed);
  }

  function ghosts() {
    if (!frame) return [];
    var now = Date.now(), out = [];
    for (var id in others) {
      var o = others[id];
      if (now - o.seen > STALE_MS) continue;
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
      // No ground loaded under them yet: skip rather than draw the car at sea
      // level, which in hilly terrain is a car hanging in the sky.
      if (h === null) continue;
      out.push({ x: w.x, y: h, z: w.z, yaw: yaw, tint: o.tint, name: o.name });
    }
    return out;
  }

  function count() {
    var now = Date.now(), n = 0;
    for (var id in others) if (now - others[id].seen <= STALE_MS) n++;   // same rule as ghosts()
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

  // Move the flag onto the nearest road, ONCE. A flag dropped on a random
  // bearing lands wherever it lands — the middle of a lake, a cliff, the wrong
  // side of a river — and a race that cannot be finished is not a race. Marked
  // `snapped` so the first player whose copy manages it settles the question
  // for everyone: this is a shared read-write record and two players nudging
  // the flag at each other would never converge.
  function snapFinish(geo) {
    if (!raceRec || raceRec.snapped) return Promise.resolve(false);
    return db('race').put(Object.assign({}, raceRec, {
      fLat: geo.lat, fLon: geo.lon, snapped: true,
    })).then(function () { return true; });
  }

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
      snapped: !!raceRec.snapped,
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
    setRace: setRace, clearRace: clearRace, raceState: raceState, snapFinish: snapFinish,
    shoot: shoot, onHit: function (cb) { hitCb = cb; },
    onFinish: function (cb) { finishCb = cb; },
    onNote: function (cb) { noteCb = cb; },
    // Test seam: the inputs the follow decision is made from. "The room did
    // not follow" has five possible causes and no way to tell them apart from
    // outside — this makes the guess unnecessary.
    worldState: function () {
      return { rec: worldRec ? { lat: worldRec.lat, lon: worldRec.lon, place: worldRec.place,
                                 by: worldRec.by, byId: worldRec.byId } : null,
               myWorld: myWorld, meId: me.id, hopped: !!(root.App && root.App.hasHopped()) };
    },
    hasRace: function () { return !!raceRec; },
    onChange: function (cb) { listeners.push(cb); },
    me: function () { return me; },
  };
})(window);
