// FULL SCREEN MUST NOT BURY THE SYSTEM POPUPS.
//
// The app bar's ⛶ used to call requestFullscreen() on #apppane itself. An
// element other than the root that takes fullscreen moves into the browser's
// TOP LAYER, and the UA paints an opaque ::backdrop over the whole rest of the
// document. Everything outside that element's subtree is still in the DOM,
// still display:flex, still the size it was given — and invisible, and
// unclickable. Every modal run.html has (Help, Abilities, Settings, Share, the
// app-help sheet, the perms gate) lives outside #apppane, as page-level modals
// must, so all of them died the moment an app went full. Clicking Help set
// display:flex on a 1280x720 modal nobody could see; the only cure was to leave
// full screen, which is exactly what the bug report said.
//
// z-index cannot answer it — .perm-modal already carries 2147483000 and the top
// layer is above every layer — so the fix is structural: the ROOT takes the
// screen and body.app-full gives the pane the glass in CSS. This suite pins the
// CONSEQUENCE, not the mechanism: with an app full screen, a popup must be
// something a finger can actually land on.
//
// THE TEST IS A HIT TEST, DELIBERATELY. Reading display/visibility/z-index off
// the modal is precisely what the old bug sailed past — every one of those read
// "shown". document.elementFromPoint asks the compositor the same question the
// user's finger asks: at the middle of this popup, what would I touch?
//
// Needs BASE only (a solo app — no relay, no camera).
const { chromium, CHROME } = require('../lib/pw');
const { systemAppIds } = require('../lib/apps');

const SYS = systemAppIds();
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

// In the page: is the middle of this element something you could touch?
const HIT = (sel) => {
  const m = document.querySelector(sel);
  if (!m) return { found: false };
  const r = m.getBoundingClientRect();
  if (!r.width || !r.height) return { found: true, sized: false };
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return {
    found: true, sized: true,
    reachable: !!(hit && (m === hit || m.contains(hit))),
    hit: hit ? (hit.id || (hit.tagName + '.' + (hit.className || '').toString().split(' ')[0])) : null,
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();

  // ---- seed a desktop and pick an app that HAS an Abilities chip -----------
  // "Abilities" is half the bug report, and the chip only appears for an app
  // that declares a gated capability — so pick for that rather than hope.
  const d = await ctx.newPage();
  d.on('pageerror', (e) => console.log('  [desk] ' + e.message));
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 30000 });
  const picks = await d.evaluate(async (SYS) => {
    // Mirrors gifos-perms.js CAP_LABELS: what puts the chip on the bar.
    const GATED = ['microphone', 'camera', 'motion', 'ai', 'api', 'agent', 'wasm', 'gpu', 'pointer', 'fullscreen', 'pool', 'pay', 'assets'];
    const files = (await GifOS.store.allFiles()).filter((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    const gated = [], plain = [];
    for (const f of files) {
      const rec = await GifOS.store.getFile(f.id);
      if (!rec || !rec.bytes) continue;
      // readManifest(archive), NOT archive.manifest — decode() returns
      // {files}, so `.manifest` is undefined and every app reads as ungated.
      let m = null;
      try { m = GifOS.gif.readManifest(await GifOS.gif.decode(rec.bytes)) || {}; } catch (e) { continue; }
      const caps = m.capabilities || {};
      const on = GATED.some((k) => (Array.isArray(caps[k]) ? caps[k].length : caps[k]));
      (on ? gated : plain).push({ id: f.id, appId: f.appId });
    }
    return { gated: gated.slice(0, 3), plain: plain.slice(0, 1) };
  }, SYS);
  await d.close();
  const pick = picks.gated[0] || picks.plain[0];
  check('seeded desktop offers an app to run', !!pick, pick && pick.appId);
  if (!pick) { await browser.close(); process.exit(1); }
  const hasChip = !!picks.gated.length;
  if (!hasChip) console.log('  no seeded app declares a gated capability — the Abilities leg is skipped, not assumed');

  // ---- the solo app -------------------------------------------------------
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [run] ' + e.message));
  await p.goto(BASE + '/run.html#id=' + pick.id);
  await p.waitForSelector('#appmount iframe', { timeout: 30000 });
  // The launch ask (if this app has one) is its own modal and its own suite's
  // subject. Settle it the way a person would — the Abilities chip stays.
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(500);
    const done = await p.evaluate(() => {
      const m = document.querySelector('.perm-modal');
      if (!m) return true;
      const go = Array.from(m.querySelectorAll('button')).find((b) => /continue|allow|ok|got it|start/i.test(b.textContent || ''));
      if (go) { go.click(); return false; }
      m.remove(); return false;
    });
    if (done) break;
  }

  check('the fullscreen toggle is offered on the app bar',
    await p.evaluate(() => { const b = document.getElementById('appfull'); return !!(b && b.offsetParent); }));

  // ---- go full ------------------------------------------------------------
  await p.click('#appfull');
  await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 }).catch(() => {});
  const full = await p.evaluate(() => {
    const pane = document.getElementById('apppane');
    const r = pane.getBoundingClientRect();
    const bar = document.querySelector('#appbar');
    return {
      fsIsRoot: document.fullscreenElement === document.documentElement,
      fsTag: document.fullscreenElement ? (document.fullscreenElement.id || document.fullscreenElement.tagName) : null,
      filled: document.body.classList.contains('app-full'),
      fills: Math.abs(r.width - innerWidth) < 2 && Math.abs(r.height - innerHeight) < 2,
      // The app bar is the pane's own, and it must be the thing at the top of
      // the screen — proof the pane really is over the meeting chrome.
      topIsAppBar: (() => { const h = document.elementFromPoint(4, Math.round(bar.getBoundingClientRect().top + 4)); return !!(h && pane.contains(h)); })(),
    };
  });
  // THE ROOT, NEVER THE PANE. This is the whole fix in one assertion: a pane in
  // the top layer is what banished the popups, and no amount of CSS undoes it.
  check('full screen is taken by the DOCUMENT, not by #apppane', full.fsIsRoot, 'fullscreenElement=' + full.fsTag);
  check('…and body.app-full is what gives the pane the glass', full.filled);
  check('…the pane fills the viewport', full.fills);
  check('…covering the meeting chrome above it', full.topIsAppBar);

  // ---- the report: Help, and Abilities ------------------------------------
  await p.click('#apphelp');
  await p.waitForTimeout(200);
  const help = await p.evaluate(HIT, '#apphelp-modal');
  check("the app's Help opens ON TOP of the full-screen app", help.reachable === true,
    'hit=' + help.hit);
  await p.evaluate(() => { document.getElementById('apphelp-close').click(); });

  if (hasChip) {
    const chipUp = await p.evaluate(() => { const b = document.getElementById('appperms'); return !!(b && b.offsetParent); });
    check('the Abilities chip is on the bar for an app that asks for something', chipUp);
    if (chipUp) {
      await p.click('#appperms');
      await p.waitForTimeout(200);
      const perms = await p.evaluate(HIT, '.perm-modal');
      check('Abilities opens ON TOP of the full-screen app', perms.reachable === true, 'hit=' + perms.hit);
      await p.evaluate(() => { const m = document.querySelector('.perm-modal'); if (m) m.remove(); });
    }
  }

  // ---- and every OTHER page-level modal, by construction ------------------
  // Named legs guard the two the report named; this guards the class. A modal
  // added to run.html tomorrow is covered without anyone remembering to come
  // back here — which is the reason the root takes the screen instead of a
  // list of things being lifted over the pane one at a time.
  const sweep = await p.evaluate((hitSrc) => {
    const hit = new Function('sel', 'return (' + hitSrc + ')(sel)');
    const out = [];
    for (const m of document.querySelectorAll('.name-modal')) {
      if (!m.id) continue;
      const was = m.style.display;
      m.style.display = 'flex';
      const r = hit('#' + m.id);
      m.style.display = was;
      out.push({ id: m.id, ok: r.reachable === true, hit: r.hit });
    }
    return out;
  }, HIT.toString());
  const dead = sweep.filter((x) => !x.ok);
  check('EVERY page-level modal is reachable while an app is full screen',
    sweep.length > 4 && !dead.length,
    sweep.length + ' checked' + (dead.length ? '; buried: ' + dead.map((x) => x.id + '→' + x.hit).join(', ') : ''));

  // ---- leaving undoes BOTH halves ----------------------------------------
  // The class is painted from document.fullscreenElement precisely so that the
  // ways OUT that never touch our click handler still put the page back: Esc,
  // the browser's own affordance, another element taking the screen. This
  // exits through document.exitFullscreen() — the same route, one the page can
  // reach. NOT keyboard Escape: in headless Chromium that keystroke goes to the
  // page and never to the browser UI that owns fullscreen, so it would assert
  // nothing here and read as a red on a real box only.
  await p.evaluate(() => document.exitFullscreen());
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({
    fs: !!document.fullscreenElement,
    filled: document.body.classList.contains('app-full'),
    pos: getComputedStyle(document.getElementById('apppane')).position,
  }));
  check('leaving full screen without our click handler works', !after.fs);
  check('…and drops the fill with it — no filled-but-not-fullscreen limbo',
    !after.filled && after.pos !== 'fixed', 'position=' + after.pos);

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
