/*
 * space.js — the live wallpaper for the "David Welk" computer (davidwelk.gifos.app).
 *
 * A single full-screen WebGL fragment shader renders a whole cosmos behind the
 * Home Screen: layered parallax starfield, a domain-warped nebula, a faux-3D
 * shaded planet with a day/night terminator and an atmosphere rim, a distant
 * sun with bloom, and the occasional shooting star — all drifting on a slow
 * camera. No dependencies, no external assets: it's math on the GPU.
 *
 * It sits in a fixed canvas at z-index 0 (pointer-events:none), so the menubar
 * and every desktop icon layer cleanly on top. Loaded by this theme's theme.js.
 *
 * Behaviour guards: honours prefers-reduced-motion (renders one still frame),
 * pauses when the tab is hidden, caps the render buffer for battery/perf, and
 * falls back to a lightweight Canvas2D starfield if WebGL is unavailable — and
 * to the CSS chrome gradient if even that fails.
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
      // Behind everything: menubar is z-index 5, icons live in #desktop above it.
      document.body.insertBefore(c, document.body.firstChild);
    }
    return c;
  }

  // ---- the scene, as one GLSL fragment shader -----------------------------
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

  var FRAG = [
    'precision highp float;',
    'uniform vec2  iResolution;',
    'uniform float iTime;',
    '',
    'float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float hash31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    '',
    // value noise + fractal brownian motion
    'float vnoise(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);',
    '  float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));',
    '  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<6;i++){v+=a*vnoise(p);p=m*p;a*=0.5;}return v;}',
    '',
    // twinkling, parallaxing star layers (bright layers get diffraction spikes)
    'float starLayer(vec2 uv,float scale,float speed,float thresh,float ray,float t){',
    '  vec2 gv=uv*scale+vec2(t*speed,t*speed*0.3);',
    '  vec2 id=floor(gv);vec2 f=fract(gv)-0.5;',
    '  float n=hash21(id);',
    '  float on=step(thresh,n);',
    '  vec2 off=(vec2(hash21(id+1.7),hash21(id+9.1))-0.5)*0.7;',
    '  vec2 fp=f-off;',
    '  float d=length(fp);',
    '  float core=smoothstep(0.05,0.0,d);',
    '  float glow=smoothstep(0.40,0.0,d)*0.3;',
    '  float rays=0.0;',
    '  if(ray>0.0){',
    '    float rx=smoothstep(0.006,0.0,abs(fp.y))*smoothstep(0.34,0.0,abs(fp.x));',
    '    float ry=smoothstep(0.006,0.0,abs(fp.x))*smoothstep(0.34,0.0,abs(fp.y));',
    '    rays=(rx+ry)*ray;',
    '  }',
    '  float tw=0.5+0.5*sin(t*2.5+n*40.0);',
    '  return on*(core+glow+rays)*tw;}',
    '',
    'vec3 stars(vec2 uv,float t){',
    '  float s=0.0;',
    '  s+=starLayer(uv, 8.0,0.016,0.980,0.6,t)*1.0;',   // sparse, bright, spiked
    '  s+=starLayer(uv,16.0,0.030,0.986,0.25,t)*0.8;',
    '  s+=starLayer(uv,30.0,0.048,0.990,0.0,t)*0.6;',
    '  s+=starLayer(uv,58.0,0.075,0.994,0.0,t)*0.45;',  // dense dust
    '  vec3 cool=vec3(0.72,0.83,1.0);',
    '  vec3 warm=vec3(1.0,0.9,0.78);',
    '  float tint=hash21(floor(uv*18.0));',
    '  return s*mix(cool,warm,tint);}',
    '',
    // colourful nebula via domain-warped fbm — high contrast, dark voids, hot cores
    'vec3 nebula(vec2 uv,float t){',
    '  vec2 p=uv*2.3+vec2(t*0.008,-t*0.006);',
    '  vec2 q=vec2(fbm(p),fbm(p+vec2(3.1,1.7)));',
    '  vec2 r=vec2(fbm(p+2.2*q+vec2(1.7,9.2)),fbm(p+2.2*q+vec2(8.3,2.8)));',
    '  float f=fbm(p+3.4*r);',
    '  float voids=smoothstep(0.22,0.86,fbm(uv*1.05+vec2(4.0,2.0)));', // vast dark gaps
    '  float density=pow(smoothstep(0.28,0.82,f),1.25)*voids;',
    '  vec3 violet=vec3(0.20,0.06,0.44);',
    '  vec3 magenta=vec3(0.66,0.10,0.52);',
    '  vec3 teal=vec3(0.03,0.30,0.55);',
    '  vec3 gold=vec3(0.95,0.62,0.35);',
    '  vec3 col=mix(violet,teal,smoothstep(0.15,0.9,r.x));',
    '  col=mix(col,magenta,smoothstep(0.35,1.0,q.y));',
    '  col=mix(col,gold,pow(density,3.0)*0.55);',      // hot cores burn gold-pink
    '  col+=vec3(0.7,0.5,0.95)*pow(density,2.0)*0.8;',
    '  return col*density;}',
    '',
    // a distant sun with soft bloom
    'vec3 sun(vec2 uv,vec2 c,float aspect){',
    '  vec2 d=(uv-c);d.x*=aspect;',
    '  float r=length(d);',
    '  float core=smoothstep(0.06,0.0,r);',
    '  float bloom=smoothstep(0.6,0.0,r);',
    '  return vec3(1.0,0.93,0.82)*(core*1.4+bloom*bloom*0.5);}',
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/iResolution.xy;',
    '  float aspect=iResolution.x/iResolution.y;',
    '  float t=iTime;',
    '  // slow camera drift for parallax / life',
    '  vec2 cam=vec2(sin(t*0.04)*0.03,cos(t*0.03)*0.02);',
    '  vec2 suv=uv+cam;',
    '',
    '  vec3 col=vec3(0.01,0.012,0.03);',              // deep space base
    '  col+=nebula(suv,t)*1.5;',
    '  col+=stars((suv-0.5)*vec2(aspect,1.0)+0.5,t);',
    '',
    '  vec2 sunPos=vec2(0.18,0.86);',
    '  col+=sun(suv,sunPos,aspect);',
    '',
    '  // ---- faux-3D planet (bottom-right, large, for scale) ----',
    '  vec2 pc=vec2(0.86,0.16)+cam*0.5;',            // planet centre
    '  float pr=0.40;',                              // planet radius (uv-height units)',
    '  vec2 d=(uv-pc);d.x*=aspect;',
    '  float rr=length(d)/pr;',
    '  vec3 lightDir=normalize(vec3((sunPos-pc)*vec2(aspect,1.0),0.65));',
    '  if(rr<1.0){',
    '    vec3 n=vec3(d/pr,sqrt(max(0.0,1.0-rr*rr)));',
    '    // rotate surface coords over time for a spinning globe',
    '    float rot=t*0.05;',
    '    vec3 sp=vec3(n.x*cos(rot)-n.z*sin(rot),n.y,n.x*sin(rot)+n.z*cos(rot));',
    '    float bands=fbm(sp.xy*3.0+vec2(sp.z*2.0,rot));',
    '    float land=fbm(sp.xy*6.0+10.0);',
    '    vec3 base=mix(vec3(0.10,0.16,0.34),vec3(0.16,0.38,0.30),smoothstep(0.4,0.7,land));',
    '    base=mix(base,vec3(0.55,0.45,0.30),smoothstep(0.62,0.8,bands)*0.6);',
    '    float diff=clamp(dot(n,lightDir),0.0,1.0);',
    '    float night=smoothstep(0.0,0.25,diff);',
    '    // city lights on the dark side',
    '    float cities=step(0.75,fbm(sp.xy*22.0))*(1.0-night);',
    '    float rim=pow(1.0-n.z,3.0);',
    '    vec3 atmos=vec3(0.35,0.6,1.0);',
    '    vec3 pcol=base*(0.04+diff)+atmos*rim*diff*1.05;',
    '    pcol+=vec3(1.0,0.85,0.5)*cities*0.55;',
    '    // terminator glow',
    '    pcol+=atmos*smoothstep(0.16,0.0,abs(diff-0.12))*0.22;',
    '    col=pcol;',
    '  }',
    '  // atmosphere halo just outside the disc (additive)',
    '  float halo=smoothstep(1.3,1.0,rr)*smoothstep(0.92,1.02,rr);',
    '  col+=vec3(0.3,0.55,1.0)*halo*0.8;',
    '',
    '  // ---- shooting star: a fine streak with a glowing head, fades in/out ----',
    '  float slot=floor(t/7.0);',
    '  float lt=fract(t/7.0);',
    '  vec2 ss0=vec2(0.08+0.5*hash21(vec2(slot,1.0)),0.66+0.28*hash21(vec2(slot,2.0)));',
    '  vec2 dir=normalize(vec2(0.86,-0.5));',
    '  vec2 head=ss0+dir*lt*1.4;',
    '  vec2 rel=(uv-head);rel.x*=aspect;',
    '  float along=dot(rel,dir);',
    '  float perp=length(rel-dir*along);',
    '  float tail=smoothstep(0.0,-0.16,along);',
    '  float body=smoothstep(0.0016,0.0,perp)*tail;',
    '  float headGlow=smoothstep(0.026,0.0,length(rel));',
    '  float appear=smoothstep(0.0,0.04,lt)*smoothstep(1.0,0.55,lt);',
    '  col+=vec3(0.9,0.95,1.0)*(body*0.7+headGlow*1.3)*appear;',
    '',
    '  // keep the icon field readable: gentle central darkening + vignette',
    '  float vig=smoothstep(1.25,0.35,length((uv-0.5)*vec2(aspect,1.0)));',
    '  col*=0.55+0.45*vig;',
    '  col*=1.0-0.25*smoothstep(0.7,0.0,length(uv-vec2(0.42,0.55)));',
    '',
    '  // filmic-ish tonemap + dither to kill banding',
    '  col=col/(col+vec3(0.85));',
    '  col=pow(col,vec3(0.9));',
    '  float dither=(hash21(gl_FragCoord.xy)-0.5)/255.0;',
    '  gl_FragColor=vec4(col+dither,1.0);',
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
      // cap the render buffer so big/hi-dpi screens stay smooth and cool.
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var cw = window.innerWidth, ch = window.innerHeight;
      var scale = Math.min(1, Math.sqrt(2300000 / (cw * ch * dpr * dpr)));
      W = Math.max(1, Math.floor(cw * dpr * scale));
      H = Math.max(1, Math.floor(ch * dpr * scale));
      canvas.width = W; canvas.height = H;
      gl.viewport(0, 0, W, H);
    }
    resize();
    window.addEventListener('resize', resize);

    var start = performance.now();
    var last = start;
    var clock = 0;         // accumulated seconds (pauses when hidden)
    var raf = 0, running = true;

    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) clock += dt;
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, clock + 8.0); // offset so the opening frame is pretty
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
        z: 0.3 + Math.random() * 1.7, r: Math.random() * 1.4 + 0.3,
        p: Math.random() * 6.28
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
      blob(W * 0.25, H * 0.2, Math.max(W, H) * 0.45, 'rgba(90,40,140,0.20)');
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
    try {
      if (startWebGL(canvas)) return;
    } catch (e) { console.warn('[cosmos] webgl failed:', e); }
    try {
      if (startCanvas2D(canvas)) return;
    } catch (e2) { console.warn('[cosmos] canvas2d failed:', e2); }
    // Both failed: drop the canvas and let the CSS chrome gradient stand in.
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  });
})();
