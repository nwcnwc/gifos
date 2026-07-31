// phone-pixel-waste.js — DOES EVERY DECODED PIXEL REACH THE SCREEN?
//
// Decode cost tracks pixels x frames. This asks, for every <video> the page is
// decoding: how big is the frame (videoWidth/Height, what the decoder actually
// produced) versus how big is it drawn (getBoundingClientRect, after CSS)?
//
//   overdraw = decodedPixels / displayedPixels
//
// overdraw 1 is honest. overdraw 9 means a 3x-too-large frame is being decoded
// and thrown away — the receiver is paying full price for detail no eye gets.
// A rendered size of 0 (display:none, zero-size, off the layout) with frames
// still arriving is pure waste: decode with no viewer at all.
//
// Distinguishes MAIN tiles from COMPOSITES: a composite legitimately carries
// many faces, so judge it by the size it is DRAWN at, not by face count.
//
//   CDP_PORT=9222 node test/tools/phone-pixel-waste.js <room>
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

  const out = await page.evaluate(() => {
    const V = window.__gifosVideo;
    const dpr = window.devicePixelRatio || 1;
    const vids = [];
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const cs = getComputedStyle(v);
      const dw = v.videoWidth || 0, dh = v.videoHeight || 0;
      // CSS px -> device px: the decoder must fill the DEVICE pixels, so that
      // is the honest denominator on a phone with dpr 2-3.
      const sw = Math.round(r.width * dpr), sh = Math.round(r.height * dpr);
      const decPx = dw * dh, shownPx = sw * sh;
      // what is this video? a peer tile, the stadium composite, a stage feed, me
      const peerEl = v.closest('[data-peer]');
      const rowEl = v.closest('.rowtile');
      const kind = peerEl ? 'main:' + String(peerEl.dataset.peer).slice(0, 8)
        : rowEl ? 'composite:' + (rowEl.dataset.row || '?')
          : (v.id || 'other');
      const hiddenBy = cs.display === 'none' ? 'display:none'
        : cs.visibility === 'hidden' ? 'visibility:hidden'
          : (r.width < 1 || r.height < 1) ? 'zero-size'
            : (r.bottom < 0 || r.top > innerHeight) ? 'offscreen' : null;
      vids.push({
        kind, decoded: dw + 'x' + dh, shownDevicePx: sw + 'x' + sh,
        overdraw: shownPx > 0 && decPx > 0 ? +(decPx / shownPx).toFixed(1) : null,
        wastedPx: shownPx > 0 ? Math.max(0, decPx - shownPx) : decPx,
        hiddenBy, paused: v.paused, hasSrc: !!v.srcObject,
      });
    }
    return {
      dpr, viewport: innerWidth + 'x' + innerHeight,
      participants: V.participants(), coord: V.meshCoord(),
      camOff: V.camOff(), stadiumShown: (() => { try { return V.stadiumShown(); } catch (e) { return null; } })(),
      mosaicClaims: (() => { try { return (V.mosaic() || {}).claims || []; } catch (e) { return null; } })(),
      vids,
    };
  });

  // Totals: decoded pixels that never reach a device pixel.
  let decTot = 0, wasteTot = 0, dark = [];
  for (const v of out.vids) {
    if (!v.hasSrc) continue;
    const [dw, dh] = v.decoded.split('x').map(Number);
    decTot += dw * dh;
    wasteTot += v.wastedPx;
    if (v.hiddenBy && dw > 0) dark.push(v.kind + ' ' + v.decoded + ' (' + v.hiddenBy + ')');
  }
  out.summary = {
    decodedPxPerFrame: decTot,
    wastedPxPerFrame: wasteTot,
    wastedPct: decTot ? +(100 * wasteTot / decTot).toFixed(1) : 0,
    decodingWhileNotVisible: dark,
  };
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
