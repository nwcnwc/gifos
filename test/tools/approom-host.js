/*
 * approom-host.js — host an OWNED app room and print its invite link, then sit
 * in it until killed. The other half is approom-join.js.
 *
 * WHY THIS EXISTS. e2e-perms-share measured the joiner's app mount at 9-32ms
 * five runs out of six and 32,899ms on the sixth. But that suite runs the host
 * AND the joiner AND the relay on ONE box, so a 33s stall there is equally
 * explainable by that box's own CPU/OS contention — it is not a real-life
 * shape and cannot be trusted to indict the product (Nathan, 2026-08-02).
 * These two tools put each participant on its OWN machine over the tailnet, so
 * the answer is unambiguous. See the distributed-topology playbook: 1-2 clients
 * per device, everything pointed at one box's site+relay.
 *
 *   node test/tools/approom-host.js --base http://<host>:8099 --relay ws://<host>:8795
 *
 * Plain http is not a secure context, so set
 * MEET_INSECURE_ORIGINS=http://<host>:8099 or getUserMedia/crypto will fail.
 */
const { chromium, CHROME } = require('../lib/pw');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8099');
const RELAY = arg('--relay', 'ws://127.0.0.1:8790');
const NAME = arg('--name', 'HostBox');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await ctx.addInitScript((o) => {
    try {
      localStorage.setItem('gifos_relay', o.relay);
      localStorage.setItem('gifos_name', o.name);
      localStorage.setItem('gifos_meet_bar', '0');
    } catch (e) {}
  }, { relay: RELAY, name: NAME });

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [host pageerror] ' + String(e).slice(0, 160)));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  const cid = await page.evaluate(async () => {
    const it = (await GifOS.store.allItems()).find((x) => /^Chat\.gif/i.test(x.name || ''));
    return it ? it.fileId : null;
  });
  if (!cid) { console.log('HOST-ERROR no Chat.gif in the seeded store'); process.exit(1); }
  console.log('HOST chat fileId=' + cid);

  await page.goto(BASE + '/meet.html#id=' + cid);
  await page.waitForSelector('iframe', { timeout: 60000 });
  // Clear the host's own Abilities panel so it cannot swallow the Invite click.
  await page.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});
  await page.waitForSelector('.perm-modal', { state: 'detached', timeout: 6000 }).catch(() => {});

  await page.evaluate(() => document.getElementById('appinvite').click());
  await page.waitForSelector('#inv-go', { timeout: 15000 });
  await page.evaluate(() => document.getElementById('inv-go').click());
  await page.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 60000 });
  const link = await page.locator('#share-url').inputValue();
  console.log('LINK ' + link);
  console.log('HOST-READY');

  // Stay in the room. The joiner needs a live owner to serve the app bytes.
  const stop = () => { browser.close().catch(() => {}); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  for (;;) await sleep(3600000);
})().catch((e) => { console.log('HOST-ERROR ' + String(e).slice(0, 300)); process.exit(1); });
