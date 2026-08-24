// A SIGNED APP'S TILE SHOWS THE NAME THAT WAS SIGNED — AND ONLY THAT NAME.
//
// The Home Screen used to say a signed app's name twice: a pill with its
// declared shortName + version floated over the top border of the animation,
// and its FILENAME sat underneath in the label slot. Two names per tile, one of
// them written across the artwork, and the one printed largest was the one
// nobody vouches for — a file can be called anything, and "solitaire-download-
// 2026.gif" is exactly what a hostile copy would be called.
//
// So the nameplate moved into the label slot and the filename left the screen.
// What this file guards, in the order a user meets it:
//
//   1. a signed app shows its NAMEPLATE where the filename used to be...
//   2. ...and its filename appears NOWHERE on the tile
//   3. nothing is painted over the animation any more — the thumb holds no plate
//   4. the provenance shield is still there (the plate did not displace it)
//   5. an UNSIGNED app making the SAME claim shows its filename instead. This is
//      the whole doctrine: GifOS never repeats a name it cannot check.
//   6. folders and plain files keep their filenames — it is the only name they
//      have, and unnaming them would just be a blank tile
//   7. Rename still edits the FILENAME, and the tile keeps its nameplate: the
//      plate is not the file's name and renaming cannot forge one
//   8. the filename is unpublished, not lost — the plate's tooltip names it
//   9. THE VERSION IS NOT ON THE PLATE. It rode there first, as "Chess v1.0.1",
//      and it cost the NAME its room — five of the ~13 characters a default
//      cell fits, which is how "Scanned PDF Tables" came out "Scanned…". A
//      version is worth reading ONCE, when a copy arrives, so it moved to the
//      fresh pill: the tile's existing "this just landed" slot, which already
//      goes away by itself the moment the app has data. Same slot, same
//      lifecycle, and the name gets the whole width back.
//  10. so a long name WRAPS to a second line instead of being cut, and the
//      version is still readable on the plate's tooltip forever
//  11. an UNSIGNED app's pill still says NEW — a version is a claim too
//
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');
const { appGifIfBuilt } = require('../lib/apps');
const { readFileSync } = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SITE = path.join(__dirname, '..', '..', 'site');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// THE REAL HALF: a real, really-signed app out of the shipped catalog, whose
// own short name is NOTHING like the file it arrives in ("Chess" vs "Chess
// Grandmaster.gif"). A synthetic fixture could prove the CSS works; only a
// catalog app proves the thing users actually install shows the right name.
// Preferred first, then any signed sibling, so re-signing one app cannot turn
// this suite red for a reason that has nothing to do with it.
function pickSignedApp() {
  const prefer = ['chess-grandmaster', '2048', 'anyroad', 'solitaire', 'pixel-paint'];
  for (const slug of prefer) {
    const p = appGifIfBuilt(slug);
    if (!p) continue;
    const bytes = readFileSync(p);
    if (bytes.indexOf('GIFOSSIG') < 0) continue;
    const man = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'apps', slug, 'manifest.json'), 'utf8'));
    const shortName = (man.shortName || man.name || '').trim();
    const version = (man.version || '').trim();
    if (shortName && version) return { slug, bytes, shortName, version };
  }
  return null;
}

// A GifOS app built in the page, so the UNSIGNED half owns its fixture instead
// of depending on which catalog apps happen to be signed this week.
const APP_HTML = '<!doctype html><meta charset="utf-8"><title>fixture</title><p>fixture</p>';
async function installBuilt(page, o) {
  return page.evaluate(async (a) => {
    let bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: a.appId, name: a.name,
                                        shortName: a.shortName, version: a.version, entry: 'index.html' }),
      'index.html': a.html,
    });
    // The tile asks readSig() whether a signature is PRESENT — verifying it is a
    // separate, on-demand act. So a written block is the honest fixture for
    // "this GIF claims to be signed", and its absence for "it does not".
    if (a.signed) bytes = GifOS.sign.writeSig(bytes, { v: 1, type: 'domain', id: 'example.test',
                                                       alg: 'ed25519', sig: 'AA==', ts: '2026-01-01' });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.fileName, bytes, kind: 'gif',
                                isApp: true, appId: a.appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid,
                                name: a.fileName, parent: null, x: a.x, y: a.y, iconSize: 64 });
    return fid;
  }, Object.assign({ html: APP_HTML }, o));
}

// Everything the tile is saying, read the way a user reads it.
async function tile(page, fileId) {
  return page.evaluate((fid) => {
    // An icon carries its ITEM id in the DOM, not its file id, so the item list
    // (refreshed by syncItems) is the way across.
    const item = window.__items.find((i) => i.fileId === fid);
    const node = item && [...document.querySelectorAll('.icon')].find((e) => e.dataset.id === item.id);
    if (!node) return null;
    const label = node.querySelector('.label');
    const plate = node.querySelector('.label .nameplate');
    const pill = node.querySelector('.thumb .new-badge');
    // Lines the plate is actually using, from its own line-height — a wrap has
    // to be observed, not inferred from the string.
    let lines = 0;
    if (plate) {
      const cs = getComputedStyle(plate);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
      lines = Math.round((plate.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh);
    }
    return {
      itemName: item.name,
      says: (label.textContent || '').trim(),
      allText: (node.textContent || '').trim(),
      plated: label.classList.contains('plated'),
      hasPlate: !!plate,
      plateOnArt: !!node.querySelector('.thumb .nameplate, .thumb .idbadge'),
      shield: !!node.querySelector('.sig-badge'),
      tip: plate ? plate.title : '',
      lines,
      // A plate that had to drop letters says so with an ellipsis; a plate that
      // merely wrapped does not.
      cut: /…$/.test((plate && plate.textContent) || ''),
      pill: pill ? pill.textContent : null,
      pillTip: pill ? pill.title : '',
    };
  }, fileId);
}
// The item list changes under us on every write (a rename most of all), so it
// is re-read before each lookup rather than captured once.
async function syncItems(page) {
  await page.evaluate(async () => { window.__items = await GifOS.store.allItems(); });
}

(async () => {
  const real = pickSignedApp();
  if (!real) {
    console.error('no signed app in site/apps/ — build and sign the catalog first ' +
                  '(node scripts/build-app-catalog.mjs && node scripts/sign-apps.mjs)');
    process.exit(1);
  }
  console.log('# signed catalog fixture: ' + real.slug + ' -> "' + real.shortName + ' v' + real.version + '"');

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  await sleep(600);

  // ---- the fixtures ---------------------------------------------------------
  // A filename NOTHING like the app's own name, so "which of the two is on the
  // tile" has only one possible answer.
  const REAL_FILE = 'totally-not-the-app-name-2026 (1).gif';
  const realId = await page.evaluate(async (a) => {
    const bin = atob(a.b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.name, bytes, kind: 'gif',
                                isApp: true, appId: a.slug, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid,
                                name: a.name, parent: null, x: 640, y: 620, iconSize: 64 });
    return fid;
  }, { b64: real.bytes.toString('base64'), name: REAL_FILE, slug: real.slug });

  // The SAME claim, unsigned. Same shortName, same version, no signature block.
  const fakeId = await installBuilt(page, { appId: 'np-unsigned', name: 'Impostor',
    shortName: real.shortName, version: real.version, signed: false,
    fileName: 'impostor.gif', x: 760, y: 620 });

  // A signed app whose name cannot fit a 104px cell on ONE line. This is the
  // catalog's real worst case, by length: "Scanned PDF Tables" (pdf-tables-ocr).
  const wideId = await installBuilt(page, { appId: 'np-wide', name: 'Scanned PDF Tables',
    shortName: 'Scanned PDF Tables', version: '11.4.0', signed: true,
    fileName: 'wide.gif', x: 880, y: 620 });

  // A plain (non-app) GIF: no manifest, nothing to be signed about.
  const plainId = await page.evaluate(async () => {
    const bytes = new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61,1,0,1,0,0x80,0,0,0,0,0,255,255,255,
      0x21,0xf9,4,0,0,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0,0x3b]);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'holiday.gif', bytes, kind: 'gif', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid,
                                name: 'holiday.gif', parent: null, x: 1000, y: 620, iconSize: 64 });
    return fid;
  });

  await page.evaluate(async () => { await GifOS.desktop.load(); await GifOS.desktop.render(); });
  // The plate is a DECORATION: it arrives after the paint, once decorate() has
  // read the app. Waiting for it is the correct shape of this test.
  await page.waitForFunction(() => document.querySelectorAll('.label.plated').length >= 2,
                             null, { timeout: 40000 }).catch(() => {});
  await sleep(1200);
  await syncItems(page);

  // ---- 1-4. the signed app names itself, and nothing else --------------------
  const t = await tile(page, realId);
  check('a signed app\'s tile shows its NAMEPLATE in the label slot',
    !!t && t.plated && t.hasPlate, t && t.says);
  check('…which reads its shortName, exactly as the manifest declares it',
    !!t && t.says === real.shortName,
    t && JSON.stringify(t.says) + ' vs ' + JSON.stringify(real.shortName));
  check('…and NOT the version — the plate spends its width on the name',
    !!t && t.says.indexOf('v' + real.version) < 0 && !/\bv\d/.test(t.says), t && t.says);
  check('…and the FILENAME is nowhere on the tile',
    !!t && t.allText.indexOf(REAL_FILE) < 0 && t.allText.indexOf('totally-not') < 0,
    t && JSON.stringify(t.allText));
  check('…nothing is painted over the animation — the thumb holds no plate',
    !!t && !t.plateOnArt);
  check('…and the provenance shield is still on the picture',
    !!t && t.shield);
  const anyPlateOnArt = await page.$$eval('.thumb .nameplate, .thumb .idbadge', (n) => n.length);
  check('NO tile anywhere wears a plate over its artwork', anyPlateOnArt === 0,
    anyPlateOnArt + ' found');

  // ---- 5. the same claim, unsigned, is not repeated --------------------------
  const f = await tile(page, fakeId);
  check('an UNSIGNED app making the same claim gets no nameplate',
    !!f && !f.plated && !f.hasPlate, f && f.says);
  check('…it shows its filename instead — GifOS never repeats a name it cannot check',
    !!f && f.says === 'impostor.gif', f && f.says);
  check('…so the impostor cannot appear on the Home Screen as "' + real.shortName + '"',
    !!f && f.says.indexOf(real.shortName) < 0);

  // ---- 6. everything without a signed identity keeps its filename ------------
  const pl = await tile(page, plainId);
  check('a plain GIF keeps its filename', !!pl && !pl.plated && pl.says === 'holiday.gif',
    pl && pl.says);
  const folderSays = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.icon.folder')][0];
    return el ? { says: (el.querySelector('.label').textContent || '').trim(),
                  plated: el.querySelector('.label').classList.contains('plated') } : null;
  });
  check('a folder keeps its name', !!folderSays && !folderSays.plated && folderSays.says.length > 0,
    folderSays && folderSays.says);

  // ---- 7-8. the filename is unpublished, not lost ---------------------------
  check('the plate\'s tooltip still says what the file is called',
    !!t && t.tip.indexOf(REAL_FILE) >= 0, t && JSON.stringify(t.tip));

  const RENAMED = 'renamed-by-the-test.gif';
  await page.evaluate((args) => {
    const [fid] = args;
    const item = window.__items.find((i) => i.fileId === fid);
    const el = [...document.querySelectorAll('.icon')].find((e) => e.dataset.id === item.id);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
  }, [realId]);
  await page.waitForSelector('.ctx', { timeout: 10000 });
  await page.locator('.ctx button', { hasText: 'Rename' }).click();
  await page.waitForSelector('.rename-input', { timeout: 10000 });
  await page.fill('.rename-input', RENAMED);
  await page.locator('.modal-actions button', { hasText: 'Rename' }).click();
  await sleep(900);
  await syncItems(page);
  const t2 = await tile(page, realId);
  check('Rename still edits the FILENAME', !!t2 && t2.itemName === RENAMED, t2 && t2.itemName);
  check('…and the tile still shows the nameplate, not the new filename',
    !!t2 && t2.says === real.shortName, t2 && t2.says);
  check('…so renaming a file cannot forge what a signed app calls itself',
    !!t2 && t2.allText.indexOf(RENAMED) < 0);
  check('…and the tooltip follows the file to its new name',
    !!t2 && t2.tip.indexOf(RENAMED) >= 0, t2 && JSON.stringify(t2.tip));

  // ---- 9-11. the version rides the fresh pill, and dies with it -------------
  // Every fixture here is untouched, so every one of them is FRESH.
  check('a signed app\'s fresh pill carries its VERSION instead of "NEW"',
    !!t2 && t2.pill === 'v' + real.version, t2 && JSON.stringify(t2.pill));
  // The pill is pointer-events: none (a hoverable badge on the thumb's corner
  // would swallow a drag begun there), so this title is for assistive tech, not
  // a tooltip — the hoverable copy of the version is the nameplate's.
  check('…and the pill\'s accessible text explains that it goes when the app is used',
    !!t2 && /goes away/.test(t2.pillTip), t2 && JSON.stringify(t2.pillTip));
  const pillHover = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.new-badge')).pointerEvents);
  check('…and the pill cannot eat a drag that starts on it', pillHover === 'none', pillHover);
  check('an UNSIGNED app\'s pill still says NEW — a version is a claim too',
    !!f && f.pill === 'NEW', f && JSON.stringify(f.pill));

  // The pill is the fresh flag: give the app saved data and BOTH the version
  // and the NEW tag go, exactly as NEW always did, while the nameplate stays.
  await page.evaluate(async (fid) => {
    await GifOS.store.setState(fid, { collections: { notes: { a: { hi: 1 } } } });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, realId);
  await page.waitForFunction(() => {
    const p = [...document.querySelectorAll('.new-badge')].map((n) => n.textContent);
    return !p.some((x) => /^v\d/.test(x));
  }, null, { timeout: 30000 }).catch(() => {});
  await sleep(600);
  await syncItems(page);
  const t3 = await tile(page, realId);
  check('once the app has been used, the version tag goes — like NEW always did',
    !!t3 && t3.pill === null, t3 && JSON.stringify(t3.pill));
  check('…but the NAMEPLATE stays: a name is permanent, a version is an arrival',
    !!t3 && t3.plated && t3.says === real.shortName, t3 && t3.says);
  check('…and the version is still readable forever, on the plate\'s tooltip',
    !!t3 && t3.tip.indexOf('version ' + real.version) >= 0, t3 && JSON.stringify(t3.tip));

  // ---- a long name WRAPS rather than losing letters -------------------------
  const w = await tile(page, wideId);
  check('a name too long for one line wraps to a second instead of being cut',
    !!w && w.lines === 2 && !w.cut, w && JSON.stringify(w.says) + ' on ' + (w && w.lines) + ' line(s)');
  check('…and arrives whole — "Scanned PDF Tables" is not "Scanned…"',
    !!w && w.says === 'Scanned PDF Tables', w && JSON.stringify(w.says));
  check('…while a one-line name stays on one line',
    !!t3 && t3.lines === 1, t3 && (t3.says + ' on ' + t3.lines));

  // ---- the CSS says so too, not just this browser ---------------------------
  // A cheap belt to the above: the rule that makes the version un-shrinkable is
  // one declaration, and losing it degrades silently on wide screens.
  const css = readFileSync(path.join(SITE, 'css', 'desktop.css'), 'utf8');
  check('the plate is line-clamped in the stylesheet, so a third line cannot appear',
    /-webkit-line-clamp:\s*2/.test(css));
  check('…and the plate suppresses the label\'s wallpaper text-shadow',
    /\.nameplate\s*\{[^}]*text-shadow:\s*none/.test(css));

  await context.close();
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
