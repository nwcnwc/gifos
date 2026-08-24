/*
 * Meeting wall — lean cards + presence in room (hot, subscribed).
 * Full boards in their own collection, loaded with get(), never subscribed.
 * Each player writes only THEIR presence row. Cards are shared.
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var S = root.Sandspiel;
  var STALE_MS = 9000;
  var HB_MS = 3000;
  var api = null;
  var room = null;
  var boards = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
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

  function liveHere(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.kind !== 'here') return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function cardsOf(list) {
    return (list || []).filter(function (p) { return p && p.id && p.kind === 'card'; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  function publishHere() {
    if (!on || !room || !me.id) return;
    var t = now();
    if (t - lastPub < 80) return;
    lastPub = t;
    room.put({ id: me.id, kind: 'here', name: me.name, at: t }).catch(function () {});
  }

  function renderMp() {
    if (!on) return;
    var players = liveHere(lastList);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var html = '';
    players.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Friend')) + '</span>' +
        '<span class="meta">here</span></li>';
    });
    if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (status) {
      if (!others.length) {
        status.textContent = 'Waiting for a friend… Invite sends the link. Put a board on the wall while you wait.';
      } else if (others.length === 1) {
        status.textContent = (others[0].name || 'Friend') + ' is on the wall. Put a board up — they see the card.';
      } else {
        status.textContent = others.length + ' friends on the wall. Put a board up — everyone sees the card.';
      }
    }
    paintWall();
  }

  function paintWall() {
    var box = $('wall');
    if (!box) return;
    var cards = cardsOf(lastList);
    box.textContent = '';
    cards.forEach(function (c) {
      var b = document.createElement('button');
      var cv = document.createElement('canvas');
      var t = document.createElement('span');
      var a = document.createElement('span');
      b.type = 'button';
      b.className = 'card';
      cv.width = S.THUMB_W;
      cv.height = S.THUMB_H;
      S.paintThumb(cv, c.thumb);
      t.className = 't';
      t.textContent = c.title || 'Board';
      a.className = 'a';
      a.textContent = c.authorId === me.id ? 'You' : (c.author || 'Friend');
      b.appendChild(cv);
      b.appendChild(t);
      b.appendChild(a);
      b.addEventListener('click', function () { openCard(c.id); });
      box.appendChild(b);
    });
  }

  function openCard(id) {
    if (!boards || !id || !root.SandApp) return;
    boards.get(id).then(function (rec) {
      if (!rec || !rec.cells) return;
      root.SandApp.loadPacked(rec.w || S.WIDTH, rec.h || S.HEIGHT, rec.cells);
      root.SandApp.setPaused(true);
    }).catch(function (err) {
      if (root.SandApp && root.SandApp.note) {
        root.SandApp.note((err && err.message) || 'Could not open that board.');
      }
    });
  }

  function putOnWall() {
    if (!on || !room || !boards || !root.SandApp || !me.id) return;
    var title = ($('wallTitle').value || '').trim() || 'Board';
    var id = 'b_' + String(me.id).slice(0, 8) + '_' + now().toString(36);
    var packed = root.SandApp.pack();
    var uni = root.SandApp.universe();
    boards.put({
      id: id,
      w: uni.width,
      h: uni.height,
      cells: packed
    }).then(function () {
      return room.put({
        id: id,
        kind: 'card',
        title: title.slice(0, 48),
        author: me.name,
        authorId: me.id,
        at: now(),
        thumb: root.SandApp.thumb()
      });
    }).then(function () {
      $('wallTitle').value = '';
    }).catch(function (err) {
      if (root.SandApp && root.SandApp.note) {
        root.SandApp.note((err && err.message) || 'Could not put this board on the wall.');
      }
    });
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
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
    boards = api.db('boards');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      document.body.classList.add('friend');
      $('friend-bar').hidden = false;
      $('shareBtn').hidden = true;
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      lastPub = 0;
      publishHere();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () {
        lastPub = 0;
        publishHere();
        renderMp();
      }, HB_MS);
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

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  $('putBtn').addEventListener('click', function (e) { e.preventDefault(); putOnWall(); });

  if (root.gifos && root.gifos.info) {
    root.gifos.info().then(function (i) {
      if (!on && i && i.owner === false) enter();
    }).catch(function () {});
  }

  root.SandWall = { enter: enter, leave: leave, busy: function () { return on; } };
})(window);
