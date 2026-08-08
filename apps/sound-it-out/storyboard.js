// Segments -> a playable plan. Ports the fitting logic from gen/service.py
// (whole-item trimming, whole-pass repetition, level 6's stretch-not-repeat)
// and the storyboard maths from gen/soundout.plan_job - except that no frames
// are rasterised and no file is encoded: the browser renders each visual
// state live against the timeline, which is strictly better than the desktop
// app's PNG round-trip.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  const LOOP_PAD = 1.0; // silence before the loop comes round again

  // Trim a segment list to `target` seconds, cutting only at item ends.
  // Cutting mid-item would end the video with a word half sounded out, which
  // teaches the wrong thing. Unless allowEmpty, the first item is always kept
  // whole, so a request shorter than a single item still produces a video.
  function wholeItemsUpto(segments, durOf, target, allowEmpty) {
    const out = [];
    let item = [], total = 0;
    for (const seg of segments) {
      item.push(seg);
      if (seg.itemEnd) {
        const dur = item.reduce((s, x) => s + durOf(x), 0);
        if ((out.length || allowEmpty) && total + dur > target) {
          // Overrunning by less than we would fall short lands closer to what
          // was asked for, so the boundary item stays in.
          if (total + dur - target < target - total) out.push(...item);
          break;
        }
        out.push(...item);
        total += dur;
        item = [];
      }
    }
    return (out.length || allowEmpty) ? out : segments;
  }

  // Level 6 is a journey, not a playlist: filling 30 minutes by playing the
  // arc four times over is the wrong shape, so the arc is stretched by
  // repeating each item more (~10.5 min per extra rep, measured).
  function levelOpts(level, opts) {
    const minutes = Number(opts.minutes || 0);
    if (level === 6 && minutes > 0) {
      return Object.assign({}, opts, { reps: Math.max(2, Math.min(14, Math.round(minutes / 10.5) + 1)) });
    }
    return opts;
  }

  // Build + resolve + fit. Returns:
  //   { entries: [{seg, buffer|null, audioSeconds, duration}],
  //     duration, voiceSummary, missing }
  // `duration` includes the loop pad. onProgress(done, total) ticks while
  // clips resolve (the slow part: first-time decode of every unique clip).
  async function buildPlan(level, opts, groups, voice, onProgress) {
    const cur = SIO.curriculum;
    opts = levelOpts(level, opts);
    const segments = cur.build(level, opts, groups);

    // Resolve every UNIQUE clip once, in order of first appearance.
    const uniq = new Map();
    for (const seg of segments) {
      const k = JSON.stringify(seg.clip);
      if (!uniq.has(k)) uniq.set(k, seg.clip);
    }
    const buffers = new Map();
    let done = 0;
    for (const [k, req] of uniq) {
      buffers.set(k, await voice.resolve(req));
      done += 1;
      if (onProgress) onProgress(done, uniq.size);
    }

    // A clip with no voice still holds its visual state for a teachable beat.
    const FALLBACK_SECONDS = 1.0;
    const audioSeconds = (seg) => {
      const b = buffers.get(JSON.stringify(seg.clip));
      return b ? b.duration : FALLBACK_SECONDS;
    };
    const durOf = (seg) => audioSeconds(seg) + seg.pad;

    // Fit the running time that was actually asked for, in both directions.
    // Repeating fills a short pass (fewer restarts on a TV); trimming handles
    // the opposite case. Level 6 is never repeated - stretched above - but is
    // trimmed: its items are whole chapters.
    let fitted = segments;
    const minutes = Number(opts.minutes || 0);
    if (minutes > 0 && segments.length) {
      const target = minutes * 60;
      const one = segments.reduce((s, x) => s + durOf(x), 0);
      if (one > target) {
        fitted = wholeItemsUpto(segments, durOf, target, false);
      } else if (one > 0 && level !== 6) {
        // Whole passes, then whole items from the start of another pass to
        // cover the remainder. The video loops anyway, so a partial final
        // pass is just the loop arriving early.
        const n = Math.floor(target / one);
        const extra = wholeItemsUpto(segments, durOf, target - n * one, true);
        fitted = [];
        for (let i = 0; i < n; i++) fitted.push(...segments);
        fitted.push(...extra);
      }
    }

    const entries = fitted.map((seg) => ({
      seg,
      buffer: buffers.get(JSON.stringify(seg.clip)),
      audioSeconds: audioSeconds(seg),
      duration: durOf(seg),
    }));
    const duration = entries.reduce((s, e) => s + e.duration, 0) + LOOP_PAD;

    return {
      entries,
      duration,
      loopPad: LOOP_PAD,
      voiceSummary: voice.summary(),
      missing: voice.missing,
    };
  }

  SIO.storyboard = { buildPlan, wholeItemsUpto, levelOpts, LOOP_PAD };
})();
