/*
 * remix-doc.js — every packed App GIF carries llms.txt.
 *
 * An App GIF is a filesystem you can open. The point of putting the build
 * guide inside it is that unpacking one is the FIRST step of remixing it: the
 * person (or agent) who pulls the files out finds llms.txt next to index.html
 * and already has the packing recipe, the manifest reference and the whole
 * window.gifos API — no hunt for docs, no guessing at the container format.
 *
 * What this pins is the blast radius, because the injection point was chosen
 * to have one. Packing (encode/embed) adds the doc; a bare repack — a state
 * save, a credits seal, a passkey wrap — must NOT, or a file appearing inside
 * an already-signed app would change its files digest and report a legitimate
 * app as TAMPERED. That last case is the assertion that matters most here.
 */
const path = require('path');
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = require('crypto').webcrypto;
}
const fs = require('fs');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-gif.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-ed.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-sign.js'));
const { gif, sign, ed } = globalThis.GifOS;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

const SITE_DOC = path.join(__dirname, '..', '..', 'site', 'llms.txt');
const DOC = fs.readFileSync(SITE_DOC, 'utf8');
const text = (b) => Buffer.from(b).toString('utf8');
const app = () => ({
  'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'notes', name: 'Notes', entry: 'index.html' }),
  'index.html': '<!doctype html><h1>Notes</h1>',
});

(async () => {
  // The document itself. It ships from site/, so it is downloadable AND
  // packable from the same bytes — if it ever stops describing the format,
  // every app packed after that carries the wrong recipe.
  check('site/llms.txt exists and describes the packing recipe',
    DOC.includes('GIFOS1.0') && DOC.includes('manifest.json') && DOC.includes('window.gifos'),
    DOC.length + ' bytes');

  // In Node there is no origin to fetch from, so the doc is handed in. That is
  // also how a build script would do it.
  gif.setRemixDoc(DOC);

  const bytes = await gif.encode(app(), { accent: [255, 92, 170] });
  const archive = await gif.decode(bytes);
  check('encode() packs llms.txt beside the app',
    !!archive.files['llms.txt'] && text(archive.files['llms.txt']) === DOC);
  check('…and the app files are untouched',
    text(archive.files['index.html']) === app()['index.html']);
  check('…and it is still a real, viewable GIF', gif.looksLikeGifosGif(bytes)
    && bytes[0] === 0x47 && bytes[bytes.length - 1] === 0x3b);

  // The author's own doc wins — the packer never overwrites a file it did not
  // put there.
  const mine = Object.assign(app(), { 'llms.txt': 'my own notes to remixers' });
  const own = await gif.decode(await gif.encode(mine));
  check('an app that ships its own llms.txt keeps it',
    text(own.files['llms.txt']) === 'my own notes to remixers');

  // Containers are not apps. A folder bundle and a desktop backup have no
  // entry file, and every app inside them already carries its own copy.
  const folder = await gif.decode(await gif.encode({
    'manifest.json': JSON.stringify({ gifos: '1.0', type: 'folder', name: 'Games' }),
  }));
  check('a folder GIF (no entry file) is not given one', !folder.files['llms.txt']);

  // embed(): the same rule for an app spliced into a GIF from the wild.
  const host = await gif.encode({ 'note.txt': 'just a picture' });   // plain, no entry
  const spliced = await gif.decode(await gif.embed(host, app()));
  check('embed() packs it too', !!spliced.files['llms.txt']);

  // ---- the one that protects signatures ----------------------------------
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const { priv, pubRaw } = await ed.keysFromSeed(seed);
  const signedApp = await sign.signDomain(bytes, 'gifos.app', { privateKey: priv }, '2026-08-25');
  const pubB64 = Buffer.from(pubRaw).toString('base64');
  const verify = async (b) => {
    const claim = sign.readSig ? sign.readSig(b) : null;
    const chHex = Buffer.from(await sign.contentHash(b)).toString('hex');
    return sign._ed25519Verify(pubRaw, sign._b64ToBytes(claim.sig),
      sign.statement('domain', 'gifos.app', chHex));
  };
  check('a packed app signs and verifies', await verify(signedApp), pubB64.slice(0, 8) + '…');

  // Saving state repacks the SAME archive. If repack injected anything, the
  // files digest would move and this signed app would read as TAMPERED.
  const live = await gif.decode(signedApp);
  const saved = Object.assign({}, live.files, { '.state/db.json': '{"collections":{}}' });
  const afterSave = await gif.repack(signedApp, saved);
  check('a state save does not void the signature', await verify(afterSave));

  // …and the doc is still in there afterwards: packed once, it rides along.
  const reread = await gif.decode(afterSave);
  check('llms.txt survives the save', !!reread.files['llms.txt']);

  // A GIF packed BEFORE this existed must not gain the file on a save either
  // — same reason, and it is the case that actually ships (every already-
  // published app).
  gif.setRemixDoc(null);
  const legacy = await gif.encode(app());
  gif.setRemixDoc(DOC);
  const legacyArchive = await gif.decode(legacy);
  const legacySaved = await gif.repack(legacy, Object.assign({}, legacyArchive.files, { '.state/db.json': '{}' }));
  check('repack never adds it to an app that lacks it',
    !(await gif.decode(legacySaved)).files['llms.txt']);

  console.log(failures ? '\n' + failures + ' failure(s)' : '\nAll good.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
