import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const dir = dirname(fileURLToPath(import.meta.url));
const TAG = '1.8.4';
const TARBALL = 'https://registry.npmjs.org/@coderline/alphatab/-/alphatab-' + TAG + '.tgz';

const PINS = {
  'alphaTab.min.js': { src: 'package/dist/alphaTab.min.js', sha: '2d0335501b875453d52359de23cd9cebfcf71aed3d5739f1cf95117acfd52bec', bytes: 1120736 },
  'Bravura.woff2': { src: 'package/dist/font/Bravura.woff2', sha: '181e0e7c4889f9ad57dde0a11988fa61b941617aa499ecdb9dfd4713896c2b19', bytes: 313348 },
  'sonivox.sf3': { src: 'package/dist/soundfont/sonivox.sf3', sha: 'd39beb7cd349278455b44e7689e35e3c1f5ed9ef80118485846537929df8f7c0', bytes: 977208 },
  'COPYING-alphatab.txt': { src: 'package/LICENSE', sha: 'de981130586154b6ce2cf91528b9291789192d62234d0d7e6e41d085b8e1d351', bytes: 16901 },
  'COPYING-bravura.txt': { src: 'package/dist/font/Bravura-OFL.txt', sha: 'c24929be7028026a65ee8894da1e3c36d2a4ccce0548d9ba8ba64509f46319ee', bytes: 4420 },
  'COPYING-sonivox.txt': { src: 'package/dist/soundfont/LICENSE', sha: '57d801cd718614be838c71f35cf3dcbf5c011fa20130c194a447483dfa2771c5', bytes: 561 },
};

const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'alphatab-'));
const tgz = join(tmp, 'a.tgz');
const res = await fetch(TARBALL);
if (!res.ok) throw new Error('download failed ' + res.status);
writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
execFileSync('tar', ['-xzf', tgz, '-C', tmp], { timeout: 60000 });

function pin(name) {
  const spec = PINS[name];
  const buf = readFileSync(join(tmp, spec.src));
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== spec.sha) throw new Error(name + ' sha256 ' + hex + ' ≠ pin ' + spec.sha);
  if (buf.length !== spec.bytes) throw new Error(name + ' size ' + buf.length + ' ≠ ' + spec.bytes);
  return buf;
}

const js = pin('alphaTab.min.js');
if (/<\/script/i.test(js.toString('utf8'))) throw new Error('</script in alphaTab.min.js');
if (!js.toString('utf8').includes('.alphaTab=')) throw new Error('UMD global missing');
writeFileSync(join(vendor, 'alphaTab.min.js'), js);
writeFileSync(join(vendor, 'Bravura.woff2'), pin('Bravura.woff2'));
writeFileSync(join(vendor, 'sonivox.sf3'), pin('sonivox.sf3'));
writeFileSync(join(vendor, 'COPYING-alphatab.txt'), pin('COPYING-alphatab.txt'));
writeFileSync(join(vendor, 'COPYING-bravura.txt'), pin('COPYING-bravura.txt'));
writeFileSync(join(vendor, 'COPYING-sonivox.txt'), pin('COPYING-sonivox.txt'));

const upstream = [
  'alphaTab ' + TAG + ' UMD (MPL-2.0) from npm @coderline/alphatab',
  'Source: https://github.com/CoderLine/alphaTab',
  'npm:    ' + TARBALL,
  '',
  'alphaTab.min.js   ' + PINS['alphaTab.min.js'].bytes + '  ' + PINS['alphaTab.min.js'].sha,
  'Bravura.woff2     ' + PINS['Bravura.woff2'].bytes + '   ' + PINS['Bravura.woff2'].sha,
  'sonivox.sf3       ' + PINS['sonivox.sf3'].bytes + '   ' + PINS['sonivox.sf3'].sha,
  '',
  'Bravura is SIL Open Font License 1.1 (Steinberg Media Technologies).',
  'sonivox.sf3 is the SONiVOX GM soundfont shipped with alphaTab (Apache-2.0).',
  'TinySoundFont (MIT) and SFZero (MIT) are compiled into the UMD — see the',
  'header of alphaTab.min.js and COPYING-alphatab.txt.',
  '',
  'The UMD is a classic script. Workers are minted from a blob of the same',
  'bytes (capabilities.wasm). Playback uses WebAudioScriptProcessor so the',
  'AudioWorklet module path is never taken.',
].join('\n') + '\n';
writeFileSync(join(vendor, 'UPSTREAM.txt'), upstream);

console.log('wrote vendor/ alphaTab@' + TAG);
rmSync(tmp, { recursive: true, force: true });
