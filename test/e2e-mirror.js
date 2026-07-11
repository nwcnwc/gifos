// Synced-mirror e2e: a host serves an ETERNAL app; a client pulls its state,
// saves a MIRROR (a copy bound to the link), and — after the host advances the
// state — re-opens the mirror and catches up. Runs against the local relay.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let fail = 0; const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fail++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const setup = { content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Tester')}catch(e){}" };
  const newCtx = async () => { const c = await browser.newContext(); await c.addInitScript(setup); return c; };

  // Build a trivial valid app GIF once, share its bytes as base64.
  const boot0 = await (await newCtx()).newPage();
  await boot0.goto(BASE + '/run.html');
  const b64 = await boot0.evaluate(async () => {
    const bytes = await GifOS.gif.encode({ 'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'synctest', name: 'Sync Test', entry: 'index.html' }), 'index.html': '<!doctype html><h1>sync test</h1>' }, {});
    let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s);
  });

  // ---- HOST: create the app, seed state v=7, host it FOREVER ----
  const hostPage = await (await newCtx()).newPage();
  hostPage.on('console', m => { if (m.type() === 'error') console.log('  [host]', m.text()); });
  await hostPage.goto(BASE + '/run.html');
  const binding = await hostPage.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fileId = GifOS.store.uid('file'); window.__hostFileId = fileId;
    await GifOS.store.putFile({ id: fileId, name: 'Sync Test.gif', bytes, kind: 'gif', isApp: true, appId: 'synctest', mime: 'image/gif' });
    await GifOS.store.setState(fileId, { collections: { d: { items: { v: { id: 'v', n: 7 } }, seq: 1 } } });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const ctl = await GifOS.runtime.boot(mount, fileId, null); window.__ctl = ctl;
    await ctl.becomeHost({ lifetime: 'forever' });
    const s = await GifOS.store.getState(fileId + '::session');
    return { s: s.sid, k: s.lsec, relay: s.relay, keep: s.keep, exp: s.exp };
  }, b64);
  check('host minted an eternal (forever) link', binding.keep === 'persist' && !binding.exp);
  await sleep(500);

  // ---- CLIENT: pull the host's state directly ----
  const clientPage = await (await newCtx()).newPage();
  clientPage.on('console', m => { if (m.type() === 'error') console.log('  [client]', m.text()); });
  await clientPage.goto(BASE + '/run.html');
  const pulled = await clientPage.evaluate((binding) => GifOS.runtime.pullMirrorState(binding, 6000), binding);
  check('pullMirrorState fetched the master state (v=7)', pulled && pulled.collections && pulled.collections.d && pulled.collections.d.items && pulled.collections.d.items.v && pulled.collections.d.items.v.n === 7);

  // ---- CLIENT: join as a real client, then Save a Mirror ----
  const mirror = await clientPage.evaluate(async (binding) => {
    const bin = atob(window.__b64); // not set; fall back below
    return null;
  }, binding).catch(() => null);
  // join via bootClient and saveMirror
  await clientPage.evaluate((b64) => { window.__b64 = b64; }, b64);
  const saved = await clientPage.evaluate(async (binding) => {
    const mount = document.createElement('div'); document.body.appendChild(mount);
    let eternalSeen = false;
    const ctl = await GifOS.runtime.bootClient(mount, { s: binding.s, k: binding.k, relay: binding.relay }, null, { onSession: (i) => { eternalSeen = !!(i && i.eternal); } });
    // wait for the app to arrive so saveMirror has bytes
    for (let i = 0; i < 40 && !ctl.saveMirror; i++) await new Promise(r => setTimeout(r, 100));
    let r = null, err = null;
    for (let i = 0; i < 40; i++) { try { r = await ctl.saveMirror(); break; } catch (e) { err = String(e && e.message || e); await new Promise(x => setTimeout(x, 150)); } }
    const bind = r ? await GifOS.store.getState(r.fileId + '::mirror') : null;
    return { fileId: r && r.fileId, eternalSeen, bind, err };
  }, binding);
  check('client saw the link as eternal (mirror offered)', saved.eternalSeen === true);
  check('saveMirror created a bound mirror icon', !!saved.fileId && !!saved.bind && saved.bind.s === binding.s);

  // ---- HOST advances the state to v=42 ----
  await hostPage.evaluate(async () => {
    const fileId = window.__hostFileId;
    await GifOS.store.setState(fileId, { collections: { d: { items: { v: { id: 'v', n: 42 } }, seq: 1 } } });
  });
  await sleep(300);

  // ---- CLIENT: re-open the mirror via bootMirror → it should catch up to 42 ----
  const after = await clientPage.evaluate(async (fileId) => {
    const mount = document.createElement('div'); document.body.appendChild(mount);
    await GifOS.runtime.bootMirror(mount, fileId, null);
    const st = await GifOS.store.getState(fileId);
    return st && st.collections && st.collections.d && st.collections.d.items && st.collections.d.items.v ? st.collections.d.items.v.n : null;
  }, saved.fileId);
  check('re-opening the mirror caught up to the master (v=42)', after === 42);

  // ---- DIVERGENCE: local changes + a reachable master → warn, and honour the choice ----
  const coll = (n) => ({ collections: { d: { items: { v: { id: 'v', n } }, seq: 1 } } });
  const setMaster = (n) => hostPage.evaluate(async (args) => { await GifOS.store.setState(window.__hostFileId, args.s); }, { s: coll(n) });
  // force divergence: local != syncedHash (bogus) and != master
  const arm = (localN) => clientPage.evaluate(async (args) => {
    await GifOS.store.setState(args.fileId, args.local);
    const b = await GifOS.store.getState(args.fileId + '::mirror');
    await GifOS.store.setState(args.fileId + '::mirror', Object.assign({}, b, { syncedHash: 'BOGUS' }));
  }, { fileId: saved.fileId, local: coll(localN) });
  const openWith = (choice) => clientPage.evaluate(async (args) => {
    const mount = document.createElement('div'); document.body.appendChild(mount);
    let asked = false;
    const r = await GifOS.runtime.bootMirror(mount, args.fileId, null, { onDiverged: () => { asked = true; return args.choice; } });
    const st = await GifOS.store.getState(args.fileId);
    const bind = await GifOS.store.getState(args.fileId + '::mirror');
    const n = st && st.collections && st.collections.d && st.collections.d.items && st.collections.d.items.v ? st.collections.d.items.v.n : null;
    return { asked, cancelled: !!(r && r.cancelled), n, stillMirror: !!(bind && bind.s) };
  }, { fileId: saved.fileId, choice });

  await setMaster(200); await arm(7);
  const upd = await openWith('update');
  check('diverged mirror warned before overwriting', upd.asked === true);
  check('choice "update" pulled the master (v=200), stayed a mirror', upd.n === 200 && upd.stillMirror);

  await setMaster(300); await arm(7);
  const unl = await openWith('unlink');
  check('choice "unlink" KEPT local changes (v=7)', unl.n === 7);
  check('choice "unlink" broke the mirror binding', unl.stillMirror === false);

  // re-save a fresh mirror to test cancel (previous one was unlinked)
  const saved2 = await clientPage.evaluate(async (binding) => {
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const ctl = await GifOS.runtime.bootClient(mount, { s: binding.s, k: binding.k, relay: binding.relay }, null, {});
    for (let i = 0; i < 40 && !ctl.saveMirror; i++) await new Promise(r => setTimeout(r, 100));
    let r = null; for (let i = 0; i < 40; i++) { try { r = await ctl.saveMirror(); break; } catch (e) { await new Promise(x => setTimeout(x, 150)); } }
    return r && r.fileId;
  }, binding);
  await hostPage.evaluate(async (args) => { await GifOS.store.setState(window.__hostFileId, args.s); }, { s: coll(400) });
  await clientPage.evaluate(async (args) => {
    await GifOS.store.setState(args.fileId, args.local);
    const b = await GifOS.store.getState(args.fileId + '::mirror');
    await GifOS.store.setState(args.fileId + '::mirror', Object.assign({}, b, { syncedHash: 'BOGUS' }));
  }, { fileId: saved2, local: coll(7) });
  const can = await clientPage.evaluate(async (args) => {
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const r = await GifOS.runtime.bootMirror(mount, args.fileId, null, { onDiverged: () => args.choice });
    const st = await GifOS.store.getState(args.fileId);
    const n = st && st.collections && st.collections.d && st.collections.d.items && st.collections.d.items.v ? st.collections.d.items.v.n : null;
    return { cancelled: !!(r && r.cancelled), n };
  }, { fileId: saved2, choice: 'cancel' });
  check('choice "cancel" aborted the open (no controller)', can.cancelled === true);
  check('choice "cancel" left local changes untouched (v=7)', can.n === 7);

  await browser.close();
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
