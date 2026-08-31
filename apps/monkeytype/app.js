/*
 * Monkeytype — test UI, results, themes, history, race.
 * Invite is OS chrome. Persistence is gifos.db. No network.
 */
(function () {
  'use strict';
  var E = window.MonkeyEngine;
  var Net = window.MonkeyNet;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var TAP = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var HISTORY_N = 40;
  var STALE_RESULT_MS = 80;

  var THEMES = {
    serika_dark: { bg: '#323437', main: '#e2b714', caret: '#e2b714', sub: '#646669', subAlt: '#2c2e31', text: '#d1d0c5', error: '#ca4754', extra: '#7e2a33' },
    serika:      { bg: '#e1e1e3', main: '#e2b714', caret: '#e2b714', sub: '#9a9b9c', subAlt: '#d1d3d8', text: '#323437', error: '#ca4754', extra: '#7e2a33' },
    dracula:     { bg: '#282a36', main: '#bd93f9', caret: '#bd93f9', sub: '#6272a4', subAlt: '#1e1f29', text: '#f8f8f2', error: '#ff5555', extra: '#cc3e44' },
    nord:        { bg: '#242933', main: '#88c0d0', caret: '#88c0d0', sub: '#4c566a', subAlt: '#1b1f27', text: '#eceff4', error: '#bf616a', extra: '#793e44' },
    '8008':      { bg: '#333a45', main: '#f44c7f', caret: '#f44c7f', sub: '#939eae', subAlt: '#2e343d', text: '#e9ecf0', error: '#da3333', extra: '#791717' },
    monokai:     { bg: '#272822', main: '#a6e22e', caret: '#a6e22e', sub: '#75715e', subAlt: '#1f201b', text: '#e6edf3', error: '#f92672', extra: '#8b1841' },
    olivia:      { bg: '#1c1b1d', main: '#deaf9d', caret: '#deaf9d', sub: '#4e4d53', subAlt: '#121113', text: '#f2efed', error: '#bf616a', extra: '#793e44' },
    carbon:      { bg: '#313131', main: '#f66e0d', caret: '#f66e0d', sub: '#616161', subAlt: '#2b2b2b', text: '#f5e6c8', error: '#e72d2d', extra: '#7e1a1a' },
    laser:       { bg: '#221b44', main: '#009eaf', caret: '#009eaf', sub: '#b82356', subAlt: '#1a1435', text: '#dbe7e8', error: '#b82356', extra: '#6f1534' },
    miami:       { bg: '#18181a', main: '#e4609b', caret: '#70c0e7', sub: '#4a4a52', subAlt: '#121214', text: '#f8ecf4', error: '#e03e3e', extra: '#7a1e1e' },
    botanical:   { bg: '#7b9c98', main: '#eaf1f3', caret: '#abc6c4', sub: '#495755', subAlt: '#72908c', text: '#eaf1f3', error: '#f6c9c9', extra: '#c5a3a3' },
    dark:        { bg: '#111111', main: '#eeeeee', caret: '#eeeeee', sub: '#444444', subAlt: '#191919', text: '#eeeeee', error: '#da3333', extra: '#791717' }
  };
  var THEME_NAMES = [];
  (function () {
    var k;
    for (k in THEMES) if (Object.prototype.hasOwnProperty.call(THEMES, k)) THEME_NAMES.push(k);
  })();

  var prefs = {
    theme: 'serika_dark',
    mode: 'time',
    mode2: 30,
    punct: false,
    numbers: false,
    lang: 'english'
  };
  var pbs = {};
  var history = [];
  var saveDb = null;
  var G = {
    view: 'test',
    test: null,
    focused: false,
    typing: false,
    cmd: false,
    racing: false,
    raceReady: false,
    lastPaint: 0,
    tick: 0,
    savedResult: false
  };
  var netState = { owner: true, others: 0, match: null, roster: [] };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
    });
  }

  function applyTheme(name) {
    var t = THEMES[name] || THEMES.serika_dark;
    prefs.theme = THEMES[name] ? name : 'serika_dark';
    var r = document.documentElement.style;
    r.setProperty('--bg', t.bg);
    r.setProperty('--main', t.main);
    r.setProperty('--caret', t.caret);
    r.setProperty('--sub', t.sub);
    r.setProperty('--sub-alt', t.subAlt);
    r.setProperty('--text', t.text);
    r.setProperty('--error', t.error);
    r.setProperty('--extra', t.extra);
    document.body.style.background = t.bg;
    document.body.style.color = t.text;
  }

  function persist() {
    if (!saveDb) return;
    saveDb.put({
      id: 'prefs',
      theme: prefs.theme,
      mode: prefs.mode,
      mode2: prefs.mode2,
      punct: prefs.punct,
      numbers: prefs.numbers,
      lang: prefs.lang,
      pbs: pbs,
      history: history.slice(0, HISTORY_N)
    }).catch(function () {});
  }

  function loadPrefs() {
    if (!saveDb) return Promise.resolve();
    return saveDb.get('prefs').then(function (row) {
      if (!row) return;
      if (row.theme && THEMES[row.theme]) prefs.theme = row.theme;
      if (row.mode === 'time' || row.mode === 'words' || row.mode === 'quote') prefs.mode = row.mode;
      if (row.mode2 != null) prefs.mode2 = row.mode2;
      prefs.punct = !!row.punct;
      prefs.numbers = !!row.numbers;
      if (row.lang === 'english_1k' || row.lang === 'english') prefs.lang = row.lang;
      if (row.pbs && typeof row.pbs === 'object') pbs = row.pbs;
      if (Array.isArray(row.history)) history = row.history.slice(0, HISTORY_N);
    }).catch(function () {});
  }

  function setMode(mode, mode2) {
    prefs.mode = mode;
    prefs.mode2 = mode2;
    persist();
    paintConfig();
    if (G.view === 'test' && !G.typing) restart(true);
  }

  function togglePref(name) {
    prefs[name] = !prefs[name];
    persist();
    paintConfig();
    if (G.view === 'test' && !G.typing) restart(true);
  }

  function paintConfig() {
    function on(el, yes) { if (el) el.classList.toggle('on', !!yes); }
    on($('mTime'), prefs.mode === 'time');
    on($('mWords'), prefs.mode === 'words');
    on($('mQuote'), prefs.mode === 'quote');
    on($('pPunct'), prefs.punct);
    on($('pNums'), prefs.numbers);
    var box = $('mode2');
    var opts, i, html = '';
    if (prefs.mode === 'time') opts = E.TIME_OPTS;
    else if (prefs.mode === 'words') opts = E.WORDS_OPTS;
    else opts = E.QUOTE_OPTS;
    if (prefs.mode !== 'quote' && opts.indexOf(prefs.mode2 | 0) < 0) prefs.mode2 = opts[1];
    if (prefs.mode === 'quote' && opts.indexOf(prefs.mode2) < 0) prefs.mode2 = 'all';
    for (i = 0; i < opts.length; i++) {
      html += '<button type="button" data-v="' + opts[i] + '"' +
        (String(opts[i]) === String(prefs.mode2) ? ' class="on"' : '') + '>' +
        opts[i] + '</button>';
    }
    box.innerHTML = html;
    $('langBtn').textContent = prefs.lang === 'english_1k' ? 'english 1k' : 'english';
    var pb = pbs[E.pbKey(prefs.mode, prefs.mode2, prefs.punct, prefs.numbers, prefs.lang)];
    $('pbHint').textContent = pb ? ('pb ' + E.round0(pb.wpm)) : '';
  }

  function newTest(seed) {
    G.test = E.createTest({
      mode: prefs.mode,
      mode2: prefs.mode2,
      punct: prefs.punct,
      numbers: prefs.numbers,
      lang: prefs.lang,
      seed: seed
    });
    G.typing = false;
    G.savedResult = false;
    G.focused = true;
    document.body.classList.remove('typing', 'result');
    $('words').style.marginTop = '0px';
    $('live').hidden = true;
    $('config').classList.remove('dim');
    paintWords(true);
    placeCaret(true);
    focusInput();
  }

  function restart(keepSeed) {
    if (G.racing && netState.live) return;
    show('test');
    newTest(keepSeed && G.test ? G.test.seed : undefined);
  }

  function show(id) {
    G.view = id;
    $('testView').hidden = id !== 'test' && id !== 'race';
    $('resultView').hidden = id !== 'result';
    $('raceView').hidden = id !== 'race';
    $('cmd').hidden = !G.cmd;
    document.body.classList.toggle('result', id === 'result');
    if (id !== 'test') document.body.classList.remove('typing');
  }

  function focusInput() {
    var el = $('wordsInput');
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) {
      try { el.focus(); } catch (e2) {}
    }
    G.focused = true;
    $('veil').hidden = true;
    placeCaret(false);
  }

  function blurInput() {
    G.focused = false;
    if (G.view === 'test' && !G.test.finishedAt) $('veil').hidden = false;
  }

  function paintWords(force) {
    var t = G.test;
    var el = $('words');
    if (!t || !el) return;
    var sig = t.seed + ':' + t.words.length + ':' + (t.quote && t.quote.id);
    if (force || el.getAttribute('data-sig') !== sig) {
      var html = '', i, j, w;
      for (i = 0; i < t.words.length; i++) {
        w = t.words[i];
        html += '<div class="word" data-i="' + i + '">';
        for (j = 0; j < w.length; j++) html += '<letter>' + esc(w.charAt(j)) + '</letter>';
        html += '</div> ';
      }
      el.innerHTML = html;
      el.setAttribute('data-sig', sig);
    }
    var nodes = el.children;
    var i2, node, word, typed, letters, k, cls, extra, ex;
    for (i2 = 0; i2 < nodes.length; i2++) {
      node = nodes[i2];
      if (node.nodeName !== 'DIV') continue;
      word = t.words[i2] || '';
      typed = t.typed[i2] || '';
      node.className = 'word' + (i2 === t.wordIndex ? ' active' : '') +
        (i2 < t.wordIndex ? (typed === word ? ' done' : ' err') : '');
      letters = node.getElementsByTagName('letter');
      extra = node.getElementsByClassName('extra');
      while (extra.length) extra[0].parentNode.removeChild(extra[0]);
      for (k = 0; k < letters.length; k++) {
        if (k < typed.length) cls = typed.charAt(k) === word.charAt(k) ? 'correct' : 'incorrect';
        else cls = '';
        letters[k].className = cls;
      }
      if (typed.length > word.length) {
        for (k = word.length; k < typed.length; k++) {
          ex = document.createElement('letter');
          ex.className = 'extra';
          ex.textContent = typed.charAt(k);
          node.appendChild(ex);
        }
      }
    }
    scrollWords();
    var q = $('quoteSrc');
    if (t.quote && t.quote.source) {
      q.hidden = false;
      q.textContent = t.quote.source;
    } else q.hidden = true;
  }

  function scrollWords() {
    var wrap = $('wordsWrap');
    var words = $('words');
    var active = words.querySelector('.word.active');
    if (!wrap || !active) return;
    var line = active.offsetHeight || 1;
    var top = active.offsetTop;
    var cur = parseInt(words.style.marginTop || '0', 10) || 0;
    var vis = top + cur;
    if (vis >= line * 2 - 1) words.style.marginTop = (cur - line) + 'px';
    else if (vis < 0) words.style.marginTop = '0px';
  }

  function placeCaret(snap) {
    var caret = $('caret');
    var wrap = $('wordsWrap');
    var t = G.test;
    if (!caret || !wrap || !t) return;
    var words = $('words');
    var active = words.querySelector('.word.active');
    var x = 0, y = 0, h = 28;
    if (active) {
      var typed = t.typed[t.wordIndex] || '';
      var letters = active.getElementsByTagName('letter');
      var target = letters[Math.min(typed.length, letters.length - 1)];
      var wr = wrap.getBoundingClientRect();
      if (typed.length >= letters.length && letters.length) {
        var last = letters[letters.length - 1];
        var lr = last.getBoundingClientRect();
        x = lr.right - wr.left;
        y = lr.top - wr.top;
        h = lr.height;
      } else if (target) {
        var tr = target.getBoundingClientRect();
        x = (typed.length === 0 ? tr.left : (typed.length < letters.length ? tr.left : tr.right)) - wr.left;
        if (typed.length > 0 && typed.length < letters.length) x = tr.left - wr.left;
        y = tr.top - wr.top;
        h = tr.height;
      } else {
        var ar = active.getBoundingClientRect();
        x = ar.left - wr.left;
        y = ar.top - wr.top;
        h = ar.height;
      }
    }
    caret.style.height = h + 'px';
    if (snap) caret.classList.add('snap');
    caret.style.left = x + 'px';
    caret.style.top = y + 'px';
    caret.hidden = !G.focused || G.view === 'result' || !!t.finishedAt;
    if (snap) requestAnimationFrame(function () { caret.classList.remove('snap'); });
  }

  function paintLive() {
    var t = G.test;
    if (!t) return;
    var s = E.snapshot(t, nowMs());
    var live = $('live');
    if (t.startedAt && !t.finishedAt) {
      live.hidden = false;
      $('config').classList.add('dim');
      if (t.mode === 'time') $('liveTime').textContent = String(Math.ceil(s.remaining / 1000));
      else $('liveTime').textContent = String(Math.max(0, t.words.length - t.wordIndex));
      $('liveWpm').textContent = t.keys < 5 ? '-' : String(E.round0(s.wpm));
      $('liveAcc').textContent = t.keys < 5 ? '-' : (E.round0(s.acc) + '%');
    }
    if (G.racing) {
      Net.publish(s, !!s.done);
      paintRaceBars(s);
    }
    if (s.done) onFinish(s);
  }

  function onFinish(s) {
    if (G.savedResult) return;
    G.savedResult = true;
    G.typing = false;
    document.body.classList.remove('typing');
    var rec = {
      at: nowMs(),
      wpm: E.round1(s.wpm),
      raw: E.round1(s.raw),
      acc: E.round1(s.acc),
      cons: E.round1(s.consistency),
      chars: s.chars,
      ms: s.ms,
      mode: s.mode,
      mode2: s.mode2,
      punct: s.punct,
      numbers: s.numbers,
      lang: s.lang,
      vs: G.racing ? 'race' : 'solo'
    };
    var key = E.pbKey(s.mode, s.mode2, s.punct, s.numbers, s.lang);
    var isPb = false;
    if (!pbs[key] || rec.wpm > pbs[key].wpm) {
      pbs[key] = { wpm: rec.wpm, acc: rec.acc, at: rec.at };
      isPb = true;
    }
    history.unshift(rec);
    if (history.length > HISTORY_N) history = history.slice(0, HISTORY_N);
    persist();
    paintResult(rec, isPb);
    show('result');
    if (G.racing && netState.owner) Net.hostDone();
  }

  function paintResult(rec, isPb) {
    $('rWpm').textContent = String(E.round0(rec.wpm));
    $('rAcc').textContent = E.round0(rec.acc) + '%';
    $('rRaw').textContent = String(E.round0(rec.raw));
    $('rCons').textContent = E.round0(rec.cons) + '%';
    $('rTime').textContent = (rec.ms / 1000).toFixed(1) + 's';
    var c = rec.chars || { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    $('rChars').innerHTML =
      '<span class="ok">' + c.correct + '</span>/' +
      '<span class="bad">' + c.incorrect + '</span>/' +
      '<span class="ex">' + c.extra + '</span>/' +
      '<span class="miss">' + c.missed + '</span>';
    $('rMode').textContent = E.modeLabel(rec.mode, rec.mode2, rec.punct, rec.numbers, rec.lang);
    $('rPb').hidden = !isPb;
    var hist = $('rHist');
    if (!history.length) { hist.hidden = true; hist.innerHTML = ''; }
    else {
      hist.hidden = false;
      hist.innerHTML = history.slice(0, 12).map(function (h) {
        return '<li><span>' + esc(E.modeLabel(h.mode, h.mode2, h.punct, h.numbers, h.lang)) +
          '</span><b>' + E.round0(h.wpm) + '</b><em>' + E.round0(h.acc) + '%</em></li>';
      }).join('');
    }
    if (G.racing) paintRaceBars(rec);
  }

  function typeKey(ch) {
    if (G.view === 'result') return;
    if (G.view === 'race' && !G.raceReady) return;
    if (!G.test || G.test.finishedAt) return;
    if (!G.focused) focusInput();
    E.typeChar(G.test, ch, nowMs());
    if (!G.typing && G.test.startedAt) {
      G.typing = true;
      document.body.classList.add('typing');
    }
    paintWords(false);
    placeCaret(false);
    paintLive();
  }

  function doBackspace() {
    if (!G.test || G.test.finishedAt) return;
    E.backspace(G.test, nowMs());
    paintWords(false);
    placeCaret(false);
    paintLive();
  }

  function tick() {
    if (G.test && G.test.startedAt && !G.test.finishedAt) paintLive();
    if (G.racing) {
      var st = Net.state();
      var m = st.match;
      if (m && m.status === 'cd' && m.startAt && nowMs() >= m.startAt) {
        if (st.owner) Net.hostLive();
        G.raceReady = true;
        if (G.test && !G.test.startedAt) {
          /* clock starts on first key, like the original */
        }
        $('cd').hidden = true;
        show('test');
        focusInput();
      }
      if (m && m.status === 'cd' && m.startAt) {
        var left = Math.ceil((m.startAt - nowMs()) / 1000);
        $('cd').hidden = false;
        $('cd').textContent = left > 0 ? String(left) : 'GO';
      }
    }
  }

  /* ---------- race ---------- */
  function paintRaceBars(s) {
    var box = $('raceBars');
    if (!box) return;
    var list = Net.roster();
    if (!G.racing || list.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    var html = '', i, p, w;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      w = Math.max(0, Math.min(100, (p.progress || 0) * 100));
      html += '<div class="barrow' + (p.me ? ' me' : '') + (p.done ? ' done' : '') + '">' +
        '<span class="nm">' + esc(p.name) + (p.me ? ' (you)' : '') + '</span>' +
        '<span class="track"><i style="width:' + w + '%"></i></span>' +
        '<b>' + E.round0(p.wpm) + '</b></div>';
    }
    box.innerHTML = html;
  }

  function enterRace() {
    G.racing = true;
    show('race');
    paintRaceLobby();
  }

  function leaveRace() {
    G.racing = false;
    G.raceReady = false;
    if (netState.owner) Net.hostLobby();
    show('test');
    restart(false);
  }

  function paintRaceLobby() {
    var st = Net.state();
    netState = st;
    var people = $('racePeople');
    var html = '', i, p, list = st.roster;
    if (!list.length) html = '<li>Just you so far.</li>';
    else {
      for (i = 0; i < list.length; i++) {
        p = list[i];
        html += '<li' + (p.me ? ' class="me"' : '') + '>' + esc(p.name) +
          (p.me ? ' (you)' : '') + '</li>';
      }
    }
    people.innerHTML = html;
    var n = list.length;
    $('raceStatus').textContent = n < 2
      ? 'Press Invite in the bar above the app and send the link. Whoever opens it races you on the same words. No account, no server.'
      : (n + ' in the room. Same words. First to finish (or highest WPM when the clock hits zero) wins.');
    $('raceStart').hidden = !st.owner;
    $('raceWait').hidden = st.owner;
  }

  function startRace() {
    var seed = (Math.random() * 0x100000000) >>> 0;
    Net.hostStart({
      seed: seed, mode: prefs.mode, mode2: prefs.mode2,
      punct: prefs.punct, numbers: prefs.numbers, lang: prefs.lang
    }).then(function () {
      armRace({
        seed: seed, mode: prefs.mode, mode2: prefs.mode2,
        punct: prefs.punct, numbers: prefs.numbers, lang: prefs.lang,
        startAt: nowMs() + Net.COUNTDOWN_MS
      });
    }).catch(function (e) {
      $('raceStatus').textContent = (e && e.message) || 'Could not start.';
    });
  }

  function armRace(cfg) {
    G.racing = true;
    G.raceReady = false;
    G.savedResult = false;
    prefs.mode = cfg.mode;
    prefs.mode2 = cfg.mode2;
    prefs.punct = !!cfg.punct;
    prefs.numbers = !!cfg.numbers;
    prefs.lang = cfg.lang || 'english';
    paintConfig();
    G.test = E.createTest(cfg);
    $('words').style.marginTop = '0px';
    document.body.classList.remove('typing', 'result');
    show('test');
    $('cd').hidden = false;
    $('cd').textContent = '3';
    $('live').hidden = true;
    paintWords(true);
    placeCaret(true);
    paintRaceBars({ progress: 0, wpm: 0 });
  }

  function onNet(st) {
    netState = st;
    if (!G.racing) {
      if (st.others > 0 && st.match && (st.match.status === 'cd' || st.match.status === 'live')) {
        G.racing = true;
      }
    }
    if (G.view === 'race') paintRaceLobby();
    var m = st.match;
    if (G.racing && m && (m.status === 'cd' || m.status === 'live')) {
      if (!G.test || G.test.seed !== (m.seed >>> 0) || G.test.mode !== m.mode ||
          String(G.test.mode2) !== String(m.mode2)) {
        armRace(m);
      }
      paintRaceBars(G.test ? E.snapshot(G.test, nowMs()) : { progress: 0, wpm: 0 });
    }
  }

  /* ---------- command line ---------- */
  function commands() {
    var list = [
      { k: 'restart test', run: function () { closeCmd(); restart(false); } },
      { k: 'time 15', run: function () { setMode('time', 15); closeCmd(); } },
      { k: 'time 30', run: function () { setMode('time', 30); closeCmd(); } },
      { k: 'time 60', run: function () { setMode('time', 60); closeCmd(); } },
      { k: 'time 120', run: function () { setMode('time', 120); closeCmd(); } },
      { k: 'words 10', run: function () { setMode('words', 10); closeCmd(); } },
      { k: 'words 25', run: function () { setMode('words', 25); closeCmd(); } },
      { k: 'words 50', run: function () { setMode('words', 50); closeCmd(); } },
      { k: 'words 100', run: function () { setMode('words', 100); closeCmd(); } },
      { k: 'quote short', run: function () { setMode('quote', 'short'); closeCmd(); } },
      { k: 'quote medium', run: function () { setMode('quote', 'medium'); closeCmd(); } },
      { k: 'quote long', run: function () { setMode('quote', 'long'); closeCmd(); } },
      { k: 'quote all', run: function () { setMode('quote', 'all'); closeCmd(); } },
      { k: 'toggle punctuation', run: function () { togglePref('punct'); closeCmd(); } },
      { k: 'toggle numbers', run: function () { togglePref('numbers'); closeCmd(); } },
      { k: 'english', run: function () { prefs.lang = 'english'; persist(); paintConfig(); restart(true); closeCmd(); } },
      { k: 'english 1k', run: function () { prefs.lang = 'english_1k'; persist(); paintConfig(); restart(true); closeCmd(); } },
      { k: 'race a friend', run: function () { closeCmd(); enterRace(); } },
      { k: 'practice', run: function () { closeCmd(); leaveRace(); } }
    ];
    var i;
    for (i = 0; i < THEME_NAMES.length; i++) {
      (function (name) {
        list.push({ k: 'theme ' + name.replace(/_/g, ' '), run: function () {
          applyTheme(name); persist(); closeCmd();
        } });
      })(THEME_NAMES[i]);
    }
    return list;
  }

  function openCmd() {
    G.cmd = true;
    $('cmd').hidden = false;
    $('cmdIn').value = '';
    filterCmd('');
    try { $('cmdIn').focus(); } catch (e) {}
  }
  function closeCmd() {
    G.cmd = false;
    $('cmd').hidden = true;
    focusInput();
  }
  function toggleCmd() { if (G.cmd) closeCmd(); else openCmd(); }

  function filterCmd(q) {
    q = String(q || '').toLowerCase();
    var list = commands();
    var html = '', n = 0, i, c;
    for (i = 0; i < list.length && n < 10; i++) {
      c = list[i];
      if (q && c.k.indexOf(q) < 0) continue;
      html += '<button type="button" data-i="' + i + '"' + (n === 0 ? ' class="on"' : '') + '>' +
        esc(c.k) + '</button>';
      n++;
    }
    $('cmdList').innerHTML = html || '<div class="empty">no matches</div>';
    $('cmdList').setAttribute('data-q', q);
  }

  function runFirstCmd() {
    var btn = $('cmdList').querySelector('button');
    if (!btn) return;
    var q = $('cmdIn').value;
    var list = commands();
    var i, c, n = 0;
    q = String(q || '').toLowerCase();
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (q && c.k.indexOf(q) < 0) continue;
      if (n === 0) { c.run(); return; }
      n++;
    }
  }

  /* ---------- events ---------- */
  function onKey(e) {
    if (G.cmd) {
      if (e.key === 'Escape') { e.preventDefault(); closeCmd(); return; }
      if (e.key === 'Enter') { e.preventDefault(); runFirstCmd(); return; }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      restart(false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleCmd();
      return;
    }
    if (G.view === 'result') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restart(false); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); doBackspace(); return; }
    if (e.key === ' ') { e.preventDefault(); typeKey(' '); return; }
    if (e.key && e.key.length === 1) { e.preventDefault(); typeKey(e.key); }
  }

  function onInput(e) {
    var v = e.target.value;
    e.target.value = '';
    if (!v || G.cmd) return;
    var i;
    for (i = 0; i < v.length; i++) {
      if (v.charAt(i) === '\n') continue;
      typeKey(v.charAt(i));
    }
  }

  function bind() {
    window.addEventListener('keydown', onKey);
    $('wordsInput').addEventListener('input', onInput);
    $('wordsInput').addEventListener('focus', function () {
      G.focused = true;
      $('veil').hidden = true;
      placeCaret(false);
    });
    $('wordsInput').addEventListener('blur', function () {
      setTimeout(function () {
        if (G.cmd || G.view === 'result' || G.view === 'race') return;
        blurInput();
      }, 40);
    });
    $('logoBtn').addEventListener('click', function () { restart(false); });
    $('veil').addEventListener('click', focusInput);
    $('wordsWrap').addEventListener('click', focusInput);
    $('testView').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#config')) return;
      if (e.target.closest && e.target.closest('#cmd')) return;
      focusInput();
    });
    $('mTime').addEventListener('click', function () { setMode('time', 30); });
    $('mWords').addEventListener('click', function () { setMode('words', 25); });
    $('mQuote').addEventListener('click', function () { setMode('quote', 'all'); });
    $('pPunct').addEventListener('click', function () { togglePref('punct'); });
    $('pNums').addEventListener('click', function () { togglePref('numbers'); });
    $('langBtn').addEventListener('click', function () {
      prefs.lang = prefs.lang === 'english' ? 'english_1k' : 'english';
      persist(); paintConfig(); if (!G.typing) restart(true);
    });
    $('mode2').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : e.target;
      if (!b || !b.getAttribute('data-v')) return;
      var v = b.getAttribute('data-v');
      setMode(prefs.mode, prefs.mode === 'quote' ? v : (parseInt(v, 10) || v));
    });
    $('restartBtn').addEventListener('click', function () { restart(false); });
    $('nextBtn').addEventListener('click', function () { restart(false); });
    $('raceBtn').addEventListener('click', enterRace);
    $('rRace').addEventListener('click', enterRace);
    $('raceLeave').addEventListener('click', leaveRace);
    $('raceStart').addEventListener('click', startRace);
    $('cmdIn').addEventListener('input', function (e) { filterCmd(e.target.value); });
    $('cmdList').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : e.target;
      if (!b || !b.getAttribute('data-i')) return;
      var list = commands();
      var item = list[b.getAttribute('data-i') | 0];
      if (item) item.run();
    });
    window.addEventListener('resize', function () { placeCaret(true); });
    if (window.gifos && window.gifos.onBack) {
      window.gifos.onBack(function () {
        if (G.cmd) { closeCmd(); return true; }
        if (G.view === 'result') { restart(false); return true; }
        if (G.view === 'race') { leaveRace(); return true; }
        return false;
      });
    }
  }

  function boot() {
    try { if (window.gifos) saveDb = gifos.db('prefs'); } catch (e) {}
    applyTheme(prefs.theme);
    paintConfig();
    bind();
    G.tick = setInterval(tick, 200);
    var p = loadPrefs().then(function () {
      applyTheme(prefs.theme);
      paintConfig();
      newTest();
    });
    var n = Net.init({ onChange: onNet }).then(function (st) {
      netState = Net.state();
      if (st && st.me && st.me.name) Net.setName(st.me.name);
      if (window.gifos && gifos.me) {
        return gifos.me().then(function (id) {
          if (id && id.name) Net.setName(id.name);
        }).catch(function () {});
      }
    }).catch(function () {});
    Promise.resolve(p).then(function () { return n; }).then(function () {
      if (!G.test) newTest();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
