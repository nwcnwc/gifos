/*
 * vendor.mjs — rebuild the pinned KeeWeb engine (kdbxweb) and Argon2.
 *
 * The only step that needs the network. build.mjs is offline and reads the
 * committed files this writes. Run only to move a pin.
 *
 *   node apps/keeweb/vendor.mjs
 *
 * WHAT IT PRODUCES
 *   vendor/kdbxweb.js   kdbxweb 2.1.1 UMD, the same library KeeWeb uses to
 *                       read and write .kdbx. Classic script; window.kdbxweb.
 *   vendor/argon2.js    @noble/hashes Argon2 (pure JS) as an IIFE that installs
 *                       itself on kdbxweb.CryptoEngine — KDBX4 files need it,
 *                       and the sandbox has no WASM unless we ask, so this
 *                       stays capabilities.db with no network and no wasm.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const KDBXWEB = '2.1.1';
const NOBLE = '1.8.0';

const tmp = mkdtempSync(join(tmpdir(), 'keeweb-vendor-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 180000 });

console.log('installing kdbxweb@' + KDBXWEB + ' and @noble/hashes@' + NOBLE + '…');
run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev', '--ignore-scripts',
  'kdbxweb@' + KDBXWEB, '@noble/hashes@' + NOBLE], tmp);

const kdbxRoot = join(tmp, 'node_modules', 'kdbxweb');
const nobleRoot = join(tmp, 'node_modules', '@noble', 'hashes');
if (!existsSync(join(kdbxRoot, 'dist', 'kdbxweb.min.js'))) {
  throw new Error('kdbxweb dist/kdbxweb.min.js missing after npm install');
}
copyFileSync(join(kdbxRoot, 'dist', 'kdbxweb.min.js'), join(vendor, 'kdbxweb.js'));
copyFileSync(join(kdbxRoot, 'LICENSE'), join(vendor, 'COPYING-kdbxweb.txt'));
copyFileSync(join(nobleRoot, 'LICENSE'), join(vendor, 'COPYING-noble-hashes.txt'));

const entry = join(tmp, 'argon2-entry.js');
writeFileSync(entry, [
  "import { argon2dAsync, argon2iAsync, argon2idAsync } from '@noble/hashes/argon2';",
  "const FNS = { 0: argon2dAsync, 1: argon2iAsync, 2: argon2idAsync };",
  "(function install() {",
  "  const kw = (typeof window !== 'undefined' ? window : globalThis).kdbxweb;",
  "  if (!kw || !kw.CryptoEngine || !kw.CryptoEngine.setArgon2Impl) {",
  "    throw new Error('vendor/argon2.js must load after vendor/kdbxweb.js');",
  "  }",
  "  kw.CryptoEngine.setArgon2Impl(function (password, salt, memory, iterations, length, parallelism, type, version) {",
  "    const fn = FNS[type] || argon2idAsync;",
  "    const pass = password instanceof Uint8Array ? password : new Uint8Array(password);",
  "    const slt = salt instanceof Uint8Array ? salt : new Uint8Array(salt);",
  "    return fn(pass, slt, { t: iterations, m: memory, p: parallelism, dkLen: length, version: version })",
  "      .then(function (h) { return h.buffer; });",
  "  });",
  "})();",
  ""
].join('\n'));

const out = join(vendor, 'argon2.js');
run('npx', ['--yes', 'esbuild', entry, '--bundle', '--format=iife', '--platform=browser',
  '--outfile=' + out, '--legal-comments=none'], tmp);

const argon = readFileSync(out, 'utf8');
if (/<\/script/i.test(argon)) throw new Error('argon2.js contains </script — cannot inline');
if (/<\/script/i.test(readFileSync(join(vendor, 'kdbxweb.js'), 'utf8'))) {
  throw new Error('kdbxweb.js contains </script — cannot inline');
}

writeFileSync(join(vendor, 'UPSTREAM.txt'), [
  'vendor/kdbxweb.js and vendor/argon2.js are GENERATED. Do not edit them;',
  'run node apps/keeweb/vendor.mjs to rebuild from the pins.',
  '',
  'kdbxweb:        https://github.com/keeweb/kdbxweb  npm ' + KDBXWEB,
  '                git 9b86a035a53f1827e427a0fc081bdcccc24f4f1b',
  'argon2:         @noble/hashes ' + NOBLE + ' (Paul Miller, MIT) — pure JS, no WASM',
  'keeweb (UI/product this is a port of):',
  '                https://github.com/keeweb/keeweb  MIT, Antelle',
  '',
  'Licences ride beside the bytes here AND inside the GIF:',
  '  COPYING-keeweb.txt COPYING-kdbxweb.txt COPYING-noble-hashes.txt',
  ''
].join('\n'));

rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/kdbxweb.js (' + (readFileSync(join(vendor, 'kdbxweb.js')).length / 1024).toFixed(0) + ' KB)');
console.log('wrote vendor/argon2.js (' + (readFileSync(out).length / 1024).toFixed(0) + ' KB)');
