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
// THE MESH LEGS LIVE IN e2e-pipe-mesh.js NOW (2026-08-17). This file is the
// half ONE MACHINE CAN HONESTLY ANSWER: no room, no relay, no seating, no
// coverage lottery — two pages driving the module's own API, deterministic, and
// green on every box that can host the feature. The other half (six seats at
// C=2, the live Stadium at every seat, the staged flood over hot pipes, and
// leg 3's freeze detector) needs a real ROOM on real MACHINES and now declares
// that with test/lib/fleet.js. Splitting them is the point: as ONE file, a fleet
// declaration would have taken these nine deterministic assertions — including
// the only isolated guard on the detached-buffer fan bug — off every box that
// has no fleet. Keep them here, and keep them cheap.
//
// Needs: python3 -m http.server 8099 -d site   (no relay: nothing here joins a room)
// This suite IGNORES the MEET_CHROME pin on purpose. The encoded-passthrough
// lane is built on RTCRtpScriptTransform, which the gate's pinned chromium-1193
// (Chrome 140) does not have at all — under the pin every assertion here failed
// on `unsupported:true`, reporting the browser's age as a product defect. The
// pin exists for browser/e2e and e2e-media-recovery and is right for them; this
// suite needs the newest build installed, and says so itself.
const { chromium, findChrome } = require('../lib/pw');
const CHROME = findChrome({ ignorePins: true });

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
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

  // ---- LEG 1B: ONE TAP, TWO PIPES — the fan-out leg 1 could never see -------
  //
  // Leg 1 runs a SINGLE pipe on a tap and has passed 100% forever. The whole
  // point of the lane is the one-encoder fan (§9b): N forwards of one feed off
  // ONE tap. That fan had no isolated guard at all, and a bug living in it was
  // only ever visible through leg 3's six-browser mesh — where it took twelve
  // hypotheses and two retracted findings to corner, because in a mesh every
  // number is contestable (docs/bug-pipe-stg-freeze-2026-08-05.md).
  //
  // The bug: the tap copies each content frame ONCE and shared that ArrayBuffer
  // across every sibling's queue, and writing a frame DETACHES it — so the
  // first pipe to write neutered the frame for its siblings, which then shipped
  // zero-length payloads with every counter reading healthy. Measured here,
  // before the fix: 247 writes -> 42 packets -> 23 frames decoded on one leg,
  // against 225 -> 237 -> 225 on its sibling.
  //
  // This leg is deterministic (no room, no relay, no coverage lottery) and it
  // reds hard on the unfixed module. Any future change to the tap's queueing or
  // the pipe's swap answers to it.
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(BASE + '/');
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
      setInterval(() => { src.width = (src.width === 320 ? 322 : 320); }, 2500);
      const srcTrack = src.captureStream(15).getVideoTracks()[0];
      const pcA = new RTCPeerConnection(), pcB = new RTCPeerConnection();
      pair(pcA, pcB);
      pcA.addTransceiver(srcTrack, { direction: 'sendonly' });
      pcB.ontrack = (e) => { MP.tapReceiver(e.receiver, 'fan1'); };
      await connect(pcA, pcB);
      const legs = [];
      for (let i = 0; i < 2; i++) {
        const up = new RTCPeerConnection(), down = new RTCPeerConnection();
        pair(up, down);
        const carrier = MP.makeCarrier();
        const tx = up.addTransceiver(carrier.track, { direction: 'sendonly' });
        const pipeId = 'fan' + (i + 1);
        MP.pipeSender(tx.sender, 'fan1', pipeId, carrier);
        const v = document.createElement('video'); v.muted = true; v.autoplay = true; document.body.appendChild(v);
        down.ontrack = (e) => { v.srcObject = new MediaStream([e.track]); v.play().catch(() => {}); };
        await connect(up, down);
        legs.push({ pipeId, v, down });
      }
      await sleep2(12000);
      const f0 = legs.map((l) => l.v.getVideoPlaybackQuality().totalVideoFrames);
      await sleep2(4000);
      const st = await MP.stats();
      const out = [];
      for (let i = 0; i < legs.length; i++) {
        const l = legs[i];
        let inb = null;
        try { (await l.down.getStats()).forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'video') inb = { frecv: s.framesReceived, fdec: s.framesDecoded, pkt: s.packetsReceived, lost: s.packetsLost }; }); } catch (e) {}
        out.push({ pipeId: l.pipeId, decoded4s: l.v.getVideoPlaybackQuality().totalVideoFrames - f0[i],
          vw: l.v.videoWidth, vh: l.v.videoHeight, w: st[l.pipeId] || null, inb });
      }
      return { legs: out };
    });
    const L = (r.legs || []);
    check('fan-out (2 pipes, 1 tap): both siblings attach and write content',
      L.length === 2 && L.every((x) => x.w && x.w.wrote > 50 && x.w.swapErr === 0),
      r.unsupported ? r : L.map((x) => ({ id: x.pipeId, wrote: x.w && x.w.wrote, swapErr: x.w && x.w.swapErr })));
    // THE ROOT CAUSE, ASSERTED DIRECTLY. A swap that hands the sink an
    // already-detached buffer ships an empty payload and is silent everywhere
    // else — no drop, no error, no loss. Count it, and allow none.
    check('fan-out: no sibling ever swaps a DETACHED buffer (one owner per frame)',
      L.length === 2 && L.every((x) => x.w && x.w.detached === 0),
      L.map((x) => ({ id: x.pipeId, detached: x.w && x.w.detached, wrote: x.w && x.w.wrote })));
    // The consequence, measured end to end at BOTH consumers: what the worker
    // wrote has to reach a decoder. The broken arm delivered 9% on one leg and
    // 100% on its sibling, so a per-leg ratio is the discriminator — a mean
    // would have passed.
    check('fan-out: every sibling DELIVERS — frames written reach a decoder at both consumers',
      L.length === 2 && L.every((x) => x.inb && x.w && x.w.wrote > 0 && x.inb.fdec / x.w.wrote > 0.5),
      L.map((x) => ({ id: x.pipeId, wrote: x.w && x.w.wrote, frecv: x.inb && x.inb.frecv,
        fdec: x.inb && x.inb.fdec, pkt: x.inb && x.inb.pkt,
        ratio: x.inb && x.w && +(x.inb.fdec / x.w.wrote).toFixed(2) })));
    check('fan-out: both consumers keep decoding CONTENT, not the carrier',
      L.length === 2 && L.every((x) => x.decoded4s > 20 && x.vw >= 300 && x.vh >= 170),
      L.map((x) => ({ id: x.pipeId, decoded4s: x.decoded4s, vw: x.vw, vh: x.vh })));
    await page.context().close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
