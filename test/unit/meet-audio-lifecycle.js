// meet-audio-lifecycle.js — the meeting's audio plumbing lifted out of
// site/run.html and run in Node. Five rules, one adversarial review
// (2026-10-03, package audio-leave-whisper):
//
//   1. SILENCE IS `muted`, NOT `volume = 0`. busVolume is how a structural
//      link's raw mic and a stager's direct track are kept quiet. iOS Safari
//      ignores the HTMLMediaElement volume setter, so a bus at 0 must also
//      set muted — else an iPhone hears every ghost voice at full level.
//      The stage ear follows the same rule for the Stage fader.
//   2. A REBUILT METER RE-CUTS ITS WHISPER CAPTURE. meterFor disconnects the
//      old source node; a capture wired to it goes deaf with nothing to say
//      so. Camera flip, mic mode and a peer re-claim all rebuild meters.
//   3. LEAVE STOPS THE RECORDER AND THE CAPTURES. A recording in flight is
//      flushed and handed over (onstop downloads it); the Whisper captures
//      and the provider rescan stop with the tracks.
//   4. THE EAR IS MEMBERSHIP, NOT A PIPE. A stepped-down stager's stg claim
//      lingers through the pipe grace; the ear must drop it the sweep the
//      gossiped stage set does, or the row hears that voice twice.
//   5. "MUTE FOR EVERYONE" HOLDS ON THE STAGE LANE. Direct tiles enforce a
//      moderator mute at the receiver; the ear folds a muted stager at 0.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
function lift(startMark, endMark) {
  const a = html.indexOf(startMark);
  const b = a < 0 ? -1 : html.indexOf(endMark, a + startMark.length);
  check('lift: ' + startMark.trim().slice(0, 40) + ' is where the lift expects it', a > 0 && b > a);
  return a > 0 && b > a ? html.slice(a, b) : '';
}

// ---- rule 1: busVolume silences with muted ---------------------------------
{
  const src = lift('    function busVolume(el, vol) {', '    function applyBuses() {');
  class Audio { constructor() { this.volume = 1; this.muted = false; this.srcObject = null; this.autoplay = false; } play() { return Promise.resolve(); } }
  const busVolume = new Function('Audio', 'audioBlocked', src + '\nreturn busVolume;')(Audio, () => {});
  const el = { srcObject: { id: 's1' }, muted: false, _gmute: false };
  busVolume(el, 0);
  check('a bus at 0 MUTES the companion (iOS ignores volume)', el._aud && el._aud.muted === true && el._aud.volume === 0, el._aud);
  check('the <video> itself is picture-only', el.muted === true);
  busVolume(el, 0.4);
  check('a bus above 0 unmutes and keeps the fader value', el._aud.muted === false && Math.abs(el._aud.volume - 0.4) < 1e-9, el._aud);
  el._gmute = true; busVolume(el, 0.4);
  check('group mute still rides the same pipe', el._aud.muted === true);
  el._gmute = false; busVolume(el, 1);
  check('…and lifts with it', el._aud.muted === false && el._aud.volume === 1);
}

// ---- rules 2 + 3 (captures): meterFor re-cuts a live Whisper capture ---------
function makeAudio() {
  const mkSrc = () => ({ outs: [], connect(n) { this.outs.push(n); }, disconnect(n) { this.outs = n ? this.outs.filter((x) => x !== n) : []; } });
  const ac = { sampleRate: 48000, destination: {}, state: 'running',
    createMediaStreamSource: () => mkSrc(),
    createAnalyser: () => ({ fftSize: 256, connect() {} }),
    createScriptProcessor: () => ({ onaudioprocess: null, connect() {}, disconnect() {} }) };
  class MediaStream { constructor(t) { this.t = t || []; } getAudioTracks() { return this.t.filter((x) => x.kind === 'audio'); } }
  const meters = new Map();
  const myStatus = { cc: true, muted: false, scribe: false };
  const peers = new Map(), statusOf = new Map();
  const src = lift('    function meterFor(id, stream) {', '    let meterHiddenTick')
    + lift('    const wspCaps = new Map();', '    const scribeSeen = new Set();')
    + '\nreturn { meterFor, wspStart, wspStop, wspSync, caps: wspCaps };';
  const api = new Function('ensureAc', 'ac', 'meters', 'MediaStream', 'whisperReady', 'setStatus', 'localStream', 'speakingOf', 'myVoiceAt',
    'myStatus', 'ccEngine', 'ccSourceId', 'peers', 'statusOf', 'modOf', 'WSP_PRE_MS', 'WSP_GAP_MS', 'WSP_MAX_S', 'WSP_MIN_S', 'WSP_BACKLOG', 'WSP_SCRIBE_MAX', src)(
    () => ac, ac, meters, MediaStream, () => true, () => {}, null, new Map(), 0,
    myStatus, () => 'whisper', null, peers, statusOf, () => ({}), 400, 700, 15, 0.4, 3, 8);
  return Object.assign(api, { meters, MediaStream, myStatus, peers, statusOf });
}
{
  const A = makeAudio();
  const s1 = new A.MediaStream([{ kind: 'audio', id: 'a1' }]), s2 = new A.MediaStream([{ kind: 'audio', id: 'a2' }]);
  A.meterFor('me', s1);
  check('my capture starts on the meter source', A.wspStart('me') === true && A.caps.get('me').src === A.meters.get('me').src);
  const node = A.caps.get('me').node, oldSrc = A.meters.get('me').src;
  check('the ScriptProcessor hangs off that source', oldSrc.outs.includes(node));
  A.meterFor('me', s2); // mic mode / camera flip / regrab: the meter is rebuilt
  const w = A.caps.get('me');
  check('a rebuilt meter re-cuts the capture on the NEW source node', !!w && w.src === A.meters.get('me').src,
    { captureOnNew: !!w && w.src === A.meters.get('me').src, stillHeld: A.caps.has('me') });
  check('…and the new source actually feeds the processor', !!w && A.meters.get('me').src.outs.includes(w.node));
  check('the old source node is released', oldSrc.outs.length === 0 && (!w || w.node !== node));
  // a scribe's neighbour re-claims its stream (relay re-claim, line ~8640)
  A.myStatus.scribe = true; A.peers.set('p1', { connected: true }); A.statusOf.set('p1', {});
  const s3 = new A.MediaStream([{ kind: 'audio', id: 'a3' }]), s4 = new A.MediaStream([{ kind: 'audio', id: 'a4' }]);
  A.meterFor('p1', s3); A.wspSync();
  check('the scribe captures the neighbour off its meter', A.caps.has('p1') && A.caps.get('p1').src === A.meters.get('p1').src);
  A.meterFor('p1', s4);
  check('the neighbour\'s re-claimed stream re-cuts the scribe capture too', A.caps.has('p1') && A.caps.get('p1').src === A.meters.get('p1').src);
  A.myStatus.cc = false; A.wspSync();
  check('captions off ⇒ my capture stops (wspSync still owns the want set)', !A.caps.has('me'));
}

// ---- rule 3: Leave stops the recorder, the captures and the rescan ----------
{
  // Leave runs stopLocalCapture (recorder, captions, share, speech, wake lock)
  // and releaseAudioContext, defined just above it: lift all three.
  const src = lift('    function stopLocalCapture() {', '    const leaveBtn = ');
  const calls = [];
  const recRec = { state: 'recording', stop() { this.state = 'inactive'; calls.push('rec.stop'); } };
  const leaveMeeting = new Function('myStatus', 'stopScreenShare', 'stopSpeech', 'sendMeshLeave', 'localStream', 'peers', 'dropPeer', 'document',
    'recRec', 'recDraw', 'stopWhisper', 'whisperRescan', 'clearInterval', src + '\nreturn leaveMeeting;')(
    { scr: false }, () => calls.push('share'), () => calls.push('speech'), () => calls.push('bye'),
    { getTracks: () => [{ stop: () => calls.push('track') }] }, new Map([['p', {}]]), (id) => calls.push('drop:' + id),
    { getElementById: () => ({ style: {} }) },
    recRec, () => calls.push('recDraw'), () => calls.push('whisper'), 42, (h) => calls.push('clear:' + h));
  const r = leaveMeeting();
  check('Leave stops a recording in flight (onstop then hands the file over)', calls.includes('rec.stop'), calls);
  check('…after unsubscribing the compositor, so the flush is not starved', calls.indexOf('recDraw') >= 0 && calls.indexOf('recDraw') < calls.indexOf('rec.stop'), calls);
  check('Leave says a recording was in flight (the card stays up for the download)', r === true, r);
  check('Leave stops every Whisper capture', calls.includes('whisper'), calls);
  check('Leave stops the provider rescan', calls.includes('clear:42'), calls);
  check('the farewell, the tracks and the peers still go', calls.includes('bye') && calls.includes('track') && calls.includes('drop:p'), calls);
  check('the OS hang-up action goes through the same leave', /wire\('hangup', \(\) => \{[^\n]*leaveMeeting\(\)/.test(html));
}

// ---- rules 4 + 5 + 1(ear): the stage ear ----------------------------------
function makeEar() {
  const src = lift('    function syncStageEar(stagers) {', '\n    }\n') + '\n    }\nreturn syncStageEar;';
  const fold = { gains: new Map(), add(k, st, g) { this.gains.set(k, g); }, remove(k) { this.gains.delete(k); },
    setGain(k, v) { if (this.gains.has(k)) this.gains.set(k, v); }, clear() { this.gains.clear(); } };
  const stageEar = { fold, el: { volume: 1, muted: false }, sids: new Map() };
  const mosIn = new Map(), mix = { stage: 1, row: 1, stadium: 1 };
  const mods = {};
  const sync = new Function('stageEar', 'mosIn', 'myId', 'mix', 'modOf', src)(stageEar, mosIn, 'me', mix, (id) => mods[id] || {});
  return { sync, fold, stageEar, mosIn, mix, mods };
}
{
  const E = makeEar();
  E.mosIn.set('stg:A', { stream: { id: 'sA' } });
  E.mosIn.set('stg:B', { stream: { id: 'sB' } });
  E.mosIn.set('stg:me', { stream: { id: 'sMe' } });
  E.sync(['A', 'B', 'me']);
  check('the ear folds every stager I hold, never my own echo', [...E.stageEar.sids.keys()].sort().join() === 'stg:A,stg:B', [...E.stageEar.sids.keys()]);
  E.sync(['A', 'me']); // B stepped down; its claim lingers through MOS_GRACE
  check('a stepped-down stager leaves the ear the same sweep the stage set drops it (claim still held)',
    [...E.stageEar.sids.keys()].join() === 'stg:A' && !E.fold.gains.has('stg:B'), { sids: [...E.stageEar.sids.keys()], gains: [...E.fold.gains] });
  E.sync(['A', 'B', 'me']); // back up before the claim aged out: nothing to re-claim, just re-fold
  check('a step back up re-folds the held claim at once', E.stageEar.sids.has('stg:B') && E.fold.gains.get('stg:B') === 1);
  E.mosIn.delete('stg:B'); E.sync(['A', 'B', 'me']);
  check('a dropped claim leaves the ear whatever the stage set says', !E.stageEar.sids.has('stg:B'));
  // a stage feed arriving before the status gossip is held back until membership names it
  E.mosIn.set('stg:C', { stream: { id: 'sC' } }); E.sync(['A', 'me']);
  check('a claim with no membership yet is not folded', !E.stageEar.sids.has('stg:C'));
}
{
  const E = makeEar();
  E.mosIn.set('stg:A', { stream: { id: 'sA' } });
  E.sync(['A']);
  check('an unmuted stager folds at 1', E.fold.gains.get('stg:A') === 1);
  E.mods.A = { mute: { on: true } }; E.sync(['A']);
  check('"Mute for everyone" holds at the EAR, at the receiver', E.fold.gains.get('stg:A') === 0, [...E.fold.gains]);
  E.mods.A = { mute: { on: false } }; E.sync(['A']);
  check('…and lifts when the moderator unmutes', E.fold.gains.get('stg:A') === 1);
  E.mix.stage = 0; E.sync(['A']);
  check('the Stage fader at 0 MUTES the ear element (iOS ignores volume)', E.stageEar.el.muted === true && E.stageEar.el.volume === 0);
  E.mix.stage = 0.5; E.sync(['A']);
  check('…and unmutes above 0', E.stageEar.el.muted === false && E.stageEar.el.volume === 0.5);
  check('applyBuses drives the ear the same way', /stageEar\.el\.muted = !\(mix\.stage > 0\)/.test(html.slice(html.indexOf('    function applyBuses() {'), html.indexOf('    function applyBuses() {') + 3000)));
}
{
  // the fold itself: a live source's gain can be driven after add
  global.MediaStream = class { constructor(t) { this.t = t; } getAudioTracks() { return this.t; } };
  require('../../site/js/gifos-net.js'); require('../../site/js/mesh-media.js');
  const gains = [];
  const ac = { createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [] } }),
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createGain: () => { const g = { gain: { value: 1 }, connect() {}, disconnect() {} }; gains.push(g); return g; } };
  const fold = globalThis.GifOS.meshMedia.createAudioFold(ac);
  fold.add('k', { getAudioTracks: () => [{}] }, 1);
  check('createAudioFold exposes setGain', typeof fold.setGain === 'function');
  if (fold.setGain) { fold.setGain('k', 0); check('setGain drives the live gain node', gains[0].gain.value === 0); fold.setGain('k', 1); check('…both ways', gains[0].gain.value === 1); fold.setGain('nope', 0); check('an unknown key is a no-op', true); }
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
