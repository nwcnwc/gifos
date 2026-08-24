// Pack apps/piskel/ into the finished, downloadable
// site/apps/piskel/piskel.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned upstream and is run only when the pin moves.
//
// Run:  node apps/piskel/build.mjs
import { piskelIcon } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

for (const need of ['vendor/piskel.js', 'vendor/piskel.css', 'index.html']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/piskel/vendor.mjs first (it needs the network).');
  }
}

function safeScript(s) {
  // Escape ONLY `</script` (case-insensitive) — the one sequence that would
  // terminate the inline <script> block the runtime packs these files into.
  // A blanket `</` → `<\/` escape corrupts REGEX literals (e.g. upstream's
  // /</g became the unterminated /<\/g); see vendor.mjs for the full story.
  return s.replace(/<\/(script)/gi, '<\\/$1');
}

const SCRIPTS = ['boot.js', 'vendor/piskel.js'];

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'boot.js': safeScript(read('boot.js')),
  'vendor/piskel.js': safeScript(read('vendor/piskel.js')),
  'vendor/piskel.css': read('vendor/piskel.css'),
  'LICENSE': read('LICENSE'),
  'NOTICE': read('NOTICE'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/piskel.css"')) throw new Error('index.html does not load vendor/piskel.css');
if (/<\/script/i.test(files['vendor/piskel.js'])) {
  throw new Error('vendor/piskel.js contains </script after escaping — cannot inline safely.');
}

const bytes = await gif.encode(files, { preview: piskelIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'piskel');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'piskel.gif'), bytes);
console.log('wrote site/apps/piskel/piskel.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');

const shot = join(dir, 'screenshot.png');
const cover = join(outDir, 'cover.jpg');
if (existsSync(shot)) {
  try {
    const sharp = (await import('sharp')).default;
    const buf = await sharp(shot)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();
    const stale = !existsSync(cover) || statSync(cover).mtimeMs < statSync(shot).mtimeMs
      || Buffer.compare(readFileSync(cover), buf) !== 0;
    if (stale) {
      writeFileSync(cover, buf);
      console.log('wrote site/apps/piskel/cover.jpg from screenshot.png —', (buf.length / 1024).toFixed(0), 'KB');
    }
  } catch (e) {
    console.log('note: could not write cover.jpg (' + e.message + ') — catalog will make it from screenshot.png');
  }
} else {
  console.log('note: apps/piskel/screenshot.png is missing — vendor.mjs writes it');
}
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
