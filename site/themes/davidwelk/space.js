/*
 * space.js — the live wallpaper for the "David Welk" computer (davidwelk.gifos.app).
 *
 * A single full-screen WebGL fragment shader RAY-TRACES a sunrise seen from
 * low orbit: the camera skims a giant night-side world whose dark cloud deck
 * fills the lower-left, its blue atmosphere limb slicing the frame corner to
 * corner. The sun breaks the horizon right at the limb — white core, cool
 * wide glare, soft god-rays down the dark side. Above the limb a filamentary
 * crimson nebula and temperature-coloured stars fill space, home to three
 * more worlds: a shadowed blue planet floating in the glare, a small ember
 * moon, and a big sunlit rocky world banded in burnt orange. Everything is
 * real geometry — spheres intersected per-pixel, fbm cloudscapes, wrapped
 * terminator lighting, fresnel atmospheres, ACES tone-mapping, a slow
 * drifting camera, grain. No dependencies — all math.
 *
 * The canvas is fixed at z-index 0 (pointer-events:none), so the menubar and
 * every desktop icon layer cleanly on top. Loaded by this theme's theme.js.
 *
 * Guards: honours prefers-reduced-motion (one still frame), pauses when hidden,
 * caps the render buffer for battery/perf, and falls back to a Canvas2D
 * starfield (then the CSS chrome gradient) if WebGL is unavailable.
 */
(function () {
  'use strict';
  if (window.__gifosCosmos) return; // idempotent (survives hot theme reloads)
  window.__gifosCosmos = true;

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

  var FRAG = [
    'precision highp float;',
    'uniform vec2  iResolution;',
    'uniform float iTime;',
    '',
    'float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    // gradient (Perlin-style) noise — smoother, less blocky than value noise
    'vec2 grad2(vec2 p){float h=hash21(p)*6.2831853;return vec2(cos(h),sin(h));}',
    'float gnoise(vec2 x){vec2 i=floor(x),f=fract(x);vec2 u=f*f*(3.0-2.0*f);',
    '  float a=dot(grad2(i),f);float b=dot(grad2(i+vec2(1,0)),f-vec2(1,0));',
    '  float c=dot(grad2(i+vec2(0,1)),f-vec2(0,1));float d=dot(grad2(i+vec2(1,1)),f-vec2(1,1));',
    '  return 0.5+0.7*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<6;i++){v+=a*gnoise(p);p=m*p;a*=0.5;}return v;}',
    'float ridge(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<5;i++){v+=a*(1.0-abs(2.0*gnoise(p)-1.0));p=m*p;a*=0.5;}return v;}',
    'vec3 rotX(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}',
    'vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}',
    '',
    // near-root ray/sphere intersection (-1 on miss)
    'float iSphere(vec3 ro,vec3 rd,vec3 ce,float ra){',
    '  vec3 oc=ro-ce;float b=dot(oc,rd);float c=dot(oc,oc)-ra*ra;float h=b*b-c;',
    '  if(h<0.0)return -1.0;return -b-sqrt(h);}',
    '',
    'vec3 starColor(float h){vec3 bl=vec3(0.68,0.8,1.0),w=vec3(1.0),y=vec3(1.0,0.92,0.72),r=vec3(1.0,0.72,0.55);',
    '  vec3 c=mix(bl,w,smoothstep(0.0,0.35,h));c=mix(c,y,smoothstep(0.42,0.72,h));return mix(c,r,smoothstep(0.78,1.0,h));}',
    // gaussian-PSF star field: power-law brightness, per-star twinkle
    'vec3 stars(vec2 uv,float t){',
    '  vec3 acc=vec3(0.0);',
    '  for(int l=0;l<2;l++){',
    '    float sc=mix(70.0,160.0,float(l));',
    '    vec2 g=uv*sc+float(l)*17.3;vec2 id=floor(g);vec2 f=fract(g)-0.5;',
    '    vec2 off=(vec2(hash21(id+1.7),hash21(id+9.1))-0.5)*0.8;',
    '    float d=length(f-off);',
    '    float br=pow(hash21(id+4.2),12.0)*2.2+step(0.995,hash21(id))*0.6;',
    '    float tw=0.75+0.25*sin(t*(1.5+hash21(id)*2.0)+hash21(id)*40.0);',
    '    acc+=starColor(hash21(id+2.9))*br*tw*exp(-d*d*sc*1.4);',
    '  }return acc;}',
    '',
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}',
    '',
    // ---- the scene: a low orbit over a giant night-side world ------------
    // camera at RO looks down -z; the big planet is a huge sphere we skim
    // (altitude ~0.9 over radius ~48), its horizon slicing the frame
    // diagonally. The sun sits just above the limb. Supporting cast:
    // NAVY  — a shadowed planet floating over the deck, lit only on its crown
    // EMBER — a small dark red moon hovering just above the horizon
    // AMBER — a big sunlit rocky world, banded and cratered
    '',
    // space: double-warped crimson nebula with dark dust lanes, lit by the
    // flare where it hangs close to the sun; stars fade inside it
    'vec3 sky(vec3 rd,vec3 L,float t){',
    '  vec2 q2=rd.xy/max(abs(rd.z),0.3);',
    '  float sd=max(dot(rd,L),0.0);',
    '  vec2 p=q2*3.2+vec2(t*0.006,0.0);',
    '  vec2 q=vec2(fbm(p),fbm(p+vec2(4.7,2.3)));',
    '  vec2 r=vec2(fbm(p+3.0*q+vec2(1.7,9.2)),fbm(p+3.0*q+vec2(8.3,2.8)));',
    '  float f=fbm(p+2.6*r+vec2(0.0,t*0.004));',
    '  float dust=fbm(p*2.3+r*1.5+vec2(7.7,3.1));',
    '  float warm=smoothstep(-0.55,0.50,q2.x*0.55+q2.y*0.62);',   // crimson up-right, blue down-left
    '  float em=pow(smoothstep(0.34,0.92,f),1.6);',
    '  float hi=pow(smoothstep(0.55,0.95,f),2.2);',
    '  float glowN=1.0+2.5*pow(sd,5.0);',                          // the flare lights nearby billows
    '  vec3 col=vec3(0.010,0.016,0.045)*(1.0-0.55*smoothstep(0.45,0.85,dust));', // dust darkens space
    '  vec3 neb=mix(vec3(0.10,0.16,0.42),vec3(0.48,0.09,0.15),warm)*em*2.2;',
    '  neb+=mix(vec3(0.35,0.50,1.0),vec3(1.0,0.45,0.50),warm)*hi*1.3;',           // hot filament cores
    '  neb*=glowN*(0.35+0.65*smoothstep(0.75,0.20,dust));',        // absorption carves the filaments
    '  neb*=0.25+0.75*warm;',                                      // the cool side stays clean glare
    '  col+=neb;',
    '  vec2 uv=vec2(atan(rd.z,rd.x),asin(clamp(rd.y,-1.0,1.0)))*vec2(0.5,1.0);',
    '  col+=stars(uv,t)*(1.0-em*0.75)*(1.0-0.8*pow(sd,3.0));',
    '  return col;}',
    '',
    // the giant world under the camera: dark domain-warped cloud deck,
    // twilight band near the terminator, blue atmosphere hugging the horizon
    // textured by hit POSITION, not normal — from 0.9 units up, the visible
    // deck is a tiny patch of the sphere and normals barely vary across it
    'vec3 shadeBig(vec3 pos,vec3 n,vec3 rd,vec3 L,float t,float dist){',
    '  vec2 cp=pos.xy*2.2+vec2(-pos.z*1.1,pos.z*0.55)+t*vec2(0.020,0.008);',
    '  vec2 q=vec2(fbm(cp),fbm(cp+vec2(5.2,1.3)));',
    '  vec2 wp=cp+2.4*q+vec2(t*0.012,0.0);',
    '  float cl=fbm(wp);',
    '  float cl2=fbm(wp+vec2(0.10,0.22));',                        // resample toward the sun...
    '  float silver=clamp((cl-cl2)*6.0,0.0,1.0);',                 // ...sun-facing cloud edges catch light
    '  float clouds=smoothstep(0.36,0.60,cl);',
    '  float tops=smoothstep(0.46,0.70,cl);',
    '  vec3 gap=vec3(0.003,0.007,0.022);',
    '  vec3 deck=mix(vec3(0.018,0.038,0.095),vec3(0.16,0.26,0.50),tops);',
    '  vec3 surf=mix(gap,deck,clouds);',
    '  float dl=dot(n,L);',
    '  float tw=pow(clamp((dl+0.10)/0.25,0.0,1.0),3.0);',          // twilight band by the terminator
    '  float gs=pow(max(dot(rd,L),0.0),150.0);',                   // flare-scatter, tight around the sun
    '  vec3 col=surf*(0.38+tw*2.4)+deck*clouds*gs*vec3(1.0,0.85,0.75)*1.6;',
    '  col+=vec3(0.55,0.70,1.0)*silver*clouds*(0.10+gs*1.4+tw*0.5);', // silver linings
    '  col+=surf*vec3(0.10,0.16,0.40)*0.45;',                      // cool ambient (nebula-lit night)
    '  col=mix(col,vec3(0.05,0.10,0.26),smoothstep(3.0,9.0,dist)*0.40);', // aerial haze with distance
    '  float hp=1.0-max(dot(-rd,n),0.0);',                         // horizon proximity (grazing view)
    '  float sp=pow(max(dot(rd,L),0.0),12.0);',
    '  col+=vec3(1.0,0.42,0.16)*pow(hp,16.0)*sp*2.0;',             // warm refracted sliver at the sun
    '  vec3 atm=mix(vec3(0.10,0.30,0.90),vec3(0.92,0.96,1.0),sp);',
    '  col+=atm*pow(hp,8.0)*(0.35+sp*3.4);',                       // tight horizon line, white-hot at the sun
    '  col+=atm*pow(hp,3.0)*0.08;',                                // soft high haze
    '  return col;}',
    '',
    // the shadowed navy planet: near-silhouette, sunlit crown, backlit rim
    'vec3 shadeNavy(vec3 n,vec3 rd,vec3 L){',
    '  float h=fbm(n.xy*5.0+n.z*3.0);',
    '  vec3 base=mix(vec3(0.010,0.020,0.050),vec3(0.030,0.060,0.130),h);',
    '  float dl=dot(n,L);float lit=smoothstep(-0.05,0.50,dl);',
    '  vec3 col=base*(0.18+1.0*lit);',
    '  col+=vec3(0.80,0.88,1.0)*pow(max(dl,0.0),1.2)*0.7*(0.6+0.4*h);',
    '  float f=pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  col+=vec3(0.35,0.55,1.0)*f*(0.15+0.6*smoothstep(0.0,0.8,dl));',
    '  float rim=pow(1.0-max(dot(n,-rd),0.0),4.0);',               // thin sunlit crescent
    '  col+=vec3(1.0,0.97,0.90)*rim*smoothstep(-0.10,0.35,dl)*2.6;',
    '  return col;}',
    '',
    // the ember moon: dark red-brown rock, soft crescent, nebula-red ambient
    'vec3 shadeEmber(vec3 n,vec3 rd,vec3 L){',
    '  float h=fbm(n.xy*8.0+n.z*5.0)*0.7+ridge(n.xy*14.0+n.z*8.0)*0.3;',
    '  vec3 base=mix(vec3(0.055,0.024,0.014),vec3(0.30,0.13,0.07),h);',
    '  float dl=dot(n,L);float lit=smoothstep(-0.35,0.45,dl);',
    '  vec3 col=base*(0.10+1.0*lit*(0.6+0.4*h));',
    '  col+=base*vec3(0.9,0.25,0.22)*0.45;',                       // lit red by the nebula behind it
    '  float f=pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  col+=vec3(1.0,0.55,0.30)*f*0.5*smoothstep(-0.30,0.50,dl);',
    '  return col;}',
    '',
    // the amber world: banded burnt-orange rock. Art direction over physics:
    // it wears its own key light so its face glows sunlit like the reference.
    'vec3 shadeAmber(vec3 n,vec3 rd,vec3 L,float t){',
    '  vec3 rn=rotY(n,t*0.008+2.0);',
    '  float h=fbm(rn.xy*vec2(3.0,6.0)+rn.z*2.0)*0.6+ridge(rn.xy*7.0+3.0)*0.4;',
    '  float ridg=abs(h-0.5)*2.0;',
    '  vec3 c=mix(vec3(0.16,0.060,0.020),vec3(0.72,0.42,0.18),smoothstep(0.25,0.75,h));',
    '  c=mix(c,vec3(0.95,0.78,0.55),smoothstep(0.75,0.95,h)*0.6);',
    '  float dl=dot(n,L);float lit=smoothstep(-0.10,0.40,dl);',
    '  vec3 col=c*(0.06+1.15*lit)*(0.8+0.4*ridg);',
    '  col*=0.80+0.20*max(dot(n,-rd),0.0);',                       // limb darkening
    '  col+=c*vec3(0.05,0.08,0.16)*(1.0-lit)*0.5;',                // blue night ambient from the glare
    '  float f=pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  col+=mix(vec3(0.20,0.35,0.80),vec3(1.0,0.60,0.30),smoothstep(-0.2,0.6,dl))*f*0.5;',
    '  return col;}',
    '',
    'void main(){',
    '  vec2 uvp=(gl_FragCoord.xy-0.5*iResolution.xy)/iResolution.y;',
    '  float t=iTime;',
    '  vec3 ro=vec3(0.0,0.0,4.6);',
    '  float swa=sin(t*0.03)*0.030,swb=cos(t*0.025)*0.022;',   // slow camera drift
    '  vec3 rd=normalize(vec3(uvp,-1.7));',
    '  rd=rotX(rotY(rd,swa),swb);',
    '',
    '  vec3 L=normalize(vec3(0.05,0.36,-1.7));',      // the rising sun, kissing the limb
    '  vec3 Lc=rotY(rotX(L,-swb),-swa);',             // sun back in camera space...
    '  vec2 sunScr=-1.7*Lc.xy/Lc.z;',                 // ...so the lens bloom tracks the drift
    '',
    '  vec3 PB=vec3(-28.90,-35.87,-13.17);float RB=48.47;',  // the world we skim (horizon cuts the frame)
    '  vec3 P1=vec3(-0.0353,0.0,2.6);    float R1=0.176;',   // navy planet, floating over the deck
    '  vec3 P2=vec3(0.659,1.235,-2.4);   float R2=0.1935;',  // ember moon, just above the horizon
    '  vec3 P3=vec3(1.2,-0.388,1.6);     float R3=0.485;',   // amber world, bottom right, in front of the deck
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
    '    if(id==0)col=shadeBig(pos,n,rd,L,t,bT);',
    '    else if(id==1)col=shadeNavy(n,rd,L);',
    '    else if(id==2)col=shadeEmber(n,rd,L);',
    '    else col=shadeAmber(n,rd,L3,t);',
    '  }else{',
    '    col=sky(rd,L,t);',
    '    float sd=max(dot(rd,L),0.0);',
    '    col+=vec3(1.0,0.98,0.92)*pow(sd,20000.0)*3.0;',    // the disc
    '    col+=vec3(1.0,0.90,0.80)*pow(sd,400.0)*0.85;',     // inner bloom
    '    col+=vec3(0.45,0.65,1.0)*pow(sd,18.0)*0.30;',      // wide cool glare
    '    col+=vec3(0.20,0.40,0.95)*pow(sd,4.0)*0.10;',      // huge blue fill on the left
    '    float b=dot(PB-ro,rd);',                            // the horizon\'s glow, seen from the sky side
    '    if(b>0.0){',
    '      float en=(length(ro+rd*b-PB)-RB)/RB;',
    '      float sp=pow(sd,12.0);',
    '      vec3 gc=mix(vec3(0.16,0.38,0.95),vec3(1.0,0.92,0.78),sp);',
    '      col+=vec3(1.0,0.45,0.18)*exp(-max(en,0.0)*900.0)*sp*1.6;', // warm refracted sliver
    '      col+=gc*(exp(-max(en,0.0)*260.0)*0.90+exp(-max(en,0.0)*30.0)*0.15)*(0.25+2.2*sp);',
    '    }',
    '  }',
    '',
    '  // ---- shooting star (sky only, subtle) ----',
    '  float slot=floor(t/9.0);float lt=fract(t/9.0);',
    '  vec2 s0=vec2(0.30+0.45*hash21(vec2(slot,1.0)),0.55+0.35*hash21(vec2(slot,2.0)));',
    '  vec2 sdir=normalize(vec2(0.86,-0.5));vec2 head=s0+sdir*lt*1.4;',
    '  vec2 uvS=gl_FragCoord.xy/iResolution.xy;vec2 rel=(uvS-head);rel.x*=iResolution.x/iResolution.y;',
    '  float al=dot(rel,sdir);float pp=length(rel-sdir*al);',
    '  float streak=smoothstep(0.0015,0.0,pp)*smoothstep(0.0,-0.15,al);',
    '  float appear=smoothstep(0.0,0.04,lt)*smoothstep(1.0,0.55,lt);',
    '  if(id<0)col+=vec3(0.9,0.95,1.0)*(streak*0.7+smoothstep(0.024,0.0,length(rel))*1.2)*appear;',
    '',
    '  // god-rays + lens bloom, in screen space so they streak across the deck too',
    '  vec2 sv=uvp-sunScr;float dS=length(sv);',
    '  float ang=atan(sv.y,sv.x);',
    '  float rays=0.60+0.40*sin(ang*5.0+fbm(vec2(ang*2.5,t*0.05))*3.0);',
    '  rays*=smoothstep(0.9,-0.6,sv.x+sv.y);',               // beams sweep down-left
    '  if(id<0)col+=vec3(0.75,0.85,1.0)*rays*exp(-dS*2.6)*0.28;',
    '  else col*=1.0+rays*exp(-dS*2.2)*0.7;',                 // beams LIGHT the deck, not wash it
    '  // lens bloom with a whisper of chromatic fringe, + anamorphic streak',
    '  vec3 fringe=vec3(exp(-length(sv*0.985)*20.0),exp(-dS*20.0),exp(-length(sv*1.015)*20.0));',
    '  col+=fringe*vec3(1.0,0.95,0.85)*0.55;',                // the flare bleeds over the limb
    '  col+=vec3(0.40,0.60,1.0)*exp(-dS*5.0)*0.10;',
    '  col+=vec3(0.85,0.92,1.0)*exp(-abs(sv.y)*60.0)*exp(-abs(sv.x)*2.5)*(id<0?0.18:0.07);',
    '',
    '  // exposure, vignette, dither + ACES tonemap + grain',
    '  float vig=smoothstep(1.35,0.3,length(uvp));',
    '  col*=0.66+0.34*vig;',
    '  col+=(hash21(gl_FragCoord.xy*1.7+fract(t)*7.0)-0.5)/300.0;', // pre-tonemap dither kills banding
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

  function startWebGL(canvas) {
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false,
      premultipliedAlpha: false, powerPreference: 'low-power' }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) return false;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[cosmos] link error:', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'iResolution');
    var uTime = gl.getUniformLocation(prog, 'iTime');

    var W = 0, H = 0;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var cw = window.innerWidth, ch = window.innerHeight;
      // heavier ray-traced scene: cap the buffer harder so it stays smooth/cool.
      var scale = Math.min(1, Math.sqrt(1300000 / (cw * ch * dpr * dpr)));
      W = Math.max(1, Math.floor(cw * dpr * scale));
      H = Math.max(1, Math.floor(ch * dpr * scale));
      canvas.width = W; canvas.height = H;
      gl.viewport(0, 0, W, H);
    }
    resize();
    window.addEventListener('resize', resize);

    var last = performance.now();
    var clock = 0, raf = 0, running = true;
    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) clock += dt;
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, clock + 8.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (!reduce) { running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }
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
