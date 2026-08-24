(function (root) {
  'use strict';
  var STALE_MS = 9000, HB_MS = 3000;
  var api = null, room = null, me = { id: null, name: 'You' };
  var on = false, hbTimer = 0, round = 1, usedRound = 0, usedKey = '', lastList = [], seenAt = {}, lastPub = 0;
  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
  };
  function keyOf(st) {
    if (!st) return '';
    var a = st.adj || {};
    return [st.filter, st.rot, a.brightness, a.contrast, a.saturation, a.warmth, a.vignette].join(',');
  }
  function live(list, t) {
    t = t || now(); var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }
  function adopted(list) {
    var players = live(list); if (!players.length) return null;
    var maxR = 0; players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.st; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { round: maxR, st: cand[0].st, by: cand[0].id };
  }
  function snapshot() {
    return { id: me.id, name: me.name, round: round, st: root.MiniPhoto.getState(), at: now() };
  }
  function publish() {
    if (!on || !room || !me.id) return;
    var t = now(); if (t - lastPub < 80) return; lastPub = t;
    room.put(snapshot()).catch(function () {});
  }
  function applyWorld(ad) {
    usedRound = ad.round; usedKey = keyOf(ad.st); round = ad.round;
    root.MiniPhoto.setState(ad.st);
    if (root.MPApp) { root.MPApp.paintSliders(); root.MPApp.paint(); }
    lastPub = 0; publish();
  }
  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var html = '';
    players.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    players.forEach(function (p) {
      html += '<li class="' + (p.id === me.id ? 'me' : '') + '"><span class="name">' +
        (p.id === me.id ? 'You' : esc(p.name || 'Friend')) + '</span><span class="meta">same recipe</span></li>';
    });
    var scores = $('friend-scores'); if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    var others = players.filter(function (p) { return p.id !== me.id; });
    var status = $('friend-status'); if (!status) return;
    if (!others.length) status.textContent = 'Waiting for a friend… Invite sends the link. They get your recipe, not your photo.';
    else status.textContent = (others.length === 1 ? (others[0].name || 'Friend') + ' has the same recipe.' : others.length + ' friends sharing the recipe.');
  }
  function onRoom(list) {
    lastList = list || []; if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.round !== usedRound || keyOf(ad.st) !== usedKey)) applyWorld(ad);
    renderMp();
  }
  function enter() {
    api = root.gifos;
    if (!api || !api.db) { $('friend-bar').hidden = false; $('friend-status').textContent = 'Play together needs a GifOS room.'; return true; }
    if (on) return true;
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local'; me.name = (id && id.name) || 'You';
      on = true; document.body.classList.add('friend');
      $('friend-bar').hidden = false; $('shareBtn').hidden = true;
      round = 1; usedRound = 0; usedKey = '';
      if (!hbTimer) hbTimer = setInterval(function () { lastPub = 0; publish(); renderMp(); }, HB_MS);
      if (!room._mpSub) { room._mpSub = true; room.subscribe(onRoom); }
      lastPub = 0; publish();
    }).catch(function () {});
    return true;
  }
  function leave() {
    on = false; document.body.classList.remove('friend');
    $('friend-bar').hidden = true; $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
  }
  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  root.MPMp = {
    busy: function () { return on; }, leave: leave,
    onState: function (st) {
      if (!on) return false;
      root.MiniPhoto.setState(st); round += 1; lastPub = 0; publish(); return true;
    }
  };
})(window);
