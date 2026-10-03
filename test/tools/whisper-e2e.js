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
  // ---- phase 1: ONE TAP. A fresh computer, no provider anywhere; the meeting
  // installs the signed GIF from this site, files it, assigns it. ----
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [meet pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('  [meet]', m.text().slice(0, 160)); });
  await page.goto(BASE + '/run.html');
  await page.locator('#lob-open').click();
  await page.waitForFunction(() => { const el = document.getElementById('share-url'); return el && el.value && /#v=/.test(el.value); }, null, { timeout: 15000 });
  check('a meeting is open on a computer with no provider', (await page.evaluate(() => GifOS.providers.assigned('stt'))) === null);
  await page.locator('#setbtn').click();
  await page.locator('input[name="ccengine"][value="whisper"]').check();
  const state0 = await page.locator('#ccwhisper-state').textContent();
  check('Settings offers "Install it now" when the app is missing', /Install it now/.test(state0), state0.slice(0, 120));
  await page.locator('#ccwhisper-install').click();
  await page.waitForFunction(() => !!GifOS.providers.assigned('stt'), null, { timeout: 120000 }).catch(() => {});
  const assigned = await page.evaluate(() => GifOS.providers.assigned('stt'));
  check('one tap downloads, verifies, files and assigns the provider', !!assigned && assigned.appId === 'offline-stt-whisper', JSON.stringify(assigned));
  const found = await page.evaluate(() => GifOS.providers.scan());
  check('…and it sits in the Providers folder with the stt role', found.some((p) => p.appId === 'offline-stt-whisper' && p.roles.indexOf('stt') >= 0), JSON.stringify(found));
  const again = await page.evaluate(() => GifOS.providers.install('offline-stt-whisper'));
  check('installing again finds the existing copy instead of downloading twice', again && again.existing === true && again.fileId === assigned.app, JSON.stringify(again));
  await page.waitForFunction(() => /Ready/.test(document.getElementById('ccwhisper-state').textContent), null, { timeout: 10000 }).catch(() => {});
  const state = await page.locator('#ccwhisper-state').textContent();
  check('Settings → Captions → Whisper reports the provider as ready', /Ready/.test(state), state.slice(0, 100));
  await page.locator('#set-close').click();

  // Unmute (join-quiet), CC on → the Whisper capture starts on the echo-cancelled track.
  await page.locator('#mic').click();
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
  // Chromium's fake audio device never stops making sound, so the meter reads
  // "talking" the whole time and the capture keeps cutting 15 s clips behind
  // the one we fed; on a slow box those back up and the oldest are dropped —
  // the backlog rule doing its job, not a fault. Report, don't judge.
  const w1 = await page.evaluate(() => window.__gifosVideo.whisperForTest());
  console.log('  capture after the run: ' + JSON.stringify(w1));
  check('the capture is still live after the answer', w1.live && w1.engine === 'whisper');

  // ---- phase 3: THE SCRIBE. Bob joins with nothing installed, chooses Ada's
  // captions; Ada scribes; Bob's voice (the JFK clip through Ada's capture
  // of Bob) comes back to Bob as a line attributed to Bob, written by Ada. ----
  const link = await page.locator('#share-url').inputValue();
  const bCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await bCtx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Bob');localStorage.setItem('gifos_meet_bar','0');}catch(e){}" });
  const bob = await bCtx.newPage();
  bob.on('pageerror', (e) => console.log('  [bob pageerror]', e.message));
  await bob.goto(link);
  await bob.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 30000 });
  await bob.locator('#mic').click();
  const bobPid = await bob.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  await page.evaluate(() => window.__gifosVideo.scribeForTest(true));
  await page.waitForFunction((pid) => window.__gifosVideo.whisperForTest().captures.indexOf(pid) >= 0, bobPid, { timeout: 20000 }).catch(() => {});
  const wa = await page.evaluate(() => window.__gifosVideo.whisperForTest());
  check('Ada, scribing, opens a capture on Bob\'s voice', wa.scribe && wa.captures.indexOf(bobPid) >= 0, JSON.stringify(wa));
  await bob.waitForFunction(() => window.__gifosVideo.whisperForTest().scribes.length === 1, null, { timeout: 15000 }).catch(() => {});
  const wb0 = await bob.evaluate(() => window.__gifosVideo.whisperForTest());
  check('Bob sees Ada offered as a captions source', wb0.scribes.length === 1, JSON.stringify(wb0));
  // Not chosen yet: a scribed line about Bob must NOT land on Bob.
  const adaPid = await page.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  await page.evaluate(({ arr, pid }) => window.__gifosVideo.whisperFeedForTest(arr, 16000, pid), { arr: pcm, pid: bobPid });
  await page.waitForFunction(() => window.__gifosVideo.transcriptTexts().some((t) => /Bob: .*country/i.test(t)), null, { timeout: 300000 }).catch(() => {});
  check('Ada\'s transcript carries the line as Bob\'s, written by Ada', (await page.evaluate(() => window.__gifosVideo.transcriptBlocks())).some((t) => /^Bob: .*country/i.test(t)));
  await sleep(1500);
  const bobBefore = await bob.evaluate(() => window.__gifosVideo.transcriptTexts());
  check('Bob, who did not choose Ada, does not receive her line about him', !bobBefore.some((t) => /Bob: .*country/i.test(t)), bobBefore.join(' | ').slice(0, 160));
  await bob.evaluate((pid) => window.__gifosVideo.ccSourceForTest(pid), adaPid);
  await page.evaluate(({ arr, pid }) => window.__gifosVideo.whisperFeedForTest(arr, 16000, pid), { arr: pcm, pid: bobPid });
  await bob.waitForFunction(() => window.__gifosVideo.transcriptTexts().some((t) => /Bob: .*country/i.test(t)), null, { timeout: 300000 }).catch(() => {});
  const bobAfter = await bob.evaluate(() => window.__gifosVideo.transcriptTexts());
  check('once Bob chooses Ada\'s captions, her line about him arrives, attributed to Bob', bobAfter.some((t) => /Bob: .*country/i.test(t)), bobAfter.join(' | ').slice(0, 160));
  const wb1 = await bob.evaluate(() => window.__gifosVideo.whisperForTest());
  check('…and Bob\'s own device runs no engine of its own', wb1.source === adaPid && !wb1.live, JSON.stringify(wb1));
  await bob.close(); await bCtx.close();
  console.log('  total', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
