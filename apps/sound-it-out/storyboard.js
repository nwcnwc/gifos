// Library texts -> a playable plan. Ports plan_job's frame logic from
// gen/soundout.py (0.4.x) - including the neutral-pad rule and the read-along
// expansion - except that nothing is rasterised or encoded: the browser
// renders each visual state live against the timeline.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  const LOOP_PAD = 1.0;

  // The highlight goes out when the voice stops: a segment's pad shows the
  // same text NEUTRAL, so colour keeps exactly one meaning - "this is what is
  // being said right now". Below the threshold the light stays on: the
  // closing gaps of a blending buildup are a fast rhythm, and flicking the
  // colour at that rate is a strobe, not a cue.
  const NEUTRAL_PAD = 0.35;

  // Build + resolve. Returns { entries, duration, voiceSummary, missing }.
  // Each entry: { seg, buffer|null, duration } - neutral-pad frames arrive as
  // their own buffer-less entries, and a sentence's read-along is expanded
  // here into slice entries cut from her line recording at the word
  // boundaries library.wordSpans estimates.
  async function buildPlan(texts, opts, voice, onProgress) {
    const cur = SIO.curriculum;
    const lib = SIO.library;
    const dsp = SIO.dsp;
    // The voice-coherence gate: a buildup only happens when every one of the
    // word's sounds can actually be said (her voice or the starter voice).
    // Half a buildup in silence teaches worse than a word shown whole.
    await voice.loadRecordedIndex();
    const built = Object.assign({}, opts, {
      buildable: (word) => cur.wordParts(word).every(([, ipa]) => voice.phonemeAvailable(ipa)),
    });
    const segments = cur.library(texts, built);

    // Resolve every unique clip once (read-along markers resolve their line;
    // touching markers resolve their capped phonemes; word timings reuse the
    // word clips the buildup already needed).
    const uniq = new Map();
    const want = (req) => {
      const k = JSON.stringify(req);
      if (!uniq.has(k)) uniq.set(k, req);
    };
    for (const seg of segments) {
      if (seg.clip) want(seg.clip);
      if (seg.touching) {
        for (const [, ipa] of seg.touching.parts) {
          want({ kind: 'phoneme', ipa, cap: cur.TOUCH_HOLD * cur.soundsIn(ipa) });
        }
      }
    }
    const buffers = new Map();
    let done = 0;
    for (const [k, req] of uniq) {
      buffers.set(k, await voice.resolve(req));
      done += 1;
      if (onProgress) onProgress(done, uniq.size);
    }
    const bufFor = (clip) => buffers.get(JSON.stringify(clip));

    const FALLBACK_SECONDS = 1.0;
    const entries = [];

    const push = (seg, buffer, duration) => entries.push({ seg, buffer, duration });

    // One spoken segment -> a talk entry, plus a neutral entry for a long pad.
    const emit = (seg, buffer) => {
      const talk = buffer ? buffer.duration : FALLBACK_SECONDS;
      const anyHl = seg.parts.some(([, on]) => on);
      const dark = seg.pad >= NEUTRAL_PAD && anyHl;
      if (dark) {
        push(seg, buffer, talk);
        push({ parts: seg.parts.map(([t]) => [t, false]), scale: seg.scale, color: seg.color },
          null, seg.pad);
      } else {
        push(seg, buffer, talk + seg.pad);
      }
    };

    for (const seg of segments) {
      if (seg.touching) {
        // The final pass TOUCHES (upstream 0.5.4): the sounds are shortened,
        // edge-trimmed, and joined with an equal-power crossfade into one
        // continuous utterance - no silence inside it - so the last thing
        // heard before the whole word is almost the word. The highlight
        // still sweeps letter by letter: the merged audio is sliced back
        // apart at each crossfade's midpoint, and the slices concatenate to
        // exactly the merged audio, so sound and light cannot drift. One
        // held breath sits between the blend and the word that answers it.
        const parts = seg.touching.parts;
        const shownAt = (j) => parts.map(([t], k) => [t, k === j]);
        const clips = parts.map(([, ipa]) => bufFor({ kind: 'phoneme', ipa, cap: cur.TOUCH_HOLD * cur.soundsIn(ipa) }));
        if (clips.some((b) => !b)) {
          // a sound nobody can say: per-letter fallback, still no long gaps
          parts.forEach(([, ipa], j) => {
            emit({ parts: shownAt(j), pad: j === parts.length - 1 ? cur.TOUCH_BREATH : 0, scale: seg.scale, color: null },
              bufFor({ kind: 'phoneme', ipa, cap: cur.TOUCH_HOLD * cur.soundsIn(ipa) }));
          });
          continue;
        }
        let sr = 0, merged = null;
        const cuts = [];
        const xn = () => Math.round(sr * cur.TOUCH_XFADE_MS / 1000);
        for (const b of clips) {
          const m = dsp.toMono(b);
          sr = m.sr;
          const e = Math.min(Math.round(sr * cur.TOUCH_EDGE_MS / 1000), Math.trunc(m.data.length * 0.15));
          const d = (e && m.data.length > 4 * e) ? m.data.subarray(e, m.data.length - e) : m.data;
          if (merged === null) { merged = d; continue; }
          const eff = Math.min(xn(), merged.length, d.length);
          cuts.push(merged.length - eff + Math.trunc(eff / 2));
          merged = dsp.xfadeData(merged, d, xn());
        }
        merged = dsp.fadeTail(merged, sr, 40);
        const bounds = [0, ...cuts, merged.length];
        parts.forEach((p, j) => {
          emit({ parts: shownAt(j), pad: j === parts.length - 1 ? cur.TOUCH_BREATH : 0, scale: seg.scale, color: null },
            dsp.bufferFrom(merged.subarray(bounds[j], bounds[j + 1]), sr));
        });
        continue;
      }
      if (!seg.readalong) { emit(seg, bufFor(seg.clip)); continue; }

      // The read-along: her whole read once, sliced at estimated word
      // boundaries, each slice a segment with its word lit. The slices
      // concatenate back to the original audio exactly, so however rough an
      // estimate is, sound and picture cannot drift apart.
      const { text, scale } = seg.readalong;
      const lineBuf = bufFor(seg.clip);
      const words = text.split(/\s+/).filter(Boolean);
      if (!lineBuf) {
        // No line recording and no fallback read: show the whole line lit
        // for a beat instead, and the miss is already in voice.missing.
        emit({ parts: [[text, true]], pad: seg.pad, scale, color: null }, null);
        continue;
      }
      const { data, sr } = dsp.toMono(lineBuf);
      const clipLens = words.map((w) => {
        const b = bufFor({ kind: 'word', text: SIO.curriculum.cleanWord(w), slow: false });
        return b ? b.length : 0;
      });
      const spans = lib.wordSpans(data, words, clipLens);
      spans.forEach(([a, b], i) => {
        const parts = [];
        words.forEach((w, j) => {
          if (j) parts.push([' ', false]);
          parts.push([w, j === i]);
        });
        const slice = dsp.bufferFrom(data.subarray(a, b), sr);
        const last = i === spans.length - 1;
        emit({ parts, pad: last ? seg.pad : 0, scale, color: null }, slice);
      });
    }

    const duration = entries.reduce((s, e) => s + e.duration, 0) + LOOP_PAD;
    return {
      entries,
      duration,
      loopPad: LOOP_PAD,
      voiceSummary: voice.summary(),
      missing: voice.missing,
    };
  }

  SIO.storyboard = { buildPlan, LOOP_PAD, NEUTRAL_PAD };
})();
