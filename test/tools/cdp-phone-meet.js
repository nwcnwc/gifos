// cdp-phone-meet.js — READ-ONLY diagnostics against a phone's live meet tab over
// CDP (adb forward tcp:9222 localabstract:chrome_devtools_remote first).
// Never activates, navigates, or clicks — the human placed that tab.
let pw = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pw = require(m); if (pw) break; } catch (e) {}
}
if (!pw) { console.error('no playwright'); process.exit(1); }
(async () => {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:9222');
  for (const ctx of browser.contexts()) for (const page of ctx.pages()) {
    if (!/meet/.test(page.url())) continue;
    const out = await page.evaluate(async () => {
      const vids = [...document.querySelectorAll('video')].map((v) =>
        ((v.closest('[data-peer]') && v.closest('[data-peer]').dataset.peer) || v.id || '?').slice(0, 10)
        + ':' + v.videoWidth + 'x' + v.videoHeight + (v.paused ? ' PAUSED' : '')
        + ' rvfc=' + (v.__rvfc || ''));
      let av = null;
      try {
        av = (await window.__gifosVideo.avStats()).map((s) =>
          s.dir + ':' + s.kind + ' bytes=' + s.bytes
          + (s.fdec != null ? ' fdec=' + s.fdec : '') + (s.fenc != null ? ' fenc=' + s.fenc : ''));
      } catch (e) { av = 'ERR ' + e; }
      let d = null;
      try { d = window.__gifosVideo.debugDump(); } catch (e) { d = { err: String(e) }; }
      const pick = {};
      for (const k of ['pid', 'coord', 'stagers', 'mosaic', 'inMeeting', 'participants', 'liveVid']) pick[k] = d && d[k];
      return { url: location.href, vids, av, pick };
    }).catch((e) => ({ evalErr: String(e).slice(0, 300) }));
    console.log(JSON.stringify(out, null, 1));
    if (process.argv[2]) {
      await page.screenshot({ path: process.argv[2] }).catch((e) => console.error('shot: ' + e));
      console.error('screenshot → ' + process.argv[2]);
    }
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
