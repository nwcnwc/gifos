// mesh-pipe.js test — ENCODED PASSTHROUGH (roadmap §9a): the module's Node-safe
// surface, and source-scan guards on the measured-and-paid-for design rules.
//
// Why source scans here: the pipe's correctness rests on four behaviors that
// were each DISPROVEN-then-remeasured on the pinned Chromium (pipe-probe,
// 2026-08-04), and every one fails SILENTLY if dropped — write() resolves and
// nothing ships, or the pipe deadlocks with zero errors. A refactor that loses
// one would pass every syntax check and die only in a live room:
//   * COPY EARLY — writing a frame onward DETACHES frame.data; bytes must be
//     copied the moment a frame is seen.
//   * TYPE-MATCH — key bytes on a delta template make the payload descriptor
//     lie and the far decoder rejects the stream.
//   * COLD-START PRIMER — an idle-queue KEY template must pass through, or the
//     consumer never decodes, never PLIs, and the pipe deadlocks (measured:
//     kfAsk 145, wrote 0).
//   * DEMAND MINT — captureStream(0) + requestFrame; a fixed-fps carrier
//     reintroduces the key-template stutter the mint exists to kill.
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-pipe.js');
const fs = require('fs');
const path = require('path');
const MP = globalThis.GifOS.meshPipe;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

// ---- Node-safe surface ------------------------------------------------------
check('module exports the plumbing API', !!MP
  && ['supported', 'tapReceiver', 'pipeSender', 'unpipe', 'makeCarrier', 'receiverForTrack', 'stats', 'on'].every((k) => typeof MP[k] === 'function'));
check('supported() is false under Node (no RTCRtpScriptTransform, no DOM)', MP.supported() === false);
check('makeCarrier degrades to null without DOM', MP.makeCarrier() === null);
check('tapReceiver / pipeSender refuse cleanly when unsupported',
  MP.tapReceiver({}, 's') === false && MP.pipeSender({}, 's', 'p') === false);
check('stats() resolves empty with no worker', (() => { const p = MP.stats(); return p && typeof p.then === 'function'; })());
check('receiverForTrack finds a receiver by track identity', (() => {
  const t = {};
  const pc = { getReceivers: () => [{ track: {} }, { track: t }] };
  return MP.receiverForTrack(t, [pc]) === pc.getReceivers()[1] || MP.receiverForTrack(t, [pc]).track === t;
})());
check('receiverForTrack: a local track (no receiver) is null — never piped',
  MP.receiverForTrack({}, [{ getReceivers: () => [] }]) === null);

// ---- the measured design rules, pinned in source ---------------------------
const SRC = fs.readFileSync(path.join(__dirname, '../../site/js/mesh-pipe.js'), 'utf8');
check('COPY EARLY: bytes are sliced at tap time, before the local onward write',
  /COPY EARLY/.test(SRC) && /frame\.data\.slice\(0\)/.test(SRC));
check('TYPE-MATCH: key content never rides a delta template (and vice versa)',
  /head\.type === 'key' && frame\.type !== 'key'/.test(SRC)
  && /head\.type !== 'key' && frame\.type === 'key'/.test(SRC));
check('COLD-START PRIMER: an idle-queue KEY template passes through',
  /COLD-START PRIMER/.test(SRC) && /if \(frame\.type === 'key'\) \{ p\.primed/.test(SRC));
check('DEMAND MINT: carrier is captureStream(0) + requestFrame, keyed by a 1px resize',
  /captureStream\(0\)/.test(SRC) && /requestFrame/.test(SRC) && /kside === 48 \? 47 : 48/.test(SRC));
check('CODEC GUARD: per-pipe mimeType comparison reports mismatch to the page',
  /p\.mime !== p\.tmplMime/.test(SRC) && /codec-mismatch/.test(SRC));
check('FIFO, never skip: reference chains survive (queue shifts from the head only)',
  /p\.q\.shift\(\)/.test(SRC) && !/p\.q\.pop\(\)/.test(SRC));
check('overflow restarts clean at the next key (needKey), never mid-GOP',
  /p\.q\.length = 0; p\.needKey = true/.test(SRC));

// ---- run.html wiring --------------------------------------------------------
const RUN = fs.readFileSync(path.join(__dirname, '../../site/run.html'), 'utf8');
check('run.html loads mesh-pipe.js beside the media engine', /<script src="js\/mesh-pipe\.js">/.test(RUN));
check('shipMos pipes by the one rule: remote-receiver video only',
  /receiverForTrack\(tr,/.test(RUN) && /pipeEnabled\(\) && !pipeDeny\.has\(jk\)/.test(RUN));
check('trackList holds the CARRIER for piped jobs (dormancy wake law)',
  /senders\.push\(sd\); trackList\.push\(carrier\.track\);/.test(RUN));
check('unshipMos unroutes the pipe and stops the carrier mint',
  /pipeJobs\.delete\(jk\); try \{ MPipe\.unpipe/.test(RUN));
check('codec mismatch falls back per-job via pipeDeny + unship',
  /pipeDeny\.add\(jk\); unshipMos\(jk, true\)/.test(RUN));
check('the mx-kf keyframe walk exists and relays via kfNeed',
  /m\.k === 'mx-kf'/.test(RUN) && /function kfNeed\(key\)/.test(RUN) && /dcSend\(vp, \{ k: 'mx-kf', key \}\)/.test(RUN));
check('the producer nudge is the 1px canvas resize (packers restore next paint)',
  /c\.width = c\.width > 2 \? c\.width - 1 : c\.width \+ 1/.test(RUN));
check('dead-pipe watchdog distinguishes broken plumbing from still-frame quiet (track.muted)',
  /pj\.srcTrack\.muted === false/.test(RUN) && /pj\.stale >= 3/.test(RUN));
check('pipe forensics ride the test surface (pipeInfo/pipeStats)',
  /pipeInfo: \(\) =>/.test(RUN) && /pipeStats: \(\) =>/.test(RUN));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
