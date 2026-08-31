/*
 * jsnes — canvas, APU, pads, SRAM, quick states.
 *
 * JSNES is the engine (window.jsnes). This file owns the frame loop and
 * the battery RAM that rides in gifos.db so the file is the save.
 */
(function (root) {
  'use strict';

  var W = 256, H = 240;
  var FRAME_MS = 1000 / 60;
  var SRAM = 0x2000, SRAM_AT = 0x6000;

  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d', { alpha: false });
  var img = ctx.createImageData(W, H);
  var pix = new Uint32Array(img.data.buffer);
  var little = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4;

  var nes = null;
  var running = false;
  var paused = false;
  var muted = false;
  var raf = 0;
  var acc = 0;
  var lastT = 0;
  var p1 = 0, p2 = 0;
  var localMask = 0;
  var keyMask1 = 0, keyMask2 = 0, touchMask = 0, padMask = 0;
  var cart = null;
  var actx = null, anode = null;
  var aq = new Float32Array(96000);
  var aqR = 0, aqW = 0, aqN = 0;
  var sramDirty = false;
  var sramTimer = 0;
  var onStatus = null;
  var saveSram = null;

  var BTN = (root.jsnes && root.jsnes.Controller) || {
    BUTTON_A: 0, BUTTON_B: 1, BUTTON_SELECT: 2, BUTTON_START: 3,
    BUTTON_UP: 4, BUTTON_DOWN: 5, BUTTON_LEFT: 6, BUTTON_RIGHT: 7
  };

  function bit(b) { return 1 << b; }

  function paint(fb) {
    var i, c;
    if (little) {
      for (i = 0; i < 61440; i++) {
        c = fb[i] >>> 0;
        pix[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >>> 16) & 0xff);
      }
    } else {
      for (i = 0; i < 61440; i++) {
        c = fb[i] >>> 0;
        pix[i] = 0x000000ff | ((c & 0xff0000) << 8) | ((c & 0xff00) << 8) | ((c & 0xff) << 8);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function fit() {
    var bar = document.getElementById('bar');
    var top = bar ? bar.getBoundingClientRect().height : 36;
    var bot = document.body.classList.contains('touch') ? 148 : 8;
    var aw = root.innerWidth || 320;
    var ah = Math.max(80, (root.innerHeight || 240) - top - bot);
    var s = Math.max(1, Math.floor(Math.min(aw / W, ah / H)));
    canvas.style.width = (W * s) + 'px';
    canvas.style.height = (H * s) + 'px';
  }

  function pushSample(l, r) {
    if (muted || aqN >= aq.length - 2) return;
    aq[aqW] = l; aqW = (aqW + 1) % aq.length;
    aq[aqW] = r; aqW = (aqW + 1) % aq.length;
    aqN += 2;
  }

  function pullSample() {
    if (aqN < 2) return 0;
    var v = aq[aqR]; aqR = (aqR + 1) % aq.length; aqN--;
    return v;
  }

  function unlockAudio() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!actx) {
        actx = new AC({ sampleRate: 48000 });
        var n = actx.createScriptProcessor(2048, 0, 2);
        n.onaudioprocess = function (e) {
          var L = e.outputBuffer.getChannelData(0);
          var R = e.outputBuffer.getChannelData(1);
          for (var i = 0; i < L.length; i++) {
            L[i] = muted ? 0 : pullSample();
            R[i] = muted ? 0 : pullSample();
          }
        };
        n.connect(actx.destination);
        anode = n;
        if (nes) nes.opts.sampleRate = actx.sampleRate || 48000;
      }
      if (actx.state === 'suspended') actx.resume();
    } catch (err) {}
  }

  function applyMask(player, mask) {
    var prev = player === 2 ? p2 : p1;
    if (prev === mask || !nes) {
      if (player === 2) p2 = mask; else p1 = mask;
      return;
    }
    for (var i = 0; i < 8; i++) {
      var b = 1 << i;
      if ((mask & b) && !(prev & b)) nes.buttonDown(player, i);
      if (!(mask & b) && (prev & b)) nes.buttonUp(player, i);
    }
    if (player === 2) p2 = mask; else p1 = mask;
  }

  function composeLocal() {
    localMask = keyMask1 | touchMask | padMask;
  }

  function readGamepad() {
    padMask = 0;
    var gps = navigator.getGamepads ? navigator.getGamepads() : [];
    var g = gps && gps[0];
    if (!g) return;
    if (g.buttons[0] && g.buttons[0].pressed) padMask |= bit(BTN.BUTTON_A);
    if (g.buttons[1] && g.buttons[1].pressed) padMask |= bit(BTN.BUTTON_B);
    if (g.buttons[2] && g.buttons[2].pressed) padMask |= bit(BTN.BUTTON_B);
    if (g.buttons[8] && g.buttons[8].pressed) padMask |= bit(BTN.BUTTON_SELECT);
    if (g.buttons[9] && g.buttons[9].pressed) padMask |= bit(BTN.BUTTON_START);
    if (g.buttons[12] && g.buttons[12].pressed) padMask |= bit(BTN.BUTTON_UP);
    if (g.buttons[13] && g.buttons[13].pressed) padMask |= bit(BTN.BUTTON_DOWN);
    if (g.buttons[14] && g.buttons[14].pressed) padMask |= bit(BTN.BUTTON_LEFT);
    if (g.buttons[15] && g.buttons[15].pressed) padMask |= bit(BTN.BUTTON_RIGHT);
    var ax = g.axes && g.axes[0] || 0, ay = g.axes && g.axes[1] || 0;
    if (ax < -0.45) padMask |= bit(BTN.BUTTON_LEFT);
    if (ax > 0.45) padMask |= bit(BTN.BUTTON_RIGHT);
    if (ay < -0.45) padMask |= bit(BTN.BUTTON_UP);
    if (ay > 0.45) padMask |= bit(BTN.BUTTON_DOWN);
  }

  function loop(now) {
    raf = root.requestAnimationFrame(loop);
    readGamepad();
    composeLocal();
    var me = (root.Net && root.Net.live() && !root.Net.owner()) ? 2 : 1;
    if (me === 1) applyMask(1, localMask);
    else applyMask(2, localMask);
    if (root.Net && root.Net.live()) root.Net.beforeFrame(localMask);
    if (!nes || !running || paused) { lastT = now; return; }
    if (!lastT) lastT = now;
    acc += now - lastT;
    lastT = now;
    if (acc > 100) acc = 100;
    while (acc >= FRAME_MS) {
      try { nes.frame(); } catch (err) { running = false; if (onStatus) onStatus('crash'); throw err; }
      acc -= FRAME_MS;
    }
    if (sramDirty && saveSram && now - sramTimer > 1500) {
      sramDirty = false;
      sramTimer = now;
      saveSram(readSram());
    }
  }

  function makeNes() {
    return new root.jsnes.NES({
      emulateSound: true,
      sampleRate: (actx && actx.sampleRate) || 48000,
      onFrame: paint,
      onAudioSample: pushSample,
      onBatteryRamWrite: function () {
        sramDirty = true;
      }
    });
  }

  function readSram() {
    if (!nes) return null;
    var out = new Uint8Array(SRAM);
    for (var i = 0; i < SRAM; i++) out[i] = nes.cpu.mem[SRAM_AT + i] & 0xff;
    return out;
  }

  function writeSram(bytes) {
    if (!nes || !bytes) return;
    var n = Math.min(SRAM, bytes.length);
    for (var i = 0; i < n; i++) nes.cpu.mem[SRAM_AT + i] = bytes[i] & 0xff;
    nes.rom.batteryRam = bytes;
  }

  function loadROM(bytes, meta, sram) {
    if (!root.jsnes || !root.jsnes.NES) throw new Error('jsnes failed to load');
    unlockAudio();
    stop();
    nes = makeNes();
    nes.loadROM(bytes);
    p1 = 0; p2 = 0;
    if (sram) writeSram(sram);
    cart = {
      id: meta.id, name: meta.name, hash: meta.hash,
      bytes: bytes, sample: !!meta.sample, by: meta.by || ''
    };
    running = true;
    paused = false;
    lastT = 0; acc = 0;
    document.body.classList.add('running');
    if (!raf) raf = root.requestAnimationFrame(loop);
    fit();
    if (onStatus) onStatus('run');
    return cart;
  }

  function stop() {
    running = false;
    if (sramDirty && saveSram) { sramDirty = false; saveSram(readSram()); }
  }

  function reset() {
    if (!nes) return;
    nes.reloadROM();
    p1 = 0; p2 = 0;
    paused = false;
    if (onStatus) onStatus('reset');
  }

  function setPaused(on) {
    paused = !!on;
    lastT = 0;
    if (onStatus) onStatus(paused ? 'pause' : 'run');
  }

  function setMuted(on) {
    muted = !!on;
    if (!muted) unlockAudio();
    if (onStatus) onStatus('mute');
  }

  function toState() {
    if (!nes) return null;
    try { return JSON.stringify(nes.toJSON()); } catch (e) { return null; }
  }

  function fromState(s) {
    if (!nes || !s) return false;
    try {
      nes.fromJSON(typeof s === 'string' ? JSON.parse(s) : s);
      p1 = 0; p2 = 0;
      return true;
    } catch (e) { return false; }
  }

  /* Arrows move. X/K are A, Z/J/Y are B — never WASD, or A would walk left. */
  var KEY1 = {};
  KEY1[38] = BTN.BUTTON_UP;
  KEY1[40] = BTN.BUTTON_DOWN;
  KEY1[37] = BTN.BUTTON_LEFT;
  KEY1[39] = BTN.BUTTON_RIGHT;
  KEY1[88] = BTN.BUTTON_A; KEY1[75] = BTN.BUTTON_A;
  KEY1[90] = BTN.BUTTON_B; KEY1[74] = BTN.BUTTON_B; KEY1[89] = BTN.BUTTON_B;
  KEY1[13] = BTN.BUTTON_START;
  KEY1[16] = BTN.BUTTON_SELECT;

  var KEY2 = {};
  KEY2[104] = BTN.BUTTON_UP; KEY2[98] = BTN.BUTTON_DOWN;
  KEY2[100] = BTN.BUTTON_LEFT; KEY2[102] = BTN.BUTTON_RIGHT;
  KEY2[103] = BTN.BUTTON_A; KEY2[105] = BTN.BUTTON_B;
  KEY2[97] = BTN.BUTTON_START; KEY2[99] = BTN.BUTTON_SELECT;

  function onKey(e, down) {
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    var k = e.keyCode;
    if (KEY1[k] != null) {
      e.preventDefault();
      if (down) keyMask1 |= bit(KEY1[k]); else keyMask1 &= ~bit(KEY1[k]);
    }
    if (KEY2[k] != null) {
      e.preventDefault();
      if (down) keyMask2 |= bit(KEY2[k]); else keyMask2 &= ~bit(KEY2[k]);
      applyMask(2, keyMask2);
    }
  }

  root.addEventListener('keydown', function (e) { onKey(e, true); });
  root.addEventListener('keyup', function (e) { onKey(e, false); });
  root.addEventListener('resize', fit);
  root.addEventListener('pointerdown', unlockAudio, { once: false });

  root.Emu = {
    BTN: BTN,
    bit: bit,
    fit: fit,
    loadROM: loadROM,
    reset: reset,
    stop: stop,
    setPaused: setPaused,
    paused: function () { return paused; },
    setMuted: setMuted,
    muted: function () { return muted; },
    unlockAudio: unlockAudio,
    setTouchMask: function (m) { touchMask = m | 0; },
    applyMask: applyMask,
    localMask: function () { return localMask; },
    cart: function () { return cart; },
    running: function () { return running; },
    readSram: readSram,
    writeSram: writeSram,
    toState: toState,
    fromState: fromState,
    kick: function () { if (!raf) raf = root.requestAnimationFrame(loop); },
    onSaveSram: function (fn) { saveSram = fn; },
    onStatus: function (fn) { onStatus = fn; },
    hashBytes: function (u8) {
      var h = 2166136261;
      for (var i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
      return ('00000000' + (h >>> 0).toString(16)).slice(-8) + '-' + u8.length;
    },
    isNes: function (u8) {
      return u8 && u8.length >= 16 && u8[0] === 0x4e && u8[1] === 0x45 && u8[2] === 0x53 && u8[3] === 0x1a;
    }
  };
})(window);
