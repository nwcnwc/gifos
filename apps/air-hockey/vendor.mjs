/*
 * vendor.mjs — rebuild vendor/* from the pinned AirHockeyWebGL commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/air-hockey/vendor.mjs
 *   AIRHOCKEY_SRC=/path/to/checkout node apps/air-hockey/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + each SHA256 together.
const COMMIT = '9ad9bf421c2787a0b4a4cca2e7c12772f099ff68';
const RAW = 'https://raw.githubusercontent.com/MortimerGoro/AirHockeyWebGL/' + COMMIT + '/';

const FILES = [
  { src: 'LICENSE', out: 'COPYING-airhockeywebgl.txt', sha256: '784c7cf30466bc95527d8ffe01f40570dabadfd5ac32570c29277ea369d46167' },
  { src: 'lib/three.min.js', out: 'three.min.js', sha256: 'ab6c40a88cd30b8e94d85d478301f168bdddb6135f70e70474331f65c2f0edcf' },
  { src: 'lib/box2d.js', out: 'box2d.js', sha256: '01b46944a36de84f9988c53cf8f23f075490e3eb4c7bcd011722ff7d103c4994' },
  { src: 'lib/OBJMTLLoader.js', out: 'OBJMTLLoader.js', sha256: 'cbb9f0f322aa4a957b43dc181a62c42e856b35cbdc0360ca6cef9c72acc04c4c' },
  { src: 'src/physics.js', out: 'physics.js', sha256: '55d230ec8ab11889d9a9c709e057f04bf4eb45a946fd390f5343dc84aecbba98' },
  { src: 'src/AI.js', out: 'AI.js', sha256: '1469517f19898aca95a88fa052dc85864ff49a808d4cc25dd226a9f88df5412f' },
  { src: 'src/audio.js', out: 'audio.js', sha256: 'c77ed1e5cea9aa14eec79fbfb7e1b4f324c381e3ac21f1b19f5145d65f059bd7' },
  { src: 'src/hockey.js', out: 'hockey.js', sha256: '1dac4bb95349963e616690534aff85715ae099987b5eb3890c64632317a211bd' },
  { src: 'src/model.js', out: 'model.js', sha256: '76f82c246049438442f9d734dda79426bd734bb560ef9b75b0851acf666dda63' },
  { src: 'models/table.obj', out: 'models/table.obj', sha256: '2d4729db3aabd5715819c0abf132e97678db000ec15d8bbc951538316e6a3553' },
  { src: 'models/table.mtl', out: 'models/table.mtl', sha256: '442d4b764c3d6217a172a5d85e3ceb9627801aab070948f28689d7cdbf5f8971' },
  { src: 'models/paddle.obj', out: 'models/paddle.obj', sha256: '3c3e9fc910df4fd84464876b71a0266835eaa1bd452f507c0794ed5d1a710009' },
  { src: 'models/paddle.mtl', out: 'models/paddle.mtl', sha256: '54bec8af9937e2956ccdc87b6e00c954c63228b12fab446bae8e6db2a5ced1b5' },
  { src: 'models/puck.obj', out: 'models/puck.obj', sha256: '781218f3fae937d07ce38c8ca80c57c9241e18cad3b45516b41174b19e5c47f6' },
  { src: 'models/puck.mtl', out: 'models/puck.mtl', sha256: '97372f94c155b03ad570a9a4e4f49e51c780e6e5e24357acfa0aff14732d229d' },
  { src: 'images/surface.png', out: 'images/surface.png', sha256: '168d84d93bee8312047bbfe8c09a899ed12bd685eefe43f7ddcd6033ac486dc9' },
  { src: 'images/floor.jpg', out: 'images/floor.jpg', sha256: '9d4c373833c8b3be974f54fb829a1292e683489dbd7d6ef615ffa8dddea25bbc' },
  { src: 'audio/edge1.ogg', out: 'audio/edge1.ogg', sha256: 'fd8db4bf0b0ca7dc9f2a3a7dea2bec8eddefd299bbc78854067d4cb25ea8c0b1' },
  { src: 'audio/edge2.ogg', out: 'audio/edge2.ogg', sha256: 'a5294f3c2bb432c6a80d29ac77267f039c1cd3cc39530742e508680d90656ac1' },
  { src: 'audio/goal1.ogg', out: 'audio/goal1.ogg', sha256: '41b47a3946891ca2db79c35a6c8ff0c682c5873f8a209a02dc8c006d1afc4b5a' },
  { src: 'audio/hit1.ogg', out: 'audio/hit1.ogg', sha256: 'd2ceb719a831a8939e71129c6953703fcd4607b734d081eca3b32fcd57751519' },
  { src: 'audio/hit2.ogg', out: 'audio/hit2.ogg', sha256: '722c333fd680f407bd0cfbe374f7d5723a03bb211eda821d3610ef73122f808d' },
];

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

const vendor = join(dir, 'vendor');
mkdirSync(join(vendor, 'models'), { recursive: true });
mkdirSync(join(vendor, 'images'), { recursive: true });
mkdirSync(join(vendor, 'audio'), { recursive: true });

let src = process.env.AIRHOCKEY_SRC || null;
if (src) {
  const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
  if (at !== COMMIT) throw new Error('checkout is at ' + at + ', not the pin ' + COMMIT + ' — move COMMIT deliberately.');
}

async function load(rel) {
  if (src) return readFileSync(join(src, rel));
  const res = await fetch(RAW + rel);
  if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + RAW + rel);
  return Buffer.from(await res.arrayBuffer());
}

for (const f of FILES) {
  const buf = await load(f.src);
  const hex = sha256(buf);
  if (hex !== f.sha256) {
    throw new Error(f.src + ' sha256 ' + hex + ' ≠ pin ' + f.sha256 + ' — move the pin deliberately.');
  }
  if (f.out.endsWith('.js') && /<\/script/i.test(buf.toString('utf8'))) {
    throw new Error(f.src + ' contains </script — cannot inline safely.');
  }
  writeFileSync(join(vendor, f.out), buf);
  console.log('wrote vendor/' + f.out + ' —', buf.length, 'bytes');
}

const assets = {};
for (const name of ['table', 'paddle', 'puck']) {
  assets['models/' + name + '.obj'] = readFileSync(join(vendor, 'models', name + '.obj'), 'utf8');
  assets['models/' + name + '.mtl'] = readFileSync(join(vendor, 'models', name + '.mtl'), 'utf8');
}
const assetsJs = 'window.HOCKEY_FILES = ' + JSON.stringify(assets) + ';\n';
if (/<\/script/i.test(assetsJs)) throw new Error('assets.js contains </script — cannot inline safely.');
writeFileSync(join(vendor, 'assets.js'), assetsJs);
console.log('wrote vendor/assets.js —', assetsJs.length, 'bytes (obj/mtl as strings; GifOS CSP blocks XHR)');

writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/* is UNMODIFIED AirHockeyWebGL (MortimerGoro / Imanol Fernandez), MIT.\n' +
  '\n' +
  'upstream: https://github.com/MortimerGoro/AirHockeyWebGL\n' +
  'commit:   ' + COMMIT + '\n' +
  '\n' +
  'three.min.js is three.js r66 (MIT). box2d.js is box2dweb (zlib, Erin Catto).\n' +
  'OBJMTLLoader.js is the r66-era Three.js example loader (MTLLoader + OBJMTLLoader).\n' +
  'Audio samples were bundled upstream and credited to\n' +
  'https://www.freesound.org/people/krb21/sounds/118604/\n' +
  '\n' +
  'Not vendored (unused by index.html, or debug-only):\n' +
  '  models/hockey.obj (1.5 MB unused composite), dat.gui.min.js, src/main.js\n' +
  '  (boot.js is our entry).\n' +
  '\n' +
  'Run node apps/air-hockey/vendor.mjs to rebuild this directory from the pin.\n'
);

writeFileSync(join(vendor, 'COPYING-three.txt'),
  'The MIT License\n' +
  '\n' +
  'Copyright © 2010-2014 three.js authors\n' +
  '\n' +
  'Permission is hereby granted, free of charge, to any person obtaining a copy\n' +
  'of this software and associated documentation files (the "Software"), to deal\n' +
  'in the Software without restriction, including without limitation the rights\n' +
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' +
  'copies of the Software, and to furnish to persons to whom the Software is\n' +
  'furnished to do so, subject to the following conditions:\n' +
  '\n' +
  'The above copyright notice and this permission notice shall be included in\n' +
  'all copies or substantial portions of the Software.\n' +
  '\n' +
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' +
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' +
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' +
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' +
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' +
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\n' +
  'THE SOFTWARE.\n'
);

writeFileSync(join(vendor, 'COPYING-box2d.txt'),
  'Copyright (c) 2006-2007 Erin Catto http://www.gphysics.com\n' +
  '\n' +
  'This software is provided \'as-is\', without any express or implied\n' +
  'warranty.  In no event will the authors be held liable for any damages\n' +
  'arising from the use of this software.\n' +
  'Permission is granted to anyone to use this software for any purpose,\n' +
  'including commercial applications, and to alter it and redistribute it\n' +
  'freely, subject to the following restrictions:\n' +
  '1. The origin of this software must not be misrepresented; you must not\n' +
  'claim that you wrote the original software. If you use this software\n' +
  'in a product, an acknowledgment in the product documentation would be\n' +
  'appreciated but is not required.\n' +
  '2. Altered source versions must be plainly marked as such, and must not be\n' +
  'misrepresented as being the original software.\n' +
  '3. This notice may not be removed or altered from any source distribution.\n'
);

console.log('AirHockeyWebGL', COMMIT.slice(0, 10));
