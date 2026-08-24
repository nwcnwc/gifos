/*
 * vendor.mjs — rebuild COPYING-polygon-shredder.txt from the pinned commit.
 *   node apps/polygon-shredder/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const COMMIT = '41162311223fcb6862d33a40dd21e8eeca4c74f5';
const LICENSE_SHA256 = '93a75d1d0e2e3c58e526e484de6d3d50f5722a9bbb972cb4d978e4863a8712b8';
const url = 'https://raw.githubusercontent.com/spite/polygon-shredder/' + COMMIT + '/LICENSE';
const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });
const res = await fetch(url);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
const buf = Buffer.from(await res.arrayBuffer());
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + hex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}
writeFileSync(join(outDir, 'COPYING-polygon-shredder.txt'), buf);
console.log('wrote vendor/COPYING-polygon-shredder.txt —', buf.length, 'bytes, polygon-shredder', COMMIT.slice(0, 10));
