// THE TWO-ENGINE ROOM — the interop guard for the Ed25519 fallback signer.
//
// The fallback's whole promise (gifos-ed.js): a browser without native
// WebCrypto Ed25519 — an old iPhone's Safari 16 — joins the SAME room as a
// native-signing browser, and every signed frame verifies in BOTH directions.
// test/unit/ed-fallback.js proves the math is byte-identical; THIS suite
// proves the product: a real mixed room over the real relay, where
//
//   HOST  = a healthy browser (native Ed25519 engine),
//   GUEST = the Safari-16 shape (importKey rejects Ed25519 → JS engine).
//
// If cross-engine verification broke, the S4 layer would silently REJECT the
// other side's fill frames (bad-sig) and the two browsers would sit in
// mutually-deaf cohorts — each seated alone, neither seeing the other. So the
// load-bearing assertion is not "seated": it is BOTH SIDES SEE EACH OTHER
// (roster + tiles), which only happens if signatures crossed the engine
// boundary both ways.
//
// Also guarded: engine hygiene — the native side must NEVER fetch the vendor
// file (modern browsers pay zero bytes for the fallback), and the crippled
// side must have actually loaded it.
//
// Needs: python3 -m http.server 8099 -d site ; node test/servers/relay-local.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAFARI16 = () => {
  const real = window.crypto.subtle.importKey.bind(window.crypto.subtle);
  Object.defineProperty(window.crypto.subtle, 'importKey', {
    configurable: true,
    value: function (fmt, key, alg, ext, uses) {
      const n = (alg && alg.name) || alg;
      if (String(n) === 'Ed25519') return Promise.reject(new Error('Unrecognized name.'));
      return real(fmt, key, alg, ext, uses);
    },
  });
};

const LAUNCH = { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, ...LAUNCH });
  const room = 'edfall-' + Math.random().toString(36).slice(2, 8);

  const mk = async (name, cripple) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}");
    if (cripple) await ctx.addInitScript(SAFARI16);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + name + '] ' + e.message));
    p._vendorFetches = 0;
    p.on('request', (r) => { if (/vendor\/nacl-fast\.js/.test(r.url())) p._vendorFetches++; });
    await p.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
    return { ctx, p };
  };

  const host = await mk('NativeHost', false);
  await sleep(2000);
  const guest = await mk('OldGuest16', true);

  // ---- both seat ------------------------------------------------------------
  const seatOf = async (p) => p.evaluate(() => window.__gifosVideo && window.__gifosVideo.meshCoord()).catch(() => null);
  let hostSeat = null, guestSeat = null;
  for (let t = 0; t < 40 && !(hostSeat && guestSeat); t++) {
    await sleep(1000);
    if (!hostSeat) hostSeat = await seatOf(host.p);
    if (!guestSeat) guestSeat = await seatOf(guest.p);
  }
  check('the native host seats', !!hostSeat, { hostSeat });
  check('the Safari-16-shape guest seats IN THE SAME ROOM', !!guestSeat, { guestSeat });

  // ---- the load-bearing half: they SEE each other ---------------------------
  // Two tiles on each side = my own + the other participant's. A one-tile
  // room on either side means the other engine's signatures were rejected.
  const tiles = async (p) => p.evaluate(() => document.querySelectorAll('#grid .tile').length).catch(() => 0);
  let hTiles = 0, gTiles = 0;
  for (let t = 0; t < 30 && !(hTiles >= 2 && gTiles >= 2); t++) {
    await sleep(1000);
    hTiles = await tiles(host.p); gTiles = await tiles(guest.p);
  }
  check('the native host SEES the fallback-signed guest (2 tiles)', hTiles >= 2, hTiles);
  check('the fallback guest SEES the native host (2 tiles)', gTiles >= 2, gTiles);

  // ---- engine hygiene -------------------------------------------------------
  check('the crippled guest actually loaded the vendored signer', await guest.p.evaluate(() => !!(window.nacl && window.nacl.sign)));
  check('…and the native host NEVER fetched it (modern browsers pay zero bytes)',
    host.p._vendorFetches === 0 && !(await host.p.evaluate(() => !!window.nacl)), host.p._vendorFetches);
  check('…while the guest fetched it exactly once (lazy, memoized)', guest.p._vendorFetches === 1, guest.p._vendorFetches);

  await host.ctx.close(); await guest.ctx.close();
  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
