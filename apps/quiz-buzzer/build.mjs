// Pack apps/quiz-buzzer/ into site/apps/quiz-buzzer/quiz-buzzer.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop uses
// (site/js/gifos-gif.js).
//
// First-party engine, original pack. Nothing is fetched.
//
// Run:  node apps/quiz-buzzer/build.mjs
import { quizBuzzerIcon, screenshotPng } from './icon.mjs';
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
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const SCRIPTS = ['pack.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'pack.js': read('pack.js'),
  'app.js': read('app.js'),
};

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
if (manifest.capabilities.wasm) throw new Error('do not declare wasm');
if (manifest.capabilities.network) throw new Error('quiz-buzzer has no network path');
if (manifest.capabilities.pointer) throw new Error('do not declare pointer');
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (manifest.appId !== 'quiz-buzzer') throw new Error('appId must be quiz-buzzer');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private — pack progress stays on this device');
}
if (!manifest.data.match || manifest.data.match.visibility !== 'read-write') {
  throw new Error('manifest.data.match must be read-write — the host round has to sync');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — each buzz has to sync');
}
if (html.includes('id="invite"') || />\s*Invite\s*</.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}

if (!listing.author || listing.author.name !== 'GifOS') {
  throw new Error('listing.author must be GifOS');
}
if (listing.basedOn) throw new Error('listing must not have basedOn — this is first-party');
if (listing.porter) throw new Error('listing must not have porter — this is first-party');
if (!listing.inspiredBy || listing.inspiredBy.name !== 'Kahoot!' || listing.inspiredBy.by !== 'Kahoot!') {
  throw new Error('listing.inspiredBy must name Kahoot!');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games' || listing.categories[1] !== 'Learning') {
  throw new Error('listing.categories must be Games + Learning');
}
for (const tag of ['quiz', 'buzzer', 'party', 'multiplayer', 'offline']) {
  if (!listing.tags || listing.tags.indexOf(tag) < 0) throw new Error('listing.tags must include ' + tag);
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/quiz-buzzer') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');

const listingPublic = JSON.stringify({
  tagline: listing.tagline,
  description: listing.description,
  name: listing.name,
});
if (/kahoot/i.test(listingPublic) || /kahoot/i.test(listing.tagline) || /kahoot/i.test(listing.description)) {
  throw new Error('do not use the word Kahoot in the store name, tagline, or description');
}
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'CORS', 'COOP', 'Argon2', 'CDN', 'Node']) {
  if (JSON.stringify(listing).includes(bad)) {
    throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
  }
}

if (!html.includes('Start the pack') || !html.includes('Reveal') || !html.includes('Next') || !html.includes('Type a question')) {
  throw new Error('host controls (pack / custom / Reveal / Next) missing from index.html');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['app.js'].includes("gifos.db('prefs')") || !files['app.js'].includes("gifos.db('match')") ||
    !files['app.js'].includes("gifos.db('players')")) {
  throw new Error('app.js must use private prefs, read-write match, read-write players');
}
if (!files['app.js'].includes('scoreQuestion')) {
  throw new Error('app.js must score through QuizBuzzer.scoreQuestion');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /export default/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/cdn\.|https?:\/\//i.test(s) && n !== 'pack.js') {
    // pack.js has none; app.js must not load a URL
    if (n === 'app.js' && /https?:\/\//.test(s)) throw new Error(n + ' loads a network URL');
  }
}
if (/https?:\/\//.test(html) || html.includes('cdn.')) {
  throw new Error('index.html must not load anything from the network');
}

// Sanity: 40 original questions; first-correct wins; wrong / late do not.
{
  const ctx = { console };
  vm.runInNewContext(
    files['pack.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var Q = QuizBuzzer;\n' +
    '  if (!Q || !Q.PACK || Q.PACK.length !== 40) throw new Error("pack length " + (Q && Q.PACK && Q.PACK.length));\n' +
    '  var ids = {}, i, q, c;\n' +
    '  for (i = 0; i < Q.PACK.length; i++) {\n' +
    '    q = Q.PACK[i];\n' +
    '    if (!q.id || ids[q.id]) throw new Error("bad id " + (q && q.id));\n' +
    '    ids[q.id] = 1;\n' +
    '    if (!q.q || !q.choices || q.choices.length !== 4) throw new Error("choices " + q.id);\n' +
    '    if (typeof q.answer !== "number" || q.answer < 0 || q.answer > 3) throw new Error("answer " + q.id);\n' +
    '    for (c = 0; c < 4; c++) {\n' +
    '      if (!q.choices[c] || String(q.choices[c]).length < 1) throw new Error("empty choice " + q.id);\n' +
    '    }\n' +
    '  }\n' +
    '  var jup = Q.byId("s1");\n' +
    '  if (!jup || jup.choices[jup.answer] !== "Jupiter") throw new Error("Great Red Spot is Jupiter");\n' +
    '  var round = { startedAt: 1000, deadline: 2000, revealedAt: 0, answer: 2 };\n' +
    '  var r = Q.scoreQuestion(round, [\n' +
    '    { id: "a", name: "A", choice: 1, at: 1100 },\n' +
    '    { id: "b", name: "B", choice: 2, at: 1500 },\n' +
    '    { id: "c", name: "C", choice: 2, at: 1600 },\n' +
    '    { id: "d", name: "D", choice: 2, at: 2500 },\n' +
    '    { id: "e", name: "E", choice: 2, at: 900 }\n' +
    '  ]);\n' +
    '  if (!r.winner || r.winner.id !== "b") throw new Error("first correct should win, got " + (r.winner && r.winner.id));\n' +
    '  function row(id) { return r.results.filter(function (x) { return x.id === id; })[0]; }\n' +
    '  if (row("a").score !== 0 || row("a").correct) throw new Error("wrong must not score");\n' +
    '  if (row("c").score !== 0) throw new Error("later correct must not score");\n' +
    '  if (row("d").legal || row("d").score) throw new Error("late must not score");\n' +
    '  if (row("e").legal || row("e").score) throw new Error("early must not score");\n' +
    '  if (row("b").score !== 1 || !row("b").correct) throw new Error("first correct scores 1");\n' +
    '  var onlyWrong = Q.scoreQuestion(round, [{ id: "a", choice: 0, at: 1200 }]);\n' +
    '  if (onlyWrong.winner) throw new Error("wrong-only must not invent a winner");\n' +
    '  var tie = Q.scoreQuestion(round, [\n' +
    '    { id: "z", choice: 2, at: 1300 },\n' +
    '    { id: "a", choice: 2, at: 1300 }\n' +
    '  ]);\n' +
    '  if (!tie.winner || tie.winner.id !== "a") throw new Error("same-time tie-break by id, got " + (tie.winner && tie.winner.id));\n' +
    '  var packed = JSON.stringify(Q.PACK).toLowerCase();\n' +
    '  if (packed.indexOf("kahoot") >= 0) throw new Error("pack must not mention Kahoot");\n' +
    '  return Q.PACK.length;\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 40) throw new Error('pack self-test returned ' + ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: quizBuzzerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'quiz-buzzer', 'quiz-buzzer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/quiz-buzzer/quiz-buzzer.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (original pack, no network)');
console.log('wrote apps/quiz-buzzer/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
