// moto-keeper.js — keep the USB-tethered phone SEATED in the monitored room.
//
// WHY THIS EXISTS (Nathan, 2026-08-04): the monitor locks the room with
// --ensure-pass, and run.html accepts no password URL param (by design — a
// password in a link is a password in every history, log and referrer). So the
// moment the phone's tab reloads — Chrome restart, OOM, or run.sh's own DAILY
// RECYCLE — it lands on "This room is locked" and sits there forever. The bot
// keeps ticking, the phone is silently gone, and nothing in the forensics says
// why. That is exactly how it was found: Chrome force-stopped at ~00:00, the
// tab parked at the door, and the room read occ=1 for hours.
//
// What it does, per pass, all IDEMPOTENT — a pass with nothing to do is a
// no-op that exits 0:
//   1. door up  -> type MEET_PASS, click Join, confirm the door cleared
//   2. camera off -> click #cam, confirm a live video track appeared
//
// WHAT IT DELIBERATELY WILL NOT DO: navigate, or open a tab. cdp-moto.js's
// rule holds — *Nathan placed that tab*. A keeper that re-navigates on its own
// fights a human who parked the phone somewhere on purpose, and that is a
// worse failure than an empty room. Set MEET_MOTO_LAUNCH=1 to opt in to
// relaunching Chrome onto the room when NO meet tab exists at all.
//
// Exit codes: 0 = nothing to do, or repaired. 1 = a real failure (no device,
// no CDP, door refused the password). run.sh treats ANY exit as advisory and
// never lets it touch the monitor's own lifecycle.
'use strict';
const { execFileSync } = require('child_process');

const PASS = process.env.MEET_PASS || '';
const ROOM = process.env.MEET_ROOM || 'test';
const EDGE = process.env.MEET_EDGE !== '0';
const PORT = process.env.MEET_MOTO_PORT || '9222';
const LAUNCH = process.env.MEET_MOTO_LAUNCH === '1';
const log = (...a) => console.log('[moto-keeper]', ...a);

let pw = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pw = require(m); if (pw) break; } catch (e) {}
}
if (!pw) { log('no playwright — skipping'); process.exit(1); }

function adb(args, opts) {
  return execFileSync('adb', args, { encoding: 'utf8', timeout: 15000, ...opts });
}

(async () => {
  // A phone that is not plugged in is not an error — the monitor runs on hosts
  // with no phone at all, and must not spew for it.
  let devices = '';
  try { devices = adb(['devices']); } catch (e) { log('no adb on PATH — skipping'); process.exit(1); }
  const attached = devices.split('\n').slice(1).filter((l) => /\tdevice$/.test(l.trim()));
  if (!attached.length) { log('no device attached — skipping'); process.exit(0); }

  // The forward is idempotent; re-running it after a phone re-plug is the
  // whole reason we do it here instead of once at boot.
  try { adb(['forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote']); }
  catch (e) { log('adb forward failed (Chrome not running?) —', String(e.message || e).trim()); }

  function roomUrl() {
    return `https://gifos.app/run.html#v=${ROOM}${EDGE ? '&edge' : ''}&DEBUG=on`; // the 404-router's canonical shape; meet.html died on the no-shims flag day
  }
  function launchChrome() {
    const url = roomUrl();
    log('launching', url);
    // `adb shell` re-splits its argv through the DEVICE's sh, so the room URL's
    // own `&` backgrounds the command there and everything after it becomes a
    // separate (nonexistent) command — "com.android.chrome: inaccessible or not
    // found". Single-quote the URL for that second shell, and name the activity
    // with -n instead of trailing the package, which `am start` does not take.
    adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
      '-d', `'${url}'`, '-n', 'com.android.chrome/com.google.android.apps.chrome.Main']);
  }

  // A FULLY STOPPED CHROME HAS NO CDP SOCKET AT ALL — so the relaunch decision
  // has to live HERE, not merely on the "connected but no meet tab" path. The
  // first cut put it only on the latter, which made MEET_MOTO_LAUNCH dead code
  // in the exact case it was written for (Chrome force-stopped).
  let browser = null;
  try { browser = await pw.chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
  catch (e) {
    if (!LAUNCH) {
      log('no CDP on :' + PORT + ' — Chrome is not running (set MEET_MOTO_LAUNCH=1 to relaunch)');
      process.exit(1);
    }
    log('no CDP — Chrome is not running');
    launchChrome();
    await new Promise((r) => setTimeout(r, 12000));
    // Re-forward: the devtools socket only exists once Chrome is up.
    try { adb(['forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote']); } catch (e2) {}
    try { browser = await pw.chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
    catch (e2) { log('still no CDP after launch — giving up this pass'); process.exit(1); }
  }

  const pages = [];
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
    if (/\/meet(\.html|\/)/.test(p.url())) pages.push(p);
  }

  if (!pages.length) {
    if (!LAUNCH) {
      log('no meet tab open — NOT navigating (set MEET_MOTO_LAUNCH=1 to allow)');
      await browser.close(); process.exit(1);
    }
    log('no meet tab open');
    launchChrome();
    await new Promise((r) => setTimeout(r, 12000));
    await browser.close();
    process.exit(0); // the next pass drives the door
  }

  let repaired = 0, failed = 0;
  for (const page of pages) {
    // ---- 1. the locked door ------------------------------------------------
    const doorUp = await page.evaluate(() => {
      const el = document.querySelector('#pw-new');
      return !!(el && el.offsetParent !== null);
    }).catch(() => false);

    if (doorUp) {
      if (!PASS) { log('door is up but MEET_PASS is empty — cannot enter'); failed++; continue; }
      log('door is up — presenting the password');
      await page.fill('#pw-new', PASS);
      await page.click('#pw-save');
      // The door clears only after the relay accepts; poll rather than sleep a
      // fixed block, so a fast accept is not paid for at the slow rate.
      let cleared = false;
      for (let i = 0; i < 20 && !cleared; i++) {
        await page.waitForTimeout(500);
        cleared = await page.evaluate(() => {
          const el = document.querySelector('#pw-new');
          return !el || el.offsetParent === null;
        }).catch(() => false);
      }
      if (!cleared) { log('door REFUSED the password — check MEET_PASS'); failed++; continue; }
      log('door cleared — seated');
      repaired++;
      await page.waitForTimeout(3000); // let the seat settle before touching the cam
    }

    // ---- 2. the camera -----------------------------------------------------
    // #cam carries its own state in the title ("Camera off — tap to turn on"),
    // which is the same string a human reads; asserting on it means a silent
    // re-word breaks the keeper loudly instead of leaving a dark phone.
    const camState = await page.evaluate(() => {
      const c = document.getElementById('cam');
      return c ? { off: /turn on/i.test(c.title || ''), title: c.title } : null;
    }).catch(() => null);

    if (!camState) { log('no #cam control on the page — skipping camera'); continue; }
    if (!camState.off) { log('camera already on'); continue; }

    log('camera is off — turning it on');
    await page.click('#cam');
    let live = false;
    for (let i = 0; i < 24 && !live; i++) {
      await page.waitForTimeout(500);
      live = await page.evaluate(() => {
        const c = document.getElementById('cam');
        const on = c && !/turn on/i.test(c.title || '');
        const v = document.querySelector('video');
        return !!(on && v && v.videoWidth > 0);
      }).catch(() => false);
    }
    if (live) { log('camera on — video track live'); repaired++; }
    else { log('clicked #cam but no live video appeared (permission prompt?)'); failed++; }
  }

  await browser.close();
  log(`pass done — repaired=${repaired} failed=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { log('threw:', String(e && e.stack || e).slice(0, 400)); process.exit(1); });
