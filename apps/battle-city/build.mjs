// Pack apps/battle-city/ into site/apps/battle-city/battle-city.gif.
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { battleCityIcon, screenshotPng } from './icon.mjs';

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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const SOUNDS = [
  'bullet_shot', 'bullet_hit_1', 'bullet_hit_2', 'explosion_1', 'explosion_2',
  'stage_start', 'game_over', 'pause', 'powerup_appear', 'powerup_pick', 'statistics_1',
];
const SCRIPTS = ['stages.js', 'sound.js', 'game.js', 'net.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING': read('vendor/COPYING-battle-city.txt'),
  'COPYING-battle-city.txt': read('vendor/COPYING-battle-city.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);
for (const n of SOUNDS) {
  const p = join('vendor', 'sound', n + '.ogg');
  if (!existsSync(join(dir, p))) throw new Error('missing ' + p);
  files['sound/' + n + '.ogg'] = readBin(p);
}
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
for (const n of SOUNDS) {
  if (!html.includes('sound/' + n + '.ogg')) throw new Error('index.html does not reference sound/' + n + '.ogg');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: battleCityIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'battle-city', 'battle-city.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/battle-city/battle-city.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/battle-city/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
