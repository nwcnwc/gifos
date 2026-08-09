// Anyroad — the renderer.
//
// Hand-rolled WebGL: no framework travels inside the GIF, and a driving game
// needs exactly five materials, so a library would be almost entirely dead
// weight. Shaders are GLSL ES 1.00, which both WebGL1 and WebGL2 accept — the
// only thing WebGL2 buys us here is 32-bit indices without an extension.
//
// Fog is not decoration. Tiles stream in at the horizon, and without a fog band
// to arrive behind, the world visibly pops into existence a tile at a time.
(function (root) {
  'use strict';

  // ---- a very small mat4 ---------------------------------------------------
  function mat4() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }

  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0]=f/aspect; out[1]=0; out[2]=0;  out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
    return out;
  }

  // NOTE THE FLIPPED X AXIS. Our world is x=east, y=up, z=north, which is a
  // LEFT-handed basis — right-handed would need z=south. Feeding it to the
  // standard right-handed lookAt renders every scene MIRRORED: measured with the
  // real camera, a point due EAST projected to the LEFT of screen. Manhattan
  // came out back to front, and a genuine right turn (yaw rotating north toward
  // east) appeared on screen as a left turn — which is exactly what "the
  // steering seems opposite" was.
  //
  // Negating the view's X row flips the image back. Handedness is a property of
  // the basis, so the alternative was renumbering the world (z=south) and
  // re-deriving every triangle winding in the app; this is the same correction
  // in one line. It DOES invert projected winding, so the front-face rule is
  // flipped to match in init() — see gl.frontFace(gl.CW).
  function lookAt(out, eye, centre, up) {
    var zx=eye[0]-centre[0], zy=eye[1]-centre[1], zz=eye[2]-centre[2];
    var zl=Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
    var xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    var xl=Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
    // y comes from the ORIGINAL x, so the frame stays orthonormal…
    var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    // …and only then is x flipped, which mirrors screen-x and nothing else.
    xx = -xx; xy = -xy; xz = -xz;
    out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
    out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
    out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
    out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    out[15]=1;
    return out;
  }

  function multiply(out, a, b) {
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      out[i*4+j] = a[j]*b[i*4] + a[4+j]*b[i*4+1] + a[8+j]*b[i*4+2] + a[12+j]*b[i*4+3];
    }
    return out;
  }

  // Model matrix for a car: yaw about Y, then pitch/roll to sit on the ground.
  function carMatrix(out, x, y, z, yaw, pitch, roll) {
    var cy=Math.cos(yaw), sy=Math.sin(yaw);
    var cp=Math.cos(pitch), sp=Math.sin(pitch);
    var cr=Math.cos(roll), sr=Math.sin(roll);
    // R = Ry * Rx * Rz, column-major.
    out[0]=cy*cr+sy*sp*sr; out[1]=cp*sr;  out[2]=-sy*cr+cy*sp*sr; out[3]=0;
    out[4]=-cy*sr+sy*sp*cr; out[5]=cp*cr; out[6]=sy*sr+cy*sp*cr;  out[7]=0;
    out[8]=sy*cp;          out[9]=-sp;    out[10]=cy*cp;          out[11]=0;
    out[12]=x; out[13]=y; out[14]=z; out[15]=1;
    return out;
  }

  // ---- shader plumbing -----------------------------------------------------
  var gl = null, isGL2 = false, canvas = null;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src);
    }
    return s;
  }

  function program(vsrc, fsrc) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    var wrap = { id: p, a: {}, u: {} };
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < na; i++) { var an = gl.getActiveAttrib(p, i).name; wrap.a[an] = gl.getAttribLocation(p, an); }
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var j = 0; j < nu; j++) { var un = gl.getActiveUniform(p, j).name.replace('[0]', ''); wrap.u[un] = gl.getUniformLocation(p, un); }
    return wrap;
  }

  // One shared filmic curve. Every material now adds highlights the old flat
  // shading never produced — sun glare, glass, wet paint — and without a
  // roll-off they clip to white and the picture reads as blown out rather than
  // bright. Kept apart from FOG because the SKY needs it and has no vDist: a
  // varying declared in a fragment shader with no vertex counterpart is a link
  // error on some drivers, so the two cannot be one block.
  var TONEMAP = [
    // 1.35 is EXPOSURE, and it is not a taste knob — the curve maps 1.0 to about
    // 0.8, so dropping it in front of art that was authored against a linear
    // clamp darkens the entire picture by a fifth. Measured on the fixture
    // world: without it a shaded building wall went from mid-brown to mud.
    'vec3 tonemap(vec3 c) {',
    '  c = max(c, 0.0) * 1.35;',
    '  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);',
    '  return pow(clamp(c, 0.0, 1.0), vec3(0.90));',
    '}',
  ].join('\n');

  var FOG = [
    TONEMAP,
    'uniform vec3 uFogColor;',
    'uniform float uFogDensity;',
    'varying float vDist;',
    // Aerial perspective is not just "mix toward grey with distance": real air
    // eats contrast and saturation before it eats the colour, and doing the
    // desaturation FIRST is what stops a distant hillside from reading as a
    // near hillside behind tinted glass.
    'vec3 fogged(vec3 c) {',
    '  float f = clamp(1.0 - exp(-vDist * uFogDensity), 0.0, 1.0);',
    '  float lum = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = mix(c, vec3(lum), f * 0.35);',
    '  return mix(c, uFogColor, f);',
    '}',
    // What every material ends with: fog, then the curve, in that order — the
    // horizon has to roll off with everything else or it is the one part of the
    // picture that still clips.
    'vec3 finish(vec3 c) { return tonemap(fogged(c)); }',
  ].join('\n');

  // Shared lighting. ONE sun, and — the part that matters — a HEMISPHERE for
  // everything the sun does not reach: sky colour from above, warm ground
  // bounce from below. The old model was `0.55 + 0.55 * lambert`, i.e. a flat
  // grey fill, which is why every shadowed wall in the app was the same dead
  // tone as every shadowed hillside. Real shade is blue, and a surface facing
  // down picks up the ground under it; two mixes buy nearly all of that.
  var LIGHTING = [
    'uniform vec3 uSunColor; uniform vec3 uSkyFill; uniform vec3 uGroundFill;',
    'vec3 shade(vec3 base, vec3 n, vec3 l) {',
    '  float lam = clamp(dot(n, l), 0.0, 1.0);',
    // Wrapped a little: a hard terminator on stylised geometry reads as a
    // rendering artefact rather than as light.
    '  lam = clamp((lam + 0.12) / 1.12, 0.0, 1.0);',
    '  vec3 amb = mix(uGroundFill, uSkyFill, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));',
    '  return base * (amb + uSunColor * lam);',
    '}',
  ].join('\n');

  // Value noise, shared by the sky. Cheap, and the only thing standing between
  // a flat blue gradient and a sky with weather in it.
  // Value noise, shared by the sky and the ground. NOTE THE HASH: a phone is
  // the target, this runs per pixel over most of the screen, and the usual
  // fract(sin(dot(…))*43758) costs a transcendental EVERY corner of EVERY
  // octave — four hashes per octave, three octaves, twice over, and the
  // fragment stage is suddenly the frame budget. The dot/fract hash below is a
  // handful of multiply-adds for the same visual result at this scale. Octave
  // counts are deliberately small for the same reason: three, never eight.
  var NOISE = [
    'float h21(vec2 p){',
    '  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));',
    '  q += dot(q, q.yzx + 33.33);',
    '  return fract((q.x + q.y) * q.z);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = h21(i), b = h21(i + vec2(1.0, 0.0));',
    '  float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    'float fbm2(vec2 p){ return vnoise(p) * 0.65 + vnoise(p * 2.13 + 5.7) * 0.35; }',
    'float fbm(vec2 p){',
    '  return vnoise(p) * 0.53 + vnoise(p * 2.07 + 3.1) * 0.30 + vnoise(p * 4.11 + 9.4) * 0.17;',
    '}',
  ].join('\n');

  var progs = {};

  function buildPrograms() {
    // --- terrain: lit, shaded by slope and height, optionally photo-draped ---
    progs.terrain = program([
      'attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUv;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying vec3 vNormal; varying vec2 vUv; varying float vDist; varying float vHeight;',
      'varying vec2 vWorldXZ;',
      'void main(){',
      '  vNormal = aNormal; vUv = aUv; vHeight = aPos.y; vWorldXZ = aPos.xz;',
      '  vDist = length(aPos - uEye);',
      '  gl_Position = uViewProj * vec4(aPos, 1.0);',
      '}',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uLightDir; uniform sampler2D uTex; uniform float uHasTex;',
      'uniform float uDrapeGround;',
      'varying vec3 vNormal; varying vec2 vUv; varying float vHeight; varying vec2 vWorldXZ;',
      NOISE, FOG, LIGHTING,
      'void main(){',
      '  vec3 n = normalize(vNormal);',
      '  float slope = 1.0 - clamp(n.y, 0.0, 1.0);',
      // Two octaves of cheap value noise. Terrarium posts are ~10 m apart, so
      // without this the ground is large flat facets of one identical green and
      // reads as painted cardboard however good the lighting is.
      '  vec2 p = vWorldXZ;',
      // DISTANCE GATE. Everything below is per-pixel detail on ground that, past
      // a few hundred metres, is fogged, desaturated and smaller than a pixel —
      // so at range it is not detail, it is aliasing you paid for. One branch,
      // coherent across the screen (it is a function of depth), and the whole
      // palette collapses to its mid-tone exactly where nobody can tell.
      '  float detail = 1.0 - smoothstep(420.0, 900.0, vDist);',
      '  float n1 = 0.5, n2 = 0.5, land = 0.5, patch = 0.5, strata = 0.5;',
      '  if (detail > 0.01) {',
      '    n1 = fract(sin(dot(floor(p / 7.0), vec2(127.1, 311.7))) * 43758.5453);',
      '    n2 = fract(sin(dot(floor(p / 31.0), vec2(269.5, 183.3))) * 43758.5453);',
      '    land = mix(0.5, fbm2(p * 0.0075), detail);',
      '    patch = mix(0.5, vnoise(p * 0.032 + 11.3), detail);',
      '    strata = mix(0.5, vnoise(vec2(p.x * 0.06 + vHeight * 0.05, p.y * 0.06)), detail);',
      '  }',
      '  float grain = ((n1 - 0.5) * 0.05 + (n2 - 0.5) * 0.035) * detail;',
      // WITHOUT the satellite drape this shader IS the landscape, and one green
      // with speckle on it is a golf course. Real ground at 100 m reads as
      // PATCHES — field, scrub, bare earth, a darker hollow — so two octaves of
      // smooth noise at field scale choose between four greens before any
      // lighting happens. It is four texture-free lookups and it is the single
      // biggest difference between "terrain mesh" and "countryside".
      // Two octaves for the big shapes, one for the small: the fine layer is
      // already at field scale and a second octave of it lands under a metre,
      // where the aggregate grain is doing the same job for free.
      '  vec3 grassA = vec3(0.19, 0.29, 0.14);',      // deep pasture
      '  vec3 grassB = vec3(0.37, 0.43, 0.21);',      // dry meadow
      '  vec3 grassC = vec3(0.27, 0.37, 0.17);',      // ordinary green
      '  vec3 earth  = vec3(0.35, 0.29, 0.19);',      // bare soil
      '  vec3 grass = mix(grassA, grassB, smoothstep(0.28, 0.74, land));',
      '  grass = mix(grass, grassC, smoothstep(0.28, 0.64, patch) * 0.70);',
      '  grass = mix(grass, earth, smoothstep(0.66, 0.90, patch) * 0.60);',
      // A darker seam where two patches meet, which is what a hedge line or a
      // field boundary looks like from a road.
      '  grass *= 1.0 - smoothstep(0.44, 0.50, patch) * (1.0 - smoothstep(0.50, 0.56, patch)) * 0.55;',
      // Higher ground is thinner and paler; the old single mix did this alone.
      '  grass = mix(grass, grass * vec3(1.10, 1.06, 0.98), clamp(vHeight / 1400.0, 0.0, 1.0));',
      '  grass *= 1.0 + grain * 2.2;',
      // Rock is banded rather than flat — strata catch the light on a cliff and
      // are most of why a mountain looks like stone and not like grey plastic.
      '  vec3 rock  = mix(vec3(0.36,0.33,0.30), vec3(0.50,0.47,0.43), strata) * (1.0 + grain);',
      '  vec3 snow  = vec3(0.86,0.88,0.92);',
      '  vec3 base = mix(grass, rock, smoothstep(0.18, 0.45, slope));',
      // Scree: where rock is about to take over, mix in loose stone rather than
      // stepping straight from meadow to cliff.
      '  base = mix(base, mix(base, rock, 0.6), smoothstep(0.12, 0.30, slope) * step(0.55, patch));',
      // Snowline high and narrow. At 1500 m a real driveable pass — Stelvio
      // tops out around 2750 m — renders as an unbroken white sheet with no
      // readable terrain in it at all.
      '  base = mix(base, snow, smoothstep(2450.0, 3100.0, vHeight) * (1.0 - smoothstep(0.5, 0.8, slope)));',
      '  vec3 photo = texture2D(uTex, vUv).rgb;',
      '  base = mix(base, photo, uHasTex * uDrapeGround);',
      // Cheap ambient occlusion in the folds: a hollow faces sideways more than
      // a ridge does, so the slope term doubles as a crease darkener and the
      // hills stop looking inflated.
      '  base *= mix(1.0, 0.86, smoothstep(0.25, 0.75, slope));',
      '  vec3 lit = shade(base, n, normalize(uLightDir));',
      // A PHOTOGRAPH ALREADY CONTAINS THE SUN THAT TOOK IT. Running our own
      // directional light over satellite imagery lights it twice — every slope
      // facing away goes to mud and the shadows in the photo get shadowed
      // again. Where the drape is on, flatten toward ambient and let the
      // picture carry its own light.
      '  vec3 flatLit = base * (uSkyFill + uSunColor * 0.62);',
      '  gl_FragColor = vec4(finish(mix(lit, flatLit, uHasTex * uDrapeGround * 0.75)), 1.0);',
      '}',
    ].join('\n'));

    // --- roads: flat tarmac with a centre line painted from the ribbon's uv ---
    progs.road = program([
      'attribute vec3 aPos; attribute vec2 aUv; attribute float aTone; attribute vec2 aRinfo;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying vec2 vUv; varying float vTone; varying float vDist; varying vec2 vRinfo;',
      'void main(){ vUv=aUv; vTone=aTone; vRinfo=aRinfo;',
      '  vDist=length(aPos-uEye); gl_Position=uViewProj*vec4(aPos,1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uLightDir;',
      'varying vec2 vUv; varying float vTone; varying vec2 vRinfo;',
      NOISE, FOG, LIGHTING,
      'void main(){',
      // Aggregate speckle, so tarmac at 100 km/h is a surface rather than a
      // flat grey ribbon with no sensation of movement over it.
      // Fine aggregate. vUv.x is in METRES along the way, so the cell size here
      // is a real size on the ground: at 3 per metre the speckle came out as
      // 30 cm tiles and the road read as a checkerboard. 14 per metre is chip.
      // Same distance gate as the terrain: chip aggregate 400 m down the road
      // is finer than a pixel, so it is not surface any more, it is shimmer.
      '  float detail = 1.0 - smoothstep(160.0, 420.0, vDist);',
      '  float g = 0.5, g2 = 0.5, wear = 0.5;',
      '  if (detail > 0.01) {',
      '    g = fract(sin(dot(floor(vec2(vUv.x * 14.0, vUv.y * 26.0)), vec2(127.1, 311.7))) * 43758.5453);',
      '    g2 = fract(sin(dot(floor(vec2(vUv.x * 3.5, vUv.y * 5.0)), vec2(269.5, 183.3))) * 43758.5453);',
      '    wear = vnoise(vec2(vUv.x * 0.045, vUv.y * 1.6));',
      '  }',
      '  g = mix(0.5, g, detail); g2 = mix(0.5, g2, detail);',
      // WHAT THE ROAD IS MADE OF. vRinfo.x is the OSM `surface` tag — sealed,
      // gravel, dirt or stone — which the parser never used to look at, so a
      // farm track through a field was drawn as asphalt with a painted centre
      // line down the middle of it.
      '  float surf = vRinfo.x;',
      '  float sealed = 1.0 - step(0.5, surf);',
      '  float gravel = step(0.5, surf) * step(surf, 1.5);',
      '  float dirt   = step(1.5, surf) * step(surf, 2.5);',
      '  float stone  = step(2.5, surf);',
      '  vec3 tarmac = vec3(0.21,0.21,0.23) * (0.62 + vTone) * (0.95 + 0.07 * g + 0.05 * g2);',
      // Gravel is pale and coarse; dirt is brown and rutted; stone is grey with
      // a joint pattern. All three take the aggregate noise at a much higher
      // amplitude than asphalt, because that IS the difference — a loose
      // surface is visibly made of pieces.
      '  vec3 loose = vec3(0.52,0.49,0.43) * (0.80 + 0.40 * g + 0.16 * g2);',
      '  vec3 mud   = vec3(0.40,0.31,0.22) * (0.84 + 0.30 * g + 0.20 * g2);',
      '  vec3 cobb  = vec3(0.34,0.33,0.34) * (0.86 + 0.26 * g2);',
      // The joints between setts: a grid at a real size on the ground.
      '  float joint = step(0.14, fract(vUv.x / 0.22)) * step(0.14, fract((vUv.y * 8.0) + step(0.5, fract(vUv.x / 0.44)) * 0.5));',
      '  cobb *= mix(0.70, 1.0, mix(1.0, joint, detail));',
      '  tarmac = mix(tarmac, loose, gravel);',
      '  tarmac = mix(tarmac, mud, dirt);',
      '  tarmac = mix(tarmac, cobb, stone);',
      // Ruts, on an unsealed road only: two bare wheel-worn channels with grass
      // or loose material between them. This is the shape that says "track".
      '  float rut = exp(-pow((abs(vUv.y - 0.5) - 0.22) * 9.0, 2.0));',
      '  tarmac *= mix(1.0, 0.78 + 0.34 * rut, max(gravel, dirt) * detail);',
      // WHEEL TRACKS. Traffic polishes two bands per carriageway and leaves the
      // crown and the gutter rough, and that pattern — not the aggregate — is
      // what the eye uses to read a road as used. Two soft darker strips either
      // side of the centre, faded out where the surface is a track rather than
      // a highway.
      '  float lane = abs(vUv.y - 0.5);',
      '  float tracks = exp(-pow((lane - 0.17) * 13.0, 2.0)) + exp(-pow((lane - 0.33) * 13.0, 2.0));',
      '  tarmac *= 1.0 - tracks * 0.10 * step(0.40, vTone);',
      // Patch repairs and staining: low-frequency blotches along the way, which
      // break up a kilometre of identical grey better than any amount of grain.
      '  tarmac *= 0.90 + 0.20 * wear;',
      // Kerb: a lighter band at both edges of the ribbon. Ascending edges — see
      // the sky shader: a descending smoothstep is undefined behaviour, and
      // this one had been quietly relying on it.
      '  float edge = 1.0 - smoothstep(0.45, 0.5, abs(vUv.y - 0.5));',
      '  tarmac = mix(tarmac * 1.30, tarmac, edge);',
      // Damp at the gutters where the water sits — a touch darker and glossier
      // right at the kerb line.
      '  tarmac *= 1.0 - smoothstep(0.40, 0.49, lane) * 0.12;',
      // Edge lines on everything, centre line on anything bigger than a lane.
      // The old rule painted a centre line only above tone 0.5, which excluded
      // residential streets — i.e. most of what you actually drive on — so the
      // roads had no markings at all where it mattered.
      '  float edgeLine = (1.0 - smoothstep(0.004, 0.013, abs(abs(vUv.y - 0.5) - 0.455)));',
      '  float mid = 1.0 - smoothstep(0.010, 0.026, abs(vUv.y - 0.5));',
      '  float dash = step(0.42, fract(vUv.x / 9.0));',
      // LANE DIVIDERS, from the `lanes` tag. A dual carriageway with a single
      // centre line is a two-lane road that happens to be twenty metres wide;
      // the lane count is what makes a motorway read as a motorway.
      '  float lanes = max(vRinfo.y, 1.0);',
      '  float lanePos = fract(vUv.y * lanes);',
      '  float inner = 1.0 - step(0.5, abs(vUv.y - 0.5) * 2.0 * lanes / max(lanes - 1.0, 1.0));',
      '  float divider = (1.0 - smoothstep(0.006, 0.016, min(lanePos, 1.0 - lanePos)))',
      '                * step(3.0, lanes) * step(0.50, vTone) * step(0.55, fract(vUv.x / 12.0 + 0.5));',
      '  float paint = max(max(mid * dash * step(0.45, vTone), edgeLine * 0.62), divider * 0.85);',
      // AND NONE OF IT ON A LOOSE SURFACE. Nobody paints a dashed centre line
      // down a farm track, and drawing one there was the single most obviously
      // wrong thing about the roads.
      '  paint *= sealed;',
      '  vec3 c = mix(tarmac, vec3(0.88,0.86,0.72), clamp(paint, 0.0, 1.0));',
      // Lit by the same sun and the same sky as everything else, with the road
      // surface facing up. Without this the tarmac is the one material in the
      // world that ignores the light, and it shows the moment the sky changes.
      '  gl_FragColor = vec4(finish(shade(c, vec3(0.0, 1.0, 0.0), normalize(uLightDir))), 1.0);',
      '}',
    ].join('\n'));

    // --- buildings: extrusions with floors, windows and a per-building colour ---
    // OSM gives a footprint and a height and nothing else, so everything that
    // makes these read as BUILDINGS rather than grey slabs is generated here:
    // storey bands from the height above each building's OWN base, window
    // columns from position along the wall, and a colour picked by a stable
    // per-building seed so a street has variety instead of one flat tone.
    progs.building = program([
      'attribute vec3 aPos; attribute vec3 aNormal; attribute float aTone; attribute vec3 aBinfo;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying vec3 vNormal; varying float vTone; varying float vDist;',
      'varying vec3 vWorld; varying vec3 vBinfo;',
      'void main(){ vNormal=aNormal; vTone=aTone; vWorld=aPos; vBinfo=aBinfo;',
      '  vDist=length(aPos-uEye); gl_Position=uViewProj*vec4(aPos,1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uLightDir; uniform vec3 uEye;',
      // The satellite drape, for ROOFS ONLY. Nadir imagery photographs roofs and
      // nothing else — there is not one pixel of facade in it — so this is the
      // only part of a building it can honestly colour. uTileRect is the parent
      // terrain tile's world-space rectangle (xWest, zNorth, xEast, zSouth);
      // the frame maps lat/lon to metres linearly, so a tile IS an axis-aligned
      // rect in world space and the uv falls out of vWorld with no extra vertex
      // attribute to pack, bake or invalidate when the drape is toggled.
      'uniform sampler2D uTex; uniform float uHasTex; uniform vec4 uTileRect;',
      'uniform float uDrape;',
      'varying vec3 vNormal; varying float vTone; varying vec3 vWorld; varying vec3 vBinfo;',
      NOISE, FOG, LIGHTING,
      'void main(){',
      '  vec3 n = normalize(vNormal);',
      '  float s = fract(vBinfo.y);',
      // vBinfo.z is the OSM building class, straight off the tag the parser
      // used to throw away: 1 house, 2 flats, 3 retail, 4 office, 5 industrial,
      // 6 outbuilding, 7 civic, 8 a pitched roof surface. Everything below
      // branches on it, because a warehouse and a terraced house are not the
      // same object with different dimensions.
      '  float cls = vBinfo.z;',
      '  float isHouse  = step(0.5, cls) * step(cls, 1.5);',
      '  float isFlats  = step(1.5, cls) * step(cls, 2.5);',
      '  float isShop   = step(2.5, cls) * step(cls, 3.5);',
      '  float isOffice = step(3.5, cls) * step(cls, 4.5);',
      '  float isWorks  = step(4.5, cls) * step(cls, 5.5);',
      '  float isShed   = step(5.5, cls) * step(cls, 6.5);',
      '  float isCivic  = step(6.5, cls) * step(cls, 7.5);',
      '  float isTile   = step(7.5, cls);',                  // a pitched roof face
      // Facade palettes, per class. Houses are brick and render; offices are
      // cool and grey; works are metal; civic is pale stone.
      '  vec3 base = vec3(0.79,0.75,0.68);',
      '  if (s > 0.25) base = vec3(0.68,0.69,0.71);',
      '  if (s > 0.50) base = vec3(0.74,0.57,0.46);',
      '  if (s > 0.75) base = vec3(0.86,0.84,0.79);',
      '  vec3 brick = mix(vec3(0.55,0.34,0.27), vec3(0.78,0.72,0.62), step(0.45, s));',
      '  brick = mix(brick, vec3(0.86,0.83,0.76), step(0.78, s));',      // rendered white
      '  vec3 metal = mix(vec3(0.62,0.65,0.66), vec3(0.50,0.55,0.58), step(0.5, s));',
      '  vec3 corp  = mix(vec3(0.56,0.60,0.66), vec3(0.72,0.74,0.77), step(0.5, s));',
      '  vec3 stone = vec3(0.80,0.77,0.70);',
      '  base = mix(base, brick, max(isHouse, isShed));',
      '  base = mix(base, metal, isWorks);',
      '  base = mix(base, corp, max(isOffice, isFlats * 0.6));',
      '  base = mix(base, stone, isCivic);',
      '  float isWall = 1.0 - step(0.55, abs(n.y));',
      '  float isRoof = step(0.55, n.y);',
      '  float h = vWorld.y - vBinfo.x;',            // height above THIS building's base
      // Storey bands. Using the building's own base is what keeps windows level
      // across a terrace built on a slope.
      // Storey height and window pitch are per class: a house has small windows
      // on a domestic grid, an office has a wide curtain-wall module, a
      // warehouse has almost none.
      '  float storey = 3.3;',
      '  storey = mix(storey, 2.8, isHouse);',
      '  storey = mix(storey, 3.8, isOffice);',
      '  storey = mix(storey, 5.5, isWorks);',
      '  float band = fract(h / storey);',
      '  float floorLit = fract(sin((floor(h / storey) + s * 31.0) * 12.9898) * 43758.5453);',
      // Run the window columns along whichever horizontal axis the wall faces.
      '  float u = abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x;',
      '  float pitch = 2.6;',
      '  pitch = mix(pitch, 3.4, isHouse);',        // fewer, wider-spaced openings
      '  pitch = mix(pitch, 1.9, isOffice);',       // tight curtain-wall module
      '  pitch = mix(pitch, 6.0, isWorks);',
      '  float col = fract(u / pitch + s);',
      // Roughly 0.9 m x 1.1 m of glass per 2.6 m x 3.3 m of facade. The first
      // pass used 1.7 m windows on a 3.2 m pitch, which is more glass than
      // wall — from a distance that is not a building, it is a chessboard.
      '  float wLo = mix(0.34, 0.30, isOffice), wHi = mix(0.68, 0.80, isOffice);',
      '  float cLo = mix(0.32, 0.14, isOffice), cHi = mix(0.68, 0.86, isOffice);',
      '  float win = isWall * step(wLo, band) * step(band, wHi)',
      '            * step(cLo, col) * step(col, cHi) * step(2.2, h);',
      // A shed has no windows at all, and a warehouse has a strip near the roof
      // rather than a grid — glazing a distribution shed like a house is most of
      // what made every building look the same.
      '  win *= 1.0 - isShed;',
      // A pitched roof face can be steep enough to pass the "is this a wall?"
      // normal test, and a roof with windows in it is a very odd house.
      '  win *= 1.0 - isTile;',
      '  win *= mix(1.0, step(0.55, band) * step(h, vBinfo.x + 40.0), isWorks);',
      // THE SHOPFRONT. A parade of shops is unmistakable from the road because
      // the ground floor is glass and the floors above are not — one band does
      // more for "this is a high street" than any facade colour.
      '  float shopFront = isShop * isWall * step(0.6, h) * step(h, 3.6);',
      '  float fascia = isShop * isWall * step(3.6, h) * step(h, 4.3);',
      '  win = max(win, shopFront);',
      // Glass reflects the sky more than it swallows light, and a few windows
      // per floor differ — a facade of identical black holes reads as printed.
      '  vec3 glass = mix(vec3(0.24,0.30,0.38), vec3(0.55,0.64,0.72), floorLit);',
      '  glass = mix(glass, vec3(0.62,0.70,0.78), isOffice * 0.5);',
      // Fade the pattern out with distance. A window grid is high-frequency
      // detail and there is no mip chain behind a procedural step() — past
      // ~80 m it aliases into a crawling dither that reads as dirt on the
      // facade. Beyond the fade the wall keeps a slightly darker average, which
      // is what a windowed building looks like from far away anyway.
      '  float near = 1.0 - smoothstep(80.0, 260.0, vDist);',
      '  base = mix(base, glass, win * 0.72 * near);',
      '  base = mix(base, base * 0.93, (1.0 - near) * isWall);',
      // Shop windows are LIT FROM INSIDE and full of pale merchandise — the
      // dark blue-grey used for a flat's window makes a parade of shops read as
      // a row of caves, which is the opposite of what a high street looks like.
      // Warm interior, cool reflection, and mullions every couple of metres so
      // it is glazing rather than one long hole.
      '  vec3 shopGlass = mix(vec3(0.54,0.60,0.66), vec3(0.92,0.80,0.56), floorLit * 0.8);',
      '  shopGlass *= 0.80 + 0.24 * step(0.10, fract(u / 2.1 + s));',
      '  base = mix(base, shopGlass, shopFront * near * 0.92);',
      // The sign board over a shopfront. No lettering — at this scale letters
      // are noise — just a painted band in the shop's own colour, which is what
      // you actually read from a car.
      '  vec3 signColour = mix(vec3(0.24,0.42,0.54), vec3(0.56,0.26,0.26), step(0.5, s));',
      '  signColour = mix(signColour, vec3(0.26,0.46,0.32), step(0.78, s));',
      // A KNOWN BRAND paints its own board. OSM names the business (name,
      // brand, brand:wikidata) and roads.js packs the sign colour into the
      // integer part of the seed — 5 bits a channel, which is all a flat
      // colour at 40 m needs. Colour only, never a logo or a wordmark: those
      // are trademarks, and the thing you actually recognise from a moving car
      // is the red-and-yellow on the corner, not the lettering.
      // NOT `packed` — that is a RESERVED WORD in GLSL ES 1.00 and the shader
      // fails to compile with "Illegal use of reserved word". Render.init then
      // throws at boot and the app never starts.
      '  float signPack = floor(vBinfo.y);',
      '  float hasBrand = step(0.5, signPack);',
      '  float pk = signPack - 1.0;',
      '  vec3 brandColour = vec3(floor(pk / 256.0),',
      '                          floor(mod(pk, 256.0) / 16.0),',
      '                          mod(pk, 16.0)) / 15.0;',
      '  signColour = mix(signColour, brandColour, hasBrand);',
      '  base = mix(base, signColour, fascia * near);',
      // Corrugation on a metal shed: vertical ribbing instead of windows, which
      // is the entire visual language of an industrial estate.
      '  float rib = 0.5 + 0.5 * cos(u * 6.2832 / 0.9);',
      '  base *= mix(1.0, 0.88 + 0.24 * rib, isWorks * isWall * near);',
      // Brick courses on a house, at the same distance fade as everything else.
      '  base *= mix(1.0, 0.94 + 0.12 * step(0.5, fract(h / 0.32)), isHouse * isWall * near * 0.6);',
      // A HOUSE IS NOT A SMALL OFFICE. What makes one read as somewhere people
      // live is the domestic furniture of it: a door on the ground floor, a
      // painted sill and lintel round every window, and a band of a different
      // colour where the render stops. All three are two lines of shader each
      // and together they do more than another thousand triangles would.
      '  float doorCol = step(0.42, fract(u / pitch + s + 0.5)) * step(fract(u / pitch + s + 0.5), 0.58);',
      '  float door = isHouse * isWall * doorCol * step(0.15, h) * step(h, 2.05);',
      '  vec3 doorPaint = mix(vec3(0.16,0.24,0.30), vec3(0.30,0.16,0.14), step(0.5, s));',
      '  doorPaint = mix(doorPaint, vec3(0.20,0.28,0.20), step(0.8, s));',
      '  base = mix(base, doorPaint, door * near);',
      // Sill and lintel: a pale band immediately under and over the glazing.
      '  float trimBand = step(wLo - 0.10, band) * step(band, wLo) + step(wHi, band) * step(band, wHi + 0.08);',
      '  float trim = isHouse * isWall * trimBand * step(cLo - 0.06, col) * step(col, cHi + 0.06) * step(2.2, h);',
      '  base = mix(base, vec3(0.90,0.88,0.84), trim * near * 0.75);',
      // The plinth: brick or stone below the damp course, on houses and shops.
      '  base = mix(base, base * vec3(0.78,0.76,0.74), max(isHouse, isShop) * isWall * (1.0 - step(0.55, h)));',
      // Grime toward the ground.
      '  base *= mix(0.72, 1.0, clamp(h / 5.0, 0.0, 1.0));',
      // ROOFS ARE NOT WALLS. Looking down a street from the chase camera you see
      // as much roof as facade, and painting them a dimmed copy of the wall is
      // most of why a city block reads as a bar chart. Slate, tile or grey felt
      // by the same per-building seed, with plant and vent clutter scribbled on
      // by the noise — at 60 km/h that clutter is the whole difference.
      '  vec3 roof = vec3(0.30, 0.31, 0.34);',                       // slate
      '  if (s > 0.40) roof = vec3(0.44, 0.26, 0.20);',              // pantile
      '  if (s > 0.78) roof = vec3(0.38, 0.38, 0.36);',              // felt and gravel
      '  float clutter = vnoise(vWorld.xz * 0.55 + s * 20.0);',
      // Take the HUE from the photograph and keep the procedural detail as a
      // modulation on top of it, rather than replacing one with the other: the
      // imagery knows that Amalfi is terracotta and Montmartre is zinc, and it
      // does NOT know where the vents and rooflights are — at 3 m per pixel it
      // could not. Not a full mix, because a single roof is a handful of texels
      // and going all the way there makes a street of them read as one smear.
      '  vec2 tuv = vec2((vWorld.x - uTileRect.x) / (uTileRect.z - uTileRect.x),',
      '                  (uTileRect.y - vWorld.z) / (uTileRect.y - uTileRect.w));',
      '  vec3 photoRoof = texture2D(uTex, clamp(tuv, 0.0, 1.0)).rgb;',
      // Lift it away from the shadow the photo was taken in: a satellite roof
      // is darker than the same roof lit by our own sun, and a roof that reads
      // darker than the wall under it looks like a hole in the building.
      '  photoRoof *= 1.18;',
      // How far the photograph is allowed to move the roof, 0..1. A uniform
      // rather than a baked constant so the number can be judged side by side
      // on ONE frame — rebuilding between strengths re-hops the world and you
      // end up comparing two different hillsides.
      '  float drape = uHasTex * uDrape;',
      '  roof = mix(roof, photoRoof, drape);',
      '  vec3 tileHue = photoRoof;',
      '  roof *= 0.86 + 0.30 * clutter;',
      '  roof += vec3(0.06) * step(0.80, clutter);',                 // plant, vents, skylights
      // A PITCHED roof is tile or slate, and it is a sloping surface — so it is
      // not caught by the isRoof normal test and gets its own class instead.
      // Rows of tiles run across the slope; without them a hip roof is a smooth
      // coloured cone and reads as a circus tent.
      '  vec3 tile = mix(vec3(0.48,0.26,0.19), vec3(0.34,0.33,0.35), step(0.55, s));',
      // A pitched roof gets the same treatment — it is the one the eye reads
      // first on a house, and leaving it procedural while the flat roofs went
      // real would make a suburb look sorted into two unrelated towns.
      '  tile = mix(tile, tileHue, drape);',
      '  float course = 0.90 + 0.14 * step(0.5, fract(h / 0.34));',
      '  tile *= course;',
      '  base = mix(base, roof, isRoof * (1.0 - isTile));',
      '  base = mix(base, tile, isTile);',
      // The chimney is class 9 and is brick, not tile — it is the one thing on
      // a roof that is a continuation of the wall below it.
      '  float isStack = step(8.5, cls);',
      '  base = mix(base, brick * (0.92 + 0.10 * step(0.5, fract(h / 0.30))), isStack);',
      '  vec3 lit = shade(base * vTone, n, normalize(uLightDir));',
      // Glass catches the sun. Only on the window rectangles, only on walls,
      // and only near enough that the pattern is still resolved — a whole city
      // of specular facades at 300 m is a field of fireflies.
      '  vec3 vd = normalize(uEye - vWorld);',
      '  vec3 hv = normalize(vd + normalize(uLightDir));',
      '  float spec = pow(max(dot(n, hv), 0.0), 42.0) * win * near * 0.55;',
      '  gl_FragColor = vec4(finish(lit + vec3(spec)), 1.0);',
      '}',
    ].join('\n'));

    // --- water ---
    progs.water = program([
      'attribute vec3 aPos;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying float vDist; varying vec3 vPos;',
      'void main(){ vPos=aPos; vDist=length(aPos-uEye); gl_Position=uViewProj*vec4(aPos,1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform float uTime; uniform vec3 uEye; uniform vec3 uLightDir; uniform vec3 uSkyTop;',
      // 1 for a swimming pool. Chlorinated water is a completely different
      // colour from a lake — bright turquoise because the bottom is painted and
      // close, where open water is dark because it is deep and full of silt.
      // This is also the player's ONLY warning: turquoise always drowns you,
      // everything else is a gamble.
      'uniform float uPool;',
      'varying vec3 vPos;',
      FOG,
      'void main(){',
      '  float ripple = sin(vPos.x*0.08 + uTime*0.8) * sin(vPos.z*0.07 - uTime*0.6);',
      '  vec3 lake = mix(vec3(0.06,0.16,0.26), vec3(0.10,0.28,0.40), 0.5 + 0.5*ripple);',
      '  vec3 pool = mix(vec3(0.09,0.52,0.56), vec3(0.20,0.76,0.76), 0.5 + 0.5*ripple);',
      '  vec3 c = mix(lake, pool, uPool);',
      // A surface normal wobbled by the same ripple, which buys two things a
      // flat blue plane cannot have: a sky reflection that brightens as the
      // water tilts away from you, and a sun glitter path across it.
      '  vec3 n = normalize(vec3(',
      '    -cos(vPos.x*0.08 + uTime*0.8) * 0.08 * sin(vPos.z*0.07 - uTime*0.6) * 2.2,',
      '    1.0,',
      '    -sin(vPos.x*0.08 + uTime*0.8) * 0.07 * cos(vPos.z*0.07 - uTime*0.6) * 2.2));',
      '  vec3 vd = normalize(uEye - vPos);',
      '  float fres = pow(1.0 - clamp(dot(n, vd), 0.0, 1.0), 3.0);',
      '  c = mix(c, uSkyTop * 0.9, clamp(fres * 0.85, 0.0, 0.8));',
      '  vec3 hv = normalize(vd + normalize(uLightDir));',
      '  c += pow(max(dot(n, hv), 0.0), 90.0) * 0.85;',
      '  gl_FragColor = vec4(finish(c), 1.0);',
      '}',
    ].join('\n'));

    // --- cars AND wildlife: one small mesh, drawn per body with its own matrix ---
    // uShape is a per-instance scale applied BEFORE the model matrix. Cars pass
    // (1,1,1); the animals pass their kind's proportions, which is what turns a
    // single quadruped mesh into a goose, a boar and a cow without three meshes,
    // three buffers and three upload paths.
    progs.car = program([
      'attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;',
      'uniform mat4 uViewProj; uniform mat4 uModel; uniform vec3 uEye; uniform vec3 uTint;',
      'uniform vec3 uShape;',
      'varying vec3 vNormal; varying vec3 vColor; varying float vDist; varying vec3 vWorld;',
      'void main(){',
      '  vec4 world = uModel * vec4(aPos * uShape, 1.0);',
      '  vNormal = mat3(uModel) * (aNormal / uShape);',
      '  vColor = aColor * uTint;',
      '  vWorld = world.xyz;',
      '  vDist = length(world.xyz - uEye);',
      '  gl_Position = uViewProj * world;',
      '}',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uLightDir; uniform vec3 uEye; uniform float uGloss; uniform float uEmit;',
      'varying vec3 vNormal; varying vec3 vColor; varying vec3 vWorld;',
      FOG, LIGHTING,
      'void main(){',
      '  vec3 n = normalize(vNormal);',
      '  vec3 l = normalize(uLightDir);',
      '  vec3 lit = shade(vColor, n, l);',
      // Paint. A car with no highlight is a matte plastic toy — this is the one
      // object the player looks at for the whole session, so it gets the one
      // specular lobe and a rim light to lift it off the road behind it.
      '  vec3 vd = normalize(uEye - vWorld);',
      '  float spec = pow(max(dot(n, normalize(vd + l)), 0.0), 54.0) * uGloss;',
      '  float rim = pow(1.0 - clamp(dot(n, vd), 0.0, 1.0), 3.5) * 0.22 * uGloss;',
      // uEmit makes the same program draw things that GLOW. A blaster bolt lit
      // like bodywork is a small grey box.
      '  gl_FragColor = vec4(finish(lit + vec3(spec) + uSkyFill * rim + vColor * uEmit), 1.0);',
      '}',
    ].join('\n'));

    // --- shadow: a soft blob on the ground under each car ---
    // Cheap, and it does more for believability than any amount of shading:
    // without a contact shadow the car reads as hovering, and on a slope you
    // genuinely cannot tell whether it is touching the ground.
    progs.shadow = program([
      'attribute vec2 aPos;',
      'uniform mat4 uViewProj; uniform vec3 uCentre; uniform float uRadius; uniform vec2 uSkew;',
      'varying vec2 vLocal;',
      'void main(){ vLocal = aPos;',
      '  vec3 w = uCentre + vec3(aPos.x * uRadius, 0.0, aPos.y * uRadius * 1.45);',
      // SKEWED DOWN-SUN. A contact blob centred under the car was right when the
      // sun was overhead and is wrong now that it is at 24° — everything else in
      // the world throws a long shadow to one side and the car alone sat on a
      // neat puddle. The far half of the ellipse is dragged away from the sun,
      // which turns it into a teardrop that still touches the wheels.
      '  w.xz += uSkew * (aPos.y * 0.5 + 0.5);',
      '  gl_Position = uViewProj * vec4(w, 1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'varying vec2 vLocal;',
      'void main(){',
      '  float d = length(vLocal);',
      '  float a = (1.0 - smoothstep(0.15, 1.0, d)) * 0.42;',   // ascending edges: see the sky shader
      '  gl_FragColor = vec4(0.0, 0.0, 0.0, a);',
      '}',
    ].join('\n'));

    // --- baked shadows: flat dark polygons lying on the ground ---------------
    // No shader worth the name. The geometry IS the shadow (see roads.js
    // buildShadows), computed once per tile because the sun never moves, and
    // all this has to do is lay it down with a soft edge so it does not read as
    // a cut-out. vEdge is a per-vertex "how far into the shadow am I", which
    // the fan hands out as 0 on the rim and 1 at the centre.
    progs.shade = program([
      'attribute vec3 aPos;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying float vDist;',
      'void main(){ vDist = length(aPos - uEye); gl_Position = uViewProj * vec4(aPos, 1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform float uFogDensity;',
      'varying float vDist;',
      'void main(){',
      // Shadows fade out with distance for the same reason everything else
      // does: past the fog band there is no contrast left to darken, and a hard
      // shadow inside the haze reads as a hole in the ground.
      '  float f = clamp(1.0 - exp(-vDist * uFogDensity), 0.0, 1.0);',
      // 0.34 was too strong, and not because it looked heavy on its own: these
      // are translucent decals, so two overlapping shadows darken TWICE and a
      // street of buildings stacks four or five deep into something that reads
      // as a hole in the world rather than as shade. A stencil pass would fix
      // the stacking properly; at this alpha it does not need fixing.
      // Blue, not black — shade is lit by the sky, and a neutral grey shadow is
      // the single most common tell of a fake one.
      '  gl_FragColor = vec4(0.08, 0.11, 0.20, 0.15 * (1.0 - f));',
      '}',
    ].join('\n'));

    // --- decals: scorch marks and smoke, one batched blend pass --------------
    // Quads whose corners the APP computes (it knows the wall normals and the
    // camera; the renderer should not). Per-vertex tint+alpha so the whole
    // list is ONE buffer upload and ONE draw call — a firefight's worth of
    // marks is a few kilobytes, not a few dozen draw calls.
    progs.decal = program([
      'attribute vec3 aPos; attribute vec2 aUv; attribute vec4 aColor;',
      'uniform mat4 uViewProj;',
      'varying vec2 vUv; varying vec4 vColor;',
      'void main(){ vUv = aUv; vColor = aColor; gl_Position = uViewProj * vec4(aPos, 1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'varying vec2 vUv; varying vec4 vColor;',
      'void main(){',
      // Radial falloff, so a square quad reads as a burn, a bloom of smoke —
      // anything but a square.
      '  float d = length(vUv - 0.5) * 2.0;',
      '  float a = vColor.a * (1.0 - smoothstep(0.45, 1.0, d));',
      '  if (a < 0.01) discard;',
      '  gl_FragColor = vec4(vColor.rgb, a);',
      '}',
    ].join('\n'));

    // --- sky: a real sky, drawn before everything with depth writes off ------
    // It was a vertical gradient in SCREEN space, which means it did not move
    // when you did: look up, look down, spin the car — the same band sat there,
    // and the horizon line was wherever the screen's middle happened to be. The
    // fix is to reconstruct the view RAY per pixel (uRay/uUp/uFwd are the camera
    // basis, scaled by the frustum) and shade by direction, which costs one
    // normalize and buys a sky that is anchored to the world: the sun stays put
    // as you turn, the haze sits on the true horizon, and the clouds have a
    // vanishing point.
    progs.sky = program([
      // z=1 exactly: the sky is drawn LAST and passes the depth test only where
      // the depth buffer is still at its cleared value, i.e. where the world
      // drew nothing. That needs LEQUAL, which init() sets.
      'attribute vec2 aPos; varying vec2 vP;',
      'void main(){ vP = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;',
      'uniform vec3 uRay; uniform vec3 uUp; uniform vec3 uFwd; uniform float uTime;',
      'varying vec2 vP;',
      NOISE,
      'void main(){',
      '  vec3 dir = normalize(uRay * vP.x + uUp * vP.y + uFwd);',
      '  float up = clamp(dir.y, -1.0, 1.0);',
      '  vec3 sky = mix(uHorizon, uTop, pow(clamp(up, 0.0, 1.0), 0.62));',
      // Below the horizon the sky is not sky, it is the haze the terrain
      // dissolves into — and it must be the same colour as the fog or the join
      // is a visible line right where the world ends.
      // NOTE THE ORDER OF THE EDGES. smoothstep with edge0 >= edge1 is
      // UNDEFINED in GLSL, not "reversed" — written the other way round this
      // returned 1.0 for every pixel on the gate's rasteriser and the entire
      // sky came out as one flat band of the horizon colour, sun, clouds,
      // gradient and all. Ascending edges, then subtract.
      '  sky = mix(sky, uHorizon, 1.0 - smoothstep(-0.04, 0.06, up));',
      '  float sd = max(dot(dir, uSunDir), 0.0);',
      // Three lobes: the disc, a tight aureole, and a wide haze that warms half
      // the sky. The wide one is what actually sells the direction of the light.
      '  sky += uSunColor * pow(sd, 1400.0) * 6.0;',
      '  sky += uSunColor * pow(sd, 90.0) * 0.55;',
      '  sky += uSunColor * pow(sd, 5.0) * 0.16;',
      // Clouds on a flat deck: project the ray onto a plane above the camera,
      // so they converge at the horizon instead of tiling the screen.
      // The deck is LOW and the fade is SHALLOW on purpose. A driving game
      // looks at the horizon: the chase camera's frustum reaches maybe 25°
      // above it, so a cloud layer tuned for a flight sim is a cloud layer no
      // player ever sees. These are the clouds that stand on the skyline.
      // deck is the cloud plane's height in noise units, and it has to be near
      // 1: the projection is dir.xz/dir.y, so a small deck maps the ENTIRE sky
      // into a fraction of one noise cell and every pixel gets the same value —
      // measured, that was a sky with no clouds in it at all rather than a sky
      // with subtle ones.
      // Everything below the horizon is haze, not cloud, and half the sky
      // pixels in a driving game are down there. One coherent branch skips the
      // whole cloud layer for them — the sky is the ONLY pass that got more
      // expensive here, because until now it was being culled and cost nothing
      // at all.
      '  if (up > 0.012) {',
      '    float deck = 1.25;',
      '    vec2 cp = dir.xz / max(up, 0.020) * deck + vec2(uTime * 0.010, uTime * 0.006);',
      '    float cov = smoothstep(0.52, 0.80, fbm2(cp));',
      // Still fade at the very bottom: at a grazing angle the projection
      // stretches to infinity and the noise turns into visible streaks.
      '    cov *= smoothstep(0.012, 0.10, up);',
      // Lit from the sun side, shadowed underneath. ONE octave: it is only
      // asking "is this side of the lump brighter", and three octaves of that
      // is three times the cost for a difference nobody can see.
      '    float lit = smoothstep(0.35, 0.80, vnoise(cp + uSunDir.xz * 0.55));',
      '    vec3 cloud = mix(vec3(0.62, 0.65, 0.72), vec3(1.0, 0.98, 0.94), lit);',
      '    cloud += uSunColor * pow(sd, 22.0) * 0.35;',               // silver lining
      '    sky = mix(sky, cloud, cov * 0.88);',
      '  }',
      '  gl_FragColor = vec4(sky, 1.0);',
      '}',
    ].join('\n'));
  }

  // ---- buffers -------------------------------------------------------------
  // Meshes upload lazily and remember their buffers, so a tile that stays on
  // screen costs nothing after its first frame.
  function upload(mesh) {
    if (mesh._gl) return mesh._gl;
    var b = { vbo: {}, ibo: gl.createBuffer(), count: mesh.count,
              type: (mesh.indices instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    ['positions', 'normals', 'uvs', 'tone', 'binfo', 'colors', 'rinfo'].forEach(function (k) {
      if (!mesh[k]) return;
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh[k], gl.STATIC_DRAW);
      b.vbo[k] = buf;
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    mesh._gl = b;
    mesh.release = function () {
      for (var k in b.vbo) gl.deleteBuffer(b.vbo[k]);
      gl.deleteBuffer(b.ibo);
      mesh._gl = null;
    };
    return b;
  }

  function bindAttr(prog, name, buf, size) {
    var loc = prog.a[name];
    if (loc === undefined || loc < 0 || !buf) return -1;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return loc;
  }

  function drawMesh(prog, mesh, layout) {
    if (!mesh || !mesh.count) return;
    var b = upload(mesh);
    var bound = [];
    for (var name in layout) {
      var loc = bindAttr(prog, name, b.vbo[layout[name].src], layout[name].size);
      if (loc >= 0) bound.push(loc);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ibo);
    gl.drawElements(gl.TRIANGLES, b.count, b.type, 0);
    bound.forEach(function (l) { gl.disableVertexAttribArray(l); });
  }

  // ---- the car mesh --------------------------------------------------------
  // Built once, in metres, facing +Z. A hatchback silhouette: body, cabin,
  // four wheels. Flat-shaded, which suits the stylised world.
  function boxInto(o, cx, cy, cz, sx, sy, sz, col) {
    var v = [
      [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
      [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
    ];
    var faces = [
      [[0,1,2,3],[0,0,-1]], [[5,4,7,6],[0,0,1]],
      [[4,0,3,7],[-1,0,0]], [[1,5,6,2],[1,0,0]],
      [[3,2,6,7],[0,1,0]],  [[4,5,1,0],[0,-1,0]],
    ];
    faces.forEach(function (f) {
      var base = o.pos.length / 3;
      f[0].forEach(function (vi) {
        o.pos.push(cx + v[vi][0]*sx, cy + v[vi][1]*sy, cz + v[vi][2]*sz);
        o.nrm.push(f[1][0], f[1][1], f[1][2]);
        o.col.push(col[0], col[1], col[2]);
      });
      // Reversed against the quad's listed order: as written, the corner lists
      // produce inward normals, so every box is drawn inside-out and the lit
      // faces are the ones you cannot see. The car looked charcoal, not red.
      o.idx.push(base, base+2, base+1, base, base+3, base+2);
    });
  }

  function buildCarMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    var body = [1, 1, 1], glassC = [0.16, 0.21, 0.28], tyre = [0.07, 0.07, 0.08];
    var lamp = [1.0, 0.94, 0.80], tail = [0.85, 0.10, 0.08], trim = [0.16, 0.16, 0.18];
    // Silhouette matters more than polygon count at this scale: a single box
    // with a smaller box on top reads as a brick, so the shape is broken into
    // bonnet / cabin / boot at different heights, which is what makes it read
    // as a car from behind — the only angle the chase camera ever shows.
    //
    // The boxes must NOT interpenetrate: parallel faces a millimetre apart are
    // beyond the depth buffer and flicker as magenta seams.
    boxInto(o, 0, 0.60, 0,      0.86, 0.26, 2.05, body);       // main body   y 0.34–0.86
    boxInto(o, 0, 0.94, 1.28,   0.80, 0.09, 0.72, body);       // bonnet      y 0.85–1.03
    boxInto(o, 0, 0.94, -1.55,  0.80, 0.08, 0.46, body);       // boot lid    y 0.86–1.02
    boxInto(o, 0, 1.20, -0.22,  0.72, 0.29, 0.92, glassC);     // cabin/glass y 0.91–1.49
    boxInto(o, 0, 1.50, -0.22,  0.70, 0.03, 0.88, body);       // roof panel
    // Lamps. Slightly proud of the bodywork so they never z-fight with it.
    boxInto(o, -0.58, 0.80, 2.09, 0.20, 0.09, 0.04, lamp);
    boxInto(o,  0.58, 0.80, 2.09, 0.20, 0.09, 0.04, lamp);
    boxInto(o, -0.60, 0.82, -2.09, 0.22, 0.10, 0.04, tail);
    boxInto(o,  0.60, 0.82, -2.09, 0.22, 0.10, 0.04, tail);
    boxInto(o, 0, 0.42, 2.08, 0.74, 0.10, 0.04, trim);         // front bumper
    boxInto(o, 0, 0.42, -2.08, 0.74, 0.10, 0.04, trim);        // rear bumper
    var wy = 0.33, wr = 0.33;
    [[-0.92, 1.32], [0.92, 1.32], [-0.92, -1.32], [0.92, -1.32]].forEach(function (w) {
      boxInto(o, w[0], wy, w[1], 0.10, wr, wr, tyre);          // x 0.82 – 1.02, outboard of 0.86
    });
    return {
      positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
      colors: new Float32Array(o.col), indices: new Uint16Array(o.idx), count: o.idx.length,
    };
  }
  // ---- the animal mesh -----------------------------------------------------
  // ONE quadruped, standing on y=0 and facing +Z like the car, drawn through
  // the same program. Everything that makes a goose not a cow is the per-kind
  // uShape scale and the tint — six meshes would be six buffers and six upload
  // paths for silhouettes nobody reads at 60 km/h.
  //
  // The body colours are near-white on purpose: uTint MULTIPLIES, so white
  // takes the kind's colour exactly while the darker parts (legs, muzzle) keep
  // their relationship to it whatever that colour turns out to be.
  function buildAnimalMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    var coat = [1, 1, 1], under = [0.82, 0.82, 0.82];
    var leg = [0.46, 0.42, 0.38], dark = [0.20, 0.17, 0.15];
    boxInto(o, 0, 0.80, -0.04, 0.24, 0.22, 0.60, coat);        // barrel
    boxInto(o, 0, 0.72, 0.50, 0.21, 0.17, 0.16, under);        // chest
    boxInto(o, 0, 1.04, 0.55, 0.11, 0.20, 0.12, coat);         // neck
    boxInto(o, 0, 1.26, 0.64, 0.12, 0.10, 0.20, coat);         // head
    boxInto(o, 0, 1.22, 0.85, 0.07, 0.06, 0.05, dark);         // muzzle
    boxInto(o, -0.11, 1.38, 0.60, 0.03, 0.07, 0.04, dark);     // ears
    boxInto(o, 0.11, 1.38, 0.60, 0.03, 0.07, 0.04, dark);
    boxInto(o, 0, 0.82, -0.66, 0.05, 0.10, 0.07, under);       // tail
    [[-0.17, 0.40], [0.17, 0.40], [-0.17, -0.44], [0.17, -0.44]].forEach(function (p) {
      boxInto(o, p[0], 0.29, p[1], 0.05, 0.29, 0.05, leg);
      boxInto(o, p[0], 0.03, p[1], 0.06, 0.03, 0.07, dark);    // hoof
    });
    return {
      positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
      colors: new Float32Array(o.col), indices: new Uint16Array(o.idx), count: o.idx.length,
    };
  }

  // A gun on the roof. Deliberately chunky and slightly comic — this is a
  // driving game with a blaster on it, not a weapons platform.
  function buildBlasterMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    var body = [0.32, 0.34, 0.40], barrel = [0.18, 0.19, 0.22], glow = [0.45, 0.85, 1.0];
    boxInto(o, 0, 1.60, -0.10, 0.26, 0.10, 0.34, body);       // mount on the roof
    boxInto(o, 0, 1.74, 0.30, 0.10, 0.10, 0.62, barrel);      // barrel forward
    boxInto(o, 0, 1.74, 0.94, 0.13, 0.13, 0.08, glow);        // muzzle ring
    boxInto(o, -0.20, 1.72, -0.02, 0.05, 0.06, 0.20, glow);   // cell either side
    boxInto(o, 0.20, 1.72, -0.02, 0.05, 0.06, 0.20, glow);
    return {
      positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
      colors: new Float32Array(o.col), indices: new Uint16Array(o.idx), count: o.idx.length,
    };
  }

  // One box, stretched along its length by uShape into a bolt.
  function buildBoltMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    boxInto(o, 0, 0, 0, 1, 1, 1, [0.55, 0.95, 1.0]);
    return {
      positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
      colors: new Float32Array(o.col), indices: new Uint16Array(o.idx), count: o.idx.length,
    };
  }

  // A LITTLE PLANE. Same boxes as the car, same program, same per-instance
  // matrix — so it inherits pitch and roll for free, which is most of what
  // makes flying read as flying rather than as a car sliding through the air.
  // Deliberately toy-shaped: high wing, fat fuselage, big tail. A realistic
  // airliner at this scale is a grey splinter.
  function buildPlaneMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    var body = [0.90, 0.26, 0.24], wing = [0.94, 0.94, 0.96];
    var glass = [0.30, 0.42, 0.55], prop = [0.20, 0.20, 0.24];
    boxInto(o, 0, 0.55, 0.30, 0.62, 0.62, 2.90, body);      // fuselage
    boxInto(o, 0, 0.62, -1.55, 0.34, 0.34, 0.70, body);     // tail boom
    boxInto(o, 0, 0.86, 0.62, 0.52, 0.40, 0.80, glass);     // canopy
    boxInto(o, 0, 1.02, 0.36, 3.60, 0.10, 0.78, wing);      // high wing
    boxInto(o, 0, 0.72, -1.86, 1.30, 0.08, 0.42, wing);     // tailplane
    boxInto(o, 0, 1.12, -1.86, 0.08, 0.64, 0.40, wing);     // fin
    boxInto(o, 0, 0.55, 1.80, 0.26, 0.26, 0.16, prop);      // spinner
    boxInto(o, 0, 0.55, 1.86, 1.70, 0.09, 0.05, prop);      // propeller disc
    boxInto(o, -1.05, 0.16, 0.40, 0.14, 0.52, 0.14, prop);  // gear legs
    boxInto(o, 1.05, 0.16, 0.40, 0.14, 0.52, 0.14, prop);
    // count, like every other mesh in this file. uploadBody() reads mesh.count
    // and passes it straight to drawElements — leave it off and the plane is
    // drawn with `undefined` indices, which is not an error, just garbage: the
    // aeroplane came out as a handful of white shards scattered over the
    // field, which is exactly what "I don't see any wings" looks like from the
    // driving seat.
    return { positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
             colors: new Float32Array(o.col), indices: new Uint16Array(o.idx),
             count: o.idx.length };
  }
  // THE FINISH FLAG. Built to be seen, not to be tasteful.
  //
  // The first race had no marker in the world AT ALL — the only sign you had
  // arrived was the HUD arrow vanishing. So this is deliberately enormous: a
  // 34 m mast with a 14 m banner, a chequered plinth at the base so it reads
  // from close up, and a translucent BEACON column climbing 220 m above it.
  // The beacon is the part that matters — over rolling terrain a flag on the
  // ground is hidden by the first hill between you and it, and the whole point
  // is to be visible from the far side of the map.
  function buildFlagMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    var white = [0.97, 0.97, 0.99], black = [0.08, 0.08, 0.10];
    var pole = [0.86, 0.86, 0.90], gold = [1.00, 0.82, 0.22];
    boxInto(o, 0, 17, 0, 0.42, 17, 0.42, pole);              // the mast
    boxInto(o, 0, 34.6, 0, 0.9, 0.9, 0.9, gold);             // finial
    // The banner: a chequerboard of blocks so it reads as a chequered flag
    // rather than a grey rectangle, at any distance.
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 7; c++) {
        boxInto(o, 7.4 - c * 2.0, 30.2 - r * 1.9, 0.0, 1.0, 0.95, 0.16,
                ((r + c) % 2) ? white : black);
      }
    }
    // A plinth you cannot drive past without noticing.
    for (var q = 0; q < 12; q++) {
      var a = q / 12 * Math.PI * 2;
      boxInto(o, Math.cos(a) * 6.2, 0.55, Math.sin(a) * 6.2, 1.1, 0.55, 1.1,
              (q % 2) ? white : black);
    }
    return { positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
             colors: new Float32Array(o.col), indices: new Uint16Array(o.idx),
             count: o.idx.length };
  }
  // The beacon is drawn separately because it is BLENDED — a solid column that
  // tall would be a wall across the horizon.
  function buildBeaconMesh() {
    var o = { pos: [], nrm: [], col: [], idx: [] };
    // 120 m, down from 320. I read a screenshot and concluded the beacon was
    // too SMALL; in the real world it went most of a mile into the sky. The
    // lesson is not about the number — it is that a still frame from a fixture
    // world was the wrong instrument, and the person driving it was the right
    // one. 120 m clears every building and most hills while still looking like
    // a marker rather than a space elevator.
    boxInto(o, 0, 60, 0, 4.5, 60, 4.5, [1.00, 0.86, 0.30]);
    return { positions: new Float32Array(o.pos), normals: new Float32Array(o.nrm),
             colors: new Float32Array(o.col), indices: new Uint16Array(o.idx),
             count: o.idx.length };
  }
  var flagGL = null, beaconGL = null;
  function uploadFlag() { if (!flagGL) flagGL = uploadBody(buildFlagMesh()); return flagGL; }
  function uploadBeacon() { if (!beaconGL) beaconGL = uploadBody(buildBeaconMesh()); return beaconGL; }

  var carMesh = null, carGL = null, planeGL = null, animalGL = null, blasterGL = null, boltGL = null;
  function uploadPlane() {
    if (!planeGL) planeGL = uploadBody(buildPlaneMesh());
    return planeGL;
  }

  function uploadBody(mesh) {
    var b = { vbo: {}, ibo: gl.createBuffer(), count: mesh.count, type: gl.UNSIGNED_SHORT };
    [['positions','aPos'],['normals','aNormal'],['colors','aColor']].forEach(function (p) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh[p[0]], gl.STATIC_DRAW);
      b.vbo[p[1]] = buf;
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    return b;
  }

  function uploadCar() {
    if (carGL) return carGL;
    carMesh = buildCarMesh();
    carGL = uploadBody(carMesh);
    return carGL;
  }

  function uploadAnimal() {
    if (!animalGL) animalGL = uploadBody(buildAnimalMesh());
    return animalGL;
  }

  function uploadBlaster() {
    if (!blasterGL) blasterGL = uploadBody(buildBlasterMesh());
    return blasterGL;
  }

  function uploadBolt() {
    if (!boltGL) boltGL = uploadBody(buildBoltMesh());
    return boltGL;
  }

  // ---- shadow quad ---------------------------------------------------------
  var shadowBuf = null;
  function uploadShadow() {
    if (shadowBuf) return shadowBuf;
    shadowBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
    return shadowBuf;
  }

  // ---- sky quad ------------------------------------------------------------
  var skyBuf = null;
  function uploadSky() {
    if (skyBuf) return skyBuf;
    skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    return skyBuf;
  }

  // ---- imagery texture -----------------------------------------------------
  // How strongly the photograph overrides the stylised look, 0..1, separately
  // for the GROUND and for ROOFS. They want different numbers: at the terrain
  // tile's z14 the ground is a big smooth surface where the imagery reads well,
  // while a roof is two or three texels across and takes the street and the
  // neighbour's garden in with it — so the roof wants the gentler hand.
  var drapeGround = 1.0, drapeRoof = 0.55;
  var textures = {};
  function textureFor(key, bitmap) {
    if (textures[key]) return textures[key];
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textures[key] = t;
    return t;
  }
  var blankTex = null;
  function blank() {
    if (blankTex) return blankTex;
    blankTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blankTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128,128,128,255]));
    return blankTex;
  }

  // ---- public --------------------------------------------------------------
  var view = mat4(), proj = mat4(), viewProj = mat4();
  var SKY_TOP = [0.17, 0.38, 0.72], SKY_HORIZON = [0.74, 0.81, 0.86];
  // Late afternoon, and the elevation is the whole character of the lighting.
  // Overhead, every shadow is a puddle under its own building and the picture
  // is flat. This is about 24°, which buys three things at once: shadows two
  // and a half times the height of what casts them, running across the road
  // rather than hiding under the eaves; a low sun angle that models the sides
  // of things instead of their tops; and — measured, not assumed — a sun that
  // is actually IN FRAME when you drive toward it. The chase camera only sees
  // about 25° above the horizon, so a sun at 40° is a sun nobody ever sees.
  var LIGHT = [0.60, 0.36, -0.52];
  // Warm sun, cool sky fill, warm bounce off the ground. The three of them are
  // what the hemisphere model reads; keeping them here rather than in the
  // shaders means one place decides what time of day it is.
  // The fill is deliberately generous. A physically honest hemisphere puts a
  // shaded vertical wall at about a third of a lit one, which is right for a
  // photograph and wrong for a stylised world at speed — the far side of every
  // building became an unreadable brown. Bright fill, slightly weaker sun.
  // Warmer and stronger than the noon sun it replaced: a low sun is both, and
  // it also has to carry more, because at 24° an upward-facing surface catches
  // far less of it and the ground would otherwise go flat and grey.
  var SUN_COLOR = [0.98, 0.86, 0.68];
  var SKY_FILL = [0.42, 0.48, 0.58];
  var GROUND_FILL = [0.28, 0.25, 0.20];
  var sunDir = [0, 1, 0];       // LIGHT, normalised, recomputed on init
  var ray = [0, 0, 0], upv = [0, 0, 0], fwd = [0, 0, 0];
  var IDENT = mat4(), ONE = [1, 1, 1];

  function normalise(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // The camera basis the sky shader reconstructs its rays from. It has to match
  // lookAt EXACTLY, including the X flip that mirrors the world (see lookAt) —
  // get the handedness wrong here and the sun sits on the wrong side of the
  // road from its own shadows.
  function cameraBasis(eye, centre, fov, aspect) {
    var z = normalise([eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]]);   // backwards
    var x = normalise([1 * z[2] - 0 * z[1], 0 * z[0] - 0 * z[2], 0 * z[1] - 1 * z[0]]); // cross(up, z), up=(0,1,0)
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    var t = Math.tan(fov * Math.PI / 360);
    for (var i = 0; i < 3; i++) {
      ray[i] = -x[i] * t * aspect;      // the mirror
      upv[i] = y[i] * t;
      fwd[i] = -z[i];
    }
  }

  function init(cv) {
    canvas = cv;
    var opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
    gl = cv.getContext('webgl2', opts);
    isGL2 = !!gl;
    if (!gl) gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('This device has no WebGL, so there is nothing to drive on.');
    if (!isGL2) gl.getExtension('OES_element_index_uint');   // 32-bit indices for big tiles
    sunDir = normalise(LIGHT);
    buildPrograms();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);        // so the z=1 sky quad can fill untouched pixels
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    // The mirrored view (see lookAt) reverses the projected winding of every
    // triangle, so the whole app's geometry would cull inside-out. One global
    // rule change restores all of it at once.
    gl.frontFace(gl.CW);
    return gl;
  }

  function resize() {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return canvas.width / Math.max(1, canvas.height);
  }

  // scene: { eye, target, fov, far, time, terrain:[{mesh,texture}], roads:[], buildings:[], water:[], cars:[] }
  // The decal batch: pos(3) + uv(2) + rgba(4) interleaved, rebuilt per frame
  // into ONE reused buffer. Rebuilding is fine — the list is capped well under
  // a hundred quads and the alternative is a draw call per mark.
  var decalBuf = null, decalData = null;
  var DECAL_UV = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];   // two tris of a unit quad
  var DECAL_CORNER = [0, 1, 2, 0, 2, 3];
  function drawDecals(decals) {
    var p = progs.decal;
    gl.useProgram(p.id);
    gl.uniformMatrix4fv(p.u.uViewProj, false, viewProj);
    var need = decals.length * 6 * 9;
    if (!decalData || decalData.length < need) decalData = new Float32Array(Math.max(need, 1024));
    var o = 0;
    for (var i = 0; i < decals.length; i++) {
      var d = decals[i], c = d.corners, t = d.tint, a = d.alpha;
      for (var v = 0; v < 6; v++) {
        var ci = DECAL_CORNER[v] * 3;
        decalData[o++] = c[ci]; decalData[o++] = c[ci + 1]; decalData[o++] = c[ci + 2];
        decalData[o++] = DECAL_UV[v * 2]; decalData[o++] = DECAL_UV[v * 2 + 1];
        decalData[o++] = t[0]; decalData[o++] = t[1]; decalData[o++] = t[2]; decalData[o++] = a;
      }
    }
    if (!decalBuf) decalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, decalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, decalData.subarray(0, o), gl.DYNAMIC_DRAW);
    var stride = 9 * 4;
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(p.a.aUv);
    gl.vertexAttribPointer(p.a.aUv, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(p.a.aColor);
    gl.vertexAttribPointer(p.a.aColor, 4, gl.FLOAT, false, stride, 20);
    gl.drawArrays(gl.TRIANGLES, 0, decals.length * 6);
    gl.disableVertexAttribArray(p.a.aPos);
    gl.disableVertexAttribArray(p.a.aUv);
    gl.disableVertexAttribArray(p.a.aColor);
  }

  function draw(scene) {
    var aspect = resize();
    var far = scene.far || 6000;
    perspective(proj, (scene.fov || 62) * Math.PI / 180, aspect, 0.5, far);
    lookAt(view, scene.eye, scene.target, [0, 1, 0]);
    multiply(viewProj, proj, view);

    gl.clearColor(SKY_HORIZON[0], SKY_HORIZON[1], SKY_HORIZON[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    cameraBasis(scene.eye, scene.target, scene.fov || 62, aspect);

    // Fog density is tied to draw distance so the horizon always dissolves at
    // roughly the same place regardless of how far we are drawing.
    var fogDensity = 2.4 / far;

    function common(p) {
      gl.useProgram(p.id);
      gl.uniformMatrix4fv(p.u.uViewProj, false, viewProj);
      gl.uniform3fv(p.u.uEye, scene.eye);
      if (p.u.uLightDir) gl.uniform3fv(p.u.uLightDir, LIGHT);
      if (p.u.uFogColor) gl.uniform3fv(p.u.uFogColor, SKY_HORIZON);
      if (p.u.uFogDensity) gl.uniform1f(p.u.uFogDensity, fogDensity);
      if (p.u.uSunColor) gl.uniform3fv(p.u.uSunColor, SUN_COLOR);
      if (p.u.uSkyFill) gl.uniform3fv(p.u.uSkyFill, SKY_FILL);
      if (p.u.uGroundFill) gl.uniform3fv(p.u.uGroundFill, GROUND_FILL);
      if (p.u.uSkyTop) gl.uniform3fv(p.u.uSkyTop, SKY_TOP);
    }

    // Terrain is drawn double-sided. Its skirts wind outward on the north edge
    // and inward on the other three (the edge walk reverses direction), and a
    // heightfield has no interior to hide anyway — so culling here buys nothing
    // and costs three quarters of the crack-hiding.
    gl.disable(gl.CULL_FACE);
    common(progs.terrain);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(progs.terrain.u.uTex, 0);
    for (var i = 0; i < scene.terrain.length; i++) {
      var t = scene.terrain[i];
      gl.bindTexture(gl.TEXTURE_2D, t.texture || blank());
      gl.uniform1f(progs.terrain.u.uHasTex, t.texture ? 1 : 0);
      gl.uniform1f(progs.terrain.u.uDrapeGround, drapeGround);
      drawMesh(progs.terrain, t.mesh, {
        aPos: { src: 'positions', size: 3 }, aNormal: { src: 'normals', size: 3 }, aUv: { src: 'uvs', size: 2 },
      });
    }

    // Water, then roads, then buildings — roads must land on top of water where
    // a bridge crosses it, and buildings are drawn last because they are the
    // only opaque geometry that reliably occludes.
    common(progs.water);
    gl.uniform1f(progs.water.u.uTime, scene.time || 0);
    gl.uniform1f(progs.water.u.uPool, 0);
    for (var w = 0; w < scene.water.length; w++) {
      drawMesh(progs.water, scene.water[w], { aPos: { src: 'positions', size: 3 } });
    }
    gl.uniform1f(progs.water.u.uPool, 1);
    for (var pw = 0; pw < (scene.pools || []).length; pw++) {
      drawMesh(progs.water, scene.pools[pw], { aPos: { src: 'positions', size: 3 } });
    }
    gl.uniform1f(progs.water.u.uPool, 0);

    gl.enable(gl.CULL_FACE);
    common(progs.road);
    for (var r = 0; r < scene.roads.length; r++) {
      drawMesh(progs.road, scene.roads[r], {
        aPos: { src: 'positions', size: 3 }, aUv: { src: 'uvs', size: 2 },
        aTone: { src: 'tone', size: 1 }, aRinfo: { src: 'rinfo', size: 2 },
      });
    }

    // Shadows go down AFTER the ground they lie on and BEFORE the things that
    // cast them, so a building always occludes its own shadow. Depth writes off
    // (they are decals, not occluders); depth test on, so a shadow behind a
    // wall stays behind it.
    if (scene.shadows && scene.shadows.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);          // hulls come out in either winding
      common(progs.shade);
      for (var sh = 0; sh < scene.shadows.length; sh++) {
        drawMesh(progs.shade, scene.shadows[sh], { aPos: { src: 'positions', size: 3 } });
      }
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    common(progs.building);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(progs.building.u.uTex, 0);
    for (var b = 0; b < scene.buildings.length; b++) {
      // An entry is { mesh, texture, rect } when the drape is on and a bare
      // mesh otherwise — accepting both keeps every other caller (and every
      // test that hands this a mesh directly) working unchanged.
      var bl = scene.buildings[b];
      var bmesh = bl && bl.mesh ? bl.mesh : bl;
      if (!bmesh) continue;
      var btex = bl && bl.texture ? bl.texture : null;
      gl.bindTexture(gl.TEXTURE_2D, btex || blank());
      gl.uniform1f(progs.building.u.uHasTex, btex ? 1 : 0);
      gl.uniform1f(progs.building.u.uDrape, drapeRoof);
      // A degenerate rect would divide by zero in the shader; the identity here
      // is never sampled because uHasTex is 0 alongside it.
      gl.uniform4fv(progs.building.u.uTileRect, (btex && bl.rect) || [0, 1, 1, 0]);
      drawMesh(progs.building, bmesh, {
        aPos: { src: 'positions', size: 3 }, aNormal: { src: 'normals', size: 3 },
        aTone: { src: 'tone', size: 1 }, aBinfo: { src: 'binfo', size: 3 },
      });
    }

    // THE FINISH FLAG, drawn through the car program (one more body with a
    // matrix) so it inherits the same lighting and fog as everything else and
    // needs no shader of its own. Drawn in EVERY point of view — chase,
    // cockpit and bird — because "where is the finish" is the one question all
    // three have in common.
    if (scene.flag) {
      var fm = mat4();
      common(progs.car);
      var fg = uploadFlag();
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc === undefined || loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, fg.vbo[name]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fg.ibo);
      gl.uniform3fv(progs.car.u.uShape, ONE);
      gl.uniform1f(progs.car.u.uGloss, 0.2);
      // Emissive, so it stays bright in fog and at dusk rather than fading into
      // the hillside behind it.
      gl.uniform1f(progs.car.u.uEmit, 0.55);
      carMatrix(fm, scene.flag.x, scene.flag.y, scene.flag.z, scene.flag.spin || 0, 0, 0);
      gl.uniformMatrix4fv(progs.car.u.uModel, false, fm);
      gl.uniform3fv(progs.car.u.uTint, [1, 1, 1]);
      // The mast grows with distance too, but far more gently — it should read
      // as a big flag a long way off, not as a skyscraper.
      var fs = scene.flag.grow || 1;
      gl.uniform3fv(progs.car.u.uShape, [fs, fs, fs]);
      gl.drawElements(gl.TRIANGLES, fg.count, fg.type, 0);
      gl.uniform3fv(progs.car.u.uShape, ONE);

      // The beacon is SOLID, not additive. Additive light against a bright
      // daytime sky is exactly where additive fails — it washed out to a hazy
      // smear at 400 m, which is how a marker fails at the one job it has.
      // A saturated opaque column reads at any distance and against anything,
      // and at a dozen metres wide it is a pillar rather than a wall.
      var bg = uploadBeacon();
      gl.depthMask(false);
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc === undefined || loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, bg.vbo[name]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bg.ibo);
      gl.uniform1f(progs.car.u.uEmit, 0.85);
      gl.uniform3fv(progs.car.u.uTint, [1.0, 0.30, 0.12]);   // hazard orange-red
      // A MINIMUM ON-SCREEN WIDTH. A fixed-width column is a hairline at
      // 400 m — measured, and it is the difference between "I never saw a
      // flag" and a landmark. Widening with distance keeps the beam roughly
      // constant on screen, which is what a marker has to do; the height is
      // left alone so it does not become a wall up close.
      var beam = scene.flag.beam || 1;
      gl.uniform3fv(progs.car.u.uShape, [beam, 1, beam]);
      gl.drawElements(gl.TRIANGLES, bg.count, bg.type, 0);
      gl.uniform3fv(progs.car.u.uShape, ONE);
      gl.depthMask(true);
      gl.uniform1f(progs.car.u.uEmit, 0);
      gl.uniform1f(progs.car.u.uGloss, 1);
    }

    // Decals — scorch marks on the walls just drawn, smoke over whatever is
    // burning. Depth TEST on (a mark behind a wall stays behind it), depth
    // WRITES off (they are film, not geometry). One buffer, one draw.
    if (scene.decals && scene.decals.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);          // corners arrive in whatever winding
      drawDecals(scene.decals);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // Scenery — trees and hedges, baked into one static mesh per road tile (see
    // roads.js scatter). Drawn through the CAR program with an identity model
    // matrix: it already takes a per-vertex colour and does the lighting we
    // want, and a fifth program for "a mesh with colours on it" would be a
    // fifth program to keep in step.
    if (scene.trees && scene.trees.length) {
      common(progs.car);
      gl.uniformMatrix4fv(progs.car.u.uModel, false, IDENT);
      gl.uniform3fv(progs.car.u.uTint, ONE);
      gl.uniform3fv(progs.car.u.uShape, ONE);
      gl.uniform1f(progs.car.u.uGloss, 0);
      gl.uniform1f(progs.car.u.uEmit, 0);
      // CULLED, like everything else. Drawing foliage double-sided was worth
      // trying — a canopy is a shell of leaves, not a solid — but it doubles
      // the fill of the most numerous object in the scene for a difference
      // only visible if you stop and stare up into a tree, and this is a
      // driving game. Measured on the software rasteriser it was the single
      // most expensive thing added.
      for (var tr = 0; tr < scene.trees.length; tr++) {
        drawMesh(progs.car, scene.trees[tr], {
          aPos: { src: 'positions', size: 3 }, aNormal: { src: 'normals', size: 3 },
          aColor: { src: 'colors', size: 3 },
        });
      }
    }

    // Contact shadows, before the cars themselves. Blended, and with depth
    // WRITES off so one shadow cannot occlude another or the car above it —
    // they still depth-TEST, so a shadow behind a building stays hidden.
    var animals = scene.animals || [];
    if ((scene.cars && scene.cars.length) || animals.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(progs.shadow.id);
      gl.uniformMatrix4fv(progs.shadow.u.uViewProj, false, viewProj);
      gl.bindBuffer(gl.ARRAY_BUFFER, uploadShadow());
      gl.enableVertexAttribArray(progs.shadow.a.aPos);
      gl.vertexAttribPointer(progs.shadow.a.aPos, 2, gl.FLOAT, false, 0, 0);
      // How far a metre of height throws its shadow, in world x/z. The same
      // number roads.js bakes the building shadows with, so the car's shadow
      // and the world's point the same way.
      var throwX = -sunDir[0] / Math.max(0.18, sunDir[1]);
      var throwZ = -sunDir[2] / Math.max(0.18, sunDir[1]);
      for (var sc = 0; sc < scene.cars.length; sc++) {
        var s0 = scene.cars[sc];
        // Sit it a few centimetres above the ground the car is standing on, so
        // it never z-fights with the road surface it is cast onto — and above
        // the ROAD, which is itself lifted off the terrain (see roads.js).
        gl.uniform3fv(progs.shadow.u.uCentre, [s0.x, (s0.groundY != null ? s0.groundY : s0.y) + 0.26, s0.z]);
        gl.uniform1f(progs.shadow.u.uRadius, 1.5);
        gl.uniform2fv(progs.shadow.u.uSkew, [throwX * 0.85, throwZ * 0.85]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      // The wildlife gets one too, and it is not decoration: without a contact
      // shadow an animal on a slope reads as hovering, and a deer you cannot
      // place in depth is a deer you cannot swerve around.
      for (var sa = 0; sa < animals.length; sa++) {
        var a0 = animals[sa];
        gl.uniform3fv(progs.shadow.u.uCentre, [a0.x, (a0.groundY != null ? a0.groundY : a0.y) + 0.24, a0.z]);
        gl.uniform1f(progs.shadow.u.uRadius, 0.55 * (a0.shape ? a0.shape[2] : 1));
        gl.uniform2fv(progs.shadow.u.uSkew, [throwX * 0.5, throwZ * 0.5]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disableVertexAttribArray(progs.shadow.a.aPos);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }

    // Cars
    if (scene.cars && scene.cars.length) {
      var cg = uploadCar();
      common(progs.car);
      var m = mat4();
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc === undefined || loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, cg.vbo[name]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cg.ibo);
      gl.uniform3fv(progs.car.u.uShape, ONE);
      gl.uniform1f(progs.car.u.uGloss, 1);
      gl.uniform1f(progs.car.u.uEmit, 0);
      var boundPlane = false;
      function bindBody(g) {
        ['aPos','aNormal','aColor'].forEach(function (name) {
          var loc = progs.car.a[name];
          if (loc === undefined || loc < 0) return;
          gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo[name]);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
        });
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo);
      }
      for (var c = 0; c < scene.cars.length; c++) {
        var car = scene.cars[c];
        // One program, two meshes. Rebinding only on CHANGE keeps the usual
        // all-cars case at exactly the cost it had before flight existed.
        var wantPlane = !!car.plane;
        if (wantPlane !== boundPlane) { bindBody(wantPlane ? uploadPlane() : cg); boundPlane = wantPlane; }
        carMatrix(m, car.x, car.y, car.z, car.yaw, car.pitch || 0, car.roll || 0);
        gl.uniformMatrix4fv(progs.car.u.uModel, false, m);
        gl.uniform3fv(progs.car.u.uTint, car.tint || [0.85, 0.25, 0.25]);
        // A dying car shrinks (scale) and flashes (emit) through the SAME
        // program — two uniforms, no second mesh, no blend state.
        var cs = car.scale || 1;
        if (cs !== 1) gl.uniform3fv(progs.car.u.uShape, [cs, cs, cs]);
        if (car.emit) gl.uniform1f(progs.car.u.uEmit, car.emit);
        var gnow = boundPlane ? uploadPlane() : cg;
        gl.drawElements(gl.TRIANGLES, gnow.count, gnow.type, 0);
        if (cs !== 1) gl.uniform3fv(progs.car.u.uShape, ONE);
        if (car.emit) gl.uniform1f(progs.car.u.uEmit, 0);
      }
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc !== undefined && loc >= 0) gl.disableVertexAttribArray(loc);
      });

      // The blaster, on whichever cars carry one. Same program, same matrix —
      // it is bolted to the roof, so it takes the car's pitch and roll for
      // free and never has to be kept in step with anything.
      var armed = scene.cars.filter(function (c) { return c.blaster; });
      if (armed.length) {
        var bg = uploadBlaster();
        ['aPos','aNormal','aColor'].forEach(function (name) {
          var loc = progs.car.a[name];
          if (loc === undefined || loc < 0) return;
          gl.bindBuffer(gl.ARRAY_BUFFER, bg.vbo[name]);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
        });
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bg.ibo);
        gl.uniform3fv(progs.car.u.uTint, ONE);
        gl.uniform1f(progs.car.u.uGloss, 0.8);
        for (var ar = 0; ar < armed.length; ar++) {
          var a1 = armed[ar];
          carMatrix(m, a1.x, a1.y, a1.z, a1.yaw, a1.pitch || 0, a1.roll || 0);
          gl.uniformMatrix4fv(progs.car.u.uModel, false, m);
          gl.drawElements(gl.TRIANGLES, bg.count, bg.type, 0);
        }
        ['aPos','aNormal','aColor'].forEach(function (name) {
          var loc = progs.car.a[name];
          if (loc !== undefined && loc >= 0) gl.disableVertexAttribArray(loc);
        });
      }
    }

    // Blaster bolts: emissive, so they read as light rather than as small grey
    // boxes travelling very fast.
    var bolts = scene.bolts || [];
    if (bolts.length) {
      var tg = uploadBolt();
      common(progs.car);
      var bm = mat4();
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc === undefined || loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, tg.vbo[name]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tg.ibo);
      gl.uniform3fv(progs.car.u.uTint, ONE);
      gl.uniform1f(progs.car.u.uGloss, 0);
      gl.uniform1f(progs.car.u.uEmit, 1.7);
      gl.uniform3fv(progs.car.u.uShape, [0.10, 0.10, 1.5]);
      for (var bo = 0; bo < bolts.length; bo++) {
        carMatrix(bm, bolts[bo].x, bolts[bo].y, bolts[bo].z, bolts[bo].yaw, 0, 0);
        gl.uniformMatrix4fv(progs.car.u.uModel, false, bm);
        gl.drawElements(gl.TRIANGLES, tg.count, tg.type, 0);
      }
      gl.uniform1f(progs.car.u.uEmit, 0);
      gl.uniform3fv(progs.car.u.uShape, ONE);
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc !== undefined && loc >= 0) gl.disableVertexAttribArray(loc);
      });
    }

    // Wildlife: the same program, the same one-mesh-many-matrices pattern, and
    // uShape doing the work six meshes would otherwise do.
    if (animals.length) {
      var ag = uploadAnimal();
      common(progs.car);
      var am = mat4();
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc === undefined || loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, ag.vbo[name]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ag.ibo);
      gl.uniform1f(progs.car.u.uGloss, 0.10);      // fur is not paint
      gl.uniform1f(progs.car.u.uEmit, 0);
      for (var an = 0; an < animals.length; an++) {
        var b0 = animals[an];
        carMatrix(am, b0.x, b0.y, b0.z, b0.yaw, b0.tilt || 0, 0);
        gl.uniformMatrix4fv(progs.car.u.uModel, false, am);
        gl.uniform3fv(progs.car.u.uTint, b0.tint);
        gl.uniform3fv(progs.car.u.uShape, b0.shape || ONE);
        gl.drawElements(gl.TRIANGLES, ag.count, ag.type, 0);
      }
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc !== undefined && loc >= 0) gl.disableVertexAttribArray(loc);
      });
    }

    // ---- sky, LAST -------------------------------------------------------
    // It used to be drawn first, which meant the most expensive fragment
    // shader in the app ran over every pixel on the screen and then had most
    // of them painted over. Drawn last at z=1 with LEQUAL and depth writes
    // off, it fills exactly the pixels nothing else reached — on a road scene
    // that is under half the frame, and it is the single cheapest way to buy
    // back what clouds cost. (Measured: 8.8 -> 10.6 fps on the gate's software
    // rasteriser, which is the pessimistic end of the phone range.)
    //
    // CULLING OFF, and that is not defensive: the full-screen triangle is
    // wound counter-clockwise, the app sets frontFace(CW) to compensate for
    // its mirrored view, and so the sky triangle was a BACK face — silently
    // culled — from the day that line landed. Every "sky" pixel in this app
    // was the glClear colour, which is why the sky was one flat band that no
    // gradient ever showed up in.
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.useProgram(progs.sky.id);
    gl.uniform3fv(progs.sky.u.uTop, SKY_TOP);
    gl.uniform3fv(progs.sky.u.uHorizon, SKY_HORIZON);
    gl.uniform3fv(progs.sky.u.uSunDir, sunDir);
    gl.uniform3fv(progs.sky.u.uSunColor, SUN_COLOR);
    gl.uniform3fv(progs.sky.u.uRay, ray);
    gl.uniform3fv(progs.sky.u.uUp, upv);
    gl.uniform3fv(progs.sky.u.uFwd, fwd);
    gl.uniform1f(progs.sky.u.uTime, scene.time || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uploadSky());
    gl.enableVertexAttribArray(progs.sky.a.aPos);
    gl.vertexAttribPointer(progs.sky.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(progs.sky.a.aPos);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);        // hand the state back exactly as it was found
  }

  root.Render = {
    init: init, draw: draw, textureFor: textureFor,
    // Settable so the two numbers can be judged side by side on ONE frame.
    setDrape: function (ground, roof) {
      if (ground != null) drapeGround = Math.max(0, Math.min(1, ground));
      if (roof != null) drapeRoof = Math.max(0, Math.min(1, roof));
    },
    drape: function () { return { ground: drapeGround, roof: drapeRoof }; },
    get gl() { return gl; },
    isGL2: function () { return isGL2; },
    // The sun direction, normalised. roads.js bakes the shadows against it at
    // tile build time — one definition of where the light comes from, or the
    // shadows point somewhere the shading does not.
    sun: function () { return [sunDir[0], sunDir[1], sunDir[2]]; },
    // The camera basis the sky reconstructs its rays from, as it was last
    // uploaded. Exposed because a wrong basis does not look wrong in any
    // obvious way — it looks like a sky with no clouds in it, which is exactly
    // what a sky with no clouds in it looks like.
    debug: function () {
      return { ray: [ray[0], ray[1], ray[2]], up: [upv[0], upv[1], upv[2]],
               fwd: [fwd[0], fwd[1], fwd[2]], sun: [sunDir[0], sunDir[1], sunDir[2]] };
    },
  };
})(window);
