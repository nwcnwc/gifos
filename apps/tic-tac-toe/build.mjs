// Pack apps/tic-tac-toe/ into site/apps/tic-tac-toe/tic-tac-toe.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. This is a
// rewrite of the Colyseus demo's playable 3×3 — no Pixi, no Colyseus, no
// Node server.
//
// Run:  node apps/tic-tac-toe/build.mjs
import { ticTacToeIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush — the
// encoder is not a streaming compressor anyway.
{
  const Orig = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (Orig) return new Orig(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) {
          controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks))));
        }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const SCRIPTS = ['rules.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'rules.js': read('rules.js'),
  'app.js': read('app.js'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of the MIT work.
  'COPYING.txt': read('COPYING.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module — the runtime drops it.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) {
  throw new Error('tic-tac-toe has no network path. Colyseus/Node stay behind.');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — the CPU is plain JavaScript');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
}
if (!Number.isInteger(manifest.minBuild)) throw new Error('minBuild must be an integer');
if (!html.includes('Play a friend')) throw new Error('index.html is missing Play a friend');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}

const packed = files['app.js'] + files['rules.js'] + html;
if (/colyseus|joinOrCreate|@colyseus|pixi\.js/i.test(packed)) {
  throw new Error('Colyseus/Pixi must not ship — the room was ripped out');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish moves on the player\'s own row');
}
if (!files['app.js'].includes('putBoard') || !files['app.js'].includes('isHost')) {
  throw new Error('host applies legal moves to the board row; nobody else writes it');
}
if (!files['rules.js'].includes('cpuPick') || !files['rules.js'].includes('cpuMoves')) {
  throw new Error('rules.js must include the perfect-play CPU');
}
if (!files['rules.js'].includes('minimax')) {
  throw new Error('rules.js CPU must be minimax, not a heuristic');
}

{
  const sandbox = { window: {} };
  vm.runInNewContext(files['rules.js'], sandbox);
  const T = sandbox.window.TTT;
  if (!T || !T.cpuMoves) throw new Error('rules.js did not attach TTT.cpuMoves');
  function assertNeverLoses(cpuMark) {
    function walk(s) {
      if (s.winner) {
        if (s.winner !== -1 && T.colorName(s.winner) !== cpuMark) {
          throw new Error('perfect CPU lost as ' + cpuMark);
        }
        return;
      }
      var i, ns;
      if (T.colorName(s.turn) === cpuMark) {
        var moves = T.cpuMoves(s);
        if (!moves || !moves.length) throw new Error('CPU passed as ' + cpuMark);
        for (i = 0; i < moves.length; i++) {
          ns = T.place(s, moves[i].r, moves[i].c);
          if (!ns) throw new Error('CPU illegal move as ' + cpuMark);
          walk(ns);
        }
      } else {
        for (i = 0; i < 9; i++) {
          ns = T.placeI(s, i);
          if (ns) walk(ns);
        }
      }
    }
    walk(T.fresh());
  }
  assertNeverLoses('x');
  assertNeverLoses('o');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: ticTacToeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tic-tac-toe', 'tic-tac-toe.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tic-tac-toe/tic-tac-toe.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no Colyseus, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
