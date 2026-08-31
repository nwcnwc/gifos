/*
 * vendor.mjs — rebuild vendor/webamp.bundle.min.js from the pinned npm tarball.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/webamp/vendor.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIN = '2.2.0';
const URL = 'https://unpkg.com/webamp@' + PIN + '/built/webamp.bundle.min.js';
const LICENSE = 'https://raw.githubusercontent.com/captbaritone/webamp/master/LICENSE.txt';
const EXPECT = 'e416f79b94d549f7d531b365e9751c5932c6b2dc5990d062aa52bd41f22d190c';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const js = await (await fetch(URL)).text();
if (!js.includes('window.Webamp') && !js.includes(').Webamp=')) {
  // UMD header assigns globalThis.Webamp
  if (!js.includes('globalThis') || !js.includes('.Webamp=')) {
    throw new Error('downloaded file does not look like the Webamp UMD bundle');
  }
}
if (/<\/script/i.test(js)) throw new Error('bundle contains </script — cannot inline');
const stripped = js.replace(/\n?\/\/# sourceMappingURL=.*$/m, '');
const sha = createHash('sha256').update(stripped).digest('hex');
if (PIN === '2.2.0' && sha !== EXPECT) {
  throw new Error('sha256 ' + sha + ' !== pin ' + EXPECT + ' — move EXPECT deliberately.');
}
writeFileSync(join(vendor, 'webamp.bundle.min.js'), stripped);

const lic = await (await fetch(LICENSE)).text();
writeFileSync(join(vendor, 'COPYING-webamp.txt'), lic);

writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'webamp ' + PIN + '\n' +
  'https://github.com/captbaritone/webamp\n' +
  'https://www.npmjs.com/package/webamp\n\n' +
  'Pinned file: built/webamp.bundle.min.js (UMD, window.Webamp)\n' +
  'Source: ' + URL + '\n' +
  'SHA-256 (after stripping the sourceMappingURL comment):\n  ' + sha + '\n\n' +
  'The default Winamp 2.91-look skin is compiled into that bundle as CSS\n' +
  '(Webamp\'s own MIT distribution). This tree does not ship Nullsoft\'s\n' +
  'llama MP3 or a separate .wsz of their bitmaps. User-dropped .wsz skins\n' +
  'and MP3s live in the app\'s saved data, not at a URL.\n\n' +
  'Rebuild (needs the network, not part of build.mjs):\n\n' +
  '  node apps/webamp/vendor.mjs\n'
);

console.log('vendor/webamp.bundle.min.js', (stripped.length / 1024).toFixed(0), 'KB sha256', sha);
void readFileSync; // keep import used if we later verify on disk
