/* glTF Viewer core — orbit, lights, inspect. Classic script.
 * three + GLTFLoader + OrbitControls + RoomEnvironment arrive as window.*.
 * Loaders are patched so they never fetch: parse GLB bytes, paint textures
 * via img-src data:/blob:. Remote HDR / Draco / KTX2 / Meshopt are gone. */
(function (root) {
  'use strict';

  var THREE = root.THREE;
  var GLTFLoader = root.GLTFLoader;
  var OrbitControls = root.OrbitControls;
  var RoomEnvironment = root.RoomEnvironment;

  function utf8(buf) {
    var u = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  function dataUrlToBuf(url) {
    var i = url.indexOf(',');
    var meta = url.slice(0, i);
    var data = url.slice(i + 1);
    if (/;base64/i.test(meta)) {
      var bin = atob(data);
      var u = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      return u.buffer;
    }
    var t = decodeURIComponent(data);
    var o = new Uint8Array(t.length);
    for (var j = 0; j < t.length; j++) o[j] = t.charCodeAt(j);
    return o.buffer;
  }

  function patchThree() {
    if (!THREE || THREE.__gifosPatched) return;
    THREE.__gifosPatched = true;

    var IBL = THREE.ImageBitmapLoader;
    if (IBL && IBL.prototype) {
      IBL.prototype.load = function (url, onLoad, onProgress, onError) {
        var scope = this;
        if (url == null) url = '';
        if (this.path) url = this.path + url;
        url = this.manager.resolveURL(url);
        this.manager.itemStart(url);
        var img = new Image();
        img.onload = function () {
          var opts = Object.assign({ colorSpaceConversion: 'none' }, scope.options || {});
          function done(bmp) {
            if (onLoad) onLoad(bmp);
            scope.manager.itemEnd(url);
          }
          if (typeof createImageBitmap === 'function') {
            createImageBitmap(img, opts).then(done).catch(function (e) {
              if (onError) onError(e);
              scope.manager.itemError(url);
              scope.manager.itemEnd(url);
            });
          } else done(img);
        };
        img.onerror = function (e) {
          if (onError) onError(e);
          scope.manager.itemError(url);
          scope.manager.itemEnd(url);
        };
        img.src = url;
      };
    }

    var FL = THREE.FileLoader;
    if (FL && FL.prototype && !FL.prototype.__gifos) {
      FL.prototype.__gifos = true;
      var orig = FL.prototype.load;
      FL.prototype.load = function (url, onLoad, onProgress, onError) {
        var u = url || '';
        if (this.path) u = this.path + u;
        if (typeof u === 'string' && u.indexOf('data:') === 0) {
          var scope = this;
          try {
            var buf = dataUrlToBuf(u);
            var out = buf;
            if (this.responseType === 'json') out = JSON.parse(utf8(buf));
            else if (this.responseType === 'blob') out = new Blob([buf]);
            else if (!this.responseType || this.responseType === 'text') out = utf8(buf);
            this.manager.itemStart(url);
            setTimeout(function () {
              if (onLoad) onLoad(out);
              scope.manager.itemEnd(url);
            }, 0);
          } catch (e) {
            if (onError) onError(e);
          }
          return;
        }
        return orig.apply(this, arguments);
      };
    }
  }

  function b64(bytes) {
    var u = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    var s = '';
    var chunk = 0x8000;
    for (var i = 0; i < u.length; i += chunk) {
      s += String.fromCharCode.apply(null, u.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  function guessMime(name) {
    var n = String(name || '').toLowerCase();
    if (/\.png$/.test(n)) return 'image/png';
    if (/\.jpe?g$/.test(n)) return 'image/jpeg';
    if (/\.webp$/.test(n)) return 'image/webp';
    if (/\.gif$/.test(n)) return 'image/gif';
    return 'application/octet-stream';
  }

  /* Rewrite a .gltf JSON so buffers/images that were sibling files become
   * data: URIs. GLB is already self-contained. */
  function inlineGltf(jsonText, files) {
    var json = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    function find(uri) {
      if (!uri || uri.indexOf('data:') === 0) return null;
      var tail = decodeURI(uri).replace(/^\.\//, '');
      var hit = files.get(tail) || files.get(tail.replace(/^.*\//, ''));
      if (!hit) {
        files.forEach(function (v, k) {
          if (!hit && (k === tail || k.endsWith('/' + tail) || k.endsWith(tail))) hit = v;
        });
      }
      return hit;
    }
    function asData(uri, bytes, mime) {
      if (uri && uri.indexOf('data:') === 0) return uri;
      if (!bytes) return uri;
      return 'data:' + (mime || 'application/octet-stream') + ';base64,' + b64(bytes);
    }
    (json.buffers || []).forEach(function (b) {
      if (b.uri && b.uri.indexOf('data:') !== 0) {
        var f = find(b.uri);
        if (f) b.uri = asData(b.uri, f, 'application/octet-stream');
      }
    });
    (json.images || []).forEach(function (im) {
      if (im.uri && im.uri.indexOf('data:') !== 0) {
        var f = find(im.uri);
        if (f) im.uri = asData(im.uri, f, guessMime(im.uri));
      }
    });
    if (json.extensionsUsed && json.extensionsUsed.indexOf('KHR_draco_mesh_compression') >= 0) {
      throw new Error('This file uses Draco compression, which this copy does not unpack. Export a plain .glb and drop that.');
    }
    return json;
  }

  function isGlb(buf) {
    var u = new Uint8Array(buf);
    return u.length >= 4 && u[0] === 0x67 && u[1] === 0x6c && u[2] === 0x54 && u[3] === 0x46;
  }

  function traverseMaterials(object, cb) {
    object.traverse(function (node) {
      if (!node.geometry) return;
      var mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach(function (m) { if (m) cb(m); });
    });
  }

  function Viewer(el, options) {
    patchThree();
    this.el = el;
    this.options = options || {};
    this.lights = [];
    this.content = null;
    this.mixer = null;
    this.clips = [];
    this.skeletonHelpers = [];
    this.gridHelper = null;
    this.axesHelper = null;
    this.prevTime = 0;
    this.state = {
      wireframe: false,
      grid: false,
      autoRotate: false,
      punctualLights: true,
      ambientIntensity: 0.3,
      directIntensity: 0.8 * Math.PI,
      environment: true,
      bgColor: '#191919'
    };

    this.backgroundColor = new THREE.Color(this.state.bgColor);
    this.scene = new THREE.Scene();
    this.scene.background = this.backgroundColor;

    var w = el.clientWidth || 4, h = el.clientHeight || 4;
    this.defaultCamera = new THREE.PerspectiveCamera(60, w / h, 0.01, 1000);
    this.activeCamera = this.defaultCamera;
    this.scene.add(this.defaultCamera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.LinearToneMapping;

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.neutralEnvironment = this.pmremGenerator.fromScene(new RoomEnvironment()).texture;

    this.controls = new OrbitControls(this.defaultCamera, this.renderer.domElement);
    this.controls.screenSpacePanning = true;
    this.el.appendChild(this.renderer.domElement);

    this.addLights();
    this.updateEnvironment();

    this.animate = this.animate.bind(this);
    this.resize = this.resize.bind(this);
    root.requestAnimationFrame(this.animate);
    root.addEventListener('resize', this.resize, false);
  }

  Viewer.prototype.animate = function (time) {
    root.requestAnimationFrame(this.animate);
    var dt = (time - this.prevTime) / 1000;
    this.controls.update();
    if (this.mixer) this.mixer.update(dt);
    this.renderer.render(this.scene, this.activeCamera);
    this.prevTime = time;
  };

  Viewer.prototype.resize = function () {
    var w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.defaultCamera.aspect = w / h;
    this.defaultCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  Viewer.prototype.loadBytes = function (name, buffer, files) {
    var self = this;
    files = files || new Map();
    return new Promise(function (resolve, reject) {
      var loader = new GLTFLoader();
      function onGltf(gltf) {
        var scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        var clips = gltf.animations || [];
        if (!scene) return reject(new Error('This model contains no scene.'));
        self.setContent(scene, clips);
        resolve({ gltf: gltf, name: name });
      }
      try {
        if (isGlb(buffer)) {
          loader.parse(buffer, '', onGltf, reject);
          return;
        }
        var json = inlineGltf(utf8(buffer), files);
        loader.parse(JSON.stringify(json), '', onGltf, reject);
      } catch (e) {
        reject(e);
      }
    });
  };

  Viewer.prototype.setContent = function (object, clips) {
    this.clear();
    object.updateMatrixWorld();
    var box = new THREE.Box3().setFromObject(object);
    var size = box.getSize(new THREE.Vector3()).length();
    var center = box.getCenter(new THREE.Vector3());
    this.controls.reset();
    object.position.x -= center.x;
    object.position.y -= center.y;
    object.position.z -= center.z;
    this.controls.maxDistance = size * 10;
    this.defaultCamera.near = size / 100;
    this.defaultCamera.far = size * 100;
    this.defaultCamera.updateProjectionMatrix();
    this.defaultCamera.position.set(size / 2, size / 5, size / 2);
    this.defaultCamera.lookAt(0, 0, 0);
    this.controls.saveState();
    this.scene.add(object);
    this.content = object;
    this.state.punctualLights = true;
    this.content.traverse(function (node) {
      if (node.isLight) this.state.punctualLights = false;
    }.bind(this));
    this.setClips(clips);
    this.updateLights();
    this.updateEnvironment();
    this.updateDisplay();
    this.resize();
  };

  Viewer.prototype.setClips = function (clips) {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.clips = clips || [];
    if (!this.clips.length) return;
    this.mixer = new THREE.AnimationMixer(this.content);
    var first = this.mixer.clipAction(this.clips[0]);
    first.reset().play();
  };

  Viewer.prototype.playClip = function (i, on) {
    if (!this.mixer || !this.clips[i]) return;
    var action = this.mixer.clipAction(this.clips[i]);
    if (on) action.reset().play();
    else action.stop();
  };

  Viewer.prototype.playAll = function () {
    var self = this;
    this.clips.forEach(function (clip, i) { self.playClip(i, true); });
  };

  Viewer.prototype.addLights = function () {
    var a = new THREE.AmbientLight(0xffffff, this.state.ambientIntensity);
    a.name = 'ambient_light';
    this.defaultCamera.add(a);
    var d = new THREE.DirectionalLight(0xffffff, this.state.directIntensity);
    d.position.set(0.5, 0, 0.866);
    d.name = 'main_light';
    this.defaultCamera.add(d);
    this.lights = [a, d];
  };

  Viewer.prototype.updateLights = function () {
    if (this.lights.length === 2) {
      this.lights[0].intensity = this.state.ambientIntensity;
      this.lights[1].intensity = this.state.directIntensity;
    }
  };

  Viewer.prototype.updateEnvironment = function () {
    this.scene.environment = this.state.environment ? this.neutralEnvironment : null;
    this.scene.background = this.backgroundColor;
  };

  Viewer.prototype.updateDisplay = function () {
    var self = this;
    if (!this.content) {
      this.controls.autoRotate = this.state.autoRotate;
      return;
    }
    traverseMaterials(this.content, function (material) {
      material.wireframe = self.state.wireframe;
    });
    if (this.state.grid && !this.gridHelper) {
      this.gridHelper = new THREE.GridHelper();
      this.axesHelper = new THREE.AxesHelper();
      this.scene.add(this.gridHelper);
      this.scene.add(this.axesHelper);
    } else if (!this.state.grid && this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.scene.remove(this.axesHelper);
      this.gridHelper = null;
      this.axesHelper = null;
    }
    this.controls.autoRotate = this.state.autoRotate;
  };

  Viewer.prototype.flash = function (uuid) {
    if (!this.content) return;
    var found = null;
    this.content.traverse(function (n) { if (n.uuid === uuid) found = n; });
    if (!found) return;
    var box = new THREE.Box3().setFromObject(found);
    var helper = new THREE.Box3Helper(box, 0x58a6ff);
    this.scene.add(helper);
    setTimeout(function () { this.scene.remove(helper); }.bind(this), 700);
  };

  Viewer.prototype.graph = function () {
    var rows = [];
    if (!this.content) return rows;
    function walk(node, depth) {
      var kind = node.type || 'Object3D';
      var name = node.name || '(unnamed)';
      rows.push({ uuid: node.uuid, depth: depth, label: kind + '  ' + name });
      (node.children || []).forEach(function (c) { walk(c, depth + 1); });
    }
    walk(this.content, 0);
    return rows;
  };

  Viewer.prototype.stats = function () {
    var meshes = 0, mats = 0, tris = 0, verts = 0, bones = 0, cameras = 0;
    var seen = {};
    if (!this.content) return { meshes: 0, materials: 0, triangles: 0, vertices: 0, bones: 0, cameras: 0, clips: 0 };
    this.content.traverse(function (n) {
      if (n.isMesh || n.isSkinnedMesh) {
        meshes++;
        var g = n.geometry;
        if (g) {
          var idx = g.index;
          var pos = g.attributes && g.attributes.position;
          if (idx) tris += idx.count / 3;
          else if (pos) tris += pos.count / 3;
          if (pos) verts += pos.count;
        }
      }
      if (n.isCamera) cameras++;
      if (n.isBone) bones++;
      var ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
      ms.forEach(function (m) {
        if (m && !seen[m.uuid]) { seen[m.uuid] = 1; mats++; }
      });
    });
    return {
      meshes: meshes,
      materials: mats,
      triangles: Math.round(tris),
      vertices: verts,
      bones: bones,
      cameras: cameras,
      clips: this.clips.length
    };
  };

  Viewer.prototype.clear = function () {
    if (!this.content) return;
    this.scene.remove(this.content);
    this.content.traverse(function (node) {
      if (node.geometry) node.geometry.dispose();
    });
    traverseMaterials(this.content, function (material) {
      for (var key in material) {
        if (key !== 'envMap' && material[key] && material[key].isTexture) material[key].dispose();
      }
    });
    this.content = null;
  };

  Viewer.dataUrlToBuf = dataUrlToBuf;
  Viewer.utf8 = utf8;
  Viewer.isGlb = isGlb;
  Viewer.inlineGltf = inlineGltf;
  Viewer.patchThree = patchThree;
  root.GltfViewer = Viewer;
})(typeof window !== 'undefined' ? window : this);
