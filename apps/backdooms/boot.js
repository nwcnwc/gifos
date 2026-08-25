/*
 * Backdooms — GifOS shell.
 * Pointer lock, prefs in gifos.db, the gate, the HUD, and the noise.
 * Invite is OS chrome: this app never draws that button.
 */
(function (root) {
  'use strict';

  var prefs = { speed: 10, best: 0 };
  var playing = false;
  var canvas = document.getElementById('c');
  var gate = document.getElementById('gate');
  var over = document.getElementById('over');
  var resume = document.getElementById('resume');
  var hud = document.getElementById('hud');
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
    if (el) el.textContent = prefs.best ? ('Best so far — ' + prefs.best + ' down') : '';
    root.Boot = { best: prefs.best };
  }

  /* ---- the HUD ---------------------------------------------------------- */
  /*
   * Real DOM at the screen's own resolution, over a canvas drawn at a quarter
   * of it. Repainted only when a number CHANGES — a text write per element per
   * frame is a layout per frame, and it showed up as jank on the phone before
   * these guards went in.
   */
  var last = { hp: -1, ammo: -1, score: -1, best: -1, n: -1 };
  var shellsEl = document.getElementById('shells');
  var SHELLS = 25;
  (function buildShells() {
    if (!shellsEl) return;
    for (var i = 0; i < SHELLS; i++) shellsEl.appendChild(document.createElement('i'));
  })();

  var painT = 0;

  var Hud = {
    paint: function () {
      if (!playing) return;
      var s = Backdooms.state();
      var hp = Math.max(0, s.hp | 0);
      if (hp !== last.hp) {
        last.hp = hp;
        document.getElementById('hp-val').textContent = hp;
        document.getElementById('hp-bar').style.width = hp + '%';
        document.body.classList.toggle('lowhp', hp > 0 && hp <= 30);
      }
      if (s.ammo !== last.ammo) {
        var was = last.ammo;
        last.ammo = s.ammo;
        document.getElementById('ammo-val').textContent = s.ammo;
        var kids = shellsEl ? shellsEl.children : [];
        for (var i = 0; i < kids.length; i++) {
          kids[i].classList.toggle('spent', i >= s.ammo);
        }
        var low = document.getElementById('lowammo');
        if (low) low.hidden = s.ammo > 0;
        if (was > s.ammo) Sfx.shot();
      }
      if (s.score !== last.score) {
        last.score = s.score;
        document.getElementById('score-val').textContent = s.score;
      }
      var best = (root.Boot && root.Boot.best) | 0;
      if (best !== last.best) {
        last.best = best;
        document.getElementById('best-val').textContent = best ? ('BEST ' + best) : '';
      }
      /* The damage flash is CSS, not a repaint of the world — and it POINTS.
         A vignette that glows evenly all round tells you only that you are
         being eaten; it does not tell you to turn left. */
      var view = Backdooms.view ? Backdooms.view() : null;
      var hurt = view && view.pain > 0.55;
      if (hurt !== painT) {
        painT = hurt;
        document.body.classList.toggle('hurt', !!hurt);
        if (hurt) {
          var arc = document.getElementById('painarc');
          if (arc) arc.style.setProperty('--pain-dir', (view.painFrom * 180 / Math.PI) + 'deg');
          Sfx.ow();
        }
      }
    },
    room: function (n) {
      var tally = document.getElementById('tally');
      if (tally) {
        tally.hidden = n < 2;
        tally.textContent = n + ' IN THE HALLS';
      }
      var room = document.getElementById('gate-room');
      if (room) {
        /* Only promise the Invite button when there IS one. Opened at its own
           URL there is no bar above this app, and 'press Invite in the bar
           above' is then a dead instruction on the first screen a new player
           reads. */
        var hosted = !!(root.gifos && root.gifos.db);
        room.textContent = n > 1
          ? n + ' in the halls, walking the same maze. They show up pale. They can be shot.'
          : hosted
            ? 'Press Invite in the bar above to send the link. Whoever opens it walks the same halls — no account, no server.'
            : 'Open this file in GifOS and one invite link puts a friend in the same halls.';
      }
    }
  };
  root.Hud = Hud;

  /* ---- sound ------------------------------------------------------------ */
  /*
   * Nothing is loaded: a shotgun is a noise burst through a falling low-pass
   * with a sine thump under it, and the room tone is two detuned oscillators.
   * Upstream shipped a 4.7 MB mp3 that the QR edition could never carry; this
   * costs about eighty lines and works on a plane.
   */
  var Sfx = (function () {
    var ac = null, noise = null, hum = null, humGain = null, flick = null;
    function ctxOk() {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      if (!ac) {
        try { ac = new AC(); } catch (e) { return null; }
      }
      if (ac.state === 'suspended' && ac.resume) ac.resume().catch(function () {});
      return ac;
    }
    function noiseBuf(a) {
      if (noise) return noise;
      var n = a.sampleRate * 0.6, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0), i;
      for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
      noise = b;
      return b;
    }
    return {
      start: function () {
        var a = ctxOk();
        if (!a || hum) return;
        try {
          /* room tone: mains hum plus its buzzing second harmonic */
          humGain = a.createGain();
          humGain.gain.value = 0.030;
          humGain.connect(a.destination);
          hum = [];
          [59, 119.4, 238].forEach(function (f, i) {
            var o = a.createOscillator();
            o.type = i === 2 ? 'sawtooth' : 'sine';
            o.frequency.value = f;
            var g = a.createGain();
            g.gain.value = i === 0 ? 1 : i === 1 ? 0.34 : 0.045;
            o.connect(g); g.connect(humGain);
            o.start();
            hum.push(o);
          });
          /* a tube somewhere down the hall is failing */
          flick = setInterval(function () {
            if (!humGain || !ac) return;
            if (Math.random() > 0.22) return;
            var t = ac.currentTime;
            humGain.gain.setValueAtTime(0.030, t);
            humGain.gain.linearRampToValueAtTime(0.075, t + 0.03);
            humGain.gain.linearRampToValueAtTime(0.030, t + 0.22);
          }, 1400);
        } catch (e) {}
      },
      stop: function () {
        try { if (hum) hum.forEach(function (o) { o.stop(); o.disconnect(); }); } catch (e) {}
        if (flick) clearInterval(flick);
        hum = null; humGain = null; flick = null;
      },
      shot: function () {
        var a = ctxOk();
        if (!a) return;
        try {
          var t = a.currentTime;
          var src = a.createBufferSource();
          src.buffer = noiseBuf(a);
          var lp = a.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(5200, t);
          lp.frequency.exponentialRampToValueAtTime(320, t + 0.30);
          var g = a.createGain();
          g.gain.setValueAtTime(0.42, t);
          g.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
          src.connect(lp); lp.connect(g); g.connect(a.destination);
          src.start(t); src.stop(t + 0.4);
          /* the thump you feel */
          var o = a.createOscillator(), og = a.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(148, t);
          o.frequency.exponentialRampToValueAtTime(41, t + 0.16);
          og.gain.setValueAtTime(0.34, t);
          og.gain.exponentialRampToValueAtTime(0.0008, t + 0.20);
          o.connect(og); og.connect(a.destination);
          o.start(t); o.stop(t + 0.22);
          /* and the pump, a beat later */
          for (var k = 0; k < 2; k++) {
            var c = a.createBufferSource();
            c.buffer = noiseBuf(a);
            var bp = a.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = 2400 + k * 900; bp.Q.value = 5;
            var cg = a.createGain();
            var ct = t + 0.20 + k * 0.13;
            cg.gain.setValueAtTime(0.10, ct);
            cg.gain.exponentialRampToValueAtTime(0.0006, ct + 0.05);
            c.connect(bp); bp.connect(cg); cg.connect(a.destination);
            c.start(ct); c.stop(ct + 0.06);
          }
        } catch (e) {}
      },
      ow: function () {
        var a = ctxOk();
        if (!a) return;
        try {
          var t = a.currentTime;
          var o = a.createOscillator(), g = a.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(240, t);
          o.frequency.exponentialRampToValueAtTime(88, t + 0.22);
          g.gain.setValueAtTime(0.13, t);
          g.gain.exponentialRampToValueAtTime(0.0006, t + 0.26);
          var lp = a.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 900;
          o.connect(lp); lp.connect(g); g.connect(a.destination);
          o.start(t); o.stop(t + 0.28);
        } catch (e) {}
      }
    };
  })();
  root.Buzz = Sfx;

  /* ---- pointer lock / fullscreen ---------------------------------------- */

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
    if (hud) hud.hidden = true;
    over.hidden = true;
    gate.hidden = false;
    document.body.classList.remove('play', 'hurt', 'lowhp');
    Sfx.stop();
    if (root.Net) root.Net.publish(true);
  }

  function begin() {
    gate.hidden = true;
    over.hidden = true;
    showResume(false);
    if (hud) hud.hidden = false;
    document.body.classList.add('play');
    document.body.classList.remove('hurt', 'lowhp');
    playing = true;
    last.hp = last.ammo = last.score = last.best = -1;
    Backdooms.setLookSpeed(prefs.speed);
    var seed = (root.Net && root.Net.sharedSeed) ? root.Net.sharedSeed() : null;
    Backdooms.start(seed != null ? { seed: seed } : {});
    if (root.Render && root.Render.resize) root.Render.resize();
    if (IS_TOUCH) {
      if (root.Touch) root.Touch.arm();
      goFullscreen();
    } else {
      lockPointer();
    }
    if (root.Net) root.Net.publish(true);
    Sfx.start();
    Hud.paint();
  }

  function died(score) {
    playing = false;
    showResume(false);
    if (hud) hud.hidden = true;
    document.body.classList.remove('hurt', 'lowhp');
    Sfx.stop();
    var beat = score > prefs.best;
    if (beat) {
      prefs.best = score | 0;
      savePrefs();
      paintBest();
    }
    over.hidden = false;
    document.getElementById('over-score').textContent =
      score + (score === 1 ? ' down' : ' down') + (prefs.best ? (' · best ' + prefs.best) : '');
    document.getElementById('over-note').textContent = beat && score > 0
      ? 'A new best. It is saved in this file — close the tab, it stays.'
      : 'Your best is saved in this file, not on a server.';
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
    Hud.room(1);
  });
  if (root.Net) root.Net.init();
})(window);
