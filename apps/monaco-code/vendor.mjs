/*
 * vendor.mjs — rebuild vendor/ from the pinned monaco-editor npm tarball.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/monaco-code/vendor.mjs
 *
 * Bundles a WORKING SUBSET: editor + all basic-language tokenizers + JSON and
 * TypeScript language services (JS/TS IntelliSense, JSON validation). HTML/CSS
 * language-service workers are omitted; those languages still highlight.
 * Workers are classic IIFE scripts (the sandbox refuses type:module blob
 * workers in an opaque origin) so the app can mint them from GIF bytes.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, cpSync, existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const VERSION = '0.52.2';
const TARBALL_URL = 'https://registry.npmjs.org/monaco-editor/-/monaco-editor-' + VERSION + '.tgz';
const TARBALL_SHA256 = 'c280cdcf0b0c13d1a2bf01af958d4387ed06d7f6c918401d00c4adcae1bc72b6';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const res = await fetch(TARBALL_URL);
if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + TARBALL_URL);
const tgz = Buffer.from(await res.arrayBuffer());
const tgzHex = sha256(tgz);
if (tgzHex !== TARBALL_SHA256) {
  throw new Error('monaco-editor tarball sha256 ' + tgzHex + ' ≠ pin ' + TARBALL_SHA256);
}

const tmp = mkdtempSync(join(tmpdir(), 'monaco-code-'));
const tgzPath = join(tmp, 'monaco.tgz');
writeFileSync(tgzPath, tgz);
execFileSync('tar', ['-xzf', tgzPath, '-C', tmp]);
const pkg = join(tmp, 'package');
if (!existsSync(join(pkg, 'LICENSE'))) throw new Error('tarball missing LICENSE');

const entry = join(pkg, 'esm/vs/editor/gifos-entry.js');
writeFileSync(entry, [
  "import '../basic-languages/monaco.contribution.js';",
  "import '../language/json/monaco.contribution.js';",
  "import '../language/typescript/monaco.contribution.js';",
  "export * from './edcore.main.js';",
  ''
].join('\n'));

function findEsbuild() {
  try {
    const req = createRequire(join(dir, '../../package.json'));
    return req.resolve('esbuild/bin/esbuild');
  } catch (_) {}
  return null;
}

let esbuildBin = findEsbuild();
if (!esbuildBin) {
  const esTmp = mkdtempSync(join(tmpdir(), 'esbuild-bin-'));
  execFileSync('npm', ['install', 'esbuild@0.24.2', '--no-save', '--prefix', esTmp], {
    stdio: 'inherit'
  });
  esbuildBin = join(esTmp, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (!existsSync(esbuildBin)) throw new Error('esbuild did not install at ' + esbuildBin);
}

function build(args) {
  execFileSync(esbuildBin, args, { stdio: 'inherit', cwd: pkg });
}

const common = [
  '--bundle',
  '--minify',
  '--legal-comments=none',
  '--target=es2020',
  '--charset=utf8',
  '--loader:.css=empty',
  '--loader:.ttf=empty'
];

console.log('bundling monaco editor…');
build([
  entry,
  ...common,
  '--format=iife',
  '--global-name=monaco',
  '--footer:js=globalThis.monaco=monaco;',
  `--outfile=${join(vendor, 'monaco.js')}`
]);

console.log('bundling editor.worker…');
build([
  join(pkg, 'esm/vs/editor/editor.worker.js'),
  ...common,
  '--format=iife',
  `--outfile=${join(vendor, 'editor.worker.js')}`
]);

console.log('bundling json.worker…');
build([
  join(pkg, 'esm/vs/language/json/json.worker.js'),
  ...common,
  '--format=iife',
  `--outfile=${join(vendor, 'json.worker.js')}`
]);

console.log('bundling ts.worker (this is the TypeScript compiler)…');
build([
  join(pkg, 'esm/vs/language/typescript/ts.worker.js'),
  ...common,
  '--format=iife',
  `--outfile=${join(vendor, 'ts.worker.js')}`
]);

const cssSrc = readFileSync(join(pkg, 'min/vs/editor/editor.main.css'), 'utf8');
const ttf = readFileSync(join(pkg, 'min/vs/base/browser/ui/codicons/codicon/codicon.ttf'));
const ttfUrl = 'url(data:font/truetype;base64,' + ttf.toString('base64') + ')';
const css = cssSrc.replace(
  /url\(\.\.\/base\/browser\/ui\/codicons\/codicon\/codicon\.ttf\)/g,
  ttfUrl
);
if (css === cssSrc) throw new Error('did not find codicon.ttf url in editor.main.css');
if (!css.includes('data:font/truetype;base64,')) throw new Error('codicon font was not inlined');
if (/url\(\s*['"]?https?:/i.test(css) || css.includes('../')) {
  throw new Error('monaco.css still has a relative or remote url()');
}
writeFileSync(join(vendor, 'monaco.css'), css);

cpSync(join(pkg, 'LICENSE'), join(vendor, 'COPYING-monaco.txt'));
cpSync(join(pkg, 'ThirdPartyNotices.txt'), join(vendor, 'ThirdPartyNotices.txt'));

const outputs = [
  'monaco.js', 'monaco.css',
  'editor.worker.js', 'json.worker.js', 'ts.worker.js',
  'COPYING-monaco.txt', 'ThirdPartyNotices.txt'
];
const lines = [
  'monaco-editor ' + VERSION,
  'npm ' + TARBALL_URL,
  'tarball sha256 ' + TARBALL_SHA256,
  'vscodeRef a7d9e2c32d573e29e68975838196722ae9bb0f15',
  'subset: editor.all + basic-languages + json LS + typescript LS',
  'workers: classic IIFE (no type:module) for blob: Worker in the sandbox',
  ''
];
for (const name of outputs) {
  const buf = readFileSync(join(vendor, name));
  const hex = sha256(buf);
  lines.push(name + '  ' + buf.length + '  ' + hex);
  const text = buf.toString('utf8');
  if (name.endsWith('.js')) {
    if (/<\/script/i.test(text)) throw new Error(name + ' contains </script — cannot inline safely');
    if (/import\.meta\.(url|resolve)/.test(text)) {
      throw new Error(name + ' still contains import.meta.url — classic workers cannot load it');
    }
    // Do not scan for a lone "import" keyword — monaco's JS tokenizer lists it.
    if (/^(import\s|export\s|export\{)/m.test(text.slice(0, 80))) {
      throw new Error(name + ' still looks like ESM');
    }
  }
}
writeFileSync(join(vendor, 'UPSTREAM.txt'), lines.join('\n') + '\n');

rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/ from monaco-editor ' + VERSION);
for (const name of outputs) {
  const n = readFileSync(join(vendor, name)).length;
  console.log('  ' + name + '  ' + (n / 1024).toFixed(0) + ' KB');
}
