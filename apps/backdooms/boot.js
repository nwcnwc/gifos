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
  var resume = document.getElementById('resume');
  var go = document.getElementById('gate-go');
  var again = document.getElementById('over-go');
  var speedEl = document.getElementById('m');
  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = ((navigator.maxTouchPoints || 0) > 0 && COARSE) ||
    !!(root.matchMedia && root.matchMedia('(hover: none) and (pointer: coarse)').matches);
  var mouseLook = false;
  var lastMx = 0;

  if (IS_TOUCH) document.body.classList.add('phone');

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

  function showResume(on) {
    if (!resume) return;
    resume.hidden = !on;
  }

  function toGate() {
    playing = false;
    Backdooms.stop();
    Backdooms.setPaused(false);
    showResume(false);
    over.hidden = true;
    gate.hidden = false;
    document.body.classList.remove('play');
    if (root.Net) root.Net.publish(true);
  }

  function begin() {
    gate.hidden = true;
    over.hidden = true;
    showResume(false);
    document.body.classList.add('play');
    playing = true;
    Backdooms.setLookSpeed(prefs.speed);
    var seed = (root.Net && root.Net.sharedSeed) ? root.Net.sharedSeed() : null;
    Backdooms.start(seed != null ? { seed: seed } : {});
    if (IS_TOUCH) {
      if (root.Touch) root.Touch.arm();
      goFullscreen();
    } else {
      lockPointer();
    }
    if (root.Net) root.Net.publish(true);
    if (root.Buzz) root.Buzz.start();
  }

  function died(score) {
    playing = false;
    showResume(false);
    if (root.Buzz) root.Buzz.stop();
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
  if (resume) {
    resume.addEventListener('click', function () {
      if (!playing) return;
      lockPointer();
    });
  }
  speedEl.addEventListener('input', function () {
    prefs.speed = +speedEl.value;
    Backdooms.setLookSpeed(prefs.speed);
    savePrefs();
  });

  function setKey(ev, down) {
    var k = Backdooms.keys();
    var on = down ? 1 : 0;
    var code = ev.code || '';
    var key = ev.key || '';
    k[key] = on;
    if (key.length === 1) k[key.toLowerCase()] = on;
    if (code === 'KeyW' || code === 'ArrowUp') k.w = on;
    if (code === 'KeyS' || code === 'ArrowDown') k.s = on;
    if (code === 'KeyA') k.a = on;
    if (code === 'KeyD') k.d = on;
    if (code === 'ArrowLeft') k.ArrowLeft = on;
    if (code === 'ArrowRight') k.ArrowRight = on;
  }

  addEventListener('keydown', function (ev) {
    setKey(ev, true);
    if ((ev.key === 'Enter' || ev.code === 'Enter') && !playing) begin();
    if (ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      if (!playing) begin();
      else Backdooms.shoot();
    }
  });
  addEventListener('keyup', function (ev) { setKey(ev, false); });

  canvas.addEventListener('pointerdown', function (ev) {
    if (!playing) return;
    if (IS_TOUCH) return;
    if (document.pointerLockElement !== canvas) {
      lastMx = ev.clientX;
      mouseLook = true;
      lockPointer();
      return;
    }
    Backdooms.shoot();
  });
  addEventListener('pointerup', function () { mouseLook = false; });
  addEventListener('pointercancel', function () { mouseLook = false; });
  addEventListener('mousemove', function (ev) {
    if (!playing) return;
    if (document.pointerLockElement === canvas) {
      Backdooms.look(ev.movementX || 0);
      return;
    }
    if (mouseLook) {
      var dx = ev.movementX || (ev.clientX - lastMx);
      lastMx = ev.clientX;
      Backdooms.look(dx);
    }
  });

  function onLockChange() {
    var locked = document.pointerLockElement === canvas ||
      document.webkitPointerLockElement === canvas;
    if (!playing || IS_TOUCH) {
      showResume(false);
      Backdooms.setPaused(false);
      return;
    }
    if (locked) {
      showResume(false);
      Backdooms.setPaused(false);
      mouseLook = false;
    } else {
      showResume(true);
      Backdooms.setPaused(true);
    }
  }
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('webkitpointerlockchange', onLockChange);

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (!over.hidden) { toGate(); return true; }
      if (playing) { toGate(); return true; }
      return false;
    });
  }

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

  /* Fluorescent hum + a click for the shotgun — no file, no autoplay fight. */
  (function () {
    var ctx, hum, gain;
    function ctxOk() {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      return ctx;
    }
    root.Buzz = {
      start: function () {
        try {
          var ac = ctxOk();
          if (!ac) return;
          if (ac.state === 'suspended') ac.resume().catch(function () {});
          if (hum) return;
          hum = ac.createOscillator();
          hum.type = 'sine';
          hum.frequency.value = 120;
          gain = ac.createGain();
          gain.gain.value = 0.012;
          hum.connect(gain); gain.connect(ac.destination);
          hum.start();
        } catch (e) {}
      },
      stop: function () {
        try { if (hum) { hum.stop(); hum.disconnect(); } } catch (e) {}
        hum = null; gain = null;
      },
      shot: function () {
        try {
          var ac = ctxOk();
          if (!ac) return;
          var o = ac.createOscillator();
          var g = ac.createGain();
          o.type = 'square';
          o.frequency.value = 90;
          g.gain.value = 0.08;
          o.connect(g); g.connect(ac.destination);
          o.start();
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
          o.stop(ac.currentTime + 0.13);
        } catch (e) {}
      }
    };
    var orig = root.Backdooms.shoot;
    root.Backdooms.shoot = function () {
      var r = orig.apply(root.Backdooms, arguments);
      if (root.Buzz) root.Buzz.shot();
      return r;
    };
  })();
})(window);
