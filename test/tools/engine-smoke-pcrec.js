/*
 * engine-smoke-pcrec.js — a meet.js --init-script that keeps every
 * RTCPeerConnection reachable, so `eval window.__pcstats()` can read RTP
 * counters from outside the page.
 *
 * run.html holds its peer connections in a closure. Without this, a blank
 * remote tile is unattributable: "media never arrived" and "media arrived and
 * decoded, but the <video> never started" look identical from the DOM. The
 * inbound framesDecoded/frameWidth counters tell those apart in one read.
 */
(() => {
  const Orig = window.RTCPeerConnection;
  if (!Orig) return;
  window.__pcs = [];
  const Wrapped = function (...a) { const p = new Orig(...a); window.__pcs.push(p); return p; };
  Wrapped.prototype = Orig.prototype;
  for (const k of Object.getOwnPropertyNames(Orig)) { try { if (!(k in Wrapped)) Wrapped[k] = Orig[k]; } catch (e) {} }
  Wrapped.generateCertificate = Orig.generateCertificate ? Orig.generateCertificate.bind(Orig) : undefined;
  Wrapped.getCapabilities = Orig.getCapabilities ? Orig.getCapabilities.bind(Orig) : undefined;
  window.RTCPeerConnection = Wrapped;
  window.webkitRTCPeerConnection = Wrapped;
  window.__pcstats = async () => {
    const out = [];
    for (const p of window.__pcs) {
      const row = { conn: p.connectionState, ice: p.iceConnectionState, inbound: [], outbound: [], codecs: {} };
      try {
        const s = await p.getStats();
        s.forEach((r) => {
          if (r.type === 'codec') row.codecs[r.id] = r.mimeType;
          if (r.type === 'inbound-rtp') row.inbound.push({ kind: r.kind || r.mediaType, bytes: r.bytesReceived, pkts: r.packetsReceived, framesRecv: r.framesReceived, framesDec: r.framesDecoded, w: r.frameWidth, h: r.frameHeight, codec: r.codecId, err: r.decoderImplementation, pli: r.pliCount, keyfr: r.keyFramesDecoded });
          if (r.type === 'outbound-rtp') row.outbound.push({ kind: r.kind || r.mediaType, bytes: r.bytesSent, pkts: r.packetsSent, framesSent: r.framesSent, framesEnc: r.framesEncoded, codec: r.codecId, impl: r.encoderImplementation });
        });
      } catch (e) { row.err = String(e).slice(0, 100); }
      out.push(row);
    }
    window.__pcstatsOut = out;
    return out;
  };
})();
