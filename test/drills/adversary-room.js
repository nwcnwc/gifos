// adversary-room.js — CAN ONE BAD PARTICIPANT POISON A ROOM?
//
// The invariant under test, and it is a security property, not a nicety:
//
//   A participant that misbehaves — deliberately or because its device simply
//   cannot cope — must never prevent OTHER people from joining the meeting or
//   from continuing it.
//
// This is not hypothetical. A weak box in our own fleet (<orchestrator>) seats fine
// and then fails to complete its DataChannels once it runs out of headroom.
// That is an "unintentional adversary", and it is indistinguishable from a
// hostile one to everybody else in the room: from the outside both look like a
// seat that answers admission and then never wires up. If such a seat can wedge
// admission for everyone behind it, then any user on a phone with a bad network
// can take down a meeting by accident — and anyone malicious can do it on
// purpose, for free, with an unmodified client.
//
// The risk is concrete and structural. H7 gives every cell ONE designated
// admitter, so a newcomer's FIND is routed to a specific seat. If that seat is
// an adversary, admission for that cell runs through a participant that will
// not cooperate. The room must route around it.
//
// PROFILES (each an ordinary client, no patched build — that is the point; a
// real attacker does not need our source):
//   dark    __gifosBlockIce=['*'] — seats, then can never complete ANY P2P
//           connection. The <orchestrator> case, and the firewalled-user case.
//   mute    seats and then stops sending status entirely (frozen tab / asleep)
//   churn   joins and reloads repeatedly, thrashing occupancy
//
// Self-contained: spawns its OWN relay and static server for THIS checkout's
// site/, so it is safe from a worktree and never touches production.
//
// THE ICE-BLIND RENDERER (0.9.9 gate, 2026-08-16) — why the link checks probe
// before they judge. This drill went RED TWICE on the gate box with the same
// distinctive shape both runs: one of the three late joiners held its seat,
// ran its mesh at a healthy ~500ms tick, exchanged offers/answers by the
// hundred (SDP reached 'stable' on both ends) — and its renderer never minted
// ONE ICE candidate, on any pair, for three minutes, so no link through it
// could ever complete however many rebuilds the sweeper fired (7 were fired).
// Reproduced outside the gate on the same box while sampling it: MemAvailable
// pinned at 0 MB and load 17-24 on 6 cores for the whole run — and the SAME
// TREE on that same box, started 30 minutes later from load 0.9, was 13/13
// green, as it was twice on an 8-core box with 13 GB free. A box out of
// memory does not kill the renderer (casualty.js would refuse); it starves
// the WebRTC stack until the page is involuntarily DARK — indistinguishable
// at the app layer from this drill's own manufactured adversary, so the red
// it produces is TRUE of the room and MEANINGLESS about GifOS.
//
// So: when a link assertion is about to fail, every page involved is probed
// with a BARE RTCPeerConnection — no product code, no signaling, no room —
// asking only "can this renderer gather one host candidate". A page that
// cannot is a casualty of the box, and the suite REFUSES the verdict (exit 4,
// NO-VERDICT — casualty.js doctrine: a suite that could not MEASURE must not
// judge). A page that CAN gather leaves the red standing exactly as before —
// a product failure to wire a demonstrably ICE-capable page is precisely what
// this drill exists to catch, and the probe cannot mask it.
const { spawn } = require('child_process');
const path = require('path');
const { chromium, CHROME } = require('../lib/pw');
const casualty = require('../lib/casualty');


const RELAY_PORT = parseInt(process.env.ADV_RELAY_PORT || '8821', 10);
const SITE_PORT = parseInt(process.env.ADV_SITE_PORT || '8823', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const SEAT_MS = 45000;    // a healthy joiner must seat within this, adversaries present
const LINK_MS = 30000;    // ...and wire to its healthy neighbours within this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};

(async () => {
  // The box, measured before a single process is spawned — the number to read
  // FIRST on any red (casualty.js: MemAvailable, never swap). And a box that
  // cannot HOLD this room does not get to judge it: 11 pages at the shared
  // MEM_PER_BROWSER_MB constant is the room's footprint, and a box short of it
  // runs the whole drill from swap — where message latency stretches to
  // seconds, pair formation renegotiates faster than its own round trip, and
  // the reds that come out are true of the kernel and meaningless about GifOS
  // (0.9.9 gate: RED TWICE at MemAvailable 0 MB / load 17-35 on 6 cores; the
  // same tree 13/13 on the same box started roomy, and 13/13 twice more on an
  // 8-core box under the gate's exact chromium build). Refusing is fleet.js
  // doctrine, exit 3: never retried, never a product red, and it still BLOCKS
  // a cut until the drill is run somewhere honest — same as e2e-anyroad-mp,
  // which 0.9.8 satisfied by running on the fleet and recording it in the cut.
  {
    const m = casualty.memLocal();
    const need = 11 * casualty.MEM_PER_BROWSER_MB;
    console.log('box: ' + casualty.capacityLine('local', 11, m));
    if (m.availMb != null && m.availMb < need) {
      console.log('NEEDS-FLEET — this drill needs a box that can hold 11 browsers ('
        + m.availMb + ' MB available, need ~' + need + '); this box would measure the kernel, not the room.');
      process.exit(3);
    }
  }
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_DEV: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  // A relay that dies mid-run voids everything after it (measured 2026-08-16:
  // an unbracketed pkill from ANOTHER session killed this drill's relay
  // between phases and the rest of the run read as fragment-founding carnage).
  // Say so loudly; without this line that run is indistinguishable from a
  // product disaster.
  let runEnding = false;
  relay.on('exit', (code, sig) => { if (!runEnding) console.log('!! THE DRILL\'S OWN RELAY DIED (code=' + code + ' sig=' + sig + ') — every verdict after this line is VOID'); });
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });
  const room = 'adv' + Math.random().toString(36).slice(2, 10);
  const url = BASE + '/run.html#v=' + room + '&relay=' + encodeURIComponent(RELAY) + '&DEBUG=on';

  // profile: null = healthy; 'dark' = can never complete a P2P connection
  const users = [];
  const newUser = async (name, profile) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content:
      (profile === 'dark' ? "window.__gifosBlockIce=['*'];" : '')
      + "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "');"
      + "localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    await page.goto(url).catch(() => {});
    const u = { name, profile: profile || 'healthy', ctx, page };
    users.push(u);
    return u;
  };

  const dump = async (u) => u.page.evaluate(() => {
    const g = (f, d) => { try { return f(); } catch (e) { return d; } };
    const d = g(() => window.__gifosVideo.debugDump(), null);
    if (!d) return null;
    const conn = new Set();
    for (const r of (d.roster || [])) if (r.conn) conn.add(r.peer);
    const named = g(() => window.__gifosVideo.meshLinks().map((p) => String(p).slice(0, 12)), []);
    return { coord: d.me.coord, peer: String(d.me.peer).slice(0, 12),
             named, linked: named.filter((p) => conn.has(p)),
             // split-room forensics: who I can SEE, who I am actually CONNECTED
             // to, and what I believe the room's population and layout are.
             roster: (d.roster || []).map((r) => ({ peer: String(r.peer).slice(0, 12), conn: !!r.conn })),
             pop: d.participants, occ: d.me.occ, dups: d.dups || [] };
  }).catch(() => null);

  const waitSeat = async (u, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const d = await dump(u); if (d && d.coord) return d; await sleep(1000); }
    return await dump(u);
  };
  // A healthy user only owes links to its HEALTHY named neighbours; a dark peer
  // is unreachable by construction and must not count against it.
  const waitLinks = async (u, darkIds, ms) => {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < ms) {
      const d = await dump(u); last = d;
      if (d && d.coord) {
        const want = d.named.filter((p) => !darkIds.has(p));
        if (want.length && want.every((p) => d.linked.includes(p))) return { ok: true, d, want };
        if (!want.length) return { ok: true, d, want };   // nothing healthy adjacent yet
      }
      await sleep(1500);
    }
    return { ok: false, d: last, want: last ? last.named.filter((p) => !darkIds.has(p)) : [] };
  };

  // ---- the ICE-blind probe (see the header) --------------------------------
  // bareIce: can this page's RENDERER mint one host candidate with a bare
  // RTCPeerConnection — no product code, no signaling, no room? 5s is generous
  // (loopback host candidates arrive in milliseconds on a live stack); the
  // outer 15s race covers a page too starved to run the evaluate at all.
  const bareIce = async (u) => {
    const r = await Promise.race([
      u.page.evaluate(async () => {
        try {
          const pc = new RTCPeerConnection();
          pc.createDataChannel('probe');
          let n = 0;
          pc.onicecandidate = (e) => { if (e.candidate) n++; };
          await pc.setLocalDescription(await pc.createOffer());
          await new Promise((res) => setTimeout(res, 5000));
          const out = { candidates: n, gathering: pc.iceGatheringState };
          pc.close();
          return out;
        } catch (e) { return { err: String(e).slice(0, 100) }; }
      }).catch((e) => ({ err: 'evaluate: ' + String(e && e.message || e).slice(0, 80) })),
      sleep(15000).then(() => ({ err: 'probe timeout (15s) — page too starved to run it' })),
    ]);
    console.log('  BARE-ICE ' + u.name + ' ' + JSON.stringify(r));
    return r;
  };
  // linkFailProbe: a link assertion is about to fail — probe the page it is
  // about to fail FOR and the owner of every wanted-but-unlinked peer id (the
  // blind renderer is as often the TARGET as the checker: both gate runs, the
  // stranded page was named in two other users' want lists). Returns the
  // ICE-blind offenders; empty means every renderer could gather, so the red
  // is a real product claim and must stand.
  const linkFailProbe = async (u, want, linked) => {
    const owners = new Map();
    for (const x of users) { const d = await dump(x); if (d && d.peer) owners.set(d.peer, x); }
    const pages = [u];
    for (const pfx of want) { const o = owners.get(pfx); if (o && !linked.includes(pfx) && !pages.includes(o)) pages.push(o); }
    const blind = [];
    for (const q of pages) {
      const res = await bareIce(q);
      if (res.err || !res.candidates) blind.push(q.name + ' ' + JSON.stringify(res));
    }
    return blind;
  };
  const refuseIceBlind = (blind) => {
    runEnding = true;
    console.log('');
    console.log('NO VERDICT — a RENDERER THIS SUITE WAS DRIVING IS ICE-BLIND, so a link check here cannot be a claim about GifOS.');
    console.log('');
    console.log('  CASUALTY: a renderer\'s WebRTC stack stopped minting ICE candidates — a bare RTCPeerConnection (zero product code) gathered none: ' + blind.join('; '));
    console.log('  THE BOX:  ' + casualty.capacityLine('local', users.length, casualty.memLocal()));
    console.log('');
    console.log('  A page in this state is involuntarily DARK: SDP still flows, the mesh');
    console.log('  still ticks, and no link through it can ever complete — measured on the');
    console.log('  0.9.9 gate box at MemAvailable 0 MB, load 17-24 on 6 cores: hundreds of');
    console.log('  offers/answers reached stable, seven sweeper rebuilds fired, zero');
    console.log('  candidates in three minutes. The identical tree was 13/13 on the same');
    console.log('  box started idle, and 13/13 twice on a box with headroom. Publishing');
    console.log('  this as RED reads as a security defect in the room; it is the kernel.');
    console.log('');
    console.log('  NOT retried (the box does not get roomier), and it BLOCKS a cut: run');
    console.log('  this drill on a box that can hold ' + users.length + ' browsers (casualty.js doctrine).');
    console.log('  If the probe shows candidates on every page and links still fail,');
    console.log('  there is no refusal — that red is real. Do not widen this probe.');
    console.log('');
    console.log('NO-VERDICT — the link claims were unmeasurable here, on purpose.');
    try { browser.close(); } catch (e) {}
    cleanup();
    process.exit(4);
  };

  console.log('room: ' + url);

  // ── Phase 1: a healthy room forms ────────────────────────────────────────
  for (let i = 0; i < 4; i++) { await newUser('good' + i, null); await sleep(2500); }
  const early = [];
  for (const u of users) early.push(await waitSeat(u, SEAT_MS));
  check('4 healthy users seat', early.every((d) => d && d.coord), early.map((d) => (d && d.coord) || 'UNSEATED').join(' '));

  // ── Phase 2: the adversaries arrive and take seats ───────────────────────
  const dark = [];
  for (let i = 0; i < 3; i++) { dark.push(await newUser('DARK' + i, 'dark')); await sleep(2500); }
  const darkDumps = [];
  for (const u of dark) darkDumps.push(await waitSeat(u, SEAT_MS));
  const darkIds = new Set(darkDumps.filter(Boolean).map((d) => d.peer));
  check('the adversaries are actually IN the room (seated, holding coords)',
    darkDumps.filter((d) => d && d.coord).length >= 2,
    darkDumps.map((d) => (d && d.coord) || 'unseated').join(' '));
  check('the adversaries are genuinely dark (no completed links of their own)',
    darkDumps.filter(Boolean).every((d) => d.linked.length === 0),
    darkDumps.filter(Boolean).map((d) => d.coord + ':linked=' + d.linked.length).join(' '));

  // ── Phase 3: THE TEST. Healthy people arrive AFTER the adversaries ───────
  const late = [];
  for (let i = 0; i < 3; i++) { late.push(await newUser('late' + i, null)); await sleep(2500); }
  const lateSeat = [];
  for (const u of late) lateSeat.push(await waitSeat(u, SEAT_MS));
  check('HEALTHY joiners can still SEAT with adversaries in the room',
    lateSeat.every((d) => d && d.coord),
    lateSeat.map((d) => (d && d.coord) || 'UNSEATED').join(' '));

  for (let i = 0; i < late.length; i++) {
    const r = await waitLinks(late[i], darkIds, LINK_MS);
    if (!r.ok) { // about to fail: is every renderer involved even CAPABLE of a link? (header)
      const blind = await linkFailProbe(late[i], r.want, r.d ? r.d.linked : []);
      if (blind.length) refuseIceBlind(blind);
    }
    check('late' + i + ' wired to every HEALTHY neighbour it names',
      r.ok, r.d ? (r.d.coord + ' want=[' + r.want.join(',') + '] linked=[' + r.d.linked.join(',') + ']') : 'no dump');
  }

  // ── Phase 4: the meeting CONTINUES for the people already in it ──────────
  const stillOk = [];
  for (const u of users.filter((x) => x.profile === 'healthy')) {
    const r = await waitLinks(u, darkIds, 8000);
    if (!r.ok) { // same probe-before-judging as Phase 3
      const blind = await linkFailProbe(u, r.want, r.d ? r.d.linked : []);
      if (blind.length) refuseIceBlind(blind);
    }
    stillOk.push({ n: u.name, ok: r.ok, coord: r.d && r.d.coord });
  }
  check('every healthy participant still holds its healthy links (meeting continues)',
    stillOk.every((s) => s.ok && s.coord),
    stillOk.map((s) => s.n + (s.ok ? '' : ':BROKEN')).join(' '));

  // ── Phase 5: the room is still ADMITTING after all of that ───────────────
  const final = await newUser('final', null);
  const fd = await waitSeat(final, SEAT_MS);
  check('the room still admits a brand-new joiner at the end', !!(fd && fd.coord), (fd && fd.coord) || 'UNSEATED');

  // ── Phase 6: ONE room, not several ───────────────────────────────────────
  // Everything above can pass while the room has quietly SPLIT: each fragment
  // is internally consistent and happily wires itself up, so link-completeness
  // checks are blind to it. Two tells, both cheap. Distinct coords: N seated
  // participants must hold N different cells, and a repeat means two people
  // believe they own the same seat. And a shared view: every seat should see a
  // comparable population — a fragment sees only its own.
  const finalAll = [];
  for (const u of users) { const d = await dump(u); if (d && d.coord) finalAll.push({ n: u.name, c: d.coord, p: d.peer, d }); }
  const byCoord = new Map();
  for (const f of finalAll) byCoord.set(f.c, (byCoord.get(f.c) || []).concat(f.n));
  const clashes = [...byCoord.entries()].filter(([, who]) => who.length > 1);

  // CLASSIFY every clash, because two of the three kinds are not bugs.
  //
  //   PARTITIONED  one holder is cut off from the room entirely (no completed
  //                links at all). With the relay fallback gone, a client that
  //                cannot open DataChannels IS partitioned by definition; the
  //                room evicts it and heals the cell while it goes on believing
  //                it holds the coord. Accepted: split-brain allowed,
  //                detection-only. The sim reproduces exactly this.
  //   PAIR-DARK    both holders are healthily wired into the room, but have no
  //                channel to EACH OTHER. Two live fragments, each internally
  //                consistent. This is the reunion question, not a seating bug.
  //   REACHABLE    the two holders are connected to each other, or some THIRD
  //                participant is connected to both, and the cell is still
  //                doubled. That is a genuine fault. The yield law (mesh.js E2)
  //                needs one FIRST-HAND-LIVE witness of both claimants to break
  //                the tie — so wherever such a witness exists, the duplicate
  //                had a resolver and survived anyway.
  const classify = (whoNames) => {
    const hs = whoNames.map((n) => finalAll.find((f) => f.n === n)).filter(Boolean);
    const seesConn = (a, b) => !!(a.d.roster.find((r) => r.peer === b.p && r.conn));
    const parts = [];
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const a = hs[i], b = hs[j];
      const ab = seesConn(a, b), ba = seesConn(b, a);
      // a common first-hand witness: anyone (either holder included) connected
      // to BOTH of them is the peer E2 expects to emit the YIELD.
      const witnesses = finalAll.filter((w) => w.p !== a.p && w.p !== b.p && seesConn(w, a) && seesConn(w, b)).map((w) => w.n);
      const direct = ab || ba;
      const kind = (direct || witnesses.length) ? 'REACHABLE'
        : (a.d.linked.length === 0 || b.d.linked.length === 0) ? 'PARTITIONED' : 'PAIR-DARK';
      parts.push({ kind, a: a.n, b: b.n,
        detail: a.n + '(links=' + a.d.linked.length + ',pop=' + a.d.pop + ',occ=' + a.d.occ + ')'
              + (direct ? ' -conn- ' : ' -x- ') + b.n + '(links=' + b.d.linked.length + ',pop=' + b.d.pop + ',occ=' + b.d.occ + ')'
              + (witnesses.length ? ' witness=[' + witnesses.join(',') + ']' : ' no-common-witness') });
    }
    return { parts };
  };
  let reachableDups = 0;
  for (const [c, who] of clashes) {
    const { parts } = classify(who);
    for (const p of parts) {
      if (p.kind === 'REACHABLE') reachableDups++;
      console.log('  CLASH ' + c + '  ' + p.kind + '  ' + p.detail);
    }
  }
  check('every seated participant holds a DISTINCT coord (no split-brain)',
    clashes.length === 0,
    clashes.length ? clashes.map(([c, who]) => c + '<-' + who.join('+')).join(' ')
                   : finalAll.length + ' seats, all distinct');
  // The gating property, separate from the report above: a duplicate between two
  // peers that can talk to each other is never acceptable.
  check('no two MUTUALLY REACHABLE peers share a cell',
    reachableDups === 0, reachableDups + ' reachable duplicate pair(s)');
  // WAIT FOR THE VIEW TO CONVERGE, then judge it. This was sampled ONCE,
  // moments after Phase 5 seated a brand-new joiner — and room population
  // rides gossip, which reaches that joiner over the links it is still
  // building. The outlier was therefore the FINAL joiner every time, still
  // catching up: measured on the 8-core gate box, counts=…,10,10,10,3 with
  // the low value always last, and at the PRE-EXISTING baseline (19b023e,
  // before any 0.9.0 mesh work) the same shape failed 3 runs in 5. It is a
  // sampling race, not a split: the dark adversaries — the pages that
  // genuinely cannot complete P2P — were reporting 10-11 all along.
  // Polling to convergence keeps the assertion exactly as strict (spread ≤ 2
  // across EVERY page, adversaries included) and stops it firing before the
  // room has had a chance to be one room. A real split never converges, so
  // it still fails, just at the end of the window instead of the start.
  const pollPops = async () => {
    const out = [];
    for (const u of users) {
      const p = await u.page.evaluate(() => { try { return window.__gifosVideo.debugDump().participants; } catch (e) { return -1; } }).catch(() => -1);
      if (p > 0) out.push(p);
    }
    return out;
  };
  let pops = [], spread = 99;
  const popT0 = Date.now();
  while (Date.now() - popT0 < 45000) {
    pops = await pollPops();
    spread = pops.length ? Math.max(...pops) - Math.min(...pops) : 99;
    if (spread <= 2) break;
    await sleep(3000);
  }
  check('all participants see ONE room (population agrees within 2)', spread <= 2,
    'counts=' + pops.join(',') + ' after ' + Math.round((Date.now() - popT0) / 1000) + 's');

  // ── TICK RATE: the greeter pool's margin is thin, so measure it ──────────
  // A Section-1 seat holds its place in the greeter registry by re-knocking
  // every E3_PERIOD = 200 + rand(200) ticks; the relay expires an entry after
  // GREETER_TTL_MS = 250s. At the canonical 500ms tick that is 100–200s of
  // re-knock against a 250s TTL — a margin of as little as 50s. Browser timers
  // throttle under load and in background contexts, and a tick that stretches
  // past ~625ms puts the worst case OVER the TTL, emptying the pool.
  //
  // That does NOT by itself split a room — `test/mesh/greeter-expiry.js` runs a
  // pool that is empty almost all the time and newcomers still join the
  // existing meeting, because an expired pool reports NOT founded and the
  // joiner waits on the mint gap rather than taking over. But a tick rate far
  // off 500ms slows every timed law in the mesh — heal windows, ring holds,
  // retries — so it is still the first number to look at when a browser run
  // disagrees with the sim, and it is nearly free to collect.
  const rate = [];
  for (const u of users) {
    const t0 = Date.now();
    const a = await u.page.evaluate(() => { try { return window.__gifosVideo.meshState().tick; } catch (e) { return null; } }).catch(() => null);
    if (a == null) { rate.push(u.name + ':?'); continue; }
    await sleep(5000);
    const b = await u.page.evaluate(() => { try { return window.__gifosVideo.meshState().tick; } catch (e) { return null; } }).catch(() => null);
    const ms = b == null ? null : (Date.now() - t0) / (b - a);
    rate.push(u.name + ':' + (ms == null ? '?' : Math.round(ms) + 'ms/tick'));
  }
  console.log('tick rate (canonical 500ms; >625ms can expire the greeter pool): ' + rate.join(' '));

  // ── GREETER-LIST forensics (fragment founding) ───────────────────────────
  // R3/R6 take-over mints a second 0/0.0 room only when onGreeters sees
  // empty list AND founded:true. greeter-expiry.js disproved pool-TTL alone.
  // Dump every user's recent greeters outcomes so a fragment run shows
  // whether late joiners got empty+founded, sealed-only (R6), mint-gap hold,
  // or a normal deliver. action FOUND-EMPTY is the smoking gun.
  console.log('greeterTrace (listLen open founded action) — late/final first:');
  console.log('  actions: deliver | hold-mint-gap | locked | MINT (empty+founded while joining)');
  console.log('           empty-founded-noop (empty+founded already seated — mesh ignores)');
  const order = users.slice().sort((a, b) => {
    const rank = (n) => n.startsWith('late') || n === 'final' ? 0 : n.startsWith('DARK') ? 2 : 1;
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
  let mintByNonFounder = 0;
  for (const u of order) {
    const tr = await u.page.evaluate(() => {
      try { return window.__gifosVideo.greeterTrace(); } catch (e) { return null; }
    }).catch(() => null);
    if (!tr || !tr.length) { console.log('  ' + u.name + ': (no greeter events)'); continue; }
    const mint = tr.filter((e) => e.action === 'MINT').length;
    const hold = tr.filter((e) => e.action === 'hold-mint-gap').length;
    const locked = tr.filter((e) => e.action === 'locked').length;
    const deliver = tr.filter((e) => e.action === 'deliver').length;
    const emptyNoop = tr.filter((e) => e.action === 'empty-founded-noop').length;
    if (mint && u.name !== 'good0') mintByNonFounder += mint;
    const last = tr[tr.length - 1];
    console.log('  ' + u.name + ': n=' + tr.length
      + ' deliver=' + deliver + ' hold=' + hold + ' locked=' + locked
      + ' MINT=' + mint + ' emptyNoop=' + emptyNoop
      + ' last={list=' + last.listLen + ' open=' + last.open + ' founded=' + last.founded
      + ' action=' + last.action + ' preState=' + last.state + '}');
    // Full trail for anyone who MINT'd, or for late/final joiners
    if (mint || emptyNoop || u.name.startsWith('late') || u.name === 'final') {
      for (const e of tr) {
        console.log('    t+' + e.tick + ' list=' + e.listLen + ' open=' + e.open
          + ' founded=' + e.founded + ' action=' + e.action
          + ' pre=' + e.state + (e.post != null ? ' post=' + e.post : ''));
      }
    }
  }
  // A non-founder MINT is the fragment-founding smoking gun (second 0/0.0).
  check('no non-founder greeter MINT (no fragment founding via empty+founded)',
    mintByNonFounder === 0, mintByNonFounder + ' non-founder MINT event(s)');

  // On a REAL red (every renderer probed ICE-capable, so the refusal above did
  // not fire), record whether the missing links EVER formed — 'healed after
  // the window' and 'never healed' are different hunts, and the gate log is
  // the only place a reader will look.
  if (failures) {
    for (let i = 0; i < late.length; i++) {
      const r = await waitLinks(late[i], darkIds, 4000);
      console.log('late' + i + ' at end of run: ' + (r.ok ? 'wired' : 'STILL MISSING')
        + (r.d ? '  want=[' + r.want.join(',') + '] linked=[' + r.d.linked.join(',') + ']' : ''));
    }
  }

  console.log('\nadversaries: ' + [...darkIds].join(' ') + '  (profile: dark / cannot complete P2P)');
  runEnding = true;
  await browser.close(); cleanup();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS — a misbehaving participant cannot poison the room');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(2); });
