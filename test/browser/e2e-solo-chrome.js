// e2e-solo-chrome.js — AN APP LAUNCH MUST NOT PAINT MEETING CHROME.
//
// Reported by Nathan 2026-08-06, launching the App Store: the video/audio
// meeting header bar flashed in, then vanished and the page repainted with just
// the app. `body.solo-app .bar {display:none}` is added by the boot script
// thousands of lines into run.html, so the browser laid out and painted the
// whole meeting chrome first and threw it away — a visible flash, and layout +
// paint work for a UI the page had already decided not to show.
//
// ONE RUNTIME (docs/one-runtime.md) says the entry mints the room's traits and
// they are immutable for the page's life. So the hash already holds the answer
// in <head>, and run.html now stamps `solo-app` on <html> there.
//
// WHAT THIS GUARDS, and why it is written this way: asserting "the class is
// present" would pass on a page that still flashed, because the class could be
// added late. So leg 1 samples the bar's computed display AT domcontentloaded —
// before the boot script has run — which is the earliest moment scripting can
// observe, and the moment the flash would be visible.
//
// Leg 3 is the one that stops the fix from over-reaching: a MEETING entry must
// still show its chrome. The obvious over-fix — stamping the same class for app
// ROOMS too — is a real trap: `body.app-room:not(.call-on)` rules have an
// exception keyed on a class only ever added to <body>, so an <html> copy would
// hide the grid forever once a call started. Solo is the only unconditional case.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext();

  // ---- 1. a SOLO app entry hides the chrome at the FIRST moment observable --
  {
    const pg = await ctx.newPage();
    // Sample inside the document itself, at domcontentloaded — the boot script
    // that adds body.solo-app has not run yet, so anything visible here is
    // exactly what the user sees flash.
    const early = [];
    await pg.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const g = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : 'absent'; };
        window.__early = { html: document.documentElement.className, bar: g('.bar'), grid: g('#grid'), feed: g('#feed'), body: document.body.className };
      }, { once: true });
    });
    await pg.goto(BASE + '/run.html#id=nosuchfile', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const e = await pg.evaluate(() => window.__early || null);
    early.push(e);
    check('solo entry: <html> carries solo-app before the boot script runs',
      !!e && /\bsolo-app\b/.test(e.html), e);
    check('solo entry: the meeting BAR is already display:none at domcontentloaded (this is the flash)',
      !!e && e.bar === 'none', e && { bar: e.bar });
    check('solo entry: the grid and feed are not painted either',
      !!e && e.grid === 'none' && e.feed === 'none', e && { grid: e.grid, feed: e.feed });
    // and it is not a transient: still hidden once the page has settled.
    await pg.waitForTimeout(2500);
    const late = await pg.evaluate(() => {
      const g = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display : 'absent'; };
      return { bar: g('.bar'), body: document.body.className };
    });
    check('solo entry: the bar stays hidden after boot (the body rule agrees with the head rule)',
      late.bar === 'none', late);
    await pg.close();
  }

  // ---- 2. the head rule must not survive into a MEETING entry ---------------
  {
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.__early = { html: document.documentElement.className };
      }, { once: true });
    });
    await pg.goto(BASE + '/run.html#v=chromeguard' + Math.floor(Math.random() * 1e6), { waitUntil: 'domcontentloaded', timeout: 60000 });
    const e = await pg.evaluate(() => window.__early || null);
    check('meeting entry: <html> does NOT carry solo-app', !!e && !/\bsolo-app\b/.test(e.html), e);
    await pg.waitForTimeout(3000);
    const bar = await pg.evaluate(() => { const el = document.querySelector('.bar'); return el ? getComputedStyle(el).display : 'absent'; });
    check('meeting entry: the meeting bar IS shown — the fix did not over-reach', bar !== 'none' && bar !== 'absent', { bar });
    await pg.close();
  }

  // ---- 3. an APP ROOM keeps its <body>-side exception -----------------------
  // The over-fix trap, pinned: app-room chrome is decided by
  // `body.app-room:not(.call-on)`, whose exception rides a class only ever set
  // on <body>. If someone later stamps app-room on <html> too, the grid can
  // never come back when a call starts. Assert <html> stays out of it.
  {
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => { window.__early = { html: document.documentElement.className }; }, { once: true });
    });
    await pg.goto(BASE + '/run.html#j=abcdefgh', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const e = await pg.evaluate(() => window.__early || null);
    check('app-room entry: <html> carries NEITHER solo-app NOR app-room (its rules need the body exception)',
      !!e && !/\bsolo-app\b/.test(e.html) && !/\bapp-room\b/.test(e.html), e);
    await pg.close();
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
