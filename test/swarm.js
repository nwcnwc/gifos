#!/usr/bin/env node
/*
 * swarm.js — a stripped-down phone-congregation simulator.
 *
 * Spins up N headless Chromium pages, each running the REAL meet.html client
 * (real walk, real folds, real gossip — nothing mocked but the camera). Each
 * bot's "camera" is a portrait canvas painting ONE solid color with the
 * bot's number on it — plus a random simple object (circle, ring, square,
 * triangle, cross, diamond) that hops to a new spot every few seconds,
 * so the stadium visibly LIVES without costing encode bandwidth between
 * changes. Bots also drop a random sentence into the meeting chat now and
 * then, so chat gossip gets exercised across sections and decks.
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
 *   --pass <pw>      room password, if the room is locked (bots pre-store it
 *                    exactly like a returning member, so they pass the gate)
 *   --av <hex>       admin verifier, for admin rooms (/meet/<room>/<av> links)
 *   --n <count>      bots in this shard (default 25)
 *   --offset <k>     global index of this shard's first bot (default 0)
 *   --base <url>     site origin (default https://gifos.app)
 *   --relay <ws://>  custom relay (default: the site's production relay)
 *   --ramp <ms>      delay between joins (default 400 — be kind to the walk)
 *   --fps <n>        bot camera fps (default 5; mostly-static content anyway)
 *   --chat <secs>    one random bot per shard speaks every this-many seconds
 *                    (default 20; 0 turns chat off)
 *
 * Every ~20s each shard prints a one-line census: how many bots are up and
 * which sections they landed in. Ctrl-C tears the shard down.
 */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const ROOM = args.room || 'test';
const PASS = args.pass || '';
const AV = (/^[a-f0-9]{16,64}$/.exec((args.av || '').toLowerCase()) || [''])[0];
const N = Math.max(1, parseInt(args.n || '25', 10));
const OFFSET = Math.max(0, parseInt(args.offset || '0', 10));
const BASE = (args.base || 'https://gifos.app').replace(/\/$/, '');
const RELAY = args.relay || '';
const RAMP = Math.max(0, parseInt(args.ramp || '400', 10));
const FPS = Math.max(1, parseInt(args.fps || '5', 10));
const CHAT = Math.max(0, parseFloat(args.chat === undefined ? '20' : args.chat));

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright not found — run: npm i playwright && npx playwright install chromium'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The fake phone camera: a 9:16 canvas, one solid color per bot (spread
// around the hue wheel by golden-angle so neighbors contrast), the bot's
// number painted on it, and one simple object hopping to a random spot,
// shape, and size every few seconds. Repaint is 1/s over a 270×480 canvas —
// a handful of fill calls, no gradients, no animation loop — so CPU stays
// negligible while the video stays visibly alive. Audio is a silent
// WebAudio destination track.
const fakeCam = (idx, fps) => `
  (() => {
    const hue = Math.round((${idx} * 137.508) % 360);
    const mk = async () => {
      const c = document.createElement('canvas'); c.width = 270; c.height = 480;
      const x = c.getContext('2d');
      const SHAPES = ['circle', 'ring', 'square', 'triangle', 'cross', 'diamond'];
      let obj = null;
      const newObj = () => {
        obj = {
          s: SHAPES[(Math.random() * SHAPES.length) | 0],
          x: 45 + Math.random() * (c.width - 90),
          y: 60 + Math.random() * (c.height - 180),
          r: 22 + Math.random() * 40,
          h: Math.round((hue + 90 + Math.random() * 180) % 360),
        };
      };
      const paint = () => {
        x.fillStyle = 'hsl(' + hue + ',85%,52%)'; x.fillRect(0, 0, c.width, c.height);
        const o = obj;
        x.fillStyle = x.strokeStyle = 'hsl(' + o.h + ',90%,88%)'; x.lineWidth = 9;
        x.beginPath();
        if (o.s === 'circle') { x.arc(o.x, o.y, o.r, 0, 7); x.fill(); }
        else if (o.s === 'ring') { x.arc(o.x, o.y, o.r, 0, 7); x.stroke(); }
        else if (o.s === 'square') x.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
        else if (o.s === 'triangle') { x.moveTo(o.x, o.y - o.r); x.lineTo(o.x + o.r, o.y + o.r); x.lineTo(o.x - o.r, o.y + o.r); x.fill(); }
        else if (o.s === 'cross') { x.fillRect(o.x - o.r, o.y - o.r / 3, o.r * 2, o.r / 1.5); x.fillRect(o.x - o.r / 3, o.y - o.r, o.r / 1.5, o.r * 2); }
        else { x.moveTo(o.x, o.y - o.r); x.lineTo(o.x + o.r, o.y); x.lineTo(o.x, o.y + o.r); x.lineTo(o.x - o.r, o.y); x.fill(); }
        x.fillStyle = 'rgba(0,0,0,.55)'; x.font = 'bold 96px system-ui';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('${idx}', c.width / 2, c.height / 2);
      };
      newObj(); paint();
      setInterval(paint, 1000); // keep captureStream fed
      setInterval(newObj, 4000 + Math.random() * 5000);
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

// Random congregation chatter — a few stock lines plus a tiny grammar, so
// 600 bots don't all say the same six things.
const STOCK = [
  'Amen!', 'Hallelujah!', 'Beautiful reading tonight.', 'Can everyone hear the stage?',
  'Greetings from my row!', 'The mosaic looks alive from here.', 'What verse are we on?',
  'Our whole section says amen.', 'Loud and clear out here in the decks.',
];
const SUBJ = ['My row', 'The stage', 'This section', 'Our deacon', 'The whole deck', 'Row zero', 'The stadium', 'Everyone up here'];
const VERB = ['hears', 'loves', 'follows', 'echoes', 'blesses', 'watches over', 'carries'];
const OBJ = ['the reading', 'every verse', 'the amen', 'the mosaic', 'the crowd', 'the fold', 'the million'];
const pick = (a) => a[(Math.random() * a.length) | 0];
const sentence = (idx) => Math.random() < 0.4 ? pick(STOCK)
  : pick(SUBJ) + ' ' + pick(VERB) + ' ' + pick(OBJ) + (Math.random() < 0.25 ? ' — Bot-' + idx : '.');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'],
  });
  const pages = [];
  // meet.html reads the room password from localStorage at join (loadPw:
  // 'gifos_vpw_' + room[.av]) and derives the relay proof from it — seeding
  // that key makes a bot indistinguishable from a returning member, so a
  // locked room's gate is exercised for real, no UI driving needed.
  const roomKey = ROOM + (AV ? '.' + AV : '');
  const pwSeed = PASS ? 'localStorage.setItem(' + JSON.stringify('gifos_vpw_' + roomKey) + ',' + JSON.stringify(PASS) + ');' : '';
  console.log('[swarm] shard: bots ' + OFFSET + '…' + (OFFSET + N - 1) + ' → ' + BASE + ' room "' + ROOM + '"'
    + (AV ? ' (admin room)' : '') + (PASS ? ' [password]' : ''));
  for (let i = 0; i < N; i++) {
    const idx = OFFSET + i;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } }); // a phone
    await ctx.addInitScript({ content:
      (RELAY ? 'localStorage.setItem(\'gifos_relay\',' + JSON.stringify(RELAY) + ');' : '') +
      pwSeed +
      "localStorage.setItem('gifos_name','Bot-" + idx + "');" +
      "localStorage.setItem('gifos_meet_bar','0');" +
      fakeCam(idx, FPS) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('[bot ' + idx + '] pageerror: ' + e.message));
    p.goto(BASE + '/meet.html#v=' + ROOM + (AV ? '&av=' + AV : '')).catch((e) => console.log('[bot ' + idx + '] goto failed: ' + e.message));
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
  if (CHAT) {
    // One random bot per shard speaks per tick — through the real chat form,
    // so the message rides the same DataChannel gossip a human's would.
    setInterval(() => {
      const { idx, p } = pages[(Math.random() * pages.length) | 0];
      p.evaluate((t) => {
        const inp = document.getElementById('chat-in'), f = document.getElementById('chatform');
        if (!inp || !f) return;
        inp.value = t;
        f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, sentence(idx)).catch(() => { /* page mid-navigation or gone */ });
    }, CHAT * 1000);
  }
})().catch((e) => { console.error(e); process.exit(1); });
