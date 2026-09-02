/*
 * gifos-zip.js — Minimal ZIP reader (no dependencies).
 *
 * Enough of the ZIP format to unpack an app someone's AI produced as a folder:
 * reads the central directory, extracts each file (stored or deflated — the
 * two methods real tools emit), and returns a { path: Uint8Array } map. Uses
 * the browser-native inflate already used by the GIF codec. A single wrapping
 * top-level folder is stripped so index.html lands at the root.
 *
 * Attaches to `GifOS.zip`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  // The GIF codec's inflate carries the decompression ceiling (a small
  // payload that expands past max(64 MB, 16× its size) is refused); a bare
  // Response.arrayBuffer() would inflate a zip bomb whole.
  function inflateRaw(bytes) {
    if (GifOS.gif && typeof GifOS.gif.inflate === 'function') return GifOS.gif.inflate(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new root.DecompressionStream('deflate-raw'));
    return new root.Response(stream).arrayBuffer().then((b) => new Uint8Array(b));
  }
  // An entry name as a path inside the app: forward slashes, no leading
  // slash or "./", no ".." segment, no NUL. Anything else is not a file this
  // reader will hand to the runtime.
  function cleanName(name) {
    let n = String(name).replace(/\\/g, '/');
    while (n.startsWith('./') || n.startsWith('/')) n = n.replace(/^(\.\/|\/)+/, '');
    if (!n || n.indexOf('\0') >= 0) return null;
    if (n.split('/').some((seg) => seg === '..' || seg === '')) return null;
    return n;
  }

  function looksLikeZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }

  // Returns Promise<{ path: Uint8Array }>.
  function unpack(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Find End Of Central Directory (0x06054b50), scanning back from the end.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('not a zip (no end-of-central-directory)'));
    const count = dv.getUint16(eocd + 10, true);
    let cd = dv.getUint32(eocd + 16, true);

    const jobs = [];
    const seen = new Set();
    for (let n = 0; n < count; n++) {
      // A directory that ends early is a truncated or inconsistent archive,
      // not a shorter app.
      if (dv.getUint32(cd, true) !== 0x02014b50) return Promise.reject(new Error('corrupt zip (central directory ends early)'));
      const method = dv.getUint16(cd + 10, true);
      const compSize = dv.getUint32(cd + 20, true);
      const nameLen = dv.getUint16(cd + 28, true);
      const extraLen = dv.getUint16(cd + 30, true);
      const commentLen = dv.getUint16(cd + 32, true);
      const localOff = dv.getUint32(cd + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(cd + 46, cd + 46 + nameLen));
      cd += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith('/')) continue; // directory entry
      const path = cleanName(name);
      if (!path || path === '__proto__') continue; // not a path we serve (see cleanName)
      if (seen.has(path)) continue;                 // first entry wins; a duplicate never silently replaces it
      seen.add(path);
      // Local header: data begins after its own name+extra fields.
      if (dv.getUint32(localOff, true) !== 0x04034b50) return Promise.reject(new Error('corrupt zip (bad local header for ' + path + ')'));
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      if (dataStart + compSize > bytes.length) return Promise.reject(new Error('corrupt zip (truncated entry ' + path + ')'));
      const raw = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) jobs.push(() => Promise.resolve([path, raw.slice()]));
      else if (method === 8) jobs.push(() => inflateRaw(raw).then((out) => [path, out]));
      else return Promise.reject(new Error('unsupported zip compression method ' + method + ' for ' + path));
    }

    // One entry inflates at a time, so the ceiling is per archive, not per
    // entry times the entry count.
    const files = {};
    return jobs.reduce((p, job) => p.then(job).then(([path, data]) => { files[path] = data; }), Promise.resolve())
      .then(() => stripCommonPrefix(files));
  }

  // If every file lives under one top-level folder (e.g. "myapp/"), drop it so
  // index.html is at the root where the runtime expects it.
  function stripCommonPrefix(files) {
    const paths = Object.keys(files);
    if (!paths.length) return files;
    const first = paths[0].split('/')[0] + '/';
    if (!paths.every((p) => p.startsWith(first) && p.length > first.length)) return files;
    const out = {};
    for (const p in files) out[p.slice(first.length)] = files[p];
    return out;
  }

  GifOS.zip = { unpack, looksLikeZip };
})(typeof window !== 'undefined' ? window : globalThis);
