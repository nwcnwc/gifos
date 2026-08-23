// One Stroke — one line each. Invite is OS chrome. Nobody writes anybody
// else's row. The picture row is host-written.
(function () {
  'use strict';
  var OS = window.OS;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000;
  var PLAY_MS = 900, HOLD_MS = 1400, ARRIVE_MS = 780;

  var color = OS.COLORS[2];
  var width = OS.WIDTHS[1];

  var solo = null;
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, picture: null, people: [], hb: 0, sub: false, autoPlay: -1 };
  var _items = [];

  var pads = {};

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function setStatus(el, text, cls) {
    el.className = 'statusline' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }
  function setControls(id, kind) {
    $(id).className = 'controls ' + kind;
  }

  function hideAll() {
    $('solo').hidden = true;
    $('friend').hidden = true;
  }

  // ---- paint ----
  function resizePad(canvas) {
    var wrap = canvas.parentNode;
    var cssW = wrap.clientWidth || 360;
    var cssH = wrap.clientHeight || cssW;
    if (cssH < 160) cssH = 160;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { cssW: cssW, cssH: cssH, dpr: dpr };
  }

  function ptsUntil(pts, frac) {
    if (!pts || pts.length < 2) return null;
    var t = frac == null ? 1 : frac;
    if (t <= 0) return null;
    if (t >= 1) return pts;
    var total = OS.pathLen(pts) || 1;
    var want = total * t;
    var out = [pts[0]], walked = 0, i, seg, u;
    for (i = 1; i < pts.length; i++) {
      seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (walked + seg >= want) {
        u = seg ? (want - walked) / seg : 0;
        out.push({
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u
        });
        return out;
      }
      out.push(pts[i]);
      walked += seg;
    }
    return out;
  }

  function strokePath(ctx, s, w, h, frac, wet) {
    var pts = ptsUntil(s && s.pts, frac);
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.c || OS.COLORS[2];
    ctx.lineWidth = Math.max(2.2, (s.w || width) * Math.min(w, h));
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = wet ? 5 : 2.4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    var i, mx, my;
    for (i = 1; i < pts.length - 1; i++) {
      mx = ((pts[i].x + pts[i + 1].x) / 2) * w;
      my = ((pts[i].y + pts[i + 1].y) / 2) * h;
      ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
    ctx.stroke();
    ctx.restore();
  }

  function paintPaper(canvas, strokes, pending, playT) {
    var sz = resizePad(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(sz.dpr, 0, 0, sz.dpr, 0, 0);
    var w = sz.cssW, h = sz.cssH;
    ctx.clearRect(0, 0, w, h);
    var list = OS.playback(strokes || []);
    var i, t;
    if (playT != null) {
      for (i = 0; i < list.length; i++) {
        t = playT - i;
        if (t <= 0) break;
        strokePath(ctx, list[i], w, h, t >= 1 ? 1 : t, false);
      }
      return;
    }
    for (i = 0; i < list.length; i++) strokePath(ctx, list[i], w, h, 1, false);
    if (pending && pending.pts && pending.pts.length >= 2) {
      strokePath(ctx, pending, w, h, 1, true);
    }
  }

  function playClock(strokes, t0, mode) {
    var n = (strokes || []).length;
    if (!n) return 0;
    var e, dur;
    if (mode === 'arrive') {
      dur = ARRIVE_MS;
      e = (nowMs() - t0) / dur;
      if (e >= 1) return n;
      return (n - 1) + Math.max(0, Math.min(1, e));
    }
    var total = n * PLAY_MS + HOLD_MS;
    e = (nowMs() - t0) % total;
    if (e >= n * PLAY_MS) return n;
    return e / PLAY_MS;
  }

  // ---- a pad (pointer → one pending stroke) ----
  function makePad(canvas, hooks) {
    var pending = null;
    var drawing = false;
    var last = null;
    var playOn = false;
    var playMode = 'loop';
    var playStart = 0;
    var raf = 0;
    var sent = false;

    function canDraw() { return !sent && hooks.canDraw && hooks.canDraw(); }
    function strokes() { return hooks.strokes ? hooks.strokes() : []; }

    function redraw() {
      var t = playOn ? playClock(strokes(), playStart, playMode) : null;
      if (playOn && playMode === 'arrive' && t >= (strokes() || []).length) {
        playOn = false;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        t = null;
      }
      paintPaper(canvas, strokes(), playOn ? null : pending, t);
      var paper = canvas.parentNode;
      if (paper) paper.classList.toggle('mine', !playOn && canDraw() && !pending);
    }

    function loop() {
      raf = 0;
      if (!playOn) return;
      redraw();
      if (playOn) raf = requestAnimationFrame(loop);
    }

    function ptOf(t, r) {
      return {
        x: (t.clientX - r.left) / (r.width || 1),
        y: (t.clientY - r.top) / (r.height || 1)
      };
    }

    function start(ev) {
      if (playOn) stopPlay();
      if (!canDraw()) return;
      if (pending && !drawing) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      var r = canvas.getBoundingClientRect();
      var p = ptOf(ev, r);
      drawing = true;
      pending = { pts: OS.compactPts([p]), c: color, w: width };
      last = p;
      redraw();
      if (hooks.onChange) hooks.onChange();
    }
    function move(ev) {
      if (!drawing || !pending) return;
      ev.preventDefault();
      var r = canvas.getBoundingClientRect();
      var extra = [], i, list;
      if (ev.getCoalescedEvents) {
        list = ev.getCoalescedEvents();
        for (i = 0; i < list.length; i++) extra.push(ptOf(list[i], r));
      } else {
        extra.push(ptOf(ev, r));
      }
      if (!extra.length) return;
      pending.pts = OS.compactPts(pending.pts.concat(extra));
      last = extra[extra.length - 1];
      pending.c = color;
      pending.w = width;
      redraw();
    }
    function end(ev) {
      if (!drawing || !pending) return;
      if (ev) ev.preventDefault();
      var r = canvas.getBoundingClientRect();
      var p = ev ? ptOf(ev, r) : last;
      if (p) pending.pts = OS.compactPts(pending.pts.concat([p]));
      drawing = false;
      if (!pending.pts || pending.pts.length < 2) pending = null;
      else {
        pending.c = color;
        pending.w = width;
      }
      redraw();
      if (hooks.onChange) hooks.onChange();
    }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    function stopPlay() {
      playOn = false;
      playMode = 'loop';
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      redraw();
    }

    return {
      redraw: redraw,
      pending: function () { return pending; },
      sent: function () { return sent; },
      markSent: function () { sent = true; if (hooks.onChange) hooks.onChange(); },
      clearPending: function () { pending = null; drawing = false; sent = false; redraw(); },
      restyle: function () {
        if (pending && !sent) { pending.c = color; pending.w = width; redraw(); }
      },
      undo: function () {
        if (drawing || sent) return false;
        if (!pending) return false;
        pending = null;
        redraw();
        if (hooks.onChange) hooks.onChange();
        return true;
      },
      play: function (mode) {
        if (playOn && playMode === (mode || 'loop')) { stopPlay(); return false; }
        playOn = true;
        playMode = mode || 'loop';
        playStart = nowMs();
        loop();
        return true;
      },
      playing: function () { return playOn && playMode === 'loop'; },
      stopPlay: stopPlay
    };
  }

  function paintInk(hostId) {
    var host = $(hostId);
    host.innerHTML = '';
    OS.COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', 'ink');
      if (c === color) b.className = 'on';
      b.addEventListener('click', function () {
        color = c;
        paintInk('soloInk');
        paintInk('fInk');
        if (pads.solo) pads.solo.restyle();
        if (pads.f) pads.f.restyle();
      });
      host.appendChild(b);
    });
  }
  function paintWidths(hostId) {
    var host = $(hostId);
    host.innerHTML = '';
    var sizes = [8, 14, 22];
    OS.WIDTHS.forEach(function (w, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var dot = document.createElement('i');
      dot.style.width = sizes[i] + 'px';
      dot.style.height = sizes[i] + 'px';
      b.appendChild(dot);
      if (w === width) b.className = 'on';
      b.addEventListener('click', function () {
        width = w;
        paintWidths('soloWidths');
        paintWidths('fWidths');
        if (pads.solo) pads.solo.restyle();
        if (pads.f) pads.f.restyle();
      });
      host.appendChild(b);
    });
  }
  paintInk('soloInk');
  paintInk('fInk');
  paintWidths('soloWidths');
  paintWidths('fWidths');

  // ---- solo ----
  function soloSave() {
    if (!saveDb || !solo) return;
    saveDb.put({
      id: 'doodle',
      strokes: solo.strokes,
      title: solo.title || '',
      seq: solo.seq,
      at: nowMs()
    }).catch(function () {});
  }

  function soloRefresh() {
    if ($('solo').hidden || !solo) return;
    var n = (solo.strokes || []).length;
    var pad = pads.solo;
    var pending = pad && pad.pending();
    var ready = pending && pending.pts && pending.pts.length >= 2;
    var hint = $('soloHint');
    if (pad && pad.playing()) {
      setStatus($('soloStatus'), 'The picture, arriving.', '');
      setChip('ready', 'Loop');
      hint.hidden = true;
      setControls('soloControls', 'play');
      $('soloPlay').textContent = 'Stop loop';
    } else if (ready) {
      setStatus($('soloStatus'), 'Undo, or send this stroke.', 'turn');
      setChip('turn', 'Your stroke');
      hint.hidden = true;
      setControls('soloControls', 'pending');
      $('soloPlay').textContent = 'Play loop';
    } else {
      setStatus($('soloStatus'), n ? 'Your turn. One more line.' : 'Your turn. One line.', 'turn');
      setChip('turn', 'Your turn');
      hint.hidden = n > 0;
      setControls('soloControls', n ? 'idle' : 'empty');
      $('soloPlay').textContent = 'Play loop';
    }
    $('soloStatus').style.visibility = hint.hidden ? '' : 'hidden';
    $('soloSend').disabled = !!(pad && pad.sent()) || !ready;
    $('soloUndo').disabled = !!(pad && pad.sent()) || !ready;
    if (pad) pad.redraw();
  }

  pads.solo = makePad($('soloPad'), {
    canDraw: function () { return !$('solo').hidden && solo && solo.phase === 'draw'; },
    strokes: function () { return solo ? solo.strokes : []; },
    onChange: soloRefresh
  });

  function openSolo(existing) {
    hideAll();
    $('solo').hidden = false;
    if (existing) {
      solo = OS.fresh(['local'], { names: { local: 'You' }, seq: existing.seq || 0 });
      solo.strokes = (existing.strokes || []).map(function (s, i) {
        return {
          n: s.n != null ? s.n : i,
          by: s.by || 'local',
          pts: s.pts,
          c: s.c,
          w: s.w
        };
      });
      solo.title = existing.title || '';
      solo.seq = existing.seq || solo.strokes.length;
    } else if (!solo) {
      solo = OS.fresh(['local'], { names: { local: 'You' } });
    }
    $('soloTitleIn').value = solo.title || '';
    if (pads.solo) {
      pads.solo.clearPending();
      pads.solo.stopPlay();
    }
    soloRefresh();
  }

  $('soloFriends').onclick = function () { mpEnter(); };
  $('soloUndo').onclick = function () { pads.solo.undo(); };
  $('soloSend').onclick = function () {
    if (!solo) return;
    var p = pads.solo.pending();
    if (!p || !p.pts || p.pts.length < 2) return;
    var intent = { kind: 'stroke', seq: solo.seq, pts: p.pts, c: p.c, w: p.w };
    var next = OS.applyIntent(solo, 'local', intent);
    if (!next) return;
    solo = next;
    pads.solo.clearPending();
    pads.solo.play('arrive');
    soloSave();
    soloRefresh();
  };
  $('soloPlay').onclick = function () {
    var on = pads.solo.play('loop');
    $('soloPlay').textContent = on ? 'Stop loop' : 'Play loop';
    soloRefresh();
  };
  $('soloNew').onclick = function () {
    solo = OS.fresh(['local'], { names: { local: 'You' } });
    $('soloTitleIn').value = '';
    pads.solo.clearPending();
    pads.solo.stopPlay();
    $('soloPlay').textContent = 'Play loop';
    soloSave();
    soloRefresh();
  };
  $('soloTitleIn').addEventListener('change', function () {
    if (!solo) return;
    solo.title = OS.sanitizeTitle(this.value);
    soloSave();
    soloRefresh();
  });
  $('soloTitleForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('soloTitleIn').dispatchEvent(new Event('change'));
  });

  // ---- multiplayer ----
  function mySeat(pic) {
    if (!pic || !pic.seats) return -1;
    return pic.seats.indexOf(mp.id);
  }
  function isHost(people) {
    people = people || mp.people;
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function nameOf(pic, id) {
    if (!id) return 'open';
    return (pic && pic.names && pic.names[id]) || 'Player';
  }
  function putMe(extra) {
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putPicture(p) { mp.picture = p; mpDb.put(p).catch(function () {}); }

  function mpEnter() {
    if (!mpDb) { setChip('wait', 'Needs storage'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      hideAll();
      $('friend').hidden = false;
      $('soloFriends').hidden = true;
      $('fLeave').hidden = false;
      setChip('ready', 'A friend');
      pads.f.clearPending();
      pads.f.stopPlay();
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRender();
    });
  }
  function mpLeave() {
    mp.on = false;
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (mpDb && mp.id) mpDb.delete(mp.id).catch(function () {});
    $('soloFriends').hidden = false;
    $('fLeave').hidden = true;
    openSolo(solo);
  }
  $('fLeave').onclick = mpLeave;

  function livePeople(items, t) {
    var people = [], picture = null, i, it;
    t = t || nowMs();
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it || !it.id) continue;
      if (it.id === 'picture') { picture = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (mp.id && !people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    return { people: people, picture: picture };
  }

  function seatIds(people, existing) {
    var ids = [], have = {}, i, id;
    if (existing && existing.length) {
      for (i = 0; i < existing.length; i++) {
        id = existing[i];
        if (!id || have[id]) continue;
        have[id] = 1;
        ids.push(id);
      }
    }
    var extra = people.map(function (p) { return p.id; }).filter(function (id) { return !have[id]; });
    extra.sort();
    for (i = 0; i < extra.length && ids.length < OS.MAX_SEATS; i++) ids.push(extra[i]);
    return ids;
  }

  function mpRefresh() {
    if (!mp.on) return;
    var pack = livePeople(_items);
    var people = pack.people, picture = pack.picture, i;
    mp.people = people;
    mp.picture = picture;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (!picture) {
      if (isHost(people)) {
        putPicture(OS.fresh(seatIds(people, []), {
          host: mp.id,
          names: namesFrom(people),
          now: nowMs()
        }));
      }
      mpRender();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(picture, people);
      if (next) { putPicture(next); return; }
    }
    if (mp.row && mp.row.intent && picture.seq !== mp.row.intent.seq) {
      var keepVote = mp.row.intent.kind === 'vote' && picture.phase === 'vote';
      if (!keepVote) putMe({ intent: null });
    }
    if (mp.row && mp.row.intent && mp.row.intent.kind === 'stroke') {
      var committed = (picture.strokes || []).some(function (s) {
        return s.by === mp.id && s.n === (picture.strokes.length - 1);
      });
      if (committed || picture.seq !== mp.row.intent.seq) {
        pads.f.clearPending();
        if (committed) pads.f.play('arrive');
      }
    } else if (picture.strokes && picture.strokes.length) {
      var last = picture.strokes[picture.strokes.length - 1];
      if (last && last.by !== mp.id && mp._seenN !== last.n && picture.phase === 'draw') {
        mp._seenN = last.n;
        pads.f.play('arrive');
      }
    }
    mpRender();
  }

  function namesFrom(people) {
    var n = {}, i;
    for (i = 0; i < people.length; i++) n[people[i].id] = people[i].name || 'Player';
    return n;
  }

  function mpReconcile(P, people) {
    var pic = JSON.parse(JSON.stringify(P));
    var ch = false;
    var live = {}, i, p;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      live[p.id] = p;
      if (pic.names[p.id] !== p.name) { pic.names[p.id] = p.name; ch = true; }
    }
    var frozen = (pic.strokes || []).length > 0 || pic.phase !== 'draw';
    if (!frozen) {
      var seats = seatIds(people, pic.seats);
      if (seats.join('\0') !== (pic.seats || []).join('\0')) {
        pic.seats = seats;
        ch = true;
      }
    }
    if (pic.host !== mp.id) { pic.host = mp.id; ch = true; }

    if (pic.phase === 'draw' && pic.seats.length) {
      var actor = pic.seats[pic.turn];
      if (actor && !live[actor] && people.length) {
        var skipped = OS.skipAbsent(pic, live);
        if (skipped) { pic = skipped; ch = true; }
      }
    }

    var rows = people.map(function (row) {
      return { id: row.id, intent: row.intent };
    });
    var applied = OS.applyIntents(pic, rows);
    if (applied) { pic = applied; ch = true; }
    return ch ? pic : null;
  }

  function myTurn() {
    var pic = mp.picture;
    if (!pic || pic.phase !== 'draw') return false;
    if (!pic.seats || pic.seats.length < 2) return false;
    return OS.actorOf(pic) === mp.id;
  }

  pads.f = makePad($('fPad'), {
    canDraw: function () { return mp.on && myTurn(); },
    strokes: function () { return mp.picture ? mp.picture.strokes : []; },
    onChange: mpRender
  });

  function mpPlayStroke() {
    var pic = mp.picture;
    var p = pads.f.pending();
    if (!pic || !myTurn() || !p || p.pts.length < 2) return;
    putMe({ intent: { kind: 'stroke', seq: pic.seq, pts: p.pts, c: p.c, w: p.w } });
    pads.f.markSent();
  }

  $('fUndo').onclick = function () { pads.f.undo(); };
  $('fSend').onclick = mpPlayStroke;
  $('fPlay').onclick = function () {
    var on = pads.f.play('loop');
    $('fPlay').textContent = on ? 'Stop loop' : 'Play loop';
    mpRender();
  };
  $('fAgain').onclick = function () {
    var pic = mp.picture;
    if (!pic || pic.phase !== 'play' || mySeat(pic) < 0) return;
    putMe({ intent: { kind: 'again', seq: pic.seq } });
  };
  $('fNew').onclick = function () {
    var pic = mp.picture;
    if (!pic || mySeat(pic) < 0) return;
    putMe({ intent: { kind: 'new', seq: pic.seq } });
  };

  function voteFor(title) {
    var pic = mp.picture;
    if (!pic || pic.phase !== 'vote' || mySeat(pic) < 0) return;
    title = OS.sanitizeTitle(title);
    if (!title) return;
    putMe({ intent: { kind: 'vote', seq: pic.seq, title: title } });
  }
  $('fVoteForm').addEventListener('submit', function (e) {
    e.preventDefault();
    voteFor($('fVoteIn').value);
  });

  function paintVotes(pic) {
    var box = $('fVoteList');
    box.innerHTML = '';
    var mine = (pic.votes && pic.votes[mp.id]) || (mp.row && mp.row.intent && mp.row.intent.kind === 'vote' && mp.row.intent.title) || '';
    (pic.suggestions || OS.SUGGESTIONS).forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      if (mine === t) b.className = 'on';
      b.addEventListener('click', function () { voteFor(t); });
      box.appendChild(b);
    });
  }

  function mpRender() {
    if (!mp.on) return;
    var pic = mp.picture, status = $('fStatus');
    var hint = $('fHint'), wait = $('fWait');
    if (!pic) {
      $('fSeats').innerHTML = '';
      status.textContent = 'Setting up the page…';
      hint.hidden = true;
      wait.hidden = true;
      return;
    }
    var seat = mySeat(pic);
    var actor = OS.actorOf(pic);
    var waiting = mp.people.filter(function (p) { return pic.seats.indexOf(p.id) < 0; });
    var n = (pic.strokes || []).length;
    var both = pic.seats.length >= 2;
    function bothTurn(p, id) {
      return both && p.phase === 'draw' && p.seats[p.turn] === id;
    }
    $('fSeats').innerHTML = pic.seats.map(function (id) {
      var mine = id === mp.id;
      var turn = bothTurn(pic, id);
      var label = mine ? 'You' : esc(nameOf(pic, id));
      return '<div class="seat' + (mine ? ' me' : '') + (turn ? ' turn' : '') + '">' +
        label + '</div>';
    }).join('') || '<div class="seat"><span class="open">open</span></div>';
    $('fQueue').textContent = waiting.length
      ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', '))
      : '';
    $('fQueue').hidden = !waiting.length;
    var pending = pads.f.pending();
    var ready = pending && pending.pts && pending.pts.length >= 2;
    var mineNow = myTurn();
    $('fPaper').classList.toggle('locked', !mineNow);
    $('fPaper').classList.toggle('mine', mineNow && !ready && !pads.f.playing());
    $('fSend').disabled = !(myTurn() && ready) || pads.f.sent();
    $('fUndo').disabled = !ready || pads.f.sent();
    $('fAgain').hidden = pic.phase !== 'play' || seat < 0;
    $('fNew').hidden = (pic.phase !== 'play' && pic.phase !== 'vote') || seat < 0;
    $('fVote').hidden = pic.phase !== 'vote' || seat < 0;

    hint.hidden = true;
    wait.hidden = true;

    $('friend').classList.toggle('waiting', !both);
    if (!both) {
      status.innerHTML = 'Press <b>Invite</b> in the bar above. The people who open the link sit here.';
      setChip('wait', 'Waiting');
      wait.hidden = false;
      $('fWaitName').textContent = 'Invite is the studio';
      $('fWaitMsg').textContent = 'Send the link from the bar above. No account. The doodle lives in this file.';
      setControls('fControls', 'empty');
    } else if (pic.phase === 'vote') {
      paintVotes(pic);
      if (seat < 0) setStatus(status, 'Spectating the vote.', '');
      else if (pic.votes && pic.votes[mp.id]) setStatus(status, 'You voted. Waiting for the others.', '');
      else setStatus(status, 'Name this picture.', 'turn');
      setChip('turn', 'Title');
      setControls('fControls', n ? 'idle' : 'empty');
    } else if (pic.phase === 'play') {
      var ttl = pic.title ? ('“' + pic.title + '”') : 'The picture';
      setStatus(status, ttl + ' — arriving, in order.', 'good');
      setChip('ready', pic.title || 'Loop');
      setControls('fControls', 'play');
      if (mp.autoPlay !== pic.seq) {
        mp.autoPlay = pic.seq;
        if (!pads.f.playing()) {
          pads.f.play('loop');
          $('fPlay').textContent = 'Stop loop';
        }
      }
    } else if (seat < 0) {
      setStatus(status, 'Spectating.', '');
      setChip('wait', 'Watching');
      setControls('fControls', n ? 'idle' : 'empty');
    } else if (actor === mp.id) {
      if (ready) {
        setStatus(status, 'Undo, or send this stroke.', 'turn');
        setChip('turn', 'Your stroke');
        setControls('fControls', 'pending');
      } else {
        setStatus(status, n ? 'Your turn. One line.' : 'Your turn. Draw one line.', 'turn');
        setChip('turn', 'Your turn');
        if (!n && !pads.f.playing()) {
          hint.hidden = false;
          hint.querySelector('b').textContent = 'Your turn. One line.';
          hint.querySelector('span').textContent = 'Lift, then send it. Nobody else may draw until you do.';
        }
        setControls('fControls', n ? 'idle' : 'empty');
      }
    } else {
      setStatus(status, 'Waiting for ' + nameOf(pic, actor) + '…');
      setChip('wait', nameOf(pic, actor));
      wait.hidden = false;
      $('fWaitName').textContent = nameOf(pic, actor);
      $('fWaitMsg').textContent = 'is drawing the next line';
      setControls('fControls', n ? 'idle' : 'empty');
    }
    if (pads.f.playing()) {
      $('fPlay').textContent = 'Stop loop';
      setControls('fControls', 'play');
      hint.hidden = true;
    } else {
      $('fPlay').textContent = 'Play loop';
    }
    status.style.visibility = (!hint.hidden || !wait.hidden) ? 'hidden' : '';
    pads.f.redraw();
  }

  window.addEventListener('resize', function () {
    if (!$('solo').hidden) pads.solo.redraw();
    if (!$('friend').hidden) pads.f.redraw();
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
  });

  setChip('turn', 'Your turn');
  if (saveDb) {
    saveDb.get('doodle').then(function (g) {
      if (g && g.strokes && g.strokes.length) openSolo(g);
      else openSolo(null);
    }).catch(function () { openSolo(null); });
  } else {
    openSolo(null);
  }
})();
