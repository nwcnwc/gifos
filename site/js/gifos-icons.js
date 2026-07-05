/*
 * gifos-icons.js — Custom, hand-designed animated artwork for each app,
 * rasterized (canvas) into GIF frames with an adaptive palette so the real
 * colors survive. This is NOT a procedural icon generator — each app has its
 * own drawn SVG. The result is packed into the app's GIF and displayed as-is.
 *
 * Browser-only (needs canvas). Attaches to `GifOS.icons`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const S = 64;            // icon size (matches the desktop's default icon px)
  const FR = 4;            // animation frames — small, to keep App GIFs light
  const DELAY = 13;        // centiseconds per frame

  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, n | 0));
  const rgb = (a) => 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
  const dark = (a, d) => 'rgb(' + clamp(a[0] - d) + ',' + clamp(a[1] - d) + ',' + clamp(a[2] - d) + ')';

  // A rounded tile with a vertical accent gradient; `inner` is the symbol art.
  function tile(accent, inner) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>"
      + "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='" + rgb(accent) + "'/><stop offset='1' stop-color='" + dark(accent, 80) + "'/></linearGradient>"
      + "<linearGradient id='sh' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgba(255,255,255,.18)'/><stop offset='.5' stop-color='rgba(255,255,255,0)'/></linearGradient></defs>"
      + "<rect x='3' y='3' width='90' height='90' rx='22' fill='url(#g)'/>"
      + "<rect x='3' y='3' width='90' height='44' rx='22' fill='url(#sh)'/>"
      + inner + "</svg>";
  }
  const W = "#ffffff";

  // ---- per-app art: (accent) => [svg frame strings] -----------------------
  const ART = {
    notes: (a) => range(FR).map((f) => { const w = 8 + 26 * (f / (FR - 1));
      return tile(a, "<rect x='28' y='22' width='40' height='52' rx='5' fill='" + W + "'/>"
        + "<rect x='34' y='32' width='28' height='3' rx='1.5' fill='#c9c9e0'/>"
        + "<rect x='34' y='42' width='28' height='3' rx='1.5' fill='#c9c9e0'/>"
        + "<rect x='34' y='52' width='" + w + "' height='3' rx='1.5' fill='" + rgb(a) + "'/>"
        + "<g transform='translate(" + (34 + w) + ",53) rotate(40)'><rect x='-2' y='-18' width='4' height='16' rx='1' fill='#3a3a4a'/><path d='M-2 -2 L2 -2 L0 3 Z' fill='#3a3a4a'/></g>"); }),

    tictactoe: (a) => range(FR).map((f) => { const on = Math.floor(f / (FR / 2)) % 2;
      return tile(a, "<g stroke='" + W + "' stroke-width='4' stroke-linecap='round'>"
        + "<line x1='45' y1='24' x2='45' y2='72'/><line x1='63' y1='24' x2='63' y2='72'/>"
        + "<line x1='30' y1='40' x2='78' y2='40'/><line x1='30' y1='56' x2='78' y2='56'/></g>"
        + "<g transform='translate(37,32)' stroke='" + (on ? W : 'rgba(255,255,255,.35)') + "' stroke-width='4' stroke-linecap='round'><line x1='-5' y1='-5' x2='5' y2='5'/><line x1='5' y1='-5' x2='-5' y2='5'/></g>"
        + "<circle cx='70' cy='64' r='6' fill='none' stroke='" + (on ? 'rgba(255,255,255,.35)' : W) + "' stroke-width='4'/>"); }),

    connect4: (a) => range(FR).map((f) => { const y = 12 + (48) * (f / (FR - 1));
      const holes = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) holes.push("<circle cx='" + (34 + c * 14) + "' cy='" + (38 + r * 14) + "' r='5' fill='" + dark(a, 120) + "'/>");
      return tile(a, "<circle cx='34' cy='" + y + "' r='6' fill='#ff5c5c'/>"
        + "<rect x='24' y='30' width='48' height='44' rx='6' fill='rgba(20,20,40,.55)'/>" + holes.join('')); }),

    minesweeper: (a) => range(FR).map((f) => { const s = f % 2 ? 6 : 3, o = f % 2 ? 1 : .5;
      return tile(a, "<circle cx='46' cy='54' r='18' fill='#14141f'/><rect x='58' y='30' width='4' height='16' rx='2' transform='rotate(30 60 38)' fill='#14141f'/>"
        + "<circle cx='40' cy='48' r='4' fill='rgba(255,255,255,.5)'/>"
        + "<circle cx='66' cy='28' r='" + s + "' fill='#ffd23c' opacity='" + o + "'/>"
        + "<circle cx='66' cy='28' r='" + (s + 2) + "' fill='#ff8f3c' opacity='" + (o * .5) + "'/>"); }),

    chess: (a) => range(FR).map((f) => { const dy = Math.sin((f / FR) * 6.28) * 2;
      const checks = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) if ((r + c) % 2) checks.push("<rect x='" + (26 + c * 12) + "' y='" + (60 + r * 6) + "' width='12' height='6' fill='rgba(255,255,255,.25)'/>");
      return tile(a, "<g transform='translate(0," + dy + ")'>"
        + "<circle cx='48' cy='30' r='8' fill='" + W + "'/><path d='M41 40 h14 l4 20 h-22 Z' fill='" + W + "'/></g>"
        + "<rect x='26' y='60' width='44' height='12' rx='2' fill='" + W + "'/>" + checks.join('')); }),

    paint: (a) => range(FR).map((f) => { const dash = 40 - 40 * (f / (FR - 1));
      return tile(a, "<path d='M48 24 a24 20 0 1 0 4 40 c-6 0 -4 -8 2 -8 h8 a10 10 0 0 0 10 -12 a24 20 0 0 0 -24 -20 Z' fill='" + W + "'/>"
        + "<circle cx='40' cy='40' r='3.5' fill='#ff5c5c'/><circle cx='54' cy='36' r='3.5' fill='#5cc8ff'/><circle cx='60' cy='48' r='3.5' fill='#ffd23c'/><circle cx='42' cy='52' r='3.5' fill='#5cff7b'/>"
        + "<path d='M30 74 q14 -12 30 -22' stroke='#ff5caa' stroke-width='4' fill='none' stroke-linecap='round' stroke-dasharray='40' stroke-dashoffset='" + dash + "'/>"); }),

    calc: (a) => range(FR).map((f) => { const lit = f % FR;
      const btn = []; let i = 0; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) btn.push("<rect x='" + (32 + c * 12) + "' y='" + (50 + r * 11) + "' width='8' height='8' rx='2' fill='" + (i === lit % 9 ? rgb(a) : '#d5d5e5') + "'/>");
      return tile(a, "<rect x='28' y='22' width='40' height='52' rx='6' fill='#20202e'/>"
        + "<rect x='32' y='27' width='32' height='16' rx='3' fill='#5cff7b'/><rect x='36' y='33' width='16' height='4' rx='2' fill='#0a2a12'/>" + btn.join('')); }),

    timer: (a) => range(FR).map((f) => { const ang = (f / FR) * 360;
      return tile(a, "<circle cx='48' cy='52' r='22' fill='#20202e' stroke='" + W + "' stroke-width='3'/><rect x='44' y='20' width='8' height='6' rx='2' fill='" + W + "'/>"
        + "<line x1='48' y1='52' x2='48' y2='36' stroke='#ff5c5c' stroke-width='3' stroke-linecap='round' transform='rotate(" + ang + " 48 52)'/>"
        + "<circle cx='48' cy='52' r='3' fill='" + W + "'/>"); }),

    guestbook: (a) => range(FR).map((f) => { const dy = Math.abs(Math.sin((f / FR) * 6.28)) * 4;
      return tile(a, "<path d='M24 30 q24 -8 24 4 v34 q-24 -10 -24 -2 Z' fill='" + W + "'/><path d='M72 30 q-24 -8 -24 4 v34 q24 -10 24 -2 Z' fill='#e6e6f5'/>"
        + "<line x1='48' y1='34' x2='48' y2='68' stroke='" + dark(a, 40) + "' stroke-width='2'/>"
        + "<g transform='translate(60," + (28 + dy) + ") rotate(35)'><rect x='-1.5' y='-14' width='3' height='14' fill='#3a3a4a'/><path d='M-1.5 0 L1.5 0 L0 4 Z' fill='#3a3a4a'/></g>"); }),

    chat: (a) => range(FR).map((f) => { const d = (c) => (f % 3) === c ? W : 'rgba(255,255,255,.4)';
      return tile(a, "<path d='M26 28 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-20 l-8 8 v-8 a6 6 0 0 1 -4 -6 v-14 a6 6 0 0 1 6 -6 Z' fill='" + W + "'/>"
        + "<circle cx='36' cy='41' r='3' fill='" + d(0) + "'/><circle cx='45' cy='41' r='3' fill='" + d(1) + "'/><circle cx='54' cy='41' r='3' fill='" + d(2) + "'/>"
        + "<path d='M52 54 h16 a5 5 0 0 1 5 5 v10 a5 5 0 0 1 -5 5 h-3 v6 l-8 -6 h-5 a5 5 0 0 1 -5 -5 v-10 a5 5 0 0 1 5 -5 Z' fill='" + rgb(a) + "' stroke='" + W + "' stroke-width='2'/>"); }),

    welcome: (a) => range(FR).map((f) => { const lift = Math.abs(Math.sin((f / FR) * 6.28)) * 5;
      return tile(a, "<path d='M28 44 L48 34 L68 44 L48 54 Z' fill='#e6e6f5' transform='translate(0,-" + lift + ")'/>"
        + "<path d='M28 44 L48 54 L48 76 L28 66 Z' fill='" + W + "'/><path d='M68 44 L48 54 L48 76 L68 66 Z' fill='#d5d5e8'/>"
        + "<rect x='45' y='30' width='6' height='" + (10 + lift) + "' fill='rgba(255,255,255,.5)'/>"); }),
  };

  // ---- render SVG frames → animated GIF preview (adaptive palette) ----------
  function loadSvg(svg) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('svg load failed'));
      img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    });
  }

  function buildPalette(rgbFrames) {
    const key = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const counts = new Map();
    for (const data of rgbFrames) {
      for (let p = 0; p < data.length; p += 4) {
        let r = data[p], g = data[p + 1], b = data[p + 2];
        if (data[p + 3] < 128) { r = 10; g = 10; b = 15; } // transparent → tile-edge dark
        const k = key(r, g, b);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const top = Array.from(counts.keys()).sort((x, y) => counts.get(y) - counts.get(x)).slice(0, 256);
    const centers = top.map((k) => [(((k >> 10) & 31) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4]);
    const palette = new Array(256 * 3).fill(0);
    for (let i = 0; i < centers.length; i++) { palette[i * 3] = centers[i][0]; palette[i * 3 + 1] = centers[i][1]; palette[i * 3 + 2] = centers[i][2]; }
    const cache = new Map();
    const map = (r, g, b, a) => {
      if (a < 128) { r = 10; g = 10; b = 15; }
      const k = key(r, g, b);
      let idx = cache.get(k);
      if (idx === undefined) {
        let best = 0, bd = 1e12;
        for (let i = 0; i < centers.length; i++) { const dr = r - centers[i][0], dg = g - centers[i][1], db = b - centers[i][2]; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = i; } }
        idx = best; cache.set(k, idx);
      }
      return idx;
    };
    return { palette, map };
  }

  function renderFrames(svgFrames) {
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return Promise.all(svgFrames.map(loadSvg)).then((imgs) => {
      const rgbFrames = imgs.map((img) => { ctx.clearRect(0, 0, S, S); ctx.drawImage(img, 0, 0, S, S); return ctx.getImageData(0, 0, S, S).data; });
      const { palette, map } = buildPalette(rgbFrames);
      const frames = rgbFrames.map((data) => { const idx = new Uint8Array(S * S); for (let p = 0; p < S * S; p++) idx[p] = map(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], data[p * 4 + 3]); return idx; });
      return { width: S, height: S, palette, numColors: 256, minCodeSize: 8, frames, delayCs: DELAY };
    });
  }

  // Render an app's custom icon as an animated GIF preview. Falls back to a
  // lettered tile for unknown apps.
  function renderApp(appId, accent) {
    accent = accent || [123, 92, 255];
    const art = ART[appId];
    if (art) return renderFrames(art(accent));
    const letter = (appId || '?')[0].toUpperCase();
    const svg = tile(accent, "<text x='48' y='66' font-family='system-ui,sans-serif' font-size='46' font-weight='800' fill='#ffffff' text-anchor='middle'>" + letter + "</text>");
    return renderFrames([svg]);
  }

  GifOS.icons = { renderApp, renderFrames, has: (id) => !!ART[id] };
})(typeof window !== 'undefined' ? window : globalThis);
