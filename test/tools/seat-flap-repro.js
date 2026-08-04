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
function run({ up, down, ticks, trace, seed = 20260804 }) {
  seedRng(seed);
  const env = makeFabric();

  const period = up + down;
  const doorUp = (t) => (down === 0 ? true : (t % period) < up);

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

console.log('\n=== SEATING vs DOOR STABILITY ===');
console.log('One seated greeter, one entrant. The entry dance is');
console.log('  knock -> GREETERS -> WHOHOME -> HOME -> FIND -> PLACE');
console.log('— three relay round trips, ALL of them over the door, because an');
console.log('unseated peer has no data channels to use instead.\n');
console.log('  door up/down     up%    seated at     sent    eaten    stalled at');
console.log('  ' + '-'.repeat(70));

const CASES = [
  { up: 1, down: 0 },
  { up: 400, down: 20 },
  { up: 200, down: 60 },
  { up: 100, down: 60 },
  { up: 60, down: 60 },
  { up: 30, down: 60 },
  { up: 20, down: 60 },
  { up: 10, down: 60 },
  { up: 5, down: 120 },
];

let control = false;
for (const c of CASES) {
  const r = run({ ...c, ticks: TICKS, trace: false });
  const pct = c.down === 0 ? 100 : Math.round(100 * c.up / (c.up + c.down));
  const label = c.down === 0 ? 'never down' : `${c.up}/${c.down}`;
  const seated = r.seatedAt >= 0 ? `tick ${r.seatedAt}` : 'NEVER';
  const stalled = r.seatedAt >= 0 ? '-' : STATE[r.entrant.state] + (r.stranded ? ' +STRANDED' : '');
  console.log('  ' + label.padEnd(15) + String(pct + '%').padEnd(7) + seated.padEnd(14) +
    String(r.stats.sent).padEnd(8) + String(r.stats.dropped).padEnd(9) + stalled);
  if (c.down === 0) control = r.seatedAt >= 0;
}

// ---------------------------------------------------------------------------
// THE DECISIVE LEG: hold the duty cycle FIXED and vary only the WINDOW LENGTH.
//
// The entry dance is three relay round trips (knock->GREETERS, WHOHOME->HOME,
// FIND->PLACE) and it keeps NO PARTIAL PROGRESS: a socket that dies mid-dance
// sends the entrant back to state 0 and the next attempt starts from nothing.
// So what should matter is not "what fraction of the time is the link up" but
// "is one continuous up-window longer than the whole dance". Same 33% uptime,
// chopped finer and finer:
// ---------------------------------------------------------------------------
console.log('\n=== SAME 33% UPTIME, DIFFERENT WINDOW LENGTHS ===');
console.log('If duty cycle were what mattered these would all behave alike.\n');
// Production drives one tick per `tickMs = opts.tickMs || 500` (mesh-wire.js:99),
// so a tick is HALF A SECOND and these windows are real wall-clock socket
// lifetimes — the column that turns this from a curve into a requirement.
const TICK_MS = 500;
const secs = (t) => (t * TICK_MS / 1000).toFixed(1) + 's';
console.log('  window (up/down)   up-window   up%    seated at        eaten   stalled at');
console.log('  ' + '-'.repeat(78));
for (const up of [200, 100, 40, 20, 10, 6, 3]) {
  const c = { up, down: up * 2 };
  const r = run({ ...c, ticks: TICKS, trace: false });
  const seated = r.seatedAt >= 0 ? `tick ${r.seatedAt} (${secs(r.seatedAt)})` : 'NEVER';
  const stalled = r.seatedAt >= 0 ? '-' : STATE[r.entrant.state] + (r.stranded ? ' +STRANDED' : '');
  console.log('  ' + `${up}/${up * 2}`.padEnd(19) + secs(up).padEnd(12) + '33%'.padEnd(7) +
    seated.padEnd(17) + String(r.stats.dropped).padEnd(8) + stalled);
}
console.log('\n  A tick is 500ms (mesh-wire.js:99). Same total uptime throughout — the only');
console.log('  variable is how long the socket stays up in one stretch.');

console.log('\n--trace <up> <down> for the frame-by-frame timeline.');

if (argv.includes('--assert')) {
  console.log('\n' + (control ? 'PASS' : 'FAIL') + ' — control leg (perfect door) seats the entrant');
  process.exit(control ? 0 : 1);
}
