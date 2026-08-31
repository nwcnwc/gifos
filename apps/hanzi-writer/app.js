/*
 * Hanzi Writer — classic-script GifOS port of chanind/hanzi-writer.
 *
 * Stroke data is vendored in vendor/chars.js (HSK 1–3 + 永). The library
 * never hits its CDN: charDataLoader reads HANZI_DATA. Canvas renderer so
 * SVG clip-path does not resolve against about:srcdoc. Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000, HB_MS = 3000;
  var TARGET_N = 10;
  var DATA = root.HANZI_DATA || {};
  var LEX = root.HANZI_LEX || {};
  var LEVELS = root.HANZI_LEVELS || {};

  function lexOf(ch) {
    return LEX[ch] || { p: '', m: '', h: 0, w: ch, n: 0 };
  }
  function levelChars(level) {
    if (level === 1 || level === 2 || level === 3) {
      return (LEVELS[level] || LEVELS[String(level)] || []).slice();
    }
    return [];
  }
  function mulberry32(a) {
    return function () {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    var a = arr.slice(), i, j, t;
    rng = rng || Math.random;
    for (i = a.length - 1; i > 0; i--) {
      j = (rng() * (i + 1)) | 0;
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function hasChar(ch) { return !!(ch && DATA[ch]); }

  root.HanziQuiz = {
    lexOf: lexOf,
    levelChars: levelChars,
    shuffle: shuffle,
    mulberry32: mulberry32,
    hasChar: hasChar,
    count: function () { return Object.keys(DATA).length; }
  };

  if (typeof document === 'undefined') return;
  if (typeof HanziWriter === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); };

  var G = {
    level: 1,
    outline: true,
    reveal: false,
    deck: [],
    i: 0,
    score: 0,
    doneN: 0,
    wrong: 0,
    missed: [],
    screen: 'home',
    friend: false,
    mistakes: 0,
    stroke: 0,
    strokes: 0,
    charDone: false,
    watching: false,
    ready: false,
    doneAt: 0,
    solo: null
  };

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var prefsDb = null, matchDb = null, playersDb = null;
  try {
    if (api && api.db) {
      prefsDb = api.db('prefs');
      matchDb = api.db('match');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var me = { id: 'local', name: 'You' };
  var others = [];
  var match = null;
  var vsRound = 0;
  var hbTimer = 0;
  var saveTimer = 0;
  var writer = null;
  var sized = 0;
  var advanceTimer = 0;
  var launched = false;

  function versusOn() { return others.length > 0; }
  function now() { return Date.now(); }
  function iAmManager() {
    var ids = [me.id].concat(others.map(function (p) { return p.id; }));
    ids.sort();
    return ids[0] === me.id;
  }
  function racing() { return G.friend && versusOn(); }
  function targetOf() { return TARGET_N; }
  function currentChar() { return G.deck[G.i] || ''; }

  function show(name) {
    G.screen = name;
    $('home').hidden = name !== 'home';
    $('lobby').hidden = name !== 'lobby';
    $('quiz').hidden = name !== 'quiz';
    $('done').hidden = name !== 'done';
    $('backBtn').hidden = name === 'home';
    if (name === 'home') renderHome();
    if (name === 'lobby') renderLobby();
    if (name === 'quiz') sizeWriter(true);
  }

  function loadChar(char, onLoad, onError) {
    var d = DATA[char];
    if (d) { onLoad(d); return d; }
    if (onError) onError(new Error('no data for ' + char));
    return null;
  }

  function sizeWriter(force) {
    var stage = $('stage');
    if (!stage || G.screen !== 'quiz') return;
    var w = Math.max(160, Math.floor(stage.clientWidth));
    if (!force && w === sized) return;
    sized = w;
    if (writer) {
      writer.updateDimensions({ width: w, height: w, padding: Math.round(w * 0.12) });
    }
  }

  function makeWriter(ch) {
    var el = $('writer');
    el.textContent = '';
    var w = Math.max(160, Math.floor($('stage').clientWidth) || 280);
    sized = w;
    writer = HanziWriter.create(el, ch, {
      renderer: 'canvas',
      width: w,
      height: w,
      padding: Math.round(w * 0.12),
      showOutline: G.outline,
      showCharacter: false,
      strokeColor: '#f4f1ea',
      radicalColor: '#e07a5f',
      outlineColor: '#4a4458',
      highlightColor: '#e8c547',
      drawingColor: '#f4c95d',
      highlightCompleteColor: '#3dcc8a',
      drawingWidth: 5,
      strokeAnimationSpeed: 1.15,
      delayBetweenStrokes: 160,
      showHintAfterMisses: 3,
      leniency: 1.15,
      charDataLoader: loadChar,
      onLoadCharDataError: function () {
        $('feedback').className = 'feedback bad';
        $('feedback').textContent = 'No stroke data for that character.';
      }
    });
  }

  function startQuizOn(ch) {
    if (!hasChar(ch)) return;
    G.mistakes = 0;
    G.stroke = 0;
    G.charDone = false;
    G.watching = false;
    G.strokes = (DATA[ch].strokes && DATA[ch].strokes.length) || lexOf(ch).n || 0;
    if (!writer) makeWriter(ch);
    else writer.setCharacter(ch);
    if (G.outline) writer.showOutline({ duration: 0 });
    else writer.hideOutline({ duration: 0 });
    writer.hideCharacter({ duration: 0 });
    writer.quiz({
      onCorrectStroke: function (d) {
        G.stroke = (d.strokeNum | 0) + 1;
        G.mistakes = d.totalMistakes | 0;
        paintHud();
        publishMe();
      },
      onMistake: function (d) {
        G.mistakes = d.totalMistakes | 0;
        $('feedback').className = 'feedback bad';
        $('feedback').textContent = 'Again — stroke ' + ((d.strokeNum | 0) + 1);
        paintHud();
        publishMe();
      },
      onComplete: function (d) { onCharDone(d.totalMistakes | 0); }
    });
    $('nextBtn').hidden = true;
    paintHud();
  }

  function onCharDone(mistakes) {
    G.charDone = true;
    G.mistakes = mistakes | 0;
    G.stroke = G.strokes;
    G.doneN++;
    var ch = currentChar();
    var clean = G.mistakes === 0;
    if (clean) G.score++;
    else {
      G.wrong++;
      if (ch && G.missed.indexOf(ch) < 0) G.missed.push(ch);
    }
    var Lx = lexOf(ch);
    $('feedback').className = 'feedback ' + (clean ? 'ok' : 'bad');
    $('feedback').textContent = clean
      ? ('Clean — ' + ch + (Lx.p ? '  ' + Lx.p : ''))
      : ((G.mistakes === 1 ? '1 miss' : G.mistakes + ' misses') + ' — ' + ch + (Lx.p ? '  ' + Lx.p : ''));
    $('nextBtn').hidden = false;
    if (!G.friend && G.i >= G.deck.length - 1) {
      G.doneAt = now();
    }
    if (G.friend && G.score >= targetOf()) G.doneAt = now();
    bumpStat(ch, clean);
    publishMe();
    saveSoon();
    paintHud();
    if (advanceTimer) clearTimeout(advanceTimer);
    if (!G.friend) {
      advanceTimer = setTimeout(function () {
        if (G.screen === 'quiz' && G.charDone) nextChar();
      }, 1400);
    } else {
      maybeAdvanceTogether();
    }
  }

  function bumpStat(ch, clean) {
    if (!G.stats) G.stats = {};
    var s = G.stats[ch] || { n: 0, clean: 0, last: 0 };
    s.n++;
    if (clean) s.clean++;
    s.last = now();
    G.stats[ch] = s;
  }

  function nextChar() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = 0; }
    if (G.friend && !iAmManager()) return;
    var finished = G.i + 1 >= G.deck.length ||
      (G.friend && G.score >= targetOf());
    if (finished) {
      if (!G.doneAt) G.doneAt = now();
      if (!G.friend) G.solo = null;
      publishMe();
      saveSoon();
      if (!G.friend) showDone();
      else { maybeNewRound(); render(); }
      return;
    }
    G.i++;
    G.charDone = false;
    G.ready = false;
    if (G.friend && matchDb && iAmManager()) {
      match = Object.assign({}, match || {}, {
        id: 'm', i: G.i, round: vsRound || 1
      });
      matchDb.put(match).catch(function () {});
    }
    startQuizOn(currentChar());
    publishMe();
    saveSoon();
    render();
  }

  function buildDeck(level, seed) {
    var pool;
    if (level === 0) {
      pool = G.missed.slice();
      if (!pool.length) pool = levelChars(1);
    } else {
      pool = levelChars(level);
    }
    pool = pool.filter(hasChar);
    if (!pool.length) pool = levelChars(1).filter(hasChar);
    var rng = seed != null ? mulberry32(seed >>> 0) : Math.random;
    return shuffle(pool, rng);
  }

  function snapshotSolo() {
    if (!G.deck.length) return null;
    return {
      deck: G.deck.slice(),
      i: G.i,
      score: G.score,
      doneN: G.doneN,
      wrong: G.wrong,
      level: G.level,
      missed: G.missed.slice()
    };
  }

  function startDrill(opts) {
    opts = opts || {};
    if ($('homeErr')) $('homeErr').hidden = true;
    G.friend = !!opts.friend;
    G.ready = false;
    G.doneAt = 0;
    G.charDone = false;
    G.watching = false;
    if (opts.one && hasChar(opts.one)) {
      G.deck = [opts.one];
      G.i = 0; G.score = 0; G.doneN = 0; G.wrong = 0;
      G.friend = false;
    } else if (opts.resume && G.solo && G.solo.deck && G.solo.deck.length) {
      G.deck = G.solo.deck.slice();
      G.i = G.solo.i | 0;
      G.score = G.solo.score | 0;
      G.doneN = G.solo.doneN | 0;
      G.wrong = G.solo.wrong | 0;
      if (G.solo.level != null) G.level = G.solo.level;
      G.friend = false;
    } else if (opts.review) {
      if (!G.missed.length) return;
      G.deck = shuffle(G.missed.slice());
      G.i = 0; G.score = 0; G.doneN = 0; G.wrong = 0;
      G.friend = false;
    } else if (G.friend && match && match.deck && match.deck.length) {
      G.i = 0; G.score = 0; G.doneN = 0; G.wrong = 0;
      applyMatch(match);
    } else {
      G.deck = buildDeck(G.level, opts.seed);
      G.i = 0; G.score = 0; G.doneN = 0; G.wrong = 0;
    }
    show('quiz');
    startQuizOn(currentChar());
    saveSoon();
    publishMe();
    render();
  }

  function showDone() {
    show('done');
    var n = G.deck.length;
    $('doneTitle').textContent = G.friend ? vsDoneTitle() : 'Deck done';
    $('doneScore').textContent = G.score + ' clean / ' + G.doneN;
    var miss = G.missed.length;
    $('doneNote').textContent = miss
      ? (miss === 1
        ? '1 to review — it waits here until it sticks.'
        : miss + ' to review — they wait here until they stick.')
      : (n ? 'Every stroke in order.' : '');
    $('reviewDoneBtn').hidden = !miss;
    $('reviewDoneBtn').textContent = miss ? ('Review these ' + miss) : 'Review misses';
    paintMissed();
    render();
  }

  function paintMissed() {
    var el = $('missedStrip');
    el.textContent = '';
    if (!G.missed.length) { el.hidden = true; return; }
    el.hidden = false;
    G.missed.forEach(function (k) {
      var s = document.createElement('span');
      s.className = 'miss';
      var b = document.createElement('b');
      b.lang = 'zh-Hans';
      b.textContent = k;
      var sm = document.createElement('small');
      sm.textContent = lexOf(k).p || '';
      s.appendChild(b);
      s.appendChild(sm);
      el.appendChild(s);
    });
  }

  function vsDoneTitle() {
    var o = vsOutcome();
    if (o && o.kind === 'win' && o.winner && o.winner.id === me.id) return 'You win';
    if (o && o.kind === 'win') return (o.winner.name || 'They') + ' wins';
    if (o && o.kind === 'draw') return 'Draw';
    return 'Deck done';
  }

  function cleanCount() {
    var n = 0, k, s;
    var pool = G.level === 0 ? G.missed : levelChars(G.level);
    for (k = 0; k < pool.length; k++) {
      s = G.stats && G.stats[pool[k]];
      if (s && s.clean) n++;
    }
    return n;
  }

  function renderHome() {
    var n = G.level === 0 ? G.missed.length : levelChars(G.level).length;
    var c = cleanCount();
    if (G.level === 0) {
      $('pickCount').textContent = n
        ? (n + ' waiting in review')
        : 'No misses yet — trace a level first';
    } else {
      $('pickCount').textContent = c + ' clean · ' + n + ' in HSK ' + G.level;
    }
    var canResume = !!(G.solo && G.solo.deck && G.solo.i < G.solo.deck.length);
    $('startBtn').disabled = G.level === 0 && !G.missed.length;
    $('startBtn').hidden = canResume;
    $('freshBtn').hidden = !canResume;
    var miss = G.missed.length;
    $('reviewBtn').hidden = !miss || G.level === 0;
    $('reviewBtn').textContent = miss ? ('Review misses (' + miss + ')') : 'Review misses';
    $('continueBtn').hidden = !canResume;
    if (canResume) {
      $('continueBtn').textContent = 'Continue  ' + (G.solo.i + 1) + ' / ' + G.solo.deck.length;
    }
    $('friendBtn').hidden = !api;
    $('scoreChip').textContent = '';
    $('outlineBtn').classList.toggle('on', G.outline);
    $('outlineBtn').setAttribute('aria-pressed', G.outline ? 'true' : 'false');
    $('revealBtn').classList.toggle('on', G.reveal);
    $('revealBtn').setAttribute('aria-pressed', G.reveal ? 'true' : 'false');
    Array.prototype.forEach.call($('levelSeg').children, function (btn) {
      btn.classList.toggle('on', (btn.getAttribute('data-level') | 0) === G.level);
    });
  }

  function paintHud() {
    var ch = currentChar();
    var Lx = lexOf(ch);
    var showPy = G.reveal || G.charDone || G.watching;
    var py = Lx.p || '';
    var mean = Lx.m || '';
    var bits = [];
    if (showPy && py) bits.push('<span class="py">' + escape(py) + '</span>');
    if (showPy && mean) bits.push('<span class="mean">' + escape(mean) + '</span>');
    if (Lx.h) bits.push('<span class="mean">HSK ' + Lx.h + '</span>');
    $('meta').innerHTML = bits.join(' · ') || (G.reveal ? '' : 'Trace, then the reading.');
    if (!G.charDone && !G.watching) {
      $('feedback').className = 'feedback';
      $('feedback').textContent = G.strokes
        ? ('Stroke ' + (G.stroke + 1) + ' / ' + G.strokes +
           (G.mistakes ? (' · ' + G.mistakes + ' miss') : ''))
        : 'Trace the first stroke';
    }
    var n = G.deck.length;
    $('progress').textContent = n
      ? ((G.i + 1) + ' / ' + n + (G.friend ? (' · first to ' + TARGET_N + ' clean') : ''))
      : '';
    var fill = $('barFill');
    if (fill) fill.style.width = n ? (Math.min(100, (G.i / n) * 100) + '%') : '0';
    $('scoreChip').textContent = String(G.score);
    $('nextBtn').hidden = !G.charDone || G.friend;
  }

  function vsOutcome() {
    if (!G.friend) return null;
    if (!versusOn()) return { kind: 'waiting' };
    var t = targetOf();
    var mine = {
      id: me.id, name: me.name, score: G.score, wrong: G.wrong,
      i: G.i, done: !!G.doneAt || G.score >= t,
      doneAt: G.doneAt || 0, round: vsRound
    };
    var rows = [mine].concat(others.filter(function (p) { return p.round === vsRound; }));
    var hit = rows.filter(function (p) { return p.score >= t; });
    if (hit.length) {
      hit.sort(function (a, b) { return (a.doneAt || a.at || 0) - (b.doneAt || b.at || 0); });
      return { kind: 'win', winner: hit[0] };
    }
    var live = rows.filter(function (p) { return !p.done; });
    if (rows.length >= 2 && !live.length) {
      rows.sort(function (a, b) { return (b.score - a.score) || ((a.doneAt || 0) - (b.doneAt || 0)); });
      if (rows[0].score === rows[1].score) return { kind: 'draw' };
      return { kind: 'win', winner: rows[0] };
    }
    return { kind: 'playing' };
  }

  function fillPills(el, extra) {
    el.textContent = '';
    function pill(p) {
      if (!p) return;
      var span = document.createElement('span');
      var cls = 'pill' + (p.id === me.id ? ' me' : '');
      var outcome = extra && extra.outcome;
      if (outcome && outcome.kind === 'win' && outcome.winner && outcome.winner.id === p.id) cls += ' win';
      span.className = cls;
      var label = p.id === me.id ? 'You' : (p.name || 'Friend');
      var extraTxt = '';
      if (G.screen === 'quiz' && p.strokes) {
        extraTxt = '  ' + (p.doneChar ? 'done' : ((p.stroke || 0) + '/' + p.strokes));
      }
      span.textContent = label + '  ' + (p.score || 0) + extraTxt;
      el.appendChild(span);
    }
    pill({
      id: me.id, name: me.name, score: G.score,
      stroke: G.stroke, strokes: G.strokes, doneChar: G.charDone
    });
    others.forEach(pill);
  }

  function renderLobby() {
    fillPills($('lobbyPeople'), {});
    $('lobbyWait').textContent = versusOn()
      ? 'Friend is here — starting…'
      : 'Waiting for a friend…';
    $('scoreChip').textContent = '';
  }

  function renderVersus() {
    var el = $('versus');
    if (!G.friend) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    var outcome = vsOutcome();
    fillPills(el, { outcome: outcome });
    var note = document.createElement('p');
    note.className = 'note';
    if (!versusOn()) {
      note.textContent = 'Press Invite in the bar above to send the link.';
    } else if (outcome && outcome.kind === 'win') {
      note.textContent = (outcome.winner.id === me.id ? 'You' : (outcome.winner.name || 'They')) +
        ' — first to ' + TARGET_N + ' clean.';
    } else if (outcome && outcome.kind === 'draw') {
      note.textContent = 'Draw.';
    } else if (G.charDone && others.some(function (p) { return !p.doneChar; })) {
      note.textContent = 'Waiting — they are still tracing this one.';
    } else {
      note.textContent = 'Same character. First to ' + TARGET_N + ' clean.';
    }
    el.appendChild(note);
  }

  function renderQuiz() {
    var waiting = G.friend && !racing();
    $('waitNote').hidden = !waiting;
    paintHud();
    $('watchBtn').disabled = G.charDone || G.watching;
    $('retryBtn').disabled = waiting;
    $('skipBtn').disabled = waiting || G.charDone || G.friend;
  }

  function render() {
    if (G.screen === 'home') renderHome();
    else if (G.screen === 'lobby') renderLobby();
    else if (G.screen === 'quiz') {
      renderQuiz();
      renderVersus();
      var outcome = vsOutcome();
      if (G.friend && outcome && (outcome.kind === 'win' || outcome.kind === 'draw') && G.charDone) {
        showDone();
        return;
      }
    } else {
      $('scoreChip').textContent = String(G.score);
      renderVersus();
      paintMissed();
      $('againBtn').textContent = G.friend ? 'Play again' : 'Again';
      if (G.friend) $('doneTitle').textContent = vsDoneTitle();
    }
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function bindSeg(el, attr, fn) {
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      fn(b.getAttribute(attr));
    });
  }
  bindSeg($('levelSeg'), 'data-level', function (v) {
    G.level = v | 0;
    saveSoon();
    renderHome();
  });

  $('outlineBtn').addEventListener('click', function () {
    G.outline = !G.outline;
    saveSoon();
    renderHome();
  });
  $('revealBtn').addEventListener('click', function () {
    G.reveal = !G.reveal;
    saveSoon();
    renderHome();
  });
  $('startBtn').addEventListener('click', function () { startDrill({}); });
  $('freshBtn').addEventListener('click', function () { startDrill({}); });
  $('continueBtn').addEventListener('click', function () { startDrill({ resume: true }); });
  $('reviewBtn').addEventListener('click', function () { startDrill({ review: true }); });
  $('reviewDoneBtn').addEventListener('click', function () { startDrill({ review: true }); });
  $('friendBtn').addEventListener('click', function () {
    if (!api) return;
    G.friend = true;
    ensureMatch(true);
    show('lobby');
    publishMe();
    render();
  });
  $('lobbyBack').addEventListener('click', function () { goHome(); });
  $('againBtn').addEventListener('click', function () {
    if (G.friend) {
      G.ready = true;
      publishMe();
      maybeNewRound();
      show('quiz');
      render();
      return;
    }
    startDrill({});
  });
  $('homeBtn').addEventListener('click', function () { goHome(); });
  $('backBtn').addEventListener('click', function () { goHome(); });
  $('watchBtn').addEventListener('click', function () {
    if (!writer || G.charDone || G.watching) return;
    G.watching = true;
    writer.cancelQuiz();
    writer.animateCharacter({
      onComplete: function () {
        G.watching = false;
        startQuizOn(currentChar());
      }
    });
    $('feedback').className = 'feedback';
    $('feedback').textContent = 'Watching the order…';
  });
  $('retryBtn').addEventListener('click', function () {
    if (!currentChar()) return;
    startQuizOn(currentChar());
  });
  $('skipBtn').addEventListener('click', function () {
    var ch = currentChar();
    if (ch && G.missed.indexOf(ch) < 0) G.missed.push(ch);
    G.wrong++;
    G.charDone = true;
    nextChar();
  });
  $('nextBtn').addEventListener('click', function () { nextChar(); });
  $('jumpIn').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var ch = ($('jumpIn').value || '').trim();
    if (!ch) return;
    ch = ch.charAt(0);
    if (!hasChar(ch)) {
      $('homeErr').hidden = false;
      $('homeErr').textContent = 'No stroke data for ' + ch + ' in this file (HSK 1–3).';
      return;
    }
    $('homeErr').hidden = true;
    startDrill({ one: ch });
  });

  if (api && api.onBack) {
    api.onBack(function () {
      if (G.screen !== 'home') { goHome(); return true; }
      return false;
    });
  }

  window.addEventListener('resize', function () { sizeWriter(false); });

  function goHome() {
    if (G.screen === 'quiz' && !G.friend && G.deck.length && G.i < G.deck.length) {
      G.solo = snapshotSolo();
    }
    if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
    G.friend = false;
    G.charDone = false;
    G.watching = false;
    show('home');
    saveSoon();
    publishMe();
  }

  function saveSoon() {
    if (!prefsDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 180);
  }
  function save() {
    if (!prefsDb) return;
    prefsDb.put({
      id: 'setup',
      level: G.level,
      outline: G.outline,
      reveal: G.reveal,
      missed: G.missed.slice()
    }).catch(function () {});
    var solo = (!G.friend && G.screen === 'quiz' && G.deck.length && G.i < G.deck.length)
      ? snapshotSolo()
      : G.solo;
    if (solo && solo.deck && solo.deck.length) {
      prefsDb.put({
        id: 'solo',
        deck: solo.deck.slice(),
        i: solo.i,
        score: solo.score,
        doneN: solo.doneN,
        wrong: solo.wrong,
        level: solo.level,
        missed: solo.missed ? solo.missed.slice() : []
      }).catch(function () {});
    } else {
      prefsDb.put({ id: 'solo', deck: [] }).catch(function () {});
    }
    if (G.stats) {
      prefsDb.put({ id: 'stats', map: G.stats }).catch(function () {});
    }
  }
  function restorePrefs(rows) {
    var by = {};
    (rows || []).forEach(function (r) { if (r && r.id) by[r.id] = r; });
    if (by.setup) {
      if (by.setup.level != null) G.level = by.setup.level | 0;
      if (by.setup.outline != null) G.outline = !!by.setup.outline;
      if (by.setup.reveal != null) G.reveal = !!by.setup.reveal;
      if (Array.isArray(by.setup.missed)) G.missed = by.setup.missed.slice();
    }
    if (by.solo && Array.isArray(by.solo.deck) && by.solo.deck.length && (by.solo.i | 0) < by.solo.deck.length) {
      G.solo = {
        deck: by.solo.deck.slice(),
        i: by.solo.i | 0,
        score: by.solo.score | 0,
        doneN: by.solo.doneN | 0,
        wrong: by.solo.wrong | 0,
        level: by.solo.level != null ? by.solo.level : G.level,
        missed: Array.isArray(by.solo.missed) ? by.solo.missed.slice() : []
      };
    }
    if (by.stats && by.stats.map && typeof by.stats.map === 'object') {
      G.stats = by.stats.map;
    } else {
      G.stats = {};
    }
  }

  function publishMe() {
    if (!playersDb || !me.id || me.id === 'local') return;
    var t = targetOf();
    var done = !!G.doneAt || (G.friend && G.score >= t);
    playersDb.put({
      id: me.id,
      name: me.name,
      score: G.score,
      wrong: G.wrong,
      i: G.i,
      stroke: G.stroke,
      strokes: G.strokes,
      mistakes: G.mistakes,
      doneChar: !!G.charDone,
      done: done,
      doneAt: G.doneAt || 0,
      at: now(),
      seen: now(),
      round: vsRound,
      ready: !!G.ready,
      friend: !!G.friend
    }).catch(function () {});
  }

  function ingestPlayers(list) {
    var t = now();
    others = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === me.id) return;
      if (!p.seen || t - p.seen > STALE_MS) return;
      others.push({
        id: p.id,
        name: p.name || 'Friend',
        score: p.score || 0,
        wrong: p.wrong || 0,
        i: p.i || 0,
        stroke: p.stroke || 0,
        strokes: p.strokes || 0,
        mistakes: p.mistakes || 0,
        doneChar: !!p.doneChar,
        done: !!p.done,
        doneAt: p.doneAt || 0,
        at: p.at || 0,
        round: p.round || 0,
        ready: !!p.ready,
        seen: p.seen,
        friend: !!p.friend
      });
    });
    if (versusOn() && G.friend) {
      ensureMatch(false);
      if (G.screen === 'lobby') {
        startDrill({ friend: true });
        return;
      }
      maybeAdvanceTogether();
      maybeNewRound();
    } else if (versusOn() && others.some(function (p) { return p.friend; }) &&
        (G.screen === 'home' || G.screen === 'lobby')) {
      G.friend = true;
      ensureMatch(false);
      startDrill({ friend: true });
      return;
    }
    render();
  }

  function applyMatch(m) {
    if (!m || !Array.isArray(m.deck) || !m.deck.length) return;
    var r = m.round || 1;
    var idx = m.i | 0;
    var sameDeck = G.deck.join('\0') === m.deck.join('\0');
    vsRound = r;
    if (m.level != null) G.level = m.level | 0;
    if (m.outline != null) G.outline = !!m.outline;
    if (!sameDeck) {
      G.deck = m.deck.slice();
      G.i = idx;
      G.score = 0;
      G.doneN = 0;
      G.wrong = 0;
      G.doneAt = 0;
      G.ready = false;
      G.charDone = false;
      if (G.friend && G.screen !== 'lobby') {
        show('quiz');
        startQuizOn(currentChar());
      }
    } else if (idx !== G.i && G.friend) {
      G.i = idx;
      G.charDone = false;
      G.ready = false;
      startQuizOn(currentChar());
    }
    publishMe();
  }

  function ingestMatch(list) {
    match = (list || []).find(function (x) { return x && x.id === 'm'; }) || null;
    if (G.friend || (match && versusOn())) applyMatch(match);
    render();
  }

  function ensureMatch(force) {
    if (!matchDb) return;
    if (match && match.deck && match.deck.length && !force) {
      applyMatch(match);
      return;
    }
    if (!iAmManager()) {
      if (match && match.deck) applyMatch(match);
      return;
    }
    var seed = (now() ^ ((Math.random() * 0xffffffff) | 0)) >>> 0;
    var deck = buildDeck(G.level, seed);
    match = {
      id: 'm',
      seed: seed,
      deck: deck,
      i: 0,
      level: G.level,
      outline: G.outline,
      round: force && match && match.round ? (match.round | 0) + 1 : 1,
      startedAt: now()
    };
    vsRound = match.round;
    matchDb.put(match).catch(function () {});
    applyMatch(match);
  }

  function allOnThisCharDone() {
    if (!G.charDone) return false;
    if (!versusOn()) return true;
    var i;
    for (i = 0; i < others.length; i++) {
      if (others[i].round !== vsRound) continue;
      if ((others[i].i | 0) !== G.i) continue;
      if (!others[i].doneChar) return false;
    }
    return true;
  }

  function maybeAdvanceTogether() {
    if (!G.friend || !iAmManager() || !matchDb) return;
    if (!allOnThisCharDone()) return;
    if (G.score >= targetOf() || others.some(function (p) { return p.score >= targetOf(); })) {
      return;
    }
    nextChar();
  }

  function anyoneReady() {
    if (G.ready) return true;
    var i;
    for (i = 0; i < others.length; i++) {
      if (others[i].round === vsRound && others[i].ready) return true;
    }
    return false;
  }
  function maybeNewRound() {
    if (!G.friend || !iAmManager() || !matchDb) return;
    var o = vsOutcome();
    if (!o || (o.kind !== 'win' && o.kind !== 'draw')) return;
    if (!anyoneReady()) return;
    var cur = match && match.round ? match.round : (vsRound || 1);
    if (cur !== vsRound) return;
    var seed = (now() ^ ((Math.random() * 0xffffffff) | 0)) >>> 0;
    match = {
      id: 'm',
      seed: seed,
      deck: buildDeck(G.level, seed),
      i: 0,
      level: G.level,
      outline: G.outline,
      round: cur + 1,
      startedAt: now()
    };
    matchDb.put(match).catch(function () {});
    G.score = 0; G.doneN = 0; G.wrong = 0; G.doneAt = 0; G.ready = false;
    applyMatch(match);
    show('quiz');
    startQuizOn(currentChar());
    render();
  }

  function beat() { if (G.friend || versusOn()) publishMe(); }

  function takeLaunch() {
    if (!api || !api.launch || launched) return;
    launched = true;
    api.launch().then(function (go) {
      if (!go || !go.char) return;
      var ch = String(go.char).charAt(0);
      if (!hasChar(ch)) {
        $('homeErr').hidden = false;
        $('homeErr').textContent = 'No stroke data for ' + ch + ' in this file.';
        return;
      }
      startDrill({ one: ch });
    }).catch(function () {});
  }

  function boot() {
    G.stats = {};
    renderHome();
    var who = api && api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    who.then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      var pPrefs = prefsDb ? prefsDb.getAll() : Promise.resolve([]);
      return pPrefs.then(function (rows) {
        restorePrefs(rows);
        render();
        if (playersDb) playersDb.subscribe(function (list) { ingestPlayers(list || []); });
        if (matchDb) matchDb.subscribe(function (list) { ingestMatch(list || []); });
        publishMe();
        if (hbTimer) clearInterval(hbTimer);
        hbTimer = setInterval(beat, HB_MS);
        takeLaunch();
      });
    }).catch(function () { render(); takeLaunch(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
