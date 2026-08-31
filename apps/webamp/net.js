/*
 * Invite shares the playlist titles and the graphic EQ.
 * Each peer writes their own presence row. The GIF owner writes `mix`
 * (setlist). Anyone writes `eq`. Library bytes stay private.
 * Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var me = { id: null, name: 'You', owner: true };
  var on = false;
  var hbTimer = 0;
  var lastMixAt = 0;
  var lastPacked = '';
  var seenAt = {};
  var hooks = { onMix: function () {}, onRoster: function () {} };

  function now() { return Date.now(); }

  function roomDb() {
    if (!root.gifos || !root.gifos.db) return null;
    try { return root.gifos.db('room'); } catch (e) { return null; }
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === 'mix' || p.id === 'eq') return;
      if (p.kind !== 'peer') return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function beat() {
    var db = roomDb();
    if (!db || !me.id) return;
    db.put({ id: me.id, kind: 'peer', name: me.name, at: now() }).catch(function () {});
  }

  var api = {
    me: function () { return me; },
    live: function () { return on; },
    onMix: function (fn) { hooks.onMix = fn || function () {}; },
    onRoster: function (fn) { hooks.onRoster = fn || function () {}; },

    publish: function (mix) {
      if (!on) return;
      var db = roomDb();
      if (!db) return;
      var packed = JSON.stringify({
        tracks: mix.tracks || [],
        eq: mix.eq || null,
        now: mix.now || null,
        owner: me.owner
      });
      if (packed === lastPacked) return;
      lastPacked = packed;
      // Two rows so a guest EQ write cannot clobber the DJ's setlist.
      db.put({
        id: 'eq', kind: 'eq',
        eq: mix.eq || null,
        by: me.id, at: now()
      }).catch(function () {});
      if (me.owner) {
        db.put({
          id: 'mix', kind: 'mix',
          tracks: mix.tracks || [],
          now: mix.now || null,
          by: me.id, at: now()
        }).catch(function () {});
      }
    },

    init: function () {
      if (!root.gifos) return Promise.resolve({ owner: true, others: 0 });
      var db = roomDb();
      var infoP = root.gifos.info ? root.gifos.info() : Promise.resolve({ owner: true });
      var meP = root.gifos.me ? root.gifos.me() : Promise.resolve({ id: 'me', name: '' });
      return Promise.all([infoP, meP]).then(function (pair) {
        var info = pair[0] || {};
        var who = pair[1] || {};
        me.id = who.id || 'me';
        me.name = who.name || 'You';
        me.owner = info.owner !== false;
        if (!db) return { owner: me.owner, others: 0 };
        on = true;
        db.subscribe(function (all) {
          var people = live(all);
          var mix = null, eqRow = null;
          (all || []).forEach(function (r) {
            if (!r) return;
            if (r.id === 'mix') mix = r;
            if (r.id === 'eq') eqRow = r;
          });
          var stamp = ((mix && mix.at) || 0) + ':' + ((eqRow && eqRow.at) || 0);
          hooks.onRoster(people);
          if (stamp !== lastMixAt) {
            lastMixAt = stamp;
            hooks.onMix({
              tracks: (mix && mix.tracks) || [],
              now: mix && mix.now,
              eq: eqRow && eqRow.eq,
              by: (eqRow && eqRow.by) || (mix && mix.by),
              at: (eqRow && eqRow.at) || (mix && mix.at)
            });
          }
        });
        beat();
        clearInterval(hbTimer);
        hbTimer = setInterval(beat, HB_MS);
        return db.getAll().then(function (all) {
          var people = live(all);
          return { owner: me.owner, others: people.length };
        });
      }).catch(function () { return { owner: true, others: 0 }; });
    }
  };

  root.Net = api;
})(window);
