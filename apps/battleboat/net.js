/*
 * Battleboat — two-fleet transport.
 *
 * Upstream has no networking. The only channel a GifOS app has is the
 * replicated collection. Two rules:
 *
 *   1. NOBODY WRITES ANYBODY ELSE'S ROW. Each player owns exactly one
 *      record in `players` and only ever reads the others. Shots you fire
 *      and the revealed cells of YOUR fleet ride on that row. Ship
 *      positions stay in a private collection — they never leave this
 *      device.
 *   2. Invite is OS chrome: this file never draws an invite button.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 2000;
  var PUBLISH_MS = 200;

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var lastSnap = emptySnap();
  var lastPub = 0;
  var hbTimer = 0;
  var onChange = null;
  var ready = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function emptySnap() {
    return {
      round: 1,
      phase: 'place',
      shots: [],
      board: root.BB.emptyBoard(),
      sunk: 0,
      result: ''
    };
  }

  function ingest(list) {
    var t = now(), seen = {}, i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.at !== p.at;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Player',
        round: p.round || 1,
        phase: p.phase || 'place',
        shots: Array.isArray(p.shots) ? p.shots : [],
        board: p.board || root.BB.emptyBoard(),
        sunk: p.sunk || 0,
        result: p.result || '',
        at: p.at,
        seen: moved ? t : cur.seen
      };
    }
    for (var id in others) {
      if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];
    }
    if (onChange) onChange(view());
  }

  function opponent() {
    var best = null, id;
    for (id in others) {
      if (!best || others[id].id < best.id) best = others[id];
    }
    return best;
  }

  function view() {
    return {
      me: {
        id: me.id,
        name: me.name,
        round: lastSnap.round,
        phase: lastSnap.phase,
        shots: lastSnap.shots,
        board: lastSnap.board,
        sunk: lastSnap.sunk,
        result: lastSnap.result
      },
      other: opponent(),
      others: (function () { var n = 0, id; for (id in others) n++; return n; })()
    };
  }

  function putSelf(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPub < PUBLISH_MS) return;
    lastPub = t;
    db('players').put({
      id: me.id,
      name: me.name,
      at: t,
      round: lastSnap.round || 1,
      phase: lastSnap.phase || 'place',
      shots: lastSnap.shots || [],
      board: lastSnap.board || root.BB.emptyBoard(),
      sunk: lastSnap.sunk || 0,
      result: lastSnap.result || ''
    }).catch(function () {});
  }

  function init(opts) {
    opts = opts || {};
    onChange = opts.onChange || null;
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ ok: false });
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Player';
      ready = true;
      db('players').subscribe(function (list) { ingest(list || []); });
      putSelf(true);
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () { putSelf(true); }, HB_MS);
      return { ok: true, me: me };
    }).catch(function () { return { ok: false }; });
  }

  function publish(snap, force) {
    lastSnap = snap || lastSnap;
    putSelf(!!force);
    if (onChange) onChange(view());
  }

  function leave() {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (api && me.id) db('players').delete(me.id).catch(function () {});
    others = {};
    lastSnap = emptySnap();
    ready = false;
  }

  root.BBNet = {
    init: init,
    publish: publish,
    leave: leave,
    me: function () { return me; },
    view: view,
    emptySnap: emptySnap,
    ready: function () { return ready; }
  };
})(window);
