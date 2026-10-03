#!/usr/bin/env node
// whisper-e2e.js — the Offline Captions provider inside a REAL meeting page:
// the signed GIF from site/apps is filed into the Providers folder, assigned
// to Speech → text, the meeting switches its captions engine to Whisper, and
// the JFK clip is pushed through the same path a spoken utterance takes
// (whisperFeedForTest → wspEnqueue → GifOS.providers.call → the hidden
// provider mount → whisper-core). The sentence must come back as a transcript
// line. NOT a gate: the first run downloads the pinned model (77 MB on a
// desktop profile) from huggingface.co, and a loaded box takes minutes.
//
//   python3 -m http.server 8099 -d site & node test/servers/relay-local.js &
//   node test/tools/whisper-e2e.js [--tiny]
const fs = require('fs');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readWav16k(p) { // the fixture is 16 kHz mono 16-bit
  const b = fs.readFileSync(p); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let off = 12, data = null;
  while (off + 8 <= b.length) { const id = b.toString('ascii', off, off + 4), sz = dv.getUint32(off + 4, true); if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; } off += 8 + sz + (sz & 1); }
  const n = data.length / 2, out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(data.byteOffset - b.byteOffset + i * 2, true) / 32768;
  return out;
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Ada');localStorage.setItem('gifos_meet_bar','0');}catch(e){}" });
  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [desk pageerror]', e.message));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 20000 });
  await sleep(500);
  // File the REAL signed provider GIF straight into the Providers folder and assign it.
  const gifBytes = fs.readFileSync(appGif('offline-stt-whisper'));
  const fid = await desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Offline Captions (Whisper).gif', bytes, kind: 'gif', isApp: true, appId: 'offline-stt-whisper', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Offline Captions (Whisper).gif', parent: 'sys_providers', x: 90, y: 90, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    return fid;
  }, gifBytes.toString('base64'));
  check('the provider GIF is filed into the Providers folder', !!fid);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [meet pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('  [meet]', m.text().slice(0, 160)); });
  await page.goto(BASE + '/run.html');
  await page.locator('#lob-open').click();
  await page.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value && /#v=/.test(el.value); }, null, { timeout: 15000 });
  check('a meeting is open', true);

  // The OS provider surface: scan finds it, assign stores it.
  const found = await page.evaluate(() => GifOS.providers.scan());
  check('GifOS.providers.scan sees the provider with the stt role', found.some((p) => p.appId === 'offline-stt-whisper' && p.roles.indexOf('stt') >= 0), JSON.stringify(found));
  await page.evaluate((list) => { const hit = list.find((p) => p.appId === 'offline-stt-whisper'); GifOS.providers.assign('stt', hit); }, found);
  check('…and assigned(stt) now names it', (await page.evaluate(() => (GifOS.providers.assigned('stt') || {}).appId)) === 'offline-stt-whisper');

  // Settings shows the engine choice and reports Ready.
  await page.locator('#setbtn').click();
  await page.locator('input[name="ccengine"][value="whisper"]').check();
  const state = await page.locator('#ccwhisper-state').textContent();
  check('Settings → Captions → Whisper reports the provider as ready', /Ready/.test(state), state.slice(0, 100));
  await page.locator('#set-close').click();

  // Unmute (join-quiet), CC on → the Whisper capture starts on the echo-cancelled track.
  await page.locator('#mic').click();
  await page.waitForFunction(() => !window.__gifosVideo.debugDump().me.status.muted, null, { timeout: 10000 }).catch(() => {});
  await page.locator('#ccbtn').click();
  await page.waitForFunction(() => window.__gifosVideo.whisperForTest().live, null, { timeout: 10000 }).catch(() => {});
  const w0 = await page.evaluate(() => window.__gifosVideo.whisperForTest());
  check('CC with the Whisper engine opens a live capture (no browser SpeechRecognition)', w0.engine === 'whisper' && w0.live, JSON.stringify(w0));

  // Push the JFK clip through the utterance path.
  const pcm = readWav16k(path.join(ROOT, 'test', 'fixtures', 'jfk.wav'));
  if (process.argv.indexOf('--tiny') >= 0) await page.evaluate(() => { /* phone-sized model on request: the engine picks by IS_MOBILE; a tiny run is the smoke tool's job */ });
  const fed = await page.evaluate((arr) => window.__gifosVideo.whisperFeedForTest(arr, 16000), pcm);
  check('the clip is accepted by the capture queue', fed === true);
  console.log('  waiting for the provider (first run downloads the model; a loaded box takes minutes)…');
  let line = '';
  try {
    await page.waitForFunction(() => window.__gifosVideo.transcriptTexts().some((t) => /country/i.test(t)), null, { timeout: 600000 });
    line = (await page.evaluate(() => window.__gifosVideo.transcriptTexts())).join(' | ');
  } catch (e) { line = (await page.evaluate(() => window.__gifosVideo.transcriptTexts())).join(' | ') + ' [status: ' + (await page.locator('#status').textContent()) + ']'; }
  check('the JFK sentence arrives as a transcript line attributed to the speaker', /Ada: .*ask not what your country can do for you/i.test(line), line.slice(0, 200));
  const w1 = await page.evaluate(() => window.__gifosVideo.whisperForTest());
  check('one clip was sent and none dropped', w1.sent === 1 && w1.dropped === 0, JSON.stringify(w1));
  console.log('  total', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
