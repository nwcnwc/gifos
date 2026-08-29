/*
 * Share the pattern — one recipe string, everyone looking at it.
 *
 * Shared (round, code, seed) so every device paints the same square.
 * Each player publishes the pattern on THEIR own row. Nobody writes
 * anybody else's row. Everyone adopts the recipe of the lowest-id
 * player on the current round.
 *
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
  var subscribed = false;
  var declined = false;
  var hbTimer = 0;
  var myCode = '';
  var mySeed = 1;
  var round = 1;
  var usedCode = null;
  var usedSeed = null;
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

  // Highest round anyone has published, then the lexicographically smallest
  // id on that round. Deterministic; never needs a shared row.
  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.code != null; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var a = cand[0];
    return {
      round: maxR,
      code: String(a.code).slice(0, MAX),
      seed: (a.seed >>> 0) || 1,
      by: a.id
    };
  }

  function snapshot() {
    return {
      id: me.id,
      name: me.name,
      code: myCode,
      seed: mySeed,
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
    usedCode = ad.code;
    usedSeed = ad.seed;
    usedRound = ad.round;
    round = ad.round;
    if (ad.by !== me.id) {
      myCode = ad.code;
      mySeed = ad.seed;
    }
    if (root.CDApp) root.CDApp.applyToDoodle(ad.code, ad.seed);
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
        '<span class="meta">' + (mine ? 'sharing' : 'looking') + '</span>' +
        '</li>';
    });
    if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!status) return;
    if (!others.length) {
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can remix in the meantime — they start from this pattern.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is looking. Apply a recipe — they see it.';
    } else {
      status.textContent = others.length + ' friends looking. Apply a recipe — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.code !== usedCode || ad.seed !== usedSeed || ad.round !== usedRound)) {
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

  // Subscribed, not seated: the room is read for company, and enter() runs only
  // when a live row that is not ours shows up (an Invite joiner sees the host
  // immediately). enter() reuses this subscription, so there is only ever one.
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
      if (s) s.textContent = 'Share the pattern needs a GifOS room.';
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
      var cur = root.CDApp ? root.CDApp.current() : { code: '', seed: 1 };
      myCode = cur.code;
      mySeed = cur.seed || 1;
      round = 1;
      usedCode = null;
      usedSeed = null;
      usedRound = 0;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedCode) applyWorld({
        code: myCode,
        seed: mySeed,
        round: round,
        by: me.id
      });
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
    return true;
  }

  function leave() {
    on = false;
    declined = true;   // "← Solo" means solo; watch() must not seat us again
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
  }

  function onApply(code, seed) {
    if (!on) return false;
    myCode = String(code || '').slice(0, MAX);
    mySeed = (seed >>> 0) || 1;
    round = (usedRound || round || 1) + 1;
    applyWorld({
      code: myCode,
      seed: mySeed,
      round: round,
      by: me.id
    });
    if (root.CDApp) root.CDApp.persist();
    return true;
  }

  function onShuffle(code, seed) {
    return onApply(code, seed);
  }

  root.CDMp = {
    enter: enter,
    leave: leave,
    onApply: onApply,
    onShuffle: onShuffle,
    busy: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });


  // A joiner who arrived through Invite is already in a room and should sit
  // down without being asked; a solo player never should. Those two cases look
  // identical from in here, so this used to enter() unconditionally 400ms after
  // boot — which put EVERY solo player in a room they never asked for, hid the
  // Share button they were told to press, and left "Waiting for a friend…"
  // across the top of the app forever. watch() subscribes without joining and
  // sits down only once somebody else is actually on the row.
  watch();
})(window);
