// seat-flap-repro.js — WHY A PLANE GUEST GETS VIDEO BUT NEVER A SEAT.
//
// The incident (2026-08-04, Nathan on in-flight wifi): the monitored room read
// occ=1 for hours while his tile flickered in and out. The forensics looked
// self-contradictory — liveVid=1 with links=0, hundreds of times — until the
// two counters turned out to measure different planes:
//
//   vid   = p.video.srcObject && videoWidth > 0   (run.html:10626) — REAL
//           decoded frames over an established RTCPeerConnection.
//   links = [...s.linkPeers()].length             (run.html:10637) — the MESH
//           neighbour set, and linkPeers() opens with `if (!this.hasCoord)
//           return out` (mesh.js:1445). No coordinate ⇒ zero links, forever.
//
// So media was fine and SEATING never happened. They use different transports,
// and that asymmetry is the bug:
//
//   media   rides the peer connection. Once up, RTP needs ZERO round trips and
//           tolerates loss natively — frames just keep arriving.
//   seating rides the DOOR. An unseated entrant has no data channels by
//           construction, so mesh-wire's deliver() (mesh-wire.js:210) puts
//           every entry frame on the relay socket:
//             knock -> GREETERS -> WHOHOME -> HOME -> FIND -> PLACE
//           Three relay round trips, and deliver() has no fallback by design:
//           "Anything else has no path ... Say nothing and let healing see the
//           truth — a back channel that lies about reachability is worse than
//           silence."
//
// On a flapping uplink the socket dies mid-dance. The monitor counted
// nosock=1012 — a thousand entry frames the relay discarded because the guest's
// socket was gone — while video kept flowing over a pc established during some
// earlier lucky window.
//
// This repro is BROWSERLESS AND DETERMINISTIC. It runs on the SAME fabric as
// the mesh gate (test/mesh/mesh-harness.js) rather than a hand-rolled env,
// which matters more than it looks: mesh.js's verifyFill is FAIL-CLOSED on
// m.s4ok, so a fabric that does not really sign and verify fills seats NOBODY
// and the resulting "repro" is pure harness bug. (That is exactly what the
// first cut of this file did — its control leg failed too.) Sharing the gate's
// fabric means a drift in the S4 seam breaks both, loudly.
//
// It stands up one seated greeter, then admits an entrant through a DOOR that
// flaps on a duty cycle, and reports whether the entrant ever reaches state 3
// — and if not, which step of the dance it dies on.
//
// NOT A GATE — a diagnostic (test/tools/), like deep-stadium-repro and
// pipe-freeze-probe. --assert turns the control leg into a pass/fail so a
// regression in the HEALTHY path is loud.
//
//   node test/tools/seat-flap-repro.js                  # the duty-cycle sweep
//   node test/tools/seat-flap-repro.js --trace 20 60    # frame-by-frame
//   node test/tools/seat-flap-repro.js --assert         # control leg must seat
'use strict';
const H = require('../mesh/mesh-harness.js');
const { makeFabric, doTick, spawnOne, counts, seedRng } = H;

const STATE = ['0 join', '1 ask', '2 search', '3 SEATED'];

// ---------------------------------------------------------------------------
// A door that flaps: up for `up` ticks, down for `down` ticks, forever.
// `down: 0` is a perfect socket — the control leg.
//
// A frame is DOOR-BORNE when either end is unseated: that peer has no data
// channels, so mesh-wire has nowhere else to put it. Once both ends are seated
// they talk over the mesh and the door cannot touch them — which is why a
// guest who gets in STAYS in, and a guest who does not never starts.
//
// Both directions are gated, and gated at the RIGHT MOMENT: a send dies at the
// socket, but a reply dies on ARRIVAL — the socket that was up when you asked
// can be gone when the answer comes back. That second case is the common one
// on a real flapping link and the first cut of this file missed it.
// ---------------------------------------------------------------------------
function run({ up, down, ticks, trace, seed = 20260804, jitter = false, noResume = false }) {
  seedRng(seed);
  const env = makeFabric();

  // Two door models. PERIODIC (jitter=false) is the readable one --trace uses,
  // but it PHASE-LOCKS: entry retries fire on a fixed ~21-tick cadence, so a
  // fixed door period can land every reply at the same dead offset forever and
  // the row measures the phase geometry, not the mechanism (observed: 3up/6down
  // + 21 locks WHOHOME at phase 1, its HOME at phase 3-5, eaten every cycle for
  // 3000 ticks straight). Real flaps are not metronomes — so the MEASUREMENT
  // legs use JITTERED windows: each segment uniform in [0.5, 1.5)×its mean,
  // seeded, so runs stay reproducible while phase artifacts average out.
  let doorUp;
  if (down === 0) doorUp = () => true;
  else if (!jitter) { const period = up + down; doorUp = (t) => (t % period) < up; }
  else {
    let rs = (seed ^ 0x5f3759df) >>> 0;
    const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) & 0x7fffffff; return rs / 2147483648; };
    const seg = (mean) => Math.max(1, Math.round(mean * (0.5 + rnd())));
    const sched = []; let isUp = true;
    while (sched.length < ticks + 200) { const n = seg(isUp ? up : down); for (let i = 0; i < n; i++) sched.push(isUp); isUp = !isUp; }
    doorUp = (t) => sched[t] !== false; // beyond the schedule ⇒ up (never reached)
  }

  // Baseline arm for the A/B: same seed, same door, resume disabled — the
  // pre-fix entry dance, restart-from-knock on every failure.
  if (noResume) {
    const S = H.mesh.Seat.prototype;
    if (!S.__resumeOrig) S.__resumeOrig = S.resumeAsk;
    S.resumeAsk = function () { return false; };
  } else {
    const S = H.mesh.Seat.prototype;
    if (S.__resumeOrig) S.resumeAsk = S.__resumeOrig;
  }

  // Bring up the genesis greeter on a perfect door and let it settle.
  const greeter = spawnOne(env);
  for (let i = 0; i < 60; i++) doTick(env);
  if (!(greeter.hasCoord && greeter.state === 3)) {
    throw new Error('harness: greeter failed to mint genesis — fabric is wrong, not the product');
  }

  const stats = { sent: 0, dropped: 0, dropByType: {}, dropOnArrival: 0 };
  const events = [];
  const bump = (t) => { stats.dropByType[t] = (stats.dropByType[t] || 0) + 1; };
  const log = (t, s) => { if (trace) events.push([t, s]); };

  let victim = null; // set once the entrant exists
  const doorBorne = (from, to) => {
    if (victim === null) return false;
    if (from !== victim && to !== victim) return false;
    const sf = env.seats.get(from), st = env.seats.get(to);
    return !sf || !st || !sf.hasCoord || !st.hasCoord || sf.state !== 3 || st.state !== 3;
  };

  // ---- gate the SEND side -------------------------------------------------
  const rawSend = env.send.bind(env), rawKnock = env.knock.bind(env);
  env.send = (from, to, m) => {
    stats.sent++;
    if (doorBorne(from, to) && !doorUp(env.TICK)) {
      stats.dropped++; bump(m.t);
      log(env.TICK, `  x DOOR DOWN  ${String(from).slice(0, 6)}->${String(to).slice(0, 6)} ${m.t} DISCARDED (nosock)`);
      return;
    }
    log(env.TICK, `     ${String(from).slice(0, 6)}->${String(to).slice(0, 6)} ${m.t}`);
    rawSend(from, to, m);
  };
  env.knock = (id, key) => {
    stats.sent++;
    if (id === victim && !doorUp(env.TICK)) {
      stats.dropped++; bump('knock');
      log(env.TICK, `  x DOOR DOWN  ${String(id).slice(0, 6)} knock DISCARDED`);
      return;
    }
    log(env.TICK, `     ${String(id).slice(0, 6)} knock`);
    rawKnock(id, key);
  };

  // ---- gate the ARRIVAL side ----------------------------------------------
  // The harness delivers env.bus.get(TICK); drop the door-borne ones due while
  // the socket is down, before doTick sees them.
  function flapTick() {
    if (!doorUp(env.TICK)) {
      const q = env.bus.get(env.TICK);
      if (q && q.length) {
        const keep = [];
        for (const m of q) {
          const to = m.to, from = m.from;
          const isDoor = (to === victim || from === victim) &&
            (m.t === 'GREETERS' || doorBorne(from == null ? to : from, to));
          if (isDoor) {
            stats.dropped++; stats.dropOnArrival++; bump(m.t);
            log(env.TICK, `  x DOOR DOWN  reply ${m.t}->${String(to).slice(0, 6)} DISCARDED on arrival`);
          } else keep.push(m);
        }
        env.bus.set(env.TICK, keep);
      }
    }
    doTick(env);
  }

  // ---- admit the entrant --------------------------------------------------
  const entrant = spawnOne(env);
  victim = entrant.id;
  log(env.TICK, `entrant ${victim.slice(0, 6)} joins (door ${down === 0 ? 'perfect' : up + ' up / ' + down + ' down'})`);

  let last = -1, seatedAt = -1, strandedNoted = false;
  const start = env.TICK;
  while (env.TICK < start + ticks) {
    flapTick();
    if (entrant.state !== last) {
      log(env.TICK, `STATE ${last < 0 ? '-' : STATE[last]} -> ${STATE[entrant.state]}` +
        (entrant.hasCoord ? `  coord=${entrant.coord.pc}/${entrant.coord.r}.${entrant.coord.i}` : '  coord=NONE'));
      last = entrant.state;
    }
    if (entrant.stranded && !strandedNoted) { strandedNoted = true; log(env.TICK, `STRANDED (R6) — idles before re-knocking`); }
    if (entrant.hasCoord && entrant.state === 3) { seatedAt = env.TICK - start; if (!trace) break; }
  }

  return { seatedAt, stats, events, entrant, stranded: entrant.stranded };
}

// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const TICKS = 3000;

if (argv.includes('--trace')) {
  const i = argv.indexOf('--trace');
  const up = +argv[i + 1] || 20, down = +argv[i + 2] || 60;
  console.log(`\n=== TIMELINE — door ${up} up / ${down} down (${Math.round(100 * up / (up + down))}% up) ===\n`);
  const r = run({ up, down, ticks: 600, trace: true });
  for (const [t, s] of r.events) console.log(String(t).padStart(5) + '  ' + s);
  console.log(`\nseated: ${r.seatedAt >= 0 ? 'tick ' + r.seatedAt : 'NEVER'}`);
  console.log(`frames: ${r.stats.sent} sent, ${r.stats.dropped} eaten by the door (${r.stats.dropOnArrival} of them on arrival)`);
  console.log('dropped by type:', JSON.stringify(r.stats.dropByType));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// THE MEASUREMENT: same 33% uptime, shrinking window length, JITTERED windows
// (see the door-model note in run()), N seeds per row, and a PAIRED A/B —
// baseline = the pre-fix dance (resume disabled), fix = ENTRY RESUME
// (mesh.js resumeAsk: a retry that holds a registry-fresh greeter list
// re-enters at WHOHOME instead of re-knocking).
//
// The entry dance is three door round trips and the baseline keeps NO partial
// progress across a socket death, so its requirement is "one continuous
// up-window longer than the WHOLE dance"; resume's is "one round trip per
// window". Production ticks every 500ms (mesh-wire.js:99), so the window
// column is real wall-clock socket lifetime.
// ---------------------------------------------------------------------------
const TICK_MS = 500;
const secs = (t) => (t * TICK_MS / 1000).toFixed(1) + 's';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => 20260804 + k * 7919);

function arm(c, noResume) {
  const times = [];
  for (const seed of SEEDS) {
    const r = run({ ...c, ticks: TICKS, trace: false, jitter: c.down !== 0, seed, noResume });
    if (r.seatedAt >= 0) times.push(r.seatedAt);
  }
  times.sort((a, b) => a - b);
  const med = times.length ? times[times.length >> 1] : -1;
  return { n: times.length, med };
}

console.log('\n=== ENTRY RESUME A/B — same 33% uptime, shrinking socket windows ===');
console.log(`${SEEDS.length} jittered seeds per row, ${TICKS} ticks (${secs(TICKS)}) budget, paired arms.\n`);
console.log('  mean window   up-window    BASELINE seated    WITH RESUME seated');
console.log('  ' + '-'.repeat(66));

const ROWS = [
  { up: 1, down: 0, label: 'never down' },
  { up: 200, down: 400 },
  { up: 40, down: 80 },
  { up: 20, down: 40 },
  { up: 10, down: 20 },
  { up: 6, down: 12 },
  { up: 3, down: 6 },
];

let control = false, fixWins = true;
for (const c of ROWS) {
  const base = arm(c, true), fix = arm(c, false);
  const label = c.label || `${c.up}/${c.down}`;
  const show = (a) => `${a.n}/${SEEDS.length}` + (a.n ? ` med ${secs(a.med)}` : '        ');
  console.log('  ' + label.padEnd(14) + (c.down ? secs(c.up) : '-').padEnd(13) +
    show(base).padEnd(19) + show(fix));
  if (c.down === 0) control = fix.n === SEEDS.length;
  if (c.up === 6) fixWins = fix.n >= base.n;
}

console.log('\n--trace <up> <down> for a frame-by-frame periodic-door timeline.');

if (argv.includes('--assert')) {
  const ok = control && fixWins;
  console.log('\n' + (control ? 'PASS' : 'FAIL') + ' — control leg (perfect door) seats on every seed');
  console.log((fixWins ? 'PASS' : 'FAIL') + ' — resume seats at least as many 3s-window seeds as baseline');
  process.exit(ok ? 0 : 1);
}
