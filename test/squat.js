#!/usr/bin/env node
/*
 * squat.js — hold a stage seat in a GifOS room until its owner arrives.
 *
 * One headless Chromium page joins the room, steps onto row 0, and streams a
 * gold "RESERVED" tile from that seat. It watches for the owner — a person
 * whose SCREEN NAME matches --for — arriving on a tile (same section) or in
 * the chat (works from anywhere in the stadium: if you land in a far
 * section, just type anything in chat). The moment it sees you, it posts
 * "Stage seat freed for <you> — step up!", steps down, and exits.
 *
 *   node test/squat.js --room mymeeting --for "Nathan"
 *
 * Your screen name is the name GifOS asked you for the first time you used
 * it — it's on your own tile ("Nathan (you)") and in the Who list, and it's
 * what --for must match (case-insensitive).
 *
 * Options:
 *   --for <name>     REQUIRED: the screen name to hand the seat to
 *   --room <name>    room to sit in (default: test)
 *   --name <label>   the squatter's own label (default: "Seat: <for>")
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
 * just keeps watching for you without the seat. For a seat that can't be
 * taken, run YOUR OWN admin room (/meet/<room>/<av>) and squat with --av:
 * there, stage rights are admins + grantees only.
 */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const FOR = (args.for || '').trim();
if (!FOR) { console.error('squat.js needs --for "<your screen name>" — the name on your own tile.'); process.exit(1); }
const ROOM = args.room || 'test';
const NAME = args.name || ('Seat: ' + FOR);
const PASS = args.pass || '';
const AV = (/^[a-f0-9]{16,64}$/.exec((args.av || '').toLowerCase()) || [''])[0];
const BASE = (args.base || 'https://gifos.app').replace(/\/$/, '');
const RELAY = args.relay || '';
const RESTAGE = !!args.restage && args.restage !== '0';

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright not found — run: npm i playwright && npx playwright install chromium'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The reserved-seat camera: gold, unmistakable, with the owner's name on it.
const fakeCam = (label) => `
  (() => {
    const mk = async () => {
      const c = document.createElement('canvas'); c.width = 270; c.height = 480;
      const x = c.getContext('2d');
      const paint = () => {
        x.fillStyle = '#b8860b'; x.fillRect(0, 0, c.width, c.height);
        x.strokeStyle = '#ffd700'; x.lineWidth = 10; x.strokeRect(10, 10, c.width - 20, c.height - 20);
        x.fillStyle = '#fff8dc'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 42px system-ui'; x.fillText('RESERVED', c.width / 2, c.height / 2 - 34);
        x.font = 'bold 30px system-ui'; x.fillText('for ' + ${JSON.stringify(label)}, c.width / 2, c.height / 2 + 26);
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
    fakeCam(FOR) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[squat] pageerror: ' + e.message));
  await p.goto(BASE + '/meet.html#v=' + ROOM + (AV ? '&av=' + AV : ''));
  await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.participants() >= 1, null, { timeout: 60000 });
  console.log('[squat] joined "' + ROOM + '" as "' + NAME + '" — taking a stage seat for ' + FOR);

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
      console.log('[squat] BUMPED from the stage (the room\'s call — its right). Still watching for ' + FOR + '; rerun with --restage 1 to contest.');
      hadSeat = false;
    } else if (!st.can && !warned) {
      console.log('[squat] cannot take the stage here (admin room, no grant?) — waiting and retrying');
      warned = true;
    }
  };
  await holdSeat();
  const holdIv = setInterval(holdSeat, 5000);

  // Watch for the owner: a tile label (same section) or a chat author
  // (anywhere in the stadium — chat gossip is room-wide and name-attributed).
  const seen = await new Promise((resolve) => {
    const iv = setInterval(async () => {
      const hit = await p.evaluate((target) => {
        const norm = (s) => String(s || '').replace(/\s*\(you\)\s*$/, '').trim().toLowerCase();
        const t = norm(target);
        for (const el of document.querySelectorAll('.tile:not(.me) .name'))
          if (norm(el.textContent) === t) return 'tile';
        for (const el of document.querySelectorAll('#chatlog .cmsg b'))
          if (norm(el.textContent) === t) return 'chat';
        return null;
      }, FOR).catch(() => null);
      if (hit) { clearInterval(iv); resolve(hit); }
    }, 2000);
  });
  clearInterval(holdIv);
  console.log('[squat] ' + FOR + ' is here (seen via ' + seen + ') — handing over the seat');

  // Announce, then step down. Announce FIRST: the freed seat's best defense
  // is the owner already reaching for it.
  await p.evaluate((msg) => {
    const inp = document.getElementById('chat-in'), f = document.getElementById('chatform');
    if (inp && f) { inp.value = msg; f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
  }, 'Stage seat freed for ' + FOR + ' — step up!');
  await sleep(1500);
  await p.evaluate(() => window.__gifosVideo.setStageForTest(false));
  console.log('[squat] stepped down. Take the stage — goodbye.');
  await sleep(8000); // let the step-down gossip out before the socket dies
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('[squat] ' + e); process.exit(1); });
