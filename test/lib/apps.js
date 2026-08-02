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

module.exports = { appGif, appGifIfBuilt, ROOT };
