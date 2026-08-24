/*
 * Memory — classic-script port of sepandhaghighi/mnimi.
 *
 * Same rules as vendor/script.js: 4 pads, a growing sequence, extra pads
 * after level 7 and 14, speed 2500 down to 550. No SweetAlert, no CDN, no
 * music. Pad tones are local Web Audio. Best score in gifos.db. Invite is a
 * race on the same seeded sequence — whoever taps Start publishes the seed.
 */
(function (root) {
  'use strict';

  var COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b7950b', '#6c3483', '#1a5276', '#922b21', '#117a65'];
  var NAMES = ['Red', 'Blue', 'Green', 'Gold', 'Purple', 'Teal', 'Crimson', 'Jade'];
  var TONES = [415, 310, 252, 209, 349, 277, 466, 185];
  var MUT1 = 7, MUT2 = 14;
  var SPEED0 = 2500, SPEED_STEP = 400, SPEED_MIN = 550, OFFSET = 700;

  function mulberry(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function padsFor(level) {
    if (level > MUT2) return 8;
    if (level > MUT1) return 6;
    return 4;
  }
  function speedFor(level) {
    var s = SPEED0 - (level - 1) * SPEED_STEP;
    return s < SPEED_MIN ? SPEED_MIN : s;
  }
  function sequenceOf(seed, n) {
    var rnd = mulberry(seed), out = [], i;
    for (i = 0; i < n; i++) out.push((rnd() * padsFor(i + 1)) | 0);
    return out;
  }

  function create() {
    return {
      level: 1, score: 0, best: 0, pads: 4,
      seq: [], step: 0, phase: 'idle', seed: 1
    };
  }
  function begin(G, seed) {
    G.level = 1;
    G.score = 0;
    G.seed = (seed >>> 0) || 1;
    G.pads = padsFor(G.level);
    G.seq = sequenceOf(G.seed, G.level);
    G.step = 0;
    G.phase = 'demo';
    return G;
  }
  function ready(G) {
    G.phase = 'play';
    G.step = 0;
    return G;
  }
  function tap(G, i) {
    if (G.phase !== 'play') return { ok: false, reason: 'not-play' };
    i = i | 0;
    if (G.seq[G.step] !== i) {
      G.phase = 'over';
      return { ok: false, reason: 'miss', expected: G.seq[G.step], got: i, score: G.score };
    }
    G.step++;
    if (G.step >= G.seq.length) {
      G.score += 1;
      if (G.score > G.best) G.best = G.score;
      G.level += 1;
      G.pads = padsFor(G.level);
      G.seq = sequenceOf(G.seed, G.level);
      G.step = 0;
      G.phase = 'demo';
      return { ok: true, reason: 'level', level: G.level, score: G.score, best: G.best };
    }
    return { ok: true, reason: 'step', left: G.seq.length - G.step };
  }

  root.MemoryRules = {
    padsFor: padsFor, speedFor: speedFor, sequenceOf: sequenceOf,
    mut1: MUT1, mut2: MUT2, speed0: SPEED0,
    create: create, begin: begin, ready: ready, tap: tap
  };

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board'), startBtn = $('start'), statusEl = $('status');
  var scoreEl = $('score'), bestEl = $('best'), muteBtn = $('mute');
  var versusEl = $('versus'), pillsEl = $('pills'), vsNote = $('vsNote');
  if (!board || !startBtn) return;

  var G = create();
  G.muted = false;

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, matchDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      matchDb = api.db('match');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var me = { id: 'local', name: 'You' };
  var others = [];
  var match = null;
  var started = false;
  var ac = null;
  var timers = [];

  function versusOn() { return others.length > 0; }

  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
  }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function persist() {
    if (!saveDb) return;
    saveDb.put({ id: 'best', score: G.best, muted: !!G.muted }).catch(function () {});
  }

  function publish() {
    if (!started || !playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id, name: me.name,
      round: match && match.id, score: G.score, level: G.level,
      phase: G.phase, t: Date.now()
    }).catch(function () {});
  }

  function paint() {
    scoreEl.textContent = 'Score ' + G.score;
    bestEl.textContent = 'Best ' + G.best;
    if (muteBtn) muteBtn.textContent = G.muted ? 'Sound off' : 'Sound on';
    if (muteBtn) muteBtn.setAttribute('aria-pressed', G.muted ? 'true' : 'false');
    if (!versusOn()) { versusEl.hidden = true; return; }
    versusEl.hidden = false;
    vsNote.textContent = 'Same sequence. Higher score wins.';
    var rows = [{ id: me.id, name: me.name, mine: true, score: G.score, phase: G.phase }]
      .concat(others.map(function (p) {
        return { id: p.id, name: p.name, mine: false, score: p.score || 0, phase: p.phase };
      }));
    pillsEl.innerHTML = rows.map(function (p) {
      var tag = p.phase === 'over' ? ' · miss' : (p.phase === 'play' || p.phase === 'demo' ? ' · L' + (p.score + 1) : '');
      return '<span class="' + (p.mine ? 'me' : '') + '">' +
        (p.name || 'Player').replace(/[<>&]/g, '') + ' · ' + p.score + tag + '</span>';
    }).join('');
  }

  function beep(i) {
    if (G.muted) return;
    try {
      var Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return;
      if (!ac) ac = new Ctx();
      if (ac.state === 'suspended') ac.resume().catch(function () {});
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = 'square';
      o.frequency.value = TONES[(i % TONES.length + TONES.length) % TONES.length];
      g.gain.setValueAtTime(0.09, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
      o.connect(g); g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.22);
    } catch (e) {}
  }

  function buildBoard(n) {
    G.pads = n;
    board.className = 'n' + n;
    board.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pad';
      b.style.background = COLORS[i % COLORS.length];
      b.setAttribute('data-i', String(i));
      b.setAttribute('aria-label', NAMES[i] || ('Pad ' + (i + 1)));
      b.addEventListener('pointerdown', onPad, { passive: false });
      board.appendChild(b);
    }
  }

  function flash(i, on, label) {
    var el = board.children[i];
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.textContent = on && label ? String(label) : '';
  }

  function demoMs() {
    var s = speedFor(G.level);
    var on = s * 0.28;
    if (on > 640) on = 640;
    if (on < 220) on = 220;
    return { on: on, gap: 160 };
  }

  function demo() {
    G.phase = 'demo';
    G.step = 0;
    statusEl.textContent = 'Watch.';
    startBtn.textContent = 'Level ' + G.level;
    startBtn.disabled = true;
    var i = 0;
    var t = demoMs();
    function step() {
      if (i >= G.seq.length) {
        later(function () {
          ready(G);
          statusEl.textContent = 'Your turn — ' + G.seq.length + ' tap' + (G.seq.length === 1 ? '' : 's') + '.';
          startBtn.disabled = true;
          paint();
          publish();
        }, 280);
        return;
      }
      var idx = G.seq[i];
      flash(idx, true, i + 1);
      beep(idx);
      later(function () {
        flash(idx, false);
        i++;
        later(step, t.gap);
      }, t.on);
    }
    later(step, 360);
  }

  function beginRound(seed) {
    clearTimers();
    [].forEach.call(board.children, function (el) { el.classList.remove('bad', 'hint'); });
    begin(G, seed);
    buildBoard(G.pads);
    paint();
    publish();
    demo();
  }

  function onPad(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.button && e.button !== 0) return;
    if (G.phase !== 'play') return;
    var i = parseInt(e.currentTarget.getAttribute('data-i'), 10);
    var shown = G.step + 1;
    var r = tap(G, i);
    flash(i, true, r.ok ? String(shown) : '');
    beep(i);
    later(function () { flash(i, false); }, 180);
    if (!r.ok && r.reason === 'miss') {
      if (board.children[i]) board.children[i].classList.add('bad');
      var exp = board.children[r.expected];
      if (exp) exp.classList.add('hint');
      statusEl.textContent = 'Miss. That was ' + (NAMES[r.expected] || ('pad ' + (r.expected + 1))) +
        '. Score ' + G.score + '.';
      startBtn.textContent = 'Start';
      startBtn.disabled = false;
      persist();
      paint();
      publish();
      return;
    }
    if (r.reason === 'level') {
      statusEl.textContent = 'Good. Level ' + G.level + '.';
      startBtn.textContent = 'Level ' + G.level;
      persist();
      paint();
      publish();
      later(function () {
        buildBoard(G.pads);
        demo();
      }, 480);
      return;
    }
    statusEl.textContent = r.left + ' left.';
  }

  startBtn.addEventListener('click', function () {
    if (G.phase === 'demo' || G.phase === 'play') return;
    var seed = ((Math.random() * 0x7fffffff) | 1);
    if (versusOn() && matchDb) {
      var rec = { id: 'round', n: Date.now(), seed: seed };
      matchDb.put(rec).catch(function (err) {
        statusEl.textContent = (err && err.message) || 'Could not share the round.';
      });
      match = { id: rec.n, seed: rec.seed };
    }
    beginRound(seed);
  });

  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      G.muted = !G.muted;
      persist();
      paint();
      if (!G.muted) beep(1);
    });
  }

  function ingestMatch(list) {
    var row = null;
    (list || []).forEach(function (r) { if (r && r.id === 'round') row = r; });
    if (!row || !row.n) return;
    if (!match || row.n !== match.id) {
      match = { id: row.n, seed: row.seed };
      beginRound(row.seed);
    }
  }

  function ingestPlayers(list) {
    others = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === me.id) return;
      others.push(p);
    });
    paint();
  }

  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var map = {
      Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3,
      Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7,
      Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3,
      KeyQ: 0, KeyW: 1, KeyA: 2, KeyS: 3
    };
    if (e.code === 'Space' || e.code === 'Enter') {
      if (G.phase === 'idle' || G.phase === 'over') startBtn.click();
      e.preventDefault();
      return;
    }
    if (map[e.code] == null) return;
    var i = map[e.code];
    var el = board.children[i];
    if (!el) return;
    e.preventDefault();
    onPad({ currentTarget: el, preventDefault: function () {}, button: 0 });
  });

  buildBoard(4);
  paint();
  statusEl.textContent = 'Watch the pads, then tap them back.';

  function boot() {
    if (!api || !api.db) return;
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      var p = Promise.resolve();
      if (saveDb) {
        p = saveDb.get('best').then(function (row) {
          if (!row) return;
          if (row.score) G.best = row.score | 0;
          if (row.muted) G.muted = !!row.muted;
          paint();
        }).catch(function () {});
      }
      return p;
    }).then(function () {
      if (!matchDb || !playersDb || me.id === 'local') return;
      started = true;
      matchDb.subscribe(ingestMatch);
      playersDb.subscribe(ingestPlayers);
      publish();
    }).catch(function () {});
  }

  if (api && api.onBack) {
    api.onBack(function () {
      if (G.phase === 'demo' || G.phase === 'play') {
        G.phase = 'over';
        clearTimers();
        statusEl.textContent = 'Round stopped. Score ' + G.score + '.';
        startBtn.textContent = 'Start';
        startBtn.disabled = false;
        persist();
        paint();
        publish();
        return true;
      }
      return false;
    });
  }

  boot();
})(window);
