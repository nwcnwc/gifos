import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const SKY = [100, 176, 255], GRASS = [56, 160, 64], DARK = [20, 80, 28];
const DUCK = [232, 176, 48], BEAK = [220, 80, 32], WHITE = [250, 250, 250];
const DOG = [196, 140, 72], NOSE = [32, 24, 16], TREE = [36, 100, 44];
function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function inCard(x, y, m, r) {
  const lo=m, hi=OUT-m;
  if (x<lo||x>hi||y<lo||y>hi) return false;
  const cx=Math.min(Math.max(x,lo+r),hi-r), cy=Math.min(Math.max(y,lo+r),hi-r);
  if (x>=lo+r&&x<=hi-r) return true;
  if (y>=lo+r&&y<=hi-r) return true;
  return (x-cx)**2+(y-cy)**2<=r*r;
}
function buildPalette() {
  const pal=[[0,0,0]];
  for (const b of [SKY,GRASS,DARK,DUCK,BEAK,WHITE,DOG,NOSE,TREE]) {
    pal.push(b); pal.push(mix(b,[255,255,255],0.2).map(Math.round)); pal.push(mix(b,[0,0,0],0.3).map(Math.round));
  }
  return pal.slice(0,64);
}
function nearest(pal,r,g,b){ let bi=1,bd=1e9; for(let i=1;i<pal.length;i++){const p=pal[i],d=(p[0]-r)**2+(p[1]-g)**2+(p[2]-b)**2; if(d<bd){bd=d;bi=i;}} return bi; }
function fill(rgba,x,y,w,h,col){
  const x0=Math.max(0,x*SS|0),y0=Math.max(0,y*SS|0),x1=Math.min(RW,(x+w)*SS|0),y1=Math.min(RW,(y+h)*SS|0);
  for(let py=y0;py<y1;py++) for(let px=x0;px<x1;px++){ const o=(py*RW+px)*4; if(!rgba[o+3]) continue; rgba[o]=col[0];rgba[o+1]=col[1];rgba[o+2]=col[2]; }
}
function frameIndices(pal, f) {
  const rgba=new Float32Array(RW*RW*4);
  const t=f/FRAMES, duckX=20+t*70, duckY=36+Math.sin(t*Math.PI*2)*8;
  for(let py=0;py<RW;py++) for(let px=0;px<RW;px++){
    const x=px/SS,y=py/SS; if(!inCard(x,y,4,16)) continue;
    let col = y>88 ? mix(DARK,GRASS,(y-88)/40) : SKY;
    const o=(py*RW+px)*4; rgba[o]=col[0];rgba[o+1]=col[1];rgba[o+2]=col[2];rgba[o+3]=1;
  }
  fill(rgba, 18, 48, 16, 48, TREE);
  fill(rgba, duckX, duckY, 22, 10, DUCK);
  fill(rgba, duckX+18, duckY+2, 8, 5, BEAK);
  fill(rgba, duckX+6, duckY-6, 10, 8, WHITE);
  fill(rgba, 48, 92, 28, 18, DOG);
  fill(rgba, 70, 96, 14, 12, DOG);
  fill(rgba, 80, 100, 4, 4, NOSE);
  if (t>0.55) fill(rgba, duckX+8, duckY+12, 3, 10, BEAK);
  const idx=new Uint8Array(OUT*OUT);
  for(let y=0;y<OUT;y++) for(let x=0;x<OUT;x++){
    let r=0,g=0,b=0,a=0,n=SS*SS;
    for(let sy=0;sy<SS;sy++) for(let sx=0;sx<SS;sx++){ const o=(((y*SS+sy)*RW)+(x*SS+sx))*4; r+=rgba[o];g+=rgba[o+1];b+=rgba[o+2];a+=rgba[o+3]; }
    idx[y*OUT+x]=a/n<0.5?0:nearest(pal,r/n,g/n,b/n);
  }
  return idx;
}
export function duckHuntIcon(){
  const pal=buildPalette(), frames=[];
  for(let f=0;f<FRAMES;f++) frames.push(frameIndices(pal,f));
  const CT=64, flat=new Array(CT*3).fill(0);
  for(let i=0;i<pal.length&&i<CT;i++){ flat[i*3]=pal[i][0]|0; flat[i*3+1]=pal[i][1]|0; flat[i*3+2]=pal[i][2]|0; }
  return {width:OUT,height:OUT,palette:flat,numColors:CT,minCodeSize:6,frames,delayCs:10,transparentIndex:0};
}
function crc(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xedb88320&-(c&1)); } return (~c)>>>0; }
function pngChunk(tag,data){ const t=Buffer.from(tag),len=Buffer.alloc(4); len.writeUInt32BE(data.length); const body=Buffer.concat([t,data]),c=Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len,body,c]); }
const GLYPHS={
  A:[14,17,17,31,17,17,17],C:[14,17,16,16,16,17,14],D:[30,17,17,17,17,17,30],
  E:[31,16,16,30,16,16,31],G:[14,17,16,23,17,17,14],H:[17,17,17,31,17,17,17],
  I:[31,4,4,4,4,4,31],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],
  N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],S:[15,16,16,14,1,1,30],
  T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],' ':[0,0,0,0,0,0,0],
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
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(y>520) put(x,y,56,160,64); else put(x,y,100,176,255);
  }
  for(let y=200;y<520;y++) for(let x=80;x<220;x++) put(x,y,36,100,44);
  function oval(cx,cy,rx,ry,r,g,b){ for(let y=-ry;y<=ry;y++) for(let x=-rx;x<=rx;x++) if((x*x)/(rx*rx)+(y*y)/(ry*ry)<=1) put(cx+x,cy+y,r,g,b); }
  oval(700,260,90,36,232,176,48); oval(790,255,28,16,220,80,32); oval(680,230,40,22,250,250,250);
  oval(420,560,70,40,196,140,72); oval(490,570,36,24,196,140,72); oval(520,575,8,6,32,24,16);
  drawText(put, 36, 36, 'DUCK HUNT', 8, 20, 40, 80);
  drawText(put, 36, 110, 'CLICK THE DUCKS', 4, 20, 40, 80);
  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){ raw[y*(W*4+1)]=0; rgba.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR',ihdr), pngChunk('IDAT', deflateSync(raw,{level:9})), pngChunk('IEND', Buffer.alloc(0))]);
}
