/*
 * vendor.mjs — copy HexGL + its Three.js r50dev pin into vendor/.
 *
 * The ONLY step that needs the network. build.mjs is offline and reads
 * what this wrote. Run only to move the pin:
 *
 *   node apps/hexgl/vendor.mjs
 *   HEXGL_SRC=/path/to/HexGL node apps/hexgl/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = 'https://github.com/BKcore/HexGL.git';
const PIN = '6addc95a2fce3bf05f4d751823cc054c61a16d68';

const JS = [
  ['libs/Three.dev.js', 'three.js'],
  ['libs/ShaderExtras.js', 'ShaderExtras.js'],
  ['libs/postprocessing/EffectComposer.js', 'postprocessing/EffectComposer.js'],
  ['libs/postprocessing/RenderPass.js', 'postprocessing/RenderPass.js'],
  ['libs/postprocessing/BloomPass.js', 'postprocessing/BloomPass.js'],
  ['libs/postprocessing/ShaderPass.js', 'postprocessing/ShaderPass.js'],
  ['libs/postprocessing/MaskPass.js', 'postprocessing/MaskPass.js'],
  ['bkcore.coffee/Timer.js', 'Timer.js'],
  ['bkcore.coffee/ImageData.js', 'ImageData.js'],
  ['bkcore.coffee/Utils.js', 'Utils.js'],
  ['bkcore/threejs/RenderManager.js', 'RenderManager.js'],
  ['bkcore/threejs/Shaders.js', 'Shaders.js'],
  ['bkcore/threejs/Particles.js', 'Particles.js'],
  ['bkcore/threejs/Loader.js', 'Loader.js'],
  ['bkcore/Audio.js', 'Audio.js'],
  ['bkcore/hexgl/HUD.js', 'HUD.js'],
  ['bkcore/hexgl/RaceData.js', 'RaceData.js'],
  ['bkcore/hexgl/ShipControls.js', 'ShipControls.js'],
  ['bkcore/hexgl/ShipEffects.js', 'ShipEffects.js'],
  ['bkcore/hexgl/CameraChase.js', 'CameraChase.js'],
  ['bkcore/hexgl/Gameplay.js', 'Gameplay.js'],
  ['bkcore/hexgl/tracks/Cityscape.js', 'Cityscape.js'],
  ['bkcore/hexgl/HexGL.js', 'HexGL.js'],
];

const ASSETS = [
  'textures/hud/hex.jpg',
  'textures/particles/spark.png',
  'textures/particles/cloud.png',
  'textures/ships/feisar/diffuse.jpg',
  'textures/ships/feisar/booster/booster.png',
  'textures/ships/feisar/booster/boostersprite.jpg',
  'textures/tracks/cityscape/diffuse.jpg',
  'textures/tracks/cityscape/scrapers1/diffuse.jpg',
  'textures/tracks/cityscape/scrapers2/diffuse.jpg',
  'textures/tracks/cityscape/start/diffuse.jpg',
  'textures/tracks/cityscape/start/start.jpg',
  'textures/tracks/cityscape/collision.png',
  'textures/tracks/cityscape/height.png',
  'textures/bonus/base/diffuse.jpg',
  'textures/skybox/dawnclouds/px.jpg',
  'textures/skybox/dawnclouds/nx.jpg',
  'textures/skybox/dawnclouds/py.jpg',
  'textures/skybox/dawnclouds/ny.jpg',
  'textures/skybox/dawnclouds/pz.jpg',
  'textures/skybox/dawnclouds/nz.jpg',
  'textures/hud/hud-bg.png',
  'textures/hud/hud-fg-speed.png',
  'textures/hud/hud-fg-shield.png',
  'geometries/bonus/base/base.js',
  'geometries/booster/booster.js',
  'geometries/ships/feisar/feisar.js',
  'geometries/tracks/cityscape/track.js',
  'geometries/tracks/cityscape/scrapers1.js',
  'geometries/tracks/cityscape/scrapers2.js',
  'geometries/tracks/cityscape/start.js',
  'geometries/tracks/cityscape/startbanner.js',
  'geometries/tracks/cityscape/bonus/speed.js',
  'audio/bg.ogg',
  'audio/crash.ogg',
  'audio/destroyed.ogg',
  'audio/boost.ogg',
  'audio/wind.ogg',
];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 900000 });

let src = process.env.HEXGL_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'hexgl-'));
  src = join(tmp, 'HexGL');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN);
}

const out = join(dir, 'vendor');
mkdirSync(join(out, 'postprocessing'), { recursive: true });
mkdirSync(join(out, 'assets'), { recursive: true });

function mustReplace(file, find, put, label) {
  const s = readFileSync(file, 'utf8');
  if (!s.includes(find)) throw new Error('patch missed ' + label + ' in ' + file);
  writeFileSync(file, s.split(find).join(put));
}

for (const [from, to] of JS) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(src, from), dest);
}

{
  const hex = join(out, 'HexGL.js');
  mustReplace(hex,
    "\tthis.document.addEventListener('keydown', onKeyPress, false);\n",
    "\tthis._onEsc = onKeyPress;\n\tthis.document.addEventListener('keydown', onKeyPress, false);\n",
    'esc-bind');
}
{
  const ship = join(out, 'ShipControls.js');
  mustReplace(ship,
    'case 65: /*A*/self.key.ltrigger = true; break;',
    'case 65: /*A*/self.key.left = true; break;\n\t\t\tcase 87: /*W*/self.key.forward = true; break;',
    'A-down');
  mustReplace(ship,
    'case 68: /*D*/self.key.rtrigger = true; break;',
    'case 68: /*D*/self.key.right = true; break;\n\t\t\tcase 83: /*S*/self.key.backward = true; break;',
    'D-down');
  mustReplace(ship,
    'case 65: /*A*/self.key.ltrigger = false; break;',
    'case 65: /*A*/self.key.left = false; break;\n\t\t\tcase 87: /*W*/self.key.forward = false; break;',
    'A-up');
  mustReplace(ship,
    'case 68: /*D*/self.key.rtrigger = false; break;',
    'case 68: /*D*/self.key.right = false; break;\n\t\t\tcase 83: /*S*/self.key.backward = false; break;',
    'D-up');
}

for (const rel of ASSETS) {
  const dest = join(out, 'assets', rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(src, rel), dest);
}

copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING-hexgl.txt'));
copyFileSync(join(src, 'audio', 'LICENSE'), join(out, 'COPYING-audio.txt'));
copyFileSync(join(src, 'LICENSE'), join(dir, 'COPYING-hexgl.txt'));
copyFileSync(join(src, 'audio', 'LICENSE'), join(dir, 'COPYING-audio.txt'));

const threeLicense = `The MIT License

Copyright (c) 2010-2012 Three.js authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;
writeFileSync(join(out, 'COPYING-three.txt'), threeLicense);
writeFileSync(join(dir, 'COPYING-three.txt'), threeLicense);

writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/hexgl/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
three:    r50dev, shipped as libs/Three.dev.js in that commit (the pin HexGL
          was written against — a newer three.js will not load these JSON
          geometries or these uniforms).
license:  MIT (COPYING-hexgl.txt). Audio samples are CC-BY 3.0 / public
          domain (COPYING-audio.txt). three.js MIT (COPYING-three.txt).

HexGL file headers still mention CC-BY-NC 3.0 from before the relicensing;
the repository LICENSE and README are MIT as of this pin.

LOW-quality textures, cityscape geometries, and the five audio files ride
under vendor/assets/. textures.full, Leap Motion, DAT.GUI, webfonts, and
the unused edge-track geometry are not copied.
`);

writeFileSync(join(out, 'ASSET-LIST.txt'), ASSETS.join('\n') + '\n');

if (tmp) rmSync(tmp, { recursive: true, force: true });

const n = ASSETS.length;
console.log('vendored HexGL @ ' + PIN.slice(0, 10) + ' — ' + JS.length + ' scripts, ' + n + ' assets');
