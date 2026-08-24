/* Synthesized shoot/explode. The SID recordings stay behind. */
(function (root) {
  'use strict';
  var ctx = null;
  function ac() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    return ctx;
  }
  function muted() {
    if (typeof AudioFX !== 'undefined' && AudioFX.mute) return true;
    return !!(root.engine && root.engine.storage && root.engine.storage.mute);
  }
  function tone(freq, dur, type, vol, slide) {
    if (muted()) return;
    var c = ac();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(function () {});
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.07, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }
  function noise(dur, vol) {
    if (muted()) return;
    var c = ac();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(function () {});
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var data = buf.getChannelData(0);
    var i;
    for (i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource();
    var g = c.createGain();
    var f = c.createBiquadFilter();
    src.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(vol || 0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start();
  }
  function unlock() {
    var c = ac();
    if (c && c.state === 'suspended') c.resume().catch(function () {});
  }
  addEventListener('pointerdown', unlock, { once: true, capture: true });
  addEventListener('keydown', unlock, { once: true, capture: true });
  root.DeltaSfx = {
    shoot: function () { tone(980, 0.055, 'square', 0.05, 420); },
    explode: function () { noise(0.22, 0.14); tone(160, 0.18, 'sawtooth', 0.06, 50); }
  };
})(window);
