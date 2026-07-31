// phone-decode-probe.js — WHAT IS THIS PHONE DECODING, AND DOES IT PAINT IT?
//
// The decode-side question the CPU proxy cannot answer. avStats() labels every
// inbound row with a slot: 'tile:<pid>' is a peer's MAIN video (the one that
// lands in a .tile), 'in:<rk>' is a composite this client subscribed to. And
// mainSenders() reports whether each peer's tile is actually SHOWN — a
// non-row-mate's tile is display:none, because the Stadium/Stage composites
// read the aux streams, never those tiles.
//
// Cross the two and you get the number that matters: bytes and frames decoded
// for tiles that are NEVER PAINTED. That is pure waste on both ends — a camera
// encoder running at this phone, a radio carrying it, a decoder producing
// frames no canvas reads.
//
//   CDP_PORT=9222 node test/tools/phone-decode-probe.js [windowSecs]
//
// READ-ONLY: never navigates, clicks, or mutates the page.
let pw = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pw = require(m); if (pw) break; } catch (e) {}
}
if (!pw) { console.error('no playwright'); process.exit(1); }
const WIN = Math.max(5, +(process.argv[2] || 30));
const PORT = process.env.CDP_PORT || 9222;

// Only verified accessors — see docs/phone-instrument-interface.md. In
// particular debugDump() carries NO camOff, and parkAsked/parked are on
// meshSelfReport(), not on the dump; reading them off the dump silently yields
// undefined and reports a camera-off phone as camera-on.
const snap = (page) => page.evaluate(async () => {
  const V = window.__gifosVideo;
  return {
    t: Date.now(),
    av: await V.avStats(),
    main: V.mainSenders(),
    coord: V.meshCoord(),
    parkAsked: V.visParkAsked().map((x) => String(x).slice(0, 8)),
    parked: V.visParked().map((x) => String(x).slice(0, 8)),
    participants: V.participants(),
    camOff: V.camOff(), camTrackLive: V.camTrackLive(),
    rung: V.powTier ? V.powTier() : null,
    mosaicClaims: (() => { try { return (V.mosaic() || {}).claims || []; } catch (e) { return null; } })(),
  };
});

(async () => {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  let page = null;
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (/meet/.test(p.url())) page = p;
  if (!page) { console.error('no meet tab on port ' + PORT); process.exit(1); }

  const a = await snap(page);
  await new Promise((r) => setTimeout(r, WIN * 1000));
  const b = await snap(page);

  // tile visibility per peer, from the client's own reconcileGrid verdict
  const shown = new Map();
  for (const m of b.main) shown.set(m.id.slice(0, 6), m.tile); // 'shown' | 'hidden' | null

  const key = (r) => r.dir + '|' + r.pid + '|' + r.kind + '|' + (r.slot || '?') + '|' + (r.trk || '');
  const A = new Map(); for (const r of a.av) A.set(key(r), r);
  const dt = (b.t - a.t) / 1000;

  const rows = [];
  for (const r of b.av) {
    const p = A.get(key(r)); if (!p) continue;
    const dB = (r.bytes || 0) - (p.bytes || 0);
    const dF = (r.fdec || 0) - (p.fdec || 0);
    if (dB <= 0 && dF <= 0) continue;
    rows.push({ dir: r.dir, pid: r.pid, kind: r.kind, slot: r.slot || '?',
      kbps: +(dB * 8 / 1000 / dt).toFixed(1), fps: +(dF / dt).toFixed(1),
      tile: shown.get(r.pid) || null });
  }
  rows.sort((x, y) => y.kbps - x.kbps);

  // THE VERDICT: inbound MAIN video split by whether its tile is painted.
  let paintedK = 0, wastedK = 0, paintedF = 0, wastedF = 0, compK = 0;
  for (const r of rows) {
    if (r.dir !== 'in' || r.kind !== 'video') continue;
    const isMain = /^tile:/.test(r.slot);
    if (!isMain) { compK += r.kbps; continue; }
    if (r.tile === 'hidden') { wastedK += r.kbps; wastedF += r.fps; }
    else { paintedK += r.kbps; paintedF += r.fps; }
  }
  console.log(JSON.stringify({
    port: +PORT, windowSec: +dt.toFixed(1),
    coord: b.coord, participants: b.participants,
    // ENGAGED? a camera-off phone with no mosaic exercises none of this work.
    camOff: b.camOff, camTrackLive: b.camTrackLive, rung: b.rung,
    mosaicClaims: b.mosaicClaims,
    parkAsked: b.parkAsked, parked: b.parked,
    inboundMainVideo: {
      paintedKbps: +paintedK.toFixed(1), paintedFps: +paintedF.toFixed(1),
      UNPAINTED_kbps: +wastedK.toFixed(1), UNPAINTED_fps: +wastedF.toFixed(1),
      compositeKbps: +compK.toFixed(1),
    },
    rows,
  }, null, 1));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
