/*
 * Backdooms — GifOS shell.
 * Pointer lock, prefs in gifos.db, the gate. Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var prefs = { speed: 10, best: 0 };
  var playing = false;
  var canvas = document.getElementById('c');
  var gate = document.getElementById('gate');
  var over = document.getElementById('over');
  var go = document.getElementById('gate-go');
  var again = document.getElementById('over-go');
  var speedEl = document.getElementById('m');
  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 && COARSE;

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return gifos.db('prefs').get('prefs').then(function (row) {
      if (!row) return;
      if (row.speed != null) prefs.speed = row.speed;
      if (row.best != null) prefs.best = row.best | 0;
    }).catch(function () {});
  }
  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    gifos.db('prefs').put({ id: 'prefs', speed: prefs.speed, best: prefs.best | 0 }).catch(function () {});
  }

  function paintBest() {
    var el = document.getElementById('gate-best');
    if (el) el.textContent = prefs.best ? ('Best ' + prefs.best) : '';
    root.Boot = { best: prefs.best };
  }

  function lockPointer() {
    if (IS_TOUCH) return;
    var el = canvas;
    var req = el.requestPointerLock || el.webkitRequestPointerLock;
    if (!req) return;
    try {
      var p = req.call(el);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function goFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      var p = req.call(el);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function begin() {
    gate.hidden = true;
    over.hidden = true;
    document.body.classList.add('play');
    playing = true;
    Backdooms.setLookSpeed(prefs.speed);
    Backdooms.start({});
    if (IS_TOUCH) {
      if (root.Touch) root.Touch.arm();
      goFullscreen();
    } else {
      lockPointer();
    }
    if (root.Net) root.Net.publish(true);
  }

  function died(score) {
    playing = false;
    if (score > prefs.best) {
      prefs.best = score | 0;
      savePrefs();
      paintBest();
    }
    over.hidden = false;
    document.getElementById('over-score').textContent = 'Score ' + score +
      (prefs.best ? (' · best ' + prefs.best) : '');
  }

  go.addEventListener('click', begin);
  again.addEventListener('click', begin);
  speedEl.addEventListener('input', function () {
    prefs.speed = +speedEl.value;
    Backdooms.setLookSpeed(prefs.speed);
    savePrefs();
  });

  addEventListener('keydown', function (ev) {
    // Backdooms.keys() is undefined until start() has run once — an unguarded
    // write here threw on every pre-game keypress, and the throw landed BEFORE
    // the Enter/Space lines below, so the keyboard could not start the game.
    var k = Backdooms.keys();
    if (k) k[ev.key] = 1;
    if (ev.key === 'Enter' && !playing) begin();
    if (ev.key === ' ' && !playing) { ev.preventDefault(); begin(); }
    if (ev.key === 'Escape' && document.pointerLockElement) {
      /* OS unlocks; overlay if needed */
    }
  });
  addEventListener('keyup', function (ev) {
    var k = Backdooms.keys();
    if (k) k[ev.key] = 0;
  });
  canvas.addEventListener('click', function () {
    if (!playing) return;
    if (!IS_TOUCH && document.pointerLockElement !== canvas) {
      lockPointer();
      return;
    }
    Backdooms.shoot();
  });
  addEventListener('mousemove', function (ev) {
    if (!playing) return;
    if (document.pointerLockElement !== canvas) return;
    Backdooms.look(ev.movementX || 0);
  });

  Backdooms.onDead = died;
  if (root.Touch) root.Touch.init();

  loadPrefs().then(function () {
    speedEl.value = prefs.speed;
    Backdooms.setLookSpeed(prefs.speed);
    paintBest();
    go.disabled = false;
    var room = document.getElementById('gate-room');
    if (room && !room.textContent) {
      room.textContent = 'Press Invite in the bar above to send the link.';
    }
  });
  if (root.Net) root.Net.init();
})(window);
