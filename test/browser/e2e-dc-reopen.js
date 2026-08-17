// e2e-dc-reopen.js — A DATACHANNEL THAT CLOSED MUST BE REPLACED, NOT MOURNED.
//
// The shape this guards, measured on a real phone joining a real room over a
// real relay (2026-08-17, the FPS Simple deathmatch):
//
//   parts=2 app=true host=false pend=0 [k_9c:dc=closed/connected stAge=5886]
//
// ICE connected. Roster right. App mounted. DataChannel CLOSED. App state moves
// only to peers whose channel is open (run.html sgaFan; everything else queues
// in sgaPending and expires), so for as long as that lasts the guest sits
// inside a room it can see, receiving nothing.
//
// SAY HONESTLY WHAT THAT SAMPLE IS AND IS NOT. It is ONE reading, from a phone
// that was also swap-thrashing (3.7 of 3.86 GB used, 1.5 GB of swap), and it is
// NOT evidence that the defects below caused that run's wedge — the phone was
// too busy to answer a second debugger at all. What sent us looking was the
// reading; what we found was independently wrong, and is what this file pins.
//
// Two separate places both asked "is there a channel?" when they meant "is
// there a channel that can carry anything":
//
//   - sendOffer's `if (!p.dc)` — a closed RTCDataChannel is still an object, so
//     every re-offer, ICE restart and rebuild kept the corpse and negotiated a
//     session with no working data lane at all.
//   - the heartbeat's dc-watchdog gated on `!heardPid` — right for a pair that
//     has never said anything, wrong for one that talked happily and then lost
//     its channel, because "heard" is a memory and this is about now.
//
// WHY THIS IS NOT severPair. severPair kills the whole transport, which the
// mesh correctly reads as a death and heals through the death path. This is the
// nastier shape: every health signal a page has still says connected, and only
// the lane that carries app state is gone. __gifosVideo.killDcForTest(pid)
// manufactures exactly that, so the recovery being asserted is the DC repair
// and not the death-detection machinery standing in for it.
//
// THE DAMAGE IS ASSERTED BEFORE THE REPAIR, because a recovery test whose
// damage never landed is a test that passes on an untouched room.
//
// AND THE REPAIR IS ASKED TWICE, NARROW THEN WIDE. A room has several healers,
// and the widest of them — the starve edge, at 12s of unexplained silence —
// rebuilds the whole transport, which resets p.dc to null and so heals this
// even with the defects in place (measured: this suite passed on the unfixed
// code, in 20s, by that route). A leg that both versions pass guards nothing.
// So the narrow question goes first and inside 8s: on a pc that KEEPS ITS OWN,
// does a re-offer restore the lane? That one fails without the fix. The wide
// leg then stays, because "the room heals itself, unasked" is the product law
// a player actually depends on and nothing else pinned it.
//
// One box is enough. Every question here is about STATE — is there an open
// channel, did a beat cross — and a slow box gives the same answers.
// Needs: static server on 8099, local relay on 8790.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
// The repair is deliberately unhurried: a 5s settle before the watchdog will
// touch a pair, a 10s throttle on its kicks, and a heartbeat that only looks
// every few seconds. Budget several beats — this suite asks WHETHER it heals.
const HEAL_MS = Number(process.env.DC_HEAL_MS || 90000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream',
           '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });
    return ctx;
  };
  try {
    const aCtx = await newUser('Ada');
    const a = await aCtx.newPage();
    a.on('pageerror', (e) => console.log('  [Ada] ' + e.message.slice(0, 160)));
    // DEBUG=on is what arms killDcForTest — the hook refuses without it.
    await a.goto(BASE + '/run.html#DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await a.locator('#lob-open').click();
    await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 30000 });
    const link = await a.evaluate(() => document.getElementById('share-url').value);

    const bCtx = await newUser('Ben');
    const b = await bCtx.newPage();
    b.on('pageerror', (e) => console.log('  [Ben] ' + e.message.slice(0, 160)));
    await b.goto(link + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await a.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 60000 });
    await b.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 60000 });
    check('the pair forms an open DataChannel to begin with',
      (await a.evaluate(() => window.__gifosVideo.liveDataLinks())) >= 1);
    await sleep(3000);   // let the first beats settle so the baseline is real

    const benId = (await a.evaluate(() => window.__gifosVideo.peerIds()))[0];
    const before = await a.evaluate(() => window.__gifosVideo.txStats().dcStatus);

    /* ---- the damage: the channel only, never the transport ---- */
    const killed = await a.evaluate((pid) => window.__gifosVideo.killDcForTest(pid), benId);
    check('the DEBUG hook closed the channel', !!(killed && killed.ok), JSON.stringify(killed));
    const hurt = await a.evaluate((pid) => window.__gifosVideo.icePairFor(pid), benId);
    check('...and this is the shape that was seen in the wild: dc closed, ICE still connected',
      !!hurt && hurt.dc !== 'open' && /connected|completed/.test(String(hurt.ice)),
      'dc=' + (hurt && hurt.dc) + ' ice=' + (hurt && hurt.ice));
    check('...so the lane that carries app state really is gone',
      (await a.evaluate(() => window.__gifosVideo.liveDataLinks())) === 0,
      'liveDataLinks=' + (await a.evaluate(() => window.__gifosVideo.liveDataLinks())));

    /* ---- LEG 1: a bare re-offer must restore the lane ----
     * This is the leg that DISCRIMINATES, and the window is tight on purpose.
     * A room has more than one healer: on an unstarved box the starve edge
     * notices 12s of silence and rebuilds the whole transport, which resets
     * p.dc to null and hides the defect entirely — measured, this suite passed
     * on the unfixed code in 20s by that route. So ask the narrower question
     * first, inside 8s, before any other healer can answer it: given a pc that
     * KEEPS ITS OWN (reofferForTest, never rebuildPair), does renegotiating
     * bring back a channel that can carry something? With `if (!p.dc)` it
     * cannot — the corpse is still an object, so no new channel is ever made. */
    await a.evaluate((pid) => window.__gifosVideo.reofferForTest(pid), benId);
    let reopened = false;
    for (let i = 0; i < 8; i++) {
      await sleep(1000);
      if ((await a.evaluate(() => window.__gifosVideo.liveDataLinks())) >= 1) { reopened = true; break; }
    }
    check('a re-offer on the SAME pc makes a new channel — a closed one cannot be reused',
      reopened, reopened ? 'open again' : 'still no open channel 8s after the re-offer');

    /* ---- LEG 2: and the room heals itself, unasked ---- */
    let healed = false, ms = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < HEAL_MS) {
      const [la, lb] = await Promise.all([a, b].map((p) => p.evaluate(() => window.__gifosVideo.liveDataLinks()).catch(() => 0)));
      if (la >= 1 && lb >= 1) { healed = true; ms = Date.now() - t0; break; }
      await sleep(2000);
    }
    check('a NEW open channel replaces the closed one, on both sides',
      healed, healed ? 'in ' + Math.round(ms / 1000) + 's' : 'still none after ' + Math.round(HEAL_MS / 1000) + 's');

    if (healed) {
      const pair = await a.evaluate((pid) => window.__gifosVideo.icePairFor(pid), benId);
      check('...and it reads open, not merely present',
        !!pair && pair.dc === 'open', 'dc=' + (pair && pair.dc) + ' ice=' + (pair && pair.ice));
      // A channel object that exists proves the plumbing; a beat crossing it
      // proves the room can actually talk again, which is the product claim.
      await sleep(14000);   // > 3 heartbeat ticks
      const after = await a.evaluate(() => window.__gifosVideo.txStats().dcStatus);
      check('...and heartbeats ride it again', after - before >= 2, (after - before) + ' DC beats after the kill');
    }

    check('nobody was dropped from the room over a channel that could be replaced',
      (await a.evaluate(() => window.__gifosVideo.participants())) >= 2
      && (await b.evaluate(() => window.__gifosVideo.participants())) >= 2,
      'ada=' + (await a.evaluate(() => window.__gifosVideo.participants()))
      + ' ben=' + (await b.evaluate(() => window.__gifosVideo.participants())));
  } finally {
    await browser.close();
  }
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
