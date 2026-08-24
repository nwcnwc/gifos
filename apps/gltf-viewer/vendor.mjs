/*
 * vendor.mjs — rebuild vendor/three-viewer.js from the pinned three.js.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/gltf-viewer/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const THREE_VER = '0.176.0';
const ESBUILD = '0.25.9';

const tmp = mkdtempSync(join(tmpdir(), 'gltf-viewer-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev', 'three@' + THREE_VER, 'esbuild@' + ESBUILD], tmp);

const facade = join(tmp, 'gifos-facade.js');
writeFileSync(facade, [
  "import * as THREE from 'three';",
  "import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';",
  "import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';",
  "import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';",
  'window.THREE = THREE;',
  'window.GLTFLoader = GLTFLoader;',
  'window.OrbitControls = OrbitControls;',
  'window.RoomEnvironment = RoomEnvironment;',
  ''
].join('\n'));

const outJs = join(dir, 'vendor', 'three-viewer.js');
mkdirSync(join(dir, 'vendor'), { recursive: true });
run(join(tmp, 'node_modules', 'esbuild', 'bin', 'esbuild'), [
  facade, '--bundle', '--format=iife', '--minify', '--outfile=' + outJs
], tmp);

const buf = readFileSync(outJs);
if (/<\/script/i.test(buf.toString('utf8'))) {
  throw new Error('bundle contains </script — cannot inline');
}
const hex = createHash('sha256').update(buf).digest('hex');
console.log('vendor/three-viewer.js', buf.length, 'bytes sha256', hex);

copyFileSync(join(tmp, 'node_modules', 'three', 'LICENSE'), join(dir, 'vendor', 'COPYING-three.txt'));
rmSync(tmp, { recursive: true, force: true });
console.log('copied COPYING-three.txt; update UPSTREAM.txt sha256 if the pin moved');
