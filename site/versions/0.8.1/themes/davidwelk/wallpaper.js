/*
 * wallpaper.js — the live wallpaper for the "David Welk" computer (davidwelk.gifos.app).
 * Loaded automatically by the theme cascade (desktop only) — see gifos-themes.js.
 *
 * Two-pass renderer. Pass 1 (the BAKE) ray-traces the whole scene ONCE into an
 * offscreen texture at 10-octave noise detail, supersampled ~1.45x and rendered
 * with overscan — far more detail than any per-frame budget would allow. It runs
 * as a quick low-detail full pass (so the wallpaper appears instantly) and then
 * refines tile-by-tile across frames so nothing ever janks. Pass 2 (the
 * COMPOSITE) runs per frame and is nearly free: it samples the baked scene
 * through a slowly drifting camera and layers the live elements on top — the
 * sun disc and lens flare, animated god-rays, shooting stars, film grain.
 *
 * The scene: a sunrise seen from low orbit. The camera skims a giant
 * night-side world whose dark cloud deck fills the lower-left — city lights
 * glinting through the cloud gaps, cloud self-shadowing, silver linings — its
 * blue atmosphere limb slicing the frame corner to corner with a warm
 * refracted sliver and a faint green airglow shell. Above the limb: a
 * triple-domain-warped crimson nebula with dust lanes and hot star-forming
 * knots, temperature-coloured stars with diffraction spikes on the bright
 * ones, a shadowed navy planet, a small cratered ember moon, and a big banded
 * amber world with impact scars and pale polar frost.
 *
 * The canvas is fixed at z-index 0 (pointer-events:none), so the menubar and
 * every desktop icon layer cleanly on top. Loaded by this theme's theme.js.
 *
 * Guards: honours prefers-reduced-motion (bakes, draws one still frame, stops),
 * pauses when hidden, caps buffer sizes, and falls back to a Canvas2D starfield
 * (then the CSS chrome gradient) if WebGL is unavailable.
 */
(function () {
  'use strict';
  if (window.__gifosCosmos) return; // idempotent (survives hot theme reloads)
  window.__gifosCosmos = { baked: false };

  var CANVAS_ID = 'gifos-cosmos';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function whenBody(cb) {
    if (document.body) return cb();
    document.addEventListener('DOMContentLoaded', cb, { once: true });
  }

  function makeCanvas() {
    var c = document.getElementById(CANVAS_ID);
    if (!c) {
      c = document.createElement('canvas');
      c.id = CANVAS_ID;
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;' +
        'pointer-events:none;display:block;';
      document.body.insertBefore(c, document.body.firstChild);
    }
    return c;
  }

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

  // Shared shader chunks -----------------------------------------------------
  var NOISE = [
    'float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    // gradient (Perlin-style) noise — smoother, less blocky than value noise
    'vec2 grad2(vec2 p){float h=hash21(p)*6.2831853;return vec2(cos(h),sin(h));}',
    'float gnoise(vec2 x){vec2 i=floor(x),f=fract(x);vec2 u=f*f*(3.0-2.0*f);',
    '  float a=dot(grad2(i),f);float b=dot(grad2(i+vec2(1,0)),f-vec2(1,0));',
    '  float c=dot(grad2(i+vec2(0,1)),f-vec2(0,1));float d=dot(grad2(i+vec2(1,1)),f-vec2(1,1));',
    '  return 0.5+0.7*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'vec3 rotX(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}',
    'vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}',
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}'
  ].join('\n');

  // ---- Pass 1: the bake — the full scene at maximum detail ---------------
  // Renders in the UNSWAYED camera frame with overscan OS so the composite's
  // drifting camera never samples off the edge of the texture. HDR is stored
  // sqrt-encoded over [0..4] so 8-bit stays banding-free in the darks (plus
  // dither); alpha carries the sky mask (1 = sky, 0 = a body) so the
  // composite knows where god-rays add vs. light.
  var FRAG_BAKE = [
    'precision highp float;',
    'uniform vec2  iResolution;',
    'uniform float uHQ;',                 // 0 = quick preview pass, 1 = full-detail tiles
    'const float T0=8.0;',                // frozen scene clock (all motion lives in pass 2)
    'const float OS=1.12;',               // overscan for the drifting camera
    // shared geometry: the giant world we skim, and the amber impactor that
    // is right now ploughing into its cloud deck (sunk 0.15 into the sphere)
    'const vec3 PBC=vec3(-28.90,-35.87,-13.17);const float RBC=48.47;',
    'const vec3 P3C=vec3(0.661,-0.528,1.389);const float R3C=0.485;',
    NOISE,
    'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  float n=uHQ>0.5?10.0:4.0;',
    '  for(int i=0;i<10;i++){if(float(i)>=n)break;v+=a*gnoise(p);p=m*p;a*=0.5;}return v;}',
    'float ridge(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  float n=uHQ>0.5?8.0:4.0;',
    '  for(int i=0;i<8;i++){if(float(i)>=n)break;v+=a*(1.0-abs(2.0*gnoise(p)-1.0));p=m*p;a*=0.5;}return v;}',
    '',
    // near-root ray/sphere intersection (-1 on miss)
    'float iSphere(vec3 ro,vec3 rd,vec3 ce,float ra){',
    '  vec3 oc=ro-ce;float b=dot(oc,rd);float c=dot(oc,oc)-ra*ra;float h=b*b-c;',
    '  if(h<0.0)return -1.0;return -b-sqrt(h);}',
    '',
    'vec3 starColor(float h){vec3 bl=vec3(0.68,0.8,1.0),w=vec3(1.0),y=vec3(1.0,0.92,0.72),r=vec3(1.0,0.72,0.55);',
    '  vec3 c=mix(bl,w,smoothstep(0.0,0.35,h));c=mix(c,y,smoothstep(0.42,0.72,h));return mix(c,r,smoothstep(0.78,1.0,h));}',
    // gaussian-PSF star field, 3 depth layers; the brightest few grow
    // diffraction spikes like a real telescope aperture
    'vec3 stars(vec2 uv){',
    '  vec3 acc=vec3(0.0);',
    '  for(int l=0;l<3;l++){',
    '    float sc=70.0+95.0*float(l);',
    '    vec2 g=uv*sc+float(l)*17.3;vec2 id=floor(g);vec2 f=fract(g)-0.5;',
    '    vec2 off=(vec2(hash21(id+1.7),hash21(id+9.1))-0.5)*0.8;',
    '    vec2 dd=f-off;float d=length(dd);',
    '    float br=pow(hash21(id+4.2),14.0)*2.4+step(0.9955,hash21(id))*0.7;',
    '    vec3 scol=starColor(hash21(id+2.9));',
    '    acc+=scol*br*exp(-d*d*sc*1.4);',
    '    float big=max(br-0.85,0.0);',
    '    acc+=scol*big*0.30*(exp(-abs(dd.x)*sc*0.9)*exp(-abs(dd.y)*sc*7.0)',
    '                       +exp(-abs(dd.y)*sc*0.9)*exp(-abs(dd.x)*sc*7.0));',
    '  }return acc;}',
    '',
    // ---- the scene: a low orbit over a giant night-side world ------------
    // camera at RO looks down -z; the big planet is a huge sphere we skim
    // (altitude ~0.9 over radius ~48), its horizon slicing the frame
    // diagonally. The sun sits just above the limb. Supporting cast:
    // NAVY  — a shadowed planet floating over the deck, lit only on its crown
    // EMBER — a small cratered red moon hovering just above the horizon
    // AMBER — a big sunlit rocky world, banded, scarred, frost at the poles
    '',
    // space: triple-warped crimson nebula — dust lanes carve the billows,
    // ridged filaments thread them, hot knots burn in the cores; lit by the
    // flare where it hangs close to the sun, and stars fade inside it
    'vec3 sky(vec3 rd,vec3 L){',
    '  vec2 q2=rd.xy/max(abs(rd.z),0.3);',
    '  float sd=max(dot(rd,L),0.0);',
    '  vec2 p=q2*3.2+vec2(T0*0.006,0.0);',
    '  vec2 q=vec2(fbm(p),fbm(p+vec2(4.7,2.3)));',
    '  vec2 r=vec2(fbm(p+3.0*q+vec2(1.7,9.2)),fbm(p+3.0*q+vec2(8.3,2.8)));',
    '  vec2 s=vec2(fbm(p+2.2*r+vec2(6.1,0.3)),fbm(p+2.2*r+vec2(2.4,7.9)));',
    '  float f=fbm(p+2.6*s);',
    '  float dust=fbm(p*2.3+r*1.5+vec2(7.7,3.1));',
    '  float warm=smoothstep(-0.55,0.50,q2.x*0.55+q2.y*0.62+(fbm(p*0.9+vec2(2.0,5.5))-0.5)*1.1);', // crimson up-right, blue down-left — edge billows like a real cloud bank
    '  float em=pow(smoothstep(0.44,0.95,f),1.8);',
    '  float hi=pow(smoothstep(0.60,0.96,f),2.2);',
    '  float knots=pow(smoothstep(0.76,0.99,f),3.0);',
    '  float glowN=1.0+2.5*pow(sd,5.0);',                          // the flare lights nearby billows
    '  vec3 col=vec3(0.010,0.016,0.045)*(1.0-0.55*smoothstep(0.45,0.85,dust));', // dust darkens space
    '  vec3 neb=mix(vec3(0.10,0.16,0.42),vec3(0.56,0.075,0.10),warm)*em*1.9;',
    '  neb+=mix(vec3(0.35,0.50,1.0),vec3(0.92,0.25,0.25),warm)*hi*0.85;',         // hot filament cores
    '  neb+=vec3(1.0,0.42,0.30)*knots*0.45;',                      // star-forming knots
    '  float fil=pow(smoothstep(0.55,0.95,ridge(p*3.6+s*2.0)),3.0);',
    '  neb+=vec3(0.80,0.20,0.15)*fil*em*0.5;',                     // fine filaments threading the billows
    '  neb*=glowN*(0.25+0.75*smoothstep(0.75,0.20,dust));',        // absorption carves the filaments
    '  neb*=0.18+0.82*warm;',                                      // the cool side stays clean glare
    '  col+=neb;',
    '  vec2 uv=vec2(atan(rd.z,rd.x),asin(clamp(rd.y,-1.0,1.0)))*vec2(0.5,1.0);',
    '  col+=stars(uv)*(1.0-em*0.75)*(1.0-0.8*pow(sd,3.0));',
    '  return col;}',
    '',
    // the giant world under the camera: dark domain-warped cloud deck with
    // convective fine structure, sunward cloud self-shadowing, silver
    // linings, city lights in the gaps, blue atmosphere hugging the horizon.
    // Textured by hit POSITION, not normal — from 0.9 units up, the visible
    // deck is a tiny patch of the sphere and normals barely vary across it
    'vec3 shadeBig(vec3 pos,vec3 n,vec3 rd,vec3 L,float dist){',
    '  vec2 cp=pos.xy*2.2+vec2(-pos.z*1.1,pos.z*0.55)+T0*vec2(0.020,0.008);',
    '  vec2 q=vec2(fbm(cp),fbm(cp+vec2(5.2,1.3)));',
    '  vec2 wp=cp+2.4*q+vec2(T0*0.012,0.0);',
    '  float cl=fbm(wp);',
    '  float fine=fbm(wp*3.6+vec2(13.1,7.4));',                    // small convective puffs on the tops
    '  cl+=(fine-0.49)*0.18;',
    '  float d3=length(pos-P3C)-R3C;',                             // distance to the impactor\'s hull
    '  cl+=sin(max(d3,0.0)*34.0)*0.30*exp(-max(d3,0.0)*2.2);',     // shockwaves ripple the deck outward
    '  float cl2=fbm(wp+vec2(0.10,0.22));',                        // resample toward the sun...
    '  float silver=clamp((cl-cl2)*6.0,0.0,1.0);',                 // ...sun-facing cloud edges catch light
    '  float clS=fbm(wp+vec2(0.26,0.30));',
    '  float shad=clamp((clS-cl)*3.5,0.0,1.0);',                   // taller clouds sunward cast soft shadow
    '  float clouds=smoothstep(0.36,0.60,cl);',
    '  float tops=smoothstep(0.46,0.70,cl);',
    '  vec3 gap=vec3(0.003,0.007,0.022);',
    '  vec3 deck=mix(vec3(0.018,0.038,0.095),vec3(0.16,0.26,0.50),tops);',
    '  vec3 surf=mix(gap,deck,clouds);',
    '  float dl=dot(n,L);',
    '  float tw=pow(clamp((dl+0.10)/0.25,0.0,1.0),3.0);',          // twilight band by the terminator
    '  float gs=pow(max(dot(rd,L),0.0),150.0);',                   // flare-scatter, tight around the sun
    '  vec3 col=surf*(0.38+tw*2.4*(1.0-0.45*shad));',
    '  col+=deck*clouds*gs*vec3(1.0,0.85,0.75)*1.6*(1.0-0.55*shad);',
    '  col+=vec3(0.55,0.70,1.0)*silver*clouds*(0.10+gs*1.4+tw*0.5);', // silver linings
    '  // city lights of the night side, glinting through the cloud gaps',
    '  float gapw=(1.0-clouds)*smoothstep(0.30,0.10,tw);',
    '  float cont=smoothstep(0.55,0.85,fbm(cp*0.55+vec2(3.7,8.2)));', // only some regions are settled
    '  vec2 gc2=cp*26.0;vec2 idc=floor(gc2);vec2 fc=fract(gc2)-0.5;',
    '  vec2 offc=(vec2(hash21(idc+3.1),hash21(idc+7.7))-0.5)*0.9;',
    '  float dcty=length(fc-offc);',
    '  float cbr=pow(hash21(idc+1.3),16.0);',
    '  float cdots=cbr*exp(-dcty*dcty*110.0)*1.6;',
    '  float cglow=pow(smoothstep(0.62,0.96,fbm(cp*4.2+vec2(9.3,1.1))),2.0)*0.16;',
    '  col+=vec3(1.0,0.70,0.34)*(cdots+cglow)*cont*gapw*0.55;',
    '  col+=surf*vec3(0.10,0.16,0.40)*0.45;',                      // cool ambient (nebula-lit night)
    '  // ---- the collision: molten contact, scorched ejecta, shock-lit clouds.',
    '  // The waterline wraps the whole disc from this low angle and reads as',
    '  // a cocoon — so keep the molten rim only on the camera-facing side of',
    '  // the crater; the splash hides behind the planet.',
    '  vec3 upB=normalize(P3C-PBC);',
    '  vec3 hoff=(pos-P3C)-upB*dot(pos-P3C,upB);',
    '  vec3 hv=(vec3(0.0,0.0,4.6)-P3C);hv-=upB*dot(hv,upB);',
    '  float fr=smoothstep(0.10,0.80,dot(normalize(hoff+vec3(1e-4)),normalize(hv)));',
    '  col=mix(col,vec3(0.16,0.09,0.05),smoothstep(0.35,0.03,max(d3,0.0))*0.45*clouds*fr);', // churned scorched dust
    '  col+=vec3(1.0,0.30,0.06)*exp(-max(d3,0.0)*7.0)*0.50*fr;',   // heat glow hugging the contact
    '  col+=vec3(1.0,0.55,0.18)*exp(-abs(d3)*14.0)*1.8*fr;',       // white-hot contact ring
    '  col=mix(col,vec3(0.05,0.10,0.26),smoothstep(3.0,9.0,dist)*0.40);', // aerial haze with distance
    '  float hp=1.0-max(dot(-rd,n),0.0);',                         // horizon proximity (grazing view)
    '  float sp=pow(max(dot(rd,L),0.0),12.0);',
    '  col+=vec3(1.0,0.42,0.16)*pow(hp,16.0)*sp*2.0;',             // warm refracted sliver at the sun
    '  vec3 atm=mix(vec3(0.10,0.30,0.90),vec3(0.92,0.96,1.0),sp);',
    '  col+=atm*pow(hp,8.0)*(0.50+sp*3.4);',                       // tight horizon line, white-hot at the sun
    '  col+=vec3(0.30,0.85,0.45)*pow(hp,5.5)*0.03*(1.0-sp);',      // faint green airglow tint
    '  col+=atm*pow(hp,3.0)*0.12;',                                // soft high haze
    '  return col;}',
    '',
    // the shadowed navy planet: near-silhouette, sunlit crown with swirling
    // cloud detail in the crescent, backlit rim
    'vec3 shadeNavy(vec3 n,vec3 rd,vec3 L){',
    '  float h=fbm(n.xy*5.0+n.z*3.0);',
    '  float h2=fbm(n.xy*11.0+n.z*6.0);',
    '  vec3 base=mix(vec3(0.010,0.020,0.050),vec3(0.030,0.060,0.130),h);',
    '  float dl=dot(n,L);float lit=smoothstep(-0.05,0.50,dl);',
    '  vec3 col=base*(0.18+1.0*lit);',
    '  col+=vec3(0.80,0.88,1.0)*pow(max(dl,0.0),1.2)*0.7*(0.40+0.35*h+0.25*h2);',
    '  float f=pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  col+=vec3(0.35,0.55,1.0)*f*(0.15+0.6*smoothstep(0.0,0.8,dl));',
    '  float rim=pow(1.0-max(dot(n,-rd),0.0),4.0);',               // thin sunlit crescent
    '  col+=vec3(1.0,0.97,0.90)*rim*smoothstep(-0.10,0.35,dl)*2.6;',
    '  return col;}',
    '',
    // the ember moon: dark red-brown rock, crater scars, nebula-red ambient
    'vec3 shadeEmber(vec3 n,vec3 rd,vec3 L){',
    '  float h=fbm(n.xy*13.0+n.z*8.0)*0.7+ridge(n.xy*22.0+n.z*13.0)*0.3;',
    '  vec3 base=mix(vec3(0.055,0.024,0.014),vec3(0.30,0.13,0.07),h);',
    '  float dl=dot(n,L);float lit=smoothstep(-0.35,0.45,dl);',
    '  vec3 col=base*(0.10+1.0*lit*(0.6+0.4*h));',
    '  float cr=smoothstep(0.78,0.96,gnoise(n.xy*24.0+n.z*14.0));',
    '  col*=1.0-0.40*cr;',                                         // crater shadows
    '  col+=base*vec3(0.9,0.25,0.22)*0.45;',                       // lit red by the nebula behind it
    '  float f=pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  col+=vec3(1.0,0.55,0.30)*f*0.5*smoothstep(-0.30,0.50,dl);',
    '  return col;}',
    '',
    // the amber world: banded burnt-orange rock, impact scars, pale polar
    // frost — caught mid-collision, its underside fracturing white-hot where
    // it ploughs into the giant\'s cloud deck. Art direction over physics: it
    // wears its own key light so its face glows sunlit like the reference.
    'vec3 shadeAmber(vec3 pos,vec3 n,vec3 rd,vec3 L){',
    '  vec3 rn=rotY(n,T0*0.008+2.0);',
    '  float h=fbm(rn.xy*vec2(3.0,6.0)+rn.z*2.0)*0.6+ridge(rn.xy*7.0+3.0)*0.4;',
    '  float ridg=abs(h-0.5)*2.0;',
    '  float band=0.88+0.12*sin(rn.y*9.0+fbm(rn.xy*4.0+rn.z*2.0)*3.0);', // wind-worn latitude bands
    '  vec3 c=mix(vec3(0.16,0.060,0.020),vec3(0.72,0.42,0.18),smoothstep(0.25,0.75,h));',
    '  c=mix(c,vec3(0.95,0.78,0.55),smoothstep(0.75,0.95,h)*0.6);',
    '  c*=band;',
    '  float cr=smoothstep(0.76,0.94,gnoise(rn.xy*18.0+rn.z*11.0));',
    '  c*=1.0-0.30*cr;',                                           // impact scars
    '  c=mix(c,vec3(0.93,0.88,0.80),smoothstep(0.70,0.92,abs(rn.y))*0.45);', // pale polar frost
    '  float dl=dot(n,L);float lit=smoothstep(-0.10,0.40,dl);',
    '  vec3 col=c*(0.06+1.15*lit)*(0.8+0.4*ridg);',
    '  col*=0.80+0.20*max(dot(n,-rd),0.0);',                       // limb darkening
    '  col+=c*vec3(0.05,0.08,0.16)*(1.0-lit)*0.5;',                // blue night ambient from the glare
    '  float f=pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  col+=mix(vec3(0.20,0.35,0.80),vec3(1.0,0.60,0.30),smoothstep(-0.2,0.6,dl))*f*0.5;',
    '  // the impact: only the underside — the surface actually ploughing into',
    '  // the deck — burns; gate by how far the normal tips below the horizon',
    '  vec3 upB=normalize(P3C-PBC);',
    '  float dn=dot(n,upB);',
    '  float heat=smoothstep(0.10,-0.40,dn);',
    '  float crack=pow(smoothstep(0.50,0.95,ridge(rn.xy*20.0+rn.z*12.0)),2.0);',
    '  col+=vec3(1.0,0.36,0.07)*heat*(0.30+1.5*crack);',
    '  col+=vec3(1.0,0.78,0.45)*smoothstep(-0.25,-0.70,dn)*1.3;', // white-hot right at the contact
    '  return col;}',
    '',
    'void main(){',
    '  vec2 uvp=(gl_FragCoord.xy-0.5*iResolution.xy)/iResolution.y*OS;',
    '  vec3 ro=vec3(0.0,0.0,4.6);',
    '  vec3 rd=normalize(vec3(uvp,-1.7));',
    '  vec3 L=normalize(vec3(0.05,0.36,-1.7));',      // the rising sun, kissing the limb
    '',
    '  vec3 PB=PBC;float RB=RBC;',                           // the world we skim (horizon cuts the frame)
    '  vec3 P1=vec3(-0.0353,0.0,2.6);    float R1=0.176;',   // navy planet, floating over the deck
    '  vec3 P2=vec3(0.659,1.235,-2.4);   float R2=0.1935;',  // ember moon, just above the horizon
    '  vec3 P3=P3C;float R3=R3C;',                           // amber world, mid-impact, lower right
    '  vec3 L3=normalize(vec3(-0.45,0.5,0.74));',            // the amber world\'s own key light
    '',
    '  float bT=1e9;int id=-1;vec3 bCe=vec3(0.0);',
    '  float hB=iSphere(ro,rd,PB,RB);if(hB>0.0&&hB<bT){bT=hB;bCe=PB;id=0;}',
    '  float h1=iSphere(ro,rd,P1,R1);if(h1>0.0&&h1<bT){bT=h1;bCe=P1;id=1;}',
    '  float h2=iSphere(ro,rd,P2,R2);if(h2>0.0&&h2<bT){bT=h2;bCe=P2;id=2;}',
    '  float h3=iSphere(ro,rd,P3,R3);if(h3>0.0&&h3<bT){bT=h3;bCe=P3;id=3;}',
    '',
    '  vec3 col;',
    '  if(id>=0){',
    '    vec3 pos=ro+rd*bT;vec3 n=normalize(pos-bCe);',
    '    if(id==0)col=shadeBig(pos,n,rd,L,bT);',
    '    else if(id==1)col=shadeNavy(n,rd,L);',
    '    else if(id==2)col=shadeEmber(n,rd,L);',
    '    else col=shadeAmber(pos,n,rd,L3);',
    '  }else{',
    '    col=sky(rd,L);',
    '    float sd=max(dot(rd,L),0.0);',
    '    // the horizon\'s glow, seen from the sky side. NO if(b>0) gate: the',
    '    // glow is still strong at that plane, so a hard gate cut a straight',
    '    // step across the sky — clamp the approach point and fade wide instead',
    '    float b=dot(PB-ro,rd);',
    '    float en=(length(ro+rd*max(b,0.0)-PB)-RB)/RB;',
    '    float sp=pow(sd,12.0);',
    '    float bf=smoothstep(-6.0,6.0,b);',
    '    vec3 gc=mix(vec3(0.16,0.38,0.95),vec3(1.0,0.92,0.78),sp);',
    '    col+=vec3(1.0,0.45,0.18)*exp(-max(en,0.0)*900.0)*sp*1.6*bf;', // warm refracted sliver
    '    col+=gc*(exp(-max(en,0.0)*260.0)*0.90+exp(-max(en,0.0)*30.0)*0.15)*(0.25+2.2*sp)*bf;',
    '  }',
    '',
    '  float mask=(id<0)?1.0:0.0;',
    '  vec3 enc=sqrt(clamp(col/4.0,0.0,1.0));',              // sqrt-encode HDR [0..4] into 8 bits
    '  enc+=(hash21(gl_FragCoord.xy*1.7)-0.5)/255.0;',       // encode-space dither kills banding
    '  gl_FragColor=vec4(enc,mask);',
    '}'
  ].join('\n');

  // ---- Pass 2: the composite — per-frame, nearly free ---------------------
  // Samples the bake through the EXACT swayed camera (rotate the ray, project
  // back to the bake plane — no approximation), then layers the live sun,
  // god-rays, shooting star, lens and film on top, and tone-maps.
  var FRAG_COMP = [
    'precision highp float;',
    'uniform vec2  iResolution;',
    'uniform float iTime;',
    'uniform sampler2D uTex;',
    'const float OS=1.12;',
    NOISE,
    'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<4;i++){v+=a*gnoise(p);p=m*p;a*=0.5;}return v;}',
    '',
    'void main(){',
    '  vec2 uvp=(gl_FragCoord.xy-0.5*iResolution.xy)/iResolution.y;',
    '  float t=iTime;',
    '  float swa=sin(t*0.03)*0.030,swb=cos(t*0.025)*0.022;',   // slow camera drift
    '  vec3 v=rotX(rotY(vec3(uvp,-1.7),swa),swb);',
    '  vec2 uvb=-1.7*v.xy/v.z;',                               // back onto the bake plane
    '  float aspect=iResolution.x/iResolution.y;',
    '  vec2 tc=vec2(uvb.x/(OS*aspect),uvb.y/OS)+0.5;',
    '  vec4 sm=texture2D(uTex,tc);',
    '  vec3 col=sm.rgb*sm.rgb*4.0;',                           // decode HDR
    '  float mask=sm.a;',                                      // 1 = sky, 0 = a body
    '',
    '  // soft bloom: bright light halos over silhouettes like a photograph,',
    '  // so no bright/dark boundary ever ends in a hard edge',
    '  vec3 bl=vec3(0.0);',
    '  for(int i=0;i<8;i++){',
    '    float a=0.7854*float(i);vec2 o=vec2(cos(a),sin(a));',
    '    vec3 s1=texture2D(uTex,tc+o*0.020).rgb;bl+=s1*s1;',
    '    if(i<4){float a2=1.5708*float(i);vec2 o2=vec2(cos(a2),sin(a2));',
    '      vec3 s2=texture2D(uTex,tc+o2*0.009).rgb;bl+=s2*s2;}',
    '  }',
    '  bl*=4.0/12.0;',
    '  col+=max(bl-vec3(0.85),0.0)*0.40;',
    '',
    '  vec3 rd=normalize(v);',
    '  vec3 L=normalize(vec3(0.05,0.36,-1.7));',
    '  float sd=max(dot(rd,L),0.0);',
    '  col+=mask*(vec3(1.0,0.98,0.92)*pow(sd,20000.0)*3.0',    // the disc
    '            +vec3(1.0,0.90,0.80)*pow(sd,400.0)*0.85);',   // inner bloom
    '  // the wide glare bleeds across the limb like real scatter — no hard edge',
    '  col+=(0.40+0.60*mask)*(vec3(0.45,0.65,1.0)*pow(sd,18.0)*0.30', // wide cool glare
    '            +vec3(0.20,0.40,0.95)*pow(sd,4.0)*0.10);',    // huge blue fill on the left
    '',
    '  // ---- shooting star: a brief moving glint, no trail ----',
    '  float slot=floor(t/9.0);float lt=fract(t/9.0);',
    '  vec2 s0=vec2(0.30+0.45*hash21(vec2(slot,1.0)),0.55+0.35*hash21(vec2(slot,2.0)));',
    '  vec2 sdir=normalize(vec2(0.86,-0.5));vec2 head=s0+sdir*lt*1.4;',
    '  vec2 uvS=gl_FragCoord.xy/iResolution.xy;vec2 rel=(uvS-head);rel.x*=iResolution.x/iResolution.y;',
    '  float appear=smoothstep(0.0,0.04,lt)*smoothstep(1.0,0.55,lt);',
    '  col+=vec3(0.9,0.95,1.0)*smoothstep(0.020,0.0,length(rel))*1.1*appear*mask;',
    '',
    '  // god-rays + lens bloom, in screen space so they track the drift',
    '  vec3 Lc=rotY(rotX(L,-swb),-swa);',                      // sun back in camera space
    '  vec2 sunScr=-1.7*Lc.xy/Lc.z;',
    '  vec2 sv=uvp-sunScr;float dS=length(sv);',
    '  float ang=atan(sv.y,sv.x);',
    '  float rays=0.60+0.40*sin(ang*5.0+fbm(vec2(ang*2.5,t*0.05))*3.0);',
    '  rays*=smoothstep(1.3,-0.9,sv.x+sv.y);',                 // beams sweep down-left
    '  col+=vec3(0.75,0.85,1.0)*rays*exp(-dS*2.6)*0.28*mask;',
    '  col*=1.0+rays*exp(-dS*2.2)*0.7*(1.0-mask);',            // beams LIGHT the deck, not wash it
    '  // lens bloom with a whisper of chromatic fringe, + anamorphic streak',
    '  vec3 fringe=vec3(exp(-length(sv*0.985)*20.0),exp(-dS*20.0),exp(-length(sv*1.015)*20.0));',
    '  col+=fringe*vec3(1.0,0.95,0.85)*0.55;',                 // the flare bleeds over the limb
    '  col+=vec3(0.40,0.60,1.0)*exp(-dS*5.0)*0.10;',
    '  col+=vec3(0.85,0.92,1.0)*exp(-abs(sv.y)*60.0)*exp(-abs(sv.x)*2.5)*mix(0.07,0.18,mask);',
    '',
    '  // exposure, vignette, dither + ACES tonemap + grain',
    '  float vig=smoothstep(1.35,0.3,length(uvp));',
    '  col*=0.66+0.34*vig;',
    '  col+=(hash21(gl_FragCoord.xy*1.7+fract(t)*7.0)-0.5)/300.0;',
    '  col=aces(col*1.12);',
    '  col=pow(col,vec3(0.95));',
    '  float g=(hash21(gl_FragCoord.xy+fract(t))-0.5)/240.0;',
    '  gl_FragColor=vec4(col+g,1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[cosmos] shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function link(gl, vs, fsSrc) {
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[cosmos] link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function startWebGL(canvas) {
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false,
      premultipliedAlpha: false, powerPreference: 'low-power' }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) return false;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    if (!vs) return false;
    var progBake = link(gl, vs, FRAG_BAKE);
    var progComp = link(gl, vs, FRAG_COMP);
    if (!progBake || !progComp) return false;

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var locB = gl.getAttribLocation(progBake, 'p');
    var locC = gl.getAttribLocation(progComp, 'p');
    gl.enableVertexAttribArray(locB);
    gl.vertexAttribPointer(locB, 2, gl.FLOAT, false, 0, 0);
    if (locC !== locB) {
      gl.enableVertexAttribArray(locC);
      gl.vertexAttribPointer(locC, 2, gl.FLOAT, false, 0, 0);
    }

    var uResB = gl.getUniformLocation(progBake, 'iResolution');
    var uHQ = gl.getUniformLocation(progBake, 'uHQ');
    var uResC = gl.getUniformLocation(progComp, 'iResolution');
    var uTimeC = gl.getUniformLocation(progComp, 'iTime');
    var uTexC = gl.getUniformLocation(progComp, 'uTex');

    // the bake target: linear-filtered so the 1.45x supersample downfilters
    // into clean anti-aliased edges when the composite samples it
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();

    var OS = 1.12, SS = 1.45;             // must match the shaders' overscan
    var TILES = 8;                        // refine as an 8x8 grid, a few per frame
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    var W = 0, H = 0, BW = 0, BH = 0;
    var tileIdx = -2;                     // -2 = needs coarse pass, then 0..63 tiles

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = window.innerWidth, ch = window.innerHeight;
      // per-frame pass is nearly free now, so the screen buffer can run big
      var scale = Math.min(1, Math.sqrt(1800000 / (cw * ch * dpr * dpr)));
      W = Math.max(1, Math.floor(cw * dpr * scale));
      H = Math.max(1, Math.floor(ch * dpr * scale));
      canvas.width = W; canvas.height = H;
      // the bake: overscan for sway + supersample for AA, capped for memory
      BW = Math.round(W * OS * SS); BH = Math.round(H * OS * SS);
      var fit = Math.min(1, Math.sqrt(5200000 / (BW * BH)));
      BW = Math.min(Math.floor(BW * fit), maxTex, 4096);
      BH = Math.min(Math.floor(BH * fit), maxTex, 4096);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, BW, BH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      tileIdx = -2;
      window.__gifosCosmos.baked = false;
      return ok;
    }
    if (!resize()) return false;
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { resize(); kick(); }, 200);
    });

    var last = performance.now();
    var clock = 0, raf = 0, running = true;

    function bakeStep() {
      gl.useProgram(progBake);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, BW, BH);
      gl.uniform2f(uResB, BW, BH);
      if (tileIdx === -2) {
        // instant full-frame preview at low octaves — the wallpaper appears
        // at once, then sharpens as the high-detail tiles land
        gl.uniform1f(uHQ, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        tileIdx = 0;
      } else {
        gl.uniform1f(uHQ, 1);
        gl.enable(gl.SCISSOR_TEST);
        var per = 3;
        while (per-- > 0 && tileIdx < TILES * TILES) {
          var tx = tileIdx % TILES, ty = Math.floor(tileIdx / TILES);
          var x0 = Math.floor(BW * tx / TILES), y0 = Math.floor(BH * ty / TILES);
          var x1 = Math.floor(BW * (tx + 1) / TILES), y1 = Math.floor(BH * (ty + 1) / TILES);
          gl.scissor(x0, y0, x1 - x0, y1 - y0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          tileIdx++;
        }
        gl.disable(gl.SCISSOR_TEST);
        if (tileIdx >= TILES * TILES) window.__gifosCosmos.baked = true;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) clock += dt;
      var baking = !window.__gifosCosmos.baked;
      if (baking) bakeStep();
      gl.useProgram(progComp);
      gl.viewport(0, 0, W, H);
      gl.uniform2f(uResC, W, H);
      gl.uniform1f(uTimeC, clock + 8.0);
      gl.uniform1i(uTexC, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // reduced motion: keep going only until the bake lands, then hold still
      if (!reduce || !window.__gifosCosmos.baked) raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (running && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    kick();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      else { running = true; kick(); }
    });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); running = false; }, false);
    return true;
  }

  // ---- Canvas2D fallback: drifting stars + soft nebula blobs --------------
  function startCanvas2D(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    var stars = [], W, H;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.floor(window.innerWidth * dpr);
      H = canvas.height = Math.floor(window.innerHeight * dpr);
      stars = [];
      var n = Math.min(520, Math.floor((W * H) / 6000));
      for (var i = 0; i < n; i++) stars.push({
        x: Math.random() * W, y: Math.random() * H,
        z: 0.3 + Math.random() * 1.7, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28
      });
    }
    resize();
    window.addEventListener('resize', resize);
    function blob(x, y, r, col) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    var t0 = performance.now(), running = true, raf = 0;
    function frame(now) {
      raf = 0; if (!running) return;
      var t = (now - t0) / 1000;
      ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      blob(W * 0.25, H * 0.2, Math.max(W, H) * 0.45, 'rgba(140,40,80,0.18)');
      blob(W * 0.7, H * 0.6, Math.max(W, H) * 0.5, 'rgba(30,90,150,0.16)');
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x -= s.z * 0.25; if (s.x < 0) s.x += W;
        var tw = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
        ctx.fillStyle = 'rgba(220,230,255,' + (0.5 + 0.5 * tw) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.z, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (!reduce) { running = true; if (!raf) raf = requestAnimationFrame(frame); }
    });
    return true;
  }

  whenBody(function () {
    var canvas = makeCanvas();
    try { if (startWebGL(canvas)) return; } catch (e) { console.warn('[cosmos] webgl failed:', e); }
    try { if (startCanvas2D(canvas)) return; } catch (e2) { console.warn('[cosmos] canvas2d failed:', e2); }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  });
})();
