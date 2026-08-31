// Prove Open replaces the sample with rate-table.pdf and does not hang.
// One headless_shell, unique user-data-dir, always killed.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const dir = __dirname;
const HOME = os.homedir();
const SHELL = process.env.GIFOS_CHROME ||
  path.join(HOME, '.cache/ms-playwright/chromium_headless_shell-1228/chrome-linux/headless_shell');
const ratePath = path.join(dir, '..', '..', 'test', 'fixtures', 'rate-table.pdf');
const samplePath = path.join(dir, 'sample.pdf');

function fail(msg) {
  console.error('FAIL — ' + msg);
  cleanup(1);
}
function pass(msg) { console.log('PASS — ' + msg); }

if (!fs.existsSync(SHELL)) fail('no headless_shell at ' + SHELL);
if (!fs.existsSync(samplePath)) fail('sample.pdf missing — run build.mjs first');
const sample = fs.readFileSync(samplePath);
const rate = fs.readFileSync(ratePath);
if (rate.length < 500) fail('rate-table.pdf looks empty');

const files = {
  '/pdf.min.js': { type: 'text/javascript', body: fs.readFileSync(path.join(dir, 'vendor', 'pdf.min.js')) },
  '/viewer.js': { type: 'text/javascript', body: fs.readFileSync(path.join(dir, 'viewer.js')) },
  '/pdf.worker.min.js': { type: 'text/javascript', body: fs.readFileSync(path.join(dir, 'vendor', 'pdf.worker.min.js')) },
  '/sample.pdf': { type: 'application/pdf', body: sample },
  '/rate-table.pdf': { type: 'application/pdf', body: rate }
};

const html = `<!doctype html>
<meta charset="utf-8">
<title>prove-open</title>
<div id="stage" style="width:800px;height:1100px">
  <div id="page-wrap"><canvas id="page-canvas"></canvas>
  <div id="text-layer"></div><div id="hl-layer"></div><div id="pointer"></div></div>
</div>
<script src="/pdf.min.js"></script>
<script src="/viewer.js"></script>
<script>
function report(obj) {
  return fetch('/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });
}
fetch('/boot');
(async function () {
  window.PDF_WORKER_SRC = await (await fetch('/pdf.worker.min.js')).text();
  function ab(url) { return fetch(url).then(function (r) { return r.arrayBuffer(); }); }
  var v = new PdfViewer({
    stage: document.getElementById('stage'),
    wrap: document.getElementById('page-wrap'),
    canvas: document.getElementById('page-canvas'),
    textLayer: document.getElementById('text-layer'),
    hlLayer: document.getElementById('hl-layer'),
    pointer: document.getElementById('pointer')
  });
  var t0 = Date.now();
  await v.open('paper-planes.pdf', await ab('/sample.pdf'));
  var ctx = v.canvas.getContext('2d');
  var pix = ctx.getImageData(Math.floor(v.canvas.width * 0.25), Math.floor(v.canvas.height * 0.18), 1, 1).data;
  var sampleOpen = { name: v.name, pages: v.numPages, ms: Date.now() - t0, pixel: [pix[0], pix[1], pix[2]] };
  var t1 = Date.now();
  await v.open('rate-table.pdf', await ab('/rate-table.pdf'));
  var img = ctx.getImageData(0, 0, Math.min(v.canvas.width, 80), Math.min(v.canvas.height, 80)).data;
  var ink = 0;
  for (var i = 0; i < img.length; i += 4) if (img[i] < 250 || img[i+1] < 250 || img[i+2] < 250) ink++;
  var first = { name: v.name, pages: v.numPages, page: v.page, ms: Date.now() - t1, w: v.canvas.width, h: v.canvas.height, ink: ink };
  var t2 = Date.now();
  await v.open('rate-table.pdf', await ab('/rate-table.pdf'));
  var second = { name: v.name, pages: v.numPages, ms: Date.now() - t2 };
  await report({ sampleOpen: sampleOpen, first: first, second: second });
})().catch(function (e) { report({ err: String(e && e.message || e) }); });
</script>`;

let chrome = null;
let settled = false;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfreaderprove-'));

const server = http.createServer((req, res) => {
  if (req.url === '/boot') { res.end('ok'); console.log('  [boot]'); return; }
  if (req.url === '/done' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { res.end('ok'); finish(body); });
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }
  const f = files[req.url];
  if (!f) { res.statusCode = 404; res.end('no'); return; }
  res.setHeader('Content-Type', f.type);
  res.end(f.body);
});

function finish(payload) {
  if (settled) return;
  settled = true;
  let result;
  try { result = JSON.parse(payload || '{}'); } catch (e) { fail('bad payload'); return; }
  console.log(JSON.stringify(result));
  if (result.err) { fail(result.err); return; }
  if (!result.sampleOpen || result.sampleOpen.pages !== 3) {
    fail('sample should be 3 pages, got ' + (result.sampleOpen && result.sampleOpen.pages));
    return;
  }
  if (result.sampleOpen.ms > 8000) { fail('sample open too slow: ' + result.sampleOpen.ms + 'ms'); return; }
  const pix = result.sampleOpen.pixel || [255, 0, 0];
  if (pix[0] > 180 && pix[1] < 80 && pix[2] < 80) {
    fail('sample body type is still red: rgb(' + pix.join(',') + ')');
    return;
  }
  pass('sample opens (' + result.sampleOpen.ms + 'ms, 3 pages, pixel rgb(' + pix.join(',') + '))');
  if (!result.first || result.first.name !== 'rate-table.pdf') {
    fail('first open name is ' + (result.first && result.first.name));
    return;
  }
  if (result.first.pages !== 1) { fail('rate-table should be 1 page, got ' + result.first.pages); return; }
  if (result.first.ms > 8000) { fail('rate-table open hung/slow: ' + result.first.ms + 'ms'); return; }
  if (result.first.ink < 10) { fail('canvas looks blank after rate-table (ink=' + result.first.ink + ')'); return; }
  pass('rate-table.pdf replaced the sample (' + result.first.ms + 'ms, 1 page, canvas ' +
       result.first.w + '×' + result.first.h + ', ink=' + result.first.ink + ')');
  if (!result.second || result.second.pages !== 1) { fail('second rate-table open failed'); return; }
  if (result.second.ms > 8000) { fail('second open hung: ' + result.second.ms + 'ms'); return; }
  pass('opening a second time also works (' + result.second.ms + 'ms)');
  cleanup(0);
}

function cleanup(code) {
  if (chrome && !chrome.killed) {
    try { chrome.kill('SIGTERM'); } catch (e) {}
  }
  try { server.close(); } catch (e) {}
  setTimeout(() => process.exit(code), 300);
}

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = 'http://127.0.0.1:' + port + '/';
  chrome = spawn(SHELL, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + tmp,
    url
  ], { stdio: 'ignore' });
  chrome.on('error', (e) => fail('chrome: ' + e.message));
});

setTimeout(() => { if (!settled) fail('timed out waiting for Open (hung)'); }, 20000);
