/*
 * capabilities.links — the two sandbox flags a tap on a link needs, so a
 * gazetteer coordinate (or any <a target="_blank">) can open a normal tab.
 *
 * A sandboxed frame cannot open a window. Without allow-popups, target=_blank
 * and window.open are swallowed and the tap looks dead. With allow-popups
 * alone the new window INHERITS the sandbox, so a real page (Google Maps)
 * still cannot run. allow-popups-to-escape-sandbox is the second half.
 *
 * What this must never grant: allow-same-origin, allow-top-navigation, or
 * any CSP relaxation. The app still cannot fetch; it can only hand the
 * browser a URL the user just tapped.
 *
 * Three assertions, in the order they matter:
 *   1. An app that did NOT declare it opens nothing     (the sandbox still holds)
 *   2. An app that DID declare it opens a normal tab    (the capability works)
 *   3. Unchecking it in the Abilities sheet refuses it  (the promise is real)
 *
 * Needs BASE only. No relay, no network beyond the maps URL the declared
 * app is allowed to hand to a new tab.
 */
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MAPS = 'https://www.google.com/maps/search/?api=1&query=31.778,35.229';
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

const APP_HTML = '<!doctype html><meta charset="utf-8">' +
  '<a id="m" href="' + MAPS + '" target="_blank" rel="noopener noreferrer">map</a>';

function hasToken(sb, token) {
  return new RegExp('(^|\\s)' + token + '(\\s|$)').test(sb || '');
}
function stripLinks(sb) {
  return (sb || '')
    .replace(/\s*allow-popups-to-escape-sandbox\s*/g, ' ')
    .replace(/\s*allow-popups\s*/g, ' ')
    .trim();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();

  const seed = (page, appId, name, caps) => page.evaluate(async (a) => {
    const manifest = { gifos: '1.0', appId: a.appId, name: a.name, entry: 'index.html' };
    if (a.caps) manifest.capabilities = a.caps;
    const files = { 'manifest.json': JSON.stringify(manifest), 'index.html': a.html };
    const bytes = await GifOS.gif.encode(files, {});
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: a.name + '.gif', bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    return fileId;
  }, { appId, name, caps, html: APP_HTML });

  const run = async (fileId) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [page] ' + e.message));
    await p.goto(BASE + '/run.html#id=' + fileId);
    await p.waitForSelector('#appmount iframe', { timeout: 30000 });
    const row = await p.evaluate(() => {
      const cb = document.querySelector('.perm-modal input[data-cap="links"]');
      return cb ? (cb.closest('.perm-row') || {}).textContent || '' : null;
    });
    const sheet = await p.$('.perm-modal .done');
    if (sheet) { await sheet.click(); await p.waitForTimeout(150); }
    const handle = await p.$('#appmount iframe');
    const sandbox = (await handle.getAttribute('sandbox')) || '';
    const frame = await handle.contentFrame();
    await frame.waitForSelector('#m', { timeout: 15000 });
    const popupP = p.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
    await frame.click('#m');
    const popup = await popupP;
    let url = '';
    if (popup) {
      try { url = popup.url(); } catch (e) { url = ''; }
      try { await popup.close(); } catch (e) {}
    }
    await p.close();
    return { sandbox, row, opened: !!popup, url };
  };

  const boot = await ctx.newPage();
  await boot.goto(BASE + '/run.html');
  await boot.waitForFunction(() => window.GifOS && GifOS.store && GifOS.gif, null, { timeout: 30000 });
  const plainId = await seed(boot, 'plainlinks', 'Plain', null);
  const linkId = await seed(boot, 'maplinks', 'Mapper', { links: true });
  await boot.close();

  const plain = await run(plainId);
  check('an app that did NOT declare links gets NO allow-popups token',
    !/allow-popups/.test(plain.sandbox), plain.sandbox);
  check('...and the tap opens no tab', !plain.opened, plain.url);

  const linked = await run(linkId);
  check('capabilities.links puts allow-popups on the app frame',
    hasToken(linked.sandbox, 'allow-popups'), linked.sandbox);
  check('...and allow-popups-to-escape-sandbox, so the tab is not sandboxed',
    hasToken(linked.sandbox, 'allow-popups-to-escape-sandbox'), linked.sandbox);
  check('...and the tap opens a tab at the maps URL',
    linked.opened && /google\.com\/maps/.test(linked.url), linked.url || '(no popup)');
  check('the two tokens are the ONLY sandbox change',
    stripLinks(linked.sandbox) === (plain.sandbox || '').trim(),
    linked.sandbox + '  vs  ' + plain.sandbox);
  check('...and it opened no other path — no allow-same-origin, no top navigation',
    !/allow-same-origin|allow-top-navigation/.test(linked.sandbox), linked.sandbox);
  check('the Abilities sheet offers a links checkbox, with real words on it',
    !!linked.row && /Open a web link/.test(linked.row) && !/undefined/.test(linked.row),
    JSON.stringify((linked.row || '(no row)').replace(/\s+/g, ' ').slice(0, 120)));
  check('an app that did NOT declare it gets no such row', plain.row === null, String(plain.row));

  const veto = await ctx.newPage();
  await veto.goto(BASE + '/run.html');
  await veto.evaluate(() => localStorage.setItem('gifos_capoff_maplinks', JSON.stringify(['links'])));
  await veto.close();
  const vetoed = await run(linkId);
  check('unchecking it in the Abilities sheet REMOVES both tokens',
    !/allow-popups/.test(vetoed.sandbox), vetoed.sandbox);
  check('...and the tap opens no tab, exactly as if it had never asked',
    !vetoed.opened, vetoed.url);

  await browser.close();
  console.log(fail ? '\nFAILURES: ' + fail : '\nall green');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
