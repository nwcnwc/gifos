/* OpenCascade worker: wasm from gifos.assets, sketch → extrude → mesh. */
(function (root) {
  'use strict';

  function CadEngine() {
    this.worker = null;
    this.ready = false;
    this._id = 1;
    this._pend = {};
    this.onlog = null;
    this.onprogress = null;
  }

  CadEngine.prototype.init = function () {
    var self = this;
    if (!(root.gifos && gifos.assets)) {
      return Promise.reject(new Error('This app needs to run inside GifOS to reach its CAD kernel.'));
    }
    return Promise.all([
      gifos.assets('cascadestudio.wasm'),
      gifos.assets('cascade-worker.js')
    ]).then(function (pair) {
      var wasm = pair[0], srcBuf = pair[1];
      if (!wasm || wasm.byteLength < 100) throw new Error('CAD kernel came back empty.');
      var src = new TextDecoder().decode(srcBuf);
      var blob = new Blob([src], { type: 'text/javascript' });
      var url = URL.createObjectURL(blob);
      var w = new Worker(url);
      self.worker = w;
      w.onmessage = function (ev) { self._onmsg(ev.data); };
      w.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        self._failAll(new Error((ev && ev.message) || 'CAD worker failed'));
      };
      return new Promise(function (resolve, reject) {
        self._boot = { resolve: resolve, reject: reject };
        w.postMessage({ type: 'gifosWasm', buffer: wasm }, [wasm]);
        setTimeout(function () {
          if (!self.ready) reject(new Error('CAD kernel did not start.'));
        }, 120000);
      });
    });
  };

  CadEngine.prototype._onmsg = function (d) {
    if (!d) return;
    if (d.type === 'startupCallback') {
      this.ready = true;
      if (this._boot) { this._boot.resolve(); this._boot = null; }
      return;
    }
    if (d.type === 'log' && this.onlog) this.onlog(String(d.payload || ''));
    if (d.type === 'Progress' && this.onprogress) this.onprogress(d.payload);
    if (d.requestId && this._pend[d.requestId]) {
      var p = this._pend[d.requestId];
      delete this._pend[d.requestId];
      p.resolve(d.payload);
    }
  };

  CadEngine.prototype._failAll = function (err) {
    if (this._boot) { this._boot.reject(err); this._boot = null; }
    Object.keys(this._pend).forEach(function (k) {
      this._pend[k].reject(err);
      delete this._pend[k];
    }, this);
  };

  CadEngine.prototype._call = function (type, payload) {
    var self = this;
    if (!this.ready) return Promise.reject(new Error('CAD kernel is still loading.'));
    return new Promise(function (resolve, reject) {
      var id = self._id++;
      self._pend[id] = { resolve: resolve, reject: reject };
      self.worker.postMessage({ type: type, payload: payload, requestId: id });
      setTimeout(function () {
        if (self._pend[id]) {
          delete self._pend[id];
          reject(new Error('The solid took too long to build.'));
        }
      }, 45000);
    });
  };

  CadEngine.prototype.sketchSolid = function (points, height, radius) {
    var fillets = [];
    var r = +radius || 0;
    for (var i = 0; i < points.length; i++) fillets[i] = r;
    var self = this;
    return this._call('sketchSolid', {
      points: points,
      fillets: fillets,
      height: +height || 10
    }).then(function () {
      return self._call('combineAndRenderShapes', { maxDeviation: 0.15, sceneOptions: {} });
    }).then(function (payload) {
      // worker returns [ [faces, edges], sceneOptions ]
      var pair = payload && payload[0];
      return pair;
    });
  };

  root.CadEngine = CadEngine;
})(window);
