// Node round-trip test for the GIF codec + writes a sample GIF for browser check.
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'js', 'gifos-gif.js'));
const { gif } = globalThis.GifOS;

const files = {
  'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'notes', name: 'Notes', entry: 'index.html' }),
  'index.html': '<!doctype html><h1>Hello from a GIF</h1><p>Unicode: café ☕ 日本語</p>',
  'app.js': 'console.log("running inside a gif");',
  '.state/db.json': JSON.stringify({ notes: [{ id: 1, text: 'first note' }] }),
  'assets/blob.bin': null, // replaced below with binary
};
// binary asset (all byte values)
const bin = new Uint8Array(256);
for (let i = 0; i < 256; i++) bin[i] = i;
files['assets/blob.bin'] = bin;

const bytes = gif.encode(files, { accent: [255, 92, 170] });
console.log('encoded GIF bytes:', bytes.length);
console.log('header:', String.fromCharCode(...bytes.subarray(0, 6)));

const back = gif.decode(bytes);
let ok = true;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) ok = false; }

check('is GifOS gif', gif.isGifosGif(bytes));
check('has index.html', !!back.files['index.html']);
check('index.html text round-trips (unicode)',
  gif.bytesToText(back.files['index.html']) === files['index.html']);
check('manifest parses', gif.readManifest(bytes).appId === 'notes');
check('nested .state path preserved', !!back.files['.state/db.json']);
check('binary asset round-trips exactly', (() => {
  const b = back.files['assets/blob.bin'];
  if (b.length !== 256) return false;
  for (let i = 0; i < 256; i++) if (b[i] !== i) return false;
  return true;
})());
check('trailer byte present', bytes[bytes.length - 1] === 0x3b);

// plain (non-GifOS) bytes should decode to null
check('rejects non-GifOS data', gif.decode(new Uint8Array([0x47, 0x49, 0x46, 1, 2, 3])) === null);

fs.writeFileSync(path.join(__dirname, 'sample.gif'), Buffer.from(bytes));
console.log('wrote test/sample.gif');
process.exit(ok ? 0 : 1);
