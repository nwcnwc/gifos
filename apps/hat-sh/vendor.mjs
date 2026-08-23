/*
 * vendor.mjs — rebuild vendor/sodium.js from the pinned libsodium.js tag.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/hat-sh/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump TAG + COMMIT + SHA256 together.
const TAG = '0.7.13';
const COMMIT = 'd96986a6e69ef9da64d3eca0b62b736da5afc4d0';
const PATH = 'dist/browsers-sumo/sodium.js';
const SHA256 = 'b13df42138a77880bd8e18ab184ca74fac59c31471cf82f8ded677cc46b5087f';
const URL = 'https://raw.githubusercontent.com/jedisct1/libsodium.js/' + TAG + '/' + PATH;

const res = await fetch(URL);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + URL);
const buf = Buffer.from(await res.arrayBuffer());
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== SHA256) {
  throw new Error('sodium.js sha256 ' + hex + ' ≠ pin ' + SHA256 + ' — move the pin deliberately.');
}
if (/<\/script/i.test(buf.toString('utf8'))) {
  throw new Error('sodium.js contains </script — cannot inline safely.');
}
writeFileSync(join(dir, 'vendor', 'sodium.js'), buf);
console.log('wrote vendor/sodium.js —', buf.length, 'bytes, libsodium.js', TAG, '(' + COMMIT.slice(0, 10) + ') sumo');
