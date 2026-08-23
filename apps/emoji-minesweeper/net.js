/*
 * Emoji Minesweeper — race transport.
 *
 * Upstream has no networking. The only channel a GifOS app has is the
 * replicated collection, hosted by the host's browser. Two rules:
 *
 *   1. NOBODY WRITES ANYBODY ELSE'S ROW. Each player owns exactly one
 *      record in `players` and only ever reads the others. Times, result
 *      and progress ride on that row.
 *   2. The race document (`id: 'race'`) is the board deal — seed, size,
 *      emoji set — not a person. Anyone in the room may deal a new board
 *      by putting that one document. That is not writing another player's
 *      row.
 *
 * Invite is OS chrome: this file never draws an invite button.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 2000;
  var PUBLISH_MS = 250;

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var raceRec = null;
  var lastSnap = { seed: 0, opened: 0, safe: 0, moves: 0, time: 0, result: '', flagged: 0 };
  var lastPub = 0;
  var hbTimer = 0;
  var onRace = null;
  var onRoster = null;
  var ready = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function tintFor(id) {
    var h = 0, i;
    for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360);
  }

  function ingestPlayers(list) {
    var t = now(), seen = {}, i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.stamp !== p.at || cur.result !== p.result || cur.time !== p.time || cur.opened !== p.opened;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Player',
        seed: p.seed || 0,
        opened: p.opened || 0,
        safe: p.safe || 0,
        moves: p.moves || 0,
        time: p.time || 0,
        result: p.result || '',
        flagged: p.flagged || 0,
        stamp: p.at,
        seen: moved ? t : cur.seen,
        hue: tintFor(p.id)
      };
    }
    for (var id in others) {
      if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function ingestRace(list) {
    var next = null, i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'race') next = list[i];
    }
    var prevSeed = raceRec && raceRec.seed;
    var prevAt = raceRec && raceRec.at;
    raceRec = next;
    if (onRace && next && (next.seed !== prevSeed || next.at !== prevAt)) onRace(next);
    if (onRoster) onRoster(roster());
  }

  function roster() {
    var list = [];
    list.push({
      id: me.id,
      name: me.name,
      mine: true,
      seed: lastSnap.seed || 0,
      opened: lastSnap.opened || 0,
      safe: lastSnap.safe || 0,
      moves: lastSnap.moves || 0,
      time: lastSnap.time || 0,
      result: lastSnap.result || '',
      flagged: lastSnap.flagged || 0,
      hue: me.id ? tintFor(me.id) : 40
    });
    for (var id in others) list.push({
      id: others[id].id,
      name: others[id].name,
      mine: false,
      seed: others[id].seed,
      opened: others[id].opened,
      safe: others[id].safe,
      moves: others[id].moves,
      time: others[id].time,
      result: others[id].result,
      flagged: others[id].flagged,
      hue: others[id].hue
    });
    return list;
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
      seed: lastSnap.seed || 0,
      opened: lastSnap.opened || 0,
      safe: lastSnap.safe || 0,
      moves: lastSnap.moves || 0,
      time: Math.round((lastSnap.time || 0) * 100) / 100,
      result: lastSnap.result || '',
      flagged: lastSnap.flagged || 0
    }).catch(function () {});
  }

  function init(opts) {
    opts = opts || {};
    onRace = opts.onRace || null;
    onRoster = opts.onRoster || null;
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ ok: false });
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Player';
      ready = true;
      db('players').subscribe(function (list) { ingestPlayers(list || []); });
      db('race').subscribe(function (list) { ingestRace(list || []); });
      putSelf(true);
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () { putSelf(true); }, HB_MS);
      return { ok: true, me: me };
    }).catch(function () { return { ok: false }; });
  }

  function publish(snap, force) {
    lastSnap = snap || lastSnap;
    putSelf(!!force);
    if (onRoster) onRoster(roster());
  }

  function deal(cfg) {
    if (!api || !me.id) return;
    db('race').put({
      id: 'race',
      seed: cfg.seed >>> 0,
      cols: Number(cfg.cols),
      rows: Number(cfg.rows),
      bombs: Number(cfg.bombs),
      emojiset: cfg.emojiset,
      byId: me.id,
      by: me.name,
      at: now()
    }).catch(function () {});
  }

  function otherCount() {
    var n = 0, id;
    for (id in others) n++;
    return n;
  }

  root.MineNet = {
    init: init,
    publish: publish,
    deal: deal,
    race: function () { return raceRec; },
    me: function () { return me; },
    roster: roster,
    others: otherCount,
    ready: function () { return ready; }
  };
})(window);
