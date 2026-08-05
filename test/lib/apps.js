/*
 * apps.js — where a certified app's built GIF lives, in ONE place.
 *
 * The built App GIFs used to sit at apps/<slug>.gif. They now live inside the
 * publish boundary, at site/apps/<slug>/<slug>.gif, because Pages ships only
 * site/ and the App Store has to be able to download them. Six suites had that
 * path spelled out by hand, and one of them (e2e-wasm) SKIPS when the file is
 * missing — a moved artifact would have turned a real engine test into a green
 * no-op. So the path is resolved here, once, and a miss THROWS with what it
 * looked for rather than skipping.
 *
 *   const { appGif } = require('../lib/apps');
 *   const bytes = fs.readFileSync(appGif('fluence'));
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// The built GIF for a catalog slug. Throws if it isn't built.
function appGif(slug) {
  const p = path.join(ROOT, 'site', 'apps', slug, slug + '.gif');
  if (!fs.existsSync(p)) {
    throw new Error('app GIF not built: ' + path.relative(ROOT, p) +
      ' — build it with node apps/' + slug + '/build.mjs');
  }
  return p;
}

// Same, but for a caller that legitimately wants to report "not built" itself.
function appGifIfBuilt(slug) {
  const p = path.join(ROOT, 'site', 'apps', slug, slug + '.gif');
  return fs.existsSync(p) ? p : null;
}

/*
 * The seeded SYSTEM launchers, READ FROM THE SITE SOURCE so this cannot rot.
 *
 * A system app's runApp is a page NAVIGATION (runtime.js SYSTEM_PAGES:
 * meet/video -> run.html, broadcast -> run.html#bc=1, store -> store.html), NOT
 * an app mounted into '#appmount iframe'. So a suite that wants "a default app
 * I can mount" must skip them, or it waits 30s for an iframe on a page that has
 * navigated away and dies with ZERO assertions — a DEAD suite, the most
 * dangerous colour there is.
 *
 * This list was hand-kept twice and went stale twice, both times silently and
 * both times only *sometimes* — allFiles() enumeration order decides whether
 * find() hands you a mountable app or a launcher, so it reads as a flake:
 *   - 0584279 (2026-08-03 11:31) added 'appstore' to four call sites, after
 *     e2e-meeting-app flaked on the seeded App Store launcher.
 *   - 45233de (2026-08-03 15:32) — FOUR HOURS LATER — seeded Broadcast, and
 *     every one of those freshly-fixed lists was stale again the same day.
 * It is derived now, so seeding a fifth launcher updates the tests by itself.
 */
function systemAppIds() {
  const src = fs.readFileSync(path.join(ROOT, 'site', 'js', 'sample-apps.js'), 'utf8');
  const re = /manifest\(\s*'([^']+)'[^;]*?\{[^{}]*\bsystem\s*:/g;
  const ids = [];
  let m;
  while ((m = re.exec(src))) ids.push(m[1]);
  // A parse that finds NOTHING must not read as "no system apps" — that is the
  // silent-empty-list failure this helper exists to prevent. Refuse instead.
  if (!ids.length) {
    throw new Error('test/lib/apps.js: found no system launchers in site/js/sample-apps.js — ' +
      'the manifest(...{system:...}) shape changed and this parse needs updating.');
  }
  // 'video' is a pre-rename seed's appId: it is not minted any more, so it will
  // never appear in the source, but desktops seeded before the rename still
  // carry it and it still resolves to a SYSTEM page.
  if (!ids.includes('video')) ids.push('video');
  return ids;
}

module.exports = { appGif, appGifIfBuilt, systemAppIds, ROOT };
