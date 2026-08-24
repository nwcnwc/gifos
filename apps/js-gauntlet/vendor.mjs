/*
 * vendor.mjs — rebuild vendor/ from the pinned javascript-gauntlet commit.
 *
 * Music and Premium Beat SFX are licensed only for Jake's original project
 * and are NOT copied. Boot.js stubs AudioFX.
 *
 *   node apps/js-gauntlet/vendor.mjs
 *   GAUNTLET_SRC=/path/to/checkout node apps/js-gauntlet/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/jakesgordon/javascript-gauntlet.git';
const PIN = '2f9020dc642ba3bf98fd20a5251bed5c9d84d924';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.GAUNTLET_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'js-gauntlet-'));
  src = join(tmp, 'gauntlet');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(join(out, 'images'), { recursive: true });
mkdirSync(join(out, 'levels'), { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING.txt'));
copyFileSync(join(src, 'js', 'vendor.js'), join(out, 'vendor.js'));
copyFileSync(join(src, 'css', 'normalize.css'), join(out, 'normalize.css'));

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
};

function dataUrl(abs) {
  const ext = extname(abs).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(abs).toString('base64');
}

const IMAGE_FILES = [
  'images/backgrounds.png',
  'images/entities.png',
  'images/splash.jpg',
  'images/logo.jpg',
  'images/key.png',
  'images/potion.png',
  'images/mute.png',
  'images/booting.gif',
];
const LEVELS = readdirSync(join(src, 'levels')).filter((n) => n.endsWith('.png') && n !== 'reference.png').sort();

const assets = {};
for (const p of IMAGE_FILES) {
  copyFileSync(join(src, p), join(out, p));
  assets[p] = dataUrl(join(src, p));
}
for (const n of LEVELS) {
  const p = 'levels/' + n;
  copyFileSync(join(src, p), join(out, p));
  assets[p] = dataUrl(join(src, p));
}

writeFileSync(join(out, 'assets.js'),
  'window.GAUNTLET_ASSETS = ' + JSON.stringify(assets) + ';\n');

function assetExpr(path) {
  return '(window.GAUNTLET_ASSETS && window.GAUNTLET_ASSETS[' + JSON.stringify(path) + '])';
}

let gameJs = readFileSync(join(src, 'js', 'game.js'), 'utf8');
gameJs = gameJs.replace(
  `run: function(gameFactory, cfg) {
    document.addEventListener('DOMContentLoaded', function() {
      window.game   = gameFactory();
      window.runner = new Game.Runner(window.game, cfg);
    }, false);
  },`,
  `run: function(gameFactory, cfg) {
    var go = function() {
      window.game   = gameFactory();
      window.runner = new Game.Runner(window.game, cfg);
    };
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', go, false);
    else
      go();
  },`
);
if (gameJs.includes("document.addEventListener('DOMContentLoaded', function()")) {
  throw new Error('Game.run still waits on DOMContentLoaded only');
}
writeFileSync(join(out, 'game.js'), gameJs);

let css = readFileSync(join(src, 'css', 'gauntlet.css'), 'utf8');
css = css.replace('url(../images/mute.png)', 'url(' + assets['images/mute.png'] + ')');
if (css.includes('../images/')) throw new Error('gauntlet.css still has a relative image');
writeFileSync(join(out, 'gauntlet.css'), css);

let gj = readFileSync(join(src, 'js', 'gauntlet.js'), 'utf8');

gj = gj.replace('stats: true', 'stats: false');

gj = gj.replace(
  '{ id: \'backgrounds\', url: "images/backgrounds.png" }',
  '{ id: \'backgrounds\', url: ' + assetExpr('images/backgrounds.png') + ' }'
);
gj = gj.replace(
  '{ id: \'entities\',    url: "images/entities.png"    }',
  '{ id: \'entities\',    url: ' + assetExpr('images/entities.png') + ' }'
);

// Licensed-for-original-project-only audio is not shipped. Empty list so
// loadResources only waits on the two sprite sheets.
gj = gj.replace(/sounds:\s*\[[\s\S]*?\n    \],\n\n    levels:/, 'sounds: [],\n\n    levels:');

// Level PNGs: data URIs, no cachebuster query.
for (const n of LEVELS) {
  const path = 'levels/' + n;
  gj = gj.split('url: "' + path + '"').join('url: ' + assetExpr(path));
}
gj = gj.replace(
  'level.source = Game.createImage(level.url + "?cachebuster=" + VERSION , { onload: onloaded });',
  'level.source = Game.createImage(level.url, { onload: onloaded });'
);

// confirm() is a dead dialog in the sandbox.
gj = gj.replace(
  `onbeforequit: function(event, previous, current) {
      if (!confirm('Quit Game?'))
        return false;
    },`,
  'onbeforequit: function() {},'
);

// Dummy audio so Sounds.initialize does not throw on missing files.
gj = gj.replace(
  `initialize: function(sounds) {
      this.sounds      = sounds;
      this.sounds.menu = this.sounds.lostcorridors;
      this.sounds.game = this.sounds.thebeginning;
      this.sounds.fire = this.sounds.firewizard;     // re-use wizard firing sound for monster (demon) fire
      this.sounds.nuke = this.sounds.generatordeath; // TODO: find a big bang explosion
      this.toggleMute(this.isMute());`,
  `initialize: function(sounds) {
      var dummy = { play: function () {}, stop: function () {}, fade: function () {} };
      this.sounds = sounds || {};
      this.sounds.menu = dummy;
      this.sounds.game = dummy;
      this.sounds.fire = dummy;
      this.sounds.nuke = dummy;
      this.toggleMute(true);`
);

gj = gj.replace(
  'play:      function(s) { if (this.isNotMute()) return s.play(); },',
  'play:      function(s) { if (s && this.isNotMute()) return s.play(); },'
);

// Extra adventurers: occupy start + a slot offset, occupied() hits any of them.
gj = gj.replace(
  'map.occupy(map.start.x, map.start.y, this);',
  'map.occupy(map.start.x + (this.slot || 0) * TILE, map.start.y, this);'
);
gj = gj.replace(
  `if ((game.player != ignore) && overlapEntity(x, y, w, h, game.player))
        return game.player;`,
  `var plist = game.allPlayers ? game.allPlayers() : [game.player];
      for (var pi = 0; pi < plist.length; pi++) {
        if ((plist[pi] != ignore) && overlapEntity(x, y, w, h, plist[pi]))
          return plist[pi];
      }`
);

gj = gj.replace(
  `update: function(frame) {
      if (this.canUpdate) {
        this.player.update(   frame, this.player, this.map, this.viewport);
        this.map.update(      frame, this.player, this.map, this.viewport);
        this.viewport.update( frame, this.player, this.map, this.viewport);
      }
    },`,
  `allPlayers: function() {
      var list = [this.player];
      if (this.party) {
        for (var i = 0; i < this.party.length; i++) list.push(this.party[i]);
      }
      return list;
    },

    update: function(frame) {
      if (this.canUpdate) {
        if (window.GauntletNet && window.GauntletNet.guestWatching()) {
          window.GauntletNet.applyWorld(this);
        } else {
          var folks = this.allPlayers();
          for (var i = 0; i < folks.length; i++)
            folks[i].update(frame, folks[i], this.map, this.viewport);
          this.map.update(      frame, this.player, this.map, this.viewport);
          this.viewport.update( frame, this.player, this.map, this.viewport);
          if (window.GauntletNet) window.GauntletNet.publish(this);
        }
      }
    },`
);

gj = gj.replace(
  `this.render.player(  ctx, frame, this.viewport, this.player);
        this.scoreboard.refreshPlayer(this.player);`,
  `var folks = this.allPlayers();
        for (var i = 0; i < folks.length; i++)
          this.render.player(ctx, frame, this.viewport, folks[i]);
        this.scoreboard.refreshPlayer(this.player);
        if (window.GauntletNet) window.GauntletNet.refreshBoard(this);`
);

gj = gj.replace(
  'onPlayerDeath:  function()       { this.lose(); },',
  `onPlayerDeath:  function() {
      var folks = this.allPlayers ? this.allPlayers() : [this.player];
      for (var i = 0; i < folks.length; i++) {
        if (folks[i] && folks[i].active && folks[i].active()) return;
      }
      this.lose();
    },`
);

gj = gj.replace(
  'var Player = Class.create({',
  'var Player = window.GauntletPlayer = Class.create({'
);
gj = gj.replace(
  'PLAYERS   = [ PLAYER.WARRIOR, PLAYER.VALKYRIE, PLAYER.WIZARD, PLAYER.ELF ],',
  'PLAYERS   = [ PLAYER.WARRIOR, PLAYER.VALKYRIE, PLAYER.WIZARD, PLAYER.ELF ],\n      _expose = (window.GAUNTLET_TYPES = PLAYER),'
);

if (gj.includes("name: 'sounds/")) throw new Error('gauntlet.js still references sound files');
if (gj.includes('?cachebuster=')) throw new Error('cachebuster query still on level URLs');
if (/<\/script/i.test(gj) || /<\/script/i.test(gameJs)) throw new Error('script contains </script');

writeFileSync(join(out, 'gauntlet.js'), gj);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/js-gauntlet/vendor.mjs.

upstream: ${UPSTREAM.replace(/\.git$/, '')}
commit:   ${PIN}
date:     2025-06-01
license:  MIT (COPYING.txt) for the code.

NOT copied (licensed only for the original project, see upstream README):
  sounds/music.*     Lucky Lion Studios
  sounds/*.ogg/mp3   Premium Beat SFX
Boot.js / the Sounds stub synthesise nothing — the dungeon is silent.

Copied and lightly patched:
  js/vendor.js, js/game.js, js/gauntlet.js, css, images, level PNGs.

Patches in gauntlet.js / game.js:
  - image and level URLs are data URIs (GAUNTLET_ASSETS)
  - no audio files, Sounds is a mute stub
  - Game.run does not hang if DOMContentLoaded already fired
  - extra adventurers (party[]) occupy start+slot, share collision
  - confirm() on quit removed

sha256:
  gauntlet.js  ${sha('gauntlet.js')}
  game.js      ${sha('game.js')}
  vendor.js    ${sha('vendor.js')}
  COPYING.txt  ${sha('COPYING.txt')}

The MIT notice travels INSIDE the GIF as COPYING.txt as well as here.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/js-gauntlet/vendor/ from', PIN.slice(0, 10),
            Object.keys(assets).length, 'assets');

