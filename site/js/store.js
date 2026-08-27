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
    camera: 'Camera', wasm: 'Runs WebAssembly', gpu: 'Uses the GPU', ai: 'AI', api: 'Third-party API', network: 'Network',
    assets: 'Downloads extra files',
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
  let reviews = null;          // reviews.json — stars + comments, merged by PR
  let installedByAppId = {};   // appId -> fileId, so a listing can say "Open"
  let activeCat = 'All';
  let legacyDesktop = null;    // set to the release name when this visitor's
                               // Home Screen predates the store (see below)
  let ownerBuild = null;       // the BUILD NUMBER that will run what we install
  let ownerName = '';          // …said in words a player recognises
  let versions = null;         // version.json, once it has landed

  // version.json, fetched at most once. It answers both version questions this
  // page has: which release the default channel points at, and which edge build
  // each release was cut from — the map that turns an app's minBuild into
  // "release 0.9.6 and up" instead of a bare number nobody can act on.
  let versionsP = null;
  function versionJson() {
    if (!versionsP) {
      versionsP = fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' })
        .then((r) => r.json()).then((v) => (versions = v)).catch(() => null);
    }
    return versionsP;
  }

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
  //
  // The answer is also a BUILD NUMBER, via version.json's release→build map,
  // and that number is what the minBuild gate below compares against. It must
  // describe the computer that will RUN the app, not the page you are reading:
  // a visitor on release 0.9.5 is a build-1095 computer however new the store
  // page they are standing in happens to be.
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
    const v = await versionJson();
    return (v && v.current) || null;
  }

  // WHY THIS NO LONGER REDIRECTS INTO THE SNAPSHOT'S OWN STORE. It used to: a
  // release visitor was sent to /versions/<current>/store.html so the whole
  // install happened inside one build. That handed the listing to a FROZEN
  // store — code cut before the app it is being asked to describe existed. A
  // frozen store cannot know an app needs a build newer than itself; it read
  // the live catalog, said "Install — free", and installed something that
  // could never run. Freezing the store froze its ignorance along with it.
  //
  // Nothing was lost by staying here. The hand-off does not need this page to
  // live inside the snapshot: index.html's channel loader carries pathname AND
  // hash across its redirect, so /index.html#place=<id> lands in the pinned
  // build's desktop exactly as /versions/<rel>/index.html#place=<id> did, and
  // Open's /run.html#id=<id> the same way. What IS lost by redirecting is the
  // one thing this page must be able to do: tell the truth about a build that
  // is older than the app in front of it.
  //
  // The store.html probe stays, for the question it was always really asking —
  // does that build's desktop know what to do with #place= — since a build with
  // no store has no handler and cannot receive an install at all.
  async function resolveBuild() {
    if (FROZEN) {
      // A snapshot's build.js is stamped at the cut, so this IS that build.
      ownerBuild = Number(root.GIFOS_BUILD) || null;
      const v = (location.pathname.match(/\/versions\/([^/]+)\//) || [])[1] || '';
      ownerName = v ? 'release ' + v : 'this build';
      await versionJson();
      return;
    }
    const rel = await effectiveRelease();
    if (!rel) {                                                 // the root build owns this visitor
      // version.json FIRST, and the number comes from it before the global.
      //
      // WHY THE ORDER IS THE WHOLE FIX. store.html loads js/build.js with
      // `defer` and js/store.js without it, so this function runs while the
      // document is still parsing — before build.js has executed and before
      // window.GIFOS_BUILD exists. Reading the global here therefore read
      // `undefined` on the DEPLOYED edge build, ownerBuild became null, and
      // tooOld() is deliberately false when the build is unknown: the minBuild
      // gate was dead on edge for every app in the catalog. fps-simple
      // (minBuild 1285) installed onto a build that could not run it, which is
      // the exact half-install the gate exists to prevent. The release path
      // never showed it, because that number comes out of the builds map after
      // a fetch — by which time the deferred script has long since run.
      //
      // Awaiting version.json is also what makes the global safe to read: the
      // fetch is a task, so build.js has executed by the time we come back.
      // edgeBuild is the same number pages.yml bakes into build.js, so the two
      // agree by construction and either one alone is enough.
      const v = await versionJson();
      // 0 is a local checkout (build.js ships 0 and version.json's edgeBuild is
      // 0 until deploy). Unknown, not ancient — never gate on it.
      ownerBuild = Number(root.GIFOS_BUILD) || Number(v && v.edgeBuild) || null;
      ownerName = 'the edge build' + (ownerBuild ? ' (build ' + ownerBuild + ')' : '');
      return;
    }
    const v = await versionJson();
    ownerBuild = Number(v && v.builds && v.builds[rel]) || null;
    ownerName = 'release ' + rel + (ownerBuild ? ' (build ' + ownerBuild + ')' : '');
    let has = false;
    try {
      const r = await fetch('/versions/' + encodeURIComponent(rel) + '/store.html', { method: 'HEAD' });
      has = !!(r && r.ok);
    } catch (e) { /* offline: treat as "no", and say so rather than half-install */ }
    if (!has) legacyDesktop = rel;
  }

  // ---------- does this visitor's build meet the app's floor? ----------------
  // An app states the oldest build it runs on (manifest.minBuild, carried into
  // the catalog by scripts/build-app-catalog.mjs). Installing below it is not a
  // degraded experience, it is a dead icon — Offline Cheap Text LLM BitNet
  // needs the install-time asset tier no release has yet, so on 0.9.5 the
  // download completes, the weights have nowhere to go, and the app opens onto
  // nothing. A store that cannot say "not for this computer" has no business
  // saying "free".
  const needsBuild = (app) => Number(app && app.minBuild) || 0;
  // Deliberately false when ownerBuild is unknown: refusing an install because
  // we could not read version.json would be worse than the thing we're guarding
  // against. We block on knowledge, never on the absence of it.
  const tooOld = (app) => !!(ownerBuild && needsBuild(app) > ownerBuild);
  // Buttons that write to this computer are dead for either reason.
  const blocked = (app) => !!legacyDesktop || tooOld(app);

  // The oldest RELEASE that carries a given build, so a requirement can be
  // stated as something a player recognises. null when no release has it yet —
  // which is not an error but the normal state of a freshly built app, and the
  // state that has to be sayable out loud.
  function releaseWith(build) {
    const map = (versions && versions.builds) || {};
    let best = null;
    for (const rel of Object.keys(map)) {
      const b = Number(map[rel]);
      if (b >= build && (best === null || b < best.b)) best = { rel, b };
    }
    return best && best.rel;
  }

  // Exposed so the decision can be tested directly rather than inferred from
  // what the page happens to render — the same reason the channel loader
  // exports gifosPinTarget. That hook once vanished in a redesign and took
  // five version-pinning assertions with it, silently.
  GifOS.storeBuild = {
    effectiveRelease, resolveBuild, releaseWith,
    get legacy() { return legacyDesktop; },
    get build() { return ownerBuild; },
    get name() { return ownerName; },
    tooOld,
  };

  function legacyNotice() {
    return '<p class="err">Your Home Screen is running release ' + esc(legacyDesktop) +
      ', which was built before the App Store existed — it can’t receive an install yet. ' +
      'Update from <b>GifOS ▾ → Settings → Advanced → Version</b>, then come back.</p>';
  }

  // Said in full on the listing, where the decision is made. Two genuinely
  // different endings: an app whose floor some release already meets is one
  // update away, and an app whose floor NO release meets yet is only in the
  // edge build — telling that player to "update" would send them to a Version
  // panel where every release on offer is still too old.
  function tooOldNotice(app) {
    const need = needsBuild(app);
    const rel = releaseWith(need);
    return '<p class="err"><b>' + esc(app.name) + ' needs GifOS build ' + need + ' or newer.</b> ' +
      'Your Home Screen runs ' + esc(ownerName) + ', so this app can’t run there yet — ' +
      'installing it would leave you an icon that opens onto nothing. ' +
      (rel
        ? 'Move to release ' + esc(rel) + ' or later in <b>GifOS ▾ → Settings → Advanced → Version</b>, then come back.'
        : 'No release has it yet — it is only in the unreleased edge build. Pick <b>Edge build</b> in ' +
          '<b>GifOS ▾ → Settings → Advanced → Version</b>, or wait for the next release.') +
      '</p>';
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
    // basedOn.name is in the haystack so "uvr" / "claude of duty" still find
    // a port after Author is no longer GifOS.
    const hay = [app.name, app.shortName, app.tagline,
      (app.author || {}).name, (app.porter || {}).name, (app.basedOn || {}).name,
      (app.inspiredBy || {}).name, (app.inspiredBy || {}).by]
      .concat(app.tags || [], app.categories || []).join(' ').toLowerCase();
    return hay.includes(q);
  }

  function personLink(p) {
    if (!p || !p.name) return '';
    return p.url
      ? '<a href="' + esc(p.url) + '" rel="noopener">' + esc(p.name) + '</a>'
      : esc(p.name);
  }

  // The repo behind the catalog — where apps are submitted, fixed, and REVIEWED.
  const REPO = 'https://github.com/nwcnwc/gifos';
  // Bugs in a port go HERE, never to the upstream issue tracker. Hard-coded
  // on purpose: a listing.json field exists to be pointed at UVR's 1,500 issues.
  const PORT_BUGS = REPO + '/issues';

  // ---------- reviews ----------
  // Stars and comments are COMMITTED DATA, not a service: one JSON file per
  // reviewer at apps/<slug>/reviews/<github-username>.json in the repo, landed
  // by pull request and aggregated into /apps/reviews.json by
  // scripts/build-app-reviews.mjs. GitHub is the whole backend — the account
  // system, the spam bar (a PR costs effort and carries history) and the
  // moderation queue (review-by-merge). The store only ever READS the one
  // published file; with it missing or empty everything below renders fine.
  const HOW_REVIEWS = REPO + '/blob/main/apps/README.md#reviews';
  const revOf = (slug) => (reviews && reviews.apps && reviews.apps[slug]) || null;
  const starRow = (n) => { const f = Math.round(n); return '★★★★★'.slice(0, f) + '☆☆☆☆☆'.slice(f); };
  // GitHub's new-file page, prefilled: the right folder, a template that
  // already validates, today's date. The reviewer renames the file to their
  // own username (CI refuses anything else) and GitHub itself does the fork +
  // PR — the whole flow works from a phone browser, no clone, no tooling.
  function reviewHref(slug) {
    const tmpl = JSON.stringify({
      stars: 5,
      review: 'What you think of it — a sentence is plenty.',
      date: new Date().toISOString().slice(0, 10),
    }, null, 2) + '\n';
    return REPO + '/new/main/apps/' + encodeURIComponent(slug) + '/reviews' +
      '?filename=your-github-username.json&value=' + encodeURIComponent(tmpl);
  }
  function reviewsBlock(app) {
    const rv = revOf(app.slug);
    const items = (rv ? rv.reviews : []).map((r) =>
      '<div class="review">' +
        '<div class="revhead"><span class="revstars">' + starRow(r.stars) + '</span>' +
        '<a href="https://github.com/' + esc(r.user) + '" rel="noopener">@' + esc(r.user) + '</a>' +
        '<span class="revdate">' + esc(niceDate(r.date)) + '</span></div>' +
        '<p>' + esc(r.review) + '</p>' +
      '</div>').join('');
    return '<div class="reviews" id="reviews">' +
      '<h2>Reviews</h2>' +
      (rv
        ? '<p class="revsum"><span class="revstars">' + starRow(rv.stars) + '</span> ' +
          rv.stars + ' · ' + rv.count + (rv.count === 1 ? ' review' : ' reviews') + '</p>'
        : '<p class="revsum">No reviews yet — be the first.</p>') +
      items +
      '<div class="revactions">' +
        '<a class="btn ghost" id="write-review" href="' + esc(reviewHref(app.slug)) + '" target="_blank" rel="noopener">Write a review</a>' +
        '<span class="note">A review is a pull request: one small JSON file under your GitHub name, in the same repo the apps live in. ' +
        'The button prefills it — or ask your AI to do it for you (<a href="' + esc(HOW_REVIEWS) + '" rel="noopener">how reviews work</a>).</span>' +
      '</div>' +
    '</div>';
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
      // ONE action per card, labelled by the player's state with this app:
      // Install (not here yet), Update (here, catalog moved on), Open (here
      // and current). Open is a plain link to the running app; Install and
      // Update run the SAME install() the detail page uses, reporting into
      // the card. No detail visit needed, and — the cover rule — still no
      // GIF on the wire until the button is pressed: the click fetches the
      // app.json record (a few KB) and only install() fetches the GIF.
      const act = tooOld(a)
        ? '<button class="btn ghost act" disabled>Needs a newer GifOS</button>'
        : installed
          ? (outdated(a)
              ? '<button class="btn act" data-act="update">Update</button>'
              : '<a class="btn act" data-act="open" href="' + BASE + 'run.html#id=' + encodeURIComponent(installed.id) + ns('&db=') + '">Open</a>')
          : '<button class="btn act" data-act="install">Install</button>';
      // The card is a DIV, not a <button>: a button may not contain the action
      // button (interactive content inside interactive content), and browsers
      // flatten that in ways that swallow the inner click.
      return '<div class="card" role="link" tabindex="0" data-slug="' + esc(a.slug) + '">' +
        // loading="lazy": below-the-fold covers don't even fetch until scrolled to.
        '<img class="shot" src="' + esc(a.cover) + '" alt="" loading="lazy" decoding="async">' +
        '<div class="body">' +
          // The action sits in the title row, top-right — off the reading path
          // of the tagline and pills instead of dangling under them.
          '<div class="cardhead"><h3>' + esc(a.name) + '</h3>' + act + '</div>' +
          '<div class="tag">' + esc(a.tagline) + '</div>' +
          (a.basedOn ? '<div class="portof">port of ' + esc(a.basedOn.name) + '</div>' : '') +
          (a.inspiredBy ? '<div class="portof">inspired by ' + esc(a.inspiredBy.name) + '</div>' : '') +
          '<div class="meta">' +
            // The card says "needs a newer GifOS" INSTEAD of the size, because
            // the size is an invitation and this app is not yet installable
            // here. Learning it on the detail page only would mean finding out
            // one press before Install, already sold on it.
            (tooOld(a)
              ? '<span class="needs">Needs a newer GifOS</span>'
              : installed
                ? (outdated(a) ? '<span class="installed">↑ Update available</span>' : '<span class="installed">✓ Installed</span>')
                : '<span>' + esc(human(a.bytes)) + '</span>') +
            (revOf(a.slug)
              ? '<span class="stars" title="' + revOf(a.slug).count + ' review(s), by pull request">★ ' +
                revOf(a.slug).stars + ' (' + revOf(a.slug).count + ')</span>'
              : '') +
            (a.categories || []).map((c) => '<span class="pill">' + esc(c) + '</span>').join('') +
            // "Works offline": the manifest declares NO capabilities.network,
            // so nothing in this app ever reaches the internet (the runtime
            // enforces that; the pill just says it up front). Computed by the
            // catalog builder into the index as `offline`, never guessed here.
            (a.offline ? '<span class="pill offline" title="Declares no network access — runs entirely on this device">Works offline</span>' : '') +
            (a.optionalCount
              ? '<span class="pill" title="Extra files download the first time you open them, not at install">Extra files later</span>'
              : '') +
          '</div>' +
          '<span class="cnote"></span>' +
          '<div class="prog cprog" style="display:none"><i></i></div>' +
        '</div></div>';
    }).join('');
  }

  const browseUrl = () => (FROZEN ? BASE + 'store.html' + (ns('#db=') || '') : '/store' + (ns('#db=') || ''));
  // At the root the shareable pretty path IS the URL; frozen builds have no
  // pretty route into a snapshot, so they carry the slug in the hash.
  const detailUrl = (slug) => (FROZEN
    ? BASE + 'store.html#app=' + encodeURIComponent(slug) + ns('&db=')
    : '/store/' + encodeURIComponent(slug) + (ns('#db=') || ''));

  // The link you SEND SOMEONE, which is not the URL you happen to be reading.
  // Two things are deliberately dropped:
  //   - ns(), the alternate-database suffix. It is a local dev/test scope, and
  //     pushing a friend into your private database is never what "share" means.
  //   - the /versions/ prefix. From a frozen snapshot detailUrl points INTO that
  //     snapshot, and sharing it would pin someone to an old build forever. You
  //     are sharing the app, not the build you are standing on, so this is always
  //     the canonical root path.
  // Absolute, because a relative path is useless once it is pasted somewhere.
  // Origin-relative rather than hard-coded, so a custom deployment shares itself.
  // BOTH shared links go through the app's static go page (site/go/<slug>/,
  // scripts/build-go-pages.mjs): its og:image is the LISTING COVER, so X and
  // every other unfurler shows the app's own picture. Neither /store/<slug>
  // nor /?run=<slug> can do that — crawlers run no JS and read index.html's
  // generic og.png. The go page then sends a human on: ?store → the listing,
  // otherwise straight into the app.
  const shareUrl = (slug) => new URL('/go/' + encodeURIComponent(slug) + '/?store', location.href).href;
  // The DIRECT link: gifos.app/?run=<slug> (desktop.js handleRunParam) fetches
  // the App GIF, files it in Stolen Apps and runs it — one tap for someone who
  // has never seen GifOS, instead of listing → Install → Home Screen → Open.
  // In the QUERY, deliberately: released snapshots read ?run= from
  // location.search and the channel loader carries the query for exactly this.
  const runUrl = (slug) => new URL('/go/' + encodeURIComponent(slug) + '/', location.href).href;

  // Optional cash path (site/js/gifos-cash.js). Empty when pay.js was not
  // baked with a Payment Link — then the bar stays hidden and a listing
  // has no Feature button. Install is never gated on this.
  function paintPayBar() {
    const bar = $('paybar'), tip = $('tip');
    const link = GifOS.cash ? GifOS.cash.tipHref() : '';
    if (!bar) return;
    if (!link) {
      bar.hidden = true;
      if (tip) tip.removeAttribute('href');
      return;
    }
    bar.hidden = false;
    if (tip) tip.href = link;
  }

  function showBrowse(push) {
    detailEl.style.display = 'none';
    browseEl.style.display = '';
    document.title = 'App Store — GifOS';
    if (push) history.pushState({}, '', browseUrl());
    paintPayBar();
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
    // An app may RAISE its floor in a later version, so an already-installed
    // copy can be the thing that no longer fits. Update is gated as hard as
    // Install: swapping in bytes this computer can't run would break a working
    // icon, which is worse than leaving it on the old version.
    const stop = blocked(app) ? ' disabled' : '';
    // The button carries the reason whichever button it is. An app you already
    // own can become too old for your computer (it raised its floor, or you
    // moved to an older build), and "Install again", greyed out and silent, is
    // the same dead end as a silent "Install — free".
    const why = (normal) => (tooOld(app) ? 'Needs a newer GifOS' : normal);
    const feature = GifOS.cash ? GifOS.cash.featureHref(app.slug) : '';
    const donate = app.basedOn && app.basedOn.donate;
    detailEl.innerHTML =
      '<button class="back" id="back">← All apps</button>' +
      '<div class="head"><div>' +
        '<h1>' + esc(app.name) + '</h1>' +
        '<div class="sub">' + esc(app.tagline) + '</div>' +
        (app.basedOn
          ? '<div class="port">' +
              (app.basedOn.blessed ? '' : '<span class="pill">Unofficial port</span> ') +
              'of ' + personLink({ name: app.basedOn.name, url: app.basedOn.url }) +
              '. Bugs in this port go to <a href="' + esc(PORT_BUGS) + '" rel="noopener">GifOS</a>, not ' +
              esc(app.basedOn.name) + '.' +
            '</div>'
          : '') +
      '</div></div>' +
      // Again: cover.jpg. The GIF is not fetched until Install.
      '<img class="hero" src="' + esc(app.cover) + '" alt="' + esc(app.name) + ' screenshot" decoding="async">' +
      '<div class="actions">' +
        (installedId
          ? (canUpdate ? '<button class="btn" id="update"' + stop + '>' + why('Update — keeps your data') + '</button>' : '') +
            '<a class="btn' + (canUpdate ? ' ghost' : '') + '" href="' + BASE + 'run.html#id=' + encodeURIComponent(installedId) + ns('&db=') + '">Open</a>' +
            '<button class="btn ghost" id="install"' + stop + '>' + why('Install again') + '</button>'
          : '<button class="btn" id="install"' + stop + '>' + why('Install — free') + '</button>') +
        // Share is NEVER gated by the build floor. A listing this computer
        // cannot install from is still worth sending to someone whose computer
        // can — that is most of the point of having a link.
        '<button class="btn ghost" id="share" data-url="' + esc(shareUrl(app.slug)) + '" data-run="' + esc(runUrl(app.slug)) + '">Share</button>' +
        // Feature is optional cash, never a gate. A listing you cannot pay
        // for is the normal state; a listing you can still installs free.
        (feature
          ? '<a class="btn ghost" id="feature" href="' + esc(feature) + '" target="_blank" rel="noopener">Feature this listing</a>'
          : '') +
        '<span class="note" id="note">' + esc(human(app.bytes)) + ' download' +
          // An app whose weights arrive separately is TWO downloads, and the
          // second one dwarfs the first. Say so before the press, not after.
          (app.download ? ' + ' + esc(human(app.download)) + ' model' : '') +
          (app.optionalCount ? ' · extra files later' : '') + '</span>' +
        '<span class="prog" id="prog" style="display:none"><i></i></span>' +
      '</div>' +
      // The SECOND download, with its own bar. It used to have none: the app
      // GIF's bar finished at 100% and simply stayed there through an 806 MB
      // model, so the one part of the install worth watching was the part with
      // no progress at all. Two bars, because they are two files — the first
      // one staying full is then honest rather than misleading.
      '<div class="dl" id="dl2" style="display:none">' +
        '<span class="note" id="note2"></span>' +
        '<span class="prog" id="prog2"><i></i></span>' +
      '</div>' +
      // What got copied, shown rather than promised. A button that says "copied"
      // and nothing else is unverifiable, and on the browsers with no clipboard
      // API at all this row IS the share: the link, selectable, ready to copy.
      // WHICH link? A store link is a listing to read; a run link opens the app
      // in one tap. Sending the listing to someone who just wants to play is
      // four screens of clicks — so Share asks, with the direct link first.
      '<div class="sharepick" id="sharepick" style="display:none">' +
        '<span class="note">Share which link?</span>' +
        '<button class="btn" id="share-app">Open the app — one tap</button>' +
        '<button class="btn ghost" id="share-store">Store listing</button>' +
      '</div>' +
      '<div class="sharebox" id="sharebox" style="display:none">' +
        '<label class="note" for="shareurl">Send this link:</label>' +
        '<input id="shareurl" readonly value="' + esc(shareUrl(app.slug)) + '">' +
      '</div>' +
      (legacyDesktop ? legacyNotice() : '') +
      (tooOld(app) ? tooOldNotice(app) : '') +
      '<div class="err" id="err" style="display:none"></div>' +
      '<div class="desc">' + esc(app.description) + '</div>' +
      '<dl class="facts">' +
        fact('Version', esc(app.version)) +
        fact('Author', personLink(app.author)) +
        (app.porter ? fact('Ported by', personLink(app.porter)) : '') +
        (app.basedOn
          ? fact('Based on', personLink({ name: app.basedOn.name, url: app.basedOn.url }) +
              (app.basedOn.blessed ? '' : ' <span class="pill">Unofficial port</span>'))
          : '') +
        (app.inspiredBy
          ? fact('Inspired by', personLink({ name: app.inspiredBy.name, url: app.inspiredBy.url }) +
              (app.inspiredBy.by ? ' by ' + esc(app.inspiredBy.by) : ''))
          : '') +
        fact('Released', esc(niceDate(app.releaseDate))) +
        (app.updated && app.updated !== app.releaseDate ? fact('Updated', esc(niceDate(app.updated))) : '') +
        fact('Category', (app.categories || []).map((c) => '<span class="pill">' + esc(c) + '</span>').join(' ')) +
        fact('Size', esc(human(app.bytes))) +
        (app.download
          ? fact('Downloads at install',
              esc(human(app.download)) + ' more, fetched when you install — not inside the app file.')
          : '') +
        (app.optionalCount
          ? fact('Downloads when you pick them',
              (app.optionalCount === 1 ? '1 extra file' : app.optionalCount + ' extra files') +
              (app.optionalDownload ? ', about ' + esc(human(app.optionalDownload)) + ' if you take every one' : '') +
              '. None of them download at install. Each one arrives the first time you open it, then stays on this device.')
          : '') +
        // Stated on EVERY listing, not only the ones that fail here. What an
        // app requires is a fact about the app, the same as its size — a
        // reader on a new computer still deserves to know before they pass the
        // link to someone on an old one.
        fact('Requires', needsBuild(app)
          ? 'GifOS build ' + needsBuild(app) + ' or newer' +
            (releaseWith(needsBuild(app))
              ? ' <span class="pill">release ' + esc(releaseWith(needsBuild(app))) + ' and up</span>'
              : ' <span class="pill">no release yet — edge build</span>')
          : 'not stated') +
        fact('License', esc(app.license) + (app.copyright ? ' · ' + esc(app.copyright) : '')) +
        fact('Signature', app.signature && app.signature.id
          ? '✓ signed by ' + esc(app.signature.id) : 'not signed') +
        (caps.length ? fact('Abilities', '<span class="caps">' + caps.map((c) => '<span class="pill">' + esc(c) + '</span>').join(' ') + '</span>') : '') +
        (app.homepage ? fact(app.basedOn ? 'This port' : 'Source',
          '<a href="' + esc(app.homepage) + '" rel="noopener">the code that built it</a>') : '') +
        // Donate is THEIRS (basedOn.donate), a fact among the other outbound
        // links — not an Install-row button next to Feature this listing.
        (donate
          ? fact('Donate', '<a id="donate" href="' + esc(donate) + '" rel="noopener">' +
              esc(app.basedOn.name) + '</a>')
          : '') +
      '</dl>' +
      reviewsBlock(app);

    $('back').onclick = () => showBrowse(true);
    // Bound even when the floor is unmet, and the button left disabled beside
    // it. The two are not the same statement: `disabled` is how the player is
    // told, install()'s own refusal is what actually holds. Leaving the handler
    // off instead would make that refusal unreachable — dead code pretending to
    // be a guard, which is the worse of the two ways to be wrong. A legacy
    // desktop is different: it cannot receive ANY install, so nothing here is
    // wired at all.
    if (!legacyDesktop) $('install').onclick = () => install(app);
    const up = $('update');
    if (up && !legacyDesktop) up.onclick = () => install(app, inst);
    wireShare(app);
  }

  // ---------- share ----------
  // Three tiers, best first, and every one of them ends with the link somewhere
  // the person can actually use:
  //   1. navigator.share — the OS share sheet. On a phone this is the whole
  //      feature: straight into Messages/WhatsApp/mail.
  //   2. clipboard.writeText — copied, and the link revealed so it is checkable.
  //   3. neither (older browsers, or a non-secure origin, where BOTH of the
  //      above are undefined) — reveal and select the link. Never a dead button.
  function wireShare(app) {
    const btn = $('share');
    if (!btn) return;
    const pick = $('sharepick');
    const box = $('sharebox');
    const field = $('shareurl');
    const reveal = (select) => {
      box.style.display = '';
      if (select) { try { field.focus(); field.select(); } catch (e) { /* no selection API */ } };
    };
    const said = (msg) => {
      btn.textContent = msg;
      setTimeout(() => { btn.textContent = 'Share'; }, 2400);
    };
    // Share opens the question; picking an answer is what shares. Each pick
    // is its own click, so navigator.share still runs inside a user gesture.
    btn.onclick = () => {
      pick.style.display = pick.style.display === 'none' ? '' : 'none';
    };
    const share = (url, what) => async () => {
      pick.style.display = 'none';
      field.value = url;
      // The share sheet wants a real title and text — a bare URL in a message
      // thread says nothing about what it is.
      if (navigator.share) {
        try {
          await navigator.share({ title: app.name, text: what + ': ' + (app.tagline || app.name), url });
          return;
        } catch (e) {
          // AbortError is the person closing the sheet, which is not a failure
          // and must not turn into an error or a fallback they did not ask for.
          if (e && e.name === 'AbortError') return;
          // Anything else (no permission, unsupported target) falls through.
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          said('✓ Link copied');
          reveal(false);
          return;
        } catch (e) { /* denied or no focus — the row below still works */ }
      }
      reveal(true);
      said('Copy this link');
    };
    $('share-app').onclick = share(btn.dataset.run, 'Open ' + app.name);
    $('share-store').onclick = share(btn.dataset.url, app.name + ' on the GifOS App Store');
  }
  const fact = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';

  // ---------- install ----------
  // The ONE moment the App GIF crosses the wire. With `into` (the installed
  // record), this is an UPDATE: the fresh bytes land on the SAME fileId, so
  // the icon, its placement and the app's saved data (all keyed by fileId)
  // survive — the code is the only thing that changes. This is exactly the
  // swap the seeded-app reseed does; store installs finally get it too.
  // The install record: WHEN this copy was installed and WHICH catalog entry
  // it came from. It deliberately carries NO author / porter / basedOn — who
  // made an app is credits.json INSIDE the GIF, under the gifos.app seal
  // (scripts/app-credits.mjs), so a desktop record can never say otherwise.
  // gifos-help.js prints installedAt under the sealed credits.
  function storeSnapshot(app) {
    return {
      slug: app.slug || null, appId: app.appId || null, version: app.version || '',
      sha256: app.sha256 || null, installedAt: new Date().toISOString(),
    };
  }

  // `ui` is where this install reports: the detail page's own elements by
  // default, or a CARD's (see renderGrid) so a listing can be installed,
  // updated or opened straight from the grid without a detail visit. `after`
  // runs when an UPDATE finishes (a fresh install leaves for the Home Screen).
  async function install(app, into, ui) {
    ui = ui || {};
    const btn = ui.btn || $(into ? 'update' : 'install'), note = ui.note || $('note'), prog = ui.prog || $('prog'), err = ui.err || $('err');
    const fail = (msg) => { err.style.display = ''; err.textContent = msg; btn.disabled = false; prog.style.display = 'none'; };
    // The floor, enforced where the download actually happens rather than only
    // where the button is drawn. A disabled attribute is a rendering decision
    // and rendering decisions drift; the promise being kept here is that an App
    // GIF never crosses the wire onto a computer that cannot run it, which is
    // the same promise the cover rule makes and is measured the same way — by
    // counting requests in e2e-app-store.js.
    if (tooOld(app)) {
      err.style.display = ''; err.innerHTML = tooOldNotice(app);
      btn.disabled = true;
      return;
    }
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
      // Detail-page elements; absent when a CARD drove this install, in which
      // case the asset download reports through the card's note instead.
      const dl2 = $('dl2'), note2 = $('note2') || note, bar2 = $('prog2') || prog;
      try {
        const cache = A.assetCache(store, fid);
        const need = await A.missing(archive.files, m, cache, { requiredOnly: true });
        if (!need.length) return;
        // The first line has finished its job; let it say so, so the moving
        // line below is unambiguously the one still working.
        note.textContent = 'App file ✓';
        if (dl2) dl2.style.display = '';
        bar2.firstChild.style.width = '0';
        await A.ensure(archive.files, m, (s, frac) => {
          note2.textContent = s;
          // A phase with nothing to count (verifying a gigabyte, or a server
          // that never declared a length) says so by MOVING — an indeterminate
          // sweep — rather than parking at a number it cannot justify.
          if (frac == null) { bar2.classList.add('busy'); bar2.firstChild.style.width = '100%'; }
          else { bar2.classList.remove('busy'); bar2.firstChild.style.width = Math.round(frac * 100) + '%'; }
        }, cache);
        bar2.classList.remove('busy');
        bar2.firstChild.style.width = '100%';
        note2.textContent = 'Model ready ✓';
      } catch (e) {
        if (bar2) bar2.classList.remove('busy');
        if (dl2) dl2.style.display = '';
        if (note2) note2.textContent = '⚠ ' + (e.message || e) + ' — the app will retry when you open it.';
      }
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
          storeSha: app.sha256 || null, storeMeta: storeSnapshot(app) });
        await rememberInstall(into.id);
        await fetchAssets(into.id);
        await refreshInstalled();
        if (ui.after) { ui.after(); return; }
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
        storeSha: app.sha256 || null, storeMeta: storeSnapshot(app) });
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
    // Settle the build question before anything renders — every card and every
    // Install button is drawn against it.
    await resolveBuild();
    try {
      const r = await fetch('/apps/index.json', { cache: 'no-cache' });
      catalog = await r.json();
    } catch (e) {
      $('grid').innerHTML = '<p class="err">The catalog didn’t load. Check your connection and reload.</p>';
      return;
    }
    // Reviews are decoration on the catalog, never a dependency: a store that
    // can't load them still browses, installs and shares everything.
    try {
      const rr = await fetch('/apps/reviews.json', { cache: 'no-cache' });
      if (rr.ok) reviews = await rr.json();
    } catch (e) { /* no stars painted, nothing else changes */ }
    await refreshInstalled();
    paintPayBar();
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
      if (!c) return;
      const a = e.target.closest('.act');
      if (!a) { showDetail(c.dataset.slug, true); return; }
      if (a.dataset.act === 'open') return;        // a plain link: let it navigate
      e.preventDefault();
      cardInstall(c, a.dataset.act === 'update');
    });
    $('grid').addEventListener('keydown', (e) => {
      const c = e.target.closest('.card');
      if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showDetail(c.dataset.slug, true); }
    });
    // Install / Update from the grid: fetch the listing's record (app.json —
    // gif path, signature, assets), then the ordinary install() reporting into
    // this card. An UPDATE re-renders the grid so the button turns into Open.
    async function cardInstall(card, update) {
      const btn = card.querySelector('.act'), note = card.querySelector('.cnote'), prog = card.querySelector('.cprog');
      btn.disabled = true; note.textContent = 'Loading…'; note.classList.remove('err');
      let app = null;
      try {
        const r = await fetch('/apps/' + encodeURIComponent(card.dataset.slug) + '/app.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('listing returned ' + r.status);
        app = await r.json();
      } catch (e) { note.classList.add('err'); note.textContent = 'Couldn’t load this listing — ' + (e.message || e); btn.disabled = false; return; }
      const live = installedOf(app);
      await install(app, update && live ? { id: live.id, name: live.name } : null, {
        btn, note, prog, err: note,
        after: () => { renderGrid(); },
      });
    }
    root.addEventListener('popstate', () => route(false));

    // A deep link arrives from 404.html as #app=<slug>; rewrite it to the
    // pretty form so the address bar shows what you'd share.
    const slug = slugFromUrl();
    if (slug && !/^\/store\//.test(location.pathname)) history.replaceState({ slug }, '', detailUrl(slug));
    await route(false);
  })();
})(typeof window !== 'undefined' ? window : globalThis);
