/*
 * Kana Quiz — classic-script port of anzzstuff/kanaquiz.
 *
 * Upstream is a React PWA. GifOS drops type=module and the sandbox has
 * nowhere to fetch a CDN from, so this file is ordinary classic JS:
 * the original kana tables, multiple-choice drill, review of misses,
 * and a race on a shared shuffled deck. Invite is OS chrome — this app
 * does not draw a share button. Each person writes ONLY their own
 * players row; the host writes the match (deck + seed).
 */
(function (root) {
  'use strict';

  var KANA = root.KANA;
  var BASIC_HIRA = [
    'h_group1', 'h_group2', 'h_group3', 'h_group4', 'h_group5',
    'h_group6', 'h_group7', 'h_group8', 'h_group9', 'h_group10'
  ];
  var STALE_MS = 9000, HB_MS = 3000, FEED_MS = 520;
  var TARGET_N = 10;

  function tables() { return (KANA && KANA.tables) || {}; }
  function groups() { return (KANA && KANA.groups) || []; }

  function findRomaji(kana) {
    var T = tables(), script, id, ch;
    for (script in T) {
      if (!Object.prototype.hasOwnProperty.call(T, script)) continue;
      for (id in T[script]) {
        if (!Object.prototype.hasOwnProperty.call(T[script], id)) continue;
        ch = T[script][id].characters[kana];
        if (ch) return ch.slice();
      }
    }
    return [];
  }
  function romajiOf(kana) {
    var a = findRomaji(kana);
    return a.length ? a[0] : '';
  }
  function basicHiragana() {
    var T = tables().hiragana || {}, out = [], i, id, chars, k;
    for (i = 0; i < BASIC_HIRA.length; i++) {
      id = BASIC_HIRA[i];
      chars = T[id] && T[id].characters;
      if (!chars) continue;
      for (k in chars) {
        if (Object.prototype.hasOwnProperty.call(chars, k)) out.push(k);
      }
    }
    return out;
  }
  function scoreAfter(score, ok) {
    return (score | 0) + (ok ? 1 : 0);
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
  function collect(groupIds) {
    var set = {}, i, g, k, out = [];
    var by = {};
    groups().forEach(function (x) { by[x.id] = x; });
    for (i = 0; i < groupIds.length; i++) {
      g = by[groupIds[i]];
      if (!g) continue;
      for (k = 0; k < g.keys.length; k++) set[g.keys[k]] = true;
    }
    for (k in set) {
      if (Object.prototype.hasOwnProperty.call(set, k)) out.push(k);
    }
    return out;
  }
  function padPool(pool) {
    var out = pool.slice(), seen = {}, i, extra, k;
    for (i = 0; i < out.length; i++) seen[romajiOf(out[i])] = true;
    extra = basicHiragana().concat(collect(['k_group1', 'k_group2', 'k_group3']));
    for (i = 0; i < extra.length && uniqueRomaji(out).length < 4; i++) {
      k = extra[i];
      if (out.indexOf(k) >= 0) continue;
      if (seen[romajiOf(k)]) continue;
      seen[romajiOf(k)] = true;
      out.push(k);
    }
    return out;
  }
  function uniqueRomaji(pool) {
    var s = {}, i, r, n = 0;
    for (i = 0; i < pool.length; i++) {
      r = romajiOf(pool[i]);
      if (r && !s[r]) { s[r] = true; n++; }
    }
    return Object.keys(s);
  }
  function makeChoices(key, pool, n, rng) {
    n = n || 4;
    rng = rng || Math.random;
    var want = romajiOf(key);
    var rest = pool.filter(function (k) {
      return k !== key && romajiOf(k) && romajiOf(k) !== want;
    });
    rest = shuffle(rest, rng);
    var seen = {}, picks = [key], i, k;
    seen[want] = true;
    for (i = 0; i < rest.length && picks.length < n; i++) {
      k = rest[i];
      if (seen[romajiOf(k)]) continue;
      seen[romajiOf(k)] = true;
      picks.push(k);
    }
    return shuffle(picks, rng);
  }
  function isCorrect(key, answer, dir) {
    if (dir === 'toKana') return answer === key;
    return findRomaji(key).indexOf(answer) >= 0;
  }

  root.KanaQuiz = {
    basicHiragana: basicHiragana,
    romajiOf: romajiOf,
    allowedOf: findRomaji,
    scoreAfter: scoreAfter,
    collect: collect,
    shuffle: shuffle,
    makeChoices: makeChoices,
    isCorrect: isCorrect,
    mulberry32: mulberry32
  };

  if (typeof document === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); };

  var G = {
    script: 'hiragana',
    dir: 'toRomaji',
    groups: ['h_group1', 'h_group2'],
    deck: [],
    i: 0,
    score: 0,
    wrong: 0,
    missed: [],
    choices: [],
    locked: false,
    screen: 'home',
    friend: false,
    race: 'firstN',
    ready: false,
    doneAt: 0
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

  function versusOn() { return others.length > 0; }
  function now() { return Date.now(); }
  function iAmManager() {
    var ids = [me.id].concat(others.map(function (p) { return p.id; }));
    ids.sort();
    return ids[0] === me.id;
  }
  function racing() { return G.friend && versusOn(); }
  function targetOf() {
    if (G.race === 'deck') return G.deck.length;
    return Math.min(TARGET_N, G.deck.length || TARGET_N);
  }

  function show(name) {
    G.screen = name;
    $('home').hidden = name !== 'home';
    $('quiz').hidden = name !== 'quiz';
    $('done').hidden = name !== 'done';
    $('backBtn').hidden = name === 'home';
    if (name === 'home') renderHome();
  }

  function currentKey() {
    return G.deck[G.i] || '';
  }

  function buildDeck(groupIds, seed) {
    var pool = collect(groupIds);
    if (!pool.length) pool = collect(['h_group1']);
    var rng = seed != null ? mulberry32(seed >>> 0) : Math.random;
    return shuffle(pool, rng);
  }

  function dealChoices() {
    var key = currentKey();
    var pool = padPool(G.deck);
    var rng = Math.random;
    if (match && match.seed != null) {
      rng = mulberry32((match.seed + vsRound * 10007 + G.i * 9176) >>> 0);
    }
    G.choices = key ? makeChoices(key, pool, 4, rng) : [];
  }

  function startDrill(opts) {
    opts = opts || {};
    var ids = G.groups.slice();
    if (!ids.length) {
      $('homeErr').hidden = false;
      $('homeErr').textContent = 'Pick at least one row.';
      return;
    }
    $('homeErr').hidden = true;
    G.friend = !!opts.friend;
    G.ready = false;
    G.doneAt = 0;
    G.i = 0;
    G.score = 0;
    G.wrong = 0;
    G.locked = false;
    if (opts.review) {
      if (!G.missed.length) return;
      G.deck = shuffle(G.missed.slice());
      G.missed = [];
      G.friend = false;
    } else if (G.friend && match && match.deck && match.deck.length) {
      applyMatch(match);
    } else {
      G.deck = buildDeck(ids, opts.seed);
    }
    dealChoices();
    show('quiz');
    saveSoon();
    publishMe();
    render();
  }

  function answer(value) {
    if (G.locked || G.screen !== 'quiz') return;
    if (G.friend && !racing()) return;
    var key = currentKey();
    if (!key) return;
    var ok = isCorrect(key, value, G.dir);
    G.locked = true;
    G.score = scoreAfter(G.score, ok);
    if (!ok) {
      G.wrong++;
      if (G.missed.indexOf(key) < 0) G.missed.push(key);
    }
    paintChoices(ok, value, key);
    $('feedback').className = 'feedback ' + (ok ? 'ok' : 'bad');
    $('feedback').textContent = ok
      ? 'Right — ' + key + ' = ' + romajiOf(key)
      : 'No — ' + key + ' is ' + romajiOf(key);
    if (ok && G.score >= targetOf() && G.friend && G.race === 'firstN') {
      G.doneAt = now();
    }
    publishMe();
    saveSoon();
    setTimeout(function () {
      G.i++;
      var finished = G.i >= G.deck.length ||
        (G.friend && G.race === 'firstN' && G.score >= targetOf());
      if (finished) {
        if (!G.doneAt) G.doneAt = now();
        G.locked = false;
        publishMe();
        saveSoon();
        if (!G.friend) showDone();
        else { maybeNewRound(); render(); }
        return;
      }
      G.locked = false;
      dealChoices();
      $('feedback').textContent = '';
      $('feedback').className = 'feedback';
      publishMe();
      render();
    }, FEED_MS);
  }

  function showDone() {
    show('done');
    var n = G.deck.length;
    $('doneTitle').textContent = G.friend ? vsDoneTitle() : 'Deck done';
    $('doneScore').textContent = G.score + ' / ' + n;
    var miss = G.missed.length;
    $('doneNote').textContent = miss
      ? miss + ' to review.'
      : 'Clean sweep.';
    $('reviewDoneBtn').hidden = !miss;
    render();
  }
  function vsDoneTitle() {
    var o = vsOutcome();
    if (o && o.kind === 'win' && o.winner && o.winner.id === me.id) return 'You win';
    if (o && o.kind === 'win') return (o.winner.name || 'They') + ' wins';
    if (o && o.kind === 'draw') return 'Draw';
    return 'Deck done';
  }

  function paintChoices(ok, value, key) {
    var btns = $('choices').querySelectorAll('button');
    var i, v, good;
    for (i = 0; i < btns.length; i++) {
      v = btns[i].getAttribute('data-a');
      good = isCorrect(key, v, G.dir);
      btns[i].disabled = true;
      if (good) btns[i].classList.add('ok');
      else if (v === value && !ok) btns[i].classList.add('bad');
    }
  }

  function groupById(id) {
    var list = groups(), i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function visibleGroups() {
    return groups().filter(function (g) {
      if (G.script === 'both') return true;
      return g.script === G.script;
    });
  }
  function toggleGroup(id) {
    var i = G.groups.indexOf(id);
    if (i >= 0) G.groups.splice(i, 1);
    else G.groups.push(id);
    saveSoon();
    renderHome();
  }
  function setKind(script, kind, on) {
    groups().forEach(function (g) {
      if (g.script !== script) return;
      if (kind && g.kind !== kind) return;
      var i = G.groups.indexOf(g.id);
      if (on && i < 0) G.groups.push(g.id);
      if (!on && i >= 0) G.groups.splice(i, 1);
    });
    saveSoon();
    renderHome();
  }

  function renderHome() {
    var root = $('rows');
    root.textContent = '';
    var vis = visibleGroups();
    var scripts = G.script === 'both' ? ['hiragana', 'katakana'] : [G.script];
    var kinds = [
      { id: 'basic', title: 'Rows' },
      { id: 'dakuten', title: 'Dakuten' },
      { id: 'yoon', title: 'Yōon' },
      { id: 'alike', title: 'Look-alikes' },
      { id: 'extra', title: 'Extra sounds' }
    ];
    scripts.forEach(function (script) {
      var block = document.createElement('div');
      block.className = 'block';
      var h = document.createElement('h2');
      h.textContent = script === 'hiragana' ? 'Hiragana · ひらがな' : 'Katakana · カタカナ';
      block.appendChild(h);
      var q = document.createElement('div');
      q.className = 'quick';
      function link(label, fn) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', fn);
        q.appendChild(b);
      }
      link('All basic', function () { setKind(script, 'basic', true); });
      link('None', function () { setKind(script, null, false); });
      link('Dakuten', function () { setKind(script, 'dakuten', true); });
      link('Yōon', function () { setKind(script, 'yoon', true); });
      block.appendChild(q);
      kinds.forEach(function (kind) {
        var chips = vis.filter(function (g) { return g.script === script && g.kind === kind.id; });
        if (!chips.length) return;
        if (kind.id !== 'basic') {
          var sub = document.createElement('h2');
          sub.textContent = kind.title;
          block.appendChild(sub);
        }
        var wrap = document.createElement('div');
        wrap.className = 'chips';
        chips.forEach(function (g) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip' + (G.groups.indexOf(g.id) >= 0 ? ' on' : '');
          b.textContent = g.label;
          b.addEventListener('click', function () { toggleGroup(g.id); });
          wrap.appendChild(b);
        });
        block.appendChild(wrap);
      });
      root.appendChild(block);
    });
    var miss = G.missed.length;
    $('reviewBtn').hidden = !miss;
    $('reviewBtn').textContent = miss ? ('Review misses (' + miss + ')') : 'Review misses';
    $('friendBtn').hidden = !api;
    $('friendHint').hidden = !api;
    $('scoreChip').textContent = '';
  }

  function renderQuiz() {
    var waiting = G.friend && !racing();
    $('waitNote').hidden = !waiting;
    var key = currentKey();
    var prompt = $('prompt');
    if (waiting || !key) {
      prompt.textContent = waiting ? 'あ' : '';
      prompt.className = 'prompt';
      if (waiting) prompt.style.opacity = '.22';
      else prompt.style.opacity = '';
    } else {
      prompt.style.opacity = '';
      if (G.dir === 'toKana') {
        prompt.textContent = romajiOf(key);
        prompt.className = 'prompt romaji';
      } else {
        prompt.textContent = key;
        prompt.className = 'prompt';
      }
    }
    var box = $('choices');
    box.textContent = '';
    if (!waiting && key && G.choices.length) {
      G.choices.forEach(function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        var label = G.dir === 'toKana' ? k : romajiOf(k);
        b.textContent = label;
        b.setAttribute('data-a', label);
        if (G.dir === 'toKana') b.className = 'kana';
        b.disabled = G.locked;
        b.addEventListener('click', function () { answer(label); });
        box.appendChild(b);
      });
    }
    var t = targetOf();
    $('progress').textContent = waiting
      ? ''
      : ((G.i + 1) + ' / ' + G.deck.length + (G.friend ? (' · first to ' + t) : ''));
    $('scoreChip').textContent = String(G.score);
    if (!G.locked) {
      $('feedback').textContent = '';
      $('feedback').className = 'feedback';
    }
  }

  function vsOutcome() {
    if (!G.friend) return null;
    if (!versusOn()) return { kind: 'waiting' };
    var t = targetOf();
    var mine = {
      id: me.id, name: me.name, score: G.score, wrong: G.wrong,
      i: G.i, done: !!G.doneAt || G.i >= G.deck.length || (G.race === 'firstN' && G.score >= t),
      doneAt: G.doneAt || 0, round: vsRound
    };
    var rows = [mine].concat(others.filter(function (p) { return p.round === vsRound; }));
    var hit = rows.filter(function (p) {
      return G.race === 'firstN' ? p.score >= t : (p.done && p.i >= G.deck.length);
    });
    if (G.race === 'firstN' && hit.length) {
      hit.sort(function (a, b) { return (a.doneAt || a.at || 0) - (b.doneAt || b.at || 0); });
      return { kind: 'win', winner: hit[0] };
    }
    var live = rows.filter(function (p) { return !p.done; });
    if (G.race === 'deck' && rows.length >= 2 && !live.length) {
      rows.sort(function (a, b) { return (b.score - a.score) || ((a.doneAt || 0) - (b.doneAt || 0)); });
      if (rows[0].score === rows[1].score) return { kind: 'draw' };
      return { kind: 'win', winner: rows[0] };
    }
    if (G.race === 'firstN' && rows.length >= 2 && !live.length && !hit.length) {
      rows.sort(function (a, b) { return b.score - a.score; });
      if (rows[0].score === rows[1].score) return { kind: 'draw' };
      return { kind: 'win', winner: rows[0] };
    }
    return { kind: 'playing' };
  }

  function renderVersus() {
    var el = $('versus');
    if (!G.friend) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = '';
    var outcome = vsOutcome();
    function pill(p) {
      if (!p) return;
      var span = document.createElement('span');
      var cls = 'pill' + (p.id === me.id ? ' me' : '');
      if (outcome && outcome.kind === 'win' && outcome.winner && outcome.winner.id === p.id) cls += ' win';
      span.className = cls;
      var label = p.id === me.id ? 'You' : (p.name || 'Friend');
      span.textContent = label + '  ' + (p.score || 0);
      el.appendChild(span);
    }
    pill({ id: me.id, name: me.name, score: G.score });
    others.forEach(pill);

    var modes = document.createElement('div');
    modes.className = 'modes';
    [['firstN', 'First to ' + TARGET_N], ['deck', 'Whole deck']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pair[1];
      b.className = G.race === pair[0] ? 'on' : '';
      b.disabled = !iAmManager();
      b.addEventListener('click', function () { setRace(pair[0]); });
      modes.appendChild(b);
    });
    el.appendChild(modes);

    var note = document.createElement('p');
    note.className = 'note';
    if (!versusOn()) {
      note.textContent = 'Press Invite in the bar above to send the link.';
    } else if (outcome && outcome.kind === 'win') {
      note.textContent = (outcome.winner.id === me.id ? 'You' : (outcome.winner.name || 'They')) +
        ' — first to ' + (G.race === 'deck' ? 'the end' : (TARGET_N + ' right')) + '.';
    } else if (outcome && outcome.kind === 'draw') {
      note.textContent = 'Draw.';
    } else if (G.race === 'deck') {
      note.textContent = 'Same deck. Highest score when it ends.';
    } else {
      note.textContent = 'Same deck. First to ' + targetOf() + ' right.';
    }
    el.appendChild(note);
  }

  function render() {
    if (G.screen === 'home') renderHome();
    else if (G.screen === 'quiz') {
      renderQuiz();
      renderVersus();
      var outcome = vsOutcome();
      if (G.friend && outcome && (outcome.kind === 'win' || outcome.kind === 'draw') && !G.locked) {
        showDone();
        return;
      }
    } else {
      $('scoreChip').textContent = String(G.score);
      renderVersus();
      if (G.friend) {
        $('againBtn').textContent = 'Play again';
        $('doneTitle').textContent = vsDoneTitle();
      } else {
        $('againBtn').textContent = 'Again';
      }
    }
  }

  function setRace(mode) {
    if (mode !== 'firstN' && mode !== 'deck') return;
    if (!G.friend || !iAmManager() || !matchDb) return;
    var next = {
      id: 'm',
      seed: (now() ^ (Math.random() * 0xffffffff)) >>> 0,
      deck: buildDeck(G.groups, now()),
      groups: G.groups.slice(),
      dir: G.dir,
      race: mode,
      round: (vsRound || 1) + (G.i > 0 || G.score > 0 ? 1 : 0),
      startedAt: now()
    };
    if (!(G.i > 0 || G.score > 0)) {
      next.round = vsRound || 1;
      next.deck = G.deck.slice();
      next.seed = match && match.seed != null ? match.seed : next.seed;
    }
    match = next;
    matchDb.put(match).catch(function () {});
    applyMatch(match);
    render();
  }

  function setScript(s) {
    G.script = s;
    var vis = visibleGroups().map(function (g) { return g.id; });
    var keep = G.groups.filter(function (id) { return vis.indexOf(id) >= 0; });
    if (!keep.length) {
      if (s === 'katakana') keep = ['k_group1', 'k_group2'];
      else keep = ['h_group1', 'h_group2'];
    }
    G.groups = keep;
    saveSoon();
    renderHome();
  }
  function setDir(d) {
    G.dir = d === 'toKana' ? 'toKana' : 'toRomaji';
    saveSoon();
  }

  function bindSeg(el, attr, fn) {
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      var v = b.getAttribute(attr);
      Array.prototype.forEach.call(el.children, function (c) { c.classList.remove('on'); });
      b.classList.add('on');
      fn(v);
    });
  }
  bindSeg($('scriptSeg'), 'data-script', setScript);
  bindSeg($('dirSeg'), 'data-dir', setDir);

  $('startBtn').addEventListener('click', function () { startDrill({}); });
  $('reviewBtn').addEventListener('click', function () { startDrill({ review: true }); });
  $('reviewDoneBtn').addEventListener('click', function () { startDrill({ review: true }); });
  $('friendBtn').addEventListener('click', function () {
    if (!api) return;
    G.friend = true;
    G.race = 'firstN';
    ensureMatch(true);
    startDrill({ friend: true });
  });
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
  $('infoBtn').addEventListener('click', function () { $('modal-info').hidden = false; });
  $('modal-info').addEventListener('click', function (ev) {
    if (ev.target === $('modal-info')) $('modal-info').hidden = true;
  });
  $('modal-info').querySelector('[data-close]').addEventListener('click', function () {
    $('modal-info').hidden = true;
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (!$('modal-info').hidden && ev.key === 'Escape') {
      $('modal-info').hidden = true; ev.preventDefault(); return;
    }
    if (G.screen !== 'quiz' || G.locked) return;
    var n = ev.key ? ev.key.charCodeAt(0) - 49 : -1;
    if (n >= 0 && n < 4) {
      var btns = $('choices').querySelectorAll('button');
      if (btns[n] && !btns[n].disabled) {
        answer(btns[n].getAttribute('data-a'));
        ev.preventDefault();
      }
    }
  });

  if (api && api.onBack) {
    api.onBack(function () {
      if (!$('modal-info').hidden) { $('modal-info').hidden = true; return true; }
      if (G.screen !== 'home') { goHome(); return true; }
      return false;
    });
  }

  function goHome() {
    G.friend = false;
    G.locked = false;
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
      script: G.script,
      dir: G.dir,
      groups: G.groups.slice(),
      missed: G.missed.slice(),
      race: G.race
    }).catch(function () {});
    if (!G.friend && G.screen === 'quiz' && G.deck.length) {
      prefsDb.put({
        id: 'solo',
        deck: G.deck.slice(),
        i: G.i,
        score: G.score,
        wrong: G.wrong,
        dir: G.dir,
        groups: G.groups.slice()
      }).catch(function () {});
    }
  }
  function restorePrefs(rows) {
    var by = {};
    (rows || []).forEach(function (r) { if (r && r.id) by[r.id] = r; });
    if (by.setup) {
      if (by.setup.script) G.script = by.setup.script;
      if (by.setup.dir) G.dir = by.setup.dir;
      if (Array.isArray(by.setup.groups) && by.setup.groups.length) G.groups = by.setup.groups.slice();
      if (Array.isArray(by.setup.missed)) G.missed = by.setup.missed.slice();
      if (by.setup.race) G.race = by.setup.race;
      Array.prototype.forEach.call($('scriptSeg').children, function (c) {
        c.classList.toggle('on', c.getAttribute('data-script') === G.script);
      });
      Array.prototype.forEach.call($('dirSeg').children, function (c) {
        c.classList.toggle('on', c.getAttribute('data-dir') === G.dir);
      });
    }
    if (by.solo && Array.isArray(by.solo.deck) && by.solo.deck.length && !G.friend) {
      G.deck = by.solo.deck.slice();
      G.i = by.solo.i | 0;
      G.score = by.solo.score | 0;
      G.wrong = by.solo.wrong | 0;
      if (by.solo.dir) G.dir = by.solo.dir;
      if (G.i < G.deck.length) {
        dealChoices();
        show('quiz');
      }
    }
  }

  function publishMe() {
    if (!playersDb || !me.id || me.id === 'local') return;
    var t = targetOf();
    var done = !!G.doneAt || (G.friend && (G.i >= G.deck.length || (G.race === 'firstN' && G.score >= t)));
    playersDb.put({
      id: me.id,
      name: me.name,
      score: G.score,
      wrong: G.wrong,
      i: G.i,
      done: done,
      doneAt: G.doneAt || 0,
      at: now(),
      seen: now(),
      round: vsRound,
      ready: !!G.ready,
      race: G.race,
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
      maybeNewRound();
    } else if (versusOn() && others.some(function (p) { return p.friend; }) && G.screen === 'home') {
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
    var race = m.race === 'deck' ? 'deck' : 'firstN';
    var same = r === vsRound && G.deck.join('\0') === m.deck.join('\0') && G.race === race && G.dir === (m.dir || G.dir);
    vsRound = r;
    G.race = race;
    if (m.dir) G.dir = m.dir;
    if (Array.isArray(m.groups) && m.groups.length) G.groups = m.groups.slice();
    if (!same) {
      G.deck = m.deck.slice();
      G.i = 0;
      G.score = 0;
      G.wrong = 0;
      G.doneAt = 0;
      G.ready = false;
      G.locked = false;
      dealChoices();
      if (G.friend) show('quiz');
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
    // Host writes the shared deck/seed. A guest never touches the match row.
    if (!iAmManager()) {
      if (match && match.deck) applyMatch(match);
      return;
    }
    var seed = (now() ^ ((Math.random() * 0xffffffff) | 0)) >>> 0;
    var deck = buildDeck(G.groups, seed);
    match = {
      id: 'm',
      seed: seed,
      deck: deck,
      groups: G.groups.slice(),
      dir: G.dir,
      race: G.race || 'firstN',
      round: force && match && match.round ? (match.round | 0) + 1 : 1,
      startedAt: now()
    };
    vsRound = match.round;
    matchDb.put(match).catch(function () {});
    applyMatch(match);
  }

  function allLiveDone() {
    var o = vsOutcome();
    return o && (o.kind === 'win' || o.kind === 'draw');
  }
  function anyoneReady() {
    if (G.ready) return true;
    for (var i = 0; i < others.length; i++) {
      if (others[i].round === vsRound && others[i].ready) return true;
    }
    return false;
  }
  function maybeNewRound() {
    if (!G.friend || !iAmManager() || !matchDb) return;
    if (!allLiveDone() || !anyoneReady()) return;
    var cur = match && match.round ? match.round : (vsRound || 1);
    if (cur !== vsRound) return;
    var seed = (now() ^ ((Math.random() * 0xffffffff) | 0)) >>> 0;
    match = {
      id: 'm',
      seed: seed,
      deck: buildDeck(G.groups, seed),
      groups: G.groups.slice(),
      dir: G.dir,
      race: G.race,
      round: cur + 1,
      startedAt: now()
    };
    matchDb.put(match).catch(function () {});
    applyMatch(match);
    show('quiz');
    render();
  }

  function beat() { if (G.friend || versusOn()) publishMe(); }

  function boot() {
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
      });
    }).catch(function () { render(); });
  }

  boot();
})(this);
