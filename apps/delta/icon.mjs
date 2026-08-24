import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [8, 10, 28], CARD_B = [4, 6, 16];
const SHIP = [200, 210, 255], SHIPD = [120, 140, 200], ALIEN = [255, 90, 90];
const ALIEN2 = [255, 160, 80], ROCK = [140, 120, 100], ROCKD = [90, 70, 55];
const SPARK = [255, 255, 180], STAR = [80, 90, 140], HUD = [200, 210, 255];
const THRUST = [255, 180, 80];

function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo+r), hi-r), cy = Math.min(Math.max(y, lo+r), hi-r);
  if (x >= lo+r && x <= hi-r) return true;
  if (y >= lo+r && y <= hi-r) return true;
  return (x-cx)**2 + (y-cy)**2 <= r*r;
}
function buildPalette() {
  const pal = [[0,0,0]];
  for (const b of [CARD_A, CARD_B, SHIP, SHIPD, ALIEN, ALIEN2, ROCK, ROCKD, SPARK, STAR, THRUST, HUD, [255,255,255]]) {
    pal.push(b);
    pal.push(mix(b,[255,255,255],0.18).map(Math.round));
    pal.push(mix(b,[0,0,0],0.4).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi=1, bd=1e9;
  for (let i=1;i<pal.length;i++) {
    const p=pal[i], d=(p[0]-r)**2+(p[1]-g)**2+(p[2]-b)**2;
    if (d<bd){bd=d;bi=i;}
  }
  return bi;
}

function paintShip(put, x, y, thrust) {
  // nose-right fighter, ~22×12
  const body = [
    [0,4],[1,3],[2,2],[3,2],[4,1],[5,1],[6,1],[7,2],[8,2],[9,3],[10,3],[11,4],
    [12,4],[13,5],[14,5],[15,5],[16,5],[17,6],[18,6],
    [0,7],[1,8],[2,9],[3,9],[4,10],[5,10],[6,10],[7,9],[8,9],[9,8],[10,8],[11,7],
    [12,7],[13,6],[14,6],
  ];
  for (const [dx, dy] of body) put(x+dx, y+dy, SHIP[0], SHIP[1], SHIP[2]);
  put(x+4, y+5, SHIPD[0], SHIPD[1], SHIPD[2]);
  put(x+5, y+6, SHIPD[0], SHIPD[1], SHIPD[2]);
  put(x+6, y+5, SHIPD[0], SHIPD[1], SHIPD[2]);
  put(x+2, y+4, 80, 200, 255);
  put(x+2, y+7, 80, 200, 255);
  if (thrust) {
    put(x-1, y+5, THRUST[0], THRUST[1], THRUST[2]);
    put(x-2, y+6, SPARK[0], SPARK[1], SPARK[2]);
    put(x-1, y+6, THRUST[0], THRUST[1], THRUST[2]);
  }
}
function paintAlien(put, x, y, kind, t) {
  const c = kind ? ALIEN2 : ALIEN;
  const bob = ((t + x) & 1);
  const cy = y + bob;
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
    const mx = Math.abs(dx - 3.5), my = Math.abs(dy - 3.5);
    if (mx + my < 4.2 && !(dy === 2 && (dx === 2 || dx === 5))) {
      put(x+dx, cy+dy, c[0], c[1], c[2]);
    }
  }
  put(x+2, cy+3, 20, 10, 20);
  put(x+5, cy+3, 20, 10, 20);
}
function paintRock(put, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const nx = dx / w - 0.5, ny = dy / h - 0.5;
    if (nx*nx*2.2 + ny*ny < 0.22) {
      const shade = (dx + dy) % 7 === 0 ? ROCKD : ROCK;
      put(x+dx, y+dy, shade[0], shade[1], shade[2]);
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW*RW*4);
  const putPx = (x, y, r, g, b) => {
    x = x|0; y = y|0;
    if (x<0||y<0||x>=OUT||y>=OUT) return;
    for (let sy=0;sy<SS;sy++) for (let sx=0;sx<SS;sx++) {
      const o=(((y*SS+sy)*RW)+(x*SS+sx))*4;
      rgba[o]=r; rgba[o+1]=g; rgba[o+2]=b; rgba[o+3]=1;
    }
  };
  const t = f / FRAMES;
  const shot = 42 + t * 62;
  for (let y=0; y<OUT; y++) for (let x=0; x<OUT; x++) {
    if (!inCard(x,y,6,20)) continue;
    let col = mix(CARD_A, CARD_B, (y-6)/116);
    const star = ((x * 13 + y * 7 + f * 3) % 47);
    if (star === 0) col = STAR;
    if (((x + f * 2) % 29) === 3 && (y % 11) === 2) col = mix(STAR, SPARK, 0.3);
    putPx(x, y, col[0], col[1], col[2]);
  }
  paintRock(putPx, 68, 92, 40, 22);
  paintShip(putPx, 18, 58, f % 2 === 0);
  for (let i = 0; i < 12; i++) {
    const sx = shot - i * 1.4;
    if (sx > 38 && sx < 118) putPx(sx, 64, SPARK[0], SPARK[1], SPARK[2] - i * 4);
  }
  const form = [
    [92, 36, 0], [104, 46, 1], [116, 36, 0],
    [98, 58, 1], [110, 68, 0],
  ];
  for (const [ax, ay, k] of form) {
    const ox = ax - t * 6;
    paintAlien(putPx, ox, ay, k, f);
  }
  if (t > 0.7) {
    putPx(110, 48, SPARK[0], SPARK[1], SPARK[2]);
    putPx(111, 49, THRUST[0], THRUST[1], THRUST[2]);
    putPx(109, 47, 255, 255, 255);
  }
  const idx = new Uint8Array(OUT*OUT);
  for (let y=0;y<OUT;y++) for (let x=0;x<OUT;x++) {
    let r=0,g=0,b=0,a=0,n=SS*SS;
    for (let sy=0;sy<SS;sy++) for (let sx=0;sx<SS;sx++) {
      const o=(((y*SS+sy)*RW)+(x*SS+sx))*4;
      r+=rgba[o]; g+=rgba[o+1]; b+=rgba[o+2]; a+=rgba[o+3];
    }
    idx[y*OUT+x] = a/n<0.5 ? 0 : nearest(pal, r/n, g/n, b/n);
  }
  return idx;
}
export function deltaIcon() {
  const pal = buildPalette(), frames=[];
  for (let f=0;f<FRAMES;f++) frames.push(frameIndices(pal,f));
  const CT=64, flat=new Array(CT*3).fill(0);
  for (let i=0;i<pal.length&&i<CT;i++){ flat[i*3]=pal[i][0]|0; flat[i*3+1]=pal[i][1]|0; flat[i*3+2]=pal[i][2]|0; }
  return { width:OUT, height:OUT, palette:flat, numColors:CT, minCodeSize:6, frames, delayCs:8, transparentIndex:0 };
}
function crc(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xedb88320&-(c&1)); } return (~c)>>>0; }
function pngChunk(tag, data){
  const t=Buffer.from(tag), len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body=Buffer.concat([t,data]), c=Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  ' ': [0,0,0,0,0,0,0],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
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
  const W=1200, H=720, rgba=Buffer.alloc(W*H*4,0);
  const put=(x,y,r,g,b)=>{ x=x|0;y=y|0; if(x<0||y<0||x>=W||y>=H)return; const o=(y*W+x)*4; rgba[o]=r;rgba[o+1]=g;rgba[o+2]=b;rgba[o+3]=255; };
  const fill=(x0,y0,x1,y1,r,g,b)=>{ x0=Math.max(0,x0|0);y0=Math.max(0,y0|0);x1=Math.min(W,x1|0);y1=Math.min(H,y1|0); for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) put(x,y,r,g,b); };
  fill(0,0,W,H,5,6,16);
  for (let i=0;i<220;i++) {
    const x = (i*97)%W, y = (i*53)%H;
    const b = 70 + (i%5)*18;
    put(x, y, b, b+10, b+40);
  }
  for (let i=0;i<40;i++) {
    const x = (i*173)%W, y = (i*91)%H;
    fill(x, y, x+2, y+2, 180, 190, 220);
  }
  // HUD
  drawText(put, 24, 18, 'LIVES', 3, 128, 128, 128);
  fill(140, 18, 188, 42, 200, 210, 255);
  fill(198, 18, 246, 42, 200, 210, 255);
  fill(256, 18, 304, 42, 200, 210, 255);
  drawText(put, 860, 18, 'SCORE', 3, 128, 128, 128);
  drawText(put, 1020, 18, '08420', 3, 200, 210, 255);
  drawText(put, 1020, 48, 'BEST  12000', 2, 128, 128, 176);

  // rock
  for (let y=0;y<90;y++) for (let x=0;x<220;x++) {
    const nx = x/220-0.5, ny = y/90-0.5;
    if (nx*nx*1.8 + ny*ny < 0.22) {
      const shade = (x+y)%9===0 ? ROCKD : ROCK;
      put(640+x, 520+y, shade[0], shade[1], shade[2]);
    }
  }

  // ship
  const sx=110, sy=330;
  for (let i=0;i<56;i++) {
    const t = i/56;
    const y0 = sy + (0.5-t)*28;
    const nose = 18 + t*70;
    fill(sx, y0|0, sx+nose, (y0+2)|0, SHIP[0], SHIP[1], SHIP[2]);
  }
  fill(sx-18, sy+10, sx, sy+18, THRUST[0], THRUST[1], THRUST[2]);
  fill(sx-28, sy+12, sx-10, sy+16, SPARK[0], SPARK[1], SPARK[2]);
  fill(sx+8, sy+8, sx+18, sy+20, 80, 200, 255);

  // laser
  fill(200, 342, 620, 350, SPARK[0], SPARK[1], SPARK[2]);
  fill(620, 340, 640, 352, 255, 255, 255);

  // aliens in a delta / loop
  const aliens = [
    [720, 160], [780, 210], [840, 160], [900, 210], [960, 160],
    [750, 280], [820, 320], [890, 280],
    [700, 400], [770, 430],
  ];
  aliens.forEach(([ax, ay], i) => {
    const c = i % 2 ? ALIEN2 : ALIEN;
    for (let y=0;y<34;y++) for (let x=0;x<34;x++) {
      const dx = (x-17)/17, dy = (y-17)/17;
      if (dx*dx + dy*dy < 0.92) put(ax+x, ay+y, c[0], c[1], c[2]);
    }
    fill(ax+10, ay+12, ax+14, ay+16, 20, 8, 24);
    fill(ax+20, ay+12, ax+24, ay+16, 20, 8, 24);
  });
  // explosion on one
  fill(888, 200, 920, 232, 255, 255, 180);
  fill(896, 208, 912, 224, 255, 140, 60);

  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){ raw[y*(W*4+1)]=0; rgba.copy(raw, y*(W*4+1)+1, y*W*4, (y+1)*W*4); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw,{level:9})), pngChunk('IEND', Buffer.alloc(0))]);
}
