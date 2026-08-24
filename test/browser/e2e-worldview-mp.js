/*
 * End-to-end: two people, one map.
 *
 * The listing says "press Invite and someone else is on the same map, live,
 * with their cursor on it". That is a claim about a running system — the relay,
 * the room lane, two shared collections and the host's authority over them —
 * and the only way to know it is true is to open a second browser on the invite
 * link and watch the first one's map move under it.
 *
 * It also guards the thing that made it silent the first time it was tried:
 * SOMEBODY HAS TO SPEAK FIRST. The host only pushes its view once it knows
 * another person is in the room, and it learns that from the guest's own
 * presence record — so a guest that waits to be spoken to leaves two people in
 * a room looking at different Earths.
 *
 * Needs: static server on 8099, and a relay on ws://127.0.0.1:8790
 *   python3 -m http.server 8099 -d site
 *   node test/servers/relay-local.js
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { routeGibs } = require('../lib/gibs-fixtures');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// The app frame of a run.html page, once its own code is ready.
async function appFrame(page, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 45000)) {
    const f = page.frames().find((x) => x !== page.mainFrame());
    if (f) {
      const ready = await f.evaluate(() => !!(window.WVApp && window.WVData && window.WVData.ready)).catch(() => false);
      if (ready) return f;
    }
    await sleep(250);
  }
  return null;
}

/*
 * Evaluate in a page's CURRENT app frame. The room lane re-mounts the app on
 * the guest as it joins, so a frame handle taken at boot goes stale under you
 * and every later assertion dies with "target closed" — which reads as a
 * product failure and is a harness one.
 */
function ev(page) {
  return async function (fn, arg) {
    for (var i = 0; i < 20; i++) {
      var f = page.frames().find((x) => x !== page.mainFrame());
      if (f) {
        try { return await f.evaluate(fn, arg); } catch (e) {
          if (!/closed|destroyed|detached|Execution context/i.test(String(e.message))) throw e;
        }
      }
      await sleep(400);
    }
    throw new Error('no live app frame');
  };
}

async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 30000)) {
    let v = false;
    try { v = await fn(); } catch (e) { v = false; }
    if (v) return true;
    await sleep(300);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  const mkCtx = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
    await routeGibs(ctx, {});
    ctx.setDefaultTimeout(60000);
    return ctx;
  };

  // ---- the host: install the app, open it, Invite ---------------------------
  const hCtx = await mkCtx('Hana');
  const d = await hCtx.newPage();
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 60000 });
  const fid = await d.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'Worldview.gif', bytes, kind: 'gif', isApp: true, appId: 'worldview', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: id, name: 'Worldview.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    return id;
  }, readFileSync(appGif('worldview')).toString('base64'));
  await d.close();

  const h = await hCtx.newPage();
  h.on('pageerror', (e) => console.log('  [host] ' + e.message));
  await h.goto(BASE + '/run.html#id=' + fid);
  await h.waitForSelector('#appmount iframe', { timeout: 60000 });
  await h.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 8000 }).catch(() => {});
  const hf = await appFrame(h);
  const hEval = ev(h);
  check('the app boots on the host', !!hf);
  if (!hf) { console.log('NO-VERDICT: the host app never became ready'); process.exit(4); }
  await hEval(() => {
    const b = document.getElementById('wStart');
    if (b && !document.getElementById('welcome').hidden) b.click();
  });

  await h.evaluate(() => document.getElementById('appinvite').click());
  await h.waitForSelector('input[name="rmcls"]', { timeout: 15000 });
  await h.evaluate(() => {
    const r = document.querySelector('input[name="rmcls"][value="heal"]');
    if (r) r.checked = true;
    document.getElementById('inv-go').click();
  });
  await h.waitForFunction(() => document.body.classList.contains('app-room'), null, { timeout: 30000 });
  const link = await h.evaluate(() => document.getElementById('share-url').value);
  check('Invite mints a room link for the app', /#j=|\/join\//.test(link), link);

  // Invite re-mounts the app on the room lane, so the host's frame is a NEW
  // one and anything set before the invite belongs to the previous mount.
  // Park the host somewhere identifiable now that the room exists.
  await until(async () => hEval(() => !!(window.WVApp && window.WVData && window.WVData.ready)), 30000);
  await hEval(() => {
    const b = document.getElementById('wStart');
    if (b && !document.getElementById('welcome').hidden) b.click();
    window.WVApp.setDate('2020-05-05');
    window.WVMap.setView({ lat: 35.7, lon: 139.7, res: 0.03 });   // Tokyo
    window.WVApp.save();
  });

  // ---- the guest: open the link --------------------------------------------
  const cCtx = await mkCtx('Cleo');
  const c = await cCtx.newPage();
  c.on('pageerror', (e) => console.log('  [guest] ' + e.message));
  await c.goto(link);
  await c.waitForSelector('#appmount iframe', { timeout: 60000 });
  const cf = await appFrame(c, 60000);
  const cEval = ev(c);
  check('the guest gets the same app from the room, with no install', !!cf);
  if (!cf) { console.log('NO-VERDICT: the guest app never became ready'); process.exit(4); }
  await cEval(() => {
    const b = document.getElementById('wStart');
    if (b && !document.getElementById('welcome').hidden) b.click();
  }).catch(() => {});

  check('the guest knows it is not the owner of the file',
    await cEval(() => gifos.info().then((i) => i.owner === false)));

  // ---- the room converges ---------------------------------------------------
  const converged = await until(async () => {
    const v = await cEval(() => ({
      lat: window.WVMap.view.lat, lon: window.WVMap.view.lon, date: window.WVApp.state.date,
    }));
    return Math.abs(v.lat - 35.7) < 2 && Math.abs(v.lon - 139.7) < 3 && v.date === '2020-05-05';
  }, 40000);
  const guestView = await cEval(() => ({
    lat: window.WVMap.view.lat, lon: window.WVMap.view.lon, date: window.WVApp.state.date,
  }));
  check('the guest lands on the host\'s place and day',
    converged, guestView.lat.toFixed(1) + ', ' + guestView.lon.toFixed(1) + ' on ' + guestView.date);

  // The host moves; the guest follows. This is the whole feature.
  await hEval(() => {
    window.WVApp.setDate('2020-05-09');
    window.WVApp.goTo(-22.9, -43.2, 0.03, 'Rio de Janeiro');
  });
  const followed = await until(async () => {
    const v = await cEval(() => ({
      lat: window.WVMap.view.lat, lon: window.WVMap.view.lon, date: window.WVApp.state.date,
    }));
    return Math.abs(v.lat + 22.9) < 3 && Math.abs(v.lon + 43.2) < 4 && v.date === '2020-05-09';
  }, 40000);
  const moved = await cEval(() => ({
    lat: window.WVMap.view.lat, lon: window.WVMap.view.lon, date: window.WVApp.state.date,
  }));
  check('the host moves the map and the guest\'s map moves with it',
    followed, moved.lat.toFixed(1) + ', ' + moved.lon.toFixed(1) + ' on ' + moved.date);

  // The guest's pointer shows up on the host's map.
  await cEval(() => {
    for (let i = 0; i < 6; i++) {
      window.WVMP.cursor({ lat: -22.5 + i * 0.05, lon: -43.0 });
    }
  });
  const sawCursor = await until(async () => {
    return await hEval(() => (window.WVMap.furniture.cursors || []).length > 0);
  }, 30000);
  const cursors = await hEval(() => JSON.stringify(window.WVMap.furniture.cursors || []));
  check('the guest\'s cursor appears on the host\'s map', sawCursor, cursors.slice(0, 120));

  check('the host sees the room chip once someone is there',
    await hEval(() => {
      const chip = document.querySelector('.chip.together');
      return !!chip && !chip.hidden;
    }));

  // A layer switched on by the host reaches the guest's stack.
  await hEval(() => window.WVApp.addLayer('VIIRS_SNPP_Thermal_Anomalies_375m_Day'));
  const gotLayer = await until(async () => cEval(() =>
    window.WVApp.state.layers.some((r) => r.id === 'VIIRS_SNPP_Thermal_Anomalies_375m_Day' && r.on)), 30000);
  check('a layer the host switches on arrives in the guest\'s stack', gotLayer);

  // Looking around on your own stops the room dragging your map — and the map
  // still works, which is the point of the escape hatch.
  await cEval(() => document.querySelector('.chip.together').click());
  await cEval(() => window.WVMap.setView({ lat: 10, lon: 10, res: 0.2 }));
  await hEval(() => window.WVApp.goTo(48.85, 2.35, 0.02, 'Paris'));
  await sleep(4000);
  const stayed = await cEval(() => ({ lat: window.WVMap.view.lat, lon: window.WVMap.view.lon }));
  check('"on your own" really does stop the room moving your map',
    Math.abs(stayed.lat - 10) < 2 && Math.abs(stayed.lon - 10) < 2,
    stayed.lat.toFixed(1) + ', ' + stayed.lon.toFixed(1));

  await hCtx.close();
  await cCtx.close();
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
