/*
 * Polygon Shredder loop extracted from spite/polygon-shredder js/main-boxels.js
 * (MIT, Jaume Sanchez). Social widgets, dat.gui, FBO helper, hash reload and
 * remote texture fetch stripped. Spotlight is a procedural radial. Classic IIFE.
 */
(function (root) {
  'use strict';

  var isMobile = { any: false, apple: { device: false } };
  root.isMobile = isMobile;

  var params = {
    spread: 4, factor: 0.5, evolution: 0.5, rotation: 0.5,
    radius: 2, pulsate: false, scaleX: 0.1, scaleY: 1, scaleZ: 5, scale: 1
  };

  var colors = [
    0xed6a5a, 0xf4f1bb, 0x9bc1bc, 0x5ca4a9, 0xe6ebe0,
    0xf0b67f, 0xfe5f55, 0xd6d1b1, 0xc7efcf, 0xeef5db,
    0x50514f, 0xf25f5c, 0xffe066, 0x247ba0, 0x70c1b3
  ];

  var BOX_VERTS = [
    -1,-1,-1, -1,-1, 1, -1, 1, 1,
    -1,-1,-1, -1, 1, 1, -1, 1,-1,
     1, 1,-1,  1,-1,-1, -1,-1,-1,
     1, 1,-1, -1,-1,-1, -1, 1,-1,
     1,-1, 1, -1,-1, 1, -1,-1,-1,
     1,-1, 1, -1,-1,-1,  1,-1,-1,
     1, 1, 1,  1,-1, 1,  1,-1,-1,
     1, 1,-1,  1, 1, 1,  1,-1,-1,
    -1,-1, 1,  1,-1, 1,  1, 1, 1,
    -1, 1, 1, -1,-1, 1,  1, 1, 1,
    -1, 1,-1, -1, 1, 1,  1, 1, 1,
     1, 1,-1, -1, 1,-1,  1, 1, 1
  ];

  var size = 64;
  var running = false;
  var raf = 0;
  var container, scene, camera, light, encasing, renderer, controls;
  var mesh, material, shadowMaterial, plane, sim, proxy;
  var shadowBuffer, shadowCamera;
  var nOffset, tmpVector, mouse, raycaster;
  var scale = 0, nScale = 1;
  var clock, m, v;
  var mounted = false;
  var lastError = '';
  var frameCb = null;

  function defaultSize(el) {
    var w = (el && el.clientWidth) || 400;
    var dpr = root.devicePixelRatio || 1;
    if (w < 500 || dpr < 1.2) return 32;
    return 64;
  }
  function pickFloat(gl) {
    var hasFloat = !!(gl.getExtension('OES_texture_float')
      || gl.getExtension('EXT_color_buffer_float')
      || gl.getExtension('WEBGL_color_buffer_float'));
    var hasHalf = !!(gl.getExtension('OES_texture_half_float')
      || gl.getExtension('EXT_color_buffer_half_float')
      || gl.getExtension('OES_texture_half_float_linear'));
    if (hasFloat) return 'float';
    if (hasHalf) return 'half';
    return null;
  }
  function aimFromEvent(e) {
    if (!renderer || !mouse || !e) return;
    var r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function spotlightTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, '#f0f0f0');
    grd.addColorStop(1, '#000000');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    var tex = new THREE.Texture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function init(el, q) {
    container = el;
    size = q || defaultSize(el);
    if (size !== 16 && size !== 32 && size !== 64) size = defaultSize(el);
    isMobile.any = ((el && el.clientWidth) || 400) < 500;
    isMobile.apple.device = /iPhone|iPad|iPod/i.test((root.navigator && root.navigator.userAgent) || '');
    renderer = new THREE.WebGLRenderer({ antialias: size >= 48, canvas: null });
    renderer.setClearColor(0x202020);
    var gl = renderer.getContext();
    if (!gl) {
      lastError = 'This toy needs WebGL, and this browser does not have it.';
      throw new Error(lastError);
    }
    var kind = pickFloat(gl);
    if (!kind) {
      lastError = 'This GPU cannot run the shred — it has no floating-point textures. A newer phone or computer will.';
      renderer.dispose();
      renderer = null;
      throw new Error(lastError);
    }
    root.__psFloatType = (kind === 'half' || isMobile.apple.device) ? THREE.HalfFloatType : THREE.FloatType;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    plane = new THREE.Mesh(
      new THREE.PlaneGeometry(10000, 10000),
      new THREE.MeshNormalMaterial({ side: THREE.DoubleSide, visible: false })
    );
    plane.material.visible = false;
    scene.add(plane);

    camera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);
    scene.add(camera);
    camera.position.z = 8;

    var s = 15;
    shadowCamera = new THREE.OrthographicCamera(-s, s, s, -s, 0.1, 20);
    shadowCamera.position.set(10, 4, 10);
    shadowCamera.lookAt(scene.position);

    light = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 6, 1, 36),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    light.position.copy(shadowCamera.position);
    scene.add(light);
    light.lookAt(scene.position);
    light.rotation.y += Math.PI / 2;
    light.rotation.z += Math.PI / 2;

    encasing = new THREE.Mesh(
      new THREE.CylinderGeometry(5.1, 6.1, 0.9, 36),
      new THREE.MeshBasicMaterial({ color: 0x101010 })
    );
    encasing.position.copy(shadowCamera.position);
    scene.add(encasing);
    encasing.lookAt(scene.position);
    encasing.rotation.y += Math.PI / 2;
    encasing.rotation.z += Math.PI / 2;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    function trySim(type) {
      root.__psFloatType = type;
      return new Simulation(renderer, size, size);
    }
    try {
      sim = trySim(root.__psFloatType || THREE.FloatType);
    } catch (e1) {
      try {
        sim = trySim(THREE.HalfFloatType);
      } catch (e2) {
        lastError = 'This GPU cannot run the shred — it cannot simulate the cloud.';
        throw e2;
      }
    }

    gl = renderer.getContext();
    var shadowBufferSize = Math.min(size >= 64 ? 1024 : (size >= 32 ? 512 : 256), gl.getParameter(gl.MAX_TEXTURE_SIZE));
    shadowBuffer = new THREE.WebGLRenderTarget(shadowBufferSize, shadowBufferSize, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    var geometry = new THREE.BufferGeometry();
    var positionsLength = sim.width * sim.height * 3 * 18;
    var positions = new Float32Array(positionsLength);
    var p = 0, j;
    for (j = 0; j < positionsLength; j += 3) {
      positions[j] = p;
      positions[j + 1] = Math.floor(p / 18);
      positions[j + 2] = p % 18;
      p++;
    }
    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));

    var diffuseData = new Uint8Array(sim.width * sim.height * 4);
    for (j = 0; j < sim.width * sim.height * 4; j += 4) {
      var c = new THREE.Color(colors[(Math.random() * colors.length) | 0]);
      diffuseData[j] = c.r * 255;
      diffuseData[j + 1] = c.g * 255;
      diffuseData[j + 2] = c.b * 255;
    }
    var diffuseTexture = new THREE.DataTexture(diffuseData, sim.width, sim.height, THREE.RGBAFormat);
    diffuseTexture.minFilter = THREE.NearestFilter;
    diffuseTexture.magFilter = THREE.NearestFilter;
    diffuseTexture.needsUpdate = true;

    var S = root.PSShaders;
    material = new THREE.RawShaderMaterial({
      uniforms: {
        map: { type: 't', value: sim.rtTexturePos },
        prevMap: { type: 't', value: sim.rtTexturePos },
        diffuse: { type: 't', value: diffuseTexture },
        width: { type: 'f', value: sim.width },
        height: { type: 'f', value: sim.height },
        dimensions: { type: 'v2', value: new THREE.Vector2(shadowBufferSize, shadowBufferSize) },
        timer: { type: 'f', value: 0 },
        spread: { type: 'f', value: 4 },
        boxScale: { type: 'v3', value: new THREE.Vector3() },
        meshScale: { type: 'f', value: 1 },
        depthTexture: { type: 't', value: shadowBuffer },
        shadowV: { type: 'm4', value: new THREE.Matrix4() },
        shadowP: { type: 'm4', value: new THREE.Matrix4() },
        resolution: { type: 'v2', value: new THREE.Vector2(shadowBufferSize, shadowBufferSize) },
        lightPosition: { type: 'v3', value: new THREE.Vector3() },
        projector: { type: 't', value: spotlightTexture() },
        boxVertices: { type: '3fv', value: BOX_VERTS },
        boxNormals: { type: '3fv', value: [1, 0, 0, 0, 0, 1, 0, 1, 0] }
      },
      vertexShader: S['vs-particles'],
      fragmentShader: S['fs-particles'],
      side: THREE.DoubleSide,
      shading: THREE.FlatShading
    });

    mesh = new THREE.Mesh(geometry, material);
    shadowMaterial = new THREE.RawShaderMaterial({
      uniforms: {
        map: { type: 't', value: sim.rtTexturePos },
        prevMap: { type: 't', value: sim.rtTexturePos },
        width: { type: 'f', value: sim.width },
        height: { type: 'f', value: sim.height },
        timer: { type: 'f', value: 0 },
        boxScale: { type: 'v3', value: new THREE.Vector3() },
        meshScale: { type: 'f', value: 1 },
        shadowV: { type: 'm4', value: new THREE.Matrix4() },
        shadowP: { type: 'm4', value: new THREE.Matrix4() },
        resolution: { type: 'v2', value: new THREE.Vector2(shadowBufferSize, shadowBufferSize) },
        lightPosition: { type: 'v3', value: new THREE.Vector3() },
        boxVertices: { type: '3fv', value: BOX_VERTS },
        boxNormals: { type: '3fv', value: [1, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, -1, 0] }
      },
      vertexShader: S['vs-particles'],
      fragmentShader: S['fs-particles-shadow'],
      side: THREE.DoubleSide
    });
    scene.add(mesh);

    proxy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), new THREE.MeshNormalMaterial());
    proxy.material.visible = false;

    nOffset = new THREE.Vector3(0, 0, 0);
    tmpVector = new THREE.Vector3();
    mouse = new THREE.Vector2();
    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();
    m = new THREE.Matrix4();
    v = new THREE.Vector3();

    renderer.domElement.addEventListener('pointermove', function (e) { aimFromEvent(e); });
    renderer.domElement.addEventListener('pointerdown', function (e) { aimFromEvent(e); nScale = 2; });
    renderer.domElement.addEventListener('pointerup', function () { nScale = 0.5; });

    fit();
  }

  function destroy() {
    pause();
    if (controls && controls.dispose) {
      try { controls.dispose(); } catch (e) {}
    }
    if (renderer) {
      try { renderer.dispose(); } catch (e) {}
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    scene = camera = light = encasing = renderer = controls = null;
    mesh = material = shadowMaterial = plane = sim = proxy = null;
    shadowBuffer = shadowCamera = null;
    mounted = false;
  }

  function fit() {
    if (!container || !renderer) return;
    var w = Math.max(32, container.clientWidth | 0);
    var h = Math.max(32, container.clientHeight | 0);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function render() {
    controls.update();
    scale += (nScale - scale) * 0.01;
    plane.lookAt(camera.position);
    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObject(plane);
    if (intersects.length) {
      nOffset.copy(intersects[0].point);
      proxy.position.copy(nOffset);
    }
    var delta = clock.getDelta() * 10;
    var time = clock.elapsedTime;
    tmpVector.copy(nOffset);
    tmpVector.sub(sim.simulationShader.uniforms.offset.value);
    tmpVector.multiplyScalar(0.1);
    sim.simulationShader.uniforms.offset.value.add(tmpVector);
    sim.simulationShader.uniforms.factor.value = params.factor;
    sim.simulationShader.uniforms.evolution.value = params.evolution;
    sim.simulationShader.uniforms.radius.value = params.pulsate
      ? (0.5 + 0.5 * Math.cos(time)) * params.radius
      : params.radius;
    if (sim.simulationShader.uniforms.active.value) {
      mesh.rotation.y = params.rotation * time;
    }
    m.copy(mesh.matrixWorld);
    sim.simulationShader.uniforms.inverseModelViewMatrix.value.getInverse(m);
    sim.simulationShader.uniforms.genScale.value = scale;
    if (sim.simulationShader.uniforms.active.value === 1) sim.render(time, delta);
    material.uniforms.map.value = shadowMaterial.uniforms.map.value = sim.targets[sim.targetPos];
    material.uniforms.prevMap.value = shadowMaterial.uniforms.prevMap.value = sim.targets[1 - sim.targetPos];
    material.uniforms.spread.value = params.spread;
    material.uniforms.timer.value = shadowMaterial.uniforms.timer.value = time;
    material.uniforms.boxScale.value.set(params.scaleX, params.scaleY, params.scaleZ);
    shadowMaterial.uniforms.boxScale.value.set(params.scaleX, params.scaleY, params.scaleZ);
    material.uniforms.meshScale.value = params.scale;
    shadowMaterial.uniforms.meshScale.value = params.scale;

    renderer.setClearColor(0);
    mesh.material = shadowMaterial;
    light.material.visible = false;
    encasing.material.visible = false;
    renderer.render(scene, shadowCamera, shadowBuffer);
    light.material.visible = true;
    encasing.material.visible = true;

    tmpVector.copy(scene.position);
    tmpVector.sub(shadowCamera.position);
    tmpVector.normalize();
    m.makeRotationY(-mesh.rotation.y);
    v.copy(shadowCamera.position);
    v.applyMatrix4(m);
    material.uniforms.shadowP.value.copy(shadowCamera.projectionMatrix);
    material.uniforms.shadowV.value.copy(shadowCamera.matrixWorldInverse);
    material.uniforms.lightPosition.value.copy(v);

    renderer.setClearColor(0x202020);
    mesh.material = material;
    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    raf = root.requestAnimationFrame(loop);
    render();
    if (frameCb) frameCb();
  }

  function play() {
    if (running) return;
    running = true;
    if (sim) sim.simulationShader.uniforms.active.value = 1;
    loop();
  }
  function pause() {
    running = false;
    if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
    if (sim) sim.simulationShader.uniforms.active.value = 0;
  }

  root.PolygonShredder = {
    mount: function (el, q) {
      lastError = '';
      if (typeof THREE === 'undefined' || typeof Simulation !== 'function' || !root.PSShaders) {
        lastError = 'This toy could not load.';
        return false;
      }
      if (mounted) {
        if (q && q !== size) destroy();
        else return true;
      }
      try {
        init(el, q);
        mounted = true;
        return true;
      } catch (e) {
        if (!lastError) {
          lastError = 'This GPU cannot run the shred — it cannot simulate the cloud. A phone or computer with a stronger GPU will.';
        }
        try { destroy(); } catch (e2) {}
        return false;
      }
    },
    play: play,
    pause: pause,
    fit: fit,
    destroy: destroy,
    isRunning: function () { return running; },
    quality: function () { return size; },
    lastError: function () { return lastError; },
    onFrame: function (fn) { frameCb = fn; },
    getParams: function () {
      return {
        factor: params.factor, evolution: params.evolution, rotation: params.rotation,
        radius: params.radius, pulsate: params.pulsate, scaleX: params.scaleX,
        scaleY: params.scaleY, scaleZ: params.scaleZ, scale: params.scale
      };
    },
    setParams: function (p) {
      var k;
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k) && p[k] != null) params[k] = p[k];
    }
  };
})(this);
