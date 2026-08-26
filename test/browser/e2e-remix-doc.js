// End-to-end: an app you build in GifOS carries the build guide inside it.
//
// The packer copies site/llms.txt into every app GIF it makes (gifos-gif.js,
// "remix doc"), so whoever unpacks one already holds the packing recipe, the
// manifest reference and the window.gifos API. test/unit/remix-doc.js pins the
// codec rules; THIS pins the half that only exists in a browser and would fail
// silently — by design the packer never errors over a missing doc, so a renamed
// file, a bad path or a service worker that forgot to cache it would ship apps
// with nothing inside and no red anywhere.
//
// Drives the real ＋ Add builder, then reads the stored bytes back out.
//
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  const docReqs = [];
  page.on('request', (r) => { if (/\/llms\.txt(\?|$)/.test(r.url())) docReqs.push(r.url()); });

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  const buildApp = async (name, html) => {
    await page.locator('#add-btn').click();
    await page.locator('.modal.wide').waitFor({ timeout: 5000 });
    await page.locator('#ad-name').fill(name);
    await page.locator('#ad-html').fill(html);
    await page.locator('#ad-create').click();
    await page.locator('.icon', { hasText: name + '.gif' }).waitFor({ timeout: 8000 });
  };

  await buildApp('Remixable', '<!doctype html><meta charset=utf-8><h1>hello</h1>');

  const got = await page.evaluate(async () => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => x.name === 'Remixable.gif');
    const archive = await GifOS.gif.decode(f.bytes);
    const doc = archive.files['llms.txt'];
    const served = await (await fetch('/llms.txt')).text();
    return {
      paths: Object.keys(archive.files).sort(),
      doc: doc ? GifOS.gif.bytesToText(doc) : null,
      served,
      isApp: !!f.isApp,
      bytes: f.bytes.length,
    };
  });

  check('a built app GIF carries llms.txt', got.paths.indexOf('llms.txt') >= 0, got.paths.join(', '));
  check('…and it is the document the site serves, byte for byte', got.doc === got.served,
    got.doc ? got.doc.length + ' vs ' + got.served.length : 'absent');
  check('…the guide is the real thing (recipe + manifest + API)',
    !!got.doc && got.doc.indexOf('GIFOS1.0') >= 0 && got.doc.indexOf('manifest.json') >= 0 && got.doc.indexOf('window.gifos') >= 0);
  check('…and the app is still a real app (index.html, marked isApp)',
    got.isApp && got.paths.indexOf('index.html') >= 0);
  // ~11 KB compressed on top of the app. Named here so a future change that
  // packs something enormous shows up as a number, not a shrug.
  check('the whole app GIF stays small', got.bytes < 200 * 1024, got.bytes + ' bytes');

  const firstFetches = docReqs.length;
  check('the doc was fetched to pack it', firstFetches >= 1, firstFetches + ' request(s)');

  // A second build must reuse it: the packer memoises, so building ten apps is
  // one download, not ten.
  await buildApp('Remixable Two', '<!doctype html><meta charset=utf-8><h1>again</h1>');
  const second = await page.evaluate(async () => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => x.name === 'Remixable Two.gif');
    const archive = await GifOS.gif.decode(f.bytes);
    return !!archive.files['llms.txt'];
  });
  check('a second build packs it too', second);
  check('…without downloading it again', docReqs.length === firstFetches, docReqs.length + ' total request(s)');

  // /llms.txt is precached shell (sw.js CORE) — an app built offline still
  // ships the guide. Assert the list, not the runtime cache, so this stays a
  // cheap check that cannot flake on worker timing.
  const inCore = await page.evaluate(async () => (await (await fetch('/sw.js')).text()).indexOf("'/llms.txt'") >= 0);
  check('the service worker precaches it (offline builds still carry it)', inCore);

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
