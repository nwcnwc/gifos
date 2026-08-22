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
   * Decode whatever the browser can decode, at 44100 stereo — the only rate the
   * MDX models were trained at (`samplerate = 44100` in SeperateMDX.seperate).
   * Mono is duplicated and >2 channels are dropped to the first two, which is
   * what prepare_mix does.
   *
   * The decode happens INSIDE a 44100 OfflineAudioContext on purpose.
   * decodeAudioData resamples to the CONTEXT's rate, not the file's, so
   * decoding into a plain AudioContext first would put the audio through the
   * device rate (48000 on most machines) and then back down to 44100 — two
   * resamples where one will do. It also means `decoded.sampleRate` is the
   * context's rate and never the file's: anything that reads it expecting to
   * learn what the user handed over is reading the speaker configuration.
   */
  async function decodeTo44kStereo(arrayBuffer, opts) {
    opts = opts || {};
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    var ctx = new OAC(2, 1, 44100);
    var decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

    var maxSec = opts.maxSec || 0;
    var count = maxSec > 0
      ? Math.min(decoded.length, Math.round(maxSec * 44100))
      : decoded.length;
    if (count <= 0) throw new Error('There is no audio in that file.');

    // slice(), not subarray(): a "first 30 seconds" of a long track should let
    // the rest of the decoded buffer go, not pin it behind a view.
    var L = decoded.getChannelData(0).slice(0, count);
    var R = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice(0, count) : L.slice();
    return { mix: [L, R], sampleRate: 44100,
             sourceChannels: decoded.numberOfChannels, seconds: count / 44100 };
  }

  root.VRWAV = { encodeWav: encodeWav, decodeTo44kStereo: decodeTo44kStereo };
})(typeof window !== 'undefined' ? window : globalThis);
