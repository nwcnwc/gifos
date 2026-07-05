// Node round-trip test for the GIF codec + writes a sample GIF for browser check.
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'site', 'js', 'gifos-gif.js'));
const { gif } = globalThis.GifOS;

let ok = true;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) ok = false; }

(async () => {
  const files = {
    'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'notes', name: 'Notes', entry: 'index.html' }),
    'index.html': '<!doctype html><h1>Hello from a GIF</h1><p>Unicode: café ☕ 日本語</p>',
    'app.js': 'console.log("running inside a gif");'.repeat(50), // repetitive → compressible
    '.state/db.json': JSON.stringify({ notes: [{ id: 1, text: 'first note' }] }),
  };
  const bin = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bin[i] = i;
  files['assets/blob.bin'] = bin;

  const bytes = await gif.encode(files, { accent: [255, 92, 170] });
  console.log('encoded GIF bytes (compressed):', bytes.length);
  console.log('header:', String.fromCharCode(...bytes.subarray(0, 6)));

  const back = await gif.decode(bytes);
  check('is GifOS gif (marker scan)', gif.looksLikeGifosGif(bytes));
  check('has index.html', !!back.files['index.html']);
  check('index.html text round-trips (unicode)', gif.bytesToText(back.files['index.html']) === files['index.html']);
  check('manifest parses', gif.readManifest(back).appId === 'notes');
  check('nested .state path preserved', !!back.files['.state/db.json']);
  check('binary asset round-trips exactly', (() => {
    const b = back.files['assets/blob.bin'];
    if (b.length !== 256) return false;
    for (let i = 0; i < 256; i++) if (b[i] !== i) return false;
    return true;
  })());
  check('trailer byte present', bytes[bytes.length - 1] === 0x3b);
  // animated icon → NETSCAPE loop extension + multiple image separators (0x2C)
  const hay = Buffer.from(bytes).toString('latin1');
  check('default icon is an animated GIF (NETSCAPE loop ext)', hay.indexOf('NETSCAPE2.0') >= 0);
  check('animated icon has multiple frames', (bytes.filter((b) => b === 0x2c).length) >= 2);
  check('rejects non-GifOS data', (await gif.decode(new Uint8Array([0x47, 0x49, 0x46, 1, 2, 3]))) === null);

  // Legacy (uncompressed) format still decodes: encode without CompressionStream.
  const savedCS = globalThis.CompressionStream;
  delete globalThis.CompressionStream;
  const legacyBytes = await gif.encode(files, { accent: [123, 92, 255] });
  globalThis.CompressionStream = savedCS;
  console.log('encoded GIF bytes (legacy/uncompressed):', legacyBytes.length);
  const legacyBack = await gif.decode(legacyBytes);
  check('legacy uncompressed payload still decodes', !!legacyBack && gif.bytesToText(legacyBack.files['index.html']) === files['index.html']);
  check('compression actually shrinks the payload', bytes.length < legacyBytes.length);

  // custom-artwork preview (256-color) still carries the app payload + is a valid GIF
  const pal = []; for (let i = 0; i < 256; i++) pal.push(i, 255 - i, (i * 3) & 255);
  const idx = new Uint8Array(16 * 16); for (let i = 0; i < idx.length; i++) idx[i] = i & 255;
  const artBytes = await gif.encode(
    { 'manifest.json': '{"appId":"art","name":"Art"}', 'index.html': '<h1>art</h1>' },
    { preview: { width: 16, height: 16, palette: pal, indices: idx, numColors: 256, minCodeSize: 8 } });
  const artBack = await gif.decode(artBytes);
  check('custom-artwork GIF still carries its app payload', !!artBack && gif.bytesToText(artBack.files['index.html']) === '<h1>art</h1>');
  check('artwork GIF logical screen is the icon size (16×16)', artBytes[6] === 16 && artBytes[7] === 0 && artBytes[8] === 16 && artBytes[9] === 0);

  // repack: swap only the embedded filesystem, keep the pixel/artwork bytes.
  // This is what Download + in-app Snapshot use so custom animated icons survive
  // when new state is folded into an existing GIF.
  const repacked = await gif.repack(artBytes, {
    'manifest.json': '{"appId":"art","name":"Art"}',
    'index.html': '<h1>art</h1>',
    '.state/db.json': JSON.stringify({ collections: { notes: { items: { a: 1 } } } }),
  });
  const repBack = await gif.decode(repacked);
  check('repack keeps the app payload', !!repBack && gif.bytesToText(repBack.files['index.html']) === '<h1>art</h1>');
  check('repack folds in the new state', !!repBack.files['.state/db.json'] &&
    JSON.parse(gif.bytesToText(repBack.files['.state/db.json'])).collections.notes.items.a === 1);
  check('repack preserves the artwork header byte-for-byte', (() => {
    // logical screen descriptor + global color table are before any GifOS/data
    // block; compare the leading pixel bytes to the original artwork GIF.
    for (let i = 0; i < 13; i++) if (repacked[i] !== artBytes[i]) return false;
    return artBytes[6] === 16 && artBytes[8] === 16; // still the 16×16 art canvas
  })());
  check('repack rejects a non-GifOS gif', await gif.repack(new Uint8Array([0x47, 0x49, 0x46]), {})
    .then(() => false, () => true));

  fs.writeFileSync(path.join(__dirname, 'sample.gif'), Buffer.from(bytes));
  console.log('wrote test/sample.gif');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
