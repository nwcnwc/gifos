/* Open a PDF, paint a page, search it. No gifos.* here — boot.js and net.js
 * own persistence and the room. pdf.js is handed a live blob: Worker; the
 * CSP forbids its fake-worker <script> path. */
(function (root) {
  'use strict';

  var pdfReady = false;
  function ensurePdf() {
    if (pdfReady) return true;
    if (!root.pdfjsLib || !root.PDF_WORKER_SRC) return false;
    var blob = new Blob([root.PDF_WORKER_SRC], { type: 'text/javascript' });
    root.pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob));
    pdfReady = true;
    return true;
  }

  function Viewer(el) {
    this.stage = el.stage;
    this.wrap = el.wrap;
    this.canvas = el.canvas;
    this.textLayer = el.textLayer;
    this.hlLayer = el.hlLayer;
    this.pointer = el.pointer;
    this.pdf = null;
    this.bytes = null;
    this.name = '';
    this.page = 1;
    this.numPages = 0;
    this.scale = 1;
    this.fit = 'width';
    this.rot = 0;
    this.rendering = false;
    this.pending = false;
    this.renderTask = null;
    this.matches = [];
    this.matchI = -1;
    this.query = '';
    this.onChange = function () {};
    this.onPassword = null;
    this._cssW = 0;
    this._cssH = 0;
  }

  Viewer.prototype.open = function (name, buf, password) {
    if (!ensurePdf()) return Promise.reject(new Error('The PDF engine did not load.'));
    var self = this;
    this.close();
    var data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.bytes = data;
    this.name = name || 'document.pdf';
    var opts = {
      data: data,
      password: password || '',
      isEvalSupported: false,
      disableStream: true,
      disableAutoFetch: true,
      disableRange: true,
      useSystemFonts: false,
      verbosity: 0
    };
    var task = root.pdfjsLib.getDocument(opts);
    if (this.onPassword) {
      task.onPassword = function (update, reason) {
        self.onPassword(update, reason);
      };
    }
    return task.promise.then(function (pdf) {
      self.pdf = pdf;
      self.numPages = pdf.numPages;
      if (self.page < 1 || self.page > self.numPages) self.page = 1;
      return self.draw();
    });
  };

  Viewer.prototype.close = function () {
    if (this.renderTask && this.renderTask.cancel) {
      try { this.renderTask.cancel(); } catch (e) {}
    }
    this.renderTask = null;
    if (this.pdf && this.pdf.destroy) {
      try { this.pdf.destroy(); } catch (e) {}
    }
    this.pdf = null;
    this.matches = [];
    this.matchI = -1;
  };

  Viewer.prototype.baseScale = function () {
    if (!this.pdf) return 1;
    var self = this;
    return this.pdf.getPage(this.page).then(function (page) {
      var vp1 = page.getViewport({ scale: 1, rotation: self.rot });
      var pad = 32;
      var aw = Math.max(120, self.stage.clientWidth - pad);
      var ah = Math.max(120, self.stage.clientHeight - pad);
      if (self.fit === 'page') return Math.min(aw / vp1.width, ah / vp1.height);
      if (self.fit === 'width') return aw / vp1.width;
      return self.scale;
    });
  };

  Viewer.prototype.draw = function () {
    var self = this;
    if (!this.pdf) return Promise.resolve();
    if (this.rendering) {
      this.pending = true;
      return Promise.resolve();
    }
    this.rendering = true;
    this.pending = false;
    if (this.renderTask && this.renderTask.cancel) {
      try { this.renderTask.cancel(); } catch (e) {}
    }
    return this.baseScale().then(function (s) {
      self.scale = s;
      return self.pdf.getPage(self.page);
    }).then(function (page) {
      var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
      var cssVp = page.getViewport({ scale: self.scale, rotation: self.rot });
      var vp = page.getViewport({ scale: self.scale * dpr, rotation: self.rot });
      var canvas = self.canvas;
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      canvas.style.width = Math.round(cssVp.width) + 'px';
      canvas.style.height = Math.round(cssVp.height) + 'px';
      self._cssW = cssVp.width;
      self._cssH = cssVp.height;
      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      self.textLayer.innerHTML = '';
      self.textLayer.style.width = canvas.style.width;
      self.textLayer.style.height = canvas.style.height;
      self.hlLayer.style.width = canvas.style.width;
      self.hlLayer.style.height = canvas.style.height;
      var task = page.render({ canvasContext: ctx, viewport: vp });
      self.renderTask = task;
      return task.promise.then(function () {
        return page.getTextContent();
      }).then(function (tc) {
        self._lastTc = tc;
        self._lastCssVp = cssVp;
        if (root.pdfjsLib.renderTextLayer) {
          root.pdfjsLib.renderTextLayer({
            textContent: tc,
            container: self.textLayer,
            viewport: cssVp,
            textDivs: []
          });
        }
        self.paintHighlights();
      });
    }).catch(function (e) {
      var msg = (e && e.message) || String(e);
      if (/cancelled/i.test(msg)) return;
      throw e;
    }).then(function () {
      self.rendering = false;
      self.onChange(self.snapshot());
      if (self.pending) return self.draw();
    });
  };

  Viewer.prototype.snapshot = function () {
    return {
      name: this.name,
      page: this.page,
      numPages: this.numPages,
      scale: this.scale,
      fit: this.fit,
      rot: this.rot
    };
  };

  Viewer.prototype.go = function (n) {
    if (!this.pdf) return Promise.resolve();
    n = Math.max(1, Math.min(this.numPages, n | 0));
    if (n === this.page && !this.pending) return Promise.resolve();
    this.page = n;
    return this.draw();
  };

  Viewer.prototype.next = function () { return this.go(this.page + 1); };
  Viewer.prototype.prev = function () { return this.go(this.page - 1); };

  Viewer.prototype.setFit = function (fit) {
    this.fit = fit;
    return this.draw();
  };

  Viewer.prototype.zoomBy = function (factor) {
    var self = this;
    return this.baseScale().then(function (s) {
      self.fit = 'fixed';
      self.scale = Math.max(0.25, Math.min(4, s * factor));
      return self.draw();
    });
  };

  Viewer.prototype.cycleFit = function () {
    if (this.fit === 'width') return this.setFit('page');
    if (this.fit === 'page') {
      this.fit = 'fixed';
      this.scale = 1;
      return this.draw();
    }
    return this.setFit('width');
  };

  Viewer.prototype.search = function (q) {
    var self = this;
    this.query = (q || '').trim();
    this.matches = [];
    this.matchI = -1;
    if (!this.query || !this.pdf) {
      this.paintHighlights();
      return Promise.resolve([]);
    }
    var nq = this.query.toLowerCase();
    var walk = function (n) {
      if (n > self.numPages) return Promise.resolve();
      return self.pdf.getPage(n).then(function (page) {
        return page.getTextContent().then(function (tc) {
          for (var i = 0; i < tc.items.length; i++) {
            var it = tc.items[i];
            var s = String(it.str || '').toLowerCase();
            var p = 0;
            while ((p = s.indexOf(nq, p)) !== -1) {
              self.matches.push({
                page: n, item: i, offset: p,
                transform: it.transform, width: it.width, height: it.height,
                str: it.str
              });
              p += nq.length;
            }
          }
        });
      }).then(function () { return walk(n + 1); });
    };
    return walk(1).then(function () {
      if (self.matches.length) {
        var here = 0;
        for (var i = 0; i < self.matches.length; i++) {
          if (self.matches[i].page >= self.page) { here = i; break; }
        }
        return self.goMatch(here);
      }
      self.paintHighlights();
      return self.matches;
    });
  };

  Viewer.prototype.goMatch = function (i) {
    var self = this;
    if (!this.matches.length) return Promise.resolve([]);
    this.matchI = (i + this.matches.length) % this.matches.length;
    var m = this.matches[this.matchI];
    return this.go(m.page).then(function () { return self.matches; });
  };

  Viewer.prototype.paintHighlights = function () {
    var layer = this.hlLayer;
    layer.innerHTML = '';
    if (!this.query || !this._lastTc || !this._lastCssVp) return;
    var vp = this._lastCssVp;
    var nq = this.query.toLowerCase();
    var items = this._lastTc.items;
    var on = this.matchI >= 0 ? this.matches[this.matchI] : null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var s = String(it.str || '').toLowerCase();
      if (s.indexOf(nq) < 0) continue;
      var t = root.pdfjsLib.Util.transform(vp.transform, it.transform);
      var x = t[4], y = t[5];
      var h = Math.hypot(t[2], t[3]) || (it.height || 10);
      var w = (it.width || 0) * (vp.scale || 1);
      var div = document.createElement('div');
      div.className = 'hl' + (on && on.page === this.page && on.item === i ? ' on' : '');
      div.style.left = x + 'px';
      div.style.top = (y - h) + 'px';
      div.style.width = Math.max(w, 8) + 'px';
      div.style.height = Math.max(h, 8) + 'px';
      layer.appendChild(div);
    }
  };

  Viewer.prototype.setPointer = function (nx, ny, on) {
    var el = this.pointer;
    if (!el) return;
    if (!on) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = (nx * this._cssW) + 'px';
    el.style.top = (ny * this._cssH) + 'px';
  };

  Viewer.prototype.eventToNorm = function (e) {
    var r = this.wrap.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    };
  };

  root.PdfViewer = Viewer;
  root.ensurePdfEngine = ensurePdf;
})(typeof window !== 'undefined' ? window : this);
