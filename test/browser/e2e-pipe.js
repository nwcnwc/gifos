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
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

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
    {
      const stalls = [];
      const last = new Map(); // `${i}:${key}` -> { fr, at }
      const tW0 = Date.now();
      while (Date.now() - tW0 < 36000) {
        for (let i = 0; i < N; i++) {
          const feeds = await pages[i].evaluate(() =>
            __gifosVideo.feedsInfo().filter((f) => f.key.indexOf('stg:') === 0 || f.key === 'sgs')
              .map((f) => ({ key: f.key, fr: f.frames, vw: f.vw, muted: f.vMuted, state: f.vState }))).catch(() => []);
          for (const f of feeds) {
            const k = i + ':' + f.key;
            const rec = last.get(k);
            const bright = f.vw > 0 && f.state === 'live' && f.muted === false;
            if (!rec || f.fr > rec.fr) { last.set(k, { fr: f.fr, at: Date.now() }); continue; }
            if (bright && Date.now() - rec.at >= 12000 && !rec.hit) {
              rec.hit = true;
              stalls.push({ seat: 'P' + i, key: f.key.slice(0, 14), stuckMs: Date.now() - rec.at });
            }
          }
        }
        await sleep(2000);
      }
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
