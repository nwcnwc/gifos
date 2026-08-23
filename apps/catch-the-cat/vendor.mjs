/*
 * vendor.mjs — rebuild vendor/phaser.js and vendor/game.js from the pins.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move a pin.
 *
 *   node apps/catch-the-cat/vendor.mjs
 *
 * WHAT IT PRODUCES. Phaser 3.16.1 as a classic IIFE (window.Phaser), and the
 * pinned Catch The Cat TypeScript as one IIFE that expects that global and
 * exposes window.CatchTheCatGame. GifOS inlines <script src> and DROPS
 * type="module", so neither may be an ES module, and neither may be a CDN tag.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const UPSTREAM = 'https://github.com/ganlvtech/phaser-catch-the-cat.git';
const PIN = '75b67f97a405dd5b0fc8a48d8f647efb72f070a3';

const PHASER_URL = 'https://cdn.jsdelivr.net/npm/phaser@3.16.1/dist/phaser.min.js';
const PHASER_SHA256 = '02e25ee129cafe81835ab3c4a9d1aa80cdb79e34de006ea6f83a97458c3879d9';
const PHASER_LICENSE_URL = 'https://raw.githubusercontent.com/photonstorm/phaser/v3.16.1/license.txt';

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

const phaserRes = await fetch(PHASER_URL);
if (!phaserRes.ok) throw new Error('phaser download failed: ' + phaserRes.status + ' ' + PHASER_URL);
const phaserBuf = Buffer.from(await phaserRes.arrayBuffer());
const phaserHex = sha256(phaserBuf);
if (phaserHex !== PHASER_SHA256) {
  throw new Error('phaser.min.js sha256 ' + phaserHex + ' ≠ pin ' + PHASER_SHA256 + ' — move the pin deliberately.');
}
const phaserText = phaserBuf.toString('utf8');
if (/<\/script/i.test(phaserText)) throw new Error('phaser.min.js contains </script — cannot inline safely.');
if (!phaserText.includes('t.Phaser=e()')) {
  throw new Error('phaser.min.js is not the UMD build that attaches window.Phaser');
}
writeFileSync(join(vendor, 'phaser.js'), phaserBuf);

const licRes = await fetch(PHASER_LICENSE_URL);
if (!licRes.ok) throw new Error('phaser licence download failed: ' + licRes.status);
writeFileSync(join(vendor, 'COPYING-phaser.txt'), Buffer.from(await licRes.arrayBuffer()));

const tmp = mkdtempSync(join(tmpdir(), 'ctc-'));
const src = join(tmp, 'ctc');
console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
execFileSync('git', ['clone', '--quiet', UPSTREAM, src], { stdio: 'inherit', timeout: 120000 });
execFileSync('git', ['checkout', '--quiet', PIN], { cwd: src, stdio: 'inherit' });
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

copyFileSync(join(src, 'LICENSE'), join(vendor, 'COPYING-catch-the-cat.txt'));

// PATCHES. Applied to upstream SOURCE before the bundle. A patch that no
// longer matches FAILS THE BUILD — do not skip it.
const PATCHES = [
  {
    file: 'src/data.ts',
    find: /import \* as (\w+) from "(\.\.\/assets\/images\/[^"]+\.svg)";/g,
    replace: 'import $1 from "$2";',
    why: 'default-import the cat SVGs so the IIFE gets strings, not {default: string}',
  },
  {
    file: 'src/data.ts',
    find: /translations: \{\},/,
    replace: `translations: {
        "猫已经跑到地图边缘了，你输了": "The cat reached the edge — it got away.",
        "猫已经无路可走，你赢了": "The cat has nowhere to go. You win.",
        "游戏已经结束，重新开局": "That round is over — starting a new one.",
        "代码错误，当前位置不存在": "That spot is not on the board.",
        "点击位置已经是墙了，禁止点击": "Already a wall.",
        "点击位置是猫当前位置，禁止点击": "That's the cat.",
        "您点击了 ": "Tapped ",
        "猫认输，你赢了！": "The cat gives up. You win.",
        "点击小圆点，围住小猫": "Tap the dots. Wall the cat in.",
        "无路可退！！！": "Nothing to undo.",
        "重置": "Reset",
        "回退": "Undo",
    },`,
    why: 'English status lines — GifOS listings and chrome are English',
  },
  {
    file: 'src/sprites/block.ts',
    find: `        let shape = new Phaser.Geom.Circle(this.r / 2, this.r / 2, this.r);
        this.setInteractive(shape, Phaser.Geom.Circle.Contains);`,
    replace: `        let shape = new Phaser.Geom.Circle(this.r / 2, this.r / 2, this.r * 1.35);
        this.setInteractive(shape, Phaser.Geom.Circle.Contains);`,
    why: 'bigger tap target than the painted dot, for a thumb',
  },
  {
    file: 'src/sprites/block.ts',
    find: `            this.fillColor = 0x003366;
        } else {
            this.fillColor = 0xb3d9ff;`,
    replace: `            this.fillColor = 0x3d8f7a;
        } else {
            this.fillColor = 0x243044;`,
    why: 'dark-theme dots: teal walls, slate empty',
  },
  {
    file: 'src/sprites/statusBar.ts',
    find: 'this.setColor("#000000");',
    replace: 'this.setColor("#e8eef6");',
    why: 'status text on a dark canvas',
  },
  {
    file: 'src/sprites/resetButton.ts',
    find: 'this.setColor("#000000");',
    replace: 'this.setColor("#e8eef6");',
    why: 'reset label on a dark canvas',
  },
  {
    file: 'src/sprites/undoButton.ts',
    find: 'this.setColor("#000000");',
    replace: 'this.setColor("#e8eef6");',
    why: 'undo label on a dark canvas',
  },
  {
    file: 'src/sprites/creditText.ts',
    find: 'this.setColor("#000000");',
    replace: 'this.setColor("#8b93a7");',
    why: 'credit on a dark canvas',
  },
  {
    file: 'src/game.ts',
    find: `        if (!config.backgroundColor) {
            config.backgroundColor = 0xeeeeee;
        }
        if (!config.initialWallCount) {
            config.initialWallCount = 8;
        }`,
    replace: `        if (!config.backgroundColor) {
            config.backgroundColor = 0x0b1020;
        }
        if (!config.initialWallCount) {
            config.initialWallCount = 8;
        }
        if (!config.seed) {
            config.seed = 1;
        }
        if (config.hideChrome === undefined) {
            config.hideChrome = true;
        }`,
    why: 'dark default, a seed for the same starting walls, HTML chrome instead of in-canvas buttons',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `    public readonly dx: number;
    public readonly dy: number;
    public game: CatchTheCatGame;
    private recordCoord: RecordCoord;`,
    replace: `    public readonly dx: number;
    public readonly dy: number;
    public game: CatchTheCatGame;
    public clicks: number;
    private recordCoord: RecordCoord;`,
    why: 'count taps so a race can score them',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `            case GameState.LOSE:
                this.setStatusText(_("猫已经跑到地图边缘了，你输了"));
                break;
            case GameState.WIN:
                this.setStatusText(_("猫已经无路可走，你赢了"));
                break;`,
    replace: `            case GameState.LOSE:
                this.setStatusText(_("猫已经跑到地图边缘了，你输了"));
                this.game.events.emit("ctc-lose", { clicks: this.clicks });
                break;
            case GameState.WIN:
                this.setStatusText(_("猫已经无路可走，你赢了"));
                this.game.events.emit("ctc-win", { clicks: this.clicks });
                break;`,
    why: 'tell the GifOS shell when a round ends',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `        this.createStatusText();
        this.createResetButton();
        this.createUndoButton();
        this.createCreditText();
        this.reset();`,
    replace: `        if (!this.game.myConfig.hideChrome) {
            this.createStatusText();
            this.createResetButton();
            this.createUndoButton();
            this.createCreditText();
        }
        this.reset();`,
    why: 'GifOS draws status / undo / new-board in HTML, sized for a phone',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `        block.isWall = true;
        if (this.cat.isCaught()) {
            this.setStatusText(_("猫已经无路可走，你赢了"));
            this.state = GameState.WIN;
            return false;
        }

        this.recordCoord.cat.push({i: this.cat.i, j:this.cat.j});
        this.recordCoord.wall.push({i, j});

        this.setStatusText(_("您点击了 ") + \`(`,
    replace: `        block.isWall = true;
        this.clicks++;
        this.game.events.emit("ctc-click", { i, j, clicks: this.clicks });
        if (this.cat.isCaught()) {
            this.setStatusText(_("猫已经无路可走，你赢了"));
            this.state = GameState.WIN;
            return false;
        }

        this.recordCoord.cat.push({i: this.cat.i, j:this.cat.j});
        this.recordCoord.wall.push({i, j});

        this.setStatusText(_("您点击了 ") + \`(`,
    why: 'count a tap the moment the wall lands',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `    reset() {
        this.cat.reset();
        this.resetBlocks();
        this.randomWall();

        this.recordCoord = {
            cat: [],
            wall: []
        };
        this.state = GameState.PLAYING;
        this.setStatusText(_("点击小圆点，围住小猫"));
    }`,
    replace: `    reset(seed?: number) {
        if (typeof seed === "number" && isFinite(seed)) {
            this.game.myConfig.seed = (seed >>> 0) || 1;
        }
        this.clicks = 0;
        this.cat.reset();
        this.resetBlocks();
        this.randomWall();

        this.recordCoord = {
            cat: [],
            wall: []
        };
        this.state = GameState.PLAYING;
        this.setStatusText(_("点击小圆点，围住小猫"));
        this.game.events.emit("ctc-reset", { seed: this.game.myConfig.seed });
    }`,
    why: 'reset to a given seed so every racer starts on the same walls',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `                this.cat.undo(catCoord.i, catCoord.j);
                this.getBlock(i, j).isWall = false;`,
    replace: `                this.cat.undo(catCoord.i, catCoord.j);
                this.getBlock(i, j).isWall = false;
                if (this.clicks > 0) this.clicks--;
                this.game.events.emit("ctc-click", { i, j, clicks: this.clicks, undo: true });`,
    why: 'undo puts the tap back',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `    private setStatusText(message: string) {
        this.statusBar.setText(message);
    }`,
    replace: `    private setStatusText(message: string) {
        if (this.statusBar) this.statusBar.setText(message);
        this.game.events.emit("ctc-status", message);
    }`,
    why: 'status still reaches the HTML bar when in-canvas chrome is hidden',
  },
  {
    file: 'src/scenes/mainScene.ts',
    find: `    private randomWall() {
        const array = [];
        for (let j = 0; j < this.h; j++) {
            for (let i = 0; i < this.w; i++) {
                if (i !== this.cat.i || j !== this.cat.j) {
                    array.push(j * this.w + i);
                }
            }
        }
        for (let i = 0; i < array.length; i++) {
            if (i >= this.initialWallCount) {
                break;
            }
            // Shuffle array
            const j = i + Math.floor(Math.random() * (array.length - i));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
            // Set wall
            let wallI = array[i] % this.w;
            let wallJ = Math.floor(array[i] / this.w);
            this.getBlock(wallI, wallJ).isWall = true;
        }
    }
}`,
    replace: `    private randomWall() {
        let s = (this.game.myConfig.seed >>> 0) || 1;
        const rnd = () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const array = [];
        for (let j = 0; j < this.h; j++) {
            for (let i = 0; i < this.w; i++) {
                if (i !== this.cat.i || j !== this.cat.j) {
                    array.push(j * this.w + i);
                }
            }
        }
        for (let i = 0; i < array.length; i++) {
            if (i >= this.initialWallCount) {
                break;
            }
            const j = i + Math.floor(rnd() * (array.length - i));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
            let wallI = array[i] % this.w;
            let wallJ = Math.floor(array[i] / this.w);
            this.getBlock(wallI, wallJ).isWall = true;
        }
    }
}`,
    why: 'seeded shuffle; Math.random would give every racer a different board',
  },
];

for (const p of PATCHES) {
  const f = join(src, p.file);
  const before = readFileSync(f, 'utf8');
  const re = p.find instanceof RegExp ? p.find : null;
  if (re) re.lastIndex = 0;
  const ok = re ? re.test(before) : before.includes(p.find);
  if (!ok) {
    throw new Error('PATCH NO LONGER APPLIES: ' + p.file + ' — ' + p.why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY.');
  }
  if (re) re.lastIndex = 0;
  writeFileSync(f, re ? before.replace(re, p.replace) : before.replace(p.find, p.replace));
  console.log('patched ' + p.file + ' — ' + p.why);
}

{
  const scene = readFileSync(join(src, 'src/scenes/mainScene.ts'), 'utf8');
  if (scene.includes('Math.random()')) {
    throw new Error('Math.random still in mainScene — the seed patch missed the shuffle');
  }
  if (!scene.includes('ctc-click')) {
    throw new Error('ctc-click never landed — the shell would never see a tap');
  }
}

const outGame = join(src, 'dist-gifos', 'catch-the-cat.js');
mkdirSync(join(src, 'dist-gifos'), { recursive: true });
execFileSync('npx', [
  '--yes', 'esbuild@0.21.5',
  'src/index.ts',
  '--bundle',
  '--format=iife',
  '--outfile=' + outGame,
  '--loader:.svg=text',
  '--target=es2017',
  '--log-level=info',
], { cwd: src, stdio: 'inherit', timeout: 120000 });

const gameBuf = readFileSync(outGame);
const gameText = gameBuf.toString('utf8');
if (/<\/script/i.test(gameText)) throw new Error('game.js contains </script — cannot inline safely.');
if (!gameText.includes('CatchTheCatGame')) {
  throw new Error('game.js does not mention CatchTheCatGame — the facade did not land.');
}
if (gameText.includes('textures: {\n      "bottom_left_1": __exports')) {
  throw new Error('SVG imports are still namespace objects — default-import patch missed.');
}
writeFileSync(join(vendor, 'game.js'), gameBuf);

writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/phaser.js and vendor/game.js are GENERATED. Do not edit them;\n' +
  'run node apps/catch-the-cat/vendor.mjs.\n\n' +
  'game:    ' + UPSTREAM + '\n' +
  'commit:  ' + PIN + '\n' +
  'phaser:  3.16.1  sha256 ' + PHASER_SHA256 + '\n' +
  '         ' + PHASER_URL + '\n' +
  'entry:   src/index.ts, IIFE, global CatchTheCatGame (expects window.Phaser)\n\n' +
  'Both licences are MIT and travel beside it as COPYING-catch-the-cat.txt and\n' +
  'COPYING-phaser.txt. They are packed into the GIF too, so a copy of this app\n' +
  'that someone was handed still carries the notices it is required to carry.\n');

console.log('wrote vendor/phaser.js —', (phaserBuf.length / 1024).toFixed(0), 'KB');
console.log('wrote vendor/game.js —', (gameBuf.length / 1024).toFixed(1), 'KB from', PIN.slice(0, 10));
rmSync(tmp, { recursive: true, force: true });
