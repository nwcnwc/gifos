// e2e-pw-heal.js — §LOCK GRANT HEALING drill (the DC-rebuild orphan, healed).
//
// The recorded sharp edge: the pwinfo grant is a one-shot flood, and a present
// member whose transport is mid-rebuild at save time misses it — before grant
// healing that member was cryptographically orphaned while standing in the
// room (e011881 recorded the edge; the delayed-rotation fix was tried and
// reverted for breaking R6). Healing makes the password STATE: one previous
// key generation is retained, a neighbour's frame that opens only under it IS
// the staleness signal, and the retained signed grant is replayed one hop.
//
// This drill MANUFACTURES the orphan deterministically: Ben's pair to Ada is
// force-rebuilt (debug hook) and Ada saves a new password into that exact
// window. Then it asserts the heal: Ben converges to the new password and
// epoch through the previous-key recognition path, and the pair speaks again.
//
// Self-contained: spawns its own relay + site (gate drills tier picks it up).
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');

const RELAY_PORT = parseInt(process.env.PWHEAL_RELAY_PORT || '8881', 10);
const SITE_PORT = parseInt(process.env.PWHEAL_SITE_PORT || '8883', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); if (!c) failures++; };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT) }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  process.on('exit', () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} });
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const room = 'pwh' + Math.random().toString(36).slice(2, 7);
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    await pg.goto(BASE + '/meet.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
    return pg;
  };

  const ada = await mk('Ada');
  const ben = await mk('Ben');
  ada.on('console', (m) => { const t = String(m.text()); if (/grant-heal|rekey|pwinfo/.test(t)) console.log('  [ada]', t.slice(0, 120)); });
  ben.on('console', (m) => { const t = String(m.text()); if (/grant-heal|rekey|pwinfo/.test(t)) console.log('  [ben]', t.slice(0, 120)); });
  for (const pg of [ada, ben]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('Ada and Ben meshed (open DCs)', true);
  // Young-pair settle: the orphan below must come from OUR forced rebuild,
  // not a natural first-seconds one.
  await sleep(9000);
  for (const pg of [ada, ben]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 20000 });

  // Ada sets the FIRST password normally; both must adopt it.
  await ada.locator('#pwbtn').click();
  await ada.locator('#pw-new').fill('pw-one');
  await ada.locator('#pw-save').click();
  await ben.waitForFunction(() => window.__gifosVideo.pwState && window.__gifosVideo.pwState().pw === 'pw-one', null, { timeout: 20000 });
  const ep1 = await ben.evaluate(() => window.__gifosVideo.pwState().epoch);
  check('first password reaches Ben (grant flood, epoch advanced)', ep1 >= 1, { ep1 });
  // Baseline for the heal wait below: .pw flips at storePw, BEFORE the async
  // derive installs the new key (rekeyAt bumps only then). Speaking into that
  // window loses the frame (sealed-across-a-rotation frames drop; events are
  // not re-minted) — so every "adopted, now speak" gate waits on rekeyAt too.
  await ben.waitForFunction(() => window.__gifosVideo.pwState().rekeyAt > 0, null, { timeout: 10000 });
  const rekey1 = await ben.evaluate(() => window.__gifosVideo.pwState().rekeyAt);

  // ---- MANUFACTURE THE ORPHAN: rebuild the pair, save pw-two into the window.
  // The rebuild runs on whichever side is the pair's designated INITIATOR
  // (higher peer id) so the fresh offer flows immediately and the pair
  // reforms deterministically — the orphan only needs the SHARED pair to be
  // down at save time, and Ben (the grant misser) misses the flood either
  // way because sendAll skips a closed DC and gossip rides the same pair.
  const adaId = await ada.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const benId = await ben.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const rebuilder = benId > adaId ? ben : ada;
  const target = benId > adaId ? adaId : benId;
  const reb = await rebuilder.evaluate((pid) => window.__gifosVideo.rebuildPair(pid), target);
  check('pair force-rebuilt from the initiator side (orphan window open)', !!(reb && reb.ok), reb);
  // Ada saves IMMEDIATELY — the grant flood happens while the pair is down.
  await ada.locator('#pwbtn').click();
  await ada.locator('#pw-new').fill('pw-two');
  await ada.locator('#pw-save').click();
  await ada.waitForFunction(() => window.__gifosVideo.pwState().pw === 'pw-two', null, { timeout: 10000 });
  check('Ada is on pw-two', true);

  // The pair must REFORM before healing can flow (Ben's stale beats need a
  // channel to arrive on) — gate on it, generously; the heal window starts
  // only once the transports speak again. 90s: the drill's premise only
  // needs the pair DOWN at save time — how long reform takes is the mesh's
  // own dial/starve-rebuild backoff budget, which lawfully eats an extra
  // cycle ~1/5 runs (same tail as the reload-rejoin below).
  for (const pg of [ada, ben]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 90000 });
  check('the rebuilt pair reformed (DCs open again)', true);

  // The heal: Ben's stale frames (previous key) are recognized by Ada, who
  // replays the retained grant one hop. Ben must converge WITHOUT any reload.
  let healed = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const st = await ben.evaluate(() => window.__gifosVideo.pwState()).catch(() => null);
    if (st && st.pw === 'pw-two' && st.rekeyAt > rekey1) { healed = true; break; } // rekeyAt: the NEW key is installed, not merely announced
    await sleep(500);
  }
  const benSt = await ben.evaluate(() => window.__gifosVideo.pwState()).catch(() => null);
  check('HEAL: Ben converges to pw-two without reload (grant replayed over the pair)', healed, benSt);
  const adaSt = await ada.evaluate(() => window.__gifosVideo.pwState());
  check('epochs agree after healing', !!(benSt && benSt.epoch === adaSt.epoch), { ben: benSt && benSt.epoch, ada: adaSt.epoch });

  // The pair speaks the new key: a chat line crosses it.
  await ada.evaluate(() => { document.getElementById('chatbtn').click(); });
  await ada.locator('#chat-in').fill('healed room says hi');
  await ada.locator('#chat-in').press('Enter');
  await ben.waitForFunction(() => window.__gifosVideo.chatTexts().includes('healed room says hi'), null, { timeout: 15000 });
  check('chat flows on the new key after healing', true);

  // ---- RELOAD: the epoch must SURVIVE (persisted beside the password) ------
  // The recorded post-reload hole: pwEpoch lived only in memory, so a fresh
  // page's replay guard sat at 0 and accepted ANY old grant — a replayed
  // ep-1 pwinfo could roll a reloaded member back to a dead password. The
  // epoch now rides localStorage beside the stored password. Two directions
  // to prove: the reloaded page comes back ARMED (epoch restored, not 0),
  // and a legitimate NEXT rotation still lands (persistence never wedges
  // adoption).
  await ben.reload({ waitUntil: 'domcontentloaded' });
  await ben.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  await ben.waitForFunction(() => window.__gifosVideo.pwState && window.__gifosVideo.pwState().pw === 'pw-two', null, { timeout: 20000 });
  const reSt = await ben.evaluate(() => window.__gifosVideo.pwState());
  check('RELOAD: Ben comes back armed — epoch persisted, not 0', !!(reSt && reSt.epoch === adaSt.epoch), { ben: reSt && reSt.epoch, ada: adaSt.epoch });
  // Young-pair settle before the next rotation (same discipline as the first
  // save): the adoption below must ride the flood or the heal, not luck.
  // 90s, not 40: a reload-rejoin can lawfully eat a dial-backoff cycle before
  // the fresh incarnation pairs (probe-measured 2s typical, 24s+ tail — the
  // reopened tab seats immediately at a NEW cell and the pair dial rides the
  // next occ-driven cycle). Close-and-reopen must converge; it need not race.
  for (const pg of [ada, ben]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 90000 });
  await sleep(9000);
  await ada.locator('#pwbtn').click();
  await ada.locator('#pw-new').fill('pw-three');
  await ada.locator('#pw-save').click();
  // rekeyAt > 0: the reloaded page's first derive is its JOIN key (no bump);
  // only the pw-three rotation bumps it — same installed-not-announced gate.
  // 60s poll, not a bare waitForFunction: the flood can miss a young rebuilt
  // pair (that is the drill's own premise) and the GRANT HEAL then carries
  // the rotation — heartbeat cadence + 5s heal throttle + derive is beats,
  // not milliseconds. A miss must fail the CHECK with both sides' state, not
  // die as a raw TimeoutError.
  let adopted3 = false, st3 = null;
  const t4 = Date.now();
  while (Date.now() - t4 < 60000) {
    st3 = await ben.evaluate(() => window.__gifosVideo.pwState()).catch(() => null);
    if (st3 && st3.pw === 'pw-three' && st3.rekeyAt > 0) { adopted3 = true; break; }
    await sleep(500);
  }
  const ada3 = await ada.evaluate(() => window.__gifosVideo.pwState()).catch(() => null);
  check('RELOAD: the next rotation still adopts (epoch advances past the persisted one)', !!(adopted3 && st3 && st3.epoch > reSt.epoch), { ben: st3, ada: ada3, was: reSt.epoch });

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
