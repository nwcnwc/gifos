/*
 * gifos-assets.js — install-time app assets: DOWNLOAD-THEN-SEAL.
 *
 * An app whose payload is too big (or too separately-licensed) to ride inside
 * its GIF declares it in the manifest instead:
 *
 *   "assets": [{ "url": "https://…/model-q4.bin",
 *                "sha256": "<64-hex of the exact bytes>",
 *                "path": "espeak.js", "bytes": 4900000 }]
 *
 * The OS — always a TRUSTED first-party page (the App Store at install,
 * run.html as a backfill on first mount), never the sandbox — fetches each
 * pinned URL, verifies the SHA-256, and seals the bytes into the app's packed
 * filesystem under `.assets/<path>`. The app reads them back with
 * gifos.assets(path) and never touches the network itself.
 *
 * Why this is safe to do for network-less apps (including Providers,
 * docs/providers.md): the URL is FIXED in the manifest and the hash pins the
 * exact bytes, so the download can neither carry data out (no app-controlled
 * parameters exist, and it happens before the app has seen anything) nor
 * bring surprise code in (a byte off and it is refused). It is the author's
 * shipped payload arriving by a second route — same trust as the GIF itself.
 *
 * URL forms: absolute https://…, or origin-relative /… (resolved against the
 * serving origin — how first-party apps keep working on gifos.app, a local
 * dev server, and the test harness alike). `bytes` is optional UX (progress
 * labels, store "+N MB download" copy) — never trusted for anything.
 *
 * Signatures: `.assets/**` is excluded from the signing digest exactly like
 * `.state/**` (gifos-sign.js) — the signed manifest already pins each asset
 * by hash, so sealing the download voids nothing.
 *
 * Attaches to `GifOS.assets`. Loaded by store.html and run.html.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.assets) return;

  const DIR = '.assets/';
  const MAX_ASSET_BYTES = 200 * 1024 * 1024; // sanity ceiling per asset

  const normPath = (p) => String(p || '').replace(/^\.?\/+/, '');
  const okHash = (h) => /^[0-9a-f]{64}$/.test(String(h || '').toLowerCase());
  // Reject traversal and absolute paths — an asset lands INSIDE .assets/ only.
  const okPath = (p) => !!p && p.indexOf('..') < 0 && p[0] !== '/' && p.indexOf('\\') < 0;
  const okUrl = (u) => /^https:\/\/./.test(u) || (/^\/[^/]/.test(u) && u.indexOf('//') !== 0);

  // The validated declaration list. Malformed entries are DROPPED (an app
  // cannot smuggle a fetch through a half-formed row — no hash, no download).
  function list(manifest) {
    const raw = (manifest && manifest.assets) || [];
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const a of raw) {
      if (!a || typeof a !== 'object') continue;
      const url = String(a.url || ''), path = normPath(a.path), sha256 = String(a.sha256 || '').toLowerCase();
      if (!okUrl(url) || !okPath(path) || !okHash(sha256)) continue;
      out.push({ url, path, sha256, bytes: Number(a.bytes) > 0 ? Number(a.bytes) : 0 });
    }
    return out;
  }
  const key = (entry) => DIR + normPath(entry.path || entry);
  const missing = (files, manifest) => list(manifest).filter((a) => !files[key(a)]);

  function sha256Hex(bytes) {
    return root.crypto.subtle.digest('SHA-256', bytes).then((d) => {
      const u = new Uint8Array(d);
      let hex = ''; for (let i = 0; i < u.length; i++) hex += u[i].toString(16).padStart(2, '0');
      return hex;
    });
  }

  // Fetch every missing asset into `files` (mutated in place), hash-verified.
  // Serial on purpose: these are big files and the progress line should read
  // one honest name at a time. The caller decides whether/where to persist
  // (repack into the GIF) — this only completes the in-memory filesystem.
  function ensure(files, manifest, onStatus) {
    const need = missing(files, manifest);
    let chain = Promise.resolve();
    need.forEach((a, i) => {
      chain = chain.then(() => {
        const label = a.path.split('/').pop() + (a.bytes ? ' (' + (a.bytes / 1e6).toFixed(1) + ' MB)' : '');
        if (onStatus) { try { onStatus('Downloading ' + label + (need.length > 1 ? ' — ' + (i + 1) + '/' + need.length : '') + '…'); } catch (e) {} }
        const url = /^https:\/\//.test(a.url) ? a.url : root.location.origin + a.url;
        return fetch(url, { credentials: 'omit', redirect: 'follow' })
          .then((r) => { if (!r.ok) throw new Error('the download failed (' + r.status + ')'); return r.arrayBuffer(); })
          .then((buf) => {
            if (buf.byteLength > MAX_ASSET_BYTES) throw new Error('the file is implausibly large');
            const u8 = new Uint8Array(buf);
            return sha256Hex(u8).then((hex) => {
              if (hex !== a.sha256) throw new Error('the bytes don’t match the app’s pinned hash — refused');
              files[key(a)] = u8;
            });
          })
          .catch((e) => { throw new Error('Asset "' + a.path + '": ' + (e && e.message || e)); });
      });
    });
    return chain.then(() => ({ changed: need.length > 0, fetched: need.length, total: list(manifest).length }));
  }

  GifOS.assets = { DIR, list, missing, ensure, key, normPath };
})(typeof window !== 'undefined' ? window : globalThis);
