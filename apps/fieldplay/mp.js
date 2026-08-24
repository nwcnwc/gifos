/*
 * Share the field — one GLSL recipe, everyone looking at it.
 * Each player publishes the field on THEIR own row. Nobody writes
 * anybody else's row. Everyone adopts the recipe of the lowest-id
 * player on the current round.
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var MAX = 8000;
  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var hbTimer = 0;
  var myCode = '';
  var round = 1;
  var usedCode = null;
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
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.code != null; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var a = cand[0];
    return { round: maxR, code: String(a.code).slice(0, MAX), by: a.id, st: a.st || null };
  }

  function snapshot() {
    var st = root.FieldPlay.getState();
    return {
      id: me.id,
      name: me.name,
      code: myCode,
      round: round,
      st: { timeStep: st.timeStep, fadeOut: st.fadeOut, dropProbability: st.dropProbability,
            colorMode: st.colorMode, cx: st.cx, cy: st.cy, w: st.w, h: st.h },
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
    usedCode = ad.code;
    usedRound = ad.round;
    round = ad.round;
    if (ad.by !== me.id) myCode = ad.code;
    if (ad.st) root.FieldPlay.setSettings(ad.st);
    root.FieldPlay.reset();
    var r = root.FieldPlay.setCode(ad.code);
    if ($('recipe')) $('recipe').value = ad.code;
    if (root.FPApp) {
      root.FPApp.paintWhich();
      root.FPApp.paintSliders();
    }
    lastPub = 0;
    publish();
    return r;
  }

  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var html = '';
    players.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Friend')) + '</span>' +
        '<span class="meta">' + (p.code ? 'in the field' : 'watching') + '</span></li>';
    });
    if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!status) return;
    if (!others.length) {
      status.textContent = 'Waiting for a friend… Invite sends the link. You can still edit the field.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is looking at the same field. Apply a recipe — they see it.';
    } else {
      status.textContent = others.length + ' friends in the field. Apply a recipe — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.code !== usedCode || ad.round !== usedRound)) applyWorld(ad);
    renderMp();
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      var s = $('friend-status');
      if (s) s.textContent = 'Play together needs a GifOS room.';
      return true;
    }
    if (on) return true;
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      document.body.classList.add('friend');
      $('friend-bar').hidden = false;
      $('shareBtn').hidden = true;
      myCode = root.FieldPlay.getState().code;
      round = 1;
      usedCode = null;
      usedRound = 0;
      if (!hbTimer) hbTimer = setInterval(function () { lastPub = 0; publish(); renderMp(); }, HB_MS);
      if (!room._fpSub) {
        room._fpSub = true;
        room.subscribe(onRoom);
      }
      lastPub = 0;
      publish();
    }).catch(function () {});
    return true;
  }

  function leave() {
    on = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
  }

  function bump(code) {
    myCode = String(code || '').slice(0, MAX);
    round += 1;
    lastPub = 0;
    publish();
  }

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });

  root.FPMp = {
    busy: function () { return on; },
    leave: leave,
    onApply: function (code) {
      if (!on) return false;
      bump(code);
      root.FieldPlay.setCode(code);
      if (root.FPApp) root.FPApp.paintWhich();
      return true;
    },
    onPreset: function (p) {
      if (!on) return false;
      root.FieldPlay.applyPreset(p);
      if ($('recipe')) $('recipe').value = p.code;
      bump(p.code);
      if (root.FPApp) { root.FPApp.paintWhich(); root.FPApp.paintSliders(); }
      return true;
    },
    onReset: function () {
      if (!on) return false;
      root.FieldPlay.reset();
      lastPub = 0;
      publish();
      return true;
    }
  };
})(window);
