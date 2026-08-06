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

  // Shared fragment preamble: one fog model everywhere, so the horizon is a
  // single colour and nothing betrays where one material ends.
  var FOG = [
    'uniform vec3 uFogColor;',
    'uniform float uFogDensity;',
    'varying float vDist;',
    'vec3 fogged(vec3 c) {',
    '  float f = 1.0 - exp(-vDist * uFogDensity);',
    '  return mix(c, uFogColor, clamp(f, 0.0, 1.0));',
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
      'varying vec3 vNormal; varying vec2 vUv; varying float vHeight; varying vec2 vWorldXZ;',
      FOG,
      'void main(){',
      '  vec3 n = normalize(vNormal);',
      '  float slope = 1.0 - clamp(n.y, 0.0, 1.0);',
      // Two octaves of cheap value noise. Terrarium posts are ~10 m apart, so
      // without this the ground is large flat facets of one identical green and
      // reads as painted cardboard however good the lighting is.
      '  vec2 p = vWorldXZ;',
      '  float n1 = fract(sin(dot(floor(p / 7.0), vec2(127.1, 311.7))) * 43758.5453);',
      '  float n2 = fract(sin(dot(floor(p / 31.0), vec2(269.5, 183.3))) * 43758.5453);',
      '  float grain = (n1 - 0.5) * 0.05 + (n2 - 0.5) * 0.035;',
      // Stylised palette: grass low and flat, rock on anything steep, snow high.
      '  vec3 grass = mix(vec3(0.33,0.44,0.24), vec3(0.44,0.51,0.29), clamp(vHeight/900.0,0.0,1.0));',
      '  grass *= 1.0 + grain * 2.2;',
      '  grass = mix(grass, vec3(0.46,0.44,0.28), clamp(n2 * 0.16, 0.0, 0.16));',   // dry patches
      '  vec3 rock  = vec3(0.42,0.39,0.35) * (1.0 + grain);',
      '  vec3 snow  = vec3(0.86,0.88,0.92);',
      '  vec3 base = mix(grass, rock, smoothstep(0.18, 0.45, slope));',
      // Snowline high and narrow. At 1500 m a real driveable pass — Stelvio
      // tops out around 2750 m — renders as an unbroken white sheet with no
      // readable terrain in it at all.
      '  base = mix(base, snow, smoothstep(2450.0, 3100.0, vHeight) * (1.0 - smoothstep(0.5, 0.8, slope)));',
      '  vec3 photo = texture2D(uTex, vUv).rgb;',
      '  base = mix(base, photo, uHasTex);',
      '  float lam = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);',
      '  vec3 lit = base * (0.55 + 0.55 * lam);',
      '  gl_FragColor = vec4(fogged(lit), 1.0);',
      '}',
    ].join('\n'));

    // --- roads: flat tarmac with a centre line painted from the ribbon's uv ---
    progs.road = program([
      'attribute vec3 aPos; attribute vec2 aUv; attribute float aTone;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying vec2 vUv; varying float vTone; varying float vDist;',
      'void main(){ vUv=aUv; vTone=aTone; vDist=length(aPos-uEye); gl_Position=uViewProj*vec4(aPos,1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'varying vec2 vUv; varying float vTone;',
      FOG,
      'void main(){',
      // Aggregate speckle, so tarmac at 100 km/h is a surface rather than a
      // flat grey ribbon with no sensation of movement over it.
      // Fine aggregate. vUv.x is in METRES along the way, so the cell size here
      // is a real size on the ground: at 3 per metre the speckle came out as
      // 30 cm tiles and the road read as a checkerboard. 14 per metre is chip.
      '  float g = fract(sin(dot(floor(vec2(vUv.x * 14.0, vUv.y * 26.0)), vec2(127.1, 311.7))) * 43758.5453);',
      '  float g2 = fract(sin(dot(floor(vec2(vUv.x * 3.5, vUv.y * 5.0)), vec2(269.5, 183.3))) * 43758.5453);',
      '  vec3 tarmac = vec3(0.21,0.21,0.23) * (0.62 + vTone) * (0.95 + 0.07 * g + 0.05 * g2);',
      // Kerb: a lighter band at both edges of the ribbon.
      '  float edge = smoothstep(0.5, 0.45, abs(vUv.y - 0.5));',
      '  tarmac = mix(tarmac * 1.30, tarmac, edge);',
      // Edge lines on everything, centre line on anything bigger than a lane.
      // The old rule painted a centre line only above tone 0.5, which excluded
      // residential streets — i.e. most of what you actually drive on — so the
      // roads had no markings at all where it mattered.
      '  float edgeLine = (1.0 - smoothstep(0.004, 0.013, abs(abs(vUv.y - 0.5) - 0.455)));',
      '  float mid = 1.0 - smoothstep(0.010, 0.026, abs(vUv.y - 0.5));',
      '  float dash = step(0.42, fract(vUv.x / 9.0));',
      '  float paint = max(mid * dash * step(0.45, vTone), edgeLine * 0.62);',
      '  vec3 c = mix(tarmac, vec3(0.88,0.86,0.72), clamp(paint, 0.0, 1.0));',
      '  gl_FragColor = vec4(fogged(c), 1.0);',
      '}',
    ].join('\n'));

    // --- buildings: extrusions with floors, windows and a per-building colour ---
    // OSM gives a footprint and a height and nothing else, so everything that
    // makes these read as BUILDINGS rather than grey slabs is generated here:
    // storey bands from the height above each building's OWN base, window
    // columns from position along the wall, and a colour picked by a stable
    // per-building seed so a street has variety instead of one flat tone.
    progs.building = program([
      'attribute vec3 aPos; attribute vec3 aNormal; attribute float aTone; attribute vec2 aBinfo;',
      'uniform mat4 uViewProj; uniform vec3 uEye;',
      'varying vec3 vNormal; varying float vTone; varying float vDist;',
      'varying vec3 vWorld; varying vec2 vBinfo;',
      'void main(){ vNormal=aNormal; vTone=aTone; vWorld=aPos; vBinfo=aBinfo;',
      '  vDist=length(aPos-uEye); gl_Position=uViewProj*vec4(aPos,1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uLightDir;',
      'varying vec3 vNormal; varying float vTone; varying vec3 vWorld; varying vec2 vBinfo;',
      FOG,
      'void main(){',
      '  vec3 n = normalize(vNormal);',
      '  float s = fract(vBinfo.y);',
      // Four plausible facade colours: warm stone, cool grey, terracotta, off-white.
      '  vec3 base = vec3(0.79,0.75,0.68);',
      '  if (s > 0.25) base = vec3(0.68,0.69,0.71);',
      '  if (s > 0.50) base = vec3(0.74,0.57,0.46);',
      '  if (s > 0.75) base = vec3(0.86,0.84,0.79);',
      '  float isWall = 1.0 - step(0.55, abs(n.y));',
      '  float h = vWorld.y - vBinfo.x;',            // height above THIS building's base
      // Storey bands. Using the building's own base is what keeps windows level
      // across a terrace built on a slope.
      '  float band = fract(h / 3.3);',
      '  float floorLit = fract(sin((floor(h / 3.3) + s * 31.0) * 12.9898) * 43758.5453);',
      // Run the window columns along whichever horizontal axis the wall faces.
      '  float u = abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x;',
      '  float col = fract(u / 2.6 + s);',
      // Roughly 0.9 m x 1.1 m of glass per 2.6 m x 3.3 m of facade. The first
      // pass used 1.7 m windows on a 3.2 m pitch, which is more glass than
      // wall — from a distance that is not a building, it is a chessboard.
      '  float win = isWall * step(0.34, band) * step(band, 0.68)',
      '            * step(0.32, col) * step(col, 0.68) * step(2.2, h);',
      // Glass reflects the sky more than it swallows light, and a few windows
      // per floor differ — a facade of identical black holes reads as printed.
      '  vec3 glass = mix(vec3(0.24,0.30,0.38), vec3(0.55,0.64,0.72), floorLit);',
      // Fade the pattern out with distance. A window grid is high-frequency
      // detail and there is no mip chain behind a procedural step() — past
      // ~80 m it aliases into a crawling dither that reads as dirt on the
      // facade. Beyond the fade the wall keeps a slightly darker average, which
      // is what a windowed building looks like from far away anyway.
      '  float near = 1.0 - smoothstep(80.0, 260.0, vDist);',
      '  base = mix(base, glass, win * 0.72 * near);',
      '  base = mix(base, base * 0.93, (1.0 - near) * isWall);',
      // Grime toward the ground, and a darker roof.
      '  base *= mix(0.72, 1.0, clamp(h / 5.0, 0.0, 1.0));',
      '  base = mix(base, base * 0.78, step(0.55, abs(n.y)) * step(0.0, n.y));',
      '  float lam = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);',
      '  gl_FragColor = vec4(fogged(base * vTone * (0.70 + 0.66 * lam)), 1.0);',
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
      'uniform float uTime;',
      'varying vec3 vPos;',
      FOG,
      'void main(){',
      '  float ripple = sin(vPos.x*0.08 + uTime*0.8) * sin(vPos.z*0.07 - uTime*0.6);',
      '  vec3 c = mix(vec3(0.10,0.24,0.36), vec3(0.16,0.36,0.50), 0.5 + 0.5*ripple);',
      '  gl_FragColor = vec4(fogged(c), 1.0);',
      '}',
    ].join('\n'));

    // --- cars: one small mesh, drawn per vehicle with its own matrix ---
    progs.car = program([
      'attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;',
      'uniform mat4 uViewProj; uniform mat4 uModel; uniform vec3 uEye; uniform vec3 uTint;',
      'varying vec3 vNormal; varying vec3 vColor; varying float vDist;',
      'void main(){',
      '  vec4 world = uModel * vec4(aPos, 1.0);',
      '  vNormal = mat3(uModel) * aNormal;',
      '  vColor = aColor * uTint;',
      '  vDist = length(world.xyz - uEye);',
      '  gl_Position = uViewProj * world;',
      '}',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uLightDir;',
      'varying vec3 vNormal; varying vec3 vColor;',
      FOG,
      'void main(){',
      '  vec3 n = normalize(vNormal);',
      '  float lam = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);',
      '  gl_FragColor = vec4(fogged(vColor * (0.45 + 0.75 * lam)), 1.0);',
      '}',
    ].join('\n'));

    // --- shadow: a soft blob on the ground under each car ---
    // Cheap, and it does more for believability than any amount of shading:
    // without a contact shadow the car reads as hovering, and on a slope you
    // genuinely cannot tell whether it is touching the ground.
    progs.shadow = program([
      'attribute vec2 aPos;',
      'uniform mat4 uViewProj; uniform vec3 uCentre; uniform float uRadius;',
      'varying vec2 vLocal;',
      'void main(){ vLocal = aPos;',
      '  vec3 w = uCentre + vec3(aPos.x * uRadius, 0.0, aPos.y * uRadius * 1.45);',
      '  gl_Position = uViewProj * vec4(w, 1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'varying vec2 vLocal;',
      'void main(){',
      '  float d = length(vLocal);',
      '  float a = smoothstep(1.0, 0.15, d) * 0.42;',
      '  gl_FragColor = vec4(0.0, 0.0, 0.0, a);',
      '}',
    ].join('\n'));

    // --- sky: a full-screen gradient drawn before everything, depth off ---
    progs.sky = program([
      'attribute vec2 aPos; varying vec2 vP;',
      'void main(){ vP = aPos; gl_Position = vec4(aPos, 0.999, 1.0); }',
    ].join('\n'), [
      'precision highp float;',
      'uniform vec3 uTop; uniform vec3 uHorizon;',
      'varying vec2 vP;',
      'void main(){ gl_FragColor = vec4(mix(uHorizon, uTop, clamp(vP.y*0.5+0.5, 0.0, 1.0)), 1.0); }',
    ].join('\n'));
  }

  // ---- buffers -------------------------------------------------------------
  // Meshes upload lazily and remember their buffers, so a tile that stays on
  // screen costs nothing after its first frame.
  function upload(mesh) {
    if (mesh._gl) return mesh._gl;
    var b = { vbo: {}, ibo: gl.createBuffer(), count: mesh.count,
              type: (mesh.indices instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    ['positions', 'normals', 'uvs', 'tone', 'binfo'].forEach(function (k) {
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
  var carMesh = null, carGL = null;

  function uploadCar() {
    if (carGL) return carGL;
    carMesh = buildCarMesh();
    carGL = { vbo: {}, ibo: gl.createBuffer(), count: carMesh.count, type: gl.UNSIGNED_SHORT };
    [['positions','aPos'],['normals','aNormal'],['colors','aColor']].forEach(function (p) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, carMesh[p[0]], gl.STATIC_DRAW);
      carGL.vbo[p[1]] = buf;
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, carGL.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, carMesh.indices, gl.STATIC_DRAW);
    return carGL;
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
  var SKY_TOP = [0.20, 0.44, 0.76], SKY_HORIZON = [0.78, 0.85, 0.89];
  var LIGHT = [0.45, 0.78, 0.30];

  function init(cv) {
    canvas = cv;
    var opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
    gl = cv.getContext('webgl2', opts);
    isGL2 = !!gl;
    if (!gl) gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('This device has no WebGL, so there is nothing to drive on.');
    if (!isGL2) gl.getExtension('OES_element_index_uint');   // 32-bit indices for big tiles
    buildPrograms();
    gl.enable(gl.DEPTH_TEST);
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
  function draw(scene) {
    var aspect = resize();
    var far = scene.far || 6000;
    perspective(proj, (scene.fov || 62) * Math.PI / 180, aspect, 0.5, far);
    lookAt(view, scene.eye, scene.target, [0, 1, 0]);
    multiply(viewProj, proj, view);

    gl.clearColor(SKY_HORIZON[0], SKY_HORIZON[1], SKY_HORIZON[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky first, with depth writes off so everything draws over it.
    gl.depthMask(false);
    gl.useProgram(progs.sky.id);
    gl.uniform3fv(progs.sky.u.uTop, SKY_TOP);
    gl.uniform3fv(progs.sky.u.uHorizon, SKY_HORIZON);
    gl.bindBuffer(gl.ARRAY_BUFFER, uploadSky());
    gl.enableVertexAttribArray(progs.sky.a.aPos);
    gl.vertexAttribPointer(progs.sky.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(progs.sky.a.aPos);
    gl.depthMask(true);

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
      drawMesh(progs.terrain, t.mesh, {
        aPos: { src: 'positions', size: 3 }, aNormal: { src: 'normals', size: 3 }, aUv: { src: 'uvs', size: 2 },
      });
    }

    // Water, then roads, then buildings — roads must land on top of water where
    // a bridge crosses it, and buildings are drawn last because they are the
    // only opaque geometry that reliably occludes.
    common(progs.water);
    gl.uniform1f(progs.water.u.uTime, scene.time || 0);
    for (var w = 0; w < scene.water.length; w++) {
      drawMesh(progs.water, scene.water[w], { aPos: { src: 'positions', size: 3 } });
    }

    gl.enable(gl.CULL_FACE);
    common(progs.road);
    for (var r = 0; r < scene.roads.length; r++) {
      drawMesh(progs.road, scene.roads[r], {
        aPos: { src: 'positions', size: 3 }, aUv: { src: 'uvs', size: 2 }, aTone: { src: 'tone', size: 1 },
      });
    }

    common(progs.building);
    for (var b = 0; b < scene.buildings.length; b++) {
      drawMesh(progs.building, scene.buildings[b], {
        aPos: { src: 'positions', size: 3 }, aNormal: { src: 'normals', size: 3 },
        aTone: { src: 'tone', size: 1 }, aBinfo: { src: 'binfo', size: 2 },
      });
    }

    // Contact shadows, before the cars themselves. Blended, and with depth
    // WRITES off so one shadow cannot occlude another or the car above it —
    // they still depth-TEST, so a shadow behind a building stays hidden.
    if (scene.cars && scene.cars.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(progs.shadow.id);
      gl.uniformMatrix4fv(progs.shadow.u.uViewProj, false, viewProj);
      gl.bindBuffer(gl.ARRAY_BUFFER, uploadShadow());
      gl.enableVertexAttribArray(progs.shadow.a.aPos);
      gl.vertexAttribPointer(progs.shadow.a.aPos, 2, gl.FLOAT, false, 0, 0);
      for (var sc = 0; sc < scene.cars.length; sc++) {
        var s0 = scene.cars[sc];
        // Sit it a few centimetres above the ground the car is standing on, so
        // it never z-fights with the road surface it is cast onto.
        gl.uniform3fv(progs.shadow.u.uCentre, [s0.x, (s0.groundY != null ? s0.groundY : s0.y) + 0.06, s0.z]);
        gl.uniform1f(progs.shadow.u.uRadius, 1.5);
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
      for (var c = 0; c < scene.cars.length; c++) {
        var car = scene.cars[c];
        carMatrix(m, car.x, car.y, car.z, car.yaw, car.pitch || 0, car.roll || 0);
        gl.uniformMatrix4fv(progs.car.u.uModel, false, m);
        gl.uniform3fv(progs.car.u.uTint, car.tint || [0.85, 0.25, 0.25]);
        gl.drawElements(gl.TRIANGLES, cg.count, cg.type, 0);
      }
      ['aPos','aNormal','aColor'].forEach(function (name) {
        var loc = progs.car.a[name];
        if (loc !== undefined && loc >= 0) gl.disableVertexAttribArray(loc);
      });
    }
  }

  root.Render = {
    init: init, draw: draw, textureFor: textureFor,
    get gl() { return gl; },
    isGL2: function () { return isGL2; },
  };
})(window);
