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
        if (root.Backdooms && root.Backdooms.hurt) root.Backdooms.hurt(34);
      } else if (seq) {
        lastShot[r.id] = seq;
      }
    }
    if (root.Backdooms && root.Backdooms.setRemotes) root.Backdooms.setRemotes(list);
    if (root.Hud) root.Hud.room(1 + list.length);
  }

  function publish(force) {
    if (!db) return;
    var now = Date.now();
    if (!force && now - lastPub < 80) return;
    lastPub = now;
    var s = root.Backdooms.state();
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
