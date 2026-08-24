// Pack apps/yopass/ into site/apps/yopass/yopass.gif
import { yopassIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

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

for (const need of ['vendor/COPYING-yopass.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'yopass') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('db + multiplayer');
}
if (manifest.capabilities.network) throw new Error('no network — their Go/Redis stays behind');
if (manifest.capabilities.wasm) throw new Error('classic JS');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') throw new Error('room read-write');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.name !== 'Yopass') throw new Error('basedOn.name');
if (/gifos/i.test(listing.author.name)) throw new Error('author is them');
if (listing.license !== 'Apache-2.0') throw new Error('Apache-2.0');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/yopass') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['crypto.js', 'app.js'];
const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'crypto.js': read('crypto.js'),
  'app.js': read('app.js'),
  'COPYING-yopass.txt': read('vendor/COPYING-yopass.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'help.md': helpMd,
};
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button');
}
if (!files['app.js'].includes('Invite')) throw new Error('tell the player to press Invite');
if (/socket\.io|firebase|redis|openpgp/i.test(files['app.js'] + files['crypto.js'])) {
  throw new Error('their backend stays behind');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-yopass.txt'].includes('Apache License')) throw new Error('COPYING is not Apache-2.0');

{
  const ctx = { console, result: null, crypto: webcrypto, btoa, atob, TextEncoder, TextDecoder, Uint8Array, Promise };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  await new Promise((resolve, reject) => {
    ctx.result = resolve;
    ctx.fail = reject;
    vm.runInNewContext(
      files['crypto.js'] + '\n' +
      'YopassCrypto.lock("hello-secret", "correct horse").then(function (rec) {\n' +
      '  if (!rec.hasPass || !rec.ct || !rec.iv || !rec.salt) throw new Error("shape");\n' +
      '  return YopassCrypto.unlock(rec, "correct horse").then(function (p) {\n' +
      '    if (p !== "hello-secret") throw new Error("roundtrip " + p);\n' +
      '    return YopassCrypto.unlock(rec, "wrong").then(function () {\n' +
      '      throw new Error("wrong passphrase should fail");\n' +
      '    }, function () { return YopassCrypto.lock("plain", ""); });\n' +
      '  });\n' +
      '}).then(function (rec) {\n' +
      '  if (rec.hasPass) throw new Error("no-pass should not set hasPass");\n' +
      '  return YopassCrypto.unlock(rec, null).then(function (p) {\n' +
      '    if (p !== "plain") throw new Error("nopass " + p);\n' +
      '    result("ok");\n' +
      '  });\n' +
      '}).catch(fail);\n',
      ctx
    );
  });
  console.log('AES-GCM lock/unlock ok');
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: yopassIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'yopass', 'yopass.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/yopass/yopass.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no Go, no Redis)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
