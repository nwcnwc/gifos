// Bingo — host calls numbers. Cards on each device. Invite is the room.
// The Node / Mongo hall is gone. Each player writes ONLY their own row.
// Invite is OS chrome.
(function () {
  'use strict';
  var BG = window.BG;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000, AUTO_MS = 5000;
  var view = 'home';
  var lastStamp = null;
  var lastCallShown = null;
  var cardDb = null, roomDb = null;
  try {
    if (window.gifos) {
      cardDb = gifos.db('card');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    view = id;
    ['home', 'lobby', 'play'].forEach(function (k) {
      $(k).hidden = k !== id;
    });
    document.body.classList.toggle('play-on', id === 'play');
    if (id !== 'play') {
      document.body.classList.remove('solo', 'caller', 'player', 'waiting', 'cover');
    }
  }
  function patternName(p) {
    if (!p) return 'a line';
    if (p.kind === 'row') return 'a row';
    if (p.kind === 'col') return 'a column';
    if (p.kind === 'diag') return 'a diagonal';
    if (p.kind === 'corners') return 'the four corners';
    return 'a line';
  }
  function speakCall(n) {
    if (!window.speechSynthesis) return;
    try {
      var u = new SpeechSynthesisUtterance(BG.letter(n) + ', ' + n);
      u.rate = 0.92;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  // Every device speaks each call as it arrives — the caller's phone in
  // doCall, everyone else's when the adopted call list grows (mpRefresh).
  // -1 = no round adopted yet; adoption snaps it to the backlog length so a
  // late joiner never gets thirty numbers recited at them.
  var spokenN = -1;

  // Fireworks on EVERY screen when a verified bingo lands. Pure canvas,
  // removes itself when the last spark dies.
  function celebrate() {
    var cv = document.createElement('canvas');
    cv.className = 'fireworks';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) { document.body.removeChild(cv); return; }
    var W = cv.width = window.innerWidth;
    var H = cv.height = window.innerHeight;
    var COLORS = ['#ff5a62', '#ffd24a', '#6dce7a', '#5aa0ff', '#ff9a3a', '#f4ece0'];
    var parts = [], bursts = 6, next = 0, t0 = nowMs();
    function burst(x, y) {
      var i, a, v;
      for (i = 0; i < 46; i++) {
        a = Math.random() * Math.PI * 2;
        v = 2 + Math.random() * 4.2;
        parts.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2,
          life: 60 + Math.random() * 30,
          c: COLORS[(Math.random() * COLORS.length) | 0]
        });
      }
    }
    function tick() {
      var t = nowMs() - t0, i, p;
      if (next < bursts && t > next * 380) {
        burst(W * (0.15 + Math.random() * 0.7), H * (0.12 + Math.random() * 0.45));
        next++;
      }
      ctx.clearRect(0, 0, W, H);
      for (i = parts.length - 1; i >= 0; i--) {
        p = parts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.055; p.vx *= 0.985; p.life--;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life / 30);
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;
      if (next < bursts || parts.length) requestAnimationFrame(tick);
      else if (cv.parentNode) cv.parentNode.removeChild(cv);
    }
    requestAnimationFrame(tick);
  }
  var cheered = null; // seed:winnerId of the bingo already celebrated

  // ---- local (this device) ----
  var localPlay = null;
  var autoTimer = 0;

  function freshSeed() {
    return nowMs().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  }
  function emptyMarks() {
    var m = {};
    m[BG.key(2, 2)] = true;
    return m;
  }
  function startLocal() {
    var seed = freshSeed();
    localPlay = {
      seed: seed,
      bag: BG.bag(seed),
      card: BG.card(seed, 'local'),
      called: [],
      marked: emptyMarks(),
      auto: false,
      ended: false,
      bingo: null
    };
    mp.on = false;
    lastStamp = null;
    lastCallShown = null;
    stopAuto();
    openPlay();
  }
  $('soloBtn').onclick = startLocal;

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
  }
  function startAuto() {
    stopAuto();
    autoTimer = setInterval(function () {
      if (view !== 'play') return;
      doCall();
    }, AUTO_MS);
  }

  function doCall() {
    var n = null;
    if (localPlay) {
      if (localPlay.ended) return;
      if (localPlay.called.length >= localPlay.bag.length) {
        localPlay.ended = true;
        renderPlay();
        return;
      }
      n = localPlay.bag[localPlay.called.length];
      localPlay.called = localPlay.called.concat([n]);
      speakCall(n);
      renderPlay();
      return;
    }
    if (!mp.on || !mp.adopted) return;
    var people = livePeople(_items);
    if (!isHost(people)) return;
    if (mp.adopted.phase === 'ended') return;
    var b = BG.bag(mp.adopted.seed);
    var called = (mp.adopted.called || []).slice();
    if (called.length >= b.length) {
      putMe({ phase: 'ended' });
      return;
    }
    n = b[called.length];
    called.push(n);
    speakCall(n);
    spokenN = called.length; // the refresh echo of my own put must not re-speak
    putMe({ called: called, phase: 'play' });
  }

  $('callBtn').onclick = function () { doCall(); };
  $('callBall').onclick = function () {
    if ($('callBtn').hidden || $('callBtn').disabled) return;
    doCall();
  };
  $('autoBtn').onclick = function () {
    if (localPlay) {
      if (localPlay.ended) return;
      localPlay.auto = !localPlay.auto;
      if (localPlay.auto) startAuto(); else stopAuto();
      renderPlay();
      return;
    }
    if (!mp.on || !mp.adopted) return;
    var people = livePeople(_items);
    if (!isHost(people)) return;
    if (mp.adopted.phase === 'ended') return;
    mp.auto = !mp.auto;
    if (mp.auto) startAuto(); else stopAuto();
    renderPlay();
  };

  $('bingoBtn').onclick = function () {
    shoutBingo();
  };

  $('bingoCard').addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== this) {
      if (el.getAttribute && el.getAttribute('data-c') != null) break;
      el = el.parentNode;
    }
    if (!el || el === this) return;
    var c = parseInt(el.getAttribute('data-c'), 10);
    var r = parseInt(el.getAttribute('data-r'), 10);
    if (isNaN(c) || isNaN(r)) return;
    daub(c, r);
  });

  function currentCard() {
    if (localPlay) return localPlay.card;
    if (mp.on && mp.adopted) return BG.card(mp.adopted.seed, mp.id);
    return null;
  }
  function currentCalled() {
    if (localPlay) return localPlay.called;
    if (mp.on && mp.adopted) return mp.adopted.called || [];
    return [];
  }
  function currentMarked() {
    if (localPlay) return localPlay.marked;
    return mp.marked;
  }
  function currentEnded() {
    if (localPlay) return !!localPlay.ended;
    return !!(mp.adopted && mp.adopted.phase === 'ended');
  }

  // No hints, no guard rails: any number daubs, called or not — mishearing
  // is part of bingo. The claim check is where a wrong daub catches up.
  function daub(c, r) {
    if (currentEnded()) return;
    var grid = currentCard();
    if (!grid) return;
    var n = grid[c][r];
    var k = BG.key(c, r);
    if (n === 0) return;
    if (localPlay) {
      if (localPlay.marked[k]) {
        delete localPlay.marked[k];
        lastStamp = null;
      } else {
        localPlay.marked[k] = true;
        lastStamp = k;
      }
      renderPlay();
      return;
    }
    if (!mp.on) return;
    if (mp.marked[k]) {
      delete mp.marked[k];
      lastStamp = null;
    } else {
      mp.marked[k] = true;
      lastStamp = k;
    }
    putCard();
    renderPlay();
  }

  function shoutBingo() {
    if (currentEnded()) return;
    var grid = currentCard();
    var marked = currentMarked();
    var called = currentCalled();
    if (!BG.hasWin(grid, marked)) {
      $('playStatus').textContent = 'Daub a full line first.';
      $('playStatus').className = 'statusline warn';
      return;
    }
    var win = BG.validClaim(grid, marked, called);
    if (!win) {
      $('playStatus').textContent = 'Not bingo — that line holds a number that was never called.';
      $('playStatus').className = 'statusline warn';
      return;
    }
    if (localPlay) {
      localPlay.ended = true;
      localPlay.bingo = { id: 'local', name: 'You', pattern: win };
      stopAuto();
      renderPlay();
      return;
    }
    if (!mp.on || !mp.id) return;
    putMe({
      bingo: true,
      pattern: win.kind,
      marked: BG.markedList(marked)
    });
  }

  function putCard() {
    if (!cardDb || !mp.on) return;
    cardDb.put({
      id: 'me',
      round: (mp.adopted && mp.adopted.round) || 0,
      marked: BG.markedList(mp.marked)
    }).catch(function () {});
  }

  // ---- multiplayer ----
  var mp = {
    on: false, id: null, name: 'You', row: null, people: [], hb: 0, sub: false,
    adopted: null, marked: emptyMarks(), auto: false
  };
  var _items = [];

  function livePeople(items, t) {
    t = t || nowMs();
    var out = [], i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it || !it.id) continue;
      if (it.at && t - it.at >= PRES_TTL) continue;
      out.push(it);
    }
    return out;
  }
  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 1; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function adoptedRound(people) {
    var maxR = 0, i, p, cand = [];
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (p.seed && (p.round || 0) > maxR) maxR = p.round || 0;
    }
    if (!maxR) return null;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if ((p.round || 0) === maxR && p.seed) cand.push(p);
    }
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var src = {
      id: cand[0].id,
      round: cand[0].round,
      seed: cand[0].seed,
      called: (cand[0].called || []).slice(),
      phase: cand[0].phase || 'play'
    };
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if ((p.round || 0) !== maxR) continue;
      if ((p.called || []).length > src.called.length) src.called = p.called.slice();
      if (p.phase === 'ended') src.phase = 'ended';
    }
    return src;
  }
  function verifiedWinner(people, ad) {
    if (!ad || !ad.seed) return null;
    var i, p, grid, win, marked;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if ((p.round || 0) !== ad.round) continue;
      if (!p.bingo) continue;
      grid = BG.card(ad.seed, p.id);
      marked = p.marked || emptyMarks();
      win = BG.validClaim(grid, marked, ad.called || []);
      if (win) return { id: p.id, name: p.name || 'Player', pattern: win };
    }
    return null;
  }

  function putMe(extra) {
    if (!roomDb || !mp.id) return;
    var row = {
      id: mp.id,
      name: mp.name,
      at: nowMs(),
      ready: true,
      bingo: false,
      pattern: null,
      marked: null
    };
    if (mp.row) {
      ['round', 'seed', 'called', 'phase', 'bingo', 'pattern', 'marked'].forEach(function (k) {
        if (mp.row[k] !== undefined) row[k] = mp.row[k];
      });
    }
    if (extra) {
      Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    }
    mp.row = row;
    roomDb.put(row).catch(function () {});
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!roomDb) {
      $('lobbyStatus').textContent = 'Play with friends needs a GifOS room.';
      show('lobby');
      setChip('', 'No room');
      return;
    }
    (window.gifos && gifos.me ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = (me && me.id) || 'local';
      mp.name = (me && me.name) || 'You';
      mp.on = true;
      mp.row = null;
      mp.adopted = null;
      mp.marked = emptyMarks();
      mp.auto = false;
      localPlay = null;
      lastStamp = null;
      spokenN = -1;
      stopAuto();
      show('lobby');
      setChip('ready', 'A room');
      if (!mp.sub) {
        mp.sub = true;
        roomDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe({ phase: 'lobby', round: 0, seed: null, called: [], bingo: false, pattern: null, marked: null });
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRefresh();
    }).catch(function () {});
  }
  function mpLeave() {
    mp.on = false;
    mp.auto = false;
    stopAuto();
    if (mp.hb) { clearInterval(mp.hb); mp.hb = 0; }
    if (roomDb && mp.id) roomDb.delete(mp.id).catch(function () {});
    show('home');
    setChip('', 'Ready');
  }
  $('lobbyLeave').onclick = mpLeave;
  $('playLeave').onclick = function () {
    stopAuto();
    if (mp.on) mpLeave();
    else { localPlay = null; show('home'); setChip('', 'Ready'); }
  };

  $('dealBtn').onclick = function () {
    if (!mp.on) return;
    var people = livePeople(_items);
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: nowMs() });
    }
    if (!isHost(people)) return;
    if (people.length < 2) return;
    var ad = adoptedRound(people);
    var round = ((ad && ad.round) || 0) + 1;
    var seed = freshSeed();
    mp.marked = emptyMarks();
    mp.auto = false;
    lastStamp = null;
    lastCallShown = null;
    stopAuto();
    putCard();
    putMe({
      round: round,
      seed: seed,
      called: [],
      phase: 'play',
      bingo: false,
      pattern: null,
      marked: null
    });
  };

  function mpRefresh() {
    if (!mp.on) return;
    var people = livePeople(_items);
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: nowMs() });
    }
    mp.people = people;
    var ad = adoptedRound(people);
    if (ad && (!mp.adopted || mp.adopted.round !== ad.round || mp.adopted.seed !== ad.seed)) {
      mp.marked = emptyMarks();
      mp.auto = false;
      lastStamp = null;
      lastCallShown = null;
      spokenN = (ad.called || []).length; // adopt the backlog silently
      stopAuto();
      if (!mp.row || mp.row.round !== ad.round || mp.row.seed !== ad.seed) {
        putMe({
          round: ad.round,
          seed: ad.seed,
          called: ad.called || [],
          phase: ad.phase || 'play',
          bingo: false,
          pattern: null,
          marked: null
        });
      }
      putCard();
    }
    if (ad && mp.row && ad.round === mp.row.round) {
      var extra = {};
      if ((ad.called || []).length > (mp.row.called || []).length) extra.called = ad.called;
      if (ad.phase && mp.row.phase !== ad.phase) extra.phase = ad.phase;
      if (extra.called || extra.phase) putMe(extra);
    }
    var winner = ad ? verifiedWinner(people, ad) : null;
    if (winner && ad && ad.phase !== 'ended') {
      if (mp.row && mp.row.phase !== 'ended' && mp.row.round === ad.round) {
        putMe({ phase: 'ended' });
      }
      ad.phase = 'ended';
      stopAuto();
    }
    // A call that arrived from the host's row gets spoken HERE too — the old
    // code only spoke inside doCall, so joiners' phones were silent.
    if (ad && spokenN >= 0 && (ad.called || []).length > spokenN) {
      if (ad.phase !== 'ended') speakCall(ad.called[ad.called.length - 1]);
      spokenN = ad.called.length;
    }
    mp.adopted = ad;
    if (ad && (ad.phase === 'play' || ad.phase === 'ended')) {
      if (view !== 'play') openPlay();
      else renderPlay();
    } else {
      renderLobby(people);
      if (view !== 'lobby' && view !== 'home') show('lobby');
    }
  }

  function renderLobby(people) {
    var html = '', i, p, host = isHost(people);
    people.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    for (i = 0; i < people.length; i++) {
      p = people[i];
      html += '<li class="' + (p.id === mp.id ? 'me' : '') + '"><span class="name">' +
        esc(p.id === mp.id ? 'You' : (p.name || 'Player')) + '</span>' +
        (host && p.id === mp.id ? '<span class="meta">calls</span>' : '') + '</li>';
    }
    $('lobbyList').innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    $('dealBtn').hidden = !host;
    $('dealBtn').disabled = people.length < 2;
    if (people.length < 2) {
      $('lobbyStatus').textContent = 'Waiting for friends… press Invite in the GifOS menu to send the link.';
    } else if (host) {
      $('lobbyStatus').textContent = people.length + ' here. Start calling when you are ready.';
    } else {
      $('lobbyStatus').textContent = people.length + ' here. Waiting for the host to call.';
    }
    setChip('ready', people.length + ' here');
  }

  function openPlay() {
    show('play');
    renderPlay();
  }

  function renderFlashboard(called, last) {
    var board = $('flashboard');
    var on = {}, i, c, n, html = '', cls;
    for (i = 0; i < called.length; i++) on[called[i] | 0] = 1;
    for (c = 0; c < 5; c++) {
      html += '<div class="fl-row"><span class="fl-l ' + BG.LETTERS[c].toLowerCase() + '">' +
        BG.LETTERS[c] + '</span>';
      for (n = BG.RANGES[c][0]; n <= BG.RANGES[c][1]; n++) {
        cls = 'fl-n';
        if (n === last) cls += ' last on';
        else if (on[n]) cls += ' on';
        html += '<span class="' + cls + '">' + n + '</span>';
      }
      html += '</div>';
    }
    board.innerHTML = html;
  }

  function renderPlay() {
    var grid = currentCard();
    var called = currentCalled();
    var marked = currentMarked();
    var ended = currentEnded();
    var host = true;
    var winner = null;
    var last = called.length ? called[called.length - 1] : null;
    var role = 'solo';

    if (localPlay) {
      $('playLeave').textContent = '←';
      $('playTitle').textContent = 'You call · you daub';
      winner = localPlay.bingo;
      host = true;
      role = 'solo';
    } else if (mp.on && mp.adopted) {
      $('playLeave').textContent = '←';
      host = isHost(mp.people);
      role = host ? 'caller' : 'player';
      $('playTitle').textContent = host
        ? ('You call · round ' + (mp.adopted.round || 1))
        : ('The host calls · you daub');
      winner = verifiedWinner(mp.people, mp.adopted);
    } else {
      return;
    }

    document.body.classList.toggle('solo', role === 'solo');
    document.body.classList.toggle('caller', role === 'caller');
    document.body.classList.toggle('player', role === 'player');
    document.body.classList.toggle('waiting', !last && !ended);

    var ball = $('callBall');
    if (last) {
      $('callLetter').textContent = BG.letter(last);
      $('callNum').textContent = String(last);
      ball.className = 'call-ball ' + BG.letter(last).toLowerCase() + (last !== lastCallShown ? ' fresh' : '');
      lastCallShown = last;
      $('callHint').textContent = BG.callName(last) + ' · ' + called.length + ' of 75';
    } else {
      $('callLetter').textContent = '';
      $('callNum').textContent = host ? 'CALL' : '…';
      ball.className = 'call-ball empty';
      lastCallShown = null;
      $('callHint').textContent = host ? 'Tap the ball to draw.' : 'Waiting for the host.';
    }

    var strip = '', i, n, from;
    from = Math.max(0, called.length - 8);
    for (i = from; i < called.length; i++) {
      n = called[i];
      strip += '<span class="' + (i === called.length - 1 ? 'last' : '') + '">' +
        esc(BG.callName(n)) + '</span>';
    }
    $('calledStrip').innerHTML = strip;

    var html = '', c, r, cell, k, cls, label;
    for (c = 0; c < 5; c++) {
      html += '<div class="ch ' + BG.LETTERS[c].toLowerCase() + '">' + BG.LETTERS[c] + '</div>';
    }
    for (r = 0; r < 5; r++) {
      for (c = 0; c < 5; c++) {
        cell = grid[c][r];
        k = BG.key(c, r);
        cls = 'cell';
        // Deliberately NO called-number highlight: spotting your own numbers
        // is the game. The card only ever shows what YOU daubed.
        if (cell === 0) { cls += ' free daubed'; label = 'FREE'; }
        else {
          label = String(cell);
          if (marked[k]) {
            cls += ' daubed';
            if (lastStamp === k) cls += ' just';
          }
        }
        html += '<button type="button" class="' + cls + '" data-c="' + c + '" data-r="' + r + '"' +
          (cell === 0 || ended ? ' disabled' : '') + '><span class="n">' + label + '</span></button>';
      }
    }
    $('bingoCard').innerHTML = html;
    $('bingoCard').className = 'bingo-card' + (winner ? ' won' : '');

    renderFlashboard(called, last);
    $('flashboard').hidden = false;

    // The button wakes only once YOU have daubed a full pattern — nothing
    // announces it, and the claim is still checked against the real calls.
    $('bingoBtn').disabled = ended || !BG.hasWin(grid, marked);
    $('callBtn').hidden = !host;
    $('callBtn').disabled = ended || called.length >= 75;
    $('callBall').disabled = !host || ended || called.length >= 75;
    $('autoBtn').hidden = !host;
    $('autoBtn').disabled = ended;
    var autoOn = localPlay ? localPlay.auto : mp.auto;
    $('autoBtn').className = 'ghost tiny auto' + (autoOn ? ' on' : '');
    $('autoBtn').textContent = autoOn ? 'Stop' : 'Auto';

    var peopleHtml = '';
    if (mp.on && mp.people) {
      var people = mp.people.slice();
      people.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
      for (i = 0; i < people.length; i++) {
        var p = people[i];
        var tag = (host && p.id === mp.id) ? 'calls' : '';
        if (winner && winner.id === p.id) tag = 'bingo';
        peopleHtml += '<li class="' + (p.id === mp.id ? 'me' : '') +
          (winner && winner.id === p.id ? ' win' : '') +
          '"><span class="name">' + esc(p.id === mp.id ? 'You' : (p.name || 'Player')) +
          '</span>' + (tag ? '<span class="meta">' + tag + '</span>' : '') + '</li>';
      }
    }
    $('peopleList').innerHTML = peopleHtml;

    var status = $('playStatus');
    var rev = $('reveal');
    if (ended && winner) {
      var ckey = (localPlay ? localPlay.seed : (mp.adopted && mp.adopted.seed)) + ':' + winner.id;
      if (cheered !== ckey) { cheered = ckey; celebrate(); }
      status.className = 'statusline good';
      status.textContent = (winner.id === (localPlay ? 'local' : mp.id) ? 'You' : (winner.name || 'They')) +
        ' — bingo on ' + patternName(winner.pattern) + '.';
      rev.hidden = false;
      rev.innerHTML = '<h3 class="win">Bingo!</h3><p>' +
        esc(winner.id === (localPlay ? 'local' : mp.id) ? 'You have' : ((winner.name || 'They') + ' has')) +
        ' ' + patternName(winner.pattern) + '.</p>';
      setChip('win', 'Bingo');
    } else if (ended) {
      status.className = 'statusline';
      status.textContent = called.length >= 75 ? 'The bag is empty.' : 'Round over.';
      rev.hidden = true;
      setChip('ready', 'Round over');
    } else {
      // No coaching while the round runs: nothing says whether a call is on
      // your card, and nothing announces that you have a line. Pay attention.
      status.className = 'statusline';
      status.textContent = last
        ? ''
        : (host ? 'You call. Everyone finds their own numbers.' : 'The host calls. Find each number yourself.');
      rev.hidden = true;
      setChip('play', called.length ? BG.callName(last) : 'Calling');
    }
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (view === 'play') {
        stopAuto();
        if (mp.on) { show('lobby'); mpRefresh(); }
        else { localPlay = null; show('home'); setChip('', 'Ready'); }
        return true;
      }
      if (view === 'lobby') {
        if (mp.on) mpLeave();
        else { show('home'); setChip('', 'Ready'); }
        return true;
      }
      return false;
    });
  }

  window.Bingo = {
    coverShot: function () {
      var seed = 'cover-shot';
      var bag = BG.bag(seed);
      var card = BG.card(seed, 'local');
      var called = bag.slice(0, 18);
      var marked = emptyMarks();
      var hits = [], c, r, n, k;
      for (c = 0; c < 5; c++) for (r = 0; r < 5; r++) {
        n = card[c][r];
        k = BG.key(c, r);
        if (n && BG.inCall(called, n)) hits.push(k);
      }
      for (c = 2; c < hits.length; c++) marked[hits[c]] = true;
      localPlay = {
        seed: seed, bag: bag, card: card, called: called,
        marked: marked, auto: false, ended: false, bingo: null
      };
      mp.on = false;
      lastStamp = hits[hits.length - 1] || null;
      lastCallShown = null;
      stopAuto();
      document.body.classList.add('cover');
      openPlay();
    }
  };

  setChip('', 'Ready');
})();
