/*
 * vendor.mjs — rebuild vendor/ from the pinned @simonwep/pickr npm tarball
 * (same commit as GitHub tag v1.10.1).
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/pickr/vendor.mjs
 *
 * WHAT IT PRODUCES. The published UMD (window.Pickr) plus the classic theme
 * CSS and the MIT notice. GifOS inlines <script src> and DROPS type="module",
 * so the .mjs build cannot ride in as-is.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
mkdirSync(out, { recursive: true });

// Moving the pin is a deliberate act: bump TAG + COMMIT + SHA256s together.
const TAG = '1.10.1';
const COMMIT = 'c5bb5f8de703e8e43f0b96efa4c2293475d9b9df';
const TARBALL = 'https://registry.npmjs.org/@simonwep/pickr/-/pickr-' + TAG + '.tgz';
const JS_SHA256 = 'e59ce1247c7593423ec24ca0c7187deaa64b60915886295a76e0ec0f7bfc32ea';
const CSS_SHA256 = 'e8215c4d69606947bb17c4d135649f93d1ebfbe22d9d4da6dc3abbf6cb78a287';
const LICENSE_SHA256 = '7129bc74b781d3db2979d4617940b00e75885914b8d636a3155a64e57481e5e5';

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

const tmp = mkdtempSync(join(tmpdir(), 'pickr-'));
const tgz = join(tmp, 'pickr.tgz');

const res = await fetch(TARBALL);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + TARBALL);
writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
execFileSync('tar', ['-xzf', tgz, '-C', tmp], { timeout: 30000 });

const jsBuf = readFileSync(join(tmp, 'package', 'dist', 'pickr.min.js'));
const cssBuf = readFileSync(join(tmp, 'package', 'dist', 'themes', 'classic.min.css'));
const licBuf = readFileSync(join(tmp, 'package', 'LICENSE'));
const jsHex = sha256(jsBuf);
const cssHex = sha256(cssBuf);
const licHex = sha256(licBuf);
if (jsHex !== JS_SHA256) {
  throw new Error('pickr.min.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256 + ' — move the pin deliberately.');
}
if (cssHex !== CSS_SHA256) {
  throw new Error('classic.min.css sha256 ' + cssHex + ' ≠ pin ' + CSS_SHA256 + ' — move the pin deliberately.');
}
if (licHex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + licHex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}

let js = jsBuf.toString('utf8');
js = js.replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
if (/<\/script/i.test(js)) throw new Error('pickr.min.js contains </script — cannot inline safely.');
if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(js)) {
  throw new Error('pickr.min.js uses ESM — classic scripts only.');
}
if (js.includes('fetch(') || js.includes('XMLHttpRequest') || js.includes('WebSocket')) {
  throw new Error('pickr.min.js has a network call');
}
if (!js.includes('e.Pickr=t()') && !js.includes('e.Pickr = t()')) {
  throw new Error('UMD does not attach Pickr on the global');
}
if (!js.includes('static create') || !js.includes('setColor') || !js.includes('toHEXA')) {
  throw new Error('UMD is missing the Pickr API this app uses');
}
if (!js.startsWith('/*! Pickr ' + TAG)) {
  throw new Error('pickr.min.js banner is not v' + TAG);
}

const css = cssBuf.toString('utf8');
if (!css.startsWith('/*! Pickr ' + TAG)) {
  throw new Error('classic.min.css banner is not v' + TAG);
}
if (/@import/i.test(css)) throw new Error('classic.min.css has @import — nothing is fetched');
if (/url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('classic.min.css fetches a remote url()');
}
if (/@font-face/i.test(css)) throw new Error('classic.min.css asks for a font');

const license = licBuf.toString('utf8');
if (!license.includes('Simon Reinisch') || !license.includes('MIT License')) {
  throw new Error('LICENSE is not Simon Reinisch\'s MIT notice');
}

writeFileSync(join(out, 'pickr.js'), js);
writeFileSync(join(out, 'pickr.css'), cssBuf);
writeFileSync(join(out, 'COPYING-pickr.txt'), licBuf);

const jsOutHex = sha256(Buffer.from(js));
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/pickr/vendor.mjs.

upstream: https://github.com/simonwep/pickr
tag:      v${TAG}
commit:   ${COMMIT}
npm:      @simonwep/pickr@${TAG}
license:  MIT, Simon Reinisch / simonwep (COPYING-pickr.txt)

pickr.js is the published UMD build (window.Pickr), with the
sourceMappingURL comment stripped so the sandbox never looks for a .map.
pickr.css is dist/themes/classic.min.css (the classic theme).

sha256:
  npm umd (before strip)  ${JS_SHA256}
  pickr.js                ${jsOutHex}
  pickr.css               ${CSS_SHA256}
  COPYING                 ${LICENSE_SHA256}

The notice travels INSIDE the GIF as COPYING-pickr.txt.
`);

console.log('wrote apps/pickr/vendor/ — UMD', TAG, '(' + COMMIT.slice(0, 10) + '),', Buffer.byteLength(js), 'bytes + classic CSS');
rmSync(tmp, { recursive: true, force: true });
