/*
 * vendor.mjs — rebuild vendor/ from the pinned johnnesky/beepbox tag (v4.2.2).
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/beepbox/vendor.mjs
 *   BEEPBOX_SRC=/path/to/checkout node apps/beepbox/vendor.mjs
 *
 * WHAT IT PRODUCES. The compiled editor IIFE (classic script, name beepbox)
 * plus the MIT notice, a first-run seed generated from Song, and UPSTREAM.txt.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/johnnesky/beepbox.git';
const PIN = '3a88cd674149c8c15b7f59064db07c082f9eb152'; // v4.2.2
const EDITOR_SHA256 = '62d253d49f5987928d0c7c81e43a7cae62e82e3c289fe341df58d3f2d2d7fe59';

const run = (cmd, args, cwd, opts = {}) => execFileSync(cmd, args, {
  cwd, stdio: 'inherit', timeout: 600000,
  ...opts,
});

let src = process.env.BEEPBOX_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'beepbox-'));
  src = join(tmp, 'beepbox');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

mkdirSync(out, { recursive: true });

const editorJs = join(src, 'website', 'beepbox_editor.min.js');
const synthJs = join(src, 'website', 'beepbox_synth.min.js');
if (!existsSync(editorJs) || !existsSync(synthJs)) {
  console.log('npm install + build-editor + build-synth…');
  run('npm', ['install', '--no-audit', '--no-fund'], src);
  run('npm', ['run', 'build-synth'], src);
  run('npm', ['run', 'build-editor'], src);
}
if (!existsSync(editorJs)) throw new Error('editor bundle missing after build');

// prompt() in the app frame returns null without asking (no allow-modals —
// test/unit/app-modals.js). The editor's two prompts are both the clipboard
// fallback (the text to copy, when the Clipboard API or execCommand fails);
// they now ask through gifosAsk (shim.js), which shows the text selected in a
// dialog of its own. The pin below is the sha256 of the PATCHED bundle.
let editorSrc = readFileSync(editorJs, 'utf8');
for (const [from, to] of [
  ['window.prompt("Copy to clipboard:",t)', 'window.gifosAsk("Copy to clipboard:",t)'],
  ['window.prompt("Copy this:",t)', 'window.gifosAsk("Copy this:",t)'],
]) {
  if (editorSrc.split(from).length !== 2) throw new Error('prompt() patch did not match exactly once: ' + from);
  editorSrc = editorSrc.replace(from, to);
}
const buf = Buffer.from(editorSrc, 'utf8');
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== EDITOR_SHA256) {
  console.warn('editor sha256 is ' + hex + ' (pin was ' + EDITOR_SHA256 + ') — update EDITOR_SHA256 in vendor.mjs and build.mjs if the pin moved.');
}

writeFileSync(join(out, 'beepbox_editor.min.js'), buf);
copyFileSync(join(src, 'LICENSE.md'), join(out, 'COPYING-beepbox.txt'));

function makeSeed() {
  const code = readFileSync(synthJs, 'utf8');
  const sandbox = {
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, Error,
    Uint8Array, Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer,
    parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const Song = sandbox.beepbox && sandbox.beepbox.Song;
  if (!Song) throw new Error('synth bundle did not export Song');
  function note(pitches, t0, t1) {
    return { pitches, points: [
      { tick: t0, pitchBend: 0, volume: 100 },
      { tick: t1, pitchBend: 0, volume: 100 },
    ] };
  }
  function chip(wave) {
    return {
      type: 'chip', volume: 0, wave, unison: 'none', effects: [],
      fadeInSeconds: 0, fadeOutTicks: -3, envelopes: [], eqFilter: [],
    };
  }
  const json = {
    format: 'BeepBox', version: 9, scale: 'easy :)', key: 'C',
    introBars: 0, loopBars: 4, beatsPerBar: 8, ticksPerBeat: 4, beatsPerMinute: 148,
    layeredInstruments: false, patternInstruments: false,
    channels: [
      { type: 'pitch', octaveScrollBar: 2, instruments: [chip('square')],
        patterns: [{ notes: [
          note([24], 0, 2), note([26], 2, 4), note([28], 4, 6), note([27], 6, 8),
          note([26], 8, 12), note([24], 12, 16),
          note([28], 16, 20), note([27], 20, 24),
          note([26], 24, 28), note([24], 28, 32),
        ] }],
        sequence: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { type: 'pitch', octaveScrollBar: 1, instruments: [chip('triangle')],
        patterns: [{ notes: [note([24], 0, 4), note([27], 8, 12), note([28], 16, 20), note([24], 24, 28)] }],
        sequence: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { type: 'pitch', octaveScrollBar: 1, instruments: [chip('rounded')],
        patterns: [{ notes: [note([24, 26], 0, 8), note([26, 28], 16, 24)] }],
        sequence: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { type: 'drum', instruments: [{
          type: 'noise', volume: 0, wave: 'retro', effects: [],
          fadeInSeconds: 0, fadeOutTicks: -1, envelopes: [], eqFilter: [],
        }],
        patterns: [{ notes: [
          note([0], 0, 2), note([0], 8, 10),
          note([0], 16, 18), note([0], 24, 26),
        ] }],
        sequence: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ],
  };
  const s = new Song();
  s.fromJsonObject(json);
  const outJson = s.toJsonObject();
  if (!outJson.channels || outJson.channels[0].patterns[0].notes.length < 8) {
    throw new Error('seed did not round-trip notes');
  }
  const b64 = s.toBase64String();
  const s2 = new Song();
  s2.fromJsonObject(outJson);
  if (s2.toBase64String() !== b64) throw new Error('seed hash mismatch');
  return outJson;
}

const seed = makeSeed();
writeFileSync(join(out, 'seed.json'), JSON.stringify(seed));
writeFileSync(join(out, 'seed.js'), 'window.BEEPBOX_SEED = ' + JSON.stringify(seed) + ';\n');

writeFileSync(join(out, 'UPSTREAM.txt'),
  'BeepBox 4.2.2\n' +
  UPSTREAM + '\n' +
  'commit ' + PIN + '\n' +
  'tag v4.2.2\n\n' +
  'vendor/beepbox_editor.min.js is the official editor IIFE\n' +
  '(scripts/compile_editor.sh — rollup format iife, name beepbox, then terser).\n' +
  'sha256 ' + hex + '\n' +
  'Never fetched at runtime. Rebuild with:\n\n' +
  '  node apps/beepbox/vendor.mjs\n\n' +
  'MIT, John Nesky and contributing authors. The notice rides inside\n' +
  'the GIF as COPYING-beepbox.txt.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('vendor/beepbox_editor.min.js', (buf.length / 1024).toFixed(0), 'KB sha256', hex);
console.log('vendor/seed.json', JSON.stringify(seed).length, 'bytes');
