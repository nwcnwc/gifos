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
  // A CENTERED SQUARE cut from the source's SHORTEST dimension — the same for a
  // landscape webcam or a portrait phone (a conference call is a mix of both).
  // Cells are square, so this square fills the cell with no distortion; faces
  // sit centered, no nostril-zoom, no flipped aspect.
  function coverBox(sw, sh, rect) {
    const side = Math.min(sw, sh) || 1;
    return { sx: (sw - side) / 2, sy: (sh - side) / 2, sw: side, sh: side };
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
    const N = opts.cells || C; // a head's product = band + C subs = C+1 slots
    const rects = (opts.kind === 'frame' ? frameRects : bandRects)(N, W, H);
    const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (canvas) { canvas.width = W; canvas.height = H; }
    const ctx = canvas ? canvas.getContext('2d') : null;
    const cells = new Array(N).fill(null); // { el, streamId } | null
    // Optional AUDIO FOLD: the composite's audio is the summed audio of its
    // cells' source streams. A nested sub-mosaic's stream already carries its
    // OWN fold, so folding it re-sums recursively up the tree — a band folds
    // its row, a frame folds its bands, and so on, by construction.
    const fold = (opts.ac && createAudioFold(opts.ac)) || null;
    let timer = null, last = 0, cost = 0, drawn = 0, dropped = 0;

    function drawCell(i) {
      const r = rects[i], c = cells[i];
      const el = c && c.el;
      const sw = el ? (el.videoWidth || el.width || 0) : 0;   // <video> or <canvas> source
      const sh = el ? (el.videoHeight || el.height || 0) : 0;
      if (!sw || !sh) {
        ctx.fillStyle = '#101418'; ctx.fillRect(r.x, r.y, r.w, r.h);
        return;
      }
      // WHAT a cell holds depends on the KIND, not on <video> vs <canvas> (a
      // received sub-mosaic arrives as a <video> too, so tag-name can't tell):
      //   BAND cells  = LEAF faces → centered-square crop, so every face is square.
      //   FRAME cells = NESTED composites (a row band, a sub-product, the stadium)
      //                 → draw WHOLE, aspect-preserved (contain), NEVER cropped —
      //                 else a 756×151 strip of 5 faces gets its centre square cut
      //                 out and smeared across the cell (the stretched bands bug).
      if (opts.kind === 'frame') {
        const s = Math.min(r.w / sw, r.h / sh);
        const dw = sw * s, dh = sh * s, dx = r.x + (r.w - dw) / 2, dy = r.y + (r.h - dh) / 2;
        ctx.fillStyle = '#101418'; ctx.fillRect(r.x, r.y, r.w, r.h);
        try { ctx.drawImage(el, 0, 0, sw, sh, dx, dy, dw, dh); } catch (e) {}
        return;
      }
      const b = coverBox(sw, sh, r);
      try { ctx.drawImage(el, b.sx, b.sy, b.sw, b.sh, r.x, r.y, r.w, r.h); } catch (e) {}
    }
    function paint() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - last < Math.max(1000 / fps, cost * 3)) { dropped++; return; } // GOVERNOR: drop, never queue
      for (let i = 0; i < N; i++) drawCell(i);
      last = now; cost = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - now; drawn++;
    }

    const comp = {
      canvas, cells, rects,
      stream: null, track: null,
      setCell(i, el, stream) {
        const sid = stream ? stream.id : null;
        const prev = cells[i];
        if (fold) {
          if (prev && prev.streamId !== sid) fold.remove('c' + i);
          if (sid && (!prev || prev.streamId !== sid)) fold.add('c' + i, stream, opts.gain == null ? 1 : opts.gain);
        }
        cells[i] = el ? { el, streamId: sid } : (fold && prev ? (fold.remove('c' + i), null) : null);
      },
      start() {
        if (timer || !canvas) return comp;
        const vTrack = canvas.captureStream(fps).getVideoTracks()[0];
        const aTrack = fold && fold.track();
        comp.stream = new MediaStream(aTrack ? [vTrack, aTrack] : [vTrack]);
        comp.track = vTrack;
        timer = setInterval(paint, Math.max(20, 1000 / fps));
        paint();
        return comp;
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (fold) fold.clear();
        if (comp.track) { try { comp.track.stop(); } catch (e) {} }
        comp.stream = null; comp.track = null;
      },
      stats() { return { drawn, dropped, cost: Math.round(cost * 10) / 10 }; },
    };
    return comp;
  }

  // ---- the GAPLESS PACKER (docs/media-plane.md, approach A) -------------------
  // Every shipped mosaic is a ROW-MAJOR PACKED GRID of square faces: n faces in
  // a cols-wide grid, NO internal holes — only a computable tail gap at the
  // bottom-right ((cols*rows − n) cells). The announce meta carries {n, cols}
  // (two ints on the existing control frame — zero video bandwidth), so a
  // receiver knows exactly where every face sits and can BLIT any face out of a
  // received block by sub-rect (pixels are addressable even though the stream
  // is one blended video — approach A: one stream per link, never per-face
  // fan-out). The packer lays ALL faces it holds — received blocks + its own
  // live leaves — into ONE gapless grid, which self-describes for the next
  // level up. Empty seats are simply never drawn: no black cells, no fixed C×C.
  //
  // packGrid(T, shape): the grid for T faces — 'bar' ⇒ 1×T; 'grid' ⇒ near-square
  // (cols = ceil(sqrt(T))), the tail gap always < cols.
  function packGrid(T, shape) {
    if (T <= 0) return { cols: 1, rows: 1 };
    if (shape === 'bar') return { cols: T, rows: 1 };
    const cols = Math.ceil(Math.sqrt(T));
    return { cols, rows: Math.ceil(T / cols) };
  }
  // faceSrcRect(j, n, cols, sw, sh): source rect of face j inside a packed block
  // (row-major). Cells are square by construction; derive size from the block.
  function faceSrcRect(j, n, cols, sw, sh) {
    const rows = Math.max(1, Math.ceil(n / cols));
    const cw = sw / cols, ch = sh / rows;
    return { sx: (j % cols) * cw, sy: Math.floor(j / cols) * ch, sw: cw, sh: ch };
  }

  // createPacker({ shape:'bar'|'grid', cell, maxW, fps, ac, gain }) →
  //   { canvas, stream, setTile(id, ord, el, stream, {n, cols}), delTile(id),
  //     count(), cols(), rows(), start(), stop(), stats() }
  // A tile is a leaf face ({n:1, cols:1} — center-square cropped) or a packed
  // block (n faces, cols wide — faces blitted through). Tiles draw in ord
  // order, so the layout is deterministic on every device.
  function createPacker(opts) {
    opts = opts || {};
    const shape = opts.shape || 'grid';
    const cellPref = opts.cell || 110; // composite face cell px — small secondary tiles, keep encode/ship cheap (was COMP_W/C=151)
    const maxW = opts.maxW || 640; // cap composite canvas width — bounds encode CPU + bandwidth at scale (was 1080)
    const fps = opts.fps || (net && net.SCALE.COMP_FPS) || 12;
    const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const tiles = new Map(); // id -> { ord, el, streamId, n, cols }
    const fold = (opts.ac && createAudioFold(opts.ac)) || null;
    let timer = null, last = 0, cost = 0, drawn = 0, dropped = 0;
    let G = 1, R = 1;

    const total = () => { let t = 0; for (const v of tiles.values()) t += v.n; return t; };

    // Burn identity onto a leaf face cell: a green TALKING frame, the NAME on a
    // bottom strip, a HAND glyph top-right. Baked at the leaf so it travels the
    // tree inside the one blended stream — no extra bandwidth, no receiver-side
    // identity (approach A). lbl = { name, hand, talking } | null.
    function drawOverlay(dx, dy, cell, lbl) {
      if (!lbl) return;
      if (lbl.talking) {
        const lw = Math.max(2, cell * 0.035);
        ctx.strokeStyle = '#37d67a'; ctx.lineWidth = lw;
        ctx.strokeRect(dx + lw / 2, dy + lw / 2, cell - lw, cell - lw);
      }
      if (lbl.name) {
        const fs = Math.max(8, Math.round(cell * 0.11)), pad = Math.round(cell * 0.03);
        const bh = fs + pad * 2;
        ctx.fillStyle = 'rgba(10,10,15,0.62)'; ctx.fillRect(dx, dy + cell - bh, cell, bh);
        ctx.fillStyle = '#eef'; ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        let nm = String(lbl.name); const maxW = cell - pad * 2;
        while (nm.length > 1 && ctx.measureText(nm).width > maxW) nm = nm.slice(0, -1);
        if (nm !== String(lbl.name)) nm = nm.slice(0, -1) + '…';
        ctx.fillText(nm, dx + pad, dy + cell - bh / 2);
      }
      if (lbl.hand) {
        const r = Math.max(6, cell * 0.12);
        ctx.font = (r * 1.4 | 0) + 'px system-ui'; ctx.textBaseline = 'top';
        ctx.fillText('✋', dx + cell - r * 1.6, dy + r * 0.3);
      }
    }
    function paint() {
      if (!ctx) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - last < Math.max(1000 / fps, cost * 3)) { dropped++; return; } // GOVERNOR: drop, never queue
      const T = total();
      const g = packGrid(T, shape); G = g.cols; R = g.rows;
      const cell = Math.max(24, Math.min(cellPref, Math.floor(maxW / G)));
      const W = Math.max(1, G * cell), H = Math.max(1, R * cell);
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, W, H);
      const order = [...tiles.values()].sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));
      let f = 0;
      for (const t of order) {
        const el = t.el;
        const sw = el ? (el.videoWidth || el.width || 0) : 0;
        const sh = el ? (el.videoHeight || el.height || 0) : 0;
        for (let j = 0; j < t.n; j++, f++) {
          const dx = (f % G) * cell, dy = Math.floor(f / G) * cell;
          if (!sw || !sh) { continue; } // source not ready — leave dark, next paint fills
          try {
            if (t.n === 1 && t.cols === 1) {
              const b = coverBox(sw, sh, { w: cell, h: cell });      // leaf camera → centered square
              ctx.drawImage(el, b.sx, b.sy, b.sw, b.sh, dx, dy, cell, cell);
              drawOverlay(dx, dy, cell, t.lbl);                       // BURN IN name/hand/talking (approach A: baked once at the leaf, rides pixels up the tree)
            } else {
              const s = faceSrcRect(j, t.n, t.cols, sw, sh);         // block face → straight blit (overlay already baked by the sender)
              ctx.drawImage(el, s.sx, s.sy, s.sw, s.sh, dx, dy, cell, cell);
            }
          } catch (e) {}
        }
      }
      last = now; cost = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - now; drawn++;
    }

    const pk = {
      canvas, stream: null, track: null,
      setTile(id, ord, el, stream, meta) {
        const sid = stream ? stream.id : null;
        const prev = tiles.get(id);
        if (fold) {
          if (prev && prev.streamId !== sid) fold.remove('t' + id);
          if (sid && (!prev || prev.streamId !== sid)) fold.add('t' + id, stream, opts.gain == null ? 1 : opts.gain);
        }
        if (!el) { if (fold && prev) fold.remove('t' + id); tiles.delete(id); return; }
        const n = Math.max(1, (meta && meta.n) | 0 || 1);
        const cols = Math.max(1, (meta && meta.cols) | 0 || n); // a bar's cols = n
        tiles.set(id, { ord, el, streamId: sid, n, cols, lbl: (meta && meta.lbl) || null });
      },
      // Update just the overlay (name/hand/talking) without touching the source
      // — called every tick from status/audio so the frame tracks speech live.
      label(id, lbl) { const t = tiles.get(id); if (t) t.lbl = lbl; },
      delTile(id) { if (fold) fold.remove('t' + id); tiles.delete(id); },
      clearTiles() { for (const id of [...tiles.keys()]) pk.delTile(id); },
      ids: () => [...tiles.keys()],
      count: total, cols: () => G, rows: () => R,
      start() {
        if (timer || !canvas) return pk;
        const vTrack = canvas.captureStream(fps).getVideoTracks()[0];
        const aTrack = fold && fold.track();
        pk.stream = new MediaStream(aTrack ? [vTrack, aTrack] : [vTrack]);
        pk.track = vTrack;
        timer = setInterval(paint, Math.max(20, 1000 / fps));
        paint();
        return pk;
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (fold) fold.clear();
        if (pk.track) { try { pk.track.stop(); } catch (e) {} }
        pk.stream = null; pk.track = null;
      },
      stats() { return { drawn, dropped, cost: Math.round(cost * 10) / 10, faces: total(), cols: G, rows: R }; },
    };
    return pk;
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

  GifOS.meshMedia = { bandRects, frameRects, coverBox, createComposite, createAudioFold, packGrid, faceSrcRect, createPacker };
})(typeof window !== 'undefined' ? window : globalThis);
