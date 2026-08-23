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
    vsFriend: false,
    ignoreUntil: 0,
    hitT: 0
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
    S.ignoreUntil = now() + 420;
    putRace(race);
    putMine(true);
  }

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  function punchPad() {
    var mash = $('mash');
    mash.classList.add('hit', 'down');
    if (S.hitT) clearTimeout(S.hitT);
    S.hitT = setTimeout(function () { mash.classList.remove('hit'); }, 70);
  }

  function photoReady() {
    return !!(S.photo && now() - S.photo.t0 >= T.PHOTO_MS * 1.6);
  }

  function doTap() {
    punchPad();
    if (S.ignoreUntil && now() < S.ignoreUntil) return;
    if (S.photo) {
      if (!photoReady()) return;
      if (iAmHost()) hostStart();
      return;
    }
    if (!S.race || !S.race.startAt) {
      if (iAmHost()) hostStart();
      return;
    }
    if (S.mine && S.mine.finishedAt) return;
    if ((S.race.finishOrder || []).length) return;
    if (!S.mine) resetMine();
    var before = S.mine.position;
    var wasFs = S.mine.falseStart;
    S.mine = T.tap(S.mine, S.race, now());
    if (S.mine.falseStart && !wasFs) {
      S.shown[S.me.id] = 26;
      buzz(40);
    } else if (!S.mine.falseStart) {
      buzz(8);
    }
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
          ? 'A friend is in the next lane. Mash when you are ready.'
          : 'Waiting for the host to start.';
      }
      if (S.vsFriend) return 'Press Invite in the bar above the app.';
      return S.mode === 'ghost'
        ? (S.best ? 'Mash to race your best · ' + fmtMs(S.best.timeMs) : 'Mash to set a time.')
        : 'Mash to race the computer.';
    }
    var t = now();
    var left = S.race.startAt - t;
    if (left > 0) {
      if (S.mine && S.mine.falseStart) return 'FALSE START — you go back.';
      return 'Wait for GO';
    }
    var order = (S.race.finishOrder && S.race.finishOrder.length)
      ? S.race.finishOrder
      : T.finishOrder(lanes);
    if (order.length) {
      var w = order[0];
      var winMs = 0;
      for (var i = 0; i < lanes.length; i++) {
        if (lanes[i].id === w && lanes[i].finishedAt) winMs = lanes[i].finishedAt - S.race.startAt;
      }
      var tbit = winMs > 0 ? ' · ' + fmtMs(winMs) : '';
      if (w === S.me.id) return 'You win' + tbit + '.';
      return nameOf(w) + ' wins' + tbit + '.';
    }
    if (S.mine && S.mine.falseStart && t < S.race.startAt + T.STALL_MS) {
      return 'FALSE START — wait.';
    }
    return 'MASH';
  }

  function mashFace(lanes) {
    var mash = $('mash');
    var label = $('mashLabel');
    var hint = $('mashHint');
    var t = now();
    mash.classList.remove('warn', 'go');
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var seated = seatedIds();
    var mySeat = seated.indexOf(S.me.id) >= 0;
    if (!mySeat) {
      label.textContent = 'WATCH';
      hint.textContent = 'watching';
      mash.disabled = true;
      return;
    }
    mash.disabled = false;
    if (!S.race || !S.race.startAt) {
      label.textContent = 'MASH';
      hint.textContent = coarse ? 'tap to start' : 'space or click';
      return;
    }
    var left = S.race.startAt - t;
    if (S.mine && S.mine.falseStart && (left > 0 || t < S.race.startAt + T.STALL_MS)) {
      mash.classList.add('warn');
      label.textContent = 'WAIT';
      hint.textContent = 'false start';
      return;
    }
    if (left > 0) {
      label.textContent = String(Math.max(1, Math.ceil(left / 1000)));
      hint.textContent = 'don\'t jump';
      return;
    }
    if (left > -420) {
      mash.classList.add('go');
      label.textContent = 'GO';
      hint.textContent = coarse ? 'mash' : 'mash · space';
      return;
    }
    if (S.photo) {
      if (!photoReady()) {
        label.textContent = 'LOOK';
        hint.textContent = 'photo finish';
        return;
      }
      label.textContent = iAmHost() ? 'AGAIN' : 'DONE';
      hint.textContent = iAmHost() ? (coarse ? 'tap for another' : 'space for another') : '';
      return;
    }
    if (finished()) {
      label.textContent = iAmHost() ? 'AGAIN' : 'DONE';
      hint.textContent = '';
      return;
    }
    label.textContent = 'MASH';
    hint.textContent = coarse ? 'tap' : 'space or click';
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

    var n = Math.max(1, lanes.length);
    var pad = 8;
    var left = Math.max(88, Math.min(110, cssW * 0.22));
    var top = 8, bot = cssH - 8;
    var laneH = (bot - top) / n;
    var tapeX = cssW - 28;
    var tNow = now();
    var racingNow = !!(S.race && S.race.startAt && tNow >= S.race.startAt);
    var cdLeft = S.race && S.race.startAt ? S.race.startAt - tNow : 0;

    ctx.fillStyle = '#12121c';
    ctx.fillRect(0, 0, cssW, cssH);

    var broken = false;
    var i, lane, y0, mid, col, raw, shown, p, x, phase;
    for (i = 0; i < lanes.length; i++) {
      if (lanes[i].finishedAt) broken = true;
      if ((overlayPos ? overlayPos[lanes[i].id] : lanes[i].position) >= T.FINISH) broken = true;
    }

    for (i = 0; i < n; i++) {
      y0 = top + i * laneH;
      ctx.fillStyle = i % 2 ? '#161622' : '#101018';
      ctx.fillRect(pad, y0, cssW - pad * 2, laneH);
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(left, y0 + laneH - 0.5);
      ctx.lineTo(tapeX, y0 + laneH - 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#ece8df';
    ctx.fillRect(left - 3, top + 2, 4, bot - top - 4);
    for (i = 0; i < n; i++) {
      y0 = top + i * laneH;
      mid = y0 + laneH / 2;
      ctx.fillStyle = i % 2 ? '#1a1a14' : '#f4f1ea';
      ctx.fillRect(left - 14, mid - laneH * 0.18, 12, laneH * 0.36);
      ctx.fillStyle = i % 2 ? '#f4f1ea' : '#1a1a14';
      ctx.fillRect(left - 14, mid - laneH * 0.18, 6, laneH * 0.18);
      ctx.fillRect(left - 8, mid, 6, laneH * 0.18);
    }

    ctx.fillStyle = '#3a3228';
    ctx.fillRect(tapeX - 5, top, 10, 12);
    ctx.fillRect(tapeX - 5, bot - 12, 10, 12);
    drawTape(ctx, tapeX, top + 12, bot - 12, broken, tNow);

    var winner = null;
    if (S.race && (S.race.finishOrder || []).length) winner = S.race.finishOrder[0];
    else winner = T.winnerOf(lanes);

    for (i = 0; i < n; i++) {
      y0 = top + i * laneH;
      mid = y0 + laneH / 2;
      lane = lanes[i];
      col = colorOf(lane.id, i);
      raw = overlayPos && overlayPos[lane.id] != null ? overlayPos[lane.id] : (lane.position || 0);
      var fsNow = !!(lane.falseStart && raw < 1 && (!S.race || tNow < S.race.startAt + T.STALL_MS + 80));
      shown = overlayPos ? raw : lerpShown(lane.id, raw, fsNow);
      p = Math.max(0, Math.min(1.04, shown / T.FINISH));
      x = left + 14 + p * (tapeX - left - 36);
      var moving = racingNow && shown > 0.4 && shown < T.FINISH;
      phase = moving ? ((tNow / 85) + i * 0.2) % 1 : (cdLeft > 0 ? Math.sin(tNow / 180) * 0.08 : 0.15);
      var size = Math.min(34, laneH * 0.5);
      var ghost = lane.id === GHOST_ID;
      ctx.save();
      if (ghost) ctx.globalAlpha = 0.55;
      if (winner && lane.id === winner && (S.photo || finished())) {
        ctx.shadowColor = '#ffe066';
        ctx.shadowBlur = 16;
      }
      drawSticker(ctx, x, mid, size, col, phase, moving);
      ctx.restore();

      var jumped = !!(lane.falseStart || (S.race && S.race.falseStarts && S.race.falseStarts[lane.id]));
      var showFs = jumped && (!finished() || fsNow);
      var showTime = !!(lane.finishedAt && S.race && S.race.startAt &&
        (!overlayPos || (overlayPos[lane.id] != null && overlayPos[lane.id] >= T.FINISH * 0.98)));
      drawNameplate(ctx, 8, y0 + 6, laneH - 12, col, clipName(nameOf(lane.id)), showFs, showTime ? lane : null);
    }

    if (S.photo) {
      ctx.fillStyle = 'rgba(8,8,12,.16)';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, cssW, 24);
      ctx.fillRect(0, cssH - 16, cssW, 16);
      ctx.fillStyle = '#ffe066';
      var gap0 = cssW / 2 - 78, gap1 = cssW / 2 + 78;
      for (i = 8; i < cssW; i += 16) {
        if (i > gap0 && i < gap1) continue;
        ctx.beginPath();
        ctx.arc(i, 12, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(i, cssH - 8, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe066';
      ctx.font = 'bold 13px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PHOTO FINISH', cssW / 2, 12);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawTape(ctx, x, y0, y1, broken, t) {
    var y, row;
    if (!broken) {
      for (y = y0; y < y1; y += 7) {
        row = ((y / 7) | 0) % 2;
        ctx.fillStyle = row ? '#111018' : '#f4f1ea';
        ctx.fillRect(x - 6, y, 6, 7);
        ctx.fillStyle = row ? '#f4f1ea' : '#111018';
        ctx.fillRect(x, y, 6, 7);
      }
      return;
    }
    for (y = y0; y < y1; y += 7) {
      var flutter = Math.sin(y * 0.18 + t / 140) * 7;
      row = ((y / 7) | 0) % 2;
      ctx.fillStyle = row ? 'rgba(244,241,234,.7)' : 'rgba(255,224,102,.75)';
      ctx.fillRect(x - 4 + flutter, y, 5, 6);
      ctx.fillRect(x + 2 - flutter * 0.6, y + 1, 4, 5);
    }
  }

  function drawNameplate(ctx, x, y, h, col, name, showFs, lane) {
    var w = 76;
    var boxH = Math.min(h - 4, 40);
    var by = y + Math.max(0, (h - boxH) / 2);
    ctx.fillStyle = 'rgba(8,8,12,.62)';
    ctx.beginPath();
    roundRect(ctx, x, by, w, boxH, 8);
    ctx.fill();
    ctx.fillStyle = col.body;
    ctx.beginPath();
    ctx.arc(x + 10, by + boxH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f1ea';
    ctx.font = 'bold 12px system-ui,sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 18, by + boxH / 2 - (showFs || (lane && lane.finishedAt) ? 7 : 0));
    if (showFs) {
      ctx.fillStyle = '#ff7a6b';
      ctx.font = 'bold 9px system-ui,sans-serif';
      ctx.fillText('JUMPED', x + 18, by + boxH / 2 + 8);
    } else if (lane && lane.finishedAt && S.race && S.race.startAt) {
      ctx.fillStyle = '#c8c4b8';
      ctx.font = 'bold 10px system-ui,sans-serif';
      ctx.fillText(fmtMs(lane.finishedAt - S.race.startAt), x + 18, by + boxH / 2 + 8);
    }
  }

  function lerpShown(id, target, lurch) {
    if (lurch) {
      var cur = S.shown[id];
      if (cur == null || cur < 2) { S.shown[id] = 26; return 26; }
      S.shown[id] = cur + (0 - cur) * 0.2;
      return S.shown[id];
    }
    cur = S.shown[id];
    if (cur == null) { S.shown[id] = target; return target; }
    S.shown[id] = cur + (target - cur) * 0.42;
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

  function drawSticker(ctx, x, y, size, color, phase, moving) {
    var run = Math.sin(phase * Math.PI * 2);
    var leg = run * size * (moving ? 0.38 : 0.16);
    var arm = -run * size * (moving ? 0.32 : 0.1);
    var lean = moving ? 0.22 : 0.04;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.64, size * 0.46, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (moving) {
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-size * 0.7, -size * 0.1);
      ctx.lineTo(-size * 1.15, -size * 0.1);
      ctx.moveTo(-size * 0.65, size * 0.12);
      ctx.lineTo(-size * 0.95, size * 0.12);
      ctx.stroke();
    }
    ctx.strokeStyle = color.ink;
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, -size * 0.02);
    ctx.lineTo(-size * 0.38, -size * 0.18 + arm);
    ctx.moveTo(size * 0.18, -size * 0.02);
    ctx.lineTo(size * 0.42, -size * 0.1 - arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, size * 0.22);
    ctx.lineTo(-size * 0.22 - leg, size * 0.58);
    ctx.moveTo(size * 0.12, size * 0.22);
    ctx.lineTo(size * 0.22 + leg, size * 0.58);
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
    ctx.arc(-size * 0.06, -size * 0.45, size * 0.035, 0, Math.PI * 2);
    ctx.arc(size * 0.14, -size * 0.45, size * 0.035, 0, Math.PI * 2);
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
    var span = Math.max(120, t1 - t0);
    var hold = 180;
    var slow = span * 2.2;
    var cycle = slow + hold;
    var u = (t - S.photo.t0) % cycle;
    if (u > slow) u = slow;
    var at = t0 + (u / slow) * span;
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
    mashFace(lanes);

    $('startBtn').hidden = true;
    $('againBtn').hidden = true;
    $('bar').hidden = true;

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
