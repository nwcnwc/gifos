/*
 * wav.js — RIFF/WAVE out, and the decode side of getting audio in.
 *
 * UVR writes PCM_16 WAV by default (gui_data/constants.py DEFAULT_DATA:
 * save_format WAV, wav_type_set PCM_16, is_normalization False) and this keeps
 * that default. 32-bit float is offered alongside it for one honest reason:
 * MDX stems are multiplied by the model's `compensate` at the end of demix,
 * which regularly pushes peaks past 0 dBFS, and 16-bit has nowhere to put
 * them. The app reports the clipped sample count rather than normalising
 * behind the user's back — UVR does not normalise either.
 */
(function (root) {
  'use strict';

  function encodeWav(channels, sampleRate, bits) {
    var ch = channels.length, n = channels[0].length;
    var float = bits === 32;
    var bytesPer = float ? 4 : 2;
    var dataBytes = n * ch * bytesPer;
    var buf = new ArrayBuffer(44 + dataBytes);
    var v = new DataView(buf), o = 0;
    function str(s) { for (var i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); }
    str('RIFF'); v.setUint32(o, 36 + dataBytes, true); o += 4; str('WAVE');
    str('fmt '); v.setUint32(o, 16, true); o += 4;
    v.setUint16(o, float ? 3 : 1, true); o += 2;            // 3 = IEEE float
    v.setUint16(o, ch, true); o += 2;
    v.setUint32(o, sampleRate, true); o += 4;
    v.setUint32(o, sampleRate * ch * bytesPer, true); o += 4;
    v.setUint16(o, ch * bytesPer, true); o += 2;
    v.setUint16(o, bits, true); o += 2;
    str('data'); v.setUint32(o, dataBytes, true); o += 4;
    var clipped = 0;
    for (var i = 0; i < n; i++) {
      for (var c = 0; c < ch; c++) {
        var s = channels[c][i];
        if (float) { v.setFloat32(o, s, true); o += 4; }
        else {
          if (s > 1 || s < -1) clipped++;
          var q = Math.round(Math.max(-1, Math.min(1, s)) * 32767);
          v.setInt16(o, q, true); o += 2;
        }
      }
    }
    return { bytes: new Uint8Array(buf), clipped: clipped };
  }

  /**
   * Decode whatever the browser can decode, then resample to 44100 stereo —
   * the only rate the MDX models were trained at (samplerate = 44100 in
   * SeperateMDX.seperate). Mono is duplicated, >2 channels are dropped to the
   * first two, which is what prepare_mix does.
   */
  async function decodeTo44kStereo(arrayBuffer, opts) {
    opts = opts || {};
    var Ctx = root.AudioContext || root.webkitAudioContext;
    var tmp = new Ctx();
    var decoded;
    try { decoded = await tmp.decodeAudioData(arrayBuffer.slice(0)); }
    finally { try { tmp.close(); } catch (e) {} }

    var startSec = opts.startSec || 0;
    var maxSec = opts.maxSec || 0;
    var from = Math.min(decoded.length, Math.round(startSec * decoded.sampleRate));
    var count = decoded.length - from;
    if (maxSec > 0) count = Math.min(count, Math.round(maxSec * decoded.sampleRate));
    if (count <= 0) throw new Error('That selection is past the end of the file.');

    var outLen = Math.max(1, Math.round(count * 44100 / decoded.sampleRate));
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    var off = new OAC(2, outLen, 44100);
    // A trimmed copy, so the resampler only does the part we asked for.
    var slice = off.createBuffer(Math.min(2, decoded.numberOfChannels), count, decoded.sampleRate);
    for (var c = 0; c < slice.numberOfChannels; c++) {
      slice.copyToChannel(decoded.getChannelData(c).subarray(from, from + count), c);
    }
    var src = off.createBufferSource();
    src.buffer = slice;
    src.connect(off.destination);
    src.start();
    var rendered = await off.startRendering();
    // Straight out of the render, no copy: these are already the Float32Arrays
    // the rest of the pipeline wants, and at four minutes each is 42 MB.
    var L = rendered.getChannelData(0);
    var R = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L.slice();
    return { mix: [L, R], sampleRate: 44100, sourceRate: decoded.sampleRate,
             sourceChannels: decoded.numberOfChannels, sourceSeconds: decoded.duration };
  }

  root.VRWAV = { encodeWav: encodeWav, decodeTo44kStereo: decodeTo44kStereo };
})(typeof window !== 'undefined' ? window : globalThis);
