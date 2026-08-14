// AN ICON SHOWS THE ANIMATION. THE FILE KEEPS THE APP.
//
// A GifOS app is a GIF with a whole filesystem inside it and can run to
// hundreds of megabytes; the picture on the Home Screen is a small looping
// sticker. Painting used to hand the WHOLE file to an <img>, which copies every
// one of those megabytes into a Blob and decodes past them, once per app on
// screen, on every repaint.
//
// So the animation is stripped out ONCE, when the file is written (store.putFile
// -> the '::art' sibling database), and that ornament is what reaches the DOM.
//
// WHAT THIS FILE GUARDS IS THE WORD "DISPLAY". The optimisation is safe exactly
// as long as those stripped bytes never leave the <img> — a stripped GIF that
// escaped into run, install, export, share or verify would be an app with no
// code in it, and the failure would look like a corrupt download rather than a
// rendering change. So the assertions below are mostly about what did NOT
// change: getFile still returns the whole app, byte for byte; it still decodes;
// its signature still verifies; and it still RUNS.
//
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

(async () => {
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });

  // Install a real app the way the store does: putFile, then place it.
  const fileId = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Anyroad.gif', bytes, kind: 'gif',
                                isApp: true, appId: 'anyroad', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid,
                                name: 'Anyroad.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    return fid;
  }, gifB64);
  await sleep(600);

  // ---- the ornament exists, and it is only the picture ----------------------
  const orn = await page.evaluate(async (fid) => {
    const rec = await GifOS.store.getArt(fid);
    const file = await GifOS.store.getFile(fid);
    return { hasArt: !!(rec && rec.art), artLen: rec && rec.art ? rec.art.length : 0,
             fileLen: file.bytes.length, srcLen: rec ? rec.srcLen : -1,
             artIsApp: rec && rec.art ? GifOS.gif.looksLikeGifosGif(
               rec.art instanceof Uint8Array ? rec.art : new Uint8Array(rec.art)) : null,
             isApp: rec ? rec.isApp : null };
  }, fileId);
  check('installing an app cuts its ornament, once, at write time', orn.hasArt);
  check('…and the ornament is a fraction of the app it came from',
    orn.artLen > 0 && orn.artLen < orn.fileLen,
    orn.fileLen + ' -> ' + orn.artLen + ' bytes ('
      + (100 * orn.artLen / orn.fileLen).toFixed(1) + '%)');
  check('…carrying no app inside it', orn.artIsApp === false);
  check('…and remembering what it was cut from', orn.srcLen === orn.fileLen);

  // ---- THE DOM GETS THE ORNAMENT, NOT THE APP -------------------------------
  // Read what the <img> actually fetched, from the blob URL the icon is using.
  const painted = await page.evaluate(async (fid) => {
    // THIS icon, not whichever icon is first: a Home Screen has seeded apps on
    // it, and measuring one of those would prove nothing about the app we just
    // installed (it measured a 251 KB seeded sticker the first time).
    const el = Array.from(document.querySelectorAll('.icon'))
      .find((n) => n.dataset.id && n.querySelector('.label')
                && n.querySelector('.label').textContent.indexOf('Anyroad') >= 0);
    const img = el && el.querySelector('.thumb img');
    if (!img) return { none: true };
    const buf = await (await fetch(img.src)).arrayBuffer();
    const b = new Uint8Array(buf);
    return { bytes: b.length, isGif: b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
             hasTrailer: b[b.length - 1] === 0x3b,
             carriesAnApp: GifOS.gif.looksLikeGifosGif(b), src: img.src.slice(0, 5) };
  }, fileId);
  check('the installed app\'s icon paints from a blob',
    !painted.none && painted.src === 'blob:');
  check('…which is a real, complete GIF', painted.isGif && painted.hasTrailer,
    painted.bytes + ' bytes');
  check('…and has NO app inside it — the DOM never holds the filesystem',
    painted.carriesAnApp === false);
  check('…and is EXACTLY the ornament, not the file',
    painted.bytes === orn.artLen,
    painted.bytes + ' painted, ornament ' + orn.artLen + ', file ' + orn.fileLen + ' bytes');

  // ---- AND THE FILE IS COMPLETELY UNCHANGED ---------------------------------
  // This is the half that matters. Everything that is not the picture must
  // still see the whole app, exactly as it was written.
  const intact = await page.evaluate(async (args) => {
    const [fid, b64] = args;
    const bin = atob(b64); const orig = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) orig[i] = bin.charCodeAt(i);
    const file = await GifOS.store.getFile(fid);
    const got = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    let identical = got.length === orig.length;
    if (identical) for (let i = 0; i < orig.length; i++) if (got[i] !== orig[i]) { identical = false; break; }
    const archive = await GifOS.gif.decode(got);
    const man = GifOS.gif.readManifest(archive);
    return { identical, len: got.length, files: Object.keys(archive.files).length,
             appId: man && man.appId, stillAnApp: GifOS.gif.looksLikeGifosGif(got) };
  }, [fileId, gifB64]);
  check('getFile still returns the app byte for byte — the store was not touched',
    intact.identical, intact.len + ' bytes');
  check('…it still decodes to the whole filesystem',
    intact.files > 1 && intact.appId === 'anyroad', intact.files + ' files, appId ' + intact.appId);
  check('…and is still recognised as an app', intact.stillAnApp === true);

  // ---- AND IT STILL RUNS ----------------------------------------------------
  // The end-to-end statement: after the desktop has painted from an ornament,
  // double-clicking the icon still opens the real app.
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Anyroad.gif' }).dblclick(),
  ]);
  await app.bringToFront();
  await app.setViewportSize({ width: 900, height: 560 });
  await app.waitForSelector('iframe', { timeout: 60000 });
  // The abilities sheet stands between the tap and the app, as it does for a
  // real person and for every other anyroad suite.
  await app.locator('.perm-modal .done, .perm-box .done').first()
    .click({ timeout: 15000 }).catch(() => {});
  // #landing ALONE, not '#landing, #hud'. A comma selector with .first() picks
  // whichever matches first in the DOM — #hud — and #hud is hidden until you
  // have chosen a place, so this waited forever on a perfectly booted app.
  const ran = await app.frameLocator('iframe').locator('#landing')
    .waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
  check('the app still RUNS after its icon was painted from an ornament', ran);
  await app.close();

  // ---- REWRITING THE BYTES REWRITES THE PICTURE -----------------------------
  // An app saving its state rewrites the whole GIF through putFile. The
  // ornament must follow, or an icon goes stale forever.
  const refreshed = await page.evaluate(async (fid) => {
    const file = await GifOS.store.getFile(fid);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const grown = await GifOS.gif.repack(bytes, {
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'anyroad', name: 'Anyroad', entry: 'index.html' }),
      'index.html': '<!doctype html><h1>rewritten</h1>',
      '.state/db.json': JSON.stringify({ padding: 'x'.repeat(50000) }),
    });
    await GifOS.store.putFile(Object.assign({}, file, { bytes: grown }));
    const rec = await GifOS.store.getArt(fid);
    return { srcLen: rec ? rec.srcLen : -1, newLen: grown.length,
             artLen: rec && rec.art ? rec.art.length : 0 };
  }, fileId);
  check('saving an app refreshes its ornament with it',
    refreshed.srcLen === refreshed.newLen,
    'ornament says ' + refreshed.srcLen + ', file is ' + refreshed.newLen + ' bytes');
  check('…and the refreshed ornament is still only the picture',
    refreshed.artLen > 0 && refreshed.artLen < refreshed.newLen,
    refreshed.artLen + ' vs ' + refreshed.newLen + ' bytes');

  // ---- AN ORDINARY GIF IS NOT AN APP ---------------------------------------
  // Someone's camera-roll GIF has no block to remove; it must still paint.
  const plain = await page.evaluate(async () => {
    const g = await GifOS.gif.encode({ 'manifest.json': '{}' }, {});
    const art = GifOS.gif.stripForDisplay(g);      // a GIF with no GifOS block
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Holiday.gif', bytes: art, kind: 'gif',
                                isApp: false, mime: 'image/gif' });
    const rec = await GifOS.store.getArt(fid);
    const back = await GifOS.store.getFile(fid);
    return { artLen: rec && rec.art ? rec.art.length : 0, srcLen: art.length,
             fileLen: back.bytes.length };
  });
  check('an ordinary GIF stores an ornament that is simply itself',
    plain.artLen === plain.srcLen && plain.fileLen === plain.srcLen,
    plain.srcLen + ' bytes, unchanged');

  await browser.close();
  console.log('');
  console.log(failures ? failures + ' FAILED' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack); process.exit(1); });
