// THE PIPE LANE ON EVERY ENGINE THIS BOX HAS — the cross-engine gate for
// encoded passthrough (site/js/mesh-pipe.js), and the answer to bug-ledger #5
// ("mesh-pipe on Safari is live and untested").
//
// WHY IT IS NOT e2e-pipe. `e2e-pipe.js` is chromium-only BY CONSTRUCTION: it
// calls findChrome({ ignorePins: true }) and exits 1 on any browser without
// RTCRtpScriptTransform. That is right for what it guards (the deep mechanics
// need the newest Blink), but it means the encoded-passthrough lane has never
// once executed on a non-Blink engine — while Safari 16.4+ HAS
// RTCRtpScriptTransform, so the lane is LIVE on every modern iPhone. The only
// cross-engine suite in the repo (e2e-ed-engines) tests Ed25519, not the pipe.
//
// WHAT THIS SUITE ASSERTS, per engine, and why each leg is not optional:
//
//   A. THE ENGINE CONTRACT (every engine installed here).
//      GifOS.meshPipe.supported() must AGREE with the engine's actual
//      RTCRtpScriptTransform. Both directions are bugs and both are silent:
//      supported()=true on an engine without it means every attach throws into
//      a try/catch and the room quietly loses its picture; supported()=false on
//      an engine WITH it means every iPhone pays a full transcode per hop for
//      nothing. Nothing else in the repo checks this on a non-Blink engine.
//
//   B. THE MODULE CHAIN (every engine that HAS the transform).
//      e2e-pipe's LEG 1 — A -> B -> C, B swaps A's encoded bytes into a
//      demand-minted 48px carrier — run for real on that engine. PASS = the
//      consumer decodes CONTENT-sized frames (never the carrier's 48px), the
//      decode counter ADVANCES, the worker wrote content frames with zero swap
//      errors, and content/template mime agree.
//      MEASURED 2026-08-07 on penguin: Firefox 151 (Gecko) passes this in full
//      — wrote 122 / swapErr 0 / VP8==VP8, consumer framesDecoded 94 -> 123 at
//      322x180. The lane is NOT a Blink-only feature; that had never been run.
//
//   C. THE FALLBACK ROOM (an engine that LACKS the transform).
//      The lane self-disables and the mosaic must still deliver: seats form ONE
//      tree over the real relay and a COMPOSITE crosses that tree and ARRIVES
//      PAINTED — content-sized, unmuted, and alive (the decoded-frame counter
//      climbing where the engine populates one; where it does not — headless
//      Firefox reports 0 for every feed — surviving a 10s window content-sized,
//      unmuted and track-live, and the PASS line says which). Ships to Safari below
//      16.4 today, and it is the shape playwright's WebKit gives us natively.
//      If no installed engine lacks the transform, the leg runs anyway on the
//      default engine with RTCRtpScriptTransform DELETED before page scripts
//      (the same "cripple the engine" device e2e-ed-fallback uses for the
//      Safari-16 signer) — so this property is never left unguarded on a box
//      whose browsers are all modern. Which of the two ran is PRINTED.
//
// THE HONEST LIMIT, MEASURED — READ BEFORE "FIXING" LEG B ON WEBKIT.
// Playwright's WebKit CANNOT run leg B, and it is not a GifOS defect:
//   - webkit-2336 (UA Safari 26.5) reports RTCRtpScriptTransform undefined.
//   - The class IS compiled in: `strings` finds JSRTCRtpScriptTransform in
//     libWPEWebKit-2.0.so, and `MiniBrowser --features=help` lists
//     `- WebRTCEncodedTransform (mature)` — the leading '-' is DEFAULT OFF.
//   - It cannot be turned on from here. `--features=+WebRTCEncodedTransform`
//     reaches the process (visible in pw:browser <launching>) and changes
//     nothing, and the NEGATIVE CONTROL settles it: `--features=-PeerConnection`
//     does not remove RTCPeerConnection either. Playwright's WebKit ignores
//     --features for protocol-created pages; its protocol exposes
//     Page.overrideSetting with a fixed 21-value enum that has no feature knob.
//   - Stock WebKitGTK is not an escape hatch either — it has no WebRTC at all
//     (test/README "STOCK WebKitGTK is not the escape hatch", 2026-08-05).
// So on Linux, leg B's non-Blink engine is Firefox, and the Safari half of
// ledger #5 stays with real Apple hardware. Leg C is the part of the Safari
// lane a Linux box CAN answer, and it is answered here rather than assumed.
//
// Needs: python3 -m http.server 8099 -d site ; node test/servers/relay-local.js
const pw = require('../lib/pw');
const need = require('../lib/need');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
// A page that is same-origin and CHEAP: the module chain only needs an origin
// to addScriptTag into, and booting the desktop (index.html) costs an IndexedDB
// seed that has its own failure modes on old/slow browsers.
const ORIGIN_PAGE = BASE + '/browser-support.html';
// FOUR SEATS, NOT THREE. At C=2 a three-seat room (0/0.0, 0/0.1, 0/1.0) needs
// no packing at all — everyone is directly linked, mosIn stays empty at every
// seat and the composite assertion has nothing to be true about. Measured: at
// N=3 no seat ever holds a composite; at N=4 the row-1 pack (x1) is claimed and
// painted. A room too small to make a composite would have passed leg C
// vacuously, which is worse than failing it.
const ROOM_N = parseInt(process.env.PIPE_ROOM_N || '4', 10);

let failures = 0;
/*
 * check(name, cond, data, whyIfFailed)
 *
 * The FOURTH argument exists because this suite grew the exact defect it was
 * written to prevent, twice. A diagnosis written for the failure branch —
 * "relay-local on 8790 died mid-run", "no installed engine has
 * RTCRtpScriptTransform" — was passed as `data`, which prints on PASS too. So
 * the gate host's log carried lines like
 *
 *   PASS — leg C: the relay was STILL THERE when the leg ended
 *     {"relayStillUp":true,"note":"relay-local on 8790 died mid-run — …"}
 *
 * A note that contradicts its own verdict is worse than no note: the next
 * person is reading this log BECAUSE something broke, and that sentence is
 * exactly what they will believe. `data` must be true whatever the outcome;
 * anything that is only true when the assertion FAILED goes here, and is
 * printed only then.
 */
const check = (n, c, d, whyIfFailed) => {
  let tail = (d !== undefined ? '  ' + JSON.stringify(d) : '');
  if (!c && whyIfFailed) tail += '  ' + JSON.stringify({ note: whyIfFailed });
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + tail);
  if (!c) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chromium takes the fake-media switches; webkit/firefox REJECT them (their
// launchers are not Chromium's), so every engine gets only what it accepts.
function launchOpts(engine, exe) {
  const o = { executablePath: exe };
  if (engine === 'chromium') {
    o.args = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
  } else if (engine === 'firefox') {
    // Gecko replaces host candidates with mDNS .local names by default, and a
    // loopback pair then never leaves iceConnectionState 'new' (measured: the
    // module chain gathered nothing until this was off).
    o.firefoxUserPrefs = { 'media.peerconnection.ice.obfuscate_host_addresses': false };
  }
  return o;
}

// The camera every engine can have: neither webkit nor firefox ships a fake
// capture device (real getUserMedia fails with OverconstrainedError /
// NotFoundError), so the canvas-captureStream camera is REQUIRED off chromium,
// not a convenience. Pure page JS, identical on all three.
const CAM = (name, hue) => `(() => { const mk = async () => {
  const c=document.createElement('canvas');c.width=240;c.height=426;const x=c.getContext('2d');
  const paint=()=>{x.fillStyle='hsl(${hue},40%,30%)';x.fillRect(0,0,c.width,c.height);x.fillStyle='#fff';x.font='bold 22px system-ui';x.textAlign='center';x.fillText(${JSON.stringify(name)},c.width/2,c.height/2);
    x.fillStyle='#ff0';x.fillRect((Date.now()/50)%200,8,18,18);};
  paint();setInterval(paint,200);const s=c.captureStream(8);
  try{const ac=new AudioContext();const d=ac.createMediaStreamDestination();for(const t of d.stream.getAudioTracks())s.addTrack(t);}catch(e){}
  return s;};
  if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=mk;navigator.mediaDevices.getDisplayMedia=mk;}
  window.addEventListener('load',()=>{const iv=setInterval(()=>{const cam=document.getElementById('cam'),none=document.getElementById('blur-none');
    if(!cam||!window.__gifosVideo)return; if(none)none.click(); if(cam.classList.contains('off'))cam.click(); else clearInterval(iv);},2000);});
})();`;

// The engine-gap simulator (leg C on a box whose browsers all have the lane).
// Deleting the constructor is exactly what the engine gap looks like to
// mesh-pipe.js's supported(), which is a `typeof RTCRtpScriptTransform` probe.
const NO_TRANSFORM = () => { try { delete window.RTCRtpScriptTransform; } catch (e) { window.RTCRtpScriptTransform = undefined; } };

// ---- capability read: what does this engine actually have? ------------------
async function capsOf(engine, exe) {
  const b = await pw[engine].launch(launchOpts(engine, exe));
  try {
    const p = await (await b.newContext()).newPage();
    // playwright's DEFAULT goto timeout is 30s and this page is two files.
    // Measured 2026-08-07 at loadavg 13: firefox AND webkit both blew it just
    // launching, leg A reported "the capability page loads" FAIL for both, and
    // the box's load became a product red. Nothing here is a latency test.
    await p.goto(ORIGIN_PAGE, { timeout: 120000 });
    await p.addScriptTag({ url: '/js/mesh-pipe.js' });
    return await p.evaluate(() => ({
      ua: navigator.userAgent.slice(0, 90),
      transform: typeof RTCRtpScriptTransform !== 'undefined',
      encodedFrame: typeof RTCEncodedVideoFrame !== 'undefined',
      legacyStreams: !!(window.RTCRtpSender && RTCRtpSender.prototype.createEncodedStreams),
      present: !!(window.GifOS && GifOS.meshPipe),
      supported: !!(window.GifOS && GifOS.meshPipe && GifOS.meshPipe.supported()),
    }));
  } finally { await b.close(); }
}

// ---- LEG B: the module chain, on this engine --------------------------------
async function moduleChain(engine, exe) {
  const b = await pw[engine].launch(launchOpts(engine, exe));
  try {
    const page = await (await b.newContext()).newPage();
    page.on('pageerror', (e) => console.log('  [' + engine + '] PAGEERROR ' + String(e).slice(0, 160)));
    await page.goto(ORIGIN_PAGE, { timeout: 120000 });
    await page.addScriptTag({ url: '/js/mesh-pipe.js' });
    return await page.evaluate(async () => {
      const MP = GifOS.meshPipe;
      if (!MP || !MP.supported()) return { unsupported: true };
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const pair = (a, b2) => { a.onicecandidate = (e) => e.candidate && b2.addIceCandidate(e.candidate).catch(() => {}); b2.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {}); };
      const connect = async (a, b2) => { const of = await a.createOffer(); await a.setLocalDescription(of); await b2.setRemoteDescription(of); const an = await b2.createAnswer(); await b2.setLocalDescription(an); await a.setRemoteDescription(an); };
      const src = document.createElement('canvas'); src.width = 320; src.height = 180;
      const sctx = src.getContext('2d'); let n = 0;
      setInterval(() => { sctx.fillStyle = '#123a5e'; sctx.fillRect(0, 0, src.width, src.height); sctx.fillStyle = '#fff'; sctx.font = '20px monospace'; sctx.fillText(String(n++), 8, 28); sctx.fillStyle = 'hsl(' + (n * 17 % 360) + ',80%,50%)'; sctx.fillRect((n * 7) % 300, (n * 11) % 160, 20, 20); }, 66);
      setInterval(() => { src.width = (src.width === 320 ? 322 : 320); }, 2500); // producer keyframe nudge
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
      await nap(12000);
      // DECODE PROGRESS COMES FROM getStats, NOT getVideoPlaybackQuality.
      // Measured on firefox-1532: totalVideoFrames stayed 0 for the whole run
      // while inbound-rtp framesDecoded went 94 -> 123. A headless engine that
      // never composites the element still decodes; reading the element's
      // playback quality would have reported a dead pipe on a live one.
      const rtp = async (pc) => { let o = null; (await pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') o = { dec: r.framesDecoded || 0, w: r.frameWidth || 0, h: r.frameHeight || 0 }; }); return o; };
      const d1 = await rtp(pcC);
      await nap(5000);
      const d2 = await rtp(pcC);
      const st = (await MP.stats()).job1 || null;
      return { tapOk, pipeOk, d1, d2, elW: vc.videoWidth, elH: vc.videoHeight, st };
    });
  } finally { await b.close(); }
}

// ---- LEG C: a real room where the pipe lane cannot run ----------------------
// Returns the per-seat picture; the assertions live in the caller so the same
// wording is used whether the gap is native (webkit) or simulated.
async function fallbackRoom(engine, exe, cripple) {
  const b = await pw[engine].launch(launchOpts(engine, exe));
  const room = 'pipeng' + Math.random().toString(36).slice(2, 7);
  // ONE DEADLINE FOR THE WHOLE LEG, not a ceiling per wait. Four webkit web
  // processes on four cores is the entire box, and the generous per-step
  // ceilings this leg needs on a busy machine multiply: 4 boots x 2 waits +
  // seating + the composite window is over 20 minutes end to end, which
  // overruns release.sh's 600s browser budget and reports as a TIMEOUT — the
  // one failure shape that looks like silence. Every wait below is clamped to
  // what is left, so the leg always finishes and always says what it got.
  const DEADLINE = Date.now() + parseInt(process.env.PIPE_ROOM_MS || '330000', 10);
  const left = (cap) => Math.max(2000, Math.min(cap, DEADLINE - Date.now()));
  try {
    const pages = [];
    for (let i = 0; i < ROOM_N; i++) {
      // NOTE: no `permissions: ['camera']` — webkit's newContext REJECTS the
      // Chromium permission name outright. The injected camera needs no grant.
      const ctx = await b.newContext();
      await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','E${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
      if (cripple) await ctx.addInitScript(NO_TRANSFORM);
      await ctx.addInitScript({ content: CAM('E' + i, i * 70) });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('  [E' + i + '] PAGEERROR ' + String(e).slice(0, 140)));
      p.on('crash', () => console.log('  [E' + i + '] RENDERER CRASHED'));
      // 'load' waits for every image on the page and 30s is playwright's
      // default: on a contended 4-core box the FOURTH webkit web process took
      // longer than that and the whole leg died as "the room runs at all"
      // before a single seat existed — a host fact wearing a product red.
      // domcontentloaded + the explicit __gifosVideo wait below is both more
      // generous and more meaningful: it waits for the thing we assert on.
      await p.goto(BASE + '/run.html#v=' + room + '&DEBUG=on', { waitUntil: 'domcontentloaded', timeout: left(90000) });
      await p.waitForFunction(() => !!window.__gifosVideo, null, { timeout: left(90000) })
        .catch(() => console.log('  [E' + i + '] __gifosVideo never appeared within 120s'));
      pages.push(p);
      await sleep(1500);
    }
    const coordOf = (p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null);
    let coords = [];
    const t0 = Date.now();
    // 180s, not 90s: four webkit web processes on four cores is the whole box,
    // and this suite is not measuring join LATENCY — it is measuring whether a
    // composite ever crosses. A seat wait tight enough to fail under load turns
    // every busy afternoon into a product red.
    while (Date.now() - t0 < 180000 && Date.now() < DEADLINE) {
      coords = await Promise.all(pages.map(coordOf));
      if (coords.every(Boolean)) break;
      await sleep(2000);
    }
    // Composites are the mosaic products that CROSS the tree: x<n> (a packed
    // row), sdrow:<r> / sdm (the side-deck packs). A seat's own camera is not
    // one, and neither is a direct 1:1 tile — mosIn only ever holds claimed
    // mosaic feeds, so every key here arrived from another seat.
    const isComposite = (k) => /^(x\d|sdrow:|sdm)/.test(k);
    const enabled = [];
    // Every painted composite ever seen, keyed seat:feed, with its first and
    // latest decoded-frame count. A Map, not a single "best": several seats
    // claim several composites and they come and go, so a scalar would keep
    // resetting its own progress window and could never show a counter climb.
    const seen = new Map();
    const claimedAnywhere = new Set();
    const tS = Date.now();
    let live = null;
    // HOW A COMPOSITE IS PROVED ALIVE, and why it is not one rule.
    // feedsInfo().frames is the ELEMENT's getVideoPlaybackQuality().
    // totalVideoFrames, and on headless Firefox that counter is identically 0
    // for every feed while the media is decoding perfectly — the same trap leg
    // B hit and answered with getStats, and then this leg walked straight into
    // it. Measured 2026-08-07: the firefox room painted EIGHT composites
    // (E1:x1, E3:x1, E1/E3:sdm, E0:sdrow:1, E2:sdrow:0, E1/E3:x2) at content
    // size, unmuted, track live — and every one reported frames 0 -> 0, so a
    // counter-climb rule called a working room dead.
    // So: take the STRONGEST signal the engine actually provides, and PRINT
    // which one was used. A counter that moves is proof. A counter the engine
    // never populates is not evidence of a dead feed, and the honest fallback
    // is that the arrival survived a window: same feed, still content-sized,
    // still unmuted, still `live`, at two samples at least LIVE_MS apart. That
    // is weaker than a frame count and it says so out loud — it is never the
    // rule when a real counter exists.
    const LIVE_MS = 10000;
    while (Date.now() - tS < 150000 && Date.now() < DEADLINE) {
      for (let i = 0; i < ROOM_N; i++) {
        const s = await pages[i].evaluate(() => ({
          en: __gifosVideo.pipeInfo().enabled,
          feeds: __gifosVideo.feedsInfo(),
        })).catch(() => null);
        if (!s) continue;
        enabled[i] = s.en;
        for (const f of s.feeds) {
          if (!isComposite(f.key)) continue;
          claimedAnywhere.add('E' + i + ':' + f.key);
          if (!(f.vw > 0 && f.ready >= 2 && f.vMuted === false && f.vState === 'live')) continue;
          const k = 'E' + i + ':' + f.key;
          const rec = seen.get(k);
          const now = Date.now();
          if (!rec) seen.set(k, { seat: i, key: f.key, w: f.vw, h: f.vh, fr0: f.frames, fr1: f.frames, at0: now, at1: now });
          else { rec.fr1 = f.frames; rec.w = f.vw; rec.h = f.vh; rec.at1 = now; }
        }
      }
      const rows = [...seen.entries()];
      const climbed = rows.find(([, r]) => r.fr1 > r.fr0);
      if (climbed) { live = [climbed[0], { ...climbed[1], proof: 'decoded-frame counter climbed ' + climbed[1].fr0 + '->' + climbed[1].fr1 }]; break; }
      // only fall back when NO composite anywhere reports a usable counter —
      // one engine-wide fact, never a per-feed excuse
      const anyCounter = rows.some(([, r]) => r.fr1 > 0);
      const held = rows.find(([, r]) => r.at1 - r.at0 >= LIVE_MS);
      if (!anyCounter && held) {
        live = [held[0], { ...held[1], proof: 'content-sized, unmuted and track-live for ' + Math.round((held[1].at1 - held[1].at0) / 1000)
          + 's (this engine reports no element frame counter — 0 for every feed)' }];
        break;
      }
      await sleep(3000);
    }
    // THE STACK CAN VANISH MID-RUN, and then every assertion below lies.
    // Measured 2026-08-07: another session's `stop_all` killed relay-local
    // while leg C was seating; all four seats stayed null and the suite
    // reported "the room never formed" — a shared-box fact wearing a product
    // red. need() only proves the relay was up when the suite STARTED, so the
    // failure path re-asks, and says which of the two happened.
    const relayStillUp = await new Promise((res) => {
      const s = require('net').connect({ port: 8790, host: '127.0.0.1' });
      const done = (v) => { try { s.destroy(); } catch (e) {} res(v); };
      s.setTimeout(1500); s.once('connect', () => done(true));
      s.once('timeout', () => done(false)); s.once('error', () => done(false));
    });
    return { coords, enabled, relayStillUp, best: live ? { k: live[0], ...live[1] } : null,
      painted: [...seen.keys()], claimed: [...claimedAnywhere] };
  } finally { await b.close(); }
}

// ---- the run ----------------------------------------------------------------
(async () => {
  await need({ 8099: 'the site (python3 -m http.server 8099 -d site)', 8790: 'relay-local (node test/servers/relay-local.js)' });

  // Chromium is resolved the same way e2e-pipe does NOT: no ignorePins. This
  // suite has no minimum-Blink requirement — an engine WITHOUT the transform is
  // a subject here, not a blocker — so it takes whatever the box normally runs.
  const engines = [];
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const exe = pw.findEngine(name);
    if (exe) engines.push({ name, exe });
    else console.log('  [engine] ' + name + ' not installed on this box — not exercised here');
  }
  check('at least one engine is installed', engines.length > 0, { engines: engines.map((e) => e.name) });
  if (!engines.length) { console.log('\n' + failures + ' FAILED'); process.exit(1); }

  // ---- LEG A: the engine contract, everywhere -------------------------------
  const caps = {};
  for (const e of engines) {
    let c;
    try { c = await capsOf(e.name, e.exe); }
    catch (err) { check(e.name + ': the capability page loads', false, String(err).slice(0, 200)); continue; }
    caps[e.name] = c;
    console.log('  [' + e.name + '] ' + c.ua);
    console.log('      RTCRtpScriptTransform=' + c.transform + '  RTCEncodedVideoFrame=' + c.encodedFrame
      + '  legacy createEncodedStreams=' + c.legacyStreams + '  meshPipe.supported()=' + c.supported);
    check(e.name + ': mesh-pipe.js loads at all', c.present === true, c);
    check(e.name + ': supported() AGREES with the engine (no lane claimed that cannot run, none refused that can)',
      c.supported === c.transform, { supported: c.supported, RTCRtpScriptTransform: c.transform });
  }

  // ---- LEG B: the module chain wherever the lane can actually run -----------
  const chainRan = [];
  for (const e of engines) {
    const c = caps[e.name];
    if (!c || !c.transform) continue;
    let r;
    try { r = await moduleChain(e.name, e.exe); }
    catch (err) { check(e.name + ' chain: the page survives the run', false, String(err).slice(0, 200)); continue; }
    if (r.unsupported) { check(e.name + ' chain: supported() still true inside the page', false, r); continue; }
    chainRan.push(e.name);
    const dec = r.d2 && r.d1 ? r.d2.dec - r.d1.dec : -1;
    check(e.name + ' chain: both transforms attach (tap + pipe)', r.tapOk === true && r.pipeOk === true, { tapOk: r.tapOk, pipeOk: r.pipeOk });
    check(e.name + ' chain: the consumer decodes CONTENT-sized frames, not the 48px carrier',
      !!r.d2 && r.d2.w >= 300 && r.d2.h >= 170, r.d2);
    check(e.name + ' chain: decode ADVANCES at the consumer (>20 frames / 5s)', dec > 20, { dec, d1: r.d1, d2: r.d2 });
    check(e.name + ' chain: the worker swapped real content frames, zero errors',
      !!r.st && r.st.wrote > 50 && r.st.swapErr === 0, r.st);
    check(e.name + ' chain: one codec end to end (content mime === template mime)',
      !!r.st && !!r.st.mime && r.st.mime === r.st.tmplMime, r.st && { mime: r.st.mime, tmplMime: r.st.tmplMime });
  }

  // ---- LEG C: the fallback room --------------------------------------------
  // Prefer a NATIVE gap (webkit) — no simulation, the engine really is what
  // ships to a pre-16.4 Safari. Otherwise cripple the default engine, so a box
  // whose browsers are all modern still guards the property.
  // PIPE_ROOM_ENGINE pins the subject. It exists for ONE reason: on a box with
  // webkit the native gap always wins, so the SIMULATED path — the one every
  // other box in the fleet will actually run — would never execute here, and an
  // unexecuted path in a gate suite is the exact rot this repo has been bitten
  // by. Pin it to a transform-carrying engine to exercise the simulation.
  const pin = process.env.PIPE_ROOM_ENGINE;
  let subject = (pin && engines.find((e) => e.name === pin))
    || engines.find((e) => e.name === 'webkit' && caps.webkit && !caps.webkit.transform)
    || engines.find((e) => caps[e.name] && !caps[e.name].transform);
  if (pin && !subject) { check('PIPE_ROOM_ENGINE names an installed engine', false, { pin, installed: engines.map((e) => e.name) }); }
  if (!subject) subject = engines[0];
  // CRIPPLE UNLESS THE GAP IS POSITIVELY MEASURED. The first version read
  // `caps[subject].transform` as a truthy test, so an engine whose capability
  // read FAILED — caps entry missing entirely — came out as "gap=NATIVE" and
  // the room ran with no cripple at all. Measured 2026-08-07: firefox's
  // capability page timed out at loadavg 13, and leg C then announced
  // "engine=firefox gap=NATIVE (this engine genuinely has no
  // RTCRtpScriptTransform)" about the one engine here that HAS it. Had the
  // room come up, the leg would have printed PASS while exercising the lane it
  // claims is off — a guard that tests the opposite of its own sentence.
  // So: NATIVE requires `transform === false`, measured. Unknown means
  // simulate, and say the reason out loud.
  const known = caps[subject.name];
  const cripple = !(known && known.transform === false);
  check('leg C: the subject engine had its capability actually MEASURED (an unread engine can never be called a native gap)',
    !!known, { engine: subject.name, transform: known ? known.transform : null },
    'capsOf never read this engine, so its gap is UNKNOWN. Leg C is simulating, which is the safe choice — but it is not the coverage this box could have given, and on a box with webkit it means the NATIVE gap went unexercised.');
  console.log('  [leg C] engine=' + subject.name + (cripple
    ? '  gap=SIMULATED (RTCRtpScriptTransform deleted before page scripts) because '
      + (!known ? 'this engine\'s capability was never read' : 'this engine HAS the transform')
    : '  gap=NATIVE (this engine genuinely has no RTCRtpScriptTransform)'));

  let room;
  try { room = await fallbackRoom(subject.name, subject.exe, cripple); }
  catch (err) { check('leg C: the room runs at all on ' + subject.name, false, String(err).slice(0, 300)); room = null; }
  if (room) {
    const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '?');
    check('leg C: the relay was STILL THERE when the leg ended (nothing else on this box killed it)',
      room.relayStillUp === true,
      { relayStillUp: room.relayStillUp },
      'relay-local on 8790 died mid-run — every leg C assertion below is about a room with no door, not about the pipe lane. Restart it and re-run before reading anything into them.');
    const seated = room.coords.every(Boolean);
    const distinct = new Set(room.coords.filter(Boolean).map(cstr)).size === room.coords.filter(Boolean).length;
    check('leg C (' + subject.name + '): every seat is seated, on distinct coords', seated && distinct, room.coords.map(cstr));
    check('leg C (' + subject.name + '): the pipe lane REPORTS ITSELF OFF at every seat (it cannot run here)',
      room.enabled.length === ROOM_N && room.enabled.every((x) => x === false), room.enabled);
    // THE LOAD-BEARING ASSERTION. A composite is a picture PACKED BY ANOTHER
    // SEAT and shipped across the tree; arriving means it decoded to content
    // size and its track is unmuted (media really flowing, not a
    // claimed-but-dead feed). `proof` in the payload names the liveness signal
    // that actually carried it — see the LIVE_MS block for why that is not one
    // fixed rule across engines.
    check('leg C (' + subject.name + '): a COMPOSITE crosses the tree and ARRIVES — content-sized, unmuted, and alive',
      !!room.best && room.best.w > 0,
      room.best
        ? { seat: 'E' + room.best.seat, key: room.best.key, dims: room.best.w + 'x' + room.best.h, proof: room.best.proof, alsoPainted: room.painted.length }
        // The forensic that tells the two failures apart: NOTHING CLAIMED means
        // the room never packed a composite (too small / never converged);
        // claimed-but-never-painted means it arrived dead — the feed exists,
        // its track does not carry.
        : { claimedNowhere: room.claimed.length === 0, claimed: room.claimed, painted: room.painted });
  }

  // ---- coverage is REPORTED, never silent ----------------------------------
  // A box that quietly lost an engine would otherwise keep printing ALL PASS
  // while testing less than it did yesterday — the rot pattern that kept the
  // app-in-a-meeting drills dead for their whole life.
  console.log('  [engines installed] ' + engines.map((e) => e.name).join(', '));
  console.log('  [chain leg ran on ] ' + (chainRan.join(', ') || 'NOTHING'));
  console.log('  [room  leg ran on ] ' + subject.name + (cripple ? ' (simulated gap)' : ' (native gap)'));
  check('the module chain ran on at least one engine that has the transform', chainRan.length > 0,
    { chainRan, installed: engines.map((e) => e.name) },
    'no installed engine has RTCRtpScriptTransform, so the encoded lane was never exercised at all — install a newer chromium (141+) or a firefox.');
  check('every installed engine had its contract checked', Object.keys(caps).length === engines.length,
    { checked: Object.keys(caps), installed: engines.map((e) => e.name) });

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
