/*
 * Memory — classic-script port of sepandhaghighi/mnimi.
 *
 * Same rules as vendor/script.js: 4 pads, a growing sequence, extra pads
 * after level 7 and 14, speed 2500 down to 550. No SweetAlert, no CDN, no
 * music. Best score in gifos.db. Invite is a race on the same seeded sequence.
 */
(function (root) {
  'use strict';

  var COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b7950b', '#6c3483', '#1a5276', '#922b21', '#117a65'];
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

  root.MemoryRules = {
    padsFor: padsFor, speedFor: speedFor, sequenceOf: sequenceOf,
    mut1: MUT1, mut2: MUT2, speed0: SPEED0
  };

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board'), startBtn = $('start'), statusEl = $('status');
  var scoreEl = $('score'), bestEl = $('best');
  var versusEl = $('versus'), pillsEl = $('pills'), vsNote = $('vsNote');

  var G = {
    level: 1, score: 0, best: 0, pads: 4,
    seq: [], step: 0, phase: 'idle', // idle | demo | play | over
    seed: 1, timers: []
  };

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

  function versusOn() { return others.length > 0; }
  function iAmManager() {
    var ids = [me.id].concat(others.map(function (p) { return p.id; }));
    ids.sort();
    return ids[0] === me.id;
  }

  function clearTimers() {
    G.timers.forEach(function (t) { clearTimeout(t); });
    G.timers = [];
  }
  function later(fn, ms) { G.timers.push(setTimeout(fn, ms)); }

  function persistBest() {
    if (!saveDb || G.score <= G.best) return;
    G.best = G.score;
    bestEl.textContent = 'Best ' + G.best;
    saveDb.put({ id: 'best', score: G.best }).catch(function () {});
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
    if (!versusOn()) { versusEl.hidden = true; return; }
    versusEl.hidden = false;
    vsNote.textContent = 'Same sequence. Higher score wins.';
    var rows = [{ id: me.id, name: me.name, mine: true, score: G.score, phase: G.phase }]
      .concat(others.map(function (p) {
        return { id: p.id, name: p.name, mine: false, score: p.score || 0, phase: p.phase };
      }));
    pillsEl.innerHTML = rows.map(function (p) {
      return '<span class="' + (p.mine ? 'me' : '') + '">' +
        (p.name || 'Player').replace(/[<>&]/g, '') + ' · ' + p.score + '</span>';
    }).join('');
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
      b.setAttribute('aria-label', 'Pad ' + (i + 1));
      b.addEventListener('click', onPad);
      board.appendChild(b);
    }
  }

  function flash(i, on, label) {
    var el = board.children[i];
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.textContent = on && label ? String(label) : '';
  }

  function demo() {
    G.phase = 'demo';
    G.step = 0;
    statusEl.textContent = 'Watch.';
    startBtn.textContent = 'Level ' + G.level;
    var i = 0;
    var speed = speedFor(G.level);
    function step() {
      if (i >= G.seq.length) {
        later(function () {
          G.phase = 'play';
          statusEl.textContent = 'Your turn.';
        }, 280);
        return;
      }
      var idx = G.seq[i];
      flash(idx, true, i + 1);
      later(function () {
        flash(idx, false);
        i++;
        later(step, OFFSET * 0.45);
      }, speed * 0.45);
    }
    later(step, 400);
  }

  function beginRound(seed, keepScore) {
    clearTimers();
    if (!keepScore) { G.level = 1; G.score = 0; }
    G.seed = (seed >>> 0) || ((Math.random() * 0x7fffffff) | 1);
    G.pads = padsFor(G.level);
    buildBoard(G.pads);
    G.seq = sequenceOf(G.seed, G.level);
    G.phase = 'demo';
    paint();
    publish();
    demo();
  }

  function nextLevel() {
    G.score += 1;
    persistBest();
    G.level += 1;
    G.pads = padsFor(G.level);
    buildBoard(G.pads);
    G.seq = sequenceOf(G.seed, G.level);
    paint();
    publish();
    later(demo, 500);
  }

  function miss(i) {
    G.phase = 'over';
    if (board.children[i]) board.children[i].classList.add('bad');
    statusEl.textContent = 'Miss. Score ' + G.score + '.';
    startBtn.textContent = 'Start';
    persistBest();
    paint();
    publish();
  }

  function onPad(e) {
    if (G.phase !== 'play') return;
    var i = parseInt(e.currentTarget.getAttribute('data-i'), 10);
    flash(i, true, G.step + 1);
    later(function () { flash(i, false); }, 220);
    if (G.seq[G.step] !== i) { miss(i); return; }
    G.step++;
    if (G.step >= G.seq.length) {
      G.phase = 'idle';
      statusEl.textContent = 'Good.';
      later(nextLevel, 500);
    }
  }

  startBtn.addEventListener('click', function () {
    if (G.phase === 'demo' || G.phase === 'play') return;
    if (versusOn() && iAmManager() && matchDb) {
      var rec = { id: 'round', n: Date.now(), seed: ((Math.random() * 0x7fffffff) | 1) };
      matchDb.put(rec).catch(function () {});
      match = { id: rec.n, seed: rec.seed };
      beginRound(rec.seed, false);
    } else {
      beginRound(((Math.random() * 0x7fffffff) | 1), false);
    }
  });

  function ingestMatch(list) {
    var row = null;
    (list || []).forEach(function (r) { if (r && r.id === 'round') row = r; });
    if (!row || !row.n) return;
    if (!match || row.n !== match.id) {
      match = { id: row.n, seed: row.seed };
      beginRound(row.seed, false);
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

  buildBoard(4);
  paint();

  function boot() {
    if (!api || !api.db) return;
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      var p = Promise.resolve();
      if (saveDb) {
        p = saveDb.get('best').then(function (row) {
          if (row && row.score) { G.best = row.score | 0; bestEl.textContent = 'Best ' + G.best; }
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
      if (G.phase === 'demo' || G.phase === 'play') { miss(0); return true; }
      return false;
    });
  }

  boot();
})(window);
