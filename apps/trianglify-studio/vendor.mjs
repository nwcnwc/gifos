/*
 * vendor.mjs — rebuild vendor/trianglify.js and COPYING from the pinned
 * trianglify@4.1.1 npm tarball (same commit as GitHub tag v4.1.1).
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/trianglify-studio/vendor.mjs
 *
 * WHAT IT PRODUCES. The published classic UMD IIFE that sets window.trianglify
 * (chroma-js + delaunator inlined). GifOS inlines <script src> and DROPS
 * type="module", so the ESM source tree cannot ride in as-is.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

// Moving the pin is a deliberate act: bump TAG + COMMIT + SHA256 together.
const TAG = '4.1.1';
const COMMIT = '0d469f288fa72b7dce91ea36a58a1261487953ff';
const TARBALL = 'https://registry.npmjs.org/trianglify/-/trianglify-' + TAG + '.tgz';
const JS_SHA256 = 'f3a15f4bd721966e161f0c7321a667fb5aa3a23594aafacdd6521e5f08dc70f1';
const LICENSE_SHA256 = 'c61f12da7cdad526bdcbed47a4c0a603e60dbbfdaf8b66933cd088e9132c303f';

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

const tmp = mkdtempSync(join(tmpdir(), 'trianglify-'));
const tgz = join(tmp, 'trianglify.tgz');

const res = await fetch(TARBALL);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + TARBALL);
writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
execFileSync('tar', ['-xzf', tgz, '-C', tmp], { timeout: 30000 });

const jsBuf = readFileSync(join(tmp, 'package', 'dist', 'trianglify.bundle.js'));
const licBuf = readFileSync(join(tmp, 'package', 'LICENSE'));
const jsHex = sha256(jsBuf);
const licHex = sha256(licBuf);
if (jsHex !== JS_SHA256) {
  throw new Error('trianglify.bundle.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256 + ' — move the pin deliberately.');
}
if (licHex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + licHex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}

const js = jsBuf.toString('utf8');
if (/<\/script/i.test(js)) throw new Error('trianglify.bundle.js contains </script — cannot inline safely.');
if (!js.includes('trianglify') || !js.includes('interpolateLinear')) {
  throw new Error('trianglify.bundle.js does not look like the trianglify UMD.');
}
if (/^\s*import\s|export\{|import\.meta/m.test(js)) {
  throw new Error('trianglify.bundle.js uses ESM — the classic-script inline path cannot carry it.');
}

writeFileSync(join(vendor, 'trianglify.js'), jsBuf);
writeFileSync(join(vendor, 'COPYING-trianglify.txt'), licBuf);
writeFileSync(join(dir, 'COPYING.txt'), licBuf);
writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/trianglify.js is GENERATED. Do not edit it;\n' +
  'run node apps/trianglify-studio/vendor.mjs.\n\n' +
  'package: trianglify@' + TAG + '\n' +
  'npm:     ' + TARBALL + '\n' +
  'commit:  ' + COMMIT + ' (GitHub tag v' + TAG + ')\n' +
  'sha256:  ' + JS_SHA256 + '\n' +
  'entry:   dist/trianglify.bundle.js — classic UMD IIFE, sets window.trianglify\n' +
  '          (chroma-js and delaunator inlined; node-canvas is not)\n\n' +
  'The GPLv3 notice travels beside it as COPYING-trianglify.txt and as\n' +
  'COPYING.txt at the app root; both are packed into the GIF, so a copy of\n' +
  'this app that someone was handed still carries the licence it is required\n' +
  'to carry. Corresponding source of this studio lives in the GifOS tree\n' +
  '(apps/trianglify-studio/); corresponding source of the library is the\n' +
  'pinned tarball above.\n'
);

console.log('wrote vendor/trianglify.js —', (jsBuf.length / 1024).toFixed(1), 'KB, trianglify@' + TAG, '(' + COMMIT.slice(0, 10) + ')');
rmSync(tmp, { recursive: true, force: true });
