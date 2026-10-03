// mu-mic-camera.js — four meeting media rules lifted out of site/run.html:
//
//   1. A screen share with the camera off still consents, when blur is
//      No blur. Otherwise a plain room that was clear drops to max blur
//      for the whole presentation. Camera off without a share does not.
//   2. A camera-off tile is not a full-screen target. fsSources omits it,
//      and opening the view used to pin whoever was first.
//   3. devicechange restarts the mic only when an audio input or output id
//      changed. A camera plug and a label refresh do not.
//   4. A getUserMedia that never settles must not leave the mic and camera
//      buttons dead. A re-tap says so. After 15s the ask is abandoned and
//      a later tap can succeed.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

function installClock() {
  const saved = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  let now = 0, seq = 0;
  const timers = new Map();
  global.setTimeout = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { fn, at: now + (ms || 0) });
    return id;
  };
  global.clearTimeout = (id) => { timers.delete(id); };
  function advance(ms) {
    now += ms;
    for (let guard = 0; guard < 20; guard++) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      if (!due.length) break;
      const [id, t] = due[0];
      timers.delete(id);
      t.fn();
    }
  }
  return { advance, pending: () => timers.size, restore() { global.setTimeout = saved.setTimeout; global.clearTimeout = saved.clearTimeout; } };
}

let sid = 0;
function fakeStream(kinds) {
  const tracks = kinds.map((k) => ({ kind: k, enabled: true, readyState: 'live', id: k + ++sid, stop() { this.readyState = 'ended'; } }));
  return {
    id: 'stream' + ++sid,
    getTracks: () => tracks.slice(),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    addTrack: (tr) => { tracks.push(tr); },
    removeTrack: (tr) => { const i = tracks.indexOf(tr); if (i >= 0) tracks.splice(i, 1); },
  };
}

// ---- 1. consents -----------------------------------------------------------
{
  const cm = html.match(/const consents = \(st\) => ([^;]+);/);
  const bm = html.match(/const blurLevel = \(v\) => ([^;]+);/);
  check('consents and blurLevel are where the lift expects them', !!(cm && bm));
  const consents = new Function('st', 'const blurLevel = (v) => ' + bm[1] + '; return (' + cm[1] + ');');
  check('camera on and No blur consents', consents({ camOff: false, blur: 0, scr: 0 }) === true);
  check('camera off and No blur does not consent', consents({ camOff: true, blur: 0, scr: 0 }) === false);
  check('a share with the camera off and No blur consents', consents({ camOff: true, blur: 0, scr: 1710000000000 }) === true);
  check('a share with Max blur does not consent', consents({ camOff: true, blur: 2, scr: 1710000000000 }) === false);
  check('camera on with Max blur does not consent', consents({ camOff: false, blur: 2, scr: 0 }) === false);
  check('a missing status does not consent', consents(null) === false && consents(undefined) === false);
  const room = [
    { camOff: false, blur: 0, scr: 0 },
    { camOff: false, blur: 0, scr: 0 },
    { camOff: false, blur: 0, scr: 0 },
  ];
  check('three consenting peers are a clear plain room', room.every(consents));
  room[2] = { camOff: true, blur: 0, scr: 1710000000000 };
  check('one of them sharing with the camera off keeps the room consenting', room.every(consents));
  room[2] = { camOff: true, blur: 0, scr: 0 };
  check('the same peer with the camera off and no share breaks consent', room.every(consents) === false);
  check('the fold counts the same predicate', /setRefuses\(!consents\(myStatus\)\)/.test(html));
  check('the plain-room tally starts from consents(myStatus)', /function allConsentNow\(\) \{\n      if \(!consents\(myStatus\)\) return false;/.test(html));
}

// ---- 2. full screen on a dark tile ----------------------------------------
{
  const fnStart = html.indexOf('    function fsSkipDark(el)');
  const fnEnd = html.indexOf('    function fsSources()');
  check('fsSkipDark sits in front of fsSources', fnStart > 0 && fnEnd > fnStart);
  const fsSkipDark = new Function(html.slice(fnStart, fnEnd) + '\nreturn fsSkipDark;')();
  const dark = { classList: { contains: (c) => c === 'cam-off' } };
  const live = { classList: { contains: () => false } };
  check('a camera-off tile is skipped', fsSkipDark(dark) === true);
  check('a live tile is not skipped', fsSkipDark(live) === false);
  check('a missing element is not skipped', fsSkipDark(null) === false);
  const handler = html.slice(html.indexOf("maxbtn.addEventListener('click'"), html.indexOf('tile.appendChild(maxbtn)'));
  check('the click returns before openFsView when the tile is dark', handler.indexOf('fsSkipDark(tile)') >= 0 && handler.indexOf('fsSkipDark(tile)') < handler.indexOf('openFsView'));
  check('the moderated-feed guard is still in front of the native player', /const moderated = !isMe && \(forcedCamOff\(id\) \|\| blurLevelFor\(id\) > 0\);/.test(handler));
  check('the button is hidden on a camera-off tile', /\.tile\.cam-off \.maxbtn \{ display: none; \}/.test(html));
}

// ---- 3. devicechange -------------------------------------------------------
{
  const start = html.indexOf("    let micMode = 'voice', micGrabbing = false");
  const end = html.indexOf('    // Join (or create) the room.');
  check('the mic and devicechange block is where the lift expects it', start > 0 && end > start);
  const mic = { kind: 'audioinput', deviceId: 'mic1', label: '' };
  const spk = { kind: 'audiooutput', deviceId: 'spk1', label: '' };
  const cam = { kind: 'videoinput', deviceId: 'cam1', label: 'FaceTime' };
  const headset = { kind: 'audiooutput', deviceId: 'hs1', label: 'Headset' };
  function makeDevices() {
    const asks = [];
    let list = [];
    let enumerate = () => Promise.resolve(list.map((d) => Object.assign({}, d)));
    let listener = null;
    const md = {
      getUserMedia: (c) => { asks.push(c); return Promise.resolve(fakeStream(['audio'])); },
      addEventListener: (ev, fn) => { if (ev === 'devicechange') listener = fn; },
      enumerateDevices: () => enumerate(),
    };
    const src = html.slice(start, end) + '\nreturn { fire: onMeetDeviceChange, key: () => audioDevKey, note: noteAudioDevices };';
    const fn = new Function('navigator', 'document', 'localStream', 'myStatus', 'peers', 'auxSenders', 'meterFor', 'audioBlocked', src);
    const api = fn(
      { mediaDevices: md },
      { querySelectorAll: () => [] },
      fakeStream(['audio', 'video']),
      { muted: true, camOff: true },
      new Map(), new Set(), () => {}, () => {});
    api.asks = asks;
    api.setList = (l) => { list = l; };
    api.setEnumerate = (f) => { enumerate = f; };
    api.dropEnumerate = () => { delete md.enumerateDevices; };
    api.listener = listener;
    return api;
  }
  const clock = installClock();
  (async () => {
    try {
      const D = makeDevices();
      check('devicechange is registered', typeof D.listener === 'function');
      D.setList([mic, spk]);
      await D.note();
      await flush();
      const base = D.key();
      check('the grant records the audio ids', base === 'audioinput:mic1\naudiooutput:spk1', JSON.stringify(base));
      D.fire();
      clock.advance(400);
      await flush();
      check('an unchanged devicechange does not re-grab the mic', D.asks.length === 0, 'asks=' + D.asks.length);
      D.setList([Object.assign({}, mic, { label: 'Built-in Mic' }), Object.assign({}, spk, { label: 'Speakers' })]);
      D.fire();
      clock.advance(400);
      await flush();
      check('a label-only refresh does not re-grab the mic', D.asks.length === 0, 'asks=' + D.asks.length);
      D.setList([mic, spk, cam]);
      D.fire();
      clock.advance(400);
      await flush();
      check('plugging a camera does not re-grab the mic', D.asks.length === 0, 'asks=' + D.asks.length);
      D.setList([mic, spk, cam, headset]);
      D.fire();
      clock.advance(400);
      await flush();
      check('plugging a headset re-grabs once', D.asks.length === 1, 'asks=' + D.asks.length);
      const audio = D.asks[0] && D.asks[0].audio;
      check('the re-grab keeps the current voice pipeline', !!audio && audio.echoCancellation === true && audio.noiseSuppression === true && audio.autoGainControl === true && !D.asks[0].video, JSON.stringify(D.asks[0]));
      D.fire();
      clock.advance(400);
      await flush();
      check('the same headset does not re-grab again', D.asks.length === 1, 'asks=' + D.asks.length);

      const R = makeDevices();
      R.setEnumerate(() => Promise.reject(new Error('enumerate failed')));
      R.setList([mic, headset]);
      R.fire();
      clock.advance(400);
      await flush();
      check('a failed enumerate still restarts the mic (the headset must route)', R.asks.length === 1, 'asks=' + R.asks.length);

      const N = makeDevices();
      N.dropEnumerate();
      N.fire();
      clock.advance(400);
      await flush();
      check('no enumerateDevices at all still restarts the mic', N.asks.length === 1, 'asks=' + N.asks.length);
      check('boot records the audio set when the mic is granted', /broadcastStatus\(\);\n            noteAudioDevices\(\);/.test(html));
    } finally {
      clock.restore();
    }

    // ---- 4. a hung permission ask ------------------------------------------
    const lmStart = html.indexOf('    let lateAsk = false;');
    const lmEnd = html.indexOf('    micBtn.onclick = () => {');
    check('the late-media block is where the lift expects it', lmStart > 0 && lmEnd > lmStart);
    check('the hung ask gives the buttons back at 15s', /const LATE_ASK_MS = 15000;/.test(html));
    function makeLate(gum) {
      const statuses = [];
      const src = 'let localStream = null; const myStatus = { muted: true, camOff: true };\n'
        + html.slice(lmStart, lmEnd)
        + '\n return { lateMedia, stream: () => localStream, myStatus };';
      const fn = new Function('navigator', 'document', 'setStatus', 'meTile', 'maybeShowFlip', 'meterFor', 'peers',
        'paintControls', 'refreshOutbound', 'broadcastStatus', 'reactRoomState', 'updateMediaSession', 'camVideoConstraints', src);
      const meTile = { tile: { querySelector: () => null }, video: { style: {}, srcObject: null } };
      const api = fn(
        { mediaDevices: { getUserMedia: gum } },
        { body: { classList: { contains: () => false } } },
        (s) => { statuses.push(s); }, meTile, () => {}, () => {}, new Map(),
        () => {}, () => {}, () => {}, () => {}, () => {}, () => ({ facingMode: 'user' }));
      api.statuses = statuses;
      return api;
    }
    const clock2 = installClock();
    try {
      const asks = [];
      let impl = () => new Promise(() => {});
      const L = makeLate((c) => { asks.push(c); return impl(c); });
      L.lateMedia('mic');
      check('the first tap asks once', asks.length === 1 && !!asks[0].video && asks[0].audio === true, JSON.stringify(asks));
      L.lateMedia('mic');
      check('a re-tap while the ask is open does not ask again', asks.length === 1);
      check('…and says it is still asking', L.statuses[L.statuses.length - 1] === 'Still asking for the camera and microphone\u2026', JSON.stringify(L.statuses));
      clock2.advance(14999);
      check('the ask is still held at 14.999s', asks.length === 1 && L.statuses[L.statuses.length - 1].indexOf('Still asking') === 0);
      clock2.advance(1);
      const gave = L.statuses[L.statuses.length - 1] || '';
      check('at 15s the status names the permission settings', /has not answered the camera and microphone ask/.test(gave) && /permissions/.test(gave), gave);
      const streamB = fakeStream(['audio', 'video']);
      impl = () => Promise.resolve(streamB);
      L.lateMedia('mic');
      await flush();
      check('a later tap asks again', asks.length === 2, 'asks=' + asks.length);
      check('…and the mic comes on', L.myStatus.muted === false && !!(L.stream() && L.stream().getAudioTracks()[0] && L.stream().getAudioTracks()[0].enabled));
      check('…the camera stays off: the tap was the mic', L.myStatus.camOff === true);
      check('the success status is Mic on, not the timeout line', L.statuses[L.statuses.length - 1] === 'Mic on.', JSON.stringify(L.statuses));

      const asks2 = [];
      let resolveA = null;
      const streamA = fakeStream(['audio']);
      let impl2 = () => new Promise((res) => { resolveA = res; });
      const L2 = makeLate((c) => { asks2.push(c); return impl2(c); });
      L2.lateMedia('mic');
      clock2.advance(15000);
      const streamC = fakeStream(['audio']);
      impl2 = () => Promise.resolve(streamC);
      L2.lateMedia('mic');
      await flush();
      resolveA(streamA);
      await flush();
      check('a late answer from the abandoned ask is dropped', streamA.getAudioTracks()[0].readyState === 'ended');
      check('…and the later tap keeps its microphone', L2.stream() && L2.stream().getAudioTracks()[0] === streamC.getAudioTracks()[0] && L2.myStatus.muted === false);

      const asks3 = [];
      const L3 = makeLate((c) => { asks3.push(c); return Promise.resolve(fakeStream(['audio', 'video'])); });
      L3.lateMedia('mic');
      await flush();
      check('a prompt that settles does not leave a 15s timer', clock2.pending() === 0, 'pending=' + clock2.pending());
      clock2.advance(15000);
      check('…and does not overwrite Mic on', L3.statuses[L3.statuses.length - 1] === 'Mic on.', JSON.stringify(L3.statuses));
    } finally {
      clock2.restore();
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch((e) => { console.error('FATAL', e && e.stack || e); process.exit(2); });
}
