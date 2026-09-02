/*
 * THE DOCUMENT UNDER THE BRIDGE MAY NEVER CHANGE.
 *
 * An app runs as a sandboxed srcdoc frame. The sandbox forbids navigating
 * OTHER browsing contexts, not itself, and CSP has no self-navigation
 * directive — so `location.replace('https://…')`, a `<meta refresh>` or a plain
 * `<a href>` used to load a stranger's page INSIDE the app's frame. That page
 * carried no injected CSP and no shim (fetch, WebSocket, WebRTC all back), and
 * it kept the OS bridge, because `iframe.contentWindow` is the same WindowProxy
 * across navigations. A GIF with no capabilities at all had the internet.
 *
 * Three layers now hold (site/run.html, site/js/runtime.js clientShim + mountApp):
 *   1. run.html carries `frame-src about:` — the browser refuses every
 *      non-about: navigation of the app frame before any script runs.
 *   2. The shim beacons `unloading` on pagehide — the runtime freezes the
 *      bridge BEFORE the replacement document exists, then re-mounts the app
 *      from its own bytes (a reload therefore still works: it boots again).
 *   3. An app that keeps leaving is stopped after a few remounts.
 * And a fourth, related: a NESTED srcdoc frame is a fresh window with its own
 * RTCPeerConnection (frame-src 'none' does not reach about:srcdoc children),
 * so the shim removes any nested frame before it can load.
 *
 * Needs: the static site on 8099 (python3 -m http.server 8099 -d site).
 */
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== undefined && !cond ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every app below counts its own boots through the bridge, so a remount is
// visible from outside: the text it writes carries the boot number.
const BOOT_COUNTER =
  'function boots(){return gifos.db("boots").getAll().then(function(r){return r.length;});}' +
  'function out(t){document.getElementById("out").textContent=t;}' +
  'boots().then(function(n){return gifos.db("boots").put({n:n}).then(function(){return n+1;});}).then(function(n){window.__boot=n;out("boot:"+n);return n;}).then(run).catch(function(e){out("ERR:"+e.message);});';

async function runApp(browser, index, head) {
  const context = await browser.newContext();
  const desk = await context.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');
  await desk.evaluate(async (a) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'navtest', name: 'NavTest', entry: 'index.html' }),
      'index.html': '<!doctype html>' + (a.head || '') + '<div id="out">idle</div><script>' + a.script + '</scr' + 'ipt>',
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'NavTest.gif', bytes, kind: 'gif', isApp: true, appId: 'navtest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'NavTest.gif', parent: null, x: 400, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { script: BOOT_COUNTER + index, head });
  await desk.locator('.icon', { hasText: 'NavTest.gif' }).first().waitFor();
  await sleep(200);
  const [app] = await Promise.all([context.waitForEvent('page'), desk.locator('.icon', { hasText: 'NavTest.gif' }).first().dblclick()]);
  await app.waitForSelector('#appmount iframe');
  await sleep(3000);
  const urls = app.frames().filter((f) => f !== app.mainFrame()).map((f) => f.url());
  let text = '(no frame)';
  // #out is the app's own report; the OS's "stopped" page has no #out, so
  // fall back to the body there.
  try {
    const fl = app.frameLocator('#appmount iframe');
    text = (await fl.locator('#out').count()) ? await fl.locator('#out').textContent({ timeout: 2000 }) : await fl.locator('body').textContent({ timeout: 2000 });
  } catch (e) { text = '(unreadable: ' + e.message.slice(0, 40) + ')'; }
  await context.close();
  return { urls, text: String(text || '').trim() };
}
const leftFrame = (urls) => urls.some((u) => /^https?:/.test(u));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  // 0. Control: an ordinary app boots once and keeps its bridge.
  const c = await runApp(browser, 'function run(n){ gifos.db("t").put({a:1}).then(function(){ out("boot:"+n+" bridge-ok"); }); }');
  check('control: an ordinary app boots once with a working bridge', c.text === 'boot:1 bridge-ok', c.text);

  // 1. location.replace onto an http URL: refused by frame-src, bridge frozen by
  //    the beacon, app re-mounted. The second boot must NOT try again (it would
  //    be stopped after three), so it proves the bridge still works instead.
  const r = await runApp(browser, 'function run(n){ if (n === 1) { location.replace(' + JSON.stringify(BASE + '/404.html') + '); return; } gifos.db("t").put({a:1}).then(function(){ out("boot:"+n+" bridge-ok"); }); }');
  check('location.replace to an http URL never loads in the app frame', !leftFrame(r.urls), r.urls.join(' '));
  check('…and the app is re-mounted from its own bytes, bridge intact', r.text === 'boot:2 bridge-ok', r.text);

  // 2. A <meta refresh> that fires on EVERY boot: refused each time, and the
  //    runtime gives up on the app after a few remounts rather than looping.
  const m = await runApp(browser, 'function run(n){}', '<meta http-equiv="refresh" content="0;url=' + BASE + '/about.html">');
  check('meta refresh to an http URL never loads in the app frame', !leftFrame(m.urls), m.urls.join(' '));
  check('an app that keeps leaving its frame is stopped, not looped', /stopped/i.test(m.text), m.text);

  // 3. A plain reload is still an app's right: it boots again with its bridge.
  const l = await runApp(browser, 'function run(n){ if (n === 1) { location.reload(); return; } gifos.db("t").put({a:1}).then(function(){ out("boot:"+n+" bridge-ok"); }); }');
  check('location.reload() boots the app again with a working bridge', /^boot:[23] bridge-ok$/.test(l.text), l.text);

  // 4. A nested srcdoc frame would be a fresh window with RTCPeerConnection
  //    intact; the shim removes it before it can run.
  const n = await runApp(browser,
    'function run(n){ var ran = 0; window.addEventListener("message", function(e){ if (e.data === "CHILD-RAN") ran++; });' +
    ' var f = document.createElement("iframe"); f.srcdoc = "<script>parent.postMessage(\'CHILD-RAN\',\'*\')<\\/script>"; document.body.appendChild(f);' +
    ' document.body.insertAdjacentHTML("beforeend", "<iframe srcdoc=\\"<script>parent.postMessage(\'CHILD-RAN\',\'*\')<\\/script>\\"></iframe>");' +
    ' setTimeout(function(){ out("frames:" + document.querySelectorAll("iframe").length + " ran:" + ran); }, 1200); }');
  check('a nested frame inside an app is removed before it can run', n.text === 'frames:0 ran:0', n.text);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
