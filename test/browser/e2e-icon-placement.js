// An icon that arrives in a container lands on an EMPTY square. Always.
//
// The bug: dropping an app onto a folder set `parent` and nothing else, so the
// icon kept the x/y it had on the screen OUTSIDE the folder. Drop an app that
// happened to be sitting at cell (1,0) into a folder whose first app is at
// (1,0), and the two occupied the same square — one drawn on top of the other.
//
// The fix is structural, and that is what this guards: placement is decided in
// ONE place (saveItem in desktop.js) that every item write goes through, so
// "put an icon somewhere" cannot be spelled out again, differently, at the next
// call site. The invariant below — no two siblings share a cell, ever — is
// checked after every kind of arrival, not just the drag that was reported.
const { chromium, CHROME } = require('../lib/pw');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SITE = path.join(__dirname, '..', '..', 'site');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) failures++; };

// Every sibling's cell, and any square holding more than one of them.
async function layout(page) {
  return page.evaluate(async () => {
    const s = document.getElementById('desktop');
    const pitch = parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10) || 104;
    const rowP = parseInt(getComputedStyle(s).getPropertyValue('--row'), 10) || 104;
    const cell = (it) => Math.max(0, Math.round(((it.x || 12) - 12) / pitch)) + ',' +
                         Math.max(0, Math.round(((it.y || 12) - 12) / rowP));
    const items = await GifOS.store.allItems();
    const byParent = {};
    for (const it of items) {
      const p = it.parent || '__root__';
      (byParent[p] = byParent[p] || []).push({ id: it.id, name: it.name, cell: cell(it) });
    }
    const clashes = [];
    for (const p of Object.keys(byParent)) {
      const seen = {};
      for (const e of byParent[p]) {
        if (seen[e.cell]) clashes.push(p + ' :: cell ' + e.cell + ' :: ' + seen[e.cell] + ' + ' + e.name);
        seen[e.cell] = e.name;
      }
      // Inside a folder the corner cell is the up-hole back to the parent —
      // it is not a square an icon may be filed onto.
      if (p !== '__root__') {
        for (const e of byParent[p]) if (e.cell === '0,0') clashes.push(p + ' :: ' + e.name + ' sits ON the up-hole');
      }
    }
    return { byParent, clashes };
  });
}
async function cellOfItem(page, name) {
  return page.evaluate(async (n) => {
    const s = document.getElementById('desktop');
    const pitch = parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10) || 104;
    const rowP = parseInt(getComputedStyle(s).getPropertyValue('--row'), 10) || 104;
    const it = (await GifOS.store.allItems()).find((i) => i.name === n);
    if (!it) return null;
    return { parent: it.parent || null, x: it.x, y: it.y,
             cell: Math.max(0, Math.round(((it.x || 12) - 12) / pitch)) + ',' +
                   Math.max(0, Math.round(((it.y || 12) - 12) / rowP)) };
  }, name);
}
async function iconBox(page, name) {
  return page.evaluate((n) => {
    const el = [...document.querySelectorAll('.icon')].find((e) =>
      ((e.querySelector('.label') || e).textContent || '').trim() === n);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, name);
}
async function dragOnto(page, srcName, dstName) {
  const a = await iconBox(page, srcName), b = await iconBox(page, dstName);
  if (!a || !b) throw new Error('cannot drag ' + srcName + ' onto ' + dstName + ' — icon missing');
  await page.mouse.move(a.cx, a.cy);
  await page.mouse.down();
  await page.mouse.move(b.cx, b.cy, { steps: 16 });
  await page.mouse.up();
  await sleep(400);
}

(async () => {
  // The structural guarantee, checked at the source: placement lives in ONE
  // function. If a new call site starts writing items directly it will drift
  // back to per-caller placement, which is exactly how this bug happened.
  const js = fs.readFileSync(path.join(SITE, 'js', 'desktop.js'), 'utf8');
  const rawWrites = (js.match(/store\.putItem\(/g) || []).length;
  check('item writes funnel through saveItem — only saveItem + the backup restore call store.putItem directly (' + rawWrites + ')',
    rawWrites === 2);
  const freeCellCalls = (js.match(/nearestFreeCell\(/g) || []).length;
  check('the free-cell search has ONE writer (plus its definition and the drag preview) — ' + freeCellCalls,
    freeCellCalls === 3);

  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await p.goto(BASE + '/index.html');
  await p.waitForSelector('.icon', { timeout: 15000 });
  await sleep(800);

  const start = await layout(p);
  check('the fixture desktop starts with no overlapping icons anywhere', start.clashes.length === 0);
  if (start.clashes.length) console.log('   ', start.clashes.join('\n    '));

  // A folder that already HAS something in it, and a loose app to post into it.
  const fixture = await p.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const folder = items.find((i) => i.kind === 'folder' && !i.parent && i.id !== 'sys_trash' &&
      items.some((k) => k.parent === i.id));
    const occupant = folder ? items.find((k) => k.parent === folder.id) : null;
    const app = items.find((i) => !i.parent && i.kind === 'file' && /\.gif$/i.test(i.name));
    return { folder: folder && folder.name, occupant: occupant && occupant.name, app: app && app.name };
  });
  check('fixture: a non-empty folder and a loose app — ' + JSON.stringify(fixture),
    !!(fixture.folder && fixture.occupant && fixture.app));

  // ---- THE REPORTED CASE ----
  // Park the loose app on the EXACT cell its target folder's occupant uses, so
  // the old "keep the outside x/y" behaviour would drop it right on top.
  const occ = await cellOfItem(p, fixture.occupant);
  await p.evaluate(async ({ name, x, y }) => {
    const it = (await GifOS.store.allItems()).find((i) => i.name === name);
    it.x = x; it.y = y;
    await GifOS.store.putItem(it);
    await GifOS.desktop.load();
    await GifOS.desktop.render();
  }, { name: fixture.app, x: occ.x, y: occ.y });
  await sleep(400);
  const parked = await cellOfItem(p, fixture.app);
  check('set-up: "' + fixture.app + '" is parked on cell ' + occ.cell + ' — the very cell "' +
    fixture.occupant + '" occupies inside "' + fixture.folder + '"', parked.cell === occ.cell);

  await dragOnto(p, fixture.app, fixture.folder);
  const landed = await cellOfItem(p, fixture.app);
  const occNow = await cellOfItem(p, fixture.occupant);
  check('the app really went into the folder', landed.parent === (await p.evaluate(async (n) =>
    (await GifOS.store.allItems()).find((i) => i.name === n).id, fixture.folder)));
  check('it did NOT land on the occupied square (' + landed.cell + ' vs ' + occNow.cell + ')',
    landed.cell !== occNow.cell);
  check('it did not land on the up-hole either', landed.cell !== '0,0');
  let l = await layout(p);
  check('no two icons share a square, anywhere on the desktop', l.clashes.length === 0);
  if (l.clashes.length) console.log('   ', l.clashes.join('\n    '));

  // ---- a BURST of arrivals keeps spreading ----
  // Each drop must see the previous one. This is where an in-memory list that
  // lags the store would silently stack every icon on the same free cell.
  const loose = await p.evaluate(async () => {
    const items = await GifOS.store.allItems();
    return items.filter((i) => !i.parent && i.kind === 'file').map((i) => i.name);
  });
  const target = fixture.folder;
  let posted = 0;
  for (const n of loose.slice(0, 3)) {
    if (!(await iconBox(p, n))) continue;
    await dragOnto(p, n, target);
    posted++;
  }
  check('posted ' + posted + ' more icons into "' + target + '" back to back', posted >= 2);
  l = await layout(p);
  check('after a burst of drops, still no two icons share a square', l.clashes.length === 0);
  if (l.clashes.length) console.log('   ', l.clashes.join('\n    '));

  // ---- the folder's own screen agrees with the store ----
  await p.evaluate((n) => {
    const el = [...document.querySelectorAll('.icon')].find((e) =>
      ((e.querySelector('.label') || e).textContent || '').trim() === n);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }, target);
  await sleep(600);
  const painted = await p.evaluate(() => {
    const pos = [...document.querySelectorAll('.icon')].map((e) => e.style.left + '/' + e.style.top);
    return { n: pos.length, unique: new Set(pos).size };
  });
  check('inside the folder, every painted icon has the square to itself (' +
    painted.unique + '/' + painted.n + ')', painted.n === painted.unique && painted.n > 1);

  // ---- Trash is a folder too ----
  // Make our OWN icons to trash rather than scavenging whatever the burst above
  // left loose: the first version of this scavenged, found nothing, dragged
  // nothing, and passed anyway. A vacuous green is worse than a red.
  await p.evaluate(() => { GifOS.desktop.render(); });
  await p.locator('#crumbs a').click();
  await sleep(400);
  const made = [];
  for (const nm of ['Box A', 'Box B']) {
    // Right-click a square that is genuinely bare, or we get the ICON menu.
    const bare = await p.evaluate(() => {
      const s = document.getElementById('desktop');
      for (let y = 140; y < window.innerHeight - 60; y += 40) {
        for (let x = window.innerWidth - 80; x > 260; x -= 40) {
          if (document.elementFromPoint(x, y) === s) return { x: x - s.getBoundingClientRect().left, y: y - s.getBoundingClientRect().top };
        }
      }
      return null;
    });
    await p.locator('#desktop').click({ button: 'right', position: bare });
    await p.locator('.ctx button', { hasText: 'New Folder' }).click();
    // A new folder opens its rename box. This is asserted, not assumed: it used
    // to fire beginRename before render() had painted the icon, so the box
    // never appeared — silently, because beginRename just returns when the node
    // is missing. Nothing else in the suite covers folder creation.
    await p.locator('.icon .label input').waitFor({ timeout: 8000 }).catch(() => {});
    check('a new folder opens its rename box (' + nm + ')',
      (await p.locator('.icon .label input').count()) === 1);
    await p.locator('.icon .label input').fill(nm);
    await p.keyboard.press('Enter');
    await sleep(400);
    made.push(nm);
  }
  check('made two throwaway folders to trash — ' + made.join(', '),
    (await iconBox(p, 'Box A')) && (await iconBox(p, 'Box B')));
  for (const n of made) await dragOnto(p, n, 'Trash');
  const inTrash = await p.evaluate(async () =>
    (await GifOS.store.allItems()).filter((i) => i.parent === 'sys_trash').map((i) => i.name));
  check('both really landed in Trash — ' + inTrash.join(', '),
    inTrash.includes('Box A') && inTrash.includes('Box B'));
  l = await layout(p);
  check('icons dragged to Trash stack up neatly too, not on one square', l.clashes.length === 0);
  if (l.clashes.length) console.log('   ', l.clashes.join('\n    '));

  // ---- "Put back" must not drop an icon back ON someone ----
  // The cell it came from can easily be taken by the time you put it back.
  await p.locator('.icon', { hasText: 'Trash' }).dblclick();
  await sleep(600);
  await p.locator('.icon', { hasText: 'Box A' }).click({ button: 'right' });
  await p.locator('.ctx button', { hasText: 'Put back' }).click();
  await sleep(700);
  const restoredBox = await cellOfItem(p, 'Box A');
  check('"Put back on Home Screen" really moved it home', restoredBox && restoredBox.parent === null);
  l = await layout(p);
  check('"Put back on Home Screen" lands on a free square', l.clashes.length === 0);
  if (l.clashes.length) console.log('   ', l.clashes.join('\n    '));

  await b.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
