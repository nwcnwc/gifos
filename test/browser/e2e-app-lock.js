// Passkey lock: launch gate AND crypto wrap, together.
//
// An installed app can require a passkey to Open, and its private data
// (.state / gifos.db) is encrypted at rest. The GIF animation is NOT — the
// Home Screen icon keeps playing, and a download without unlock is still a
// playable GIF. WebAuthn runs in OS chrome (a GifOS sheet, then the browser
// dialog), never inside the sandbox.
//
// The wrapping key in this suite is the documented test hook
// localStorage.gifos_lock_test_prf (a 32-byte PRF stand-in). Chromium's
// virtual authenticator on the gate's pinned build does not reliably expose
// hmac-secret, and hanging inside WebAuthn.enable made an earlier draft of
// this suite DEAD. Production never sets the hook and fails shut without PRF.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SECRET = 'secret-diary-42';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_PRF_INIT = `(() => {
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = (i * 7 + 13) & 0xff;
  let s = '';
  for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
  try { localStorage.setItem('gifos_lock_test_prf', btoa(s)); } catch (e) {}
})()`;

(async () => {
  console.log('e2e-app-lock: launching');
  const browser = await chromium.launch({ executablePath: CHROME, timeout: 60000 });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 850 } });
  await ctx.addInitScript({ content: TEST_PRF_INIT });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html', { timeout: 30000 });
  await page.waitForSelector('.icon', { timeout: 30000 });
  console.log('e2e-app-lock: desktop up');

  const fileId = await page.evaluate(async (secret) => {
    const files = {
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'diary', name: 'Diary', entry: 'index.html' }),
      'index.html': '<!doctype html><h1>Diary</h1>',
      '.state/db.json': JSON.stringify({ collections: { notes: { items: { n1: { id: 'n1', text: secret } }, seq: 2 } } }),
    };
    const bytes = await GifOS.gif.encode(files, { accent: [200, 80, 120] });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Diary.gif', bytes, kind: 'gif', isApp: true, appId: 'diary', mime: 'image/gif' });
    await GifOS.store.setState(fid, { collections: { notes: { items: { n1: { id: 'n1', text: secret } }, seq: 2 } } });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid,
      name: 'Diary', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    return fid;
  }, SECRET);
  await sleep(400);
  check('gifos-lock.js is on the desktop page', await page.evaluate(() => !!(window.GifOS && GifOS.lock && GifOS.lock.wrapGif)));
  check('the test PRF hook is what this suite uses (production never sets it)',
    await page.evaluate(() => !!localStorage.getItem('gifos_lock_test_prf')));

  await page.locator('#desktop').click({ button: 'right', position: { x: 8, y: 8 } });
  const emptyMenu = await page.evaluate(() => Array.from(document.querySelectorAll('.ctx button')).map((b) => b.textContent));
  check('empty-desktop menu has no Passkey lock…',
    emptyMenu.indexOf('Passkey lock…') < 0 && emptyMenu.indexOf('Remove passkey lock…') < 0,
    JSON.stringify(emptyMenu));
  await page.evaluate(() => { const m = document.querySelector('.ctx'); if (m) m.remove(); });

  const icon = page.locator('.icon', { hasText: 'Diary' }).first();
  await icon.waitFor({ state: 'visible', timeout: 15000 });
  await icon.click({ button: 'right' });
  await page.waitForSelector('.ctx button', { timeout: 5000 });
  const appMenu = await page.evaluate(() => Array.from(document.querySelectorAll('.ctx button')).map((b) => b.textContent));
  check('an installed app offers Passkey lock…', appMenu.indexOf('Passkey lock…') >= 0, JSON.stringify(appMenu));
  check('…and not Remove, because it is not locked yet', appMenu.indexOf('Remove passkey lock…') < 0);

  const before = await page.evaluate(async (fid) => {
    const file = await GifOS.store.getFile(fid);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const art = GifOS.gif.stripForDisplay(bytes);
    const archive = await GifOS.gif.decode(bytes);
    return { art: Array.from(art), artLen: art.length, hasState: !!archive.files['.state/db.json'] };
  }, fileId);

  await page.getByText('Passkey lock…', { exact: true }).click();
  await page.waitForSelector('[data-gifos-lock-sheet="lock"]', { timeout: 8000 });
  check('the lock sheet says the icon still plays',
    await page.evaluate(() => /icon still plays/.test((document.querySelector('[data-gifos-lock-sheet="lock"] .lead') || {}).textContent || '')));
  await page.click('[data-gifos-lock-sheet="lock"] [data-lock-act="ok"]');

  let locked = false;
  for (let i = 0; i < 40 && !locked; i++) {
    locked = await page.evaluate(async (fid) => {
      const it = (await GifOS.store.allItems()).find((x) => x.fileId === fid);
      return !!(it && it.passkey && it.passkey.credId);
    }, fileId);
    if (!locked) await sleep(150);
  }
  check('locking stamps passkey metadata on the item (via saveItem)', locked);

  const after = await page.evaluate(async (fid) => {
    const file = await GifOS.store.getFile(fid);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const art = GifOS.gif.stripForDisplay(bytes);
    const archive = await GifOS.gif.decode(bytes);
    const st = await GifOS.store.getState(fid);
    const hay = new TextDecoder('latin1').decode(bytes);
    return {
      art: Array.from(art), artLen: art.length,
      gifHeader: String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]),
      hasNetscape: hay.indexOf('NETSCAPE2.0') >= 0,
      hasState: !!archive.files['.state/db.json'],
      hasLock: !!archive.files[GifOS.lock.LOCK_PATH],
      hasIndex: !!archive.files['index.html'],
      secretInFile: hay.indexOf('secret-diary-42') >= 0,
      sealed: !!(st && st._gifosLock === 1),
      badge: !!document.querySelector('.icon .lock-badge'),
    };
  }, fileId);
  check('the wrapped file is still a GIF89a', after.gifHeader === 'GIF89a');
  check('…and still loops (NETSCAPE) — the animation was not wrapped', after.hasNetscape);
  check('the ornament is byte-identical after lock',
    after.artLen === before.artLen && after.art.every((b, i) => b === before.art[i]),
    before.artLen + ' -> ' + after.artLen);
  check('app code is still clear', after.hasIndex);
  check('.state is gone from the clear filesystem', !after.hasState);
  check('.lock/v1 holds the wrap', after.hasLock);
  check('the secret is not in the stored GIF bytes', !after.secretInFile);
  check('IndexedDB state is a sealed blob, not collections', after.sealed);
  check('the icon wears a lock badge (from the item — no getFile on paint)', after.badge);

  const paintReads = await page.evaluate(async () => {
    let fileReads = 0;
    const orig = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function () {
      if (this.name === 'files') fileReads++;
      return orig.apply(this, arguments);
    };
    await GifOS.desktop.render();
    IDBObjectStore.prototype.get = orig;
    return fileReads;
  });
  check('a repaint after lock still reads ZERO app files', paintReads === 0, paintReads + ' reads');

  const cancelled = await ctx.newPage();
  cancelled.on('pageerror', (e) => console.log('  [run pageerror]', e.message));
  await cancelled.goto(BASE + '/run.html#id=' + encodeURIComponent(fileId), { timeout: 30000 });
  await cancelled.waitForSelector('[data-gifos-lock-sheet="open"]', { timeout: 20000 });
  check('Open of a locked app shows the Unlock sheet before makeIframe',
    await cancelled.locator('[data-gifos-lock-sheet="open"]').count() > 0);
  await cancelled.click('[data-gifos-lock-sheet="open"] [data-lock-act="cancel"]');
  await sleep(400);
  const noMount = await cancelled.evaluate(() => document.querySelectorAll('#appmount iframe').length);
  check('cancel does not mount the sandbox', noMount === 0, 'iframes=' + noMount);
  await cancelled.close();

  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => console.log('  [run pageerror]', e.message));
  await tab.goto(BASE + '/run.html#id=' + encodeURIComponent(fileId), { timeout: 30000 });
  await tab.waitForSelector('[data-gifos-lock-sheet="open"]', { timeout: 20000 });
  await tab.click('[data-gifos-lock-sheet="open"] [data-lock-act="ok"]');
  await tab.waitForSelector('#appmount iframe', { timeout: 25000 });
  check('Unlock mounts the sandbox', await tab.locator('#appmount iframe').count() > 0);
  const corner = await tab.evaluate(() => {
    const img = document.getElementById('appgif');
    return !!(img && img.src && img.style.display !== 'none');
  });
  check('the app GIF in chrome still paints (animation was not encrypted)', corner);

  await tab.evaluate(() => document.getElementById('appinvite').click());
  await sleep(500);
  const shareMsg = await tab.evaluate(() => (document.getElementById('status') || {}).textContent || '');
  check('Share live of a locked app fails clearly (other devices have no passkey)',
    /passkey-locked/.test(shareMsg), shareMsg);
  check('…and does not mint a room anyway',
    await tab.evaluate(() => !document.querySelector('input[name="rmcls"]')));
  await tab.close();

  await icon.click({ button: 'right' });
  await page.waitForSelector('.ctx button', { timeout: 5000 });
  const lockedMenu = await page.evaluate(() => Array.from(document.querySelectorAll('.ctx button')).map((b) => b.textContent));
  check('a locked app offers Remove passkey lock…', lockedMenu.indexOf('Remove passkey lock…') >= 0, JSON.stringify(lockedMenu));
  check('…and no Passkey lock… (already locked)', lockedMenu.indexOf('Passkey lock…') < 0);

  await page.getByText('Download', { exact: true }).click();
  await page.waitForSelector('[data-gifos-lock-sheet="export"]', { timeout: 8000 });
  check('Download of a locked app asks before exposing clear private data',
    await page.locator('[data-gifos-lock-sheet="export"]').count() > 0);
  await page.click('[data-gifos-lock-sheet="export"] [data-lock-act="cancel"]');

  const stripped = await page.evaluate(async (fid) => {
    const file = await GifOS.store.getFile(fid);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const archive = await GifOS.gif.decode(bytes);
    const out = {};
    for (const p in archive.files) {
      if (p.startsWith('.state/') || p.startsWith('.lock/')) continue;
      out[p] = archive.files[p];
    }
    const strippedBytes = await GifOS.gif.repack(bytes, out);
    const back = await GifOS.gif.decode(strippedBytes);
    const hay = new TextDecoder('latin1').decode(strippedBytes);
    return {
      header: String.fromCharCode(strippedBytes[0], strippedBytes[1], strippedBytes[2], strippedBytes[3], strippedBytes[4], strippedBytes[5]),
      netscape: hay.indexOf('NETSCAPE2.0') >= 0,
      secret: hay.indexOf('secret-diary-42') >= 0,
      hasLock: !!(back.files && back.files[GifOS.lock.LOCK_PATH]),
      hasState: !!(back.files && back.files['.state/db.json']),
      hasIndex: !!(back.files && back.files['index.html']),
    };
  }, fileId);
  check('download without data is still a GIF with a loop', stripped.header === 'GIF89a' && stripped.netscape);
  check('…and carries the app, not the diary', stripped.hasIndex && !stripped.hasState && !stripped.hasLock && !stripped.secret);

  await icon.click({ button: 'right' });
  await page.waitForSelector('.ctx button', { timeout: 5000 });
  await page.getByText('Remove passkey lock…', { exact: true }).click();
  await page.waitForSelector('[data-gifos-lock-sheet="remove"]', { timeout: 8000 });
  await page.click('[data-gifos-lock-sheet="remove"] [data-lock-act="ok"]');
  let unlocked = false;
  for (let i = 0; i < 40 && !unlocked; i++) {
    unlocked = await page.evaluate(async (fid) => {
      const it = (await GifOS.store.allItems()).find((x) => x.fileId === fid);
      return !(it && it.passkey);
    }, fileId);
    if (!unlocked) await sleep(150);
  }
  check('removing the lock clears item.passkey', unlocked);
  const clear = await page.evaluate(async (fid) => {
    const file = await GifOS.store.getFile(fid);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const archive = await GifOS.gif.decode(bytes);
    const st = await GifOS.store.getState(fid);
    const hay = archive.files['.state/db.json'] ? new TextDecoder().decode(archive.files['.state/db.json']) : '';
    return {
      hasLock: !!archive.files[GifOS.lock.LOCK_PATH],
      hasState: !!archive.files['.state/db.json'],
      secret: hay.indexOf('secret-diary-42') >= 0 || JSON.stringify(st).indexOf('secret-diary-42') >= 0,
      collections: !!(st && st.collections && st.collections.notes),
      badge: !!document.querySelector('.icon .lock-badge'),
    };
  }, fileId);
  check('unwrap restores .state and drops .lock/v1', clear.hasState && !clear.hasLock);
  check('the diary is readable again', clear.secret && clear.collections);
  check('the lock badge is gone', !clear.badge);

  await browser.close();
  console.log('');
  console.log(failures ? failures + ' FAILED' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack); process.exit(1); });
