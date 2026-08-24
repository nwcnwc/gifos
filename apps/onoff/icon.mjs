import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [18,18,18], CARD_B = [8,8,8], LIGHT = [232,232,232], DARK = [40,40,40], ACCENT = [51,51,51], SPIKE = [180,40,40];
function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function inCard(x,y,m,r){const lo=m,hi=OUT-m;if(x<lo||x>hi||y<lo||y>hi)return false;const cx=Math.min(Math.max(x,lo+r),hi-r),cy=Math.min(Math.max(y,lo+r),hi-r);if(x>=lo+r&&x<=hi-r)return true;if(y>=lo+r&&y<=hi-r)return true;return (x-cx)**2+(y-cy)**2<=r*r;}
function inRect(x,y,x0,y0,w,h){return x>=x0&&y>=y0&&x<x0+w&&y<y0+h;}
function buildPalette(){const pal=[[0,0,0]];for(const b of [CARD_A,CARD_B,LIGHT,DARK,ACCENT,SPIKE]){for(let s=0;s<=4;s++)pal.push(mix(b,[255,255,255],s*0.1).map(Math.round));pal.push(mix(b,[0,0,0],0.35).map(Math.round));}return pal;}
function nearest(pal,r,g,b){let bi=1,bd=1e9;for(let i=1;i<pal.length;i++){const p=pal[i],d=(p[0]-r)**2+(p[1]-g)**2+(p[2]-b)**2;if(d<bd){bd=d;bi=i;}}return bi;}
function frameIndices(pal,f){
  const rgba=new Float32Array(RW*RW*4), on=f<6, t=f/FRAMES;
  const px=28+t*50, py=70-Math.sin(Math.min(1,t*1.6)*Math.PI)*22;
  for(let pyi=0;pyi<RW;pyi++)for(let pxi=0;pxi<RW;pxi++){
    const x=pxi/SS,y=pyi/SS; if(!inCard(x,y,6,20)) continue;
    let col = on ? mix(LIGHT,CARD_A,(y-6)/116) : mix(DARK,CARD_B,(y-6)/116);
    const plat = on ? LIGHT : DARK, ghost = on ? mix(DARK,LIGHT,0.25) : mix(LIGHT,DARK,0.25);
    if (inRect(x,y,16,96,50,10)) col=plat;
    if (inRect(x,y,62,96,50,10)) col=ghost;
    if (inRect(x,y,70,78,36,8)) col = on ? ghost : plat;
    if (inRect(x,y,px-6,py-10,12,20)) col = on ? DARK : LIGHT;
    if (y>104 && y<110 && x>70 && x<100 && ((x|0)%8)<4) col=SPIKE;
    const o=(pyi*RW+pxi)*4; rgba[o]=col[0];rgba[o+1]=col[1];rgba[o+2]=col[2];rgba[o+3]=1;
  }
  const idx=new Uint8Array(OUT*OUT);
  for(let y=0;y<OUT;y++)for(let x=0;x<OUT;x++){
    let r=0,g=0,b=0,a=0,n=SS*SS;
    for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){const o=(((y*SS+sy)*RW)+(x*SS+sx))*4;r+=rgba[o];g+=rgba[o+1];b+=rgba[o+2];a+=rgba[o+3];}
    idx[y*OUT+x]=a/n<0.5?0:nearest(pal,r/n,g/n,b/n);
  }
  return idx;
}
export function onoffIcon(){
  const pal=buildPalette(), frames=[]; for(let f=0;f<FRAMES;f++) frames.push(frameIndices(pal,f));
  const CT=64, flat=new Array(CT*3).fill(0);
  for(let i=0;i<pal.length&&i<CT;i++){flat[i*3]=pal[i][0]|0;flat[i*3+1]=pal[i][1]|0;flat[i*3+2]=pal[i][2]|0;}
  return {width:OUT,height:OUT,palette:flat,numColors:CT,minCodeSize:6,frames,delayCs:12,transparentIndex:0};
}
function crc(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return (~c)>>>0;}
function pngChunk(tag,data){const t=Buffer.from(tag),len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([t,data]),c=Buffer.alloc(4);c.writeUInt32BE(crc(body));return Buffer.concat([len,body,c]);}
export function screenshotPng(){
  const W=1200,H=720,rgba=Buffer.alloc(W*H*4,0);
  const put=(x,y,r,g,b)=>{x=x|0;y=y|0;if(x<0||y<0||x>=W||y>=H)return;const o=(y*W+x)*4;rgba[o]=r;rgba[o+1]=g;rgba[o+2]=b;rgba[o+3]=255;};
  const fill=(x0,y0,x1,y1,r,g,b)=>{x0=Math.max(0,x0|0);y0=Math.max(0,y0|0);x1=Math.min(W,x1|0);y1=Math.min(H,y1|0);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)put(x,y,r,g,b);};
  fill(0,0,W,H,10,10,15);
  fill(48,36,W-48,H-36,236,236,236);
  fill(72, 64, 96, 88, 51, 51, 51);
  fill(108, 70, 132, 86, 51, 51, 51);
  fill(160, 64, 184, 88, 51, 51, 51);
  fill(196, 70, 220, 86, 51, 51, 51);
  fill(80, 540, 500, 584, 51, 51, 51);
  fill(500, 540, 1120, 584, 214, 214, 214);
  fill(360, 400, 820, 440, 51, 51, 51);
  fill(820, 400, 1040, 440, 214, 214, 214);
  fill(200, 250, 248, 348, 51, 51, 51);
  fill(960, 300, 1108, 344, 51, 51, 51);
  fill(1004, 236, 1064, 300, 70, 70, 70);
  fill(1016, 248, 1032, 264, 236, 236, 236);
  fill(1040, 248, 1056, 264, 236, 236, 236);
  const gx=430, gy=250;
  fill(gx+18, gy+28, gx+58, gy+92, 40, 40, 40);
  fill(gx+22, gy+88, gx+34, gy+108, 40, 40, 40);
  fill(gx+42, gy+88, gx+54, gy+108, 40, 40, 40);
  fill(gx+16, gy, gx+62, gy+36, 40, 40, 40);
  fill(gx+24, gy+8, gx+54, gy+30, 236, 236, 236);
  fill(gx+30, gy+14, gx+36, gy+20, 40, 40, 40);
  fill(gx+42, gy+14, gx+48, gy+20, 40, 40, 40);
  for(let i=0;i<10;i++) fill(640+i*18, 568, 650+i*18, 584, 180, 40, 40);
  fill(1048, 188, 1072, 212, 51, 51, 51);
  fill(1036, 200, 1084, 224, 51, 51, 51);
  fill(1044, 176, 1076, 200, 80, 80, 80);
  const raw=Buffer.alloc((W*4+1)*H);
  for(let y=0;y<H;y++){raw[y*(W*4+1)]=0;rgba.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
