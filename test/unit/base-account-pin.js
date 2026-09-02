/*
 * THE VENDORED WALLET SDK IS PINNED BY HASH, NOT BY A COMMENT.
 *
 * site/js/vendor/base-account.min.js (@base-org/account) is the largest
 * script that ever runs in the trusted origin: it opens the Coinbase popup,
 * talks to the wallet RPCs and keeps a store in localStorage. Its sha256 was
 * written in a comment in gifos-paywallet.js and checked by nobody — a bad
 * merge or a silent "upgrade" would have shipped unnoticed. nacl-fast.js has
 * had this guard since it was vendored (test/unit/ed-fallback.js); this is
 * the same guard for the same reason.
 *
 * Bumping the SDK is a deliberate act: change the vendored file, update the
 * comment in gifos-paywallet.js, and the expected hash here, in one commit
 * that says which upstream release it is.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const VENDOR = path.join(ROOT, 'site', 'js', 'vendor', 'base-account.min.js');
const WALLET = path.join(ROOT, 'site', 'js', 'gifos-paywallet.js');

// @base-org/account 2.5.10 UMD, one raw 0x19 byte escaped (see the comment
// in gifos-paywallet.js).
const EXPECTED = 'efae551685f53a43a2ec418c00e29bf0772dd8a1c4329849cc7f5039503ceef9';

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const bytes = fs.readFileSync(VENDOR);
const actual = crypto.createHash('sha256').update(bytes).digest('hex');
check('the vendored Base Account SDK is byte-identical to the pinned build', actual === EXPECTED, { actual, expected: EXPECTED });
check('the pin in gifos-paywallet.js names the same hash', fs.readFileSync(WALLET, 'utf8').indexOf(EXPECTED) >= 0);
check('the SDK announces the pinned package version', /@base-org\/account/.test(bytes.toString('utf8', 0, 4096)) || bytes.indexOf('2.5.10') >= 0);
check('the SDK is loaded from this origin only (no CDN)', !/https?:\/\/[^"']*base-account/.test(fs.readFileSync(WALLET, 'utf8')));

if (failures) { console.log('\n' + failures + ' failure(s)'); process.exit(1); }
console.log('\nall ok');
