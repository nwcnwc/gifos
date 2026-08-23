/*
 * Share this pick — one ramp, everyone looking at it.
 *
 * Shared (round, name, dir) so every device paints the same gradient.
 * Each player publishes the pick on THEIR own row. Nobody writes
 * anybody else's row. Everyone adopts the pick of the lowest-id
 * player on the current round.
 *
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var myPick = '';
  var myDir = 'to right';
  var round = 1;
  var usedName = null;
  var usedDir = null;
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
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.pick; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var a = cand[0];
    return {
      round: maxR,
      name: String(a.pick),
      dir: a.dir || 'to right',
      by: a.id
    };
  }

  function snapshot() {
    return {
      id: me.id,
      name: me.name,
      pick: myPick,
      dir: myDir,
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
    usedName = ad.name;
    usedDir = ad.dir;
    usedRound = ad.round;
    round = ad.round;
    if (ad.by !== me.id) {
      myPick = ad.name;
      myDir = ad.dir;
    }
    if (root.UGApp) root.UGApp.setPick(ad.name, ad.dir, true);
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
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can keep browsing — they start from this pick.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is looking. Pick a ramp — they see it.';
    } else {
      status.textContent = others.length + ' friends looking. Pick a ramp — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.name !== usedName || ad.dir !== usedDir || ad.round !== usedRound)) {
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

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      var s = $('friend-status');
      if (s) s.textContent = 'Share this pick needs a GifOS room.';
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
      var cur = root.UGApp ? root.UGApp.current() : { name: '', dir: 'to right' };
      myPick = cur.name;
      myDir = cur.dir || 'to right';
      round = 1;
      usedName = null;
      usedDir = null;
      usedRound = 0;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedName) applyWorld({
        name: myPick,
        dir: myDir,
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
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
  }

  function onPick(name, dir) {
    if (!on) return false;
    myPick = String(name || '');
    myDir = dir || 'to right';
    round = (usedRound || round || 1) + 1;
    applyWorld({
      name: myPick,
      dir: myDir,
      round: round,
      by: me.id
    });
    if (root.UGApp) root.UGApp.persist();
    return true;
  }

  root.UGMp = {
    enter: enter,
    leave: leave,
    onPick: onPick,
    busy: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });

  // Joiners who arrived through Invite are already in a room — sit down.
  if (root.gifos && root.gifos.db) {
    setTimeout(function () { if (!on) enter(); }, 400);
  }
})(window);
