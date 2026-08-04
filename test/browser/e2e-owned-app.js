// Owned-app-room link minting (one-runtime, docs/one-runtime.md). The ROOM
// mints link identity now (run.html's Invite), not the runtime: an OWNED
// room folds slug(shortname[-anon]) + verifier into the room string; the
// owner secret lives only in this desktop's store, never in the link.
// 'Let a friend keep it going' mints an anyone-owns #j= room (the succession
// class). Room = app short-name for signed apps, +"-anon" for unsigned — the
// -anon rule is SECURITY: an unsigned GIF can never mint a clean branded URL.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let fail = 0; const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Ona')}catch(e){}" });

  const seedApp = async (page, name, appId) => page.evaluate(async (a) => {
    const files = { 'manifest.json': JSON.stringify({ gifos: '1.0', appId: a.appId, name: a.name, entry: 'index.html' }), 'index.html': '<h1>x</h1>' };
    const bytes = await GifOS.gif.encode(files, {});
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: a.name + '.gif', bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    return fileId;
  }, { name, appId });

  const mint = async (fileId, owned) => {
    const p = await ctx.newPage();
    await p.goto(BASE + '/run.html#id=' + fileId);
    await p.waitForSelector('#appmount iframe', { timeout: 20000 });
    await p.evaluate(() => document.getElementById('appinvite').click());
    await p.waitForSelector('input[name="rmcls"]', { timeout: 8000 });
    await p.evaluate((o) => {
      document.querySelector('input[name="rmcls"][value="' + (o ? 'owned' : 'heal') + '"]').checked = true;
      document.getElementById('inv-go').click();
    }, owned);
    await p.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 25000 });
    const link = await p.evaluate(() => document.getElementById('share-url').value);
    const saved = await p.evaluate((id) => GifOS.store.getState(id + '::room'), fileId);
    await p.close();
    return { link, saved };
  };

  const boot = await ctx.newPage();
  await boot.goto(BASE + '/run.html'); // load the runtime once for seeding
  const unsignedId = await seedApp(boot, 'Sync Test', 'st');
  const healId = await seedApp(boot, 'Party', 'st2');
  await boot.close();

  // ---- OWNED mint: unsigned app ---------------------------------------------
  const o = await mint(unsignedId, true);
  check('unsigned app → room is "sync-test-anon" (the -anon SECURITY rule)', /sync-test-anon/.test(o.link), o.link);
  check('owned link carries shortname + verifier + code (#s=<short>.<ver>&k=)',
    /#s=sync-test-anon\.[a-f0-9]{24}&k=[a-z0-9]{6,}/.test(o.link), o.link);
  check('the owner secret is stored, and NEVER appears in the link',
    !!(o.saved && o.saved.sec) && o.link.indexOf(o.saved.sec) === -1);
  check('the verifier commits to the secret (identity, not a password)',
    !!(o.saved && o.saved.av && /^[a-f0-9]{24}$/.test(o.saved.av)));
  check('re-invite is STABLE (mint persisted per file)', (await mint(unsignedId, true)).link === o.link);

  // ---- RESILIENT mint: anyone-owns, dotless — the succession class ----------
  const h = await mint(healId, false);
  check('resilient link is a bare #j=<code> (no brand, no verifier — anonymity is the point)',
    /#j=[a-z0-9]{6,}(&|$)/.test(h.link), h.link);
  check('resilient mint stores no secret (nothing to gate — succession heals it)',
    !!(h.saved && h.saved.owned === false && !h.saved.sec));

  await browser.close();
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
