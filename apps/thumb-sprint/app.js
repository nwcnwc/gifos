/*
 * Thumb Sprint — mash pad, canvas track, solo ghost/cpu, versus.
 * Invite is OS chrome. Each person writes ONLY their own lanes row.
 * Host writes the race row. Photo finish is a local loop of positions.
 */
(function () {
  'use strict';
  var T = typeof ThumbSprint !== 'undefined' ? ThumbSprint : null;
  if (!T) return;

  var COLORS = [
    { body: '#ff5c4a', hi: '#ffb0a4', ink: '#3a1010' },
    { body: '#4ade80', hi: '#bbf7d0', ink: '#052e16' },
    { body: '#60a5fa', hi: '#bfdbfe', ink: '#0c1a3a' },
    { body: '#fbbf24', hi: '#fde68a', ink: '#3a2800' }
  ];
  var STALE_MS = 9000, HB_MS = 3000, PUT_MS = 80;
  var CPU_ID = 'cpu', GHOST_ID = 'ghost';

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, raceDb = null, lanesDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      raceDb = api.db('race');
      lanesDb = api.db('lanes');
    }
  } catch (e) {}

  var S = {
    mode: 'cpu',
    me: { id: 'local', name: 'You' },
    host: true,
    race: null,
    mine: null,
    others: [],
    best: null,
    samples: [],
    history: [],
    photo: null,
    shown: {},
    lastPut: 0,
    hb: 0,
    seq: -1,
    vsFriend: false
  };

  function iAmHost() { return !!S.host; }
  function racing() {
    return !!(S.race && S.race.startAt);
  }
  function started() {
    return racing() && now() >= S.race.startAt;
  }
  function finished() {
    if (!S.race) return false;
    if (S.race.phase === 'finish') return true;
    if ((S.race.finishOrder || []).length) return true;
    return !!(S.mine && S.mine.finishedAt);
  }

  function liveOthers() {
    var t = now(), out = [];
    for (var i = 0; i < S.others.length; i++) {
      var p = S.others[i];
      if (p && p.at && t - p.at < STALE_MS) out.push(p);
    }
    return out;
  }

  function seatedIds() {
    if (S.vsFriend && S.race && S.race.seats && S.race.seats.length) {
      return S.race.seats.slice(0, T.MAX_LANES);
    }
    if (S.vsFriend) {
      var ids = [S.me.id].concat(liveOthers().map(function (p) { return p.id; }));
      ids.sort();
      return ids.slice(0, T.MAX_LANES);
    }
    return [S.me.id, S.mode === 'ghost' ? GHOST_ID : CPU_ID];
  }

  function nameOf(id) {
    if (id === S.me.id) return S.me.name || 'You';
    if (id === CPU_ID) return 'Computer';
    if (id === GHOST_ID) {
      if (S.best && S.best.timeMs) return 'Best ' + fmtMs(S.best.timeMs);
      return 'Ghost';
    }
    if (S.race && S.race.names && S.race.names[id]) return S.race.names[id];
    for (var i = 0; i < S.others.length; i++) {
      if (S.others[i].id === id) return S.others[i].name || 'Friend';
    }
    return 'Friend';
  }

  function colorOf(id, i) {
    var n = 0;
    var s = String(id || '');
    for (var k = 0; k < s.length; k++) n = (n * 31 + s.charCodeAt(k)) >>> 0;
    return COLORS[(i != null ? i : n) % COLORS.length];
  }

  function resetMine(keepName) {
    S.mine = T.freshLane(S.me.id, keepName || S.me.name);
    S.mine.ready = true;
    S.samples = [];
    S.history = [];
    S.photo = null;
    S.shown = {};
  }

  function putMine(force) {
    if (!lanesDb || !S.me.id || S.me.id === 'local') return;
    var t = now();
    if (!force && t - S.lastPut < PUT_MS) return;
    S.lastPut = t;
    if (!S.mine) resetMine();
    S.mine.at = t;
    S.mine.name = S.me.name;
    lanesDb.put({
      id: S.me.id,
      name: S.me.name,
      taps: S.mine.taps || 0,
      position: S.mine.position || 0,
      falseStart: !!S.mine.falseStart,
      finishedAt: S.mine.finishedAt || 0,
      at: t,
      ready: true,
      seq: S.race ? S.race.seq : 0
    }).catch(function () {});
  }

  function putRace(next) {
    if (!next) return;
    if (!T.canWriteRace(S.me.id, next)) return;
    S.race = next;
    if (raceDb) raceDb.put(next).catch(function () {});
  }

  function hostStart() {
    if (!iAmHost()) return;
    var others = liveOthers();
    var vs = others.length > 0;
    S.vsFriend = vs;
    var seats, names = {};
    names[S.me.id] = S.me.name;
    if (vs) {
      seats = [S.me.id].concat(others.map(function (p) { return p.id; }));
      seats.sort();
      seats = seats.slice(0, T.MAX_LANES);
      others.forEach(function (p) { names[p.id] = p.name || 'Friend'; });
    } else {
      seats = [S.me.id, S.mode === 'ghost' ? GHOST_ID : CPU_ID];
      names[CPU_ID] = 'Computer';
      names[GHOST_ID] = nameOf(GHOST_ID);
    }
    var seq = (S.race && S.race.seq || 0) + 1;
    var race = T.freshRace({
      host: S.me.id,
      seed: (Math.random() * 1e9) | 0,
      startAt: now() + T.COUNTDOWN_MS,
      seats: seats,
      names: names,
      seq: seq,
      phase: 'countdown'
    });
    resetMine();
    putRace(race);
    putMine(true);
  }

  function doTap() {
    if (S.photo || !S.race || !S.race.startAt) {
      if (iAmHost()) hostStart();
      return;
    }
    if (S.mine && S.mine.finishedAt) return;
    if ((S.race.finishOrder || []).length) return;
    if (!S.mine) resetMine();
    var before = S.mine.position;
    S.mine = T.tap(S.mine, S.race, now());
    if (S.mine.falseStart && S.mine.position === 0) S.shown[S.me.id] = 0;
    if (S.mine.position !== before || S.mine.falseStart) putMine(true);
  }

  function ingestLanes(list) {
    var t = now();
    var others = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === S.me.id) return;
      if (p.id === 'race' || p.id === 'host-probe') return;
      if (!p.at || t - p.at > STALE_MS) return;
      others.push({
        id: p.id,
        name: p.name || 'Friend',
        taps: p.taps || 0,
        position: p.position || 0,
        falseStart: !!p.falseStart,
        finishedAt: p.finishedAt || 0,
        at: p.at,
        ready: !!p.ready,
        seq: p.seq || 0
      });
    });
    S.others = others;
    if (others.length && !S.vsFriend && (!S.race || !S.race.startAt || finished())) {
      S.vsFriend = true;
    }
    if (iAmHost()) hostCompile();
  }

  function ingestRace(list) {
    var rec = null;
    (list || []).forEach(function (r) {
      if (r && r.id === 'race') rec = r;
    });
    if (!rec) return;
    var prevSeq = S.race && S.race.seq;
    S.race = rec;
    if (rec.seq !== prevSeq) {
      resetMine();
      S.vsFriend = !!(rec.seats && rec.seats.length > 1 &&
        rec.seats.indexOf(CPU_ID) < 0 && rec.seats.indexOf(GHOST_ID) < 0);
      putMine(true);
    }
  }

  function hostCompile() {
    if (!iAmHost() || !S.race || !S.race.startAt) return;
    var lanes = visibleLanes();
    var next = T.compile(S.race, S.me.id, lanes);
    if (next === S.race) return;
    var a = JSON.stringify({
      fs: S.race.falseStarts, fo: S.race.finishOrder, ph: S.race.phase
    });
    var b = JSON.stringify({
      fs: next.falseStarts, fo: next.finishOrder, ph: next.phase
    });
    if (a === b) return;
    putRace(next);
  }

  function visibleLanes() {
    var ids = seatedIds();
    var t = now();
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (id === S.me.id) {
        out.push(S.mine || T.freshLane(id, S.me.name));
        continue;
      }
      if (id === CPU_ID) {
        var cpu = T.freshLane(CPU_ID, 'Computer');
        if (S.race && S.race.startAt) cpu = T.cpuStep(cpu, S.race, t);
        out.push(cpu);
        continue;
      }
      if (id === GHOST_ID) {
        var g = T.freshLane(GHOST_ID, nameOf(GHOST_ID));
        if (S.race && S.race.startAt) {
          g.position = T.ghostAt(S.best && S.best.samples, S.race.startAt, t, T.SAMPLE_MS);
          if (g.position >= T.FINISH && S.best && S.best.timeMs) {
            g.finishedAt = S.race.startAt + S.best.timeMs;
            g.position = T.FINISH;
          }
        }
        out.push(g);
        continue;
      }
      var found = null;
      for (var j = 0; j < S.others.length; j++) {
        if (S.others[j].id === id) found = S.others[j];
      }
      out.push(found || T.freshLane(id, nameOf(id)));
    }
    return out;
  }

  function fmtMs(ms) {
    ms = Math.max(0, ms | 0);
    var s = (ms / 1000);
    return s.toFixed(2) + 's';
  }

  function recordHistory(lanes, t) {
    if (!S.race || !S.race.startAt) return;
    if (t < S.race.startAt - 200) return;
    if (S.photo) return;
    var pos = {};
    for (var i = 0; i < lanes.length; i++) pos[lanes[i].id] = lanes[i].position || 0;
    S.history.push({ t: t, pos: pos });
    var cut = t - T.PHOTO_MS - 80;
    while (S.history.length > 2 && S.history[0].t < cut) S.history.shift();
    if (S.mine && S.race.startAt && t >= S.race.startAt && !S.mine.finishedAt) {
      T.samplePush(S.samples, S.race.startAt, t, S.mine.position || 0, T.SAMPLE_MS);
    }
  }

  function maybePhoto(lanes, t) {
    if (S.photo) return;
    var first = 0;
    for (var i = 0; i < lanes.length; i++) {
      if (lanes[i].finishedAt && (!first || lanes[i].finishedAt < first)) first = lanes[i].finishedAt;
    }
    if (!first) return;
    if (t - first < 140) return;
    S.photo = { frames: S.history.slice(), i: 0, t0: t };
    maybeSaveBest();
  }

  function maybeSaveBest() {
    if (S.vsFriend) return;
    if (!S.mine || !S.mine.finishedAt || !S.race) return;
    var timeMs = S.mine.finishedAt - S.race.startAt;
    if (timeMs <= 0) return;
    if (S.best && S.best.timeMs && timeMs >= S.best.timeMs) return;
    S.best = { id: 'best', timeMs: timeMs, samples: S.samples.slice() };
    if (saveDb) saveDb.put(S.best).catch(function () {});
  }

  function setStatus(text, cls) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function statusLine(lanes) {
    if (!S.race || !S.race.startAt) {
      if (S.vsFriend && liveOthers().length) {
        return iAmHost()
          ? 'A friend is in the next lane. Start when you are ready.'
          : 'Waiting for the host to start.';
      }
      if (S.vsFriend) return 'Press Invite in the bar above the app.';
      return S.mode === 'ghost'
        ? (S.best ? 'Mash to race your best.' : 'Mash to set a time.')
        : 'Mash to race the computer.';
    }
    var t = now();
    var left = S.race.startAt - t;
    if (left > 0) {
      var n = Math.ceil(left / 1000);
      if (S.mine && S.mine.falseStart) return 'FALSE START — you go back.';
      return String(n);
    }
    var order = (S.race.finishOrder && S.race.finishOrder.length)
      ? S.race.finishOrder
      : T.finishOrder(lanes);
    if (order.length) {
      var w = order[0];
      if (w === S.me.id) return 'You win.';
      return nameOf(w) + ' wins.';
    }
    if (S.mine && S.mine.falseStart && t < S.race.startAt + T.STALL_MS) {
      return 'FALSE START — stalled.';
    }
    return 'MASH';
  }

  function paintFrom(lanes, overlayPos) {
    var canvas = $('track');
    var cssW = canvas.clientWidth || 720;
    var cssH = canvas.clientHeight || 360;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, cssW, cssH);

    var n = Math.max(1, lanes.length);
    var pad = 10;
    var left = 86, right = cssW - 36;
    var top = 10, bot = cssH - 10;
    var laneH = (bot - top) / n;

    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(left, top + 4);
    ctx.lineTo(left, bot - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    var tapeX = right - 8;
    var broken = false;
    for (var i = 0; i < lanes.length; i++) {
      if ((overlayPos ? overlayPos[lanes[i].id] : lanes[i].position) >= T.FINISH) broken = true;
    }
    ctx.fillStyle = '#3a3228';
    ctx.fillRect(tapeX - 4, top, 8, 10);
    ctx.fillRect(tapeX - 4, bot - 10, 8, 10);
    if (!broken) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(tapeX, top + 10);
      ctx.lineTo(tapeX, bot - 10);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(255,224,102,.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.moveTo(tapeX, top + 10);
      ctx.lineTo(tapeX, bot - 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (i = 0; i < n; i++) {
      var y0 = top + i * laneH;
      var mid = y0 + laneH / 2;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.015)';
      ctx.fillRect(pad, y0, cssW - pad * 2, laneH);
      var lane = lanes[i];
      var col = colorOf(lane.id, i);
      var raw = overlayPos && overlayPos[lane.id] != null ? overlayPos[lane.id] : (lane.position || 0);
      var shown = overlayPos ? raw : lerpShown(lane.id, raw, !!(lane.falseStart && raw === 0));
      var p = Math.max(0, Math.min(1, shown / T.FINISH));
      var x = left + p * (tapeX - left - 18);
      ctx.fillStyle = col.body;
      ctx.font = 'bold 12px system-ui,sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(clipName(nameOf(lane.id)), 12, mid - 8);
      if (lane.falseStart || (S.race && S.race.falseStarts && S.race.falseStarts[lane.id])) {
        ctx.fillStyle = '#ff7a6b';
        ctx.font = 'bold 9px system-ui,sans-serif';
        ctx.fillText('FALSE START', 12, mid + 8);
      }
      var phase = (shown / 6) % 1;
      drawSticker(ctx, x, mid, Math.min(28, laneH * 0.42), col, phase);
    }

    if (S.photo) {
      ctx.fillStyle = 'rgba(10,10,15,.28)';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#ffe066';
      ctx.font = 'bold 13px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PHOTO FINISH', cssW / 2, 18);
      ctx.textAlign = 'left';
    } else if (S.race && S.race.startAt) {
      var leftMs = S.race.startAt - now();
      if (leftMs > 0) {
        var num = String(Math.max(1, Math.ceil(leftMs / 1000)));
        ctx.fillStyle = 'rgba(10,10,15,.35)';
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 72px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num, cssW / 2, cssH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      } else if (leftMs > -380) {
        ctx.fillStyle = '#ffe066';
        ctx.font = 'bold 64px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GO', cssW / 2, cssH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  function lerpShown(id, target, snap) {
    if (snap) { S.shown[id] = target; return target; }
    var cur = S.shown[id];
    if (cur == null) { S.shown[id] = target; return target; }
    S.shown[id] = cur + (target - cur) * 0.38;
    return S.shown[id];
  }

  function clipName(s) {
    s = String(s || '');
    return s.length > 10 ? s.slice(0, 9) + '…' : s;
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSticker(ctx, x, y, size, color, phase) {
    var run = Math.sin(phase * Math.PI * 2);
    var leg = run * size * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.62, size * 0.42, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color.ink;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, size * 0.22);
    ctx.lineTo(-size * 0.2 - leg, size * 0.55);
    ctx.moveTo(size * 0.12, size * 0.22);
    ctx.lineTo(size * 0.2 + leg, size * 0.55);
    ctx.stroke();
    ctx.fillStyle = color.body;
    ctx.strokeStyle = color.ink;
    ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    roundRect(ctx, -size * 0.28, -size * 0.22, size * 0.56, size * 0.5, size * 0.22);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -size * 0.42, size * 0.3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-size * 0.1, -size * 0.46, size * 0.08, 0, Math.PI * 2);
    ctx.arc(size * 0.1, -size * 0.46, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color.ink;
    ctx.beginPath();
    ctx.arc(-size * 0.08, -size * 0.45, size * 0.035, 0, Math.PI * 2);
    ctx.arc(size * 0.12, -size * 0.45, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color.ink;
    ctx.lineWidth = size * 0.045;
    ctx.beginPath();
    ctx.arc(0, -size * 0.38, size * 0.11, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function photoPos(t) {
    var frames = S.photo && S.photo.frames;
    if (!frames || !frames.length) return null;
    var t0 = frames[0].t, t1 = frames[frames.length - 1].t;
    var span = Math.max(80, t1 - t0);
    var u = (t - S.photo.t0) % (span + 120);
    if (u > span) u = span;
    var at = t0 + u;
    var a = frames[0], b = frames[frames.length - 1];
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].t <= at) a = frames[i];
      if (frames[i].t >= at) { b = frames[i]; break; }
    }
    var f = (b.t === a.t) ? 0 : (at - a.t) / (b.t - a.t);
    var pos = {}, id;
    var keys = {};
    for (id in a.pos) keys[id] = 1;
    for (id in b.pos) keys[id] = 1;
    for (id in keys) {
      var pa = a.pos[id] || 0, pb = b.pos[id] || 0;
      pos[id] = pa + (pb - pa) * f;
    }
    return pos;
  }

  function tick() {
    var t = now();
    var lanes = visibleLanes();
    if (S.mine) {
      for (var i = 0; i < lanes.length; i++) {
        if (lanes[i].id === S.me.id) lanes[i] = S.mine;
      }
    }
    recordHistory(lanes, t);
    maybePhoto(lanes, t);
    if (iAmHost()) hostCompile();

    var overlay = S.photo ? photoPos(t) : null;
    paintFrom(lanes, overlay);

    var msg = statusLine(lanes);
    var cls = '';
    if (/FALSE/.test(msg)) cls = 'warn';
    else if (/win/i.test(msg)) cls = 'good';
    setStatus(msg, cls);

    var racingNow = racing();
    var done = !!(S.photo || finished());
    var hostControls = !S.vsFriend || iAmHost();
    $('startBtn').hidden = racingNow || !hostControls;
    $('againBtn').hidden = !done || !hostControls;
    var seated = seatedIds();
    var mySeat = seated.indexOf(S.me.id) >= 0;
    $('mash').disabled = !mySeat;
    $('mashHint').textContent = mySeat ? 'tap or space' : 'watching';

    var ghostSolo = !S.vsFriend;
    $('modeSeg').hidden = !ghostSolo;
    requestAnimationFrame(tick);
  }

  function probeHost() {
    if (!raceDb) { S.host = true; return Promise.resolve(true); }
    return raceDb.put({ id: 'host-probe', by: S.me.id, t: now() }).then(function () {
      S.host = true;
      return raceDb.delete('host-probe').catch(function () {});
    }).then(function () { return true; }).catch(function () {
      S.host = false;
      return false;
    });
  }

  function detectHost() {
    if (api && api.info) {
      return api.info().then(function (i) {
        if (i && typeof i.owner === 'boolean') { S.host = !!i.owner; return S.host; }
        return probeHost();
      }).catch(function () { return probeHost(); });
    }
    return probeHost();
  }

  function bind() {
    var mash = $('mash');
    function down(ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      mash.classList.add('down');
      doTap();
    }
    function up() { mash.classList.remove('down'); }
    mash.addEventListener('pointerdown', down);
    mash.addEventListener('pointerup', up);
    mash.addEventListener('pointercancel', up);
    mash.addEventListener('pointerleave', up);
    window.addEventListener('keydown', function (ev) {
      if (ev.repeat) return;
      if (ev.code !== 'Space' && ev.key !== ' ') return;
      if (!$('modal-info').hidden) return;
      ev.preventDefault();
      mash.classList.add('down');
      doTap();
    });
    window.addEventListener('keyup', function (ev) {
      if (ev.code === 'Space' || ev.key === ' ') mash.classList.remove('down');
    });

    $('startBtn').addEventListener('click', function () { hostStart(); });
    $('againBtn').addEventListener('click', function () { hostStart(); });

    $('modeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (S.vsFriend) return;
      Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
      b.classList.add('on');
      S.mode = b.getAttribute('data-mode');
      if (saveDb) saveDb.put({ id: 'prefs', vs: S.mode }).catch(function () {});
    });

    $('infoBtn').addEventListener('click', function () { $('modal-info').hidden = false; });
    $('modal-info').addEventListener('click', function (ev) {
      if (ev.target === $('modal-info')) $('modal-info').hidden = true;
    });
    $('modal-info').querySelector('[data-close]').addEventListener('click', function () {
      $('modal-info').hidden = true;
    });

    if (api && api.onBack) {
      api.onBack(function () {
        if (!$('modal-info').hidden) { $('modal-info').hidden = true; return true; }
        return false;
      });
    }
  }

  function boot() {
    bind();
    resetMine();
    var who = api && api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    who.then(function (id) {
      S.me.id = (id && id.id) || 'local';
      S.me.name = (id && id.name) || 'You';
      resetMine();
      var prefs = saveDb ? saveDb.getAll() : Promise.resolve([]);
      return prefs.then(function (rows) {
        (rows || []).forEach(function (r) {
          if (r && r.id === 'best') S.best = r;
          if (r && r.id === 'prefs' && (r.vs === 'ghost' || r.vs === 'cpu')) {
            S.mode = r.vs;
            Array.prototype.forEach.call($('modeSeg').children, function (c) {
              c.classList.toggle('on', c.getAttribute('data-mode') === S.mode);
            });
          }
        });
        return detectHost();
      });
    }).then(function () {
      if (lanesDb) lanesDb.subscribe(function (list) { ingestLanes(list || []); });
      if (raceDb) raceDb.subscribe(function (list) { ingestRace(list || []); });
      putMine(true);
      if (S.hb) clearInterval(S.hb);
      S.hb = setInterval(function () { putMine(true); }, HB_MS);
      requestAnimationFrame(tick);
    }).catch(function () {
      requestAnimationFrame(tick);
    });
  }

  if (typeof document !== 'undefined') boot();
})();
