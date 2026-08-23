// Longwave. A psychic sees the mark and gives a clue; a guesser places the
// needle. Invite is OS chrome — this file never draws a share button.
//
// One collection. Each person writes ONLY their own row (id = me).
// The board row is written by whoever is host (lowest id).
// A player publishes an intent; the host applies it if it is legal.
(function () {
  'use strict';
  var LW = window.LW;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };

  var db = null;
  try { if (window.gifos) db = gifos.db('lw'); } catch (e) {}
  var best = 0;
  var mode = 'setup'; // setup | hotseat | mp
  var canSlide = false;
  var dragging = false;
  var savedHot = null;

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipState').textContent = text;
  }
  function setStatus(text, cls) {
    $('status').className = 'statusline' + (cls ? ' ' + cls : '');
    $('status').textContent = text || '';
  }
  function setTurn(who, detail, kind) {
    $('turnWho').textContent = who || '';
    $('turnDo').textContent = detail || '';
    $('turnBanner').className = 'turnbanner' + (kind ? ' ' + kind : '');
  }
  function showStats() {
    $('statsLine').textContent = best ? ('Best cooperative score ' + best) : '';
  }
  function saveBest(n) {
    if (n > best) {
      best = n;
      if (db) db.put({ id: 'stats', best: best }).catch(function () {});
      showStats();
    }
  }

  function tickPct(v) { return ((v | 0) / LW.MAX) * 100; }
  function placeWedges(t) {
    t = t | 0;
    var el = $('wedges');
    el.style.left = (((t - 2.5) / LW.MAX) * 100) + '%';
    el.style.width = ((5 / LW.MAX) * 100) + '%';
  }
  function paintPips(left, total) {
    var n = LW.TURNS, used = n - (left | 0), i, html = '';
    for (i = 0; i < n; i++) html += '<span class="' + (i < used ? 'gone' : 'left') + '"></span>';
    $('pips').innerHTML = html;
    $('scoreNum').textContent = String(total | 0);
  }
  function paintSeats(a, b) {
    function cell(s) {
      var name = s.open ? '<span class="open">open</span>'
        : (s.me ? 'You' : esc(s.name || ''));
      return '<div class="seat' + (s.me ? ' me' : '') + (s.on ? ' turn' : '') + '">' +
        '<span class="role">' + esc(s.label) + '</span>' +
        (name ? '<span class="who">' + name + '</span>' : '') +
        '</div>';
    }
    $('seats').innerHTML = cell(a) + cell(b);
  }
  function showReveal(raw, last) {
    var el = $('revealScore');
    el.hidden = false;
    if (raw === 4) {
      el.className = 'reveal-score bull';
      $('revealPts').textContent = '+' + last;
      $('revealWhy').textContent = 'Dead on — you keep the card';
    } else if (last) {
      el.className = 'reveal-score hit';
      $('revealPts').textContent = '+' + last;
      $('revealWhy').textContent = raw === 3 ? 'Close' : 'In the zone';
    } else {
      el.className = 'reveal-score miss';
      $('revealPts').textContent = '0';
      $('revealWhy').textContent = 'Miss';
    }
  }
  function hideReveal() { $('revealScore').hidden = true; }

  function paintSpectrum(card, opts) {
    opts = opts || {};
    card = card || ['Left', 'Right'];
    var cols = LW.poleColors(card[0]);
    $('poleL').textContent = card[0];
    $('poleR').textContent = card[1];
    $('poleL').style.background = cols.left;
    $('poleR').style.background = cols.right;
    $('rail').style.background = 'linear-gradient(90deg, ' + cols.left + ' 0%, ' + cols.right + ' 100%)';

    var showT = opts.target != null && opts.target !== false;
    var showG = opts.guess != null && opts.guess !== false;
    var showB = !!(opts.bands || opts.aim) && (showT || opts.target === 0);
    if (opts.aim && opts.target == null) showB = false;
    if ((opts.bands || opts.aim) && opts.target != null && opts.target !== false) showB = true;
    $('wedges').hidden = !showB;
    if (showB) {
      placeWedges(opts.target | 0);
      $('wedges').className = 'wedges' + (opts.aim ? ' aim' : ' reveal');
    }
    // Wedges ARE the mark — a gold ring on top of the 4 eats the label.
    $('targetMark').hidden = !showT || !!showB;
    if (showT) $('targetMark').style.left = tickPct(opts.target) + '%';
    $('needle').hidden = !showG;
    if (showG) $('needle').style.left = tickPct(opts.guess) + '%';
    canSlide = !!opts.slide;
    $('railWrap').classList.toggle('can-slide', canSlide);
    $('railWrap').style.cursor = canSlide ? 'grab' : 'default';
  }

  function posFromEvent(e) {
    var r = $('rail').getBoundingClientRect();
    var pt = e;
    if (e.touches && e.touches[0]) pt = e.touches[0];
    else if (e.changedTouches && e.changedTouches[0]) pt = e.changedTouches[0];
    var x = pt.clientX - r.left;
    var t = r.width ? x / r.width : 0.5;
    return Math.max(0, Math.min(LW.MAX, Math.round(t * LW.MAX)));
  }
  function needleTo(v) {
    $('needle').hidden = false;
    $('needle').style.left = tickPct(v) + '%';
  }
  function onSlide(v) {
    if (!canSlide) return;
    if (mode === 'hotseat') {
      L.guess = v;
      needleTo(v);
    } else if (mode === 'mp') {
      mpSlide(v);
    }
  }
  (function bindRail() {
    var wrap = $('railWrap');
    wrap.addEventListener('pointerdown', function (e) {
      if (!canSlide) return;
      dragging = true;
      wrap.classList.add('sliding');
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      onSlide(posFromEvent(e));
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!dragging || !canSlide) return;
      onSlide(posFromEvent(e));
    });
    function up() {
      dragging = false;
      wrap.classList.remove('sliding');
    }
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
  })();

  (function buildTicks() {
    var el = $('ticks'), i, s;
    el.innerHTML = '';
    for (i = 0; i <= LW.MAX; i++) {
      s = document.createElement('i');
      s.style.left = (i / LW.MAX * 100) + '%';
      if (i === 0 || i === 10 || i === LW.MAX) s.className = 'maj';
      el.appendChild(s);
    }
  })();

  function setActions(btns) {
    var el = $('actions'), i, b;
    el.innerHTML = '';
    for (i = 0; i < btns.length; i++) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = btns[i].primary ? 'primary' : (btns[i].quiet ? 'ghost quiet' : 'ghost');
      if (btns[i].wide) b.className += ' wide';
      b.textContent = btns[i].label;
      b.disabled = !!btns[i].off;
      b.addEventListener('click', btns[i].fn);
      el.appendChild(b);
    }
  }

  function showClueRead(who, text) {
    $('clueWrite').hidden = true;
    $('clueRead').hidden = false;
    $('clueRead').innerHTML =
      (who ? '<span class="who">' + esc(who) + '</span>' : '') +
      '<span class="said">' + esc(text || '') + '</span>';
  }
  function showClueWrite(value) {
    $('clueRead').hidden = true;
    $('clueWrite').hidden = false;
    if (value != null) $('clueInput').value = value;
  }
  function hideClue() {
    $('clueRead').hidden = true;
    $('clueWrite').hidden = true;
  }

  // ---- hotseat ----
  var L = null;
  function freshLocal() {
    return {
      seed: LW.randomSeed(), index: 0, target: LW.randomTarget(),
      clue: '', guess: 10, phase: 'clue', total: 0, left: LW.TURNS, last: 0, raw: 0
    };
  }
  function cardOf(g) { return LW.cardAt(g.seed, g.index); }
  function validHot(g) {
    return g && typeof g.seed === 'string' && typeof g.phase === 'string' &&
      g.left != null && g.target != null && g.phase !== 'done';
  }
  function persistLocal() {
    if (!db || !L) return;
    db.put({ id: 'hotseat', game: L, at: nowMs() }).catch(function () {});
  }

  function paintLocal() {
    if (!L) return;
    var card = cardOf(L);
    $('playTitle').textContent = 'Two here';
    paintPips(L.left, L.total);
    $('queue').textContent = '';
    $('pass').hidden = L.phase !== 'pass';
    hideReveal();

    if (L.phase === 'clue') {
      $('play').className = 'play hotseat role-psychic';
      paintSeats(
        { label: 'Psychic', name: 'You', me: true, on: true },
        { label: 'Guesser', name: 'Waiting', me: false, on: false }
      );
      paintSpectrum(card, { target: L.target, aim: true, slide: false });
      showClueWrite();
      setTurn('You are the psychic', 'Look at the 4. Give a clue that lives there.', 'mine');
      setStatus('');
      setChip('ready', 'Psychic');
      setActions([
        { label: 'Give clue', primary: true, fn: localClue },
        { label: 'Skip this card', quiet: true, fn: localRedraw }
      ]);
    } else if (L.phase === 'pass') {
      $('play').className = 'play hotseat';
      paintSeats(
        { label: 'Psychic', me: false, on: false },
        { label: 'Guesser', me: false, on: true }
      );
      paintSpectrum(card, { slide: false });
      hideClue();
      setTurn('Hand it over', 'The guesser takes the device. The mark is hidden.', 'wait');
      setStatus('');
      setChip('wait', 'Pass');
      setActions([]);
    } else if (L.phase === 'guess') {
      $('play').className = 'play hotseat role-guesser';
      paintSeats(
        { label: 'Psychic', me: false, on: false },
        { label: 'Guesser', name: 'You', me: true, on: true }
      );
      paintSpectrum(card, { guess: L.guess, slide: true });
      showClueRead('The clue', L.clue);
      setTurn('You are the guesser', 'Slide the needle to where the clue belongs.', 'mine');
      setStatus('');
      setChip('ready', 'Guesser');
      setActions([{ label: 'Lock the needle', primary: true, fn: localLock }]);
    } else if (L.phase === 'score') {
      $('play').className = 'play hotseat role-guesser';
      paintSeats(
        { label: 'Psychic', me: false, on: false },
        { label: 'Guesser', me: false, on: false }
      );
      paintSpectrum(card, { target: L.target, guess: L.guess, bands: true, slide: false });
      showClueRead('The clue', L.clue);
      showReveal(L.raw, L.last);
      setTurn('The mark', L.raw === 4 ? 'Dead on.' : (L.last ? 'See where you landed.' : 'Outside the zone.'), 'score');
      setStatus('');
      setChip('ready', 'Score');
      setActions([{ label: L.left ? 'Next card' : 'See total', primary: true, fn: localNext }]);
    } else {
      $('play').className = 'play hotseat role-guesser';
      paintSeats(
        { label: 'Psychic', me: false, on: false },
        { label: 'Guesser', me: false, on: false }
      );
      paintSpectrum(card, { target: L.target, guess: L.guess, bands: true, slide: false });
      showClueRead('The clue', L.clue);
      showReveal(L.raw, L.last);
      setTurn('Game complete', 'You scored ' + L.total + '.', 'score');
      setStatus('');
      setChip('ready', 'Done');
      setActions([{ label: 'Play again', primary: true, fn: localAgain }]);
    }
  }

  function localRedraw() {
    if (!L || L.phase !== 'clue') return;
    L.index++;
    L.target = LW.randomTarget();
    L.clue = '';
    $('clueInput').value = '';
    persistLocal();
    paintLocal();
  }
  function localClue() {
    if (!L || L.phase !== 'clue') return;
    var t = ($('clueInput').value || '').replace(/^\s+|\s+$/g, '');
    if (!t) { setStatus('Write a clue first.', 'warn'); return; }
    L.clue = t;
    L.phase = 'pass';
    L.guess = 10;
    persistLocal();
    paintLocal();
  }
  function localLock() {
    if (!L || L.phase !== 'guess') return;
    L.raw = LW.score(L.target, L.guess);
    L.last = LW.coopPoints(L.raw);
    L.total += L.last;
    if (!LW.coopBonus(L.raw)) L.left--;
    L.phase = 'score';
    saveBest(L.total);
    persistLocal();
    paintLocal();
  }
  function localNext() {
    if (!L || L.phase !== 'score') return;
    if (L.left <= 0) { L.phase = 'done'; persistLocal(); paintLocal(); return; }
    L.index++;
    L.target = LW.randomTarget();
    L.clue = '';
    L.guess = 10;
    L.raw = 0;
    L.last = 0;
    L.phase = 'clue';
    $('clueInput').value = '';
    persistLocal();
    paintLocal();
  }
  function localAgain() {
    L = freshLocal();
    $('clueInput').value = '';
    persistLocal();
    paintLocal();
  }

  function enterHotseat(game) {
    mode = 'hotseat';
    L = game || freshLocal();
    $('setup').hidden = true;
    $('play').hidden = false;
    if (!game) $('clueInput').value = '';
    paintLocal();
  }
  $('hotseatBtn').onclick = function () { enterHotseat(null); persistLocal(); };
  $('continueBtn').onclick = function () {
    if (!savedHot) return;
    enterHotseat(savedHot);
  };
  $('passOk').onclick = function () {
    if (!L || L.phase !== 'pass') return;
    L.phase = 'guess';
    persistLocal();
    paintLocal();
  };

  // ---- multiplayer ----
  var PRES_TTL = 9000, HB_MS = 3000, SLIDE_MS = 80;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('lw-mp'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false };
  var _items = [];
  var slideAt = 0;
  var pendingDeal = false;
  var lastSeq = -1;

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.psychic === mp.id) return 'psychic';
    if (b.seats.guesser === mp.id) return 'guesser';
    return null;
  }
  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function freshBoard(hostId) {
    return {
      id: 'board', host: hostId,
      seats: { psychic: null, guesser: null }, names: {},
      phase: 'wait', round: 1, seq: 0, seed: LW.randomSeed(),
      cardIndex: 0, clue: '', guess: 10, target: null, dealt: false,
      last: 0, raw: 0, total: 0, left: LW.TURNS, startedAt: nowMs()
    };
  }
  function putMe(extra) {
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putBoard(b) { mp.board = b; mpDb.put(b).catch(function () {}); }

  function mpEnter() {
    if (!mpDb) { setStatus('Play a friend needs storage.', 'warn'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      mode = 'mp';
      L = null;
      pendingDeal = false;
      $('setup').hidden = true; $('play').hidden = false; $('pass').hidden = true;
      $('playTitle').textContent = 'Play a friend';
      setChip('wait', 'A friend');
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
    mode = 'setup';
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (mpDb && mp.id) mpDb.delete(mp.id).catch(function () {});
    $('play').hidden = true; $('pass').hidden = true; $('setup').hidden = false;
    setChip('ready', 'Ready');
    refreshContinue();
  }
  $('friendBtn').onclick = mpEnter;
  $('leaveBtn').onclick = function () {
    if (mode === 'mp') mpLeave();
    else {
      persistLocal();
      L = null; mode = 'setup';
      $('play').hidden = true; $('pass').hidden = true; $('setup').hidden = false;
      setChip('ready', 'Ready');
      refreshContinue();
    }
  };

  function mpRefresh() {
    if (!mp.on) return;
    var t = nowMs();
    var people = [], board = null, i, it;
    for (i = 0; i < _items.length; i++) {
      it = _items[i];
      if (!it || !it.id) continue;
      if (it.id === 'board') { board = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    mp.people = people;
    mp.board = board;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (!board) {
      if (isHost(people)) putBoard(freshBoard(mp.id));
      mpRender();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(board, people);
      if (next) { putBoard(next); return; }
    }
    if (mp.row && mp.row.intent && board.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    mpRender();
  }

  function mpReconcile(B, people) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var ids = {};
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['psychic', 'guesser'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.psychic || !b.seats.guesser) && b.phase !== 'wait' && b.phase !== 'done') {
      b.phase = 'wait'; b.dealt = false; b.target = null; b.clue = ''; b.guess = 10; ch = true;
    }
    var seated = {};
    seated[b.seats.psychic] = 1; seated[b.seats.guesser] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.psychic && queue.length) { b.seats.psychic = queue.shift(); ch = true; }
    if (!b.seats.guesser && queue.length) { b.seats.guesser = queue.shift(); ch = true; }
    if (b.phase === 'wait' && b.seats.psychic && b.seats.guesser) {
      b.phase = 'clue'; b.dealt = false; b.target = null; b.clue = ''; b.guess = 10;
      b.seq = (b.seq || 0) + 1; ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.psychic === p.id ? 'psychic' : (b.seats.guesser === p.id ? 'guesser' : null);
      if (intent.kind === 'deal') {
        if (seat !== 'psychic' || b.phase !== 'clue') return;
        var tgt = intent.target | 0;
        if (tgt < 0 || tgt > LW.MAX) return;
        b.target = tgt;
        b.cardIndex = intent.cardIndex | 0;
        b.dealt = true;
        b.clue = '';
        ch = true;
      } else if (intent.kind === 'clue') {
        if (seat !== 'psychic' || b.phase !== 'clue' || !b.dealt) return;
        var text = String(intent.text || '').replace(/^\s+|\s+$/g, '');
        if (!text) return;
        b.clue = text.slice(0, 80);
        b.guess = 10;
        b.phase = 'guess';
        b.seq = (b.seq || 0) + 1;
        ch = true;
      } else if (intent.kind === 'guess') {
        if (seat !== 'guesser' || b.phase !== 'guess') return;
        var gv = intent.value | 0;
        if (gv < 0 || gv > LW.MAX) return;
        if (b.guess !== gv) { b.guess = gv; ch = true; }
      } else if (intent.kind === 'lock') {
        if (seat !== 'guesser' || b.phase !== 'guess') return;
        var lv = intent.value | 0;
        if (lv < 0 || lv > LW.MAX) return;
        b.guess = lv;
        b.raw = LW.score(b.target, b.guess);
        b.last = LW.coopPoints(b.raw);
        b.total = (b.total | 0) + b.last;
        if (!LW.coopBonus(b.raw)) b.left = Math.max(0, (b.left | 0) - 1);
        b.phase = 'score';
        b.seq = (b.seq || 0) + 1;
        ch = true;
      } else if (intent.kind === 'next') {
        if (b.phase !== 'score') return;
        if ((b.left | 0) <= 0) {
          b.phase = 'done';
          b.seq = (b.seq || 0) + 1;
          ch = true;
          return;
        }
        var sw = b.seats.psychic;
        b.seats.psychic = b.seats.guesser;
        b.seats.guesser = sw;
        b.phase = 'clue';
        b.dealt = false;
        b.target = null;
        b.clue = '';
        b.guess = 10;
        b.raw = 0;
        b.last = 0;
        b.cardIndex = (b.cardIndex | 0) + 1;
        b.round = (b.round | 0) + 1;
        b.seq = (b.seq || 0) + 1;
        ch = true;
      } else if (intent.kind === 'again') {
        var seats = { psychic: b.seats.psychic, guesser: b.seats.guesser };
        var names = b.names;
        var n = freshBoard(mp.id);
        n.seats = seats; n.names = names; n.seq = (b.seq || 0) + 1;
        if (n.seats.psychic && n.seats.guesser) {
          n.phase = 'clue'; n.seq = n.seq + 1;
        }
        Object.keys(n).forEach(function (k) { b[k] = n[k]; });
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function sendIntent(kind, extra) {
    var b = mp.board;
    if (!b) return;
    var intent = { kind: kind, seq: b.seq };
    if (extra) Object.keys(extra).forEach(function (k) { intent[k] = extra[k]; });
    putMe({ intent: intent });
  }

  function mpSlide(v) {
    var b = mp.board;
    if (!b || mySeat(b) !== 'guesser' || b.phase !== 'guess') return;
    b.guess = v;
    needleTo(v);
    var t = nowMs();
    if (t - slideAt < SLIDE_MS) return;
    slideAt = t;
    sendIntent('guess', { value: v });
  }

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board;
    $('playTitle').textContent = 'Play a friend';
    $('pass').hidden = true;
    hideReveal();
    if (!b) {
      $('seats').innerHTML = '';
      paintPips(LW.TURNS, 0);
      setTurn('Setting up', 'The spectrum is landing in this file.', 'wait');
      setStatus('');
      setActions([]);
      hideClue();
      return;
    }
    var seat = mySeat(b);
    var pName = b.names[b.seats.psychic] || 'the psychic';
    var gName = b.names[b.seats.guesser] || 'the guesser';
    paintSeats(
      { label: 'Psychic', name: pName, me: seat === 'psychic', on: b.phase === 'clue', open: !b.seats.psychic },
      { label: 'Guesser', name: gName, me: seat === 'guesser', on: b.phase === 'guess', open: !b.seats.guesser }
    );
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.psychic && p.id !== b.seats.guesser; });
    $('queue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    paintPips(b.left, b.total || 0);
    if (b.seq !== lastSeq) {
      pendingDeal = false;
      lastSeq = b.seq;
      if (b.phase === 'clue') $('clueInput').value = '';
    }
    var card = LW.cardAt(b.seed, b.cardIndex);
    var both = b.seats.psychic && b.seats.guesser;
    var showTarget = seat === 'psychic' || b.phase === 'score' || b.phase === 'done';
    var target = (showTarget && b.dealt) ? b.target : null;
    var showGuess = b.phase === 'guess' || b.phase === 'score' || b.phase === 'done';
    var slide = seat === 'guesser' && b.phase === 'guess';
    var aim = seat === 'psychic' && b.phase === 'clue' && b.dealt;
    paintSpectrum(card, {
      target: target,
      guess: showGuess ? b.guess : null,
      bands: b.phase === 'score' || b.phase === 'done',
      aim: aim,
      slide: slide
    });

    if (seat === 'psychic' && b.phase === 'clue' && !b.dealt && !pendingDeal) {
      pendingDeal = true;
      sendIntent('deal', { target: LW.randomTarget(), cardIndex: b.cardIndex | 0 });
    }
    if (b.dealt || b.phase !== 'clue') pendingDeal = false;

    if (!both) {
      hideClue();
      $('play').className = 'play';
      setTurn('Waiting for a friend', 'Press Invite in the bar above the app. The link is the room.', 'wait');
      setStatus('');
      setChip('wait', 'A friend');
      setActions([]);
      return;
    }
    if (b.phase === 'clue') {
      if (seat === 'psychic') {
        $('play').className = 'play role-psychic';
        showClueWrite();
        setTurn('You are the psychic', 'Look at the 4. Give a clue that lives there.', 'mine');
        setStatus('');
        setChip('ready', 'Psychic');
        setActions([
          { label: 'Give clue', primary: true, off: !b.dealt, fn: function () {
            var t = ($('clueInput').value || '').replace(/^\s+|\s+$/g, '');
            if (!t) { setStatus('Write a clue first.', 'warn'); return; }
            sendIntent('clue', { text: t });
          } },
          { label: 'Skip this card', quiet: true, off: !b.dealt, fn: function () {
            sendIntent('deal', { target: LW.randomTarget(), cardIndex: (b.cardIndex | 0) + 1 });
          } }
        ]);
      } else {
        $('play').className = 'play';
        hideClue();
        setTurn('Waiting for ' + pName, 'They are looking at the mark and thinking of a clue.', 'wait');
        setStatus('');
        setChip('wait', seat === 'guesser' ? 'Guesser' : 'Watching');
        setActions([]);
      }
    } else if (b.phase === 'guess') {
      showClueRead(pName + '\'s clue', b.clue);
      if (seat === 'guesser') {
        $('play').className = 'play role-guesser';
        setTurn('You are the guesser', 'Slide the needle to where the clue belongs.', 'mine');
        setStatus('');
        setChip('ready', 'Guesser');
        setActions([{ label: 'Lock the needle', primary: true, fn: function () {
          sendIntent('lock', { value: b.guess | 0 });
        } }]);
      } else {
        $('play').className = 'play role-guesser';
        setTurn(gName + ' is guessing', 'Watch the needle. Stay quiet about the mark.', seat === 'psychic' ? 'wait' : 'wait');
        setStatus('');
        setChip('wait', seat === 'psychic' ? 'Psychic' : 'Watching');
        setActions([]);
      }
    } else if (b.phase === 'score') {
      $('play').className = 'play role-guesser';
      showClueRead(pName + '\'s clue', b.clue);
      showReveal(b.raw, b.last);
      setTurn('The mark', b.raw === 4 ? 'Dead on.' : (b.last ? 'See where you landed.' : 'Outside the zone.'), 'score');
      setStatus('');
      setChip('ready', 'Score');
      saveBest(b.total | 0);
      var nextLabel = (b.left | 0) ? 'Next card' : 'See total';
      setActions(seat ? [{ label: nextLabel, primary: true, fn: function () { sendIntent('next'); } }] : []);
    } else if (b.phase === 'done') {
      $('play').className = 'play role-guesser';
      showClueRead(pName + '\'s clue', b.clue);
      showReveal(b.raw, b.last);
      setTurn('Game complete', 'You scored ' + (b.total | 0) + '.', 'score');
      setStatus('');
      setChip('ready', 'Done');
      saveBest(b.total | 0);
      setActions(seat ? [{ label: 'Play again', primary: true, fn: function () { sendIntent('again'); } }] : []);
    } else {
      hideClue();
      $('play').className = 'play';
      setTurn('Waiting…', '', 'wait');
      setActions([]);
    }
  }

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (mode === 'mp') mpLeave();
    else if (mode === 'hotseat') $('leaveBtn').click();
  });

  $('clueInput').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (mode === 'hotseat' && L && L.phase === 'clue') localClue();
    else if (mode === 'mp' && mp.board && mySeat(mp.board) === 'psychic' && mp.board.phase === 'clue') {
      var t = ($('clueInput').value || '').replace(/^\s+|\s+$/g, '');
      if (!t) { setStatus('Write a clue first.', 'warn'); return; }
      sendIntent('clue', { text: t });
    }
  });

  function refreshContinue() {
    var btn = $('continueBtn');
    if (savedHot && validHot(savedHot)) btn.hidden = false;
    else btn.hidden = true;
  }

  setChip('ready', 'Ready');
  showStats();
  if (db) {
    db.get('stats').then(function (st) {
      if (!st) return;
      best = st.best | 0;
      showStats();
    }).catch(function () {});
    db.get('hotseat').then(function (row) {
      if (row && validHot(row.game)) {
        savedHot = row.game;
        refreshContinue();
      }
    }).catch(function () {});
  }
})();
