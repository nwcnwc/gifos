/*
 * Catch the Cat — netplay.
 *
 * The room IS the invite (OS chrome — this app never draws an Invite button).
 * Each player owns exactly one row in gifos.db('players') and only ever writes
 * that row. The shared starting board is a seed carried on those rows, so a
 * subscriber rebuilds the same walls locally. Nobody writes anybody else's
 * record; a guest who ignored a round would only cheat themselves.
 */
(function (root) {
  'use strict';

  var api = null;
  var me = { id: null, name: 'Player' };
  var round = { id: 0, seed: 0, by: null };
  var others = {};
  var onRound = null;
  var onRoster = null;
  var started = false;

  function db() { return api.db('players'); }

  function roster() {
    var list = [];
    if (me.id) list.push({ id: me.id, name: me.name, mine: true, clicks: my.clicks, status: my.status, round: round.id });
    Object.keys(others).forEach(function (id) {
      var p = others[id];
      list.push({ id: p.id, name: p.name, mine: false, clicks: p.clicks || 0, status: p.status || 'playing', round: p.round || 0 });
    });
    list.sort(function (a, b) {
      var aw = a.status === 'win' ? 0 : a.status === 'playing' ? 1 : 2;
      var bw = b.status === 'win' ? 0 : b.status === 'playing' ? 1 : 2;
      if (aw !== bw) return aw - bw;
      if (a.status === 'win' && a.clicks !== b.clicks) return a.clicks - b.clicks;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }

  var my = { clicks: 0, status: 'playing' };

  function ingest(list) {
    var newest = round;
    var seen = {};
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (p.round && p.seed && (!newest.id || p.round > newest.id)) {
        newest = { id: p.round, seed: p.seed, by: p.id };
      }
      if (p.id === me.id) return;
      seen[p.id] = 1;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        clicks: p.clicks || 0, status: p.status || 'playing',
        round: p.round || 0, seed: p.seed, t: p.t
      };
    });
    for (var id in others) if (!seen[id]) delete others[id];
    if (newest.id && newest.id !== round.id) {
      round = newest;
      my.clicks = 0; my.status = 'playing';
      if (onRound) onRound(round);
    }
    if (onRoster) onRoster(roster());
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ solo: true });
    return api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'Player';
      if (me.id === 'local' || !api.db) return { solo: true };
      return new Promise(function (resolve) {
        var settled = false;
        var done = function () {
          if (settled) return;
          settled = true;
          started = true;
          resolve({ solo: false });
        };
        setTimeout(done, 2500);
        db().subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).catch(function () { return { solo: true }; });
  }

  function publish() {
    if (!started || !api || !me.id || me.id === 'local') return;
    db().put({
      id: me.id, name: me.name,
      round: round.id, seed: round.seed,
      clicks: my.clicks, status: my.status,
      t: Date.now()
    }).catch(function () {});
  }

  function startRound(seedOpt) {
    round = {
      id: Date.now(),
      seed: (seedOpt >>> 0) || ((Math.random() * 0x7fffffff) | 1),
      by: me.id
    };
    my.clicks = 0; my.status = 'playing';
    publish();
    if (onRound) onRound(round);
  }

  function report(clicks, status) {
    my.clicks = clicks;
    my.status = status || my.status;
    publish();
    if (onRoster) onRoster(roster());
  }

  root.CTCNet = {
    init: init,
    startRound: startRound,
    report: report,
    round: function () { return round; },
    me: function () { return me; },
    roster: roster,
    set onRound(fn) { onRound = fn; },
    set onRoster(fn) { onRoster = fn; }
  };
})(window);
