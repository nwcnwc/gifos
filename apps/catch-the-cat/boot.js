/*
 * Catch the Cat — GifOS shell.
 *
 * Upstream is a Phaser.Game. This file sizes the honeycomb for the phone,
 * hides the in-canvas chrome, and talks to net.js. Solo is the original game.
 * A room is a race: the same seed, each player on their own board, fewest taps
 * to wall the cat in. net.js scores each round; this file draws the standings,
 * calls the result, and keeps the series in front of the players.
 */
(function (root) {
  'use strict';

  var game = null;
  var racing = false;
  var seed = 1;
  var round = 0;
  var statusEl = document.getElementById('status');
  var clicksEl = document.getElementById('clicks');
  var rosterEl = document.getElementById('roster');
  var boardEl = document.getElementById('board');
  var stageEl = document.getElementById('stage');
  var flashEl = document.getElementById('flash');
  var undoBtn = document.getElementById('undo');
  var againBtn = document.getElementById('again');
  var flashAt = 0;
  var over = false;

  function taps(n) { return n === 1 ? '1 tap' : n + ' taps'; }

  function names(list) {
    var n = list.map(function (p) { return p.mine ? 'You' : (p.name || 'Player'); });
    if (n.length < 3) return n.join(' and ');
    return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }

  // A short shout over the board. Never over the dots you are about to tap:
  // it clears itself, and it never eats a pointer (pointer-events: none).
  function flash(msg, kind) {
    flashEl.textContent = msg;
    flashEl.className = kind || '';
    flashEl.hidden = false;
    clearTimeout(flashAt);
    flashAt = setTimeout(function () { flashEl.hidden = true; }, 2800);
  }

  // Upstream starts a fresh chase when you tap a finished board. That is the
  // solo game and it stays; in a race it would hand you a private board and
  // flip your row back to 'playing' after everyone had already stopped, so the
  // board stops taking taps until the next round starts. Pinch still zooms.
  function done() { stageEl.classList.add('done'); }

  function armAgain(next) {
    over = !!next;
    againBtn.textContent = next ? 'Next round' : 'New board';
    againBtn.classList.toggle('ready', !!next);
  }

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
      setStatus('The cat is walled in — ' + taps(n) + '.' + (racing ? ' Waiting on the others.' : ''), 'win');
      if (racing) { done(); root.CTCNet.report(n, 'win'); }
    });
    game.events.on('ctc-lose', function (ev) {
      var n = ev && ev.clicks || 0;
      setClicks(n);
      setStatus('The cat reached the edge.' + (racing ? ' Waiting on the others.' : ''), 'lose');
      if (racing) { done(); root.CTCNet.report(n, 'lose'); }
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
    flashEl.hidden = true;
    stageEl.classList.remove('done');
    armAgain(false);
    setStatus(!racing ? 'Tap the dots. Wall the cat in.'
      : round ? 'Round ' + round + '. Same board for everyone — fewest taps takes it.'
      : 'Same board for everyone — fewest taps takes it.');
    if (racing) root.CTCNet.report(0, 'playing');
  }

  // The standings are the SERIES, not this board: wins first, this board second.
  // net.js has already sorted them; this only paints.
  function drawRoster(list) {
    if (!racing) { rosterEl.hidden = true; return; }
    list = list || [];
    rosterEl.hidden = false;
    if (list.length < 2) {
      rosterEl.innerHTML = '<div class="wait">Waiting for someone else — they get this same board.</div>';
      return;
    }
    var lead = 0;
    list.forEach(function (p) { if (p.wins > lead) lead = p.wins; });
    var chasing = list.filter(function (p) { return p.status === 'playing'; });
    var head = round ? 'Round ' + round : 'This board';
    if (!chasing.length) head += ' · over';
    else if (chasing.length === 1) head += ' · waiting on ' + (chasing[0].mine ? 'you' : chasing[0].name);
    else head += ' · ' + chasing.length + ' still chasing';

    var rows = list.map(function (p) {
      var cls = 'row' + (p.mine ? ' me' : '') +
        (p.status === 'win' ? ' win' : p.status === 'lose' ? ' lose' : '');
      var crown = (lead > 0 && p.wins === lead) ? '<b class="crown" title="Leading the room">\u265b</b>' : '';
      var streak = p.streak > 1 ? '<b class="streak" title="' + p.streak + ' rounds in a row">\ud83d\udd25' + p.streak + '</b>' : '';
      var board = p.status === 'win' ? taps(p.clicks)
        : p.status === 'lose' ? 'got away'
        : taps(p.clicks) + '\u2026';
      return '<div class="' + cls + '">' +
        '<span class="who">' + crown + escapeHtml(p.name || 'Player') +
        (p.mine ? ' (you)' : '') + streak + '</span>' +
        '<b class="wins' + (p.wins ? '' : ' zero') + '">' + p.wins + '</b>' +
        '<span class="taps">' + board + '</span></div>';
    }).join('');

    rosterEl.innerHTML =
      '<div class="head"><span class="who">' + escapeHtml(head) + '</span>' +
      '<b class="wins">wins</b><span class="taps">this board</span></div>' + rows;
  }

  // Every client scores the round off the same rows, so this fires once, here
  // and on every other screen in the room, with the same answer.
  function showResult(r) {
    armAgain(true);
    if (r.abandoned) {
      flash('Everyone else left the round.');
      setStatus('Everyone else left. Nothing to score — start a new board.');
      return;
    }
    if (r.escaped) {
      flash('The cat got away from everyone.', 'lose');
      setStatus('Nobody penned it. Next round?', 'lose');
      return;
    }
    var who = names(r.winners);
    if (r.mine && !r.shared) {
      flash('Round ' + r.n + ' is yours \u2014 ' + taps(r.clicks) + '!', 'win');
      setStatus('You take round ' + r.n + ' with ' + taps(r.clicks) + '.', 'win');
    } else if (r.shared) {
      flash('Split at ' + taps(r.clicks) + ' \u2014 ' + who + '.', r.mine ? 'win' : '');
      setStatus(who + ' tie for round ' + r.n + ' at ' + taps(r.clicks) + '.', r.mine ? 'win' : '');
    } else {
      flash(who + ' takes it \u2014 ' + taps(r.clicks) + '.', 'lose');
      setStatus(who + ' wins round ' + r.n + ' with ' + taps(r.clicks) + '.', 'lose');
    }
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
      root.CTCNet.onRound = function (r) { round = r.n || 0; start(r.seed); };
      root.CTCNet.onRoster = drawRoster;
      root.CTCNet.onResult = showResult;
      var r = root.CTCNet.round();
      if (r && r.id) { round = r.n || 0; start(r.seed); }
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
