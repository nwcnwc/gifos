// Themes and the frame renderer. Port of gen/soundout.py's THEMES + frame
// HTML, drawn to a canvas instead of a DOM page: one renderer serves both the
// live player and the video exporter, so what is exported is exactly what
// played. The auto-fit is the same idea as the original's __refit - binary
// search the largest size that actually fits, measured by the engine that is
// actually rendering - with the same hard rule: a word must NEVER break
// mid-word.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // Visual treatment. These are the variables the family gives feedback on.
  const THEMES = {
    // Deep navy, warm cream text. Easy on the eyes for long loops in a dim room.
    night: { name: 'night', bg: '#0d1b2a', fg: '#f8f4e9', highlight: '#ffd166', dim: '#5c6b7a', weight: 700 },
    // Warm off-white, like a book page. Closest to print he'll meet elsewhere.
    paper: { name: 'paper', bg: '#fdfaf3', fg: '#2b2b2b', highlight: '#d62828', dim: '#b8b2a7', weight: 700 },
    // Maximum contrast. The accessibility-safe default.
    contrast: { name: 'contrast', bg: '#000000', fg: '#ffffff', highlight: '#4cc9f0', dim: '#4a4a4a', weight: 700 },
  };

  // The frame is always composed at TV resolution and scaled to whatever is
  // showing it, so the export and the screen agree.
  const W = 1920, H = 1080;
  // 5% TV safe area - older sets overscan and would clip the edges.
  const SAFE = { x: 96, y: 54, w: 1728, h: 972 };
  const LINE_HEIGHT = 1.15;
  const LETTER_SPACING = 0.04; // em
  const MAX_PX = 560, MIN_PX = 16;

  const fontFor = (weight, px) => `${weight} ${px}px Andika, sans-serif`;

  // Break a segment's parts into drawable tokens. A part's own text may
  // contain spaces (a whole sentence is one part) - those are legal break
  // points, exactly as the DOM's white-space:normal treated them. A break may
  // only ever happen AT a space token.
  function tokenize(parts) {
    const tokens = [];
    for (const [text, hl] of parts) {
      for (const piece of String(text).split(/( +)/)) {
        if (!piece) continue;
        tokens.push({ text: piece, hl, isSpace: /^ +$/.test(piece) });
      }
    }
    return tokens;
  }

  function measure(ctx, tokens, px, weight) {
    ctx.font = fontFor(weight, px);
    try { ctx.letterSpacing = (LETTER_SPACING * px).toFixed(2) + 'px'; } catch (e) { /* older engines */ }
    return tokens.map((t) => ctx.measureText(t.text).width);
  }

  // Greedy wrap at spaces. Returns lines of {tokens, width}, or null when a
  // non-space token alone exceeds the width (the size cannot fit).
  function wrap(tokens, widths, maxWidth, allowWrap) {
    const lines = [];
    let line = [], lineW = 0;
    const push = () => {
      // trailing spaces do not count against the line
      while (line.length && line[line.length - 1].t.isSpace) { lineW -= line.pop().w; }
      if (line.length) lines.push({ tokens: line, width: lineW });
      line = []; lineW = 0;
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i], w = widths[i];
      if (t.isSpace && !line.length) continue; // no leading spaces
      if (!t.isSpace && w > maxWidth) return null;
      if (allowWrap && !t.isSpace && lineW + w > maxWidth && line.length) push();
      line.push({ t, w });
      lineW += w;
    }
    push();
    if (!allowWrap && (lines.length > 1 || (lines[0] && lines[0].width > maxWidth))) return null;
    return lines.length ? lines : [{ tokens: [], width: 0 }];
  }

  // The largest font size that fits the safe area. Multi-word text may wrap
  // between words; a single word never may ("Chas / e" is worse than useless
  // to a child learning word shapes).
  function fit(ctx, seg, weight) {
    const tokens = tokenize(seg.parts);
    const fullText = seg.parts.map(([t]) => t).join('');
    const allowWrap = /\s/.test(fullText.trim());
    let lo = MIN_PX, hi = MAX_PX;
    const fitsAt = (px) => {
      const widths = measure(ctx, tokens, px, weight);
      const lines = wrap(tokens, widths, SAFE.w, allowWrap);
      if (!lines) return null;
      if (lines.length * px * LINE_HEIGHT > SAFE.h) return null;
      return lines;
    };
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (fitsAt(m)) lo = m; else hi = m;
    }
    const px = Math.max(MIN_PX, Math.floor(lo * (seg.scale || 1)));
    const widths = measure(ctx, tokens, px, weight);
    let lines = wrap(tokens, widths, SAFE.w, allowWrap);
    if (!lines) { // scale>1 could overflow; fall back to the fitted size
      const w2 = measure(ctx, tokens, lo, weight);
      lines = wrap(tokens, w2, SAFE.w, allowWrap) || [{ tokens: [], width: 0 }];
      return { px: lo, lines };
    }
    return { px, lines };
  }

  // Draw one visual state. `colors` is the word list's per-word colour map
  // (Paw Patrol kit colours), applied to a whole shown word exactly as the
  // original theme.word_colors was.
  function drawFrame(ctx, seg, theme, colors) {
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    const anyHl = seg.parts.some(([, on]) => on);
    const fullText = seg.parts.map(([t]) => t).join('').trim();
    const baseColor = seg.color || (colors && colors[fullText]) || theme.fg;

    const { px, lines } = fit(ctx, seg, theme.weight);
    ctx.font = fontFor(theme.weight, px);
    try { ctx.letterSpacing = (LETTER_SPACING * px).toFixed(2) + 'px'; } catch (e) { /* older engines */ }
    ctx.textBaseline = 'middle';

    const lineH = px * LINE_HEIGHT;
    const totalH = lines.length * lineH;
    let y = SAFE.y + (SAFE.h - totalH) / 2 + lineH / 2;
    for (const line of lines) {
      let x = SAFE.x + (SAFE.w - line.width) / 2;
      for (const { t, w } of line.tokens) {
        if (!t.isSpace) {
          ctx.fillStyle = t.hl ? theme.highlight : (anyHl ? theme.dim : baseColor);
          ctx.fillText(t.text, x, y);
        }
        x += w;
      }
      y += lineH;
    }
    ctx.restore();
  }

  SIO.frames = { THEMES, W, H, SAFE, drawFrame, fit, tokenize };
})();
