/*
 * vendor.mjs — rebuild vendor/COPYING-splat.txt from the pinned
 * antimatter15/splat commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/splat/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + SHA256 together.
const COMMIT = 'ba182b51b7c2ad5738cdd6741cd63336d27470fb';
const LICENSE_SHA256 = '7d62ca775042bb7182918e42e6bd7b8cac3462ceaf7717d7836ef0c0fce075ef';
const url = 'https://raw.githubusercontent.com/antimatter15/splat/' + COMMIT + '/LICENSE';

const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
const buf = Buffer.from(await res.arrayBuffer());
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + hex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}
writeFileSync(join(outDir, 'COPYING-splat.txt'), buf);
console.log('wrote vendor/COPYING-splat.txt —', buf.length, 'bytes, splat', COMMIT.slice(0, 10));
