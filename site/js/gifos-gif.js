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
  function b64encode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
      out += i + 2 < bytes.length ? B64[n & 63] : '=';
    }
    return out;
  }
  function b64decode(str) {
    const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
    const len = Math.floor((clean.length * 3) / 4);
    const out = new Uint8Array(len);
    let p = 0, buf = 0, bits = 0;
    for (let i = 0; i < clean.length; i++) {
      buf = (buf << 6) | B64.indexOf(clean[i]);
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
  function Writer() { this.parts = []; }
  Writer.prototype.byte = function (b) { this.parts.push(b & 0xff); return this; };
  Writer.prototype.bytes = function (arr) { for (let i = 0; i < arr.length; i++) this.parts.push(arr[i] & 0xff); return this; };
  Writer.prototype.u16 = function (n) { this.parts.push(n & 0xff, (n >> 8) & 0xff); return this; };
  Writer.prototype.ascii = function (s) { for (let i = 0; i < s.length; i++) this.parts.push(s.charCodeAt(i) & 0xff); return this; };
  Writer.prototype.subBlocks = function (data) {
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      this.parts.push(chunk.length);
      this.bytes(chunk);
    }
    this.parts.push(0x00); // block terminator
    return this;
  };
  Writer.prototype.done = function () { return new Uint8Array(this.parts); };

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
  function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new root.DecompressionStream('deflate-raw'));
    return new root.Response(stream).arrayBuffer().then((buf) => new Uint8Array(buf));
  }

  // ---- payload builder (shared by encode and repack) -----------------------
  function buildPayload(files) {
    const archive = { v: 1, files: {} };
    for (const path in files) {
      const val = files[path];
      const bytes = typeof val === 'string' ? textToBytes(val) : val;
      archive.files[path] = b64encode(bytes);
    }
    const json = textToBytes(JSON.stringify(archive));
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
  function encode(files, opts) {
    return buildPayload(files).then((payload) => assemble(payload, opts || {}));
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
    if (looksLikeGifosGif(hostBytes)) return repack(hostBytes, files);
    return buildPayload(files).then((payload) => {
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

  function parseArchive(jsonBytes) {
    try {
      const archive = JSON.parse(bytesToText(jsonBytes));
      const out = { files: {} };
      for (const path in archive.files) out.files[path] = b64decode(archive.files[path]);
      return out;
    } catch (e) { return null; }
  }

  function decode(bytes) {
    const payload = extractPayload(bytes);
    if (!payload || payload.length === 0) return Promise.resolve(null);
    if (payload[0] === COMPRESSED_FLAG) {
      return inflate(payload.subarray(1)).then(parseArchive).catch(() => null);
    }
    return Promise.resolve(parseArchive(payload)); // legacy uncompressed JSON
  }

  // ---- helpers ------------------------------------------------------------
  // Cheap sync check: valid GIF header + GIFOS marker present (no payload parse).
  function looksLikeGifosGif(bytes) {
    if (bytes.length < 6 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return false;
    return extractPayload(bytes) !== null;
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
    findAppExtSpan, appExtBlock,
    MARKER: GIFOS_MARKER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
