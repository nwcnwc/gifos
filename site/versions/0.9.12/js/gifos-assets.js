/*
 * gifos-assets.js — install-time app assets: DOWNLOAD, VERIFY, CACHE.
 *
 * An app whose payload is genuinely too big to ride inside its GIF — model
 * weights in the tens of MB to gigabytes, typically on a public host like
 * Hugging Face — declares it in the manifest:
 *
 *   "assets": [{ "url": "https://…/model-tq2_0.gguf",
 *                "sha256": "<64-hex of the exact bytes>",
 *                "path": "model.gguf", "bytes": 1200000000 }]
 *
 * Optional pins (`"optional": true`) are NOT fetched at install or on boot.
 * The app asks for them with gifos.assets(path); the OS then downloads that
 * one pin, verifies it, caches it. Same trust as a required pin — the URL
 * and hash are still the author's, the sandbox still never fetches — but a
 * model the user never picks never crosses the wire. Required is the default,
 * so every existing app is unchanged.
 *
 * The OS — always a TRUSTED first-party page (the App Store at install,
 * run.html / the provider mount as a backfill, gifos.assets() on demand),
 * never the sandbox — fetches each pinned URL, verifies the SHA-256, and
 * caches the bytes in the computer's ASSET STORE (IndexedDB `appassets`,
 * Blob-backed so the browser keeps them on disk, keyed by the icon's
 * fileId). The app reads them back with gifos.assets(path) and never touches
 * the network itself.
 *
 * WHY A STORE, NOT THE GIF. Sealing into the GIF (repack) caps out fast: the
 * payload is base64-inside-JSON, so a fine-at-5-MB engine works but a 1.2 GB
 * model would base64 past the engine's maximum string length before the
 * encoder ever ran. Weights therefore live beside the GIF, not in it — and
 * that matches the distribution story: a shared/exported GIF stays slim, and
 * the receiving computer re-downloads from the SAME manifest pin (the public
 * host is the canonical storage; GifOS holds a verified local cache). For the
 * same reason the cache is excluded from whole-computer backups. A tiny
 * `.assets/<path>` file packed INSIDE a GIF still wins over the cache — an
 * author may hand-seal small fixtures — but nothing writes that path anymore.
 *
 * Why this is safe for network-less apps (including Providers,
 * docs/providers.md): the URL is FIXED in the manifest and the hash pins the
 * exact bytes, so the download can neither carry data out (no app-controlled
 * parameters, and it happens before the app has seen anything) nor bring
 * surprise code in (a byte off and it is refused). It is the author's shipped
 * payload arriving by a second route — same trust as the GIF itself.
 *
 * URL forms: absolute https://…, or origin-relative /… (resolved against the
 * serving origin — what the test harness uses). `bytes` is UX (progress
 * labels, the store's "+N GB download" copy) — never trusted for anything.
 *
 * Attaches to `GifOS.assets`. Loaded by store.html and run.html.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.assets) return;

  const DIR = '.assets/';
  const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024 - 1; // the ArrayBuffer/hashing ceiling

  const normPath = (p) => String(p || '').replace(/^\.?\/+/, '');
  const okHash = (h) => /^[0-9a-f]{64}$/.test(String(h || '').toLowerCase());
  // Reject traversal and absolute paths — an asset name is a bare relative key.
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
      out.push({
        url, path, sha256,
        bytes: Number(a.bytes) > 0 ? Number(a.bytes) : 0,
        optional: a.optional === true,
      });
    }
    return out;
  }
  const key = (entry) => DIR + normPath(entry.path || entry);

  // What still needs downloading: not hand-sealed inside the GIF's own
  // filesystem, and not already in the asset cache. `cache` is the store
  // binding — { has(path), put(path, blob) } — from assetCache() below;
  // omit it for a session-only context and everything missing re-fetches.
  // opts.requiredOnly — install and boot backfill: skip optional pins. They
  // arrive when gifos.assets(path) asks for that path, not before.
  function missing(files, manifest, cache, opts) {
    const requiredOnly = !!(opts && opts.requiredOnly);
    const need = list(manifest).filter((a) => {
      if (requiredOnly && a.optional) return false;
      return !(files && files[key(a)]);
    });
    if (!cache) return Promise.resolve(need);
    return Promise.all(need.map((a) => cache.has(a.path))).then((have) => need.filter((_, i) => !have[i]));
  }

  function sha256Hex(bytes) {
    return root.crypto.subtle.digest('SHA-256', bytes).then((d) => {
      const u = new Uint8Array(d);
      let hex = ''; for (let i = 0; i < u.length; i++) hex += u[i].toString(16).padStart(2, '0');
      return hex;
    });
  }

  const fmtMB = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(1) + ' MB');

  // Read a response body to a Blob while REPORTING PROGRESS.
  //
  // r.blob() is one line and tells you nothing until it is finished, which is
  // how an 806 MB model came to download behind a bar that was already full
  // (left over from the App GIF) with no way to tell a stalled download from a
  // slow one. So we pump the stream ourselves and count bytes.
  //
  // The catch, and why this is not just chunks.push(): holding every chunk as
  // a Uint8Array would put the WHOLE asset in the JS heap, which is exactly the
  // thing this module exists to avoid — the weights are Blob-backed end to end
  // precisely so a gigabyte model never becomes a gigabyte of heap. So chunks
  // are folded into Blob PARTS every few MB: the browser can spill a Blob to
  // disk, so the heap holds only the current part. Peak stays ~PART_BYTES
  // instead of ~filesize.
  //
  // No content-length (a chunked transfer, or a CORS response that doesn't
  // expose it) means no honest fraction — report null and let the caller show
  // an indeterminate bar rather than invent a number.
  const PART_BYTES = 4 * 1024 * 1024;
  function readWithProgress(r, declaredBytes, onBytes) {
    if (!(r.body && r.body.getReader)) return r.blob();
    const total = Number(r.headers.get('content-length')) || Number(declaredBytes) || 0;
    const reader = r.body.getReader();
    const parts = [];
    let pending = [], pendingLen = 0, got = 0;
    const flush = () => { if (pendingLen) { parts.push(new Blob(pending)); pending = []; pendingLen = 0; } };
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { flush(); return new Blob(parts); }
      pending.push(value); pendingLen += value.length; got += value.length;
      if (pendingLen >= PART_BYTES) flush();
      if (onBytes) { try { onBytes(got, total); } catch (e) {} }
      return pump();
    });
    return pump();
  }

  // Download every missing asset, hash-verified, into the cache. Serial on
  // purpose: these are big files and the progress line should read one honest
  // name at a time. Memory note: the response streams into Blob parts
  // (disk-backed), but hashing needs one transient ArrayBuffer of the whole
  // file — the peak is ~1× the asset size, released as soon as the digest is
  // done.
  //
  // onStatus(text, frac) — frac is 0..1 while bytes are arriving, and null for
  // a phase with no measurable progress (verifying, or a download whose length
  // the server never declared). A caller that only wants the words can ignore
  // the second argument, and every existing one does.
  function ensure(files, manifest, onStatus, cache, opts) {
    return missing(files, manifest, cache, opts).then((need) => {
      let chain = Promise.resolve();
      need.forEach((a, i) => {
        chain = chain.then(() => {
          const name = a.path.split('/').pop();
          const label = name + (a.bytes ? ' (' + fmtMB(a.bytes) + ')' : '');
          const ofN = need.length > 1 ? ' — ' + (i + 1) + '/' + need.length : '';
          const say = (text, frac) => { if (onStatus) { try { onStatus(text, frac); } catch (e) {} } };
          say('Downloading ' + label + ofN + '…', 0);
          const url = /^https:\/\//.test(a.url) ? a.url : root.location.origin + a.url;
          return fetch(url, { credentials: 'omit', redirect: 'follow' })
            .then((r) => {
              if (!r.ok) throw new Error('the download failed (' + r.status + ')');
              return readWithProgress(r, a.bytes, (got, total) => {
                // The size in the label comes from the SERVER when it says so,
                // and from the manifest otherwise — a download that quietly
                // ran long should show it, not keep quoting the pin.
                const shown = total ? fmtMB(total) : (a.bytes ? fmtMB(a.bytes) : '');
                say('Downloading ' + name + (shown ? ' (' + fmtMB(got) + ' of ' + shown + ')' : '') + ofN + '…',
                  total ? Math.min(1, got / total) : null);
              });
            })
            .then((blob) => {
              if (blob.size > MAX_ASSET_BYTES) throw new Error('the file exceeds the 2 GB per-asset ceiling');
              // Hashing a gigabyte is not instant and has no sub-steps to
              // report, so the bar goes indeterminate rather than sitting at a
              // full 100% pretending the work is done — the exact lie this
              // whole change exists to stop telling.
              say('Verifying ' + name + '…', null);
              return blob.arrayBuffer()
                .then((buf) => sha256Hex(buf))
                .then((hex) => {
                  if (hex !== a.sha256) throw new Error('the bytes don’t match the app’s pinned hash — refused');
                  if (cache) return cache.put(a.path, blob);
                  // Session-only fallback (no store to cache into): hold the
                  // bytes in the in-memory filesystem for this mount's life.
                  return blob.arrayBuffer().then((buf2) => { files[key(a)] = new Uint8Array(buf2); });
                });
            })
            .catch((e) => { throw new Error('Asset "' + a.path + '": ' + (e && e.message || e)); });
        });
      });
      return chain.then(() => ({ changed: need.length > 0, fetched: need.length, total: list(manifest).length }));
    });
  }

  // The store binding for a given icon: how ensure() caches, and how the
  // runtime's gifos.assets() serves. `store` is a GifOS.store (namespace-aware).
  function assetCache(store, fileId) {
    if (!store || !fileId || !store.putAsset) return null;
    return {
      has: (path) => store.hasAsset(fileId, normPath(path)).catch(() => false),
      put: (path, blob) => store.putAsset(fileId, normPath(path), blob),
      get: (path) => store.getAsset(fileId, normPath(path)).catch(() => null),
    };
  }

  // One pin, by path. gifos.assets() uses this when the bytes are not cached
  // yet: the app names a file the author pinned, the OS fetches that row, and
  // nothing else. An unknown path is a miss, not a free-form download.
  function ensurePath(files, manifest, path, onStatus, cache) {
    const p = normPath(path);
    const row = list(manifest).find((a) => a.path === p);
    if (!row) return Promise.resolve({ changed: false, fetched: 0, total: 0, unknown: true });
    const one = { assets: [row] };
    return ensure(files, one, onStatus, cache);
  }

  GifOS.assets = { DIR, list, missing, ensure, ensurePath, key, normPath, assetCache };
})(typeof window !== 'undefined' ? window : globalThis);
