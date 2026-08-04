// pipe-freeze-probe.js — the multi-box client driver for the stg-pipe freeze
// hunt (roadmap §9a, "stg scoped out" in 9bf885d). A TOOL, not a gate.
//
// WHY THIS EXISTS. Piping camera-origin stg:* forwards froze roughly one
// receiver per run (bright-and-stalled 120s+, different seat every run) on a
// 6-Chromium 4-core box running at ~1fps — which cannot separate (a) the
// camera keyframe lever, (b) an mx-kf walk flaw across real hops, (c) a
// type-match starvation artifact that only exists at crawl fps. This tool runs
// 1-2 clients per box across DEVICES (the ONE-BOX law, test/README.md) with
// Chromium's fake DEVICE camera (motion at 30fps, real device-class track —
// NOT meet.js's canvas swatch, which carries .canvas and would take kfNeed's
// packer branch instead of the camera applyConstraints branch under test).
//
// Run one instance per box, all pointing at the same room/base/relay:
//   node test/tools/pipe-freeze-probe.js --base http://<ip>:8099 \
//     --relay ws://<ip>:8795 --room frz1 --label nvidia --n 2 --expect 6
// and on exactly one box (started LAST, so its client seats DEEP):
//   ... --label stager --n 1 --expect 6 --stage
//
// Prints one JSONL line per sample per client (grep the label), plus EVENT
// lines: SEATED, STAGED, FREEZE (a held stg:*/sgs feed whose decoded frame
// counter stops advancing >=FREEZE_S while its track is live and unmuted —
// the exact bright-frozen shape), UNFREEZE, and a final SUMMARY.
// --pipe-stg off restores the shipped stg exclusion per-client (A/B lever;
// needs the experimental run.html that reads localStorage gifos_pipe_stg).
const { chromium, CHROME } = require('../lib/pw');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const nx = process.argv[i + 1]; if (nx === undefined || nx.startsWith('--')) args[k] = true; else { args[k] = nx; i++; } }
}
const BASE = args.base || 'http://127.0.0.1:8099';
const RELAY = args.relay || 'ws://127.0.0.1:8790';
const ROOM = args.room || 'frz';
const LABEL = args.label || 'box';
const N = +(args.n || 1);
const EXPECT = +(args.expect || 6);
const MESH_C = +(args['mesh-c'] || 2);
const DURATION = +(args.duration || 300) * 1000;
const SAMPLE = +(args.sample || 2000);
const STAGE = !!args.stage;
const PIPE_STG = String(args['pipe-stg'] || 'on');
const FREEZE_S = +(args['freeze-s'] || 12); // seconds without frame advance = frozen
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const ev = (o) => console.log(JSON.stringify(Object.assign({ t: new Date().toISOString().slice(11, 19), label: LABEL }, o)));

(async () => {
  const origin = new URL(BASE).origin;
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests',
      '--unsafely-treat-insecure-origin-as-secure=' + origin,
    ],
  });
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay',${JSON.stringify(RELAY)});localStorage.setItem('gifos_name',${JSON.stringify(LABEL + i)});localStorage.setItem('gifos_pipe_stg',${JSON.stringify(PIPE_STG)});}catch(e){}; window.GIFOS_SCALE={C:${MESH_C}};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => ev({ ev: 'PAGEERROR', i, err: String(e).slice(0, 200) }));
    await page.goto(BASE + '/run.html#v=' + ROOM + '&DEBUG=on');
    pages.push(page);
    await sleep(1500);
  }
  // camera on + No blur, poll until both stick (e2e-pipe's shape)
  for (const p of pages) {
    p.evaluate(() => new Promise((done) => {
      let n2 = 0;
      const iv = setInterval(() => {
        const none = document.getElementById('blur-none'); if (none) none.click();
        const cam = document.getElementById('cam');
        if (cam && cam.classList.contains('off')) cam.click();
        if ((cam && !cam.classList.contains('off')) || ++n2 > 30) { clearInterval(iv); done(); }
      }, 1500);
    })).catch(() => {});
  }
  // seated?
  const coords = new Array(N).fill(null);
  const t0 = now();
  while (now() - t0 < 90000) {
    for (let i = 0; i < N; i++) {
      if (coords[i]) continue;
      const c = await pages[i].evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null);
      if (c) { coords[i] = c; ev({ ev: 'SEATED', i, coord: c.pc + '/' + c.r + '.' + c.i }); }
    }
    if (coords.every(Boolean)) break;
    await sleep(1500);
  }
  if (!coords.every(Boolean)) ev({ ev: 'SEAT-TIMEOUT', coords });

  // the stager steps up once the room is full
  if (STAGE) {
    const si = N - 1;
    const tW = now();
    let parts = 0;
    while (now() - tW < 120000) {
      parts = await pages[si].evaluate(() => __gifosVideo.participants()).catch(() => 0);
      if (parts >= EXPECT) break;
      await sleep(1500);
    }
    const c = await pages[si].evaluate(() => __gifosVideo.meshCoord()).catch(() => null);
    if (c && c.pc === 0) ev({ ev: 'STAGE-WARN', note: 'stager seat is SHALLOW (pc=0) — wanted deep', coord: c });
    const ok = await pages[si].evaluate(() => __gifosVideo.stageForTest(true)).catch(() => null);
    ev({ ev: 'STAGED', i: si, ok, parts, coord: c && (c.pc + '/' + c.r + '.' + c.i) });
  }

  // ---- the sampling loop ----------------------------------------------------
  const lastAdvance = new Map(); // `${i}:${key}` -> { frames, at, frozen }
  const freezes = [];
  const tEnd = now() + DURATION;
  while (now() < tEnd) {
    for (let i = 0; i < N; i++) {
      const s = await pages[i].evaluate(async (kfCur) => {
        const g = window.__gifosVideo;
        const pi = g.pipeInfo();
        const st = await g.pipeStats();
        const chains = {};
        for (const jk of pi.jobs) { try { chains[jk] = GifOS.meshPipe.chain(jk); } catch (e) {} }
        let kf = [];
        try { kf = (await g.kfStats()).filter((r) => (r.slot && (r.slot.indexOf('stg') >= 0 || r.slot.indexOf('sgs') >= 0)) || (r.dir === 'out' && r.kenc > 0)); } catch (e) {}
        // the dormancy/claim picture for the stg lane: which of MY jobs are
        // parked, whose copy I claim (via+sid), what standby I hold, and the
        // demand state I broadcast — the park/wake flap discriminator
        let mon = null;
        try {
          const m = g.monInfo();
          const isStg = (s) => s.indexOf('stg') >= 0 || s.indexOf('sgs') >= 0;
          mon = {
            jobs: m.jobs.filter((j) => isStg(j.jk)).map((j) => j.jk.slice(0, 24) + (j.active ? ' ON' : ' PARKED')),
            claims: m.claims.filter((cl) => isStg(cl.rk)).map((cl) => cl.rk.slice(0, 18) + ' via=' + cl.via.slice(0, 6) + ' sid=' + cl.sid),
            standby: m.standby.filter((s) => isStg(s.rk)).map((s) => s.rk.slice(0, 18) + ' via=' + s.via.slice(0, 6) + ' sid=' + s.sid),
            demand: m.demand.filter((d) => isStg(d.k)).map((d) => d.k.slice(0, 26) + '=' + d.v),
          };
        } catch (e) {}
        const kl = (window.__kfLog || []);
        const dog = (window.__dogLog || []).slice(-2);
        return {
          coord: g.meshCoord(), parts: g.participants(),
          stage: g.stageInfo().stagers.map((x) => x.id),
          feeds: g.feedsInfo().filter((f) => f.key.indexOf('stg:') === 0 || f.key === 'sgs'),
          pipes: pi.jobs, deny: pi.deny, stats: st, chains,
          kf, mon, dog, kflog: kl.slice(kfCur), kfTot: kl.length,
        };
      }, (lastAdvance.get('kfcur:' + i) || { frames: 0 }).frames).catch((e) => ({ err: String(e).slice(0, 120) }));
      if (s.err) { ev({ ev: 'SAMPLE-ERR', i, err: s.err }); continue; }
      lastAdvance.set('kfcur:' + i, { frames: s.kfTot || 0 });
      const line = {
        i, coord: s.coord ? s.coord.pc + '/' + s.coord.r + '.' + s.coord.i : '?', parts: s.parts,
        stage: s.stage.length,
        feeds: s.feeds.map((f) => f.key.slice(0, 14) + ' ' + f.vw + 'x' + f.vh + ' fr=' + f.frames + (f.vMuted ? ' MUTED' : '')),
        deny: s.deny, pipes: {}, mon: s.mon || null,
        kf: (s.kf || []).map((r) => (r.dir === 'in'
          ? 'in ' + (r.slot || '?').slice(0, 22) + '<' + r.pid + ' fdec=' + r.fdec + ' kdec=' + r.kdec + ' pliTx=' + r.pliTx + ' nackTx=' + r.nackTx + ' drop=' + r.drop + ' lost=' + r.lost + ' ' + r.fw + 'x' + r.fh + '@' + r.fps
          : 'out ' + (r.slot || '?').slice(0, 22) + '>' + r.pid + ' fenc=' + r.fenc + ' kenc=' + r.kenc + ' pliRx=' + r.pliRx + ' nackRx=' + r.nackRx + ' ' + r.fw + 'x' + r.fh + '@' + r.fps + (r.qlim && r.qlim !== 'none' ? ' QLIM=' + r.qlim : ''))),
        kflog: s.kflog || [],
        dog: s.dog || [],
      };
      for (const jk of s.pipes) {
        const w = s.stats[jk] || {};
        const ch = s.chains[jk] || {};
        line.pipes[jk] = 'seen=' + (w.seen || 0) + ' q=' + (w.q || 0) + ' tmpl=' + (w.tmpl || 0) + ' wrote=' + (w.wrote || 0)
          + ' primed=' + (w.primed || 0) + ' drop=' + (w.dropped || 0) + ' kfAsk=' + (w.kfAsk || 0)
          + ' kdrop=' + (w.kdrop || 0) + ' nkDrop=' + (w.nkDrop || 0) + ' skr=' + (w.skr || 0) + (w.paused ? ' PAUSED' : '') + (w.needKey ? ' NEEDKEY' : '')
          + ' want=' + (ch.wants || 0) + ' mint=' + (ch.mints == null ? '?' : ch.mints);
      }
      ev(line);
      // freeze detection on receive-side stg/sgs feeds — KEYED BY THE CLAIM
      // IDENTITY (via+sid from mon.claims): a claim switch installs a
      // different <video> whose cumulative frame counter sits below the old
      // high-water, which read as 12s of phantom stall. A switch resets the
      // baseline (and is reported as its own CLAIM-SWITCH event — steady-
      // state flapping is a defect in its own right, frza9).
      const claimId = (fkey) => {
        for (const c of ((s.mon && s.mon.claims) || [])) {
          if (c.slice(0, fkey.slice(0, 18).length) === fkey.slice(0, 18)) return c.slice(c.indexOf('via=')); // 'via=… sid=…'
        }
        return '?';
      };
      for (const f of s.feeds) {
        const k = i + ':' + f.key;
        const cid = claimId(f.key);
        const rec = lastAdvance.get(k) || { frames: -1, at: now(), frozen: false, cid };
        const bright = f.vw > 0 && f.vState === 'live' && f.vMuted === false;
        if (rec.cid !== cid) {
          if (rec.cid && rec.cid !== '?') ev({ ev: 'CLAIM-SWITCH', i, key: f.key.slice(0, 18), from: rec.cid, to: cid, frozenBefore: !!rec.frozen });
          lastAdvance.set(k, { frames: f.frames, at: now(), frozen: false, cid });
          continue;
        }
        if (f.frames > rec.frames) {
          if (rec.frozen) { ev({ ev: 'UNFREEZE', i, key: f.key, stuckMs: now() - rec.at }); }
          lastAdvance.set(k, { frames: f.frames, at: now(), frozen: false, cid });
        } else if (bright && !rec.frozen && now() - rec.at > FREEZE_S * 1000) {
          rec.frozen = true; rec.frozeAt = now();
          lastAdvance.set(k, rec);
          freezes.push({ i, key: f.key, at: new Date().toISOString() });
          ev({ ev: 'FREEZE', i, key: f.key, feed: f, claim: cid, pipes: line.pipes, deny: s.deny });
        }
      }
    }
    await sleep(SAMPLE);
  }
  const stillFrozen = [...lastAdvance.entries()].filter(([, r]) => r.frozen).map(([k]) => k);
  ev({ ev: 'SUMMARY', freezes: freezes.length, list: freezes, stillFrozen });
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
