/*
 * mesh-media.js — the compositing core of the media plane (docs/media-plane.md).
 * Pure engine, no transport: meet.html feeds it sources (video elements) and
 * ships its output tracks over the links the mesh already holds.
 *
 * THE MODEL (media-plane "concrete rendering recursion"): every mosaic frame
 * is a C×C grid for one section; cell (r,i) shows seat (pc,r,i)'s camera if it
 * is a leaf, else its subtree's sub-mosaic. Assembly is DISTRIBUTED: a row
 * HEAD composites its row's BAND — a horizontal 1×C strip (each cell = that
 * seat's camera or its down-link's sub-mosaic) — and sends ONE band up its
 * up-link; the head one level up stacks C bands VERTICALLY into the full
 * frame. Row-layout horizontal, band-stack vertical — the H/V alternation of
 * the fractal, by construction. Section-1 heads finish redundantly in
 * parallel over cross-links (no election) and the full Stadium flows back
 * down every down-link. The Stage strip is the same band engine with the ≤C
 * chosen stagers as cells. Frame budget is CONSTANT per hop (SCALE.COMP_W ×
 * COMP_H) — a seat's forward cost never grows with the tree below it.
 *
 * GOVERNOR (learned the hard way — see the blur-pipe stall, 0698bb8): every
 * draw loop here is gated by its own measured cost (next paint ≥ max(frame
 * budget, 3× last cost)). Compositing may DROP frames, never queue them —
 * a weak phone gets a slower mosaic, never a dead page.
 */
(function (root) {
  const GifOS = root.GifOS = root.GifOS || {};
  const net = GifOS.net;

  // ---- layout math (pure — Node-testable) ----------------------------------
  // A BAND: 1×C horizontal strip, cell i at [i*W/C, 0, W/C, H].
  // A FRAME: C bands stacked, band r at [0, r*H/C, W, H/C].
  // Cells keep the slot even when empty (space is by tree POSITION, not
  // population — the fractal-space property, accepted by design).
  function bandRects(C, W, H) {
    const out = []; const cw = W / C;
    for (let i = 0; i < C; i++) out.push({ x: Math.round(i * cw), y: 0, w: Math.round((i + 1) * cw) - Math.round(i * cw), h: H });
    return out;
  }
  function frameRects(C, W, H) {
    const out = []; const bh = H / C;
    for (let r = 0; r < C; r++) out.push({ x: 0, y: Math.round(r * bh), w: W, h: Math.round((r + 1) * bh) - Math.round(r * bh) });
    return out;
  }
  // Fit a source of (sw×sh) into a cell rect COVER-style (fill, center-crop) —
  // faces read better cropped than letterboxed at mosaic scale.
  function coverBox(sw, sh, rect) {
    if (!sw || !sh) return { sx: 0, sy: 0, sw: sw || 1, sh: sh || 1 };
    const s = Math.max(rect.w / sw, rect.h / sh);
    const cw = rect.w / s, ch = rect.h / s;
    return { sx: (sw - cw) / 2, sy: (sh - ch) / 2, sw: cw, sh: ch };
  }

  // ---- the composite engine --------------------------------------------------
  // createComposite({ kind:'band'|'frame', C, w, h, fps, label }) →
  //   { canvas, stream, track, setCell(idx, videoEl|null, meta), cells,
  //     start(), stop(), stats() }
  // Draw is driven by an interval at fps, gated by the governor. Empty cells
  // paint a quiet placeholder (dark + slot index) so the grid reads as seats.
  function createComposite(opts) {
    const C = opts.C || (net && net.SCALE.C) || 5;
    const W = opts.w || (net && net.SCALE.COMP_W) || 756;
    const H = opts.h || (net && net.SCALE.COMP_H) || 1344;
    const fps = opts.fps || (net && net.SCALE.COMP_FPS) || 12;
    const rects = (opts.kind === 'frame' ? frameRects : bandRects)(C, W, H);
    const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (canvas) { canvas.width = W; canvas.height = H; }
    const ctx = canvas ? canvas.getContext('2d') : null;
    const cells = new Array(C).fill(null); // { el, meta } | null
    let timer = null, last = 0, cost = 0, drawn = 0, dropped = 0;

    function drawCell(i) {
      const r = rects[i], c = cells[i];
      if (!c || !c.el || !(c.el.videoWidth > 0)) {
        ctx.fillStyle = '#101418'; ctx.fillRect(r.x, r.y, r.w, r.h);
        return;
      }
      const b = coverBox(c.el.videoWidth, c.el.videoHeight, r);
      try { ctx.drawImage(c.el, b.sx, b.sy, b.sw, b.sh, r.x, r.y, r.w, r.h); } catch (e) {}
    }
    function paint() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - last < Math.max(1000 / fps, cost * 3)) { dropped++; return; } // GOVERNOR: drop, never queue
      for (let i = 0; i < C; i++) drawCell(i);
      last = now; cost = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - now; drawn++;
    }

    const comp = {
      canvas, cells, rects,
      stream: null, track: null,
      setCell(i, el, meta) { cells[i] = el ? { el, meta: meta || null } : null; },
      start() {
        if (timer || !canvas) return comp;
        comp.stream = canvas.captureStream(fps);
        comp.track = comp.stream.getVideoTracks()[0];
        timer = setInterval(paint, Math.max(20, 1000 / fps));
        paint();
        return comp;
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (comp.track) { try { comp.track.stop(); } catch (e) {} }
        comp.stream = null; comp.track = null;
      },
      stats() { return { drawn, dropped, cost: Math.round(cost * 10) / 10 }; },
    };
    return comp;
  }

  // ---- audio fold (WebAudio sum, bounded) ------------------------------------
  // A band's audio = the sum of its cells' audio tracks through per-cell gains
  // (the recorder's primitive). Callers own the AudioContext lifecycle.
  function createAudioFold(ac) {
    const dest = ac.createMediaStreamDestination();
    const srcs = new Map(); // key -> { src, gain }
    return {
      dest, track: () => dest.stream.getAudioTracks()[0] || null,
      add(key, stream, gain) {
        if (srcs.has(key) || !stream) return;
        const t = stream.getAudioTracks()[0]; if (!t) return;
        try {
          const src = ac.createMediaStreamSource(new MediaStream([t]));
          const g = ac.createGain(); g.gain.value = gain == null ? 1 : gain;
          src.connect(g); g.connect(dest);
          srcs.set(key, { src, gain: g });
        } catch (e) {}
      },
      remove(key) { const s = srcs.get(key); if (s) { try { s.src.disconnect(); s.gain.disconnect(); } catch (e) {} srcs.delete(key); } },
      clear() { for (const k of [...srcs.keys()]) this.remove(k); },
      keys: () => [...srcs.keys()],
    };
  }

  GifOS.meshMedia = { bandRects, frameRects, coverBox, createComposite, createAudioFold };
})(typeof window !== 'undefined' ? window : globalThis);
