// Audio measurement and take-scoring, ported from gen/soundout.py (the
// analysis constants), gen/recordings.py (the schwa detector) and
// gen/studio.py (scoring). Everything works on mono Float32Array + sample
// rate, so it is agnostic to whatever GifOS's brokered recorder produced.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  const VOWELS = new Set('æɑɒɔəɜɛɪiʊuʌeaoyɐɘɵʏøœɞʉɨ');
  const STOPS = new Set([...'ptkbdgʔ', 'ɡ']);
  const SONORANTS = new Set('mnŋlrɹjwɫ');
  // espeak writes /g/ as script ɡ; affricates behave like their stop.
  const IPA_ALIASES = { 'ɡ': 'g', 'ʧ': 't', 'ʤ': 'd', 'ɫ': 'l' };

  // "vowel" | "stop" | "sonorant" | "fricative". Only the first symbol
  // matters: an affricate (tʃ) behaves like its stop, a diphthong (eɪ) like
  // its first vowel.
  function phonemeClass(ipa) {
    const c0 = ipa.slice(0, 1);
    const c = IPA_ALIASES[c0] || c0;
    if (VOWELS.has(c)) return 'vowel';
    if (STOPS.has(c)) return 'stop';
    if (SONORANTS.has(c)) return 'sonorant';
    return 'fricative';
  }

  // ---- base64 <-> bytes ----------------------------------------------------

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function bytesToB64(bytes) {
    const u = new Uint8Array(bytes.buffer !== undefined && bytes.byteOffset !== undefined && bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }

  // ---- decoding ------------------------------------------------------------

  let _ctx = null;
  function audioContext() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  // Encoded bytes (mp3 / webm / whatever the recorder produced) -> AudioBuffer.
  async function decodeBytes(bytes) {
    const buf = bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return audioContext().decodeAudioData(buf);
  }

  function toMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
      return { data: audioBuffer.getChannelData(0), sr: audioBuffer.sampleRate };
    }
    const n = audioBuffer.length, out = new Float32Array(n);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const d = audioBuffer.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] += d[i] / audioBuffer.numberOfChannels;
    }
    return { data: out, sr: audioBuffer.sampleRate };
  }

  function bufferFrom(data, sr) {
    const b = audioContext().createBuffer(1, Math.max(1, data.length), sr);
    b.copyToChannel(data instanceof Float32Array ? data : Float32Array.from(data), 0);
    return b;
  }

  // ---- basic measurement ---------------------------------------------------

  function peakOf(a) {
    let p = 0;
    for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; }
    return p;
  }
  function rmsOf(a, lo, hi) {
    lo = lo || 0; hi = hi === undefined ? a.length : hi;
    if (hi <= lo) return 0;
    let s = 0;
    for (let i = lo; i < hi; i++) s += a[i] * a[i];
    return Math.sqrt(s / (hi - lo));
  }

  // Where the voice starts and ends, keeping a little air either side so the
  // cut is not clipped. Returns [lo, hi) in samples ([0, len) when nothing
  // crosses the threshold - which is what a dead microphone produces, and why
  // silence is checked on the UNTRIMMED audio).
  function trimBounds(a, sr, padMs) {
    padMs = padMs || 60;
    if (!a.length) return [0, 0];
    const thr = Math.max(peakOf(a) * 0.06, 0.004);
    let first = -1, last = -1;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > thr) { first = i; break; }
    if (first < 0) return [0, a.length];
    for (let i = a.length - 1; i >= 0; i--) if (Math.abs(a[i]) > thr) { last = i; break; }
    const pad = Math.round(sr * padMs / 1000);
    return [Math.max(0, first - pad), Math.min(a.length, last + pad)];
  }

  // Strip room tone either side, keeping a little air so it is not clipped.
  function trim(a, sr, padMs) {
    const [lo, hi] = trimBounds(a, sr, padMs);
    return a.subarray(lo, hi);
  }

  // gen/soundout._xfade(): join two clips with an equal-power crossfade, to
  // avoid a seam click. Returns the merged array (a new buffer).
  function xfadeData(a, b, n) {
    const eff = Math.min(n, a.length, b.length);
    const out = new Float32Array(a.length + b.length - eff);
    out.set(a.subarray(0, a.length - eff), 0);
    for (let i = 0; i < eff; i++) {
      const r = eff < 2 ? 1 : i / (eff - 1);
      out[a.length - eff + i] = a[a.length - eff + i] * Math.cos(r * Math.PI / 2)
        + b[i] * Math.sin(r * Math.PI / 2);
    }
    out.set(b.subarray(eff), a.length);
    return out;
  }

  // gen/soundout._fade(): linear fade-out over the last ms (copies).
  function fadeTail(a, sr, ms) {
    const n = Math.min(Math.round(sr * ms / 1000), a.length);
    if (n <= 1) return a;
    const out = Float32Array.from(a);
    for (let i = 0; i < n; i++) out[out.length - n + i] *= 1 - i / (n - 1);
    return out;
  }

  // gen/soundout.cap(): shorten a clip, or return it untouched. `keep`
  // decides WHICH end survives, and it matters enormously: a held sound's
  // identity is at its start, so keep='start' fades the tail; a stop's
  // identity is its release BURST, which many people record at the end of a
  // long voiced closure - keep='end' discards leading closure instead of
  // amputating the burst, which is how Grandma lost her /d/ twice.
  function capData(a, sr, seconds, keep) {
    const n = Math.trunc(seconds * sr);
    if (a.length <= n) return a;
    if (keep === 'end') {
      const out = Float32Array.from(a.subarray(a.length - n));
      const m = Math.min(Math.round(sr * 0.012), out.length);
      for (let i = 0; i < m; i++) out[i] *= m > 1 ? i / (m - 1) : 1;
      return out;
    }
    const out = Float32Array.from(a.subarray(0, n));
    const f = Math.min(Math.round(sr * 60 / 1000), out.length);
    for (let i = 0; i < f; i++) out[out.length - f + i] *= 1 - i / (f - 1 || 1);
    return out;
  }

  // gen/soundout.content(): trim a clip to its sustained content before any
  // window decision. Real recordings arrive with slow swells and breathy
  // tails - an /iː/ that fades in over half a second reads as silence to a
  // keep-the-start cap, which is how lollipop lost its i. Content is where
  // the energy is: 20ms windows above a tenth of the clip's own loudest (a
  // tenth, not more - a quiet vowel NEXT TO a loud burst must stay).
  function contentData(a, sr, keepMs) {
    if (a.length < Math.trunc(sr / 10)) return a;
    const w = Math.trunc(sr * 0.02);
    const n = Math.trunc(a.length / w);
    const rms = [];
    for (let i = 0; i < n; i++) rms.push(rmsOf(a, i * w, (i + 1) * w));
    const top = Math.max(...rms);
    if (top <= 0) return a;
    const on = rms.map((r) => r > top * 0.10);
    if (!on.some(Boolean)) return a;
    const i0 = on.indexOf(true);
    const i1 = n - [...on].reverse().indexOf(true);
    const pad = Math.trunc(sr * (keepMs === undefined ? 15 : keepMs) / 1000);
    return a.subarray(Math.max(0, i0 * w - pad), Math.min(a.length, i1 * w + pad));
  }

  // gen/levels._hard_clip's window+booster half: a sound ending in a stop
  // keeps a window CENTRED ON ITS BURST - located, not assumed - with the
  // body before it and the release after. The burst is levelled by peak only
  // when it IS a burst (peak well above the window's own rms): boosting a
  // window with no transient just manufactures static.
  function hardClipData(a, sr, seconds, endsStop) {
    let c = contentData(a, sr);
    const n = Math.trunc(seconds * sr);
    if (!endsStop) return capData(c, sr, seconds, 'start');
    if (c.length > n) {
      let b = 0, best = -1;
      for (let i = 0; i < c.length; i++) {
        const v = Math.abs(c[i]);
        if (v > best) { best = v; b = i; }
      }
      const lo = Math.max(0, Math.min(b - Math.trunc(n * 0.6), c.length - n));
      const out = Float32Array.from(c.subarray(lo, lo + n));
      const m = Math.min(Math.round(sr * 0.012), out.length);
      if (lo > 0 && m > 1) for (let i = 0; i < m; i++) out[i] *= i / (m - 1);
      c = out;
    }
    if (c.length) {
      const peak = peakOf(c);
      const wrms = rmsOf(c) || 1e-6;
      if (peak > 0 && peak < 0.75 && peak > 4.0 * wrms) {
        const g = Math.min(0.85 / peak, 4.0);
        const out = Float32Array.from(c);
        for (let i = 0; i < out.length; i++) out[i] *= g;
        c = out;
      }
    }
    return c;
  }

  // Radix-2 FFT (real input, magnitude out), zero-padded to a power of two.
  // The Python original uses an exact-length rfft; zero-padding shifts the
  // spectral centroid by a hair, which is irrelevant against a 2200 Hz
  // threshold with a 0.55 collapse ratio.
  function fftMag(x) {
    let n = 1;
    while (n < x.length) n <<= 1;
    const re = new Float64Array(n), im = new Float64Array(n);
    re.set(x);
    // bit-reversal
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    const half = n / 2 + 1;
    const mag = new Float64Array(half);
    for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
    return { mag, n };
  }

  // Per-bucket RMS + spectral centroid, 25ms buckets (gen/soundout._buckets).
  // Zero centroid = silence.
  function buckets(a, sr, ms) {
    ms = ms || 25;
    const n = Math.round(sr * ms / 1000);
    const out = [];
    for (let i = 0; i < Math.floor(a.length / n); i++) {
      const w = a.subarray(i * n, (i + 1) * n);
      const rms = rmsOf(w);
      if (rms < 0.01) { out.push({ i, rms, cen: 0 }); continue; }
      const win = new Float64Array(w.length);
      for (let k = 0; k < w.length; k++) {
        win[k] = w[k] * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (w.length - 1)));
      }
      const { mag, n: fftN } = fftMag(win);
      let sw = 0, s = 0;
      for (let k = 0; k < mag.length; k++) {
        const f = (k * sr) / fftN;
        sw += mag[k] * f; s += mag[k];
      }
      out.push({ i, rms, cen: sw / Math.max(s, 1e-9) });
    }
    return out;
  }

  // ---- the schwa detector (gen/recordings._schwa_tail) ----------------------
  // Where an "uh" starts on a consonant, in seconds, or null. The centroid
  // must land in vowel territory (<2200 Hz) AND collapse relative to the sound
  // itself, or every voiced fricative (ð, v, z) would be flagged; and it has
  // to last (a release transient is a bucket or two, a vowel is four or more).
  const SCHWA_CENTROID_HZ = 2200;
  const SCHWA_RATIO = 0.55;
  const SCHWA_MIN_MS = 100;

  function schwaTail(a, sr, ipa) {
    const b = buckets(a, sr, 25);
    const live = b.filter((x) => x.rms >= 0.01);
    if (live.length < 3) return null;

    let anchor, refCen, coreRms;
    if (phonemeClass(ipa) === 'stop') {
      // A stop is a burst and then nothing. Anchor on the burst; anything
      // sustained after it is by definition not part of the stop.
      anchor = live.reduce((m, x) => (x.rms > m.rms ? x : m)).i;
      refCen = null;
      coreRms = 0;
    } else {
      anchor = live.reduce((m, x) => (x.cen > m.cen ? x : m)).i;
      refCen = Math.max(...live.map((x) => x.cen));
      const core = live.filter((x) => x.i <= anchor).map((x) => x.rms).sort((p, q) => p - q);
      coreRms = core.length ? core[(core.length - 1) >> 1] : 0;
    }

    const need = Math.ceil(SCHWA_MIN_MS / 25);
    let run = 0, start = null;
    for (const { i, rms, cen } of b) {
      if (i <= anchor) continue;
      const vowelish = rms > 0.02
        && cen > 0 && cen < SCHWA_CENTROID_HZ
        && (refCen === null || cen < SCHWA_RATIO * refCen)
        && (coreRms === 0 || rms > 0.6 * coreRms);
      if (vowelish) {
        if (run === 0) start = i;
        run += 1;
        if (run >= need) return start * 0.025;
      } else {
        run = 0; start = null;
      }
    }
    return null;
  }

  // Nasals/liquids: the centroid cannot separate /m/ from a schwa, but a
  // nasal sits very low and an "uh" after it sits HIGHER, so the tail's
  // centroid rises. Weaker evidence - only ever asks for a listen.
  function sonorantTail(a, sr) {
    const live = buckets(a, sr, 25).filter((x) => x.rms >= 0.01 && x.cen > 0);
    if (live.length < 12) return null;
    const tail = live.slice(-8), body = live.slice(0, -8);
    const med = (xs) => { const s = [...xs].sort((p, q) => p - q); return s[(s.length - 1) >> 1]; };
    const bodyCen = med(body.map((x) => x.cen)), tailCen = med(tail.map((x) => x.cen));
    const bodyRms = med(body.map((x) => x.rms)), tailRms = med(tail.map((x) => x.rms));
    if (tailCen > Math.max(900, 1.8 * bodyCen) && tailRms > 0.5 * bodyRms) return tail[0].i * 0.025;
    return null;
  }

  // ---- take scoring (gen/studio.py) ----------------------------------------

  // Per class, the length a take should be: [min, max, ideal] seconds.
  // The hold ideal is 1.3s, not the 2.0 it used to be: measured against
  // guidance that said "about two seconds", a motivated adult held a MEDIAN
  // of 1.22s - the scorer was docking every normal take for missing a target
  // nobody hits. The videos prefer shorter holds anyway.
  const LENGTH_TARGET = {
    hold: [0.7, 3.0, 1.3],
    crisp: [0.05, 0.60, 0.20],
    free: [0.08, 1.50, 0.40],
    line: [0.8, 6.0, 2.2],
  };

  // How many attempts to record per item, by part. Three takes earn their
  // keep on the phonemes; three takes of "dog" turns a manageable sitting
  // into an hour of repeating yourself.
  const TAKES = { phonemes: 3, words: 1, sentences: 1 };
  const takesFor = (part) => TAKES[part] !== undefined ? TAKES[part] : 3;

  // Faults worth stopping for, and what to do about each.
  const ADVICE = {
    'very quiet': 'it came out very quiet - try sitting a bit closer',
    'noisy room': 'there is a fair bit of background noise',
    'shorter than it should be': 'it got cut off - leave a beat before and after',
    'wavering rather than held steady': 'try to hold it steady',
  };

  // Score one take. `item` is { kind, ipa, length } from the studio plan.
  // Scored against what actually damages a phonics clip, worst first:
  // schwa on a consonant, clipping, wrong length, too quiet, unsteadiness.
  // The first two are disqualifying; the rest are weighted.
  function scoreTake(audio, sr, item) {
    const s = { value: 0, fatal: '', notes: [], peak: 0, seconds: 0, snrDb: 0 };

    // Silence is caught on the UNTRIMMED audio, and it is fatal: a dead
    // microphone produces a buffer trim() returns unchanged, long enough to
    // satisfy the length guard, and it used to be SAVED.
    const rawPeak = audio.length ? peakOf(audio) : 0;
    if (rawPeak < 0.002) {
      s.fatal = 'Nothing came through - check the microphone is on and is the one the computer is listening to.';
      return s;
    }

    const a = trim(audio, sr);
    if (a.length < Math.round(sr * 0.03)) {
      s.fatal = 'Nothing was recorded.';
      return s;
    }

    s.peak = peakOf(a);
    s.seconds = a.length / sr;

    // clipping - disqualifying, and not fixable afterwards
    if (s.peak >= 0.985) {
      s.fatal = 'Too loud - it distorted. Move back a little.';
      return s;
    }

    // schwa on a consonant - the fatal one for teaching
    if (item.kind === 'phoneme' && item.ipa && phonemeClass(item.ipa) !== 'vowel') {
      try {
        if (schwaTail(a, sr, item.ipa) !== null) {
          s.fatal = 'There is an “uh” on the end.';
          return s;
        }
      } catch (e) { /* detector is advisory; never block a take on a crash */ }
    }

    const [lo, hi, ideal] = LENGTH_TARGET[item.length];
    s.value = 100;

    // length
    if (s.seconds < lo) { s.value -= 45; s.notes.push('shorter than it should be'); }
    else if (s.seconds > hi) { s.value -= 20; s.notes.push('longer than it needs to be'); }
    else s.value -= Math.min(18, Math.abs(s.seconds - ideal) / Math.max(ideal, 0.01) * 18);

    // level and noise. The floor comes from the UNTRIMMED audio: the quietest
    // 100ms window is the room, not the onset of the sound.
    const n = Math.round(sr * 0.1);
    let noise = 1e-4;
    if (audio.length >= n * 2) {
      let min = Infinity;
      for (let i = 0; i + n <= audio.length; i += n >> 1) {
        const r = rmsOf(audio, i, i + n);
        if (r < min) min = r;
      }
      noise = Number.isFinite(min) ? min : 1e-4;
    }
    const sig = rmsOf(a) || 1e-6;
    s.snrDb = 20 * Math.log10(sig / Math.max(noise, 1e-6));
    if (s.peak < 0.06) { s.value -= 35; s.notes.push('very quiet'); }
    else if (s.peak < 0.15) { s.value -= 12; s.notes.push('a little quiet'); }
    if (s.snrDb < 12) { s.value -= 15; s.notes.push('noisy room'); }

    // steadiness, but only where steadiness is the point
    if (item.length === 'hold') {
      const bn = Math.round(sr * 0.025);
      const mid = a.subarray(Math.floor(a.length * 0.2), Math.floor(a.length * 0.85));
      if (mid.length > bn * 3) {
        const rms = [];
        for (let i = 0; i < Math.floor(mid.length / bn); i++) rms.push(rmsOf(mid, i * bn, (i + 1) * bn));
        const mean = rms.reduce((p, q) => p + q, 0) / rms.length;
        if (mean > 0) {
          const sd = Math.sqrt(rms.reduce((p, q) => p + (q - mean) * (q - mean), 0) / rms.length);
          if (sd / mean > 0.55) { s.value -= 12; s.notes.push('wavering rather than held steady'); }
        }
      }
    }
    s.value = Math.max(0, s.value);
    return s;
  }

  // Score every take and pick one, with a reason that can be shown. Takes are
  // never averaged: summing unaligned speech comb-filters it and smears the
  // formants, which are exactly what phonics needs kept sharp.
  function choose(takes, sr, item) {
    const scored = takes.map((a, index) => ({ index, score: scoreTake(a, sr, item), audio: trim(a, sr) }));
    const usable = scored.filter((t) => !t.score.fatal);
    const best = usable.length ? usable.reduce((m, t) => (t.score.value > m.score.value ? t : m)) : null;

    const advice = (best ? best.score.notes : []).filter((nm) => ADVICE[nm]).map((nm) => ADVICE[nm]);
    const notes = best ? best.score.notes : [];
    const single = scored.length === 1;
    let reason = '';
    if (best) {
      if (!notes.length) reason = single ? 'Got it.' : 'Clean take.';
      else reason = (single ? 'Got it, though it is ' : 'Best of the takes, though it is ') + notes.join(' and ') + '.';
    }
    return {
      best: best ? best.index : null,
      takes: scored.map((t) => ({ index: t.index, value: Math.round(t.score.value * 10) / 10, fatal: t.score.fatal, notes: t.score.notes, seconds: Math.round(t.score.seconds * 100) / 100 })),
      audio: best ? best.audio : null,
      reason,
      allFailed: !best,
      weak: advice.length > 0,
      advice,
    };
  }

  // ---- time-stretch --------------------------------------------------------
  // Slow speech down without dropping the pitch: WSOLA overlap-add. Used only
  // to slow HER recorded words (0.80 for the sound-out arrival) and brokered
  // TTS sentences - the bundled built-in clips were stretched offline with a
  // real phase vocoder before they were packed.
  function stretch(a, sr, tempo) {
    if (!a.length || Math.abs(tempo - 1) < 0.03) return a;
    const win = Math.round(sr * 0.06);            // 60ms grains
    const hopOut = win >> 1;                       // 50% overlap out
    const hopIn = hopOut * tempo;                  // read slower than we write
    const search = Math.round(sr * 0.008);         // ±8ms alignment search
    const outLen = Math.round(a.length / tempo);
    const out = new Float32Array(outLen + win);
    const norm = new Float32Array(outLen + win);
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));

    let inPos = 0, prevIn = -1;
    for (let outPos = 0; outPos + win < out.length && inPos + win < a.length; outPos += hopOut) {
      let best = Math.round(inPos);
      if (prevIn >= 0) {
        // WSOLA: slide the grain ±search to line its waveform up with where
        // the previous grain's natural continuation would be.
        const naturalNext = prevIn + hopOut;
        let bestCorr = -Infinity;
        const lo = Math.max(0, Math.round(inPos) - search);
        const hi = Math.min(a.length - win - 1, Math.round(inPos) + search);
        for (let cand = lo; cand <= hi; cand += 4) {
          let corr = 0;
          for (let k = 0; k < win; k += 8) corr += a[naturalNext + k] * a[cand + k];
          if (corr > bestCorr) { bestCorr = corr; best = cand; }
        }
      }
      for (let k = 0; k < win; k++) {
        out[outPos + k] += a[best + k] * hann[k];
        norm[outPos + k] += hann[k];
      }
      prevIn = best;
      inPos += hopIn;
    }
    for (let i = 0; i < out.length; i++) if (norm[i] > 1e-4) out[i] /= norm[i];
    return out.subarray(0, outLen);
  }

  SIO.dsp = {
    VOWELS, STOPS, SONORANTS, phonemeClass,
    b64ToBytes, bytesToB64, audioContext, decodeBytes, toMono, bufferFrom,
    peakOf, rmsOf, trim, trimBounds, capData, contentData, hardClipData, xfadeData, fadeTail, buckets, schwaTail, sonorantTail,
    LENGTH_TARGET, TAKES, takesFor, ADVICE, scoreTake, choose, stretch,
  };
})();
