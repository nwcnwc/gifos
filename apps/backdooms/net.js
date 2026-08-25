/*
 * Extra bodies — each player writes ONLY their own row.
 * The seed on the oldest row is the maze: everyone who presses Play walks the
 * same halls. Invite is OS chrome, so this file never draws a button; it only
 * counts who turned up and hands the number to the HUD.
 */
(function (root) {
  'use strict';

  var db = null, me = { id: 'solo', name: 'you' };
  var lastPub = 0;
  var lastShot = {};
  var lastHits = [];
  var shotSeq = 0;
  var roster = [];

  function init() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    db = gifos.db('players');
    return gifos.me().then(function (who) {
      if (who && who.id) me = who;
      db.subscribe(onAll);
      publish(true);
    }).catch(function () {});
  }

  function sharedSeed() {
    var i, r, pick = null, bestT = Infinity;
    for (i = 0; i < roster.length; i++) {
      r = roster[i];
      if (!r || r.id === me.id || r.seed == null) continue;
      if ((r.t || 0) < bestT) { bestT = r.t || 0; pick = r.seed; }
    }
    return pick;
  }

  function onAll(rows) {
    var now = Date.now(), list = [], i, r, hits, seq;
    roster = rows || [];
    for (i = 0; i < roster.length; i++) {
      r = roster[i];
      if (!r || !r.id) continue;
      if (now - (r.t || 0) > 8000) continue;
      if (r.id === me.id) continue;
      list.push({ id: r.id, x: r.x, y: r.y, a: r.a, h: r.hp, name: r.name });
      seq = r.shot | 0;
      hits = r.hits || [];
      if (seq && seq !== lastShot[r.id] && hits.indexOf(me.id) >= 0) {
        lastShot[r.id] = seq;
        if (root.Backdooms && root.Backdooms.hurt) {
          /* which way the shot came from, so the damage arc points at them */
          var mine = root.Backdooms.state();
          var bear = Math.atan2(r.y - mine.y, r.x - mine.x) - mine.a;
          root.Backdooms.hurt(34, Math.atan2(Math.sin(bear), Math.cos(bear)));
        }
      } else if (seq) {
        lastShot[r.id] = seq;
      }
    }
    if (root.Backdooms && root.Backdooms.setRemotes) root.Backdooms.setRemotes(list);
    if (root.Hud) root.Hud.room(1 + list.length);
  }

  /*
   * WRITE WHEN SOMETHING CHANGED, not on a metronome.
   *
   * Measured on the old code: 11.8 writes a second while STANDING PERFECTLY
   * STILL, and 12 while walking — it never asked whether anything had moved.
   * That is not free. docs/app-services.md §4: a guest write is a proposal
   * that floods to the owner, which validates it, Ed25519-signs the WHOLE
   * collection and floods the result; every client then re-reads all N rows
   * (runtime.js `subscribe` does a full getAll on every db-change). It names
   * Anyroad's players collection doing exactly this at 5N writes/sec as what
   * puts "a ceiling of a few dozen players" on the mesh. This app was doing
   * it at 12N.
   *
   * So: a floor of 120 ms between writes, nothing sent unless the player
   * actually moved, turned, took damage or scored, and a keepalive every 2.5 s
   * because onAll() drops a row that has not been heard from in 8 s. Standing
   * still goes from ~12 writes a second to 0.4. render-side interpolation
   * (game.js) covers the lower rate, so the figures move MORE smoothly, not
   * less.
   *
   * This is a mitigation, not the fix. Positions are service-3 traffic riding
   * service 4, and service 3 does not exist yet.
   */
  var KEEPALIVE = 2500;
  var lastSent = null;

  function worthSending(s) {
    if (!lastSent) return true;
    if (Math.abs(s.x - lastSent.x) > 0.03 || Math.abs(s.y - lastSent.y) > 0.03) return true;
    var da = Math.abs(s.a - lastSent.a);
    if (da > Math.PI) da = 2 * Math.PI - da;
    if (da > 0.02) return true;
    return s.hp !== lastSent.hp || s.score !== lastSent.score || s.ammo !== lastSent.ammo;
  }

  function publish(force) {
    if (!db) return;
    var now = Date.now();
    var s = root.Backdooms.state();
    if (!force) {
      if (now - lastPub < 120) return;
      if (!worthSending(s) && now - lastPub < KEEPALIVE) return;
    }
    lastPub = now;
    lastSent = { x: s.x, y: s.y, a: s.a, hp: s.hp, score: s.score, ammo: s.ammo };
    db.put({
      id: me.id, name: me.name || 'you',
      x: s.x, y: s.y, a: s.a, hp: s.hp, score: s.score, seed: s.seed,
      shot: shotSeq, hits: lastHits, t: now
    }).catch(function () {});
  }

  function onShot(hits) {
    shotSeq++;
    lastHits = hits || [];
    publish(true);
  }

  function tick() {
    publish(false);
    if (root.Hud) root.Hud.paint();
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    onShot: onShot,
    sharedSeed: sharedSeed
  };
})(window);
