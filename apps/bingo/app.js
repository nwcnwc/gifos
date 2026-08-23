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
  }
  function patternName(p) {
    if (!p) return 'a line';
    if (p.kind === 'row') return 'a row';
    if (p.kind === 'col') return 'a column';
    if (p.kind === 'diag') return 'a diagonal';
    if (p.kind === 'corners') return 'the four corners';
    return 'a line';
  }

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
    if (localPlay) {
      if (localPlay.ended) return;
      if (localPlay.called.length >= localPlay.bag.length) {
        localPlay.ended = true;
        renderPlay();
        return;
      }
      localPlay.called = localPlay.called.concat([localPlay.bag[localPlay.called.length]]);
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
    called.push(b[called.length]);
    putMe({ called: called, phase: 'play' });
  }

  $('callBtn').onclick = function () { doCall(); };
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
    var td = e.target.closest ? e.target.closest('td') : null;
    if (!td) return;
    var c = parseInt(td.getAttribute('data-c'), 10);
    var r = parseInt(td.getAttribute('data-r'), 10);
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

  function daub(c, r) {
    if (currentEnded()) return;
    var grid = currentCard();
    if (!grid) return;
    var n = grid[c][r];
    var k = BG.key(c, r);
    if (n === 0) return;
    if (!BG.inCall(currentCalled(), n)) return;
    if (localPlay) {
      if (localPlay.marked[k]) return;
      localPlay.marked[k] = true;
      renderPlay();
      return;
    }
    if (!mp.on) return;
    if (mp.marked[k]) return;
    mp.marked[k] = true;
    putCard();
    renderPlay();
  }

  function shoutBingo() {
    if (currentEnded()) return;
    var grid = currentCard();
    var marked = currentMarked();
    var called = currentCalled();
    var win = BG.validClaim(grid, marked, called);
    if (!win) {
      $('playStatus').textContent = 'Not yet — mark a full line first.';
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

  var lastCallShown = null;
  function renderPlay() {
    var grid = currentCard();
    var called = currentCalled();
    var marked = currentMarked();
    var ended = currentEnded();
    var host = true;
    var winner = null;
    var last = called.length ? called[called.length - 1] : null;

    if (localPlay) {
      $('playLeave').textContent = '← Home';
      $('playTitle').textContent = 'On this device';
      winner = localPlay.bingo;
      host = true;
    } else if (mp.on && mp.adopted) {
      $('playLeave').textContent = '← Leave';
      $('playTitle').textContent = 'Round ' + (mp.adopted.round || 1);
      host = isHost(mp.people);
      winner = verifiedWinner(mp.people, mp.adopted);
    } else {
      return;
    }

    var ball = $('callBall');
    if (last) {
      $('callLetter').textContent = BG.letter(last);
      $('callNum').textContent = String(last);
      ball.className = 'call-ball' + (last !== lastCallShown ? ' fresh' : '');
      lastCallShown = last;
      $('callHint').textContent = BG.callName(last) + ' · ' + called.length + ' of 75';
    } else {
      $('callLetter').textContent = '·';
      $('callNum').textContent = '—';
      ball.className = 'call-ball empty';
      lastCallShown = null;
      $('callHint').textContent = host ? 'Tap Call to draw a number.' : 'Waiting for the host to call.';
    }

    var strip = '', i, n;
    var from = Math.max(0, called.length - 12);
    for (i = from; i < called.length; i++) {
      n = called[i];
      strip += '<span class="' + (i === called.length - 1 ? 'last' : '') + '">' +
        esc(BG.callName(n)) + '</span>';
    }
    $('calledStrip').innerHTML = strip;

    var html = '', c, r, cell, k, cls, label;
    for (r = 0; r < 5; r++) {
      html += '<tr>';
      for (c = 0; c < 5; c++) {
        cell = grid[c][r];
        k = BG.key(c, r);
        cls = '';
        if (cell === 0) { cls = 'free daubed'; label = 'FREE'; }
        else {
          label = String(cell);
          if (marked[k]) cls = 'daubed';
          else if (BG.inCall(called, cell)) cls = 'hit';
        }
        html += '<td class="' + cls + '" data-c="' + c + '" data-r="' + r + '">' + label + '</td>';
      }
      html += '</tr>';
    }
    $('cardBody').innerHTML = html;
    $('bingoCard').className = 'bingo-card' + (winner ? ' won' : '');

    var win = BG.validClaim(grid, marked, called);
    $('bingoBtn').disabled = ended || !win;
    $('callBtn').hidden = !host;
    $('callBtn').disabled = ended || called.length >= 75;
    $('autoBtn').hidden = !host;
    $('autoBtn').disabled = ended;
    var autoOn = localPlay ? localPlay.auto : mp.auto;
    $('autoBtn').className = 'ghost' + (autoOn ? ' on' : '');
    $('autoBtn').textContent = autoOn ? 'Stop calling' : 'Keep calling';

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
    } else if (win) {
      status.className = 'statusline good';
      status.textContent = 'You have ' + patternName(win) + '. Shout bingo!';
      rev.hidden = true;
      setChip('play', 'Bingo ready');
    } else {
      status.className = 'statusline';
      status.textContent = host
        ? (called.length ? 'Mark it if you have it, then call the next.' : 'You call. Everyone daubs.')
        : 'The host calls. Mark the numbers on your card.';
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

  setChip('', 'Ready');
})();
