/*
 * Word Master — classic-script port of octokatherine/word-master.
 *
 * Upstream is CRA/React (type=module). GifOS inlines <script src> and drops
 * that attribute, so this file is ordinary classic JS: same colouring rules,
 * same word lists (words.js), gifos.db instead of localStorage.
 *
 * Versus: same secret word. Each person writes ONLY their own players row,
 * and only a guess COUNT (never the word, never the letters). Invite is OS
 * chrome — this app does not draw an invite button.
 */
(function () {
  'use strict';

  var ROWS = 6, COLS = 5;
  var KEYS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var STALE_MS = 9000, HB_MS = 3000;
  var DIFF_HINT = {
    easy: 'Guess any 5 letters',
    normal: 'Guess any valid word',
    hard: 'Guess any valid word using all the hints you have been given'
  };

  var $ = function (id) { return document.getElementById(id); };
  var answers = (typeof WM_ANSWERS !== 'undefined' && WM_ANSWERS) || [];
  var words = (typeof WM_WORDS !== 'undefined' && WM_WORDS) || {};

  function emptyBoard() {
    var b = [], r, c;
    for (r = 0; r < ROWS; r++) { b[r] = []; for (c = 0; c < COLS; c++) b[r][c] = ''; }
    return b;
  }
  function emptyStatuses() {
    var b = [], r, c;
    for (r = 0; r < ROWS; r++) { b[r] = []; for (c = 0; c < COLS; c++) b[r][c] = 'unguessed'; }
    return b;
  }
  function emptyLetters() {
    var o = {}, i;
    for (i = 0; i < LETTERS.length; i++) o[LETTERS[i]] = 'unguessed';
    return o;
  }
  function randomAnswer() {
    if (!answers.length) return 'CRANE';
    return answers[(Math.random() * answers.length) | 0];
  }
  function cloneBoard(src) {
    return src.map(function (row) { return row.slice(); });
  }

  var G = {
    answer: randomAnswer(),
    gameState: 'playing',
    board: emptyBoard(),
    cellStatuses: emptyStatuses(),
    currentRow: 0,
    currentCol: 0,
    letterStatuses: emptyLetters(),
    submittedInvalid: false,
    exactGuesses: {},
    darkMode: true,
    difficulty: 'normal',
    currentStreak: 0,
    longestStreak: 0,
    guessesInStreak: 0,
    firstTime: true,
    ready: false
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
  var openModal = null;
  var saveTimer = 0;
  var loaded = false;

  function versusOn() { return others.length > 0; }
  function now() { return Date.now(); }

  function iAmManager() {
    var ids = [me.id].concat(others.map(function (p) { return p.id; }));
    ids.sort();
    return ids[0] === me.id;
  }

  function resetRound(answer, keepStats) {
    G.answer = (answer || randomAnswer()).toUpperCase();
    G.gameState = 'playing';
    G.board = emptyBoard();
    G.cellStatuses = emptyStatuses();
    G.currentRow = 0;
    G.currentCol = 0;
    G.letterStatuses = emptyLetters();
    G.submittedInvalid = false;
    G.exactGuesses = {};
    G.ready = false;
    if (!keepStats) { /* streaks live on G */ }
  }

  function applyDark() {
    document.documentElement.classList.toggle('light', !G.darkMode);
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1600);
  }

  function isValidWord(word) {
    if (word.length < 5) return [false, 'Please enter a 5 letter word'];
    var diff = versusOn() ? 'normal' : G.difficulty;
    if (diff === 'easy') return [true];
    if (!words[word.toLowerCase()]) return [false, word + ' is not a valid word. Please try again.'];
    if (diff === 'normal') return [true];
    var letter, yellowsUsed = true;
    for (letter in G.letterStatuses) {
      if (!Object.prototype.hasOwnProperty.call(G.letterStatuses, letter)) continue;
      var st = G.letterStatuses[letter];
      if ((st === 'yellow' || st === 'green') && word.indexOf(letter) < 0) yellowsUsed = false;
    }
    var greensUsed = true, pos;
    for (pos in G.exactGuesses) {
      if (word[parseInt(pos, 10)] !== G.exactGuesses[pos]) greensUsed = false;
    }
    if (!yellowsUsed || !greensUsed) {
      return [false, 'In hard mode, you must use all the hints you have been given.'];
    }
    return [true];
  }

  // Upstream colouring: gray all, then greens (from the end, splicing the
  // remaining answer letters), then yellows against what is left.
  function colorRow(word, row) {
    var statuses = G.cellStatuses[row].slice();
    var answerLetters = G.answer.split('');
    var i, fixed = {};
    for (i = 0; i < COLS; i++) statuses[i] = 'gray';
    for (i = COLS - 1; i >= 0; i--) {
      if (word[i] === G.answer[i]) {
        statuses[i] = 'green';
        answerLetters.splice(i, 1);
        fixed[i] = G.answer[i];
      }
    }
    for (i = 0; i < COLS; i++) {
      if (statuses[i] !== 'green' && answerLetters.indexOf(word[i]) >= 0) {
        statuses[i] = 'yellow';
        answerLetters.splice(answerLetters.indexOf(word[i]), 1);
      }
    }
    G.cellStatuses[row] = statuses;
    for (i in fixed) G.exactGuesses[i] = fixed[i];

    var ls = G.letterStatuses;
    for (i = 0; i < COLS; i++) {
      if (ls[word[i]] === 'green') continue;
      if (word[i] === G.answer[i]) ls[word[i]] = 'green';
      else if (G.answer.indexOf(word[i]) >= 0) ls[word[i]] = 'yellow';
      else ls[word[i]] = 'gray';
    }
    return statuses.every(function (s) { return s === 'green'; });
  }

  function addLetter(letter) {
    if (G.gameState !== 'playing') return;
    G.submittedInvalid = false;
    if (G.currentCol > 4) return;
    G.board[G.currentRow][G.currentCol] = letter;
    if (G.currentCol < 5) G.currentCol++;
    render();
  }

  function onDelete() {
    if (G.gameState !== 'playing') return;
    G.submittedInvalid = false;
    if (G.currentCol === 0) return;
    G.board[G.currentRow][G.currentCol - 1] = '';
    G.currentCol--;
    render();
  }

  function onEnter() {
    if (G.gameState !== 'playing') return;
    var word = G.board[G.currentRow].join('');
    var check = isValidWord(word);
    if (!check[0]) {
      G.submittedInvalid = true;
      toast(check[1] || 'Not a valid word');
      render();
      return;
    }
    if (G.currentRow === 6) return;
    var won = colorRow(word, G.currentRow);
    G.currentRow++;
    G.currentCol = 0;
    G.submittedInvalid = false;
    if (!versusOn()) {
      if (G.guessesInStreak >= 0) G.guessesInStreak++;
    }
    if (won) {
      G.gameState = 'won';
      if (!versusOn()) {
        G.currentStreak++;
        if (G.currentStreak > G.longestStreak) G.longestStreak = G.currentStreak;
      }
    } else if (G.currentRow === 6) {
      G.gameState = 'lost';
      if (!versusOn()) {
        G.currentStreak = 0;
      }
    }
    saveSoon();
    publishMe();
    render();
    if (G.gameState !== 'playing') {
      setTimeout(function () { showEnd(); }, 450);
    }
  }

  function playAgain() {
    if (versusOn()) {
      G.ready = true;
      publishMe();
      maybeNewRound();
      hideModal('end');
      $('playAgain').hidden = true;
      render();
      return;
    }
    if (G.gameState === 'lost') G.guessesInStreak = 0;
    resetRound(randomAnswer());
    hideModal('end');
    saveSoon();
    render();
  }

  function showEnd() {
    var body = $('endBody');
    body.innerHTML = '';
    var h = document.createElement('h2');
    h.id = 'endTitle';
    var outcome = vsOutcome();
    if (versusOn() && outcome) {
      if (outcome.kind === 'win') {
        var mine = outcome.winner && outcome.winner.id === me.id;
        h.textContent = mine ? 'You win!' : 'They got it.';
        body.appendChild(h);
        var p = document.createElement('p');
        p.className = 'answer';
        var wname = outcome.winner.name || 'Player';
        p.textContent = wname + ' in ' + outcome.winner.guesses + ' guess' + (outcome.winner.guesses === 1 ? '' : 'es') + '.';
        body.appendChild(p);
        if (G.gameState === 'lost') {
          var a = document.createElement('p');
          a.className = 'answer';
          a.appendChild(document.createTextNode('The word was '));
          var s = document.createElement('strong');
          s.textContent = G.answer;
          a.appendChild(s);
          body.appendChild(a);
        }
      } else if (outcome.kind === 'draw') {
        h.textContent = 'Draw';
        body.appendChild(h);
        var d = document.createElement('p');
        d.className = 'answer';
        d.appendChild(document.createTextNode('The word was '));
        var ds = document.createElement('strong');
        ds.textContent = G.answer;
        d.appendChild(ds);
        body.appendChild(d);
      } else {
        h.textContent = G.gameState === 'won' ? 'You got it!' : 'Out of guesses';
        body.appendChild(h);
        var wait = document.createElement('p');
        wait.className = 'answer';
        wait.textContent = G.gameState === 'won'
          ? 'Waiting to see if they can do it in fewer.'
          : 'The word was ' + G.answer + '. They are still guessing.';
        body.appendChild(wait);
      }
    } else if (G.gameState === 'won') {
      h.textContent = 'Congrats! 🎉';
      body.appendChild(h);
      body.appendChild(stat('Current streak', G.currentStreak + (G.currentStreak >= 5 ? ' 🔥' : '')));
      if (G.currentStreak > 0 && G.guessesInStreak > 0) {
        body.appendChild(stat('Avg. guesses in streak', (G.guessesInStreak / G.currentStreak).toFixed(1)));
      }
      body.appendChild(stat('Longest streak', String(G.longestStreak)));
    } else {
      h.textContent = 'Oops!';
      body.appendChild(h);
      var miss = document.createElement('p');
      miss.className = 'answer';
      miss.appendChild(document.createTextNode('The word was '));
      var ms = document.createElement('strong');
      ms.textContent = G.answer;
      miss.appendChild(ms);
      body.appendChild(miss);
      body.appendChild(stat('Current streak', String(G.currentStreak)));
      body.appendChild(stat('Longest streak', String(G.longestStreak)));
    }
    showModal('end');
  }

  function stat(label, value) {
    var dl = document.createElement('div');
    dl.className = 'stat';
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
    return dl;
  }

  function tileClass(r, c, letter) {
    if (r === G.currentRow) {
      if (letter) return 'tile filled' + (G.submittedInvalid ? ' invalid' : '');
      return 'tile';
    }
    var st = G.cellStatuses[r][c];
    if (st === 'green' || st === 'yellow' || st === 'gray') return 'tile ' + st;
    return 'tile';
  }

  function renderBoard() {
    var board = $('board');
    if (!board.childElementCount) {
      var r, c, span;
      for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
        span = document.createElement('span');
        span.className = 'tile';
        span.setAttribute('aria-hidden', 'true');
        board.appendChild(span);
      }
    }
    var nodes = board.children;
    var i = 0, rr, cc, letter;
    for (rr = 0; rr < ROWS; rr++) for (cc = 0; cc < COLS; cc++, i++) {
      letter = G.board[rr][cc];
      nodes[i].textContent = letter;
      nodes[i].className = tileClass(rr, cc, letter);
    }
  }

  function renderKeyboard() {
    var root = $('keyboard');
    if (!root.childElementCount) {
      KEYS.forEach(function (row, idx) {
        var div = document.createElement('div');
        div.className = 'krow';
        if (idx === 2) {
          var ent = document.createElement('button');
          ent.type = 'button';
          ent.className = 'key wide';
          ent.textContent = 'ENTER';
          ent.addEventListener('click', onEnter);
          div.appendChild(ent);
        }
        row.forEach(function (letter) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'key';
          btn.setAttribute('data-k', letter);
          var inner = document.createElement('span');
          inner.textContent = letter;
          btn.appendChild(inner);
          btn.addEventListener('click', function () { addLetter(letter); });
          div.appendChild(btn);
        });
        if (idx === 2) {
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'key wide';
          del.setAttribute('aria-label', 'Delete');
          del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"/></svg>';
          del.addEventListener('click', onDelete);
          div.appendChild(del);
        }
        root.appendChild(div);
      });
    }
    var keys = root.querySelectorAll('[data-k]');
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].getAttribute('data-k');
      var st = G.letterStatuses[k] || 'unguessed';
      keys[i].firstChild.className = (st === 'green' || st === 'yellow' || st === 'gray') ? st : '';
    }
    root.style.visibility = G.gameState === 'playing' ? 'visible' : 'hidden';
  }

  function vsOutcome() {
    if (!versusOn()) return null;
    var mine = {
      id: me.id, name: me.name, guesses: G.currentRow,
      solved: G.gameState === 'won', done: G.gameState !== 'playing',
      at: now(), round: vsRound
    };
    var rows = [mine].concat(others.filter(function (p) { return p.round === vsRound; }));
    var done = rows.filter(function (p) { return p.done; });
    var solved = done.filter(function (p) { return p.solved; });
    var playing = rows.filter(function (p) { return !p.done; });
    if (!solved.length) {
      if (rows.length >= 2 && !playing.length) return { kind: 'draw' };
      return { kind: 'playing' };
    }
    solved.sort(function (a, b) { return a.guesses - b.guesses || a.at - b.at; });
    var best = solved[0];
    var canBeat = playing.some(function (p) { return p.guesses < best.guesses; });
    if (canBeat) return { kind: 'playing', leader: best };
    return { kind: 'win', winner: best };
  }

  function playerView(id) {
    if (id === me.id) {
      return {
        id: me.id, name: me.name, guesses: G.currentRow,
        solved: G.gameState === 'won', done: G.gameState !== 'playing',
        round: vsRound
      };
    }
    for (var i = 0; i < others.length; i++) if (others[i].id === id) return others[i];
    return null;
  }

  function renderVersus() {
    var el = $('versus');
    if (!versusOn()) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.innerHTML = '';
    var roster = [playerView(me.id)].concat(others);
    var outcome = vsOutcome();
    roster.forEach(function (p) {
      if (!p) return;
      var pill = document.createElement('span');
      pill.className = 'pill' + (p.id === me.id ? ' me' : '');
      if (outcome && outcome.kind === 'win' && outcome.winner && outcome.winner.id === p.id) pill.className += ' win';
      var label = p.id === me.id ? 'You' : (p.name || 'Friend');
      var extra = p.solved ? ' ✓' : (p.done ? ' ✕' : '');
      pill.textContent = label + ' · ' + (p.guesses || 0) + extra;
      el.appendChild(pill);
    });
    var note = document.createElement('div');
    note.className = 'note';
    if (outcome && outcome.kind === 'win') {
      note.textContent = (outcome.winner.id === me.id ? 'You win' : (outcome.winner.name || 'They') + ' wins') +
        ' — ' + outcome.winner.guesses + ' guess' + (outcome.winner.guesses === 1 ? '' : 'es') + '.';
    } else if (outcome && outcome.kind === 'draw') {
      note.textContent = 'Draw — nobody got it.';
    } else {
      note.textContent = 'Same secret word. Guess counts only — not the letters.';
    }
    el.appendChild(note);
  }

  function render() {
    applyDark();
    renderBoard();
    renderKeyboard();
    renderVersus();
    var again = $('playAgain');
    again.hidden = G.gameState === 'playing';
    var hint = $('diffHint');
    if (hint) hint.textContent = versusOn() ? 'Versus always asks for a valid word.' : (DIFF_HINT[G.difficulty] || DIFF_HINT.normal);
    var seg = $('diffSeg');
    if (seg) {
      var btns = seg.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-diff') === G.difficulty);
      }
    }
    $('darkToggle').checked = G.darkMode;
  }

  function showModal(name) {
    openModal = name;
    $('modal-' + name).hidden = false;
  }
  function hideModal(name) {
    $('modal-' + name).hidden = true;
    if (openModal === name) openModal = null;
  }
  function closeTop() {
    if (openModal) { hideModal(openModal); return true; }
    return false;
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (openModal && ev.key === 'Escape') { closeTop(); ev.preventDefault(); return; }
    if (openModal) return;
    var letter = ev.key.toUpperCase();
    if (LETTERS.indexOf(letter) >= 0 && ev.key.length === 1) { addLetter(letter); ev.preventDefault(); }
    else if (ev.key === 'Enter') { onEnter(); ev.preventDefault(); }
    else if (ev.key === 'Backspace') { onDelete(); ev.preventDefault(); }
  });

  $('settingsBtn').addEventListener('click', function () { showModal('settings'); });
  $('playAgain').addEventListener('click', playAgain);
  $('endAgain').addEventListener('click', playAgain);
  $('darkToggle').addEventListener('change', function () {
    G.darkMode = $('darkToggle').checked;
    applyDark();
    saveSoon();
  });
  $('diffSeg').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-diff]');
    if (!b) return;
    G.difficulty = b.getAttribute('data-diff');
    render();
    saveSoon();
  });
  ['settings', 'end'].forEach(function (name) {
    var modal = $('modal-' + name);
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) hideModal(name);
    });
    var closer = modal.querySelector('[data-close]');
    if (closer) closer.addEventListener('click', function () { hideModal(name); });
  });

  if (api && api.onBack) {
    api.onBack(function () { return closeTop(); });
  }

  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 200);
  }

  function save() {
    if (!prefsDb) return;
    prefsDb.put({
      id: 'settings',
      darkMode: G.darkMode,
      difficulty: G.difficulty
    }).catch(function () {});
    prefsDb.put({
      id: 'stats',
      currentStreak: G.currentStreak,
      longestStreak: G.longestStreak,
      guessesInStreak: G.guessesInStreak,
      firstTime: G.firstTime
    }).catch(function () {});
    if (!versusOn()) {
      prefsDb.put({
        id: 'solo',
        answer: G.answer,
        gameState: G.gameState,
        board: cloneBoard(G.board),
        cellStatuses: G.cellStatuses.map(function (r) { return r.slice(); }),
        currentRow: G.currentRow,
        currentCol: G.currentCol,
        letterStatuses: Object.assign({}, G.letterStatuses),
        submittedInvalid: G.submittedInvalid,
        exactGuesses: Object.assign({}, G.exactGuesses)
      }).catch(function () {});
    }
  }

  function restorePrefs(rows) {
    var by = {};
    (rows || []).forEach(function (r) { if (r && r.id) by[r.id] = r; });
    if (by.settings) {
      if (typeof by.settings.darkMode === 'boolean') G.darkMode = by.settings.darkMode;
      if (by.settings.difficulty) G.difficulty = by.settings.difficulty;
    }
    if (by.stats) {
      G.currentStreak = by.stats.currentStreak || 0;
      G.longestStreak = by.stats.longestStreak || 0;
      G.guessesInStreak = by.stats.guessesInStreak || 0;
      if (typeof by.stats.firstTime === 'boolean') G.firstTime = by.stats.firstTime;
    }
    if (by.solo && by.solo.answer && !versusOn()) {
      G.answer = String(by.solo.answer).toUpperCase();
      G.gameState = by.solo.gameState || 'playing';
      if (Array.isArray(by.solo.board)) G.board = by.solo.board;
      if (Array.isArray(by.solo.cellStatuses)) G.cellStatuses = by.solo.cellStatuses;
      G.currentRow = by.solo.currentRow || 0;
      G.currentCol = by.solo.currentCol || 0;
      if (by.solo.letterStatuses) G.letterStatuses = by.solo.letterStatuses;
      G.submittedInvalid = !!by.solo.submittedInvalid;
      G.exactGuesses = by.solo.exactGuesses || {};
    }
  }

  function publishMe() {
    if (!playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id,
      name: me.name,
      guesses: G.currentRow,
      solved: G.gameState === 'won',
      done: G.gameState !== 'playing',
      at: now(),
      round: vsRound,
      ready: !!G.ready,
      seen: now()
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
        guesses: p.guesses || 0,
        solved: !!p.solved,
        done: !!p.done,
        at: p.at || 0,
        round: p.round || 0,
        ready: !!p.ready,
        seen: p.seen
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
    var word = String(m.word).toUpperCase();
    if (r === vsRound && G.answer === word) return;
    vsRound = r;
    resetRound(word);
    hideModal('end');
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
    var word = randomAnswer();
    match = { id: 'm', word: word, round: 1, startedAt: now() };
    matchDb.put(match).catch(function () {});
    applyMatch(match);
  }

  function allLiveDone() {
    if (G.gameState === 'playing') return false;
    for (var i = 0; i < others.length; i++) {
      if (others[i].round !== vsRound) return false;
      if (!others[i].done) return false;
    }
    return others.length > 0;
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
    var word = randomAnswer();
    match = { id: 'm', word: word, round: cur + 1, startedAt: now() };
    matchDb.put(match).catch(function () {});
    applyMatch(match);
    render();
  }

  function beat() {
    publishMe();
  }

  function boot() {
    render();
    var who = api && api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    who.then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      var pPrefs = prefsDb ? prefsDb.getAll() : Promise.resolve([]);
      return pPrefs.then(function (rows) {
        restorePrefs(rows);
        loaded = true;
        applyDark();
        G.firstTime = false;
        render();
        if (playersDb) {
          playersDb.subscribe(function (list) { ingestPlayers(list || []); });
        }
        if (matchDb) {
          matchDb.subscribe(function (list) { ingestMatch(list || []); });
        }
        publishMe();
        if (hbTimer) clearInterval(hbTimer);
        hbTimer = setInterval(beat, HB_MS);
      });
    }).catch(function () {
      loaded = true;
      render();
    });
  }

  boot();
})();
