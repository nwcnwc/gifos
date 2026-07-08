/*
 * gifos-icons.js — animated app icons, rasterized (canvas) into GIF frames
 * with an adaptive palette, plus the ICON PACK system that lets each themed
 * computer (0–9.gifos.app) speak a completely different art language.
 *
 * A PACK is a self-contained art module registered with GifOS.iconPacks:
 *
 *   GifOS.iconPacks.register('name', {
 *     size: 96, frames: 6, delayCs: 12,          // its own raster + tempo
 *     draw(subject, accent)  -> [Frame] | null,  // the whole style lives here
 *     fallback(letter, accent) -> [Frame],       // unknown apps still get art
 *   });
 *
 * A Frame is any of: an SVG string (procedural vector), a data:/blob: image
 * URL (baked renders, e.g. AI art), or a painter function (ctx, size, f)
 * (direct canvas — true pixel art). The rasterizer normalizes all three and
 * the adaptive-palette GIF encode is shared. Packs draw SUBJECTS (semantic
 * names like 'notes', 'video', 'folder'), so future apps and Easter eggs work
 * in every pack, and each pack ships its own lettered fallback.
 *
 * The active pack comes from the computer's theme (gifos-themes.js). Packs
 * live in their own gifos-pack-<name>.js files and register here on load.
 *
 * Browser-only (needs canvas). Attaches to `GifOS.icons` + `GifOS.iconPacks`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const S = 64;            // legacy default raster size (renderFrames compat)
  const DELAY = 13;        // legacy default centiseconds per frame

  // ---- rasterize frames → animated GIF (adaptive palette) -------------------
  // Palette index 0 is reserved as the TRANSPARENT color; visible colors live
  // in 1..255. Transparent pixels never influence the adaptive palette.
  function buildPalette(rgbFrames) {
    const key = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const counts = new Map();
    for (const data of rgbFrames) {
      for (let p = 0; p < data.length; p += 4) {
        if (data[p + 3] < 128) continue; // transparent → reserved index 0
        const k = key(data[p], data[p + 1], data[p + 2]);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const top = Array.from(counts.keys()).sort((x, y) => counts.get(y) - counts.get(x)).slice(0, 255);
    const centers = top.map((k) => [(((k >> 10) & 31) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4]);
    const palette = new Array(256 * 3).fill(0);
    for (let i = 0; i < centers.length; i++) { palette[(i + 1) * 3] = centers[i][0]; palette[(i + 1) * 3 + 1] = centers[i][1]; palette[(i + 1) * 3 + 2] = centers[i][2]; }
    const cache = new Map();
    const map = (r, g, b, a) => {
      if (a < 128) return 0;
      const k = key(r, g, b);
      let idx = cache.get(k);
      if (idx === undefined) {
        let best = 0, bd = 1e12;
        for (let i = 0; i < centers.length; i++) { const dr = r - centers[i][0], dg = g - centers[i][1], db = b - centers[i][2]; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = i; } }
        idx = best + 1; cache.set(k, idx);
      }
      return idx;
    };
    return { palette, map };
  }

  // Normalize ONE frame of any supported kind onto the canvas.
  //   string starting with '<'      → SVG document
  //   string starting with 'data:'/'blob:' → pre-baked image (AI renders)
  //   function                      → painter: fn(ctx, size, frameIndex)
  function paintFrame(ctx, size, frame, f) {
    ctx.clearRect(0, 0, size, size);
    if (typeof frame === 'function') { frame(ctx, size, f); return Promise.resolve(); }
    const src = (typeof frame === 'string' && frame[0] === '<')
      ? 'data:image/svg+xml,' + encodeURIComponent(frame) : frame;
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, size, size); res(); };
      img.onerror = () => rej(new Error('frame load failed'));
      img.src = src;
    });
  }

  // Ordered (Bayer 8×8) dithering: gradient-heavy packs opt in to trade the
  // GIF's hard 256-color bands for a fine, FRAME-STABLE checker texture —
  // error-diffusion would shimmer between animation frames, ordered doesn't.
  const BAYER = (() => {
    let m = [[0]];
    for (let s = 1; s <= 4; s++) { // 2^4 = 8×8... build 1→2→4→8
      const n = m.length, out = [];
      for (let y = 0; y < n * 2; y++) { out.push(new Array(n * 2)); }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4;
        out[y][x] = v; out[y][x + n] = v + 2; out[y + n][x] = v + 3; out[y + n][x + n] = v + 1;
      }
      m = out;
      if (m.length === 8) break;
    }
    return m;
  })();

  // Rasterize a list of frames (any kind) → animated GIF descriptor.
  // opts.dither: Bayer amplitude in RGB units (0/absent = off; ~14 is subtle).
  function rasterize(frames, size, delayCs, opts) {
    const dither = (opts && opts.dither) || 0;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rgbFrames = [];
    let chain = Promise.resolve();
    frames.forEach((frame, f) => {
      chain = chain.then(() => paintFrame(ctx, size, frame, f))
        .then(() => { rgbFrames.push(ctx.getImageData(0, 0, size, size).data); });
    });
    return chain.then(() => {
      const { palette, map } = buildPalette(rgbFrames);
      const idxFrames = rgbFrames.map((data) => {
        const idx = new Uint8Array(size * size);
        for (let p = 0; p < size * size; p++) {
          let r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
          if (dither) {
            const t = (BAYER[(p / size | 0) % 8][(p % size) % 8] / 64 - 0.5) * dither;
            r = Math.max(0, Math.min(255, r + t)); g = Math.max(0, Math.min(255, g + t)); b = Math.max(0, Math.min(255, b + t));
          }
          idx[p] = map(r, g, b, data[p * 4 + 3]);
        }
        return idx;
      });
      return { width: size, height: size, palette, numColors: 256, minCodeSize: 8, frames: idxFrames, delayCs, transparentIndex: 0 };
    });
  }

  // Back-compat: SVG frames at the sticker pack's size/tempo.
  function renderFrames(svgFrames) { return rasterize(svgFrames, S, DELAY); }

  // ---- the pack registry -----------------------------------------------------
  const packs = {};
  const loading = {};
  // Packs load LAZILY by convention (js/gifos-pack-<name>.js): only the active
  // computer's pack ever downloads. The default packs stay as eager script tags
  // for an instant first paint; a missing/broken pack file resolves undefined
  // and the caller falls back to the flagship.
  function ensure(name) {
    if (packs[name]) return Promise.resolve(packs[name]);
    if (!root.document) return Promise.resolve(undefined);
    if (!loading[name]) {
      loading[name] = new Promise((res) => {
        const s = root.document.createElement('script');
        s.src = 'js/gifos-pack-' + encodeURIComponent(name) + '.js';
        s.onload = () => res(); s.onerror = () => res();
        root.document.head.appendChild(s);
      });
    }
    return loading[name].then(() => packs[name]);
  }
  GifOS.iconPacks = {
    register(name, pack) { packs[name] = pack; },
    get(name) { return packs[name]; },
    ensure,
    // The computer's theme names its pack; missing/unknown packs fall back to
    // the flagship so a half-deployed theme still boots with working icons.
    active() {
      const want = (GifOS.theme && GifOS.theme.pack) || 'aurora';
      return packs[want] || packs.aurora || packs.sticker;
    },
  };

  // Subject vocabulary: packs draw SUBJECTS, not appIds. Today the two are the
  // same names; this map is the seam where future aliases land so old appIds
  // keep resolving if a subject is ever renamed.
  const SUBJECTS = {};
  const subjectFor = (appId) => SUBJECTS[appId] || appId;

  // Render an app's icon as an animated GIF through the ACTIVE pack (lazy-
  // loading it on first use). Unknown subjects get the pack's own lettered
  // fallback, so every app has art.
  function renderApp(appId, accent) {
    accent = accent || [123, 92, 255];
    const want = (GifOS.theme && GifOS.theme.pack) || 'aurora';
    return ensure(want).then((loaded) => {
      const pack = loaded || packs.aurora || packs.sticker;
      const subject = subjectFor(appId);
      const frames = pack.draw(subject, accent)
        || pack.fallback((appId || '?')[0].toUpperCase(), accent);
      return rasterize(frames, pack.size || S, pack.delayCs || DELAY, { dither: pack.dither || 0 });
    });
  }

  GifOS.icons = { renderApp, renderFrames, rasterize,
    has: (id) => { try { const p = GifOS.iconPacks.active(); return !!(p && p.draw(subjectFor(id), [123, 92, 255])); } catch (e) { return false; } } };
})(typeof window !== 'undefined' ? window : globalThis);
