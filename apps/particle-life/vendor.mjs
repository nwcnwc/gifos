/*
 * vendor.mjs — rebuild vendor/COPYING-particle-life.txt from the pinned
 * hunar4321/particle-life commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/particle-life/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + SHA256 together.
const COMMIT = '256278714c4f6a1ce900d24faafcc101769c54c2';
const LICENSE_SHA256 = '26b28c3a713be6c073d7dcfddda37d7cd8757ae209575d73181a2113dff7e0ad';
const url = 'https://raw.githubusercontent.com/hunar4321/particle-life/' + COMMIT + '/LICENSE';

const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
const buf = Buffer.from(await res.arrayBuffer());
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + hex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}
writeFileSync(join(outDir, 'COPYING-particle-life.txt'), buf);
console.log('wrote vendor/COPYING-particle-life.txt —', buf.length, 'bytes, particle-life', COMMIT.slice(0, 10));
