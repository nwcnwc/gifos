/*
 * Racer — GifOS glue: prefs, the race overlay, the board, the first paint.
 */
(function (root) {
  'use strict';

  var raceUi = {
    overlay: null, count: null, board: null, rows: null,
    startBtn: null, room: null, note: null
  };
  var lastStartedAt = 0;
  var celebrated = {};

  function $(id) { return document.getElementById(id); }

  function fmtMs(ms) {
    var s = ms / 1000;
    var m = Math.floor(s / 60);
    s = s - m * 60;
    var whole = Math.floor(s);
    var tenths = Math.floor((s - whole) * 10);
    if (m) return m + '.' + (whole < 10 ? '0' : '') + whole + '.' + tenths;
    return whole + '.' + tenths;
  }

  function paintBoard(state) {
    if (!raceUi.rows) return;
    raceUi.rows.innerHTML = '';
    var board = (state && state.board) || [];
    if (!board.length) {
      var empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.textContent = (state && state.running) ? 'Waiting for a finish…' : '';
      raceUi.rows.appendChild(empty);
      return;
    }
    for (var i = 0; i < board.length; i++) {
      var row = document.createElement('div');
      row.className = 'board-row' + (board[i].mine ? ' mine' : '');
      row.innerHTML = '<span class="place">' + (i + 1) + '</span>' +
        '<span class="who">' + escapeHtml(board[i].name) + '</span>' +
        '<span class="time">' + fmtMs(board[i].ms) + '</span>';
      raceUi.rows.appendChild(row);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function paintRace(state) {
    if (!state) {
      if (raceUi.overlay) raceUi.overlay.hidden = true;
      if (raceUi.board) raceUi.board.hidden = true;
      if (raceUi.count) raceUi.count.textContent = '';
      lastStartedAt = 0;
      return;
    }
    if (state.startedAt !== lastStartedAt) {
      lastStartedAt = state.startedAt;
      celebrated = {};
      if (root.Racer) {
        root.Racer.startLine();
        root.Racer.freeze(true);
      }
    }
    if (state.countdown > 0) {
      if (root.Racer) root.Racer.freeze(true);
      raceUi.overlay.hidden = false;
      var n = Math.ceil(state.countdown / 1000);
      raceUi.count.textContent = String(n);
      raceUi.board.hidden = true;
    } else {
      if (root.Racer && root.Racer.isFrozen()) root.Racer.freeze(false);
      raceUi.overlay.hidden = true;
      raceUi.board.hidden = false;
      paintBoard(state);
    }
  }

  function paintRoom() {
    var n = root.Net.count();
    if (raceUi.room) {
      if (n > 1) raceUi.room.innerHTML = '<b>' + n + '</b> on the road';
      else raceUi.room.textContent = 'Driving alone';
    }
    // init() waits for the host-probe, so by the time we paint, this is settled.
    // Guests cannot write the read-only race collection; hiding the button is
    // kinder than letting them tap it and be refused.
    if (raceUi.startBtn) raceUi.startBtn.hidden = !root.Net.isHost();
  }

  function bind() {
    raceUi.overlay = $('race-overlay');
    raceUi.count   = $('race-count');
    raceUi.board   = $('race-board');
    raceUi.rows    = $('board-rows');
    raceUi.startBtn= $('race-start');
    raceUi.room    = $('room-note');
    raceUi.note    = $('gate-note');

    if (raceUi.startBtn) {
      raceUi.startBtn.addEventListener('click', function () {
        root.Net.startRace().then(function (ok) {
          if (!ok && raceUi.room) raceUi.room.textContent = 'Only the host can start a race.';
        });
      });
    }

    root.Net.onRace(paintRace);
    root.Net.onRoster(function () {
      paintRoom();
      var st = root.Net.raceState();
      if (st) paintBoard(st);
    });

    root.Racer.onLap(function (lapTime /*, lapCount */) {
      var st = root.Net.raceState();
      if (st && st.running && !st.mine) root.Net.markFinished(st.elapsed);
      saveBest(lapTime);
    });

    root.Racer.onTick(function (dt) {
      var st = root.Racer.state();
      st.dt = dt;
      root.Net.publish(st);
      root.Racer.setRemotes(root.Net.ghosts());
      var race = root.Net.raceState();
      // Keep painting through the last countdown tick so GO actually unfreezes.
      if (race && (race.countdown > 0 || root.Racer.isFrozen())) paintRace(race);
    });
  }

  function prefs() {
    try { return root.gifos && root.gifos.db ? root.gifos.db('prefs') : null; } catch (e) { return null; }
  }
  function loadBest() {
    var d = prefs();
    if (!d) return Promise.resolve();
    return d.get('best').then(function (r) {
      if (r && r.t > 0 && root.Racer) root.Racer.setBest(r.t);
    }).catch(function () {});
  }
  function saveBest(t) {
    if (!(t > 0)) return;
    var best = root.Racer && root.Racer.best();
    var d = prefs();
    if (d && best === t) d.put({ id: 'best', t: t }).catch(function () {});
  }

  function smallScreen() {
    return Math.min(root.innerWidth || 800, root.innerHeight || 600) < 700;
  }

  function go() {
    bind();
    paintRoom();
    paintRace(root.Net.raceState());
    var opts = {};
    if (smallScreen()) { opts.drawDistance = 180; opts.totalCars = 80; }
    root.Racer.start(opts);
    loadBest();
    var gate = $('gate');
    if (gate) {
      // First paint is instant (two images). The card is just "you are here".
      // A tap or a key dismisses it; driving works underneath either way.
      var dismiss = function () {
        gate.classList.add('gone');
        setTimeout(function () { gate.hidden = true; }, 400);
        removeEventListener('keydown', dismiss);
        gate.removeEventListener('pointerdown', dismiss);
      };
      addEventListener('keydown', dismiss);
      gate.addEventListener('pointerdown', dismiss);
    }
  }

  function boot() {
    root.Touch.init();
    root.Net.init().then(function () {
      go();
      paintRoom();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
