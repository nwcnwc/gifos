/*
 * vendor.mjs — rebuild vendor/ from the pinned javascript-delta commit.
 * Title/game music is a SID recording and is NOT copied. SFX stubs in boot.
 *
 *   node apps/delta/vendor.mjs
 *   DELTA_SRC=/path/to/checkout node apps/delta/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const UPSTREAM = 'https://github.com/jakesgordon/javascript-delta.git';
const PIN = 'ef19b22f9afe7f6054dae3fbf7dc8a4510725c88';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.DELTA_SRC, tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'delta-'));
  src = join(tmp, 'delta');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING.txt'));
copyFileSync(join(src, 'js', 'vendor.js'), join(out, 'vendor.js'));
copyFileSync(join(src, 'js', 'game.js'), join(out, 'game.js'));
copyFileSync(join(src, 'css', 'normalize.css'), join(out, 'normalize.css'));

const MIME = { '.png': 'image/png', '.gif': 'image/gif' };
function dataUrl(abs) {
  return 'data:' + (MIME[extname(abs)] || 'application/octet-stream') + ';base64,' + readFileSync(abs).toString('base64');
}
const IMAGES = ['images/sprites.png', 'images/aliens.png', 'images/rocks.png', 'images/bullets.png', 'images/life.png', 'images/mute.png', 'images/booting.gif'];
const assets = {};
for (const p of IMAGES) assets[p] = dataUrl(join(src, p));
writeFileSync(join(out, 'assets.js'), 'window.DELTA_ASSETS = ' + JSON.stringify(assets) + ';\n');

function A(p) { return '(window.DELTA_ASSETS && window.DELTA_ASSETS[' + JSON.stringify(p) + '])'; }

let css = readFileSync(join(src, 'css', 'delta.css'), 'utf8');
css = css.replace("font-family: 'Orbitron', sans-serif;", 'font-family: ui-monospace, Menlo, Consolas, monospace;');
css = css.replace('url(../images/mute.png)', 'url(' + assets['images/mute.png'] + ')');
writeFileSync(join(out, 'delta.css'), css);

let dj = readFileSync(join(src, 'js', 'delta.js'), 'utf8');
dj = dj.replace('{ id: "sprites", url: "images/sprites.png" }', '{ id: "sprites", url: ' + A('images/sprites.png') + ' }');
dj = dj.replace('{ id: "aliens",  url: "images/aliens.png"  }', '{ id: "aliens",  url: ' + A('images/aliens.png') + ' }');
dj = dj.replace('{ id: "rocks",   url: "images/rocks.png"   }', '{ id: "rocks",   url: ' + A('images/rocks.png') + ' }');
dj = dj.replace('{ id: "bullets", url: "images/bullets.png" }', '{ id: "bullets", url: ' + A('images/bullets.png') + ' }');
dj = dj.replace(/sounds:\s*\[[\s\S]*?\],\s*\n\s*state:/, 'sounds: [],\n\n    state:');
dj = dj.replace(
  `reset: function(sounds) {
      this.sounds = sounds;
      this.toggleMute(this.isMute());`,
  `reset: function(sounds) {
      var dummy = { play: function () {}, stop: function () {}, fade: function () {} };
      this.sounds = sounds || {};
      this.sounds.title = dummy;
      this.sounds.game = dummy;
      this.sounds.shoot = { play: function () { if (window.DeltaSfx) window.DeltaSfx.shoot(); }, stop: function () {}, fade: function () {} };
      this.sounds.explode = { play: function () { if (window.DeltaSfx) window.DeltaSfx.explode(); }, stop: function () {}, fade: function () {} };
      this.toggleMute(this.isMute());`
);
dj = dj.replace(
  'play:      function(s) { if (this.isNotMute()) return s.play(); },',
  'play:      function(s) { if (s && this.isNotMute()) return s.play(); },'
);
if (dj.includes('sounds/title') || dj.includes('sounds/game')) throw new Error('music paths remain');
if (/<\/script/i.test(dj)) throw new Error('</script');
if (!dj.includes('window.sounds')) {
  dj = dj.replace('window.renderer = renderer;', 'window.renderer = renderer;\n  window.sounds   = sounds;');
}
writeFileSync(join(out, 'delta.js'), dj);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/delta/vendor.mjs.

upstream: ${UPSTREAM.replace(/\.git$/, '')}
commit:   ${PIN}
license:  MIT (COPYING.txt) for the code.

NOT copied: sounds/title.* and sounds/game.* (Rob Hubbard SID recordings).
Shoot/explode are hooked to window.DeltaSfx (synthesized in sfx.js), never the SID.

sha256:
  delta.js     ${sha('delta.js')}
  game.js      ${sha('game.js')}
  COPYING.txt  ${sha('COPYING.txt')}
`);
if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/delta/vendor/ from', PIN.slice(0, 10));

