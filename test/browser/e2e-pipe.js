// e2e-pipe.js — ENCODED PASSTHROUGH (roadmap §9a, mesh-pipe.js): the browser
// gate for forwarding video WITHOUT transcoding it.
//
// LEG 1 — the mechanics, isolated. A -> B -> C chain driven through the
// module's real API: A produces 320x180; B taps its receiver and ships a
// 48px demand-minted carrier whose payloads the worker swaps for A's bytes;
// C is a plain consumer. PASS = C renders the CONTENT's dimensions (whatever
// arrives, it cannot be the 48px carrier), decode advances, the worker wrote
// content frames with zero swap errors, and both sides agree on the codec.
// This is exactly the pipe-probe that established viability (2026-08-04:
// 96% byte-identity, wrote 242 / dropped 0 / kfAsk 0 on the demand mint),
// pinned as a regression gate.
//
// LEG 2 — the real mesh. Six seats at C=2 (a genuinely deep tree, e2e-mosaic's
// shape): every seat must still render a live Stadium (the pipe must never
// cost the room its picture), at least one seat must be actively PIPING
// (jobs routed, frames written), no seat may have fallen back (deny empty —
// this box is VP8-only, so a codec mismatch here is a bug, not a config),
// and a deep seat's Stadium pixels must be CONTENT-sized, not carrier-sized.
//
// Needs: python3 -m http.server 8099 -d site ; node test/servers/relay-local.js
// This suite IGNORES the MEET_CHROME pin on purpose. The encoded-passthrough
// lane is built on RTCRtpScriptTransform, which the gate's pinned chromium-1193
// (Chrome 140) does not have at all — under the pin every assertion here failed
// on `unsupported:true`, reporting the browser's age as a product defect. The
// pin exists for browser/e2e and e2e-media-recovery and is right for them; this
// suite needs the newest build installed, and says so itself.
const { chromium, findChrome } = require('../lib/pw');
const CHROME = findChrome({ ignorePins: true });

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

  // Say WHICH engine is under test, and refuse up front if it cannot host the
  // feature — 8 assertions failing on `unsupported:true` reads as a broken pipe
  // lane when it means "this browser is too old", and that misread cost a gate
  // triage already. Loud and specific, never a silent skip.
  {
    const p = await (await browser.newContext()).newPage();
    const cap = await p.evaluate(() => ({
      ua: (navigator.userAgent.match(/Chrome\/[0-9.]+/) || ['?'])[0],
      scriptTransform: typeof RTCRtpScriptTransform !== 'undefined',
    }));
    console.log('  engine: ' + cap.ua + '  RTCRtpScriptTransform=' + cap.scriptTransform + '\n  binary: ' + CHROME);
    if (!cap.scriptTransform) {
      console.log('FAIL — this browser has no RTCRtpScriptTransform, so the encoded-passthrough');
      console.log('       lane cannot be tested here. That is an ENGINE gap, not a product bug:');
      console.log('       install a newer chromium (Chrome 141+; 149 verified) — note this suite');
      console.log('       deliberately ignores MEET_CHROME, so the pin is not what is limiting it.');
      console.log('1 FAILED');
      await browser.close();
      process.exit(1);
    }
    await p.context().close();
  }

  // ---- LEG 1: the module chain ---------------------------------------------
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(BASE + '/'); // any same-origin page; the module loads below
    await page.addScriptTag({ url: '/js/mesh-pipe.js' });
    const r = await page.evaluate(async () => {
      const MP = GifOS.meshPipe;
      if (!MP || !MP.supported()) return { unsupported: true };
      const sleep2 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      const pair = (a, b) => { a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {}); b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {}); };
      const connect = async (a, b) => { const of = await a.createOffer(); await a.setLocalDescription(of); await b.setRemoteDescription(of); const an = await b.createAnswer(); await b.setLocalDescription(an); await a.setRemoteDescription(an); };
      const src = document.createElement('canvas'); src.width = 320; src.height = 180;
      const sctx = src.getContext('2d'); let n = 0;
      setInterval(() => { sctx.fillStyle = '#123a5e'; sctx.fillRect(0, 0, src.width, src.height); sctx.fillStyle = '#fff'; sctx.font = '20px monospace'; sctx.fillText(String(n++), 8, 28); sctx.fillStyle = 'hsl(' + (n * 17 % 360) + ',80%,50%)'; sctx.fillRect((n * 7) % 300, (n * 11) % 160, 20, 20); }, 66);
      setInterval(() => { src.width = (src.width === 320 ? 322 : 320); }, 2500); // producer kf nudge (generateKeyFrame is absent — measured)
      const srcTrack = src.captureStream(15).getVideoTracks()[0];
      const pcA = new RTCPeerConnection(), pcB = new RTCPeerConnection(), pcB2 = new RTCPeerConnection(), pcC = new RTCPeerConnection();
      pair(pcA, pcB); pair(pcB2, pcC);
      pcA.addTransceiver(srcTrack, { direction: 'sendonly' });
      let tapOk = null;
      pcB.ontrack = (e) => { tapOk = MP.tapReceiver(e.receiver, 'src1'); };
      const carrier = MP.makeCarrier();
      const tx = pcB2.addTransceiver(carrier.track, { direction: 'sendonly' });
      const pipeOk = MP.pipeSender(tx.sender, 'src1', 'job1', carrier);
      const vc = document.createElement('video'); vc.muted = true; vc.autoplay = true; document.body.appendChild(vc);
      pcC.ontrack = (e) => { vc.srcObject = new MediaStream([e.track]); vc.play().catch(() => {}); };
      await connect(pcA, pcB); await connect(pcB2, pcC);
      await sleep2(10000);
      const f0 = vc.getVideoPlaybackQuality ? vc.getVideoPlaybackQuality().totalVideoFrames : 0;
      await sleep2(4000);
      const f1 = vc.getVideoPlaybackQuality ? vc.getVideoPlaybackQuality().totalVideoFrames : 0;
      const st = (await MP.stats()).job1 || null;
      return { tapOk, pipeOk, cW: vc.videoWidth, cH: vc.videoHeight, decodedDelta: f1 - f0, st };
    });
    check('module chain: transforms attach (tap + pipe)', r.tapOk === true && r.pipeOk === true, r.unsupported ? r : undefined);
    check('module chain: consumer renders CONTENT dims, not the 48px carrier', r.cW >= 300 && r.cH >= 170, { cW: r.cW, cH: r.cH });
    check('module chain: decode advances at the consumer (>20 frames / 4s)', r.decodedDelta > 20, { decodedDelta: r.decodedDelta });
    check('module chain: the worker swapped real content frames, zero errors',
      !!r.st && r.st.wrote > 50 && r.st.swapErr === 0, r.st);
    check('module chain: codec guard sees one codec end to end', !!r.st && !!r.st.mime && r.st.mime === r.st.tmplMime, r.st && { mime: r.st.mime, tmplMime: r.st.tmplMime });
    await page.context().close();
  }

  // ---- LEG 2: the real mesh -------------------------------------------------
  {
    const N = 6;
    const room = 'pipe' + Math.random().toString(36).slice(2, 7);
    const pages = [];
    for (let i = 0; i < N; i++) {
      const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 200)));
      await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');
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
    for (const p of pages) {
      await p.evaluate(() => {
        const none = document.getElementById('blur-none'); if (none) none.click();
        const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
      }).catch(() => {});
    }
    // every seat's Stadium must go live — the pipe must never cost the picture
    const live = new Array(N).fill(false);
    const tS = Date.now();
    while (Date.now() - tS < 90000) {
      for (let i = 0; i < N; i++) {
        if (live[i]) continue;
        const m = await pages[i].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
        if (m && m.tile && m.tile.live) live[i] = true;
      }
      if (live.every(Boolean)) break;
      await sleep(2000);
    }
    check('every seat renders a live Stadium with the pipe lane on', live.every(Boolean), { live });
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
      let wrote = 0, primed = 0; for (const k of Object.keys(st)) { wrote += st[k].wrote || 0; primed += st[k].primed || 0; }
      return { enabled: i2.enabled, jobs: i2.jobs.length, deny: i2.deny.length, wrote, primed };
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
    check('no job fell back to transcode (deny empty — VP8-only box, a mismatch is a bug)', totDeny === 0, { totDeny });
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
    //    and called that a 12s bright freeze. Measured on clawbox: of three
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
              stalls.push({ seat: 'P' + i, key: f.key.slice(0, 14), stuckMs: Date.now() - rec.at,
                frames: f.fr, via: f.via, sid: f.sid, bytesDuringStall: f.b - rec.b0, kf, pipe: pw, up });
            }
          }
        }
        await sleep(2000);
      }
      console.log('   MEASURE container swaps on stg/sgs claims during the 36s window: ' + swaps.length
        + (swaps.length ? '  ' + JSON.stringify(swaps) : ''));
      check('THE FREEZE SHAPE: no stg/sgs feed bright-stalls >=12s at any seat over 36s', stalls.length === 0, { stalls });
      // and the stager's own stg encode never parks into silence while staged
      const stEnc = await pages[deepIdx0].evaluate(async () => {
        const rows = (await __gifosVideo.kfStats()).filter((r) => r.dir === 'out' && r.slot && r.slot.indexOf('out:stg:') === 0);
        return rows.map((r) => ({ slot: r.slot.slice(0, 20), fenc: r.fenc, kenc: r.kenc }));
      }).catch(() => null);
      check('the stager is still encoding its stg feed (fenc > 0 on a live stg sender)',
        !!stEnc && stEnc.some((r) => r.fenc > 0), stEnc);
    }
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
