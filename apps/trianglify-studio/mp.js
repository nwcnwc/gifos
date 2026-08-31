/*
 * Share the wallpaper — one seed + palette, everyone looking at it.
 *
 * Shared (round, seed, palette, cell, variance, look, fill, sizeId) so every
 * device paints the same triangles. Each player publishes the recipe on
 * THEIR own row. Nobody writes anybody else's row. Everyone adopts the
 * recipe of the lowest-id player on the current round.
 *
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var SEED_MAX = 80;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var declined = false;
  var hbTimer = 0;
  var mine = null;
  var round = 1;
  var usedKey = null;
  var usedRound = 0;
  var lastList = [];
  var seenAt = {};
  var lastPub = 0;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function snapOf(s) {
    s = s || (root.TFApp && root.TFApp.current && root.TFApp.current()) || {};
    return {
      seed: String(s.seed || '').slice(0, SEED_MAX),
      palette: s.palette || 'YlGnBu',
      cell: s.cell | 0,
      variance: +s.variance,
      look: s.look || 'linear',
      fill: !!s.fill,
      stroke: +s.stroke || 0,
      sizeId: s.sizeId || 'hd'
    };
  }

  function keyOf(s) {
    return [s.seed, s.palette, s.cell, s.variance, s.look, s.fill ? 1 : 0, s.stroke, s.sizeId].join('|');
  }

  function live(list, t) {
    t = t || now();
    var out = [];
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
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.seed; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var a = cand[0];
    return {
      round: maxR,
      by: a.id,
      seed: String(a.seed).slice(0, SEED_MAX),
      palette: a.palette,
      cell: a.cell,
      variance: a.variance,
      look: a.look,
      fill: a.fill,
      stroke: a.stroke,
      sizeId: a.sizeId
    };
  }

  function snapshot() {
    var s = mine || snapOf();
    return {
      id: me.id,
      name: me.name,
      seed: s.seed,
      palette: s.palette,
      cell: s.cell,
      variance: s.variance,
      look: s.look,
      fill: s.fill,
      stroke: s.stroke,
      sizeId: s.sizeId,
      round: round,
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var t = now();
    if (t - lastPub < 80) return;
    lastPub = t;
    room.put(snapshot()).catch(function () {});
  }

  function applyWorld(ad) {
    usedKey = keyOf(ad);
    usedRound = ad.round;
    round = ad.round;
    if (ad.by !== me.id) mine = snapOf(ad);
    if (root.TFApp) root.TFApp.applyState(ad, true);
    lastPub = 0;
    publish();
  }

  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var html = '';
    players.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    players.forEach(function (p) {
      var mineRow = p.id === me.id;
      html += '<li class="' + (mineRow ? 'me' : '') + '">' +
        '<span class="name">' + (mineRow ? 'You' : esc(p.name || 'Friend')) + '</span>' +
        '<span class="meta">' + (mineRow ? 'sharing' : 'looking') + '</span>' +
        '</li>';
    });
    if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!status) return;
    if (!others.length) {
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can keep painting — they start from this wallpaper.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is looking. Change the wallpaper — they see it.';
    } else {
      status.textContent = others.length + ' friends looking. Change the wallpaper — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (keyOf(ad) !== usedKey || ad.round !== usedRound)) {
      applyWorld(ad);
    }
    renderMp();
  }

  function beat() {
    if (!on) return;
    lastPub = 0;
    publish();
    renderMp();
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) return;
    room = room || api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || me.id || 'local';
      me.name = (id && id.name) || me.name || 'You';
      if (subscribed) return;
      subscribed = true;
      room.subscribe(function (list) {
        lastList = list || [];
        if (on) { onRoom(lastList); return; }
        if (declined) return;
        var others = live(lastList).filter(function (p) { return p.id && p.id !== me.id; });
        if (others.length) enter();
      });
    }).catch(function () {});
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      var s = $('friend-status');
      if (s) s.textContent = 'Share the wallpaper needs a GifOS room.';
      return true;
    }
    if (on) return true;
    declined = false;
    room = room || api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      document.body.classList.add('friend');
      $('friend-bar').hidden = false;
      $('shareBtn').hidden = true;
      mine = snapOf();
      round = 1;
      usedKey = null;
      usedRound = 0;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedKey) applyWorld({
        round: round,
        by: me.id,
        seed: mine.seed,
        palette: mine.palette,
        cell: mine.cell,
        variance: mine.variance,
        look: mine.look,
        fill: mine.fill,
        stroke: mine.stroke,
        sizeId: mine.sizeId
      });
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
    return true;
  }

  function leave() {
    on = false;
    declined = true;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
  }

  function onChange(next) {
    if (!on) return false;
    mine = snapOf(next);
    round = (usedRound || round || 1) + 1;
    applyWorld({
      round: round,
      by: me.id,
      seed: mine.seed,
      palette: mine.palette,
      cell: mine.cell,
      variance: mine.variance,
      look: mine.look,
      fill: mine.fill,
      stroke: mine.stroke,
      sizeId: mine.sizeId
    });
    if (root.TFApp) root.TFApp.persist();
    return true;
  }

  root.TFMp = {
    enter: enter,
    leave: leave,
    onChange: onChange,
    busy: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });

  watch();
})(window);
