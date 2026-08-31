/*
 * vendor.mjs — rebuild vendor/* from the pinned javascript-breakout commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/breakout/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + each SHA256 together.
const COMMIT = 'eed59e2affa9423b93d2ac8ff93061bb88b33284';
const BASE = 'https://raw.githubusercontent.com/jakesgordon/javascript-breakout/' + COMMIT + '/';
const FILES = [
  { src: 'game.js', out: 'game.js', sha256: '87e7219f32df8348ab26ce7d6bd86313daa2be29cf26a3639f848345bfde0350' },
  { src: 'breakout.js', out: 'breakout.js', sha256: '5904bd60acca73c6addcd2e80489c337d2f9e35246be1a6ab86ef92e412c1b8c' },
  { src: 'levels.js', out: 'levels.js', sha256: '9a12e4fa1d1fa507a8b1bfa3c80643c711fe4f163dd0ff837df319bbe5de99e5' },
  { src: 'LICENSE', out: 'COPYING-javascript-breakout.txt', sha256: 'f57c728322b21e4103d485dccf31b59ff48a220df2ecc6cea77349ec15a422e3' },
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
  console.log('wrote vendor/' + f.out + ' —', buf.length, 'bytes, javascript-breakout', COMMIT.slice(0, 10));
}
