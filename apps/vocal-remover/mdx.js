/*
 * mdx.js — Ultimate Vocal Remover's MDX-Net separation path, transcribed.
 *
 * Source of truth: ultimatevocalremovergui (Anjok07, MIT) —
 *   separate.py            SeperateMDX.demix() / .run_model() / .initialize_model_settings()
 *   lib_v5/tfc_tdf_v3.py   class STFT
 * with the defaults UVR ships in gui_data/constants.py DEFAULT_DATA:
 *   overlap "Default" (step = chunk_size - n_fft), segment 256, batch 1,
 *   is_denoise False, is_invert_spec False, is_match_frequency_pitch True.
 *
 * The whole model-facing contract is four numbers per model — n_fft, dim_f,
 * dim_t, compensate — which UVR keeps in models/MDX_Net_Models/model_data/
 * model_data.json keyed by a hash of the .onnx. models.js carries our copies.
 *
 * Two details are worth naming because they are where a port silently goes
 * wrong rather than loudly:
 *
 *  - torch.stft(center=True) REFLECT-pads by n_fft/2 before framing, and
 *    torch.istft undoes that with a sum-of-w^2 envelope division. Get either
 *    half wrong and the audio still sounds like audio — just with a comb
 *    filter over it.
 *  - the OVERLAP-ADD window is numpy's np.hanning, which is SYMMETRIC
 *    (zero at both ends), while the STFT window is torch.hann_window
 *    (PERIODIC). UVR uses both, one line apart. They are not the same array.
 *
 * Signals are float32 end to end, which is what UVR carries too (prepare_mix
 * returns float32; `result` and `divider` are float32; the torch tensors are
 * float32). Only the per-frame FFT scratch is float64 — it is 6 kB, and a
 * float64 transform of float32 samples costs nothing and rounds better.
 */
(function (root) {
  'use strict';

  var FFT = root.VRFFT;

  // torch.hann_window(n, periodic=True) — the STFT analysis window.
  function hannPeriodic(n) {
    var w = new Float64Array(n);
    for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
    return w;
  }
  // np.hanning(n) — SYMMETRIC; the chunk overlap-add window.
  function hannSymmetric(n) {
    var w = new Float64Array(n);
    if (n === 1) { w[0] = 1; return w; }
    for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return w;
  }

  // np.pad(x, pad, mode='reflect') — no edge repeat: [3,2,1,2,3,4,5,4,3].
  function reflectPad(x, pad, out) {
    var T = x.length, i;
    for (i = 0; i < pad; i++) out[i] = x[pad - i];
    out.set(x, pad);
    for (i = 0; i < pad; i++) out[pad + T + i] = x[T - 2 - i];
    return out;
  }

  /**
   * The forward half of STFT.__call__ plus run_model's first two lines:
   * stereo chunk -> the model's [1, 4, dim_f, dim_t] tensor, with bins 0..2
   * zeroed (`spek[:, :, :3, :] *= 0`).
   *
   * Plane order is torch's: ch0.real, ch0.imag, ch1.real, ch1.imag — the
   * permute([0,3,1,2]) + reshape(c*2, ...) in tfc_tdf_v3.STFT.
   */
  function chunkToTensor(chunks, nFft, hop, dimF, dimT, scratch) {
    var pad = nFft >> 1, T = chunks[0].length;
    var w = scratch.win, padded = scratch.padded, re = scratch.re, im = scratch.im;
    var out = scratch.tensor;
    var planeStride = dimF * dimT;
    for (var c = 0; c < 2; c++) {
      reflectPad(chunks[c], pad, padded);
      for (var f = 0; f < dimT; f++) {
        var off = f * hop, k;
        for (k = 0; k < nFft; k++) { re[k] = padded[off + k] * w[k]; im[k] = 0; }
        FFT.fft(re, im, nFft, false);
        var pr = (2 * c) * planeStride + f, pi = (2 * c + 1) * planeStride + f;
        for (k = 0; k < dimF; k++) { out[pr + k * dimT] = re[k]; out[pi + k * dimT] = im[k]; }
      }
    }
    // spek[:, :, :3, :] *= 0
    for (var p = 0; p < 4; p++) {
      for (var b = 0; b < 3 && b < dimF; b++) {
        var base = p * planeStride + b * dimT;
        for (var t = 0; t < dimT; t++) out[base + t] = 0;
      }
    }
    return out;
  }

  /**
   * STFT.inverse: the model's [1, 4, dim_f, dim_t] tensor -> a stereo chunk of
   * hop*(dim_t-1) samples. Bins at and above dim_f are the zero freq_pad.
   */
  function tensorToChunk(t, nFft, hop, dimF, dimT, scratch, outL, outR) {
    var pad = nFft >> 1, nBins = (nFft >> 1) + 1;
    var w = scratch.win, re = scratch.re, im = scratch.im;
    var total = nFft + hop * (dimT - 1);
    var y = scratch.ola, env = scratch.env;
    var planeStride = dimF * dimT, outs = [outL, outR];
    for (var c = 0; c < 2; c++) {
      y.fill(0, 0, total);
      if (c === 0) env.fill(0, 0, total);
      for (var f = 0; f < dimT; f++) {
        var pr = (2 * c) * planeStride + f, pi = (2 * c + 1) * planeStride + f, k;
        for (k = 0; k < dimF; k++) { re[k] = t[pr + k * dimT]; im[k] = t[pi + k * dimT]; }
        for (k = dimF; k < nBins; k++) { re[k] = 0; im[k] = 0; }
        // irfft: force the Hermitian symmetry numpy/torch assume. The DC and
        // Nyquist imaginary parts are discarded, exactly as irfft discards them.
        im[0] = 0; im[nBins - 1] = 0;
        for (k = 1; k < nBins - 1; k++) { re[nFft - k] = re[k]; im[nFft - k] = -im[k]; }
        FFT.fft(re, im, nFft, true);
        var off = f * hop, inv = 1 / nFft;
        for (k = 0; k < nFft; k++) y[off + k] += re[k] * inv * w[k];
        if (c === 0) for (k = 0; k < nFft; k++) env[off + k] += w[k] * w[k];
      }
      var out = outs[c], n = total - 2 * pad;
      for (var i = 0; i < n; i++) {
        var e = env[pad + i];
        out[i] = y[pad + i] / (Math.abs(e) > 1e-11 ? e : 1);
      }
    }
  }

  function scratchFor(nFft, hop, dimF, dimT) {
    var total = nFft + hop * (dimT - 1);
    return {
      win: hannPeriodic(nFft),
      padded: new Float64Array(hop * (dimT - 1) + nFft),
      re: new Float64Array(nFft),
      im: new Float64Array(nFft),
      ola: new Float64Array(total),
      env: new Float64Array(total),
      tensor: new Float32Array(4 * dimF * dimT),
    };
  }

  /**
   * SeperateMDX.demix(), the whole of it.
   *
   * mix       [Float64Array L, Float64Array R]
   * cfg       { nFft, dimF, dimT, hop, compensate }
   * runModel  (Float32Array tensor) -> Promise<Float32Array>   the ONNX session.
   *           Omitted (or matchMix) means UVR's is_match_mix path: no model at
   *           all, just STFT -> iSTFT, which is what makes the "frequency cut"
   *           mix that the Vocals stem is subtracted from.
   * opts      { matchMix, overlap, denoise, onProgress(done, total), shouldStop() }
   *           overlap: null === UVR's "Default" (step = chunk_size - n_fft).
   *           denoise: UVR is_denoise — (model(x) - model(-x)) / 2, two calls.
   */
  async function demix(mix, cfg, runModel, opts) {
    opts = opts || {};
    var nFft = cfg.nFft, hop = cfg.hop || 1024, dimF = cfg.dimF, dimT = cfg.dimT;
    var trim = nFft >> 1;
    var matchMix = !!opts.matchMix;
    // The match-mix pass runs at a FIXED 256-frame segment whatever the model's
    // segment size is (`chunk_size = self.hop * (256-1)` in demix) — it never
    // touches the model, so nothing ties it to dim_t.
    var segT = matchMix ? (cfg.matchDimT || 256) : dimT;
    var chunkSize = hop * (segT - 1);
    var overlap = matchMix ? 0.02 : (opts.overlap === undefined ? null : opts.overlap);
    var denoise = !matchMix && !!opts.denoise && !!runModel;
    var genSize = chunkSize - 2 * trim;
    var T = mix[0].length;
    var pad = genSize + trim - (T % genSize);
    var len = trim + T + pad;

    // float32 throughout the long arrays, as UVR has them: `mix` arrives from
    // prepare_mix as float32 and `mixture` is a concatenate of float32 zeros
    // around it. At four minutes of audio these are ~60 MB each and doubling
    // them buys nothing the model can hear.
    var mixture = [new Float32Array(len), new Float32Array(len)];
    mixture[0].set(mix[0], trim);
    mixture[1].set(mix[1], trim);

    // UVR's default step is `self.chunk_size - self.n_fft` — the MODEL's chunk
    // size, which on this branch is the one in hand anyway.
    var step = overlap === null ? hop * (dimT - 1) - nFft : Math.trunc((1 - overlap) * chunkSize);
    // float32 for these two, as UVR has them: at four minutes of audio they are
    // the largest arrays in the process by an order of magnitude. `divider` is
    // one channel wide because both channels always receive the same window.
    var result = [new Float32Array(len), new Float32Array(len)];
    var divider = new Float32Array(len);

    var scratch = scratchFor(nFft, hop, dimF, segT);
    var part = [new Float64Array(chunkSize), new Float64Array(chunkSize)];
    var tarL = new Float64Array(chunkSize), tarR = new Float64Array(chunkSize);
    var totalChunks = Math.ceil(len / step);
    var done = 0;

    for (var i = 0; i < len; i += step) {
      if (opts.shouldStop && opts.shouldStop()) throw new Error('stopped');
      var start = i, end = Math.min(i + chunkSize, len), actual = end - start;
      for (var c = 0; c < 2; c++) {
        part[c].set(mixture[c].subarray(start, end));
        if (actual < chunkSize) part[c].fill(0, actual);
      }

      var spek = chunkToTensor(part, nFft, hop, dimF, segT, scratch);
      var pred;
      if (matchMix) pred = spek;
      else if (denoise) {
        var pos = await runModel(spek);
        var negIn = new Float32Array(spek.length), z;
        for (z = 0; z < spek.length; z++) negIn[z] = -spek[z];
        var neg = await runModel(negIn);
        pred = new Float32Array(pos.length);
        for (z = 0; z < pos.length; z++) pred[z] = 0.5 * (pos[z] - neg[z]);
      } else pred = await runModel(spek);
      tensorToChunk(pred, nFft, hop, dimF, segT, scratch, tarL, tarR);

      var window = null;
      if (overlap !== 0) window = hannSymmetric(actual);
      var tars = [tarL, tarR];
      for (c = 0; c < 2; c++) {
        var tar = tars[c], res = result[c];
        if (window) { for (var j = 0; j < actual; j++) res[start + j] += tar[j] * window[j]; }
        else { for (var j2 = 0; j2 < actual; j2++) res[start + j2] += tar[j2]; }
      }
      if (window) { for (var d = 0; d < actual; d++) divider[start + d] += window[d]; }
      else { for (var d2 = 0; d2 < actual; d2++) divider[start + d2] += 1; }

      done++;
      if (opts.onProgress) opts.onProgress(done, totalChunks);
      // Let the page breathe between chunks: on the wasm execution provider
      // session.run() is a blocking call, so this is the app's only paint.
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    var out = [new Float32Array(T), new Float32Array(T)];
    var comp = matchMix ? 1 : cfg.compensate;
    for (c = 0; c < 2; c++) {
      var r0 = result[c], o = out[c];
      for (var k = 0; k < T; k++) {
        var dv = divider[trim + k];
        o[k] = (r0[trim + k] / dv) * comp;
      }
    }
    return out;
  }

  root.VRMDX = {
    hannPeriodic: hannPeriodic,
    hannSymmetric: hannSymmetric,
    reflectPad: reflectPad,
    chunkToTensor: chunkToTensor,
    tensorToChunk: tensorToChunk,
    scratchFor: scratchFor,
    demix: demix,
    // How many chunks demix() will run for T samples — the app needs it to show
    // a progress bar before the first one has finished.
    chunkCount: function (T, cfg, matchMix, opts) {
      opts = opts || {};
      var nFft = cfg.nFft, hop = cfg.hop || 1024, dimT = cfg.dimT, trim = nFft >> 1;
      var segT = matchMix ? (cfg.matchDimT || 256) : dimT;
      var chunkSize = hop * (segT - 1), genSize = chunkSize - 2 * trim;
      var len = trim + T + (genSize + trim - (T % genSize));
      var overlap = matchMix ? 0.02 : (opts.overlap === undefined ? null : opts.overlap);
      var step = overlap === null ? hop * (dimT - 1) - nFft : Math.trunc((1 - overlap) * chunkSize);
      return Math.ceil(len / step);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
