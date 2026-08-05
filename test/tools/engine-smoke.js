/*
 * engine-smoke.js — CAN THIS BROWSER ENGINE BE IN A MEETING AT ALL?
 *
 * A MEASUREMENT TOOL, not a gate. It stands up a 2-party room — one host, one
 * guest, each on whatever engine you name — and judges the join FROM BOTH
 * SIDES: seat assigned, links up, mutual roster sight, video liveness, DC
 * gossip, a chat message crossing the DC lane, and (with APP=1) an app share
 * mounting on the far side.
 *
 * It exists because "run the behavior battery on a mix of browsers" is not one
 * question but two, and the second one is only worth asking if the first
 * answers yes. Playwright's Firefox and WebKit builds are not the browsers
 * they are named after: they are Linux ports with their own gaps, and a
 * scenario wired to a broken engine reds for reasons that have nothing to do
 * with GifOS. So: measure the participant, THEN wire the scenario.
 *
 *   python3 -m http.server 8299 -d site
 *   node test/servers/relay-local.js
 *   node test/tools/engine-smoke.js webkit             # webkit guest, chromium host
 *   node test/tools/engine-smoke.js firefox chromium
 *   APP=1  node test/tools/engine-smoke.js firefox     # + the app-share lane (host seeds a desktop, ~2min)
 *   DIAG=1 node test/tools/engine-smoke.js webkit      # + why a blank tile is blank (see below)
 *
 * Env: BASE (default http://127.0.0.1:8299), RELAY (ws://127.0.0.1:8790).
 *
 * DIAG=1 adds the forensics that separate "no media arriving" from "media
 * arriving, element never starts" — every <video>'s readyState/dimensions/
 * tracks, GifOS.meshPipe.supported(), a play() probe, and per-peer
 * inbound/outbound RTP counters. The RTP counters need the peer connections,
 * which run.html keeps in a closure, so the actors are launched with
 * meet.js --init-script pointed at pcrec.js next door.
 *
 * Exit 0 = every assertion passed. A refuted engine with a named cause is a
 * SUCCESSFUL measurement — read the PASS/FAIL list, not just the exit code.
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

const MEET = path.join(__dirname, '..', 'swarm', 'meet.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8299';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const guestEngine = process.argv[2] || 'webkit';
const hostEngine = process.argv[3] || 'chromium';
const ROOM = 'mix-' + guestEngine + '-' + Math.random().toString(36).slice(2, 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One meet.js --drive child: line in, one @@done/@@err sentinel out.
class Actor {
  constructor(name, engine, extra) {
    this.name = name; this.engine = engine;
    const a = ['--drive', '--name', name, '--engine', engine, '--base', BASE, '--relay', RELAY, '--cam',
      '--init-script', path.join(__dirname, 'engine-smoke-pcrec.js')].concat(extra || []);
    this.child = spawn(process.execPath, [MEET].concat(a), { stdio: ['pipe', 'pipe', 'pipe'] });
    this.err = [];
    this.pending = null; this.payload = undefined; this.out = [];
    this.ready = new Promise((res) => { this.readyRes = res; });
    this.child.on('exit', (c) => { this.dead = c; if (this.pending) { const p = this.pending; this.pending = null; p({ err: 'actor exited ' + c }); } this.readyRes(); });
    readline.createInterface({ input: this.child.stdout }).on('line', (l) => {
      if (l === '@@ready') return this.readyRes();
      if (l.startsWith('@@state ')) { try { this.payload = JSON.parse(l.slice(8)); } catch (e) { this.payload = null; } return; }
      if (l === '@@done' || l.startsWith('@@err ')) {
        const p = this.pending; this.pending = null;
        if (p) p(l === '@@done' ? { payload: this.payload, out: this.out } : { err: l.slice(6), out: this.out });
        return;
      }
      this.out.push(l);
    });
    readline.createInterface({ input: this.child.stderr }).on('line', (l) => {
      this.err.push(l);
      // a renderer CRASH is the loudest per-engine fact there is — never bury it
      if (/pageerror|CRASH|FATAL|WARNING|cerr/i.test(l)) console.log('  [' + this.name + '!] ' + l.slice(0, 200));
    });
  }
  cmd(line, timeoutMs) {
    this.out = []; this.payload = undefined;
    return new Promise((res) => {
      const t = setTimeout(() => { if (this.pending) { this.pending = null; res({ err: 'TIMEOUT ' + line }); } }, timeoutMs || 120000);
      this.pending = (r) => { clearTimeout(t); res(r); };
      try { this.child.stdin.write(line + '\n'); } catch (e) { clearTimeout(t); res({ err: 'write failed' }); }
    });
  }
  kill() { try { this.child.stdin.end(); } catch (e) {} setTimeout(() => { try { this.child.kill('SIGKILL'); } catch (e) {} }, 4000).unref(); }
}

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  console.log('# room ' + ROOM + '  host=' + hostEngine + '  guest=' + guestEngine + '  base=' + BASE);
  const host = new Actor('Host-' + hostEngine, hostEngine, process.env.APP ? ['--seed-desktop'] : []);
  const guest = new Actor('Guest-' + guestEngine, guestEngine, []);
  await Promise.all([host.ready, guest.ready]);

  let r = await host.cmd('join ' + ROOM, 300000);
  console.log('# host join → ' + JSON.stringify(r.err || 'ok'));
  r = await host.cmd('waitseat 60', 90000);
  console.log('# host ' + (r.out || []).join(' | '));
  r = await guest.cmd('join ' + ROOM, 300000);
  console.log('# guest join → ' + JSON.stringify(r.err || 'ok'));
  r = await guest.cmd('waitseat 90', 120000);
  console.log('# guest ' + (r.out || []).join(' | '));

  let hs = null, gs = null; const t0 = Date.now(); let sawEach = false;
  while (Date.now() - t0 < 120000) {
    hs = (await host.cmd('jstate', 30000)).payload;
    gs = (await guest.cmd('jstate', 30000)).payload;
    const hSeesG = hs && (hs.roster || []).some((x) => x.name && x.name.includes(guestEngine) && x.conn);
    const gSeesH = gs && (gs.roster || []).some((x) => x.name && x.name.includes(hostEngine) && x.conn);
    const fmt = (s) => '{seat:' + (s && s.coord) + ' occ:' + (s && s.occ) + ' links:' + (s && s.links) + ' roster:' + (s && s.rosterN) + ' conn:' + (s && s.connY) + ' vid:' + (s && s.liveVid) + '}';
    console.log('  t+' + Math.round((Date.now() - t0) / 1000) + 's host' + fmt(hs) + ' guest' + fmt(gs));
    if (hSeesG && gSeesH) { sawEach = true; break; }
    await sleep(5000);
  }
  // Mutual sight lands BEFORE the first decoded frame and before the first DC
  // heartbeat. Asserting the instant the roster fills measures the clock, not
  // the engine — settle first.
  if (sawEach) {
    console.log('# mutual sight at t+' + Math.round((Date.now() - t0) / 1000) + 's — settling 25s before judging media/DC');
    await sleep(25000);
    hs = (await host.cmd('jstate', 30000)).payload;
    gs = (await guest.cmd('jstate', 30000)).payload;
    console.log('  host roster: ' + JSON.stringify(hs && hs.roster));
    console.log('  guest roster: ' + JSON.stringify(gs && gs.roster));
  }

  console.log('--- verdict (' + hostEngine + ' host / ' + guestEngine + ' guest) ---');
  ok(!!(gs && gs.coord), 'guest SEATED (coord=' + (gs && gs.coord) + ')');
  ok(!!(hs && hs.coord), 'host seated (coord=' + (hs && hs.coord) + ')');
  ok(!!(hs && hs.occ >= 2), 'host sees occ>=2 (occ=' + (hs && hs.occ) + ')');
  ok(!!(gs && gs.occ >= 2), 'guest sees occ>=2 (occ=' + (gs && gs.occ) + ')');
  ok(sawEach, 'MUTUAL sight: each roster lists the other with conn=true');
  ok(!!(hs && hs.links >= 1), 'host links>=1 (' + (hs && hs.links) + ')');
  ok(!!(gs && gs.links >= 1), 'guest links>=1 (' + (gs && gs.links) + ')');
  ok(!!(gs && gs.inMeeting), 'guest inMeeting');
  ok(!!(hs && hs.liveVid >= 1), 'host sees live video (' + (hs && hs.liveVid) + '/' + (hs && hs.rosterN) + ')');
  ok(!!(gs && gs.liveVid >= 1), 'guest sees live video (' + (gs && gs.liveVid) + '/' + (gs && gs.rosterN) + ')');
  ok(!(gs && gs.dups) && !(hs && hs.dups), 'no duplicate coords');

  const hn = (await host.cmd('net', 20000)).out.join(' ');
  const gn = (await guest.cmd('net', 20000)).out.join(' ');
  // `net` prints "status heartbeat — relay: N   DC: M" — M is DC gossip. (Do
  // NOT match the first "dc" in that block: "own-DC: 0" is a different lane
  // and reads 0 in a healthy 2-party room.)
  const dcOf = (s) => { const m = /heartbeat[\s\S]*?DC:\s*(\d+)/i.exec(s); return m ? +m[1] : -1; };
  ok(dcOf(gn) > 0, 'guest DC gossip flowing (dcSig=' + dcOf(gn) + ')');
  ok(dcOf(hn) > 0, 'host DC gossip flowing (dcSig=' + dcOf(hn) + ')');

  const marker = 'ping-' + Math.random().toString(36).slice(2, 8);
  await guest.cmd('chat ' + marker, 30000);
  let heard = false;
  for (let i = 0; i < 10 && !heard; i++) {
    await sleep(2000);
    if ((await host.cmd('chat', 20000)).out.join(' ').includes(marker)) heard = true;
  }
  ok(heard, 'chat message crossed the DC lane guest→host (' + marker + ')');

  if (process.env.DIAG) await diagnose(host, guest);

  if (process.env.APP) {
    const ar = await host.cmd('app run bible', 120000);
    console.log('# host app run → ' + (ar.out || []).join(' ') + (ar.err ? ' ERR ' + ar.err : ''));
    let mounted = null; const ta = Date.now();
    while (Date.now() - ta < 120000) {
      const g = (await guest.cmd('app', 30000)).out.join(' ');
      console.log('  app t+' + Math.round((Date.now() - ta) / 1000) + 's guest: ' + g.trim());
      if (/"ifr":true/.test(g)) { mounted = Math.round((Date.now() - ta) / 1000); break; }
      await sleep(5000);
    }
    ok(mounted !== null, 'guest MOUNTED the shared app iframe' + (mounted !== null ? ' (' + mounted + 's)' : ''));
  }

  console.log('# guest stderr tail:');
  for (const l of guest.err.slice(-25)) console.log('   ' + l.slice(0, 220));
  console.log(fails === 0 ? '# ALL GREEN' : '# ' + fails + ' FAILED');
  host.kill(); guest.kill();
  await sleep(3000);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL ' + (e && e.message || e)); process.exit(1); });

// ---- DIAG=1 ---------------------------------------------------------------
// meet.js `eval` JSON-stringifies a SYNCHRONOUS result, so an async probe has
// to park its answer on a window global and be read back on a second call.
async function diagnose(host, guest) {
  const VIDQ = "[...document.querySelectorAll('video')].map(v=>({id:v.id||null,cls:(v.className||'').slice(0,30),rs:v.readyState,w:v.videoWidth,h:v.videoHeight,paused:v.paused,muted:v.muted,pi:v.playsInline,hasSrc:!!v.srcObject,tracks:v.srcObject?v.srcObject.getTracks().map(t=>t.kind+'/'+t.readyState+'/'+(t.muted?'MUTED':'unmuted')):null}))";
  for (const a of [host, guest]) console.log('# ' + a.name + ' <video>: ' + (await a.cmd('eval ' + VIDQ, 30000)).out.join(' ').slice(0, 1600));
  for (const a of [host, guest]) console.log('# ' + a.name + ' meshPipe [RTCRtpScriptTransform, present, supported()]: '
    + (await a.cmd('eval [typeof RTCRtpScriptTransform, !!(window.GifOS&&GifOS.meshPipe), GifOS&&GifOS.meshPipe&&GifOS.meshPipe.supported()]', 20000)).out.join(' '));
  const KICK = "(window.__probe='pending',(async()=>{const out=[];for(const v of document.querySelectorAll('video')){if(!v.srcObject||!v.paused)continue;let r;try{await v.play();r='play-ok';}catch(e){r='play-REJECTED:'+e.name;}out.push({cls:(v.className||'').slice(0,20),r});}"
    + "await new Promise(s=>setTimeout(s,4000));window.__probe={tried:out,after:[...document.querySelectorAll('video')].map(v=>({cls:(v.className||'').slice(0,20),rs:v.readyState,w:v.videoWidth,paused:v.paused}))};})(),'kicked')";
  for (const a of [host, guest]) await a.cmd('eval ' + KICK, 20000);
  await sleep(8000);
  for (const a of [host, guest]) console.log('# ' + a.name + ' play() probe: ' + (await a.cmd('eval window.__probe', 20000)).out.join(' ').slice(0, 900));
  for (const a of [host, guest]) await a.cmd('eval (window.__pcstats(),"kicked")', 20000);
  await sleep(4000);
  for (const a of [host, guest]) console.log('# ' + a.name + ' RTP: ' + (await a.cmd('eval window.__pcstatsOut', 25000)).out.join(' ').slice(0, 2200));
}
