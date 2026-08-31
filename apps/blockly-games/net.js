/*
 * Invite shares a game, a level, and the blocks on it.
 * Each player writes only THEIR row. Highest seq is the shared board.
 */
(function (root) {
  'use strict';

  var STALE_MS = 12000, HB_MS = 2000;
  var api = null, me = { id: null, name: 'Player' }, owner = true;
  var others = {}, seq = 0, lastAdopted = 0, hbTimer = 0, lastList = [];

  function now() { return Date.now(); }
  function db(n) { return api.db(n); }

  function snapshot() {
    var g = root.BG;
    return {
      id: me.id,
      name: me.name,
      game: g ? g.game : 'home',
      level: g ? g.level : 1,
      xml: g ? g.xml() : '',
      seq: seq,
      at: now()
    };
  }

  function publish() {
    if (!api || !me.id) return;
    db('players').put(snapshot()).catch(function () {});
  }

  function bump() {
    seq += 1;
    publish();
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (t - (p.at || 0) > STALE_MS && p.id !== me.id) return;
      out.push(p);
    });
    return out;
  }

  function pickLeader(players) {
    var best = null;
    players.forEach(function (p) {
      if (!best || (p.seq | 0) > (best.seq | 0) ||
          ((p.seq | 0) === (best.seq | 0) && p.id < best.id)) {
        best = p;
      }
    });
    return best;
  }

  function roster(list) {
    lastList = list || lastList;
    var el = document.getElementById('roster');
    if (!el) return;
    var names = [];
    live(lastList).forEach(function (p) {
      names.push((p.name || 'Player') + (p.id === me.id ? ' (you)' : '') +
        (p.game && p.game !== 'home' ? ' · ' + p.game + ' ' + (p.level || '') : ''));
    });
    if (names.length < 2) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = names.join(' · ');
  }

  function ingest(list) {
    roster(list);
    var crowd = live(list);
    if (crowd.length < 2) return;
    var lead = pickLeader(crowd);
    if (!lead || lead.id === me.id) return;
    if ((lead.seq | 0) <= lastAdopted) return;
    lastAdopted = lead.seq | 0;
    if (root.BG && root.BG.adopt) root.BG.adopt(lead);
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
    }).catch(function () { owner = true; }) : Promise.resolve();
    return infoP.then(function () { return api.me(); }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Player';
      db('players').subscribe(function (list) { ingest(list || []); });
      publish();
      hbTimer = setInterval(publish, HB_MS);
      return { owner: owner, others: 0 };
    }).catch(function () { return { owner: true, others: 0 }; });
  }

  root.Net = {
    init: init,
    bump: bump,
    publish: publish,
    live: function () { return !!api && !!me.id; },
    me: function () { return me; }
  };
})(window);
