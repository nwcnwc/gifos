/*
 * Hangman — classic-script port of simonjsuh/Vanilla-Javascript-Hangman-Game.
 *
 * Upstream is Bootstrap + innerHTML + a CDN. GifOS inlines <script src> and
 * drops type=module, and the sandbox has nowhere to fetch a CDN from, so this
 * file is ordinary classic JS: same fourteen words, six wrong guesses,
 * gifos.db instead of a reload. The gallows is drawn here so it reads on a
 * phone; the original frames still travel in the GIF.
 *
 * Versus: same word. Race — first to finish it wins; each person writes ONLY
 * their own players row, and only a wrong-guess COUNT (never the letters).
 * Share the rope — union of letters, one gallows. Invite is OS chrome — this
 * app does not draw an invite button.
 */
(function (root) {
  'use strict';

  var WORDS = [
    'python', 'javascript', 'mongodb', 'json', 'java', 'html', 'css',
    'c', 'csharp', 'golang', 'kotlin', 'php', 'sql', 'ruby'
  ];
  var ALPHA = 'abcdefghijklmnopqrstuvwxyz';
  var KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  var MAX_WRONG = 6;
  var STALE_MS = 9000, HB_MS = 3000;

  function spotlight(answer, guessed) {
    return answer.split('').map(function (ch) {
      return guessed.indexOf(ch) >= 0 ? ch : '_';
    }).join('');
  }
  function wrongOf(answer, guessed) {
    return guessed.filter(function (l) { return answer.indexOf(l) < 0; });
  }
  function wonOf(answer, guessed) {
    if (!answer) return false;
    return answer.split('').every(function (ch) { return guessed.indexOf(ch) >= 0; });
  }
  function lostOf(answer, guessed) {
    return wrongOf(answer, guessed).length >= MAX_WRONG;
  }
  function randomWord() {
    return WORDS[(Math.random() * WORDS.length) | 0];
  }

  root.HangmanRules = {
    words: WORDS.slice(),
    maxWrong: MAX_WRONG,
    spotlight: spotlight,
    wrongOf: wrongOf,
    wonOf: wonOf,
    lostOf: lostOf
  };

  var $ = function (id) { return document.getElementById(id); };

  var G = {
    answer: randomWord(),
    guessed: [],
    gameState: 'playing',
    mode: 'race',
    wins: 0,
    losses: 0,
    ready: false,
    solvedAt: 0
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
  var toastTimer = 0;
  var saveTimer = 0;
  var keysBuilt = false;
  var meterBuilt = false;

  function versusOn() { return others.length > 0; }
  function now() { return Date.now(); }
  function iAmManager() {
    var ids = [me.id].concat(others.map(function (p) { return p.id; }));
    ids.sort();
    return ids[0] === me.id;
  }
  function sharing() { return versusOn() && G.mode === 'share'; }

  function unionGuessed() {
    var set = {}, i, p, g;
    for (i = 0; i < G.guessed.length; i++) set[G.guessed[i]] = true;
    for (i = 0; i < others.length; i++) {
      p = others[i];
      if (p.round !== vsRound) continue;
      g = p.guessed || [];
      for (var j = 0; j < g.length; j++) set[g[j]] = true;
    }
    return ALPHA.split('').filter(function (l) { return set[l]; });
  }

  function lettersInPlay() {
    return sharing() ? unionGuessed() : G.guessed.slice();
  }

  function statusOf() {
    var guessed = lettersInPlay();
    var wrong = wrongOf(G.answer, guessed);
    var won = wonOf(G.answer, guessed);
    var lost = lostOf(G.answer, guessed);
    return {
      guessed: guessed,
      wrong: wrong,
      mistakes: wrong.length,
      won: won,
      lost: lost,
      spotlight: spotlight(G.answer, guessed)
    };
  }

  function syncState() {
    var st = statusOf();
    if (st.won) G.gameState = 'won';
    else if (st.lost) G.gameState = 'lost';
    else G.gameState = 'playing';
    return st;
  }

  function resetRound(answer, keepStats) {
    G.answer = (answer || randomWord()).toLowerCase();
    G.guessed = [];
    G.gameState = 'playing';
    G.ready = false;
    G.solvedAt = 0;
    if (!keepStats) { /* streaks live on G */ }
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1600);
  }

  function handleGuess(letter) {
    letter = String(letter || '').toLowerCase();
    if (!letter || ALPHA.indexOf(letter) < 0) return;
    if (G.gameState !== 'playing') return;
    var outcome = vsOutcome();
    if (versusOn() && outcome && outcome.kind === 'win') return;
    var inPlay = lettersInPlay();
    if (inPlay.indexOf(letter) >= 0) return;
    G.guessed.push(letter);
    var before = G.gameState;
    var st = syncState();
    if (st.won && !G.solvedAt) G.solvedAt = now();
    if (!versusOn()) {
      if (st.won && before === 'playing') G.wins++;
      if (st.lost && before === 'playing') G.losses++;
    }
    saveSoon();
    publishMe();
    render();
  }

  function playAgain() {
    if (versusOn()) {
      G.ready = true;
      publishMe();
      maybeNewRound();
      render();
      return;
    }
    resetRound(randomWord());
    saveSoon();
    render();
  }

  function fillMeter(el, n) {
    if (!el) return;
    var dots = el.querySelectorAll('i');
    if (!dots.length) {
      var i;
      for (i = 0; i < MAX_WRONG; i++) el.appendChild(document.createElement('i'));
      dots = el.querySelectorAll('i');
    }
    for (var j = 0; j < dots.length; j++) {
      dots[j].className = j < n ? 'bad' : '';
    }
  }

  function buildKeyboard() {
    var root = $('keyboard');
    if (keysBuilt) return;
    keysBuilt = true;
    KEYS.forEach(function (row, idx) {
      var div = document.createElement('div');
      div.className = 'krow' + (idx === 1 ? ' mid' : idx === 2 ? ' bot' : '');
      row.split('').forEach(function (letter) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key';
        btn.setAttribute('data-k', letter);
        btn.textContent = letter;
        btn.addEventListener('click', function () { handleGuess(letter); });
        div.appendChild(btn);
      });
      root.appendChild(div);
    });
  }

  function renderKeyboard(st) {
    buildKeyboard();
    var playing = G.gameState === 'playing';
    var outcome = vsOutcome();
    if (versusOn() && outcome && outcome.kind === 'win') playing = false;
    var keys = $('keyboard').querySelectorAll('[data-k]');
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].getAttribute('data-k');
      var used = st.guessed.indexOf(k) >= 0;
      keys[i].disabled = !playing || used;
      keys[i].className = 'key' + (used ? (G.answer.indexOf(k) >= 0 ? ' ok' : ' bad') : '');
    }
  }

  function renderPicture(mistakes) {
    var n = mistakes;
    if (n < 0) n = 0;
    if (n > MAX_WRONG) n = MAX_WRONG;
    var svg = $('gallows');
    svg.setAttribute('data-n', String(n));
    svg.classList.toggle('lost', n >= MAX_WRONG);
    var parts = svg.querySelectorAll('[data-part]');
    for (var i = 0; i < parts.length; i++) {
      var need = parseInt(parts[i].getAttribute('data-part'), 10);
      if (n >= need) parts[i].classList.add('on');
      else parts[i].classList.remove('on');
    }
    if (!meterBuilt) {
      fillMeter($('meter'), 0);
      meterBuilt = true;
    }
    fillMeter($('meter'), n);
  }

  function renderWord(st) {
    var el = $('wordSpotlight');
    el.textContent = '';
    var letters = G.answer.split('');
    for (var i = 0; i < letters.length; i++) {
      var ch = letters[i];
      var known = st.guessed.indexOf(ch) >= 0;
      var reveal = st.lost && !known;
      var span = document.createElement('span');
      span.className = 'slot' + (known ? ' on' : '') + (reveal ? ' reveal' : '');
      span.textContent = (known || reveal) ? ch : '';
      el.appendChild(span);
    }
  }

  function vsOutcome() {
    if (!versusOn()) return null;
    if (sharing()) {
      var st = statusOf();
      if (st.won) return { kind: 'win', winner: { id: 'all', name: 'You all', guesses: st.guessed.length } };
      if (st.lost) return { kind: 'draw' };
      return { kind: 'playing' };
    }
    var mine = {
      id: me.id, name: me.name,
      mistakes: wrongOf(G.answer, G.guessed).length,
      solved: wonOf(G.answer, G.guessed),
      done: G.gameState !== 'playing',
      solvedAt: G.solvedAt || 0,
      at: now(), round: vsRound
    };
    var rows = [mine].concat(others.filter(function (p) { return p.round === vsRound; }));
    var solved = rows.filter(function (p) { return p.solved; });
    var playing = rows.filter(function (p) { return !p.done && !p.solved; });
    if (!solved.length) {
      if (rows.length >= 2 && !playing.length) return { kind: 'draw' };
      return { kind: 'playing' };
    }
    solved.sort(function (a, b) { return (a.solvedAt || a.at || 0) - (b.solvedAt || b.at || 0); });
    return { kind: 'win', winner: solved[0] };
  }

  function anyoneGuessedThisRound() {
    if (G.guessed.length > 0) return true;
    for (var i = 0; i < others.length; i++) {
      var p = others[i];
      if (p.round !== vsRound) continue;
      if ((p.guessed && p.guessed.length) || p.mistakes || p.solved || p.done) return true;
    }
    return false;
  }

  function renderVersus() {
    var el = $('versus');
    var pills = $('vsPills');
    var note = $('vsNote');
    if (!versusOn()) {
      el.hidden = true;
      pills.textContent = '';
      note.textContent = '';
      return;
    }
    el.hidden = false;
    pills.textContent = '';
    var outcome = vsOutcome();

    function pill(p) {
      if (!p) return;
      var span = document.createElement('span');
      var cls = 'pill' + (p.id === me.id ? ' me' : '');
      if (outcome && outcome.kind === 'win' && outcome.winner && outcome.winner.id === p.id) cls += ' win';
      if (p.done && !p.solved && !sharing()) cls += ' dead';
      span.className = cls;
      var name = document.createElement('b');
      name.textContent = p.id === me.id ? 'You' : (p.name || 'Friend');
      span.appendChild(name);
      if (!sharing()) {
        var m = document.createElement('span');
        m.className = 'meter';
        fillMeter(m, p.mistakes || 0);
        span.appendChild(m);
      }
      pills.appendChild(span);
    }
    pill({
      id: me.id, name: me.name,
      mistakes: wrongOf(G.answer, G.guessed).length,
      solved: wonOf(G.answer, G.guessed),
      done: G.gameState !== 'playing'
    });
    others.forEach(pill);

    var roundOver = !!(outcome && (outcome.kind === 'win' || outcome.kind === 'draw'));
    var canSwitch = iAmManager() && (!anyoneGuessedThisRound() || roundOver);
    ['race', 'share'].forEach(function (m) {
      var b = m === 'race' ? $('modeRace') : $('modeShare');
      b.className = G.mode === m ? 'on' : '';
      b.disabled = !canSwitch;
    });

    if (sharing()) {
      if (outcome && outcome.kind === 'win') note.textContent = 'Got it — together.';
      else if (outcome && outcome.kind === 'draw') note.textContent = 'The rope ran out.';
      else note.textContent = 'Share — one rope. Every letter anyone tries is on it.';
    } else if (outcome && outcome.kind === 'win') {
      note.textContent = (outcome.winner.id === me.id ? 'You win' : (outcome.winner.name || 'They') + ' wins') + ' — first to finish it.';
    } else if (outcome && outcome.kind === 'draw') {
      note.textContent = 'Draw — nobody got it.';
    } else {
      note.textContent = 'Race — same word, your own rope. First to finish it wins.';
    }
  }

  function renderRecord() {
    var el = $('record');
    if (versusOn() || (G.wins + G.losses) === 0) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = G.wins + '–' + G.losses;
  }

  function render() {
    var st = syncState();
    $('maxWrong').textContent = String(MAX_WRONG);
    $('mistakes').textContent = String(st.mistakes);
    renderPicture(st.mistakes);
    renderWord(st);
    var banner = $('banner');
    var outcome = vsOutcome();
    var prompt = $('prompt');
    if (st.won) {
      banner.hidden = false;
      banner.className = 'banner win';
      banner.textContent = sharing() ? 'You got it — together!' : 'You won!';
      prompt.textContent = 'A programming language';
    } else if (st.lost) {
      banner.hidden = false;
      banner.className = 'banner lost';
      banner.textContent = sharing() ? 'The rope ran out.' : 'The word was ' + G.answer + '.';
      prompt.textContent = 'A programming language';
    } else if (versusOn() && outcome && outcome.kind === 'win' && outcome.winner.id !== me.id && outcome.winner.id !== 'all') {
      banner.hidden = false;
      banner.className = 'banner';
      banner.textContent = (outcome.winner.name || 'They') + ' got it first.';
      prompt.textContent = 'A programming language';
    } else {
      banner.hidden = true;
      banner.textContent = '';
      prompt.textContent = 'A programming language';
    }
    renderKeyboard(st);
    renderVersus();
    renderRecord();
    var again = $('playAgain');
    if (versusOn()) {
      again.hidden = !(outcome && (outcome.kind === 'win' || outcome.kind === 'draw'));
    } else {
      again.hidden = G.gameState === 'playing';
    }
    again.textContent = versusOn() ? (G.ready ? 'Waiting…' : 'Play again') : 'New word';
  }

  function setMode(mode) {
    if (mode !== 'race' && mode !== 'share') return;
    if (!versusOn() || !iAmManager() || !matchDb) return;
    if (G.mode === mode && match && match.mode === mode) return;
    var outcome = vsOutcome();
    var roundOver = !!(outcome && (outcome.kind === 'win' || outcome.kind === 'draw'));
    var guessedAny = anyoneGuessedThisRound();
    if (guessedAny && !roundOver) {
      toast('Finish this word first.');
      return;
    }
    var next = {
      id: 'm',
      word: G.answer,
      round: vsRound || 1,
      mode: mode,
      startedAt: (match && match.startedAt) || now()
    };
    if (guessedAny) {
      next.word = randomWord();
      next.round = (vsRound || 1) + 1;
      next.startedAt = now();
    }
    match = next;
    matchDb.put(match).catch(function () {});
    applyMatch(match);
    render();
  }

  if (typeof document !== 'undefined') {
    $('playAgain').addEventListener('click', playAgain);
    $('modeRace').addEventListener('click', function () { setMode('race'); });
    $('modeShare').addEventListener('click', function () { setMode('share'); });

    document.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      var letter = ev.key.toLowerCase();
      if (ALPHA.indexOf(letter) >= 0 && ev.key.length === 1) { handleGuess(letter); ev.preventDefault(); }
    });
  }

  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 200);
  }

  function save() {
    if (!prefsDb) return;
    prefsDb.put({
      id: 'stats',
      wins: G.wins,
      losses: G.losses
    }).catch(function () {});
    if (!versusOn()) {
      prefsDb.put({
        id: 'solo',
        answer: G.answer,
        guessed: G.guessed.slice(),
        gameState: G.gameState
      }).catch(function () {});
    }
  }

  function restorePrefs(rows) {
    var by = {};
    (rows || []).forEach(function (r) { if (r && r.id) by[r.id] = r; });
    if (by.stats) {
      G.wins = by.stats.wins || 0;
      G.losses = by.stats.losses || 0;
    }
    if (by.solo && by.solo.answer && !versusOn()) {
      G.answer = String(by.solo.answer).toLowerCase();
      G.guessed = Array.isArray(by.solo.guessed) ? by.solo.guessed.slice() : [];
      syncState();
    }
  }

  function publishMe() {
    if (!playersDb || !me.id || me.id === 'local') return;
    var row = {
      id: me.id,
      name: me.name,
      mistakes: wrongOf(G.answer, G.guessed).length,
      solved: wonOf(G.answer, G.guessed),
      done: G.gameState !== 'playing',
      solvedAt: G.solvedAt || 0,
      at: now(),
      round: vsRound,
      ready: !!G.ready,
      seen: now(),
      mode: G.mode
    };
    // Race: guess counts only — never the letters. Share: letters must ride
    // so the union is the one rope.
    if (sharing()) row.guessed = G.guessed.slice();
    playersDb.put(row).catch(function () {});
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
        mistakes: p.mistakes || 0,
        solved: !!p.solved,
        done: !!p.done,
        solvedAt: p.solvedAt || 0,
        at: p.at || 0,
        round: p.round || 0,
        ready: !!p.ready,
        seen: p.seen,
        guessed: Array.isArray(p.guessed) ? p.guessed.slice() : []
      });
    });
    if (versusOn()) {
      ensureMatch();
      maybeNewRound();
    }
    render();
  }

  function applyMatch(m) {
    if (!m || !m.word) return;
    var r = m.round || 1;
    var word = String(m.word).toLowerCase();
    var mode = m.mode === 'share' ? 'share' : 'race';
    if (r === vsRound && G.answer === word && G.mode === mode) return;
    var sameRound = r === vsRound && G.answer === word;
    vsRound = r;
    G.mode = mode;
    if (!sameRound) resetRound(word);
    publishMe();
  }

  function ingestMatch(list) {
    match = (list || []).find(function (x) { return x && x.id === 'm'; }) || null;
    if (versusOn()) applyMatch(match);
    render();
  }

  function ensureMatch() {
    if (!matchDb || !versusOn()) return;
    if (match && match.word) { applyMatch(match); return; }
    if (!iAmManager()) return;
    var word = randomWord();
    match = { id: 'm', word: word, round: 1, mode: G.mode || 'race', startedAt: now() };
    matchDb.put(match).catch(function () {});
    applyMatch(match);
  }

  function allLiveDone() {
    var outcome = vsOutcome();
    if (!outcome) return false;
    return outcome.kind === 'win' || outcome.kind === 'draw';
  }
  function anyoneReady() {
    if (G.ready) return true;
    for (var i = 0; i < others.length; i++) {
      if (others[i].round === vsRound && others[i].ready) return true;
    }
    return false;
  }
  function maybeNewRound() {
    if (!versusOn() || !iAmManager() || !matchDb) return;
    if (!allLiveDone() || !anyoneReady()) return;
    var cur = match && match.round ? match.round : (vsRound || 1);
    if (cur !== vsRound) return;
    var word = randomWord();
    match = { id: 'm', word: word, round: cur + 1, mode: G.mode, startedAt: now() };
    matchDb.put(match).catch(function () {});
    applyMatch(match);
    render();
  }

  function beat() { publishMe(); }

  function boot() {
    $('maxWrong').textContent = String(MAX_WRONG);
    render();
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
      });
    }).catch(function () {
      render();
    });
  }

  if (typeof document !== 'undefined') boot();
})(this);
