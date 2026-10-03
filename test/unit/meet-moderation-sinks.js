// meet-moderation-sinks.js — MODERATION REACHES EVERY SINK, pinned.
//
// Receiver-side moderation (docs/meet-security.md, run.html "THE BLUR RULE")
// is enforced where pixels are SHOWN: an admin's video-off hides the tile on
// every receiver, a blur block blurs it on every receiver, so a sender that
// ignores the order is still invisible to everyone honest. The grid tile was
// the only sink that obeyed. The filmstrip view (#fsview), the PiP picker and
// iOS's native <video> full screen each read the raw <video>, and each was a
// one-tap way around the strongest hammers in the room (2026-10-03).
// test/browser/e2e-meet-mod.js proves the filmstrip and PiP BEHAVE; this pins
// that every sink still gates on the ORDER in the source — including the
// native iOS branch no Chromium suite can drive — and that the stage data
// lane verifies an 'app' frame before retaining it. Text tripwire, pure Node.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');
const run = fs.readFileSync(path.join(R, 'site', 'run.html'), 'utf8');
let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const fn = (name, end) => { const i = run.indexOf(name); return i < 0 ? '' : run.slice(i, run.indexOf(end, i)); };

// 1. the filmstrip lists no peer an admin turned off, and carries the blur level
const fsSrc = fn('function fsSources()', 'function fsPaintSel');
check('fsSources exists', !!fsSrc);
check('fsSources skips a peer under an admin video-off (forcedCamOff), not only a dark seat', /forcedCamOff\(pid\)/.test(fsSrc));
check('fsSources carries the receiver blur level of each peer (blurLevelFor)', /blurLevelFor\(pid\)/.test(fsSrc));
const fsRef = fn('function fsRefresh()', 'function openFsView');
check('fsRefresh paints the blur class on the big feed (#fsmain)', /fsBlurClass\(fsmain, main\.bl\)/.test(fsRef));
check('fsRefresh paints the blur class on every thumb, on build and on every re-borrow', (fsRef.match(/fsBlurClass\(tv, s\.bl\)/g) || []).length >= 2);
check('fsBlurClass wears the same two classes the grid tile does', /function fsBlurClass\(v, bl\) \{ v\.classList\.remove\('blur1', 'blur2'\); if \(bl\) v\.classList\.add\('blur' \+ bl\); \}/.test(run));

// 2. the PiP picker never floats a peer an admin turned off or a moderator blurred
const pip = fn('function pipSource()', 'async function enterPip');
check('pipSource skips a peer under an admin video-off', /forcedCamOff\(pid\)/.test(pip));
check('pipSource skips a peer under a moderator blur block (PiP paints the raw frames — no CSS blur there)', /\.blur\b[\s\S]{0,40}\.on/.test(pip) || /modBlurOn\(pid\)/.test(pip));

// 3. iOS native full screen (raw <video>, no CSS) is refused for a moderated remote feed
const maxbtn = fn("maxbtn.addEventListener('click'", 'tile.appendChild(maxbtn)');
check('the iOS native-fullscreen branch exists', /webkitEnterFullscreen/.test(maxbtn));
check('…and a remote feed that is blurred or video-off never takes it (the overlay keeps the CSS)',
  /const moderated = !isMe && \(forcedCamOff\(id\) \|\| blurLevelFor\(id\) > 0\);/.test(maxbtn) && /video\.webkitEnterFullscreen && !moderated\)/.test(maxbtn));

// 4. the blur CSS covers the filmstrip sinks
check('the blur1/blur2 CSS applies to #fsmain and .fsthumb video, not only .tile video',
  /#fsmain\.blur1/.test(run) && /\.fsthumb video\.blur1/.test(run) && /#fsmain\.blur2/.test(run) && /\.fsthumb video\.blur2/.test(run));

// 5. the stage data lane verifies an 'app' frame before retaining it
const deliver = fn('function sgaDeliver(m)', '// ---- late-joiner snapshot replay');
check('sgaDeliver no longer retains an unverified app frame (first copy wins only among VERIFIED copies)', !/if \(!sgaApp\.has\(m\.sid\)\) sgaApp\.set\(m\.sid, m\)/.test(deliver));
check('an app frame goes through the owner verifier (makeVerifier) before sgaApp.set', /makeVerifier/.test(run) && /sgaApp\.set\(m\.sid, m\)/.test(fn('function sgaRetainApp', 'function sgaDeliver')));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
process.exit(fails ? 1 : 0);
