/* The container every pack is written in.
 *
 *   MAGIC | deflate-raw( u32 headerLen | header JSON | section | section | … )
 *
 * Translations (GBP2), study helps (GBX1) and lexicons all use this shape and
 * each used to carry its own copy of the code that reads it — three inflates,
 * three magic checks, three header parses, three section walks. One copy here;
 * the pack files above decide only what their sections MEAN.
 *
 * SECTIONS ARE DECODED WHEN THEY ARE ASKED FOR, NOT WHEN THE PACK OPENS.
 * That is the whole reason this exists as a layer. A JS string is UTF-16, so
 * turning a section into one costs twice its bytes and keeps them for the life
 * of the pack. Opening the dictionary used to decode its headwords, its bodies
 * and its search index whether or not anyone looked anything up; a shelf of
 * eleven packs paid that eleven times at boot. Held as bytes, a section costs
 * what it costs on disk until something reads it — which matters now, and
 * decides whether a sealed library is openable at all.
 *
 * Nothing here touches the network. DecompressionStream is a browser built-in,
 * so a pack needs no decoder shipped beside it.
 */
(function (root) {
  'use strict';

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('This browser cannot unpack a study pack.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer();
  }

  /* Line starts, as an Int32Array: a 31,000-verse index is 124 KB, where the
   * array of strings a split() would give is several megabytes of heap. */
  function indexLines(s) {
    var n = 1, i;
    for (i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++;
    var starts = new Int32Array(n + 1);
    var k = 1;
    for (i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) starts[k++] = i + 1;
    starts[n] = s.length + 1;
    return starts;
  }

  function Store(header, bytes, spans) {
    this.header = header;
    this._bytes = bytes;      // the whole inflated payload, held as bytes
    this._spans = spans;      // name -> [offset, length]
    this._text = Object.create(null);
    this._lines = Object.create(null);
  }

  Store.prototype.has = function (name) {
    return !!this._spans[name];
  };

  Store.prototype.names = function () {
    var out = [];
    for (var k in this._spans) out.push(k);
    return out;
  };

  // The section as text, decoded once. A name the pack does not carry reads as
  // empty rather than throwing: a surface that has only some of the packs is
  // normal, and so is a pack written before a section existed.
  Store.prototype.text = function (name) {
    var hit = this._text[name];
    if (hit !== undefined) return hit;
    var span = this._spans[name];
    var s = span ? new TextDecoder().decode(this._bytes.subarray(span[0], span[0] + span[1])) : '';
    this._text[name] = s;
    return s;
  };

  // The section's line index, built once, on the same terms.
  Store.prototype.lines = function (name) {
    var hit = this._lines[name];
    if (hit !== undefined) return hit;
    var starts = indexLines(this.text(name));
    this._lines[name] = starts;
    return starts;
  };

  // One line of a section, without materialising the rest of them.
  Store.prototype.line = function (name, i) {
    var starts = this.lines(name);
    if (i < 0 || i >= starts.length - 1) return '';
    return this.text(name).slice(starts[i], starts[i + 1] - 1);
  };

  // Bytes a section will never need again — a pack that has answered its one
  // question can give the string back and keep the bytes.
  Store.prototype.release = function (name) {
    delete this._text[name];
    delete this._lines[name];
  };

  /* Open a pack.
   *
   *   magic   the four ASCII bytes the file must start with
   *   layout  header -> [[name, byteLength], …] in the order they were written
   */
  function open(buffer, magic, layout) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var got = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (got !== magic) {
      return Promise.reject(new Error('Not a ' + magic + ' pack.'));
    }
    return inflateRaw(bytes.subarray(4)).then(function (buf) {
      var all = new Uint8Array(buf);
      var hlen = all[0] | (all[1] << 8) | (all[2] << 16) | (all[3] * 0x1000000);
      var header = JSON.parse(new TextDecoder().decode(all.subarray(4, 4 + hlen)));
      var at = 4 + hlen;
      var spans = Object.create(null);
      var order = layout(header);
      for (var i = 0; i < order.length; i++) {
        var name = order[i][0], len = order[i][1] || 0;
        // A section reaching past the payload is a corrupt file, not a file we
        // serve half of.
        if (at + len > all.length) throw new Error('Truncated ' + magic + ' pack.');
        spans[name] = [at, len];
        at += len;
      }
      return new Store(header, all, spans);
    });
  }

  root.GifosBibleContainer = { open: open, indexLines: indexLines, Store: Store };
})(typeof globalThis !== 'undefined' ? globalThis : this);
