/*
 * vendor.mjs — rebuild vendor/ from the pinned wayou/t-rex-runner commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. Run this only to move the pin.
 *
 *   node apps/chrome-dino/vendor.mjs
 *   TREX_SRC=/path/to/checkout node apps/chrome-dino/vendor.mjs
 *
 * The runner is Chromium's offline T-Rex (BSD), extracted by wayou. GifOS-only
 * edits: seeded obstacle RNG, boot hooks, no auto-start. Sprites and sounds
 * ride as files so the packer inlines them; nothing is fetched at runtime.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/wayou/t-rex-runner.git';
const PIN = '5455bfa408ec6b707c7300ff194b7390733a766d';

const CHROMIUM_BSD = `Copyright 2014 The Chromium Authors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

function mustReplace(src, from, to, label) {
  if (!src.includes(from)) throw new Error('vendor patch missed: ' + label);
  return src.replace(from, to);
}

let src = process.env.TREX_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 't-rex-'));
  src = join(tmp, 't-rex-runner');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING-t-rex-runner.txt'));
writeFileSync(join(out, 'COPYING-chromium.txt'), CHROMIUM_BSD);
copyFileSync(join(out, 'COPYING-t-rex-runner.txt'), join(dir, 'COPYING-t-rex-runner.txt'));
copyFileSync(join(out, 'COPYING-chromium.txt'), join(dir, 'COPYING-chromium.txt'));

const sprite1 = join(src, 'assets', 'default_100_percent', '100-offline-sprite.png');
const sprite2 = join(src, 'assets', 'default_200_percent', '200-offline-sprite.png');
if (!existsSync(sprite1) || !existsSync(sprite2)) throw new Error('sprite sheets missing');
copyFileSync(sprite1, join(out, 'sprites-1x.png'));
copyFileSync(sprite2, join(out, 'sprites-2x.png'));

{
  const html = readFileSync(join(src, 'index.html'), 'utf8');
  const ids = {
    'offline-sound-press': 'sound-press.ogg',
    'offline-sound-hit': 'sound-hit.ogg',
    'offline-sound-reached': 'sound-reached.ogg',
  };
  for (const [id, name] of Object.entries(ids)) {
    const re = new RegExp('id="' + id + '"\\s+src="data:audio/[^;]+;base64,([^"]+)"');
    const m = html.match(re);
    if (!m) throw new Error('audio ' + id + ' missing from upstream HTML');
    writeFileSync(join(out, name), Buffer.from(m[1], 'base64'));
  }
}

let js = readFileSync(join(src, 'index.js'), 'utf8');

js = mustReplace(js,
  `    function getRandomNum(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }`,
  `    var obstacleRng = Math.random;
    function seedObstacles(seed) {
        var a = (seed >>> 0) || 1;
        obstacleRng = function () {
            a |= 0;
            a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function getRandomNum(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function getObstacleNum(min, max) {
        return Math.floor(obstacleRng() * (max - min + 1)) + min;
    }
    Runner.seedObstacles = seedObstacles;
    Runner.hooks = {};`,
  'seeded obstacle RNG');

js = mustReplace(js,
  'this.size = getRandomNum(1, Obstacle.MAX_OBSTACLE_LENGTH);',
  'this.size = getObstacleNum(1, Obstacle.MAX_OBSTACLE_LENGTH);',
  'seeded cactus size');

js = mustReplace(js,
  'this.yPos = yPosConfig[getRandomNum(0, yPosConfig.length - 1)];',
  'this.yPos = yPosConfig[getObstacleNum(0, yPosConfig.length - 1)];',
  'seeded pterodactyl height');

js = mustReplace(js,
  'return getRandomNum(minGap, maxGap);',
  'return getObstacleNum(minGap, maxGap);',
  'seeded gap');

js = mustReplace(js,
  'var obstacleTypeIndex = getRandomNum(0, Obstacle.types.length - 1);',
  'var obstacleTypeIndex = getObstacleNum(0, Obstacle.types.length - 1);',
  'seeded obstacle type');

js = mustReplace(js,
  `                    this.speedOffset = Math.random() > 0.5 ? this.typeConfig.speedOffset :
                        -this.typeConfig.speedOffset;`,
  `                    this.speedOffset = obstacleRng() > 0.5 ? this.typeConfig.speedOffset :
                        -this.typeConfig.speedOffset;`,
  'seeded pterodactyl speedOffset');

js = mustReplace(js,
  `            // Hide the static icon.
            document.querySelector('.' + Runner.classes.ICON).style.visibility =
                'hidden';`,
  `            var iconEl = document.querySelector('.' + Runner.classes.ICON);
            if (iconEl) iconEl.style.visibility = 'hidden';`,
  'optional static icon');

js = mustReplace(js,
  `            window.addEventListener(Runner.events.RESIZE,
                this.debounceResize.bind(this));
        },`,
  `            window.addEventListener(Runner.events.RESIZE,
                this.debounceResize.bind(this));
            if (Runner.hooks && Runner.hooks.onInit) Runner.hooks.onInit(this);
        },`,
  'onInit hook');

js = mustReplace(js,
  `            if (this.playing || (!this.activated &&
                this.tRex.blinkCount < Runner.config.MAX_BLINK_COUNT)) {
                this.tRex.update(deltaTime);
                this.scheduleNextUpdate();
            }
        },`,
  `            if (Runner.hooks && Runner.hooks.afterFrame) Runner.hooks.afterFrame(this);

            if (this.playing || (!this.activated &&
                this.tRex.blinkCount < Runner.config.MAX_BLINK_COUNT) ||
                (Runner.hooks && Runner.hooks.keepAlive && Runner.hooks.keepAlive())) {
                if (this.playing || !this.activated) this.tRex.update(deltaTime);
                this.scheduleNextUpdate();
            }
        },`,
  'afterFrame / keepAlive');

js = mustReplace(js,
  `            if (this.distanceRan > this.highestScore) {
                this.highestScore = Math.ceil(this.distanceRan);
                this.distanceMeter.setHighScore(this.highestScore);
            }

            // Reset the time clock.
            this.time = getTimeStamp();
        },`,
  `            if (this.distanceRan > this.highestScore) {
                this.highestScore = Math.ceil(this.distanceRan);
                this.distanceMeter.setHighScore(this.highestScore);
            }
            if (Runner.hooks && Runner.hooks.onCrash) Runner.hooks.onCrash(this);

            // Reset the time clock.
            this.time = getTimeStamp();
        },`,
  'onCrash hook');

js = mustReplace(js,
  `            window.addEventListener(Runner.events.FOCUS,
                this.onVisibilityChange.bind(this));
        },`,
  `            window.addEventListener(Runner.events.FOCUS,
                this.onVisibilityChange.bind(this));
            if (Runner.hooks && Runner.hooks.onStart) Runner.hooks.onStart(this);
        },`,
  'onStart hook');

js = mustReplace(js,
  `                this.playSound(this.soundFx.BUTTON_PRESS);
                this.invert(true);
                this.update();
            }
        },`,
  `                this.playSound(this.soundFx.BUTTON_PRESS);
                this.invert(true);
                if (Runner.hooks && Runner.hooks.onRestart) Runner.hooks.onRestart(this);
                this.update();
            }
        },`,
  'onRestart hook');

js = mustReplace(js,
  `})();


function onDocumentLoad() {
    new Runner('.interstitial-wrapper');
}

document.addEventListener('DOMContentLoaded', onDocumentLoad);`,
  `    Runner.Trex = Trex;
})();`,
  'no auto-boot, expose Trex');

if (/<\/script/i.test(js)) throw new Error('game.js contains </script');
if (js.includes('onDocumentLoad')) throw new Error('auto-boot still present');
if (!js.includes('Runner.seedObstacles')) throw new Error('seedObstacles not exposed');
if (!js.includes('Runner.Trex = Trex')) throw new Error('Trex not exposed');

writeFileSync(join(out, 'game.js'), js);

function sha256(p) {
  return createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
}

const files = [
  'game.js', 'sprites-1x.png', 'sprites-2x.png',
  'sound-press.ogg', 'sound-hit.ogg', 'sound-reached.ogg',
  'COPYING-chromium.txt', 'COPYING-t-rex-runner.txt',
];
const shaLines = files.map((p) => '  ' + p.padEnd(26) + sha256(p)).join('\n');

writeFileSync(join(out, 'UPSTREAM.txt'),
  'vendor/* is GENERATED. Do not edit it; run node apps/chrome-dino/vendor.mjs.\n' +
  '\n' +
  'upstream: https://github.com/wayou/t-rex-runner\n' +
  'commit:   ' + PIN + '\n' +
  'date:     2022-06-08\n' +
  'license:  BSD-3-Clause (Chromium Authors + wayou)\n' +
  '\n' +
  'Copied:\n' +
  '  sprites-1x.png / sprites-2x.png   Chromium offline sprite sheets\n' +
  '  sound-*.ogg                       jump / hit / 100-point chime\n' +
  '  COPYING-t-rex-runner.txt          wayou LICENSE\n' +
  '  COPYING-chromium.txt              Chromium BSD-3-Clause\n' +
  '  game.js                           original engine with these GifOS-only edits:\n' +
  '    - obstacle RNG is seedable (clouds/stars stay random so they cannot desync the course)\n' +
  '    - Runner.hooks onInit / afterFrame / onStart / onRestart / onCrash / keepAlive\n' +
  '    - no DOMContentLoaded auto-boot (boot.js starts the runner)\n' +
  '    - Runner.Trex exposed for ghost drawing\n' +
  '\n' +
  'NOT copied:\n' +
  '  index.html messageBox / Google Fonts   wayou overlay, not the Chromium game\n' +
  '  assets/*-error-offline.png             interstitial art, unused\n' +
  '  screenshot / fork gifs                 docs only\n' +
  '\n' +
  'sha256:\n' + shaLines + '\n' +
  '\n' +
  'Both notices travel INSIDE the GIF as well as here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/chrome-dino/vendor/ from ' + PIN.slice(0, 10));
for (const p of files) console.log('  ' + p + '  ' + (readFileSync(join(out, p)).length + ' B'));
