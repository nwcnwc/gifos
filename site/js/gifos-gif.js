/*
 * gifos-gif.js — The GifOS GIF codec.
 *
 * Packs a virtual filesystem (an app: code, assets, and saved state) into a
 * valid, viewable GIF89a and reads it back. The filesystem archive lives in a
 * "GIFOS1.0" Application Extension block; a small real image frame keeps the
 * file a genuine, displayable GIF everywhere.
 *
 * Pure JS — no DOM — so it runs in the browser and is testable in Node.
 * Attaches to a global `GifOS.gif` namespace.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  // ---- base64 (pure, Uint8Array <-> string) -------------------------------
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // Build into fixed slices and join once. Appending to one string per 3 bytes
  // makes V8 a cons-string tree millions of nodes deep and then flattens it:
  // encoding 12 MB of files that way peaked at 470 MB of heap, which is why a
  // large app could not be packed at all. Slices keep the peak at the output's
  // own size.
  const B64_SLICE = 8192 * 3; // whole 3-byte groups, so slices never split one
  function b64encode(bytes) {
    const n = bytes.length;
    if (!n) return '';
    const slices = [];
    for (let s = 0; s < n; s += B64_SLICE) {
      const end = Math.min(s + B64_SLICE, n);
      const chars = [];
      for (let i = s; i < end; i += 3) {
        const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
        const v = (a << 16) | ((b || 0) << 8) | (c || 0);
        chars.push(B64[(v >> 18) & 63], B64[(v >> 12) & 63],
          i + 1 < n ? B64[(v >> 6) & 63] : '=',
          i + 2 < n ? B64[v & 63] : '=');
      }
      slices.push(chars.join(''));
    }
    return slices.length === 1 ? slices[0] : slices.join('');
  }
  // Decode via a 256-entry lookup, skipping non-alphabet bytes inline — the
  // exact behavior of the old regex-strip, without its full-string copy or the
  // 64-way indexOf per character. This runs on every app open over the whole
  // payload (a 23 MB app is ~30 MB of base64), so it is decode's hot loop.
  const B64LUT = (() => {
    const t = new Int16Array(256).fill(-1);
    for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
    return t;
  })();
  function b64decode(str) {
    const n = str.length;
    const out = new Uint8Array(Math.floor((n * 3) / 4));
    let p = 0, buf = 0, bits = 0;
    for (let i = 0; i < n; i++) {
      const c = str.charCodeAt(i);
      const v = c < 256 ? B64LUT[c] : -1;
      if (v < 0) continue; // whitespace, '=', or noise — never part of the data
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; out[p++] = (buf >> bits) & 0xff; }
    }
    return out.subarray(0, p);
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const textToBytes = (s) => enc.encode(s);
  const bytesToText = (b) => dec.decode(b);

  // ---- LZW image data (uncompressed-GIF technique) ------------------------
  // We never need real compression: the payload rides in the extension block,
  // so the image frame is tiny. Periodic clear codes keep the code width fixed
  // at minCodeSize+1, which is trivially valid for every GIF decoder.
  function lzwImageData(minCodeSize, indices) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    const codeSize = minCodeSize + 1;
    const maxRun = clearCode - 3; // clear before the dictionary would widen
    const bytes = [];
    let acc = 0, nbits = 0;
    const put = (code) => {
      acc |= code << nbits;
      nbits += codeSize;
      while (nbits >= 8) { bytes.push(acc & 0xff); acc >>= 8; nbits -= 8; }
    };
    put(clearCode);
    let run = 0;
    for (let i = 0; i < indices.length; i++) {
      if (run === maxRun) { put(clearCode); run = 0; }
      put(indices[i] & (clearCode - 1));
      run++;
    }
    put(eoiCode);
    if (nbits > 0) bytes.push(acc & 0xff);
    return bytes;
  }

  // ---- byte writer with GIF sub-block chunking ----------------------------
  // Concatenate typed-array chunks. Pushing one number per payload byte used
  // to be the ceiling: V8 refuses an array whose backing store would exceed a
  // regular heap object (~1 GB / 8-byte elements ≈ 134 MB of numbers), which
  // a library-sized archive hits as RangeError: Invalid array length inside
  // subBlocks. The GIF bytes are identical; only the backing store changed.
  function Writer() { this.chunks = []; this.small = []; }
  Writer.prototype._flush = function () {
    if (!this.small.length) return;
    this.chunks.push(new Uint8Array(this.small));
    this.small = [];
  };
  Writer.prototype.byte = function (b) { this.small.push(b & 0xff); return this; };
  Writer.prototype.u16 = function (n) { this.small.push(n & 0xff, (n >> 8) & 0xff); return this; };
  Writer.prototype.ascii = function (s) {
    for (let i = 0; i < s.length; i++) this.small.push(s.charCodeAt(i) & 0xff);
    return this;
  };
  Writer.prototype.bytes = function (arr) {
    if (!arr || !arr.length) return this;
    this._flush();
    this.chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr));
    return this;
  };
  Writer.prototype.subBlocks = function (data) {
    const u8 = !data ? new Uint8Array(0)
      : (data instanceof Uint8Array ? data : new Uint8Array(data));
    const nBlocks = u8.length ? Math.ceil(u8.length / 255) : 0;
    const framed = new Uint8Array(u8.length + nBlocks + 1);
    let o = 0;
    for (let i = 0; i < u8.length; i += 255) {
      const n = Math.min(255, u8.length - i);
      framed[o++] = n;
      framed.set(u8.subarray(i, i + n), o);
      o += n;
    }
    framed[o] = 0x00;
    this._flush();
    this.chunks.push(framed);
    return this;
  };
  Writer.prototype.done = function () {
    this._flush();
    let total = 0;
    for (let i = 0; i < this.chunks.length; i++) total += this.chunks[i].length;
    const out = new Uint8Array(total);
    let off = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      out.set(this.chunks[i], off);
      off += this.chunks[i].length;
    }
    return out;
  };

  const GIFOS_MARKER = 'GIFOS1.0'; // 8-byte application identifier
  const GIFOS_AUTH = 'GOS';        // 3-byte application authentication code

  // ---- build an animated preview (multiple frames) ------------------------
  // Every GIF is a real, looping animation keyed off an accent color — no
  // canvas needed. The motion style varies by `seed` so apps look distinct.
  // Returns { width, height, palette, numColors, minCodeSize, frames:[...], delayCs }.
  function animatedPreview(accent, seed) {
    const W = 32, H = 32, FRAMES = 6;
    const a = accent || [123, 92, 255];
    const r = a[0], g = a[1], b = a[2];
    const clamp = (n) => Math.max(0, Math.min(255, n));
    const palette = new Array(128 * 3).fill(0);
    const set = (i, rr, gg, bb) => { palette[i * 3] = clamp(rr); palette[i * 3 + 1] = clamp(gg); palette[i * 3 + 2] = clamp(bb); };
    // index 0 is transparent — the pattern floats like a sticker
    set(1, r, g, b);              // accent
    set(2, r + 70, g + 70, b + 70); // highlight
    set(3, r - 45, g - 45, b - 45); // shadow
    const type = (seed >>> 0) % 3;
    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
      const idx = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let v = 0;
          if (type === 0) {                              // scrolling diagonal stripes
            const d = (x + y + f * 2) % 12;
            v = d < 2 ? 2 : d < 6 ? 1 : 0;
          } else if (type === 1) {                       // expanding rings
            const dx = x - 15.5, dy = y - 15.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const p = (dist - f * 2.2 + 100) % 12;
            v = p < 3 ? 1 : p < 6 ? 3 : 0;
          } else {                                        // rolling wave
            const wv = Math.sin(x / 5 + f * 0.9) * 4;
            v = y > 18 + wv ? 1 : y > 14 + wv ? 3 : 0;
          }
          idx[y * W + x] = v;
        }
      }
      frames.push(idx);
    }
    return { width: W, height: H, palette, numColors: 128, minCodeSize: 7, frames, delayCs: 10, transparentIndex: 0 };
  }

  // ---- compression (native CompressionStream; no dependencies) ------------
  // Payload framing: 0x01 + deflate-raw data, or legacy raw JSON (starts '{').
  const COMPRESSED_FLAG = 0x01;
  function hasCompression() {
    return typeof root.CompressionStream !== 'undefined' && typeof root.Response !== 'undefined';
  }
  function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new root.CompressionStream('deflate-raw'));
    return new root.Response(stream).arrayBuffer().then((buf) => new Uint8Array(buf));
  }
  // Inflate streams and aborts past a ceiling. This cap is ours — the GIF
  // format has no such limit. The bomb we actually guard is a SMALL payload
  // that expands into a huge heap (zip bomb). A large App GIF the person
  // already downloaded is a different shape: it starts large, unpacks a bit
  // larger, and the store already showed the size. So the ceiling scales with
  // the compressed input (16×, which is far above JSON+base64 of real files
  // and far below a classic bomb), never drops below 64 MB (every in-repo app
  // still fits), and never exceeds 2 GB−1 (one allocation we refuse to make
  // even if they downloaded a giant file).
  const INFLATE_FLOOR = 64 * 1024 * 1024;
  const INFLATE_RATIO = 16;
  const INFLATE_HARD_MAX = 2 * 1024 * 1024 * 1024 - 1;
  function inflateMaxBytes(compressedLen) {
    const n = Math.max(0, Number(compressedLen) || 0);
    const byRatio = n * INFLATE_RATIO;
    const ceiling = Math.max(INFLATE_FLOOR, byRatio);
    return ceiling > INFLATE_HARD_MAX ? INFLATE_HARD_MAX : ceiling;
  }
  function inflate(bytes) {
    const cap = inflateMaxBytes(bytes && bytes.length);
    const stream = new Blob([bytes]).stream().pipeThrough(new root.DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks = []; let total = 0;
    return (function pump() {
      return reader.read().then(({ done, value }) => {
        if (done) {
          const out = new Uint8Array(total); let o = 0;
          for (const c of chunks) { out.set(c, o); o += c.length; }
          return out;
        }
        total += value.length;
        if (total > cap) { try { reader.cancel(); } catch (e) {} throw new Error('decompressed payload too large'); }
        chunks.push(value);
        return pump();
      });
    })();
  }

  // ---- the remix doc: a packed app carries its own build guide -------------
  // Every App GIF is meant to be taken apart. Whoever unpacks one finds
  // llms.txt sitting next to index.html — the packing recipe, the manifest
  // reference and the whole window.gifos API — so the step after "what is
  // inside this?" is "here is my version", with no hunt for docs and no
  // guessing at the format. site/llms.txt is that document; this is the same
  // file, travelling with the app.
  //
  // Three rules keep it from doing harm:
  //  1. PACKING, NOT SAVING. encode() and embed() add it — those MAKE an app
  //     GIF. Bare repack() never does: it swaps the data block of a GIF that
  //     already exists (a state save, a credits seal, a passkey wrap), and a
  //     file appearing there would change the signed files digest and turn a
  //     legitimately signed app TAMPERED (gifos-sign.js "canonical content
  //     hash"). Once packed in, it simply rides along through every repack.
  //  2. APPS ONLY. An archive with no entry file is a container — a folder
  //     bundle, a desktop backup — not something to remix, and the apps inside
  //     it carry their own copy.
  //  3. AN AUTHOR'S OWN llms.txt WINS, and a doc that cannot be read is not an
  //     error: the app packs without it. A pack must never fail over a README.
  const REMIX_DOC = 'llms.txt';
  const REMIX_DOC_TIMEOUT = 8000;
  let remixDocSource;   // set by setRemixDoc(); undefined = use the default loader
  let remixDocCache;    // Promise<string|Uint8Array|null>, resolved at most once

  // Node, tests and build scripts have no origin to fetch from — they hand the
  // text in (or pass null to switch the whole thing off).
  function setRemixDoc(v) { remixDocSource = v; remixDocCache = undefined; }

  // In a browser, read it off the site. Two candidates, in order: next to the
  // page (gifos.app/llms.txt), then the origin root — a frozen snapshot under
  // /versions/<x.y.z>/ has no llms.txt of its own, and the live spec is the one
  // a remixer wants anyway.
  function fetchRemixDoc() {
    if (typeof fetch !== 'function' || typeof location === 'undefined' || !location.href) return Promise.resolve(null);
    const urls = [];
    try { urls.push(new URL(REMIX_DOC, location.href).href); } catch (e) { /* opaque origin */ }
    try {
      const root = new URL('/' + REMIX_DOC, location.href).href;
      if (urls.indexOf(root) < 0) urls.push(root);
    } catch (e) { /* opaque origin */ }
    return urls.reduce((chain, url) => chain.then((got) => {
      if (got) return got;
      let stop = null;
      const opts = {};
      if (typeof AbortController === 'function') {
        const ac = new AbortController();
        opts.signal = ac.signal;
        stop = setTimeout(() => ac.abort(), REMIX_DOC_TIMEOUT);
      }
      return fetch(url, opts)
        .then((r) => (r && r.ok ? r.text() : null))
        .catch(() => null)
        .then((text) => { if (stop) clearTimeout(stop); return text || null; });
    }), Promise.resolve(null));
  }

  function remixDoc() {
    if (remixDocCache === undefined) {
      const src = remixDocSource === undefined ? fetchRemixDoc : remixDocSource;
      remixDocCache = Promise.resolve(typeof src === 'function' ? src() : src)
        .catch(() => null)
        .then((v) => (v && v.length ? v : null));
    }
    return remixDocCache;
  }

  // An app is an archive something can actually run: index.html, or whatever
  // its manifest names as the entry.
  function hasEntry(files) {
    if (files['index.html']) return true;
    const m = files['manifest.json'];
    if (!m) return false;
    try {
      const entry = JSON.parse(typeof m === 'string' ? m : bytesToText(m)).entry;
      return !!(entry && files[entry]);
    } catch (e) { return false; }
  }

  function withRemixDoc(files) {
    if (!files || files[REMIX_DOC] || !hasEntry(files)) return Promise.resolve(files);
    return remixDoc().then((doc) => {
      if (!doc) return files;
      const out = {};
      for (const p in files) if (p !== '__proto__') out[p] = files[p];
      out[REMIX_DOC] = doc;
      return out;
    });
  }

  // ---- the archive: two formats, one framing -------------------------------
  //
  // v1 is JSON with every file base64'd. It costs memory in four places at
  // once — the inflated JSON bytes, the JS string JSON.parse reads, every
  // file's base64 string, and finally the bytes themselves — so decoding peaks
  // near 6x the file data it is carrying. That is survivable for a 3 MB app
  // and fatal for an app that seals a library: the ceiling that stops a large
  // App GIF from opening on a phone is this, not the inflate cap and not the
  // GIF's size on disk.
  //
  // v2 is a directory and a blob:
  //
  //   "GFA2" | u32 headerLen | header JSON | file bytes, concatenated
  //   header = { v: 2, files: { path: [offset, length] } }
  //
  // JSON.parse reads a few kilobytes of paths instead of hundreds of megabytes
  // of base64, and each file is a subarray VIEW of the one inflated buffer, so
  // decode allocates nothing per file. Peak falls to the size of the payload.
  //
  // DECODE ACCEPTS BOTH, ALWAYS — every App GIF already signed and installed
  // is v1, and those bytes are frozen. ENCODE stays on v1 unless asked for v2,
  // because a runtime that predates v2 cannot read it: flipping the default is
  // a flag day that has to follow the release which teaches everyone to read
  // it, not lead it.
  const ARCHIVE_V2_MAGIC = 'GFA2';
  let defaultArchiveVersion = 1;
  function setArchiveVersion(v) {
    if (v !== 1 && v !== 2) throw new Error('unknown archive version ' + v);
    defaultArchiveVersion = v;
  }

  function buildArchiveV2(files) {
    const paths = Object.keys(files);
    const parts = [];
    const dir = {};
    let total = 0;
    for (const path of paths) {
      const val = files[path];
      const bytes = typeof val === 'string' ? textToBytes(val) : val;
      dir[path] = [total, bytes.length];
      parts.push(bytes);
      total += bytes.length;
    }
    const header = textToBytes(JSON.stringify({ v: 2, files: dir }));
    const out = new Uint8Array(4 + 4 + header.length + total);
    out[0] = 71; out[1] = 70; out[2] = 65; out[3] = 50; // "GFA2"
    const h = header.length;
    out[4] = h & 0xff; out[5] = (h >> 8) & 0xff; out[6] = (h >> 16) & 0xff; out[7] = (h >>> 24) & 0xff;
    out.set(header, 8);
    let at = 8 + h;
    for (const b of parts) { out.set(b, at); at += b.length; }
    return out;
  }

  function buildArchiveV1(files) {
    const archive = { v: 1, files: {} };
    for (const path in files) {
      if (path === '__proto__') continue;
      const val = files[path];
      const bytes = typeof val === 'string' ? textToBytes(val) : val;
      archive.files[path] = b64encode(bytes);
    }
    return textToBytes(JSON.stringify(archive));
  }

  // ---- payload builder (shared by encode and repack) -----------------------
  function buildPayload(files, version) {
    const v = version || defaultArchiveVersion;
    const json = v === 2 ? buildArchiveV2(files) : buildArchiveV1(files);
    return hasCompression()
      ? deflate(json).then((z) => {
          const framed = new Uint8Array(z.length + 1);
          framed[0] = COMPRESSED_FLAG; framed.set(z, 1);
          return framed;
        })
      : Promise.resolve(json); // legacy uncompressed fallback
  }

  // ---- encode: filesystem archive -> GIF89a bytes (async) ------------------
  // files: { "path": Uint8Array | string }  →  Promise<Uint8Array>
  // opts.archive: 1 (default) or 2. See the archive note above — v2 halves what
  // opening a large app costs, and only a runtime that ships parseArchiveV2 can
  // read it.
  function encode(files, opts) {
    const o = opts || {};
    return withRemixDoc(files)
      .then((f) => buildPayload(f, o.archive))
      .then((payload) => assemble(payload, o));
  }

  // ---- repack: replace ONLY the GifOS data block inside an existing GIF ----
  // Every pixel byte (header, palette, animation frames) stays identical — the
  // artwork survives. Used to save current app state into the same GIF.
  // Find an Application Extension block by its 8-byte identifier. Returns the
  // block's outer bounds ({start,end}) and where sub-blocks begin (headerEnd).
  function findAppExtSpan(bytes, marker8) {
    const marker = textToBytes(marker8);
    let pos = 0;
    while (pos < bytes.length - 14) {
      if (bytes[pos] === 0x21 && bytes[pos + 1] === 0xff && bytes[pos + 2] === 0x0b) {
        let match = true;
        for (let i = 0; i < 8; i++) if (bytes[pos + 3 + i] !== marker[i]) { match = false; break; }
        if (match) {
          const headerEnd = pos + 3 + 11; // after identifier(8)+auth(3)
          let p = headerEnd;
          while (p < bytes.length) {
            const size = bytes[p];
            if (size === 0) return { start: pos, headerEnd, end: p + 1 };
            p += 1 + size;
          }
          return null;
        }
      }
      pos++;
    }
    return null;
  }
  function findGifosSpan(bytes) { return findAppExtSpan(bytes, GIFOS_MARKER); }

  function repack(originalBytes, files) {
    return buildPayload(files).then((payload) => {
      const span = findGifosSpan(originalBytes);
      if (!span) throw new Error('not a GifOS gif');
      const w = new Writer();
      w.subBlocks(payload);
      const mid = w.done();
      const out = new Uint8Array(span.headerEnd + mid.length + (originalBytes.length - span.end));
      out.set(originalBytes.subarray(0, span.headerEnd), 0);
      out.set(mid, span.headerEnd);
      out.set(originalBytes.subarray(span.end), span.headerEnd + mid.length);
      return out;
    });
  }

  // ---- embed: hide an app inside ANY existing GIF ---------------------------
  // The Easter-egg maker: take a GIF from your life or the wild and splice a
  // GifOS filesystem into it, just before the trailer. Its animation plays
  // untouched everywhere it's shared — but dropped on a GifOS Home Screen,
  // it RUNS. (An existing GifOS gif just gets its payload swapped.)
  function embed(hostBytes, files) {
    if (!hostBytes || hostBytes.length < 13 || hostBytes[0] !== 0x47 || hostBytes[1] !== 0x49 || hostBytes[2] !== 0x46) {
      return Promise.reject(new Error('host is not a GIF'));
    }
    if (looksLikeGifosGif(hostBytes)) return withRemixDoc(files).then((f) => repack(hostBytes, f));
    return withRemixDoc(files).then(buildPayload).then((payload) => {
      const w = new Writer();
      w.byte(0x21).byte(0xff).byte(0x0b).ascii(GIFOS_MARKER).ascii(GIFOS_AUTH);
      w.subBlocks(payload);
      const block = w.done();
      let end = hostBytes.length;
      if (hostBytes[end - 1] === 0x3b) end -= 1; // re-add the trailer after our block
      const out = new Uint8Array(end + block.length + 1);
      out.set(hostBytes.subarray(0, end), 0);
      out.set(block, end);
      out[out.length - 1] = 0x3b;
      return out;
    });
  }

  function assemble(payload, opts) {
    // opts.preview (optional) is real static artwork (one frame); otherwise we
    // build an animated, looping icon. Normalize both to a { frames:[...] } shape.
    const f = opts.preview
      ? { width: opts.preview.width, height: opts.preview.height, palette: opts.preview.palette,
          numColors: opts.preview.numColors, minCodeSize: opts.preview.minCodeSize,
          frames: opts.preview.frames || [opts.preview.indices], // custom art may be animated (many frames)
          delayCs: opts.preview.delayCs || 0,
          transparentIndex: opts.preview.transparentIndex }
      : animatedPreview(opts.accent, opts.seed || 0);
    const numColors = f.numColors || (f.palette.length / 3);
    const sizeField = Math.round(Math.log2(numColors)) - 1; // 128→6, 256→7
    const w = new Writer();

    // Header + Logical Screen Descriptor
    w.ascii('GIF89a');
    w.u16(f.width).u16(f.height);
    w.byte(0x80 | (0x7 << 4) | (sizeField & 0x7));
    w.byte(0).byte(0); // bg color index, aspect ratio
    w.bytes(f.palette);

    // Application Extension carrying the GifOS archive
    w.byte(0x21).byte(0xff).byte(0x0b).ascii(GIFOS_MARKER).ascii(GIFOS_AUTH);
    w.subBlocks(payload);

    // NETSCAPE2.0 loop-forever extension (animated icons only)
    if (f.frames.length > 1) {
      w.byte(0x21).byte(0xff).byte(0x0b).ascii('NETSCAPE').ascii('2.0');
      w.byte(0x03).byte(0x01).u16(0).byte(0x00); // sub-block: loop count 0 = forever
    }

    // Each frame: Graphic Control Extension (delay) + Image Descriptor + LZW data
    // With a transparent color the GCE sets the transparency flag and disposal
    // "restore to background" so animated stickers don't smear between frames.
    const hasTrans = typeof f.transparentIndex === 'number';
    const gcePacked = hasTrans ? ((2 << 2) | 0x01) : 0x00;
    for (const indices of f.frames) {
      w.byte(0x21).byte(0xf9).byte(0x04).byte(gcePacked).u16(f.delayCs || 0)
        .byte(hasTrans ? f.transparentIndex : 0x00).byte(0x00);
      w.byte(0x2c).u16(0).u16(0).u16(f.width).u16(f.height).byte(0);
      w.byte(f.minCodeSize);
      w.subBlocks(lzwImageData(f.minCodeSize, indices));
    }

    w.byte(0x3b); // trailer
    return w.done();
  }

  // ---- decode: GIF89a bytes -> filesystem archive (async) ------------------
  // Returns Promise<{ files: { path: Uint8Array } } | null>.
  function extractPayload(bytes) {
    const marker = textToBytes(GIFOS_MARKER);
    let pos = 0;
    while (pos < bytes.length - 14) {
      if (bytes[pos] === 0x21 && bytes[pos + 1] === 0xff && bytes[pos + 2] === 0x0b) {
        let match = true;
        for (let i = 0; i < 8; i++) if (bytes[pos + 3 + i] !== marker[i]) { match = false; break; }
        if (match) {
          let p = pos + 3 + 11; // skip identifier(8) + auth(3)
          const chunks = [];
          while (p < bytes.length) {
            const size = bytes[p];
            if (size === 0) break;
            chunks.push(bytes.subarray(p + 1, p + 1 + size));
            p += 1 + size;
          }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const assembled = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { assembled.set(c, off); off += c.length; }
          return assembled;
        }
      }
      pos++;
    }
    return null;
  }

  // Async on purpose: decoding a big app used to be one synchronous block
  // (JSON.parse plus every file's base64), and on a slow phone that froze
  // the page's own "Opening…" feedback for the whole unpack — a launch that
  // reads as a dead tap. The per-file loop now yields between ~4 MB slices
  // so paints and timers keep flowing; JSON.parse remains the one
  // unavoidable block. Returns Promise<archive|null>.
  // v2: "GFA2" | u32 headerLen | header JSON | blob. Nothing to decode per
  // file — a file IS a window onto the payload already in hand — so this is
  // synchronous, allocates one small object, and never blocks the page the way
  // JSON.parse over a base64 archive does.
  function isArchiveV2(b) {
    return !!b && b.length >= 8 &&
      b[0] === 71 && b[1] === 70 && b[2] === 65 && b[3] === 50;
  }
  function parseArchiveV2(all, onProgress) {
    const hlen = all[4] | (all[5] << 8) | (all[6] << 16) | (all[7] * 0x1000000);
    if (hlen < 0 || 8 + hlen > all.length) return null;
    let header;
    try { header = JSON.parse(bytesToText(all.subarray(8, 8 + hlen))); } catch (e) { return null; }
    const dir = (header && header.files) || null;
    if (!dir) return null;
    const base = 8 + hlen;
    const out = { files: {} };
    let total = 0;
    for (const p in dir) {
      if (p === '__proto__') continue; // a bracket-assign of this name re-prototypes the map (see parseArchive)
      const e = dir[p];
      const off = Array.isArray(e) ? e[0] : -1, len = Array.isArray(e) ? e[1] : -1;
      // A directory entry that points outside the payload — or one that is
      // not two integers — is a corrupt or hostile file, not a file we serve
      // a truncated version of.
      if (!Number.isInteger(off) || !Number.isInteger(len) || !(off >= 0 && len >= 0 && base + off + len <= all.length)) return null;
      out.files[p] = all.subarray(base + off, base + off + len);
      total += len;
    }
    if (onProgress && total) { try { onProgress(1, total, total); } catch (e) {} }
    return out;
  }

  function parseArchive(jsonBytes, onProgress) {
    if (isArchiveV2(jsonBytes)) { try { return Promise.resolve(parseArchiveV2(jsonBytes, onProgress)); } catch (e) { return Promise.resolve(null); } }
    let archive;
    try { archive = JSON.parse(bytesToText(jsonBytes)); } catch (e) { return Promise.resolve(null); }
    // A file named "__proto__" is an OWN key after JSON.parse, but assigning
    // it onto a plain object below would swap the map's prototype for the
    // file's bytes, and every for…in over the files (save, export, remix)
    // would then walk those bytes as keys. Such an entry is dropped.
    const paths = Object.keys((archive && archive.files) || {}).filter((p) => p !== '__proto__');
    const out = { files: {} };
    let i = 0, done = 0, total = 0;
    // Every entry must be a base64 STRING. b64decode sizes its output from
    // .length before it reads a character, so an object with a huge .length
    // would ask for gigabytes on the strength of a 60-byte archive.
    for (let k = 0; k < paths.length; k++) {
      const s = archive.files[paths[k]];
      if (typeof s !== 'string') return Promise.resolve(null);
      total += s.length;
    }
    // 2 MB slices: frequent enough that the launch counter visibly ticks on a
    // throttled phone, and the first report lands BEFORE any slice is decoded
    // (a counter that only appears mid-unpack reads as a late start).
    const SLICE = 2 * 1024 * 1024;
    if (onProgress && total) { try { onProgress(0, 0, total); } catch (e) {} }
    return new Promise((resolve) => {
      const step = () => {
        try {
          let budget = SLICE;
          while (i < paths.length && budget > 0) {
            const p = paths[i++];
            const s = archive.files[p];
            budget -= s.length;
            done += s.length;
            out.files[p] = b64decode(s);
            // Drop the base64 as soon as it is bytes. Holding all of it until
            // the loop ends means the whole archive exists twice at once —
            // 1.34x the file data in strings on top of the bytes themselves —
            // and that doubling is pure waste on the one path where memory is
            // the binding constraint.
            archive.files[p] = null;
          }
        } catch (e) { resolve(null); return; }
        if (onProgress && total) { try { onProgress(done / total, done, total); } catch (e) { /* a UI hiccup never fails a decode */ } }
        if (i < paths.length) setTimeout(step, 0);
        else resolve(out);
      };
      step();
    });
  }


  // opts.onProgress(fraction, doneChars, totalChars) — called between decode
  // slices so a launch surface can show a DETERMINATE unpack (an indeterminate
  // spinner over a multi-second unpack reads as a hang; a blind critique
  // failed the launch on exactly that). Optional and additive.
  function decode(bytes, opts) {
    const onProgress = opts && opts.onProgress;
    const payload = extractPayload(bytes);
    if (!payload || payload.length === 0) return Promise.resolve(null);
    if (payload[0] === COMPRESSED_FLAG) {
      return inflate(payload.subarray(1)).then((j) => parseArchive(j, onProgress)).catch(() => null);
    }
    // legacy uncompressed JSON — still a promise, never a synchronous throw
    return Promise.resolve().then(() => parseArchive(payload, onProgress)).catch(() => null);
  }

  // ---- display-only: the animation, without the filesystem ------------------
  //
  // A GifOS app is a GIF with an entire filesystem inside it, and that can be
  // hundreds of megabytes. A Home Screen icon shows only the ANIMATION — every
  // GIF decoder on earth skips our Application Extension block — so handing the
  // whole file to an <img> copies those megabytes into a Blob and then walks
  // them looking for pixels that are not in them.
  //
  // Removing the block is EXACT, not approximate. It is a complete Application
  // Extension (introducer 0x21, label 0xFF, block size 11, identifier, auth,
  // sub-blocks, terminator), and the GIF grammar permits one anywhere a block
  // may appear — so deleting it whole leaves every pixel byte identical: header,
  // logical screen descriptor, palettes, NETSCAPE loop, graphic controls, image
  // descriptors, trailer. Same animation, frame for frame, byte for byte.
  //
  // *** THESE BYTES ARE NOT THE FILE. *** They will not decode(), they carry no
  // manifest, no saved state and no signature, and their hash is NOT the app's
  // hash. Anything that RUNS, installs, exports, shares, signs, verifies,
  // backs up or stores an app must use the original bytes. The only sanctioned
  // caller is the icon's <img> src — desktop.js blobUrlFor().
  //
  // WALKED, NOT SEARCHED. findAppExtSpan scans byte by byte from zero, which is
  // fine for a file you are already parsing and ruinous here: on a 300 MB app it
  // would cost more than the copy it is trying to save, and on an ordinary big
  // GIF with no marker at all it would walk every byte to conclude nothing.
  // This follows the block structure instead, stepping over the payload in
  // 255-byte sub-blocks by their own length bytes, so the cost tracks the number
  // of blocks rather than the size of the file.
  //
  // Anything unexpected returns the ORIGINAL bytes. A GIF we do not fully
  // understand must still be shown exactly as it is; the saving is an
  // optimisation, and correctness of the picture is not negotiable for it.
  function stripForDisplay(bytes) {
    if (!bytes || bytes.length < 14) return bytes;
    if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return bytes;
    const marker = textToBytes(GIFOS_MARKER);
    const spans = [];
    let p = 6;                                    // past "GIF89a"
    const packed = bytes[p + 4];
    p += 7;                                       // logical screen descriptor
    if (packed & 0x80) p += 3 * (1 << ((packed & 0x07) + 1));   // global colour table
    // Skip a run of length-prefixed sub-blocks; returns the index past the
    // terminating zero, or -1 if the file ends mid-run (truncated).
    const skipSubBlocks = (q) => {
      while (q < bytes.length) {
        const size = bytes[q];
        if (size === 0) return q + 1;
        q += 1 + size;
      }
      return -1;
    };
    while (p < bytes.length) {
      const introducer = bytes[p];
      if (introducer === 0x3b) break;             // trailer — end of the stream
      if (introducer === 0x21) {                  // extension
        const label = bytes[p + 1];
        let q;
        if (label === 0xff && bytes[p + 2] === 0x0b) {
          let mine = true;
          for (let i = 0; i < 8; i++) if (bytes[p + 3 + i] !== marker[i]) { mine = false; break; }
          q = skipSubBlocks(p + 3 + 11);
          if (q < 0) return bytes;
          if (mine) spans.push({ start: p, end: q });
        } else {
          q = skipSubBlocks(p + 2);
          if (q < 0) return bytes;
        }
        p = q;
      } else if (introducer === 0x2c) {           // image descriptor
        const lp = bytes[p + 9];
        let q = p + 10;
        if (lp & 0x80) q += 3 * (1 << ((lp & 0x07) + 1));       // local colour table
        q += 1;                                   // LZW minimum code size
        q = skipSubBlocks(q);
        if (q < 0) return bytes;
        p = q;
      } else {
        return bytes;                             // not a shape we understand
      }
    }
    if (!spans.length) return bytes;              // an ordinary GIF, or already stripped
    let drop = 0;
    for (let i = 0; i < spans.length; i++) drop += spans[i].end - spans[i].start;
    const out = new Uint8Array(bytes.length - drop);
    let w = 0, from = 0;
    for (let i = 0; i < spans.length; i++) {
      out.set(bytes.subarray(from, spans[i].start), w);
      w += spans[i].start - from;
      from = spans[i].end;
    }
    out.set(bytes.subarray(from), w);
    return out;
  }

  // ---- helpers ------------------------------------------------------------
  // Cheap sync check: valid GIF header + GIFOS marker present (no payload parse).
  function looksLikeGifosGif(bytes) {
    if (bytes.length < 6 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return false;
    return findGifosSpan(bytes) !== null; // a span, never a copy of the payload
  }

  // readManifest takes a decoded archive (decode() is async now).
  function readManifest(archive) {
    if (!archive || !archive.files['manifest.json']) return null;
    try { return JSON.parse(bytesToText(archive.files['manifest.json'])); }
    catch (e) { return null; }
  }

  // Writer helper exposed so the signing module can build/splice its own
  // application-extension block with the identical sub-block framing.
  function appExtBlock(marker8, auth3, payload) {
    const w = new Writer();
    w.byte(0x21).byte(0xff).byte(0x0b).ascii(marker8).ascii(auth3);
    w.subBlocks(payload);
    return w.done();
  }

  GifOS.gif = {
    encode, decode, repack, embed, looksLikeGifosGif, readManifest,
    b64encode, b64decode, textToBytes, bytesToText,
    findAppExtSpan, appExtBlock, stripForDisplay,
    setRemixDoc, REMIX_DOC, inflateMaxBytes, inflate,
    setArchiveVersion, isArchiveV2,
    MARKER: GIFOS_MARKER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
