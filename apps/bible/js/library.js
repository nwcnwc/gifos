/* The library: which translations exist, which are here, and how one is opened.
 *
 * A translation arrives by one of two routes and the reader cannot tell them
 * apart once it is open:
 *
 *   BUILT IN.  A pack that rides inside the GIF, base64 in a script the OS
 *              inlines at mount. The sandbox has no network and no base URL to
 *              fetch a file off, so bytes that must work on first boot have to
 *              arrive as code. Two do: a modern English translation and the
 *              King James. The app is useful the second it opens, on a plane,
 *              with nothing downloaded.
 *
 *   PINNED.    The other hundred-odd. Each is an OPTIONAL asset pin in the
 *              manifest, so nothing is fetched at install; the OS downloads
 *              that one pack when the reader first asks for it, checks it
 *              against the hash the manifest names, and caches it on the
 *              computer. After that it is offline too, forever.
 *
 * Once open, a pack is held in memory and never re-opened — inflating four
 * megabytes is cheap once and wasteful twice.
 */
(function (root) {
  'use strict';

  var Pack = root.GifosBiblePack;

  function decodeBase64(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function Library(catalog, builtIn) {
    this.catalog = catalog.slice();
    this.builtIn = builtIn || {};
    this.byId = Object.create(null);
    for (var i = 0; i < this.catalog.length; i++) {
      var t = this.catalog[i];
      t.builtIn = Object.prototype.hasOwnProperty.call(this.builtIn, t.id);
      this.byId[t.id] = t;
    }
    this.open = Object.create(null);     // id -> Pack
    this.loading = Object.create(null);  // id -> Promise<Pack>
    this.have = Object.create(null);     // id -> true once its bytes are on this computer
    for (var k in this.builtIn) this.have[k] = true;
  }

  // Grouped for the picker: language, then the texts in it. A language with a
  // built-in or already-downloaded text sorts first, so what the reader can
  // open right now is what they see first.
  Library.prototype.byLanguage = function () {
    var groups = Object.create(null), order = [];
    for (var i = 0; i < this.catalog.length; i++) {
      var t = this.catalog[i];
      var g = groups[t.language];
      if (!g) { groups[t.language] = g = { language: t.language, native: t.languageNative, texts: [], here: false }; order.push(g); }
      g.texts.push(t);
      if (this.have[t.id]) g.here = true;
    }
    order.sort(function (a, b) {
      if (a.here !== b.here) return a.here ? -1 : 1;
      return a.language.localeCompare(b.language);
    });
    return order;
  };

  Library.prototype.isHere = function (id) { return !!this.have[id]; };
  Library.prototype.opened = function (id) { return this.open[id] || null; };

  /* Open a translation, fetching it first if this computer does not have it.
   * onStatus(note, fraction) is called while a pinned pack downloads. */
  Library.prototype.load = function (id, onStatus) {
    var self = this;
    if (this.open[id]) return Promise.resolve(this.open[id]);
    if (this.loading[id]) return this.loading[id];
    var meta = this.byId[id];
    if (!meta) return Promise.reject(new Error('No translation called ' + id + '.'));

    var bytes;
    if (this.builtIn[id]) {
      bytes = Promise.resolve(decodeBase64(this.builtIn[id]));
    } else if (root.gifos && root.gifos.assets) {
      if (onStatus) onStatus('Downloading ' + meta.name, 0);
      bytes = root.gifos.assets('packs/' + id + '.gbp').then(function (buf) {
        return new Uint8Array(buf);
      });
    } else {
      bytes = Promise.reject(new Error(meta.name + ' has not been downloaded, and this copy cannot download it.'));
    }

    var p = bytes
      .then(function (b) { return Pack.open(b); })
      .then(function (pack) {
        self.open[id] = pack;
        self.have[id] = true;
        delete self.loading[id];
        if (onStatus) onStatus('', 1);
        return pack;
      })
      .catch(function (e) {
        delete self.loading[id];
        throw e;
      });
    this.loading[id] = p;
    return p;
  };

  // Drop a translation's bytes from memory. The pin stays on the computer, so
  // re-opening it costs an inflate and no network.
  Library.prototype.unload = function (id) {
    if (this.builtIn[id]) return false;
    delete this.open[id];
    return true;
  };

  /* What to offer on a first boot. The browser says what language the person
   * reads; if the catalog has a public-domain Bible in it that is not already
   * built in, that is the one worth one tap. */
  Library.prototype.suggestForLocale = function (locales) {
    var want = [];
    var list = locales || (root.navigator && (navigator.languages || [navigator.language])) || [];
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').toLowerCase();
      if (tag) want.push(tag.split('-')[0]);
    }
    var best = null;
    for (var w = 0; w < want.length; w++) {
      for (var j = 0; j < this.catalog.length; j++) {
        var t = this.catalog[j];
        if (t.builtIn) continue;
        if (String(t.lang || '').toLowerCase().split('-')[0] !== want[w]) continue;
        // Prefer a whole Bible over a gospel sample, then the smaller download.
        if (!best || t.books > best.books || (t.books === best.books && t.bytes < best.bytes)) best = t;
      }
      if (best) return best;
    }
    return null;
  };

  root.GifosBibleLibrary = { Library: Library };
})(typeof globalThis !== 'undefined' ? globalThis : this);
