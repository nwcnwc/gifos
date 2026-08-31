// Pack apps/regexr/ into site/apps/regexr/regexr.gif.
import { regexrIcon, screenshotPng } from './icon.mjs';
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
        throw new Error('unsupported format ' + format);
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

for (const need of [
  'vendor/lexer.js', 'vendor/profiles.js', 'vendor/reference.js', 'vendor/cheatsheet.js',
  'vendor/COPYING.txt', 'vendor/UPSTREAM.txt', 'COPYING.txt',
  'help.md', 'app.js', 'net.js', 'tester.js', 'style.css', 'index.html'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947 || manifest.appId !== 'regexr') throw new Error('manifest');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('no network');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save private');
if (!manifest.data.recents || manifest.data.recents.visibility !== 'private') throw new Error('recents private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') throw new Error('room read-write');
if (listing.basedOn.blessed !== false || listing.basedOn.name !== 'RegExr') throw new Error('basedOn');
if (listing.basedOn.url !== 'https://github.com/gskinner/regexr') throw new Error('basedOn.url');
if (listing.author.name !== 'Grant Skinner' || listing.porter.name !== 'GifOS') throw new Error('author');
if (listing.license !== 'GPL-3.0') throw new Error('license');
if (!listing.homepage.includes('/apps/regexr')) throw new Error('homepage');
if (!listing.description.toLowerCase().includes('offline')) throw new Error('listing offline');
if (!listing.description.includes('Invite')) throw new Error('listing invite');
if (!listing.description.toLowerCase().includes('unofficial')) throw new Error('unofficial');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}

const PIN = 'd18630d02372b38614f220576bd1888326cf8e78';
if (!read('vendor/UPSTREAM.txt').includes(PIN)) throw new Error('UPSTREAM pin');

const SCRIPTS = [
  'vendor/profiles.js', 'vendor/lexer.js', 'vendor/reference.js', 'vendor/cheatsheet.js',
  'tester.js', 'net.js', 'app.js'
];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/profiles.js': read('vendor/profiles.js'),
  'vendor/lexer.js': read('vendor/lexer.js'),
  'vendor/reference.js': read('vendor/reference.js'),
  'vendor/cheatsheet.js': read('vendor/cheatsheet.js'),
  'tester.js': read('tester.js'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  'COPYING.txt': read('COPYING.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  if (/gifos\.db|sandbox|connect-src|localStorage/i.test(helpMd)) throw new Error('help internals');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (!html.includes('href="style.css"')) throw new Error('style');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('Invite is OS chrome');
if (!html.includes('btnKeep') || !html.includes('sideBody') || !html.includes('expHl')) throw new Error('chrome');

if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("db('recents')")) throw new Error('save/recents');
if (!files['net.js'].includes("db('room')") || !files['net.js'].includes('Invite')) throw new Error('net');
if (!files['tester.js'].includes('solveText') || !files['tester.js'].includes('replaceAll')) throw new Error('tester');
if (!files['app.js'].includes('gifos.onBack') && !files['app.js'].includes('onBack')) throw new Error('onBack');
if (/\.match[^{]*\{[^}]*color:\s*transparent/.test(files['style.css'])) {
  throw new Error('matches must not paint over the text');
}
if (!/#textHl mark\.match/.test(files['style.css']) || !/mark\.match[^}]*color:\s*var\(--ink\)/.test(files['style.css'])) {
  throw new Error('matched letters stay ink on the gold wash');
}
if (!files['net.js'].includes('primed') || !files['net.js'].includes('onRemote')) {
  throw new Error('guest must adopt the host live row before publishing');
}
if (files['app.js'].indexOf('net.watch()') < files['app.js'].indexOf("saveDb.get('current')")) {
  throw new Error('watch after local load — host must publish THIS expression');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  if (n.startsWith('vendor/')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING.txt'].includes('GNU GENERAL PUBLIC LICENSE')) throw new Error('COPYING');

{
  const ctx = { console };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(files['vendor/profiles.js'], ctx);
  vm.runInContext(files['vendor/lexer.js'], ctx);
  vm.runInContext(files['tester.js'], ctx);
  const ok = vm.runInContext(`
    (function () {
      var L = new RegExrLexer();
      L.profile = RegExrProfiles.js;
      var tok = L.parse("/([A-Z])\\\\w+/g");
      if (!tok) throw new Error("no tokens");
      var r = RegExrTester.solveText("([A-Z])\\\\w+", "g", "Hello World test");
      if (!r.matches || r.matches.length !== 2) throw new Error("matches " + JSON.stringify(r.matches));
      if (r.matches[0].s !== "Hello" || r.matches[1].s !== "World") throw new Error("caps");
      var p = RegExrTester.solveText("persistME_42", "g", "persistME_42 lives in the file");
      if (!p.matches || p.matches.length !== 1 || p.matches[0].s !== "persistME_42") throw new Error("persistME");
      var rep = RegExrTester.replaceAll("([A-Z])\\\\w+", "g", "Hello World", "$1");
      if (rep.result !== "H W") throw new Error("replace " + JSON.stringify(rep));
      var t = RegExrTester.runTests("a+", "g", [
        { id: "1", text: "aa", type: "any" },
        { id: "2", text: "bb", type: "none" },
        { id: "3", text: "aaa", type: "all" }
      ]);
      if (!t.results[0].pass || !t.results[1].pass || !t.results[2].pass) throw new Error("tests");
      return "ok " + r.matches.length;
    })()
  `, ctx);
  console.log('tester checks', ok);
}

{
  /* Guest join must adopt the host's live row, not publish the sample. */
  const coll = Object.create(null);
  const subs = [];
  const listOf = () => Object.keys(coll).map((k) => JSON.parse(JSON.stringify(coll[k])));
  const room = {
    put(item) {
      coll[item.id] = JSON.parse(JSON.stringify(item));
      const L = listOf();
      subs.forEach((cb) => Promise.resolve().then(() => cb(L)));
      return Promise.resolve();
    },
    getAll() { return Promise.resolve(listOf()); },
    subscribe(cb) { subs.push(cb); this.getAll().then(cb); }
  };
  function client(id, name, owner, state) {
    const ctx = { console, Date, Promise, JSON };
    ctx.window = ctx;
    ctx.gifos = {
      db() { return room; },
      me() { return Promise.resolve({ id, name }); },
      info() { return Promise.resolve({ owner }); }
    };
    vm.createContext(ctx);
    vm.runInContext(files['net.js'], ctx);
    const remote = [];
    ctx.RegExrNet.getState = () => state;
    ctx.RegExrNet.onRemote = (row) => {
      remote.push(row);
      if (row.pattern != null) state.pattern = row.pattern;
      if (row.flags != null) state.flags = row.flags;
      if (row.text != null) state.text = row.text;
    };
    return { state, remote, net: ctx.RegExrNet };
  }
  const host = client('host', 'Hana', true, {
    pattern: 'fromHOST_99', flags: 'g', text: 'fromHOST_99 lives here'
  });
  const guest = client('guest', 'Cleo', false, {
    pattern: '([A-Z])\\w+', flags: 'g', text: 'RegExr was created by gskinner.com.'
  });
  const tick = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  host.net.watch();
  await tick();
  guest.net.watch();
  await tick();
  const live = coll.live;
  if (!live || live.pattern !== 'fromHOST_99') {
    throw new Error('guest overwrote host live ' + JSON.stringify(live));
  }
  if (!guest.remote.length || guest.remote[0].pattern !== 'fromHOST_99') {
    throw new Error('guest did not land on host expression ' + JSON.stringify(guest.remote));
  }
  if (guest.state.pattern !== 'fromHOST_99') throw new Error('guest state ' + guest.state.pattern);
  console.log('invite checks guest adopted fromHOST_99');

  /* Guest first (empty room): must not publish the sample over the host. */
  Object.keys(coll).forEach((k) => { delete coll[k]; });
  subs.length = 0;
  const host2 = client('host2', 'Hana', true, {
    pattern: 'fromHOST_99', flags: 'g', text: 'fromHOST_99 lives here'
  });
  const guest2 = client('guest2', 'Cleo', false, {
    pattern: '([A-Z])\\w+', flags: 'g', text: 'RegExr was created by gskinner.com.'
  });
  guest2.net.watch();
  await tick();
  if (coll.live) throw new Error('guest published sample first ' + JSON.stringify(coll.live));
  host2.net.watch();
  await tick();
  if (!coll.live || coll.live.pattern !== 'fromHOST_99') {
    throw new Error('early guest overwrote host ' + JSON.stringify(coll.live));
  }
  if (!guest2.remote.length || guest2.remote[0].pattern !== 'fromHOST_99') {
    throw new Error('early guest did not adopt ' + JSON.stringify(guest2.remote));
  }
  console.log('invite checks early guest waited then adopted fromHOST_99');
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: regexrIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'regexr', 'regexr.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/regexr/regexr.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
