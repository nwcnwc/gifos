/*
 * mesh-pipe.js — ENCODED PASSTHROUGH for forwarded media (roadmap §9a).
 *
 * A browser cannot forward video without re-encoding it: ontrack hands you raw
 * decoded frames, so every mosaic forward in run.html silently pays a full
 * transcode — generation loss (mush), encoder latency on the critical path at
 * every hop, and one encoder PER down-link for the same picture (the watts).
 * This module removes the transcode: the compressed bytes a seat RECEIVES are
 * shipped onward untouched, and the seat decodes only once, locally, to paint
 * its own screen.
 *
 * HOW — measured on the pinned Chromium 141 (pipe-probe, 2026-08-04), because
 * the obvious designs are all silently rejected and the working one is not
 * guessable:
 *   - Cross-transformer injection NEVER ships. Writing a received frame (or
 *     any constructed clone — even one built from this sender's own frame via
 *     the RTCEncodedVideoFrame constructor) into a sender's writable resolves
 *     the write promise and delivers NOTHING: the sink accepts only the exact
 *     frame objects it handed out of this transformer's readable. Measured:
 *     59-60 writes, 0 packets, no error, four variants.
 *   - Payload SWAP on the sender's own frames ships fine, and packetization is
 *     content-agnostic (doubled bytes shipped; zeroed bytes shipped). So: run
 *     a TINY dummy encoder on this sender as a frame-TEMPLATE mint, and put
 *     the forwarded bytes into its frames. ~32px templates ≈ hundreds of times
 *     less encode work than re-encoding the content.
 *   - COPY EARLY. Writing a frame onward (even to its own local decoder pipe)
 *     DETACHES frame.data — a stashed frame object reads back empty. Bytes are
 *     copied the moment a frame is seen, before anything else touches it.
 *   - TYPE-MATCH or the descriptor lies. A keyframe's bytes on a delta-typed
 *     template make the depacketizer mislabel the frame and the far decoder
 *     rejects the stream. Content frames queue FIFO (reference chains — never
 *     skip); key content waits for a key template. The far end's normal PLI
 *     reaches THIS hop's dummy encoder and mints key templates on demand, so
 *     the wait is one RTCP round trip, not a policy.
 *   - Sender-side transformer.generateKeyFrame() DOES NOT EXIST here (kfA:
 *     'absent'), but receiver-side transformer.sendKeyFrameRequest() DOES
 *     (measured 2026-08-04: a key lands in 21-72ms from camera, canvas and
 *     carrier upstreams alike) — and WebRTC emits NO periodic keyframes at
 *     all (1 key in 20s of healthy flow: the initial one), so every key must
 *     be ASKED for. The tap asks its own upstream hop-locally whenever a
 *     routed pipe needs key content (route, unpause, overflow, drop streaks,
 *     the consumer-PLI tunnel); at a piped upstream the resulting key
 *     template against a delta-only queue re-fires the same ask THERE, so
 *     the request chains hop-by-hop to the producer's real encoder entirely
 *     in RTCP + worker logic. The 'kf-need' page event remains as fallback
 *     (no-SKR browsers) — its old primary role, a DC walk up the claim chain
 *     ending in a producer-side capture nudge, is what FROZE whole rooms
 *     when the producer was a blur pipe (the stg freeze, frza runs).
 *   - CODEC GUARD at runtime, not SDP: every encoded frame's metadata carries
 *     mimeType. The worker compares content vs template per-pipe and reports a
 *     mismatch so the page can fall back to the transcode path for that job.
 *     (The pinned test Chromium has NO H.264 — everything negotiates VP8 — so
 *     H264-vs-VP8 splits are a production-Chrome concern the guard must catch.)
 *
 * Verified end-to-end on this machinery: 96 writes -> 98 packets -> 96 frames
 * at the consumer -> 59 decoded, 96% byte-identical to the producer's encoder
 * output. The consumer rendered the producer's true pixels through a relay
 * that never ran a content encoder.
 *
 * SHAPE: one shared Worker; transforms attach per-receiver ('tap') and
 * per-sender ('pipe'); a routing table fans one tap to N pipes — which is the
 * one-encoder fan (§9b) falling out for free: N forwards of one feed cost N
 * tiny template mints and ZERO content encodes.
 *
 * The page-side API is deliberately dumb plumbing (attach, route, carrier,
 * stats); every policy decision — which jobs pipe, when to fall back, how
 * kf-need travels — belongs to run.html, next to the rest of the mosaic law.
 */
(function (root) {
  const GifOS = root.GifOS = root.GifOS || {};

  const supported = () => typeof RTCRtpScriptTransform !== 'undefined'
    && typeof document !== 'undefined' && typeof Worker !== 'undefined';

  // ---- the worker -----------------------------------------------------------
  // Roles: 'tap' (receiver-side: early-copy each frame, fan to routed pipes,
  // pass the frame through untouched so local painting never notices) and
  // 'pipe' (sender-side: template-paced, type-matched payload swap).
  const WORKER_SRC = `
const taps = new Map();   // srcId -> Set(pipeId)
const tapTs = new Map();  // srcId -> the tap's transformer (the SKR handle)
const skrLast = new Map();// srcId -> last sendKeyFrameRequest ms (rate limit)
const pipes = new Map();  // pipeId -> { writer, q, needKey, mime, tmplMime, wrote, dropped, swapErr, kfAsk, lastWriteAt, misreported }
const QMAX = 40;          // frames of content buffered per pipe; overflow drops to next key (reference chains)
function pipeFor(id) {
  let p = pipes.get(id);
  if (!p) { p = { writer: null, q: [], needKey: true, mime: null, tmplMime: null, wrote: 0, dropped: 0, swapErr: 0, kfAsk: 0, lastWriteAt: 0, misreported: false }; pipes.set(id, p); }
  return p;
}
// ASK THE UPSTREAM FOR A KEY, HOP-LOCALLY (the stg-freeze fix, measured
// 2026-08-04 across devices). The tap is a RECEIVER transform, and the spec
// gives it sendKeyFrameRequest(): one RTCP PLI to whatever feeds THIS hop —
// the producer's real encoder (camera or canvas, both answer in <100ms,
// measured) or an upstream hop's carrier mint (whose key template against a
// delta-only queue re-fires this same ask at THAT hop — the request chains
// to the producer entirely in RTCP + worker logic). This replaces the mx-kf
// DC walk as the primary lever: the walk needed every hop's claim chain
// healthy and ended in a producer-side capture nudge that could stall the
// blur pipe's encoder for 10-20s (the freeze's engine). The kf-need message
// remains as the fallback when SKR is absent.
function askKey(srcId, pipeId) {
  // BOTH LEVERS, ALWAYS (frza19). SKR is one RTCP PLI to whatever feeds this
  // hop — which only works when that is a REAL encoder (the producer's
  // camera/canvas): Chromium does not latch a PLI into a demand-minted
  // captureStream(0) carrier, so across PIPED hops the SKR chain dies at the
  // first carrier (measured: startup stalls healed in 145-185s instead of
  // seconds — the ask never crossed the first piped upstream). The kf-need
  // page walk (mx-kf over the DC, hop-by-hop to the producer, resolved by
  // the sender-side jiggle) is the mechanism that crosses piped hops — it is
  // NOT a fallback, it is the primary for deep chains. Fire both; the page
  // rate-limits the walk per key (2s) and skrLast bounds the RTCP side.
  const now = Date.now();
  if (now - (skrLast.get(srcId) || 0) < 250) return;
  skrLast.set(srcId, now);
  const p = pipeId && pipes.get(pipeId); if (p) p.skr = (p.skr || 0) + 1;
  const t = tapTs.get(srcId);
  if (t && t.sendKeyFrameRequest) { try { const pr = t.sendKeyFrameRequest(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} }
  if (pipeId) postMessage({ op: 'kf-need', pipeId });
}
// THE DARK-TAP HOLE (frza4): every ask site below is FRAME-driven, so a pipe
// whose tap receives NOTHING asked exactly once (at route) and then fell
// silent forever — nva1 sent 105 PLIs into a husk pipe whose upstream was
// never re-asked. A starving pipe re-asks on a timer until key content lands.
setInterval(() => {
  for (const [id, p] of pipes) if (!p.paused && p.needKey && p.srcId) askKey(p.srcId, id);
}, 2000);
onmessage = (e) => {
  const m = e.data;
  if (m.op === 'route') {
    let s = taps.get(m.srcId); if (!s) { s = new Set(); taps.set(m.srcId, s); } s.add(m.pipeId);
    const p = pipeFor(m.pipeId); p.srcId = m.srcId;
    askKey(m.srcId, m.pipeId); // a fresh pipe is mid-GOP by construction — don't wait for the drop streak
  }
  else if (m.op === 'pause') { const p = pipeFor(m.pipeId); p.paused = true; p.q.length = 0; }
  else if (m.op === 'unpause') { const p = pipeFor(m.pipeId); p.paused = false; p.needKey = true; p.nkDrop = 0; askKey(p.srcId, m.pipeId); }
  else if (m.op === 'keykick') {
    // THE CONSUMER'S PLIs, SEEN FROM THE PAGE (frza18). A consumer that
    // missed a pipe's birth key can never recover through the carrier
    // encoder: Chromium does NOT latch a PLI into a demand-minted
    // captureStream(0) encoder (measured in vivo — 1305 PLIs, 1655 written
    // templates, ZERO key templates minted), so the kdrop tunnel never
    // fires and the stream stays keyless forever while bytes flow. The page
    // polls the sender's outbound pliCount instead and kicks: force a key
    // ask upstream so key CONTENT arrives, and the page mints the key
    // template to pair with it.
    const p = pipes.get(m.pipeId);
    if (p && !p.paused && p.srcId) { p.kick = (p.kick || 0) + 1; askKey(p.srcId, m.pipeId); }
  }
  else if (m.op === 'unroute') { const s = taps.get(m.srcId); if (s) { s.delete(m.pipeId); if (!s.size) { taps.delete(m.srcId); tapTs.delete(m.srcId); } } pipes.delete(m.pipeId); }
  else if (m.op === 'stats') {
    const out = {};
    for (const [id, p] of pipes) out[id] = { q: p.q.length, wrote: p.wrote, seen: p.seen || 0, tmpl: p.tmpl || 0, primed: p.primed || 0, dropped: p.dropped, swapErr: p.swapErr, kfAsk: p.kfAsk, kdrop: p.kdrop || 0, nkDrop: p.nkDrop || 0, skr: p.skr || 0, paused: !!p.paused, needKey: !!p.needKey, lastWriteAt: p.lastWriteAt, mime: p.mime, tmplMime: p.tmplMime };
    postMessage({ op: 'stats', stats: out });
  }
};
onrtctransform = (e) => {
  const t = e.transformer, o = t.options || {};
  if (o.role === 'tap' && o.srcId) {
    tapTs.set(o.srcId, t);
    // pipes routed before this tap's transformer arrived asked into the void —
    // re-ask now that the SKR handle exists (attach-time, not first-frame: a
    // fully starved upstream delivers no frames to hang the re-ask on)
    const rt = taps.get(o.srcId);
    if (rt) for (const pid of rt) { const rp = pipes.get(pid); if (rp && rp.needKey && !rp.paused) { askKey(o.srcId, pid); break; } }
  }
  const reader = t.readable.getReader();
  const writer = t.writable.getWriter();
  (async () => {
    for (;;) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      if (o.role === 'tap') {
        const routed = taps.get(o.srcId);
        if (routed && routed.size) {
          // COPY EARLY: the passthrough write below detaches frame.data.
          let bytes = null, ts = 0, mime = null;
          try { bytes = frame.data.slice(0); const md = frame.getMetadata(); ts = md.rtpTimestamp; mime = md.mimeType || null; } catch (err) {}
          if (bytes) for (const pid of routed) {
            const p = pipeFor(pid);
            if (p.paused) continue; // a parked job's minted frames die at its detached track — queueing is waste and trips the watchdog
            p.seen = (p.seen || 0) + 1;
            p.mime = mime;
            if (p.q.length >= QMAX) {
              // OVERFLOW, key-preserving (frza12): clearing the WHOLE queue
              // burned any key already queued and forced a full SKR round
              // trip — at 8fps the refill-clear cycle ran ~1Hz and the room
              // froze in 16-31s waves. If a key is in the queue, restart from
              // the LATEST one (reference chains stay whole, no ask needed);
              // only a keyless queue pays the clear + ask.
              let ki = -1;
              for (let qi = p.q.length - 1; qi >= 0; qi--) if (p.q[qi].type === 'key') { ki = qi; break; }
              if (ki >= 0) { p.q.splice(0, ki); p.dropped++; }
              else { p.q.length = 0; p.needKey = true; p.dropped++; askKey(o.srcId, pid); }
            }
            if (p.needKey && frame.type !== 'key') {
              p.dropped++;
              // THE BLACK HOLE FIX: a pipe routed mid-GOP waits for key content
              // that may be thousands of frames away — REQUEST it. 3 drops in,
              // then every 30, until a key arrives (needKey clears). WebRTC
              // emits NO periodic keyframes at all (measured: 1 key in 20s of
              // healthy flow, the initial one), so an unanswered ask is a
              // permanent freeze, not a delay.
              p.nkDrop = (p.nkDrop || 0) + 1;
              if (p.nkDrop === 3 || p.nkDrop % 30 === 0) askKey(o.srcId, pid);
            }
            else { if (frame.type === 'key') { p.needKey = false; p.nkDrop = 0; } p.q.push({ bytes, ts, type: frame.type });
              // DEMAND-MINT: one template per queued frame, typed by the head.
              // q rides along so the page can CATCH UP: at healthy fps the
              // want->postMessage->main-thread->requestFrame round trip lags
              // content by a fraction of a frame, the backlog compounds, and
              // QMAX overflow re-keys the whole downstream every ~15s (frza10
              // — the steady-state freeze cycle; invisible at crawl fps).
              postMessage({ op: 'want', pipeId: pid, key: p.q[0].type === 'key', q: p.q.length }); }
          }
        }
        writer.write(frame); // local decode unaffected
      } else if (o.role === 'pipe') {
        const p = pipeFor(o.pipeId);
        p.tmpl = (p.tmpl || 0) + 1;
        p.writer = p.writer || writer;
        try { const md = frame.getMetadata(); p.tmplMime = md.mimeType || null; } catch (err) {}
        if (p.mime && p.tmplMime && p.mime !== p.tmplMime) { // codec mismatch — this pipe can never work
          if (!p.misreported) { p.misreported = true; postMessage({ op: 'codec-mismatch', pipeId: o.pipeId, mime: p.mime, tmplMime: p.tmplMime }); }
          continue; // drop templates; page falls back to transcode
        }
        if (!p.q.length) {
          // NO PRIMER, EVER (frza12 closed the loop the primer opened). The
          // original cold-start deadlock ("nothing ever shipped -> consumer
          // never decodes -> never PLIs -> no key templates -> kfAsk 145,
          // wrote 0") predates the demand KEY MINT: today key content heading
          // the queue posts want{key:true} and the carrier's 1px resize mints
          // a key template on demand — no consumer RTCP required. The primer
          // that papered over it shipped a 48px CARRIER-JUNK keyframe to the
          // consumer, and on a freshly (re)shipped pipe that junk key ARRIVED
          // FIRST, so the consumer's decoder started life at 48x48 and the
          // real content stream behind it decoded 1-2 frames and wedged
          // (frza12: fdec 2, kdec 1, four minutes bright-frozen; frza6: the
          // same junk leaking MID-stream froze half the room for 120s).
          // A template on an idle queue — any type — is either the consumer's
          // tunneled PLI (ask upstream for real key content) or carrier
          // noise (drop free). The FIRST WRITE of every pipe is now always a
          // PAIRED REAL CONTENT KEY.
          if (frame.type === 'key') {
            p.kdrop = (p.kdrop || 0) + 1;
            if (p.kdrop === 3 || p.kdrop % 30 === 0) askKey(o.srcId, o.pipeId);
          }
          continue;
        }
        const head = p.q[0];
        if (head.type === 'key' && frame.type !== 'key') {
          // key content, delta template — re-ask for a KEY mint; if this keeps
          // starving something is broken upstream of the mint, tell the page.
          p.kfAsk++;
          postMessage({ op: 'want', pipeId: o.pipeId, key: true });
          if (p.kfAsk === 30 || p.kfAsk % 120 === 0) postMessage({ op: 'kf-need', pipeId: o.pipeId });
          continue;
        }
        if (head.type !== 'key' && frame.type === 'key') {
          // key template + delta-only queue = the CONSUMER's PLI, tunneled
          // through the carrier encoder — it wants key content we don't have.
          // Ask THIS hop's upstream (rate-limited by the counter shape); at a
          // piped upstream the ask re-tunnels the same way, hop by hop to the
          // producer's real encoder.
          p.kdrop = (p.kdrop || 0) + 1;
          if (p.kdrop === 3 || p.kdrop % 30 === 0) askKey(o.srcId, o.pipeId);
          continue;
        }
        p.q.shift(); p.kfAsk = 0; p.kdrop = 0;
        try { frame.data = head.bytes; writer.write(frame).then(() => { p.wrote++; p.lastWriteAt = Date.now(); }, () => { p.swapErr++; }); }
        catch (err) { p.swapErr++; }
      } else writer.write(frame);
    }
  })();
};
`;

  let worker = null, statsSeq = 0;
  const statsWaiters = [];
  const carriers = new Map(); // pipeId -> carrier (the demand mint 'want' resolves against)
  const wantN = new Map();    // pipeId -> want messages received (chain forensics)
  const lastWant = new Map(); // pipeId -> { q, at } — the worker-reported backlog (drainer input)
  // THE DRAINER (frza11): demand-minting is 1-for-1 and the want->postMessage->
  // requestFrame round trip occasionally loses a beat, so a STANDING deficit
  // accumulates (+1 queued frame per ~16 content frames, measured) until QMAX
  // overflow re-keys the whole downstream. Extra mints must live in SEPARATE
  // tasks (same-task requestFrames coalesce into one capture), so a 33ms tick
  // mints one catch-up template per backlogged pipe until the report drains.
  // Idle safety: a report older than 1s is stale (content stopped — its wants
  // stopped too); an over-minted delta template is dropped free at the
  // worker's idle-queue gate.
  setInterval(() => {
    const now = Date.now();
    for (const [pid, w] of lastWant) {
      if (w.q > 2 && now - w.at < 1000) { const cr = carriers.get(pid); if (cr) { cr.mint(false); w.q--; } }
    }
  }, 33);
  const listeners = { 'kf-need': [], 'codec-mismatch': [] };
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.op === 'stats') { const w = statsWaiters.shift(); if (w) w(m.stats); }
      else if (m.op === 'want') {
        const cr = carriers.get(m.pipeId);
        if (cr) cr.mint(m.key);
        // CATCH-UP (frza10/11): record the backlog for the drainer below. A
        // synchronous mint BURST here does nothing — captureStream coalesces
        // every requestFrame inside one task into a single captured frame at
        // the next compositor tick (measured: 2-4x burst mints left the climb
        // at exactly +1 queued frame per ~16 content frames, then QMAX).
        lastWant.set(m.pipeId, { q: m.q | 0, at: Date.now() });
        wantN.set(m.pipeId, (wantN.get(m.pipeId) || 0) + 1);
      }
      else if (listeners[m.op]) for (const fn of listeners[m.op]) { try { fn(m); } catch (err) {} }
    };
    return worker;
  }

  // ---- page-side plumbing ---------------------------------------------------
  const tapped = new WeakSet(); // receivers that already wear a tap transform

  // Attach the tap to a receiver (idempotent — a transform is set once and the
  // worker's routing table decides whether its frames go anywhere).
  function tapReceiver(receiver, srcId) {
    if (!supported() || !receiver) return false;
    if (!tapped.has(receiver)) {
      try { receiver.transform = new RTCRtpScriptTransform(ensureWorker(), { role: 'tap', srcId }); tapped.add(receiver); }
      catch (e) { return false; }
    }
    return true;
  }

  // The TEMPLATE MINT: a tiny canvas whose only job is making the sender emit
  // frame objects for the worker to repack. Its pixels are never seen (every
  // frame's data is replaced); its size is the entire encode cost. DEMAND-
  // MINTED: captureStream(0) emits nothing on its own — the worker asks for
  // exactly one template per queued content frame ('want'), so pacing follows
  // the content natively, idle costs zero encodes, and a backlog drains as
  // fast as we ask. A KEY mint is a 1px resize before the capture: the
  // resolution change forces the carrier encoder to open a new GOP (the only
  // JS-reachable keyframe trigger — transformer.generateKeyFrame is absent on
  // this Chromium, measured).
  function makeCarrier() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const ctx = c.getContext('2d');
    let n = 0, kside = 48;
    const paint = () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#111'; ctx.fillRect(++n % 40, (n >> 3) % 40, 2, 2); };
    paint();
    const stream = c.captureStream(0);
    const track = stream.getVideoTracks()[0];
    return {
      track,
      mint(key) {
        this.mints = (this.mints || 0) + 1;
        if (key) { kside = kside === 48 ? 47 : 48; c.width = kside; c.height = kside; }
        paint();
        try { track.requestFrame ? track.requestFrame() : stream.requestFrame(); } catch (e) {}
      },
      stop() { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} },
    };
  }

  // Wire a sender (already carrying a carrier track) as the pipe for srcId.
  function pipeSender(sender, srcId, pipeId, carrier) {
    if (!supported() || !sender) return false;
    try {
      sender.transform = new RTCRtpScriptTransform(ensureWorker(), { role: 'pipe', pipeId, srcId });
      if (carrier) carriers.set(pipeId, carrier);
      ensureWorker().postMessage({ op: 'route', srcId, pipeId });
      return true;
    } catch (e) { return false; }
  }
  function pausePipe(pipeId, paused) { if (worker) worker.postMessage({ op: paused ? 'pause' : 'unpause', pipeId }); }
  // The page-side half of the keykick (see the worker's 'keykick' comment):
  // ask upstream for key content AND mint a key-typed template to pair with
  // it when it lands. Rate-limit at the caller (the pipe watchdog's 5s beat).
  function keyKick(pipeId) {
    if (!worker) return;
    worker.postMessage({ op: 'keykick', pipeId });
    const cr = carriers.get(pipeId);
    if (cr) cr.mint(true);
  }
  function unpipe(srcId, pipeId) {
    const cr = carriers.get(pipeId);
    if (cr) { carriers.delete(pipeId); try { cr.stop(); } catch (e) {} }
    lastWant.delete(pipeId);
    if (worker) worker.postMessage({ op: 'unroute', srcId, pipeId });
  }
  function chain(pipeId) { const cr = carriers.get(pipeId); return { wants: wantN.get(pipeId) || 0, mints: cr ? (cr.mints || 0) : -1 }; }
  function stats() {
    return new Promise((res) => {
      if (!worker) { res({}); return; }
      statsWaiters.push(res); worker.postMessage({ op: 'stats' });
      setTimeout(() => { const i = statsWaiters.indexOf(res); if (i >= 0) { statsWaiters.splice(i, 1); res({}); } }, 1000);
    });
  }
  function on(ev, fn) { if (listeners[ev]) listeners[ev].push(fn); }

  // Find the RTCRtpReceiver that owns a remote track — the tap point. The
  // caller hands us its live peer connections; a track with no receiver among
  // them is LOCAL (a packer canvas, my camera) and must NOT be piped: its
  // owner runs the real content encoder, which is the origin of the stream.
  function receiverForTrack(track, pcs) {
    for (const pc of pcs) {
      try { for (const r of pc.getReceivers()) if (r.track === track) return r; } catch (e) {}
    }
    return null;
  }

  GifOS.meshPipe = { supported, tapReceiver, pipeSender, pausePipe, keyKick, unpipe, makeCarrier, receiverForTrack, stats, chain, on };
})(typeof window !== 'undefined' ? window : globalThis);
