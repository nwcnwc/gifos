// e2e-pipe-mesh.js — ENCODED PASSTHROUGH IN A REAL ROOM (roadmap §9a), and it
// REFUSES TO JUDGE ON ONE BOX.
//
// This is legs 2 and 3 of the old e2e-pipe.js. That file keeps the half that
// one machine can honestly answer — the module chain and the one-tap fan-out,
// deterministic, no room, no relay — and this file takes the half that needs a
// ROOM: six seats at C=2 (a genuinely deep tree), every seat rendering a live
// Stadium, the staged flood riding hot pipes, and leg 3's freeze detector.
//
// WHY THE SPLIT, AND WHY THE FLEET (measured 2026-08-17).
//
// The mesh half was the release gate's only FLAKY suite: red on the first run,
// green on the immediate retry with all 23 assertions. The two first-run
// failures were "every seat renders a live Stadium" ([t,t,t,f,t,f] — BOTH seats
// of the one deep row) and a transcode fallback at the seat one hop above them.
// Both name the same thing: the deepest branch of the tree had not finished
// coming up. The gate's FLAKY line suggests "fix the wait", which is a guess the
// gate is not in a position to make.
//
// It was not the wait. On an IDLE 8-CORE BOX the same suite, unchanged, ran
// GREEN 8 times out of 8 with every seat's Stadium live in the low seconds
// against a 90s budget — nowhere near the timeout that would have to be widened.
// The gate box has SIX cores and was running six Chromiums with real media plus
// the relay on them. That is CLAUDE.md's "one box cannot tell a bug from a busy
// kernel", and this repo has already paid to learn it twice in this exact
// topology:
//
//   * e2e-mosaic (same six-seat C=2 room) had its Stadium budget widened to
//     120s after the identical failure, and the note it carries says the
//     shortfall was VERIFIED as intra-box contention by rebuilding the same
//     topology across THREE DEVICES, two clients each, where it did not happen.
//   * e2e-anyroad-mp's steering block was "fixed" three times by tuning waits
//     and failed differently each week, until test/lib/fleet.js was written to
//     stop suites of this shape from producing verdicts about a kernel.
//
// So this file states the requirement instead of tuning around it. TWO isolated
// machines is the declared floor and it spreads six seats over up to THREE when
// the fleet has them: no box is ever asked to carry more than 3 seats, against
// the 6 it was carrying on the gate box. Two is the floor rather than three
// because a declaration that cannot be satisfied is worse than the flake — the
// fleet here is three usable hosts and one of them is often the box running the
// gate, so needFleet(3) would refuse routinely and block cuts for a reason that
// has nothing to do with the product.
//
// WHAT THIS ROOM COSTS TO BUILD, measured so the next person does not have to
// guess at a budget (2026-08-18, 10 fleet runs, 59 seat observations, two
// isolated boxes, 3 seats each, both verified idle):
//
//   time from the live-check starting to a seat's Stadium going live
//     min 6 ms   median 136 ms   p90 2.27 s   max 4.66 s
//
// Section-0 seats land in the tens of milliseconds; the seconds-long tail is
// always the DEEP seats, which is the tree doing its job rather than a fault.
// Seating itself (all six holding a coord, one of them deep) runs 23-26 s
// before any of that starts.
//
// AND ONE OUTLIER THAT MATTERS MORE THAN THE DISTRIBUTION: a seat was once
// observed still WIRING at 26 s — no live link, no data channel, occ 2 against
// the room's 4-6 — while every other seat already carried it in roster and
// status. It finished and went live about 30 s in. It is SLOW, not broken, and
// nothing here treats it as a defect; but a room can take half a minute to
// wire on idle hardware, and any waiter written against this suite has to
// survive that. It is exactly what a 25 s stillness window got wrong once.
//
// ONE FAILURE IS STILL UNEXPLAINED, recorded here rather than quietly dropped:
// a run on 2026-08-17 (old 25 s waiter, before the recovery probe existed) had
// P4 @1/1.1 dark with claims:[] and ann:[]. That is the SAME observable
// signature as the wiring case above — a row-mate at x/1.1, no claim, no
// announce — so the most likely reading is that it was the same false red. It
// cannot be shown either way: that dump predates the link counters, so whether
// it held a data channel is simply not known, and nothing asked whether it
// recovered. Unexplained, probably benign, unproven. Let the probe classify the
// next one rather than re-arguing this one.
//
// A HARNESS THAT CANNOT SEE THE LINE IT IS LOOKING FOR REPORTS "NEVER FIRED"
// WITH TOTAL CONFIDENCE. This file passes DEBUG=on, so run.html's clog() is
// live and every rebuild/heal/glare site writes to it — and for its whole life
// this suite listened only for `pageerror` and threw all of it away. It was
// asked, on 2026-08-18, whether a new glare-yield repair was firing; with no
// console listener the honest answer available to it would have been a
// confident, wrong "no". Seats' clog lines are captured now, and the count is
// printed on GREEN runs too, because a room that goes green without ever
// yielding is not evidence that yielding fixed anything. Same failure shape as
// a guard that asserts the easy half and stays green while the feature is dead.
//
// Needs, ON THE ORCHESTRATOR (which runs NO browsers): the static site on 8099
// and test/servers/relay-local.js on 8790, both bound 0.0.0.0 — the fleet's
// browsers load over the tailnet, never loopback. Addresses come from the same
// local hosts file the behaviour battery uses (~/.gifos-behavior-hosts.json).
//
// ENGINE: the lane is built on RTCRtpScriptTransform, which Chrome 140 does not
// have at all. Every fleet box is asked, up front, and a box that cannot host
// the feature is a fleet shortfall (NEEDS-FLEET), never a product red — under
// the old gate pin every assertion here failed on `unsupported:true` and
// reported the browser's age as a defect, which cost a triage already.
const needFleet = require('../lib/fleet');
const { openFleet, closeFleet } = require('../lib/fleet-browsers');
const need = require('../lib/need');

const FLEETCFG = needFleet.load() || {};
const BASE = process.env.BASE || FLEETCFG.base || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || FLEETCFG.relay || 'ws://127.0.0.1:8790';
const N = 6;
const MAX_BOXES = 3;          // 6 seats / 3 boxes = 2 each; 2 boxes = 3 each
const MAX_PER_BOX = 3;        // the promise: never the 6-on-one-box the gate ran
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // A dead stack looks exactly like a broken mesh from here, and the fleet's
  // browsers reach it over the network — so check it THERE, not on loopback.
  await need({ 8099: 'a static server on 8099 (python3 -m http.server 8099 -d site)', 8790: 'relay-local (RELAY_HOST=0.0.0.0)' },
    new URL(BASE).hostname);

  const fleet = await needFleet(2, {
    why: 'six seats in one C=2 room, each with a real encoder — on the 6-core gate box the deepest branch of the tree did not finish coming up inside 90s, while the same suite went 8/8 green on an idle 8-core box. That difference is the kernel, not the pipe lane.',
    roles: ['box 1 — 2 or 3 of the 6 seats', 'box 2 — 2 or 3 of the 6 seats'
      + ' (a THIRD box is used automatically when the fleet has one: 2 seats each)'],
    // Default 0 keeps fleet.js's fast, honest refusal on a box that has no
    // fleet at all — a gate host must not spend minutes discovering that. A BOX
    // WE JUST FINISHED WITH IS NOT A BOX WE DO NOT HAVE, though, so when this
    // runs behind another fleet suite whose heat is still decaying, give it
    // FLEET_WAIT_MS=300000 rather than reading "given 0" as a shortage.
    waitMs: 0,
  });
  // PLACEMENT IS WEIGHTED, because the hosts file already states how much work
  // each box should carry and ignoring it is how an ARM Pi ends up holding the
  // same share as a laptop — which is the contention this suite left one box to
  // escape, just moved onto the smallest machine. Largest-remainder over the
  // declared weights (the behaviour battery's own idiom: "placement is a
  // weighted round-robin"), and a box allotted no seats is dropped rather than
  // handed a browser server nobody connects to.
  //
  // AND IT IS CAPPED, because weight alone is not a safe rule: a fleet declared
  // 3-and-1 allots FIVE of the six seats to one box, which is the crowding this
  // file exists to escape, merely re-derived from the config. MAX_PER_BOX is the
  // promise the header makes and the `why` above sends to whoever reads a
  // refusal, so it is enforced here rather than hoped for.
  const alloc = (hs, n) => {
    const w = hs.map((h) => (h.weight == null ? 1 : h.weight));
    const tot = w.reduce((a, b) => a + b, 0) || hs.length;
    const raw = w.map((x) => (x / tot) * n);
    const seats = raw.map(Math.floor);
    const rem = raw.map((x, i) => ({ f: x - seats[i], i })).sort((a, b) => b.f - a.f);
    let left = n - seats.reduce((a, b) => a + b, 0);
    for (let k = 0; left > 0; k = (k + 1) % rem.length) { seats[rem[k].i]++; left--; }
    let over = 0;
    for (let i = 0; i < seats.length; i++) if (seats[i] > MAX_PER_BOX) { over += seats[i] - MAX_PER_BOX; seats[i] = MAX_PER_BOX; }
    while (over > 0 && seats.some((s) => s < MAX_PER_BOX)) {
      for (let k = 0; k < seats.length && over > 0; k++) if (seats[k] < MAX_PER_BOX) { seats[k]++; over--; }
    }
    return seats;
  };
  let hosts = fleet.hosts.slice(0, MAX_BOXES);
  let seatsPer = alloc(hosts, N);
  if (seatsPer.some((s) => s === 0)) {
    hosts = hosts.filter((h, i) => seatsPer[i] > 0);
    seatsPer = alloc(hosts, N);
  }
  // Deal the seats ROUND-ROBIN within that allocation: six joins 1.2s apart all
  // landing on one box first is a different room from six spread across the
  // fleet, and seating is a race that reads join order.
  const owner = [];
  {
    const left = seatsPer.slice();
    let b = 0;
    for (let i = 0; i < N; i++) {
      let guard = 0;
      while (left[b] === 0 && guard++ <= hosts.length) b = (b + 1) % hosts.length;
      owner.push(b); left[b]--; b = (b + 1) % hosts.length;
    }
  }
  const LAUNCH_ARGS = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    // Six seats over 2-3 boxes means several tabs per box and only one of them
    // is ever in front. Chromium throttles a backgrounded tab's timers, and
    // every seat here runs a packer canvas and an encoder off exactly those
    // timers — a throttled seat is a dark Stadium that looks like a dead pipe.
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'];
  const boxes = await openFleet(hosts, { args: LAUNCH_ARGS, origin: BASE });
  const seatBox = (i) => boxes[owner[i]];
  console.log('  FLEET: ' + N + ' seats over ' + boxes.length + ' boxes — '
    + boxes.map((b, bi) => (b.host.name || b.host.ssh) + '×' + seatsPer[bi]
      + ' [' + owner.map((o, i) => (o === bi ? 'P' + i : null)).filter(Boolean).join(' ') + ']').join(', '));

  // EVERY BOX MUST BE ABLE TO HOST THE LANE. One old engine in the fleet does
  // not make a product red; it makes this an unanswerable question, and the
  // suite says so in the one vocabulary the gate reads as "not judged".
  //
  // AND WHAT VIDEO CODECS IT HAS, which is not the same question and turned out
  // to matter more. A Playwright chromium is VP8-only; a REAL Google Chrome
  // ships H264 — and this fleet runs both (nvidia-laptop's hosts entry points
  // at /opt/google/chrome/chrome). Measured on the first mixed run: two
  // real-Chrome seats negotiated an H264 CARRIER between themselves while the
  // content being forwarded was VP8 from an upstream chromium, so the lane
  // detected the mismatch and fell back to transcode — correctly. That is the
  // regime run.html's failback comment describes and one box can never produce
  // it. So the room's codec spread is MEASURED here and the mismatch assertion
  // below is conditioned on it, rather than on the old file's assumption that
  // the box was VP8-only.
  const engines = [];
  let codecHomogeneous = true;
  {
    const bad = [];
    for (const b of boxes) {
      const p = await (await b.browser.newContext()).newPage();
      const cap = await p.evaluate(() => ({
        ua: (navigator.userAgent.match(/Chrome\/[0-9.]+/) || ['?'])[0],
        scriptTransform: typeof RTCRtpScriptTransform !== 'undefined',
        codecs: (() => {
          try {
            return (RTCRtpSender.getCapabilities('video').codecs || [])
              .map((c) => String(c.mimeType).replace('video/', ''))
              .filter((m, i, a) => a.indexOf(m) === i).sort();
          } catch (e) { return []; }
        })(),
      })).catch(() => ({ ua: '?', scriptTransform: false, codecs: [] }));
      const h264 = cap.codecs.some((m) => /h264/i.test(m));
      engines.push({ box: b.host.name || b.host.ssh, ua: cap.ua, h264, codecs: cap.codecs });
      console.log('  engine: ' + (b.host.name || b.host.ssh) + '  ' + cap.ua
        + '  RTCRtpScriptTransform=' + cap.scriptTransform
        + '  video codecs: ' + (cap.codecs.join(',') || '?'));
      if (!cap.scriptTransform) bad.push((b.host.name || b.host.ssh) + ' (' + cap.ua + ')');
      await p.context().close();
    }
    // Is every box carrying the SAME codec menu? If so a mismatch cannot be
    // legitimate and stays a hard bug; if not, a mismatch is the product
    // working and what must be asserted is that it was ANSWERED.
    const menus = new Set(engines.map((e) => e.codecs.join(',')));
    console.log('  FLEET: codec spread — ' + (menus.size === 1
      ? 'HOMOGENEOUS (' + [...menus][0] + '); a mismatch here would be a bug'
      : 'MIXED across boxes (' + engines.map((e) => e.box + ':' + (e.h264 ? '+H264' : 'no-H264')).join(', ')
        + '); a mismatch is legitimate and must be ANSWERED by a failback'));
    codecHomogeneous = menus.size === 1;
    if (bad.length) {
      console.log('NEEDS-FLEET — ' + bad.length + ' of ' + boxes.length + ' boxes cannot host RTCRtpScriptTransform: ' + bad.join(', '));
      console.log('  The encoded-passthrough lane IS RTCRtpScriptTransform; a box without it can');
      console.log('  only report the browser\'s age as a product defect. Point that host\'s "chrome"');
      console.log('  at a newer build (Chrome 141+; 143/149/151 verified) in ' + needFleet.FLEET_FILE + '.');
      console.log('0 PASSED, 0 FAILED — no verdict was reached, on purpose.');
      await closeFleet(boxes);
      process.exit(3);
    }
  }

  // ---- LEG 2: the real mesh -------------------------------------------------
  {
    const room = 'pipe' + Math.random().toString(36).slice(2, 7);
    const pages = [];
    const clogLines = [];              // transport forensics from every seat
    const tRoom = Date.now();
    for (let i = 0; i < N; i++) {
      const ctx = await seatBox(i).browser.newContext({ permissions: ['camera', 'microphone'] });
      // PIPE_DRAIN=off disables the carrier catch-up drainer for an A/B against
      // the stg freeze (docs/bug-pipe-stg-freeze-2026-08-05.md). Default unset
      // = the shipped behaviour, so an ordinary gate run is untouched.
      const drain = process.env.PIPE_DRAIN === 'off' ? `try{localStorage.setItem('gifos_pipe_drain','off')}catch(e){};` : '';
      // PIPE_OFF=1 disables the encoded-passthrough lane entirely, so every
      // forward falls back to transcode. This file's FOUNDING claim is that the
      // lane owns the freeze (0/3 lane-off against 3/3 lane-on, 2026-08-05) —
      // but that A/B predates the discovery that leg 3 only fires on a BRIGHT
      // feed and that coverage swings run to run, which is exactly the confound
      // that killed the blur hypothesis. Re-run it COVERAGE-GATED: if lane-off
      // also freezes at 7/7, the lane never owned this bug.
      const lane = process.env.PIPE_OFF === '1' ? `try{localStorage.setItem('gifos_pipe','off')}catch(e){};` : '';
      // CARRIER=big bisects the lane's own internals: a 320px carrier instead
      // of the 48px one, which is the single knob that changes the encoder's
      // regime (a 48x48 near-static source was measured at the 30kbps floor).
      const carrier = process.env.CARRIER === 'big' ? `try{localStorage.setItem('gifos_pipe_carrier','big')}catch(e){};` : '';
      await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; ${drain} ${lane} ${carrier} window.GIFOS_SCALE={C:2};` });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 200)));
      // THE TRANSPORT'S OWN VOICE. run.html's clog() is live on a DEBUG page
      // (this suite always passes DEBUG=on) and every rebuild/heal/glare site
      // writes to it — but nothing here was listening, so the signalling trail
      // was being thrown away at exactly the moment it mattered. Keep the
      // glare/rollback lines with the seat and a timestamp; they are the only
      // way to tell a fix that never ARMED from one that armed and failed.
      const seatN = i;
      page.on('console', (m) => {
        let t = '';
        try { t = m.text(); } catch (e) { return; }
        if (!t || t.indexOf('[clog]') < 0) return;
        if (!/glare|rollback|re-?pair|rebuild|watchdog/i.test(t)) return;
        clogLines.push({ seat: 'P' + seatN, ms: Date.now() - tRoom, t: t.replace('[clog]', '').trim().slice(0, 120) });
      });
      await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
      // WHICH KIND OF FALLBACK. `pipeInfo().deny` is one set fed by TWO totally
      // different events (run.html "FAILBACK is per-job and automatic"): a
      // CODEC MISMATCH reported by the worker, and the DEAD-PIPE WATCHDOG — a
      // job that wrote nothing across three 3s ticks while its source track was
      // live and unmuted. This suite has always asserted `deny === 0` and
      // explained it as "VP8-only box, a mismatch is a bug", which is only true
      // of the first cause. mesh-pipe.js's `on()` keeps a LIST of listeners, so
      // a second one costs the page nothing and separates them at the source.
      await page.evaluate(() => {
        window.__pipeMismatch = [];
        try { GifOS.meshPipe.on('codec-mismatch', (m) => window.__pipeMismatch.push({ pipeId: String(m.pipeId).slice(0, 26), mime: m.mime, tmplMime: m.tmplMime })); } catch (e) {}
      }).catch(() => {});
      pages.push(page);
      await sleep(1200);
    }
    let coords = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
      if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
      await sleep(1500);
    }
    const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '?');
    check('all 6 seated; at least one DEEP seat', coords.every(Boolean) && coords.some((c) => c && c.pc !== 0), coords.map(cstr));
    // SAY WHAT SHAPE THE ROOM TOOK, and how long it took to take it. Seating is
    // a race and the shape VARIES run to run (measured 2026-08-17, 8 runs on an
    // idle 8-core box): sometimes each deep seat sits alone in its own section,
    // sometimes two share a deep ROW — and the second shape has one more relay
    // hop (head -> row-mate -> deep head -> its row-mate) before anybody deep
    // can paint a Stadium. A verdict read without the shape cannot tell those
    // two rooms apart, and the gate's FLAKY line for this suite is exactly that
    // confusion.
    console.log('   MEASURE seating: ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, shape '
      + JSON.stringify(coords.map(cstr)));
    for (const p of pages) {
      await p.evaluate(() => {
        const none = document.getElementById('blur-none'); if (none) none.click();
        const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
      }).catch(() => {});
    }
    // OPTIONAL RAW-CAMERA REGIME (PIPE_CLEAR=1). Without a room password
    // blurLevelFor floors everyone at blur 1 — deliberately, a passwordless
    // room must never show clear video — so this suite has ALWAYS measured a
    // BLUR CANVAS source, capped at 12fps and 250kbps, and never a raw camera.
    // That is not the regime a staged speaker is in inside a locked room, and
    // it may be why the producer only encodes ~1.5fps. A password plus consent
    // flips the room to raw at full rung, which splits the stg freeze cleanly:
    // gone here means the bug is in the blur-pipe SOURCE path, still here means
    // the pipe lane owns it. Default OFF, so the suite's normal meaning is
    // untouched. (Flow copied from e2e-video.)
    if (process.env.PIPE_CLEAR === '1') {
      try {
        // DOM clicks, not Playwright's actionability-checked ones: in this
        // suite's mosaic layout #pwbtn is present but not "visible" enough for
        // locator.click, which timed out at 3000ms and left the arm silently
        // measuring the BLURRED regime it was meant to replace — a control that
        // does not control is worse than no control.
        await pages[0].evaluate(() => { const b = document.getElementById('pwbtn'); if (b) b.click(); });
        await sleep(400);
        await pages[0].evaluate(() => {
          const i = document.getElementById('pw-new');
          if (i) { i.value = 'pipeclear'; i.dispatchEvent(new Event('input', { bubbles: true })); }
          const s2 = document.getElementById('pw-save'); if (s2) s2.click();
        });
        let got = 0;
        for (const p of pages) {
          const ok = await p.waitForFunction(() => window.__gifosVideo.roomPw() === 'pipeclear', null, { timeout: 15000 }).then(() => true).catch(() => false);
          if (ok) got++;
        }
        await sleep(1500);
        let raw = 0;
        for (const p of pages) {
          const ok = await p.waitForFunction(() => window.__gifosVideo.outboundKind() === 'raw', null, { timeout: 25000 }).then(() => true).catch(() => false);
          if (ok) raw++;
        }
        console.log('   MEASURE PIPE_CLEAR: password on ' + got + '/' + N + ', outbound RAW at ' + raw + '/' + N);
        check('PIPE_CLEAR: the room actually went CLEAR (raw camera, not the blur canvas)', raw === N, { got, raw });
      } catch (e) { check('PIPE_CLEAR: the room actually went CLEAR', false, { err: String(e).slice(0, 140) }); }
    }

    // EVERY SEAT'S STADIUM MUST GO LIVE — the pipe must never cost the picture.
    //
    // WAIT WHILE THE ROOM IS STILL CONVERGING; FAIL ON THE ABSENCE OF PROGRESS
    // (test/README "NEVER LET A WALL CLOCK DECIDE A VERDICT"). The old loop was
    // a flat 90 s ceiling on a boolean, which is the exact shape that section
    // names: 90 s is not something we ship, so on a busy box it measured the
    // box, and on a broken one it still sat there for the full ninety seconds
    // before saying "4 of 6" with nothing about which hop was stuck.
    //
    // The claim is "every seat's Stadium comes up", so the waiter watches the
    // RUNG each seat is on and only gives up when the whole room has stopped
    // climbing. Coming up is a ladder, and each rung is a different failure:
    //   0  nothing — no Stadium ingredient claimed, no tile element
    //   1  the ingredient is CLAIMED ('sdn'/'sdm', or 'sub:*' at a head that
    //      builds its own) — the branch reached this seat
    //   2  the tile ELEMENT exists — a stream was handed to it
    //   3  the element has metadata (readyState >= 1) — bytes are arriving
    //   4  videoWidth > 0 — LIVE, which is the assertion
    // A deadlocked room shows a flat sum and fails in STILL_MS instead of 90 s;
    // a merely slow one keeps climbing and is not punished for its kernel.
    const live = new Array(N).fill(false);
    const liveMs = new Array(N).fill(null);
    // STILL_MS is the real governor; CEIL_MS only bites on a room that is still
    // genuinely climbing, and it is sized so this suite's worst case stays well
    // inside the gate's 600s per-suite timeout (release.sh run_one default).
    //
    // WHY 60s, AND THE FIRST NUMBER WAS WRONG — this is set from a measurement
    // that contradicted it, not from the product's constants.
    //
    // It was 25s, argued from run.html expiring a mosaic announce at 12s: two
    // full announce/claim cycles with nothing moving looked like plenty. It was
    // not. On the fleet a seat sat COMPLETELY static for 26s — no claim, no
    // announce, and (the part the old ladder could not see) no live link and no
    // data channel either, while every other seat already held it in roster and
    // status — and then finished joining and went live 4s later. The room was
    // converging the whole time; 25s of "stillness" was a test that could not
    // see transport come up, and it produced a FALSE RED.
    //
    // So both halves changed: the ladder now starts at the transport (above) so
    // wiring counts as progress, and the window is 60s — better than 2x the
    // longest static stretch actually observed (26s), and still a third of the
    // 90s flat ceiling this replaced, because it only ever runs out when
    // NOTHING in the room improves: no rung, no data channel, no peer, no
    // occupancy. If a future red claims stillness, the probe below says whether
    // the seat recovered anyway — and if it did, this number is the bug again.
    const STILL_MS = 60000, CEIL_MS = 180000;
    // THE LADDER STARTS BELOW THE MOSAIC, and it has to — measured 2026-08-18.
    // The first version began at "ingredient claimed", so a seat that was still
    // WIRING scored 0 no matter how much progress it was making, and a room came
    // up looking frozen while it was busy forming links. That cost a false red:
    // a seat sat at 0 for 26s with liveDataLinks:0 and occ:2 while every other
    // seat already held it in roster and status, then finished joining and went
    // live 4s later. Nothing was stuck; the waiter was blind to the only thing
    // that was moving. So the rungs now begin at the transport and the progress
    // signal carries the WIRING counters too — a seat gaining a peer, a data
    // channel, or occupancy is a room that is converging, and must never be
    // scored as still.
    const rungOf = (i) => pages[i].evaluate(() => {
      const V = window.__gifosVideo; if (!V) return { r: 0, dc: 0, occ: 0, peers: 0 };
      const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
      const m = safe(() => V.mosaic(), {}) || {};
      const el = document.querySelector('#stadium [data-row="sd"] video');
      const dc = safe(() => V.liveDataLinks(), 0) || 0;
      const occ = (safe(() => V.meshState(), {}) || {}).occ || 0;
      const peers = (safe(() => V.peerIds(), []) || []).length;
      let r;
      if (m.tile && m.tile.live) r = 6;
      else if (el) r = el.readyState >= 1 ? 5 : 4;
      else if ((m.claims || []).some((k) => k === 'sdn' || k === 'sdm' || String(k).indexOf('sub:') === 0)) r = 3;
      else if (dc > 0) r = 2;                    // wired: a DataChannel to someone
      else if (peers > 0) r = 1;                 // wiring: a peer exists, not yet open
      else r = 0;                                // not yet joined at all
      return { r, dc, occ, peers };
    }).catch(() => ({ r: 0, dc: 0, occ: 0, peers: 0 }));
    const tS = Date.now();
    let best = -1, lastGain = Date.now(), rungs = new Array(N).fill(0), det = [];
    for (;;) {
      det = [];
      for (let i = 0; i < N; i++) {
        const s = await rungOf(i);
        rungs[i] = s.r; det.push(s);
        if (s.r === 6 && !live[i]) { live[i] = true; liveMs[i] = Date.now() - tS; }
      }
      if (live.every(Boolean)) break;
      // PROGRESS IS ANY OF IT MOVING: the rung, the open data channels, the
      // occupancy each seat knows, the peers it holds. A room that is wiring
      // improves one of these on every beat even when no Stadium has appeared.
      const sum = det.reduce((s, x) => s + x.r * 1000 + x.dc * 10 + x.occ + x.peers, 0);
      if (sum > best) { best = sum; lastGain = Date.now(); }
      if (Date.now() - lastGain >= STILL_MS) {
        console.log('   MEASURE the room STOPPED climbing: rungs ' + JSON.stringify(rungs)
          + ' wiring ' + JSON.stringify(det.map((x) => x.dc + '/' + x.peers + '/occ' + x.occ))
          + ' unchanged for ' + Math.round((Date.now() - lastGain) / 1000) + 's at t+'
          + Math.round((Date.now() - tS) / 1000) + 's — not waiting out a ceiling for a room that is not moving');
        break;
      }
      if (Date.now() - tS >= CEIL_MS) { console.log('   MEASURE hit the absolute ceiling (' + (CEIL_MS / 1000) + 's) still climbing: rungs ' + JSON.stringify(rungs)); break; }
      await sleep(2000);
    }
    // HOW LONG EACH SEAT TOOK, ALWAYS PRINTED. The budget here is either
    // comfortable or it is not, and nothing in this suite ever said which — so
    // a red arrived as "seat 4 and seat 6 are false" with no way to tell a
    // branch that was 2s late from one that never came up at all. On an idle
    // 8-core box every seat is live in the low seconds (measured); a green with
    // a seat near the ceiling is a warning, not a pass.
    console.log('   MEASURE time to a live Stadium, per seat (ms): ' + JSON.stringify(liveMs));
    // ALWAYS PRINTED, INCLUDING ON A GREEN RUN. Whether the glare yield fires at
    // all is nearly as informative as the pass rate: a room that goes green
    // WITHOUT ever yielding never had the deadlock to begin with, and cannot be
    // evidence that yielding cured it. Silence here on a red run means the
    // offer never reached the handler, which is a different bug entirely.
    {
      const g = clogLines.filter((x) => /glare/i.test(x.t));
      console.log('   MEASURE glare-yield fired: ' + g.length
        + (g.length ? '  ' + JSON.stringify(g.slice(0, 8)) : '  (never armed or never needed)')
        + '; other transport lines: ' + (clogLines.length - g.length));
    }
    // AND WHY, when one does not. A dark Stadium has two completely different
    // causes and the boolean cannot tell them apart: the seat never CLAIMED the
    // ingredient its Stadium is built from (a branch that never converged — no
    // 'sdn' at a deep head, no 'sdm' at its row-mate), or it holds the claim and
    // the picture never arrived (a dark forward). Print the claim state of every
    // seat that failed, next to its coordinate, so the next red names its own hop.
    if (!live.every(Boolean)) {
      const why = [];
      for (let i = 0; i < N; i++) {
        if (live[i]) continue;
        const d = await pages[i].evaluate(() => {
          const V = window.__gifosVideo, m = V.mosaic() || {};
          const el = document.querySelector('#stadium [data-row="sd"] video');
          const safe = (f, dflt) => { try { return f(); } catch (e) { return dflt; } };
          const short = (a) => (a || []).map((x) => String(x).slice(0, 8));
          return { me: m.me, head: m.head, up: m.up, down: m.down,
            prodStream: m.prodStream, sdStream: m.sdStream,
            el: el ? { vw: el.videoWidth, rs: el.readyState, sid: String(el.srcObject && el.srcObject.id).slice(0, 8) } : null,
            claims: m.claims, ann: m.ann, jobs: m.jobs,
            // MESH STATE, not just mosaic state. `up:null` says the composite
            // never reached this seat; these say whether it ever had a mesh to
            // reach it THROUGH — seat state, strandedness, how much occupancy it
            // knows, who it holds links to, and whether it has a DataChannel to
            // anybody at all.
            mesh: safe(() => V.meshState(), null),
            linkPeers: short(safe(() => V.meshLinks(), [])),
            liveLinks: safe(() => V.liveLinks(), null),
            liveDataLinks: safe(() => V.liveDataLinks(), null),
            peers: short(safe(() => V.peerIds(), [])),
            roster: short(safe(() => V.rosterIdsNow(), [])),
            statusIds: short(safe(() => V.statusIds(), [])),
            relayUp: safe(() => V.relayUp(), null) };
        }).catch((e) => ({ err: String(e).slice(0, 90) }));
        why.push({ seat: 'P' + i, at: cstr(coords[i]), d });
      }
      console.log('   MEASURE seats with no live Stadium: ' + JSON.stringify(why));
      // INVISIBLE TO EVERYONE, OR ONLY MISSING ITS OWN UP-LINK? The seat's own
      // view cannot answer that, and the answer decides where the defect is: a
      // seat nobody has in occ was never NAMED (a gossip problem), while a seat
      // everyone can see but which holds no up-link ASKED and got no answer (a
      // link-formation problem). Ask every other seat what it holds for this id.
      for (const w of why) {
        const pid = String((w.d && w.d.me) || '');
        if (!pid) continue;
        const seen = [];
        for (let j = 0; j < N; j++) {
          if ('P' + j === w.seat) continue;
          const v = await pages[j].evaluate((id) => {
            const V = window.__gifosVideo;
            const safe = (f, dflt) => { try { return f(); } catch (e) { return dflt; } };
            const has = (arr) => (arr || []).some((x) => String(x).indexOf(id) === 0 || id.indexOf(String(x)) === 0);
            const p = (V.pairs && safe(() => V.pairs(), []) || []).find((q) => String(q.id).indexOf(id) === 0 || id.indexOf(String(q.id)) === 0);
            return { peer: has(safe(() => V.peerIds(), [])), roster: has(safe(() => V.rosterIdsNow(), [])),
              status: has(safe(() => V.statusIds(), [])), link: has(safe(() => V.meshLinks(), [])),
              myOcc: (safe(() => V.meshState(), {}) || {}).occ, pair: p || null };
          }, pid).catch(() => null);
          seen.push(Object.assign({ from: 'P' + j }, v || { err: true }));
        }
        console.log('   MEASURE who can SEE ' + w.seat + ' (' + w.at + ', id ' + pid + '): ' + JSON.stringify(seen));
        // The full transport trail for this room, so a surviving wedge can be
        // read as "the yield never armed" vs "the yield armed and failed".
        console.log('   MEASURE transport trail (all seats, ms since join): '
          + (clogLines.length ? JSON.stringify(clogLines.slice(-24)) : 'EMPTY — no clog lines at all,'
            + ' so either DEBUG is off or nothing in the rebuild/heal/glare path ran'));
      }
      // DID IT RECOVER? The waiter gives up on STILLNESS rather than on a clock,
      // and the one thing stillness cannot distinguish by itself is a room that
      // is DEADLOCKED from a seat that is merely slower than the window. So keep
      // watching the dark seats — the verdict above is already recorded and does
      // not change — and say which it was. This is the number STILL_MS must be
      // set from: if recoveries cluster at some delay, the window is too tight
      // and this line is where you find out; if they never come up, the branch
      // really was stuck and the claim state above names the hop.
      const stillDark = [];
      for (let i = 0; i < N; i++) if (!live[i]) stillDark.push(i);
      const recovered = [];
      const tR = Date.now();
      while (stillDark.length && Date.now() - tR < 90000) {
        await sleep(2000);
        for (let k = stillDark.length - 1; k >= 0; k--) {
          const i = stillDark[k];
          if ((await rungOf(i)).r === 6) { recovered.push({ seat: 'P' + i, afterMs: Date.now() - tR }); stillDark.splice(k, 1); }
        }
      }
      console.log('   MEASURE dark seats after the verdict: '
        + (recovered.length ? 'RECOVERED ' + JSON.stringify(recovered) + ' — STILL_MS (' + (STILL_MS / 1000)
            + 's) was tighter than this room needed, and that is a TEST bug, not a product one'
          : 'none recovered')
        + (stillDark.length ? '; STILL DARK after 90s more: ' + stillDark.map((i) => 'P' + i).join(',')
            + ' — the branch is stuck, not slow' : ''));
    }
    check('every seat renders a live Stadium with the pipe lane on', live.every(Boolean), { live, liveMs });
    // HOT pipes need multi-hop traffic. At N=6/C=2 almost every hot feed is ONE
    // hop from its producing packer (a local canvas -> a normal encode), and
    // the piped jobs are the parked redundancy spares — wrote 0 is the ONE-PIPE
    // law working, not a dead pipe (measured on the first run of this suite).
    // The feed that genuinely multi-hops is THE STAGE: a deep stager's stg:
    // flood is relayed hot across S1 — the exact lane §9a exists for.
    const deepIdx0 = coords.findIndex((c) => c && c.pc !== 0);
    const stepped = await pages[deepIdx0].evaluate(() => window.__gifosVideo.stageForTest(true)).catch(() => false);
    check('a deep seat steps onto the stage', stepped === true, { stager: 'P' + deepIdx0 + '@' + cstr(coords[deepIdx0]) });
    let agree = 0;
    for (let i = 0; i < N; i++) {
      const ok = await pages[i].waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 25000 }).then(() => true).catch(() => false);
      if (ok) agree++;
    }
    check('every seat agrees on the stage set', agree === N, { agree });
    await sleep(12000); // let the flood settle and the hot piped relays write
    // the pipe lane is ACTIVE: someone routes jobs and writes content frames
    const infos = await Promise.all(pages.map((p) => p.evaluate(async () => {
      const i2 = __gifosVideo.pipeInfo();
      const st = await __gifosVideo.pipeStats();
      let wrote = 0, primed = 0; const mimes = {};
      for (const k of Object.keys(st)) {
        wrote += st[k].wrote || 0; primed += st[k].primed || 0;
        if (st[k].mime || st[k].tmplMime) mimes[(st[k].mime || '?') + '/' + (st[k].tmplMime || '?')] = 1;
      }
      const mism = window.__pipeMismatch || [];
      const mismIds = mism.map((x) => x.pipeId);
      return { enabled: i2.enabled, jobs: i2.jobs.length, deny: i2.deny.length, wrote, primed,
        mimes: Object.keys(mimes), mism,
        watchdog: i2.deny.filter((d) => mismIds.indexOf(String(d).slice(0, 26)) < 0).map((d) => String(d).slice(0, 26)) };
    }).catch(() => null)));
    const totJobs = infos.reduce((s, x) => s + (x ? x.jobs : 0), 0);
    const totWrote = infos.reduce((s, x) => s + (x ? x.wrote : 0), 0);
    const totDeny = infos.reduce((s, x) => s + (x ? x.deny : 0), 0);
    check('the pipe lane is enabled everywhere', infos.every((x) => x && x.enabled), infos);
    check('forwarded feeds ride the pipe (routed jobs > 0)', totJobs > 0, { totJobs });
    check('the staged flood rides HOT pipes (content frames written, passthrough live)', totWrote > 50, { totWrote, perSeat: infos.map((x) => x && x.wrote) });
    // and the room actually SEES the stage through those pipes
    let stripSeen = 0;
    for (let i = 0; i < N; i++) {
      if (i === deepIdx0) continue;
      const d = await pages[i].evaluate(() => { const v = document.querySelector('#stagefeed video'); return v ? v.videoWidth : 0; }).catch(() => 0);
      if (d > 100) stripSeen++;
    }
    check('non-stagers render the stage at content size through the pipe lane', stripSeen >= N - 2, { stripSeen });
    // ONE ASSERTION SPLIT IN TWO, BECAUSE IT WAS MEASURING TWO THINGS.
    // `deny` is the union of both failback causes (run.html: "a codec mismatch
    // ... or a watchdog-caught dead pipe adds the job to pipeDeny"). The old
    // single check called every deny a codec mismatch and explained itself with
    // "VP8-only box, a mismatch is a bug" — so a DEAD-PIPE WATCHDOG fallback,
    // the other cause and the one a starved branch actually produces, reported
    // itself as a codec bug and sent the reader hunting a negotiation that never
    // happened. Both are still asserted at zero; neither is softened; each now
    // names what it is, and the codec census says which negotiation was reached.
    const totMism = infos.reduce((s, x) => s + (x && x.mism ? x.mism.length : 0), 0);
    const totWatch = infos.reduce((s, x) => s + (x && x.watchdog ? x.watchdog.length : 0), 0);
    console.log('   MEASURE codecs negotiated per seat (content/template): '
      + JSON.stringify(infos.map((x) => x && x.mimes)));
    // A MISMATCH IS ONLY A BUG IN A ROOM THAT CANNOT LEGITIMATELY HAVE ONE.
    // The old file asserted zero denies and justified it with "VP8-only box",
    // which was a claim about the HARNESS, not the product — and it is false the
    // moment the room spans a real Google Chrome (H264) and a Playwright
    // chromium (VP8-only), which is exactly what a fleet is. Measured on the
    // first mixed run: one stg: forward, content VP8, template H264, denied and
    // re-laned to transcode with every picture assertion still green.
    //
    // So the claim splits by what the boxes actually carry, measured above:
    //   homogeneous menu -> a mismatch cannot be legitimate: assert ZERO, the
    //                       full strength of the original assertion, now
    //                       resting on a measurement instead of an assumption
    //   mixed menu       -> a mismatch is the failback doing its job: assert it
    //                       was ANSWERED (every mismatched job left the pipe),
    //                       because a mismatch that is DETECTED and then NOT
    //                       unshipped is the real bug — it would forward
    //                       payloads a decoder cannot read, silently
    // watchdog[] is this seat's deny set MINUS its mismatched ids, so
    // (deny - watchdog) is exactly the count of denies that a mismatch caused.
    // A mismatch DETECTED but never turned into a deny is the real bug: the job
    // would keep forwarding payloads the far decoder cannot read, silently.
    const answered = infos.every((x) => !x
      || (x.mism || []).length <= (x.deny - (x.watchdog || []).length));
    check('every CODEC MISMATCH was ANSWERED — the job left the pipe for the transcode lane',
      answered, { totMism, totDeny, totWatch, per: infos.map((x) => x && x.mism) });
    check('no job fell back over a CODEC MISMATCH (asserted only where the room is codec-HOMOGENEOUS)',
      !codecHomogeneous || totMism === 0,
      { inForce: codecHomogeneous, totMism, engines: engines.map((e) => e.box + (e.h264 ? '+H264' : '')),
        per: infos.map((x) => x && x.mism) });
    check('no pipe went dark long enough for the dead-pipe watchdog to unship it',
      totWatch === 0, { totWatch, totDeny, per: infos.map((x) => x && x.watchdog) });
    // content-sized pixels at a deep seat: the carrier is 48px; a packer block is not
    const deepIdx = coords.findIndex((c) => c && c.pc !== 0);
    const dims = await pages[deepIdx].evaluate(() => {
      const v = document.querySelector('#stadium video') || document.querySelector('.rowtile video');
      return v ? { w: v.videoWidth, h: v.videoHeight } : null;
    }).catch(() => null);
    check('a deep seat decodes CONTENT-sized pixels (not the 48px carrier)', !!dims && dims.w > 100, dims);

    // ---- LEG 3: THE FREEZE SHAPE (the stg re-scope's reproducing guard) ----
    // The 2026-08-04 stg freeze (frza runs, multi-device): a piped stg copy
    // going hot mid-GOP starved for key content (WebRTC emits no periodic
    // keyframes), the mx-kf walk answered by nudging the producer's CAPTURE,
    // and the blur-canvas nudge stalled the self-stream encoder 10-20s —
    // every receiver of every copy bright-frozen at once, recurring. The fix
    // is hop-local sendKeyFrameRequest in the worker + a sender-side jiggle
    // fallback. THIS LEG IS THE SHAPE: watch every seat's stg:*/sgs feeds for
    // 36s; a feed whose decoded-frame counter stalls >=12s while its track is
    // live and unmuted is the freeze (old code: recurring 14-20s stalls at
    // healthy fps, 120s+ at crawl fps — either trips this).
    //
    // TWO CORRECTIONS TO THE DETECTOR (2026-08-06, measured — the assertion is
    // unchanged, its inputs are):
    //
    // 1. A CLAIM SWAP IS NOT A FREEZE. `feedsInfo().frames` is the ELEMENT's
    //    totalVideoFrames, and a redundancy swap (failover/failback, or an
    //    announcer re-shipping a new container) installs a NEW <video> whose
    //    counter restarts at zero. The old rule then waited for the new element
    //    to climb past the OLD element's total — tens of seconds at 15fps —
    //    and called that a 12s bright freeze. Measured on <behavior-box>: of three
    //    stalls reported in one run, TWO were exactly this, at seats that were
    //    decoding perfectly on a fresh container. So key the baseline by
    //    (via, streamId) and re-baseline when the container changes.
    // 2. SAY WHETHER THE PIPE WAS DELIVERING. The dossier
    //    (docs/bug-pipe-stg-freeze-2026-08-05.md) could not tell a starved
    //    decoder from a dark pipe. Carry inbound BYTES for the slot across the
    //    stall, and grab that flow's framesDecoded/keyFramesDecoded when it
    //    fires. That is what turned "some feeds freeze" into the real shape:
    //    25-50 kB arriving during a 13s freeze with keyFramesDecoded flat —
    //    bytes without a decodable frame, not a pipe that went quiet.
    {
      const stalls = [];
      const brightSeen = new Set();   // (seat,feed) pairs the detector could judge
      const everSeen = new Set();     // (seat,feed) pairs that existed at all
      const swaps = [];       // container changes seen (the churn, printed not asserted)
      const last = new Map(); // `${i}:${key}` -> { fr, at, via, sid, b0 }
      const tW0 = Date.now();
      // WHO IS WHICH SEAT. feedsInfo() reports the claim's `via` as an 8-char
      // peer id; mosaic().me reports this seat's own in the same form. Together
      // they turn "P0 is stalled on a feed it claims via k_61a740" into "ask
      // P4, one hop upstream, what its forward to P0 was doing at that instant"
      // — which is the measurement the 2026-08-10 dossier round asked for and
      // could not take.
      const seatIds = await Promise.all(pages.map((p) =>
        p.evaluate(() => (window.__gifosVideo.mosaic() || {}).me || null).catch(() => null)));
      const seatOf = (via) => {
        if (!via) return -1;
        const v = String(via);
        return seatIds.findIndex((id) => id && (id === v || id.indexOf(v) === 0 || v.indexOf(id) === 0));
      };
      const pipeStatsAt = (i) => pages[i].evaluate(async () => {
        const s = await __gifosVideo.pipeStats();
        const out = {};
        for (const id in s) {
          const p = s[id];
          out[id] = { wrote: p.wrote, dropped: p.dropped, nkDrop: p.nkDrop, kdrop: p.kdrop,
            q: p.q, needKey: p.needKey, paused: p.paused, swapErr: p.swapErr,
            kfAsk: p.kfAsk, skr: p.skr, mime: p.mime, tmplMime: p.tmplMime,
            sinceWriteMs: p.lastWriteAt ? Date.now() - p.lastWriteAt : null };
        }
        return out;
      }).catch((e) => ({ err: String(e).slice(0, 80) }));
      const snap = (i) => pages[i].evaluate(async () => {
        const m = __gifosVideo.mosaic();
        const sidOf = new Map((m.claimVia || []).map((c) => [c.rk, String(c.sid).slice(0, 8)]));
        const st = await __gifosVideo.avStats();
        const bytes = {};
        for (const s of st) if (s.dir === 'in' && s.slot) bytes[s.slot] = (bytes[s.slot] || 0) + (s.bytes || 0);
        return __gifosVideo.feedsInfo().filter((f) => f.key.indexOf('stg:') === 0 || f.key === 'sgs')
          .map((f) => ({ key: f.key, fr: f.frames, vw: f.vw, muted: f.vMuted, state: f.vState,
            via: f.via, sid: sidOf.get(f.key) || '?', b: bytes['in:' + f.key] || 0 }));
      }).catch(() => []);
      while (Date.now() - tW0 < 36000) {
        for (let i = 0; i < N; i++) {
          const feeds = await snap(i);
          for (const f of feeds) {
            const k = i + ':' + f.key;
            const rec = last.get(k);
            const bright = f.vw > 0 && f.state === 'live' && f.muted === false;
            // COVERAGE. This leg can ONLY fire on a bright feed, so a run where
            // nothing ever goes bright has judged nothing and a green from it
            // means nothing. Count what the detector was actually able to look
            // at — the same discipline the other guards in this repo carry, and
            // the one thing leg 3 never reported about itself.
            if (bright) brightSeen.add(i + ':' + f.key);
            everSeen.add(i + ':' + f.key);
            if (!rec) { last.set(k, { fr: f.fr, at: Date.now(), via: f.via, sid: f.sid, b0: f.b }); continue; }
            if (rec.via !== f.via || rec.sid !== f.sid) {   // new container: a new decoder, a new baseline
              swaps.push({ seat: 'P' + i, key: f.key.slice(0, 14), atS: Math.round((Date.now() - tW0) / 1000),
                from: rec.via + '/' + rec.sid, to: f.via + '/' + f.sid });
              last.set(k, { fr: f.fr, at: Date.now(), via: f.via, sid: f.sid, b0: f.b });
              continue;
            }
            if (f.fr > rec.fr) { rec.fr = f.fr; rec.at = Date.now(); rec.b0 = f.b; continue; }
            if (bright && Date.now() - rec.at >= 12000 && !rec.hit) {
              rec.hit = true;
              const kf = await pages[i].evaluate(async (key) => {
                const r = (await __gifosVideo.kfStats()).find((x) => x.dir === 'in' && x.slot === 'in:' + key);
                return r ? { fdec: r.fdec, kdec: r.kdec } : null;
              }, f.key).catch(() => null);
              // 3. SAY WHAT THIS SEAT'S OWN PIPE WORKER WAS DOING (2026-08-10).
              // Bytes + framesDecoded proved the pipe was delivering and the
              // decoder producing nothing, but not WHY, and the dossier's
              // leading guess — that the lane lacks keyframe recovery — is
              // wrong: mesh-pipe.js already fires BOTH levers (hop-local
              // sendKeyFrameRequest and the mx-kf walk) plus a 2s re-ask timer
              // for the dark-tap hole. So the question is narrower than "ask
              // for a key", and the worker has carried the answer all along in
              // counters nothing ever read at stall time. These three shapes
              // are mutually exclusive and each names a different bug:
              //   dropped climbing + needKey true -> keys are asked for and
              //     never arrive (the ask is not crossing, or content arrives
              //     with no key to anchor it)
              //   wrote climbing + fdec flat      -> we ARE writing frames the
              //     decoder rejects (payload swap / mime mismatch)
              //   swapErr or a codec mismatch     -> the swap itself failing
              const pw = await pipeStatsAt(i);
              // IS THIS SEAT DEMANDING ITS OWN CLAIM IDLE? setJobActive(false)
              // — which mx-idle triggers — replaceTrack(null)s every sender AND
              // pausePipe()s the worker, and a paused pipe is skipped by the 2s
              // key re-ask loop. That is a total blackout of the feed with the
              // track still 'live' and vw>0 from the last frame: a BRIGHT
              // freeze, exactly this leg's shape. The hot set only keeps a
              // primary demanded while `inCand(pri)` — i.e. while it still
              // RESOLVES — so a claim that momentarily stops resolving is
              // demanded idle, and a parked sender can never restore the
              // liveness that would make it hot again.
              const dem = await pages[i].evaluate((key) => {
                const m = window.__gifosVideo.mosaic() || {};
                const mine = (m.claimVia || []).find((c) => c.rk === key) || null;
                return { claim: mine,
                  demands: (m.demand || []).filter((e) => e.indexOf('|' + key + '|') > 0),
                  claimed: (m.claims || []).indexOf(key) >= 0 };
              }, f.key).catch(() => null);
              // ONE HOP UPSTREAM, at the same instant. Our own counters are
              // OUTBOUND forwards and cannot say what fed us. The seat named by
              // `via` owns the forward pointing AT us — pipe id `<feed>><myId>`
              // — and its state splits the remaining question in two:
              //   paused / wrote flat  -> the forward was parked while we still
              //                           demanded it (and a paused pipe is
              //                           skipped by the 2s re-ask loop, so it
              //                           would never recover on its own)
              //   wrote climbing       -> the loss is on the carrier between
              //                           the two hops, not in either worker
              // What the upstream's own m-line actually SENT for this pipe.
              // The SENDER's own job identity for this feed, to compare against
              // the sid the receiver is demanding. mx-want is dropped silently
              // when they differ, so a divergence here IS the starve.
              const upJobs = (async () => {
                const u = seatOf(f.via);
                if (u < 0 || u === i) return null;
                return pages[u].evaluate((key) => {
                  const m = window.__gifosVideo.mosaic() || {};
                  return { jobSig: (m.jobSig || []).filter((x) => x.indexOf(key.slice(0, 18)) === 0),
                    jobsActive: (m.jobsActive || []).filter((x) => x.indexOf(key.slice(0, 18)) === 0) };
                }, f.key).catch(() => null);
              })();
              const upWire = (async () => {
                const u = seatOf(f.via);
                if (u < 0 || u === i) return null;
                return pages[u].evaluate(async (key) => {
                  const w = await (window.__gifosVideo.pipeWire ? window.__gifosVideo.pipeWire() : Promise.resolve({}));
                  const mine = {};
                  for (const jk in w) if (jk.indexOf(key) === 0) mine[jk.slice(key.length + 1, key.length + 9)] = w[jk];
                  return mine;
                }, f.key).catch((e) => ({ err: String(e).slice(0, 70) }));
              })();
              const ui = seatOf(f.via);
              let up = null;
              if (ui >= 0 && ui !== i) {
                const all = await pipeStatsAt(ui);
                const mine = seatIds[i];
                const toMe = {};
                for (const id in all) if (!mine || id.indexOf('>' + mine) >= 0 || id.indexOf(mine) > 0) toMe[id] = all[id];
                up = { seat: 'P' + ui, forwardsToMe: toMe, allPipeIds: Object.keys(all).map((s) => s.slice(0, 24)) };
              } else {
                up = { seat: ui, note: 'via did not resolve to a seat in this room', via: f.via, seatIds };
              }
              // THE WHOLE CHAIN, AS A RATE. `wrote` is cumulative since a pipe
              // was created, so a low total cannot tell a STARVED pipe from a
              // YOUNG one — and the first upstream capture showed totals of 4
              // and 14 against a producer encoding ~57, which is ambiguous in
              // exactly that way. Sample every seat's pipes for THIS feed
              // twice, 2s apart, and report frames-written-per-second at each
              // hop alongside that seat's own decode count. Wherever the rate
              // collapses along the chain is the hop that owns the freeze.
              const chainOf = async () => {
                const rows = [];
                for (let s = 0; s < N; s++) {
                  const st = await pipeStatsAt(s);
                  const mine = {};
                  for (const id in st) if (id.indexOf(f.key) === 0) mine[id.slice(f.key.length + 1, f.key.length + 9)] = st[id];
                  const dec = await pages[s].evaluate(async (key) => {
                    const r = (await __gifosVideo.kfStats()).find((x) => x.dir === 'in' && x.slot === 'in:' + key);
                    return r ? { fdec: r.fdec, kdec: r.kdec, frecv: r.frecv, pktRx: r.pktRx, lost: r.lost,
                      drop: r.drop, asm: r.asm, freeze: r.freeze, frzMs: r.frzMs, pliTx: r.pliTx, nackTx: r.nackTx,
                      fw: r.fw, fh: r.fh, mime: r.mime, impl: r.impl } : null;
                  }, f.key).catch(() => null);
                  // The per-DESTINATION carrier behind each forward. Two peers
                  // fed from one source pipe differ only here, so this is where
                  // a 26-of-32 leg and a 1-of-32 leg have to diverge.
                  const car = await pages[s].evaluate((key) => {
                    const c = (window.__gifosVideo.pipeChain && window.__gifosVideo.pipeChain()) || {};
                    const mine = {};
                    for (const jk in c) if (jk.indexOf(key) === 0) mine[jk.slice(key.length + 1, key.length + 9)] = c[jk];
                    return mine;
                  }, f.key).catch(() => ({}));
                  // THE MISSING LINK. The receiver's inbound row showed
                  // frecv == fdec at every seat — nothing is ever rejected —
                  // while the stalled seat had FOUR packets against 30+ frames
                  // its sender's worker had written. So the loss is between
                  // writer.write() succeeding and RTP leaving the box. The
                  // sender's OUTBOUND row per destination closes it: framesEncoded
                  // near the write count means the frames were encoded and the
                  // wire lost them; framesEncoded near zero means the writes
                  // never became encoded frames at all, and the carrier is the gap.
                  const outr = await pages[s].evaluate(async (key) => {
                    const rows = (await __gifosVideo.kfStats()).filter((x) => x.dir === 'out' && x.slot && x.slot.indexOf('out:' + key + '>') === 0);
                    const o = {};
                    for (const r of rows) o[r.slot.slice(('out:' + key + '>').length)] =
                      { fenc: r.fenc, kenc: r.kenc, pktTx: r.pktTx, bytesTx: r.bytesTx, fsent: r.fsent,
                        pliRx: r.pliRx, nackRx: r.nackRx, fps: r.fps,
                        fw: r.fw, fh: r.fh, qlim: r.qlim, impl: r.impl };
                    return o;
                  }, f.key).catch(() => ({}));
                  rows.push({ seat: 'P' + s, me: seatIds[s], dec, pipes: mine, car, outr });
                }
                return rows;
              };
              const c1 = await chainOf();
              await sleep(2000);
              const c2 = await chainOf();
              const chain = c2.map((r, s) => {
                const a = c1[s], rates = {};
                for (const d in r.pipes) {
                  const before = a.pipes[d];
                  rates[d] = { wroteS: before ? +(((r.pipes[d].wrote - before.wrote) / 2)).toFixed(1) : null,
                    paused: r.pipes[d].paused, needKey: r.pipes[d].needKey, dropped: r.pipes[d].dropped,
                    wrote: r.pipes[d].wrote,
                    // ONE copy of each content frame is shared by every sibling
                    // pipe on a tap; a write detaches it. `detached` counts the
                    // swaps that handed the sink an already-neutered buffer.
                    detached: r.pipes[d].detached, lastBytes: r.pipes[d].lastBytes,
                    carrier: (r.car && r.car[d]) || null,
                    // the outbound slot label truncates the destination to SIX chars
                    // (kfStats: 'out:'+key+'>'+String(j.to).slice(0,6)) while pipe ids
                    // carry eight — match both rather than silently reading null.
                    out: (r.outr && (r.outr[d] || r.outr[String(d).slice(0, 6)])) || null,
                    mintsS: (a.car && a.car[d] && r.car && r.car[d]) ? +(((r.car[d].mints - a.car[d].mints) / 2)).toFixed(1) : null };
                }
                return { seat: r.seat, me: r.me, fdec: r.dec && r.dec.fdec, kdec: r.dec && r.dec.kdec,
                  decS: (a.dec && r.dec) ? +(((r.dec.fdec - a.dec.fdec) / 2)).toFixed(1) : null,
                  // Rates for the receiver side too: assembled-per-second beside
                  // decoded-per-second is the assembled-vs-decoded split.
                  recvS: (a.dec && r.dec) ? +(((r.dec.frecv - a.dec.frecv) / 2)).toFixed(1) : null,
                  pktS: (a.dec && r.dec) ? +(((r.dec.pktRx - a.dec.pktRx) / 2)).toFixed(1) : null,
                  rx: r.dec, forwards: rates };
              });
              // IS THE CLAIM AIMED AT THE PEER THAT IS ACTUALLY SENDING?
              // Derived from the chain already captured, so it costs nothing.
              // A claim whose via holds no live forward to this seat would make
              // every sender-side number look healthy while the claimant
              // starves — and would explain the encoded-vs-received deficit as
              // an artifact of pairing a sender with a receiver it never fed.
              const meId = seatIds[i];
              const hasFwdToMe = (row) => Object.entries(row.forwards || {})
                .filter(([d, v]) => meId && String(meId).indexOf(String(d).slice(0, 6)) === 0 && !v.paused && v.wrote > 0)
                .map(([d, v]) => ({ to: d, wrote: v.wrote, fenc: v.out && v.out.fenc }));
              const senders = [];
              for (const row of chain) { const f2 = hasFwdToMe(row); if (f2.length) senders.push({ seat: row.seat, id: row.me, fwd: f2 }); }
              const viaSeatIdx = seatOf(f.via);
              const attribution = {
                via: f.via, viaSeat: viaSeatIdx >= 0 ? 'P' + viaSeatIdx : null,
                viaIsAForwarderToMe: senders.some((x) => String(x.id || '').indexOf(String(f.via)) === 0 || String(f.via).indexOf(String(x.id || '')) === 0),
                actualForwardersToMe: senders };
              stalls.push({ seat: 'P' + i, key: f.key.slice(0, 14), stuckMs: Date.now() - rec.at,
                frames: f.fr, via: f.via, sid: f.sid, bytesDuringStall: f.b - rec.b0, kf, pipe: pw, up, chain, attribution, dem,
                upWire: await upWire, upJobs: await upJobs });
            }
          }
        }
        await sleep(2000);
      }
      console.log('   MEASURE container swaps on stg/sgs claims during the 36s window: ' + swaps.length
        + (swaps.length ? '  ' + JSON.stringify(swaps) : ''));
      console.log('   MEASURE leg-3 coverage: ' + brightSeen.size + ' of ' + everSeen.size
        + ' (seat,feed) pairs ever went BRIGHT'
        + (brightSeen.size === 0 ? '  — VACUOUS: this leg could not judge anything, a green here proves nothing' : ''));
      // A GREEN THAT JUDGED NOTHING IS NOT A PASS. This leg can only fire on a
      // bright feed, so a run where none ever went bright has tested nothing at
      // all — and reporting that as green is precisely the failure CLAUDE.md
      // names ("a test that guards nothing is worse than no test"). It cost
      // real time on 2026-08-10: <monitor-pi> greens taken at face value became
      // a whole "the freeze is box-conditioned" conclusion, and the box was
      // simply judging half the feeds <behavior-box> was. Fail loudly instead, and say
      // it is coverage rather than the product, so nobody hunts a phantom.
      check('leg 3 could actually JUDGE something (a bright feed existed to watch)',
        brightSeen.size > 0,
        { bright: brightSeen.size, feeds: everSeen.size,
          why: brightSeen.size === 0 ? 'NO feed ever went bright — this is COVERAGE, not the product: the room never delivered a decodable stage feed to any seat, so the freeze detector had nothing to watch. Re-run on an idle box before reading anything into it.' : undefined });
      check('THE FREEZE SHAPE: no stg/sgs feed bright-stalls >=12s at any seat over 36s', stalls.length === 0,
        { stalls, bright: brightSeen.size, feeds: everSeen.size });

      // NO JOB MAY STAY PARKED WHILE ITS RECEIVER IS DEMANDING IT HOT.
      //
      // mx-want carrying a streamId the sender no longer ships is refused (it
      // must be — a stale demand must never flip a live ship), and before
      // 2026-08-10 it was refused SILENTLY: the job stayed parked while the
      // receiver re-asserted the same stale want every 6s, recovering only when
      // the announce aged out at ~12s and the claim was re-made. That is a
      // 12-15s blackout of a feed both ends want, and it is this leg's shape.
      // The sender now answers a stale want by re-announcing its current id.
      //
      // The invariant is cross-seat and cheap: for every seat demanding a feed
      // HOT, the peer it is demanding FROM must have that job active. Sampled
      // over a window, because a momentary park during a re-ship is legitimate
      // — only a SUSTAINED one is the bug.
      const wantParked = [];
      let wpJudged = 0;
      const seen = new Map();   // 'seat->to|key' -> consecutive samples parked
      for (let pass = 0; pass < 8; pass++) {
        const snapAll = [];
        for (let s2 = 0; s2 < N; s2++) {
          snapAll.push(await pages[s2].evaluate(() => {
            const m = window.__gifosVideo.mosaic() || {};
            return { me: m.me, demand: m.demand || [], jobsActive: m.jobsActive || [] };
          }).catch(() => null));
        }
        for (let s2 = 0; s2 < N; s2++) {
          const me = snapAll[s2]; if (!me) continue;
          for (const e of me.demand) {
            if (!/=w$/.test(e)) continue;                     // only HOT demands
            const bar = e.indexOf('|'); if (bar < 0) continue;
            const from = e.slice(0, bar), rest = e.slice(bar + 1);
            const key = rest.slice(0, rest.lastIndexOf('|'));
            if (key.indexOf('stg:') !== 0 && key !== 'sgs') continue;
            const ui = snapAll.findIndex((x) => x && x.me && String(from).indexOf(x.me) === 0);
            if (ui < 0) continue;                             // sender not in this room's sample
            wpJudged++;
            // jobsActive entries are `${key}>${to}` + ('+' active | '·' dormant)
            const mine = (snapAll[ui].jobsActive || []).find((j) => j.indexOf(key + '>') === 0 && j.indexOf(me.me) > 0);
            const active = mine ? mine.slice(-1) === '+' : null;
            const id = 'P' + s2 + '<-P' + ui + '|' + key.slice(0, 14);
            if (active === false) {
              const n = (seen.get(id) || 0) + 1; seen.set(id, n);
              if (n >= 3 && !wantParked.some((x) => x.id === id)) wantParked.push({ id, samples: n, demand: e.slice(0, 80), job: mine });
            } else seen.set(id, 0);
          }
        }
        await sleep(1500);
      }
      check('no job stays PARKED while its receiver demands it HOT (the stale-sid want drop)',
        wantParked.length === 0, { violations: wantParked.slice(0, 4), judged: wpJudged });
      console.log('   MEASURE want-vs-parked observations judged: ' + wpJudged
        + (wpJudged === 0 ? '  (VACUOUS — no hot demand resolved to a seat in this sample)' : ''));
      // and the stager's own stg encode never parks into silence while staged
      const stEnc = await pages[deepIdx0].evaluate(async () => {
        const rows = (await __gifosVideo.kfStats()).filter((r) => r.dir === 'out' && r.slot && r.slot.indexOf('out:stg:') === 0);
        return rows.map((r) => ({ slot: r.slot.slice(0, 20), fenc: r.fenc, kenc: r.kenc }));
      }).catch(() => null);
      check('the stager is still encoding its stg feed (fenc > 0 on a live stg sender)',
        !!stEnc && stEnc.some((r) => r.fenc > 0), stEnc);
    }
  }


  await closeFleet(boxes);
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("FATAL", e); process.exit(1); });
