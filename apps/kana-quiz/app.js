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
  var STALE_MS = 9000, HB_MS = 3000;
  var FEED_OK = 380, FEED_BAD = 900;
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
    requeued: [],
    choices: [],
    locked: false,
    screen: 'home',
    friend: false,
    race: 'firstN',
    ready: false,
    doneAt: 0,
    more: false,
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
  function selectedCount() {
    return collect(G.groups).length;
  }

  function show(name) {
    G.screen = name;
    $('home').hidden = name !== 'home';
    $('lobby').hidden = name !== 'lobby';
    $('quiz').hidden = name !== 'quiz';
    $('done').hidden = name !== 'done';
    $('backBtn').hidden = name === 'home';
    if (name === 'home') renderHome();
    if (name === 'lobby') renderLobby();
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

  function snapshotSolo() {
    if (!G.deck.length) return null;
    return {
      deck: G.deck.slice(),
      i: G.i,
      score: G.score,
      wrong: G.wrong,
      dir: G.dir,
      groups: G.groups.slice(),
      requeued: G.requeued.slice()
    };
  }

  function startDrill(opts) {
    opts = opts || {};
    var ids = G.groups.slice();
    if (!ids.length && !opts.review && !opts.resume) {
      $('homeErr').hidden = false;
      $('homeErr').textContent = 'Pick at least one row.';
      return;
    }
    if ($('homeErr')) $('homeErr').hidden = true;
    G.friend = !!opts.friend;
    G.ready = false;
    G.doneAt = 0;
    G.locked = false;
    if (opts.resume && G.solo && G.solo.deck && G.solo.deck.length) {
      G.deck = G.solo.deck.slice();
      G.i = G.solo.i | 0;
      G.score = G.solo.score | 0;
      G.wrong = G.solo.wrong | 0;
      G.requeued = Array.isArray(G.solo.requeued) ? G.solo.requeued.slice() : [];
      if (G.solo.dir) G.dir = G.solo.dir;
      G.friend = false;
    } else if (opts.review) {
      if (!G.missed.length) return;
      G.deck = shuffle(G.missed.slice());
      G.missed = [];
      G.requeued = [];
      G.friend = false;
      G.i = 0;
      G.score = 0;
      G.wrong = 0;
    } else if (G.friend && match && match.deck && match.deck.length) {
      G.i = 0;
      G.score = 0;
      G.wrong = 0;
      G.requeued = [];
      applyMatch(match);
    } else {
      G.deck = buildDeck(ids, opts.seed);
      G.i = 0;
      G.score = 0;
      G.wrong = 0;
      G.requeued = [];
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
      if (!ok && !G.friend && G.requeued.indexOf(key) < 0) {
        G.deck.push(key);
        G.requeued.push(key);
      }
      G.i++;
      var finished = G.i >= G.deck.length ||
        (G.friend && G.race === 'firstN' && G.score >= targetOf());
      if (finished) {
        if (!G.doneAt) G.doneAt = now();
        G.locked = false;
        if (!G.friend) G.solo = null;
        publishMe();
        saveSoon();
        if (!G.friend) showDone();
        else { maybeNewRound(); render(); }
        return;
      }
      G.locked = false;
      dealChoices();
      publishMe();
      render();
    }, ok ? FEED_OK : FEED_BAD);
  }

  function showDone() {
    show('done');
    var n = G.deck.length;
    $('doneTitle').textContent = G.friend ? vsDoneTitle() : 'Deck done';
    $('doneScore').textContent = G.score + ' / ' + n;
    var miss = G.missed.length;
    $('doneNote').textContent = miss
      ? (miss === 1
        ? '1 to review — it waits here until it sticks.'
        : miss + ' to review — they wait here until they stick.')
      : 'Clean sweep.';
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
      b.lang = 'ja';
      b.textContent = k;
      var sm = document.createElement('small');
      sm.textContent = romajiOf(k);
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
  function groupById(id) {
    var list = groups(), i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function applyPreset(kind) {
    var scripts = G.script === 'both' ? ['hiragana', 'katakana'] : [G.script];
    var next = [];
    var other = G.groups.filter(function (id) {
      var g = groupById(id);
      return g && scripts.indexOf(g.script) < 0;
    });
    scripts.forEach(function (script) {
      var vis = groups().filter(function (g) { return g.script === script; });
      if (kind === 'vowels') {
        vis.forEach(function (g) {
          if (g.id === 'h_group1' || g.id === 'k_group1') next.push(g.id);
        });
      } else if (kind === 'two') {
        vis.forEach(function (g) {
          if (g.kind === 'basic' && (g.id === 'h_group1' || g.id === 'h_group2' ||
              g.id === 'k_group1' || g.id === 'k_group2')) next.push(g.id);
        });
      } else if (kind === 'all') {
        vis.forEach(function (g) { if (g.kind === 'basic') next.push(g.id); });
      }
    });
    G.groups = other.concat(next);
    saveSoon();
    renderHome();
  }

  function renderHome() {
    var root = $('rows');
    root.textContent = '';
    var vis = visibleGroups();
    var scripts = G.script === 'both' ? ['hiragana', 'katakana'] : [G.script];
    var extraKinds = ['dakuten', 'yoon', 'alike', 'extra'];

    var presets = $('presets');
    presets.textContent = '';
    var visBasic = vis.filter(function (g) { return g.kind === 'basic'; }).map(function (g) { return g.id; });
    var selBasic = visBasic.filter(function (id) { return G.groups.indexOf(id) >= 0; });
    var vowelIds = visBasic.filter(function (id) { return id === 'h_group1' || id === 'k_group1'; });
    var twoIds = visBasic.filter(function (id) {
      return id === 'h_group1' || id === 'h_group2' || id === 'k_group1' || id === 'k_group2';
    });
    function sameSet(a, b) {
      if (a.length !== b.length) return false;
      var i;
      for (i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
      return true;
    }
    [
      ['vowels', 'Vowels', vowelIds],
      ['two', 'あ か', twoIds],
      ['all', 'All 46', visBasic],
      ['none', 'None', []]
    ].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pair[1];
      if (G.script === 'katakana' && pair[0] === 'two') b.textContent = 'ア カ';
      if (G.script === 'both' && pair[0] === 'two') b.textContent = 'First two';
      if (G.script !== 'hiragana' && pair[0] === 'all') b.textContent = 'All basic';
      if (sameSet(selBasic, pair[2]) && (pair[0] === 'none' || pair[2].length)) b.className = 'on';
      if (pair[0] === 'none' && !selBasic.length) b.className = 'on';
      b.addEventListener('click', function () { applyPreset(pair[0]); });
      presets.appendChild(b);
    });

    scripts.forEach(function (script) {
      var block = document.createElement('div');
      block.className = 'block';
      var h = document.createElement('h2');
      h.textContent = script === 'hiragana' ? 'Hiragana · ひらがな' : 'Katakana · カタカナ';
      block.appendChild(h);
      vis.filter(function (g) { return g.script === script && g.kind === 'basic'; })
        .forEach(function (g) { block.appendChild(rowBtn(g)); });

      var extras = vis.filter(function (g) {
        return g.script === script && extraKinds.indexOf(g.kind) >= 0;
      });
      if (extras.length) {
        var more = document.createElement('button');
        more.type = 'button';
        more.className = 'more';
        more.setAttribute('data-more', script);
        var nOn = extras.filter(function (g) { return G.groups.indexOf(g.id) >= 0; }).length;
        more.textContent = G.more
          ? 'Hide extra rows'
          : ('Dakuten, yōon, extras' + (nOn ? ' · ' + nOn + ' on' : ''));
        more.addEventListener('click', function () {
          G.more = !G.more;
          renderHome();
        });
        block.appendChild(more);
        if (G.more) {
          extraKinds.forEach(function (kind) {
            var chips = extras.filter(function (g) { return g.kind === kind; });
            if (!chips.length) return;
            var sub = document.createElement('h2');
            sub.textContent = kind === 'yoon' ? 'Yōon' : kind === 'alike' ? 'Look-alikes' : kind === 'extra' ? 'Extra sounds' : 'Dakuten';
            block.appendChild(sub);
            chips.forEach(function (g) { block.appendChild(rowBtn(g)); });
          });
        }
      }
      root.appendChild(block);
    });

    var n = selectedCount();
    $('pickCount').textContent = n ? (n + ' in this drill') : 'Pick a row to start';
    var canResume = !!(G.solo && G.solo.deck && G.solo.i < G.solo.deck.length);
    $('startBtn').disabled = !n;
    $('startBtn').textContent = 'Start drill';
    $('startBtn').className = 'primary';
    $('startBtn').hidden = canResume;
    $('freshBtn').hidden = !canResume;

    var miss = G.missed.length;
    $('reviewBtn').hidden = !miss;
    $('reviewBtn').textContent = miss ? ('Review misses (' + miss + ')') : 'Review misses';

    $('continueBtn').hidden = !canResume;
    if (canResume) {
      $('continueBtn').textContent = 'Continue  ' + (G.solo.i + 1) + ' / ' + G.solo.deck.length;
    }

    $('friendBtn').hidden = !api;
    $('scoreChip').textContent = '';
    Array.prototype.forEach.call($('scriptSeg').children, function (c) {
      c.classList.toggle('on', c.getAttribute('data-script') === G.script);
    });
    Array.prototype.forEach.call($('dirSeg').children, function (c) {
      c.classList.toggle('on', c.getAttribute('data-dir') === G.dir);
    });
  }

  function rowBtn(g) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'crow' + (G.groups.indexOf(g.id) >= 0 ? ' on' : '');
    b.setAttribute('aria-pressed', G.groups.indexOf(g.id) >= 0 ? 'true' : 'false');
    var keys = g.keys.slice();
    var i, cell, sm, k;
    for (i = 0; i < Math.max(keys.length, 1); i++) {
      k = keys[i];
      cell = document.createElement('span');
      cell.className = 'ck';
      cell.lang = 'ja';
      if (k) {
        cell.appendChild(document.createTextNode(k));
        sm = document.createElement('small');
        sm.textContent = romajiOf(k);
        cell.appendChild(sm);
      }
      b.appendChild(cell);
    }
    b.addEventListener('click', function () { toggleGroup(g.id); });
    return b;
  }

  function renderQuiz() {
    var waiting = G.friend && !racing();
    $('waitNote').hidden = !waiting;
    var key = currentKey();
    var prompt = $('prompt');
    if (waiting || !key) {
      prompt.textContent = waiting ? 'あ' : '';
      prompt.className = 'prompt';
      prompt.style.opacity = waiting ? '.22' : '';
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
    if (!G.locked) {
      box.textContent = '';
      if (!waiting && key && G.choices.length) {
        G.choices.forEach(function (k) {
          var b = document.createElement('button');
          b.type = 'button';
          var label = G.dir === 'toKana' ? k : romajiOf(k);
          b.textContent = label;
          b.setAttribute('data-a', label);
          if (G.dir === 'toKana') { b.className = 'kana'; b.lang = 'ja'; }
          b.addEventListener('click', function () { answer(label); });
          box.appendChild(b);
        });
      }
    }
    var t = targetOf();
    var n = G.deck.length;
    $('progress').textContent = waiting
      ? ''
      : ((G.i + 1) + ' / ' + n + (G.friend ? (' · first to ' + t) : ''));
    var fill = $('barFill');
    if (fill) fill.style.width = n ? (Math.min(100, (G.i / n) * 100) + '%') : '0';
    $('scoreChip').textContent = String(G.score);
    if (!G.locked) {
      $('feedback').textContent = G.dir === 'toKana' ? 'Which kana?' : 'Which sound?';
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
      span.textContent = label + '  ' + (p.score || 0);
      el.appendChild(span);
    }
    pill({ id: me.id, name: me.name, score: G.score });
    others.forEach(pill);
  }

  function renderLobby() {
    fillPills($('lobbyPeople'), {});
    $('lobbyWait').textContent = versusOn()
      ? 'Friend is here — starting…'
      : 'Waiting for a friend…';
    Array.prototype.forEach.call($('raceSeg').children, function (c) {
      c.classList.toggle('on', c.getAttribute('data-race') === G.race);
      c.disabled = versusOn() && !iAmManager();
    });
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
    else if (G.screen === 'lobby') renderLobby();
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
      paintMissed();
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
    G.race = mode;
    if (!G.friend || !matchDb) {
      saveSoon();
      renderLobby();
      return;
    }
    if (!iAmManager()) return;
    var next = {
      id: 'm',
      seed: (now() ^ (Math.random() * 0xffffffff)) >>> 0,
      deck: buildDeck(G.groups, now()),
      groups: G.groups.slice(),
      dir: G.dir,
      race: mode,
      round: vsRound || 1,
      startedAt: now()
    };
    if (match && match.deck && match.deck.length && !(G.i > 0 || G.score > 0)) {
      next.deck = match.deck.slice();
      next.seed = match.seed;
      next.round = match.round || 1;
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
      else if (s === 'both') keep = ['h_group1', 'h_group2', 'k_group1', 'k_group2'];
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
  bindSeg($('raceSeg'), 'data-race', setRace);

  $('startBtn').addEventListener('click', function () { startDrill({}); });
  $('freshBtn').addEventListener('click', function () { startDrill({}); });
  $('continueBtn').addEventListener('click', function () { startDrill({ resume: true }); });
  $('reviewBtn').addEventListener('click', function () { startDrill({ review: true }); });
  $('reviewDoneBtn').addEventListener('click', function () { startDrill({ review: true }); });
  $('friendBtn').addEventListener('click', function () {
    if (!api) return;
    G.friend = true;
    G.race = G.race || 'firstN';
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
  $('backBtn').addEventListener('click', function () {
    if (G.screen === 'lobby') { goHome(); return; }
    goHome();
  });
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
    if (G.screen === 'quiz' && !G.friend && G.deck.length && G.i < G.deck.length) {
      G.solo = snapshotSolo();
    }
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
    var solo = (!G.friend && G.screen === 'quiz' && G.deck.length && G.i < G.deck.length)
      ? snapshotSolo()
      : G.solo;
    if (solo && solo.deck && solo.deck.length) {
      prefsDb.put({
        id: 'solo',
        deck: solo.deck.slice(),
        i: solo.i,
        score: solo.score,
        wrong: solo.wrong,
        dir: solo.dir,
        groups: solo.groups ? solo.groups.slice() : G.groups.slice(),
        requeued: solo.requeued ? solo.requeued.slice() : []
      }).catch(function () {});
    } else {
      prefsDb.put({ id: 'solo', deck: [] }).catch(function () {});
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
    }
    if (by.solo && Array.isArray(by.solo.deck) && by.solo.deck.length && (by.solo.i | 0) < by.solo.deck.length) {
      G.solo = {
        deck: by.solo.deck.slice(),
        i: by.solo.i | 0,
        score: by.solo.score | 0,
        wrong: by.solo.wrong | 0,
        dir: by.solo.dir || G.dir,
        groups: Array.isArray(by.solo.groups) ? by.solo.groups.slice() : G.groups.slice(),
        requeued: Array.isArray(by.solo.requeued) ? by.solo.requeued.slice() : []
      };
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
      if (G.screen === 'lobby') {
        startDrill({ friend: true });
        return;
      }
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
      G.requeued = [];
      dealChoices();
      if (G.friend && G.screen !== 'lobby') show('quiz');
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
