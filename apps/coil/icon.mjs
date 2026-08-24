import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [8, 18, 20], CARD_B = [4, 8, 12], CYAN = [0, 200, 220], RED = [220, 50, 50], TRAIL = [180, 255, 255], INK = [230, 255, 255];
function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function inCard(x,y,m,r){const lo=m,hi=OUT-m;if(x<lo||x>hi||y<lo||y>hi)return false;const cx=Math.min(Math.max(x,lo+r),hi-r),cy=Math.min(Math.max(y,lo+r),hi-r);if(x>=lo+r&&x<=hi-r)return true;if(y>=lo+r&&y<=hi-r)return true;return (x-cx)**2+(y-cy)**2<=r*r;}
function buildPalette(){const pal=[[0,0,0]];for(const b of [CARD_A,CARD_B,CYAN,RED,TRAIL,INK]){for(let s=0;s<=4;s++)pal.push(mix(b,[255,255,255],s*0.1).map(Math.round));pal.push(mix(b,[0,0,0],0.4).map(Math.round));}return pal;}
function nearest(pal,r,g,b){let bi=1,bd=1e9;for(let i=1;i<pal.length;i++){const p=pal[i],d=(p[0]-r)**2+(p[1]-g)**2+(p[2]-b)**2;if(d<bd){bd=d;bi=i;}}return bi;}
function frameIndices(pal,f){
  const rgba=new Float32Array(RW*RW*4), t=f/FRAMES, cx=64, cy=70;
  const loopR=28+Math.sin(t*Math.PI*2)*2;
  for(let py=0;py<RW;py++)for(let px=0;px<RW;px++){
    const x=px/SS,y=py/SS; if(!inCard(x,y,6,20)) continue;
    let col=mix(CARD_A,CARD_B,(y-6)/116);
    const d=Math.hypot(x-cx,y-cy);
    if (Math.abs(d-loopR)<2.2) col=TRAIL;
    if (Math.hypot(x-(cx+loopR*Math.cos(t*Math.PI*2)), y-(cy+loopR*Math.sin(t*Math.PI*2)))<5) col=INK;
    if (Math.hypot(x-cx, y-(cy-8))<7) col=CYAN;
    if (t>0.55 && Math.hypot(x-cx, y-(cy-8))<9) col=mix(CYAN,[180,255,90], (t-0.55)/0.45);
    if (Math.hypot(x-90, y-40)<6) col=RED;
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
export function screenshotPng(){
  const W=1200,H=720,rgba=Buffer.alloc(W*H*4,0);
  const put=(x,y,r,g,b)=>{x=x|0;y=y|0;if(x<0||y<0||x>=W||y>=H)return;const o=(y*W+x)*4;rgba[o]=r;rgba[o+1]=g;rgba[o+2]=b;rgba[o+3]=255;};
  const fill=(x0,y0,x1,y1,r,g,b)=>{x0=Math.max(0,x0|0);y0=Math.max(0,y0|0);x1=Math.min(W,x1|0);y1=Math.min(H,y1|0);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)put(x,y,r,g,b);};
  fill(0,0,W,H,10,16,18);
  const cx=600,cy=380,R=180;
  for(let a=0;a<360;a+=2){const rad=a*Math.PI/180; fill(cx+Math.cos(rad)*R-4, cy+Math.sin(rad)*R-4, cx+Math.cos(rad)*R+4, cy+Math.sin(rad)*R+4, 0,200,220);}
  fill(cx-18,cy-18,cx+18,cy+18,0,200,220);
  fill(cx+70,cy-40,cx+94,cy-16,0,200,220);
  fill(900,180,930,210,220,50,50);
  fill(cx+R-12,cy-12,cx+R+12,cy+12,230,255,255);
  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){raw[y*(W*4+1)]=0;rgba.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
