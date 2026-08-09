/*
 * store.js — the App Store (store.html).
 *
 * Browses site/apps/index.json (the published catalog, built by
 * scripts/build-app-catalog.mjs) and installs an App GIF onto the Home Screen.
 *
 * THE COVER RULE — the reason this file exists in the shape it does. The store
 * NEVER references an App GIF as an image. Chess Grandmaster alone is 8.3 MB;
 * a grid that used the real GIFs as artwork would download the whole store to
 * paint one screen, on a phone, before the user has chosen anything. Every
 * picture on this page is the catalog's cover.jpg. The App GIF crosses the wire
 * exactly ONCE — inside install(), after a deliberate press. That is a network
 * property, not a style preference, so e2e-app-store.js asserts it by watching
 * requests rather than by reading this source.
 *
 * PLACEMENT — where an installed icon LANDS is not decided here. desktop.js's
 * saveItem() is the only place a desktop item may be written (it picks a free
 * cell so an arrival never stacks on an occupant). So install() stores the
 * FILE and hands off: /index.html?place=<fileId>, which desktop.js resolves
 * through saveItem like every other arrival. Adding a second placement writer
 * here is exactly the drift e2e-icon-placement.js exists to stop.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const store = GifOS.store;
  const gif = GifOS.gif;

  const $ = (id) => document.getElementById(id);
  const browseEl = $('browse'), detailEl = $('detail');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // A booted computer image carries its namespace through every hop.
  const ns = (key) => (store.dbName === 'gifos' ? '' : key + encodeURIComponent(store.dbName));
  // Running inside a frozen release snapshot (/versions/<x.y.z>/store.html)?
  // Then every hop stays inside that build, and there is no pretty
  // /store/<slug> pushState — it would bounce the next load back to the root.
  const FROZEN = location.pathname.indexOf('/versions/') !== -1;
  // The build's directory, resolved ONCE at load. Not a relative link: the
  // address bar spends most of its life at the pretty /store/<slug>, where
  // "index.html" would resolve to the nonexistent /store/index.html.
  const BASE = FROZEN ? location.pathname.replace(/\/[^/]*$/, '/') : '/';

  function human(bytes) {
    if (!(bytes > 0)) return '';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
  }
  function niceDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return iso || '';
    const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return MON[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1];
  }
  // Which manifest capabilities to show, in plain words. An app's powers are
  // part of its listing: you should know before you install, not at first use.
  const CAP_WORDS = {
    db: 'Saves data in the icon', multiplayer: 'Multiplayer', microphone: 'Microphone',
    camera: 'Camera', wasm: 'Runs WebAssembly', ai: 'AI', api: 'Third-party API', network: 'Network',
  };
  function capList(caps) {
    const out = [];
    for (const k of Object.keys(caps || {})) {
      const v = caps[k];
      if (v === false || (Array.isArray(v) && !v.length)) continue;
      let label = CAP_WORDS[k] || k;
      if (Array.isArray(v)) label += ' (' + v.join(', ') + ')';
      out.push(label);
    }
    return out;
  }

  let catalog = null;          // index.json
  let installedByAppId = {};   // appId -> fileId, so a listing can say "Open"
  let activeCat = 'All';
  let legacyDesktop = null;    // set to the release name when this visitor's
                               // Home Screen predates the store (see below)

  // ---------- which build owns this visitor's Home Screen? -------------------
  // This page has NO channel loader, unlike every other entry page: a release
  // visitor would have been redirected to /versions/<current>/store.html, and
  // every snapshot cut before this feature 404s there — gifos.app/store was a
  // hard 404 for the default channel the day it shipped. So the store is
  // served from the root to everyone and works the channel out itself, using
  // the same three localStorage keys the loader reads.
  //
  // The consequence that matters is the INSTALL HAND-OFF. It finishes on
  // index.html, and a release visitor's index.html bounces them into their
  // snapshot — a snapshot whose desktop.js may know nothing about #place=. It
  // would save the file and never place the icon: a silent half-install. So we
  // ask, once, whether that build has a store; a build that has store.html is
  // by construction a build that has the handler (they shipped together).
  // Order matters, and it is the CHANNEL LOADER'S order (see index.html): a pin
  // wins everywhere, including localhost — that snapshot is the user's computer
  // and an install has to reach it. Only the DEFAULT channel is gated on the
  // real domain, because off it the root is what you're developing.
  async function effectiveRelease() {
    if (FROZEN) return null;                                    // already inside a snapshot
    let pin = null, chan = null, cur = null;
    try {
      pin = localStorage.getItem('gifos_pin');
      chan = localStorage.getItem('gifos_channel');
      cur = localStorage.getItem('gifos_current');
    } catch (e) {}
    if (pin) return pin;
    if (chan === 'edge') return null;                           // opted into the root build
    if (!/(^|\.)gifos\.app$/.test(location.hostname)) return null;  // localhost/preview: the root IS the build
    if (cur) return cur;                                        // default channel, fast path
    // FIRST VISIT — nothing in localStorage yet, which is exactly the visitor
    // who followed a shared /store/<slug> link. The channel loader would
    // resolve the release pointer here, so we do too; skipping it would treat
    // them as an edge user and hand their install to a desktop that is about
    // to redirect itself into a snapshot.
    try {
      const r = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
      const v = (await r.json()).current || '';
      return v || null;
    } catch (e) { return null; }
  }

  async function resolveBuild() {
    const rel = await effectiveRelease();
    if (!rel) return;                                           // the root build owns this visitor
    let has = false;
    try {
      const r = await fetch('/versions/' + encodeURIComponent(rel) + '/store.html', { method: 'HEAD' });
      has = !!(r && r.ok);
    } catch (e) { /* offline: treat as "no", and say so rather than half-install */ }
    if (has) { location.replace('/versions/' + encodeURIComponent(rel) + '/store.html' + location.hash); return 'redirected'; }
    legacyDesktop = rel;
  }

  // Exposed so the decision can be tested directly rather than inferred from
  // what the page happens to render — the same reason the channel loader
  // exports gifosPinTarget. That hook once vanished in a redesign and took
  // five version-pinning assertions with it, silently.
  GifOS.storeBuild = { effectiveRelease, resolveBuild, get legacy() { return legacyDesktop; } };

  function legacyNotice() {
    return '<p class="err">Your Home Screen is running release ' + esc(legacyDesktop) +
      ', which was built before the App Store existed — it can’t receive an install yet. ' +
      'Update from <b>GifOS ▾ → Settings → Advanced → Version</b>, then come back.</p>';
  }

  async function refreshInstalled() {
    installedByAppId = {};
    try {
      for (const f of await store.allFiles()) {
        if (!f.isApp || !f.appId) continue;
        // The catalog pins an app to its sha256; hashing the INSTALLED bytes is
        // what lets a listing say "yours is older" instead of merely
        // "installed". A store-installed copy is otherwise frozen at
        // install-day code forever — the seeded-app reseed never touches it
        // (it only knows sample apps) — so every fix shipped after the install
        // simply never reached the player. Found by a player whose bugs had
        // been fixed for a day.
        // An install that sealed downloaded assets into the GIF no longer
        // hashes to the catalog's sha256 (the catalog pins the SLIM file), so
        // installs record the catalog hash they came from as storeSha and the
        // comparison prefers it. Hashing the bytes stays as the fallback for
        // installs that predate the field.
        let sha = f.storeSha || null;
        try {
          if (!sha && f.bytes && root.crypto && root.crypto.subtle) {
            const d = new Uint8Array(await root.crypto.subtle.digest('SHA-256', f.bytes));
            sha = ''; for (const b of d) sha += b.toString(16).padStart(2, '0');
          }
        } catch (e) { /* insecure origin: worst case, no Update badge */ }
        installedByAppId[f.appId] = { id: f.id, sha: sha, name: f.name };
      }
    } catch (e) { /* a store that won't open just means nothing shows as installed */ }
  }
  const installedOf = (app) => installedByAppId[app.appId] || null;
  const outdated = (app) => {
    const i = installedOf(app);
    return !!(i && i.sha && app.sha256 && i.sha !== app.sha256);
  };

  // ---------- browse ----------
  function matches(app, q) {
    if (activeCat !== 'All' && !(app.categories || []).includes(activeCat)) return false;
    if (!q) return true;
    const hay = [app.name, app.shortName, app.tagline, (app.author || {}).name].concat(app.tags || [], app.categories || []).join(' ').toLowerCase();
    return hay.includes(q);
  }

  function renderCats() {
    // Only categories that actually hold something — an empty aisle is noise.
    const used = new Set();
    for (const a of catalog.apps) for (const c of a.categories || []) used.add(c);
    const cats = ['All'].concat((catalog.categories || []).filter((c) => used.has(c)));
    $('cats').innerHTML = cats.map((c) =>
      '<button class="cat" data-cat="' + esc(c) + '" aria-pressed="' + (c === activeCat) + '">' + esc(c) + '</button>').join('');
  }

  function renderGrid() {
    const q = ($('q').value || '').trim().toLowerCase();
    const list = catalog.apps.filter((a) => matches(a, q));
    $('empty').style.display = list.length ? 'none' : '';
    $('grid').innerHTML = list.map((a) => {
      const installed = installedOf(a);
      return '<button class="card" data-slug="' + esc(a.slug) + '">' +
        // loading="lazy": below-the-fold covers don't even fetch until scrolled to.
        '<img class="shot" src="' + esc(a.cover) + '" alt="" loading="lazy" decoding="async">' +
        '<div class="body">' +
          '<h3>' + esc(a.name) + '</h3>' +
          '<div class="tag">' + esc(a.tagline) + '</div>' +
          '<div class="meta">' +
            (installed
              ? (outdated(a) ? '<span class="installed">↑ Update available</span>' : '<span class="installed">✓ Installed</span>')
              : '<span>' + esc(human(a.bytes)) + '</span>') +
            (a.categories || []).map((c) => '<span class="pill">' + esc(c) + '</span>').join('') +
          '</div>' +
        '</div></button>';
    }).join('');
  }

  const browseUrl = () => (FROZEN ? BASE + 'store.html' + (ns('#db=') || '') : '/store' + (ns('#db=') || ''));
  // At the root the shareable pretty path IS the URL; frozen builds have no
  // pretty route into a snapshot, so they carry the slug in the hash.
  const detailUrl = (slug) => (FROZEN
    ? BASE + 'store.html#app=' + encodeURIComponent(slug) + ns('&db=')
    : '/store/' + encodeURIComponent(slug) + (ns('#db=') || ''));

  function showBrowse(push) {
    detailEl.style.display = 'none';
    browseEl.style.display = '';
    document.title = 'App Store — GifOS';
    if (push) history.pushState({}, '', browseUrl());
    renderGrid();
    root.scrollTo(0, 0);
  }

  // ---------- detail ----------
  async function showDetail(slug, push) {
    let app;
    try {
      const r = await fetch('/apps/' + encodeURIComponent(slug) + '/app.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('not found');
      app = await r.json();
    } catch (e) { showBrowse(true); return; }

    browseEl.style.display = 'none';
    detailEl.style.display = '';
    document.title = app.name + ' — GifOS App Store';
    if (push) history.pushState({ slug }, '', detailUrl(slug));
    root.scrollTo(0, 0);

    const caps = capList(app.capabilities);
    const inst = installedOf(app);
    const installedId = inst && inst.id;
    const canUpdate = outdated(app);
    detailEl.innerHTML =
      '<button class="back" id="back">← All apps</button>' +
      '<div class="head"><div>' +
        '<h1>' + esc(app.name) + '</h1>' +
        '<div class="sub">' + esc(app.tagline) + '</div>' +
      '</div></div>' +
      // Again: cover.jpg. The GIF is not fetched until Install.
      '<img class="hero" src="' + esc(app.cover) + '" alt="' + esc(app.name) + ' screenshot" decoding="async">' +
      '<div class="actions">' +
        (installedId
          ? (canUpdate ? '<button class="btn" id="update"' + (legacyDesktop ? ' disabled' : '') + '>Update — keeps your data</button>' : '') +
            '<a class="btn' + (canUpdate ? ' ghost' : '') + '" href="' + BASE + 'run.html#id=' + encodeURIComponent(installedId) + ns('&db=') + '">Open</a>' +
            '<button class="btn ghost" id="install"' + (legacyDesktop ? ' disabled' : '') + '>Install again</button>'
          : '<button class="btn" id="install"' + (legacyDesktop ? ' disabled' : '') + '>Install — free</button>') +
        '<span class="note" id="note">' + esc(human(app.bytes)) + ' download</span>' +
        '<span class="prog" id="prog" style="display:none"><i></i></span>' +
      '</div>' +
      (legacyDesktop ? legacyNotice() : '') +
      '<div class="err" id="err" style="display:none"></div>' +
      '<div class="desc">' + esc(app.description) + '</div>' +
      '<dl class="facts">' +
        fact('Version', esc(app.version)) +
        fact('Author', app.author && app.author.url
          ? '<a href="' + esc(app.author.url) + '" rel="noopener">' + esc(app.author.name) + '</a>' : esc((app.author || {}).name)) +
        fact('Released', esc(niceDate(app.releaseDate))) +
        (app.updated && app.updated !== app.releaseDate ? fact('Updated', esc(niceDate(app.updated))) : '') +
        fact('Category', (app.categories || []).map((c) => '<span class="pill">' + esc(c) + '</span>').join(' ')) +
        fact('Size', esc(human(app.bytes))) +
        fact('License', esc(app.license)) +
        fact('Signature', app.signature && app.signature.id
          ? '✓ signed by ' + esc(app.signature.id) : 'not signed') +
        (caps.length ? fact('Abilities', '<span class="caps">' + caps.map((c) => '<span class="pill">' + esc(c) + '</span>').join(' ') + '</span>') : '') +
        (app.homepage ? fact('Source', '<a href="' + esc(app.homepage) + '" rel="noopener">the code that built it</a>') : '') +
      '</dl>';

    $('back').onclick = () => showBrowse(true);
    if (!legacyDesktop) $('install').onclick = () => install(app);
    const up = $('update');
    if (up && !legacyDesktop) up.onclick = () => install(app, inst);
  }
  const fact = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';

  // ---------- install ----------
  // The ONE moment the App GIF crosses the wire. With `into` (the installed
  // record), this is an UPDATE: the fresh bytes land on the SAME fileId, so
  // the icon, its placement and the app's saved data (all keyed by fileId)
  // survive — the code is the only thing that changes. This is exactly the
  // swap the seeded-app reseed does; store installs finally get it too.
  async function install(app, into) {
    const btn = $(into ? 'update' : 'install'), note = $('note'), prog = $('prog'), err = $('err');
    const fail = (msg) => { err.style.display = ''; err.textContent = msg; btn.disabled = false; prog.style.display = 'none'; };
    err.style.display = 'none';
    btn.disabled = true;
    prog.style.display = ''; prog.firstChild.style.width = '0';
    note.textContent = 'Downloading…';

    let bytes;
    try {
      const r = await fetch(app.gif, { cache: 'no-store' });
      if (!r.ok) throw new Error('the download returned ' + r.status);
      // Stream it so an 8 MB app shows real progress instead of a dead button.
      const total = Number(r.headers.get('content-length')) || app.bytes || 0;
      if (r.body && r.body.getReader) {
        const reader = r.body.getReader(), chunks = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (total) prog.firstChild.style.width = Math.min(100, Math.round(got * 100 / total)) + '%';
        }
        bytes = new Uint8Array(got);
        let off = 0;
        for (const c of chunks) { bytes.set(c, off); off += c.length; }
      } else {
        bytes = new Uint8Array(await r.arrayBuffer());
        prog.firstChild.style.width = '100%';
      }
    } catch (e) { return fail('Couldn’t download it — ' + (e.message || e)); }

    note.textContent = 'Checking…';

    // The catalog says exactly which bytes this app is. If what arrived isn't
    // that, something is wrong between here and the file — don't install it.
    if (app.sha256 && root.crypto && root.crypto.subtle) {
      try {
        const d = new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes));
        let hex = ''; for (const b of d) hex += b.toString(16).padStart(2, '0');
        if (hex !== app.sha256) return fail('That download doesn’t match the catalog. Nothing was installed.');
      } catch (e) { /* no subtle crypto (insecure origin): fall through to the structural checks */ }
    }

    const archive = await gif.decode(bytes).catch(() => null);
    const m = archive ? (gif.readManifest(archive) || {}) : null;
    if (!m || !m.appId) return fail('That file isn’t a GifOS app.');
    if (m.appId !== app.appId) return fail('That file is a different app than the listing. Nothing was installed.');

    // A listing that CLAIMS a signature must actually carry one that verifies —
    // the catalog records the claim, the browser checks it against the bytes.
    // 'unverified' (the key host is unreachable) is not a failure: the sha256
    // above already pinned these bytes to the catalog. 'tampered'/'unsigned'
    // against a signed listing is.
    if (app.signature && GifOS.sign && GifOS.sign.verify) {
      try {
        const v = await GifOS.sign.verify(bytes);
        if (v && (v.status === 'tampered' || v.status === 'unsigned')) {
          return fail('This app is listed as signed by ' + (app.signature.id || 'its author') +
            ', but the signature didn’t verify. Nothing was installed.');
        }
      } catch (e) { /* the hash above already pinned the bytes */ }
    }

    // Install-time assets (gifos-assets.js): after the file lands we download
    // each pinned URL FOR the app, verify its hash, and cache the bytes in the
    // computer's asset store (Blob-backed, keyed by the installed fileId — big
    // model weights never go inside the GIF). The app itself never touches the
    // network. Best-effort here: a failed download leaves a working install
    // that the runtime backfills on first launch.
    const fetchAssets = async (fid) => {
      const A = GifOS.assets; if (!A) return;
      try {
        const cache = A.assetCache(store, fid);
        const need = await A.missing(archive.files, m, cache);
        if (need.length) await A.ensure(archive.files, m, (s) => { note.textContent = s; }, cache);
      } catch (e) { note.textContent = '⚠ ' + (e.message || e) + ' — the app will retry when you open it.'; }
    };

    note.textContent = into ? 'Updating…' : 'Installing…';
    try {
      // The store remembers which fileId each appId lived at — because ALL of
      // an app's saved data (recent places, map cache, preferences) is keyed
      // by fileId, and a fresh id is a fresh, empty life. Recorded on every
      // install so a later delete-and-reinstall can pick the same identity
      // back up: deleteFile orphans the app's state rather than destroying
      // it, and re-using the id is what re-attaches it.
      const remembered = (await store.getState('sys::store-installs').catch(() => null)) || {};
      const rememberInstall = async (fid) => {
        remembered[m.appId] = fid;
        await store.setState('sys::store-installs', remembered).catch(() => {});
      };
      // A live copy always takes the UPDATE path, whatever button was showing
      // — installing a second copy of the same app next to the first would
      // fork its data for no reason anyone ever wants from a store.
      if (!into) {
        const live = installedOf(app);
        if (live) into = { id: live.id, name: live.name };
      }
      if (into) {
        // Same fileId, same NAME (the player may have renamed their copy) —
        // new bytes. No placement hand-off: the icon already lives somewhere.
        await store.putFile({ id: into.id, name: into.name || (app.name + '.gif'), bytes, kind: 'gif',
          isApp: true, appId: m.appId, accent: m.accent || app.accent || null, mime: 'image/gif',
          storeSha: app.sha256 || null });
        await rememberInstall(into.id);
        await fetchAssets(into.id);
        await refreshInstalled();
        await showDetail(app.slug, false);   // re-renders: Update button gone, sha now matches
        const n2 = $('note');
        if (n2) n2.textContent = 'Updated ✓ — your saved data is untouched.';
        return;
      }
      // Resurrect the app's old identity if its file is gone: the orphaned
      // state (searched places, driven-through map) re-attaches by id.
      let fileId = store.uid('file');
      const past = remembered[m.appId];
      if (past && !(await store.getFile(past).catch(() => null))) fileId = past;
      await store.putFile({ id: fileId, name: app.name + '.gif', bytes, kind: 'gif',
        isApp: true, appId: m.appId, accent: m.accent || app.accent || null, mime: 'image/gif',
        storeSha: app.sha256 || null });
      await rememberInstall(fileId);
      await fetchAssets(fileId);
      // Hand the placement to desktop.js's saveItem — the only writer of items.
      // Relative, so a frozen build's store finishes on that same build's
      // desktop; in the hash, so the channel loader can't drop it.
      location.href = BASE + 'index.html#place=' + encodeURIComponent(fileId) + ns('&db=') + '&from=store';
    } catch (e) { return fail('Couldn’t save it to this computer — ' + (e.message || e)); }
  }

  // ---------- routing ----------
  // /store/<slug> is the shareable link. GitHub Pages serves 404.html for it,
  // whose router sends it here as #app=<slug>; in-page navigation pushes the
  // pretty form back, so the address bar always shows the linkable URL.
  function slugFromUrl() {
    const m = /^\/store\/([a-z0-9-]{1,64})\/?$/i.exec(location.pathname);
    if (m) return m[1].toLowerCase();
    try { return (new URLSearchParams(location.hash.slice(1)).get('app') || '').toLowerCase(); } catch (e) { return ''; }
  }

  async function route(push) {
    const slug = slugFromUrl();
    if (slug) await showDetail(slug, push);
    else showBrowse(push);
  }

  (async function boot() {
    // Settle the build question before anything renders — it decides whether we
    // stay here at all, and whether Install is offered.
    if (await resolveBuild() === 'redirected') return;
    try {
      const r = await fetch('/apps/index.json', { cache: 'no-cache' });
      catalog = await r.json();
    } catch (e) {
      $('grid').innerHTML = '<p class="err">The catalog didn’t load. Check your connection and reload.</p>';
      return;
    }
    await refreshInstalled();
    renderCats();
    // Say it once at the top too, so nobody browses the whole catalog before
    // discovering their computer can't take an install yet.
    if (legacyDesktop) $('cats').insertAdjacentHTML('beforebegin', legacyNotice());

    $('q').addEventListener('input', renderGrid);
    $('cats').addEventListener('click', (e) => {
      const b = e.target.closest('.cat');
      if (!b) return;
      activeCat = b.dataset.cat;
      renderCats(); renderGrid();
    });
    $('grid').addEventListener('click', (e) => {
      const c = e.target.closest('.card');
      if (c) showDetail(c.dataset.slug, true);
    });
    root.addEventListener('popstate', () => route(false));

    // A deep link arrives from 404.html as #app=<slug>; rewrite it to the
    // pretty form so the address bar shows what you'd share.
    const slug = slugFromUrl();
    if (slug && !/^\/store\//.test(location.pathname)) history.replaceState({ slug }, '', detailUrl(slug));
    await route(false);
  })();
})(typeof window !== 'undefined' ? window : globalThis);
