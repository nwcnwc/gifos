/*
 * vendor.mjs — rebuild vendor/ from the pinned signature_pad release.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/signature-pad/vendor.mjs
 *
 * WHAT IT PRODUCES. The classic UMD build (window.SignaturePad) plus the MIT
 * notice. Dist is published on npm, not on the git tag, so the JS comes from
 * the npm tarball and the licence from the matching GitHub tag.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

// Moving the pin is a deliberate act: bump TAG + COMMIT + both SHA256s together.
const TAG = 'v5.1.4';
const VERSION = '5.1.4';
const COMMIT = '769b6438572ea927d57eddd960795843381701fe';
const UMD_URL = 'https://cdn.jsdelivr.net/npm/signature_pad@' + VERSION + '/dist/signature_pad.umd.js';
const LICENSE_URL = 'https://raw.githubusercontent.com/szimek/signature_pad/' + TAG + '/LICENSE';
const UMD_SHA256 = 'bc960e2d259722536d31a7eef36a85ad4f78c1bfc495e6025f5e0c3c954aaa65';
const LICENSE_SHA256 = '7d461320b6c69581bd19cc9402aa9a5e33ad826ed2f977d03bcb884e0cc6ce54';

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
  return Buffer.from(await res.arrayBuffer());
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

mkdirSync(out, { recursive: true });

const umdBuf = await get(UMD_URL);
const umdHex = sha(umdBuf);
if (umdHex !== UMD_SHA256) {
  throw new Error('signature_pad.umd.js sha256 ' + umdHex + ' ≠ pin ' + UMD_SHA256 + ' — move the pin deliberately.');
}
let umd = umdBuf.toString('utf8');
// The npm file points at a .map that is not packed. A sandboxed tab must not
// even try to fetch it.
umd = umd.replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
if (/<\/script/i.test(umd)) throw new Error('UMD contains </script — cannot inline safely.');
if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(umd)) {
  throw new Error('UMD now uses ESM syntax — classic scripts only.');
}
if (umd.includes('fetch(') || umd.includes('XMLHttpRequest') || umd.includes('WebSocket')) {
  throw new Error('UMD has a network call');
}
if (!umd.includes('g["SignaturePad"]') && !umd.includes("g['SignaturePad']")) {
  throw new Error('UMD does not attach SignaturePad on the global');
}
if (!umd.includes('toDataURL') || !umd.includes('fromData') || !umd.includes('isEmpty')) {
  throw new Error('UMD is missing the pad API this app uses');
}

const licBuf = await get(LICENSE_URL);
const licHex = sha(licBuf);
if (licHex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + licHex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}
const license = licBuf.toString('utf8');
if (!license.includes('Szymon Nowak') || !license.includes('MIT License')) {
  throw new Error('LICENSE is not Szymon Nowak\'s MIT notice');
}

writeFileSync(join(out, 'signature_pad.js'), umd);
writeFileSync(join(out, 'COPYING-signature_pad.txt'), license);

const umdOutHex = sha(umd);
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/signature-pad/vendor.mjs.

upstream: https://github.com/szimek/signature_pad
tag:      ${TAG}
commit:   ${COMMIT}
npm:      signature_pad@${VERSION}
license:  MIT, Szymon Nowak / szimek (COPYING-signature_pad.txt)

signature_pad.js is the published UMD build (window.SignaturePad), with the
sourceMappingURL comment stripped so the sandbox never looks for a .map.

sha256:
  npm umd (before strip)  ${UMD_SHA256}
  signature_pad.js        ${umdOutHex}
  COPYING                 ${LICENSE_SHA256}

The notice travels INSIDE the GIF as COPYING-signature_pad.txt.
`);

console.log('wrote apps/signature-pad/vendor/ — UMD', VERSION, '(' + COMMIT.slice(0, 10) + '),', Buffer.byteLength(umd), 'bytes');

