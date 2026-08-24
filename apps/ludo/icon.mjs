import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [20, 32, 24], PATH = [232, 224, 208];
const RED = [196, 40, 48], GREEN = [42, 138, 74], YEL = [224, 176, 36], BLUE = [42, 90, 168];
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
  for (const b of [CARD, PATH, RED, GREEN, YEL, BLUE, [255,255,255], [16,16,16]]) {
    pal.push(b); pal.push(mix(b,[255,255,255],0.2).map(Math.round)); pal.push(mix(b,[0,0,0],0.3).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi=1, bd=1e9;
  for (let i=1;i<pal.length;i++) { const p=pal[i], d=(p[0]-r)**2+(p[1]-g)**2+(p[2]-b)**2; if (d<bd){bd=d;bi=i;} }
  return bi;
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW*RW*4);
  const t = f / FRAMES;
  const tok = 18 + Math.sin(t * Math.PI * 2) * 10;
  for (let py=0; py<RW; py++) for (let px=0; px<RW; px++) {
    const x=px/SS, y=py/SS;
    if (!inCard(x,y,6,14)) continue;
    let col = CARD;
    const s = (OUT-24)/15, ox=12, oy=12;
    const c = Math.floor((x-ox)/s), r = Math.floor((y-oy)/s);
    if (c>=0&&c<15&&r>=0&&r<15) {
      col = PATH;
      if (r>=9&&r<=14&&c>=0&&c<=5) col = RED;
      else if (r>=0&&r<=5&&c>=0&&c<=5) col = GREEN;
      else if (r>=0&&r<=5&&c>=9&&c<=14) col = YEL;
      else if (r>=9&&r<=14&&c>=9&&c<=14) col = BLUE;
      else if (r>=6&&r<=8&&c>=6&&c<=8) col = mix(CARD, PATH, 0.3);
    }
    const o=(py*RW+px)*4; rgba[o]=col[0]; rgba[o+1]=col[1]; rgba[o+2]=col[2]; rgba[o+3]=1;
  }
  function blob(cx, cy, rad, col) {
    for (let py=0; py<RW; py++) for (let px=0; px<RW; px++) {
      const x=px/SS, y=py/SS;
      if ((x-cx)**2+(y-cy)**2 < rad*rad && rgba[(py*RW+px)*4+3]) {
        const o=(py*RW+px)*4; rgba[o]=col[0]; rgba[o+1]=col[1]; rgba[o+2]=col[2];
      }
    }
  }
  blob(36, 96, 6, [255,255,255]); blob(36+tok*0.05, 96-tok, 6, RED);
  blob(36, 36, 6, GREEN); blob(96, 36, 6, YEL); blob(96, 96, 6, BLUE);
  const idx = new Uint8Array(OUT*OUT);
  for (let y=0;y<OUT;y++) for (let x=0;x<OUT;x++) {
    let r=0,g=0,b=0,a=0,n=SS*SS;
    for (let sy=0;sy<SS;sy++) for (let sx=0;sx<SS;sx++) {
      const o=(((y*SS+sy)*RW)+(x*SS+sx))*4; r+=rgba[o]; g+=rgba[o+1]; b+=rgba[o+2]; a+=rgba[o+3];
    }
    idx[y*OUT+x] = a/n<0.5 ? 0 : nearest(pal, r/n, g/n, b/n);
  }
  return idx;
}
export function ludoIcon() {
  const pal = buildPalette(), frames = [];
  for (let f=0;f<FRAMES;f++) frames.push(frameIndices(pal,f));
  const CT=64, flat=new Array(CT*3).fill(0);
  for (let i=0;i<pal.length&&i<CT;i++) { flat[i*3]=pal[i][0]|0; flat[i*3+1]=pal[i][1]|0; flat[i*3+2]=pal[i][2]|0; }
  return { width:OUT, height:OUT, palette:flat, numColors:CT, minCodeSize:6, frames, delayCs:10, transparentIndex:0 };
}
function crc(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xedb88320&-(c&1)); } return (~c)>>>0; }
function pngChunk(tag,data){ const t=Buffer.from(tag),len=Buffer.alloc(4); len.writeUInt32BE(data.length); const body=Buffer.concat([t,data]),c=Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len,body,c]); }
const GLYPHS={
  A:[14,17,17,31,17,17,17],D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],
  F:[31,16,16,30,16,16,16],I:[31,4,4,4,4,4,31],L:[16,16,16,16,16,16,31],
  N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],R:[30,17,17,30,20,18,17],
  S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],
  V:[17,17,17,17,17,10,4],Y:[17,17,10,4,4,4,4],' ':[0,0,0,0,0,0,0],
};
function drawText(put,x,y,str,s,r,g,b){
  let cx=x; for(const ch of str.toUpperCase()){ const gph=GLYPHS[ch]; if(!gph){cx+=6*s;continue;}
    for(let row=0;row<7;row++) for(let col=0;col<5;col++) if(gph[row]&(1<<(4-col)))
      for(let dy=0;dy<s;dy++) for(let dx=0;dx<s;dx++) put(cx+col*s+dx,y+row*s+dy,r,g,b);
    cx+=6*s; }
}
export function screenshotPng(){
  const W=1200,H=720,rgba=Buffer.alloc(W*H*4,0);
  const put=(x,y,r,g,b)=>{x=x|0;y=y|0;if(x<0||y<0||x>=W||y>=H)return; const o=(y*W+x)*4; rgba[o]=r;rgba[o+1]=g;rgba[o+2]=b;rgba[o+3]=255;};
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) put(x,y,20,32,24);
  const S=36, ox=60, oy=80;
  for(let r=0;r<15;r++) for(let c=0;c<15;c++){
    let col=[232,224,208];
    if(r>=9&&r<=14&&c>=0&&c<=5) col=RED;
    else if(r>=0&&r<=5&&c>=0&&c<=5) col=GREEN;
    else if(r>=0&&r<=5&&c>=9&&c<=14) col=YEL;
    else if(r>=9&&r<=14&&c>=9&&c<=14) col=BLUE;
    else if(r>=6&&r<=8&&c>=6&&c<=8) col=[40,50,42];
    for(let y=0;y<S-2;y++) for(let x=0;x<S-2;x++) put(ox+c*S+x, oy+r*S+y, col[0],col[1],col[2]);
  }
  function tok(cx,cy,col){ for(let y=-10;y<=10;y++) for(let x=-10;x<=10;x++) if(x*x+y*y<=100) put(cx+x,cy+y,col[0],col[1],col[2]); }
  tok(ox+2*S+18, oy+11*S+18, [255,240,240]);
  tok(ox+2*S+18, oy+8*S+18, RED);
  tok(ox+2*S+18, oy+2*S+18, GREEN);
  tok(ox+11*S+18, oy+2*S+18, YEL);
  tok(ox+11*S+18, oy+11*S+18, BLUE);
  drawText(put, 640, 140, 'LUDO', 12, 244, 238, 228);
  drawText(put, 640, 280, 'FOUR SEATS', 5, 184, 196, 176);
  drawText(put, 640, 360, 'ONE INVITE', 5, 184, 196, 176);
  drawText(put, 640, 440, 'NO LOBBY', 5, 184, 196, 176);
  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){ raw[y*(W*4+1)]=0; rgba.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR',ihdr), pngChunk('IDAT', deflateSync(raw,{level:9})), pngChunk('IEND', Buffer.alloc(0))]);
}
