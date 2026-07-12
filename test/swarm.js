#!/usr/bin/env node
/*
 * swarm.js — a stripped-down phone-congregation simulator.
 *
 * Spins up N headless Chromium pages, each running the REAL meet.html client
 * (real walk, real folds, real gossip — nothing mocked but the camera). Each
 * bot's "camera" is a portrait canvas painting ONE solid color with the
 * bot's number on it — static frames encode to almost nothing, so hundreds
 * of bots cost bandwidth only where the architecture says they should
 * (folds and stage). The stadium renders as a labeled color mosaic: rows
 * and sections become visible blocks of color.
 *
 * Run one shard per home computer, then join from your phone and feel it:
 *
 *   npm i playwright && npx playwright install chromium   # once per machine
 *   node test/swarm.js --room test --n 75 --offset 0      # machine 1
 *   node test/swarm.js --room test --n 75 --offset 75     # machine 2
 *   …offset by the running total so every bot gets a unique color/name.
 *
 * Options:
 *   --room <name>    room to join (default: test → https://gifos.app/meet/test)
 *   --n <count>      bots in this shard (default 25)
 *   --offset <k>     global index of this shard's first bot (default 0)
 *   --base <url>     site origin (default https://gifos.app)
 *   --relay <ws://>  custom relay (default: the site's production relay)
 *   --ramp <ms>      delay between joins (default 400 — be kind to the walk)
 *   --fps <n>        bot camera fps (default 5; static content anyway)
 *
 * Every ~20s each shard prints a one-line census: how many bots are up and
 * which sections they landed in. Ctrl-C tears the shard down.
 */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const ROOM = args.room || 'test';
const N = Math.max(1, parseInt(args.n || '25', 10));
const OFFSET = Math.max(0, parseInt(args.offset || '0', 10));
const BASE = (args.base || 'https://gifos.app').replace(/\/$/, '');
const RELAY = args.relay || '';
const RAMP = Math.max(0, parseInt(args.ramp || '400', 10));
const FPS = Math.max(1, parseInt(args.fps || '5', 10));

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright not found — run: npm i playwright && npx playwright install chromium'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The fake phone camera: a 9:16 canvas, one solid color per bot (spread
// around the hue wheel by golden-angle so neighbors contrast), the bot's
// number painted on it. Audio is a silent WebAudio destination track.
const fakeCam = (idx, fps) => `
  (() => {
    const hue = Math.round((${idx} * 137.508) % 360);
    const mk = async () => {
      const c = document.createElement('canvas'); c.width = 270; c.height = 480;
      const x = c.getContext('2d');
      const paint = () => {
        x.fillStyle = 'hsl(' + hue + ',85%,52%)'; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = 'rgba(0,0,0,.55)'; x.font = 'bold 96px system-ui';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('${idx}', c.width / 2, c.height / 2);
      };
      paint(); setInterval(paint, 1000); // keep captureStream fed
      const stream = c.captureStream(${fps});
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const dst = ac.createMediaStreamDestination(); // silence, valid opus
        for (const t of dst.stream.getAudioTracks()) stream.addTrack(t);
      } catch (e) {}
      return stream;
    };
    navigator.mediaDevices.getUserMedia = mk;           // meet.html's camera
    navigator.mediaDevices.getDisplayMedia = mk;        // just in case
  })();
`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'],
  });
  const pages = [];
  console.log('[swarm] shard: bots ' + OFFSET + '…' + (OFFSET + N - 1) + ' → ' + BASE + ' room "' + ROOM + '"');
  for (let i = 0; i < N; i++) {
    const idx = OFFSET + i;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } }); // a phone
    await ctx.addInitScript({ content:
      (RELAY ? "localStorage.setItem('gifos_relay','" + RELAY + "');" : '') +
      "localStorage.setItem('gifos_name','Bot-" + idx + "');" +
      "localStorage.setItem('gifos_meet_bar','0');" +
      fakeCam(idx, FPS) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('[bot ' + idx + '] pageerror: ' + e.message));
    p.goto(BASE + '/meet.html#v=' + ROOM).catch((e) => console.log('[bot ' + idx + '] goto failed: ' + e.message));
    pages.push({ idx, p });
    if (RAMP) await sleep(RAMP);
    if ((i + 1) % 10 === 0) console.log('[swarm] ' + (i + 1) + '/' + N + ' launched');
  }
  console.log('[swarm] all launched — census every 20s (Ctrl-C to end the shard)');
  setInterval(async () => {
    const bySection = {};
    let up = 0, parts = 0;
    for (const { p } of pages) {
      try {
        const s = await p.evaluate(() => window.__gifosVideo
          ? { sec: window.__gifosVideo.sectionNum(), n: window.__gifosVideo.participants() } : null);
        if (s) { up++; bySection[s.sec] = (bySection[s.sec] || 0) + 1; parts = Math.max(parts, s.n); }
      } catch (e) { /* page mid-navigation or gone */ }
    }
    console.log('[swarm] up=' + up + '/' + N + ' sections=' + JSON.stringify(bySection) + ' roomCount=' + parts);
  }, 20000);
})().catch((e) => { console.error(e); process.exit(1); });
