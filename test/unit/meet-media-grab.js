// meet-media-grab.js — how the meeting takes the camera and microphone, lifted
// out of site/run.html and run in Node against a fake navigator:
//
//   1. NO CAMERA IS NOT NO MICROPHONE. A desktop without a webcam (or whose
//      camera is held by another app) gets NotFoundError on the combined
//      camera+mic ask, and the mic was lost with it — every webcam-less PC
//      joined view-only for life and was told to close an app that did not
//      exist. The combined ask falls back to audio alone on any failure that
//      is not a refusal; a refusal (NotAllowedError) is the user's answer and
//      is never re-asked.
//   2. A MIC-MODE REQUEST IS KEPT, NOT DROPPED. setMicMode callers fire once
//      (song start, song end, device change); a request that lands while a
//      grab is in flight used to be discarded, leaving a follower suppressed
//      through the song or a leader without echo cancellation for the rest of
//      the meeting. The last request runs the moment the grab settles.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

let sid = 0;
function fakeStream(kinds) {
  const tracks = kinds.map((k) => ({ kind: k, enabled: true, readyState: 'live', id: k + ++sid, stop() { this.readyState = 'ended'; } }));
  return {
    id: 'stream' + ++sid,
    getTracks: () => tracks.slice(),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    addTrack: (t) => { tracks.push(t); },
    removeTrack: (t) => { const i = tracks.indexOf(t); if (i >= 0) tracks.splice(i, 1); },
  };
}
const err = (name) => Object.assign(new Error(name), { name });

// ---- lift the late-media block (attachLocalTracks + lateMedia) ----
const lmStart = html.indexOf('    let lateAsk = false;');
const lmEnd = html.indexOf('    micBtn.onclick = () => {');
check('the late-media block is where the lift expects it', lmStart > 0 && lmEnd > lmStart);
function makeLateMedia(gum, opts) {
  const statuses = [];
  const calls = { paint: 0, outbound: 0, status: 0 };
  const src = 'let localStream = null; const myStatus = { muted: true, camOff: true };\n'
    + html.slice(lmStart, lmEnd)
    + '\n return { lateMedia, stream: () => localStream, myStatus, bootPending: (p) => { bootGumPending = p; } };';
  const fn = new Function('navigator', 'document', 'setStatus', 'meTile', 'maybeShowFlip', 'meterFor', 'peers',
    'paintControls', 'refreshOutbound', 'broadcastStatus', 'reactRoomState', 'updateMediaSession', 'camVideoConstraints', src);
  const meTile = { tile: { querySelector: () => null }, video: { style: {}, srcObject: null } };
  const api = fn(
    { mediaDevices: { getUserMedia: gum } },
    { body: { classList: { contains: (c) => !!(opts && opts.appRoom && c === 'app-room') } } },
    (s) => { statuses.push(s); }, meTile, () => {}, () => {}, new Map(),
    () => { calls.paint++; }, () => { calls.outbound++; }, () => { calls.status++; }, () => {}, () => {}, () => ({ facingMode: 'user' }));
  api.statuses = statuses; api.calls = calls;
  return api;
}

// ---- rule 1: a PC with a microphone and no camera ----
(async () => {
  {
    const asks = [];
    const gum = (c) => { asks.push(c); return c.video ? Promise.reject(err('NotFoundError')) : Promise.resolve(fakeStream(['audio'])); };
    const L = makeLateMedia(gum);
    L.lateMedia('mic');
    await settle();
    check('mic tap on a webcam-less PC: the combined ask is tried first', asks.length >= 1 && !!asks[0].video && asks[0].audio === true, JSON.stringify(asks));
    check('…NotFoundError on the camera is answered by an audio-only ask', asks.length === 2 && asks[1].audio === true && !asks[1].video, JSON.stringify(asks));
    check('…and the page holds a live microphone', !!(L.stream() && L.stream().getAudioTracks()[0] && L.stream().getAudioTracks()[0].enabled));
    check('…the mic is ON (that was the tap)', L.myStatus.muted === false && L.myStatus.camOff === true);
    check('…and the status says so', L.statuses[L.statuses.length - 1] === 'Mic on.', JSON.stringify(L.statuses));
    check('…the tracks reached the controls and the outbound sweep', L.calls.paint === 1 && L.calls.outbound === 1 && L.calls.status === 1);
  }
  {
    const asks = [];
    const gum = (c) => { asks.push(c); return c.video ? Promise.reject(err('NotFoundError')) : Promise.resolve(fakeStream(['audio'])); };
    const L = makeLateMedia(gum);
    L.lateMedia('cam');
    await settle();
    check('camera tap on a webcam-less PC still lands the microphone (quiet)', !!(L.stream() && L.stream().getAudioTracks()[0]) && L.myStatus.muted === true);
    check('…the camera stays OFF: no video track was ever taken', L.myStatus.camOff === true && !!L.stream() && L.stream().getVideoTracks().length === 0);
    check('…and the note names the camera, not permissions', /no camera/i.test(L.statuses[L.statuses.length - 1] || '') && /NotFoundError/.test(L.statuses[L.statuses.length - 1] || ''), JSON.stringify(L.statuses));
    // a second camera tap, mic already held: one video-only ask, no refetch of the mic
    asks.length = 0;
    L.lateMedia('cam');
    await settle();
    check('…a later camera tap asks for video alone (the mic is already held)', asks.length === 1 && !!asks[0].video && !asks[0].audio, JSON.stringify(asks));
    check('…and does not throw the held mic away', !!(L.stream() && L.stream().getAudioTracks()[0] && L.stream().getAudioTracks()[0].readyState === 'live'));
  }
  {
    const asks = [];
    const gum = (c) => { asks.push(c); return Promise.reject(err('NotAllowedError')); };
    const L = makeLateMedia(gum);
    L.lateMedia('mic');
    await settle();
    check('a REFUSAL is never re-asked: one combined ask, no audio-only retry', asks.length === 1, JSON.stringify(asks));
    check('…and the note says the browser refused', /refused/i.test(L.statuses[L.statuses.length - 1] || ''), JSON.stringify(L.statuses));
  }
  {
    const asks = [];
    const gum = (c) => { asks.push(c); return Promise.reject(err('NotFoundError')); };
    const L = makeLateMedia(gum);
    L.lateMedia('mic');
    await settle();
    check('no camera AND no microphone: both asks fail and the note names the device, not another app',
      asks.length === 2 && /found/i.test(L.statuses[L.statuses.length - 1] || '') && !/close it/i.test(L.statuses[L.statuses.length - 1] || ''), JSON.stringify(L.statuses));
  }
  {
    const asks = [];
    const gum = (c) => { asks.push(c); return Promise.resolve(fakeStream(['audio'])); };
    const L = makeLateMedia(gum, { appRoom: true });
    L.lateMedia('mic');
    await settle();
    check('an app room asks for audio only, as before', asks.length === 1 && asks[0].audio === true && !asks[0].video, JSON.stringify(asks));
  }

  // ---- rule 1b: the boot ask and the mid-call re-grab take the same road ----
  {
    const bootAt = html.indexOf("md.getUserMedia({ video: camVideoConstraints(), audio: true })");
    check('the boot ask no longer calls getUserMedia for camera+mic with no fallback', bootAt < 0, 'raw combined ask still at offset ' + bootAt);
    const bootBlock = html.slice(html.indexOf('          const md = navigator.mediaDevices;\n'), html.indexOf('          bootGumPending = gum.finally'));
    check('the boot ask goes through the mic fallback', /gumWithMicFallback\(/.test(bootBlock), bootBlock.slice(0, 200));
    const regrab = html.slice(html.indexOf('    function regrabCamera(reason) {'), html.indexOf('    (function blackCamWatch() {'));
    check('regrabCamera (reviveCamera after a backgrounded tab) goes through the mic fallback', /gumWithMicFallback\(/.test(regrab));
    const bootFail = html.slice(html.indexOf("window.__gumBootErr = "), html.indexOf("// The boot promise deliberately does NOT wait on the prompt."));
    check('a boot failure that is not a refusal is not called a permission problem', /gumRefused\(e\)/.test(bootFail) && /tap the mic or camera button/.test(bootFail));
  }

  // ---- rule 2: a mic-mode request during a grab is kept ----
  const mmStart = html.indexOf("    let micMode = 'voice', micGrabbing = false");
  const mmEnd = html.indexOf('    // Headphones plugged in (or pulled out) MID-MEETING');
  check('the mic-mode block is where the lift expects it', mmStart > 0 && mmEnd > mmStart);
  function makeMicMode(gum) {
    const src = html.slice(mmStart, mmEnd) + '\n return { setMicMode, mode: () => micMode, grabbing: () => micGrabbing, stream: () => localStream };';
    const fn = new Function('navigator', 'localStream', 'myStatus', 'peers', 'auxSenders', 'meterFor', src);
    return fn({ mediaDevices: { getUserMedia: gum } }, fakeStream(['video', 'audio']), { muted: false, camOff: false }, new Map(), new Set(), () => {});
  }
  {
    const asks = [];
    const pending = [];
    const gum = (c) => { asks.push(c); return new Promise((res) => pending.push(res)); };
    const M = makeMicMode(gum);
    M.setMicMode('music');
    M.setMicMode('voice'); // the song ended while the music grab was still in flight
    check('the second request waits for the first grab (one gUM in flight)', asks.length === 1 && M.grabbing() === true);
    pending[0](fakeStream(['audio']));
    await settle();
    check('…the kept request runs the moment the grab settles', asks.length === 2, 'asks=' + asks.length);
    check('…with the voice pipeline (echo cancellation, suppression, auto-gain on)',
      asks[1] && asks[1].audio && asks[1].audio.echoCancellation === true && asks[1].audio.noiseSuppression === true && asks[1].audio.autoGainControl === true, JSON.stringify(asks[1]));
    if (pending[1]) pending[1](fakeStream(['audio']));
    await settle();
    check('…and the mic ends in voice mode, not stuck in music mode', M.mode() === 'voice' && M.grabbing() === false, 'mode=' + M.mode());
    check('the stream still holds exactly one audio track', M.stream().getAudioTracks().length === 1);
  }
  {
    const asks = [];
    const pending = [];
    const gum = (c) => { asks.push(c); return new Promise((res) => pending.push(res)); };
    const M = makeMicMode(gum);
    M.setMicMode('sing');
    M.setMicMode('music');
    M.setMicMode('voice');
    pending[0](fakeStream(['audio']));
    await settle();
    check('the LAST request wins when several land during one grab', asks.length === 2 && asks[1].audio.noiseSuppression === true, 'asks=' + asks.length);
    if (pending[1]) pending[1](fakeStream(['audio']));
    await settle();
    check('…and no further grab is started once it has applied', asks.length === 2 && M.mode() === 'voice');
  }
  {
    const asks = [];
    const pending = [];
    const gum = (c) => { asks.push(c); return new Promise((res, rej) => pending.push({ res, rej })); };
    const M = makeMicMode(gum);
    M.setMicMode('music');
    M.setMicMode('sing');
    pending[0].rej(err('NotReadableError')); // the music grab was refused
    await settle();
    check('a kept request still runs after a refused grab', asks.length === 2 && M.grabbing() === true, 'asks=' + asks.length);
    if (pending[1]) pending[1].res(fakeStream(['audio']));
    await settle();
    check('…and lands', M.mode() === 'sing', 'mode=' + M.mode());
  }
  {
    const asks = [];
    const gum = (c) => { asks.push(c); return Promise.resolve(fakeStream(['audio'])); };
    const M = makeMicMode(gum);
    M.setMicMode('voice');
    await settle();
    check('a request for the current mode without force is a no-op', asks.length === 0);
    M.setMicMode('voice', true);
    await settle();
    check('…and with force (device change) re-grabs once', asks.length === 1 && M.mode() === 'voice');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack || e); process.exit(2); });
