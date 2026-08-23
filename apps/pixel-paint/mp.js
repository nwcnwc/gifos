// Shared pixel board.
//
// Each player writes paint strokes on THEIR own row. The host (lowest present
// id) applies legal strokes onto the board row. Nobody writes anybody else's
// row. Invite is OS chrome. This file never draws an Invite button.
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var PUB_MS = 120;
  var CELLS = 32 * 32;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var pubTimer = 0;
  var lastList = [];
  var seenAt = {};
  var myN = 0;
  var pending = [];
  var lastBoard = null;
  var lastPacked = '';
  var lastLocal = null;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function blanks() {
    var a = [];
    for (var i = 0; i < CELLS; i++) a.push('transparent');
    return a;
  }
  function legalColor(c) {
    if (typeof c !== 'string' || c.length > 40) return false;
    if (c === 'transparent') return true;
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return true;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(c)) return true;
    return false;
  }
  function legalStroke(s) {
    return s && (s.i === (s.i | 0)) && s.i >= 0 && s.i < CELLS && legalColor(s.c);
  }
  function packStr(pixels) { return (pixels || []).join('\n'); }
  function countPainted(pixels) {
    var n = 0;
    for (var i = 0; i < (pixels || []).length; i++) {
      if (pixels[i] && pixels[i] !== 'transparent') n++;
    }
    return n;
  }
  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === 'board') return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      var rec = seenAt[p.id];
      if (t - rec.seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }
  function isHost(people) {
    people = people || live(lastList);
    if (!people.length) return true;
    var m = people[0].id;
    for (var i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return me.id === m;
  }
  function boardOf(list) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'board') return list[i];
    }
    return null;
  }

  function snapshot(extra) {
    var row = {
      id: me.id,
      name: me.name,
      n: myN,
      pending: pending.slice(),
      at: now()
    };
    if (extra) {
      if (extra.pending) row.pending = extra.pending;
      if (extra.wipe) row.wipe = extra.wipe;
    }
    return row;
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }
  function schedulePublish() {
    if (pubTimer) return;
    pubTimer = setTimeout(function () {
      pubTimer = 0;
      publish();
    }, PUB_MS);
  }

  function putBoard(c) {
    lastBoard = c;
    room.put(c).catch(function () {});
  }

  function freshBoard(hostId) {
    var pixels = (lastLocal && lastLocal.length === CELLS) ? lastLocal.slice() : blanks();
    return {
      id: 'board',
      host: hostId,
      pixels: pixels,
      seq: 0,
      applied: {},
      wipeN: {},
      at: now()
    };
  }

  function applyBoard(pixels) {
    if (!root.PixelPaint || !root.PixelPaint.replace) return;
    var next = (pixels && pixels.length === CELLS) ? pixels.slice() : blanks();
    pending.forEach(function (s) {
      if (legalStroke(s)) next[s.i] = s.c;
    });
    var s = packStr(next);
    if (s === lastPacked) {
      lastLocal = next;
      return;
    }
    lastPacked = s;
    lastLocal = next;
    root.PixelPaint.replace(next);
  }

  function reconcile(B, people) {
    var c = {
      id: 'board',
      host: me.id,
      pixels: (B.pixels && B.pixels.length === CELLS) ? B.pixels.slice() : blanks(),
      seq: B.seq || 0,
      applied: B.applied ? Object.assign({}, B.applied) : {},
      wipeN: B.wipeN ? Object.assign({}, B.wipeN) : {},
      at: now()
    };
    var ch = c.host !== B.host;
    people.forEach(function (p) {
      var last = c.applied[p.id] || 0;
      var wipe = p.wipe || 0;
      if (wipe && wipe > (c.wipeN[p.id] || 0)) {
        c.pixels = blanks();
        c.wipeN[p.id] = wipe;
        c.seq = (c.seq || 0) + 1;
        ch = true;
      }
      (p.pending || []).forEach(function (s) {
        if (!s || s.n <= last) return;
        if (!legalStroke(s)) return;
        c.pixels[s.i] = s.c;
        last = s.n;
        ch = true;
      });
      if (last !== (c.applied[p.id] || 0)) {
        c.applied[p.id] = last;
        c.seq = (c.seq || 0) + 1;
        ch = true;
      }
    });
    return ch ? c : null;
  }

  function dropSpent(board) {
    if (!board) return;
    var last = (board.applied && board.applied[me.id]) || 0;
    var wipeLast = (board.wipeN && board.wipeN[me.id]) || 0;
    var kept = pending.filter(function (s) { return s.n > last; });
    var dropped = kept.length !== pending.length || (wipeLast && wipeLast >= myN && pending.length);
    if (dropped) {
      pending = kept;
      schedulePublish();
    }
  }

  function onChanged(pixels) {
    if (!on) return;
    var prev = lastLocal || [];
    var next = pixels || [];
    var i;
    for (i = 0; i < CELLS; i++) {
      var a = next[i] || 'transparent';
      var b = prev[i] || 'transparent';
      if (a === b) continue;
      if (!legalColor(a)) continue;
      myN += 1;
      pending.push({ n: myN, i: i, c: a });
    }
    lastLocal = next.slice();
    if (pending.length > 1200) pending = pending.slice(-1024);
    schedulePublish();
  }

  function render() {
    if (!on) return;
    var people = live(lastList);
    var status = $('friend-status');
    var roster = $('friend-roster');
    var html = '';
    people.sort(function (a, b) {
      var an = a.name || '', bn = b.name || '';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    people.forEach(function (p) {
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + '" data-id="' + esc(p.id) + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + (p.n || 0) + ' strokes</span></li>';
    });
    roster.innerHTML = html || '<li>Just you so far</li>';
    var others = people.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can paint in the meantime.';
    } else {
      status.textContent = 'One 32×32. Everyone paints. ' + others.length + ' with you.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var people = live(lastList);
    var board = boardOf(lastList);
    if (!board) {
      if (isHost(people)) putBoard(freshBoard(me.id));
      render();
      return;
    }
    lastBoard = board;
    if (isHost(people)) {
      var next = reconcile(board, people);
      if (next) {
        putBoard(next);
        board = next;
      }
    }
    dropSpent(board);
    if (board.pixels) applyBoard(board.pixels);
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      $('friend-status').textContent = 'Sharing needs a GifOS room.';
      return;
    }
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      pending = [];
      myN = 0;
      seenAt = {};
      lastPacked = '';
      lastBoard = null;
      if (root.PixelPaint.flushSave) root.PixelPaint.flushSave();
      lastLocal = root.PixelPaint.pack ? root.PixelPaint.pack() : blanks();
      root.PixelPaint.mp = true;
      document.body.classList.add('together');
      $('friend-bar').hidden = false;
      $('friend-hint').textContent = 'Press Invite (GifOS menu) to send the link. Everyone paints on the same 32×32.';
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      publish();
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
  }

  function leave() {
    on = false;
    pending = [];
    root.PixelPaint.mp = false;
    document.body.classList.remove('together');
    $('friend-bar').hidden = true;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (pubTimer) { clearTimeout(pubTimer); pubTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (root.PixelPaint.restoreSave) root.PixelPaint.restoreSave();
  }

  function wipe() {
    if (!on) return;
    myN += 1;
    pending = [];
    lastLocal = blanks();
    lastPacked = packStr(blanks());
    room.put(snapshot({ wipe: myN, pending: [] })).catch(function () {});
    if (root.PixelPaint && root.PixelPaint.empty) root.PixelPaint.empty();
  }

  root.PixelPaint = root.PixelPaint || {};
  root.PixelPaint.Mp = {
    enter: enter,
    leave: leave,
    wipe: wipe,
    onChanged: onChanged,
    isOn: function () { return on; },
    isHost: isHost
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
})(window);
