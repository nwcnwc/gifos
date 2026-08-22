// Optional vs required install-time assets (gifos-assets.js).
//
// Required pins download at install and on boot. Optional pins do not —
// gifos.assets(path) fetches that one row. This file guards the FILTER, not
// the network: list() / missing() decide what would be fetched. A regression
// that treated optional as required would make every installer pay for models
// they never pick (the vocal-remover karaoke weight, and anything after it).
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const sandbox = { window: { crypto: { subtle: {} } }, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-assets.js'), 'utf8'),
  sandbox, { filename: 'gifos-assets.js' });
const A = sandbox.window.GifOS.assets;

let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d && !c ? '  ' + d : ''));
  if (!c) failures++;
};

const sha = 'a'.repeat(64);
const req = { url: 'https://example.com/must.bin', sha256: sha, path: 'must.bin', bytes: 9e7 };
const opt = { url: 'https://example.com/maybe.bin', sha256: sha, path: 'maybe.bin', bytes: 5e7, optional: true };
const m = { assets: [req, opt] };

const listed = A.list(m);
check('list() keeps both pins', listed.length === 2);
check('list() marks optional honestly', listed[0].optional === false && listed[1].optional === true);

A.missing({}, m, null).then((all) => {
  check('missing() without requiredOnly wants both', all.length === 2, String(all.length));
  return A.missing({}, m, null, { requiredOnly: true });
}).then((reqOnly) => {
  check('missing({requiredOnly}) skips the optional pin',
    reqOnly.length === 1 && reqOnly[0].path === 'must.bin',
    JSON.stringify(reqOnly.map((a) => a.path)));
  return A.missing({}, { assets: [opt] }, null, { requiredOnly: true });
}).then((none) => {
  check('an app of only optional pins backfills nothing at boot', none.length === 0);
  check('an unknown path is not in the list (ensurePath must refuse it)',
    !A.list(m).some((a) => a.path === 'other.bin'));
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
}).catch((e) => {
  console.log('FAIL — ' + e);
  process.exit(1);
});
