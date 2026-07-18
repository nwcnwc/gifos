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
 *
 * PARTICIPATE (hold a real seat, help other tiles go clear):
 *   --video [n]   play a talking-head clip (test/swarm-videos/ pack) as my
 *                 camera — same mechanism as swarm.js. n picks a person.
 *   --cam         camera on with a solid name swatch (no pack needed).
 *   (default)     camera OFF — a quiet observer that still holds a seat.
 *
 * CONNECT:
 *   --room <name>     room to join                 (REPL `join <name>` also works)
 *   --pass <pw>       room password (locked rooms)
 *   --relay <ws(s)>   relay URL                     (default: the site's relay)
 *   --base <url>      site origin                   (default: https://gifos.app)
 *   --av <hex>        admin verifier (/meet/<room>/<av> admin rooms)
 *   --name <label>    my display name               (default: meet-cli)
 *   --videos <dir>    override the clip pack dir
 *   --chrome <path>   chromium binary               (env MEET_CHROME also works)
 *   --headful         show the browser window
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
 *   chat [msg]    print recent chat, or send a message
 *   cam on|off    turn my camera on/off        mic on|off
 *   name <n>      rename myself
 *   shot [path]   save a screenshot (PNG) of my meeting view
 *   dump          the whole debugDump as JSON
 *   eval <js>     evaluate arbitrary JS in the page
 *   watch [secs] [level]   live-stream `state` until you press enter
 *   join <room> [--pass x] [--relay y] [--video]   (re)connect
 *   help | ?      this list            quit | exit
 *
 * EXAMPLES
 *   node test/meet.js                                   # REPL, then: join stadium --pass swarm
 *   node test/meet.js --room stadium --pass swarm --relay wss://HOST.nip.io
 *   node test/meet.js --room stadium --pass swarm --relay wss://HOST --video --watch -v
 *   node test/meet.js --room stadium --pass swarm --relay wss://HOST --once net
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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
};
const MODE = args.script !== undefined ? 'script' : args.once !== undefined ? 'once' : (args.watch ? 'watch' : 'repl');
const LEVELS = { quiet: 0, info: 1, verbose: 2, debug: 3 };

// ---- playwright + chromium resolution -------------------------------------
let chromium;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { ({ chromium } = require(m)); if (chromium) break; } catch (e) {}
}
if (!chromium) { console.error('playwright not found — npm i playwright && npx playwright install chromium'); process.exit(1); }
const CHROME = cfg.chrome
  || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => (String(s == null ? '' : s) + ' '.repeat(n)).slice(0, n);

// ---- the fake camera (talking-head clip pack, exactly like swarm.js) -------
// Loads test/swarm-videos/{clips,portraits,roster.json} if present; picks one
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
      await new Promise(r=>{vid.readyState>=1?r():(vid.onloadedmetadata=r);});
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
    ghosts: (d.ghosts || []).length, dups: (d.dups || []).length,
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
  let line = `t+${pad(t, 4)} seat=${pad(seat, 8)} inMtg=${s.inMeeting} occ=${s.occ} links=${s.links} vid=${s.liveVid}/${s.rosterN}`;
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
let browser = null, ctx = null, page = null, joined = false;
async function ensureBrowser() {
  if (browser) return;
  browser = await chromium.launch({ headless: !cfg.headful, executablePath: CHROME, args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests',
  ] });
}
async function join(room, opts) {
  opts = opts || {};
  if (opts.pass !== undefined) cfg.pass = opts.pass;
  if (opts.relay !== undefined) cfg.relay = opts.relay;
  if (opts.video) { cfg.videoIdx = -1; }
  cfg.room = room;
  await ensureBrowser();
  if (ctx) { try { await ctx.close(); } catch (e) {} }
  ctx = await browser.newContext({ viewport: { width: 900, height: 820 }, permissions: ['camera', 'microphone'] });
  const roomKey = room + (cfg.av ? '.' + cfg.av : '');
  const seed = "localStorage.setItem('gifos_name'," + JSON.stringify(cfg.name) + ");localStorage.setItem('gifos_meet_bar','1');"
    + (cfg.relay ? "localStorage.setItem('gifos_relay'," + JSON.stringify(cfg.relay) + ");" : '')
    + (cfg.pass ? "localStorage.setItem(" + JSON.stringify('gifos_vpw_' + roomKey) + "," + JSON.stringify(cfg.pass) + ");" : '');
  await ctx.addInitScript({ content: seed });
  await ctx.addInitScript({ content: camInitScript() });
  page = await ctx.newPage();
  page.on('pageerror', (e) => { if (LEVELS[cfg.level] >= 3) console.error('  [pageerror] ' + String(e).slice(0, 200)); });
  page.on('crash', () => console.error('  [CRASH] the renderer process died — a first-class flakiness cause (rtp_sender CHECK class); everything this page carried is gone'));
  page.on('console', (m) => { if (LEVELS[cfg.level] >= 3 && m.type() === 'error' && !/404|blocked by client/i.test(m.text())) console.error('  [cerr] ' + m.text().slice(0, 160)); });
  const url = cfg.base + '/meet.html#v=' + room + (cfg.av ? '&av=' + cfg.av : '') + (cfg.relay ? '&relay=' + encodeURIComponent(cfg.relay) : '') + '&DEBUG=on'; // the CLI IS the debug surface
  console.error('[meet] joining ' + url + ' as "' + cfg.name + '"' + (cfg.pass ? ' (locked)' : '') + (cfg.videoIdx !== null ? ' +video' : cfg.solidCam ? ' +cam' : ' (observer)'));
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => console.error('[goto] ' + e.message));
  await page.waitForFunction(() => !!(window.__gifosVideo && window.__gifosVideo.debugDump), null, { timeout: 30000 }).catch(() => {});
  joined = true;
}
const D = () => page.evaluate(snapshotInPage).catch((e) => ({ err: String(e).slice(0, 140) }));

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
      if (w === '--pass') o.pass = rest[++i]; else if (w === '--relay') o.relay = rest[++i]; else if (w === '--video') o.video = true; else if (!w.startsWith('--')) room = w; }
    if (!room) { console.log('  usage: join <room> [--pass x] [--relay ws(s)://…] [--video]'); return true; }
    await join(room, o); console.log('  joined "' + room + '" — give it a few seconds, then `state`'); return true;
  }
  if (!joined) { console.log('  not in a meeting yet — `join <room> [--pass x] [--relay y]` first (or `help`)'); return true; }

  if (cmd === 'cam' || cmd === 'mic') {
    const want = (arg || '').toLowerCase();
    await page.evaluate(([id, w]) => { const b = document.getElementById(id); if (!b) return; const off = b.classList.contains('off');
      if (w === 'on' && off) b.click(); else if (w === 'off' && !off) b.click(); else if (w !== 'on' && w !== 'off') b.click(); }, [cmd, want]);
    console.log('  ' + cmd + ' toggled'); return true;
  }
  if (cmd === 'name') { if (arg) await page.evaluate((n) => { try { localStorage.setItem('gifos_name', n); } catch (e) {} const el = document.getElementById('myname'); if (el) el.textContent = n; }, arg); console.log('  name → ' + arg); return true; }
  if (cmd === 'shot') {
    const p = arg || ('/tmp/claude-1000/-home-nathan-projects-gifos/1270a1af-99d6-4f5c-b245-2a1eb40656dd/scratchpad/meet-shot.png');
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
    if (arg) { await page.evaluate((msg) => { const i = document.getElementById('chat-input') || document.querySelector('#chat input,[data-chat-input]'); if (i) { i.value = msg; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } }, arg); console.log('  sent: ' + arg); }
    else { const msgs = await page.evaluate(() => [...document.querySelectorAll('#chat-log .msg,.chat-msg,#chat .msg')].slice(-12).map((m) => m.textContent.trim())); console.log(msgs.length ? '  ' + msgs.join('\n  ') : '  (no chat visible)'); }
    return true;
  }
  if (cmd === 'eval') { const v = await page.evaluate((code) => { try { return JSON.stringify(eval(code)); } catch (e) { return 'ERR ' + e; } }, arg).catch((e) => String(e)); console.log('  ' + v); return true; }

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
      console.log('  ' + pad('name', 16) + pad('coord', 9) + pad('ip', 15) + pad('cam', 5) + pad('blur', 5) + pad('age', 5) + pad('conn', 5) + 'vid');
      for (const r of d.roster) console.log('  ' + pad(r.name || '—', 16) + pad(r.coord || '—', 9) + pad(r.ip || '—', 15) + pad(r.camOff == null ? '?' : (r.camOff ? 'off' : 'ON'), 5) + pad(r.blur == null ? '?' : r.blur, 5) + pad(r.stAge == null ? '?' : r.stAge + 's', 5) + pad(r.conn ? 'y' : '-', 5) + (r.vid ? 'LIVE' : '-'));
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
  console.log(block ? block[0].replace(/^ \* ?/gm, '  ') : 'see the header of test/meet.js');
}

// ---- main -----------------------------------------------------------------
(async () => {
  process.on('SIGINT', async () => { try { if (browser) await browser.close(); } catch (e) {} process.exit(0); });

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
