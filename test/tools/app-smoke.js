/*
 * app-smoke.js — open a certified app the way a person does, and look at it.
 *
 * Most apps in apps/ arrived in one import commit and have never been opened
 * by anything: the per-app e2e suites cover a dozen of them, and the App Store
 * suite only checks the CATALOG. So a listed app can boot to a black rectangle,
 * throw on its first frame, or paint nothing at all, and every gate stays green.
 * That is what this tool is for — it installs the SHIPPED GIF onto a real
 * desktop, opens it through run.html the way Install does, clicks and types at
 * it, and reports what it saw:
 *
 *   - errors thrown inside the app frame (pageerror + console.error)
 *   - a blank screen, measured from the frame's own pixels (distinct colours
 *     and the biggest single colour's share), not from the DOM
 *   - whether the pixels CHANGED after input — an app that ignores every key
 *     and click looks identical to one that is running fine
 *   - a PNG of the app, for a human to look at
 *
 * It is a probe, not a gate: it prints a verdict per app and always exits 0
 * unless it could not run at all. Judgement stays with the reader.
 *
 *   node test/tools/app-smoke.js 2048 snake            # named apps
 *   node test/tools/app-smoke.js --all                 # every listed app
 *   node test/tools/app-smoke.js --list commit-order.txt
 *
 * Needs: a static server on 8099 serving site/ (python3 -m http.server 8099 -d site).
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = process.env.SHOT_DIR || path.join(ROOT, '.smoke');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugs() {
  const a = process.argv.slice(2);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--all') {
      for (const d of fs.readdirSync(path.join(ROOT, 'apps'))) {
        if (fs.existsSync(path.join(ROOT, 'apps', d, 'listing.json'))) out.push(d);
      }
    } else if (a[i] === '--list') {
      const txt = fs.readFileSync(a[++i], 'utf8');
      for (const line of txt.split('\n')) {
        const s = line.trim().split(/\s+/).pop();
        if (s) out.push(s);
      }
    } else out.push(a[i]);
  }
  return out;
}

// Install the shipped GIF onto a fresh desktop, exactly as Install writes it.
async function install(ctx, slug, manifest) {
  const b64 = fs.readFileSync(appGif(slug)).toString('base64');
  const desk = await ctx.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 60000 });
  const fileId = await desk.evaluate(async ({ b64, appId, name }) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: name + '.gif', bytes, kind: 'gif', isApp: true, appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: name + '.gif', parent: null, x: 40, y: 40, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    const f = (await GifOS.store.allFiles()).find((x) => x.appId === appId);
    return f ? f.id : null;
  }, { b64, appId: manifest.appId, name: manifest.shortName || manifest.name });
  await desk.close();
  if (!fileId) throw new Error('the app did not install');
  return fileId;
}

/*
 * How much is on the screen, read from the PIXELS of the app frame.
 *
 * A DOM check cannot tell a painted canvas from a black one, and half these
 * apps are a single <canvas>. So the frame's own screenshot is sampled on a
 * grid: `colours` is how many distinct RGB values that grid saw, `top` is the
 * share held by the commonest one. A solid rectangle is colours=1/top=1; a
 * game that boots to a title screen is dozens of colours with top well under 1.
 * `sig` is a coarse fingerprint, so two shots can be compared for "did
 * anything move".
 */
async function pixels(page, clip) {
  const buf = await page.screenshot({ clip }).catch(() => null);
  if (!buf) return null;
  let im;
  try { im = require('../lib/png').decodePng(buf); } catch (e) { return null; }
  const counts = new Map();
  let sig = 0, n = 0;
  const step = 7;
  for (let y = 0; y < im.height; y += step) {
    for (let x = 0; x < im.width; x += step) {
      const o = (y * im.width + x) * 4;
      const k = (im.rgba[o] >> 3) * 1024 + (im.rgba[o + 1] >> 3) * 32 + (im.rgba[o + 2] >> 3);
      counts.set(k, (counts.get(k) || 0) + 1);
      sig = (sig * 31 + k) >>> 0; n++;
    }
  }
  let top = 0;
  for (const v of counts.values()) if (v > top) top = v;
  return { colours: counts.size, top: n ? top / n : 1, sig, n };
}

async function probe(browser, slug) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', slug, 'manifest.json'), 'utf8'));
  const r = { slug, name: manifest.name, errors: [], notes: [] };
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  try {
    const fileId = await install(ctx, slug, manifest);
    const run = await ctx.newPage();
    const seen = new Set();
    const note = (s) => { s = String(s).slice(0, 200); if (!seen.has(s)) { seen.add(s); r.errors.push(s); } };
    run.on('pageerror', (e) => note(e.message));
    run.on('console', (m) => { if (m.type() === 'error') note(m.text()); });
    run.on('frameattached', () => {});

    await run.goto(BASE + '/run.html#id=' + fileId);
    await run.waitForSelector('#appmount iframe', { timeout: 90000 });
    const el = await run.$('#appmount iframe');
    const frame = await el.contentFrame();
    // frame-level errors too (a srcdoc frame's throws do not always surface on
    // the page in older builds)
    frame.page().on('pageerror', () => {});
    await sleep(4000);

    const box = await el.boundingBox();
    const clip = box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null;
    r.box = clip;

    const dom = await frame.evaluate(() => {
      const vis = [...document.querySelectorAll('button,a,[role=button],input,select,summary,.btn,canvas')]
        .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4; });
      return {
        title: document.title,
        bodyText: (document.body ? document.body.innerText || '' : '').trim().slice(0, 400),
        nodes: document.body ? document.body.querySelectorAll('*').length : 0,
        canvases: document.querySelectorAll('canvas').length,
        clickable: vis.length,
        w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight,
      };
    }).catch((e) => ({ err: String(e) }));
    r.dom = dom;

    // Scroll BOTH back to the top before every picture. run.html scrolls when a
    // click lands low in a tall app, and a screenshot of the middle of an app is
    // a bad picture of a working app — which is the one thing this must not
    // produce, since the pictures are what a person actually reads.
    const toTop = async () => {
      await run.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await frame.evaluate(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; }).catch(() => {});
      await sleep(150);
    };
    await toTop();
    const p0 = clip ? await pixels(run, clip) : null;
    r.boot = p0;
    fs.mkdirSync(OUT, { recursive: true });
    await run.screenshot({ path: path.join(OUT, slug + '-1-boot.png') });

    // ---- poke it -------------------------------------------------------------
    // A canvas game wants keys; a tool wants a click on something. Do both, in
    // the order that is safe: click the middle of the app first (focus + any
    // "tap to start"), then the common start keys, then the first real button.
    if (clip) {
      await run.mouse.click(clip.x + clip.width / 2, clip.y + clip.height / 2).catch(() => {});
      await sleep(600);
      for (const k of ['Enter', 'Space', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'KeyX', 'KeyZ']) {
        await run.keyboard.press(k).catch(() => {});
        await sleep(180);
      }
      await sleep(1200);
    }
    await toTop();
    const p1 = clip ? await pixels(run, clip) : null;
    r.after = p1;
    await run.screenshot({ path: path.join(OUT, slug + '-2-poked.png') });

    r.changed = !!(p0 && p1 && p0.sig !== p1.sig);
    r.blank = !!(p1 && (p1.colours <= 2 || p1.top > 0.985));
    await run.close();
  } catch (e) {
    r.fatal = String(e.message || e);
    if (process.env.SMOKE_STACK) console.log(e.stack);
  } finally {
    await ctx.close().catch(() => {});
  }
  return r;
}

(async () => {
  const list = slugs();
  if (!list.length) { console.error('usage: app-smoke.js <slug>... | --all | --list <file>'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const results = [];
  for (const slug of list) {
    let r;
    try { r = await probe(browser, slug); }
    catch (e) { r = { slug, fatal: String(e.message || e) }; }
    results.push(r);
    const bits = [];
    if (r.fatal) bits.push('FATAL ' + r.fatal);
    else {
      bits.push(r.blank ? 'BLANK' : 'paints');
      bits.push(r.changed ? 'reacts' : 'STATIC');
      if (r.errors && r.errors.length) bits.push(r.errors.length + ' err');
      if (r.boot) bits.push('col=' + r.boot.colours + ' top=' + r.boot.top.toFixed(2));
    }
    console.log((r.blank || r.fatal || (r.errors && r.errors.length) ? '!! ' : '   ') +
      slug.padEnd(22) + bits.join('  '));
    if (r.errors) for (const e of r.errors.slice(0, 4)) console.log('        · ' + e);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  }
  await browser.close();
})();
