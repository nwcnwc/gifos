/*
 * BreakLock — a live "I set a pattern, you crack it" room.
 *
 * Each person writes ONLY their own players row. The current secret lives
 * on match (one row, id "match"); whoever is the setter writes it. Guests
 * use it to score pegs locally and never paint it until the round is over.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var me = { id: null, name: 'You' };
  var owner = true;
  var others = {};
  var match = null;
  var onChange = null;
  var hbTimer = 0;
  var lastPut = 0;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function countOthers() {
    var n = 0, id;
    for (id in others) n++;
    return n;
  }

  function live() {
    return !!api && !!me.id;
  }

  function versusOn() {
    return live() && countOthers() > 0;
  }

  function ingestPlayers(list) {
    var t = now();
    var seen = {};
    var i, p, id;
    for (i = 0; i < (list || []).length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        role: p.role || 'crack',
        count: p.count | 0,
        cracked: !!p.cracked,
        attempts: p.attempts || [],
        round: p.round | 0,
        t: p.t || t,
        seen: t
      };
    }
    for (id in others) {
      if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];
    }
    if (onChange) onChange();
  }

  function ingestMatch(list) {
    var rec = null, i;
    for (i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'match') rec = list[i];
    }
    match = rec;
    if (onChange) onChange();
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });

    var infoP = api.info
      ? api.info().then(function (i) {
          owner = !!(i && i.owner);
          return owner;
        }).catch(function () { owner = true; return true; })
      : Promise.resolve(true);

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
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 2500);
        db('players').subscribe(function (list) {
          ingestPlayers(list);
          done();
        });
        db('match').subscribe(function (list) {
          ingestMatch(list);
        });
      });
    }).then(function (room) {
      heartbeat();
      hbTimer = setInterval(heartbeat, HB_MS);
      return room;
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function heartbeat() {
    if (!live()) return;
    if (now() - lastPut < HB_MS / 2) return;
    // Presence only — boot.js publishes the real row.
    if (onChange) onChange();
  }

  function putPlayer(row) {
    if (!live()) return;
    lastPut = now();
    row.id = me.id;
    row.name = me.name;
    row.t = now();
    db('players').put(row).catch(function () {});
  }

  function putMatch(row) {
    if (!live()) return;
    row.id = 'match';
    row.by = me.id;
    row.t = now();
    db('match').put(row).catch(function () {});
  }

  function othersList() {
    var list = [], id;
    for (id in others) list.push(others[id]);
    list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return list;
  }

  function roster() {
    return [{ id: me.id, name: me.name, me: true }].concat(othersList());
  }

  /**
   * What a client should do next from the live match row.
   * Summary is not a wall — YOUR TURN_ writes state=setting with the
   * cracker as setterId, and they must leave Success to draw.
   * Returns null if the current screen already matches.
   */
  function vsNext(m, myId, cur) {
    if (!m || !myId) return null;
    cur = cur || {};
    var screen = cur.screen || 'menu';
    var role = cur.role || 'solo';
    var ended = !!cur.ended;
    var hasSecret = !!cur.secret;
    var sameRound = (cur.round | 0) === (m.round | 0);

    if (m.state === 'setting') {
      if (m.setterId === myId) {
        if (role === 'set' && screen === 'game' && !ended && sameRound) return null;
        return 'set';
      }
      if (role === 'crack' && screen === 'game' && !hasSecret && !ended && sameRound) return null;
      return 'wait';
    }
    if (m.state === 'playing' && m.secret && m.secret.length) {
      // Stay on Success until match goes over or YOUR TURN_ starts the next round.
      if (screen === 'summary' && sameRound) return null;
      if (m.setterId === myId) {
        if (role === 'watch' && screen === 'game' && !ended && sameRound) return null;
        return 'watch';
      }
      if (role === 'crack' && hasSecret && screen === 'game' && !ended && sameRound) return null;
      return 'crack';
    }
    if (m.state === 'over') {
      if (screen === 'summary' && sameRound) return null;
      return 'summary';
    }
    return null;
  }

  root.BreakLockNet = {
    init: init,
    live: live,
    versusOn: versusOn,
    me: function () { return me; },
    owner: function () { return owner; },
    others: othersList,
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    match: function () { return match; },
    roster: roster,
    putPlayer: putPlayer,
    putMatch: putMatch,
    vsNext: vsNext,
    onChange: function (fn) { onChange = fn; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
