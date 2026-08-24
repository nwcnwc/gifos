import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [8, 18, 20], CARD_B = [4, 8, 12], CYAN = [0, 200, 220], RED = [220, 50, 50], TRAIL = [180, 255, 255], INK = [230, 255, 255];
function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function inCard(x,y,m,r){const lo=m,hi=OUT-m;if(x<lo||x>hi||y<lo||y>hi)return false;const cx=Math.min(Math.max(x,lo+r),hi-r),cy=Math.min(Math.max(y,lo+r),hi-r);if(x>=lo+r&&x<=hi-r)return true;if(y>=lo+r&&y<=hi-r)return true;return (x-cx)**2+(y-cy)**2<=r*r;}
function buildPalette(){const pal=[[0,0,0]];for(const b of [CARD_A,CARD_B,CYAN,RED,TRAIL,INK]){for(let s=0;s<=4;s++)pal.push(mix(b,[255,255,255],s*0.1).map(Math.round));pal.push(mix(b,[0,0,0],0.4).map(Math.round));}return pal;}
function nearest(pal,r,g,b){let bi=1,bd=1e9;for(let i=1;i<pal.length;i++){const p=pal[i],d=(p[0]-r)**2+(p[1]-g)**2+(p[2]-b)**2;if(d<bd){bd=d;bi=i;}}return bi;}
function frameIndices(pal,f){
  const rgba=new Float32Array(RW*RW*4), t=f/FRAMES, cx=64, cy=72;
  const loopR=26+Math.sin(t*Math.PI*2)*1.5;
  const hx=cx+loopR*Math.cos(t*Math.PI*2-0.4), hy=cy+loopR*Math.sin(t*Math.PI*2-0.4);
  for(let py=0;py<RW;py++)for(let px=0;px<RW;px++){
    const x=px/SS,y=py/SS; if(!inCard(x,y,6,20)) continue;
    let col=mix(CARD_A,CARD_B,(y-6)/116);
    const d=Math.hypot(x-cx,y-cy);
    if (d<loopR-1.2) col=mix(col,[0,80,90],0.35);
    if (Math.abs(d-loopR)<2.4) col=TRAIL;
    if (Math.hypot(x-cx, y-(cy-6))<7) col=CYAN;
    if (t>0.5 && Math.hypot(x-cx, y-(cy-6))<9) col=mix(CYAN,[180,255,90], (t-0.5)/0.5);
    if (Math.hypot(x-(cx+8), y-(cy+6))<5) col=CYAN;
    if (Math.hypot(x-94, y-38)<6) col=RED;
    if (Math.hypot(x-hx, y-hy)<5.5) col=INK;
    const o=(py*RW+px)*4; rgba[o]=col[0];rgba[o+1]=col[1];rgba[o+2]=col[2];rgba[o+3]=1;
  }
  const idx=new Uint8Array(OUT*OUT);
  for(let y=0;y<OUT;y++)for(let x=0;x<OUT;x++){
    let r=0,g=0,b=0,a=0,n=SS*SS;
    for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){const o=(((y*SS+sy)*RW)+(x*SS+sx))*4;r+=rgba[o];g+=rgba[o+1];b+=rgba[o+2];a+=rgba[o+3];}
    idx[y*OUT+x]=a/n<0.5?0:nearest(pal,r/n,g/n,b/n);
  }
  return idx;
}
export function coilIcon(){
  const pal=buildPalette(), frames=[]; for(let f=0;f<FRAMES;f++) frames.push(frameIndices(pal,f));
  const CT=64, flat=new Array(CT*3).fill(0);
  for(let i=0;i<pal.length&&i<CT;i++){flat[i*3]=pal[i][0]|0;flat[i*3+1]=pal[i][1]|0;flat[i*3+2]=pal[i][2]|0;}
  return {width:OUT,height:OUT,palette:flat,numColors:CT,minCodeSize:6,frames,delayCs:10,transparentIndex:0};
}
function crc(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return (~c)>>>0;}
function pngChunk(tag,data){const t=Buffer.from(tag),len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([t,data]),c=Buffer.alloc(4);c.writeUInt32BE(crc(body));return Buffer.concat([len,body,c]);}

function disc(put, cx, cy, r, col, edge) {
  const r2 = r * r;
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= r2) {
        const glow = edge && d2 > (r - 2) * (r - 2);
        put(x, y, glow ? 240 : col[0], glow ? 255 : col[1], glow ? 255 : col[2]);
      }
    }
  }
}

export function screenshotPng(){
  const W=1200,H=720,rgba=Buffer.alloc(W*H*4,0);
  const put=(x,y,r,g,b)=>{x=x|0;y=y|0;if(x<0||y<0||x>=W||y>=H)return;const o=(y*W+x)*4;rgba[o]=r;rgba[o+1]=g;rgba[o+2]=b;rgba[o+3]=255;};
  const fill=(x0,y0,x1,y1,r,g,b)=>{x0=Math.max(0,x0|0);y0=Math.max(0,y0|0);x1=Math.min(W,x1|0);y1=Math.min(H,y1|0);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)put(x,y,r,g,b);};
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = 8 + t * 4, g = 14 + t * 6, b = 16 + t * 4;
    fill(0, y, W, y + 1, r, g, b);
  }
  fill(0, 0, W, 42, 6, 10, 12);
  fill(96, 18, 196, 24, 28, 28, 28);
  fill(96, 18, 168, 24, 0, 200, 220);
  disc(put, 340, 22, 6, [40, 40, 40], false);
  disc(put, 360, 22, 6, [0, 200, 220], false);
  disc(put, 380, 22, 6, [0, 140, 160], false);
  fill(820, 14, 980, 30, 10, 16, 18);
  const cx=560, cy=400, R=195;
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < R - 6) {
        const a = 0.12 * (1 - d / R);
        put(x, y, 0, 40 + a * 180, 48 + a * 180);
      } else if (d < R + 3 && d > R - 8) {
        put(x, y, 0, 210, 230);
      }
    }
  }
  disc(put, cx - 10, cy - 8, 16, [0, 200, 220], true);
  disc(put, cx + 48, cy - 36, 12, [0, 200, 220], true);
  disc(put, cx + 18, cy + 42, 11, [0, 200, 220], true);
  disc(put, 980, 220, 14, [220, 50, 50], true);
  disc(put, cx + R, cy - 8, 9, [230, 255, 255], true);
  disc(put, 430, 268, 28, [12, 12, 12], false);
  fill(416, 258, 444, 270, 250, 250, 110);
  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){raw[y*(W*4+1)]=0;rgba.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
