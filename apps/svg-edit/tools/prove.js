/*
 * Boot the packed SVG-Edit GIF in the real GifOS sandbox, draw a rectangle
 * with #tool_rect, prove gifos.db('doc') round-trips the SVG, and photograph
 * the live window (app frame only — no run.html toolbar).
 *
 *   python3 -m http.server 8099 -d site
 *   node apps/svg-edit/build.mjs
 *   node apps/svg-edit/tools/prove.js
 */
const { findChrome } = require('../../../test/lib/pw');
const { readFileSync } = require('fs');
const path = require('path');
const pwDir = process.env.PLAYWRIGHT_DIR;
if (!pwDir) throw new Error('set PLAYWRIGHT_DIR to a playwright install');
const { chromium } = require(pwDir);
const CHROME = findChrome();

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, '..', 'screenshot.png');
const GIF = path.join(__dirname, '..', '..', '..', 'site', 'apps', 'svg-edit', 'svg-edit.gif');
const GIF_B64 = readFileSync(GIF).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg, extra) {
  console.error('FAIL ' + msg + (extra ? '\n' + extra : ''));
  process.exitCode = 1;
}

async function appFrame(page) {
  const handle = await page.waitForSelector('#appmount iframe', { timeout: 60000 });
  const frame = await handle.contentFrame();
  if (!frame) throw new Error('app iframe has no contentFrame');
  return frame;
}

async function waitEditor(frame) {
  await frame.waitForFunction(() => {
    const st = document.getElementById('g-status');
    const status = st && st.textContent || '';
    if (/Failed to construct 'URL'|Invalid URL/i.test(status)) throw new Error(status);
    return !!(window.svgEditor && document.getElementById('tool_rect') && document.getElementById('svgcontent'));
  }, null, { timeout: 30000 });
}

async function clickRectTool(frame) {
  // #tool_rect lives inside se-flyingbutton and is often not "visible" to Playwright.
  await frame.evaluate(() => {
    const el = document.getElementById('tool_rect') || document.getElementById('tools_rect');
    if (!el) throw new Error('no #tool_rect');
    el.click();
  });
  await sleep(150);
  const mode = await frame.evaluate(() => {
    try { return window.svgEditor.svgCanvas.getMode(); } catch (e) { return String(e); }
  });
  if (mode === 'rect') return;
  await frame.locator('#tools_rect').click({ timeout: 8000, force: true }).catch(() => {});
  await frame.evaluate(() => {
    if (window.svgEditor && window.svgEditor.leftPanel && window.svgEditor.leftPanel.clickRect) {
      window.svgEditor.leftPanel.clickRect();
    }
  });
  const mode2 = await frame.evaluate(() => window.svgEditor.svgCanvas.getMode());
  if (mode2 !== 'rect') throw new Error('#tool_rect did not enter rect mode (' + mode2 + ')');
}

async function dragOnWorkarea(page, frame, a, b) {
  const box = await frame.locator('#workarea').boundingBox();
  if (!box) throw new Error('#workarea has no box');
  const x0 = box.x + Math.min(a[0], box.width * a[2]);
  const y0 = box.y + Math.min(a[1], box.height * a[3]);
  const x1 = box.x + Math.min(b[0], box.width * b[2]);
  const y1 = box.y + Math.min(b[1], box.height * b[3]);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 12 });
  await page.mouse.up();
  await sleep(250);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
  });
  const pageErrors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.GifOS && GifOS.store && GifOS.store.putFile, null, { timeout: 60000 });

    const fid = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({
        id: fid, name: 'svg-edit.gif', bytes, kind: 'gif', isApp: true,
        appId: 'svg-edit', mime: 'image/gif'
      });
      await GifOS.store.putItem({
        id: GifOS.store.uid('item'), kind: 'file', fileId: fid,
        name: 'SVG-Edit.gif', parent: null, x: 200, y: 200, iconSize: 64
      });
      return fid;
    }, GIF_B64);

    await page.goto(BASE + '/run.html#id=' + fid, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let frame = await appFrame(page);
    await waitEditor(frame);

    const boot = await frame.evaluate(() => ({
      baseURI: document.baseURI,
      status: (document.getElementById('g-status') || {}).textContent || '',
      hasEditor: typeof window.Editor === 'function',
      hasSvgEditor: !!(window.svgEditor && window.svgEditor.svgCanvas),
      toolRect: !!document.getElementById('tool_rect'),
      workarea: !!document.getElementById('workarea'),
      svgcontent: !!document.getElementById('svgcontent')
    }));
    console.log('boot', JSON.stringify(boot));
    if (boot.baseURI !== 'about:srcdoc') fail('sandbox is not about:srcdoc', boot.baseURI);
    if (!boot.hasSvgEditor || !boot.toolRect || !boot.svgcontent) {
      fail('editor did not mount', JSON.stringify(boot));
      return;
    }

    console.log('click #tool_rect');
    await clickRectTool(frame);
    console.log('drag rect');
    await dragOnWorkarea(page, frame, [220, 160, 0.28, 0.32], [520, 380, 0.62, 0.62]);

    const drawn = await frame.evaluate(() => {
      const svgEl = document.getElementById('svgcontent');
      const rects = svgEl ? svgEl.querySelectorAll('rect') : [];
      const real = [];
      for (let i = 0; i < rects.length; i++) {
        const id = rects[i].id || '';
        if (id === 'canvasBackground' || id === 'selectorRubberBand') continue;
        if ((rects[i].getAttribute('width') || '0') === '0') continue;
        real.push({ id: id, w: rects[i].getAttribute('width'), h: rects[i].getAttribute('height') });
      }
      let str = '';
      try { str = window.svgEditor.svgCanvas.getSvgString() || ''; } catch (e) {}
      return { count: real.length, rects: real, svg: str, hasRect: /<rect[\s>]/i.test(str) };
    });
    console.log('drawn', JSON.stringify({ count: drawn.count, rects: drawn.rects, hasRect: drawn.hasRect, len: drawn.svg.length }));
    if (!drawn.hasRect || drawn.count < 1) {
      fail('drawing with #tool_rect produced no <rect>', drawn.svg.slice(0, 400));
      return;
    }

    await frame.evaluate(() => {
      const el = document.getElementById('tool_ellipse') || document.getElementById('tools_ellipse');
      if (el) el.click();
      else if (window.svgEditor && window.svgEditor.leftPanel && window.svgEditor.leftPanel.clickEllipse) {
        window.svgEditor.leftPanel.clickEllipse();
      }
    });
    await sleep(120);
    await dragOnWorkarea(page, frame, [540, 140, 0.58, 0.22], [760, 300, 0.78, 0.48]);
    await frame.evaluate(() => {
      if (window.svgEditor && window.svgEditor.leftPanel && window.svgEditor.leftPanel.clickSelect) {
        window.svgEditor.leftPanel.clickSelect();
      }
    });
    await sleep(300);

    const iframe = page.locator('#appmount iframe');
    const ibox = await iframe.boundingBox();
    if (!ibox) throw new Error('iframe has no box');
    await page.screenshot({
      path: OUT,
      type: 'png',
      clip: { x: ibox.x, y: ibox.y, width: Math.floor(ibox.width), height: Math.floor(ibox.height) }
    });
    console.log('wrote ' + path.relative(process.cwd(), OUT) + ' ' + Math.round(ibox.width) + 'x' + Math.round(ibox.height));

    let saved = null;
    for (let i = 0; i < 24; i++) {
      saved = await frame.evaluate(async () => {
        try {
          const row = await gifos.db('doc').get('drawing');
          return row && { id: row.id, rev: row.rev, by: row.by, len: (row.svg || '').length, hasRect: /<rect[\s>]/i.test(row.svg || '') };
        } catch (e) { return null; }
      });
      if (saved && saved.hasRect) break;
      await sleep(250);
    }
    console.log('db after draw', JSON.stringify(saved));
    if (!saved || !saved.hasRect) {
      fail('gifos.db(doc) did not store the rect');
      return;
    }

    const probe = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><ellipse id="probe-ellipse" cx="400" cy="300" rx="120" ry="80" fill="#2896aa"/></svg>';
    await frame.evaluate(async (svg) => {
      await gifos.db('doc').put({ id: 'drawing', svg: svg, rev: Date.now(), by: 'prove' });
    }, probe);
    await frame.waitForFunction(() => !!document.querySelector('#svgcontent #probe-ellipse, #svgcontent ellipse'), null, { timeout: 8000 });
    const applied = await frame.evaluate(() => {
      let str = '';
      try { str = window.svgEditor.svgCanvas.getSvgString() || ''; } catch (e) {}
      return {
        hasProbe: !!document.querySelector('#probe-ellipse'),
        hasEllipse: /<ellipse[\s>]/i.test(str)
      };
    });
    console.log('db put applied', JSON.stringify(applied));
    if (!applied.hasEllipse) {
      fail('gifos.db(doc) put did not apply to the canvas');
      return;
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    frame = await appFrame(page);
    await waitEditor(frame);
    await frame.waitForFunction(() => {
      const svg = document.getElementById('svgcontent');
      return !!(svg && (svg.querySelector('#probe-ellipse') || svg.querySelector('ellipse')));
    }, null, { timeout: 15000 });
    const reloaded = await frame.evaluate(async () => {
      const row = await gifos.db('doc').get('drawing');
      let str = '';
      try { str = window.svgEditor.svgCanvas.getSvgString() || ''; } catch (e) {}
      return {
        dbHasEllipse: !!(row && /<ellipse[\s>]/i.test(row.svg || '')),
        canvasHasEllipse: /<ellipse[\s>]/i.test(str)
      };
    });
    console.log('reload', JSON.stringify(reloaded));
    if (!reloaded.dbHasEllipse || !reloaded.canvasHasEllipse) {
      fail('reload did not restore gifos.db(doc) SVG onto the canvas', JSON.stringify(reloaded));
      return;
    }

    if (pageErrors.length) {
      console.log('page errors (' + pageErrors.length + '):');
      pageErrors.slice(0, 12).forEach((e) => console.log('  ' + e));
    }
    if (process.exitCode) return;
    console.log('PASS editor booted on about:srcdoc, #tool_rect drew a rect, gifos.db(doc) round-tripped');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
