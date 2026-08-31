/*
 * vendor.mjs — rebuild vendor/jscad-modeling.min.js from the pinned
 * @jscad/modeling. This is the ONLY step that needs the network, and it
 * is deliberately NOT part of build.mjs: the App GIF must be buildable
 * offline from what is committed here. Run this only to move the pin.
 *
 *   node apps/openjscad/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const MODELING_VER = '2.13.0';

const tmp = mkdtempSync(join(tmpdir(), 'openjscad-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev', '@jscad/modeling@' + MODELING_VER], tmp);

const src = join(tmp, 'node_modules', '@jscad', 'modeling', 'dist', 'jscad-modeling.min.js');
const outJs = join(dir, 'vendor', 'jscad-modeling.min.js');
mkdirSync(join(dir, 'vendor'), { recursive: true });
copyFileSync(src, outJs);

const buf = readFileSync(outJs);
if (/<\/script/i.test(buf.toString('utf8'))) {
  throw new Error('bundle contains </script — cannot inline');
}
const hex = createHash('sha256').update(buf).digest('hex');
console.log('vendor/jscad-modeling.min.js', buf.length, 'bytes sha256', hex);

copyFileSync(
  join(tmp, 'node_modules', '@jscad', 'modeling', 'LICENSE'),
  join(dir, 'vendor', 'COPYING-jscad.txt')
);
rmSync(tmp, { recursive: true, force: true });
console.log('copied COPYING-jscad.txt; update UPSTREAM.txt sha256 if the pin moved');
