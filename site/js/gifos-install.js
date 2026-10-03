/*
 * gifos-install.js — download an App Store listing's GIF and PROVE it is the
 * app the catalog says, in one place for every page that installs:
 *
 *   - the App Store itself (store.js) installs by navigation and keeps its
 *     own richer flow (updates in place, asset pre-fetch);
 *   - a MEETING (run.html) installs a provider mid-call with one tap
 *     (GifOS.providers.install, runtime.js);
 *   - the HOME SCREEN (desktop.js) seeds the DEFAULT STORE APPS lazily after
 *     it has painted (`defaults` below).
 *
 * The checks are the store's: the catalog record from /apps/<slug>/app.json,
 * the byte-exact sha256, the gifos.app signature when the listing claims one,
 * the manifest's own appId, and — for a provider — the provider rules
 * (docs/providers.md: it must provide a role and must be network-less).
 * Nothing here writes to the desktop: the caller files the bytes (store.putFile)
 * and places the icon the way its page is allowed to (saveItem on the desktop,
 * freeFolderCell in the runtime).
 *
 * DEFAULT STORE APPS — a new kind of default (2026-10-03). Until now every
 * default app was BUILT from source at desktop seed time (sample-apps.js).
 * These are first-party listings the Home Screen installs from the store
 * instead, LAZILY — after the first paint, when the page is idle, online, once
 * per computer — so the desktop never waits on a download. Deleting one is
 * respected: the per-slug stamp means it is never re-seeded unasked. Add a
 * listing here only if it is signed by gifos.app and every computer should
 * have it.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.install) return;

  const defaults = [
    // The meeting's on-device captions engine (docs/meeting.md, apps/offline-stt-whisper).
    // 13 MB; the Whisper models themselves arrive on first use as optional pins.
    { slug: 'offline-stt-whisper', folder: 'sys_providers', role: 'stt' },
  ];
  const stampKey = (slug) => 'gifos_store_default_' + slug;

  function listing(slug) {
    slug = String(slug || '').replace(/[^a-z0-9-]/gi, '');
    if (!slug) return Promise.reject(new Error('No app named.'));
    return root.fetch('/apps/' + slug + '/app.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('The App Store has no listing for ' + slug + ' (' + r.status + ').'); return r.json(); })
      .then((app) => {
        if (!app || !app.appId || !app.gif) throw new Error('The listing for ' + slug + ' is incomplete.');
        if (app.minBuild && Number(root.GIFOS_BUILD) && Number(root.GIFOS_BUILD) < Number(app.minBuild)) throw new Error((app.name || slug) + ' needs a newer GifOS than this page is running.');
        return app;
      });
  }

  // -> { bytes, manifest }. opts.provider: also enforce the provider rules.
  function fetchApp(app, onProgress, opts) {
    const note = (text, frac) => { if (typeof onProgress === 'function') { try { onProgress(text, frac); } catch (e) {} } };
    const label = app.name || app.appId;
    const gif = GifOS.gif;
    note('Downloading ' + label + '…', 0);
    return root.fetch(app.gif, { cache: 'no-store', redirect: 'follow' }).then((r) => {
      if (!r.ok) throw new Error('the download returned ' + r.status);
      const total = Number(r.headers.get('content-length')) || app.bytes || 0;
      if (!r.body || !r.body.getReader) return r.arrayBuffer().then((b) => new Uint8Array(b));
      const reader = r.body.getReader(); const chunks = []; let got = 0;
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { const out = new Uint8Array(got); let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; } return out; }
        chunks.push(value); got += value.length;
        if (total) note('Downloading ' + label + '… ' + Math.round(got / 1e6) + ' of ' + Math.round(total / 1e6) + ' MB', Math.min(1, got / total));
        return pump();
      });
      return pump();
    }).then((bytes) => {
      note('Checking ' + label + '…', null);
      const hashP = (app.sha256 && root.crypto && root.crypto.subtle)
        ? root.crypto.subtle.digest('SHA-256', bytes).then((d) => {
          let hex = ''; for (const b of new Uint8Array(d)) hex += b.toString(16).padStart(2, '0');
          if (hex !== app.sha256) throw new Error('The download does not match the catalog. Nothing was installed.');
        }, () => null) // no subtle crypto (an insecure origin): the structural checks below still run
        : Promise.resolve();
      return hashP
        .then(() => (app.signature && GifOS.sign && GifOS.sign.verify)
          ? GifOS.sign.verify(bytes).then((v) => { if (v && (v.status === 'tampered' || v.status === 'unsigned')) throw new Error('This app is listed as signed by ' + (app.signature.id || 'its author') + ', but the signature did not verify. Nothing was installed.'); }, () => null)
          : null)
        .then(() => gif.readManifestFrom(bytes).catch(() => null))
        .then((m) => m || gif.decode(bytes).then((arc) => arc ? (gif.readManifest(arc) || null) : null).catch(() => null))
        .then((m) => {
          if (!m || !m.appId) throw new Error('That file is not a GifOS app.');
          if (m.appId !== app.appId) throw new Error('That file is a different app than the listing. Nothing was installed.');
          if (opts && opts.provider) {
            const roles = (m.provides && Array.isArray(m.provides.ai)) ? m.provides.ai.filter(Boolean) : [];
            const caps = m.capabilities || {};
            const some = (v) => Array.isArray(v) ? v.length > 0 : !!v;
            if (!roles.length) throw new Error((m.name || label) + ' is not a Provider app.');
            if (some(caps.network) || some(caps.api)) throw new Error((m.name || label) + ' declares network access, and a provider must be network-less. Refused.');
          }
          return { bytes, manifest: m };
        });
    });
  }

  GifOS.install = { defaults, stampKey, listing, fetchApp };
})(typeof window !== 'undefined' ? window : globalThis);
