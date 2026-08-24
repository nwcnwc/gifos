// Local piano bank. Upstream fetched sample files from a CDN; those remote
// bytes stay behind. Notes here are synthesized into AudioBuffers inside
// this GIF and played with Web Audio.
(function (g) {
  'use strict';
  var ctx = null, master = null, voices = {}, bank = {};

  function ensure() {
    if (ctx) return ctx;
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    return ctx;
  }

  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Additive piano: stretched partials, hammer noise, two-string detune.
  function bake(ac, midi) {
    var sr = ac.sampleRate;
    var dur = 1.85;
    var n = Math.floor(sr * dur);
    var buf = ac.createBuffer(2, n, sr);
    var L = buf.getChannelData(0), R = buf.getChannelData(1);
    var f0 = freq(midi);
    var B = 0.00035 * Math.pow(2, (60 - midi) / 18);
    var nPart = midi < 52 ? 14 : midi < 68 ? 11 : 8;
    var i, p, t, env, ham, sL, sR, f, amp, phaseL, phaseR, det;
    var parts = [];
    for (p = 1; p <= nPart; p++) {
      f = f0 * p * Math.sqrt(1 + B * p * p);
      amp = (p === 1 ? 0.55 : (p % 2 ? 0.28 : 0.12) / p);
      if (p === 2) amp *= 0.7;
      if (p === 3) amp *= 0.85;
      if (midi > 72) amp *= 0.85;
      det = (p % 2 ? 1.0016 : 0.9986);
      parts.push({ f: f, amp: amp, det: det, decay: 0.55 + p * 0.42 + (midi < 55 ? 0.3 : 0) });
    }
    for (i = 0; i < n; i++) {
      t = i / sr;
      env = Math.exp(-t * (0.55 + (midi - 48) * 0.012));
      if (t < 0.012) env *= t / 0.012;
      ham = 0;
      if (t < 0.018) {
        ham = (Math.random() * 2 - 1) * (1 - t / 0.018) * 0.18;
      }
      sL = ham; sR = ham * 0.86;
      for (p = 0; p < parts.length; p++) {
        phaseL = 2 * Math.PI * parts[p].f * t;
        phaseR = 2 * Math.PI * parts[p].f * parts[p].det * t;
        amp = parts[p].amp * Math.exp(-t * parts[p].decay);
        sL += Math.sin(phaseL) * amp;
        sR += Math.sin(phaseR) * amp;
      }
      L[i] = sL * env * 0.55;
      R[i] = sR * env * 0.55;
    }
    return buf;
  }

  function bufferFor(midi) {
    var ac = ensure();
    if (!ac) return null;
    var key = midi | 0;
    if (!bank[key]) bank[key] = bake(ac, key);
    return bank[key];
  }

  function attack(midi) {
    var ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    release(midi);
    var buf = bufferFor(midi);
    if (!buf) return;
    var t = ac.currentTime;
    var src = ac.createBufferSource();
    src.buffer = buf;
    var g1 = ac.createGain();
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(1, t + 0.008);
    src.connect(g1);
    g1.connect(master);
    src.start(t);
    voices[midi] = { g: g1, src: src };
  }

  function release(midi) {
    var v = voices[midi];
    if (!v || !ctx) return;
    try {
      var t = ctx.currentTime;
      v.g.gain.cancelScheduledValues(t);
      var cur = v.g.gain.value;
      v.g.gain.setValueAtTime(Math.max(0.0001, cur), t);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      if (v.src && v.src.stop) v.src.stop(t + 0.18);
    } catch (e) {}
    delete voices[midi];
  }

  function stopAll() {
    Object.keys(voices).forEach(function (k) { release(+k); });
  }

  function playList(midis, gap) {
    var ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    gap = gap == null ? 0.16 : gap;
    var i;
    for (i = 0; i < midis.length; i++) {
      (function (m, delay) {
        setTimeout(function () {
          attack(m);
          setTimeout(function () { release(m); }, 280);
        }, delay * 1000);
      })(midis[i], i * gap);
    }
  }

  g.PTSound = {
    kind: 'local-piano',
    ensure: ensure, attack: attack, release: release, stopAll: stopAll,
    freq: freq, playList: playList, bufferFor: bufferFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
