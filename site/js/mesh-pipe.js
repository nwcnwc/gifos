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
 *   - transformer.generateKeyFrame() DOES NOT EXIST here (kfA: 'absent'), and
 *     a deep receiver's PLI stops at the nearest hop — it can never reach the
 *     content's origin. When key content starves for a key template, or a
 *     consumer reports an undecodable stream, the page is told ('kf-need') so
 *     run.html can relay the need hop-by-hop to the producer, who forces a
 *     keyframe by nudging its source (a 1px canvas resize — packers own their
 *     canvases, so this is safe and invisible).
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
const pipes = new Map();  // pipeId -> { writer, q, needKey, mime, tmplMime, wrote, dropped, swapErr, kfAsk, lastWriteAt, misreported }
const QMAX = 40;          // frames of content buffered per pipe; overflow drops to next key (reference chains)
function pipeFor(id) {
  let p = pipes.get(id);
  if (!p) { p = { writer: null, q: [], needKey: true, mime: null, tmplMime: null, wrote: 0, dropped: 0, swapErr: 0, kfAsk: 0, lastWriteAt: 0, misreported: false }; pipes.set(id, p); }
  return p;
}
onmessage = (e) => {
  const m = e.data;
  if (m.op === 'route') { let s = taps.get(m.srcId); if (!s) { s = new Set(); taps.set(m.srcId, s); } s.add(m.pipeId); }
  else if (m.op === 'unroute') { const s = taps.get(m.srcId); if (s) { s.delete(m.pipeId); if (!s.size) taps.delete(m.srcId); } pipes.delete(m.pipeId); }
  else if (m.op === 'stats') {
    const out = {};
    for (const [id, p] of pipes) out[id] = { q: p.q.length, wrote: p.wrote, primed: p.primed || 0, dropped: p.dropped, swapErr: p.swapErr, kfAsk: p.kfAsk, lastWriteAt: p.lastWriteAt, mime: p.mime, tmplMime: p.tmplMime };
    postMessage({ op: 'stats', stats: out });
  }
};
onrtctransform = (e) => {
  const t = e.transformer, o = t.options || {};
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
            p.mime = mime;
            if (p.q.length >= QMAX) { p.q.length = 0; p.needKey = true; p.dropped++; } // overflow: restart clean at the next key
            if (p.needKey && frame.type !== 'key') { p.dropped++; }
            else { if (frame.type === 'key') p.needKey = false; p.q.push({ bytes, ts, type: frame.type });
              postMessage({ op: 'want', pipeId: pid, key: p.q[0].type === 'key' }); } // DEMAND-MINT: one template per queued frame, typed by the head
          }
        }
        writer.write(frame); // local decode unaffected
      } else if (o.role === 'pipe') {
        const p = pipeFor(o.pipeId);
        p.writer = p.writer || writer;
        try { const md = frame.getMetadata(); p.tmplMime = md.mimeType || null; } catch (err) {}
        if (p.mime && p.tmplMime && p.mime !== p.tmplMime) { // codec mismatch — this pipe can never work
          if (!p.misreported) { p.misreported = true; postMessage({ op: 'codec-mismatch', pipeId: o.pipeId, mime: p.mime, tmplMime: p.tmplMime }); }
          continue; // drop templates; page falls back to transcode
        }
        if (!p.q.length) {
          // COLD-START PRIMER (measured deadlock, module-probe 2026-08-04):
          // with nothing ever shipped, the consumer never starts decoding, so
          // it never sends the PLI that mints key templates — and the carrier
          // encoder's ONE initial keyframe arrives exactly now, while the
          // content queue is still empty. Dropping it deadlocks the pipe
          // forever (kfAsk 145, wrote 0). So an idle-queue KEY template passes
          // through unmodified: one near-black 48px frame primes the far
          // decoder and its RTCP loop; content overwrites it within a frame or
          // two. Idle-queue DELTA templates still drop — still-frame quiet
          // stays free, and no junk ever interleaves into flowing content.
          if (frame.type === 'key') { p.primed = (p.primed || 0) + 1; writer.write(frame).catch(() => {}); }
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
        if (head.type !== 'key' && frame.type === 'key') continue; // key template, delta content — hold the template line, wait
        p.q.shift(); p.kfAsk = 0;
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
  const listeners = { 'kf-need': [], 'codec-mismatch': [] };
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.op === 'stats') { const w = statsWaiters.shift(); if (w) w(m.stats); }
      else if (m.op === 'want') { const cr = carriers.get(m.pipeId); if (cr) cr.mint(m.key); }
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
  function unpipe(srcId, pipeId) {
    const cr = carriers.get(pipeId);
    if (cr) { carriers.delete(pipeId); try { cr.stop(); } catch (e) {} }
    if (worker) worker.postMessage({ op: 'unroute', srcId, pipeId });
  }
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

  GifOS.meshPipe = { supported, tapReceiver, pipeSender, unpipe, makeCarrier, receiverForTrack, stats, on };
})(typeof window !== 'undefined' ? window : globalThis);
