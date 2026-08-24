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
  function keyOf(lines) { return JSON.stringify(lines || []).slice(0, 2000); }
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
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.lines; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { round: maxR, lines: cand[0].lines, cur: cand[0].cur || 0, by: cand[0].id };
  }
  function snapshot() {
    return { id: me.id, name: me.name, round: round, lines: root.LRCApp.getLines(), cur: 0, at: now() };
  }
  function publish() {
    if (!on || !room || !me.id) return;
    var t = now(); if (t - lastPub < 80) return; lastPub = t;
    room.put(snapshot()).catch(function () {});
  }
  function applyWorld(ad) {
    usedRound = ad.round; usedKey = keyOf(ad.lines); round = ad.round;
    root.LRCApp.setLines(ad.lines, ad.cur);
    lastPub = 0; publish();
  }
  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var html = '';
    players.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    players.forEach(function (p) {
      html += '<li class="' + (p.id === me.id ? 'me' : '') + '"><span class="name">' +
        (p.id === me.id ? 'You' : esc(p.name || 'Friend')) + '</span><span class="meta">lyrics</span></li>';
    });
    var scores = $('friend-scores'); if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    var others = players.filter(function (p) { return p.id !== me.id; });
    var status = $('friend-status'); if (!status) return;
    if (!others.length) status.textContent = 'Waiting for a friend… Invite sends the link. They get the lyrics, not the song file.';
    else status.textContent = others.length === 1 ? (others[0].name || 'Friend') + ' has the same lyrics.' : others.length + ' friends on the lyrics.';
  }
  function onRoom(list) {
    lastList = list || []; if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.round !== usedRound || keyOf(ad.lines) !== usedKey)) applyWorld(ad);
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
      if (!room._lrSub) { room._lrSub = true; room.subscribe(onRoom); }
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
  root.LRMp = {
    busy: function () { return on; }, leave: leave,
    onStamp: function (i, t) {
      if (!on) return false;
      root.LRCApp.stampAt(i, t); round += 1; lastPub = 0; publish(); return true;
    }
  };
})(window);
