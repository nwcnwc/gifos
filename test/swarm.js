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
 * then, so chat gossip gets exercised across sections and decks — and SPEAK
 * actual phrases over their mics (pre-rendered espeak clips in
 * swarm-voices.js, played into the fake mic's WebAudio destination), so the
 * audio buses and fold summing carry real voices, not just silence.
 *
 * Bots switch their own camera and mic on after joining (GifOS joins quiet
 * by default) and set their blur choice to None. TIP: give the room a
 * password — it's the key to clear video, so the mosaic shows sharp colors
 * AND no bot burns CPU on the sender-side blur canvas.
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
 *   --chat <secs>    one random bot per shard chats every this-many seconds
 *                    (default 20; 0 turns chat off)
 *   --speak <secs>   each bot says a spoken phrase roughly this often
 *                    (default 45, jittered ±50%; 0 turns voices off)
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
const SPEAK = Math.max(0, parseFloat(args.speak === undefined ? '45' : args.speak));
const DIAG = Math.max(0, parseFloat(args.diag === undefined ? '0' : args.diag)); // 0=off; secs between deep topology dumps

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright not found — run: npm i playwright && npx playwright install chromium'); process.exit(1); }

// Pre-rendered spoken phrases (ogg/vorbis base64) — optional: without the
// file the bots simply stay silent between heartbeats. Only used as the
// audio source when the intro-video pack (below) is absent.
let VOICES = [];
try { VOICES = require(require('path').join(__dirname, 'swarm-voices.js')); }
catch (e) { if (SPEAK) console.log('[swarm] swarm-voices.js not found — bots will be mute'); }

// Intro-video pack: 50 talking-head clips + matching portrait stills
// (test/swarm-videos/, self-fetched onto each bot box). When present, a bot's
// camera IS one of these clips (chosen at random): it plays the ~6s intro
// once — the clip's OWN audio becomes the bot's mic — then freezes on the
// portrait for a random 1-10s, then plays again, a self-introducing loop that
// turns a full room into a cacophony of "Hi, I'm …". Falls back to the solid
// swatch cam + espeak voices when the pack isn't on disk.
const fs = require('fs');
const nodePath = require('path');
const VIDEO_DIR = args.videos || nodePath.join(__dirname, 'swarm-videos');
let PEOPLE = [];
try {
  const clipDir = nodePath.join(VIDEO_DIR, 'clips');
  const portDir = nodePath.join(VIDEO_DIR, 'portraits');
  const nnOf = (f) => (/^(\d+)/.exec(f) || [])[1];
  const ports = {};
  for (const p of fs.readdirSync(portDir)) if (p.endsWith('.jpg')) ports[nnOf(p)] = nodePath.join(portDir, p);
  let names = {};
  try {
    for (const r of JSON.parse(fs.readFileSync(nodePath.join(VIDEO_DIR, 'roster.json'), 'utf8'))) names[r.id] = r.name;
  } catch (e) { /* names are cosmetic */ }
  for (const c of fs.readdirSync(clipDir).filter((f) => f.endsWith('.mp4')).sort()) {
    const nn = nnOf(c);
    if (ports[nn]) PEOPLE.push({ clip: nodePath.join(clipDir, c), portrait: ports[nn], name: names[nn] || null });
  }
} catch (e) { /* no video pack — solid-swatch cams instead */ }
// base64 data-URL cache so N bots sharing a clip read/encode it only once.
const _b64 = {};
const dataUrl = (file, mime) => (_b64[file] || (_b64[file] = 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64')));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Intro-video camera (used when the pack in test/swarm-videos/ is present):
// play a real talking-head clip once — the clip's OWN audio becomes the mic —
// then hold the portrait still 1-10s and replay, forever. The frame is
// composited on a canvas so clip↔portrait swaps need no track renegotiation;
// audio is pulled off the <video> through WebAudio (naturally silent while the
// clip is paused on the portrait).
const fakeCamVideo = (idx, fps, clipUrl, portraitUrl) => `
  (() => {
    const mk = async () => {
      const vid = document.createElement('video');
      vid.src = ${JSON.stringify(clipUrl)};
      vid.muted = false; vid.playsInline = true; vid.preload = 'auto';
      vid.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0';
      document.documentElement.appendChild(vid);
      const img = new Image(); img.src = ${JSON.stringify(portraitUrl)};
      await new Promise((r) => { img.complete ? r() : (img.onload = img.onerror = r); });
      await new Promise((r) => { vid.readyState >= 1 ? r() : (vid.onloadedmetadata = r); });
      const W = vid.videoWidth || 400, H = vid.videoHeight || 736;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      let mode = 'portrait';
      const draw = () => { try { (mode === 'video' && vid.readyState >= 2) ? x.drawImage(vid, 0, 0, W, H) : x.drawImage(img, 0, 0, W, H); } catch (e) {} };
      draw(); setInterval(draw, Math.round(1000 / Math.max(${fps}, 12))); // keep captureStream fed at >= fps
      // Route the clip's own audio to the mic. MediaElementSource redirects the
      // element's audio into the graph; connected only to the stream dest (not
      // ac.destination) so nothing plays locally, and it goes silent whenever
      // the clip is paused on the portrait.
      let dst = null;
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
        dst = ac.createMediaStreamDestination();
        ac.createMediaElementSource(vid).connect(dst);
        window.__botAC = ac;
      } catch (e) {}
      const playOnce = async () => {
        mode = 'video';
        try { vid.currentTime = 0; if (window.__botAC && window.__botAC.state === 'suspended') await window.__botAC.resume(); await vid.play(); }
        catch (e) { setTimeout(playOnce, 1500); }
      };
      vid.onended = () => { mode = 'portrait'; setTimeout(playOnce, 1000 + Math.random() * 9000); };
      playOnce();
      const stream = c.captureStream(${fps});
      if (dst) for (const t of dst.stream.getAudioTracks()) stream.addTrack(t);
      return stream;
    };
    navigator.mediaDevices.getUserMedia = mk;
    navigator.mediaDevices.getDisplayMedia = mk;
    window.addEventListener('load', () => {
      let blurSet = false;
      const iv = setInterval(() => {
        const cam = document.getElementById('cam'), mic = document.getElementById('mic');
        const none = document.getElementById('blur-none');
        if (!cam || !mic || !window.__gifosVideo) return;
        if (none && !blurSet) { none.click(); blurSet = true; }
        if (cam.classList.contains('off')) cam.click();
        if (mic.classList.contains('off')) mic.click();
        if (!cam.classList.contains('off') && !mic.classList.contains('off')) clearInterval(iv);
      }, 2000);
    });
  })();
`;

// Fallback camera: a 9:16 canvas, one solid color per bot (spread around the
// hue wheel by golden-angle so neighbors contrast), the bot's number painted
// on it, and one simple object hopping to a random spot, shape, and size every
// few seconds. Used when the intro-video pack isn't on disk. Audio is optional
// espeak phrases (swarm-voices.js) or silence.
const fakeCamSolid = (idx, fps) => `
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
        const dst = ac.createMediaStreamDestination(); // silence between phrases, valid opus
        for (const t of dst.stream.getAudioTracks()) stream.addTrack(t);
        // Speak actual phrases: decode a pre-rendered clip on first use, then
        // fire it into the mic destination on a jittered timer. Decode is
        // once per clip; playback is a BufferSource — CPU stays negligible.
        const CLIPS = window.__swarmClips || [], SP = window.__swarmSpeakMs || 0;
        if (CLIPS.length && SP) {
          const bufs = {};
          const say = async () => {
            try {
              if (ac.state === 'suspended') ac.resume();
              const i = (Math.random() * CLIPS.length) | 0;
              if (!bufs[i]) {
                const raw = Uint8Array.from(atob(CLIPS[i]), (ch) => ch.charCodeAt(0));
                bufs[i] = await ac.decodeAudioData(raw.buffer);
              }
              const s = ac.createBufferSource(); s.buffer = bufs[i]; s.connect(dst); s.start();
            } catch (e) {}
          };
          const loop = () => setTimeout(() => { say(); loop(); }, SP * (0.5 + Math.random()));
          loop();
        }
      } catch (e) {}
      return stream;
    };
    navigator.mediaDevices.getUserMedia = mk;           // meet.html's camera
    navigator.mediaDevices.getDisplayMedia = mk;        // just in case
    // GifOS joins QUIET (camera+mic acquired but disabled) — a bot switches
    // its own on through the real buttons, and picks blur None (with a room
    // password that means clear video and NO sender-side blur canvas).
    window.addEventListener('load', () => {
      let blurSet = false;
      const iv = setInterval(() => {
        const cam = document.getElementById('cam'), mic = document.getElementById('mic');
        const none = document.getElementById('blur-none');
        if (!cam || !mic || !window.__gifosVideo) return;
        if (none && !blurSet) { none.click(); blurSet = true; }
        if (cam.classList.contains('off')) cam.click();   // no-op until the fake camera lands
        if (mic.classList.contains('off')) mic.click();
        if (!cam.classList.contains('off') && !mic.classList.contains('off')) clearInterval(iv);
      }, 2000);
    });
  })();
`;

// Pick the camera flavor per bot: an intro clip when the pack is on disk
// (read + data-URL'd in from Node), otherwise the solid swatch.
const fakeCam = (idx, fps, person) => person
  ? fakeCamVideo(idx, fps, dataUrl(person.clip, 'video/mp4'), dataUrl(person.portrait, 'image/jpeg'))
  : fakeCamSolid(idx, fps);

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
  // SWARM_CHROME lets a box point at the FULL chromium binary instead of
  // playwright's stripped 'headless_shell' — the shell lacks pieces our
  // WebRTC/media path needs (observed: shell bots load but never open the
  // relay socket; full-browser bots mesh). e.g. on the Pis:
  //   SWARM_CHROME=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SWARM_CHROME || undefined,
    // LocalNetworkAccessChecks (Chromium 141+, enforcing ~149): a PUBLIC-origin
    // page (gifos.app) opening a socket to a LOCAL/LAN address (a self-hosted
    // relay on a tailnet/LAN IP) is blocked with ERR_BLOCKED_BY_LOCAL_NETWORK_
    // ACCESS_CHECKS. A real swarm points at exactly such a relay, so disable
    // the checks for these bots (also legacy PNA flags for older builds).
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });
  const pages = [];
  // Graceful teardown: on SIGTERM/SIGINT close the browser so every bot's
  // socket closes cleanly and the room gets real peer-leaves — the count decays
  // smoothly instead of waiting out gossip-assertion expiry after a hard kill.
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; try { await browser.close(); } catch (e) {} process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  // meet.html reads the room password from localStorage at join (loadPw:
  // 'gifos_vpw_' + room[.av]) and derives the relay proof from it — seeding
  // that key makes a bot indistinguishable from a returning member, so a
  // locked room's gate is exercised for real, no UI driving needed.
  const roomKey = ROOM + (AV ? '.' + AV : '');
  const pwSeed = PASS ? 'localStorage.setItem(' + JSON.stringify('gifos_vpw_' + roomKey) + ',' + JSON.stringify(PASS) + ');' : '';
  const voiceSeed = (SPEAK && VOICES.length)
    ? 'window.__swarmClips=' + JSON.stringify(VOICES.map((v) => v.ogg)) + ';window.__swarmSpeakMs=' + Math.round(SPEAK * 1000) + ';'
    : '';
  console.log('[swarm] shard: bots ' + OFFSET + '…' + (OFFSET + N - 1) + ' → ' + BASE + ' room "' + ROOM + '"'
    + (AV ? ' (admin room)' : '') + (PASS ? ' [password]' : '')
    + (PEOPLE.length ? ' · intro-video pack (' + PEOPLE.length + ' people)' : ' · solid-swatch cams'));
  for (let i = 0; i < N; i++) {
    const idx = OFFSET + i;
    // Each bot randomly adopts one of the 50 roster people (clip + portrait +
    // name) when the pack is present; espeak voices are only seeded as the
    // audio source in the fallback (no-pack) case.
    const person = PEOPLE.length ? PEOPLE[(Math.random() * PEOPLE.length) | 0] : null;
    const botName = (person && person.name) ? person.name : ('Bot-' + idx);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } }); // a phone
    await ctx.addInitScript({ content:
      (RELAY ? 'localStorage.setItem(\'gifos_relay\',' + JSON.stringify(RELAY) + ');' : '') +
      pwSeed + (person ? '' : voiceSeed) +
      'localStorage.setItem(\'gifos_name\',' + JSON.stringify(botName) + ');' +
      "localStorage.setItem('gifos_meet_bar','0');" +
      fakeCam(idx, FPS, person) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('[bot ' + idx + '] pageerror: ' + e.message));
    p.goto(BASE + '/meet.html#v=' + ROOM + (AV ? '&av=' + AV : '') + '&DEBUG=on').catch((e) => console.log('[bot ' + idx + '] goto failed: ' + e.message)); // bots answer census probes (DEBUG-TREE gate)
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
          ? (() => { const g = (f, d) => { try { return f(); } catch (e) { return d; } };
              return { sec: g(() => { const c = window.__gifosVideo.meshCoord(); return c ? String(c.pc) : '?'; }, '?'),
                       n: g(() => window.__gifosVideo.participants(), 0) }; })() : null);
        if (s) { up++; bySection[s.sec] = (bySection[s.sec] || 0) + 1; parts = Math.max(parts, s.n); }
      } catch (e) { /* page mid-navigation or gone */ }
    }
    console.log('[swarm] up=' + up + '/' + N + ' sections=' + JSON.stringify(bySection) + ' roomCount=' + parts);
  }, 20000);

  // ---- deep per-bot topology diagnostic (docs/healing-laws.md) -------------
  // Every DIAG seconds, ask each bot how the mesh is treating it: section /
  // global-row / seat, deacon or not, how many REAL RTCPeerConnections it holds
  // and whether any reach BEYOND its row+stage (the "P2P on all 64" smell —
  // only row-mates, stage, and deacon↔deacon should be direct), how many of its
  // direct-face grid tiles vs folded stadium tiles are actually painting video
  // (black-screen hunt), and whether the stadium fold panel is up. One line per
  // bot + a shard aggregate. Runs entirely off the existing window.__gifosVideo
  // test hook — no meet.html change needed.
  const diagInPage = () => {
    const V = window.__gifosVideo;
    if (!V) return { err: 'no __gifosVideo' };
    const g = (fn, d) => { try { return fn(); } catch (e) { return d; } };
    const S = g(() => V.scale(), {}); const C = S.C || 8;
    const rows = g(() => V.rows() || [], []);
    const myRow = g(() => V.myRow(), -1);
    const section = g(() => V.sectionNum(), 0);
    const stageSet = new Set(rows[0] || []);
    const myRowSet = new Set(rows[myRow] || []);
    let pcOpen = 0, pcConn = 0, pcBeyond = 0;
    for (const pid of rows.flat().filter(Boolean)) {
      const st = g(() => V.pcState(pid), null);
      if (!st) continue;
      pcOpen++;
      if (st.conn === 'connected') pcConn++;
      if (!myRowSet.has(pid) && !stageSet.has(pid)) pcBeyond++;
    }
    const vAlive = (v) => !!(v && v.srcObject && v.videoWidth > 0 && !v.paused && v.readyState >= 2);
    // Names now travel the E2E-SEALED heartbeat (never the relay roster), so a
    // resolved name on a cross-row tile proves sealed name-gossip reached here.
    // Count tiles still showing the '…' placeholder — a persistent backlog at
    // scale would flag the sealed name path failing to propagate.
    const named = (t) => { const n = (t.querySelector('.name') || {}).textContent || ''; return n && !/^…/.test(n.trim()); };
    let gTiles = 0, gLive = 0, gNamed = 0;
    for (const t of document.querySelectorAll('#grid .tile')) {
      if (t.classList.contains('me')) continue;
      gTiles++; if (vAlive(t.querySelector('video'))) gLive++; if (named(t)) gNamed++;
    }
    let sTiles = 0, sLive = 0;
    for (const t of document.querySelectorAll('#stadium [data-row]')) { sTiles++; if (vAlive(t.querySelector('video'))) sLive++; }
    return {
      sec: section, gRow: (section - 1) * C + (myRow < 0 ? 0 : myRow), row: myRow, deacon: g(() => V.amDeacon(), false) ? 1 : 0,
      n: g(() => V.participants(), 0), links: g(() => V.liveLinks(), 0),
      pcOpen, pcConn, pcBeyond,
      gTiles, gLive, gBlack: gTiles - gLive, gNamed, gNoName: gTiles - gNamed,
      stShown: g(() => V.stadiumShown(), false) ? 1 : 0, stFolds: g(() => (V.stadium() || []).length, 0),
      sTiles, sLive, sBlack: sTiles - sLive, comp: g(() => V.compActive(), false) ? 1 : 0,
    };
  };
  if (DIAG) setInterval(async () => {
    const got = [];
    for (const { idx, p } of pages) {
      try { const d = await p.evaluate(diagInPage); if (d && !d.err) got.push({ idx, d }); } catch (e) {}
    }
    if (!got.length) return;
    for (const { idx, d } of got) {
      console.log('[diag] bot=' + idx + ' sec=' + d.sec + ' gRow=' + d.gRow + ' row=' + d.row + (d.deacon ? ' DEACON' : '')
        + ' n=' + d.n + ' pc=' + d.pcOpen + '(' + d.pcConn + 'up' + (d.pcBeyond ? ',' + d.pcBeyond + 'BEYOND' : '') + ')'
        + ' faces=' + d.gLive + '/' + d.gTiles + (d.gBlack ? ' BLACK=' + d.gBlack : '') + (d.gNoName ? ' NONAME=' + d.gNoName : '')
        + ' fold=' + d.sLive + '/' + d.sTiles + ' stadium=' + (d.stShown ? 'ON' : 'off') + '(' + d.stFolds + 'folds)'
        + (d.comp ? ' COMP' : ''));
    }
    const sum = (f) => got.reduce((a, r) => a + f(r.d), 0);
    console.log('[diag] SHARD bots=' + got.length + ' maxPC=' + Math.max(...got.map((r) => r.d.pcOpen))
      + ' faceBlack=' + sum((d) => d.gBlack) + ' foldBlack=' + sum((d) => d.sBlack)
      + ' noName=' + sum((d) => d.gNoName) + '/' + sum((d) => d.gTiles) // sealed name-gossip backlog (want ~0)
      + ' seeStadium=' + got.filter((r) => r.d.stShown).length + '/' + got.length + ' deacons=' + sum((d) => d.deacon));
  }, DIAG * 1000);

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
