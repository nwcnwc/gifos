#!/usr/bin/env node
/*
 * squat.js — hold a stage seat in a GifOS room until its owner arrives.
 *
 * One headless Chromium page joins the room, steps onto row 0, and streams a
 * gold "RESERVED" tile from that seat. It reveals NOTHING about who the seat
 * is for, and — deliberately — NOTHING inside the room can release it: not a
 * name (public, forgeable), not a chat watchword (visible once used). The
 * release is a purely LOCAL act on the machine running the bot, which only
 * you can reach:
 *
 *   - press Enter in the bot's terminal, or
 *   - kill -USR1 <pid>            (pid is printed at start), or
 *   - touch the --release file    (handy over ssh with nohup):
 *
 *   node test/squat.js --room mymeeting --release /tmp/free-seat &
 *   …get seated in the room, ready on the Stage button, then:
 *   ssh myserver touch /tmp/free-seat
 *
 * The bot steps down silently the moment any trigger fires — a bystander
 * sees only a gold tile vanish, with no hint a hand-off happened. Tap Stage
 * as it does. (Plain kill / Ctrl-C also frees the seat eventually — the
 * room prunes the absent bot after its grace period — but the graceful
 * triggers gossip the step-down instantly.)
 *
 * Options:
 *   --release <path> file whose appearance frees the seat (polled 1s)
 *   --room <name>    room to sit in (default: test)
 *   --name <label>   the squatter's own label (default: "Reserved")
 *   --pass <pw>      room password, if locked
 *   --av <hex>       admin verifier, for admin rooms
 *   --base <url>     site origin (default https://gifos.app)
 *   --relay <ws://>  custom relay
 *   --restage 1      re-take the seat if bumped (default: off — see below)
 *
 * Honesty about governance (docs/media-plane.md, Channel St): in an OPEN room a squatter has
 * no immunity — it holds a seat exactly as well as a person refusing to
 * move, and the room can vote it off (that's the anarchy principle: no
 * script beats the honest buttons). By default squat.js RESPECTS a bump and
 * keeps waiting for your release without the seat. For a seat that can't
 * be taken, run YOUR OWN admin room (/meet/<room>/<av>) and squat with
 * --av: there, stage rights are admins + grantees only.
 */
const fs = require('fs');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const RELEASE = args.release || '';
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
  console.log('[squat] joined "' + ROOM + '" as "' + NAME + '" — taking a stage seat (pid ' + process.pid + ')');
  console.log('[squat] release: Enter here · kill -USR1 ' + process.pid + (RELEASE ? ' · touch ' + RELEASE : ''));

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
      console.log('[squat] BUMPED from the stage (the room\'s call — its right). Still awaiting your release; rerun with --restage 1 to contest.');
      hadSeat = false;
    } else if (!st.can && !warned) {
      console.log('[squat] cannot take the stage here (admin room, no grant?) — waiting and retrying');
      warned = true;
    }
  };
  await holdSeat();
  const holdIv = setInterval(holdSeat, 5000);

  // Wait for a LOCAL release — nothing in the room can trigger this. Three
  // doors, all on the bot's own machine: stdin Enter, SIGUSR1, release file.
  await new Promise((resolve) => {
    let done = false;
    const fire = (how) => { if (done) return; done = true; console.log('[squat] released via ' + how); resolve(); };
    process.on('SIGUSR1', () => fire('SIGUSR1'));
    try { process.stdin.resume(); process.stdin.on('data', () => fire('stdin')); } catch (e) {}
    if (RELEASE) {
      const iv = setInterval(() => {
        try { if (fs.existsSync(RELEASE)) { clearInterval(iv); fs.unlinkSync(RELEASE); fire('release file'); } } catch (e) {}
      }, 1000);
    }
  });
  clearInterval(holdIv);
  // Step down SILENTLY: no announcement, no name — a bystander sees only a
  // gold tile vanish, and doesn't know a hand-off happened at all.
  await p.evaluate(() => window.__gifosVideo.setStageForTest(false));
  console.log('[squat] stepped down silently. The seat is yours; take the stage now.');
  await sleep(8000); // let the step-down gossip out before the socket dies
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('[squat] ' + e); process.exit(1); });
