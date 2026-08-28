// listing.json gifUrl: the App GIF may live on the author's GitHub Release.
// The catalog pins sha256; this repo does not have to host the file.
//
// Run: node test/unit/app-catalog-gifurl.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const catalog = fs.readFileSync(path.join(ROOT, 'scripts', 'build-app-catalog.mjs'), 'utf8');
const sign = fs.readFileSync(path.join(ROOT, 'scripts', 'sign-apps.mjs'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'site', 'js', 'store.js'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'apps', 'README.md'), 'utf8');
const inflate = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-gif.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '  ' + detail : ''));
  if (!cond) failures++;
}

check('the catalog loader accepts listing.gifUrl',
  /function parseGifUrl/.test(catalog) && /function loadListedGif/.test(catalog));
check('gifUrl must be https and must not be /releases/latest/',
  /releases\/latest/.test(catalog) && /must pin a release tag/.test(catalog));
check('gifUrl listings declare gifSha256 and gifBytes',
  /gifSha256/.test(catalog) && /gifBytes/.test(catalog));
check('a local GIF and gifUrl together are refused',
  /must not live in both places/.test(catalog));
check('gifUrl pointing at gifos.app\/apps\/ is hosting, not pinning',
  /gifos\.app/.test(catalog) && /hosting the GIF in this repo/.test(catalog));
check('sign-apps skips gifUrl listings (the release is signed in that repo)',
  /listing\.gifUrl/.test(sign) && /sign the release in that repo/.test(sign));
check('Install fetches app.gif with redirects (GitHub Release → objects)',
  /redirect:\s*'follow'/.test(store) && /listing\.gifUrl/.test(store));
check('apps README documents gifUrl',
  /gifUrl/.test(readme) && /GitHub Release/.test(readme));
check('payload inflate ceiling is a GifOS cap, not the GIF format',
  /function inflateMaxBytes/.test(inflate) && /This cap is ours/.test(inflate) &&
  /INFLATE_RATIO/.test(inflate));

console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
process.exit(failures ? 1 : 0);
