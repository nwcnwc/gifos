// Prove Hextris boots in a srcdoc sandbox (the GifOS mount): no throw,
// keys rotate, the phone pad rotates, pause shows a packed data: control.
// Run: node apps/hextris/prove.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findPlaywright() {
  if (process.env.PLAYWRIGHT_DIR) return process.env.PLAYWRIGHT_DIR;
  const home = process.env.HOME || '';
  const cands = [join(dir, '../../node_modules/playwright')];
  try {
    for (const n of readdirSync(home)) {
      cands.push(join(home, n, 'node_modules', 'playwright'));
      cands.push(join(home, n, 'gifos', 'node_modules', 'playwright'));
    }
  } catch (e) { /* no home listing */ }
  return cands.find((p) => existsSync(join(p, 'package.json'))) || '';
}
{
  const found = findPlaywright();
  if (found) process.env.PLAYWRIGHT_DIR = found;
}

function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(msg) { console.log('ok', msg); }

// ---- unit: $(window).resize must exist and bind, without a browser ---------
{
  const listeners = [];
  const document = {
    readyState: 'complete',
    addEventListener() {},
    querySelectorAll() { return []; },
    createElement() { return { innerHTML: '', childNodes: [] }; },
  };
  const window = {
    addEventListener(type, fn) { listeners.push([type, fn]); },
    removeEventListener() {},
    document,
  };
  window.window = window;
  const ctx = { window, document, console };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(dir, 'jq.js'), 'utf8'), ctx);
  if (typeof ctx.window.$(ctx.window).resize !== 'function') fail('$(window).resize is not a function');
  let called = false;
  ctx.window.$(ctx.window).resize(function () { called = true; });
  const hit = listeners.find((l) => l[0] === 'resize');
  if (!hit) fail('$(window).resize did not bind addEventListener');
  hit[1]();
  if (!called) fail('resize listener did not run');
  ok('$(window).resize binds');
}

const { chromium, CHROME } = require('../../test/lib/pw.js');

function b64(buf) { return Buffer.from(buf).toString('base64'); }
function mimeOf(p) {
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}
function norm(p) { return p.replace(/^\.?\//, ''); }
function dataUrl(path, bytes) { return 'data:' + mimeOf(path) + ';base64,' + b64(bytes); }

const files = {};
function add(p, bin) { files[p] = bin; }
add('index.html', readFileSync(join(dir, 'index.html')));
add('style.css', readFileSync(join(dir, 'style.css')));
for (const n of ['jq.js', 'net.js', 'touch.js', 'boot.js']) add(n, readFileSync(join(dir, n)));
for (const n of [
  'save-state.js', 'view.js', 'wavegen.js', 'math.js', 'Block.js', 'Hex.js',
  'Text.js', 'comboTimer.js', 'checking.js', 'update.js', 'render.js',
  'input.js', 'main.js', 'initialization.js',
]) add('vendor/' + n, readFileSync(join(dir, 'vendor', n)));
for (const n of ['btn_pause.svg', 'btn_resume.svg', 'btn_restart.svg', 'btn_help.svg', 'btn_back.svg']) {
  add('images/' + n, readFileSync(join(dir, 'images', n)));
}

let html = files['index.html'].toString('utf8');
html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi, (m, src) => {
  const key = norm(src);
  return files[key] ? '<script>' + files[key].toString('utf8') + '</script>' : m;
});
html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => {
  const key = norm(href);
  return (files[key] && /stylesheet/i.test(m)) ? '<style>' + files[key].toString('utf8') + '</style>' : m;
});
html = html.replace(/\b(src|href)=["']([^"']+)["']/gi, (m, attr, ref) => {
  const key = norm(ref);
  return files[key] ? attr + '="' + dataUrl(key, files[key]) + '"' : m;
});
html = '<base href="about:srcdoc">' + html;

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  await page.setContent('<iframe id="app" style="width:800px;height:600px;border:0"></iframe>', { waitUntil: 'domcontentloaded' });
  await page.$eval('#app', (f, doc) => { f.srcdoc = doc; }, html);
  const frame = page.frames().find((fr) => fr !== page.mainFrame());
  if (!frame) fail('no srcdoc frame');
  await frame.waitForFunction(() => typeof window.gameState === 'number' && window.MainHex, { timeout: 8000 });
  if (errors.length) fail('boot throw: ' + errors.join(' | '));
  const boot = await frame.evaluate(() => ({
    gameState,
    resize: typeof window.$ === 'function' && typeof window.$(window).resize === 'function',
    pauseSrc: (document.getElementById('pauseBtn') || {}).src || '',
    resume: !!(window.HT && HT.img && HT.img.resume && HT.img.resume.indexOf('data:') === 0),
    back: !!(window.HT && HT.img && HT.img.back && HT.img.back.indexOf('data:') === 0),
  }));
  if (!boot.resize) fail('$(window).resize missing in srcdoc');
  if (!boot.resume) fail('HT.img.resume is not a data: URL');
  if (!boot.back) fail('HT.img.back is not a data: URL');
  ok('booted gameState=' + boot.gameState + ' without throw');

  await frame.evaluate(() => { if (typeof resumeGame === 'function') resumeGame(); });
  await frame.waitForFunction(() => window.gameState === 1, { timeout: 4000 });
  const pos0 = await frame.evaluate(() => MainHex.position);
  await frame.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  const pos1 = await frame.evaluate(() => MainHex.position);
  if (pos1 === pos0) fail('ArrowLeft did not rotate the hex (pos=' + pos0 + ')');
  ok('keys rotate ' + pos0 + ' -> ' + pos1);

  await frame.evaluate(() => {
    document.body.classList.add('touch');
    var t = document.getElementById('touch');
    if (t) t.hidden = false;
  });
  await new Promise((r) => setTimeout(r, 90));
  const pos2b = await frame.evaluate(() => MainHex.position);
  await frame.evaluate(() => {
    var btn = document.querySelector('[data-act="left"]');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch' }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch' }));
  });
  const pos3 = await frame.evaluate(() => MainHex.position);
  if (pos3 === pos2b) fail('LEFT pad did not rotate the hex (pos=' + pos2b + ')');
  ok('pad rotates ' + pos2b + ' -> ' + pos3);

  await frame.evaluate(() => { if (typeof pause === 'function') pause(); });
  await frame.waitForFunction(() => window.gameState === -1, { timeout: 2000 });
  const paused = await frame.evaluate(() => {
    var el = document.getElementById('pauseBtn');
    return {
      state: gameState,
      btn: el.getAttribute('data-btn'),
      src: el.currentSrc || el.src || '',
      w: el.naturalWidth,
      visible: !!(el.offsetWidth || el.offsetHeight),
    };
  });
  if (paused.btn !== 'resume') fail('pause control data-btn=' + paused.btn + ' (want resume)');
  if (paused.src.indexOf('data:') !== 0) fail('pause src is not data: — ' + paused.src.slice(0, 80));
  if (paused.w < 8) fail('pause control did not paint (naturalWidth=' + paused.w + ')');
  ok('pause shows packed resume hex (' + paused.w + 'px, data:)');

  if (errors.length) fail('errors after play: ' + errors.join(' | '));
  ok('all proofs');
} finally {
  await browser.close();
}
