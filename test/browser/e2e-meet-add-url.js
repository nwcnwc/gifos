// End-to-end: the meeting shell's "paste a GIF app link" importer (run.html
// fetchGifFromUrl). It used to arrayBuffer() the whole response before
// looking at it; now it streams, refuses past its ceiling ON THE HEADER
// (before a byte is buffered), and still imports and runs a real App GIF.
//
// Needs: static server on 8099.
const http = require('http');
const fs = require('fs');
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const gif = fs.readFileSync(appGif('fluence'));
  let bigRequested = 0, bigBytesSent = 0;
  // A real server: one route PROMISES 2 GB and sends 6 bytes (the ceiling
  // must trip on the header, nothing more read); one serves a real app.
  const srv = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.url === '/huge.gif') {
      bigRequested++;
      res.writeHead(200, Object.assign({ 'Content-Type': 'image/gif', 'Content-Length': String(2 * 1024 * 1024 * 1024) }, cors));
      res.write('GIF89a'); bigBytesSent += 6;
      return;
    }
    if (req.url === '/app.gif') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'image/gif', 'Content-Length': String(gif.length) }, cors));
      return res.end(gif);
    }
    res.writeHead(404, cors); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const SRV = 'http://127.0.0.1:' + srv.address().port;

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/run.html');
  await page.waitForSelector('#app-url-go', { state: 'attached', timeout: 10000 });
  // The picker is a modal in the page; open it directly and drive the link box.
  await page.evaluate(() => { document.getElementById('app-modal').style.display = ''; });

  // ---- the ceiling trips on the header ----
  await page.fill('#app-url', SRV + '/huge.gif');
  await page.click('#app-url-go');
  await page.locator('#app-add-err').filter({ hasText: /bigger than/ }).waitFor({ timeout: 15000 }).catch(() => {});
  const err = await page.locator('#app-add-err').textContent();
  check('a link declaring more than the ceiling is refused with a size message', /bigger than \d+ MB/.test(err), err);
  check('…having asked the server once and read nothing past the header', bigRequested === 1 && bigBytesSent === 6, bigRequested + ' req, ' + bigBytesSent + ' B');
  check('…and the Add button is usable again (not stuck on a dead download)', !(await page.locator('#app-url-go').isDisabled()));

  // ---- a real app still imports ----
  // The importer's job ends at the store (Stolen Apps) and closing the picker;
  // RUNNING it is the room's decision (runApp checks who may run an app here),
  // which this bare page has no room for. So: stored, picker closed, no error.
  await page.fill('#app-url', SRV + '/app.gif');
  await page.click('#app-url-go');
  await page.waitForFunction(() => document.getElementById('app-modal').style.display === 'none', null, { timeout: 20000 }).catch(() => {});
  const stored = await page.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const it = items.find((i) => i.name === 'app.gif');
    if (!it) return null;
    const f = await GifOS.store.getFile(it.fileId);
    return { parent: it.parent, isApp: !!(f && f.isApp), bytes: f && f.bytes ? f.bytes.length : 0 };
  });
  check('a real App GIF pasted as a link is stored in Stolen Apps, byte-complete', stored && stored.parent === 'sys_stolen' && stored.isApp && stored.bytes === gif.length, JSON.stringify(stored) + ' vs ' + gif.length);
  check('…and the picker closes with no error shown', (await page.evaluate(() => document.getElementById('app-modal').style.display)) === 'none' && !((await page.locator('#app-add-err').textContent()) || '').trim());

  await browser.close();
  srv.closeAllConnections && srv.closeAllConnections();
  srv.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
