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
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || (require('fs').existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome'
      : '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
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
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
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

  // RightIsle cannot ICE to LeftIsle (and LeftIsle will refuse RightIsle once
  // the block is known — we also push the reverse block after RightIsle sits).
  const right = await newUser('RightIsle', [leftId]);
  await right.page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await right.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.meshState
    && window.__gifosVideo.meshState() && window.__gifosVideo.meshState().state === 3, null, { timeout: 45000 });
  const rightId = await right.page.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  // Symmetric ICE blackhole: LeftIsle also drops RightIsle's candidates.
  await left.page.evaluate((pid) => { window.__gifosBlockIce = [pid]; }, rightId);
  check('RightIsle seated (control plane can still meet via greeters)', !!rightId, rightId);

  // Wait past the noRoute grace (~15s) so the split is visible, not a slow offer.
  await sleep(18000);
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
  await hub.page.waitForFunction(() => {
    try { return window.__gifosVideo.liveLinks() >= 2; } catch (e) { return false; }
  }, null, { timeout: 45000 }).catch(() => {});
  const hubLinks = await hub.page.evaluate(() => {
    try { return window.__gifosVideo.liveLinks(); } catch (e) { return -1; }
  });
  check('Hub (bridge peer) has live links to both islands', hubLinks >= 2, hubLinks);

  // Peer-relay asks after ~10s of downSince; allow wall-clock room for
  // connsOf gossip + relay-req + renegotiation + first frames.
  let leftHealed = false, rightHealed = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 55000) {
    if (!leftHealed) leftHealed = await left.page.evaluate(tileViaHub('RightIsle')).catch(() => false);
    if (!rightHealed) rightHealed = await right.page.evaluate(tileViaHub('LeftIsle')).catch(() => false);
    if (leftHealed && rightHealed) break;
    await sleep(2000);
  }
  check('E5§1: after co-member Hub joins same room, LeftIsle sees RightIsle via Hub', leftHealed);
  check('E5§1: after co-member Hub joins same room, RightIsle sees LeftIsle via Hub', rightHealed);

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
