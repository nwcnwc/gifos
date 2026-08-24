// Pack apps/crossword/ into site/apps/crossword/crossword.gif.
import { crosswordIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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
const packed = JSON.parse(read('vendor/puzzles.json'));
const puzzles = packed.puzzles || packed;
const sand = JSON.parse(read('vendor/puzzle.json'));

if (!existsSync(join(dir, 'vendor', 'crosswords.js'))) throw new Error('vendor/crosswords.js missing');
const PIN = '06ad23a960f37085ca1f99ade3d46f36d0fa40ebbbcfe80cdbfb6f09a4efe865';
const libBuf = readFileSync(join(dir, 'vendor', 'crosswords.js'));
const hex = createHash('sha256').update(libBuf).digest('hex');
if (hex !== PIN) throw new Error('vendor/crosswords.js sha256 ' + hex + ' ≠ pin ' + PIN);

if (manifest.minBuild !== 947) throw new Error('minBuild');
if (manifest.appId !== 'crossword') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('db+mp');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/dwmkerr/crosswords-js') throw new Error('url');
if (listing.porter.name !== 'GifOS' || /gifos/i.test(listing.author.name)) throw new Error('author');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Games') throw new Error('listing');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.tagline.length > 120) throw new Error('tagline');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}

if (!Array.isArray(puzzles) || puzzles.length < 3) throw new Error('need at least three puzzles');
const ids = puzzles.map((p) => p.id);
if (!ids.includes('sand') || !ids.includes('heart') || !ids.includes('racecar')) {
  throw new Error('puzzles must include heart, racecar, sand');
}
if (sand.width !== 4 || (sand.acrossClues || []).length < 4) throw new Error('vendor/puzzle.json is the v1 Sand grid');
for (const puzzle of puzzles) {
  const across = puzzle.acrossClues || [];
  if (across.length < 3) throw new Error(puzzle.id + ' must have several across clues');
  if (!across.every((c) => c.solution && c.clue)) throw new Error(puzzle.id + ' every across clue needs solution + clue');
  if (!(puzzle.downClues || []).every((c) => c.solution && c.clue)) throw new Error(puzzle.id + ' every down clue needs solution');
}

const puzzleJs = 'window.CROSSWORD_PUZZLES = ' + JSON.stringify(puzzles) + ';\n'
  + 'window.CROSSWORD_PUZZLE = window.CROSSWORD_PUZZLES[0];\n';
if (/<\/script/i.test(puzzleJs)) throw new Error('puzzle </script');

{
  const ctx = {
    console,
    window: {},
    self: {},
    globalThis: {},
    document: { createElement() { return { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, children: [], dataset: {}, setAttribute() {} }; } },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.this = ctx;
  vm.createContext(ctx);
  vm.runInContext(libBuf.toString('utf8') + '\nresult = typeof crosswords !== "undefined" && crosswords.newCrosswordController;', ctx);
  if (!ctx.crosswords || typeof ctx.crosswords.compileCrossword !== 'function') {
    throw new Error('UMD did not attach window.crosswords.compileCrossword');
  }
  for (const puzzle of puzzles) {
    const model = ctx.crosswords.compileCrossword(puzzle);
    if (!model || !model.lightCells || model.lightCells.length < 12) {
      throw new Error(puzzle.id + ' did not compile to a complete grid');
    }
    console.log(puzzle.id, 'compiles —', model.lightCells.length, 'lights');
  }
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/crosswords.css': read('vendor/crosswords.css'),
  'vendor/crosswords.js': libBuf.toString('utf8'),
  'puzzle.js': puzzleJs,
  'app.js': read('app.js'),
  'COPYING-crosswords-js.txt': read('vendor/COPYING-crosswords-js.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of ['vendor/crosswords.js', 'puzzle.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
}
if (!html.includes('href="vendor/crosswords.css"')) throw new Error('css');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes('newCrosswordController')) {
  throw new Error('app.js must save and boot the player');
}
if (!files['app.js'].includes('qwertyuiop') && !files['app.js'].includes('QWERTYUIOP')) {
  throw new Error('phone letter pad');
}
if (!files['app.js'].includes('inputmode') && !files['index.html'].includes('inputmode')) {
  throw new Error('native phone keyboard input');
}
if (!files['app.js'].includes('enterLetter')) throw new Error('pad must advance via enterLetter');
if (!files['app.js'].includes('cellElement')) throw new Error('setGridCell needs the DOM cell');
if (!files['app.js'].includes("selectPuzzle('sand'") && !files['app.js'].includes('puzzleOf(\'sand\')')) {
  throw new Error('v1 Sand progress must still load');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\s+\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
}

const cover = screenshotPng();
if (cover[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), cover);

const bytes = await gif.encode(files, { preview: crosswordIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'crossword', 'crossword.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/crossword/crossword.gif —', bytes.length, 'bytes,',
            (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
