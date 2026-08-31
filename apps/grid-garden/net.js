/* Shared garden. Invite is OS chrome — this file never draws that button.
 *
 * garden  (read-write)  one plot: the level and the CSS everyone is typing
 * players (read-write)  one row per gardener; nobody writes anybody else's
 *
 * Last write to the plot wins. A remote level change loads that bed; a
 * remote CSS change fills the editor unless this tab typed more recently.
 */
(function (root) {
  'use strict';

  var STALE_MS = 12000;
  var HB_MS = 2500;
  var CODE_MS = 180;

  var api = null;
  var me = { id: null, name: 'You' };
  var others = {};
  var seenAt = {};
  var lastPlot = null;
  var localEditAt = 0;
  var lastPublishedCode = '';
  var lastPublishedLevel = -1;
  var codeTimer = 0;
  var hbTimer = 0;
  var ready = false;

  function now() { return Date.now(); }
  function db(n) { return api.db(n); }
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }

  function liveOthers() {
    var t = now(), out = [];
    for (var id in others) {
      if (t - (others[id].seen || 0) > STALE_MS) continue;
      out.push(others[id]);
    }
    return out;
  }

  function paint() {
    var bar = $('friend-bar');
    if (!bar) return;
    var list = liveOthers();
    var status = $('friend-status');
    var names = $('friend-names');
    if (!list.length) {
      bar.hidden = false;
      status.innerHTML = 'Press <b>Invite</b> in the bar above to share this garden.';
      names.textContent = '';
      document.body.classList.remove('together');
      return;
    }
    document.body.classList.add('together');
    bar.hidden = false;
    var who = list.map(function (p) { return p.name || 'Friend'; });
    status.textContent = who.length === 1
      ? (who[0] + ' is in this garden — same bed, same CSS.')
      : (who.length + ' gardeners on this plot.');
    names.innerHTML = list.map(function (p) {
      var tag = (p.solved | 0) + '/' + ((root.levels && root.levels.length) || 28);
      return '<li>' + esc(p.name || 'Friend') + ' <span>' + tag + '</span></li>';
    }).join('');
  }

  function snapshot() {
    var g = root.game;
    var codeEl = $('code');
    return {
      id: me.id,
      name: me.name,
      level: g ? g.level : 0,
      solved: g && g.solved ? g.solved.length : 0,
      at: now()
    };
  }

  function publishMe() {
    if (!api || !me.id) return;
    db('players').put(snapshot()).catch(function () {});
  }

  function publishPlot(force) {
    if (!api || !me.id) return;
    var g = root.game;
    if (!g) return;
    var codeEl = $('code');
    var code = codeEl ? codeEl.value : '';
    if (!force && code === lastPublishedCode && g.level === lastPublishedLevel) return;
    lastPublishedCode = code;
    lastPublishedLevel = g.level;
    db('garden').put({
      id: 'plot',
      level: g.level,
      code: code,
      by: me.id,
      t: now()
    }).catch(function () {});
  }

  function applyPlot(rec) {
    if (!rec || rec.by === me.id) return;
    var g = root.game;
    if (!g) return;
    if (typeof rec.level === 'number' && rec.level !== g.level && rec.level >= 0) {
      g.skipPersist = true;
      g.goTo(rec.level, { remote: true, silent: true, code: rec.code || '' });
      g.skipPersist = false;
      lastPublishedLevel = rec.level;
      lastPublishedCode = rec.code || '';
      return;
    }
    if (typeof rec.code === 'string' && rec.code !== ( $('code') && $('code').value)) {
      if (localEditAt && rec.t && rec.t < localEditAt) return;
      g.setCode(rec.code, { remote: true });
      lastPublishedCode = rec.code;
    }
  }

  function ingestPlayers(list) {
    var t = now(), seen = {};
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === me.id) return;
      seen[p.id] = 1;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        level: p.level | 0,
        solved: p.solved | 0,
        seen: seenAt[p.id].seen
      };
    });
    for (var id in others) {
      if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];
    }
    paint();
  }

  function ingestGarden(list) {
    var rec = null;
    (list || []).forEach(function (r) { if (r && r.id === 'plot') rec = r; });
    lastPlot = rec;
    if (rec) applyPlot(rec);
  }

  function onLocalCode() {
    localEditAt = now();
    if (codeTimer) clearTimeout(codeTimer);
    codeTimer = setTimeout(function () { publishPlot(true); }, CODE_MS);
  }

  function onLocalLevel() {
    localEditAt = now();
    publishPlot(true);
    publishMe();
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) {
      paint();
      return Promise.resolve();
    }
    var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    return who.then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      db('players').subscribe(function (list) { ingestPlayers(list || []); });
      db('garden').subscribe(function (list) { ingestGarden(list || []); });
      ready = true;
      publishMe();
      publishPlot(true);
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () {
        publishMe();
        paint();
      }, HB_MS);
      paint();
    }).catch(function () { paint(); });
  }

  root.GardenNet = {
    init: init,
    onLocalCode: onLocalCode,
    onLocalLevel: onLocalLevel,
    publishPlot: publishPlot,
    live: function () { return liveOthers().length > 0; },
    me: function () { return me; }
  };
})(window);
