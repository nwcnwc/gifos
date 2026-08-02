/*
 * approom-join.js — join an owned app-room link from ANOTHER machine and time
 * how long the shared app takes to actually mount. Pair with approom-host.js.
 *
 *   node test/tools/approom-join.js --base http://<host>:8099 \
 *        --relay ws://<host>:8795 --link '<invite url>' --runs 6
 *
 * Prints one line per run:
 *   MOUNT run=<n> iframeMs=<ms> modalMs=<ms> ok=<bool>
 *
 * iframeMs  — the app frame exists (bytes arrived, app mounted)
 * modalMs   — the Abilities acknowledgement is up (what e2e-perms-share waits
 *             for). Both are reported because they answer different questions:
 *             a slow iframe is the bytes-on-demand path, a slow modal with a
 *             fast iframe would be UI.
 *
 * Each run uses a FRESH context (a new guest every time) so nothing is cached
 * between runs. Set MEET_INSECURE_ORIGINS for a plain-http base.
 */
const { chromium, CHROME } = require('../lib/pw');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8099');
const RELAY = arg('--relay', 'ws://127.0.0.1:8790');
const LINK = arg('--link', '');
const RUNS = parseInt(arg('--runs', '6'), 10);
const NAME = arg('--name', 'JoinBox');
const BUDGET = parseInt(arg('--budget', '90000'), 10);

if (!LINK) { console.log('JOIN-ERROR --link is required'); process.exit(2); }

(async () => {
  const insecure = process.env.MEET_INSECURE_ORIGINS || process.env.SWARM_INSECURE_ORIGINS;
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      ...(insecure ? ['--unsafely-treat-insecure-origin-as-secure=' + insecure] : []),
    ],
  });

  const results = [];
  for (let n = 1; n <= RUNS; n++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript((o) => {
      try {
        localStorage.setItem('gifos_relay', o.relay);
        localStorage.setItem('gifos_name', o.name);
        localStorage.setItem('gifos_meet_bar', '0');
      } catch (e) {}
    }, { relay: RELAY, name: NAME + n });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [join pageerror] ' + String(e).slice(0, 140)));
    // Seed this guest's own store first, exactly as e2e-perms-share does — the
    // desktop DB must exist before an app can be written into it.
    await page.goto(BASE + '/index.html').catch(() => {});
    await page.waitForSelector('.icon', { timeout: 60000 }).catch(() => {});

    const t0 = Date.now();
    await page.goto(LINK).catch(() => {});
    const iframeOk = await page.waitForSelector('iframe', { timeout: BUDGET }).then(() => true).catch(() => false);
    const iframeMs = Date.now() - t0;
    const modalOk = await page.waitForSelector('.perm-modal', { timeout: Math.max(1000, BUDGET - iframeMs) })
      .then(() => true).catch(() => false);
    const modalMs = Date.now() - t0;
    console.log('MOUNT run=' + n + ' iframeMs=' + (iframeOk ? iframeMs : -1) +
      ' modalMs=' + (modalOk ? modalMs : -1) + ' ok=' + (iframeOk && modalOk));
    // WHICH LEG was slow? runtime.js records the join timeline; without it the
    // total is unactionable (waiting on the owner's snap is mesh/DC, asks going
    // unanswered is the bytes path).
    const tr = await page.evaluate(() => window.__appJoinTrace || []).catch(() => []);
    if (tr.length) console.log('  TRACE ' + tr.map((e) => e.ev + '@' + e.ms + (e.kb ? '(' + e.kb + 'kb)' : '')).join(' '));
    results.push({ iframeMs: iframeOk ? iframeMs : -1, modalMs: modalOk ? modalMs : -1 });
    await ctx.close().catch(() => {});
  }

  const good = results.filter((r) => r.modalMs >= 0).map((r) => r.modalMs).sort((a, b) => a - b);
  const slow = results.filter((r) => r.modalMs > 5000 || r.modalMs < 0).length;
  console.log('JOIN-SUMMARY runs=' + RUNS + ' mounted=' + good.length +
    ' medianMs=' + (good.length ? good[Math.floor(good.length / 2)] : -1) +
    ' maxMs=' + (good.length ? good[good.length - 1] : -1) +
    ' slowOrFailed=' + slow);
  await browser.close().catch(() => {});
})().catch((e) => { console.log('JOIN-ERROR ' + String(e).slice(0, 300)); process.exit(1); });
