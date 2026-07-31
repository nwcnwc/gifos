// phone-encoder-census.js — IS THIS PHONE HITTING ITS MediaCodec CEILING?
//
// The "one-encoder fan" lever (collapse N encoder sessions) rests on a premise
// that has never been measured: that a phone sending its camera to C-1
// row-mates runs C-1 SEPARATE hardware encoder sessions and falls off the SoC's
// MediaCodec limit. That premise is checkable directly — __gifosVideo.power()
// reports, per sender, the negotiated codec, the encoderImplementation (the SoC
// hardware name vs a software fallback like libvpx / OpenH264), and
// qualityLimitationReason.
//
// READ IT LIKE THIS:
//   * every sender on the same HARDWARE impl        -> no ceiling hit; the fan
//                                                      is not costing what the
//                                                      lever assumes
//   * first N hardware, later ones libvpx/OpenH264  -> THE CEILING IS REAL, and
//                                                      the software fallbacks
//                                                      are the expensive ones
//   * qualityLimitationReason 'cpu'                 -> already thermally/CPU
//                                                      bound; collapsing helps
//
// Do not implement the collapse before this says the ceiling is real — it is an
// architectural change to the media plane and the row grid needs direct faces.
//
//   CDP_PORT=9222 node test/tools/phone-encoder-census.js <room>
//
// READ-ONLY.
let pw = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pw = require(m); if (pw) break; } catch (e) {}
}
if (!pw) { console.error('no playwright'); process.exit(1); }
const room = process.argv[2] || '';
const PORT = process.env.CDP_PORT || 9222;

(async () => {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  let page = null;
  for (const c of browser.contexts()) for (const p of c.pages()) {
    const u = p.url();
    if (u.indexOf('v=' + room) >= 0 || u.indexOf('/meet/' + room) >= 0) page = p;
  }
  if (!page) { console.log(JSON.stringify({ err: 'no tab for room ' + room })); process.exit(1); }
  await page.bringToFront().catch(() => {});

  // power() is demand-gated with a ~10s cache: the FIRST call only arms the
  // read. Call, wait past the window, then call again for real numbers.
  await page.evaluate(() => window.__gifosVideo.power());
  await page.waitForTimeout(12000);

  const out = await page.evaluate(async () => {
    const V = window.__gifosVideo;
    const av = await V.avStats();
    const outRows = av.filter((r) => r.dir === 'out' && r.kind === 'video');
    return {
      coord: V.meshCoord(), participants: V.participants(),
      camOff: V.camOff(), camTrackLive: V.camTrackLive(),
      rung: V.powTier(),
      power: V.power(),
      outboundVideo: outRows.map((r) => ({ pid: r.pid, slot: r.slot, mid: r.mid, fps: r.fps, bytes: r.bytes })),
    };
  });

  const senders = (out.power && out.power.senders) || [];
  const impls = {};
  for (const s of senders) impls[s.impl || 'unknown'] = (impls[s.impl || 'unknown'] || 0) + 1;
  const sw = senders.filter((s) => /libvpx|openh264|ffmpeg|software/i.test(s.impl || ''));
  const cpuLimited = senders.filter((s) => s.limit === 'cpu');
  out.verdict = {
    senderCount: senders.length,
    outboundVideoStreams: out.outboundVideo.length,
    implHistogram: impls,
    softwareFallbacks: sw.length,
    cpuLimited: cpuLimited.length,
    CEILING_HIT: sw.length > 0 || cpuLimited.length > 0,
    note: sw.length > 0
      ? 'SOFTWARE FALLBACK PRESENT — the MediaCodec ceiling is real; collapsing the fan is justified.'
      : senders.length === 0
        ? 'no senders reported — is the camera on and is anyone receiving?'
        : 'all senders on one implementation and none cpu-limited — no ceiling evidence; do NOT collapse on theory alone.',
  };
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
