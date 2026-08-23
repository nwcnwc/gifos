/*
 * vendor.mjs — rebuild vendor/* from the pinned javascript-pong commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/pong/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + each SHA256 together.
const COMMIT = 'ca3240536e4f79ab7144388e56ed19de715b6662';
const BASE = 'https://raw.githubusercontent.com/jakesgordon/javascript-pong/' + COMMIT + '/';
const FILES = [
  { src: 'game.js', out: 'game.js', sha256: 'dc27867e038b5e099f6100335adb63a8728f26e06044df8a0c060578ebe9ee77' },
  { src: 'pong.js', out: 'pong.js', sha256: '38ea07c0aee1e393b74d47a0f2437f565a6172073399c853913fda296ca610ee' },
  { src: 'LICENSE', out: 'COPYING-javascript-pong.txt', sha256: 'e21a35a09a2eb2681e7b3472226ae95a9317c11bb928dc27f579c5b38068f933' },
];

const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

for (const f of FILES) {
  const url = BASE + f.src;
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== f.sha256) {
    throw new Error(f.src + ' sha256 ' + hex + ' ≠ pin ' + f.sha256 + ' — move the pin deliberately.');
  }
  if (f.out.endsWith('.js') && /<\/script/i.test(buf.toString('utf8'))) {
    throw new Error(f.src + ' contains </script — cannot inline safely.');
  }
  writeFileSync(join(outDir, f.out), buf);
  console.log('wrote vendor/' + f.out + ' —', buf.length, 'bytes, javascript-pong', COMMIT.slice(0, 10));
}
