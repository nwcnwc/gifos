// Passkey wrap: private data sealed, pixels and app code clear.
//
// A GifOS app is a GIF with a filesystem inside a GIFOS1.0 Application
// Extension. Passkey lock wraps ONLY .state/* (saved data) inside that
// filesystem — GIF frames, NETSCAPE loop, image descriptors, and the app
// itself stay readable. stripForDisplay still drops the whole GIFOS1.0 block,
// so the Home Screen ornament is byte-identical before and after a lock.
const path = require('path');
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = require('crypto').webcrypto;
}
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-gif.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-lock.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-sign.js'));
const { gif, lock, sign } = globalThis.GifOS;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const eq = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const secret = 'the diary entry nobody else should read';

(async () => {
  const files = {
    'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'notes', name: 'Notes', entry: 'index.html' }),
    'index.html': '<!doctype html><h1>Notes</h1>',
    'app.js': 'console.log("notes");',
    '.state/db.json': JSON.stringify({ collections: { notes: { items: { n1: { id: 'n1', text: secret } }, seq: 2 } } }),
  };
  const orig = await gif.encode(files, { accent: [255, 92, 170] });
  const origCopy = new Uint8Array(orig);
  const key = await lock.importRawKey(crypto.getRandomValues(new Uint8Array(32)));
  const wrapped = await lock.wrapGif(orig, key);

  check('wrap produces a different GIF (the filesystem block moved)', wrapped.length !== orig.length || !eq(wrapped, orig));
  check('the original bytes are untouched', eq(orig, origCopy));
  check('the wrapped file is still a GIF89a with a trailer',
    String.fromCharCode.apply(null, wrapped.subarray(0, 6)) === 'GIF89a' && wrapped[wrapped.length - 1] === 0x3b);
  check('…and still looks like a GifOS gif (app code is still there)', gif.looksLikeGifosGif(wrapped));

  const art0 = gif.stripForDisplay(orig);
  const art1 = gif.stripForDisplay(wrapped);
  check('the ornament is byte-identical — pixels were not wrapped', eq(art0, art1),
    art0.length + ' bytes either way');
  check('…and the ornament still has an image descriptor (a picture to show)', art1.includes(0x2c));
  check('…and still carries the NETSCAPE loop',
    Buffer.from(art1).toString('latin1').indexOf('NETSCAPE2.0') >= 0);

  const dec = await gif.decode(wrapped);
  check('app code is still clear after wrap',
    gif.bytesToText(dec.files['index.html']) === files['index.html']
    && gif.bytesToText(dec.files['app.js']) === files['app.js']);
  check('manifest is still clear', gif.readManifest(dec).appId === 'notes');
  check('.state is gone from the clear filesystem', !dec.files['.state/db.json']);
  check('.lock/v1 is present', !!dec.files[lock.LOCK_PATH]);
  check('the secret is not in the clear filesystem bytes',
    Buffer.from(wrapped).toString('utf8').indexOf(secret) < 0);

  const opened = await lock.unwrapGif(wrapped, key);
  check('unwrap restores .state', !!opened.files['.state/db.json']
    && gif.bytesToText(opened.files['.state/db.json']).indexOf(secret) >= 0);
  check('unwrap drops .lock/v1', !opened.files[lock.LOCK_PATH]);
  const back = await gif.decode(opened.bytes);
  check('unwrapped GIF round-trips the diary',
    gif.bytesToText(back.files['.state/db.json']).indexOf(secret) >= 0
    && gif.bytesToText(back.files['index.html']) === files['index.html']);

  const wrong = await lock.importRawKey(crypto.getRandomValues(new Uint8Array(32)));
  let threw = false;
  try { await lock.unwrapGif(wrapped, wrong); } catch (e) { threw = /wrong passkey|damaged/.test(e.message); }
  check('wrong key fails shut — does not return private data', threw);

  const truncated = wrapped.subarray(0, 40);
  check('a truncated wrap is not silently treated as an app', lock.isWrappedFiles((await gif.decode(orig)).files) === false);
  let truncFail = false;
  try { await lock.unwrapFiles(truncated, key); } catch (e) { truncFail = true; }
  check('a truncated payload fails shut', truncFail);

  // IndexedDB-shaped state blob (no store in this unit test — JSON path).
  const st = { collections: { notes: { items: { n1: { id: 'n1', text: secret } }, seq: 2 } } };
  const sealed = await lock.sealState(st, key);
  check('sealed state is a lock blob, not collections', lock.isSealed(sealed) && !sealed.collections);
  check('…and does not carry the secret in JSON', JSON.stringify(sealed).indexOf(secret) < 0);
  const openedSt = await lock.openState(sealed, key);
  check('openState restores the diary', openedSt.collections.notes.items.n1.text === secret);
  let stWrong = false;
  try { await lock.openState(sealed, wrong); } catch (e) { stWrong = true; }
  check('wrong key does not open the state blob', stWrong);

  // Signature: wrapping .state/.lock must not void the author's content hash.
  // (contentHash already excluded .state; it must exclude .lock too.)
  if (sign && sign.contentHash) {
    const h1 = Buffer.from(await sign.contentHash(orig)).toString('hex');
    const h2 = Buffer.from(await sign.contentHash(wrapped)).toString('hex');
    check('content hash is unchanged by wrapping private data (signature survives lock)', h1 === h2);
  }

  const s = lock.sheet('lock', 'Notes');
  check('lock sheet names the app and says the icon still plays',
    /Notes/.test(s.lead) && /icon still plays/.test(s.lead) && s.ok === 'Lock this app');
  check('open sheet is Unlock', lock.sheet('open', 'Notes').ok === 'Unlock');
  check('remove sheet is Remove lock', lock.sheet('remove', 'Notes').ok === 'Remove lock');

  check('isPrivatePath only matches saved state',
    lock.isPrivatePath('.state/db.json') && !lock.isPrivatePath('index.html') && !lock.isPrivatePath('assets/photo.jpg'));

  console.log('');
  console.log(failures ? failures + ' FAILED' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack); process.exit(1); });
