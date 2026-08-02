// Icons are LOCKED by default; only Arrange mode unlocks them.
//
// The bug this guards: on a phone, scrolling the Home Screen picked icons UP.
// `.icon { touch-action: none }` plus preventDefault + setPointerCapture on
// pointerdown meant a finger that landed on an icon owned the gesture from
// pixel one — a 7px wobble past the drag threshold WAS a drag, and a drag that
// ended over a folder posted the icon into it silently, with no undo and no
// clue which folder ate it. Reported as "you can't scroll without losing an
// app".
//
// The guarantees, in the order a user meets them:
//   1. a fresh load is LOCKED — touch-action lets the page pan from an icon
//   2. a touch swipe from an icon SCROLLS and never moves the icon
//   3. a touch drag onto a folder does NOT re-parent it (the actual complaint)
//   4. long-press → "Arrange icons…" unlocks, and SAYS SO (bar + pegboard)
//   5. unlocked, a touch drag really does move the icon
//   6. Done re-locks
//   7. MOUSE drag is untouched — laptops never lost click-drag
//   8. any drop that changes folder offers an Undo that puts it exactly back
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) failures++; };

// A real finger, through CDP: dispatchTouchEvent drives our pointer handlers.
function touchPoints(x, y) { return [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1, id: 1 }]; }
async function touchDrag(cdp, from, to, steps = 14) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(from.x, from.y) });
  await sleep(30);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(x, y) });
    await sleep(16);
  }
  await sleep(30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
}
async function longPress(cdp, at, ms = 750) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(at.x, at.y) });
  await sleep(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
}

// Icon geometry by NAME — never by index. Icons are re-created on every render,
// so a node handle held across a drag is stale by the time we assert on it.
async function iconInfo(page, name) {
  return page.evaluate((n) => {
    const el = [...document.querySelectorAll('.icon')].find((e) =>
      ((e.querySelector('.label') || e).textContent || '').trim() === n);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10),
             cx: r.left + r.width / 2, cy: r.top + r.height / 2, lifted: el.classList.contains('lifted') };
  }, name);
}
async function parentOf(page, name) {
  return page.evaluate(async (n) => {
    const it = (await GifOS.store.allItems()).find((i) => i.name === n);
    return it ? (it.parent || null) : undefined;
  }, name);
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });

  // ================= PHONE (touch) =================
  const ctx = await b.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 740 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  const cdp = await ctx.newCDPSession(p);
  await p.goto(BASE + '/index.html');
  await p.waitForSelector('.icon', { timeout: 15000 });
  await sleep(700); // seeding settles

  // ---- 1. a fresh load is LOCKED ----
  // Chrome normalizes `pan-x pan-y pinch-zoom` to the equivalent shorthand
  // `manipulation` (pan + pinch allowed, only double-tap zoom dropped).
  const lockedTA = await p.evaluate(() => getComputedStyle(document.querySelector('.icon')).touchAction);
  check('fresh load: icons are LOCKED (touch-action is not "none")', lockedTA !== 'none');
  check('fresh load: touch-action still permits panning + pinch — ' + lockedTA,
    lockedTA === 'manipulation' || /pan-x/.test(lockedTA));
  check('fresh load: the desktop is not in Arrange mode',
    !(await p.evaluate(() => document.getElementById('desktop').classList.contains('arranging'))));
  check('fresh load: the arrange bar is hidden, the menubar is shown',
    await p.locator('#arrange-bar').isHidden() && await p.locator('.menubar').isVisible());

  // Pick a draggable app icon and a folder to (not) drop it into.
  const names = await p.evaluate(() => [...document.querySelectorAll('.icon')]
    .map((e) => ((e.querySelector('.label') || e).textContent || '').trim()));
  const APP = names.find((n) => /\.gif$/i.test(n)) || names[1];
  const FOLDER = await p.evaluate(async () => {
    const its = await GifOS.store.allItems();
    const f = its.find((i) => i.kind === 'folder' && !i.parent && i.id !== 'sys_trash');
    return f ? f.name : null;
  });
  check('the fixture desktop has an app icon and a folder to aim at', !!APP && !!FOLDER);

  // ---- 2. the browser is left FREE to scroll from an icon ----
  // We cannot assert the scroll itself: headless Chromium's synthetic touch
  // pipeline never reaches the compositor, so `synthesizeScrollGesture` with
  // gestureSourceType 'touch' moves nothing here — while 'mouse' scrolls the
  // very same container 300px. Asserting on it would have been a test that
  // guards nothing. So guard the two mechanisms that DECIDE whether a real
  // finger scrolls, both of which were the bug: touch-action (above), and
  // preventDefault on the pointerdown (here). A prevented touch pointerdown is
  // exactly what stopped the page from scrolling.
  const before = await iconInfo(p, APP);
  await p.evaluate(() => {
    window.__pdPrevented = null;
    document.addEventListener('pointerdown', (e) => {   // bubbles up AFTER the icon's own handler
      if (e.target.closest && e.target.closest('.icon')) window.__pdPrevented = e.defaultPrevented;
    });
  });
  const tapIcon = async () => {
    await p.evaluate(() => { window.__pdPrevented = null; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(before.cx, before.cy) });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
    return p.evaluate(() => window.__pdPrevented);
  };
  check('LOCKED: a touch on an icon is NOT preventDefault\'d — the browser may scroll',
    (await tapIcon()) === false);

  // ---- 3. THE REPORTED BUG: a touch drag onto a folder must not eat the icon ----
  const folderPos = await iconInfo(p, FOLDER);
  const homeParent = await parentOf(p, APP);
  await touchDrag(cdp, { x: before.cx, y: before.cy }, { x: folderPos.cx, y: folderPos.cy });
  check('LOCKED: a touch drag onto a folder does NOT move the icon into it',
    (await parentOf(p, APP)) === homeParent);
  const afterFolderDrag = await iconInfo(p, APP);
  check('LOCKED: the icon is still exactly where it was',
    afterFolderDrag && afterFolderDrag.left === before.left && afterFolderDrag.top === before.top);
  check('LOCKED: no undo toast, because nothing moved', await p.locator('.toast').isHidden());

  // ---- 4. long-press → "Arrange icons…" is the way in ----
  await longPress(cdp, { x: before.cx, y: before.cy });
  check('long-press on an icon opens the context menu', (await p.locator('.ctx').count()) === 1);
  check('the context menu offers "Arrange icons…"',
    (await p.locator('.ctx button', { hasText: 'Arrange icons' }).count()) === 1);
  await p.locator('.ctx button', { hasText: 'Arrange icons' }).click();
  await sleep(300);
  check('Arrange mode is ON', await p.evaluate(() => document.getElementById('desktop').classList.contains('arranging')));
  check('Arrange mode SAYS SO: the bar replaces the menubar',
    await p.locator('#arrange-bar').isVisible() && await p.locator('.menubar').isHidden());
  check('Arrange mode shows the pegboard (its cells, not a jiggle)',
    await p.evaluate(() => {
      const peg = document.querySelector('.pegboard');
      return !!peg && getComputedStyle(peg).display === 'block' && peg.offsetHeight > 100;
    }));
  check('Arrange mode unlocks the icons (touch-action: none)',
    (await p.evaluate(() => getComputedStyle(document.querySelector('.icon')).touchAction)) === 'none');
  check('UNLOCKED: now the icon DOES preventDefault the touch — it owns the gesture',
    (await tapIcon()) === true);

  // ---- 5. unlocked, a touch drag really moves the icon ----
  const grid = await p.evaluate(() => {
    const s = document.getElementById('desktop');
    const r = s.getBoundingClientRect();
    return { pitch: parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10),
             row: parseInt(getComputedStyle(s).getPropertyValue('--row'), 10), left: r.left, top: r.top };
  });
  const src = await iconInfo(p, APP);
  const destX = grid.left + 12 + 1 * grid.pitch + grid.pitch / 2;
  const destY = grid.top + 12 + 4 * grid.row + grid.row / 2;   // a deep, empty row
  await touchDrag(cdp, { x: src.cx, y: src.cy }, { x: destX, y: destY });
  const movedTo = await iconInfo(p, APP);
  check('UNLOCKED: a touch drag moves the icon', movedTo.top !== src.top || movedTo.left !== src.left);
  check('UNLOCKED: it snapped onto a grid cell', (movedTo.top - 12) % grid.row === 0 && (movedTo.left - 12) % grid.pitch === 0);

  // ---- 6. Done re-locks ----
  await p.locator('#arrange-done').click();
  await sleep(250);
  check('Done leaves Arrange mode', !(await p.evaluate(() => document.getElementById('desktop').classList.contains('arranging'))));
  check('Done re-locks the icons',
    (await p.evaluate(() => getComputedStyle(document.querySelector('.icon')).touchAction)) !== 'none');
  check('Done brings the menubar back',
    await p.locator('.menubar').isVisible() && await p.locator('#arrange-bar').isHidden());

  // A lock that survives a reload is the whole point — nothing persists it ON.
  await p.reload();
  await p.waitForSelector('.icon', { timeout: 15000 });
  await sleep(500);
  check('a reload comes back LOCKED (the lock is the default, never a saved mode)',
    !(await p.evaluate(() => document.getElementById('desktop').classList.contains('arranging'))));
  await ctx.close();

  // ================= LAPTOP (mouse) =================
  // Locking is TOUCH-only: click-drag is the desktop metaphor and accidental
  // mouse drags are not a thing. e2e-icon-rotate depends on this too.
  const mctx = await b.newContext({ viewport: { width: 1100, height: 800 } });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await mp.goto(BASE + '/index.html');
  await mp.waitForSelector('.icon', { timeout: 15000 });
  await sleep(700);

  const mNames = await mp.evaluate(() => [...document.querySelectorAll('.icon')]
    .map((e) => ((e.querySelector('.label') || e).textContent || '').trim()));
  const MAPP = mNames.find((n) => /\.gif$/i.test(n)) || mNames[1];
  const MFOLDER = await mp.evaluate(async () => {
    const its = await GifOS.store.allItems();
    const f = its.find((i) => i.kind === 'folder' && !i.parent && i.id !== 'sys_trash');
    return f ? f.name : null;
  });

  const mGrid = await mp.evaluate(() => {
    const s = document.getElementById('desktop');
    const r = s.getBoundingClientRect();
    return { pitch: parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10),
             row: parseInt(getComputedStyle(s).getPropertyValue('--row'), 10), left: r.left, top: r.top };
  });
  const mSrc = await iconInfo(mp, MAPP);
  await mp.mouse.move(mSrc.cx, mSrc.cy);
  await mp.mouse.down();
  await mp.mouse.move(mGrid.left + 12 + 2 * mGrid.pitch + 20, mGrid.top + 12 + 5 * mGrid.row + 20, { steps: 14 });
  await mp.mouse.up();
  await sleep(350);
  const mMoved = await iconInfo(mp, MAPP);
  check('MOUSE: click-drag still moves an icon with no mode at all',
    mMoved && (mMoved.top !== mSrc.top || mMoved.left !== mSrc.left));

  // ---- 8. undo toast: the answer to "it vanished and I don't know where" ----
  const mHome = await mp.evaluate(async (n) => {
    const it = (await GifOS.store.allItems()).find((i) => i.name === n);
    return { parent: it.parent || null, x: it.x, y: it.y };
  }, MAPP);
  const mFolder = await iconInfo(mp, MFOLDER);
  const from = await iconInfo(mp, MAPP);
  await mp.mouse.move(from.cx, from.cy);
  await mp.mouse.down();
  await mp.mouse.move(mFolder.cx, mFolder.cy, { steps: 14 });
  await mp.mouse.up();
  await sleep(400);
  check('a drop into a folder really does re-parent it', (await parentOf(mp, MAPP)) !== mHome.parent);
  check('...and a toast says WHICH folder ate it',
    await mp.locator('.toast').isVisible() &&
    (await mp.locator('.toast .toast-msg').textContent()).includes(MFOLDER));
  await mp.locator('.toast button', { hasText: 'Undo' }).click();
  await sleep(500);
  const restored = await mp.evaluate(async (n) => {
    const it = (await GifOS.store.allItems()).find((i) => i.name === n);
    return { parent: it.parent || null, x: it.x, y: it.y };
  }, MAPP);
  check('Undo puts it back in the same folder AND the same cell',
    restored.parent === mHome.parent && restored.x === mHome.x && restored.y === mHome.y);
  check('Undo dismisses the toast', await mp.locator('.toast').isHidden());
  check('the icon is visible on the Home Screen again', !!(await iconInfo(mp, MAPP)));

  await mctx.close();
  await b.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
