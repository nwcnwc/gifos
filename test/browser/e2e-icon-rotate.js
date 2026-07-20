// Icon drag math survives a landscape→portrait rotation. The desktop scrolls
// both axes, so an icon can sit past the (now narrow) viewport's right edge.
// Regression: the grid snap used to CLAMP columns to the viewport width, so
// after rotating, dragging an icon collapsed it onto the last visible column —
// "snaps to random spots". Now columns are unbounded (like rows), so an icon
// snaps to the cell where you actually drop it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) failures++; };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  // Build the desktop in LANDSCAPE (wide) so the grid pitch is the wide one and
  // apps spread across many columns.
  await p.setViewportSize({ width: 1200, height: 700 });
  await p.goto(BASE + '/index.html');
  await p.waitForSelector('.icon', { timeout: 12000 });

  // Rotate to PORTRAIT (narrow) WITHOUT reloading — pitch stays wide, the
  // viewport now shows only a few columns; the rest live off-screen (scrollable).
  await p.setViewportSize({ width: 400, height: 800 });
  await p.evaluate(() => { const s = document.getElementById('desktop'); s.scrollLeft = 0; s.scrollTop = 0; });
  await p.waitForTimeout(150);

  const geo = await p.evaluate(() => {
    const s = document.getElementById('desktop');
    const r = s.getBoundingClientRect();
    return { pitch: parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10) || 104,
             row: parseInt(getComputedStyle(s).getPropertyValue('--row'), 10) || 104,
             left: r.left, top: r.top, cols: Math.floor((s.clientWidth - 20) / (parseInt(getComputedStyle(s).getPropertyValue('--cell'), 10) || 104)) };
  });
  check('portrait shows only a few columns (the far ones are off-screen)', geo.cols <= 3);

  // Drag the first icon to a FAR column (col 3 — just past the visible width) at a
  // deep, empty row. Content coords → client coords (scroll is 0).
  const origin = 12, targetCol = 3, targetRow = 6;
  const contentX = origin + targetCol * geo.pitch;   // 324 @ pitch 104
  const contentY = origin + targetRow * geo.row;
  const clientX = geo.left + contentX;
  const clientY = geo.top + contentY;

  // Grab a fully-visible icon near the left edge (some icons are off-screen right
  // after the rotation; dragging one of those would be meaningless).
  const src = await p.evaluate(() => {
    const vis = [...document.querySelectorAll('.icon')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
    }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const el = vis[0]; const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, label: ((el.querySelector('.name') || el).textContent || '').trim() };
  });
  const label = src.label;
  await p.mouse.move(src.cx, src.cy);
  await p.mouse.down();
  await p.mouse.move(clientX, clientY, { steps: 16 });
  await p.mouse.up();
  await p.waitForTimeout(300);

  const finalLeft = await p.evaluate((lbl) => {
    const el = [...document.querySelectorAll('.icon')].find((e) => (((e.querySelector('.name') || e).textContent || '').trim() === lbl));
    return el ? parseInt(el.style.left, 10) : null;
  }, label);
  const landedCol = finalLeft == null ? -1 : Math.round((finalLeft - origin) / geo.pitch);
  console.log('   dropped at col ' + targetCol + ' (x=' + contentX + '); icon landed at x=' + finalLeft + ' → col ' + landedCol);
  check('the icon snaps to the column it was dropped in (not clamped to the viewport)', landedCol === targetCol);
  check('the icon actually moved out past the visible columns', finalLeft != null && finalLeft > origin + (geo.cols - 1) * geo.pitch);

  await b.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
