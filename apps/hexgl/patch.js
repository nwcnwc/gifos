/*
 * HexGL — sandbox hatches.
 *
 * Upstream XHRs geometries and images, and streams audio with XHR. The
 * GIF srcdoc cannot fetch, so boot.js fills HEXGL_URLS / HEXGL_GEOMS /
 * HEXGL_BUFFERS from gifos.assets() and these replacements resolve there.
 */
(function (root) {
  'use strict';

  function resolve(url) {
    if (!url) return url;
    if (root.HEXGL_URLS && root.HEXGL_URLS[url]) return root.HEXGL_URLS[url];
    var cube = url.indexOf('%1');
    if (cube >= 0 && root.HEXGL_URLS) {
      // loadTextureCube rewrites %1 itself; leave the template if faces exist.
      return url;
    }
    return url;
  }

  if (root.THREE && root.THREE.ImageUtils) {
    root.THREE.ImageUtils.crossOrigin = '';
  }

  if (root.THREE && root.THREE.JSONLoader) {
    var origAjax = root.THREE.JSONLoader.prototype.loadAjaxJSON;
    root.THREE.JSONLoader.prototype.loadAjaxJSON = function (loader, url, callback, texturePath, callbackProgress) {
      var json = root.HEXGL_GEOMS && root.HEXGL_GEOMS[url];
      if (json) {
        loader.createModel(json, callback, texturePath);
        if (loader.onLoadComplete) loader.onLoadComplete();
        return;
      }
      return origAjax.call(this, loader, url, callback, texturePath, callbackProgress);
    };
  }

  if (root.bkcore && root.bkcore.threejs && root.bkcore.threejs.Loader) {
    var L = root.bkcore.threejs.Loader.prototype;
    var loadTex = L.loadTexture;
    L.loadTexture = function (name, url) {
      return loadTex.call(this, name, resolve(url));
    };
    var loadImg = L.loadImage;
    L.loadImage = function (name, url) {
      return loadImg.call(this, name, resolve(url));
    };
    var loadAn = L.loadAnalyser;
    L.loadAnalyser = function (name, url) {
      return loadAn.call(this, name, resolve(url));
    };
    var loadSnd = L.loadSound;
    L.loadSound = function (src, name, loop) {
      return loadSnd.call(this, resolve(src) || src, name, loop);
    };
  }

  if (root.THREE && root.THREE.ImageUtils && root.THREE.ImageUtils.loadTextureCube) {
    var loadCubeTex = root.THREE.ImageUtils.loadTextureCube;
    root.THREE.ImageUtils.loadTextureCube = function (urls, mapping, callback) {
      var mapped = [];
      for (var i = 0; i < urls.length; i++) mapped.push(resolve(urls[i]));
      return loadCubeTex.call(this, mapped, mapping, callback);
    };
  }

  if (root.bkcore && root.bkcore.Audio) {
    var origAdd = root.bkcore.Audio.addSound;
    root.bkcore.Audio.addSound = function (src, id, loop, callback, usePanner) {
      var buf = root.HEXGL_BUFFERS && (root.HEXGL_BUFFERS[src] || root.HEXGL_BUFFERS[id]);
      var ctx = root.bkcore.Audio._ctx;
      if (buf && ctx) {
        var audio = { src: null, gainNode: null, bufferNode: null, loop: loop };
        var gainNode = ctx.createGain();
        if (usePanner === true && root.bkcore.Audio._panner) gainNode.connect(root.bkcore.Audio._panner);
        else gainNode.connect(ctx.destination);
        ctx.decodeAudioData(buf.slice(0), function (b) {
          audio.src = b;
          audio.gainNode = gainNode;
          root.bkcore.Audio.sounds[id] = audio;
          if (callback) callback();
        }, function () {
          root.bkcore.Audio.sounds[id] = audio;
          if (callback) callback();
        });
        root.bkcore.Audio.sounds[id] = audio;
        return;
      }
      if (buf && !ctx) {
        var blob = new Blob([buf], { type: 'audio/ogg' });
        return origAdd.call(this, URL.createObjectURL(blob), id, loop, callback, usePanner);
      }
      return origAdd.call(this, src, id, loop, callback, usePanner);
    };
  }

  if (root.bkcore && root.bkcore.ImageData) {
    var OrigID = root.bkcore.ImageData;
    root.bkcore.ImageData = function (path, callback) {
      var self = this;
      this.image = new Image();
      this.pixels = null;
      this.canvas = null;
      this.loaded = false;
      this.image.onload = function () {
        self.canvas = document.createElement('canvas');
        self.canvas.width = self.image.width;
        self.canvas.height = self.image.height;
        var context = self.canvas.getContext('2d');
        context.drawImage(self.image, 0, 0);
        self.pixels = context.getImageData(0, 0, self.canvas.width, self.canvas.height);
        self.loaded = true;
        context = null;
        self.canvas = null;
        self.image = null;
        if (callback) callback.call(self);
      };
      this.image.src = resolve(path);
    };
    root.bkcore.ImageData.prototype = OrigID.prototype;
  }

  // WASD drive. Original A/D are air-brakes (kept as Q/E).
  if (root.bkcore && root.bkcore.hexgl && root.bkcore.hexgl.HUD) {
    var OrigHUD = root.bkcore.hexgl.HUD;
    root.bkcore.hexgl.HUD = function (opts) {
      opts = opts || {};
      if (!opts.font || opts.font === 'BebasNeueRegular') {
        opts.font = 'Impact, "Arial Narrow", sans-serif';
      }
      OrigHUD.call(this, opts);
    };
    root.bkcore.hexgl.HUD.prototype = OrigHUD.prototype;
  }

  if (root.bkcore && root.bkcore.hexgl && root.bkcore.hexgl.ShipControls) {
    var proto = root.bkcore.hexgl.ShipControls.prototype;
    // Extra listeners are bound in boot.js once the instance exists.
    proto.bindWasd = function () {
      var self = this;
      function down(ev) {
        switch (ev.keyCode) {
          case 87: self.key.forward = true; break;
          case 83: self.key.backward = true; break;
          case 65: self.key.left = true; break;
          case 68: self.key.right = true; break;
        }
      }
      function up(ev) {
        switch (ev.keyCode) {
          case 87: self.key.forward = false; break;
          case 83: self.key.backward = false; break;
          case 65: self.key.left = false; break;
          case 68: self.key.right = false; break;
        }
      }
      this.dom.addEventListener('keydown', down, false);
      this.dom.addEventListener('keyup', up, false);
    };
  }

  // Never navigate the srcdoc away.
  if (root.bkcore && root.bkcore.hexgl && root.bkcore.hexgl.HexGL) {
    var reset = root.bkcore.hexgl.HexGL.prototype.reset;
    root.bkcore.hexgl.HexGL.prototype.reset = function () {
      this.active = true;
      return reset.call(this);
    };
  }
})(window);
