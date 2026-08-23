/*
 * wallpaper.js — the live wallpaper for the "Orrery" computer (orrery.gifos.app).
 * Loaded automatically by the theme cascade (desktop only) — see gifos-themes.js.
 *
 * A moving solar system. A turbulent sun sits at the centre; six planets orbit
 * it in real time on a gently tilted ecliptic, each at its own Kepler-ish speed
 * (inner worlds sweep fast, outer ones crawl). Every planet is a lit sphere —
 * its day/night terminator always faces the sun, so as a world rounds its orbit
 * you watch the lit crescent swing around it. Depth is honest: a planet on the
 * near arc passes IN FRONT of the sun, one on the far arc slides BEHIND it, and
 * the sun's corona glows over whatever is near it. Faint orbit rings, a dusty
 * asteroid belt, a drifting starfield and a whisper of nebula fill the rest.
 *
 * It renders in one cheap per-frame WebGL pass (no bake): for each pixel we find
 * the frontmost body it lands on and shade only that one, so the fbm texture is
 * evaluated at most once per pixel. HDR is tone-mapped (ACES) at the end.
 *
 * The canvas is fixed at z-index 0 (pointer-events:none), so the menubar and
 * every desktop icon layer cleanly on top. Loaded by this theme's theme.js.
 *
 * One easter-egg interaction: TAP THE SUN (dead centre) and every planet
 * rattles on its orbit, the corona flares, and it all settles back over ~1.5s.
 * The hit-test runs on the document (the canvas takes no pointer events).
 *
 * Guards: honours prefers-reduced-motion (draws one still frame and stops),
 * pauses when hidden, caps buffer size, and falls back to a Canvas2D solar
 * system (then the CSS chrome gradient) if WebGL is unavailable.
 */
(function () {
  'use strict';
  if (window.__gifosOrrery) return; // idempotent (survives hot theme reloads)
  window.__gifosOrrery = true;

  var CANVAS_ID = 'gifos-orrery';
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
    'vec2 grad2(vec2 p){float h=hash21(p)*6.2831853;return vec2(cos(h),sin(h));}',
    'float gnoise(vec2 x){vec2 i=floor(x),f=fract(x);vec2 u=f*f*(3.0-2.0*f);',
    '  float a=dot(grad2(i),f);float b=dot(grad2(i+vec2(1,0)),f-vec2(1,0));',
    '  float c=dot(grad2(i+vec2(0,1)),f-vec2(0,1));float d=dot(grad2(i+vec2(1,1)),f-vec2(1,1));',
    '  return 0.5+0.7*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'vec3 rotX(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}',
    'vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}',
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<5;i++){v+=a*gnoise(p);p=m*p;a*=0.5;}return v;}'
  ].join('\n');

  // ---- one per-frame pass: the whole solar system -------------------------
  // Camera geometry: worlds live on the plane y=0 and orbit the origin. We tilt
  // the whole plane toward the viewer (rotX by TILT) so the round orbits read as
  // ellipses. cam.z carries depth (bigger = nearer), so a planet with cam.z>0 is
  // in FRONT of the sun (which sits at the origin, depth 0). Light at any planet
  // is normalize(-cam) — straight toward the sun — in the SAME basis as the
  // screen-space sphere normal, so the terminator is always physically right.
  var FRAG = [
    'precision highp float;',
    'uniform vec2  iResolution;',
    'uniform float iTime;',
    'uniform float iShake;',                  // tap the sun → planets rattle (1 on tap, decays to 0)
    NOISE,
    'const float TILT=0.55;',                // ecliptic tilt: orbits squash to sin(TILT)
    'const float S=0.44;',                   // world→screen scale
    'const float PP=0.10;',                  // gentle perspective
    'const float SUNR=0.115;',               // sun radius (world units)
    '',
    // six planets: orbit radius, world size, colour, texture kind
    // kind: 0 rocky · 1 banded gas giant · 2 earthlike · 3 icy
    'void planetDef(int i,out float R,out float sz,out vec3 col,out float kind){',
    '  if(i==0){R=0.24;sz=0.026;col=vec3(0.55,0.50,0.44);kind=0.0;}',
    '  else if(i==1){R=0.35;sz=0.040;col=vec3(0.86,0.70,0.44);kind=1.0;}',
    '  else if(i==2){R=0.49;sz=0.044;col=vec3(0.24,0.48,0.86);kind=2.0;}',
    '  else if(i==3){R=0.63;sz=0.034;col=vec3(0.80,0.36,0.20);kind=0.0;}',
    '  else if(i==4){R=0.83;sz=0.080;col=vec3(0.82,0.66,0.44);kind=1.0;}',
    '  else{R=1.03;sz=0.060;col=vec3(0.36,0.56,0.92);kind=3.0;}}',
    'float planetAngle(int i,float R){return iTime*(0.34/pow(R,1.5))+float(i)*1.7;}',
    // a decaying in-plane rattle: each world jitters on its own phase/frequency
    // when the sun is tapped, then settles back onto its orbit as iShake fades.
    'vec3 shakeOf(int i){if(iShake<=0.001)return vec3(0.0);float ph=float(i)*2.3;',
    '  return vec3(sin(iTime*38.0+ph),0.0,cos(iTime*33.0+ph*1.6))*iShake*0.045;}',
    'vec3 toCam(vec3 w){return vec3(w.x,-sin(TILT)*w.z,cos(TILT)*w.z);}', // tilt the ecliptic
    '',
    // a compact 3-layer star field with a few bright, spiked stars
    'vec3 stars(vec2 uv){vec3 acc=vec3(0.0);',
    '  for(int l=0;l<3;l++){float sc=80.0+95.0*float(l);',
    '    vec2 g=uv*sc+float(l)*21.7;vec2 id=floor(g);vec2 f=fract(g)-0.5;',
    '    vec2 off=(vec2(hash21(id+1.7),hash21(id+9.1))-0.5)*0.75;',
    '    vec2 dd=f-off;float d=length(dd);',
    '    float br=pow(hash21(id+4.2),15.0)*2.0;',
    '    vec3 sc2=mix(vec3(0.7,0.8,1.0),vec3(1.0,0.9,0.75),hash21(id+2.9));',
    '    acc+=sc2*br*exp(-d*d*sc*1.5);',
    '    float big=max(br-0.9,0.0);',
    '    acc+=sc2*big*0.25*(exp(-abs(dd.x)*sc*0.9)*exp(-abs(dd.y)*sc*7.0)',
    '                      +exp(-abs(dd.y)*sc*0.9)*exp(-abs(dd.x)*sc*7.0));',
    '  }return acc;}',
    '',
    // shade the sun disc: granulated plasma, limb-darkened, pushed into HDR
    'vec3 shadeSun(vec2 lp){float r=length(lp);',
    '  float f=fbm(lp*4.0+iTime*0.05)*0.6+fbm(lp*9.0-iTime*0.03)*0.4;',
    '  vec3 c=mix(vec3(1.0,0.42,0.10),vec3(1.0,0.93,0.65),f);',
    '  c*=1.25-0.45*r*r;',                                    // limb darkening
    '  c=mix(c,c*vec3(0.9,0.55,0.3),smoothstep(0.55,0.95,fbm(lp*6.0+3.1))*0.4);', // spots
    '  return c*3.2;}',
    '',
    // shade a lit planet sphere. lp = screen offset / radius (−1..1); cam = the
    // planet centre in camera space (for the light direction); i/kind pick texture
    'vec3 shadePlanet(vec2 lp,vec3 cam,int i,vec3 base,float kind){',
    '  float rr=dot(lp,lp);float nz=sqrt(max(0.0,1.0-rr));',
    '  vec3 n=vec3(lp,nz);',                                  // screen-space normal (= cam basis)
    '  vec3 L=normalize(-cam);',                              // toward the sun
    '  float dif=max(dot(n,L),0.0);',
    '  float R;float sz;vec3 c0;float k;planetDef(i,R,sz,c0,k);',
    '  vec3 rn=rotY(rotX(n,0.5),iTime*(0.5/pow(R,1.5))+float(i));', // the planet spins
    '  float h=fbm(rn.xy*4.0+rn.z*2.0);',
    '  vec3 c=base;',
    '  if(kind<0.5){c=mix(base*0.6,base*1.2,h);}',                                  // rocky mottle
    '  else if(kind<1.5){float band=0.85+0.15*sin(rn.y*11.0+fbm(rn.xy*4.0)*3.0);',  // gas-giant bands
    '    c=mix(base*vec3(0.75,0.6,0.5),base*vec3(1.05,1.02,0.9),band);c*=0.9+0.2*h;}',
    '  else if(kind<2.5){float land=smoothstep(0.52,0.62,h);',                      // earthlike: sea + land + cloud
    '    c=mix(vec3(0.05,0.20,0.45),vec3(0.15,0.42,0.18),land);',
    '    c=mix(c,vec3(0.55,0.42,0.28),smoothstep(0.72,0.85,h));',
    '    float cloud=smoothstep(0.58,0.80,fbm(rn.xy*6.0+rn.z*3.0+iTime*0.02));',
    '    c=mix(c,vec3(0.95),cloud*0.6);}',
    '  else{c=mix(base*0.85,vec3(0.92,0.96,1.0),smoothstep(0.45,0.75,h));}',        // icy
    '  float term=smoothstep(-0.15,0.35,dot(n,L));',          // soft terminator
    '  vec3 col=c*(0.05+1.15*term);',
    '  float fres=pow(1.0-nz,3.0);',
    '  if(kind>1.5&&kind<2.5)col+=vec3(0.25,0.45,0.95)*fres*(0.25+0.6*term);',      // earth blue rim
    '  if(kind>2.5)col+=vec3(0.5,0.7,1.0)*fres*(0.15+0.4*term);',                   // icy rim
    '  col*=0.85+0.15*nz;',                                   // limb darkening
    '  col+=base*vec3(0.10,0.12,0.22)*(1.0-term)*0.4;',       // faint ambient on the night side
    '  return col;}',
    '',
    'void main(){',
    '  vec2 uvp=(gl_FragCoord.xy-0.5*iResolution.xy)/iResolution.y;',
    '  float t=iTime;',
    '',
    '  // ---- background: nebula wash + drifting stars ----',
    '  float neb=fbm(uvp*2.2+vec2(t*0.005,0.0));',
    '  vec3 col=vec3(0.006,0.010,0.028);',
    '  col+=mix(vec3(0.02,0.03,0.09),vec3(0.10,0.03,0.07),smoothstep(0.3,0.9,uvp.x+0.5))*neb*0.6;',
    '  col+=stars(uvp+vec2(t*0.004,0.0))*(1.0-neb*0.5);',
    '',
    '  // ---- faint orbit rings + asteroid belt (unproject the pixel to the plane) ----',
    '  float wx=uvp.x/S;float wz=-uvp.y/(S*sin(TILT));',
    '  float pr=sqrt(wx*wx+wz*wz);float pa=atan(wz,wx);',
    '  for(int i=0;i<6;i++){float R;float sz;vec3 c0;float k;planetDef(i,R,sz,c0,k);',
    '    col+=vec3(0.20,0.30,0.55)*smoothstep(0.010,0.0,abs(pr-R))*0.12;}',
    '  float belt=smoothstep(0.055,0.0,abs(pr-0.73));',
    '  float grit=smoothstep(0.55,0.95,fbm(vec2(pa*7.0+t*0.15,pr*40.0)));',
    '  col+=vec3(0.5,0.42,0.34)*belt*grit*0.35;',
    '',
    '  // ---- find the frontmost body this pixel lands on ----',
    '  int hitP=-1;vec2 hitCen=vec2(0.0);float hitRad=0.0;vec3 hitCam=vec3(0.0);',
    '  float bestClose=-1e9;',
    '  for(int i=0;i<6;i++){float R;float sz;vec3 c0;float k;planetDef(i,R,sz,c0,k);',
    '    float a=planetAngle(i,R);',
    '    vec3 cam=toCam(vec3(cos(a)*R,0.0,sin(a)*R)+shakeOf(i));', // rattle when the sun is tapped
    '    float persp=1.0/(1.0-cam.z*PP);',
    '    vec2 cen=vec2(cam.x,cam.y)*S*persp;float rad=sz*S*persp;',
    '    vec2 dd=uvp-cen;',
    '    if(dot(dd,dd)<rad*rad&&cam.z>bestClose){bestClose=cam.z;hitP=i;hitCen=cen;hitRad=rad;hitCam=cam;}',
    '  }',
    '  vec2 sd=uvp;float sunRad=SUNR*S;bool sunHit=dot(sd,sd)<sunRad*sunRad;',
    '',
    '  // sun sits at depth 0; a planet with cam.z>0 is nearer, so it wins',
    '  if(hitP>=0&&(!sunHit||bestClose>0.0)){',
    '    float R;float sz;vec3 c0;float k;planetDef(hitP,R,sz,c0,k);',
    '    col=shadePlanet((uvp-hitCen)/hitRad,hitCam,hitP,c0,k);',
    '  }else if(sunHit){',
    '    col=shadeSun(sd/sunRad);',
    '  }',
    '',
    '  // ---- sun corona + bloom, added OVER the bodies so it glows around them ----',
    '  float dsun=length(sd);',
    '  float cor=sunRad/max(dsun,1e-3);',
    '  col+=vec3(1.0,0.62,0.28)*pow(cor,1.7)*0.35;',
    '  col+=vec3(1.0,0.82,0.5)*pow(cor,3.2)*0.30;',
    '  col+=vec3(1.0,0.55,0.2)*exp(-dsun*3.4)*0.30;',
    '  col+=vec3(0.6,0.75,1.0)*exp(-dsun*1.3)*0.05;',        // wide cool fill
    '  col+=vec3(1.0,0.72,0.35)*pow(cor,2.0)*iShake*0.55;',  // a flare kicks off the tap
    '',
    '  // ---- exposure, vignette, tonemap, grain ----',
    '  float vig=smoothstep(1.4,0.25,length(uvp));',
    '  col*=0.72+0.28*vig;',
    '  col+=(hash21(gl_FragCoord.xy*1.7+fract(t)*7.0)-0.5)/300.0;',
    '  col=aces(col*1.05);',
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
      console.warn('[orrery] shader error:', gl.getShaderInfoLog(s));
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
      console.warn('[orrery] link error:', gl.getProgramInfoLog(prog));
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
    var prog = link(gl, vs, FRAG);
    if (!prog) return false;

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'iResolution');
    var uTime = gl.getUniformLocation(prog, 'iTime');
    var uShake = gl.getUniformLocation(prog, 'iShake');

    var W = 0, H = 0;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = window.innerWidth, ch = window.innerHeight;
      // the per-frame pass is cheap, but cap total pixels so weak GPUs cope
      var scale = Math.min(1, Math.sqrt(1700000 / (cw * ch * dpr * dpr)));
      W = Math.max(1, Math.floor(cw * dpr * scale));
      H = Math.max(1, Math.floor(ch * dpr * scale));
      canvas.width = W; canvas.height = H;
    }
    resize();
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { resize(); kick(); }, 200);
    });

    var last = performance.now();
    var clock = 6.0, raf = 0, running = true, drewStill = false, shake = 0;

    // Tap the sun → slam this to 1; it decays back to 0 over ~1.5s (see frame).
    window.__gifosOrreryShake = function () { shake = 1; kick(); };

    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) clock += dt;
      shake = shake > 0.002 ? shake * Math.exp(-dt * 3.2) : 0; // exponential settle
      gl.useProgram(prog);
      gl.viewport(0, 0, W, H);
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, clock);
      gl.uniform1f(uShake, shake);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // reduced motion: one still frame, then hold (but keep animating a live shake)
      if (reduce && shake <= 0) { drewStill = true; return; }
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (running && !raf && !(reduce && drewStill)) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    kick();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      else { running = true; drewStill = false; kick(); }
    });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); running = false; }, false);
    return true;
  }

  // ---- Canvas2D fallback: a simple animated solar system -------------------
  function startCanvas2D(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    var W, H, stars = [];
    var planets = [
      { R: 0.10, s: 4, c: '#8c8070', sp: 1.60 },
      { R: 0.15, s: 6, c: '#dbb46f', sp: 1.15 },
      { R: 0.21, s: 6, c: '#3d7ad8', sp: 0.85 },
      { R: 0.27, s: 5, c: '#cc5a33', sp: 0.66 },
      { R: 0.36, s: 12, c: '#d1a771', sp: 0.42 },
      { R: 0.45, s: 10, c: '#5c8fe8', sp: 0.30 }
    ];
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.floor(window.innerWidth * dpr);
      H = canvas.height = Math.floor(window.innerHeight * dpr);
      stars = [];
      var n = Math.min(420, Math.floor((W * H) / 7000));
      for (var i = 0; i < n; i++) stars.push({
        x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.28
      });
    }
    resize();
    window.addEventListener('resize', resize);
    var t0 = performance.now(), running = true, raf = 0, shake = 0, lastN = t0;
    window.__gifosOrreryShake = function () { shake = 1; if (!raf && running) raf = requestAnimationFrame(frame); };
    function frame(now) {
      raf = 0; if (!running) return;
      var t = (now - t0) / 1000;
      var dt = Math.min(0.05, (now - lastN) / 1000); lastN = now;
      shake = shake > 0.002 ? shake * Math.exp(-dt * 3.2) : 0;
      ctx.fillStyle = '#04030a'; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], tw = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
        ctx.fillStyle = 'rgba(220,230,255,' + (0.3 + 0.5 * tw) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      }
      var cx = W / 2, cy = H / 2, unit = Math.min(W, H), flat = 0.5;
      ctx.strokeStyle = 'rgba(90,140,220,0.10)';
      for (var o = 0; o < planets.length; o++) {
        ctx.beginPath(); ctx.ellipse(cx, cy, planets[o].R * unit, planets[o].R * unit * flat, 0, 0, 6.2832); ctx.stroke();
      }
      var sunR = 0.055 * unit;
      var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 3.2);
      sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(0.25, 'rgba(255,170,60,0.9)');
      sg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, sunR * 3.2, 0, 6.2832); ctx.fill();
      for (var q = 0; q < planets.length; q++) {
        var pl = planets[q], a = reduce ? q * 1.7 : t * pl.sp + q * 1.7;
        var px = cx + Math.cos(a) * pl.R * unit, py = cy + Math.sin(a) * pl.R * unit * flat;
        if (shake > 0) { px += shake * 10 * Math.sin(t * 40 + q * 2.3); py += shake * 10 * Math.cos(t * 34 + q * 1.6); }
        ctx.fillStyle = pl.c; ctx.beginPath(); ctx.arc(px, py, pl.s, 0, 6.2832); ctx.fill();
      }
      if (!reduce || shake > 0) raf = requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (!reduce) { running = true; if (!raf) raf = requestAnimationFrame(frame); }
    });
    return true;
  }

  // Tap the sun (dead centre of the screen) and every planet rattles on its
  // orbit. The wallpaper canvas is pointer-events:none, so we hit-test on the
  // document instead: a tap within the sun disc (radius = SUNR*S of the short
  // side, plus a touch-friendly pad) that ISN'T on a real icon/button fires it.
  function armSunTap() {
    document.addEventListener('pointerdown', function (e) {
      if (!window.__gifosOrreryShake) return;
      if (e.target && e.target.closest && e.target.closest('.icon, button, a, input, select, textarea, [role="button"]')) return;
      var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var rad = 0.115 * 0.44 * window.innerHeight + 24; // sun disc in px + touch pad
      if (dx * dx + dy * dy <= rad * rad) window.__gifosOrreryShake();
    }, true);
  }

  whenBody(function () {
    var canvas = makeCanvas();
    armSunTap();
    try { if (startWebGL(canvas)) return; } catch (e) { console.warn('[orrery] webgl failed:', e); }
    try { if (startCanvas2D(canvas)) return; } catch (e2) { console.warn('[orrery] canvas2d failed:', e2); }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  });
})();
