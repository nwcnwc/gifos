/*
 * vendor.mjs — rebuild vendor/{three.min.js,game.js,tailwind.css} from the
 * pinned Server Survival commit. Network step; not part of build.mjs.
 *
 *   node apps/server-survival/vendor.mjs
 *
 * Classic-ifies the native ESM graph (esbuild IIFE), vendors three.js r128
 * (the CDN the game already used), and compiles Tailwind so the Play CDN is
 * never contacted. Audio is copied from the pin, not transcoded.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';

const dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

const COMMIT = '23fdd6b45959fc201f63bafc8168f9ce9564e2c9';
const REPO = 'https://github.com/pshenok/server-survival.git';
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const THREE_LICENSE_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/r128/LICENSE';
const ESBUILD = '0.25.9';
const TAILWIND = '3.4.17';

const tmp = mkdtempSync(join(tmpdir(), 'server-survival-'));
const src = join(tmp, 'src');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

console.log('cloning pshenok/server-survival@' + COMMIT.slice(0, 10));
run('git', ['clone', '--depth', '1', REPO, src], tmp);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (head !== COMMIT) {
  throw new Error('upstream HEAD ' + head + ' ≠ pin ' + COMMIT + ' — move the pin deliberately.');
}

const sounds = ['click-5.mp3', 'click-9.mp3', 'click-10.mp3', 'game-background.mp3', 'menu.mp3'];
mkdirSync(join(outDir, 'assets', 'sounds'), { recursive: true });
for (const s of sounds) {
  copyFileSync(join(src, 'assets', 'sounds', s), join(outDir, 'assets', 'sounds', s));
}
copyFileSync(join(src, 'LICENSE'), join(outDir, 'COPYING-server-survival.txt'));
copyFileSync(join(src, 'style.css'), join(dir, 'style.css'));

console.log('fetching three.js r128');
{
  const res = await fetch(THREE_URL);
  if (!res.ok) throw new Error('three.min.js ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.includes(Buffer.from('REVISION="128"')) && !buf.includes(Buffer.from("REVISION='128'")) &&
      !buf.includes(Buffer.from('REVISION:"128"')) && !buf.includes(Buffer.from("r128"))) {
    // r128 minified uses REVISION="128"
    const sample = buf.slice(0, 200).toString('utf8');
    if (!/128/.test(sample) && !buf.includes(Buffer.from('128'))) {
      throw new Error('three.min.js does not look like r128: ' + sample.slice(0, 120));
    }
  }
  writeFileSync(join(outDir, 'three.min.js'), buf);
  const lic = await fetch(THREE_LICENSE_URL);
  if (!lic.ok) throw new Error('three LICENSE ' + lic.status);
  writeFileSync(join(outDir, 'COPYING-three.txt'), Buffer.from(await lic.arrayBuffer()));
}

console.log('bundling ESM → classic IIFE with esbuild@' + ESBUILD);
run('npx', ['--yes', 'esbuild@' + ESBUILD,
  join(src, 'src', 'main.js'),
  '--bundle',
  '--format=iife',
  '--platform=browser',
  '--outfile=' + join(outDir, 'game.js'),
  '--legal-comments=inline',
  '--target=es2018'
], src);

const gameJs = readFileSync(join(outDir, 'game.js'), 'utf8');
if (/type=["']module["']/.test(gameJs)) throw new Error('bundle still mentions type=module');
if (/^\s*import\s/m.test(gameJs)) throw new Error('bundle still has import');
if (!gameJs.includes('window.handleGameState') && !gameJs.includes('window.startGame')) {
  throw new Error('bundle lost window.startGame — ESM boundary missing');
}

console.log('compiling Tailwind ' + TAILWIND + ' from the game markup');
{
  const twDir = join(tmp, 'tw');
  mkdirSync(twDir, { recursive: true });
  writeFileSync(join(twDir, 'input.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  writeFileSync(join(twDir, 'tailwind.config.js'),
    'module.exports = {\n' +
    '  content: [\n' +
    '    ' + JSON.stringify(join(src, 'index.html')) + ',\n' +
    '    ' + JSON.stringify(join(src, 'game.js')) + ',\n' +
    '    ' + JSON.stringify(join(src, 'src') + '/**/*.js') + ',\n' +
    '    ' + JSON.stringify(join(outDir, 'game.js')) + '\n' +
    '  ],\n' +
    '  theme: { extend: {} },\n' +
    '  plugins: []\n' +
    '};\n');
  run('npx', ['--yes', 'tailwindcss@' + TAILWIND,
    '-c', join(twDir, 'tailwind.config.js'),
    '-i', join(twDir, 'input.css'),
    '-o', join(outDir, 'tailwind.css'),
    '--minify'
  ], twDir);
}

const twCss = readFileSync(join(outDir, 'tailwind.css'), 'utf8');
if (twCss.length < 10000) throw new Error('tailwind.css looks empty (' + twCss.length + ')');
if (/cdn\.tailwindcss\.com|unpkg|jsdelivr/i.test(twCss)) throw new Error('tailwind.css mentions a CDN');

console.log('writing classic index.html from upstream markup');
{
  let html = readFileSync(join(src, 'index.html'), 'utf8');
  html = html.replace(/\s*<link rel="icon"[^>]*>\s*/g, '\n');
  html = html.replace(/\s*<meta property="og:url"[^>]*>\s*/g, '\n');
  html = html.replace(/\s*<meta property="og:image"[^>]*>\s*/g, '\n');
  html = html.replace(/\s*<meta name="twitter:image"[^>]*>\s*/g, '\n');
  html = html.replace(/\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/g, '\n');
  html = html.replace(/\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js"><\/script>\s*/g, '\n');
  html = html.replace(/\s*<script>\s*\/\/ Boot guard[\s\S]*?<\/script>\s*/g, '\n');
  html = html.replace(
    '<link rel="stylesheet" href="style.css" />',
    '<link rel="stylesheet" href="vendor/tailwind.css">\n  <link rel="stylesheet" href="style.css">'
  );
  html = html.replace(
    '<script type="module" src="src/main.js"></script>',
    '<script src="shim.js"></script>\n' +
    '  <script src="vendor/three.min.js"></script>\n' +
    '  <script src="vendor/game.js"></script>\n' +
    '  <script src="app.js"></script>'
  );
  if (/type=["']module["']/.test(html)) throw new Error('index.html still has type=module');
  if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
    throw new Error('index.html still has an http(s) URL outside comments');
  }
  if (/cdn\.tailwindcss|cdnjs\.cloudflare|unpkg|jsdelivr|googleapis/i.test(html)) {
    throw new Error('index.html still mentions a CDN');
  }
  writeFileSync(join(dir, 'index.html'), html);
}

const sha = (rel) => createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex');
const pins = {
  'vendor/three.min.js': sha('vendor/three.min.js'),
  'vendor/game.js': sha('vendor/game.js'),
  'vendor/tailwind.css': sha('vendor/tailwind.css'),
  'vendor/assets/sounds/game-background.mp3': sha('vendor/assets/sounds/game-background.mp3'),
  'vendor/assets/sounds/menu.mp3': sha('vendor/assets/sounds/menu.mp3')
};

writeFileSync(join(outDir, 'UPSTREAM.txt'), [
  'Server Survival (pshenok/server-survival) classic-ified for GifOS.',
  '',
  'package: pshenok/server-survival',
  'url:     https://github.com/pshenok/server-survival',
  'commit:  ' + COMMIT + ' (main)',
  'license: MIT, Copyright (c) 2025 Kostyantyn Pshenychnyy',
  '',
  'Conversion:',
  '  - Native ESM graph (game.js + src/**) bundled with esbuild ' + ESBUILD,
  '    as a classic IIFE (vendor/game.js). No type=module in packed HTML.',
  '  - three.js r128 vendored from cdnjs (the same build upstream loaded).',
  '  - Tailwind Play CDN replaced with a compiled vendor/tailwind.css',
  '    (tailwindcss ' + TAILWIND + ' scanning the game markup + bundle).',
  '  - Soundtrack packed as assets/sounds/*.mp3 (menu 7.4 MB, game 4.1 MB,',
  '    plus click SFX). Paths match upstream so new Audio(...) still works.',
  '',
  'Do not edit vendor/game.js / three.min.js / tailwind.css to "improve"',
  'the game; re-run vendor.mjs when moving the pin.',
  '',
  'sha256:',
  ...Object.entries(pins).map(([k, v]) => '  ' + k + '  ' + v),
  ''
].join('\n'));

rmSync(tmp, { recursive: true, force: true });

console.log('vendor ok');
console.log('  three.min.js   ', (readFileSync(join(outDir, 'three.min.js')).length / 1024).toFixed(0), 'KB');
console.log('  game.js        ', (readFileSync(join(outDir, 'game.js')).length / 1024).toFixed(0), 'KB');
console.log('  tailwind.css   ', (readFileSync(join(outDir, 'tailwind.css')).length / 1024).toFixed(0), 'KB');
for (const [k, v] of Object.entries(pins)) console.log('  ' + k + '  ' + v);
