/*
 * Original first-boot setlist. Three short PCM tracks, synthesized here —
 * not Nullsoft's llama, nothing fetched. First open puts them in `library`.
 */
(function (root) {
  'use strict';

  var SR = 22050;

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function osc(kind, freq, t) {
    var ph = freq * t;
    ph = ph - Math.floor(ph);
    if (kind === 1) return ph < 0.5 ? (ph * 4 - 1) : (3 - ph * 4);
    if (kind === 2) return ph * 2 - 1;
    if (kind === 3) {
      var x = Math.sin(t * 125.389 + freq * 0.017) * 43758.5453;
      return (x - Math.floor(x)) * 2 - 1;
    }
    return ph < 0.5 ? 1 : -1;
  }

  function env(t, dur, a, d, s, r) {
    if (t < 0 || t > dur) return 0;
    if (t < a) return t / a;
    if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
    if (t > dur - r) return s * Math.max(0, (dur - t) / r);
    return s;
  }

  function mixSong(seconds, notes) {
    var n = Math.floor(seconds * SR);
    var out = new Float32Array(n);
    for (var i = 0; i < notes.length; i++) {
      var g = notes[i];
      var f = midi(g[0]);
      var t0 = g[1];
      var dur = g[2];
      var vol = g[3];
      var kind = g[4];
      var i0 = Math.max(0, Math.floor(t0 * SR));
      var i1 = Math.min(n, Math.ceil((t0 + dur) * SR));
      for (var k = i0; k < i1; k++) {
        var t = k / SR - t0;
        out[k] += osc(kind, f, k / SR) * env(t, dur, 0.008, 0.06, 0.55, 0.08) * vol;
      }
    }
    var pcm = new Int16Array(n);
    for (var s = 0; s < n; s++) {
      var v = out[s];
      if (v > 1) v = 1;
      if (v < -1) v = -1;
      pcm[s] = (v * 28000) | 0;
    }
    return pcm;
  }

  function wav(pcm) {
    var n = pcm.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    function str(o, s) {
      for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    }
    str(0, 'RIFF');
    v.setUint32(4, 36 + n * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, SR, true);
    v.setUint32(28, SR * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, n * 2, true);
    new Uint8Array(buf).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
    return new Uint8Array(buf);
  }

  function beat(bpm, b) { return (60 / bpm) * b; }

  function arp(root, start, beats, bpm, step, vol, kind) {
    var notes = [];
    var seq = [0, 4, 7, 12, 7, 4];
    var t = start;
    var dur = beat(bpm, step);
    for (var i = 0; i < beats / step; i++) {
      notes.push([root + seq[i % seq.length], t, dur * 0.92, vol, kind]);
      t += dur;
    }
    return notes;
  }

  function bass(root, start, bars, bpm, vol) {
    var notes = [];
    var walk = [0, 0, 7, 7, 5, 5, 7, 7];
    for (var i = 0; i < bars * 2; i++) {
      notes.push([root + walk[i % walk.length], start + beat(bpm, i * 2), beat(bpm, 1.8), vol, 1]);
    }
    return notes;
  }

  function hats(start, beats, bpm, vol) {
    var notes = [];
    var dur = beat(bpm, 0.5);
    for (var i = 0; i < beats * 2; i++) {
      notes.push([80, start + i * dur, 0.04, vol * (i % 2 ? 0.4 : 0.85), 3]);
    }
    return notes;
  }

  function kick(start, beats, bpm, vol) {
    var notes = [];
    var step = beat(bpm, 1);
    for (var i = 0; i < beats; i++) {
      notes.push([36, start + i * step, 0.18, vol, 1]);
    }
    return notes;
  }

  function concat() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      for (var j = 0; j < arguments[i].length; j++) out.push(arguments[i][j]);
    }
    return out;
  }

  function lead(notes, start, bpm, vol, kind) {
    var t = start;
    var out = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var dur = beat(bpm, n[1]);
      out.push([n[0], t, dur * 0.9, vol, kind]);
      t += dur;
    }
    return out;
  }

  function track(id, name, title, seconds, notes) {
    var bytes = wav(mixSong(seconds, notes));
    return {
      id: id,
      name: name,
      title: title,
      artist: 'GifOS',
      mime: 'audio/wav',
      bytes: bytes,
      blob: new Blob([bytes], { type: 'audio/wav' })
    };
  }

  function make() {
    var intro = concat(
      bass(36, 0, 8, 132, 0.45),
      arp(60, 0, 32, 132, 0.25, 0.18, 0),
      hats(0, 32, 132, 0.22),
      kick(0, 32, 132, 0.55),
      lead([[72, 1], [74, 1], [76, 2], [79, 2], [76, 1], [74, 1], [72, 4],
            [67, 2], [69, 2], [71, 2], [72, 6],
            [76, 1], [79, 1], [81, 2], [79, 2], [76, 2], [72, 6]], 0, 132, 0.42, 0)
    );
    var led = concat(
      bass(33, 0, 8, 108, 0.5),
      arp(57, 0, 32, 108, 0.5, 0.16, 2),
      hats(0, 32, 108, 0.18),
      kick(0, 32, 108, 0.5),
      lead([[69, 1], [72, 1], [69, 1], [64, 1], [67, 2], [64, 2],
            [69, 1], [72, 1], [76, 2], [72, 2], [69, 4],
            [64, 2], [67, 2], [69, 4], [60, 4]], 0, 108, 0.4, 0)
    );
    var plane = concat(
      bass(36, 0, 8, 84, 0.38),
      arp(48, 0, 24, 84, 1, 0.2, 1),
      hats(0, 24, 84, 0.1),
      lead([[67, 2], [64, 2], [60, 4], [62, 2], [59, 2], [55, 4],
            [60, 2], [64, 2], [67, 4], [72, 8]], 0, 84, 0.36, 1)
    );
    return [
      track('demo-intro', 'Intro.wav', 'Intro', 6.2, intro),
      track('demo-green-led', 'Green LED.wav', 'Green LED', 6.2, led),
      track('demo-on-a-plane', 'On a Plane.wav', 'On a Plane', 7.2, plane)
    ];
  }

  root.Demo = { make: make };
})(window);
