// Pack apps/cyberchef/ into site/apps/cyberchef/cyberchef.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which pulls the pinned CyberChef
// production build and is run only when the pin moves.
//
// The production JS is too big to inline. Uncompressed main.js + modules is
// ~39 MB; JSON+base64 of that (plus a duplicate modules-data.js) blows the
// GIF decoder's 64 MB inflate ceiling, and a 50 MB+ srcdoc kills the tab
// (pdf-tables-ocr's measured lesson). Gzipped bytes ride under `.assets/`
// and gifos.assets() serves them; boot.js inflates and injects. connect-src
// stays off the network (blob:/data: only, via capabilities.wasm).
//
// Run:  node --max-old-space-size=8192 apps/cyberchef/build.mjs
import { cyberChefIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync, gunzipSync, deflateRawSync, inflateRawSync } from 'node:zlib';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Same polyfill as hat-sh/build.mjs.
{
  const OrigC = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (OrigC) return new OrigC(format);
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
  const OrigD = globalThis.DecompressionStream;
  globalThis.DecompressionStream = class DecompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (OrigD) return new OrigD(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) {
          controller.enqueue(new Uint8Array(inflateRawSync(Buffer.concat(chunks))));
        }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
const gif = globalThis.GifOS.gif;

if (!existsSync(join(vendor, 'assets', 'main.js.gz'))) {
  throw new Error('vendor/ is missing — run node apps/cyberchef/vendor.mjs first (it needs the network).');
}

const read = (p) => readFileSync(join(dir, p), 'utf8');
const readV = (p) => readFileSync(join(vendor, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const MODULES = readdirSync(join(vendor, 'modules'))
  .filter((n) => n.endsWith('.js.gz'))
  .map((n) => n.slice(0, -'.js.gz'.length))
  .sort();
if (MODULES.length < 20) throw new Error('vendor/modules looks truncated (' + MODULES.length + ' bundles)');
if (MODULES.includes('OCR')) throw new Error('OCR.js was vendored — it fetches a language model, which connect-src cannot');

const FONTS = [
  'Roboto72White.fnt', 'Roboto72White.png',
  'RobotoBlack72White.fnt', 'RobotoBlack72White.png',
  'RobotoMono72White.fnt', 'RobotoMono72White.png',
  'RobotoSlab72White.fnt', 'RobotoSlab72White.png',
];

// Image.js loads bitmap fonts via fetch(r.p+"assets/fonts/…"). That URL is
// about:srcdoc here and connect-src refuses it. Rewrite the webpack exports
// to data: URLs (connect-src data: is part of the wasm hatch) so Render Image
// still has its typefaces, with no network.
let imageJs = gunzipSync(readV('modules/Image.js.gz')).toString('utf8');
for (const f of FONTS) {
  const bytes = readV('fonts/' + f);
  const mime = f.endsWith('.png') ? 'image/png' : 'application/octet-stream';
  const data = 'data:' + mime + ';base64,' + bytes.toString('base64');
  const needle = 'e.exports=r.p+"assets/fonts/' + f + '"';
  if (!imageJs.includes(needle)) throw new Error('Image.js no longer exports ' + f + ' as r.p+"assets/fonts/…"');
  imageJs = imageJs.split(needle).join('e.exports=' + JSON.stringify(data));
}
if (imageJs.includes('assets/fonts/')) throw new Error('Image.js still names assets/fonts/ after the data-URL rewrite');
const imageGz = gzipSync(Buffer.from(imageJs));

const mainCssRaw = gunzipSync(readV('assets/main.css.gz')).toString('utf8');
const ttf = readV('assets/02aafe15b98928fdaa38.ttf');
const ttfData = 'data:font/ttf;base64,' + ttf.toString('base64');
const mainCss = mainCssRaw.split('../assets/02aafe15b98928fdaa38.ttf').join(ttfData);
if (mainCss.includes('02aafe15b98928fdaa38.ttf') && !mainCss.includes('data:font/ttf')) {
  throw new Error('main.css still points at the TTF file after inlining');
}

let html = readV('index.html').toString('utf8');
html = html.replace(/<!-- Begin Google Analytics -->[\s\S]*/, '');
html = html.replace(/<script async src="https:\/\/www\.googletagmanager\.com\/[^"]*"><\/script>\s*/g, '');
html = html.replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>\s*/g, '');
if (/googletagmanager|google-analytics|gtag\(/i.test(html)) {
  throw new Error('Google Analytics leaked into the packed HTML');
}
if (!/<\/body>/i.test(html)) html += '</body></html>';
html = html.replace(/<script defer="defer" src="assets\/main\.js"><\/script>/, '');
html = html.replace('<html lang="en" class="classic">', '<html lang="en" class="dark">');
if (!html.includes('name="viewport"')) {
  html = html.replace('<meta charset="UTF-8">',
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
}
html = html.replace('</head>',
  '<script src="names.js"></script><script src="boot.js"></script></head>');

if (!html.includes('src="boot.js"')) throw new Error('index.html rewrite dropped boot.js');
if (!html.includes('src="names.js"')) throw new Error('index.html rewrite dropped names.js');
if (html.includes('src="assets/main.js"')) throw new Error('index.html still loads assets/main.js — that would inline 12 MB into the srcdoc');
if (!html.includes('href="assets/main.css"')) throw new Error('index.html does not load main.css');

const bootJs = read('boot.js');
if (/<\/script/i.test(bootJs)) throw new Error('boot.js contains </script — cannot inline safely');
if (!bootJs.includes('gifos.assets')) throw new Error('boot.js does not call gifos.assets');
if (!bootJs.includes('loadRequiredModules')) throw new Error('boot.js no longer wraps the ChefWorker Blob');
if (!bootJs.includes('gifos.db')) throw new Error('boot.js no longer persists into gifos.db');

const namesJs = 'window.GIFOS_CC_NAMES=' + JSON.stringify(MODULES) + ';';

const licenseTxts = [readV('LICENSE').toString('utf8')];
licenseTxts.push('\n\n----- assets/main.js.LICENSE.txt -----\n\n' + readV('assets/main.js.LICENSE.txt').toString('utf8'));
for (const name of MODULES) {
  const p = join(vendor, 'modules', name + '.js.LICENSE.txt');
  if (existsSync(p)) licenseTxts.push('\n\n----- modules/' + name + '.js.LICENSE.txt -----\n\n' + readFileSync(p, 'utf8'));
}

const notice = read('NOTICE') + '\n\n----- third-party notices from the production bundles -----\n' + licenseTxts.slice(1).join('');
if (!notice.includes('Crown Copyright')) throw new Error('NOTICE lost Crown Copyright');
if (!/UNOFFICIAL/i.test(notice)) throw new Error('NOTICE lost the unofficial-port addendum');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': html,
  'boot.js': bootJs,
  'names.js': namesJs,
  'assets/main.css': mainCss,
  'images/cook_male-32x32.png': readV('images/cook_male-32x32.png'),
  'images/cyberchef-128x128.png': readV('images/cyberchef-128x128.png'),
  'images/fork_me.png': readV('images/fork_me.png'),
  'LICENSE': readV('LICENSE').toString('utf8'),
  'NOTICE': notice,
  '.assets/main.js.gz': readV('assets/main.js.gz'),
  '.assets/modules/Image.js.gz': imageGz,
};

for (const name of MODULES) {
  if (name === 'Image') continue;
  files['.assets/modules/' + name + '.js.gz'] = readV('modules/' + name + '.js.gz');
}

for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  if (!(m[1] in files)) throw new Error('index.html loads script "' + m[1] + '", which build.mjs does not pack.');
}
const HREF_OK = new Set(['boot.js', 'names.js', 'assets/main.css',
  'images/cook_male-32x32.png', 'images/cyberchef-128x128.png', 'images/fork_me.png']);
for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  if (m[1] in files && !HREF_OK.has(m[1])) {
    throw new Error('index.html references packed file "' + m[1] + '" by src/href — would become a data: URL in the srcdoc.');
  }
  if (String(m[1]).startsWith('.assets/')) {
    throw new Error('index.html references ' + m[1] + ' by src/href — .assets/ must go through gifos.assets()');
  }
}

if (!files['LICENSE'].includes('Apache License')) throw new Error('packed LICENSE is not Apache-2.0');
if (!/Crown Copyright/.test(html)) throw new Error('packed HTML lost the Crown Copyright notice');

const bytes = await gif.encode(files, { preview: cyberChefIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'cyberchef');
mkdirSync(outDir, { recursive: true });
const gifPath = join(outDir, 'cyberchef.gif');
writeFileSync(gifPath, bytes);

const archive = await gif.decode(bytes);
if (!archive || !archive.files) throw new Error('packed GIF does not decode');
for (const need of ['LICENSE', 'NOTICE', 'boot.js', 'index.html', '.assets/main.js.gz', '.assets/modules/Image.js.gz']) {
  if (!archive.files[need]) throw new Error('packed GIF is missing ' + need);
}
const packedLicense = gif.bytesToText(archive.files['LICENSE']);
if (!packedLicense.includes('Apache License')) throw new Error('decoded LICENSE is not Apache-2.0');
const packedNotice = gif.bytesToText(archive.files['NOTICE']);
if (!packedNotice.includes('Crown Copyright')) throw new Error('decoded NOTICE lost Crown Copyright');
if (!/UNOFFICIAL/i.test(packedNotice)) throw new Error('decoded NOTICE lost unofficial-port addendum');
if (gif.bytesToText(archive.files['index.html']).includes('assets/main.js')) {
  throw new Error('decoded index.html still references assets/main.js');
}

const rec = {
  catalog: '1.0',
  slug: 'cyberchef',
  appId: manifest.appId,
  name: manifest.name,
  shortName: manifest.shortName,
  version: manifest.version,
  minBuild: manifest.minBuild,
  tagline: listing.tagline,
  description: listing.description,
  author: listing.author,
  releaseDate: listing.releaseDate,
  updated: listing.updated || listing.releaseDate,
  categories: listing.categories,
  tags: listing.tags || [],
  license: listing.license,
  homepage: listing.homepage || '',
  accent: manifest.accent || null,
  capabilities: manifest.capabilities || {},
  cover: '/apps/cyberchef/cover.jpg',
  screenshots: [],
  gif: '/apps/cyberchef/cyberchef.gif',
  bytes: bytes.length,
  download: 0,
  provides: null,
  sha256: sha256(bytes),
  signature: null,
  porter: listing.porter,
  basedOn: listing.basedOn,
};
writeFileSync(join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');

const coverSrc = join(dir, listing.cover || 'screenshot.png');
const coverOut = join(outDir, 'cover.jpg');
if (!existsSync(coverSrc)) throw new Error('cover art missing at ' + (listing.cover || 'screenshot.png'));
if (!existsSync(coverOut) || statSync(coverSrc).mtimeMs > statSync(coverOut).mtimeMs) {
  const sharp = (await import('sharp')).default;
  const jpg = await sharp(coverSrc)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  writeFileSync(coverOut, jpg);
}

const raw = Object.values(files).reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : v.length), 0);
const mb = (n) => (n / 1e6).toFixed(2);
console.log('wrote site/apps/cyberchef/cyberchef.gif —', mb(bytes.length), 'MB, from',
            Object.keys(files).length, 'files (' + mb(raw), 'MB raw; engine gzipped under .assets/)');
console.log('modules:', MODULES.join(', '));
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
