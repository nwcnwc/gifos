/*
 * BreakLock — GifOS shell around maxwellito's 3×3 Mastermind lock.
 *
 * Invite is OS chrome — this file never draws that button. Stats, streak
 * and a solo game in progress live in gifos.db so the file is the save.
 */
(function (root) {
  'use strict';

  var Pattern = root.BreakLockPattern;
  var PatternSVG = root.BreakLockPatternSVG;
  var LockCtrl = root.BreakLockLock;
  var color = root.BreakLockColor;
  var quotes = root.BreakLockQuotes;
  var Net = root.BreakLockNet;

  var TYPE = { PRACTICE: 1, CHALLENGE: 2, COUNTDOWN: 3 };
  var TYPE_META = [
    { value: TYPE.PRACTICE, label: 'Practice', help: 'No pressure, just discover and practice your game' },
    { value: TYPE.CHALLENGE, label: 'Challenge', help: 'Challenge mode give you 10 attempts only to win' },
    { value: TYPE.COUNTDOWN, label: 'Countdown', help: 'Solve the game in one minute, without limit of attempts' }
  ];
  var DIFF_LABEL = { 4: 'Easy', 5: 'Medium', 6: 'Hard' };

  var $ = function (id) { return document.getElementById(id); };

  function pad3(n) {
    var s = String(Math.abs(n | 0));
    while (s.length < 3) s = '0' + s;
    return (n < 0 ? '-' : '') + s;
  }

  function airport(el, text) {
    var frames = 0;
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789 _*%!?';
    var id = el._airport;
    if (id) clearInterval(id);
    el._airport = setInterval(function () {
      frames++;
      var keep = Math.min(text.length, Math.floor(frames / 2));
      var rest = Math.min(3, text.length - keep);
      var extra = '', i;
      for (i = 0; i < rest; i++) extra += chars.charAt((Math.random() * chars.length) | 0);
      el.textContent = text.slice(0, keep) + extra;
      if (keep >= text.length) {
        clearInterval(el._airport);
        el._airport = 0;
        el.textContent = text;
      }
    }, 50);
  }

  var G = {
    screen: 'menu',
    type: TYPE.PRACTICE,
    difficulty: 4,
    typeIndex: 0,
    secret: null,
    count: 0,
    ended: false,
    won: false,
    attempts: [],
    role: 'solo',
    round: 0,
    setterId: null,
    left: 10
  };

  var stats = {
    wins: 0, losses: 0, streak: 0, bestStreak: 0, played: 0,
    best4: 0, best5: 0, best6: 0
  };

  var lock = null;
  var cdTimer = 0;
  var cdLeft = 0;
  var cdDur = 60;
  var saveTimer = 0;
  var watchSig = '';
  var api = typeof gifos !== 'undefined' ? gifos : null;
  var prefsDb = null;
  var lastStacked = null;

  try {
    if (api && api.db) prefsDb = api.db('prefs');
  } catch (e) {}

  function versusOn() {
    return Net && Net.versusOn && Net.versusOn();
  }

  function meId() {
    return (Net && Net.me && Net.me() && Net.me().id) || 'local';
  }

  function show(name) {
    G.screen = name;
    $('menu').hidden = name !== 'menu';
    $('game').hidden = name !== 'game' && name !== 'summary';
    $('summary').hidden = name !== 'summary';
    if (name !== 'summary') $('passRow').hidden = true;
  }

  function historyClear(helper) {
    var box = $('historyBox');
    lastStacked = null;
    box.textContent = '';
    box.setAttribute('data-helper', helper || '');
  }

  function historyStack(svg) {
    var box = $('historyBox');
    if (lastStacked) box.insertBefore(svg, lastStacked);
    else box.appendChild(svg);
    lastStacked = svg;
    $('history').scrollLeft = 0;
  }

  function buildAttemptSVG(pattern, match) {
    var svgMaker = new PatternSVG();
    svgMaker.addDots(1);
    svgMaker.addPattern(pattern, 14, color.greydient('66', 'FF', pattern.dotLength - 3));
    if (match) svgMaker.addCombinaison(match[0], match[1], match[2]);
    var el = svgMaker.getSVG();
    if (match && match[0] === pattern.dotLength) el.classList.add('success');
    return el;
  }

  function setCounter(n) {
    G.count = n;
    $('counter').hidden = false;
    $('countdown').hidden = true;
    $('counter').textContent = pad3(n);
  }

  function stopCountdown() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = 0; }
  }

  function renderCountdown() {
    var el = $('countdown');
    el.hidden = false;
    $('counter').hidden = true;
    el.classList.toggle('alert', cdLeft <= 10);
    $('cdNum').textContent = pad3(cdLeft);
    $('cdFill').style.width = (cdDur ? (cdLeft / cdDur) * 100 : 0) + '%';
  }

  function startCountdown(sec) {
    stopCountdown();
    cdDur = sec;
    cdLeft = sec;
    renderCountdown();
    cdTimer = setInterval(function () {
      cdLeft--;
      renderCountdown();
      if (cdLeft <= 0) {
        stopCountdown();
        endGame(false);
      }
    }, 1000);
  }

  function lockCaption(text) {
    $('lockCaption').textContent = text || '';
  }

  function helperFor(diff) {
    return 'Connect ' + diff + ' dots';
  }

  function applySecret(suite, diff) {
    G.secret = Pattern.fromSuite(suite);
    G.difficulty = diff || suite.length;
    lock.setDotLength(G.difficulty);
  }

  function startSolo(type, difficulty, restored) {
    G.role = 'solo';
    G.type = type;
    G.difficulty = difficulty;
    G.ended = false;
    G.won = false;
    G.round++;
    if (!restored) {
      G.secret = new Pattern(difficulty);
      G.secret.fillRandomly();
      G.count = 0;
      G.attempts = [];
    }
    lock.setEnabled(true);
    lock.setCallback(onAttempt);
    lock.setDotLength(G.difficulty);
    historyClear(helperFor(G.difficulty));
    if (G.attempts.length) {
      var i, p, m;
      for (i = 0; i < G.attempts.length; i++) {
        p = Pattern.fromSuite(G.attempts[i].s);
        m = [G.attempts[i].g, G.attempts[i].w, G.difficulty - G.attempts[i].g - G.attempts[i].w];
        historyStack(buildAttemptSVG(p, m));
      }
    }
    lockCaption('');
    if (type === TYPE.PRACTICE) setCounter(G.count);
    else if (type === TYPE.CHALLENGE) {
      G.left = restored ? Math.max(0, 10 - G.count) : 10;
      setCounter(G.left);
    } else startCountdown(60);
    show('game');
    saveSoon();
    publishMe();
  }

  function startSet(difficulty, round) {
    G.role = 'set';
    G.type = TYPE.PRACTICE;
    G.difficulty = difficulty;
    G.ended = false;
    G.won = false;
    G.secret = null;
    G.count = 0;
    G.attempts = [];
    if (round != null) G.round = round;
    else G.round++;
    G.setterId = meId();
    lock.setEnabled(true);
    lock.setDotLength(difficulty);
    lock.setCallback(onSetPattern);
    historyClear('Draw the secret');
    setCounter(0);
    lockCaption('Draw the secret. They will not see it.');
    show('game');
    publishMatch({
      state: 'setting',
      difficulty: difficulty,
      setterId: G.setterId,
      setterName: (Net.me() && Net.me().name) || 'You',
      secret: [],
      round: G.round,
      winnerId: '',
      winnerName: ''
    });
    publishMe();
  }

  function startCrack(suite, difficulty, round) {
    G.role = 'crack';
    G.type = TYPE.PRACTICE;
    G.difficulty = difficulty;
    G.round = round || G.round;
    G.ended = false;
    G.won = false;
    G.count = 0;
    G.attempts = [];
    applySecret(suite, difficulty);
    lock.setEnabled(true);
    lock.setCallback(onAttempt);
    historyClear(helperFor(difficulty));
    setCounter(0);
    lockCaption('Crack the lock they set.');
    show('game');
    publishMe();
  }

  function startWatch(suite, difficulty, round) {
    G.role = 'watch';
    G.difficulty = difficulty;
    G.round = round || G.round;
    G.ended = false;
    G.won = false;
    watchSig = '';
    applySecret(suite, difficulty);
    lock.setEnabled(false);
    lock.setCallback(null);
    historyClear('Their attempts');
    setCounter(0);
    lockCaption('Watching — they are cracking your lock.');
    show('game');
    restackWatch();
    publishMe();
  }

  function onSetPattern(pattern) {
    if (G.role !== 'set' || G.ended) return true;
    if (pattern.suite.length !== G.difficulty) return false;
    G.secret = Pattern.fromSuite(pattern.suite);
    publishMatch({
      state: 'playing',
      difficulty: G.difficulty,
      setterId: meId(),
      setterName: (Net.me() && Net.me().name) || 'You',
      secret: G.secret.suite.slice(),
      round: G.round,
      winnerId: '',
      winnerName: ''
    });
    startWatch(G.secret.suite, G.difficulty, G.round);
    return true;
  }

  function onAttempt(pattern) {
    if (!G.secret || G.role === 'set') return false;
    var match = G.secret.compare(pattern);
    var unlocked = match[0] === G.secret.dotLength;
    var rec = { s: pattern.suite.slice(), g: match[0], w: match[1] };
    G.attempts.push(rec);
    G.count++;
    historyStack(buildAttemptSVG(pattern, match));

    if (!G.ended && G.role === 'solo' && G.type === TYPE.CHALLENGE) {
      if (!unlocked) {
        G.left = Math.max(0, (G.left | 0) - 1);
        setCounter(G.left);
        if (G.left <= 0) {
          endGame(false);
          publishMe();
          return false;
        }
      }
    } else if (!G.ended) {
      setCounter(G.count);
    }

    if (!G.ended && unlocked) {
      if (G.type === TYPE.COUNTDOWN) stopCountdown();
      endGame(true);
    }
    publishMe();
    saveSoon();
    return unlocked;
  }

  function recordSolo(won) {
    if (G.role !== 'solo') return;
    stats.played++;
    if (won) {
      stats.wins++;
      stats.streak++;
      if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
      var key = 'best' + G.difficulty;
      if (!stats[key] || G.count < stats[key]) stats[key] = G.count;
    } else {
      stats.losses++;
      stats.streak = 0;
    }
  }

  function endGame(won) {
    if (G.ended) return;
    G.ended = true;
    G.won = !!won;
    stopCountdown();
    lock.setEnabled(false);
    if (G.role === 'solo') recordSolo(won);
    if (G.role === 'crack' && won && versusOn()) {
      var snap = matchSnapshot();
      snap.state = 'over';
      snap.winnerId = meId();
      snap.winnerName = (Net.me() && Net.me().name) || 'You';
      publishMatch(snap);
    }
    openSummary(won, G.count);
    saveSoon();
    publishMe();
  }

  function matchSnapshot() {
    var m = Net.match && Net.match();
    return {
      state: (m && m.state) || 'playing',
      difficulty: G.difficulty,
      setterId: (m && m.setterId) || G.setterId,
      setterName: (m && m.setterName) || '',
      secret: G.secret ? G.secret.suite.slice() : ((m && m.secret) || []),
      round: (m && m.round) || G.round,
      winnerId: (m && m.winnerId) || '',
      winnerName: (m && m.winnerName) || ''
    };
  }

  function openSummary(won, count) {
    var title = $('sumTitle');
    title.classList.remove('success', 'fail');
    title.classList.add(won ? 'success' : 'fail');
    airport(title, won ? 'Success!' : 'Fail!');
    var details = quotes.getQuote(won, count);
    if (G.role === 'watch') {
      var m = Net.match && Net.match();
      if (m && m.winnerId) {
        details = (m.winnerName || 'They') + ' cracked it in ' + count +
          (count === 1 ? ' attempt.' : ' attempts.');
      } else if (!won) {
        details = 'Nobody cracked it.';
      }
    }
    $('sumDetails').textContent = details;
    $('sumReveal').hidden = !!won;
    $('btnSolution').hidden = !!won && G.role !== 'watch';
    var canPass = versusOn() && (G.role === 'set' || G.role === 'watch' || G.setterId === meId());
    $('passRow').hidden = !canPass;
    show('summary');
  }

  function revealSolution() {
    if (!G.secret) return;
    var match = G.secret.compare(G.secret);
    historyStack(buildAttemptSVG(G.secret, match));
    $('summary').hidden = true;
    G.screen = 'game';
  }

  function goHome() {
    stopCountdown();
    G.ended = true;
    G.secret = null;
    G.role = 'solo';
    lock.setEnabled(true);
    show('menu');
    renderMenu();
    saveSoon();
    publishMe();
  }

  function newGame() {
    $('summary').hidden = true;
    if (versusOn()) {
      startSet(G.difficulty);
      return;
    }
    startSolo(G.type, G.difficulty);
  }

  function passLock() {
    var others = Net.others();
    if (!others.length) return;
    var next = others[0];
    G.round++;
    G.role = 'crack';
    G.setterId = next.id;
    G.secret = null;
    G.ended = false;
    publishMatch({
      state: 'setting',
      difficulty: G.difficulty,
      setterId: next.id,
      setterName: next.name || 'Friend',
      secret: [],
      round: G.round,
      winnerId: '',
      winnerName: ''
    });
    lockCaption('Waiting — they are setting the lock.');
    lock.setEnabled(false);
    historyClear('Waiting');
    setCounter(0);
    show('game');
    publishMe();
  }

  function restackWatch() {
    if (G.role !== 'watch') return;
    var others = Net.others();
    var i, j, p, att, pat, m, total = 0, cracked = false, crackCount = 0;
    var sigParts = [];
    for (i = 0; i < others.length; i++) {
      p = others[i];
      att = p.attempts || [];
      sigParts.push(p.id + ':' + att.length + ':' + (p.cracked ? 1 : 0) + ':' + (p.round | 0));
      if (p.round !== G.round) continue;
      total += att.length;
      if (p.cracked) { cracked = true; crackCount = p.count || att.length; }
    }
    var sig = sigParts.join('|');
    if (sig === watchSig) return;
    watchSig = sig;
    historyClear('Their attempts');
    for (i = 0; i < others.length; i++) {
      p = others[i];
      if (p.round !== G.round) continue;
      att = p.attempts || [];
      for (j = 0; j < att.length; j++) {
        if (!att[j] || !att[j].s) continue;
        pat = Pattern.fromSuite(att[j].s);
        m = [att[j].g, att[j].w, G.difficulty - att[j].g - att[j].w];
        historyStack(buildAttemptSVG(pat, m));
      }
    }
    setCounter(total);
    if (cracked && !G.ended) {
      G.count = crackCount;
      endGame(true);
    }
  }

  function publishMe() {
    if (!Net || !Net.live || !Net.live()) return;
    Net.putPlayer({
      role: G.role,
      count: G.count,
      cracked: !!(G.ended && G.won && G.role === 'crack'),
      attempts: G.role === 'crack' ? G.attempts.map(function (a) {
        return { s: a.s, g: a.g, w: a.w };
      }) : [],
      round: G.round,
      screen: G.screen
    });
  }

  function publishMatch(row) {
    if (!Net || !Net.live || !Net.live()) return;
    Net.putMatch(row);
  }

  function onNetChange() {
    renderMenu();
    renderVersus();
    if (!versusOn()) {
      if (G.role === 'set' || G.role === 'crack' || G.role === 'watch') {
        if (G.screen === 'game' && !G.secret) goHome();
      }
      return;
    }
    var m = Net.match();
    if (!m) return;

    if (m.state === 'setting' && m.setterId === meId() && G.role !== 'set' && G.screen !== 'summary') {
      startSet(m.difficulty || G.difficulty, m.round);
      return;
    }
    if (G.screen === 'menu' && m.state === 'playing' && m.secret && m.secret.length && m.setterId !== meId()) {
      startCrack(m.secret, m.difficulty || m.secret.length, m.round);
      return;
    }
    if (G.screen === 'menu' && m.state === 'setting' && m.setterId !== meId()) {
      G.role = 'crack';
      G.round = m.round || G.round;
      G.difficulty = m.difficulty || G.difficulty;
      lock.setEnabled(false);
      lockCaption('Waiting — they are setting the lock.');
      historyClear('Waiting');
      setCounter(0);
      show('game');
      publishMe();
      return;
    }
    if (G.role === 'crack' && G.screen === 'game' && !G.secret && m.state === 'playing' && m.secret && m.secret.length) {
      startCrack(m.secret, m.difficulty || m.secret.length, m.round);
      return;
    }
    if (G.role === 'watch' && !G.ended) restackWatch();
    if (G.role === 'crack' && !G.ended && m.state === 'over' && m.winnerId && m.winnerId !== meId()) {
      G.count = G.count || 0;
      openSummary(false, G.count);
      G.ended = true;
      lock.setEnabled(false);
    }
    if (G.role === 'set' && m.state === 'playing' && m.secret && m.secret.length && G.screen === 'game' && !G.secret) {
      startWatch(m.secret, m.difficulty || m.secret.length, m.round);
    }
  }

  function renderVersus() {
    var el = $('versus');
    if (!versusOn() || G.screen === 'menu') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var pills = $('pills');
    pills.textContent = '';
    function addPill(p, mine) {
      var span = document.createElement('span');
      var role = p.role || (p.id === G.setterId ? 'set' : 'crack');
      span.className = 'pill' + (mine ? ' me' : '') + (role === 'set' || role === 'watch' ? ' set' : '') +
        (p.cracked ? ' win' : '');
      span.textContent = (mine ? 'You' : (p.name || 'Friend')) +
        (role === 'set' || role === 'watch' ? ' · set' : ' · ' + (p.count || 0));
      pills.appendChild(span);
    }
    addPill({
      id: meId(), name: 'You', role: G.role, count: G.count, cracked: G.ended && G.won && G.role === 'crack'
    }, true);
    Net.others().forEach(function (p) { addPill(p, false); });
    var note = $('vsNote');
    if (G.role === 'set') note.textContent = 'Draw a pattern. They have to crack it.';
    else if (G.role === 'watch') note.textContent = 'Your lock is live. Filled peg = right place, empty = right dot, wrong order.';
    else if (G.role === 'crack') note.textContent = 'Same lock. First to find it wins.';
    else note.textContent = '';
  }

  function renderMenu() {
    var el = $('stats');
    var parts = [];
    if (stats.played) {
      parts.push(stats.wins + '–' + stats.losses);
      if (stats.streak) parts.push('streak ' + stats.streak);
      if (stats.bestStreak) parts.push('best ' + stats.bestStreak);
      var bests = [];
      if (stats.best4) bests.push('4:' + stats.best4);
      if (stats.best5) bests.push('5:' + stats.best5);
      if (stats.best6) bests.push('6:' + stats.best6);
      if (bests.length) parts.push('best lock ' + bests.join(' '));
    }
    if (parts.length) {
      el.hidden = false;
      el.textContent = parts.join('  ·  ');
    } else {
      el.hidden = true;
    }

    var vs = versusOn();
    $('typeBox').hidden = vs;
    $('typeHelp').hidden = vs;
    var note = $('roomNote');
    var btn = $('startBtn');
    if (vs) {
      note.hidden = false;
      var m = Net.match();
      var others = Net.others();
      var names = others.map(function (p) { return p.name || 'Friend'; }).join(', ');
      if (m && m.state === 'playing' && m.setterId && m.setterId !== meId()) {
        note.textContent = names + ' set a lock. START_ to crack it.';
        btn.textContent = 'CRACK_';
        btn.disabled = false;
      } else if (m && m.state === 'setting' && m.setterId !== meId()) {
        note.textContent = 'Waiting — ' + (m.setterName || names) + ' is drawing the secret.';
        btn.textContent = 'WAIT_';
        btn.disabled = true;
      } else {
        note.textContent = names + ' is here. You draw a secret pattern; they have to crack it.';
        btn.textContent = 'SET A LOCK_';
        btn.disabled = false;
      }
    } else {
      note.hidden = true;
      btn.textContent = 'START_';
      btn.disabled = false;
    }
    $('typeLabel').textContent = TYPE_META[G.typeIndex].label;
    $('typeHelp').textContent = TYPE_META[G.typeIndex].help;
    var items = $('diffBox').querySelectorAll('[data-diff]');
    var i;
    for (i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', (items[i].getAttribute('data-diff') | 0) === G.difficulty);
    }
  }

  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 200);
  }

  function save() {
    if (!prefsDb) return;
    var row = {
      id: 'prefs',
      wins: stats.wins,
      losses: stats.losses,
      streak: stats.streak,
      bestStreak: stats.bestStreak,
      played: stats.played,
      best4: stats.best4,
      best5: stats.best5,
      best6: stats.best6,
      lastType: G.type,
      lastDiff: G.difficulty
    };
    if (G.role === 'solo' && G.secret && !G.ended && G.type !== TYPE.COUNTDOWN) {
      row.secret = G.secret.suite.slice();
      row.attempts = G.attempts.map(function (a) { return { s: a.s, g: a.g, w: a.w }; });
      row.type = G.type;
      row.difficulty = G.difficulty;
      row.count = G.count;
    } else {
      row.secret = null;
      row.attempts = [];
    }
    prefsDb.put(row).catch(function () {});
  }

  function restorePrefs(row) {
    if (!row) return;
    stats.wins = row.wins | 0;
    stats.losses = row.losses | 0;
    stats.streak = row.streak | 0;
    stats.bestStreak = row.bestStreak | 0;
    stats.played = row.played | 0;
    stats.best4 = row.best4 | 0;
    stats.best5 = row.best5 | 0;
    stats.best6 = row.best6 | 0;
    if (row.lastDiff === 4 || row.lastDiff === 5 || row.lastDiff === 6) G.difficulty = row.lastDiff;
    if (row.lastType === TYPE.PRACTICE || row.lastType === TYPE.CHALLENGE || row.lastType === TYPE.COUNTDOWN) {
      G.type = row.lastType;
      G.typeIndex = G.type === TYPE.PRACTICE ? 0 : G.type === TYPE.CHALLENGE ? 1 : 2;
    }
    if (row.secret && row.secret.length && row.type !== TYPE.COUNTDOWN && !versusOn()) {
      G.secret = Pattern.fromSuite(row.secret);
      G.attempts = row.attempts || [];
      G.count = row.count | 0;
      G.type = row.type || TYPE.PRACTICE;
      G.difficulty = row.difficulty || row.secret.length;
      startSolo(G.type, G.difficulty, true);
    }
  }

  function onBack() {
    if (G.screen === 'summary') {
      goHome();
      return true;
    }
    if (G.screen === 'game') {
      goHome();
      return true;
    }
    return false;
  }

  function wire() {
    lock = new LockCtrl(onAttempt);
    $('lockMount').appendChild(lock.el);
    lock.init();

    $('diffBox').addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-diff]');
      if (!t) return;
      G.difficulty = t.getAttribute('data-diff') | 0;
      renderMenu();
      saveSoon();
    });
    $('typePrev').addEventListener('click', function (e) {
      e.preventDefault();
      G.typeIndex = (G.typeIndex + TYPE_META.length - 1) % TYPE_META.length;
      G.type = TYPE_META[G.typeIndex].value;
      renderMenu();
    });
    $('typeNext').addEventListener('click', function (e) {
      e.preventDefault();
      G.typeIndex = (G.typeIndex + 1) % TYPE_META.length;
      G.type = TYPE_META[G.typeIndex].value;
      renderMenu();
    });
    $('startBtn').addEventListener('click', function () {
      if (versusOn()) {
        var m = Net.match();
        if (m && m.state === 'playing' && m.secret && m.secret.length && m.setterId !== meId()) {
          startCrack(m.secret, m.difficulty || m.secret.length, m.round);
        } else {
          startSet(G.difficulty);
        }
        return;
      }
      startSolo(G.type, G.difficulty);
    });
    $('abortBtn').addEventListener('click', goHome);
    $('btnNew').addEventListener('click', newGame);
    $('btnSolution').addEventListener('click', revealSolution);
    $('btnHome').addEventListener('click', goHome);
    $('btnPass').addEventListener('click', passLock);

    if (api && api.onBack) api.onBack(onBack);
  }

  function boot() {
    wire();
    renderMenu();
    airport($('title'), 'BreakLock');
    var load = prefsDb
      ? prefsDb.get('prefs').catch(function () { return null; })
      : Promise.resolve(null);
    var room = Net && Net.init ? Net.init() : Promise.resolve({ owner: true, others: 0 });
    load.then(function (row) {
      restorePrefs(row);
      renderMenu();
    });
    room.then(function () {
      if (Net && Net.onChange) Net.onChange(onNetChange);
      publishMe();
      setInterval(function () { publishMe(); }, 3000);
      onNetChange();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.BreakLockRules = {
    TYPE: TYPE,
    difficulties: [4, 5, 6],
    Pattern: Pattern,
    compare: function (secret, guess) {
      return Pattern.fromSuite(secret).compare(Pattern.fromSuite(guess));
    }
  };
})(window);
