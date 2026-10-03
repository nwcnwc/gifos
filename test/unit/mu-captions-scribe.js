// mu-captions-scribe.js — captions, the scribe offer, and the recorder.
// Lifts the pieces out of site/run.html and runs them in Node.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}
function slice(startMark, endMark) {
  const a = html.indexOf(startMark);
  const b = a < 0 ? -1 : html.indexOf(endMark, a + startMark.length);
  check('slice ' + startMark.trim().slice(0, 42), a > 0 && b > a, a + '..' + b);
  return a > 0 && b > a ? html.slice(a, b) : '';
}

// ---- one metro blob URL across subscriber restarts ----
{
  const src = slice('    const METRO_SRC = URL.createObjectURL', '    // Canvas blur');
  const prevURL = globalThis.URL, prevW = globalThis.Worker;
  let created = 0;
  const workers = [];
  globalThis.URL = { createObjectURL() { created++; return 'blob:metro'; }, revokeObjectURL() {} };
  globalThis.Worker = class {
    constructor(u) { this.src = u; this.dead = false; workers.push(this); }
    terminate() { this.dead = true; }
  };
  try {
    const api = new Function(src + '\nreturn { metroSub };')();
    for (let i = 0; i < 50; i++) api.metroSub(() => {})();
    check('50 subscribe/unsubscribe cycles create the blob URL once', created === 1, 'created ' + created);
    check('each cycle still gets a worker, and every worker is terminated',
      workers.length === 50 && workers.every((w) => w.dead && w.src === 'blob:metro'), workers.length);
  } finally {
    globalThis.URL = prevURL;
    globalThis.Worker = prevW;
  }
}

// ---- retired probe, ladder, and the admBeat comment ----
check('API.ready is gone', html.indexOf('API.ready') < 0 && html.indexOf('1.5s cap') < 0);
check('whenSupported calls through when the browser can meet',
  /API\.whenSupported = function \(f\) \{\s*if \(!API\.ok\) return;\s*f\(\);/.test(html));
check('the ladder comment names live links, not a full mesh',
  /bounded by the row/.test(html) && html.indexOf('upload cost grows with (n-1)') < 0);
check('gossipAgeMs keeps the relayed-gossip comment, admBeatAt does not', (() => {
  const g = html.split('\n').find((l) => l.indexOf('let gossipAgeMs') >= 0) || '';
  const a = html.split('\n').find((l) => l.indexOf('let admBeatAt') >= 0) || '';
  return g.indexOf('relayed gossip') >= 0 && a.indexOf('relayed gossip') < 0 && a.indexOf('admin presence') >= 0;
})());
check('knownTotal says statuses reach the section', /Statuses reach the\s+\/\/ section/.test(html));

// ---- scribe offer: section status and a room-wide advert, no direct-peer test ----
{
  const src = slice('    const scribeOffers = new Map();', '    function scribeWatch()');
  const statusOf = new Map(), peers = new Map(), rosterNames = {};
  const api = new Function('statusOf', 'peers', 'rosterNames', 'myId', 'gossipAgeMs',
    src + '\nreturn { noteScribe, ccScribes, offers: scribeOffers };')(statusOf, peers, rosterNames, 'me', 0);
  statusOf.set('sec', { scribe: true });
  rosterNames.sec = 'Section';
  let list = api.ccScribes();
  check('a section scribe is listed without a direct peer', list.length === 1 && list[0].id === 'sec' && peers.size === 0, JSON.stringify(list));
  api.noteScribe('far', true, 'Far', 5000);
  list = api.ccScribes();
  check('a room-wide offer lists a scribe this section never heard',
    list.some((x) => x.id === 'far' && x.name === 'Far') && list.some((x) => x.id === 'sec'), JSON.stringify(list));
  api.noteScribe('far', true, 'Stale', 1000);
  check('an older advert does not replace the offer', api.offers.get('far').name === 'Far');
  api.noteScribe('me', true, 'Me', 9000);
  check('my own advert is not an offer I can choose', !api.offers.has('me') && !api.ccScribes().some((x) => x.id === 'me'));
  statusOf.set('far', { scribe: false });
  check('a section status that says the scribe stopped drops the offer',
    !api.ccScribes().some((x) => x.id === 'far') && !api.offers.has('far'));
  api.noteScribe('old', true, 'Old', 1);
  api.offers.get('old').rx = Date.now() - 60000;
  check('an offer older than 30s is dropped', !api.ccScribes().some((x) => x.id === 'old'));
}
{
  const src = slice('    let scribeBeatAt = 0;', '    function ccScribes()');
  const sent = [];
  const myStatus = { scribe: false };
  const room = { past: false, digest: true };
  const api = new Function('fanOut', 'dcSend', 'myStatus', 'myName', 'digestMode', 'roomPastSection',
    src + '\nreturn { scribeAdvert, beat: () => scribeBeatAt };')(
    (msg, via, opts) => sent.push({ msg, opts }), () => {}, myStatus, () => 'Ada', () => room.digest, () => room.past);
  myStatus.scribe = true;
  api.scribeAdvert(); api.scribeAdvert(true);
  check('a room within one section sends no room-wide advert (the status carries the flag)', sent.length === 0, JSON.stringify(sent));
  room.digest = false; room.past = true;
  api.scribeAdvert(true);
  check('a room without the digest plane (statuses flood) sends no advert either', sent.length === 0, JSON.stringify(sent));
  myStatus.scribe = false;
  api.scribeAdvert();
  check('stopping without ever advertising sends no retraction', sent.length === 0, JSON.stringify(sent));
  room.digest = true;
  api.scribeAdvert();
  check('a device that is not a scribe sends no advert', sent.length === 0);
  myStatus.scribe = true;
  api.scribeAdvert();
  api.scribeAdvert();
  check('turning the scribe on sends one ephemeral room-wide advert',
    sent.length === 1 && sent[0].msg.k === 'scribe' && sent[0].msg.on === true
    && sent[0].opts && sent[0].opts.ephemeral === true && !sent[0].opts.scope, JSON.stringify(sent));
  myStatus.scribe = false;
  api.scribeAdvert();
  api.scribeAdvert();
  check('turning the scribe off sends one advert, and only one',
    sent.length === 2 && sent[1].msg.on === false);
}
// ---- a far scribe does not silence my own engine ----
{
  const src = slice('    function ccSourceWritesMe()', "    document.getElementById('ccbtn').onclick");
  const peers = new Map();
  const myStatus = { cc: true, muted: false };
  const log = [];
  let running = false;
  const api = new Function('peers', 'myStatus', 'speechRunning', 'stopSpeech', 'startSpeech', 'wspStop', 'wspSync', 'ccEngine', 'wspCaps', 'startWhisper',
    'let ccSourceId = null, wspPaused = false;\n' + src + '\nreturn { syncSpeech, ccSourceWritesMe, set: (v) => { ccSourceId = v; }, direct: () => ccSrcDirect };')(
    peers, myStatus, () => running, () => { running = false; log.push('stop'); }, () => { running = true; log.push('start'); return true; },
    () => {}, () => {}, () => 'browser', new Map(), () => false);
  api.set('far');
  api.syncSpeech();
  check('choosing a scribe that is not my direct peer keeps my own engine running', running === true && api.ccSourceWritesMe() === false, log.join(','));
  peers.set('near', { connected: true });
  api.set('near');
  api.syncSpeech();
  check('choosing a connected direct-peer scribe stops my own engine', running === false && api.direct() === true, log.join(','));
  peers.get('near').connected = false;
  check('a direct-peer scribe whose link dropped no longer writes me down', api.ccSourceWritesMe() === false);
  api.syncSpeech();
  check('…so my own engine takes over again', running === true, log.join(','));
}
check('wspSync keeps my own Whisper capture unless the chosen scribe hears me',
  /\(!ccSourceId \|\| !ccSourceWritesMe\(\)\) && whisperReady\(\)\) want\.add\('me'\)/.test(html));
check('the 2 s tick re-syncs my engine when the scribe link changes', /if \(ccSourceId && ccSourceWritesMe\(\) !== ccSrcDirect\) syncSpeech\(\)/.test(html));
check('caption lines are still sendAll, not given a scope here', /sendAll\(\{ k: 'tr', m \}\);/.test(html));

// ---- the scribe hears the stage before silent row-mates ----
{
  const src = slice('    function meterFor(id, stream) {', '    let meterHiddenTick')
    + slice('    const wspCaps = new Map();', '    const scribeSeen = new Set();');
  const mkSrc = () => ({ outs: [], connect(n) { this.outs.push(n); }, disconnect(n) { this.outs = n ? this.outs.filter((x) => x !== n) : []; } });
  const ac = {
    sampleRate: 48000, destination: {}, state: 'running',
    createMediaStreamSource: () => mkSrc(),
    createAnalyser: () => ({ fftSize: 256, connect() {} }),
    createScriptProcessor: () => ({ onaudioprocess: null, connect() {}, disconnect() {} }),
  };
  let sid = 0;
  class MediaStream {
    constructor(t) { this.t = t || []; this.id = 'st' + (++sid); }
    getAudioTracks() { return this.t.filter((x) => x.kind === 'audio'); }
  }
  const meters = new Map(), peers = new Map(), statusOf = new Map();
  const speakingOf = new Map([['stageTalk', true], ['rowTalk', true]]);
  const myStatus = { cc: false, muted: false, scribe: true };
  const api = new Function('ensureAc', 'ac', 'meters', 'MediaStream', 'whisperReady', 'setStatus', 'localStream', 'speakingOf', 'myVoiceAt',
    'myStatus', 'ccEngine', 'ccSourceId', 'peers', 'statusOf', 'modOf', 'myId',
    'WSP_PRE_MS', 'WSP_GAP_MS', 'WSP_MAX_S', 'WSP_MIN_S', 'WSP_BACKLOG', 'WSP_SCRIBE_MAX',
    src + '\nreturn { meterFor, wspSync, caps: wspCaps };')(
    () => ac, ac, meters, MediaStream, () => true, () => {}, null, speakingOf, 0,
    myStatus, () => 'whisper', null, peers, statusOf, () => ({}), 'me',
    400, 700, 15, 0.4, 3, 8);
  const stageTalk = new MediaStream([{ kind: 'audio' }]);
  const stageQuiet = new MediaStream([{ kind: 'audio' }]);
  const prevStage = globalThis.stageIds, prevMos = globalThis.mosIn;
  globalThis.stageIds = () => ['stageTalk', 'stageQuiet'];
  globalThis.mosIn = new Map([
    ['stg:stageTalk', { stream: stageTalk }],
    ['stg:stageQuiet', { stream: stageQuiet }],
  ]);
  try {
    api.meterFor('rowTalk', new MediaStream([{ kind: 'audio' }]));
    peers.set('rowTalk', { connected: true });
    for (let i = 0; i < 9; i++) {
      api.meterFor('q' + i, new MediaStream([{ kind: 'audio' }]));
      peers.set('q' + i, { connected: true });
    }
    api.wspSync();
    const ids = Array.from(api.caps.keys());
    check('the stage speaker and the quiet stager are captured without being peers',
      api.caps.has('stageTalk') && api.caps.has('stageQuiet') && !peers.has('stageTalk'), ids.join(','));
    check('the stage capture is the stage stream, not a direct meter',
      api.caps.get('stageTalk').stageSid === stageTalk.id && api.caps.get('stageTalk').own === true);
    check('a talking row-mate keeps a slot and the cap still drops someone',
      api.caps.has('rowTalk') && ids.length === 9 && ids.indexOf('q8') < 0, ids.join(','));
  } finally {
    if (prevStage === undefined) delete globalThis.stageIds; else globalThis.stageIds = prevStage;
    if (prevMos === undefined) delete globalThis.mosIn; else globalThis.mosIn = prevMos;
  }
}
check('a stage clip is kept even when the speaker is not a direct peer',
  /scribeOn\(\) && \(peers\.has\(job\.id\) \|\| job\.stage\)/.test(html));
check('a stage capture gates voice on the samples', /if \(w\.stageSid\)/.test(html) && /0\.04/.test(html));

// ---- hidden transcript, the button counter, late mic, the recorder ----
{
  const src = slice('    let trDirty = false;', '    function addTranscriptLine');
  const log = { innerHTML: 'sentinel', scrollTop: 0, scrollHeight: 4 };
  let shown = false;
  const wrap = { classList: { contains: (c) => shown && c === 'show' } };
  const document = { getElementById: (id) => id === 'trwrap' ? wrap : id === 'trlog' ? log : null };
  // The page reads the panel through chatPanelOpen/transcriptShown and paints
  // through paintLog (the chat-and-files scroll keeper); stub them over the
  // same 'shown' switch the trwrap stub answers.
  const api = new Function('document', 'trBlocks', 'esc', 'chatPanelOpen', 'transcriptShown', 'paintLog', src + '\nreturn { renderTranscript, dirty: () => trDirty };')(
    document, () => [{ by: 'Ada', text: 'hello there', scribeBy: '' }], (x) => String(x),
    () => true, () => wrap.classList.contains('show'), (el, h) => { el.innerHTML = h; });
  api.renderTranscript();
  check('a hidden transcript panel is not rebuilt', log.innerHTML === 'sentinel' && api.dirty() === true);
  shown = true;
  api.renderTranscript();
  check('opening the panel renders the lines', log.innerHTML.indexOf('hello there') >= 0 && api.dirty() === false, log.innerHTML);
}
{
  const src = slice('    let ccOthers = 0, anyScribeStatus = 0;', '    // IS THIS SEAT DARK?');
  const statusOf = new Map();
  const api = new Function('statusOf', src + '\nreturn { noteStatusFlags, dropStatus, counts: () => ({ cc: ccOthers, sc: anyScribeStatus }) };')(statusOf);
  api.noteStatusFlags(null, { cc: true, scribe: true });
  api.noteStatusFlags({ cc: true, scribe: true }, { cc: true, scribe: false });
  check('the counters follow caption and scribe flag changes', api.counts().cc === 1 && api.counts().sc === 0, JSON.stringify(api.counts()));
  statusOf.set('a', { cc: true, scribe: false });
  api.dropStatus('a');
  check('dropping a status releases its caption count', api.counts().cc === 0 && !statusOf.has('a'), JSON.stringify(api.counts()));
}
check('refreshTrBtn does not scan statusOf', (() => {
  const a = html.indexOf('    function refreshTrBtn()');
  const body = html.slice(a, html.indexOf('    document.getElementById(\'trdl\')', a));
  return body.indexOf('Array.from(statusOf') < 0 && body.indexOf('ccOthers') >= 0;
})());
check('the scribe interval is gated', /if \(scribeSeen\.size \|\| ccSourceId \|\| anyScribeStatus \|\| scribeOffers\.size\) scribeWatch\(\)/.test(html));
{
  const body = slice('    function lateMedia(kind)', '    micBtn.onclick');
  const bootAt = body.indexOf('bootGumPending');
  const grantAt = body.indexOf('gumWithMicFallback');
  const boot = body.slice(bootAt, body.indexOf('const md', bootAt));
  const grant = body.slice(grantAt, body.indexOf('.catch', grantAt));
  check('the boot-pending mic grant calls syncSpeech', /syncSpeech\(\)/.test(boot));
  check('the fresh mic grant calls syncSpeech', /syncSpeech\(\)/.test(grant));
}
{
  const src = slice('    function pickRecMime()', '    async function startRec');
  const prev = globalThis.MediaRecorder;
  globalThis.MediaRecorder = { isTypeSupported: (m) => m === 'video/mp4' };
  try {
    const pick = new Function(src + '\nreturn pickRecMime;')();
    check('Safari\'s video/mp4 wins when webm is refused', pick() === 'video/mp4', pick());
    globalThis.MediaRecorder = { isTypeSupported: (m) => m.indexOf('webm') >= 0 };
    check('a webm browser still prefers vp8,opus', pick() === 'video/webm;codecs=vp8,opus', pick());
  } finally {
    if (prev === undefined) delete globalThis.MediaRecorder; else globalThis.MediaRecorder = prev;
  }
  const rec = slice('    async function startRec', '    function showRecOptions');
  const built = rec.indexOf('new MediaRecorder');
  const armed = rec.indexOf('recDraw = armDraw');
  check('MediaRecorder is constructed before the metronome is subscribed', built > 0 && armed > built, built + ' ' + armed);
  // The merged recorder (streamed to disk) releases a failed start in one
  // finally block: the metronome, the capture, the file and the unstarted recorder.
  check('a throw has a path that unsubscribes and clears the recorder', /\} finally \{\n\s+if \(!armed\)/.test(rec) && /recDraw = null; u\(\)/.test(rec) && /recRec = null/.test(rec) && /m\.node\.disconnect\(\)/.test(rec.slice(rec.indexOf('} finally {'))));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
