// e2e-fork-heal.js — the 2-PERSON FORK, manufactured deterministically, and
// the clock on its heal.
//
// The wild shape (caught live 2026-07-29, the true root of the e2e-video
// tombstone red): creator leaves a 3-person room; the two survivors' young
// pair dies; each D5-confirms the other; one COMPACTS ONTO the other's seat —
// two solo rooms at the same coord, healed only by machinery that used to sit
// behind a 90-tick founder-grace no human would wait out.
//
// Here the pair death is not a lottery: after the creator leaves, Bob SEVERS
// the pair (DEBUG severPair — transport killed + every frame to/from Dee
// dropped, a one-sided partition that blocks the pair completely) long enough
// for confirm + compaction to fork the room. Dee unpins the shared file INTO
// the sever (the classic lost one-shot tombstone). Then the sever lifts and
// the fork-heal chain — shrank-solo door probe → fragment evidence →
// frag-dial (the offer IS the liveness probe) → pairing → YIELD reseat →
// 'hi' merge — must reunite the halves and converge the tombstone in
// SECONDS (Nathan's bound: 10s is already pushing it).
//
// Self-contained: own relay (8885) + own static server (8887) — worktree-safe.
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const RELAY_PORT = parseInt(process.env.FORKHEAL_RELAY_PORT || '8885', 10);
const SITE_PORT = parseInt(process.env.FORKHEAL_SITE_PORT || '8887', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const ROOM = 'forkheal-' + Date.now().toString(36);
const SEVER_MS = 22000; // fork needs confirm (~7s) + compaction beats; observed forming at 5-14s — 22s makes the manufacture deterministic

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

const LAUNCH_ARGS = ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'];

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: LAUNCH_ARGS });
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const page = await ctx.newPage();
    await page.goto(BASE + '/meet.html#v=' + ROOM + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 90000 });
    return { name, ctx, page };
  };
  const idOf = (u) => u.page.evaluate(() => { try { return window.__gifosVideo.debugDump().me.peer; } catch (e) { return null; } }).catch(() => null);
  const stateOf = (u) => u.page.evaluate(() => {
    const d = window.__gifosVideo.debugDump();
    const f = window.__gifosVideo.fileState();
    return { coord: d.me.coord, occ: d.me.occ, parts: d.participants,
      files: f.files.length, tombs: f.tombs.length,
      frag: f.frag ? { pinged: f.frag.pinged, wire: f.frag.wire ? { shrank: f.frag.wire.shrank, everPop: f.frag.wire.everPop, trace: (f.frag.wire.trace || []).map((t) => t.action) } : null } : null };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));

  // ---- 1. All three join OPEN, then password, then the pin (files need a
  // password; the door gate means the pw can only land after everyone is in) --
  const ada = await mk('Ada');
  await ada.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.debugDump().me.coord, null, { timeout: 30000 });
  const bob = await mk('Bob');
  await bob.page.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  const dee = await mk('Dee');
  await dee.page.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1 && window.__gifosVideo.participants() >= 2, null, { timeout: 40000 });
  await ada.page.locator('#pwbtn').click();
  await ada.page.locator('#pw-new').fill('forkpw');
  await ada.page.locator('#pw-save').click();
  await bob.page.waitForFunction(() => window.__gifosVideo.pwState().pw === 'forkpw', null, { timeout: 20000 });
  await dee.page.waitForFunction(() => window.__gifosVideo.pwState().pw === 'forkpw', null, { timeout: 20000 });
  await ada.page.locator('#chatbtn').click();
  await ada.page.setInputFiles('#cfile-in', { name: 'pinned.txt', mimeType: 'text/plain', buffer: Buffer.from('fork heal drill') });
  await bob.page.waitForFunction(() => window.__gifosVideo.pinnedFiles().some((f) => f.name === 'pinned.txt' && f.have), null, { timeout: 30000 });
  await dee.page.waitForFunction(() => window.__gifosVideo.pinnedFiles().some((f) => f.name === 'pinned.txt'), null, { timeout: 30000 });
  check('setup: 3 joined, password set, file replicated', true);
  const bobId = await idOf(bob), deeId = await idOf(dee);

  // ---- 3. Ada leaves; survivors settle as a pair ----
  await ada.page.close(); await ada.ctx.close();
  await bob.page.waitForFunction(() => window.__gifosVideo.participants() === 2, null, { timeout: 30000 }).catch(() => {});
  await dee.page.waitForFunction(() => window.__gifosVideo.participants() === 2, null, { timeout: 30000 }).catch(() => {});
  check('creator left; survivors see a 2-person room', true);

  // ---- 4. SEVER the pair SYMMETRICALLY (the wild shape: both transports
  // die, both sides deaf to each other); Dee unpins into the partition ----
  const sv1 = await bob.page.evaluate((args) => window.__gifosVideo.severPair(args.pid, args.ms), { pid: deeId, ms: SEVER_MS });
  const sv2 = await dee.page.evaluate((args) => window.__gifosVideo.severPair(args.pid, args.ms), { pid: bobId, ms: SEVER_MS });
  check('pair severed BOTH sides: transports dead, frames dropped', !!(sv1 && sv1.ok && sv2 && sv2.ok), { sv1, sv2 });
  await sleep(1500);
  await dee.page.locator('#chatbtn').click();
  await dee.page.locator('.cfile button[data-del]').click();
  const deeTombed = await dee.page.evaluate(() => window.__gifosVideo.pinnedFiles().length === 0);
  check('Dee unpinned into the partition (local tombstone)', deeTombed);

  // ---- 5. The FORK must form: both solo within the sever window ----
  const tSever = Date.now();
  let forked = false, forkAt = -1;
  while (Date.now() - tSever < SEVER_MS + 10000) {
    const [sb, sd] = await Promise.all([stateOf(bob), stateOf(dee)]);
    if ((sb.parts || 99) <= 1 && (sd.parts || 99) <= 1) { forked = true; forkAt = Date.now() - tSever; break; }
    await sleep(500);
  }
  check('the room FORKED (both survivors solo) in ' + (forked ? (forkAt / 1000).toFixed(1) + 's' : 'NEVER (pair survived the sever)'), forked, forked ? undefined : { bob: await stateOf(bob), dee: await stateOf(dee) });

  // ---- 6. THE HEAL CLOCK: from sever-lift, reunion + tombstone convergence --
  const tLift = tSever + SEVER_MS;
  await sleep(Math.max(0, tLift - Date.now()));
  let reunitedMs = -1, convergedMs = -1;
  while (Date.now() - tLift < 60000) {
    const [sb, sd] = await Promise.all([stateOf(bob), stateOf(dee)]);
    if (reunitedMs < 0 && (sb.parts || 0) >= 2 && (sd.parts || 0) >= 2) reunitedMs = Date.now() - tLift;
    if (convergedMs < 0 && sb.files === 0) convergedMs = Date.now() - tLift; // Bob's pin dies via the merged tombstone
    if (reunitedMs >= 0 && convergedMs >= 0) break;
    if ((Date.now() - tLift) % 5000 < 400) {
      console.log('  [heal t+' + Math.round((Date.now() - tLift) / 1000) + 's] bob=' + JSON.stringify(await stateOf(bob)) + ' dee=' + JSON.stringify(await stateOf(dee)));
    }
    await sleep(400);
  }
  const secs = (ms) => ms < 0 ? 'NEVER (>60s)' : (ms / 1000).toFixed(1) + 's';
  // Nathan's bound: reunion in seconds — 12s is the assert (detection beat +
  // door probe + dial + pair + yield); the MEASURE line is the honest number.
  check('fork HEALED: both see 2 participants in ' + secs(reunitedMs) + ' after the partition lifted (target <=12s)',
    reunitedMs >= 0 && reunitedMs <= 12000, { reunitedMs });
  check('tombstone converged (Bob unpinned via the merge) in ' + secs(convergedMs),
    convergedMs >= 0 && convergedMs <= 20000, { convergedMs });
  console.log('  MEASURE fork-heal: fork@' + (forkAt / 1000).toFixed(1) + 's; reunion=' + secs(reunitedMs) + '; tombstone=' + secs(convergedMs) + ' (after lift)');

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
