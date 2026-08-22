/*
 * fft.js — the complex FFT the MDX-Net port needs, and nothing else.
 *
 * UVR's MDX models are trained at n_fft 5120, 6144 and 7680 (and the app's
 * self-test model at 1024). NONE of 5120/6144/7680 is a power of two, so the
 * textbook radix-2 butterfly cannot transform them and a Bluestein fallback
 * would cost three padded transforms per frame. They are, however, all
 * 2^a * m with m in {1, 3, 5, 15}:
 *
 *     5120 = 2^10 * 5      6144 = 2^11 * 3      7680 = 2^9 * 15
 *
 * so one decimation-in-time split by m, then m radix-2 transforms of the
 * power-of-two part, does the whole job:
 *
 *     X[k] = SUM over r<m of  W_N^(rk) * FFT_P(x[p*m + r])[k mod P]
 *
 * Twiddles are read from a precomputed table rather than accumulated round by
 * round: the recurrence drifts by the time it has walked 3072 butterflies, and
 * a spectrogram is not somewhere a slow phase error announces itself — it just
 * makes the separation quietly worse.
 *
 * Plans are cached per size; a 4-minute song asks for the same n_fft tens of
 * thousands of times.
 */
(function (root) {
  'use strict';

  var plans = Object.create(null);

  function plan(n) {
    var p = plans[n];
    if (p) return p;
    // Split n into its power-of-two part P and the odd remainder m.
    var P = 1, m = n;
    while (m % 2 === 0) { m /= 2; P *= 2; }
    // P === 1 (an odd n) is legal and lands entirely in the size-m combine
    // below, which is a plain DFT — no size the models use gets there.
    // Twiddle table for the radix-2 stages: cos/sin of -2*pi*k/P, k < P/2.
    var half = P >> 1;
    var pc = new Float64Array(half), ps = new Float64Array(half);
    for (var k = 0; k < half; k++) { var a = -2 * Math.PI * k / P; pc[k] = Math.cos(a); ps[k] = Math.sin(a); }
    // Twiddle table for the size-m combine: cos/sin of -2*pi*t/n, t < n.
    var nc = null, ns = null;
    if (m > 1) {
      nc = new Float64Array(n); ns = new Float64Array(n);
      for (var t = 0; t < n; t++) { var b = -2 * Math.PI * t / n; nc[t] = Math.cos(b); ns[t] = Math.sin(b); }
    }
    p = {
      n: n, P: P, m: m, pc: pc, ps: ps, nc: nc, ns: ns,
      // scratch for the m sub-transforms and the combine
      subRe: m > 1 ? new Float64Array(n) : null,
      subIm: m > 1 ? new Float64Array(n) : null,
      rev: bitrev(P),
    };
    plans[n] = p;
    return p;
  }

  function bitrev(P) {
    var rev = new Int32Array(P);
    for (var i = 1, j = 0; i < P; i++) {
      var bit = P >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      rev[i] = j;
    }
    return rev;
  }

  // In-place radix-2 FFT over re/im[off .. off+P). `sign` is -1 forward, +1 inverse.
  function radix2(re, im, off, P, p, sign) {
    var rev = p.rev, i, j, tr, ti;
    for (i = 1; i < P; i++) {
      j = rev[i];
      if (i < j) {
        tr = re[off + i]; re[off + i] = re[off + j]; re[off + j] = tr;
        ti = im[off + i]; im[off + i] = im[off + j]; im[off + j] = ti;
      }
    }
    var pc = p.pc, ps = p.ps;
    for (var len = 2; len <= P; len <<= 1) {
      var halfLen = len >> 1, stride = P / len;
      for (var base = 0; base < P; base += len) {
        for (var q = 0; q < halfLen; q++) {
          var ti2 = q * stride;
          var wr = pc[ti2], wi = sign < 0 ? ps[ti2] : -ps[ti2];
          var a = off + base + q, b = a + halfLen;
          var xr = re[b] * wr - im[b] * wi;
          var xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr;        im[a] += xi;
        }
      }
    }
  }

  /**
   * In-place complex FFT of length n over re/im (Float64Array, length >= n).
   * inverse = true computes the UNSCALED conjugate transform (no 1/n) — the
   * callers here divide themselves, the same way an irfft does.
   */
  function fft(re, im, n, inverse) {
    var p = plan(n), sign = inverse ? 1 : -1;
    if (p.m === 1) { radix2(re, im, 0, n, p, sign); return; }

    var m = p.m, P = p.P, sr = p.subRe, si = p.subIm, r, q;
    // Deinterleave x[q*m + r] into m contiguous blocks of length P.
    for (r = 0; r < m; r++) {
      var o = r * P;
      for (q = 0; q < P; q++) { sr[o + q] = re[q * m + r]; si[o + q] = im[q * m + r]; }
      radix2(sr, si, o, P, p, sign);
    }
    // X[k] = sum_r W_n^(rk) * X_r[k mod P]
    var nc = p.nc, ns = p.ns;
    for (var k = 0; k < n; k++) {
      var kp = k % P, ar = 0, ai = 0;
      for (r = 0; r < m; r++) {
        var t = (r * k) % n;
        var wr = nc[t], wi = sign < 0 ? ns[t] : -ns[t];
        var br = sr[r * P + kp], bi = si[r * P + kp];
        ar += br * wr - bi * wi;
        ai += br * wi + bi * wr;
      }
      re[k] = ar; im[k] = ai;
    }
  }

  root.VRFFT = { fft: fft, plan: plan };
})(typeof window !== 'undefined' ? window : globalThis);
