/* Open an EPUB, paginate a chapter with CSS columns. No gifos.* here —
 * boot.js and net.js own persistence and the room. epub.js Book parses
 * the archive; Rendition is not used (the sandbox forbids nested frames). */
(function (root) {
  'use strict';

  var MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    css: 'text/css', xhtml: 'application/xhtml+xml', html: 'text/html'
  };

  function extOf(path) {
    var m = String(path || '').split('?')[0].split('#')[0].match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  }
  function mimeOf(path) { return MIME[extOf(path)] || 'application/octet-stream'; }

  function zipJoin(base, rel) {
    if (!rel) return String(base || '').replace(/^\/+/, '');
    rel = String(rel).split('#')[0].split('?')[0];
    if (!rel) return String(base || '').replace(/^\/+/, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(rel)) return '';
    if (rel.charAt(0) === '/') return rel.replace(/^\/+/, '');
    var parts = String(base || '').replace(/^\/+/, '').split('/');
    parts.pop();
    rel.split('/').forEach(function (p) {
      if (!p || p === '.') return;
      if (p === '..') parts.pop();
      else parts.push(p);
    });
    return parts.join('/');
  }

  function asZipUrl(p) {
    p = String(p || '').replace(/^\/+/, '');
    return p ? '/' + p : '';
  }

  function flattenToc(items, depth) {
    var out = [];
    (items || []).forEach(function (it) {
      out.push({ label: String(it.label || '').replace(/\s+/g, ' ').trim() || 'Chapter', href: it.href || '', depth: depth || 0 });
      if (it.subitems && it.subitems.length) out = out.concat(flattenToc(it.subitems, (depth || 0) + 1));
    });
    return out;
  }

  function Viewer(el) {
    this.stage = el.stage;
    this.paper = el.paper;
    this.flow = el.flow;
    this.pointer = el.pointer;
    this.book = null;
    this.bytes = null;
    this.name = '';
    this.title = '';
    this.spineIndex = 0;
    this.spineLen = 0;
    this.pageI = 0;
    this.pageN = 1;
    this.pageW = 0;
    this.fontPx = 18;
    this.toc = [];
    this.matches = [];
    this.matchI = -1;
    this.query = '';
    this.href = '';
    this.onChange = function () {};
    this._cssW = 0;
    this._cssH = 0;
    this._opening = 0;
  }

  Viewer.prototype.open = function (name, buf) {
    var self = this;
    if (!root.ePub) return Promise.reject(new Error('The EPUB engine did not load.'));
    if (!root.JSZip) return Promise.reject(new Error('The ZIP engine did not load.'));
    this.close();
    var data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.bytes = data;
    this.name = name || 'book.epub';
    var token = ++this._opening;
    var book = root.ePub.Book
      ? new root.ePub.Book({ replacements: 'none' })
      : root.ePub();
    return book.open(data.buffer, 'binary').then(function () {
      return book.ready;
    }).then(function () {
      if (token !== self._opening) return;
      self.book = book;
      self.spineLen = book.spine && book.spine.length ? book.spine.length : 0;
      var meta = (book.packaging && book.packaging.metadata) || {};
      self.title = meta.title || name.replace(/^.*[\\/]/, '').replace(/\.epub$/i, '') || 'Book';
      var nav = book.navigation && book.navigation.toc;
      self.toc = flattenToc(nav);
      if (self.spineIndex < 0 || self.spineIndex >= self.spineLen) self.spineIndex = 0;
      return self.showChapter(self.spineIndex, self.pageI, true);
    });
  };

  Viewer.prototype.close = function () {
    this._opening++;
    if (this.book && this.book.destroy) {
      try { this.book.destroy(); } catch (e) {}
    }
    this.book = null;
    this.flow.innerHTML = '';
    this.matches = [];
    this.matchI = -1;
  };

  Viewer.prototype.spineItem = function (i) {
    if (!this.book || !this.book.spine) return null;
    return this.book.spine.get(i);
  };

  Viewer.prototype.archiveGet = function (path, kind) {
    var arch = this.book && this.book.archive;
    if (!arch || !path) return Promise.reject(new Error('Missing file in the book.'));
    var url = asZipUrl(path);
    var go = function (p) {
      var r;
      if (kind === 'base64' && arch.getBase64) r = arch.getBase64(p);
      else if (arch.request) r = arch.request(p);
      else if (arch.getText) r = arch.getText(p);
      if (!r) return Promise.reject(new Error('Missing file in the book.'));
      return Promise.resolve(r);
    };
    return go(url).catch(function () {
      try { url = asZipUrl(decodeURIComponent(path)); } catch (e) {}
      return go(url);
    });
  };

  Viewer.prototype.rewriteCss = function (css, fromPath) {
    var self = this;
    var urls = [];
    String(css || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (_, q, u) {
      if (u && !/^(data:|blob:|#)/i.test(u)) urls.push(u);
      return _;
    });
    var seen = {};
    var jobs = [];
    urls.forEach(function (u) {
      var p = zipJoin(fromPath, u);
      if (!p || seen[p]) return;
      seen[p] = true;
      jobs.push(self.archiveGet(p, 'base64').then(function (b64) {
        seen[p] = String(b64).indexOf('data:') === 0 ? b64 : ('data:' + mimeOf(p) + ';base64,' + b64);
      }).catch(function () { seen[p] = ''; }));
    });
    return Promise.all(jobs).then(function () {
      return String(css || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (m, q, u) {
        if (/^(data:|blob:|#)/i.test(u)) return m;
        var p = zipJoin(fromPath, u);
        var data = seen[p];
        return data ? 'url("' + data + '")' : 'url("' + u + '")';
      });
    });
  };

  Viewer.prototype.injectChapter = function (html, chapterPath) {
    var self = this;
    var doc;
    try {
      doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
      if (doc.querySelector('parsererror')) {
        doc = new DOMParser().parseFromString(html, 'text/html');
      }
    } catch (e) {
      doc = new DOMParser().parseFromString(html, 'text/html');
    }
    var jobs = [];
    var links = doc.querySelectorAll('link[rel~="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        var href = link.getAttribute('href');
        var p = zipJoin(chapterPath, href);
        if (!p) { link.remove(); return; }
        jobs.push(self.archiveGet(p, 'text').then(function (css) {
          return self.rewriteCss(css, p);
        }).then(function (css) {
          var st = doc.createElement('style');
          st.textContent = css;
          link.parentNode.replaceChild(st, link);
        }).catch(function () { link.remove(); }));
      })(links[i]);
    }
    var imgs = doc.querySelectorAll('img, image');
    for (var j = 0; j < imgs.length; j++) {
      (function (img) {
        var href = img.getAttribute('src') || img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        var p = zipJoin(chapterPath, href);
        if (!p) return;
        jobs.push(self.archiveGet(p, 'base64').then(function (b64) {
          var data = String(b64).indexOf('data:') === 0 ? b64 : ('data:' + mimeOf(p) + ';base64,' + b64);
          img.setAttribute('src', data);
          if (img.removeAttributeNS) {
            try { img.removeAttributeNS('http://www.w3.org/1999/xlink', 'href'); } catch (e) {}
          }
        }).catch(function () {}));
      })(imgs[j]);
    }
    return Promise.all(jobs).then(function () {
      var kill = doc.querySelectorAll('script, iframe, object, embed, applet, form');
      for (var k = 0; k < kill.length; k++) kill[k].remove();
      var all = doc.querySelectorAll('*');
      for (var n = 0; n < all.length; n++) {
        var el = all[n];
        for (var a = el.attributes.length - 1; a >= 0; a--) {
          var nm = el.attributes[a].name;
          if (/^on/i.test(nm) || nm === 'srcdoc') el.removeAttribute(nm);
        }
      }
      var styles = [];
      var stNodes = doc.querySelectorAll('style');
      for (var s = 0; s < stNodes.length; s++) styles.push(stNodes[s].textContent || '');
      var body = doc.body || doc.documentElement;
      var wrap = document.createElement('div');
      wrap.className = 'chapter';
      wrap.innerHTML = body ? body.innerHTML : '';
      var styleEl = document.createElement('style');
      styleEl.textContent = styles.join('\n');
      self.flow.innerHTML = '';
      self.flow.appendChild(styleEl);
      self.flow.appendChild(wrap);
    });
  };

  Viewer.prototype.chapterPath = function (item) {
    if (!item) return '';
    var pack = this.book && this.book.packaging;
    var opf = (pack && (pack.opfPath || pack.path)) || '';
    var href = item.href || '';
    var url = String(item.url || href);
    url = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
    var out = [];
    function add(p) {
      if (!p) return;
      p = String(p).split('#')[0].replace(/^\/+/, '');
      if (p && out.indexOf(p) < 0) out.push(p);
    }
    add(url);
    add(href);
    add(zipJoin(opf, href));
    return out;
  };

  Viewer.prototype.showChapter = function (index, page, absPage) {
    var self = this;
    var item = this.spineItem(index);
    if (!item) return Promise.reject(new Error('That chapter is missing.'));
    var candidates = this.chapterPath(item);
    var path = candidates[0] || '';
    this.spineIndex = index;
    this.href = item.href || path;
    var used = path;
    var load = Promise.reject(new Error('Could not read the chapter.'));
    candidates.forEach(function (p) {
      load = load.catch(function () { used = p; return self.archiveGet(p, 'text'); });
    });
    return load.then(function (html) {
      if (typeof html !== 'string') {
        if (html && html.documentElement) {
          html = new XMLSerializer().serializeToString(html);
        } else {
          throw new Error('Could not read the chapter.');
        }
      }
      return self.injectChapter(html, used);
    }).then(function () {
      self.query = '';
      self.matches = [];
      self.matchI = -1;
      self.unmark();
      self.layout();
      if (absPage) {
        self.pageI = Math.max(0, Math.min(self.pageN - 1, page | 0));
      } else if (page >= 0 && page <= 1 && self.pageN) {
        self.pageI = Math.max(0, Math.min(self.pageN - 1, Math.round(page * (self.pageN - 1))));
      } else {
        self.pageI = 0;
      }
      self.paintPage();
      self.onChange(self.snapshot());
    });
  };

  Viewer.prototype.layout = function () {
    var paper = this.paper;
    var flow = this.flow;
    var w = paper.clientWidth;
    var h = paper.clientHeight;
    if (w < 40 || h < 40) return;
    flow.style.fontSize = this.fontPx + 'px';
    flow.style.width = w + 'px';
    flow.style.height = h + 'px';
    flow.style.columnWidth = w + 'px';
    flow.style.columnGap = '0px';
    flow.style.columnFill = 'auto';
    flow.style.transform = 'translateX(0)';
    this.pageW = w;
    this._cssW = w;
    this._cssH = h;
    var sw = flow.scrollWidth;
    this.pageN = Math.max(1, Math.round(sw / w) || 1);
  };

  Viewer.prototype.paintPage = function () {
    if (this.pageI < 0) this.pageI = 0;
    if (this.pageI > this.pageN - 1) this.pageI = this.pageN - 1;
    this.flow.style.transform = 'translateX(' + (-this.pageI * this.pageW) + 'px)';
  };

  Viewer.prototype.snapshot = function () {
    return {
      name: this.name,
      title: this.title,
      spine: this.spineIndex,
      spineLen: this.spineLen,
      page: this.pageI + 1,
      pages: this.pageN,
      fontPx: this.fontPx,
      fraction: this.pageN > 1 ? this.pageI / (this.pageN - 1) : 0,
      href: this.href
    };
  };

  Viewer.prototype.goPage = function (n) {
    n = Math.max(0, Math.min(this.pageN - 1, n | 0));
    if (n === this.pageI) return Promise.resolve();
    this.pageI = n;
    this.paintPage();
    this.onChange(this.snapshot());
    return Promise.resolve();
  };

  Viewer.prototype.next = function () {
    if (this.pageI + 1 < this.pageN) return this.goPage(this.pageI + 1);
    if (this.spineIndex + 1 < this.spineLen) return this.showChapter(this.spineIndex + 1, 0, true);
    return Promise.resolve();
  };

  Viewer.prototype.prev = function () {
    if (this.pageI > 0) return this.goPage(this.pageI - 1);
    if (this.spineIndex > 0) {
      var self = this;
      return this.showChapter(this.spineIndex - 1, 0, true).then(function () {
        return self.goPage(self.pageN - 1);
      });
    }
    return Promise.resolve();
  };

  Viewer.prototype.nextChapter = function () {
    if (this.spineIndex + 1 < this.spineLen) return this.showChapter(this.spineIndex + 1, 0, true);
    return Promise.resolve();
  };
  Viewer.prototype.prevChapter = function () {
    if (this.spineIndex > 0) return this.showChapter(this.spineIndex - 1, 0, true);
    return Promise.resolve();
  };

  Viewer.prototype.goHref = function (href) {
    if (!this.book || !href) return Promise.resolve();
    var hash = '';
    var path = href;
    var h = href.indexOf('#');
    if (h >= 0) { hash = href.slice(h + 1); path = href.slice(0, h); }
    var item = null;
    if (path) {
      item = this.book.spine.get(path);
      if (!item && this.book.canonical) {
        try { item = this.book.spine.get(this.book.canonical(path)); } catch (e) {}
      }
    }
    var self = this;
    var idx = item && typeof item.index === 'number' ? item.index : this.spineIndex;
    return this.showChapter(idx, 0, true).then(function () {
      if (!hash) return;
      var esc = (root.CSS && CSS.escape) ? CSS.escape(hash) : hash.replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
      var el = self.flow.querySelector('#' + esc) ||
               self.flow.querySelector('[name="' + hash.replace(/"/g, '') + '"]');
      if (!el) return;
      return self.goPage(self.pageOfEl(el));
    });
  };

  Viewer.prototype.setFont = function (px) {
    this.fontPx = Math.max(14, Math.min(32, px | 0));
    var frac = this.pageN > 1 ? this.pageI / (this.pageN - 1) : 0;
    this.layout();
    this.pageI = Math.round(frac * Math.max(0, this.pageN - 1));
    this.paintPage();
    if (this.query) this.search(this.query);
    this.onChange(this.snapshot());
  };

  Viewer.prototype.relayout = function () {
    if (!this.book) return;
    var frac = this.pageN > 1 ? this.pageI / (this.pageN - 1) : 0;
    this.layout();
    this.pageI = Math.round(frac * Math.max(0, this.pageN - 1));
    this.paintPage();
    this.onChange(this.snapshot());
  };

  Viewer.prototype.unmark = function () {
    var marks = this.flow.querySelectorAll('mark.hl');
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    }
    this.flow.normalize();
  };

  Viewer.prototype.search = function (q) {
    this.unmark();
    this.query = (q || '').trim();
    this.matches = [];
    this.matchI = -1;
    if (!this.query) return Promise.resolve([]);
    var needle = this.query.toLowerCase();
    var walker = document.createTreeWalker(this.flow, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var text = node.nodeValue;
      if (!text) continue;
      var lower = text.toLowerCase();
      var from = 0;
      var hits = [];
      var p;
      while ((p = lower.indexOf(needle, from)) !== -1) {
        hits.push(p);
        from = p + needle.length;
      }
      if (!hits.length) continue;
      var parent = node.parentNode;
      var frag = document.createDocumentFragment();
      var cursor = 0;
      for (var h = 0; h < hits.length; h++) {
        var at = hits[h];
        if (at > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, at)));
        var mark = document.createElement('mark');
        mark.className = 'hl';
        mark.textContent = text.slice(at, at + needle.length);
        frag.appendChild(mark);
        this.matches.push(mark);
        cursor = at + needle.length;
      }
      if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
      parent.replaceChild(frag, node);
    }
    if (this.matches.length) return this.goMatch(0);
    return Promise.resolve(this.matches);
  };

  Viewer.prototype.goMatch = function (i) {
    if (!this.matches.length) return Promise.resolve([]);
    this.matchI = (i + this.matches.length) % this.matches.length;
    for (var k = 0; k < this.matches.length; k++) {
      this.matches[k].classList.toggle('on', k === this.matchI);
    }
    var el = this.matches[this.matchI];
    this.pageI = this.pageOfEl(el);
    this.paintPage();
    this.onChange(this.snapshot());
    return Promise.resolve(this.matches);
  };

  Viewer.prototype.pageOfEl = function (el) {
    var paper = this.paper.getBoundingClientRect();
    var box = el.getBoundingClientRect();
    var abs = (box.left - paper.left) + this.pageI * this.pageW;
    return Math.max(0, Math.min(this.pageN - 1, Math.floor((abs + 2) / Math.max(1, this.pageW))));
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
    var r = this.paper.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    };
  };

  root.EpubViewer = Viewer;
})(typeof window !== 'undefined' ? window : this);
