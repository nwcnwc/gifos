// Pack apps/besogo/ into site/apps/besogo/besogo.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// The board is yewang's BesoGo (MIT), vendored unmodified as classic scripts.
// Offline and deterministic.
//
// Run:  node apps/besogo/build.mjs
import { besogoIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

const VENDOR_JS = [
  'js/besogo.js',
  'js/gameRoot.js',
  'js/editor.js',
  'js/svgUtil.js',
  'js/coord.js',
  'js/boardDisplay.js',
];
const VENDOR_CSS = ['css/besogo.css', 'css/board-flat.css'];

for (const p of [...VENDOR_JS, ...VENDOR_CSS, 'vendor/COPYING-besogo.txt', 'vendor/UPSTREAM.txt']) {
  const disk = p.startsWith('js/') || p.startsWith('css/') ? join('vendor', p) : p;
  if (!existsSync(join(dir, disk))) throw new Error(disk + ' is missing');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'COPYING-besogo.txt': read('vendor/COPYING-besogo.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const p of VENDOR_JS) files[p] = read(join('vendor', p));
for (const p of VENDOR_CSS) files[p] = read(join('vendor', p));

const html = files['index.html'];
for (const s of [...VENDOR_JS, 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('href="css/besogo.css"') || !html.includes('href="css/board-flat.css"')) {
  throw new Error('index.html does not load BesoGo CSS');
}
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — BesoGo is plain JavaScript, not a compiled engine');
}
if (manifest.capabilities.network) {
  throw new Error('besogo has no network path');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the shared board has to sync');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}
if (files['app.js'].includes('cdn.') || /https:\/\//.test(files['index.html'])) {
  throw new Error('do not load anything from the network — vendor everything');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"') || files['index.html'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['js/besogo.js'].includes('besogo.create') || !files['js/gameRoot.js'].includes('playMove')) {
  throw new Error('vendor JS is not yewang\'s BesoGo');
}
if (!files['COPYING-besogo.txt'].includes('Ye Wang')) {
  throw new Error('COPYING-besogo.txt is not yewang\'s MIT notice');
}
if (files['css/board-flat.css'].includes('url(') || files['css/besogo.css'].includes('url(')) {
  throw new Error('do not ship CSS that pulls board photographs — SVG stones only');
}

// Sanity: capture a corner, reject suicide, two-pass helper still sees a pass.
{
  const ctx = { console, window: {} };
  ctx.window = ctx;
  vm.runInNewContext(
    files['js/besogo.js'] + '\n' + files['js/gameRoot.js'] + '\n' +
    'result = (function () {\n' +
    '  var root = besogo.makeGameRoot(9, 9);\n' +
    '  var n = root;\n' +
    '  function play(x, y, c) {\n' +
    '    var ch = n.makeChild();\n' +
    '    if (!ch.playMove(x, y, c, false)) throw new Error("illegal " + x + "," + y);\n' +
    '    n.addChild(ch); n = ch;\n' +
    '  }\n' +
    '  play(1, 1, 1);\n' +
    '  play(1, 2, -1);\n' +
    '  play(5, 5, 1);\n' +
    '  play(2, 1, -1);\n' +
    '  if (n.getStone(1, 1) !== 0) throw new Error("corner not captured");\n' +
    '  if (n.blackCaps !== 1) throw new Error("caps " + n.blackCaps);\n' +
    '  var hole = n.makeChild();\n' +
    '  if (hole.playMove(1, 1, 1, false)) throw new Error("suicide should be rejected");\n' +
    '  var pass = n.makeChild();\n' +
    '  if (!pass.playMove(0, 0, 1, false)) throw new Error("pass should succeed");\n' +
    '  if (pass.move.x !== 0 || pass.move.y !== 0) throw new Error("pass not logged");\n' +
    '  return n.blackCaps;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: besogoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'besogo', 'besogo.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/besogo/besogo.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (BesoGo vendored, no network)');
console.log('wrote apps/besogo/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
