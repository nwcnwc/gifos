/*
 * vendor.mjs — rebuild vendor/ from the pinned le-doux/bitsy commit (v8.15).
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/bitsy/vendor.mjs
 *   BITSY_SRC=/path/to/checkout node apps/bitsy/vendor.mjs
 *
 * WHAT IT PRODUCES. The bitsy engine + system (classic scripts, concat in
 * load order) plus the default font and the example world. The 8 MB editor
 * resource pack is not here — this app is the player, a few worlds, and a
 * small editor of our own. Two GifOS seams: touch stays on the game canvas
 * (upstream's fullscreen overlay would eat the chrome), and typing in a
 * box does not steal arrow keys.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/le-doux/bitsy.git';
const PIN = '6c0238f6526c3a608bd711cf465bfe51f55573ad'; // v8.15

const ENGINE = [
  'editor/script/system/input.js',
  'editor/script/system/soundchip.js',
  'editor/script/system/graphics.js',
  'editor/script/system/system.js',
  'editor/script/engine/world.js',
  'editor/script/engine/sound.js',
  'editor/script/engine/font.js',
  'editor/script/engine/transition.js',
  'editor/script/engine/script.js',
  'editor/script/engine/dialog.js',
  'editor/script/engine/renderer.js',
  'editor/script/engine/bitsy.js',
];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

function mustReplace(src, find, replace, why) {
  if (typeof find === 'string') {
    if (!src.includes(find)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
    return src.split(find).join(replace);
  }
  if (!find.test(src)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
  return src.replace(find, replace);
}

let src = process.env.BITSY_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'bitsy-'));
  src = join(tmp, 'bitsy');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

mkdirSync(out, { recursive: true });

writeFileSync(join(out, 'COPYING-bitsy.txt'), readFileSync(join(src, 'LICENSE.md')));
writeFileSync(join(out, 'CREDITS-bitsy.txt'), readFileSync(join(src, 'CREDITS.md')));

const font = readFileSync(join(src, 'dev/resources/bitsyfont/ascii_small.bitsyfont'), 'utf8').replace(/\r\n/g, '\n');
if (!font.startsWith('FONT ascii_small')) throw new Error('ascii_small.bitsyfont is not the default bitsy font');
writeFileSync(join(out, 'ascii_small.bitsyfont'), font);

const example = readFileSync(join(src, 'dev/resources/defaultGameData.bitsy'), 'utf8').replace(/\r\n/g, '\n');
if (!example.includes('SPR A') || !example.includes("I'm a cat")) {
  throw new Error('defaultGameData.bitsy is not the cat-and-tea example');
}
writeFileSync(join(out, 'default.bitsy'), example);

const parts = [];
for (const rel of ENGINE) {
  let body = readFileSync(join(src, rel), 'utf8').replace(/\r\n/g, '\n');
  if (rel.endsWith('input.js')) {
    body = mustReplace(
      body,
      `	function stopWindowScrolling(e) {
		if (e.keyCode == self.Key.LEFT || e.keyCode == self.Key.RIGHT || e.keyCode == self.Key.UP || e.keyCode == self.Key.DOWN || !isPlayerEmbeddedInEditor) {
			e.preventDefault();
		}
	}`,
      `	function stopWindowScrolling(e) {
		var tag = e.target && e.target.tagName;
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
		if (e.keyCode == self.Key.LEFT || e.keyCode == self.Key.RIGHT || e.keyCode == self.Key.UP || e.keyCode == self.Key.DOWN) {
			e.preventDefault();
		}
	}`,
      'stopWindowScrolling skips text fields',
    );
    body = mustReplace(
      body,
      `	this.listen = function(canvas) {
		document.addEventListener('keydown', self.onkeydown);
		document.addEventListener('keyup', self.onkeyup);

		if (isPlayerEmbeddedInEditor) {
			canvas.addEventListener('touchstart', self.ontouchstart, {passive:false});
			canvas.addEventListener('touchmove', self.ontouchmove, {passive:false});
			canvas.addEventListener('touchend', self.ontouchend, {passive:false});
		}
		else {
			// creates a 'touchTrigger' element that covers the entire screen and can universally have touch event listeners added w/o issue.

			// we're checking for existing touchTriggers both at game start and end, so it's slightly redundant.
			var existingTouchTrigger = document.querySelector('#touchTrigger');

			if (existingTouchTrigger === null) {
				var touchTrigger = document.createElement("div");
				touchTrigger.setAttribute("id","touchTrigger");

				// afaik css in js is necessary here to force a fullscreen element
				touchTrigger.setAttribute(
					"style","position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; overflow: hidden;"
				);

				document.body.appendChild(touchTrigger);

				touchTrigger.addEventListener('touchstart', self.ontouchstart);
				touchTrigger.addEventListener('touchmove', self.ontouchmove);
				touchTrigger.addEventListener('touchend', self.ontouchend);
			}
		}

		window.onblur = self.onblur;
	}`,
      `	this.listen = function(canvas) {
		document.addEventListener('keydown', self.onkeydown);
		document.addEventListener('keyup', self.onkeyup);
		if (canvas) {
			canvas.addEventListener('touchstart', self.ontouchstart, {passive:false});
			canvas.addEventListener('touchmove', self.ontouchmove, {passive:false});
			canvas.addEventListener('touchend', self.ontouchend, {passive:false});
		}
		window.onblur = self.onblur;
	}`,
      'listen attaches touch to the canvas only',
    );
    body = mustReplace(
      body,
      `	this.unlisten = function(canvas) {
		document.removeEventListener('keydown', self.onkeydown);
		document.removeEventListener('keyup', self.onkeyup);

		if (isPlayerEmbeddedInEditor) {
			canvas.removeEventListener('touchstart', self.ontouchstart);
			canvas.removeEventListener('touchmove', self.ontouchmove);
			canvas.removeEventListener('touchend', self.ontouchend);
		}
		else {
			//check for touchTrigger and removes it

			var existingTouchTrigger = document.querySelector('#touchTrigger');

			if (existingTouchTrigger !== null) {
				existingTouchTrigger.removeEventListener('touchstart', self.ontouchstart);
				existingTouchTrigger.removeEventListener('touchmove', self.ontouchmove);
				existingTouchTrigger.removeEventListener('touchend', self.ontouchend);

				existingTouchTrigger.parentElement.removeChild(existingTouchTrigger);
			}
		}

		window.onblur = null;
	}`,
      `	this.unlisten = function(canvas) {
		document.removeEventListener('keydown', self.onkeydown);
		document.removeEventListener('keyup', self.onkeyup);
		if (canvas) {
			canvas.removeEventListener('touchstart', self.ontouchstart);
			canvas.removeEventListener('touchmove', self.ontouchmove);
			canvas.removeEventListener('touchend', self.ontouchend);
		}
		window.onblur = null;
	}`,
      'unlisten matches canvas-only touch',
    );
  }
  if (rel.endsWith('soundchip.js')) {
    body = mustReplace(
      body,
      'var audioContext = new AudioContext();',
      'var audioContext = new (window.AudioContext || window.webkitAudioContext)();',
      'AudioContext webkit fallback',
    );
  }
  if (/<\/script/i.test(body)) throw new Error(rel + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(body)) {
    throw new Error(rel + ' uses ESM — classic scripts only');
  }
  parts.push('/* ---- ' + rel.replace('editor/script/', '') + ' ---- */\n' + body.replace(/\s+$/, '') + '\n');
}

const engine = parts.join('\n');
if (engine.includes('fetch(') || engine.includes('XMLHttpRequest') || engine.includes('WebSocket')) {
  throw new Error('engine has a network call');
}
if (engine.includes('eval(') || engine.includes('new Function(')) {
  throw new Error('engine uses eval/Function');
}
if (!engine.includes('function loadGame') || !engine.includes('function parseWorld') || !engine.includes('function serializeWorld')) {
  throw new Error('engine is missing loadGame/parseWorld/serializeWorld');
}
if (!engine.includes('canvas.addEventListener(\'touchstart\'')) {
  throw new Error('touch is not on the canvas');
}
writeFileSync(join(out, 'bitsy-engine.js'), engine);

writeFileSync(
  join(out, 'font.js'),
  'var BITSY_DEFAULT_FONT = ' + JSON.stringify(font) + ';\n',
);
writeFileSync(
  join(out, 'example.js'),
  'var BITSY_EXAMPLE_WORLD = ' + JSON.stringify(example) + ';\n',
);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/bitsy/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
tag:      v8.15
date:     2026-02-12
license:  MIT, Bitsy authors (COPYING-bitsy.txt, CREDITS-bitsy.txt)

bitsy-engine.js is the player (system + engine) concat, in the same order
as the exported-game template, with two seams:
  touch listeners attach to the game canvas (no fullscreen overlay)
  arrow keys are not preventDefault'd while a text field is focused
  AudioContext uses the webkit fallback name

ascii_small.bitsyfont is the default font. default.bitsy is the example
world that ships in the editor. font.js is that font as a classic-script
string (BITSY_DEFAULT_FONT).

The 8 MB editor resource pack (icons, extra fonts, localisation) is not
vendored. This app is the player plus a small editor of our own.

sha256:
  bitsy-engine.js         ${sha('bitsy-engine.js')}
  ascii_small.bitsyfont   ${sha('ascii_small.bitsyfont')}
  default.bitsy           ${sha('default.bitsy')}
  font.js                 ${sha('font.js')}
  example.js              ${sha('example.js')}
  COPYING-bitsy.txt       ${sha('COPYING-bitsy.txt')}
  CREDITS-bitsy.txt       ${sha('CREDITS-bitsy.txt')}

The notice travels INSIDE the GIF as COPYING-bitsy.txt.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });

console.log('wrote apps/bitsy/vendor/ — engine concat + font + example world + COPYING');
console.log('pin', PIN.slice(0, 10), 'engine', sha('bitsy-engine.js').slice(0, 12) + '…');

