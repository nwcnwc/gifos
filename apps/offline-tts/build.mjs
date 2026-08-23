// Pack apps/offline-tts/ source into the finished, downloadable
// site/apps/offline-tts/offline-tts.gif (see apps/README.md).
//
// The engine rides INSIDE the GIF — chess-grandmaster's pattern exactly:
//   engine.js       → the eSpeak core (vendor/espeak.js: speak.js/meSpeak
//                     build, GPLv3, pre-wrapped to window.__ESpeak), inlined
//                     as an executable <script> by the runtime.
//   engine-data.js  → window.PV_CONFIG_JSON: mespeak-config.json as a JS
//                     string module (config/phontab/phonindex/phondata/
//                     intonations, base64 inside the JSON).
//   voice-data.js   → window.PV_VOICE_JSON: the en-us voice + dictionary.
// ~5.6 MB raw, ~1.6 MB after the GIF payload's deflate — comfortably in-GIF.
// The install-time assets pattern (gifos-assets.js) is deliberately NOT used
// here: it is reserved for weights too big to live in a GIF at all
// (docs/providers.md — think multi-tens-of-MB model files on a public host).
//
// Run:  node apps/offline-tts/build.mjs
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { offlineTtsIcon } from './icon.mjs';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush.
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
if (manifest.assets) throw new Error('offline-tts packs its engine in-GIF — a manifest.assets declaration here is a mistake (docs/providers.md: assets are for far bigger weights).');

const core = read('vendor/espeak.js');
if (!/window\.__ESpeak\s*=/.test(core)) throw new Error('vendor/espeak.js is not the wrapped core (expected window.__ESpeak = …).');
// Inlined as an executable <script>; a literal "</script>" inside would close
// the tag early. The staged core has none — assert it stays that way.
if (/<\/script/i.test(core)) throw new Error('vendor/espeak.js contains </script — cannot inline safely.');

// A JS string module. Escaping "</" keeps any "</script>" inside the payload
// from prematurely closing the <script> the runtime inlines it into.
const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

const helpMd = read('help.md').replace(/^\uFEFF/, '');
if (helpMd.trim().length < 400) throw new Error('help.md must be at least 400 characters after trim');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'help.md': helpMd,
  'engine.js': core,
  'engine-data.js': strModule('window.PV_CONFIG_JSON', read('vendor/mespeak-config.json')),
  'voice-data.js': strModule('window.PV_VOICE_JSON', read('vendor/voice-en-us.json')),
  'COPYING-espeak.txt': read('COPYING-espeak.txt'),
};

const bytes = await gif.encode(files, { preview: offlineTtsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'offline-tts', 'offline-tts.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/offline-tts/offline-tts.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (engine in-GIF)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
