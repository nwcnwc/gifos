// Pack apps/word-master/ into site/apps/word-master/word-master.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Word lists are committed under vendor/ (pinned upstream). This script
// turns them into a classic words.js — GifOS's runtime drops type=module,
// so a CRA bundle cannot ride in as ESM.
//
// Run:  node apps/word-master/build.mjs
import { wordMasterIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush.
{
  const Orig = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (Orig) return new Orig(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) {
          controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks))));
        }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

function listsFromVendor() {
  const ansSrc = read('vendor/answers.tsx');
  const wSrc = read('vendor/words.tsx');
  const answers = [...ansSrc.matchAll(/'([a-z]{5})'/g)].map((m) => m[1].toUpperCase());
  const words = [...wSrc.matchAll(/^\s*([a-z]{5}):\s*true/gm)].map((m) => m[1]);
  if (answers.length < 2000) throw new Error('answers list too small: ' + answers.length);
  if (words.length < 8000) throw new Error('words list too small: ' + words.length);
  const missing = answers.filter((a) => !words.includes(a.toLowerCase()));
  if (missing.length) throw new Error('answers not in words: ' + missing.slice(0, 8).join(','));
  const valid = {};
  for (const w of words) valid[w] = true;
  return '(function(root){\n"use strict";\n' +
    'root.WM_ANSWERS=' + JSON.stringify(answers) + ';\n' +
    'root.WM_WORDS=' + JSON.stringify(valid) + ';\n' +
    '})(this);\n';
}

const wordsJs = listsFromVendor();
writeFileSync(join(dir, 'words.js'), wordsJs);

const manifest = JSON.parse(read('manifest.json'));
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'words.js': wordsJs,
  'app.js': read('app.js'),
  'COPYING-word-master.txt': read('vendor/COPYING-word-master.txt'),
};

const html = files['index.html'];
for (const s of ['words.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/https?:\/\//i.test(html) && /src=["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote script — nothing may be fetched.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 (nothing newer than the App Store)');
if (manifest.capabilities.network) throw new Error('word-master has no network path');
if (!files['app.js'].includes('players') || !files['app.js'].includes('guesses')) {
  throw new Error('app.js must publish guess counts on the players collection');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — lists travel in the GIF, nothing is fetched.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}

const shot = screenshotPng();
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: wordMasterIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'word-master', 'word-master.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/word-master/word-master.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (word lists in-GIF, no network)');
