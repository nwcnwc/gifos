/*
 * vendor.mjs — rebuild vendor/COPYING-fieldplay.txt from the pinned
 * anvaka/fieldplay commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/fieldplay/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const COMMIT = 'f05173e18c9152d6d38a590ef7edea10d27b4350';
const LICENSE_SHA256 = 'eacf0841fb89097ba61900a4d14b38a2ccfdea20853036ffae69b92dba910ed1';
const url = 'https://raw.githubusercontent.com/anvaka/fieldplay/' + COMMIT + '/LICENSE';

const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
const buf = Buffer.from(await res.arrayBuffer());
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== LICENSE_SHA256) {
  throw new Error('LICENSE sha256 ' + hex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}
writeFileSync(join(outDir, 'COPYING-fieldplay.txt'), buf);
console.log('wrote vendor/COPYING-fieldplay.txt —', buf.length, 'bytes, fieldplay', COMMIT.slice(0, 10));
