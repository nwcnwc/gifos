// Piano-like tones in this tab. Remote sample files stay behind.
(function (g) {
  'use strict';
  var ctx = null, master = null, voices = {};

  function ensure() {
    if (ctx) return ctx;
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }
  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function attack(midi) {
    var ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    release(midi);
    var t = ac.currentTime;
    var f = freq(midi);
    var g1 = ac.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.9, t + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.25, t + 0.18);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    g1.connect(master);
    var oscs = [];
    [[1, 0.55, 'triangle'], [2, 0.22, 'sine'], [3, 0.1, 'sine'], [4, 0.05, 'sine']].forEach(function (h) {
      var o = ac.createOscillator();
      o.type = h[2];
      o.frequency.value = f * h[0];
      var gg = ac.createGain();
      gg.gain.value = h[1];
      o.connect(gg); gg.connect(g1);
      o.start(t);
      o.stop(t + 1.7);
      oscs.push(o);
    });
    voices[midi] = { g: g1, oscs: oscs };
  }
  function release(midi) {
    var v = voices[midi];
    if (!v || !ctx) return;
    try {
      var t = ctx.currentTime;
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    } catch (e) {}
    delete voices[midi];
  }
  function stopAll() {
    Object.keys(voices).forEach(function (k) { release(+k); });
  }

  g.PTSound = { ensure: ensure, attack: attack, release: release, stopAll: stopAll, freq: freq };
})(typeof window !== 'undefined' ? window : globalThis);
