// phone-tune-drive.js — drive ONE power-tuning knob-set on a real phone.
//
// The tuning loop (docs/phone-power-tuning.md): a knob-set is applied via the
// gifos_tune override surface (run.html adapt()), the phone joins a
// DEDICATED tuning room in its OWN tab (a human's placed tab is never
// touched), and the phone-power-log.sh JSONL is the oracle. Repeat per knob.
//
//   adb -s <serial> forward tcp:9222 localabstract:chrome_devtools_remote
//   node test/tools/phone-tune-drive.js open  <room> '<tuneJson>' [--edge]
//   node test/tools/phone-tune-drive.js state <room>
//   node test/tools/phone-tune-drive.js close <room>
//
// tuneJson knobs (all optional; '{}' = shipped behavior):
//   shift  extra LADDER downshift on top of the power tier
//   fps    hard fps cap        kbps  hard main-bitrate cap (kbps)
//   aux    aux/composite ship budget (kbps; shipped default 900)
let pw = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pw = require(m); if (pw) break; } catch (e) {}
}
if (!pw) { console.error('no playwright'); process.exit(1); }
const [cmd, room, tuneJson] = process.argv.slice(2);
const EDGE = process.argv.includes('--edge');
const BASE = process.env.TUNE_BASE || 'https://gifos.app';
if (!cmd || !room) { console.error('usage: phone-tune-drive.js open|state|close <room> [tuneJson] [--edge]'); process.exit(2); }

(async () => {
  // CDP_PORT picks WHICH phone. Two phones are two instruments: the only A/B
  // that cancels time-varying conditions is both in ONE room at ONE time, one
  // per port (9222/9223), so nothing here may assume a single device.
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:' + (process.env.CDP_PORT || 9222));
  const ctx = browser.contexts()[0];
  const findTab = () => ctx.pages().find((p) => p.url().indexOf('#v=' + room) >= 0 || p.url().indexOf('/meet/' + room) >= 0);

  if (cmd === 'open') {
    if (tuneJson) JSON.parse(tuneJson); // fail fast on bad knobs
    const page = await ctx.newPage();
    // Same-origin doc first so the knob is in localStorage BEFORE meet boots.
    await page.goto(BASE + '/robots.txt', { timeout: 30000 });
    await page.evaluate((t) => {
      if (t) localStorage.setItem('gifos_tune', t); else localStorage.removeItem('gifos_tune');
      localStorage.setItem('gifos_name', 'TunePhone');
    }, tuneJson || '');
    await page.goto(BASE + '/run.html' + (EDGE ? '?edge' : '') + '#v=' + room + '&DEBUG=on', { timeout: 60000 });
    console.log(JSON.stringify({ ok: true, room, tune: tuneJson || null }));
  } else if (cmd === 'state') {
    const page = findTab();
    if (!page) { console.log(JSON.stringify({ err: 'no tab for room ' + room })); process.exit(1); }
    const st = await page.evaluate(() => ({
      pow: window.__gifosVideo.powTier(),
      participants: window.__gifosVideo.participants(),
      links: window.__gifosVideo.liveDataLinks(),
      power: (window.__gifosVideo.debugDump() || {}).power || null,
    })).catch((e) => ({ err: String(e).slice(0, 200) }));
    console.log(JSON.stringify(st));
  } else if (cmd === 'close') {
    const page = findTab();
    if (page) { await page.evaluate(() => { try { localStorage.removeItem('gifos_tune'); } catch (e) {} }).catch(() => {}); await page.close(); }
    console.log(JSON.stringify({ ok: true, closed: !!page }));
  } else { console.error('unknown cmd ' + cmd); process.exit(2); }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
