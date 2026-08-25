/*
 * Catch the Cat — GifOS shell.
 *
 * Upstream is a Phaser.Game. This file sizes the honeycomb for the phone,
 * hides the in-canvas chrome, and talks to net.js. Solo is the original game.
 * A room is a race: the same seed, each player on their own board, fewest taps
 * to wall the cat in.
 */
(function (root) {
  'use strict';

  var game = null;
  var racing = false;
  var seed = 1;
  var statusEl = document.getElementById('status');
  var clicksEl = document.getElementById('clicks');
  var rosterEl = document.getElementById('roster');
  var boardEl = document.getElementById('board');
  var undoBtn = document.getElementById('undo');
  var againBtn = document.getElementById('again');

  function taps(n) { return n === 1 ? '1 tap' : n + ' taps'; }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = kind || '';
  }

  function setClicks(n) {
    clicksEl.textContent = taps(n || 0);
  }

  function metrics() {
    var pw = boardEl.clientWidth || 320;
    var ph = boardEl.clientHeight || 320;
    var w = 11, h = 11;
    var rw = pw / (6.5 + 2 * w);
    var rh = ph / (6 + Math.sqrt(3) * h);
    var r = Math.max(11, Math.min(24, Math.floor(Math.min(rw, rh))));
    return { w: w, h: h, r: r };
  }

  function bind() {
    if (!game || !game.events) return;
    game.events.on('ctc-status', function (msg) {
      if (!msg) return;
      var kind = /win/i.test(msg) && /cat/i.test(msg) ? 'win'
        : /away|edge|ran/i.test(msg) ? 'lose' : '';
      setStatus(msg, kind);
    });
    game.events.on('ctc-click', function (ev) {
      var n = ev && ev.clicks || 0;
      setClicks(n);
      if (racing) root.CTCNet.report(n, 'playing');
    });
    game.events.on('ctc-win', function (ev) {
      var n = ev && ev.clicks || 0;
      setClicks(n);
      setStatus('The cat is walled in — ' + taps(n) + '.', 'win');
      if (racing) root.CTCNet.report(n, 'win');
    });
    game.events.on('ctc-lose', function (ev) {
      var n = ev && ev.clicks || 0;
      setClicks(n);
      setStatus('The cat reached the edge.', 'lose');
      if (racing) root.CTCNet.report(n, 'lose');
    });
  }

  function start(nextSeed) {
    seed = (nextSeed >>> 0) || 1;
    var m = metrics();
    if (game) {
      try { game.destroy(true); } catch (e) {}
      game = null;
      boardEl.innerHTML = '';
    }
    var Ctor = root.CatchTheCatGame;
    if (!root.Phaser || !Ctor) {
      setStatus('The game did not load.');
      return;
    }
    game = new Ctor({
      w: m.w, h: m.h, r: m.r,
      initialWallCount: 8,
      backgroundColor: 0x0b1020,
      parent: boardEl,
      seed: seed,
      hideChrome: true,
      credit: ''
    });
    // Let a two-finger pinch through to the browser (style.css opens
    // touch-action for it): Phaser's TouchManager preventDefault()s every
    // touch on the canvas while `capture` is set, and it consults the flag
    // per event — so clearing it once the input system is up is enough.
    // Taps are unaffected: Phaser reads the touches either way.
    (function (g) {
      var uncapture = function () {
        try { if (g.input && g.input.touch) g.input.touch.capture = false; } catch (e) {}
      };
      uncapture();
      if (g.events) g.events.once('ready', uncapture);
    })(game);
    bind();
    setClicks(0);
    setStatus(racing
      ? 'Same board. Fewest taps to wall the cat in.'
      : 'Tap the dots. Wall the cat in.');
    if (racing) root.CTCNet.report(0, 'playing');
  }

  function drawRoster(list) {
    if (!racing) { rosterEl.hidden = true; return; }
    list = list || [];
    if (list.length < 2) {
      rosterEl.hidden = false;
      rosterEl.innerHTML = 'Waiting for someone else — they get this same board.';
      return;
    }
    rosterEl.hidden = false;
    var best = Infinity;
    list.forEach(function (p) { if (p.status === 'win' && p.clicks < best) best = p.clicks; });
    rosterEl.innerHTML = list.map(function (p) {
      var cls = 'row' + (p.mine ? ' me' : '') + (p.status === 'win' && p.clicks === best ? ' lead' : '') +
        (p.status === 'win' ? ' win' : p.status === 'lose' ? ' lose' : '');
      var label = p.status === 'win' ? taps(p.clicks) : p.status === 'lose' ? 'got away' : taps(p.clicks);
      return '<div class="' + cls + '"><span>' + escapeHtml(p.name || 'Player') +
        (p.mine ? ' (you)' : '') + '</span><span>' + label + '</span></div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  undoBtn.addEventListener('click', function () {
    if (game && game.mainScene) game.mainScene.undo();
  });
  againBtn.addEventListener('click', function () {
    if (racing) root.CTCNet.startRound();
    else start(((Math.random() * 0x7fffffff) | 1));
  });

  var resizeAt = 0;
  root.addEventListener('resize', function () {
    clearTimeout(resizeAt);
    resizeAt = setTimeout(function () { if (seed) start(seed); }, 180);
  });

  function boot() {
    if (!root.Phaser || !root.CatchTheCatGame) {
      setStatus('The game did not load.');
      return;
    }
    root.CTCNet.init().then(function (info) {
      racing = !(info && info.solo);
      if (!racing) {
        start(((Math.random() * 0x7fffffff) | 1));
        return;
      }
      root.CTCNet.onRound = function (r) { start(r.seed); };
      root.CTCNet.onRoster = drawRoster;
      var r = root.CTCNet.round();
      if (r && r.id) start(r.seed);
      else {
        // First snapshot can be empty while the host's row is still in flight.
        // Put a board up now; only mint a round if nobody else has one shortly.
        var local = ((Math.random() * 0x7fffffff) | 1);
        start(local);
        setTimeout(function () {
          if (!root.CTCNet.round().id) root.CTCNet.startRound(local);
        }, 800);
      }
      drawRoster(root.CTCNet.roster());
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
