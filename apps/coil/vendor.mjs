/*
 * vendor.mjs — rebuild vendor/ from the pinned leereilly/Coil commit
 * (Hakim El Hattab's Coil, MIT).
 *
 *   node apps/coil/vendor.mjs
 *   COIL_SRC=/path/to/checkout node apps/coil/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const UPSTREAM = 'https://github.com/leereilly/Coil.git';
const PIN = 'ea6fd3afae10a6d8a53b07e82be4211619206ede';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.COIL_SRC, tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'coil-'));
  src = join(tmp, 'coil');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING.txt'));
copyFileSync(join(src, 'js', 'libs', 'jquery-1.6.2.min.js'), join(out, 'jquery.min.js'));
copyFileSync(join(src, 'js', 'util.js'), join(out, 'util.js'));
copyFileSync(join(src, 'css', 'reset.css'), join(out, 'reset.css'));

const tex = 'data:image/png;base64,' + readFileSync(join(src, 'images', 'texture.png')).toString('base64');
const bg = 'data:image/jpeg;base64,' + readFileSync(join(src, 'images', 'background.jpg')).toString('base64');
writeFileSync(join(out, 'assets.js'),
  'window.COIL_TEXTURE = ' + JSON.stringify(tex) + ';\n' +
  'window.COIL_BG = ' + JSON.stringify(bg) + ';\n');

let css = readFileSync(join(src, 'css', 'main.css'), 'utf8');
css = css.replace("url('../images/background.jpg')", 'url(' + bg + ')');
css = css.replace(/Molengo, Helvetica, Arial, sans-serif/g, 'Georgia, serif');
css = css.replace(/Ubuntu, Helvetica, Arial, sans-serif/g, 'ui-sans-serif, Helvetica, Arial, sans-serif');
writeFileSync(join(out, 'main.css'), css);

let js = readFileSync(join(src, 'js', 'coil.js'), 'utf8');
js = js.replace(
  'var TOUCH_INPUT = navigator.userAgent.match( /(iPhone|iPad|iPod|Android)/i );',
  "var TOUCH_INPUT = ('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0);"
);
js = js.replace(
  "effectsTexture = WebGLUtil.loadTexture( context3d, 'images/texture.png', $.proxy( function() {",
  "effectsTexture = WebGLUtil.loadTexture( context3d, window.COIL_TEXTURE, $.proxy( function() {"
);
js = js.replace(
  `function stop() {
		scorePanel.style.display = 'block';
		scorePanel.querySelector( 'p' ).innerHTML = Math.floor( score );`,
  `function stop() {
		scorePanel.style.display = 'block';
		scorePanel.querySelector( 'p' ).innerHTML = Math.floor( score );
		if (window.CoilOnStop) window.CoilOnStop(Math.floor(score));`
);
if (js.includes("'images/texture.png'")) throw new Error('texture path remains');
if (/<\/script/i.test(js)) throw new Error('</script');
writeFileSync(join(out, 'coil.js'), js);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/coil/vendor.mjs.

upstream: ${UPSTREAM.replace(/\.git$/, '')}
commit:   ${PIN}
license:  MIT, Hakim El Hattab (COPYING.txt)

Patches: touch detection, texture data URI, CoilOnStop hook.

sha256:
  coil.js      ${sha('coil.js')}
  util.js      ${sha('util.js')}
  COPYING.txt  ${sha('COPYING.txt')}
`);
if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/coil/vendor/ from', PIN.slice(0, 10));

