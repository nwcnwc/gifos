/*
 * Follow-along. The host writes one `session` row: algorithm, input, cursor,
 * playing, speed. Guests subscribe and rebuild the same trace locally — the
 * input is the whole story, so the wire stays small. Nobody writes another
 * person's row.
 */
(function (root) {
  'use strict';

  var api = null;
  var me = { id: null, name: 'You' };
  var owner = true;
  var live = false;
  var lastPut = 0;
  var lastHash = '';
  var onFollow = null;
  var onRoster = null;
  var others = {};
  var STALE_MS = 12000;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info
      ? api.info().then(function (i) { owner = !!(i && i.owner); return owner; })
        .catch(function () { owner = true; return true; })
      : Promise.resolve(true);

    return infoP.then(function () {
      return api.me ? api.me() : { id: 'local', name: 'You' };
    }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'You';
      live = true;
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 1800);
        db('session').subscribe(function (list) {
          ingestSession(list || []);
          done();
        });
        db('players').subscribe(function (list) {
          ingestPlayers(list || []);
          done();
        });
        heartbeat();
        setInterval(heartbeat, 3000);
      });
    }).catch(function () {
      live = false;
      owner = true;
      return { owner: true, others: 0 };
    });
  }

  function ingestSession(list) {
    if (owner) return;
    var rec = null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === 'play') rec = list[i];
    if (!rec || !onFollow) return;
    onFollow(rec);
  }

  function ingestPlayers(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      others[p.id] = { id: p.id, name: p.name || 'Someone', t: p.t || t };
    }
    for (var id in others) {
      if (!seen[id] || t - (others[id].t || 0) > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function heartbeat() {
    if (!live || !me.id) return;
    db('players').put({ id: me.id, name: me.name, t: now() }).catch(function () {});
  }

  function hashOf(s) {
    return [s.algo, JSON.stringify(s.input), s.cursor, s.playing ? 1 : 0, s.speed].join('|');
  }

  function publish(state, force) {
    if (!live || !owner || !me.id) return;
    var t = now();
    var h = hashOf(state);
    if (!force && h === lastHash && t - lastPut < 160) return;
    if (!force && t - lastPut < 90) return;
    lastPut = t;
    lastHash = h;
    db('session').put({
      id: 'play',
      by: me.id,
      algo: state.algo,
      input: state.input,
      cursor: state.cursor | 0,
      playing: !!state.playing,
      speed: state.speed,
      t: t
    }).catch(function () {});
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true }];
    for (var id in others) list.push({ id: others[id].id, name: others[id].name, me: false });
    return list;
  }

  root.AVNet = {
    init: init,
    publish: publish,
    owner: function () { return owner; },
    live: function () { return live; },
    me: function () { return me; },
    roster: roster,
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    onFollow: function (fn) { onFollow = fn; },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
