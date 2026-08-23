/*
 * vendor.mjs — rebuild vendor/* from the pinned canvas-tetris commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/falling-blocks/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + each SHA256 together.
const COMMIT = '4e497d1c858914f0a1f0818698029d1c7dad090b';
const BASE = 'https://raw.githubusercontent.com/dionyziz/canvas-tetris/' + COMMIT + '/';
const FILES = [
  { src: 'js/tetris.js', out: 'tetris.js', sha256: '9cb906552fe686f4fd80e25e2c65af7439b358b5500ea9ba3ebe78ff2740fb37' },
  { src: 'js/controller.js', out: 'controller.js', sha256: '97ce01aa3c94ac641e87a9ae920f834e68dea853031540c09525285d57b3664a' },
  { src: 'js/render.js', out: 'render.js', sha256: 'ec30c87d5f4d301efcfdcb6a090cf4eb900089ae2fb6cf791302f5bdec5cfc8c' },
  { src: 'LICENSE.md', out: 'COPYING-canvas-tetris.txt', sha256: 'aff9e7444db8c1d0fd2b0076fc9f15afcda2ac009718706e67166f9dcc31df3f' },
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
  console.log('wrote vendor/' + f.out + ' —', buf.length, 'bytes, canvas-tetris', COMMIT.slice(0, 10));
}
