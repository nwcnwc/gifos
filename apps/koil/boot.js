/*
 * Koil — boot. Canvas, audio, the gate, the loop.
 *
 * First gesture unlocks Web Audio (a context started without one stays
 * silent). The invite is OS chrome: this file never draws a share button.
 */
(function (root) {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var hudFps = document.getElementById('hud-fps');
  var hudRoom = document.getElementById('hud-room');
  var dts = [];
  var last = 0;
  var running = false;
  var sounds = {};

  function bufSize() {
    var w = window.innerWidth, h = window.innerHeight;
    var factor = (w * h > 900 * 500) ? 30 : 20;
    var bw = Math.max(160, Math.floor(16 * factor));
    var bh = Math.max(90, Math.floor(9 * factor));
    // Keep the backbuffer from outrunning a phone.
    if (w < 700) { bw = 320; bh = 180; }
    return { w: bw, h: bh };
  }

  function fitCanvas() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }

  function volFor(px, py, ox, oy) {
    var d = Math.hypot(px - ox, py - oy) || 0.001;
    return Math.min(1, Math.max(0, 1 / d));
  }

  function play(el, volume) {
    if (!el) return;
    try {
      var a = el.cloneNode(true);
      a.volume = Math.max(0, Math.min(1, volume));
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function bindSound() {
    sounds.blast = document.getElementById('snd-blast');
    sounds.pickup = document.getElementById('snd-pickup');
    sounds.key = document.getElementById('snd-key');
    sounds.rico = document.getElementById('snd-rico');
    root.Koil.onSound(function (kind, px, py, ox, oy) {
      var v = volFor(px, py, ox, oy);
      if (kind === 'blast') play(sounds.blast, v);
      else if (kind === 'pickup') play(sounds.pickup, v);
      else if (kind === 'key') play(sounds.key, v);
      else if (kind === 'rico') play(sounds.rico, Math.min(1, v));
    });
  }

  function waitImages() {
    var ids = ['tex-wall', 'tex-player', 'tex-bomb', 'tex-key', 'tex-particle'];
    return Promise.all(ids.map(function (id) {
      var el = document.getElementById(id);
      if (el.complete && el.naturalWidth) return Promise.resolve();
      return new Promise(function (res) {
        el.onload = function () { res(); };
        el.onerror = function () { res(); };
      });
    }));
  }

  function start() {
    var sz = bufSize();
    root.Koil.init(sz.w, sz.h);
    bindSound();
    root.Koil.onCollect(function (index) {
      if (root.Net && root.Net.live()) root.Net.claimItem(index);
    });
    root.Koil.onThrow(function (spawned) {
      if (root.Net && root.Net.live()) root.Net.claimThrow(spawned);
    });
    root.Touch.init();
    fitCanvas();
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function frame(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    dts.push(dt);
    if (dts.length > 60) dts.shift();
    var avg = 0;
    for (var i = 0; i < dts.length; i++) avg += dts[i];
    avg /= dts.length;

    if (root.Net) root.Net.tick();
    root.Koil.tick(dt, ts / 1000);

    var img = root.Koil.imageData();
    if (img) {
      if (!frame._blit) {
        frame._blit = document.createElement('canvas');
        frame._bctx = frame._blit.getContext('2d');
        frame._bctx.imageSmoothingEnabled = false;
      }
      if (frame._blit.width !== img.width || frame._blit.height !== img.height) {
        frame._blit.width = img.width; frame._blit.height = img.height;
        frame._bctx = frame._blit.getContext('2d');
        frame._bctx.imageSmoothingEnabled = false;
      }
      frame._bctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame._blit, 0, 0, canvas.width, canvas.height);
    }

    hudFps.textContent = 'FPS: ' + Math.floor(1 / (avg || 1));
    if (root.Net && root.Net.live()) {
      var n = root.Net.count();
      hudRoom.textContent = n > 1 ? ('Players: ' + n) : 'Alone in the hall';
    } else {
      hudRoom.textContent = 'Solo';
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', function (e) {
    if (!running) return;
    if (e.keyCode === 32 || (e.keyCode >= 37 && e.keyCode <= 40) ||
        e.keyCode === 65 || e.keyCode === 68 || e.keyCode === 83 || e.keyCode === 87) {
      e.preventDefault();
    }
    if (e.repeat) return;
    root.Koil.keyDown(e.keyCode);
  });
  window.addEventListener('keyup', function (e) {
    if (!running) return;
    if (e.repeat) return;
    root.Koil.keyUp(e.keyCode);
  });
  window.addEventListener('blur', function () {
    // Drop held keys so we don't slide forever after alt-tab.
    root.Koil.me.moving = 0;
    root.Koil.setAnalog(0, 0);
  });
  window.addEventListener('resize', function () {
    fitCanvas();
    if (running) {
      var sz = bufSize();
      root.Koil.resize(sz.w, sz.h);
    }
  });

  function go() {
    var gate = document.getElementById('gate');
    gate.classList.add('gone');
    var btn = document.getElementById('gate-go');
    if (btn) btn.blur();
    waitImages().then(function () {
      var p = (root.Net && root.Net.init) ? root.Net.init() : Promise.resolve(null);
      return p.then(function () { start(); });
    });
  }

  document.getElementById('gate-go').addEventListener('click', go);
})(window);
