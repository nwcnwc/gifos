// Pack apps/sql-playground/ into site/apps/sql-playground/sql-playground.gif.
// sql-wasm-b64.js is generated here: window.SQL_WASM_B64 from the pinned .wasm.
import { sqlPlaygroundIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const pin = (rel, hex) => {
  const buf = readFileSync(join(dir, rel));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== hex) throw new Error(rel + ' sha256 ' + got + ' ≠ pin ' + hex);
  return buf;
};

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const wasmBuf = pin('vendor/sql-wasm.wasm', '38c14f6e379210bc942bdc4ebca44e7bfdb4318ecc1c72ca666a28fdce96670a');
pin('vendor/sql-wasm.js', 'f1c84000dbc856c9d87f4f3aabc4d3654bd436165db4be3da13751db3a9c20d7');

for (const need of [
  'vendor/COPYING-sqljs.txt', 'vendor/COPYING-sqlite.txt',
  'vendor/UPSTREAM.txt', 'vendor/AUTHORS'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'sql-playground') throw new Error('appId must be sql-playground');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('must declare capabilities.db');
if (manifest.capabilities.wasm !== true) throw new Error('must declare capabilities.wasm');
if (manifest.capabilities.multiplayer !== true) throw new Error('must declare capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('no network path');
if (!manifest.data || !manifest.data.file || manifest.data.file.visibility !== 'read-write') {
  throw new Error('file collection must be read-write (invite shares the db)');
}
if (!manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.launch || !manifest.launch.sql) throw new Error('launch.sql required');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/sql-js/sql.js') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const require = createRequire(import.meta.url);
const initSqlJs = require(join(dir, 'vendor/sql-wasm.js'));
const sampleSrc = read('sample.js');
const SQL = await initSqlJs({ wasmBinary: wasmBuf });
const probe = new SQL.Database();
{
  const vm = await import('node:vm');
  const sandbox = { window: {} };
  vm.runInNewContext(sampleSrc, sandbox);
  const sql = sandbox.window.SQL_SAMPLE;
  if (!sql || sql.length < 200) throw new Error('SQL_SAMPLE missing');
  probe.run(sql);
  const nArt = probe.exec('SELECT COUNT(*) FROM artists')[0].values[0][0];
  const nTrk = probe.exec('SELECT COUNT(*) FROM tracks')[0].values[0][0];
  const nInv = probe.exec('SELECT COUNT(*) FROM invoices')[0].values[0][0];
  if (nArt !== 8) throw new Error('sample artists ' + nArt);
  if (nTrk !== 24) throw new Error('sample tracks ' + nTrk);
  if (nInv !== 8) throw new Error('sample invoices ' + nInv);
  const join = probe.exec(
    'SELECT ar.name, COUNT(t.id) FROM artists ar JOIN albums al ON al.artist_id = ar.id JOIN tracks t ON t.album_id = al.id GROUP BY ar.id'
  );
  if (!join[0] || join[0].values.length < 8) throw new Error('sample join failed');
  probe.close();
}

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');
const wasmJs = strModule('window.SQL_WASM_B64', wasmBuf.toString('base64'));

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sql-wasm-b64.js': wasmJs,
  'vendor/sql-wasm.js': read('vendor/sql-wasm.js'),
  'sample.js': read('sample.js'),
  'engine.js': read('engine.js'),
  'mp.js': read('mp.js'),
  'boot.js': read('boot.js'),
  'COPYING-sqljs.txt': read('vendor/COPYING-sqljs.txt'),
  'COPYING-sqlite.txt': read('vendor/COPYING-sqlite.txt'),
  'AUTHORS.txt': read('vendor/AUTHORS'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src']) {
    if (helpMd.includes(bad)) throw new Error('help.md mentions ' + bad);
  }
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['sql-wasm-b64.js', 'vendor/sql-wasm.js', 'sample.js', 'engine.js', 'mp.js', 'boot.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('missing css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['mp.js'].includes('Invite') || !files['boot.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['boot.js'].includes("db('file')") || !files['boot.js'].includes("id: 'db'")) {
  throw new Error('boot.js must save the sqlite bytes');
}
if (!files['boot.js'].includes("db('prefs')")) throw new Error('boot.js must save prefs privately');
if (!files['engine.js'].includes('SQL_WASM_B64') || !files['engine.js'].includes('createObjectURL')) {
  throw new Error('engine.js must instantiate wasm from a blob URL');
}
if (!files['engine.js'].includes('wasmBinary')) {
  throw new Error('engine.js must pass wasmBinary');
}
if (!files['engine.js'].includes('The SQLite engine did not start on this device.')) {
  throw new Error('WASM miss must be one user-facing sentence');
}
if (!html.includes('id="sql"') || !html.includes('id="schema"') || !html.includes('id="results"')) {
  throw new Error('schema / query / results required');
}
if (!files['style.css'].includes('max-width: 720px') || !files['style.css'].includes('.schema-toggle')) {
  throw new Error('phone schema drawer required');
}
if (!files['boot.js'].includes('gifos.launch') || !files['boot.js'].includes('applyLaunch')) {
  throw new Error('boot.js must honour launch.sql');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/') || n === 'sql-wasm-b64.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  if (n === 'engine.js') continue; // blob URL + initSqlJs; no fetch of our own
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: sqlPlaygroundIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'sql-playground', 'sql-playground.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/sql-playground/sql-playground.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (wasm', (wasmBuf.length / 1024).toFixed(0), 'KB)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
