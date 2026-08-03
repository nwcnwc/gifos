// e2e-peer-relay-reunion.js — E5 §1 friend-relay among CO-MEMBERS of ONE
// meeting (healing-laws E5, media-plane friend-relay, roadmap §3 B).
//
// Scope of this drill (do NOT confuse with E5 §2 / R5):
//   §1 OK  — people already in the SAME chosen meeting; ICE fails between a
//            pair; a third co-member can reach both → friend-relay ("via Hub").
//   §2 NO  — a newcomer who can SEE TWO meetings must pick one (R5 UI), never
//            auto-become the peer-relay that merges them (attacker-shaped).
// This file only proves §1. It is NOT a two-meeting merge test.
//
// Scenario (split first, then third co-member):
//   1. LeftIsle opens a room; RightIsle joins with ICE to LeftIsle blocked.
//      Assert: no direct media (no "via Hub" yet) — co-member ICE island.
//   2. Hub joins THE SAME room (can ICE to both). Assert: friend-relay both
//      ways ("via Hub" + live frames).
//
// Self-contained: own relay + site for this checkout. Safe from a worktree.
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');


const RELAY_PORT = parseInt(process.env.REUNION_RELAY_PORT || '8831', 10);
const SITE_PORT = parseInt(process.env.REUNION_SITE_PORT || '8833', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_DEV: '1',
      TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  // Drain stdout ALWAYS (an unread pipe blocks the relay once full); print it
  // under RELAY_DEBUG — the [route] DELIVERED/NOSOCK trace is the decisive
  // witness for "offer sent but never delivered" in the one-sided-stall hunt.
  relay.stdout.on('data', (d) => { if (process.env.RELAY_DEBUG) process.stdout.write('[relay] ' + d); });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d',
    path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });

  const setup = (name, iceBlock) => ({
    content: (iceBlock ? 'window.__gifosBlockIce=' + JSON.stringify(iceBlock) + ';' : '')
      + "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "');"
      + "localStorage.setItem('gifos_meet_bar','0')}catch(e){}",
  });

  const newUser = async (name, iceBlock) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name, iceBlock));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + '] ' + m.text()); });
    return { name, ctx, page };
  };

  // Tile for a named peer: via-Hub label + live video frames.
  const tileViaHub = (name) => () => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes(name));
    const v = t && t.querySelector('video');
    return !!(t && /via Hub/.test(t.textContent) && !t.classList.contains('noroute')
      && v && v.srcObject && v.videoWidth > 0);
  };
  const tileNoDirectMedia = (name) => () => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes(name));
    if (!t) return false;
    // Split is real: no live direct video (noroute label and/or no frames).
    const v = t.querySelector('video');
    const viaHub = /via Hub/.test(t.textContent);
    const frames = !!(v && v.srcObject && v.videoWidth > 0);
    return !viaHub && (!frames || t.classList.contains('noroute'));
  };

  // ── Phase 1: the split exists BEFORE any bridge ──────────────────────────
  // THE SPLIT IS STATED AT PAGE-INIT ON BOTH ENDS, by NAME. A peer id is
  // H(pubkey), minted at page boot, so LeftIsle could only be told rightId
  // after RightIsle existed — and one side's candidates are enough to connect
  // on a LAN (the far end learns the address peer-reflexively from the
  // incoming STUN binding), so any dial inside that window produced live media
  // between the "split" islands and the drill's own premise failed
  // (splitLeft:false, measured). The window stayed shut while dialling was
  // id-order-gated; a seat with no open channel now dials every neighbour the
  // mesh names, so it opens on most runs. Names are known before any page
  // loads — no window, and the block stays narrow (Hub must ICE to both).
  const left = await newUser('LeftIsle');
  await left.page.goto(BASE + '/meet.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await left.page.locator('#lob-open').click();
  await left.page.waitForFunction(() => {
    const el = document.getElementById('share-url');
    return el && el.value && /#v=/.test(el.value);
  }, null, { timeout: 20000 });
  const link = await left.page.locator('#share-url').inputValue();
  console.log('room: ' + link);
  await left.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const leftId = await left.page.evaluate(() => {
    try { return window.__gifosVideo.debugDump().me.peer; } catch (e) { return null; }
  });
  check('LeftIsle founded a room and has a peer id', !!leftId, leftId);

  // RightIsle knows leftId before it boots (LeftIsle founded the room), so its
  // half of the blackhole is exact from page-init; LeftIsle is told rightId as
  // soon as RightIsle HAS an id — its peer id is H(pubkey), minted at page
  // boot, well before it seats and long before LeftIsle can learn of it
  // through the mesh. (Waiting for the SEAT, as this drill used to, left
  // LeftIsle unblocked across the whole join; one side's candidates are enough
  // on a LAN, so a dial in that window would make live media between the
  // "split" islands. Blocking '*' on LeftIsle instead is NOT the answer: it
  // churns its pairs and Hub then finds no links at all — measured.)
  const right = await newUser('RightIsle', [leftId]);
  await right.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const rightId = await right.page.waitForFunction(
    () => { try { return window.__gifosVideo.debugDump().me.peer || null; } catch (e) { return null; } },
    null, { timeout: 45000 }).then((h) => h.jsonValue());
  await left.page.evaluate((pid) => { window.__gifosBlockIce = [pid]; }, rightId);
  await right.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.meshState
    && window.__gifosVideo.meshState() && window.__gifosVideo.meshState().state === 3, null, { timeout: 45000 });
  check('RightIsle seated (control plane can still meet via greeters)', !!rightId, rightId);

  // Cameras ON for everyone (meet starts cam-off; same idiom as e2e-latejoin).
  // Without a VIDEO track there is nothing for Hub to forward and the via-Hub
  // frame assertions are unpassable by construction — this drill shipped with
  // that hole and was red from birth.
  const camOn = (u) => u.page.evaluate(() => { const c = document.getElementById('cam'); if (c && c.classList.contains('off')) c.click(); }).catch(() => {});
  await camOn(left); await camOn(right);

  // Wait past the noRoute grace (~15s) so the split is visible, not a slow offer.
  await sleep(18000);
  // …and wait for the far side to be KNOWN before judging it. tileNoDirectMedia
  // returns false when it finds no tile, which reads as "not split" — but a
  // tile is labelled with the peer's NAME, and the name arrives with that
  // peer's first status or offer. A split pair exchanges neither promptly
  // (measured on a failing run: LeftIsle at rx.status=0, the name landing off
  // the 4th offer just after the fixed 18s sample), so the drill was sampling
  // BEFORE its own premise was observable and calling that a leak. Requiring
  // the tile first makes the assertion stronger, not weaker: the far side is
  // known to this page AND has no media path to it.
  const tileKnown = (name) => () => !!Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes(name));
  await left.page.waitForFunction(tileKnown('RightIsle'), null, { timeout: 30000 }).catch(() => {});
  await right.page.waitForFunction(tileKnown('LeftIsle'), null, { timeout: 30000 }).catch(() => {});
  const splitLeft = await left.page.evaluate(tileNoDirectMedia('RightIsle')).catch(() => false);
  const splitRight = await right.page.evaluate(tileNoDirectMedia('LeftIsle')).catch(() => false);
  // Also assert neither side already has via-Hub (no bridge exists yet).
  const earlyHubL = await left.page.evaluate(tileViaHub('RightIsle')).catch(() => false);
  const earlyHubR = await right.page.evaluate(tileViaHub('LeftIsle')).catch(() => false);
  check('split is real: LeftIsle has no direct media to RightIsle (and no via Hub)',
    splitLeft && !earlyHubL, { splitLeft, earlyHubL });
  check('split is real: RightIsle has no direct media to LeftIsle (and no via Hub)',
    splitRight && !earlyHubR, { splitRight, earlyHubR });

  // ── Phase 2: the bridge peer joins ───────────────────────────────────────
  const hub = await newUser('Hub');
  await hub.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await hub.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.meshState
    && window.__gifosVideo.meshState() && window.__gifosVideo.meshState().state === 3, null, { timeout: 45000 });
  // Hub should open live links to both islands (it is not ICE-blocked).
  // 90s, not 45: Hub seats and then completes TWO ICE negotiations, and on a
  // loaded gate box (this drill runs beside the rest of the battery) that has
  // been measured taking past 45s — the assertion below is unchanged, this is
  // only how long we are willing to wait for it. Flagged FLAKY by the gate at
  // 45s (liveLinks()=0 — ZERO, not one-of-two), green on the retry.
  // FORENSICS: sample all three pages while waiting, print the timeline only
  // if the leg fails — a bare "0" cannot say whether Hub never dialled, its
  // offers were refused (seat not yet learned), or ICE genuinely stalled.
  const sample = (u) => u.page.evaluate(() => {
    try {
      const V = window.__gifosVideo; const d = V.debugDump();
      return { live: V.liveLinks(), st: d.me.state, coord: d.me.coord,
        links: d.me.links, occ: d.me.occ, tx: V.txStats(), rx: V.rxStats(),
        pairs: V.pairs(), // raw WebRTC per-pair state — the glare cycle is only visible here
        starve: window.__starve ? { kicked: window.__starve.kicked, why: window.__starve.why } : null,
        roster: (d.roster || []).map((r) => (r.name || '?') + ':' + (r.conn ? 'Y' : 'n') + (r.relay ? '+via' : '')) };
    } catch (e) { return { err: String(e && e.message || e).slice(0, 60) }; }
  }).catch(() => ({ err: 'eval-failed' }));
  const timeline = [];
  const t0abs = Date.now(); // t+0 = Hub seated
  const hubDeadline = t0abs + 90000;
  let hubLinks = -1;
  while (Date.now() < hubDeadline) {
    const [h, l, r] = await Promise.all([sample(hub), sample(left), sample(right)]);
    timeline.push({ t: Math.round((Date.now() - t0abs) / 1000), hub: h, left: l, right: r });
    hubLinks = (h && h.live != null) ? h.live : -1;
    if (hubLinks >= 2) break;
    await sleep(3000);
  }
  const wireSecs = Math.round((Date.now() - t0abs) / 1000);
  console.log('  hub-links timeline: ' + timeline.map((s) => s.t + 's=' + (s.hub && s.hub.live != null ? s.hub.live : '?')).join(' ') + ' (2 links @' + (hubLinks >= 2 ? wireSecs + 's' : 'NEVER') + ')');
  check('Hub (bridge peer) has live links to both islands', hubLinks >= 2, hubLinks);
  // Forensics on failure AND on slow wiring (>12s = a watchdog had to rescue
  // it): the slow pass is the recoverable face of the never-wires flake, and
  // at ~1-in-15 it is the specimen we can actually catch.
  if (hubLinks < 2 || wireSecs > 12) for (const s of timeline) console.log('  [forensics t+' + s.t + 's] ' + JSON.stringify(s));
  await camOn(hub); // Hub's camera on too (its own feed rides beside the forwards)

  // Peer-relay asks after ~10s of downSince; allow wall-clock room for
  // connsOf gossip + relay-req + renegotiation + first frames.
  // Forensics: WHY a tile isn't via-Hub yet (label vs noroute vs frames), plus
  // the same page sample as the hub-links leg — a one-way engagement failure
  // (seen 2026-08-03: Right healed, chat crossed, Left never) is otherwise a
  // bare boolean.
  const tileState = (name) => (n) => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes(n));
    if (!t) return { found: false };
    const v = t.querySelector('video');
    return { found: true, viaHub: /via Hub/.test(t.textContent), noroute: t.classList.contains('noroute'),
      vid: !!(v && v.srcObject), vw: v ? v.videoWidth : -1 };
  };
  let leftHealed = false, rightHealed = false;
  const healTl = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 55000) {
    if (!leftHealed) leftHealed = await left.page.evaluate(tileViaHub('RightIsle')).catch(() => false);
    if (!rightHealed) rightHealed = await right.page.evaluate(tileViaHub('LeftIsle')).catch(() => false);
    const [lt, rt, ls, rs, hs] = await Promise.all([
      left.page.evaluate(tileState('RightIsle'), 'RightIsle').catch(() => null),
      right.page.evaluate(tileState('LeftIsle'), 'LeftIsle').catch(() => null),
      sample(left), sample(right), sample(hub)]);
    healTl.push({ t: Math.round((Date.now() - t0) / 1000), leftTile: lt, rightTile: rt, left: ls, right: rs, hub: hs });
    if (leftHealed && rightHealed) break;
    await sleep(2000);
  }
  check('E5§1: after co-member Hub joins same room, LeftIsle sees RightIsle via Hub', leftHealed);
  check('E5§1: after co-member Hub joins same room, RightIsle sees LeftIsle via Hub', rightHealed);
  if (!leftHealed || !rightHealed) for (const s of healTl) console.log('  [heal-forensics t+' + s.t + 's] ' + JSON.stringify(s));

  // Optional control-plane hop: chat Left → Hub → Right (gossip over DCs).
  try {
    await left.page.locator('#chatbtn').click({ timeout: 3000 }).catch(() => {});
    await left.page.locator('#chat-in').fill('across the seam');
    await left.page.locator('#chatform button[type=submit]').click();
    await right.page.waitForFunction(() => {
      try { return window.__gifosVideo.chatTexts().includes('across the seam'); } catch (e) { return false; }
    }, null, { timeout: 20000 });
    check('chat hops across the seam through the bridge peer', true);
  } catch (e) {
    check('chat hops across the seam through the bridge peer', false, String(e && e.message || e).slice(0, 80));
  }

  await browser.close();
  cleanup();
  console.log(failures
    ? '\n' + failures + ' FAILED — E5§1 friend-relay among co-members did not engage'
    : '\nALL PASS — E5§1: ICE-split co-members recover via a third co-member (not a two-meeting merge)');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(2); });
