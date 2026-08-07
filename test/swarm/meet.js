#!/usr/bin/env node
'use strict';
/*
 * meet.js — the GifOS meeting command line. ONE tool that JOINS a real meeting
 * as a full participant (optionally playing a talking-head clip into its camera,
 * exactly like the swarm) and lets you INSPECT everything happening in it, from
 * an interactive prompt or as a continuous stdout stream. Supersedes the old
 * observe.js (REPL) + observer.js (stream) — both folded in here.
 *
 * THREE ways to run it:
 *   1. INTERACTIVE (default, or `--repl`): drops you at a `meet>` prompt with a
 *      `help` command. Run with NO or insufficient args and you land here, then
 *      `join <room>` when ready.
 *   2. STREAM (`--watch`): connect and print a status line every few seconds at
 *      a chosen chattiness (`--level quiet|info|verbose|debug`, or -q/-v/-vv/-d),
 *      forever or `--for <secs>`. `--json` for one JSON object per tick.
 *   3. ONE-SHOT (`--once <cmd>`): run a single command, print it, exit.
 *   4. SCRIPT (`--script "seat 0/1.1; sleep 45; state; shot /tmp/x.png"`):
 *      run ';'-separated commands in order (sleep <secs> waits), then exit.
 *   5. DRIVE (`--drive`): machine mode for the behavior battery (lib/cast.js)
 *      — commands in on stdin, one '@@done'/'@@err' sentinel per command,
 *      '@@state'/'@@probe' JSON payloads. No prompt, no auto-join.
 *
 * BE A PHONE (the behavior battery's device profiles):
 *   --profile phone     mobile UA (IS_MOBILE), 390×844 touch viewport, fake
 *                       battery 90% ON BATTERY.  --profile desktop (default):
 *                       1280-class viewport, battery charging.
 *   --battery "<lvl>[,charging|drain]"   initial fake-battery state (lvl 0-1
 *                       or %); 'drain' = plugged in but LOSING ground.
 *
 * PARTICIPATE (hold a real seat, help other tiles go clear):
 *   --video [n]   play a talking-head clip (test/swarm/swarm-videos/ pack) as my
 *                 camera — same mechanism as swarm.js. n picks a person.
 *   --cam         camera on with a solid name swatch (no pack needed).
 *   (default)     camera OFF — a quiet observer that still holds a seat.
 *
 * CONNECT:
 *   --room <name>     room to join                 (REPL `join <name>` also works)
 *   --pass <pw>       room password (locked rooms)
 *   --relay <ws(s)>   relay URL                     (default: the site's relay)
 *   --base <url>      site origin                   (default: https://gifos.app)
 *                     PRODUCTION IS THE DEFAULT. For a local room, start
 *                     test/servers/dev.sh and pass BOTH:
 *                       --base http://127.0.0.1:8099 --relay ws://127.0.0.1:8790
 *   --av <hex>        admin verifier (/meet/<room>/<av> admin rooms)
 *   --name <label>    my display name               (default: meet-cli)
 *   --videos <dir>    override the clip pack dir
 *   --chrome <path>   chromium binary               (env MEET_CHROME also works)
 *   --engine <name>   chromium|webkit|firefox       (env MEET_ENGINE) — which
 *                     BROWSER ENGINE this participant is. chromium (default) is
 *                     also Android Chrome and Edge; webkit is Safari's engine;
 *                     firefox is Gecko. webkit/firefox launch bare (no Chromium
 *                     switches) — see the engine resolution block for what that
 *                     costs. Binary overrides: MEET_WEBKIT / MEET_FIREFOX.
 *   --headful         show the browser window
 *   --edge            pin the EDGE channel (?edge) — without it gifos.app
 *                     redirects to the frozen release snapshot
 *   --jsonl <path>    append one JSON snapshot line every --every seconds, in
 *                     ANY mode (env MEET_JSONL too; '%d' → YYYY-MM-DD, daily
 *                     rotation for free). The monitor service's durable record.
 *   --ensure-pass <pw>  room-lock KEEPER (env MEET_ENSURE_PASS): join with NO
 *                     password; an OPEN room gets locked with this password by
 *                     us, a LOCKED door gets it entered. Supersedes --pass.
 *
 * COMMANDS (at the prompt, via --once, or `watch`):
 *   state | s     my seat, mesh state, links, occ, participants, consent
 *   roster | r    every peer: name · coord · ip · cam · blur · age · conn · vid
 *   who           compact who-is-here (name @ coord), grouped by section
 *   tree|census   probe EVERY seat (gossip) and rebuild the WHOLE mesh — coords,
 *                 links, up/down, flags half-links/dup-coords/orphans (DEBUG)
 *   seat <pc/r.i> teleport my seat to any coord (grab an empty one to roam) DEBUG
 *   tour [prefix] teleport into an empty seat of EVERY section + whole-window
 *                 shot each — screenshots the composite from all over (DEBUG)
 *   rows          the row layout (my section)
 *   links | l     my bounded link set + each link's connection/DC state
 *   net           WHERE traffic travels: relay vs DC vs sponsor-forward (txStats)
 *   mosaic | m    the four media composites: which channels are live
 *   mon [secs] [intervalMs]  A/V FEED MONITOR (default 120s / 1000ms): samples
 *                 the Stadium+Stage tiles (present/src/dims/frame progress),
 *                 the mosaic machinery (claims/standby/jobs/demand from the
 *                 debug hooks) and per-receiver WebRTC stats (video frame +
 *                 audio packet/energy deltas), and logs every TRANSITION as a
 *                 greppable `MON t+.. EV <type> <detail>` line — tile off/on,
 *                 srcObject switches, black/live flips, claim gain/loss/
 *                 via-switch, standby changes, job ship/unship/dormancy flips,
 *                 demand (mx-want/mx-idle) flips, video pipe stalls >2s, audio
 *                 pipe stalls, stage-ear input changes, packer canvas resizes.
 *                 Ends with a `MON SUM` flap-count summary + event timeline.
 *                 Works (degraded: no WebRTC stats) against builds without the
 *                 monInfo/avStats hooks. THE regression tool for tile flap.
 *   feeds         every CLAIMED feed: dims, frames, track mute — sender vs receiver
 *   stage [up|down]  who's on stage + the strip's state; up/down steps me on/off
 *   consent       the clear-video tally (X/N) and exactly who is blocking it
 *   tiles         #grid tiles shown/total (Channel R) + which composites paint
 *   ghosts        peers with NO fresh status (churn residue)
 *   dups          two peers claiming one coord (a convergence bug)
 *   door | fork   THE FORK VIEW: who is socketed on my relay session but sits
 *                 in NO cell of my occupancy, and for how long — one relay
 *                 session is one stadium, so a peer that stays outside past
 *                 the dwell (--fork-dwell, default 90s) IS a second tree.
 *                 Prints the greeterTrace behind it. Every snapshot carries
 *                 the verdict (`fork` in --jsonl) and both edges are logged
 *                 to stderr. Bug ledger 2026-08-05 §6 — the 7-hour fork.
 *   chat [msg]    print recent chat, or send a message
 *   cam on|off    turn my camera on/off        mic on|off
 *   PHONE-REALITY LEVERS (the behavior battery; all live in any mode):
 *   hide | show   app-switch away/back (visibility override + event)
 *   freeze        LONG app-switch: tab lifecycle FROZEN — JS fully stops
 *   thaw [gapS]   return from freeze; optional backdated beat gap (secs)
 *   radio off|on  coverage dropout: WS+DC silent BOTH ways, no close events
 *   battery <lvl> [charging|drain]   drive the fake battery (drain = losing
 *                 ground while plugged in)
 *   beatgap <s>   backdate the beat clock       idlemin <m>  backdate touch
 *   poke          simulate a touch/speech       pulses off|on  halt pulses
 *   reload        full page reload → rejoin     waitseat [s]  block til seated
 *   leave         clean exit (pagehide LEAVE)   die  SIGKILL the browser
 *   app run [id] | app stop | app state   share a store app into the meeting
 *                 (the sharer needs --seed-desktop: first-visits index.html so
 *                 the profile's store holds the sample apps; ~90s, CPU-bound)
 *   jstate        one-line machine JSON (@@state …)   probe [s]  census JSON
 *   name <n>      rename myself
 *   shot [path]   save a screenshot (PNG) of my meeting view
 *   dump          the whole debugDump as JSON
 *   eval <js>     evaluate arbitrary JS in the page
 *   watch [secs] [level]   live-stream `state` until you press enter
 *   join <room> [--pass x] [--relay y] [--video]   (re)connect
 *   help | ?      this list            quit | exit
 *
 * EXAMPLES
 *   node test/swarm/meet.js                                   # REPL, then: join stadium --pass swarm
 *   node test/swarm/meet.js --room stadium --pass swarm --relay wss://HOST.nip.io
 *   node test/swarm/meet.js --room stadium --pass swarm --relay wss://HOST --video --watch -v
 *   node test/swarm/meet.js --room stadium --pass swarm --relay wss://HOST --once net
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
// THE FORK WATCH (bug ledger 2026-08-05 §6 — the 7-hour room fork). A peer
// SOCKETED on my relay session that holds no cell in my occupancy, for longer
// than any lawful entry dance, is a SECOND TREE on one stadium. Read the file:
// it explains why the relay roster is the observation that breaks the
// one-seat-tree symmetry, and why this observer never heals anything.
const { forkProbeInPage, makeForkWatch, forkLine } = require('../tools/fork-detect.js');

// ---- args -----------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const nx = process.argv[i + 1];
    if (nx === undefined || nx.startsWith('-')) args[k] = true; else { args[k] = nx; i++; } }
  else if (a === '-q') args.level = 'quiet';
  else if (a === '-v') args.level = 'verbose';
  else if (a === '-vv' || a === '-d') args.level = 'debug';
}
const cfg = {
  room: args.room || null,
  pass: args.pass || '',
  relay: args.relay || '',
  base: (args.base || 'https://gifos.app').replace(/\/$/, ''),
  av: args.av || '',
  // --bc: join wearing the BROADCAST skin (run.html#bc=1 — the Broadcast
  // app). Only meaningful with an admin room (av); a viewer joining with it
  // never calls getUserMedia at all.
  bc: !!args.bc,
  name: args.name || 'meet-cli',
  videoIdx: args.video === true ? -1 : (args.video !== undefined ? parseInt(args.video, 10) : null), // null=no video
  solidCam: !!args.cam,
  observe: !!args.observe, // camera OFF — WARNING: blocks the room's clear-video consent
  videosDir: args.videos || path.join(__dirname, 'swarm-videos'),
  headful: !!args.headful,
  chrome: args.chrome || process.env.MEET_CHROME,
  level: args.level || 'info',
  every: Math.max(1, parseFloat(args.every || '3')),
  settle: Math.max(0, parseFloat(args.settle || '0')), // --once/--watch: wait N s after seating before acting (let composites fill)
  forSecs: args['for'] ? Math.max(1, parseFloat(args['for'])) : Infinity,
  json: !!args.json,
  edge: !!args.edge,     // pin the EDGE channel (?edge) — else gifos.app redirects to the release snapshot
  seedDesktop: !!args['seed-desktop'], // first-visit index.html before joining: the desktop seed GIF-encodes the sample apps into THIS profile's store (~90s, CPU-bound) so `app run` has something to share
  meshC: parseInt(args['mesh-c'] || '0', 10) || 0, // override the stadium shape constant (window.GIFOS_SCALE={C:n}) — the K-sweep doctrine: small C exercises deep trees with few browsers. EVERY member of a room must carry the same C.
  jsonl: args.jsonl || process.env.MEET_JSONL || '', // append a JSON snapshot line every --every s, in ANY mode ('%d' in the path becomes YYYY-MM-DD)
  // --ensure-pass <pw>: the room-lock KEEPER mode (the monitor's). Join with
  // NO password first; seated in an OPEN room ⇒ SET this password (the page's
  // own Password UI, so present members learn it live); the locked-door
  // prompt appears instead ⇒ ENTER it and join. Supersedes --pass.
  ensurePass: args['ensure-pass'] || process.env.MEET_ENSURE_PASS || '',
  // --admin-pw <pw>: create/enter an ADMIN room as its signed-in admin —
  // derives K+V exactly like the lobby (meet-security §SIG), stashes the key,
  // joins with &av=V. Prints "[meet] admin verifier <V>" so an orchestrator
  // can hand the V to guests (their `join <room> --av <V>`).
  adminPw: args['admin-pw'] || '',
  // --profile phone|desktop: what DEVICE this participant is. phone = mobile
  // UA (IS_MOBILE true in run.html), 390×844 touch viewport, fake battery
  // defaulting to 90% ON BATTERY (tier ≥1 — a phone is never tier 0 by
  // policy). desktop (default) = 1280×820, battery charging.
  profile: args.profile || 'desktop',
  // --battery "<lvl>[,charging|drain]": initial fake-battery state. lvl is
  // 0-1 or 0-100. 'drain' = plugged in but LOSING (the overnight-Moto case).
  battery: args.battery || '',
  // --fork-ask: leave the R5 pick-one modal for a human. DEFAULT is to answer
  // it automatically — a headless client parked at the modal is
  // indistinguishable from a dead door (the 2026-07-26 monitor wedge).
  forkAuto: !args['fork-ask'],
  // --init-script <file>: extra addInitScript, injected last (see join()).
  initScript: args['init-script'] || '',
  // --fork-dwell <s>: how long a socketed peer may sit OUTSIDE my tree before
  // it is called a fork (default 90s — see test/tools/fork-detect.js for why
  // that number). 0 disables the watch entirely.
  forkDwell: args['fork-dwell'] !== undefined ? Math.max(0, parseFloat(args['fork-dwell'])) * 1000
    : (process.env.MEET_FORK_DWELL ? Math.max(0, parseFloat(process.env.MEET_FORK_DWELL)) * 1000 : 90000),
};
const MODE = args.drive ? 'drive' : args.script !== undefined ? 'script' : args.once !== undefined ? 'once' : (args.watch ? 'watch' : 'repl');
const LEVELS = { quiet: 0, info: 1, verbose: 2, debug: 3 };

// ---- playwright + engine resolution ---------------------------------------
// --engine chromium|webkit|firefox (or MEET_ENGINE). Chromium is the default
// and the ONLY engine that takes the Chromium switch set in ensureBrowser();
// webkit/firefox launch BARE, because their launchers reject/ignore Chromium
// command-line switches. Everything the switches bought has an engine-neutral
// substitute, or is not needed off chromium:
//   - the fake camera is injected JS (canvas.captureStream — present in all
//     three), so --use-fake-ui-for-media-stream buys nothing: the page never
//     reaches a real permission prompt.
//   - newContext permissions ['camera','microphone'] is CHROMIUM's permission
//     vocabulary. WebKit THROWS on the name ('camera' unknown) and Firefox
//     does not implement those two either — non-chromium contexts skip it.
//   - the drive-mode --bb-actor cleanup marker is a chromium-only trick
//     (chromium ignores unknown switches; the others do not). Every engine
//     instead carries BB_ACTOR=1 in the browser process ENVIRONMENT, which is
//     engine-neutral and inherited by every child process, so fleet reaping is
//       for p in /proc/[0-9]*; do grep -qz BB_ACTOR=1 "$p/environ" 2>/dev/null && kill "${p##*/}"; done
//   - --unsafely-treat-insecure-origin-as-secure: FIREFOX HAS AN EQUIVALENT
//     (measured 2026-08-05, correcting the first cut of this comment) — the
//     `dom.securecontext.allowlist` pref takes a comma-separated HOST list
//     (hosts, NOT origins: no scheme, no port) and is set through playwright's
//     firefoxUserPrefs. Off: isSecureContext false, crypto.subtle undefined,
//     no navigator.mediaDevices. On: all three, and Ed25519 generateKey works
//     — i.e. a firefox actor CAN take part in a cross-box fleet run over plain
//     http. WEBKIT still has no equivalent, so it gets the loud warning.
let pwmod = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pwmod = require(m); if (pwmod && pwmod.chromium) break; } catch (e) {}
}
if (!pwmod || !pwmod.chromium) { console.error('playwright not found — npm i playwright && npx playwright install chromium'); process.exit(1); }
const ENGINE = String(args.engine || process.env.MEET_ENGINE || 'chromium').toLowerCase();
if (!['chromium', 'webkit', 'firefox'].includes(ENGINE)) { console.error('--engine must be chromium|webkit|firefox (got ' + ENGINE + ')'); process.exit(1); }
const IS_CR = ENGINE === 'chromium';
const launcher = pwmod[ENGINE];
if (!launcher) { console.error('playwright has no ' + ENGINE + ' launcher'); process.exit(1); }
const chromium = pwmod.chromium; // kept: the name the rest of the file grew up with
// Only chromium takes an explicit executablePath by default — the other two
// resolve through playwright's own registry (~/.cache/ms-playwright or
// PLAYWRIGHT_BROWSERS_PATH). MEET_WEBKIT / MEET_FIREFOX override if a box
// needs a specific build.
// Chromium by SEARCH, newest build first — never one hardcoded path. The old
// single guess (/opt/pw-browsers/chromium-1194/chrome-linux/chrome) was a
// DANGLING SYMLINK on this box (it pointed at a ~/.cache chromium-1228 that no
// longer exists), and the fallthrough was silent: playwright then launched its
// own default channel, chromium_headless_shell, which is not installed either,
// so every actor died with "Executable doesn't exist" AFTER the harness had
// already declared itself ready. Same lesson as test/lib/pw.js — a stale
// hardcoded path does not announce itself.
function findChromium() {
  if (cfg.chrome) return cfg.chrome;
  const out = [];
  for (const root of ['/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')]) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (e) { continue; }
    names.filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10))
      .forEach((n) => { out.push(path.join(root, n, 'chrome-linux', 'chrome'), path.join(root, n, 'chrome-linux64', 'chrome')); });
  }
  // a real Chrome is a fine fallback — and for a bot it is PREFERRED over
  // chrome-headless-shell, which can load the page yet never open the relay socket
  out.push('/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  for (const c of out) { try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (e) {} }
  return undefined;
}
const CHROME = findChromium();
if (IS_CR && !CHROME) console.error("[meet] WARNING: no chromium/chrome binary found by search — falling back to playwright's default channel (chrome-headless-shell), which is frequently NOT installed. Set --chrome / MEET_CHROME.");
const ENGINE_EXE = IS_CR ? CHROME : (ENGINE === 'webkit' ? process.env.MEET_WEBKIT : process.env.MEET_FIREFOX) || undefined;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => (String(s == null ? '' : s) + ' '.repeat(n)).slice(0, n);

// ---- the fake camera (talking-head clip pack, exactly like swarm.js) -------
// Loads test/swarm/swarm-videos/{clips,portraits,roster.json} if present; picks one
// person; injects a getUserMedia that plays the clip (its own audio = the mic),
// loops through the portrait still. Falls back to a solid name swatch.
function loadPeople() {
  try {
    const clipDir = path.join(cfg.videosDir, 'clips'), portDir = path.join(cfg.videosDir, 'portraits');
    const nnOf = (f) => (/^(\d+)/.exec(f) || [])[1];
    const ports = {}; for (const p of fs.readdirSync(portDir)) if (p.endsWith('.jpg')) ports[nnOf(p)] = path.join(portDir, p);
    let names = {}; try { for (const r of JSON.parse(fs.readFileSync(path.join(cfg.videosDir, 'roster.json'), 'utf8'))) names[r.id] = r.name; } catch (e) {}
    const people = [];
    for (const c of fs.readdirSync(clipDir).filter((f) => f.endsWith('.mp4')).sort()) { const nn = nnOf(c); if (ports[nn]) people.push({ clip: path.join(clipDir, c), portrait: ports[nn], name: names[nn] || null }); }
    return people;
  } catch (e) { return []; }
}
const dataUrl = (file, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');

function camInitScript() {
  // DEFAULT = a CONSENTING participant (camera on + No blur) so the tool never
  // blocks the room's unanimous clear-video gate. --observe opts into a quiet
  // camera-OFF seat (which DOES block clear video — that's the design).
  const wantVideo = cfg.videoIdx !== null;
  const wantSolid = cfg.solidCam || (!wantVideo && !cfg.observe); // consenting solid cam unless observing
  if (cfg.observe && !wantVideo && !cfg.solidCam) {
    return `(() => { const mk = async () => { const c=document.createElement('canvas');c.width=240;c.height=426;const x=c.getContext('2d');
      const paint=()=>{x.fillStyle='#223';x.fillRect(0,0,c.width,c.height);x.fillStyle='#8ab';x.font='bold 20px system-ui';x.textAlign='center';x.fillText(${JSON.stringify(cfg.name)},c.width/2,c.height/2);};
      paint();setInterval(paint,1000);const s=c.captureStream(2);try{const ac=new AudioContext();const d=ac.createMediaStreamDestination();for(const t of d.stream.getAudioTracks())s.addTrack(t);}catch(e){}return s;};
      if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=mk;navigator.mediaDevices.getDisplayMedia=mk;} })();`;
  }
  let people = [];
  if (wantVideo) people = loadPeople();
  const person = (wantVideo && people.length) ? people[(cfg.videoIdx >= 0 ? cfg.videoIdx : Math.floor(Math.random() * people.length)) % people.length] : null;
  const autoOn = `window.addEventListener('load',()=>{let bs=false;const iv=setInterval(()=>{const cam=document.getElementById('cam'),mic=document.getElementById('mic'),none=document.getElementById('blur-none');
    if(!cam||!window.__gifosVideo)return; if(none&&!bs){none.click();bs=true;} if(cam.classList.contains('off'))cam.click(); if(!cam.classList.contains('off'))clearInterval(iv);},2000);});`;
  if (person) {
    return `(() => { const mk = async () => {
      const vid=document.createElement('video');vid.src=${JSON.stringify(dataUrl(person.clip, 'video/mp4'))};vid.muted=false;vid.playsInline=true;vid.preload='auto';vid.style.cssText='position:fixed;left:-9999px;width:2px;height:2px;opacity:0';document.documentElement.appendChild(vid);
      const img=new Image();img.src=${JSON.stringify(dataUrl(person.portrait, 'image/jpeg'))};await new Promise(r=>{img.complete?r():(img.onload=img.onerror=r);});
      // NEVER HANG ON THE CLIP (2026-08-05): a Chromium without proprietary
      // codecs (the gate pin chromium-1193 answers canPlayType('avc1')='') never
      // fires loadedmetadata for the mp4, and an unresolved mk() is a
      // getUserMedia that never settles — the page joins camera-less (knock
      // first, correctly) and every later cam tap joins the hung boot ask:
      // behavior 24a's host sat blurred forever on exactly the boxes whose
      // build lacks H.264, and passed on the one whose build has it. 3s, then
      // the portrait canvas IS the camera (draw() already falls back to img).
      await new Promise(r=>{if(vid.readyState>=1)return r();vid.onloadedmetadata=r;setTimeout(r,3000);});
      const W=vid.videoWidth||400,H=vid.videoHeight||736;const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');let mode='portrait';
      const draw=()=>{try{(mode==='video'&&vid.readyState>=2)?x.drawImage(vid,0,0,W,H):x.drawImage(img,0,0,W,H);}catch(e){}};draw();setInterval(draw,60);
      let dst=null;try{const ac=new(window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();dst=ac.createMediaStreamDestination();ac.createMediaElementSource(vid).connect(dst);window.__botAC=ac;}catch(e){}
      const playOnce=async()=>{mode='video';try{vid.currentTime=0;if(window.__botAC&&window.__botAC.state==='suspended')await window.__botAC.resume();await vid.play();}catch(e){setTimeout(playOnce,1500);}};
      vid.onended=()=>{mode='portrait';setTimeout(playOnce,1000+Math.random()*9000);};playOnce();
      const stream=c.captureStream(15);if(dst)for(const t of dst.stream.getAudioTracks())stream.addTrack(t);return stream;};
      navigator.mediaDevices.getUserMedia=mk;navigator.mediaDevices.getDisplayMedia=mk;${autoOn} })();`;
  }
  // solid swatch, camera ON
  return `(() => { const mk = async () => { const c=document.createElement('canvas');c.width=240;c.height=426;const x=c.getContext('2d');
    const hue=${Math.floor(Math.random() * 360)};const paint=()=>{x.fillStyle='hsl('+hue+',40%,30%)';x.fillRect(0,0,c.width,c.height);x.fillStyle='#fff';x.font='bold 22px system-ui';x.textAlign='center';x.fillText(${JSON.stringify(cfg.name)},c.width/2,c.height/2);};
    paint();setInterval(paint,1000);const s=c.captureStream(4);try{const ac=new AudioContext();const d=ac.createMediaStreamDestination();for(const t of d.stream.getAudioTracks())s.addTrack(t);}catch(e){}return s;};
    if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=mk;navigator.mediaDevices.getDisplayMedia=mk;}${autoOn} })();`;
}

// ---- phone-reality levers (the behavior battery's lever set) ---------------
// Node-side desired state; REAPPLIED after every page load (a reload — user
// or self-heal — wipes in-page overrides, but the phone it simulates is
// still hidden / on battery / in a tunnel).
function parseBattery(spec, profile) {
  // default: a phone is ON BATTERY at 90% (tier ≥1 by policy); a desktop is
  // plugged in (tier 0). '<lvl>[,charging|drain]' overrides.
  const st = profile === 'phone' ? { level: 0.9, charging: false, drain: false }
    : { level: 1, charging: true, drain: false };
  if (!spec) return st;
  for (const part of String(spec).split(',')) {
    const p = part.trim();
    if (p === 'charging') st.charging = true;
    else if (p === 'drain') { st.charging = true; st.drain = true; }
    else if (p === 'discharging' || p === 'battery') st.charging = false;
    else if (p !== '' && !isNaN(+p)) { let v = +p; if (v > 1) v = v / 100; st.level = Math.max(0, Math.min(1, v)); }
  }
  return st;
}
const lever = { hidden: false, frozen: false, radioOff: false, batt: parseBattery(cfg.battery, cfg.profile) };
let cdp = null; // CDP session for the web-lifecycle freeze lever

// The fake navigator.getBattery — installed at init so run.html's tier
// machinery subscribes to US. window.__bbBatt.set(level, charging) fires the
// same events a real battery does.
function batteryInitScript() {
  return `(() => {
    const st = { level: ${lever.batt.level}, charging: ${lever.batt.charging} };
    const ls = {};
    const batt = { chargingTime: Infinity, dischargingTime: Infinity,
      get level() { return st.level; }, get charging() { return st.charging; },
      onchargingchange: null, onlevelchange: null,
      addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
      removeEventListener(t, f) { ls[t] = (ls[t] || []).filter((x) => x !== f); },
      dispatchEvent() { return true; } };
    window.__bbBatt = { get: () => ({ level: st.level, charging: st.charging }),
      set(level, charging) {
        const lc = st.level !== level, cc = st.charging !== charging;
        st.level = level; st.charging = charging;
        const fire = (n) => { try { if (batt['on' + n]) batt['on' + n](); } catch (e) {} for (const f of (ls[n] || [])) { try { f(); } catch (e) {} } };
        if (cc) fire('chargingchange');
        if (lc) fire('levelchange');
      } };
    navigator.getBattery = () => Promise.resolve(batt);
  })();`;
}

// RADIO SILENCE (coverage dropout): while __bbRadio.off, the relay WebSocket
// and every DataChannel go quiet BOTH directions with NO close events — a
// tunnel, not a hangup — and new WebSockets fail after a few seconds the way
// a no-coverage dial does. Media frames keep flowing locally (loopback UDP is
// not blockable per-page); the PROTOCOL plane — signaling, pulses, relay — is
// what the mesh heals on, and that is silenced honestly.
function radioInitScript() {
  return `(() => {
    window.__bbRadio = { off: false };
    window.__bbRx = {}; // passive WS receive tally by frame type (diagnostics)
    window.__bbDcRx = {}; // passive DC receive tally by k-field (diagnostics)
    const tally = (e) => { try { const t = JSON.parse(e.data).t; if (t) window.__bbRx[t] = (window.__bbRx[t] || 0) + 1; } catch (x) {} };
    const dcTally = (e) => { try { const k = JSON.parse(e.data).k; if (k) window.__bbDcRx[k] = (window.__bbDcRx[k] || 0) + 1; } catch (x) {} };
    const gate = (proto) => {
      const isWs = proto === RealWS.prototype;
      const send = proto.send;
      proto.send = function () { if (window.__bbRadio.off) return; return send.apply(this, arguments); };
      const om = Object.getOwnPropertyDescriptor(proto, 'onmessage');
      if (om && om.set) Object.defineProperty(proto, 'onmessage', { configurable: true,
        get() { return this.__bbOm || null; },
        set(fn) { this.__bbOm = fn; om.set.call(this, fn ? ((e) => { if (window.__bbRadio.off) return; if (isWs) tally(e); else dcTally(e); fn.call(this, e); }) : null); } });
      const add = proto.addEventListener;
      proto.addEventListener = function (t, f, o) {
        if (t === 'message' && typeof f === 'function') { const w = (e) => { if (!window.__bbRadio.off) f.call(this, e); }; return add.call(this, t, w, o); }
        return add.call(this, t, f, o); };
    };
    const RealWS = window.WebSocket;
    gate(RealWS.prototype);
    if (window.RTCDataChannel) gate(RTCDataChannel.prototype);
    window.WebSocket = function (url, protos) {
      if (!window.__bbRadio.off) return new RealWS(url, protos);
      const fake = { url: String(url), readyState: 0, bufferedAmount: 0, binaryType: 'arraybuffer',
        onopen: null, onmessage: null, onerror: null, onclose: null,
        send() {}, close() { this.readyState = 3; },
        addEventListener(t, f) { this['__bb_' + t] = f; }, removeEventListener() {}, dispatchEvent() { return true; } };
      setTimeout(() => { if (fake.readyState === 3) return; fake.readyState = 3;
        try { if (fake.onerror) fake.onerror(new Event('error')); } catch (e) {}
        try { if (fake.__bb_error) fake.__bb_error(new Event('error')); } catch (e) {}
        const ev = { code: 1006, reason: '', wasClean: false };
        try { if (fake.onclose) fake.onclose(ev); } catch (e) {}
        try { if (fake.__bb_close) fake.__bb_close(ev); } catch (e) {} }, 2500 + Math.random() * 3500);
      return fake;
    };
    window.WebSocket.prototype = RealWS.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) window.WebSocket[k] = RealWS[k];
  })();`;
}

// Process-tree walk via /proc (Linux). The browser is a CHILD of this very
// process (playwright spawns it), so descendants of process.pid are exactly
// the browser tree — no playwright API needed (browser.process() is absent
// in some playwright builds). meet.js always runs on the same box as the
// browser it drives, so this holds locally and over ssh alike.
function procTree() {
  const ppid = {}, cmd = {};
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    try {
      const st = fs.readFileSync('/proc/' + p + '/stat', 'utf8');
      ppid[p] = st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; // comm may contain spaces
      cmd[p] = fs.readFileSync('/proc/' + p + '/cmdline', 'utf8');
    } catch (e) {}
  }
  const isDesc = (p) => { let cur = ppid[p], hops = 0; while (cur && hops++ < 15) { if (+cur === process.pid) return true; cur = ppid[cur]; } return false; };
  return { ppid, cmd, isDesc };
}
// the freeze lever's target: every content/renderer process under OUR tree.
// Each engine names it differently — chromium `--type=renderer`, firefox
// `-contentproc`, webkit `WebKitWebProcess`.
const RENDERER_MARK = { chromium: '--type=renderer', firefox: '-contentproc', webkit: 'WebKitWebProcess' };
function rendererPids() {
  const t = procTree();
  const mark = RENDERER_MARK[ENGINE];
  return Object.keys(t.cmd).filter((p) => t.cmd[p] && t.cmd[p].includes(mark) && t.isDesc(p)).map(Number);
}
// the die lever's target: the whole browser tree under us
function browserTreePids() {
  const t = procTree();
  return Object.keys(t.cmd).filter((p) => t.isDesc(p)).map(Number);
}

// Visibility override — the pattern proven in e2e-vis-park/-away-holdover/-pip.
const applyVisibility = (pg, hidden) => pg.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

// Reapply every lever after any page load (reload command, self-heal reload).
async function reapplyLevers() {
  if (!page) return;
  try {
    await page.evaluate((b) => { if (window.__bbBatt) window.__bbBatt.set(b.level, b.charging); }, lever.batt);
    if (lever.batt.drain) { await sleep(400); await page.evaluate((b) => { if (window.__bbBatt) window.__bbBatt.set(Math.max(0, b.level - 0.01), true); }, lever.batt); }
    await page.evaluate((off) => { if (window.__bbRadio) window.__bbRadio.off = off; }, lever.radioOff);
    if (lever.hidden) await applyVisibility(page, true);
  } catch (e) { /* mid-navigation */ }
}

// ---- in-page snapshot (guarded; the whole thing reads window.__gifosVideo) --
function snapshotInPage() {
  const V = window.__gifosVideo;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  if (!V || !V.debugDump) return { err: 'no __gifosVideo hook yet' };
  const d = g(() => V.debugDump(), {});
  const tx = g(() => V.txStats(), {});
  const grid = [...document.querySelectorAll('#grid .tile')];
  const gridVisible = grid.filter((t) => t.style.display !== 'none');
  return {
    coord: d.me && d.me.coord, state: d.me && d.me.state, links: d.me && d.me.links, occ: d.me && d.me.occ,
    inMeeting: d.inMeeting, participants: d.participants, consent: d.consent,
    rosterN: (d.roster || []).length,
    withCoord: (d.roster || []).filter((r) => r.coord).length,
    connY: (d.roster || []).filter((r) => r.conn).length,
    liveVid: (d.roster || []).filter((r) => r.vid).length,
    relayedN: (d.roster || []).filter((r) => r.relay).length, // friend-relayed peers — a WORKING call liveLinks reads as down
    ghosts: (d.ghosts || []).length, dups: (d.dups || []).length,
    forkPaused: g(() => !!(window.gifosMeet && window.gifosMeet.forkPaused && window.gifosMeet.forkPaused()), false),
    gridShown: gridVisible.length, gridTotal: grid.length,
    tx, mosaic: d.mosaic, roster: d.roster || [], rows: d.rows || [], me: d.me,
    ghostList: d.ghosts || [], dupList: d.dups || [],
    composites: { section: !!document.querySelector('[data-row="sec"]'), stadium: !!document.querySelector('[data-row="sd"]'), stage: !!document.querySelector('[data-row="sgs"]') },
  };
}

// ---- rendering ------------------------------------------------------------
function streamLine(t, s, level) {
  if (s.err) return `t+${t}s  (${s.err})`;
  const seat = s.coord || (s.state != null ? 'st' + s.state : 'unseated');
  let line = `t+${pad(t, 4)} seat=${pad(seat, 8)} inMtg=${s.inMeeting} occ=${s.occ} links=${s.links} vid=${s.liveVid}/${s.rosterN}${s.relayedN ? ' via=' + s.relayedN : ''}${s.forkPaused ? ' FORK-PAUSED' : ''}`;
  // The one line the 7-hour fork never had. Loud at EVERY level, including
  // -q: a room that has silently split is not a detail of the stream.
  if (s.fork && s.fork.fork) line += `  ***${forkLine(s.fork)}***`;
  if (LEVELS[level] >= 1) line += ` grid=${s.gridShown}/${s.gridTotal} consent=${s.consent} ghosts=${s.ghosts} dups=${s.dups} net{relay:${s.tx.relaySig || 0} dc:${s.tx.dcSig || 0} fwd:${s.tx.fwdSig || 0}}`;
  if (LEVELS[level] >= 2) {
    const mos = s.mosaic || {};
    line += `\n     composites: section=${s.composites.section} stadium=${s.composites.stadium} stage=${s.composites.stage}  mosaic{multi:${mos.multi} head:${mos.head} s1:${mos.s1} stagers:${mos.stagers}}`;
    line += '\n     roster: ' + s.roster.slice(0, 10).map((r) => (r.name || r.peer).split(' ')[0] + '@' + (r.coord || '?') + (r.vid ? '📹' : '')).join(' ');
  }
  if (LEVELS[level] >= 3) line += '\n     DUMP ' + JSON.stringify({ me: s.me, tx: s.tx, mosaic: s.mosaic });
  return line;
}

// ---- browser session ------------------------------------------------------
let browser = null, ctx = null, page = null, joined = false, lastRoomKey = '';
let forkAutoTimer = null;
// R5 pick-one auto-answer: when the page pauses at the fork modal, click its
// FIRST choice through the page's own UI (the exact click a human would
// make). Runs in every mode — drive, mon, watch, repl — because ANY headless
// run can hit the modal and no mode can wait on a human.
function armForkAuto() {
  if (forkAutoTimer) clearInterval(forkAutoTimer);
  if (!cfg.forkAuto) return;
  forkAutoTimer = setInterval(async () => {
    if (!page) return;
    try {
      const picked = await page.evaluate(() => {
        const gm = window.gifosMeet;
        if (!gm || !gm.forkPaused || !gm.forkPaused()) return null;
        const b = document.querySelector('#fork-choices button');
        if (!b) return null;
        const label = (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        b.click();
        return label;
      });
      if (picked) console.error('[fork-auto] pick-one modal answered — chose "' + picked + '" (use --fork-ask to leave it for a human)');
    } catch (e) {}
  }, 4000);
}
let intentionalKill = false; // die/quit set this — an EXPECTED browser death
// BB_ACTOR=1 rides in the browser process environment in drive mode — the
// engine-neutral replacement for the --bb-actor marker switch (see the engine
// resolution block). Inherited by every renderer/content child.
function launchEnv() {
  return MODE === 'drive' ? Object.assign({}, process.env, { BB_ACTOR: '1' }) : undefined;
}
async function ensureBrowser() {
  if (browser) return;
  if (!IS_CR) {
    const insecure = process.env.MEET_INSECURE_ORIGINS || process.env.SWARM_INSECURE_ORIGINS || '';
    let ffPrefs = null;
    if (insecure && ENGINE === 'firefox') {
      // Gecko's escape hatch: a HOST allowlist (no scheme, no port). The two
      // media prefs are belt-and-braces — the allowlist alone already restores
      // navigator.mediaDevices, but an older Gecko wants them.
      const hosts = insecure.split(',').map((o) => { try { return new URL(o.trim()).hostname; } catch (e) { return o.trim().replace(/^\w+:\/\//, '').split(':')[0]; } })
        .filter(Boolean).join(',');
      ffPrefs = { 'dom.securecontext.allowlist': hosts, 'media.devices.insecure.enabled': true, 'media.getusermedia.insecure.enabled': true };
      console.error('[meet] firefox: dom.securecontext.allowlist=' + hosts + ' (plain-http origin treated as secure)');
    } else if (insecure) {
      console.error('[meet] WARNING: --engine ' + ENGINE + ' has no insecure-origin escape hatch (chromium has a switch, firefox has a pref, webkit has neither). '
        + 'A plain-http non-localhost base is NOT a secure context here — gUM and WebRTC will not run.');
    }
    browser = await launcher.launch(Object.assign({ headless: !cfg.headful },
      ENGINE_EXE ? { executablePath: ENGINE_EXE } : {},
      ffPrefs ? { firefoxUserPrefs: ffPrefs } : {},
      launchEnv() ? { env: launchEnv() } : {}));
    browser.on('disconnected', () => {
      if (MODE === 'drive' || intentionalKill) return;
      console.error('[meet] browser died unexpectedly — exiting so the supervisor respawns');
      process.exit(1);
    });
    return;
  }
  browser = await chromium.launch({ headless: !cfg.headful, executablePath: CHROME,
    ...(launchEnv() ? { env: launchEnv() } : {}),
    // Playwright injects --disable-dev-shm-usage by default; dropping it from
    // args below is not enough, it has to be suppressed here too.
    ignoreDefaultArgs: ['--disable-dev-shm-usage'], args: [
    // NB: no --disable-dev-shm-usage here. That flag belongs to swarm.js, which
    // runs hundreds of bots and would exhaust /dev/shm; meet.js is strictly a
    // single browser (ensureBrowser guards one instance), so spilling shared
    // memory to /tmp just burns disk — ~30GB/day on the Pi's SD card.
    '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    // drive-mode browsers carry a MARKER flag (chromium ignores unknown
    // switches) so fleet cleanup can target ACTOR browsers and never a
    // resident monitor's (which shares every other launch arg)
    ...(MODE === 'drive' ? ['--bb-actor'] : []),
    '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests',
    // MEET_INSECURE_ORIGINS (comma list, same idea as SWARM_INSECURE_ORIGINS):
    // lets a plain-http harness on another box (tailnet/LAN, no cert) still
    // count as a secure context for getUserMedia/WebRTC.
    ...((process.env.MEET_INSECURE_ORIGINS || process.env.SWARM_INSECURE_ORIGINS)
      ? ['--unsafely-treat-insecure-origin-as-secure=' + (process.env.MEET_INSECURE_ORIGINS || process.env.SWARM_INSECURE_ORIGINS)] : []),
  ] });
  // A dead browser with a live REPL is a monitor that silently stopped
  // monitoring (the pi, 2026-07-27: chromium died minutes after joining and
  // meet.js sat there while run.sh's respawn loop had nothing to respawn).
  // Outside drive mode (where the orchestrator owns actor lifecycles and
  // `die` is a lever), an unexpected browser death is fatal ON PURPOSE — the
  // supervisor loop is the recovery.
  browser.on('disconnected', () => {
    if (MODE === 'drive' || intentionalKill) return;
    console.error('[meet] browser died unexpectedly — exiting so the supervisor respawns');
    process.exit(1);
  });
}
async function join(room, opts) {
  opts = opts || {};
  if (opts.pass !== undefined) cfg.pass = opts.pass;
  if (opts.relay !== undefined) cfg.relay = opts.relay;
  if (opts.av !== undefined) cfg.av = opts.av;
  if (opts.bc !== undefined) cfg.bc = opts.bc;
  if (opts.video) { cfg.videoIdx = -1; }
  cfg.room = room;
  await ensureBrowser();
  if (ctx) { try { await ctx.close(); } catch (e) {} }
  const phone = cfg.profile === 'phone';
  ctx = await browser.newContext(Object.assign(
    { viewport: phone ? { width: 390, height: 844 } : { width: 900, height: 820 } },
    // 'camera'/'microphone' are CHROMIUM permission names: WebKit throws
    // "Unknown permission: camera" and Firefox does not implement them. The
    // injected gUM (camInitScript) never triggers a prompt anyway.
    IS_CR ? { permissions: ['camera', 'microphone'] } : {},
    // isMobile is unsupported in Firefox (playwright throws); the rest of the
    // phone shape (viewport, UA, touch) carries fine.
    phone ? Object.assign({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', hasTouch: true, deviceScaleFactor: 3 },
      ENGINE === 'firefox' ? {} : { isMobile: true }) : {}));
  const roomKey = room + (cfg.av ? '.' + cfg.av : '');
  const seed = "localStorage.setItem('gifos_name'," + JSON.stringify(cfg.name) + ");localStorage.setItem('gifos_meet_bar','1');"
    + (cfg.relay ? "localStorage.setItem('gifos_relay'," + JSON.stringify(cfg.relay) + ");" : '')
    // ensure-pass NEVER pre-seeds the password: it must knock without one
    // first, so an open room stays joinable and gets LOCKED by us — a
    // pre-seeded pw at an open door is a proof mismatch the relay rejects.
    + (cfg.pass && !cfg.ensurePass ? "localStorage.setItem(" + JSON.stringify('gifos_vpw_' + roomKey) + "," + JSON.stringify(cfg.pass) + ");" : '');
  // A DIFFERENT room is a different stadium: the dwell clocks mean nothing
  // across it. The SAME room deliberately keeps them (a rejoin does not
  // absolve a peer that has been outside my tree the whole time).
  if (roomKey !== lastRoomKey) { forkWatch = makeForkWatch({ dwellMs: cfg.forkDwell }); lastForkVerdict = null; lastForkProbe = null; forkAnnounced = false; }
  lastRoomKey = roomKey;
  await ctx.addInitScript({ content: seed });
  await ctx.addInitScript({ content: batteryInitScript() });
  await ctx.addInitScript({ content: radioInitScript() });
  await ctx.addInitScript({ content: camInitScript() });
  if (cfg.meshC) await ctx.addInitScript({ content: 'window.GIFOS_SCALE = Object.assign(window.GIFOS_SCALE || {}, { C: ' + cfg.meshC + ' });' });
  // --init-script <file>: one extra page-init script, injected LAST (after the
  // cam/battery/radio shims, before any page code runs). The reason it exists:
  // measuring an engine sometimes needs a hook the page does not export —
  // per-peer getStats, for instance, needs the RTCPeerConnection objects, and
  // run.html keeps them in a closure. `eval` runs too late to wrap a
  // constructor. One file, any engine, no fork of the tool.
  if (cfg.initScript) await ctx.addInitScript({ content: fs.readFileSync(cfg.initScript, 'utf8') });
  if (cfg.adminPw && !cfg.av) {
    // derive the admin verifier in a bootstrap page of THIS context, so the
    // signed-in key stash lands in the localStorage the room page will read
    const boot = await ctx.newPage();
    await boot.goto(cfg.base + '/run.html' + (cfg.edge ? '?edge' : ''), { waitUntil: 'domcontentloaded' });
    await boot.waitForFunction(() => window.GifOS && GifOS.net && GifOS.net.edKeysFromSeedHex, null, { timeout: 20000 });
    cfg.av = await boot.evaluate(async ([roomId, pw]) => {
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
      const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
      const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
      localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
      return V;
    }, [room, cfg.adminPw]);
    await boot.close();
    console.error('[meet] admin verifier ' + cfg.av);
  }
  if (cfg.seedDesktop) {
    // An app share needs a store with apps in it; a fresh profile has none.
    // First-visit the desktop in a bootstrap page of THIS context (same
    // origin ⇒ same store) — the seed GIF-encodes the sample apps, which is
    // CPU-bound and slow on a small box.
    const seedPg = await ctx.newPage();
    console.error('[meet] seeding desktop (sample apps → store, ~90s)…');
    await seedPg.goto(cfg.base + '/index.html' + (cfg.edge ? '?edge' : ''), { waitUntil: 'domcontentloaded' });
    await seedPg.waitForSelector('.icon', { timeout: 150000 });
    await seedPg.close();
    console.error('[meet] desktop seeded');
  }
  page = await ctx.newPage();
  cdp = null; // stale CDP session dies with the old page
  page.on('load', () => { reapplyLevers(); }); // levers survive reloads (incl. the self-heal reload)
  page.on('pageerror', (e) => { if (LEVELS[cfg.level] >= 3) console.error('  [pageerror] ' + String(e).slice(0, 200)); });
  page.on('crash', () => console.error('  [CRASH] the renderer process died — a first-class flakiness cause (rtp_sender CHECK class); everything this page carried is gone'));
  page.on('console', (m) => { if (LEVELS[cfg.level] >= 3 && m.type() === 'error' && !/404|blocked by client/i.test(m.text())) console.error('  [cerr] ' + m.text().slice(0, 160)); });
  const url = cfg.base + '/run.html' + (cfg.edge ? '?edge' : '') + '#v=' + room + (cfg.av ? '&av=' + cfg.av : '') + (cfg.bc ? '&bc=1' : '') + (cfg.relay ? '&relay=' + encodeURIComponent(cfg.relay) : '') + '&DEBUG=on'; // the CLI IS the debug surface
  console.error('[meet] joining ' + url + ' as "' + cfg.name + '" [' + ENGINE + ']' + (cfg.pass ? ' (locked)' : '') + (cfg.videoIdx !== null ? ' +video' : cfg.solidCam ? ' +cam' : ' (observer)'));
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => console.error('[goto] ' + e.message));
  await page.waitForFunction(() => !!(window.__gifosVideo && window.__gifosVideo.debugDump), null, { timeout: 30000 }).catch(() => {});
  joined = true;
  armForkAuto();
}
// ---- the fork watch --------------------------------------------------------
// One watch per process (the dwell clocks are per SESSION — a rejoin keeps the
// same relay session, and a peer that has been outside my tree across my own
// reload is MORE suspicious, not less). Reset only when the room changes.
let forkWatch = makeForkWatch({ dwellMs: cfg.forkDwell });
let lastForkProbe = null, lastForkVerdict = null, forkAnnounced = false;
// A transition is the alarm. Both edges go to stderr, which on the monitor is
// the durable stderr.log — the 7-hour fork left NOTHING in any log, and one
// line at 17:31Z would have ended the whole investigation.
function noteFork(v) {
  if (!v || !v.ok || !cfg.forkDwell) return;
  if (v.fork && !forkAnnounced) {
    forkAnnounced = true;
    console.error('[FORK] ' + new Date().toISOString() + '  ' + forkLine(v));
    console.error('[FORK] door trace: ' + JSON.stringify((lastForkProbe && lastForkProbe.trace) || []));
  } else if (!v.fork && forkAnnounced) {
    forkAnnounced = false;
    console.error('[FORK] ' + new Date().toISOString() + '  CLEARED — ' + forkLine(v));
  }
}
const D = async () => {
  const s = await page.evaluate(snapshotInPage).catch((e) => ({ err: String(e).slice(0, 140) }));
  if (!s || s.err || !cfg.forkDwell) return s;
  const p = await page.evaluate(forkProbeInPage).catch((e) => ({ err: String(e).slice(0, 80) }));
  lastForkProbe = p;
  lastForkVerdict = forkWatch.feed(p);
  s.fork = lastForkVerdict;
  noteFork(lastForkVerdict);
  return s;
};

// ---- the A/V feed monitor (`mon`) -----------------------------------------
// One in-page sample: the monInfo()/avStats() hooks when present (this repo's
// build), else a degraded rebuild from mosaic() + DOM (deployed builds).
function monSampleInPage() {
  const V = window.__gifosVideo;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const vidInfo = (v) => v ? { sid: v.srcObject ? String(v.srcObject.id).slice(0, 8) : null,
    w: v.videoWidth, h: v.videoHeight, paused: v.paused,
    frames: v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames : -1 } : null;
  if (!V) return { err: 'no __gifosVideo hook yet' };
  let mon = V.monInfo ? g(() => V.monInfo(), null) : null;
  if (mon) { // shorten tile sids to match the degraded path
    for (const k of ['sd', 'sgs']) if (mon.tiles[k] && mon.tiles[k].sid) mon.tiles[k].sid = String(mon.tiles[k].sid).slice(0, 8);
  } else {
    const m = g(() => V.mosaic(), null) || {};
    const c = m.coord;
    mon = { t: Date.now(), degraded: true, coord: c ? (c.pc + '/' + c.r + '.' + c.i) : null, head: !!m.head, s1: !!m.s1,
      tiles: { sd: vidInfo(document.querySelector('[data-row="sd"] video')), sgs: vidInfo(document.querySelector('[data-row="sgs"] video')) },
      claims: (m.claimVia || []).map((x) => ({ rk: x.rk, via: String(x.via).slice(0, 8), sid: String(x.sid).slice(0, 8) })),
      standby: (m.standbyVia || []).map((x) => ({ rk: x.rk, via: String(x.via).slice(0, 8), sid: String(x.sid).slice(0, 8) })),
      jobs: (m.jobsActive || []).map((s) => ({ jk: s.slice(0, -1), active: s.slice(-1) === '+' })),
      demand: (m.demand || []).map((s) => { const q = s.lastIndexOf('='); return { k: s.slice(0, q), v: s.slice(q + 1) }; }),
      ear: [], packs: { prod: m.prod || null, sd: m.sd || null }, stagers: m.stagers || 0 };
  }
  const fin = (stats) => ({ mon, stats: stats || null });
  return (V.avStats ? V.avStats().then(fin, () => fin(null)) : fin(null));
}
// Diff two samples; push `[t, type, detail]` events. st holds per-key trackers.
function monDiff(st, cur, t, ev) {
  const mon = cur.mon;
  // --- tiles: present / src / black / frame progress (stall) ---
  for (const k of ['sd', 'sgs']) {
    const tv = mon.tiles[k];
    let pv = st.tiles[k];
    if (!pv) { pv = { present: false, sid: null, black: null, frames: null, lastProgT: null, stalledAt: null }; st.tiles[k] = pv; }
    const present = !!tv;
    if (present !== pv.present) { const c = 'tile.' + k + (present ? '.on' : '.off'); ev.push([t, 'tile', k + (present ? ' ON' : ' OFF') + (tv && tv.sid ? ' sid=' + tv.sid : '')]); st.n[c] = (st.n[c] || 0) + 1; }
    if (present) {
      if (pv.present && tv.sid !== pv.sid) { ev.push([t, 'tile', k + ' SRC ' + pv.sid + '→' + tv.sid]); st.n['tile.' + k + '.src'] = (st.n['tile.' + k + '.src'] || 0) + 1; }
      const black = !(tv.w > 0);
      if (pv.present && pv.black != null && black !== pv.black) { ev.push([t, 'tile', k + (black ? ' BLACK' : ' LIVE ' + tv.w + 'x' + tv.h)]); if (black) st.n['tile.' + k + '.black'] = (st.n['tile.' + k + '.black'] || 0) + 1; }
      // frame progress → stall detection (>2s without a new frame while live)
      if (!black && tv.frames >= 0) {
        if (pv.lastProgT == null) pv.lastProgT = t;
        if (pv.frames != null && tv.frames > pv.frames) { // progressing
          if (pv.stalledAt != null) { const dur = t - pv.stalledAt; ev.push([t, 'stall', k + ' RESUMED after ' + dur.toFixed(1) + 's']); st.n['stall.' + k] = (st.n['stall.' + k] || 0) + 1; if (dur > (st.maxStall[k] || 0)) st.maxStall[k] = dur; }
          pv.lastProgT = t; pv.stalledAt = null;
        } else if (pv.frames != null && t - pv.lastProgT > 2 && pv.stalledAt == null) {
          pv.stalledAt = pv.lastProgT; ev.push([t, 'stall', k + ' STALLED (no frames since t+' + pv.lastProgT.toFixed(1) + ')']);
        }
      } else { pv.lastProgT = t; pv.stalledAt = null; } // black/absent-frames handled by BLACK events
      pv.sid = tv.sid; pv.black = black; pv.frames = tv.frames;
    } else { pv.sid = null; pv.black = null; pv.frames = null; pv.lastProgT = null; pv.stalledAt = null; }
    pv.present = present;
  }
  // --- claims / standby: gain, loss, via-switch ---
  const diffSet = (name, prevMap, arr, keyF, valF) => {
    const now = new Map(arr.map((x) => [keyF(x), valF(x)]));
    for (const [k, v] of now) {
      const p = prevMap.get(k);
      if (p == null) { ev.push([t, name, '+' + k + '@' + v]); st.n[name + '.gain'] = (st.n[name + '.gain'] || 0) + 1; }
      else if (p !== v) { ev.push([t, name, k + ' ' + p + '→' + v]); st.n[name + '.switch'] = (st.n[name + '.switch'] || 0) + 1; }
    }
    for (const k of prevMap.keys()) if (!now.has(k)) { ev.push([t, name, '-' + k]); st.n[name + '.loss'] = (st.n[name + '.loss'] || 0) + 1; }
    return now;
  };
  st.claims = diffSet('claim', st.claims, mon.claims, (x) => x.rk, (x) => x.via + '/' + x.sid);
  st.standby = diffSet('standby', st.standby, mon.standby, (x) => x.rk, (x) => x.via + '/' + x.sid);
  st.jobs = diffSet('job', st.jobs, mon.jobs, (x) => x.jk, (x) => (x.active ? 'hot' : 'dormant'));
  st.demand = diffSet('demand', st.demand, mon.demand, (x) => x.k, (x) => x.v);
  st.ear = diffSet('ear', st.ear, (mon.ear || []).map((k) => ({ k })), (x) => x.k, () => 'in');
  // --- packer canvas dimension churn (decoder-visible resizes) ---
  if (mon.packs && mon.packs.sd) {
    const d = mon.packs.sd.w + 'x' + mon.packs.sd.h;
    if (st.sdDims && d !== st.sdDims) { ev.push([t, 'pack', 'sd canvas ' + st.sdDims + '→' + d]); st.n['pack.resize'] = (st.n['pack.resize'] || 0) + 1; }
    if (mon.packs.sd.w != null) st.sdDims = d;
  }
  if (st.coord && mon.coord !== st.coord) { ev.push([t, 'seat', st.coord + '→' + mon.coord]); st.n['seat.move'] = (st.n['seat.move'] || 0) + 1; }
  st.coord = mon.coord;
  // --- per-pipe WebRTC stats: video frame + audio packet deltas ---
  if (cur.stats) {
    const seen = new Set();
    for (const s of cur.stats) {
      if (s.dir !== 'in') continue;
      const key = s.pid + '/' + (s.slot || s.kind + ':' + String(s.trk).slice(0, 6));
      seen.add(key);
      const p = st.pipes.get(key) || { lastProgT: t, stalledAt: null };
      const prog = s.kind === 'video' ? s.fdec : s.pkts;
      const labelled = !!s.slot; // only claimed/labelled pipes are worth events
      if (p.prog != null && prog > p.prog) {
        if (p.stalledAt != null && labelled) { ev.push([t, 'pipe', s.kind + ' ' + key + ' RESUMED after ' + (t - p.stalledAt).toFixed(1) + 's']); st.n['pipe.' + s.kind + '.stall'] = (st.n['pipe.' + s.kind + '.stall'] || 0) + 1; }
        p.lastProgT = t; p.stalledAt = null;
      } else if (p.prog != null && p.lastProgT != null && t - p.lastProgT > 2 && p.stalledAt == null) {
        p.stalledAt = p.lastProgT;
        if (labelled) ev.push([t, 'pipe', s.kind + ' ' + key + ' STALLED']);
      }
      p.prog = prog; p.ae = s.ae; st.pipes.set(key, p);
    }
    for (const k of [...st.pipes.keys()]) if (!seen.has(k)) st.pipes.delete(k);
  }
}
async function runMon(secs, intervalMs) {
  const T = secs || 120, iv = Math.max(200, intervalMs || 1000);
  // Box saturation confounds flakiness: a starved bot stalls for CPU reasons,
  // not protocol reasons. Record loadavg with every sample so each event line
  // (and the summary) can be correlated with saturation — protocol-level flaps
  // (claim churn, unship/reship, tile teardown) are real bugs at ANY load;
  // frame stalls under loadavg >> cores may be the box, not the mesh.
  const loadNow = () => { try { return parseFloat(fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]); } catch (e) { return -1; } };
  console.log('MON start ' + T + 's @ ' + iv + 'ms — transitions only; MON SUM at the end. loadavg=' + loadNow());
  const st = { tiles: {}, claims: new Map(), standby: new Map(), jobs: new Map(), demand: new Map(), ear: new Map(), pipes: new Map(), n: {}, maxStall: {}, coord: null };
  const events = [];
  const t0 = Date.now();
  let first = true, degraded = false, hbAt = 0;
  const loads = [];
  while ((Date.now() - t0) / 1000 < T) {
    const tick = Date.now();
    const cur = await page.evaluate(monSampleInPage).catch((e) => ({ err: String(e).slice(0, 120) }));
    const t = (Date.now() - t0) / 1000;
    if (cur && cur.err) { console.log('MON t+' + t.toFixed(1) + ' ERR ' + cur.err); }
    else if (cur && cur.mon) {
      degraded = !!cur.mon.degraded;
      const ev = [];
      monDiff(st, cur, t, ev);
      if (first) { // baseline snapshot, not transitions
        events.length = 0; st.n = {}; first = false;
        const sd = cur.mon.tiles.sd;
        console.log('MON t+' + t.toFixed(1) + ' BASE seat=' + cur.mon.coord + ' head=' + cur.mon.head
          + ' sd=' + (sd ? (sd.w + 'x' + sd.h + ' sid=' + sd.sid) : 'ABSENT')
          + ' claims=[' + cur.mon.claims.map((c) => c.rk).join(',') + '] jobs=' + cur.mon.jobs.length
          + ' standby=[' + cur.mon.standby.map((c) => c.rk).join(',') + ']'
          + (degraded ? ' (degraded: no monInfo hooks)' : ''));
      } else {
        const ld = loadNow(); loads.push(ld);
        for (const e of ev) { events.push(e); console.log('MON t+' + e[0].toFixed(1) + ' EV ' + e[1] + ' ' + e[2] + ' load=' + ld); }
        if (t - hbAt >= 15) { // periodic heartbeat so a healthy run is visibly healthy
          hbAt = t;
          const sd = cur.mon.tiles.sd, pk = cur.mon.packs && cur.mon.packs.sd;
          console.log('MON t+' + t.toFixed(1) + ' HB seat=' + cur.mon.coord + ' sd=' + (sd ? (sd.w + 'x' + sd.h + ' f=' + sd.frames) : 'ABSENT')
            + ' claims=' + cur.mon.claims.length + ' standby=' + cur.mon.standby.length + ' jobs=' + cur.mon.jobs.filter((j) => j.active).length + '/' + cur.mon.jobs.length + ' stg=' + cur.mon.stagers
            + (pk ? ' pack{cost=' + pk.cost + ' drop=' + pk.dropped + '}' : '') + ' load=' + ld);
        }
      }
    }
    const spent = Date.now() - tick;
    if (spent < iv) await sleep(iv - spent);
  }
  // ---- summary ----
  const keys = Object.keys(st.n).sort();
  const lmin = loads.length ? Math.min(...loads) : -1, lmax = loads.length ? Math.max(...loads) : -1;
  const lavg = loads.length ? (loads.reduce((a, b) => a + b, 0) / loads.length) : -1;
  console.log('MON SUM secs=' + T + (degraded ? ' (degraded)' : '') + ' events=' + events.length
    + ' loadavg{min=' + lmin.toFixed(1) + ' avg=' + lavg.toFixed(1) + ' max=' + lmax.toFixed(1) + '}');
  console.log('MON SUM counts ' + (keys.length ? keys.map((k) => k + '=' + st.n[k]).join(' ') : '(none — clean run)'));
  const flap = (st.n['tile.sd.off'] || 0) + (st.n['tile.sd.on'] || 0) + (st.n['tile.sd.black'] || 0) + (st.n['tile.sd.src'] || 0);
  console.log('MON SUM stadium-flaps=' + flap + ' stalls.sd=' + (st.n['stall.sd'] || 0) + ' maxStall.sd=' + ((st.maxStall.sd || 0).toFixed ? (st.maxStall.sd || 0).toFixed(1) : 0) + 's claimChurn=' + ((st.n['claim.gain'] || 0) + (st.n['claim.loss'] || 0) + (st.n['claim.switch'] || 0)));
  if (events.length) {
    console.log('MON SUM timeline:');
    for (const e of events.slice(0, 200)) console.log('  t+' + e[0].toFixed(1) + ' ' + e[1] + ' ' + e[2]);
    if (events.length > 200) console.log('  … +' + (events.length - 200) + ' more');
  }
  return { counts: st.n, events: events.length, flap };
}

// ---- commands -------------------------------------------------------------
async function runCmd(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(' ');
  if (!cmd) return true;
  if (cmd === 'quit' || cmd === 'exit' || cmd === 'q') return false;
  if (cmd === 'help' || cmd === '?') { printHelp(); return true; }
  if (cmd === 'join') {
    const o = {}; let room = null;
    for (let i = 0; i < rest.length; i++) { const w = rest[i];
      if (w === '--pass') o.pass = rest[++i]; else if (w === '--relay') o.relay = rest[++i]; else if (w === '--av') o.av = rest[++i]; else if (w === '--bc') o.bc = true; else if (w === '--video') o.video = true; else if (!w.startsWith('--')) room = w; }
    if (!room) { console.log('  usage: join <room> [--pass x] [--relay ws(s)://…] [--video]'); return true; }
    await join(room, o); console.log('  joined "' + room + '" — give it a few seconds, then `state`'); return true;
  }
  if (!joined && cmd !== 'jstate') { console.log('  not in a meeting yet — `join <room> [--pass x] [--relay y]` first (or `help`)'); return true; }
  if (!joined && cmd === 'jstate') { console.log('@@state ' + JSON.stringify({ role: cfg.name, lever, err: 'not joined' })); return true; }

  if (cmd === 'cam' || cmd === 'mic') {
    const want = (arg || '').toLowerCase();
    await page.evaluate(([id, w]) => { const b = document.getElementById(id); if (!b) return; const off = b.classList.contains('off');
      if (w === 'on' && off) b.click(); else if (w === 'off' && !off) b.click(); else if (w !== 'on' && w !== 'off') b.click(); }, [cmd, want]);
    console.log('  ' + cmd + ' toggled'); return true;
  }
  if (cmd === 'name') { if (arg) await page.evaluate((n) => { try { localStorage.setItem('gifos_name', n); } catch (e) {} const el = document.getElementById('myname'); if (el) el.textContent = n; }, arg); console.log('  name → ' + arg); return true; }
  if (cmd === 'shot') {
    const p = arg || '/tmp/meet-shot.png';
    try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (e) {} // an orchestrator path may not exist on THIS box
    // Snap NOW (this instant). The meeting scrolls INSIDE #feed, so fullPage
    // alone only grabs the viewport — grow the viewport to the content height
    // so the WHOLE window (every tile, below the fold) is in one shot, then
    // restore. No fixed viewport clip, no lost tiles.
    const vp = page.viewportSize();
    const h = await page.evaluate(() => { const f = document.getElementById('feed'); return Math.max(document.documentElement.scrollHeight, f ? f.scrollHeight + 220 : 0, 1000); }).catch(() => 2200);
    const H = Math.min(Math.round(h), 12000);
    try { await page.setViewportSize({ width: (vp && vp.width) || 1200, height: H }); await sleep(450); } catch (e) {}
    await page.screenshot({ path: p, fullPage: true });
    if (vp) { try { await page.setViewportSize(vp); } catch (e) {} }
    console.log('  screenshot (whole window, ' + H + 'px tall) → ' + p);
    return true;
  }
  if (cmd === 'chat') {
    if (arg) {
      const ok = await page.evaluate((msg) => {
        const i = document.getElementById('chat-in'); const f = document.getElementById('chatform');
        if (!i || !f) return false;
        i.value = msg; i.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof f.requestSubmit === 'function') f.requestSubmit(); else f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return true;
      }, arg);
      console.log(ok ? '  sent: ' + arg : '  ! chat input not found');
    } else {
      const msgs = await page.evaluate(() => [...document.querySelectorAll('#chatlog > *')].slice(-15).map((m) => m.textContent.trim()).filter(Boolean));
      console.log(msgs.length ? '  ' + msgs.join('\n  ') : '  (no chat visible)');
    }
    return true;
  }
  if (cmd === 'eval') { const v = await page.evaluate((code) => { try { return JSON.stringify(eval(code)); } catch (e) { return 'ERR ' + e; } }, arg).catch((e) => String(e)); console.log('  @@eval ' + v); return true; }

  if (cmd === 'app') {
    // Share a store app into the meeting (the host needs --seed-desktop).
    const parts = (arg || '').split(/\s+/).filter(Boolean);
    const sub = parts[0] || 'state';
    if (sub === 'run') {
      const appId = parts[1] || 'bible';
      const r = await page.evaluate(async (id) => {
        const fs = await window.GifOS.store.allFiles();
        const a = fs.find((f) => f.isApp && f.appId === id);
        if (!a) return null;
        await window.__gifosVideo.runAppForTest(a.id, (a.name || 'App').replace(/\.gif$/i, ''));
        return a.id;
      }, appId).catch((e) => 'ERR ' + String(e).slice(0, 120));
      console.log('  app → ' + (r || 'NOT in store — this actor needs --seed-desktop'));
    } else if (sub === 'stop') {
      await page.evaluate(() => window.__gifosVideo.stopAppForTest()).catch(() => {});
      console.log('  app stopped');
    } else {
      const st = await page.evaluate(() => ({ app: !!window.__gifosVideo.appActive(), ifr: !!document.querySelector('#appmount iframe'), name: window.__gifosVideo.appName(), host: window.__gifosVideo.appIsHost() })).catch(() => null);
      console.log('  ' + JSON.stringify(st));
    }
    return true;
  }

  // ---- phone-reality levers (the behavior battery) ----
  if (lever.frozen && cmd !== 'thaw' && cmd !== 'jstate') { console.log('  ! page is FROZEN — only `thaw [gapSecs]` works'); return true; }
  if (cmd === 'hide' || cmd === 'show') {
    lever.hidden = cmd === 'hide';
    await applyVisibility(page, lever.hidden);
    console.log('  visibility → ' + (lever.hidden ? 'hidden (app-switched away)' : 'visible'));
    return true;
  }
  if (cmd === 'freeze') {
    // a LONG app-switch: Android freezes the tab — JS stops ENTIRELY, workers
    // included. CDP Page.setWebLifecycleState turned out to be a no-op for the
    // worker metronome (the "frozen" page kept beating every 12s — behavior
    // battery, 2026-07-26), so the honest lever is SIGSTOP on the page's
    // renderer process: main thread, workers, WebRTC encoders all stop, while
    // the browser's network process stays alive answering ICE consent — the
    // EXACT anatomy of the real Android-freeze incident. Hidden first (real
    // freezes happen to hidden tabs, and the app's visibilitychange sends its
    // honest "away" before the lights go out, as on a real phone).
    lever.hidden = true; await applyVisibility(page, true);
    await sleep(300); // let the "away" status flush before the renderer stops
    const pids = rendererPids();
    if (!pids.length) { console.log('  ! no renderer process found — cannot freeze'); return true; }
    for (const p of pids) { try { process.kill(p, 'SIGSTOP'); } catch (e) {} }
    lever.frozenPids = pids;
    lever.frozen = true;
    console.log('  FROZEN (renderer SIGSTOP: ' + pids.join(',') + ') — `thaw [gapSecs]` to return');
    return true;
  }
  if (cmd === 'thaw') {
    if (!lever.frozen) { console.log('  not frozen'); return true; }
    for (const p of lever.frozenPids || []) { try { process.kill(p, 'SIGCONT'); } catch (e) {} }
    lever.frozenPids = null;
    lever.frozen = false;
    await sleep(300); // the woken renderer needs a beat before evaluate
    const gap = parseFloat(rest[0]);
    if (gap > 0) await page.evaluate((ms) => { try { window.__gifosVideo.freezeGapForTest(ms); } catch (e) {} }, Math.round(gap * 1000));
    lever.hidden = false; await applyVisibility(page, false);
    console.log('  thawed' + (gap > 0 ? ' with a backdated ' + gap + 's beat gap' : '') + ' — visible again');
    return true;
  }
  if (cmd === 'radio') {
    lever.radioOff = (arg || '').trim() !== 'on';
    // the FULL phone reality: silence the channels AND flip the OS-level
    // signals — a real radio drop/return fires navigator.onLine + the
    // offline/online events, and the app's socket wake machinery rides them
    // (without 'online', a lab return pays the full hidden-tab backoff and
    // reads minutes-slow when a real phone reconnects in seconds)
    await page.evaluate((off) => {
      if (window.__bbRadio) window.__bbRadio.off = off;
      try { Object.defineProperty(navigator, 'onLine', { get: () => !off, configurable: true }); } catch (e) {}
      window.dispatchEvent(new Event(off ? 'offline' : 'online'));
    }, lever.radioOff);
    console.log('  radio → ' + (lever.radioOff ? 'OFF (coverage dropout: WS+DC+onLine dark, no close events)' : 'on (online event fired)'));
    return true;
  }
  if (cmd === 'battery') {
    lever.batt = parseBattery(rest.join(','), cfg.profile);
    await page.evaluate((b) => { if (window.__bbBatt) window.__bbBatt.set(b.level, b.charging); }, lever.batt);
    if (lever.batt.drain) { await sleep(400); await page.evaluate((b) => { if (window.__bbBatt) window.__bbBatt.set(Math.max(0, b.level - 0.01), true); }, lever.batt); }
    console.log('  battery → ' + Math.round(lever.batt.level * 100) + '% ' + (lever.batt.drain ? 'DRAINING while plugged' : lever.batt.charging ? 'charging' : 'on battery'));
    return true;
  }
  if (cmd === 'beatgap') { const s = parseFloat(rest[0]) || 0; await page.evaluate((ms) => { try { window.__gifosVideo.freezeGapForTest(ms); } catch (e) {} }, Math.round(s * 1000)); console.log('  beat clock backdated ' + s + 's'); return true; }
  if (cmd === 'idlemin') { const m = parseFloat(rest[0]) || 0; await page.evaluate((ms) => { try { window.__gifosVideo.idleForTest(ms); } catch (e) {} }, Math.round(m * 60000)); console.log('  lastActive backdated ' + m + 'min'); return true; }
  if (cmd === 'poke') { await page.evaluate(() => { try { window.__gifosVideo.pokeForTest(); } catch (e) {} }); console.log('  poked (touch/speech)'); return true; }
  if (cmd === 'pulses') { const on = (arg || '').trim() === 'on'; await page.evaluate((halt) => { try { window.__gifosVideo.haltPulseForTest(halt); } catch (e) {} }, !on); console.log('  pulses → ' + (on ? 'on' : 'HALTED (throttled phone)')); return true; }
  if (cmd === 'reload') {
    await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => console.log('  ! reload: ' + String(e).slice(0, 120)));
    await page.waitForFunction(() => !!(window.__gifosVideo && window.__gifosVideo.debugDump), null, { timeout: 30000 }).catch(() => {});
    console.log('  reloaded — rejoining');
    return true;
  }
  if (cmd === 'leave') { // clean exit: pagehide → LEAVE
    try { await ctx.close(); } catch (e) {}
    ctx = null; page = null; joined = false;
    console.log('  left (clean pagehide LEAVE)');
    return true;
  }
  if (cmd === 'die') { // the battery hit 0% / the OS killed the app: SIGKILL, no goodbyes
    intentionalKill = true;
    const pids = browserTreePids();
    for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch (e) {} }
    if (!pids.length) { try { await browser.close(); } catch (e) {} } // last resort: graceful (shouldn't happen on Linux)
    browser = null; ctx = null; page = null; joined = false; cdp = null;
    console.log('  DIED (browser tree SIGKILLed: ' + (pids.length || 'via close') + ' — abrupt vanish)');
    return true;
  }
  if (cmd === 'waitseat') {
    const t0 = Date.now(), lim = (parseFloat(rest[0]) || 60) * 1000;
    let c = null;
    while (Date.now() - t0 < lim) {
      c = await page.evaluate(() => { try { return window.__gifosVideo.meshCoord(); } catch (e) { return null; } }).catch(() => null);
      if (c) break;
      await sleep(1000);
    }
    console.log(c ? '  seated at ' + c.pc + '/' + c.r + '.' + c.i : '  ! not seated within ' + (lim / 1000) + 's');
    return true;
  }
  if (cmd === 'jstate') {
    const s = (page && joined && !lever.frozen) ? await D() : { err: lever.frozen ? 'frozen' : 'no page' };
    const extra = (page && !lever.frozen) ? await page.evaluate(() => {
      const V = window.__gifosVideo; const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
      return V ? { pow: g(() => V.powTier(), null), battTier: g(() => V.battTier(), null), visParked: g(() => V.visParked(), []), pid: g(() => V.myPid(), null), stagers: g(() => V.stageIds(), []), app: g(() => !!V.appActive(), false), appIfr: !!document.querySelector('#appmount iframe') } : {};
    }).catch(() => ({})) : {};
    const out = Object.assign({ role: cfg.name, av: cfg.av || undefined, lever: { hidden: lever.hidden, frozen: lever.frozen, radioOff: lever.radioOff, batt: lever.batt } }, extra, {
      coord: s.coord, state: s.state, occ: s.occ, links: s.links, inMeeting: s.inMeeting, participants: s.participants,
      rosterN: s.rosterN, connY: s.connY, liveVid: s.liveVid, relayedN: s.relayedN, ghosts: s.ghosts, dups: s.dups, consent: s.consent,
      roster: (s.roster || []).map((r) => ({ peer: r.peer, name: r.name, coord: r.coord, conn: !!r.conn, vid: !!r.vid, camOff: r.camOff, stAge: r.stAge })),
      err: s.err });
    console.log('@@state ' + JSON.stringify(out));
    return true;
  }
  if (cmd === 'probe') { // whole-mesh census, machine form: @@probe <json>
    const reps = await page.evaluate((ms) => (window.__gifosVideo.probeTree ? window.__gifosVideo.probeTree(ms) : null), parseFloat(rest[0]) * 1000 || 4500).catch(() => null);
    console.log('@@probe ' + JSON.stringify(reps));
    return true;
  }

  if (cmd === 'mon') {
    const secs = parseFloat(rest[0]) || 120, ivMs = parseFloat(rest[1]) || 1000;
    await runMon(secs, ivMs);
    return true;
  }

  const d = await D();
  if (d.err) { console.log('  ! ' + d.err); return true; }
  switch (cmd) {
    case 'state': case 's':
      console.log(`  me ${d.me.name} @ ${d.coord || '(unseated, state ' + d.state + ')'}  links=${d.links} occ=${d.occ}`);
      console.log(`  inMeeting=${d.inMeeting} participants=${d.participants}  video=${d.liveVid}/${d.rosterN}  consent=${d.consent}  ghosts=${d.ghosts} dups=${d.dups}`);
      console.log(`  grid(Channel R)=${d.gridShown}/${d.gridTotal} shown  composites: section=${d.composites.section} stadium=${d.composites.stadium} stage=${d.composites.stage}`);
      console.log(`  net: relay-sig=${d.tx.relaySig || 0}  dc-sig=${d.tx.dcSig || 0}  sponsor-fwd=${d.tx.fwdSig || 0}  relay-status=${d.tx.relayStatus || 0} dc-status=${d.tx.dcStatus || 0}`);
      break;
    case 'roster': case 'r':
      console.log('  ' + pad('name', 16) + pad('coord', 9) + pad('ip', 15) + pad('cam', 5) + pad('blur', 5) + pad('age', 5) + pad('conn', 5) + pad('vid', 5) + 'via');
      for (const r of d.roster) console.log('  ' + pad(r.name || '—', 16) + pad(r.coord || '—', 9) + pad(r.ip || '—', 15) + pad(r.camOff == null ? '?' : (r.camOff ? 'off' : 'ON'), 5) + pad(r.blur == null ? '?' : r.blur, 5) + pad(r.stAge == null ? '?' : r.stAge + 's', 5) + pad(r.conn ? 'y' : '-', 5) + pad(r.vid ? 'LIVE' : '-', 5) + (r.relay || '-'));
      console.log('  (' + d.roster.length + ' peers)');
      break;
    case 'who': {
      const bySec = {}; for (const r of d.roster) { const sec = r.coord ? String(r.coord).split('_')[0] : '?'; (bySec[sec] = bySec[sec] || []).push((r.name || r.peer).split(' ')[0] + '@' + (r.coord || '?')); }
      for (const sec of Object.keys(bySec).sort()) console.log('  §' + sec + ': ' + bySec[sec].join(', '));
      break;
    }
    case 'rows': {
      // The REAL C×C grid of a section, built from the whole-mesh CENSUS (not my
      // occ — an isolated vantage would show almost nothing and disagree with
      // `tree`). `rows` = my section, `rows <pc>` = any section. · = empty seat.
      const C = 5;
      const reps = await page.evaluate((ms) => (window.__gifosVideo.probeTree ? window.__gifosVideo.probeTree(ms) : null), 4500).catch(() => null);
      const src = reps || d.roster.map((x) => ({ coord: x.coord ? String(x.coord).replace('_', '/').replace('_', '.') : null, name: x.name || x.peer }));
      const myPc = d.me.coord ? String(d.me.coord).split('/')[0] : '0';
      const pc = (rest[0] != null && rest[0] !== '') ? rest[0] : myPc;
      const at = {};
      for (const x of src) if (x.coord) { const p = String(x.coord).split('/'); const ri = (p[1] || '').split('.'); at[p[0] + '_' + ri[0] + '_' + ri[1]] = (x.name || x.from || '?').split(' ')[0]; }
      console.log('  section ' + pc + (reps ? ' — whole-mesh census' : ' — from my occ (census hook absent; redeploy)') + ':');
      console.log('       ' + [0, 1, 2, 3, 4].map((i) => pad('i=' + i, 12)).join(''));
      for (let r = 0; r < C; r++) { let line = '  r=' + r + '  '; for (let i = 0; i < C; i++) line += pad(at[pc + '_' + r + '_' + i] || '·', 12); console.log(line); }
      const filled = Object.keys(at).filter((k) => k.startsWith(pc + '_')).length;
      console.log('  ' + filled + '/' + (C * C) + ' seats filled in section ' + pc + '   (`rows <pc>` for another section)');
      break;
    }
    case 'links': case 'l': {
      const mos = d.mosaic || {};
      console.log('  my ' + d.links + ' bounded links (row-mates + cross + up/down):');
      console.log('  up:   ' + JSON.stringify(mos.up) + '\n  down: ' + JSON.stringify(mos.down));
      const linked = d.roster.filter((r) => r.conn); console.log('  connected: ' + (linked.length ? linked.map((r) => (r.name || r.peer).split(' ')[0] + '@' + (r.coord || '?')).join(', ') : '(none)'));
      break;
    }
    case 'net':
      console.log('  WHERE SIGNALING/STATUS TRAVELS (cumulative since join):');
      console.log('    offers/answers/ice — relay(bootstrap): ' + (d.tx.relaySig || 0) + '   own-DC: ' + (d.tx.dcSig || 0) + '   sponsor-forward: ' + (d.tx.fwdSig || 0));
      console.log('    status heartbeat  — relay: ' + (d.tx.relayStatus || 0) + '   DC: ' + (d.tx.dcStatus || 0));
      console.log('  R2: the relay is greeters-only — relay counts should stay LOW and flat once seated (only entry bootstrap).');
      break;
    case 'mosaic': case 'm': console.log('  ' + JSON.stringify(d.mosaic)); break;
    case 'feeds': {
      const ff = await page.evaluate(() => (window.__gifosVideo.feedsInfo ? window.__gifosVideo.feedsInfo() : null)).catch(() => null);
      if (!ff) { console.log('  feedsInfo hook absent — redeploy'); break; }
      console.log('  ' + pad('key', 12) + pad('via', 10) + pad('n/cols', 8) + pad('vw×vh', 10) + pad('rdy', 4) + pad('paused', 7) + pad('frames', 8) + pad('vTrk', 5) + pad('muted', 6) + 'state');
      for (const f of ff) console.log('  ' + pad(f.key, 12) + pad(f.via, 10) + pad((f.meta && f.meta.n) ? f.meta.n + '/' + f.meta.cols : '—', 8) + pad(f.vw + '×' + f.vh, 10) + pad(f.ready, 4) + pad(f.paused, 7) + pad(f.frames, 8) + pad(f.vTracks, 5) + pad(f.vMuted, 6) + f.vState);
      console.log('  (' + ff.length + ' claimed feeds; vw=0 or muted=true ⇒ no frames arriving from that sender)');
      break;
    }
    case 'stage': {
      // stage            → who's on stage, my rights, the strip's real state
      // stage up|down    → step my participant on/off the stage
      if (arg === 'up' || arg === 'down') {
        const ok = await page.evaluate((on) => (window.__gifosVideo.stageForTest ? window.__gifosVideo.stageForTest(on) : null), arg === 'up').catch(() => null);
        console.log('  ' + (ok == null ? 'stage hooks absent — redeploy' : ok ? 'now ' + (arg === 'up' ? 'ON stage' : 'off stage') : 'refused (full stage, or admin-gated room)'));
        break;
      }
      const si = await page.evaluate(() => (window.__gifosVideo.stageInfo ? window.__gifosVideo.stageInfo() : null)).catch(() => null);
      if (!si) { console.log('  stage hooks absent — redeploy'); break; }
      console.log('  stagers ' + si.stagers.length + '/' + si.cap + (si.stagers.length ? ': ' + si.stagers.map((s) => (s.name || s.id) + (s.me ? ' (me)' : '')).join(', ') : ' (empty)'));
      console.log('  me: ' + (si.myStg ? 'ON stage since ' + new Date(si.myStg).toLocaleTimeString() : 'off stage') + '  canStage=' + si.canStage);
      console.log('  feeds held: ' + (si.held.length ? si.held.join(', ') : 'none') + '   strip: ' + (si.strip ? JSON.stringify(si.strip) : 'not compositing') + '   painted=' + si.stripPainted);
      break;
    }
    case 'consent':
      console.log('  consent tally: ' + d.consent + '  (clear video needs unanimous camera-on + No blur, room-wide)');
      console.log('  blocking (cam off / blurred / no fresh status):');
      for (const r of d.roster) if (r.camOff !== false || (r.blur != null && r.blur !== 0) || r.stAge == null || r.stAge > 15) console.log('    ' + pad(r.name || r.peer, 16) + ' cam=' + (r.camOff == null ? '?' : r.camOff ? 'off' : 'ON') + ' blur=' + r.blur + ' age=' + (r.stAge == null ? '?' : r.stAge + 's'));
      break;
    case 'tiles':
      console.log('  #grid (Channel R = me + row-mates): ' + d.gridShown + ' shown / ' + d.gridTotal + ' total');
      console.log('  composites painting: section=' + d.composites.section + ' stadium=' + d.composites.stadium + ' stage=' + d.composites.stage);
      console.log('  live remote video: ' + d.liveVid + '/' + d.rosterN);
      break;
    // `door` — THE FORK VIEW (bug ledger §6). Who is socketed on my relay
    // session but holds no cell in my occupancy, how long they have been
    // there, and what the door itself said (greeterTrace: list length, how
    // many blobs opened under my room key, the relay's founded flag, and
    // whether the door ADMITTED my own registrations — adm:false on a seated
    // Section-1 seat means my half is invisible to every knocker).
    case 'door': case 'fork': {
      if (!cfg.forkDwell) { console.log('  the fork watch is OFF (--fork-dwell 0)'); break; }
      const v = d.fork || lastForkVerdict;
      if (!v || !v.ok) { console.log('  no fork data yet (' + ((v && v.err) || 'first sample pending') + ')'); break; }
      console.log('  ' + forkLine(v) + '   (dwell threshold ' + Math.round(forkWatch.dwellMs / 1000) + 's)');
      console.log('  relay session holds ' + v.reachN + ' socket(s); I am ' + (v.seated ? 'seated at ' + v.coord : 'NOT seated (state ' + v.state + ')')
        + ' with occ=' + v.occ + ' links=' + v.links);
      if (!v.orphans.length) console.log('  every socketed peer holds a cell in my occupancy — one tree');
      for (const o of v.orphans) console.log('    OUTSIDE MY TREE  ' + o.peer + '  for ' + Math.round(o.forMs / 1000) + 's' + (v.dwelled.indexOf(o.peer) !== -1 ? '   <-- past the dwell: this is a second tree, not an entry dance' : ''));
      console.log('  greeterTrace (last ' + ((lastForkProbe && lastForkProbe.trace) || []).length + '):');
      for (const t of ((lastForkProbe && lastForkProbe.trace) || [])) console.log('    ' + JSON.stringify(t));
      break;
    }
    case 'ghosts': console.log(d.ghostList.length ? '  GHOSTS (no fresh status): ' + d.ghostList.join(', ') : '  no ghosts'); break;
    case 'dups': console.log(d.dupList.length ? d.dupList.map((x) => '  DUP ' + x.coord + ': ' + x.a + ' & ' + x.b).join('\n') : '  no duplicate coords'); break;
    case 'dump': console.log(JSON.stringify(d.me)); console.log(JSON.stringify({ tx: d.tx, mosaic: d.mosaic, ghosts: d.ghostList, dups: d.dupList })); console.log(JSON.stringify(d.roster, null, 1)); break;
    case 'tree': case 'census': {
      // DEBUG-TREE: gossip a probe so EVERY seat self-reports, then rebuild the
      // whole mesh from the replies — not limited to my own occ.
      console.log('  probing the whole mesh (gossip census, ~5s)…');
      const reps = await page.evaluate((ms) => (window.__gifosVideo.probeTree ? window.__gifosVideo.probeTree(ms) : null), 5000).catch(() => null);
      if (!reps) { console.log('  probeTree hook absent (client too old — redeploy)'); break; }
      const byId = {}; for (const r of reps) { byId[r.from] = r; byId[String(r.from).slice(0, 8)] = r; } // conn/link fields are 8-char truncated
      const ck = (c) => { if (!c) return [9, 9, 9]; const [pc, ri] = c.split('/'); const [rr, ii] = ri.split('.'); return [+pc, +rr, +ii]; };
      reps.sort((a, b) => { const A = ck(a.coord), B = ck(b.coord); return A[0] - B[0] || A[1] - B[1] || A[2] - B[2]; });
      const seen = {}, dups = []; for (const r of reps) if (r.coord) { if (seen[r.coord]) dups.push(r.coord + ' (' + seen[r.coord] + ' & ' + r.from + ')'); else seen[r.coord] = r.from; }
      console.log('  === MESH CENSUS: ' + reps.length + ' seats replied ===');
      let sec = null;
      for (const r of reps) {
        const s = r.coord ? r.coord.split('/')[0] : '?';
        if (s !== sec) { sec = s; console.log('  ── section ' + sec + ' ──'); }
        const me8 = String(r.from).slice(0, 8); const half = r.conn.filter((x) => byId[x] && !byId[x].conn.includes(me8)); // compare 8-char to 8-char (conn lists are truncated)
        console.log('    ' + pad(r.coord || 'unseated', 9) + pad((r.name || r.from).split(' ')[0], 12) + 'occ=' + pad(r.occ, 3) + ' links=' + r.links.length + ' conn=' + r.conn.length + ' up=' + pad(r.up || '-', 9) + 'down=' + pad(r.down || '-', 9) + (r.vid ? '📹' : '  ') + (r.camOff ? ' camoff' : '') + (half.length ? '  ⚠half-link→' + half.join(',') : ''));
      }
      if (dups.length) console.log('  ⚠ DUP COORDS: ' + dups.join(' | '));
      const ref = new Set(); for (const r of reps) { r.links.forEach((x) => ref.add(x)); if (r.up) ref.add(r.up); if (r.down) ref.add(r.down); }
      const orphan = [...ref].filter((x) => !byId[x]);
      const unseated = reps.filter((r) => !r.coord).length;
      if (orphan.length) console.log('  ⚠ referenced but SILENT (unreachable/orphan): ' + orphan.length + ' — ' + orphan.slice(0, 14).join(','));
      console.log('  totals: ' + reps.length + ' replied · ' + unseated + ' unseated · ' + dups.length + ' dup-coords · ' + orphan.length + ' orphaned refs');
      break;
    }
    case 'seat': case 'goto': {
      // DEBUG-TREE: teleport my seat to ANY coord. A census runs first and its
      // coord→id map SEEDS my occ, so the landing HELLOs real neighbours even
      // across a fragment boundary.
      const mm = /^(\d+)[/_ ](\d+)[._ ](\d+)$/.exec((arg || '').trim());
      if (!mm) { console.log('  usage: seat <pc/r.i>   e.g.  seat 0/2.3   (teleport to any coord; DEBUG)'); break; }
      const reps = await page.evaluate((ms) => (window.__gifosVideo.probeTree ? window.__gifosVideo.probeTree(ms) : null), 4000).catch(() => null);
      const seed = {}; if (reps) for (const r of reps) if (r.coord && r.from) seed[r.coord] = r.from;
      const res = await page.evaluate((a) => (window.__gifosVideo.forceSeat ? window.__gifosVideo.forceSeat(a[0], a[1], a[2], a[3]) : { err: 'forceSeat hook absent — redeploy' }), [mm[1], mm[2], mm[3], seed]).catch((e) => ({ err: String(e).slice(0, 100) }));
      console.log('  ' + JSON.stringify(res) + (res && res.seated ? '   — give it ~6s to wire, then `state` / `shot`' : ''));
      break;
    }
    case 'tour': {
      // DEBUG-TREE: teleport into an EMPTY seat of every occupied section and
      // whole-window-shot each vantage, so we see the composite from all over.
      const reps = await page.evaluate((ms) => (window.__gifosVideo.probeTree ? window.__gifosVideo.probeTree(ms) : null), 4500).catch(() => null);
      if (!reps) { console.log('  census hook absent — redeploy'); break; }
      const secs = [...new Set(reps.map((r) => r.coord && String(r.coord).split('/')[0]).filter((x) => x != null))].sort();
      const dir = (arg || '/tmp/tour').replace(/\/$/, ''); const settle = 12;
      console.log('  touring sections ' + secs.join(',') + ' — empty seat each, ' + settle + 's settle, whole-window shot');
      for (const pc of secs) {
        const filled = new Set(reps.filter((r) => r.coord && String(r.coord).split('/')[0] === pc).map((r) => String(r.coord).split('/')[1]));
        let tgt = null; for (let r = 0; r < 5 && !tgt; r++) for (let i = 0; i < 5; i++) if (!filled.has(r + '.' + i)) { tgt = r + '.' + i; break; }
        if (!tgt) tgt = '0.0';
        const [r, i] = tgt.split('.');
        const seed = {}; for (const x of reps) if (x.coord && x.from) seed[x.coord] = x.from;
        await page.evaluate((a) => window.__gifosVideo.forceSeat(a[0], a[1], a[2], a[3]), [pc, r, i, seed]).catch(() => {});
        console.log('  → section ' + pc + ' @ ' + pc + '/' + tgt + ' … settling ' + settle + 's');
        await sleep(settle * 1000);
        const vp = page.viewportSize();
        const h = await page.evaluate(() => { const f = document.getElementById('feed'); return Math.max(document.documentElement.scrollHeight, f ? f.scrollHeight + 220 : 0, 1000); }).catch(() => 2200);
        const H = Math.min(Math.round(h), 12000);
        try { await page.setViewportSize({ width: (vp && vp.width) || 1200, height: H }); await sleep(450); } catch (e) {}
        const path = dir + '-sec' + pc + '.png'; await page.screenshot({ path, fullPage: true });
        if (vp) { try { await page.setViewportSize(vp); } catch (e) {} }
        console.log('    shot → ' + path);
      }
      console.log('  tour done.');
      break;
    }
    case 'watch': {
      const [secsRaw, lvl] = rest; const secs = parseFloat(secsRaw) || 3; const level = lvl && LEVELS[lvl] != null ? lvl : 'info';
      console.log('  watching every ' + secs + 's at level ' + level + ' — press enter to stop');
      let stop = false; process.stdin.once('data', () => { stop = true; });
      const t0 = Date.now();
      while (!stop) { const snap = await D(); console.log(streamLine(Math.round((Date.now() - t0) / 1000), snap, level)); await sleep(secs * 1000); }
      break;
    }
    default: console.log('  unknown command "' + cmd + '" — type help');
  }
  return true;
}

function printHelp() {
  const block = fs.readFileSync(__filename, 'utf8').match(/\* COMMANDS[\s\S]*?quit \| exit/);
  console.log(block ? block[0].replace(/^ \* ?/gm, '  ') : 'see the header of test/swarm/meet.js');
}

// ---- machine record (--jsonl / MEET_JSONL) ---------------------------------
// One JSON snapshot line every --every seconds, in ANY mode — the monitor's
// durable record, deliberately independent of whatever the interactive pane is
// showing (a paused `watch` must never pause the forensics). '%d' in the path
// becomes YYYY-MM-DD, so a long-running service rotates daily by construction.
function startJsonl() {
  if (!cfg.jsonl) return;
  try { fs.mkdirSync(path.dirname(cfg.jsonl), { recursive: true }); } catch (e) {} // an orchestrator path may not exist on THIS box
  const pathFor = () => cfg.jsonl.replace('%d', new Date().toISOString().slice(0, 10));
  let curPath = pathFor();
  compactOldJsonl(curPath); // catch days a restart closed without a live rotation
  setInterval(async () => {
    const p = pathFor();
    if (p !== curPath) { const done = curPath; curPath = p; compactJsonl(done); } // date flipped — compact the closed day
    if (!page || !joined || lever.frozen) return; // an evaluate against a FROZEN page hangs
    const s = await D().catch(() => null);
    if (!s || s.err) return;
    // rows/mosaic/me ride along; drop nothing — disk is cheaper than a gap in
    // the record when tonight's bug needed exactly the field we trimmed.
    const line = JSON.stringify(Object.assign({ _t: new Date().toISOString() }, s)) + '\n';
    fs.appendFile(p, line, () => {});
  }, cfg.every * 1000).unref();
}
// When a day's file closes, squeeze out the boredom. An idle 1-2 person room
// writes ~17k near-identical lines/day; the record only needs the EVENTS.
// Kept: any line where the shape changed vs the previous line (joins, leaves,
// link flaps, seat moves, quality of the roster), anything with 3+ people,
// dups or friend-relaying, plus one heartbeat line per 10 min so a quiet day
// still proves the monitor was alive. Rewrites in place with a header line
// (_compacted) so a re-run skips it. ~22MB idle day → well under 1MB.
function compactJsonl(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw || raw.slice(0, 20).indexOf('_compacted') !== -1) return;
    const out = [];
    let prevSig = null, lastBeat = 0, kept = 0, total = 0;
    for (const ln of raw.split('\n')) {
      if (!ln) continue;
      total++;
      let s; try { s = JSON.parse(ln); } catch (e) { out.push(ln); kept++; continue; } // never drop what we can't read
      const t = Date.parse(s._t || '') || 0;
      // The fork verdict rides in the SIGNATURE and forces a keep. Compaction
      // exists to delete boredom, and a forked room is the most boring-LOOKING
      // state there is (occ=1 links=0, unchanged for hours) — exactly the
      // lines a shape-only signature would have thrown away.
      const fk = s.fork && s.fork.ok ? (s.fork.fork ? s.fork.kind + ':' + (s.fork.dwelled || []).join('+') : '') : '';
      const sig = [s.participants, s.inMeeting, s.occ, s.coord, s.state, s.links, s.connY, s.liveVid, s.relayedN, s.ghosts, s.dups, fk,
        (s.roster || []).map((r) => r.peer + (r.conn ? '+' : '-') + (r.relay || '')).sort().join(',')].join('|');
      const interesting = (s.participants >= 3) || (s.inMeeting >= 3) || s.dups > 0 || s.relayedN > 0 || !!fk || sig !== prevSig;
      const heartbeat = t - lastBeat >= 600000;
      prevSig = sig;
      if (!interesting && !heartbeat) continue;
      if (heartbeat) lastBeat = t;
      out.push(ln); kept++;
    }
    fs.writeFileSync(file, JSON.stringify({ _compacted: new Date().toISOString(), kept, total }) + '\n' + out.join('\n') + (out.length ? '\n' : ''));
    console.error('[jsonl] compacted ' + file + ': ' + total + ' → ' + kept + ' lines');
  } catch (e) { /* a failed compaction leaves the full file — never lose data to tidiness */ }
}
// Any prior days' files the pattern matches (a restart can close a day with no
// live rotation tick) — compact everything that isn't today's file.
function compactOldJsonl(todayPath) {
  if (cfg.jsonl.indexOf('%d') === -1) return;
  try {
    const dir = path.dirname(todayPath);
    const rx = new RegExp('^' + path.basename(cfg.jsonl).split('%d').map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(\\d{4}-\\d{2}-\\d{2})') + '$');
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (rx.test(f) && full !== todayPath) compactJsonl(full);
    }
  } catch (e) { /* no dir yet — first run */ }
}

// ---- room-lock keeper (--ensure-pass / MEET_ENSURE_PASS) --------------------
// The state machine that makes a resident bot the room's lock-keeper:
//   at a LOCKED door (pw-modal in 'join' mode)  → enter the password, join
//   SEATED and the room is OPEN (no stored pw)  → set the password (page UI,
//                                                 so present members re-key live)
//   SEATED and the stored pw is ours            → nothing to do
//   SEATED and someone changed it to something  → log it, never fight over it
// All through the page's own modal — the exact flow a human takes, so every
// re-key/kick side effect the UI wires up happens too.
function startEnsurePass() {
  if (!cfg.ensurePass) return;
  let busy = false, lastEnter = 0, satisfied = false, conflictLogged = false;
  setInterval(async () => {
    if (!page || !joined || busy) return;
    busy = true;
    try {
      const st = await page.evaluate((rk) => {
        const m = document.getElementById('pw-modal');
        const vis = m && m.style.display !== 'none';
        let coord = null; try { coord = window.__gifosVideo.meshCoord(); } catch (e) {}
        let stored = ''; try { stored = localStorage.getItem('gifos_vpw_' + rk) || ''; } catch (e) {}
        return { mode: vis ? (m.dataset.mode || '') : '', seated: !!coord, stored };
      }, lastRoomKey);
      const fillAndSave = (v) => page.evaluate((pw) => {
        const i = document.getElementById('pw-new');
        i.value = pw; i.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('pw-save').click();
      }, v);
      if (st.mode === 'join') {
        if (Date.now() - lastEnter > 8000) { // a wrong-pw bounce reopens the modal — retry politely, log each
          lastEnter = Date.now();
          await fillAndSave(cfg.ensurePass);
          console.error('[ensure-pass] locked door — presented the password');
        }
      } else if (st.seated && !st.stored) {
        await page.evaluate(() => document.getElementById('pwbtn').click());
        await sleep(500);
        await fillAndSave(cfg.ensurePass);
        console.error('[ensure-pass] room was OPEN — set the password');
        satisfied = false; // verify on the next tick via stored
      } else if (st.seated && st.stored === cfg.ensurePass) {
        if (!satisfied) { satisfied = true; console.error('[ensure-pass] room is locked with our password'); }
      } else if (st.seated && st.stored && st.stored !== cfg.ensurePass && !conflictLogged) {
        conflictLogged = true;
        console.error('[ensure-pass] room password was changed by someone else — leaving it alone');
      }
    } catch (e) { /* page busy/navigating */ }
    busy = false;
  }, 3000).unref();
}

// ---- main -----------------------------------------------------------------
(async () => {
  process.on('SIGINT', async () => { intentionalKill = true; try { if (browser) await browser.close(); } catch (e) {} process.exit(0); });
  startJsonl();
  startEnsurePass();

  if (MODE === 'drive') {
    // Machine mode for the behavior battery (lib/cast.js): command lines in on
    // stdin, exactly one '@@done' / '@@err <msg>' sentinel out per command;
    // 'jstate'/'probe' additionally emit '@@state'/'@@probe' payload lines.
    // No prompt, no auto-join — the cast script drives everything, including
    // `join <room>`. stdin EOF = the cast is gone: shut down.
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    const q = []; let busy = false;
    const pump = async () => {
      if (busy) return; busy = true;
      while (q.length) {
        const line = q.shift();
        try {
          const cont = await runCmd(line);
          console.log('@@done');
          if (!cont) { try { if (browser) await browser.close(); } catch (e) {} process.exit(0); }
        } catch (e) { console.log('@@err ' + String(e && e.message || e).slice(0, 300)); }
      }
      busy = false;
    };
    rl.on('line', (l) => { if (l.trim() && !l.trim().startsWith('#')) { q.push(l.trim()); pump(); } });
    rl.on('close', async () => { try { if (browser) await browser.close(); } catch (e) {} process.exit(0); });
    console.log('@@ready');
    return;
  }

  if (MODE === 'watch' || MODE === 'once' || MODE === 'script') {
    if (!cfg.room) { console.error('need --room (and usually --pass/--relay) for --watch/--once/--script'); process.exit(1); }
    await join(cfg.room);
    // wait for a seat (up to 60s) so the first output is meaningful
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) { const c = await page.evaluate(() => { try { return window.__gifosVideo.meshCoord(); } catch (e) { return null; } }).catch(() => null); if (c) { console.error('[meet] seated at ' + c.pc + '/' + c.r + '.' + c.i); break; } await sleep(1500); }
    if (cfg.settle) { console.error('[meet] settling ' + cfg.settle + 's (letting composites fill)…'); await sleep(cfg.settle * 1000); }
    if (MODE === 'once') { await runCmd(String(args.once)); try { await browser.close(); } catch (e) {} process.exit(0); }
    if (MODE === 'script') {
      // ';'-separated commands, run in order; `sleep <secs>` is a builtin.
      for (const step of String(args.script).split(';').map((x) => x.trim()).filter(Boolean)) {
        const sm = /^sleep\s+([\d.]+)$/.exec(step);
        if (sm) { console.error('[meet] sleep ' + sm[1] + 's'); await sleep(parseFloat(sm[1]) * 1000); continue; }
        console.error('[meet] > ' + step);
        try { await runCmd(step); } catch (e) { console.log('  ! ' + String(e).slice(0, 160)); }
      }
      try { await browser.close(); } catch (e) {} process.exit(0);
    }
    // watch
    const start = Date.now();
    while ((Date.now() - start) / 1000 < cfg.forSecs) {
      const snap = await D();
      if (cfg.json) console.log(JSON.stringify(Object.assign({ t: Math.round((Date.now() - start) / 1000) }, snap)));
      else console.log(streamLine(Math.round((Date.now() - start) / 1000), snap, cfg.level));
      await sleep(cfg.every * 1000);
    }
    try { await browser.close(); } catch (e) {} process.exit(0);
  }

  // REPL
  console.log('GifOS meeting CLI — the command line for being in a meeting.');
  if (cfg.room) { await join(cfg.room); console.log('joining "' + cfg.room + '"… try `state` in a few seconds, or `help`.'); }
  else { console.log("not connected. Run `join <room> [--pass x] [--relay ws(s)://…] [--video]`, or `help`."); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'meet> ' });
  rl.prompt();
  rl.on('line', async (line) => { let cont = true; try { cont = await runCmd(line); } catch (e) { console.log('  ! ' + String(e).slice(0, 200)); } if (!cont) { rl.close(); return; } rl.prompt(); });
  rl.on('close', async () => { try { if (browser) await browser.close(); } catch (e) {} process.exit(0); });
})().catch((e) => { console.error('FATAL ' + (e && e.message || e)); process.exit(1); });
