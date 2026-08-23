// Pack apps/one-stroke/ into site/apps/one-stroke/one-stroke.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// Run:  node apps/one-stroke/build.mjs
import { oneStrokeIcon, screenshotPng } from './icon.mjs';
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
const listing = JSON.parse(read('listing.json'));
const SCRIPTS = ['game.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'game.js': read('game.js'),
  'app.js': read('app.js'),
};

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
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm');
}
if (manifest.capabilities.network) {
  throw new Error('one-stroke has no network path');
}
if (manifest.capabilities.pointer) {
  throw new Error('do not set capabilities.pointer — ordinary pointer events are enough');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the shared picture has to sync');
}
if (listing.basedOn || listing.porter || listing.inspiredBy) {
  throw new Error('first-party listing must not set basedOn, porter, or inspiredBy');
}
const authorName = listing.author && (listing.author.name || listing.author);
if (String(authorName).trim().toLowerCase() !== 'gifos') {
  throw new Error('author must be GifOS');
}
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish strokes on the player\'s own row');
}
if (!files['app.js'].includes('putPicture') || !files['app.js'].includes('isHost')) {
  throw new Error('host appends to the picture row; nobody else writes it');
}
if (!files['style.css'].includes('touch-action:none')) {
  throw new Error('the pad must set touch-action:none so a finger draws instead of scrolling');
}
if (!html.includes('ghost-stroke') || !html.includes('Draw one line')) {
  throw new Error('empty page must teach the stroke — a ghost line and “Draw one line”');
}
if (!html.includes('soloFriends') || !html.includes('With friends')) {
  throw new Error('first-run must offer With friends without drawing an Invite button');
}
if (!files['game.js'].includes('{x,y}') && !files['game.js'].includes('p.x') ) {
  throw new Error('strokes must be compact {x,y} lists in 0..1');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /^\s*export\s/m.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}
if (files['app.js'].includes('cdn.') || files['index.html'].includes('http://') || /https:\/\//.test(files['index.html'])) {
  throw new Error('do not load anything from the network — vendor everything');
}
if (files['app.js'].includes('toDataURL') || files['app.js'].includes('toBlob')) {
  throw new Error('do not dump images into the collection — store compact point lists');
}

const jargon = /gifos\.db|WASM|sandbox|connect-src|gifos\.fetch|\bJSON\b|\bpolyline\b/i;
if (jargon.test(listing.description) || jargon.test(listing.tagline)) {
  throw new Error('listing copy is technical — keep it for humans');
}

// Sanity: other person's turn rejected; two strokes from the same seat in
// one turn rejected; playback order is stable.
{
  const ctx = { console };
  vm.runInNewContext(
    files['game.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var C = OS.COLORS[0], W = OS.WIDTHS[1];\n' +
    '  function pts(a,b,c,d) { return [{x:a,y:b},{x:c,y:d}]; }\n' +
    '  function stroke(seq, c) {\n' +
    '    return { kind: "stroke", seq: seq, pts: pts(0.1,0.2,0.4,0.5), c: c || C, w: W };\n' +
    '  }\n' +
    '  var pic = OS.fresh(["ann","bob"], { host: "ann" });\n' +
    '  if (OS.actorOf(pic) !== "ann") throw new Error("first turn is ann");\n' +
    '  var other = OS.applyIntent(pic, "bob", stroke(0));\n' +
    '  if (other) throw new Error("stroke on the other person\'s turn must be refused");\n' +
    '  var two = OS.applyIntents(pic, [\n' +
    '    { id: "ann", intent: stroke(0, OS.COLORS[0]) },\n' +
    '    { id: "ann", intent: stroke(0, OS.COLORS[1]) }\n' +
    '  ]);\n' +
    '  if (!two || two.strokes.length !== 1) throw new Error("two strokes from the same seat in one turn");\n' +
    '  if (two.strokes[0].c !== OS.COLORS[0]) throw new Error("first stroke should win");\n' +
    '  if (OS.actorOf(two) !== "bob") throw new Error("turn should pass to bob");\n' +
    '  var again = OS.applyIntent(two, "ann", stroke(two.seq, OS.COLORS[2]));\n' +
    '  if (again) throw new Error("ann already drew this turn");\n' +
    '  var p = OS.fresh(["a","b","c"]);\n' +
    '  p = OS.applyIntent(p, "a", stroke(p.seq, OS.COLORS[0]));\n' +
    '  p = OS.applyIntent(p, "b", stroke(p.seq, OS.COLORS[1]));\n' +
    '  p = OS.applyIntent(p, "c", stroke(p.seq, OS.COLORS[2]));\n' +
    '  if (!p) throw new Error("three legal strokes should apply");\n' +
    '  var order = OS.playback(p);\n' +
    '  if (order.length !== 3) throw new Error("playback length " + order.length);\n' +
    '  if (order[0].n !== 0 || order[1].n !== 1 || order[2].n !== 2) throw new Error("playback n");\n' +
    '  if (order[0].c !== OS.COLORS[0] || order[1].c !== OS.COLORS[1] || order[2].c !== OS.COLORS[2]) {\n' +
    '    throw new Error("playback colour order");\n' +
    '  }\n' +
    '  var shuffled = { strokes: [order[2], order[0], order[1]] };\n' +
    '  var againP = OS.playback(shuffled);\n' +
    '  if (againP[0].n !== 0 || againP[1].n !== 1 || againP[2].n !== 2) throw new Error("playback order is not stable");\n' +
    '  if (p.phase !== "vote") throw new Error("full round should open the vote");\n' +
    '  return order.length;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: oneStrokeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'one-stroke', 'one-stroke.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/one-stroke/one-stroke.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/one-stroke/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
