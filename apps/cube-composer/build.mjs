// Pack apps/cube-composer/ into site/apps/cube-composer/cube-composer.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Offline and deterministic. The PureScript original is not shipped — this
// is a classic-script rewrite of the same puzzles. A BFS in this file checks
// every level still solves.
//
// Run:  node apps/cube-composer/build.mjs
import { cubeComposerIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush — the
// encoder is not a streaming compressor anyway.
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

const SCRIPTS = ['transformers.js', 'levels.js', 'render.js', 'mp.js', 'app.js'];

const sandbox = { console, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('transformers.js'), sandbox);
vm.runInContext(read('levels.js'), sandbox);
const CC = sandbox.CC;
if (!CC || !CC.chapters || CC.allLevels.length < 20) {
  throw new Error('levels did not load — expected 25 puzzles');
}

function solve(level, chapter) {
  const ids = chapter.transformers.map((t) => t.id);
  const q = [[]];
  const seen = new Set(['']);
  while (q.length) {
    const chain = q.shift();
    const fns = CC.getFns(chapter, chain);
    if (CC.wallsEqual(CC.transformed(fns, level.initial), level.target)) return chain;
    if (chain.length >= ids.length) continue;
    for (const id of ids) {
      if (chain.indexOf(id) >= 0) continue;
      const next = chain.concat(id);
      const key = next.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      q.push(next);
    }
  }
  return null;
}

let unsolved = 0;
for (const ch of CC.chapters) {
  for (const lv of ch.levels) {
    const sol = solve(lv, ch);
    if (!sol) {
      console.error('unsolved', lv.id, lv.name);
      unsolved++;
    }
  }
}
if (unsolved) throw new Error(unsolved + ' levels have no solution — transformers drifted');
if (CC.allLevels.length !== 25) throw new Error('expected 25 levels, got ' + CC.allLevels.length);

const manifest = JSON.parse(read('manifest.json'));
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-cube-composer.txt': read('COPYING-cube-composer.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/src=["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote script — nothing may be fetched.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 (nothing newer than the App Store)');
if (manifest.capabilities.network) throw new Error('cube-composer has no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — live scores have to sync');
}
if (!files['mp.js'].includes('Invite') || !files['mp.js'].includes('players')) {
  throw new Error('mp.js must race on the players collection and tell the player to press Invite');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing is fetched.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}

const listing = JSON.parse(read('listing.json'));
if (listing.author && listing.author.name === 'GifOS') {
  throw new Error('author is them (sharkdp), never GifOS — a port is not first-party');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('porter must be GifOS');
}
{
  const tag = String(listing.tagline || '').toLowerCase();
  if (!/race/.test(tag) || !/link|invite|file/.test(tag)) {
    throw new Error('tagline must lead with the race and one link / the file');
  }
  const desc = String(listing.description || '');
  if (!/play a friend|invite|send the link/i.test(desc.slice(0, 160))) {
    throw new Error('description must lead with the race from one invite');
  }
  if (!/unofficial/i.test(desc)) {
    throw new Error('description must credit this as unofficial');
  }
}

const shot = screenshotPng();
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: cubeComposerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'cube-composer', 'cube-composer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/cube-composer/cube-composer.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (25 puzzles, all solved, no network)');
