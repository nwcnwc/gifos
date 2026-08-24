'use strict';
/*
 * cast.js — the behavior battery's orchestrator. Spawns one test/swarm/meet.js
 * per ROLE (--drive machine mode: commands in on stdin, @@done/@@err/@@state/
 * @@probe sentinels out, plus the unsolicited @@dead), feeds each a timed
 * story, and checks the LAWS across the whole cast. See
 * test/behavior/README.md for the catalog it serves.
 *
 * EXIT CODES: 0 = every check green. 1 = a red (or the watchdog). 4 = NO
 * VERDICT — an actor's browser DIED, so the scenario refused to render one; see
 * "CASUALTY" below. A `SKIP:` line with exit 0 is a missing dependency
 * (an engine, the relay-dev harness).
 *
 * A scenario file is:
 *
 *   const { scenario } = require('../lib/cast');
 *   scenario('my-pattern', {
 *     ana: { profile: 'phone', battery: '0.62' },
 *     bob: { profile: 'desktop', video: 1 },
 *   }, async (cast, check) => {
 *     await cast.joinAll();
 *     await check.converged(2);
 *     await cast.get('ana').cmd('radio off');
 *     await cast.sleep(30);
 *     await cast.get('ana').cmd('radio on');
 *     await check.converged(2, { within: 60, desc: 'ana self-healed' });
 *     await check.oneTree(2);
 *   });
 *
 * Role spec: profile phone|desktop, battery "<lvl>[,charging|drain]",
 * video <n> (talking-head clip), cam (solid swatch; DEFAULT unless observe),
 * observe (camera off), pass, adminPw (create/enter an admin room as admin),
 * name (display name; default = capitalized role key),
 * engine chromium|webkit|firefox (default chromium; see "OTHER ENGINES" below).
 *
 * Scenario opts (4th arg): relayDev true = REQUIRES the real relay under
 * wrangler dev (test/servers/relay-dev.sh, :8794) — SKIPs (exit 0, loud) if
 * absent; 'opportunistic' = use it if up, else the default relay.
 * timeoutMin (default 15) = hard watchdog.
 *
 * OTHER ENGINES: a role may set `engine: 'firefox'` (or 'webkit'), and
 * BEHAVIOR_ENGINE forces every unpinned role onto one engine. Measured facts
 * per engine live in test/README § "Other ENGINES" — the short version:
 * firefox is a FULL participant (VP8 only, so a firefox↔chromium call
 * negotiates VP8, and playwright throws on isMobile so the phone profile drops
 * that one property); webkit joins but cannot PAINT a remote tile and dies on
 * an app share, so it may never be the observer of video liveness. In FLEET
 * mode a host only takes engines it declares (hosts-file `engines`).
 *
 * Env: BEHAVIOR_BASE / BEHAVIOR_RELAY redirect the stack (defaults
 * http://127.0.0.1:8099 + ws://127.0.0.1:8790, auto-spawned if idle);
 * BEHAVIOR_HEADFUL=1 shows browsers; BEHAVIOR_VERBOSE=1 mirrors every actor
 * line to the console. Runs never touch production.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const readline = require('readline');

const ROOT = path.join(__dirname, '..', '..', '..');
const MEET = path.join(ROOT, 'test', 'swarm', 'meet.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the FLEET (optional): spread actors over real machines --------------
// A LOCAL hosts file (never committed — it describes someone's home network)
// distributes actors over ssh so one box's CPU can't invent flap. Format:
//   { "base": "http://<orchestrator-addr>:8099", "relay": "ws://<addr>:8790",
//     "relayDev": "ws://<addr>:8794",
//     "hosts": [ { "name": "local", "weight": 1 },
//                { "name": "big", "ssh": "bighost", "dir": "/home/u/gifos",
//                  "node": "/path/to/node22", "chrome": "/path/chrome",
//                  "firefox": "/path/firefox", "webkit": "/path/pw_run.sh",
//                  "engines": ["chromium","firefox"],
//                  "nodePath": "/extra/node_modules", "weight": 3 } ] }
// Remote hosts need: the dir (test/swarm/meet.js is PUSHED there fresh at
// cast.up), playwright resolvable (nodePath if staged elsewhere), a browser.
// `engines` (optional) lists what that box can actually launch — a role asking
// for an engine the box lacks is placed on one that has it, instead of dying
// with "Executable doesn't exist" after the harness said it was ready.
// Absent file = everything local (the default).
const HOSTS_FILE = process.env.BEHAVIOR_HOSTS || path.join(process.env.HOME || '/root', '.gifos-behavior-hosts.json');
let FLEET = null;
try { FLEET = JSON.parse(fs.readFileSync(HOSTS_FILE, 'utf8')); } catch (e) {}

const BASE = (process.env.BEHAVIOR_BASE || (FLEET && FLEET.base) || 'http://127.0.0.1:8099').replace(/\/$/, '');
const DEFAULT_RELAY = process.env.BEHAVIOR_RELAY || (FLEET && FLEET.relay) || 'ws://127.0.0.1:8790';
const RELAY_DEV_URL = (FLEET && FLEET.relayDev) || 'ws://127.0.0.1:8794';
const INSECURE_ORIGINS = /^http:\/\/(?!127\.0\.0\.1|localhost)/.test(BASE) ? BASE : '';
const HEADFUL = !!process.env.BEHAVIOR_HEADFUL;
const VERBOSE = !!process.env.BEHAVIOR_VERBOSE;

// ---- CASUALTY: a dead browser is an ENVIRONMENT fact, never a verdict ------
// The battery's whole job is to say something about GifOS. A scenario whose
// actor's BROWSER died says something about the box, and it must not be
// allowed to launder that into a claim about the mesh.
//
// THE MEASUREMENT THAT PUT THIS HERE. 03a-classmates-serial-pip, the behaviour
// box, 2026-08-11: em seated at t+42.6s and its renderer crashed at t+44.9s.
// meet.js knew — it printed '[CRASH] the renderer process died' — but only to
// stderr, which lands in the per-run cast.log nobody reads. The scenario then
// polled the corpse every 2.5s for 250 more seconds and reported FOUR reds:
// "room converges to 5 for everyone", "the room never loses anyone while 4/5
// are hidden" (18 violating samples), "reunion whole after the waves", and the
// one-tree census. Every one of them true of a room with four members, and
// none of them a defect. The box: 7.6 GB of RAM with 0 MB AVAILABLE, five
// Chromiums running entirely out of swap.
//
// meet.js now says '@@dead <why>' on the sentinel channel; the patterns below
// are the backstop for the death nobody got to announce (the actor process
// itself SIGKILLed). Either way the scenario stops AT ONCE and exits
// NO_VERDICT — not green, not a red, and it blocks a cut, because a scenario
// that lost a browser measured the kernel.
// The vocabulary is shared with the direct-Playwright suites — test/lib/
// casualty.js owns what counts as a death, the exit code, and the capacity
// arithmetic, so the two halves of the battery cannot drift on it.
const { NO_VERDICT, isCasualty, MEM_PER_BROWSER_MB, parseMeminfo, memLocal, memRemote, capacityLine } = require('../../lib/casualty');
// Commands that RETIRE an actor on purpose. After one of these its browser is
// SUPPOSED to be gone (12b's car death, 18b's abrupt exit, every teardown), so
// nothing it reports afterwards is a casualty.
const RETIRING_RE = /^(leave|die|quit|exit|q)\b/;

const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const urlHostPort = (u) => { const m = /^\w+:\/\/([^/:]+):(\d+)/.exec(u); return m ? { host: m[1], port: parseInt(m[2], 10) } : { host: '127.0.0.1', port: 80 }; };

function findChrome() {
  if (process.env.MEET_CHROME) return process.env.MEET_CHROME;
  const home = process.env.HOME || '/root';
  for (const p of [
    // Playwright renamed the unpacked dir between builds (chrome-linux ->
    // chrome-linux64), so carry BOTH spellings for each build. Every entry is
    // existsSync-guarded, so an extra candidate costs nothing and a missing one
    // is what silently killed the drills (see findChrome in test/drills/*).
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium-1228/chrome-linux/chrome',
    '/opt/pw-browsers/chromium-1228/chrome-linux64/chrome',
    path.join(home, '.cache/ms-playwright/chromium-1228/chrome-linux/chrome'),
    path.join(home, '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),
    path.join(home, '.cache/ms-playwright/chromium-1194/chrome-linux/chrome'),
  ]) if (fs.existsSync(p)) return p;
  return ''; // let meet.js resolve
}
const CHROME = findChrome();

function portUp(port, host) {
  return new Promise((res) => {
    const s = net.connect({ port, host: host || '127.0.0.1' });
    const done = (v) => { try { s.destroy(); } catch (e) {} res(v); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), 1500).unref();
  });
}

// ---------------------------------------------------------------- Actor ----
class Actor {
  constructor(cast, role, spec) {
    this.cast = cast; this.role = role; this.spec = spec || {};
    this.name = this.spec.name || role.charAt(0).toUpperCase() + role.slice(1);
    this.av = null; this.alive = false; this.joined = false;
    this.retired = false; // a deliberate leave/die/quit — its death is expected
    this._q = Promise.resolve();
  }
  // BEHAVIOR_ENGINE re-engines a scenario WITHOUT editing it — the lever that
  // lets any of the 60 existing scenarios be asked the cross-engine question:
  //   BEHAVIOR_ENGINE=firefox        every unpinned role (an all-firefox room)
  //   BEHAVIOR_ENGINE=maya=firefox   just that role (one non-chromium viewer)
  // A role's own `engine:` in the spec always wins.
  engine() {
    if (this.spec.engine) return String(this.spec.engine).toLowerCase();
    const e = String(process.env.BEHAVIOR_ENGINE || '').toLowerCase().trim();
    if (!e) return 'chromium';
    if (!e.includes('=')) return e;
    for (const part of e.split(',')) {
      const [r, v] = part.split('=');
      if (r && r.trim() === this.role) return (v || '').trim() || 'chromium';
    }
    return 'chromium';
  }
  spawnChild() {
    const h = this.host || { name: 'local' };
    const a = ['--drive', '--name', this.name, '--profile', this.spec.profile || 'desktop',
      '--base', BASE, '--relay', this.cast.relay,
      '--jsonl', path.join(this.cast.runDir, this.role + '.jsonl'), '--every', '3'];
    if (this.spec.battery) a.push('--battery', String(this.spec.battery));
    if (this.spec.video !== undefined) a.push('--video', String(this.spec.video));
    if (this.spec.observe) a.push('--observe');
    if (this.spec.adminPw) a.push('--admin-pw', this.spec.adminPw);
    if (this.spec.ensurePass) a.push('--ensure-pass', this.spec.ensurePass);
    if (this.spec.seedDesktop) a.push('--seed-desktop');
    if (this.spec.meshC) a.push('--mesh-c', String(this.spec.meshC));
    // ENGINE: chromium (default) | firefox | webkit. meet.js owns every engine
    // difference (bare launch, BB_ACTOR env marker, permission vocabulary,
    // isMobile, the firefox securecontext-allowlist hatch) — this is only the
    // pass-through. See "OTHER ENGINES" in test/README before wiring a role.
    const engine = this.engine();
    if (engine !== 'chromium') a.push('--engine', engine);
    if (HEADFUL && !h.ssh) a.push('--headful');
    if (!h.ssh) {
      const env = Object.assign({}, process.env,
        CHROME && engine === 'chromium' ? { MEET_CHROME: CHROME } : {},
        INSECURE_ORIGINS ? { MEET_INSECURE_ORIGINS: INSECURE_ORIGINS } : {});
      this.child = spawn(process.execPath, [MEET].concat(a), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      // remote actor: same stdio sentinel protocol, over ssh. The env rides
      // inline; meet.js was pushed fresh to h.dir by cast.up().
      const envParts = [];
      if (INSECURE_ORIGINS) envParts.push('MEET_INSECURE_ORIGINS=' + shq(INSECURE_ORIGINS));
      if (h.chrome && engine === 'chromium') envParts.push('MEET_CHROME=' + shq(h.chrome));
      if (h.firefox && engine === 'firefox') envParts.push('MEET_FIREFOX=' + shq(h.firefox));
      if (h.webkit && engine === 'webkit') envParts.push('MEET_WEBKIT=' + shq(h.webkit));
      if (h.nodePath) envParts.push('NODE_PATH=' + shq(h.nodePath));
      // actors run the PUSHED .bb-meet.js — never the repo's own meet.js,
      // which other services on that box (e.g. a resident monitor) may run
      const remote = 'cd ' + shq(h.dir) + ' && ' + (envParts.length ? 'env ' + envParts.join(' ') + ' ' : '')
        + shq(h.node || 'node') + ' test/swarm/.bb-meet.js ' + a.map(shq).join(' ');
      this.child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', h.ssh, remote],
        { stdio: ['pipe', 'pipe', 'pipe'] });
    }
    this.alive = true;
    // Name the SIGNAL. "actor exited null" is what a killed actor reports, and
    // it reads exactly like a product join failure — the two things that
    // actually kill one are a memory-squeezed orchestrator (SIGKILL from the
    // kernel/VM manager) and another cast's stale-actor sweep, neither of which
    // is the mesh. Measured 2026-08-05: a 5-actor fleet scenario lost its first
    // actor to a SIGKILL while the box was at loadavg 26 on 4 cores.
    this.child.on('exit', (code, signal) => {
      this.alive = false;
      const why = 'actor exited ' + code + (signal ? ' [killed: ' + signal + ']' : '');
      if (signal) this.cast.noteCasualty(this, why); // the actor itself was killed — nobody got to announce it
      this._resolvePending({ err: why });
      this._readyRes(); // an ssh/spawn failure must fail FAST, not hang up()
    });
    this._pending = null; this._payload = undefined; this._out = []; this._staleDone = 0;
    this._ready = new Promise((res) => { this._readyRes = res; });
    const outRl = readline.createInterface({ input: this.child.stdout });
    outRl.on('line', (l) => this._onLine(l));
    const errRl = readline.createInterface({ input: this.child.stderr });
    errRl.on('line', (l) => {
      const m = /\[meet\] admin verifier (\S+)/.exec(l);
      if (m) this.av = m[1];
      this.cast.logRaw(this.role + ' ! ' + l);
    });
  }
  _onLine(l) {
    if (l === '@@ready') { this._readyRes(); return; }
    // UNSOLICITED, and it arrives the moment the browser dies rather than 60s
    // later dressed as a failing assertion.
    if (l.startsWith('@@dead ')) { this.cast.logRaw(this.role + ' | ' + l); this.cast.noteCasualty(this, l.slice(7)); return; }
    if (l.startsWith('@@state ') || l.startsWith('@@probe ')) {
      try { this._payload = JSON.parse(l.slice(8)); } catch (e) { this._payload = null; }
      return;
    }
    if (l === '@@done' || l.startsWith('@@err ')) {
      // a sentinel for a command we gave up on (timeout) must be DISCARDED,
      // or every later response misattributes by one — the desync cascade
      if (this._staleDone > 0) { this._staleDone--; return; }
      if (l === '@@done') this._resolvePending({ payload: this._payload, out: this._out });
      else this._resolvePending({ err: l.slice(6), out: this._out });
      return;
    }
    this._out.push(l);
    this.cast.logRaw(this.role + ' | ' + l);
  }
  _resolvePending(v) { if (this._pending) { const p = this._pending; this._pending = null; p(v); } }
  // Serialized per actor. Returns { payload?, out, err? } — command-level
  // errors come back in .err, they don't throw (a scenario decides severity).
  cmd(line, timeoutMs) {
    const run = () => new Promise((resolve) => {
      if (!this.alive) return resolve({ err: 'actor not running', out: [] });
      this.cast.logRaw(this.role + ' > ' + line);
      this._payload = undefined; this._out = [];
      let t;
      this._pending = (v) => { clearTimeout(t); resolve(v); };
      t = setTimeout(() => {
        if (this._pending) this._staleDone++; // its sentinel will still arrive — discard it then
        this._resolvePending({ err: 'cmd timeout: ' + line, out: this._out });
      }, timeoutMs || 90000);
      this.child.stdin.write(line + '\n');
    }).then((r) => {
      if (RETIRING_RE.test(line)) { this.joined = false; this.retired = true; }
      // BACKSTOP for the death that never got announced: '@@dead' covers a
      // browser that dies while meet.js still lives, but a Playwright call can
      // also come back "Target crashed" first, and an ssh-killed remote actor
      // says nothing at all. A retired actor is exempt by definition.
      else if (isCasualty(r.err)) this.cast.noteCasualty(this, r.err);
      return r;
    });
    this._q = this._q.then(run, run);
    return this._q;
  }
  async state() { const r = await this.cmd('jstate', 20000); return r.payload || { err: r.err || 'no state' }; }
  async probe(secs) { const r = await this.cmd('probe ' + (secs || 4.5), 30000); return r.payload; }
  // The @@eval sentinel pins the reply line: the old first-indented-line
  // scrape could grab an async print that landed in the reply window (the
  // 11b cycle-2 ambiguity, 2026-07-27). Fallback kept for older meet.js.
  async eval(js) { const r = await this.cmd('eval ' + js, 30000); let l = (r.out.find((x) => x.trim().startsWith('@@eval ')) || '').trim().slice(7); if (!l) l = (r.out.find((x) => x.startsWith('  ')) || '').trim(); try { return JSON.parse(l); } catch (e) { return l; } }
  join(room, opts) {
    opts = opts || {};
    let c = 'join ' + room;
    if (opts.pass || this.spec.pass) c += ' --pass ' + (opts.pass || this.spec.pass);
    if (opts.av) c += ' --av ' + opts.av;
    if (opts.bc || this.spec.bc) c += ' --bc'; // the BROADCAST skin (spec: bc true on every role of a broadcast cast)
    const p = this.cmd(c, 120000).then((r) => { if (!r.err) this.joined = true; return r; });
    return p;
  }
  async waitSeat(secs) {
    const r = await this.cmd('waitseat ' + (secs || 60), (secs || 60) * 1000 + 20000);
    return !(r.err || (r.out.join(' ').includes('not seated')));
  }
}

// ----------------------------------------------------------------- Cast -----
class Cast {
  constructor(scenarioName, spec, opts) {
    this.name = scenarioName; this.opts = opts || {};
    this.room = 'bb-' + scenarioName.replace(/[^a-z0-9]+/gi, '-').slice(0, 24) + '-' + Math.random().toString(36).slice(2, 6);
    this.runDir = path.join('/tmp/behavior', scenarioName + '-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
    fs.mkdirSync(this.runDir, { recursive: true });
    this.logFile = fs.createWriteStream(path.join(this.runDir, 'cast.log'));
    this.actors = new Map();
    for (const [role, s] of Object.entries(spec)) this.actors.set(role, new Actor(this, role, s));
    // fleet assignment: weighted round-robin over the hosts file (or local).
    // A role can pin itself with spec.host = "<host name>".
    const hosts = (FLEET && FLEET.hosts && FLEET.hosts.length) ? FLEET.hosts : [{ name: 'local' }];
    // smooth weighted order (interleaved, not block-wise) so a small cast
    // still spreads across machines instead of stacking on the heaviest
    const cycle = hosts
      .flatMap((h) => {
        // weight 0 is the orchestrator (or a resident box): it must not take
        // actors. `h.weight || 1` treated 0 as 1, so 00-levers parked `dot`
        // on local and SIGTERM'd it (NO-VERDICT).
        const w = (h.weight === undefined || h.weight === null) ? 1 : Number(h.weight);
        if (!(w > 0)) return [];
        return Array.from({ length: w }, (_, i) => ({ h, pos: (i + 1) / w }));
      })
      .sort((a, b) => a.pos - b.pos).map((x) => x.h);
    let ci = 0;
    // A host that declares `engines` only takes roles it can actually launch;
    // a host that declares none is assumed chromium-only EXCEPT for `local`
    // (the orchestrator, whose engines cast.js cannot enumerate). Placement
    // still round-robins — the engine filter only skips hosts that would die.
    const canRun = (h, eng) => eng === 'chromium'
      ? !(h.engines && !h.engines.includes('chromium'))
      : (h.engines ? h.engines.includes(eng) : !h.ssh);
    for (const a of this.all()) {
      const eng = a.engine();
      if (a.spec.host) {
        a.host = hosts.find((h) => h.name === a.spec.host);
        // a PIN is explicit intent — say so when it cannot hold, rather than
        // launching a browser that box does not have
        if (a.host && !canRun(a.host, eng)) throw new Error('role ' + a.role + ' is pinned to host "' + a.spec.host
          + '", which does not declare engine "' + eng + '"');
        if (a.host) continue;
      }
      let picked = null;
      for (let k = 0; k < cycle.length; k++) { const h = cycle[(ci + k) % cycle.length]; if (canRun(h, eng)) { picked = h; ci += k + 1; break; } }
      if (!picked) throw new Error('no fleet host can run engine "' + eng + '" for role ' + a.role
        + ' — add "engines" to a host in the hosts file, or install it there');
      a.host = picked;
    }
    this.children = []; // spawned stack servers
    this.relay = DEFAULT_RELAY;
    this.t0 = Date.now();
    this.casualties = []; this.tearing = false; this._aborting = false;
    this.mem = new Map(); // host name -> the capacity snapshot taken at up()
  }
  get(role) { const a = this.actors.get(role); if (!a) throw new Error('no actor ' + role); return a; }
  all() { return [...this.actors.values()]; }
  live() { return this.all().filter((a) => a.alive && a.joined); }
  logRaw(line) { this.logFile.write('t+' + ((Date.now() - this.t0) / 1000).toFixed(1) + ' ' + line + '\n'); if (VERBOSE) console.log('    ' + line); }
  log(msg) { const t = 't+' + ((Date.now() - this.t0) / 1000).toFixed(0) + 's'; console.log('  [' + t + '] ' + msg); this.logFile.write(t + ' == ' + msg + '\n'); }
  async sleep(secs, why) { this.log('… ' + secs + 's' + (why ? ' — ' + why : '')); await sleep(secs * 1000); }

  // how many browsers this cast puts on each box (the capacity denominator)
  hostCounts() {
    const c = new Map();
    for (const a of this.all()) { const n = (a.host && a.host.name) || 'local'; c.set(n, (c.get(n) || 0) + 1); }
    return c;
  }

  // ---- THE CASUALTY GATE ---------------------------------------------------
  // One of the cast's browsers died and nobody asked it to. Everything after
  // this moment is a measurement of a room that is short a member, so the
  // scenario stops HERE and renders NO VERDICT rather than a red.
  noteCasualty(actor, why) {
    if (this.tearing || actor.retired) return;
    if (this.casualties.some((c) => c.role === actor.role)) return;
    this.casualties.push({
      role: actor.role, host: (actor.host && actor.host.name) || 'local',
      why: String(why).slice(0, 200), at: ((Date.now() - this.t0) / 1000).toFixed(1),
    });
    this.logRaw('!! CASUALTY ' + actor.role + ' — ' + why);
    if (this._aborting) return;
    this._aborting = true;
    this.abortNoVerdict().catch((e) => { console.error(String(e)); process.exit(NO_VERDICT); });
  }

  async abortNoVerdict() {
    const c = this.casualties[0];
    const n = this.hostCounts().get(c.host) || 1;
    // Re-read the box NOW: what it had at up() is interesting, what it had at
    // the moment of death is the evidence.
    const at = this.all().find((a) => a.role === c.role);
    const m = (at && at.host && at.host.ssh) ? await memRemote(at.host.ssh) : memLocal();
    console.log('');
    console.log('NO VERDICT — an actor\'s BROWSER DIED, so nothing here is a claim about GifOS.');
    console.log('');
    console.log('  CASUALTY: ' + c.role + ' on ' + c.host + ' at t+' + c.at + 's — ' + c.why);
    console.log('  THE BOX:  ' + capacityLine(c.host, n, m));
    const was = this.mem.get(c.host);
    if (was && was.availMb != null) console.log('  AT START: ' + was.availMb + ' MB available'
      + (was.load != null ? ', load ' + was.load.toFixed(2) : ''));
    console.log('');
    console.log('  A browser that dies mid-scenario takes its seat, its tracks and its');
    console.log('  answers with it, and every later check reads a room that is genuinely');
    console.log('  short a member. Those reds would be TRUE and MEANINGLESS — which is');
    console.log('  how 03a spent 301s reporting "the room never loses anyone" as a mesh');
    console.log('  defect while its fifth renderer had been dead since t+44.9s.');
    console.log('');
    console.log('  This is NOT a product failure and NOT a flake, so it is not retried.');
    console.log('  Give the cast a box that can hold it — free the RAM, or spread the');
    console.log('  actors over the farm (test/README -> "The BEHAVIOR battery in FLEET');
    console.log('  mode"). If the box was idle and roomy, the crash itself is the bug:');
    console.log('  the run dir below has the renderer\'s last words.');
    console.log('');
    console.log('NO-VERDICT ' + this.name + ' — 0 PASSED, 0 FAILED, no verdict was reached, on purpose.');
    console.log('  run dir: ' + this.runDir);
    await this.down(false);
    process.exit(NO_VERDICT);
  }

  async ensureStack() {
    // relay-dev requirement / opportunity first — it decides this.relay
    if (!process.env.BEHAVIOR_RELAY && this.opts.relayDev) {
      const dv = urlHostPort(RELAY_DEV_URL);
      const devUp = await portUp(dv.port, dv.host);
      if (devUp) { this.relay = RELAY_DEV_URL; this.log('using the REAL relay under wrangler dev (' + RELAY_DEV_URL + ')'); }
      else if (this.opts.relayDev === true) {
        console.log('SKIP: this scenario needs the REAL relay — start test/servers/relay-dev.sh (' + RELAY_DEV_URL + ')');
        process.exit(0);
      } else this.log('relay-dev not up — opportunistic scenario falls back to ' + this.relay);
    }
    const site = urlHostPort(BASE), relay = urlHostPort(this.relay);
    const localMode = site.host === '127.0.0.1';
    if (localMode && !(await portUp(site.port))) {
      this.log('site :' + site.port + ' idle — spawning python http.server');
      this.children.push(spawn('python3', ['-m', 'http.server', String(site.port), '-d', 'site'], { cwd: ROOT, stdio: 'ignore' }));
    }
    if (localMode && relay.host === '127.0.0.1' && !(await portUp(relay.port))) {
      this.log('relay :' + relay.port + ' idle — spawning relay-local (RELAY_DEV=1)');
      this.children.push(spawn(process.execPath, [path.join(ROOT, 'test', 'servers', 'relay-local.js')],
        { env: Object.assign({}, process.env, { RELAY_DEV: '1' }), stdio: 'ignore' }));
    }
    for (let i = 0; i < 20; i++) {
      if ((await portUp(site.port, site.host)) && (await portUp(relay.port, relay.host))) return;
      await sleep(500);
    }
    // fleet mode never auto-spawns — the stack must already run on the
    // orchestrator box, bound to an address the fleet can reach
    throw new Error('stack unreachable (site=' + BASE + ' relay=' + this.relay + ')'
      + (localMode ? '' : ' — fleet mode expects it already running and bound to a reachable address'));
  }

  // push the CURRENT meet.js to every remote host in this cast — remote repo
  // checkouts are allowed to be stale; the driver never is.
  async syncFleet() {
    const remotes = new Map();
    for (const a of this.all()) if (a.host && a.host.ssh) remotes.set(a.host.ssh, a.host);
    // STALE-ACTOR SWEEP: a timeout-killed scenario bypasses down(), and its
    // orphaned actors+browsers eventually break launches on that box (the
    // 2026-07-27 cert-sweep selftest red). Scenarios run serially by design,
    // so anything matching the ACTOR patterns before we start is a leak.
    // Patterns are bracket-guarded (never self-match) and actor-specific
    // (never a resident monitor's meet.js or a human's browser).
    try { spawn('sh', ['-c', 'pkill -f "meet[.]js [-]-drive" 2>/dev/null; true'], { stdio: 'ignore' }); } catch (e) {}
    for (const [, h] of remotes) {
      try { spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', h.ssh, 'pkill -f "bb[-]meet" 2>/dev/null; pkill -f "bb[-]actor" 2>/dev/null; true'], { stdio: 'ignore' }); } catch (e) {}
    }
    await sleep(1200); // let the reaps land before fresh spawns
    for (const [, h] of remotes) {
      await new Promise((res, rej) => {
        const p = spawn('ssh', ['-o', 'BatchMode=yes', h.ssh, 'mkdir -p ' + shq(h.dir + '/test/swarm') + ' && cat > ' + shq(h.dir + '/test/swarm/.bb-meet.js')], { stdio: ['pipe', 'ignore', 'inherit'] });
        fs.createReadStream(MEET).pipe(p.stdin);
        p.on('exit', (c) => c === 0 ? res() : rej(new Error('meet.js push to ' + h.name + ' failed (' + c + ')')));
      });
    }
    if (remotes.size) this.log('pushed current meet.js to: ' + [...remotes.keys()].join(', '));
  }

  async up() {
    // Engines placed on THIS box must exist on THIS box. A fleet host was
    // already filtered by its declared `engines`; local is the one that can
    // still surprise us (BEHAVIOR_ENGINE re-engines a scenario that never
    // called needEngines). SKIP loudly rather than spawn a doomed actor.
    needEngines(...new Set(this.all().filter((a) => !(a.host && a.host.ssh)).map((a) => a.engine())));
    await this.ensureStack();
    await this.syncFleet();
    // CAPACITY, ON THE RECORD, BEFORE ANYTHING RUNS. Not a gate — a box that is
    // short still gets to try, because 24 of 25 scenarios do survive on swap —
    // but when one of them loses a renderer, the reader must not have to guess
    // whether the box could ever have held the cast. It is one line, and it is
    // the line that was missing on 2026-08-11.
    const counts = this.hostCounts();
    const snaps = await Promise.all([...counts.keys()].map(async (name) => {
      const h = this.all().map((a) => a.host).find((x) => ((x && x.name) || 'local') === name);
      return [name, (h && h.ssh) ? await memRemote(h.ssh) : memLocal()];
    }));
    for (const [name, m] of snaps) {
      this.mem.set(name, m);
      this.log('capacity ' + capacityLine(name, counts.get(name), m));
    }
    for (const a of this.all()) a.spawnChild();
    await Promise.all(this.all().map((a) => a._ready));
    this.log('cast up: ' + this.all().map((a) => a.role + '(' + (a.spec.profile || 'desktop')
      + (a.engine() === 'chromium' ? '' : '/' + a.engine()) + '@' + (a.host && a.host.name || 'local') + ')').join(', ')
      + '  room=' + this.room + '  relay=' + this.relay);
  }

  // join everyone; roles = subset (default all), av auto-shared from the
  // first adminPw actor once known. SERIAL-SEATED by default (each member
  // seats before the next knocks — how most real meetings fill). A burst
  // arrival is a deliberate stress: pass { serial: false, stagger: 0 }.
  async joinAll(o) {
    o = o || {};
    const roles = o.roles ? o.roles.map((r) => this.get(r)) : this.all();
    const serial = o.serial !== false;
    for (const a of roles) {
      const av = this.avKnown();
      const r = await a.join(this.room, { av: a.spec.adminPw ? undefined : av });
      if (r.err) throw new Error(a.role + ' failed to join: ' + r.err);
      if (serial && !(await a.waitSeat(o.waitSeat || 60))) throw new Error(a.role + ' never seated');
      if (o.stagger !== 0) await sleep((o.stagger || 3) * 1000);
    }
    if (!serial) {
      const seats = await Promise.all(roles.map((a) => a.waitSeat(o.waitSeat || 60)));
      roles.forEach((a, i) => { if (!seats[i]) throw new Error(a.role + ' never seated'); });
    }
    this.log('all seated: ' + roles.map((a) => a.role).join(', '));
  }
  avKnown() { for (const a of this.all()) if (a.av) return a.av; return undefined; }

  // THE DEPLOY LEVER — a real Durable Object restart, only under relay-dev.
  async deployRelay() {
    if (this.relay !== RELAY_DEV_URL) throw new Error('deployRelay needs the relay-dev harness (:8794)');
    const f = path.join(ROOT, 'relay', 'src', 'relay.js');
    fs.utimesSync(f, new Date(), new Date());
    this.log('DEPLOY: touched relay/src/relay.js — wrangler dev reloads (DO restart)');
    await sleep(8000);
    if (!(await portUp(8794))) throw new Error('relay-dev did not come back after deploy');
  }

  async down(failed) {
    this.tearing = true; // from here every browser death is one we asked for
    if (failed) {
      for (const a of this.all()) if (a.alive && a.joined && !(await a.state()).err) {
        await a.cmd('shot ' + path.join(this.runDir, a.role + '-fail.png'), 30000);
      }
    }
    for (const a of this.all()) if (a.alive) { a.cmd('quit', 8000); }
    await sleep(2500);
    for (const a of this.all()) if (a.alive && a.child) { try { a.child.kill('SIGKILL'); } catch (e) {} }
    for (const c of this.children) { try { c.kill(); } catch (e) {} }
    this.logFile.end();
  }
}

// ---------------------------------------------------------------- Check -----
class Check {
  constructor(cast) { this.cast = cast; this.passed = 0; this.failed = 0; this.failures = []; }
  _pass(desc) { this.passed++; console.log('  ✔ ' + desc); }
  _fail(desc, detail) {
    // stamp the loadavg: on a saturated box a red may be starvation, not the
    // mesh (test/README "a weak host invents failures") — make that visible
    let load = '';
    try { load = ' [load ' + require('fs').readFileSync('/proc/loadavg', 'utf8').split(' ')[0] + '/' + require('os').cpus().length + 'cpu]'; } catch (e) {}
    this.failed++; this.failures.push(desc);
    console.log('  ✘ ' + desc + (detail ? ' — ' + String(detail).slice(0, 500) : '') + load);
  }
  assert(cond, desc, detail) { cond ? this._pass(desc) : this._fail(desc, detail); return !!cond; }

  // poll an async predicate until truthy — the workhorse
  // A DEFAULT DEADLINE IS A WAIT. AN EXPLICIT ONE IS AN ASSERTION.
  //
  // 09a-standup-triple-burst red-ed the gate TWICE with `replies=4/5 seated=4
  // dup=false connOrphans=0 [load 6.21/6cpu]` — five browsers on a six-core
  // box, one of them not answering the census inside 60s. Nothing was broken:
  // no dups, no orphans, the four that answered were all seated. The room was
  // still coming up and the clock ran out.
  //
  // So when the caller did NOT name a deadline, the 60s default is not a
  // promise and this keeps waiting WHILE THE PICTURE IS STILL CHANGING —
  // the same rule the mesh/flood and anyroad fixes use. Progress is measured
  // on the failure detail itself, which is exactly the thing that reads
  // `4/5` and then `5/5`. When it stops changing for STALL_MS the wait is
  // genuinely stuck and fails IMMEDIATELY, which is faster than today.
  //
  // A caller that passes `within` is asserting a BOUND (57 scenarios do, some
  // as tight as 10s — the failover-wake grace among them). Those are never
  // extended, or this would quietly soften the very numbers they exist to
  // hold. `grace: true` opts an explicit deadline in.
  async until(desc, fn, o) {
    o = o || {};
    const elastic = (o.within == null) || o.grace === true;
    const within = (o.within || 60) * 1000, every = (o.every || 2.5) * 1000, t0 = Date.now();
    const STALL_MS = 20000, CEIL = within * 3;
    let last, lastKey = null, changedAt = Date.now(), why = '';
    for (;;) {
      try { last = await fn(); if (last) { this._pass(desc + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)'); return true; } }
      catch (e) { last = String(e).slice(0, 200); }
      const key = typeof last === 'string' ? last : JSON.stringify(last && last.detail || last || null);
      if (key !== lastKey) { lastKey = key; changedAt = Date.now(); }
      const el = Date.now() - t0;
      if (el >= within) {
        if (!elastic) { why = ''; break; }
        if (Date.now() - changedAt >= STALL_MS) { why = ' — STALLED (nothing changed for ' + (STALL_MS / 1000) + 's, so this is not a slow box)'; break; }
        if (el >= CEIL) { why = ' — still changing at the ' + (CEIL / 1000) + 's ceiling'; break; }
      }
      await sleep(every);
    }
    this._fail(desc + ' (>' + ((Date.now() - t0) / 1000).toFixed(0) + 's)' + why, typeof last === 'string' ? last : JSON.stringify(last && last.detail || last || null));
    return false;
  }

  // the predicate must HOLD for the whole window (o.for secs); o.allow
  // tolerates that many violating samples (a lone blip vs a flap storm)
  async steady(desc, fn, o) {
    o = o || {};
    const dur = (o.for || 30) * 1000, every = (o.every || 2.5) * 1000, t0 = Date.now();
    let viol = 0, last;
    while (Date.now() - t0 < dur) {
      try { if (!(await fn())) { viol++; last = 'predicate false'; } }
      catch (e) { viol++; last = String(e).slice(0, 200); }
      await sleep(every);
    }
    if (viol <= (o.allow || 0)) { this._pass(desc + ' (held ' + (dur / 1000) + 's' + (viol ? ', ' + viol + ' blip(s) within allowance' : '') + ')'); return true; }
    this._fail(desc + ' — ' + viol + ' violating samples over ' + (dur / 1000) + 's', last);
    return false;
  }

  // every LIVE joined actor (or o.roles) sees n participants, zero dups
  async converged(n, o) {
    o = o || {};
    const desc = o.desc || 'room converges to ' + n + ' for everyone';
    return this.until(desc, async () => {
      const actors = o.roles ? o.roles.map((r) => this.cast.get(r)) : this.cast.live();
      if (!actors.length) return false;
      const sts = await Promise.all(actors.map((a) => a.state()));
      const bad = [];
      sts.forEach((s, i) => {
        if (s.err) bad.push(actors[i].role + ':' + s.err);
        else if (s.participants !== n) bad.push(actors[i].role + ':participants=' + s.participants);
        else if (s.dups > 0) bad.push(actors[i].role + ':dups=' + s.dups);
      });
      if (bad.length) throw bad.join(' ');
      return true;
    }, o);
  }

  async seated(role, o) {
    o = o || {};
    return this.until(o.desc || role + ' is seated', async () => {
      const s = await this.cast.get(role).state();
      return !s.err && !!s.coord;
    }, o);
  }

  // roster honesty: `role` no longer lists a peer named `name`
  async rosterLacks(role, name, o) {
    o = o || {};
    return this.until(o.desc || role + "'s roster drops " + name, async () => {
      const s = await this.cast.get(role).state();
      return !s.err && !(s.roster || []).some((r) => (r.name || '') === name);
    }, o);
  }
  async rosterHas(role, name, o) {
    o = o || {};
    return this.until(o.desc || role + "'s roster shows " + name, async () => {
      const s = await this.cast.get(role).state();
      return !s.err && (s.roster || []).some((r) => (r.name || '') === name);
    }, o);
  }

  // whole-mesh census via one actor: n seats, all distinct coords, no orphans
  async oneTree(n, o) {
    o = o || {};
    const via = this.cast.get(o.via || this.cast.live()[0].role);
    const desc = o.desc || 'census: ONE tree, ' + n + ' seats, no dups, no orphans';
    return this.until(desc, async () => {
      const reps = await via.probe(4.5);
      if (!reps || !Array.isArray(reps)) return false;
      const coords = reps.map((r) => r.coord).filter(Boolean);
      const dup = coords.length !== new Set(coords).size;
      const byId = new Set(reps.map((r) => String(r.from).slice(0, 8)).concat(reps.map((r) => r.from)));
      // Orphan refs are counted on CONN claims only: a conn entry that nobody
      // answers for is a zombie channel (a real bug). Stale LINK names are
      // sim-law-tolerated phantoms — hearsay informs routing, never liveness
      // (mesh.cpp E2) — so they are residue, not failure.
      let connOrphans = 0;
      for (const r of reps) for (const x of (r.conn || [])) if (x && !byId.has(x)) connOrphans++;
      const ok = reps.length === n && coords.length === n && !dup && connOrphans === 0;
      if (!ok) throw 'replies=' + reps.length + '/' + n + ' seated=' + coords.length + ' dup=' + dup + ' connOrphans=' + connOrphans;
      return true;
    }, o);
  }

  summary(name) {
    const verdict = this.failed === 0 ? 'PASS' : 'FAIL';
    console.log('\n' + verdict + ' ' + name + ' — ' + this.passed + ' passed, ' + this.failed + ' failed'
      + (this.failed ? '\n  failed: ' + this.failures.join(' | ') : ''));
    return this.failed === 0;
  }
}

// ------------------------------------------------------- engine presence ----
// A missing BROWSER is an environment fact, not a product failure — the same
// doctrine the [relay-dev] scenarios already follow. needEngines() SKIPs
// loudly (exit 0, one 'SKIP:' line the battery reports) instead of letting a
// box without firefox report "actor exited 1" as a mesh regression.
function engineAvailable(engine) {
  if (engine === 'chromium') return true;
  // The per-box pin (MEET_FIREFOX / MEET_WEBKIT) is what meet.js LAUNCHES
  // with, so it is what presence means. Without this, a box whose repo
  // playwright pins an older revision reports "not installed" for a perfectly
  // good newer build — and the suggested `npx playwright install` would
  // reinstall the exact revision the too-old-browser preflight refuses
  // (Ed25519 predates it). The circular trap that SKIPped 25a on the gate
  // host, 2026-08-05.
  const envP = process.env['MEET_' + engine.toUpperCase()];
  if (envP && fs.existsSync(envP)) return true;
  if (FLEET && FLEET.hosts && FLEET.hosts.some((h) => (h.engines || []).includes(engine))) return true;
  let pw = null;
  for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
    try { pw = require(m); if (pw && pw[engine]) break; } catch (e) {}
  }
  try { const p = pw && pw[engine] && pw[engine].executablePath(); return !!p && fs.existsSync(p); } catch (e) { return false; }
}
function needEngines() {
  const missing = [...arguments].filter((e) => !engineAvailable(e));
  if (missing.length) {
    console.log('SKIP: browser engine not installed here: ' + missing.join(', ')
      + ' — `npx playwright install ' + missing.join(' ') + '` (or declare a fleet host with "engines")');
    process.exit(0);
  }
}

// -------------------------------------------------------------- scenario ----
function scenario(name, spec, fn, opts) {
  opts = opts || {};
  (async () => {
    console.log('SCENARIO ' + name + (opts.relayDev === true ? ' [relay-dev]' : ''));
    const cast = new Cast(name, spec, opts);
    const check = new Check(cast);
    const watchdog = setTimeout(() => {
      console.log('\nFAIL ' + name + ' — WATCHDOG: scenario exceeded ' + (opts.timeoutMin || 15) + ' min');
      cast.down(true).then(() => process.exit(1));
    }, (opts.timeoutMin || 15) * 60000);
    let ok = false;
    try {
      await cast.up();
      await fn(cast, check);
      ok = check.summary(name);
    } catch (e) {
      check._fail('scenario threw', (e && e.stack || e));
      check.summary(name);
    }
    clearTimeout(watchdog);
    await cast.down(!ok);
    console.log('  run dir: ' + cast.runDir);
    process.exit(ok ? 0 : 1);
  })().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(1); });
}

module.exports = { scenario, Cast, Check, sleep, BASE, needEngines, engineAvailable,
  isCasualty, RETIRING_RE, parseMeminfo, capacityLine, NO_VERDICT, MEM_PER_BROWSER_MB };
