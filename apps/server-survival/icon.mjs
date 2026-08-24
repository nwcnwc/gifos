// Procedural Server Survival icon: a rack of servers taking a traffic spike.
// Unique cover — not a heatmap. 128 animated icon + 1200×720 screenshotPng.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [10, 14, 18], CARD_D = [6, 8, 12];
const RACK = [18, 28, 32], RACK_D = [12, 18, 22];
const TEAL = [0, 255, 133], TEAL_D = [0, 160, 90];
const BLUE = [59, 130, 246], ORANGE = [249, 115, 22];
const YELLOW = [250, 204, 21], CYAN = [34, 211, 238];
const RED = [239, 68, 68], PURPLE = [168, 85, 247];
const FUCHSIA = [232, 121, 249], INK = [226, 232, 240];
const FLOOR = [15, 23, 42];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, RACK, RACK_D, TEAL, TEAL_D, BLUE, ORANGE, YELLOW, CYAN, RED, PURPLE, FUCHSIA, INK, FLOOR]) {
    for (let s = 0; s <= 2; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function inRR(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

const PKT = [TEAL, BLUE, ORANGE, YELLOW, CYAN, FUCHSIA, RED];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const m = 8, rad = 18;
  const spike = Math.max(0, Math.sin(t * Math.PI * 2));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
    if (y > 104) col = mix(FLOOR, CARD, (y - 104) / 16);

    // Floor grid
    if (y > 100 && ((x | 0) % 10 === 0 || (y | 0) % 6 === 0)) col = mix(col, TEAL_D, 0.25);

    // Three server racks, isometric-ish slabs
    const racks = [
      { x0: 70, y0: 36, w: 18, h: 62, shade: 0 },
      { x0: 86, y0: 42, w: 18, h: 58, shade: 0.15 },
      { x0: 102, y0: 48, w: 16, h: 52, shade: 0.3 }
    ];
    for (let ri = 0; ri < racks.length; ri++) {
      const rk = racks[ri];
      if (x >= rk.x0 && x <= rk.x0 + rk.w && y >= rk.y0 && y <= rk.y0 + rk.h) {
        col = mix(RACK, RACK_D, rk.shade + (x - rk.x0) / rk.w * 0.3);
        const row = ((y - rk.y0) / 5) | 0;
        const ledY = rk.y0 + row * 5 + 2;
        const ledX = rk.x0 + 4 + (row % 3) * 4;
        const blink = ((row + f + ri) % 4) === 0;
        if (Math.abs(y - ledY) < 1.1 && Math.abs(x - ledX) < 1.4) {
          col = blink ? TEAL : TEAL_D;
        }
        if (y < rk.y0 + 3) col = mix(col, INK, 0.15);
      }
    }

    // Firewall slab (purple) in front of the first rack
    if (inRR(x, y, 62, 44, 70, 98, 2)) {
      col = mix(PURPLE, [80, 40, 120], (y - 44) / 54);
      if (((x + y + f) | 0) % 7 === 0) col = mix(col, INK, 0.35);
    }

    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }

  // Packets streaming left → racks. A red spike swells mid-loop then dies on the wall.
  const nPkt = 28 + Math.round(spike * 22);
  for (let i = 0; i < nPkt; i++) {
    const kind = i === 0 || (i % 7 === 0 && spike > 0.45) ? 6 : i % 6;
    const speed = 0.55 + (i % 5) * 0.08;
    const along = ((t * speed + i * 0.037) % 1);
    const px = 14 + along * 52;
    const py = 48 + (i % 9) * 5.2 + Math.sin(t * 6 + i) * 1.5;
    const col = PKT[kind];
    const radP = kind === 6 ? 2.2 + spike * 1.4 : 1.6;
    if (kind === 6 && along > 0.82) continue; // eaten by the firewall
    for (let sy = -2; sy <= 2; sy++) for (let sx = -2; sx <= 2; sx++) {
      const x = px + sx, y = py + sy;
      if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
      if (!inCard(x, y, m, rad)) continue;
      if (sx * sx + sy * sy > radP * radP) continue;
      for (let qy = 0; qy < SS; qy++) for (let qx = 0; qx < SS; qx++) {
        const o = ((((y | 0) * SS + qy) * RW) + ((x | 0) * SS + qx)) * 4;
        rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
      }
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nn = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nn < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nn, g / nn, b / nn);
  }
  return idx;
}

export function serverSurvivalIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '%': [0b10001, 0b10010, 0b00100, 0b00100, 0b01000, 0b10001, 0b10001],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110]
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 8, 12, 16);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x % 48 === 0 || y % 36 === 0) && y > 140) put(x, y, 15, 28, 36);
  }
  drawText(put, 48, 28, 'SERVER SURVIVAL', 6, 0, 255, 133);
  drawText(put, 48, 84, 'NO SERVER. FILE IS THE SAVE.', 3, 250, 204, 21);
  drawText(put, 48, 118, 'BUILD INFRA. SURVIVE TRAFFIC.', 3, 148, 163, 184);
  drawText(put, 48, 154, 'BUDGET $500', 3, 74, 222, 128);
  drawText(put, 320, 154, 'REPUTATION 100%', 3, 250, 204, 21);
  drawText(put, 620, 154, 'LOAD 12.4 RPS', 3, 96, 165, 250);

  // HUD panel
  fill(40, 200, 380, 680, 15, 23, 42);
  drawText(put, 56, 210, 'FRONT DOOR', 2, 34, 211, 238);
  drawText(put, 56, 250, 'GEODNS   FIREWALL', 2, 226, 232, 240);
  drawText(put, 56, 280, 'CDN      API GW', 2, 226, 232, 240);
  drawText(put, 56, 330, 'COMPUTE', 2, 0, 255, 133);
  drawText(put, 56, 360, 'FLEET    GPU', 2, 226, 232, 240);
  drawText(put, 56, 410, 'DATA', 2, 249, 115, 22);
  drawText(put, 56, 440, 'SQL      CACHE', 2, 226, 232, 240);
  drawText(put, 56, 490, 'TRAFFIC', 2, 239, 68, 68);
  const legend = [
    [TEAL, 'STATIC'], [BLUE, 'READ'], [ORANGE, 'WRITE'],
    [YELLOW, 'UPLOAD'], [CYAN, 'SEARCH'], [FUCHSIA, 'AI'], [RED, 'DDOS']
  ];
  legend.forEach((row, i) => {
    const y = 530 + i * 20;
    fill(56, y, 72, y + 12, row[0][0], row[0][1], row[0][2]);
    drawText(put, 84, y, row[1], 2, row[0][0], row[0][1], row[0][2]);
  });

  // Racks on the right
  function rack(x0, y0, w, h, ledShift) {
    fill(x0, y0, x0 + w, y0 + h, 18, 28, 32);
    fill(x0, y0, x0 + w, y0 + 10, 0, 160, 90);
    for (let row = 0; row < 14; row++) {
      const y = y0 + 18 + row * 18;
      fill(x0 + 8, y, x0 + w - 8, y + 12, 12, 18, 22);
      for (let k = 0; k < 6; k++) {
        const on = ((row + k + ledShift) % 3) === 0;
        const c = on ? TEAL : TEAL_D;
        fill(x0 + 14 + k * 18, y + 3, x0 + 22 + k * 18, y + 9, c[0], c[1], c[2]);
      }
    }
  }
  rack(460, 200, 140, 460, 0);
  rack(640, 230, 140, 430, 1);
  rack(820, 260, 130, 400, 2);

  // Firewall
  fill(420, 280, 448, 620, 168, 85, 247);
  drawText(put, 400, 640, 'FW', 2, 196, 181, 253);

  // Incoming packets
  for (let i = 0; i < 80; i++) {
    const kind = i % 7;
    const c = PKT[kind];
    const x = 400 - (i * 11) % 340;
    const y = 300 + (i % 11) * 24 + (i * 7) % 13;
    fill(x, y, x + 10, y + 8, c[0], c[1], c[2]);
  }

  drawText(put, 460, 680, 'UNOFFICIAL PORT OF PSHENOK / SERVER SURVIVAL', 2, 100, 116, 139);

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
