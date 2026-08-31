/*
 * Jam together — one hydra patch string, everyone looking at it.
 * Each player publishes the patch on THEIR own row. Nobody writes
 * anybody else's row. Everyone adopts the recipe of the lowest-id
 * player on the current round.
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var MAX = (root.HydraSketch && root.HydraSketch.MAX) || 14000;
  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var declined = false;
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
    return { round: maxR, code: String(a.code).slice(0, MAX), by: a.id };
  }

  function snapshot() {
    return { id: me.id, name: me.name, code: myCode, round: round, at: now() };
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
    if (root.HydraApp) root.HydraApp.applyPatch(ad.code, true);
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
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Friend')) + '</span>' +
        '<span class="meta">' + (mine ? 'jamming' : 'in the jam') + '</span></li>';
    });
    if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!status) return;
    if (!others.length) {
      status.textContent = 'Waiting for a friend… Invite sends the link. You can still edit the patch.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is on the same synth. Run a patch — they see it.';
    } else {
      status.textContent = others.length + ' friends on this synth. Run a patch — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.code !== usedCode || ad.round !== usedRound)) applyWorld(ad);
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
      if (s) s.textContent = 'Jam together needs a GifOS room.';
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
      var cur = root.HydraApp ? root.HydraApp.current() : { code: '' };
      myCode = cur.code;
      round = 1;
      usedCode = null;
      usedRound = 0;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedCode) applyWorld({ code: myCode, round: round, by: me.id });
      lastPub = 0;
      publish();
      renderMp();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () { lastPub = 0; publish(); renderMp(); }, HB_MS);
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

  function onApply(code) {
    if (!on) return false;
    myCode = String(code || '').slice(0, MAX);
    round = (usedRound || round || 1) + 1;
    applyWorld({ code: myCode, round: round, by: me.id });
    if (root.HydraApp) root.HydraApp.persist();
    return true;
  }

  root.HydraMp = {
    enter: enter,
    leave: leave,
    onApply: onApply,
    busy: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  watch();
})(window);
