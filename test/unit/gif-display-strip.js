// The DISPLAY-ONLY strip: an icon shows the animation, not the filesystem.
//
// A GifOS app is a GIF with a whole app inside it and can run to hundreds of
// megabytes; the picture on the Home Screen is a small looping sticker. So the
// icon's <img> is built from the animation alone (desktop.js blobUrlFor ->
// GifOS.gif.stripForDisplay).
//
// WHAT THIS FILE IS REALLY GUARDING is the word ONLY. The optimisation is safe
// exactly as long as those bytes never leave the <img>, so the assertions below
// are mostly about what stripForDisplay must NOT do: it must not touch the
// original, must not change a single pixel byte, and must hand back anything it
// does not fully understand unchanged rather than guessing. A stripped GIF that
// escaped into run/install/export/sign would be an app with no code in it.
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-gif.js'));
const { gif } = globalThis.GifOS;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const eq = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

(async () => {
  // A real app, built the way apps are really built.
  const files = {
    'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'notes', name: 'Notes', entry: 'index.html' }),
    'index.html': '<!doctype html><h1>Hello</h1>',
    'app.js': 'console.log("x");'.repeat(400),
    '.state/db.json': JSON.stringify({ notes: [{ id: 1, text: 'first' }] }),
  };
  const orig = await gif.encode(files, { accent: [255, 92, 170] });
  const origCopy = new Uint8Array(orig);          // to prove non-mutation later
  const art = gif.stripForDisplay(orig);

  check('the art is smaller than the app it came from',
    art.length < orig.length, orig.length + ' -> ' + art.length + ' bytes');

  // EXACTNESS. Not "looks like a gif" — the same bytes, minus one whole block.
  const span = gif.findAppExtSpan(orig, gif.MARKER);
  const expect = new Uint8Array(orig.length - (span.end - span.start));
  expect.set(orig.subarray(0, span.start), 0);
  expect.set(orig.subarray(span.end), span.start);
  check('…and is the original MINUS the GifOS block, byte for byte', eq(art, expect),
    'removed ' + (span.end - span.start) + ' bytes at offset ' + span.start);
  check('…which is a complete Application Extension, terminator and all',
    orig[span.start] === 0x21 && orig[span.start + 1] === 0xff && orig[span.start + 2] === 0x0b
      && orig[span.end - 1] === 0x00);

  // It has to still BE a GIF, and still have a picture in it.
  check('the art is still a GIF89a with a trailer',
    String.fromCharCode.apply(null, art.subarray(0, 6)) === 'GIF89a' && art[art.length - 1] === 0x3b);
  check('…and still contains an image descriptor — there is a picture to show',
    art.includes(0x2c));
  check('…and no longer carries an app', !gif.looksLikeGifosGif(art));

  // THE ORIGINAL IS THE FILE. Nothing here may disturb it.
  check('the original bytes are untouched', eq(orig, origCopy), orig.length + ' bytes');
  const back = await gif.decode(orig);
  check('…and still decode to the whole app after stripping',
    Object.keys(back.files).length === Object.keys(files).length
      && gif.bytesToText(back.files['index.html']) === files['index.html'],
    Object.keys(back.files).length + ' files');
  check('…including its saved state, which lives in the same block',
    !!back.files['.state/db.json']);

  // An ordinary GIF from someone's camera roll has no block to remove. It must
  // come back AS ITSELF — the same object, so a repaint costs no copy at all.
  const plain = gif.stripForDisplay(art);
  check('an ordinary GIF is returned unchanged, not re-encoded', plain === art);
  check('…so the strip is idempotent', eq(gif.stripForDisplay(art), art));

  // PAYLOAD-INDEPENDENCE. The same artwork with a hugely bigger app inside must
  // strip to the SAME bytes — which is the structural way of saying the walk
  // steps over the payload rather than reading it. (It is also why a 200 MB app
  // costs milliseconds here instead of a scan of every byte.)
  const big = Object.assign({}, files);
  // Deliberately hard to compress: a payload of zeros deflates to nothing and
  // would make this assertion pass against an app that never got bigger.
  const blob = new Uint8Array(2 * 1024 * 1024);
  let x = 123456789;
  for (let i = 0; i < blob.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; blob[i] = x & 0xff; }
  big['assets/blob.bin'] = blob;
  const bigGif = await gif.encode(big, { accent: [255, 92, 170] });
  check('the bigger app really is much bigger',
    bigGif.length > orig.length * 20,
    (bigGif.length / 1048576).toFixed(2) + ' MB vs ' + (orig.length / 1024).toFixed(1) + ' KB');
  check('…and strips to the SAME artwork, byte for byte',
    eq(gif.stripForDisplay(bigGif), art),
    'artwork is ' + art.length + ' bytes either way');

  // ANYTHING IT DOES NOT UNDERSTAND COMES BACK WHOLE. A picture optimisation
  // may never cost us the picture, so every one of these returns the input.
  const notGif = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  check('a non-GIF is returned unchanged', gif.stripForDisplay(notGif) === notGif);
  const tiny = new Uint8Array([0x47, 0x49, 0x46]);
  check('a truncated header is returned unchanged', gif.stripForDisplay(tiny) === tiny);
  const truncated = orig.subarray(0, span.headerEnd + 40);   // block never terminates
  check('an app block cut off mid-payload is returned unchanged',
    gif.stripForDisplay(truncated) === truncated);
  const garbled = new Uint8Array(orig);
  garbled[span.end] = 0x77;                                   // an introducer we do not know
  check('an unknown block introducer is returned unchanged',
    gif.stripForDisplay(garbled) === garbled);

  console.log('');
  console.log(failures ? failures + ' FAILED' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
