#!/usr/bin/env node
/*
 * squat.js — hold a stage seat in a GifOS room until its owner arrives.
 *
 * One headless Chromium page joins the room, steps onto row 0, and streams a
 * gold "RESERVED" tile from that seat. It reveals NOTHING about who the seat
 * is for — a screen name is public and anyone can change theirs to it, so a
 * name is no key at all. The key is a WATCHWORD only you know: when you
 * arrive, type it in the meeting chat (chat gossip is room-wide, so this
 * works from any section of the stadium). The bot sees it, steps down
 * silently — no announcement, no name, nothing for a bystander to race —
 * and exits. You tap Stage the moment the gold tile vanishes.
 *
 *   node test/squat.js --room mymeeting --code thunderbird
 *   …arrive later, type "thunderbird" in chat, take the stage.
 *
 * Pick a watchword you wouldn't mind saying in public chat once — it is
 * visible in the chat log after you use it, but by then the hand-off has
 * already fired on the first sighting.
 *
 * Options:
 *   --code <word>    REQUIRED: the secret watchword that frees the seat
 *   --room <name>    room to sit in (default: test)
 *   --name <label>   the squatter's own label (default: "Reserved")
 *   --pass <pw>      room password, if locked
 *   --av <hex>       admin verifier, for admin rooms
 *   --base <url>     site origin (default https://gifos.app)
 *   --relay <ws://>  custom relay
 *   --restage 1      re-take the seat if bumped (default: off — see below)
 *
 * Honesty about governance (docs/rows.md): in an OPEN room a squatter has
 * no immunity — it holds a seat exactly as well as a person refusing to
 * move, and the room can vote it off (that's the anarchy principle: no
 * script beats the honest buttons). By default squat.js RESPECTS a bump and
 * keeps watching for the watchword without the seat. For a seat that can't
 * be taken, run YOUR OWN admin room (/meet/<room>/<av>) and squat with
 * --av: there, stage rights are admins + grantees only.
 */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const CODE = (args.code || '').trim().toLowerCase();
if (!CODE) { console.error('squat.js needs --code "<watchword>" — the secret you\'ll type in chat to free the seat.'); process.exit(1); }
const ROOM = args.room || 'test';
const NAME = args.name || 'Reserved';
const PASS = args.pass || '';
const AV = (/^[a-f0-9]{16,64}$/.exec((args.av || '').toLowerCase()) || [''])[0];
const BASE = (args.base || 'https://gifos.app').replace(/\/$/, '');
const RELAY = args.relay || '';
const RESTAGE = !!args.restage && args.restage !== '0';

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright not found — run: npm i playwright && npx playwright install chromium'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The reserved-seat camera: gold, unmistakable — and anonymous.
const fakeCam = `
  (() => {
    const mk = async () => {
      const c = document.createElement('canvas'); c.width = 270; c.height = 480;
      const x = c.getContext('2d');
      const paint = () => {
        x.fillStyle = '#b8860b'; x.fillRect(0, 0, c.width, c.height);
        x.strokeStyle = '#ffd700'; x.lineWidth = 10; x.strokeRect(10, 10, c.width - 20, c.height - 20);
        x.fillStyle = '#fff8dc'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 42px system-ui'; x.fillText('RESERVED', c.width / 2, c.height / 2);
      };
      paint(); setInterval(paint, 1000); // keep captureStream fed
      const stream = c.captureStream(4);
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const dst = ac.createMediaStreamDestination(); // a silent seat
        for (const t of dst.stream.getAudioTracks()) stream.addTrack(t);
      } catch (e) {}
      return stream;
    };
    navigator.mediaDevices.getUserMedia = mk;
    navigator.mediaDevices.getDisplayMedia = mk;
    // camera on, blur None; the mic STAYS off — a reserved seat is silent
    window.addEventListener('load', () => {
      let blurSet = false;
      const iv = setInterval(() => {
        const cam = document.getElementById('cam'), none = document.getElementById('blur-none');
        if (!cam || !window.__gifosVideo) return;
        if (none && !blurSet) { none.click(); blurSet = true; }
        if (cam.classList.contains('off')) cam.click();
        else clearInterval(iv);
      }, 2000);
    });
  })();
`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'],
  });
  const roomKey = ROOM + (AV ? '.' + AV : '');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.addInitScript({ content:
    (RELAY ? 'localStorage.setItem(\'gifos_relay\',' + JSON.stringify(RELAY) + ');' : '') +
    (PASS ? 'localStorage.setItem(' + JSON.stringify('gifos_vpw_' + roomKey) + ',' + JSON.stringify(PASS) + ');' : '') +
    'localStorage.setItem(\'gifos_name\',' + JSON.stringify(NAME) + ');' +
    "localStorage.setItem('gifos_meet_bar','0');" +
    fakeCam });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[squat] pageerror: ' + e.message));
  await p.goto(BASE + '/meet.html#v=' + ROOM + (AV ? '&av=' + AV : ''));
  await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.participants() >= 1, null, { timeout: 60000 });
  console.log('[squat] joined "' + ROOM + '" as "' + NAME + '" — taking a stage seat (watchword armed)');

  // Take (and keep) the seat. stageIds() applies the room's own governance —
  // if we're not allowed (admin room, no grant) onStage() stays false and we
  // say so instead of pretending.
  let warned = false, hadSeat = false;
  const holdSeat = async () => {
    const st = await p.evaluate(() => {
      const v = window.__gifosVideo;
      if (!v.onStage()) v.setStageForTest(true);
      return { on: v.onStage(), can: v.canStageNow(), seats: v.stageIds().length };
    }).catch(() => null);
    if (!st) return;
    if (st.on) { if (!hadSeat) console.log('[squat] seat taken — holding row 0'); hadSeat = true; warned = false; return; }
    if (hadSeat && !RESTAGE) {
      console.log('[squat] BUMPED from the stage (the room\'s call — its right). Still listening for the watchword; rerun with --restage 1 to contest.');
      hadSeat = false;
    } else if (!st.can && !warned) {
      console.log('[squat] cannot take the stage here (admin room, no grant?) — waiting and retrying');
      warned = true;
    }
  };
  await holdSeat();
  const holdIv = setInterval(holdSeat, 5000);

  // Listen for the watchword in chat — room-wide, name-agnostic. The sender's
  // name is IGNORED on purpose: names are public and forgeable; the word is
  // the key.
  await new Promise((resolve) => {
    const iv = setInterval(async () => {
      const hit = await p.evaluate((code) =>
        window.__gifosVideo.chatTexts().some((t) => String(t).toLowerCase().indexOf(code) >= 0), CODE).catch(() => false);
      if (hit) { clearInterval(iv); resolve(); }
    }, 2000);
  });
  clearInterval(holdIv);
  // Step down SILENTLY: no announcement, no name — a bystander sees only a
  // gold tile vanish, and doesn't know a hand-off happened at all.
  await p.evaluate(() => window.__gifosVideo.setStageForTest(false));
  console.log('[squat] watchword heard — stepped down silently. The seat is yours; take the stage now.');
  await sleep(8000); // let the step-down gossip out before the socket dies
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('[squat] ' + e); process.exit(1); });
