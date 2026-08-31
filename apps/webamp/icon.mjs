// Procedural Webamp icon: the Winamp 2 main window playing, vis bars
// bouncing, time ticking. Cover is main + EQ + playlist mid-track.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const GRAY = [176, 176, 180];
const GRAY_D = [96, 96, 100];
const GRAY_L = [220, 220, 224];
const INK = [24, 24, 28];
const LCD = [0, 0, 0];
const GREEN = [0, 255, 70];
const GREEN_D = [0, 140, 40];
const YELLOW = [255, 220, 0];
const TITLE = [210, 210, 120];
const RED = [200, 40, 40];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inRound(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [GRAY, GRAY_D, GRAY_L, INK, LCD, GREEN, GREEN_D, YELLOW, TITLE, RED]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function barH(f, i, n) {
  const t = (f / FRAMES) * Math.PI * 2;
  const v = 0.35 + 0.55 * Math.abs(Math.sin(t * (1.1 + i * 0.17) + i * 0.7));
  const pulse = i === ((f * 3) % n) ? 0.25 : 0;
  return Math.min(1, v + pulse);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const put = (x, y, col, a) => {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = a == null ? 1 : a;
    }
  };
  const fill = (x0, y0, x1, y1, col) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, col);
  };
  const text = (x, y, str, s, col) => {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = GLYPHS[ch] || GLYPHS[' '];
      for (let row = 0; row < 7; row++) {
        for (let colb = 0; colb < 5; colb++) {
          if (g[row] & (1 << (4 - colb))) {
            for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + colb * s + dx, y + row * s + dy, col);
          }
        }
      }
      cx += 6 * s;
    }
  };

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inRound(x, y, 6, 18, 116, 92, 6)) continue;
      const o = (py * RW + px) * 4;
      const edge = inRound(x, y, 7.5, 19.5, 113, 89, 5) ? 0 : 1;
      const col = edge ? INK : GRAY;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  fill(10, 22, 118, 32, INK);
  text(14, 23, 'WINAMP', 1, TITLE);
  fill(108, 24, 114, 30, RED);
  fill(12, 36, 70, 64, LCD);
  const sec = (f * 2) % 60;
  const time = '1:' + String(20 + Math.floor(sec / 10)).padStart(2, '0');
  text(16, 42, time, 2, GREEN);
  fill(74, 36, 116, 64, LCD);
  for (let i = 0; i < 12; i++) {
    const h = barH(f, i, 12);
    const bh = Math.max(1, Math.round(h * 24));
    const x0 = 76 + i * 3;
    for (let k = 0; k < bh; k++) {
      const col = k > 18 ? RED : k > 12 ? YELLOW : GREEN;
      put(x0, 62 - k, col);
      put(x0 + 1, 62 - k, col);
    }
  }
  fill(12, 70, 116, 76, GRAY_D);
  const pos = 12 + Math.round((f / FRAMES) * 90);
  fill(12, 70, pos, 76, GREEN_D);
  fill(pos, 69, pos + 4, 77, GRAY_L);
  const btns = [18, 36, 54, 72, 90];
  btns.forEach((x, i) => {
    const on = i === 1;
    fill(x, 82, x + 14, 98, on ? GREEN_D : GRAY_D);
    fill(x + 1, 83, x + 13, 97, on ? GREEN : GRAY_L);
  });

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function webampIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
  };
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(tag, data) {
  const t = Buffer.from(tag);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

function bevel(put, x0, y0, x1, y1, fillCol) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, fillCol[0], fillCol[1], fillCol[2]);
  for (let x = x0; x <= x1; x++) {
    put(x, y0, 230, 230, 234);
    put(x, y1, 70, 70, 74);
  }
  for (let y = y0; y <= y1; y++) {
    put(x0, y, 230, 230, 234);
    put(x1, y, 70, 70, 74);
  }
}

function drawGlyph(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H;
      put(x, y, 18 + t * 8, 28 + t * 10, 38 + t * 12);
    }
  }

  const mainX = 70, mainY = 80, mW = 560, mH = 236;
  bevel(put, mainX, mainY, mainX + mW, mainY + mH, GRAY);
  for (let y = mainY + 4; y < mainY + 32; y++) {
    for (let x = mainX + 4; x < mainX + mW - 4; x++) put(x, y, 20, 22, 26);
  }
  drawGlyph(put, mainX + 16, mainY + 8, 'WINAMP', 3, 210, 210, 120);
  drawGlyph(put, mainX + 220, mainY + 12, 'AFTER HOURS - SODIUM LIGHT', 2, 180, 180, 100);
  for (let y = mainY + 44; y < mainY + 140; y++) {
    for (let x = mainX + 16; x < mainX + 250; x++) put(x, y, 0, 0, 0);
  }
  drawGlyph(put, mainX + 28, mainY + 70, '2:14', 6, 0, 255, 70);
  drawGlyph(put, mainX + 28, mainY + 118, '192 KBPS  44 KHZ', 2, 0, 160, 50);
  for (let y = mainY + 44; y < mainY + 140; y++) {
    for (let x = mainX + 266; x < mainX + mW - 16; x++) put(x, y, 0, 0, 0);
  }
  const heights = [0.4, 0.7, 0.95, 0.6, 0.85, 1, 0.55, 0.8, 0.35, 0.7, 0.5, 0.9, 0.45, 0.65, 0.3, 0.55, 0.75, 0.4];
  heights.forEach((h, i) => {
    const bh = Math.round(h * 84);
    const x0 = mainX + 274 + i * 14;
    for (let k = 0; k < bh; k++) {
      const col = k > 64 ? [200, 40, 40] : k > 48 ? [255, 220, 0] : [0, 255, 70];
      for (let dx = 0; dx < 10; dx++) put(x0 + dx, mainY + 136 - k, col[0], col[1], col[2]);
    }
  });
  for (let y = mainY + 152; y < mainY + 168; y++) {
    for (let x = mainX + 16; x < mainX + mW - 16; x++) put(x, y, 40, 44, 48);
  }
  for (let y = mainY + 152; y < mainY + 168; y++) {
    for (let x = mainX + 16; x < mainX + 16 + 310; x++) put(x, y, 0, 160, 50);
  }
  const labels = ['PREV', 'PLAY', 'PAUSE', 'STOP', 'NEXT'];
  labels.forEach((lab, i) => {
    const x0 = mainX + 20 + i * 86;
    const on = i === 1;
    bevel(put, x0, mainY + 180, x0 + 74, mainY + 220, on ? [40, 120, 50] : [150, 150, 154]);
    drawGlyph(put, x0 + 8, mainY + 192, lab, 2, on ? 0 : 24, on ? 0 : 24, on ? 0 : 28);
  });

  const eqX = 70, eqY = 340, eW = 560, eH = 300;
  bevel(put, eqX, eqY, eqX + eW, eqY + eH, GRAY);
  for (let y = eqY + 4; y < eqY + 28; y++) {
    for (let x = eqX + 4; x < eqX + eW - 4; x++) put(x, y, 20, 22, 26);
  }
  drawGlyph(put, eqX + 16, eqY + 8, 'EQUALIZER', 2, 210, 210, 120);
  const eq = [72, 64, 58, 50, 42, 48, 56, 68, 74, 70];
  eq.forEach((v, i) => {
    const x0 = eqX + 50 + i * 48;
    for (let y = eqY + 50; y < eqY + 250; y++) {
      for (let x = x0; x < x0 + 22; x++) put(x, y, 40, 44, 48);
    }
    const top = eqY + 250 - v * 2;
    for (let y = top; y < eqY + 250; y++) {
      for (let x = x0; x < x0 + 22; x++) put(x, y, 0, 180, 50);
    }
    for (let y = top - 8; y < top + 8; y++) {
      for (let x = x0 - 4; x < x0 + 26; x++) put(x, y, 220, 220, 224);
    }
  });

  const plX = 670, plY = 80, pW = 470, pH = 560;
  bevel(put, plX, plY, plX + pW, plY + pH, GRAY);
  for (let y = plY + 4; y < plY + 28; y++) {
    for (let x = plX + 4; x < plX + pW - 4; x++) put(x, y, 20, 22, 26);
  }
  drawGlyph(put, plX + 16, plY + 8, 'WINAMP PLAYLIST', 2, 210, 210, 120);
  for (let y = plY + 36; y < plY + pH - 16; y++) {
    for (let x = plX + 12; x < plX + pW - 12; x++) put(x, y, 0, 0, 0);
  }
  const songs = [
    '01.  DASHBOARD  -  NIGHT DRIVE',
    '02.  SIDE B  -  CASSETTE SKY',
    '03.  HANDSHAKE  -  MODEM HYMN',
    '04.  AFTER HOURS  -  SODIUM LIGHT',
    '05.  COLD OPEN  -  TEST PATTERN',
    '06.  LOW BATTERY  -  WALKMAN',
    '07.  GREEN LED  -  EQUALIZER',
    '08.  LAST SONG  -  END OF DISC',
  ];
  songs.forEach((s, i) => {
    const y = plY + 56 + i * 48;
    const cur = i === 3;
    if (cur) {
      for (let yy = y - 8; yy < y + 32; yy++) {
        for (let x = plX + 16; x < plX + pW - 16; x++) put(x, yy, 0, 0, 140);
      }
    }
    drawGlyph(put, plX + 28, y, s, 2, cur ? 255 : 0, cur ? 255 : 255, cur ? 255 : 70);
  });

  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
