/*
 * vendor.mjs — bundle starzonmyarmz/js13k-2018 (OnOff) from the pinned
 * commit into one classic script. Upstream is ESM; GifOS drops type=module.
 *
 *   node apps/onoff/vendor.mjs
 *   ONOFF_SRC=/path/to/checkout node apps/onoff/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const UPSTREAM = 'https://github.com/starzonmyarmz/js13k-2018.git';
const PIN = 'cb1e2e4615af6195aeb0dade06c08738511dd3b6';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.ONOFF_SRC, tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'onoff-'));
  src = join(tmp, 'onoff');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING.txt'));
copyFileSync(join(src, 'styles.css'), join(out, 'styles.css'));

const DEFAULT_NAME = {
  'create.js': 'create',
  'sleep.js': 'sleep',
  'levels.js': 'levels',
  'body.js': 'Body',
  'guy.js': 'Guy',
  'goal.js': 'Goal',
  'bar.js': 'Bar',
  'spikes.js': 'Spikes',
  'counter.js': 'Counter',
  'title.js': 'Title',
  'controls.js': 'Controls',
  'editor.js': 'Editor',
};

function transform(code, filename) {
  code = code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  code = code.replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  code = code.replace(/export\s+default\s+class\s+/g, 'class ');
  code = code.replace(/export\s+const\s+/g, 'var ');
  const def = DEFAULT_NAME[filename];
  if (def) code = code.replace(/export\s+default\s+/g, 'var ' + def + ' = ');
  else code = code.replace(/export\s+default\s+/g, 'var _default = ');
  if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
    throw new Error(filename + ' still has import/export');
  }
  return code;
}

const ORDER = [
  'src/dimensions.js',
  'src/create.js',
  'src/sleep.js',
  'src/tinymusic.js',
  'src/keys.js',
  'src/body.js',
  'src/guy.js',
  'src/goal.js',
  'src/bar.js',
  'src/spikes.js',
  'src/counter.js',
  'src/sound.js',
  'src/title.js',
  'src/controls.js',
  'src/editor.js',
  'src/levels.js',
  'index.js',
];

let bundle = '(function () {\n\'use strict\';\n';
for (const rel of ORDER) {
  const name = rel.split('/').pop();
  let code = readFileSync(join(src, rel), 'utf8');
  if (rel === 'index.js') {
    code = code.replace(/const level = new URL\(window\.location\)[\s\S]*?catch \(error\) \{\}\n\}/, '');
  }
  if (rel === 'src/editor.js') {
    code = code.replace(
      `      case 'g':
        const url = new URL(window.location)
        url.searchParams.set('level', JSON.stringify(this))
        window.location = url.toString()
        break`,
      `      case 'g':
        if (this.game) {
          this.game.scene.levels = [JSON.parse(JSON.stringify(this))]
          this.game.scene.index = 0
          this.game.state = 'play'
        }
        break`
    );
  }
  bundle += '\n/* ---- ' + rel + ' ---- */\n' + transform(code, name) + '\n';
}
bundle += '\nwindow.ONOFF_DOWN = DOWN;\nwindow.ONOFF_PRESSED = PRESSED;\nwindow.ONOFF_upKey = upKey;\n';
bundle += 'if (typeof game !== "undefined") window.ONOFF_GAME = game;\n';
bundle += '})();\n';

if (/<\/script/i.test(bundle)) throw new Error('bundle contains </script');
if (bundle.includes('new URL(window.location)')) throw new Error('URL level loader remains');
writeFileSync(join(out, 'onoff.js'), bundle);

const html = readFileSync(join(src, 'index.html'), 'utf8');
writeFileSync(join(out, 'index.upstream.html'), html);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/onoff/vendor.mjs.

upstream: ${UPSTREAM.replace(/\.git$/, '')}
commit:   ${PIN}
license:  MIT (COPYING.txt) — Daniel Marino and Brad Dunbar

onoff.js is the ESM sources concatenated in dependency order with
import/export stripped (classic IIFE). The URL custom-level loader is
removed (about:srcdoc has no query). refs/ (font, sketch, m4a) are not copied.

sha256:
  onoff.js     ${sha('onoff.js')}
  COPYING.txt  ${sha('COPYING.txt')}
`);
if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/onoff/vendor/ from', PIN.slice(0, 10), 'bundle', bundle.length, 'chars');

