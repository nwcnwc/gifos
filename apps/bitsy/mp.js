/*
 * Share the world — one world-writing, everyone walking in it.
 *
 * Shared (round, world) so every device loads the same room. Each player
 * publishes the world on THEIR own row. Nobody writes anybody else's row.
 * Everyone adopts the writing of the lowest-id player on the current round.
 *
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var MAX = 80000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var declined = false;
  var hbTimer = 0;
  var myWorld = '';
  var round = 1;
  var usedWorld = null;
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
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.world != null; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var a = cand[0];
    return {
      round: maxR,
      world: String(a.world).slice(0, MAX),
      by: a.id
    };
  }

  function snapshot() {
    return {
      id: me.id,
      name: me.name,
      world: myWorld,
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
    usedWorld = ad.world;
    usedRound = ad.round;
    round = ad.round;
    if (ad.by !== me.id) myWorld = ad.world;
    if (root.BitsyApp) root.BitsyApp.playWorld(ad.world);
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
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can still walk and make — they start from this world.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is here. Change the world — they see it.';
    } else {
      status.textContent = others.length + ' friends here. Change the world — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.world !== usedWorld || ad.round !== usedRound)) {
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
      if (s) s.textContent = 'Share the world needs a GifOS room.';
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
      myWorld = root.BitsyApp ? root.BitsyApp.current() : '';
      round = 1;
      usedWorld = null;
      usedRound = 0;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedWorld) applyWorld({
        world: myWorld,
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

  function onApply(data) {
    if (!on) return false;
    myWorld = String(data || '').slice(0, MAX);
    round = (usedRound || round || 1) + 1;
    applyWorld({
      world: myWorld,
      round: round,
      by: me.id
    });
    if (root.BitsyApp) root.BitsyApp.persist();
    return true;
  }

  root.BitsyMp = {
    enter: enter,
    leave: leave,
    onApply: onApply,
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
