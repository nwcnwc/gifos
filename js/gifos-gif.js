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

  // ---- build a tiny valid preview frame -----------------------------------
  // A 3-color diagonal swatch keyed off an accent color, so every GIF is a
  // real image without needing a canvas. Returns {width,height,palette,indices}.
  function previewFrame(accent) {
    const W = 32, H = 32;
    const [r, g, b] = accent || [123, 92, 255];
    // 128-entry palette (2^7) so image min code size is 7 → few clear codes.
    const palette = new Array(128 * 3).fill(0);
    const set = (i, rr, gg, bb) => { palette[i * 3] = rr; palette[i * 3 + 1] = gg; palette[i * 3 + 2] = bb; };
    set(0, 10, 10, 15);              // background (near-black)
    set(1, r, g, b);                 // accent
    set(2, Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)); // highlight
    const indices = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = (x + y) % 12;
        indices[y * W + x] = d < 2 ? 2 : d < 6 ? 1 : 0;
      }
    }
    return { width: W, height: H, palette, indices, minCodeSize: 7 };
  }

  // ---- encode: filesystem archive -> GIF89a bytes -------------------------
  // files: { "path": Uint8Array | string }
  function encode(files, opts) {
    opts = opts || {};
    const archive = { v: 1, files: {} };
    for (const path in files) {
      const val = files[path];
      const bytes = typeof val === 'string' ? textToBytes(val) : val;
      archive.files[path] = b64encode(bytes);
    }
    const payload = textToBytes(JSON.stringify(archive));

    const f = previewFrame(opts.accent);
    const w = new Writer();

    // Header + Logical Screen Descriptor
    w.ascii('GIF89a');
    w.u16(f.width).u16(f.height);
    // packed: global color table = 1, color res = 7 (bits-1), sort 0, size = 6 (→128)
    w.byte(0b1_111_0_110);
    w.byte(0).byte(0); // bg color index, aspect ratio
    w.bytes(f.palette); // 128 * 3 bytes

    // Application Extension carrying the GifOS archive
    w.byte(0x21).byte(0xff).byte(0x0b).ascii(GIFOS_MARKER).ascii(GIFOS_AUTH);
    w.subBlocks(payload);

    // Image Descriptor + LZW image data
    w.byte(0x2c);
    w.u16(0).u16(0).u16(f.width).u16(f.height);
    w.byte(0); // no local color table
    w.byte(f.minCodeSize);
    w.subBlocks(lzwImageData(f.minCodeSize, f.indices));

    // Trailer
    w.byte(0x3b);
    return w.done();
  }

  // ---- decode: GIF89a bytes -> filesystem archive -------------------------
  // Returns { files: { path: Uint8Array } } or null if not a GifOS GIF.
  function decode(bytes) {
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
          try {
            const archive = JSON.parse(bytesToText(assembled));
            const out = { files: {} };
            for (const path in archive.files) out.files[path] = b64decode(archive.files[path]);
            return out;
          } catch (e) {
            return null;
          }
        }
      }
      pos++;
    }
    return null;
  }

  // ---- helpers ------------------------------------------------------------
  function isGifosGif(bytes) {
    // Quick check: valid GIF header + our marker present.
    if (bytes.length < 6 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return false;
    return decode(bytes) !== null;
  }

  function readManifest(archiveOrBytes) {
    const archive = archiveOrBytes instanceof Uint8Array ? decode(archiveOrBytes) : archiveOrBytes;
    if (!archive || !archive.files['manifest.json']) return null;
    try { return JSON.parse(bytesToText(archive.files['manifest.json'])); }
    catch (e) { return null; }
  }

  GifOS.gif = {
    encode, decode, isGifosGif, readManifest,
    b64encode, b64decode, textToBytes, bytesToText,
    MARKER: GIFOS_MARKER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
