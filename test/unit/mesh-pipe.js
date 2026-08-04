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
//   * NO PRIMER — an idle-queue template never passes through. The primer
//     that once did (against the measured kfAsk-145 cold-start deadlock,
//     which predates the demand KEY MINT) shipped 48px carrier junk as a
//     keyframe: mid-stream it reference-broke every downstream decoder
//     (frza6, 120s room-half freezes), and at (re)ship time it arrived
//     before the first content key and wedged fresh decoders at 48x48
//     (frza12). The first write of every pipe is a paired REAL content key.
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
// FIXED 2026-08-04 TWICE, deliberately: first gated to cold-start-only
// (frza6/7 — the unconditioned primer leaked carrier junk into flowing
// content), then REMOVED outright (frza12 — at (re)ship time the junk key
// arrived before the first content key and wedged fresh decoders at 48x48;
// the demand KEY MINT makes the original cold-start deadlock unreachable).
check('NO PRIMER: an idle-queue template never passes through; the first write is a paired real content key',
  /NO PRIMER, EVER/.test(SRC) && !/p\.primed = \(p\.primed \|\| 0\) \+ 1; writer\.write/.test(SRC));
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
// THE STG-FREEZE LAWS (2026-08-04, frza runs — multi-device, healthy fps).
// The old producer levers touched the CAPTURE pipeline (1px canvas resize /
// applyConstraints width nudge); the canvas resize on the blur pipe's canvas
// stalled the self-stream encoder 10-20s per hit and froze every receiver of
// every copy at once. FIXED the test 2026-08-04, and deliberately: these pins
// now assert the levers that replaced them.
check('the producer fallback is a sender-side scaleResolutionDownBy jiggle — capture is never touched',
  /scaleResolutionDownBy = sr0 > 1 \? 1 : 1\.25/.test(RUN)
  && !/c\.width = c\.width > 2/.test(RUN)
  && !/width: \{ ideal: w - 2 \}/.test(RUN));
check('keyframe recovery is hop-local: the tap asks its upstream via sendKeyFrameRequest',
  /sendKeyFrameRequest/.test(SRC) && /function askKey\(srcId, pipeId\)/.test(SRC));
check('every starvation path asks: route, unpause, overflow, black-hole streak, PLI tunnel',
  /p\.srcId = m\.srcId;\s*\n\s*askKey\(m\.srcId, m\.pipeId\)/.test(SRC)
  && /p\.needKey = true; p\.nkDrop = 0; askKey\(p\.srcId, m\.pipeId\)/.test(SRC)
  && /p\.dropped\+\+; askKey\(o\.srcId, pid\)/.test(SRC)
  && /p\.nkDrop === 3 \|\| p\.nkDrop % 30 === 0\) askKey\(o\.srcId, pid\)/.test(SRC)
  && /p\.kdrop === 3 \|\| p\.kdrop % 30 === 0\) askKey\(o\.srcId, o\.pipeId\)/.test(SRC));
// FIXED 2026-08-04 (frza19), deliberately: kf-need is NOT a fallback — it is
// the primary for deep chains. Chromium does not latch a PLI into a
// demand-minted captureStream(0) carrier, so SKR dies at the first piped
// upstream; the DC walk is what crosses piped hops. askKey fires BOTH.
check('askKey fires BOTH levers: SKR for real-encoder upstreams, kf-need for the DC walk across piped hops',
  /if \(t && t\.sendKeyFrameRequest\) \{ try \{ const pr = t\.sendKeyFrameRequest\(\)/.test(SRC)
  && /if \(pipeId\) postMessage\(\{ op: 'kf-need', pipeId \}\)/.test(SRC));
check('the dark-tap hole is closed: a starving pipe re-asks on a timer',
  /if \(!p\.paused && p\.needKey && p\.srcId\) askKey\(p\.srcId, id\)/.test(SRC));
check('an idle-queue key template is the tunneled consumer PLI: drop it and ask upstream',
  /if \(frame\.type === 'key'\) \{\s*\n\s*p\.kdrop = \(p\.kdrop \|\| 0\) \+ 1;\s*\n\s*if \(p\.kdrop === 3 \|\| p\.kdrop % 30 === 0\) askKey\(o\.srcId, o\.pipeId\);/.test(SRC));
check('stg announces carry the hop count; claims anchor to the owner, then min-h',
  /const stgHop = \(f\)/.test(RUN)
  && /h: \(typeof m\.h === 'number' \? m\.h : undefined\)/.test(RUN)
  && /x\.from === owner && x\.key\.indexOf\('\^'\) < 0/.test(RUN)
  && /hOf\(x\) < hOf\(best\)/.test(RUN));
check('stg:* rides the pipe lane (the 9bf885d scope-out is closed)',
  !/indexOf\('stg:'\) !== 0/.test(RUN.slice(RUN.indexOf('function shipMos'), RUN.indexOf('function shipMos') + 4000)));
check('dead-pipe watchdog distinguishes broken plumbing from still-frame quiet (track.muted)',
  /pj\.srcTrack\.muted === false/.test(RUN) && /pj\.stale >= 3/.test(RUN));
check('pipe forensics ride the test surface (pipeInfo/pipeStats)',
  /pipeInfo: \(\) =>/.test(RUN) && /pipeStats: \(\) =>/.test(RUN));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
