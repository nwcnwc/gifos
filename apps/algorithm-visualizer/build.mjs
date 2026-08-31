// Pack apps/algorithm-visualizer/ into site/apps/algorithm-visualizer/algorithm-visualizer.gif
// Offline and deterministic. Run: node apps/algorithm-visualizer/build.mjs
import { algoIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const SCRIPTS = ['tracer.js', 'algos.js', 'render.js', 'player.js', 'net.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'tracer.js': read('tracer.js'),
  'algos.js': read('algos.js'),
  'render.js': read('render.js'),
  'player.js': read('player.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING-algorithm-visualizer.txt': read('vendor/COPYING-algorithm-visualizer.txt'),
};

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md is too short');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false');
}
if (!listing.porter) throw new Error('listing.porter is required for a port');
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

// Smoke: every algorithm emits a walk-through; sorts finish sorted.
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['tracer.js'] + '\n' + files['algos.js'], ctx);
  const AVAlgos = ctx.AVAlgos;
  const AV = ctx.AV;
  if (!AVAlgos || AVAlgos.list.length < 15) throw new Error('catalog too small');
  function apply1d(data, commands) {
    const a = data.slice();
    const sel = {}, patch = {};
    for (const c of commands) {
      if (c.method === 'set' && Array.isArray(c.args[0]) && !Array.isArray(c.args[0][0])) {
        for (let i = 0; i < c.args[0].length; i++) a[i] = c.args[0][i];
      }
      if (c.method === 'patch' && c.args.length > 1 && typeof c.args[0] === 'number' && c.args.length === 2) {
        a[c.args[0]] = c.args[1];
      }
    }
    return a;
  }
  for (const spec of AVAlgos.list) {
    AV.Randomize.seed(1);
    const rec = AVAlgos.run(spec.id, null);
    if (!rec.chunks || rec.chunks.length < 3) {
      throw new Error(spec.id + ' produced too few chunks: ' + (rec.chunks && rec.chunks.length));
    }
    if (spec.category === 'Sorting') {
      const cmds = [];
      rec.chunks.forEach((ch) => cmds.push.apply(cmds, ch.commands));
      const lastSet = rec.input && rec.input.array;
      if (!lastSet) throw new Error(spec.id + ' did not capture input.array');
      // Re-run is already done; check the algorithm mutated toward sorted by
      // reading the last patch/set on the array tracer.
      const byKey = {};
      rec.tracers.forEach((t) => { byKey[t.key] = t.type; });
      let arr = lastSet.slice();
      for (const c of cmds) {
        if (byKey[c.key] !== 'array1d' && byKey[c.key] !== 'chart') continue;
        if (c.method === 'set') arr = c.args[0].slice();
        if (c.method === 'patch' && c.args.length > 1) arr[c.args[0]] = c.args[1];
      }
      const sorted = arr.slice().sort((x, y) => x - y);
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== sorted[i]) throw new Error(spec.id + ' did not finish sorted: ' + arr);
      }
    }
  }
  console.log('smoke: ' + AVAlgos.list.length + ' algorithms ok');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: algoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'algorithm-visualizer', 'algorithm-visualizer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/algorithm-visualizer/algorithm-visualizer.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
