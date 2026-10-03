// mu-whisper-speech.js — the whisper and browser-caption guards that were still
// open on this branch. Each one lifts the page's own functions and runs them.
//
//   wspDrain times out a provider call that never returns, and a second stall
//   stops Whisper for the meeting. Before the provider first answers, a call
//   may take 180 s (the model download) and a stall does not count. Re-picking
//   Whisper or turning CC on clears the pause.
//   wspProviderGone clears a stale stt assignment once, so the next sentence
//   does not call the missing app again.
//   speech.onerror backs off on network, audio-capture and aborted, and stops
//   after three.
//   whisperSeedBlocked skips the 13 MB quiet seed on a phone or a metered link.
//   armWhisperRescan stops after 15 scans.
//   The browser-captions label names the vendor speech service.
//   Capture prefers an AudioWorklet. createScriptProcessor is only the fallback.
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
  check('lift: ' + startMark.trim().slice(0, 48) + ' is where the lift expects it', a > 0 && b > a);
  return a > 0 && b > a ? html.slice(a, b) : '';
}
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 6); i++) p = p.then(() => {});
  return p;
}

// ---- hung provider call: timeout, then one stall fallback -------------------
// One page scope: the whisper queue, the engine radios and the CC button, on a
// fake clock, so a re-pick acts on the same wspPaused the stall set.
function makeWsp() {
  const src = slice('    const wspCaps = new Map();', '    const scribeSeen = new Set();');
  const engineSrc = slice('    (function wireCcEngine() {', '    let speech = null');
  const ccSrc = slice("    document.getElementById('ccbtn').onclick = () => {", '    // CAPTIONS FOR EVERYONE.');
  const w = { statuses: [], syncs: [], timers: [], calls: [], lines: [], now: 0, scriptMade: 0 };
  w.ac = { sampleRate: 48000, destination: {},
    createScriptProcessor() { w.scriptMade++; return { onaudioprocess: null, connect() {}, disconnect() {} }; },
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; } };
  const meters = new Map();
  w.srcNode = { outs: [], connect(n) { this.outs.push(n); }, disconnect(n) { this.outs = n ? this.outs.filter((x) => x !== n) : []; } };
  meters.set('me', { src: w.srcNode });
  w.radios = [{ value: 'browser', checked: false }, { value: 'whisper', checked: true }];
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, checked: false, value: '', addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  const document = { querySelectorAll: () => w.radios, getElementById: el, body: { classList: { contains: () => false } } };
  w.myStatus = { cc: true, muted: false, scribe: false };
  w.advance = (ms) => {
    const end = w.now + ms;
    for (;;) {
      const due = w.timers.filter((t) => !t.cleared && !t.fired && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      w.now = due.at; due.fired = true; due.fn();
    }
    w.now = end;
  };
  w.api = new Function('setInterval', 'setTimeout', 'clearTimeout', 'ccLang', 'lsGet', 'lsSet', 'CC_ENGINE_KEY', 'CC_TRANSLATE_KEY', 'CC_WORDS_KEY',
    'IS_MOBILE', 'GifOS', 'setStatus', 'myStatus', 'addTranscriptLine', 'peers', 'syncSpeech', 'paintCcState', 'localStorage',
    'ensureAc', 'ac', 'meters', 'MediaStream', 'whisperReady', 'localStream', 'speakingOf', 'myVoiceAt',
    'WSP_PRE_MS', 'WSP_GAP_MS', 'WSP_MAX_S', 'WSP_MIN_S', 'WSP_BACKLOG', 'WSP_SCRIBE_MAX',
    'document', 'broadcastStatus', 'paintCcSource', 'ccAllInfo',
    'let speechGaveUp = false, ccByOrder = false, ccOptOutAt = 0;\n' + src + engineSrc + ccSrc
    + '\nreturn { wspStart, wspEnqueue, caps: wspCaps, q: wspQ, paused: () => wspPaused };')(
    () => 0,
    (fn, ms) => { const t = { fn, ms, at: w.now + ms, cleared: false }; w.timers.push(t); return t; },
    (t) => { if (t) t.cleared = true; },
    () => 'en-US', () => '', () => {}, 'gifos_cc_engine', 'gifos_cc_translate', 'gifos_cc_words',
    false,
    { providers: { call: () => new Promise((resolve, reject) => { w.calls.push({ resolve, reject }); }) } },
    (s) => w.statuses.push(s),
    w.myStatus,
    (text) => w.lines.push(text),
    new Map(),
    () => w.syncs.push('sync'),
    () => {},
    { getItem: () => null, setItem() {}, removeItem() {} },
    () => w.ac, w.ac, meters, class MediaStream {}, () => true, null, new Map(), 0,
    400, 700, 15, 0.4, 3, 8,
    document, () => {}, () => {}, () => null);
  w.els = els;
  w.timers.length = 0; // the wiring's 20 s quiet-seed timer is not under test
  w.syncs.length = 0;
  w.api.caps.set('me', { id: 'me', rate: 16000 });
  return w;
}
const clip = [new Float32Array(160)];
const stallDone = (() => {
  // A first-time user: the first call carries the model download and runs 60 s.
  const w = makeWsp(), api = w.api;
  api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 1);
  check('before the first answer, a call may take 180 s (the model download)', w.timers.length === 1 && w.timers[0].ms === 180000, w.timers[0] && w.timers[0].ms);
  check('the call is in flight', api.q.busy === true && api.q.sent === 1);
  api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 2);
  w.advance(60000);
  w.calls[0].resolve({ text: 'hello' });
  return flush().then(() => {
    check('a 60 s first call that then answers does not pause Whisper', api.paused() === false && w.syncs.length === 0, { paused: api.paused(), syncs: w.syncs.length });
    check('…its line is written', w.lines.join('|') === 'hello', w.lines.join('|'));
    check('…and nothing announces a stall', !w.statuses.some((s) => /stall/i.test(s)), w.statuses.join('|'));
    check('after the first answer the next clip gets four clip-lengths plus 10 s', w.timers.length === 2 && w.timers[1].ms === 10040 && api.q.sent === 2, w.timers[1] && w.timers[1].ms);
    api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 3);
    w.advance(10040);
    check('the first stall hands the queue to the next clip and does not give up', api.q.busy === true && api.paused() === false && w.syncs.length === 0, { busy: api.q.busy, paused: api.paused(), syncs: w.syncs.length });
    check('…and does not announce a stall yet', !w.statuses.some((s) => /stall/i.test(s)), w.statuses.join('|'));
    check('the next clip is sent', w.timers.length === 3 && api.q.sent === 3);
    w.advance(10040);
    check('the second stall leaves the queue idle', api.q.busy === false && api.q.items.length === 0);
    check('…stops Whisper for this meeting, once', api.paused() === true && w.syncs.length === 1, w.syncs);
    check('…and the status names the stall once', w.statuses.filter((s) => /stall/i.test(s)).length === 1, w.statuses.join('|'));
    api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 4);
    check('a later clip is not sent after the give-up', api.q.sent === 3, api.q.sent);
    // Re-picking Whisper in Settings is a deliberate act: it clears the pause.
    w.radios[0].checked = false; w.radios[1].checked = true;
    w.radios[1].onchange();
    check('re-picking Whisper clears the pause', api.paused() === false && (api.q.stalls || 0) === 0, { paused: api.paused(), stalls: api.q.stalls });
    api.caps.set('me', { id: 'me', rate: 16000 }); // the sync restarts the capture
    api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 5);
    check('…and the next clip is sent again', api.q.sent === 4, api.q.sent);
    if (w.calls[3]) w.calls[3].resolve({ text: '' });
    return flush();
  }).then(() => {
    // Turning captions back on with CC clears the pause too.
    const w = makeWsp(), api = w.api;
    w.calls.length = 0;
    api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 1);
    w.calls[0].resolve({ text: 'one' });
    return flush().then(() => {
      api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 2);
      api.wspEnqueue({ id: 'me', rate: 16000 }, clip, 3);
      w.advance(20080);
      check('two stalls after an answer pause Whisper', api.paused() === true);
      const cc = document_cc(w);
      cc.onclick(); // off
      check('turning CC off leaves the pause', api.paused() === true);
      cc.onclick(); // on
      check('turning CC on clears the pause', api.paused() === false && (api.q.stalls || 0) === 0, { paused: api.paused(), stalls: api.q.stalls });
    });
  }).then(() => {
    // Stalls before the first answer do not count: the model may still be coming.
    const w = makeWsp(), api = w.api;
    for (let i = 1; i <= 3; i++) api.wspEnqueue({ id: 'me', rate: 16000 }, clip, i);
    w.advance(180000 * 3);
    check('three stalls before any answer do not pause Whisper', api.paused() === false && api.q.sent === 3 && w.syncs.length === 0, { paused: api.paused(), sent: api.q.sent });
  });
  function document_cc(w) { return w.els.ccbtn; }
})();
{
  const w = makeWsp();
  w.api.caps.delete('me');
  check('with no worklet module, capture uses a ScriptProcessor', w.api.wspStart('me') === true && w.scriptMade === 1, w.scriptMade);
  check('that processor is connected to the meter source', w.srcNode.outs.length === 1);
  w.api.caps.delete('me');
  w.ac._wspWorkletOk = true;
  let workletMade = 0;
  global.AudioWorkletNode = function () { workletMade++; this.port = {}; this.connect = function () {}; this.disconnect = function () {}; };
  check('a loaded worklet is used instead of another ScriptProcessor', w.api.wspStart('me') === true && workletMade === 1 && w.scriptMade === 1, { workletMade, scriptMade: w.scriptMade });
  delete global.AudioWorkletNode;
}
check('AudioWorklet is preferred and createScriptProcessor is the later fallback',
  html.indexOf('new AudioWorkletNode') > 0 && html.indexOf('audioWorklet.addModule') > 0
  && html.indexOf('new AudioWorkletNode') < html.indexOf('createScriptProcessor(4096, 1, 1)'));

// The worklet source itself: 128-sample pulls become one 4096-sample post.
{
  const m = html.match(/const WSP_WORKLET_JS = (\[[\s\S]*?\])\.join\('\\n'\)/);
  check('the worklet source is a string the page can load', !!m);
  if (m) {
    const js = eval(m[1]).join('\n');
    const posted = [];
    class AudioWorkletProcessor { constructor() { this.port = { postMessage: (data) => posted.push(data) }; } }
    let Registered;
    function registerProcessor(name, cls) { Registered = cls; check('the processor is named wsp-capture', name === 'wsp-capture'); }
    eval(js);
    const proc = new Registered();
    const chunk = new Float32Array(128);
    for (let n = 0; n < 31; n++) { chunk.fill(n); proc.process([[chunk]]); }
    check('a short pull does not post a partial buffer', posted.length === 0);
    chunk.fill(31); proc.process([[chunk]]);
    check('4096 samples post one transferable chunk', posted.length === 1 && posted[0].length === 4096, posted.length && posted[0].length);
    check('the chunk keeps the pull order', posted[0][0] === 0 && posted[0][128] === 1 && posted[0][31 * 128] === 31);
    for (let n = 0; n < 32; n++) { chunk.fill(100); proc.process([[chunk]]); }
    check('the next 4096 samples post again', posted.length === 2 && posted[1][0] === 100);
    check('the processor stays alive', proc.process([[]]) === true);
  }
}

// ---- a missing provider does not restart Whisper ---------------------------
{
  const src = slice('    const wspCaps = new Map();', '    const scribeSeen = new Set();');
  const statuses = [], paints = [];
  const mem = {
    gifos_cc_engine: 'whisper',
    gifos_ai_config: JSON.stringify({ stt: { app: 'file1', appId: 'offline-stt-whisper', appName: 'Whisper' } }),
  };
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
  const lsGet = (k) => localStorage.getItem(k) || '';
  const lsSet = (k, v) => { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); };
  let caps = null, syncs = 0;
  const rejects = [];
  function syncSpeech() {
    syncs++;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('gifos_ai_config') || '{}') || {}; } catch (e) {}
    if (lsGet('gifos_cc_engine') === 'whisper' && cfg.stt && caps) caps.set('me', { id: 'me', rate: 16000 });
  }
  const api = new Function('setInterval', 'setTimeout', 'clearTimeout', 'ccLang', 'lsGet', 'lsSet', 'CC_ENGINE_KEY', 'CC_TRANSLATE_KEY', 'CC_WORDS_KEY',
    'IS_MOBILE', 'GifOS', 'setStatus', 'myStatus', 'addTranscriptLine', 'peers', 'syncSpeech', 'paintCcState', 'localStorage',
    'ensureAc', 'ac', 'meters', 'MediaStream', 'whisperReady', 'localStream', 'speakingOf', 'myVoiceAt',
    'WSP_PRE_MS', 'WSP_GAP_MS', 'WSP_MAX_S', 'WSP_MIN_S', 'WSP_BACKLOG', 'WSP_SCRIBE_MAX',
    src + '\nreturn { wspEnqueue, caps: wspCaps, q: wspQ };')(
    () => 0, () => 0, () => {}, () => 'en-US', lsGet, lsSet, 'gifos_cc_engine', 'gifos_cc_translate', 'gifos_cc_words',
    false,
    { providers: { call: () => new Promise((resolve, reject) => { rejects.push(reject); }) } },
    (s) => statuses.push(s),
    { cc: true, muted: false },
    () => {}, new Map(), syncSpeech, () => paints.push(1), localStorage,
    () => null, {}, new Map(), class {}, () => true, null, new Map(), 0,
    400, 700, 15, 0.4, 3, 8);
  caps = api.caps;
  api.caps.set('me', { id: 'me', rate: 16000 });
  api.wspEnqueue({ id: 'me', rate: 16000 }, [new Float32Array(160)], 1);
  rejects[0](new Error('PROVIDER_MISSING: the file is gone'));
  stallDone.then(() => flush()).then(() => {
    const cfg = JSON.parse(mem.gifos_ai_config || '{}');
    check('one failure clears the stale stt assignment', !cfg.stt, mem.gifos_ai_config);
    check('…and the saved engine is no longer whisper', mem.gifos_cc_engine === undefined, mem.gifos_cc_engine);
    check('the status says the app is missing, once', statuses.filter((s) => s.indexOf('Whisper app missing') >= 0).length === 1, statuses.join('|'));
    check('a generic failure line is not added on top', !statuses.some((s) => s.indexOf('Whisper captions failed') >= 0), statuses.join('|'));
    check('sync runs once and does not put the capture back', syncs === 1 && !api.caps.has('me'), { syncs, has: api.caps.has('me') });
    api.wspEnqueue({ id: 'me', rate: 16000 }, [new Float32Array(160)], 2);
    check('a later sentence does not call the provider again', api.q.sent === 1, api.q.sent);
    check('the captions state is repainted', paints.length === 1, paints.length);
    return flush();
  }).then(() => runSpeech());
}

function runSpeech() {
  // ---- browser speech: backoff, then stop ----------------------------------
  const src = slice('    let speech = null, speechFails = 0, speechRetry = null, speechGaveUp = false;', '    function syncSpeech()');
  const statuses = [], timers = [];
  class SR {
    start() { this.started = (this.started || 0) + 1; }
    stop() {
      if (this.onerror) this.onerror({ error: 'aborted' });
      if (this.onend) this.onend();
    }
  }
  const myStatus = { cc: true, muted: false };
  const api = new Function('setTimeout', 'clearTimeout', 'window', 'setStatus', 'ccLang', 'navigator', 'meters', 'myVoiceAt',
    'addTranscriptLine', 'trDrops', 'myStatus', 'document', 'broadcastStatus',
    src + '\nreturn { startSpeech, stopSpeech, speechRunning, rec: () => speech, gaveUp: () => speechGaveUp, fails: () => speechFails, delay: speechRetryDelay };')(
    (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    (t) => { if (t) t.cleared = true; },
    { SpeechRecognition: SR },
    (s) => statuses.push(s),
    () => 'en-US',
    { language: 'en-US' },
    new Map(), 0, () => {}, 0, myStatus,
    { getElementById: () => ({ classList: { remove() {} } }) },
    () => {});
  check('the backoff delays are 1 s, 2 s, 4 s, capped at 30 s',
    api.delay(1) === 1000 && api.delay(2) === 2000 && api.delay(3) === 4000 && api.delay(6) === 30000);
  check('captions start', api.startSpeech() === true && api.rec().started === 1);
  api.rec().onerror({ error: 'no-speech' });
  api.rec().onend();
  check('a no-speech end restarts at once', api.rec().started === 2 && timers.length === 0, api.rec().started);
  api.stopSpeech();
  check('a fresh start after a stop', api.startSpeech() === true && api.rec().started === 1);
  api.rec().onerror({ error: 'network' });
  api.rec().onend();
  check('a network error waits 1 s instead of restarting', timers.length === 1 && timers[0].ms === 1000 && api.rec().started === 1);
  api.stopSpeech();
  check('stopping clears that wait', timers[0].cleared === true && timers.length === 1, timers.length);
  check('a stop does not count the engine abort as another failure', api.fails() === 1, api.fails());
  timers[0].fn();
  check('a cleared wait does not start the engine', api.rec() === null);
  check('the next start is allowed', api.startSpeech() === true && api.rec().started === 1);
  const rec = api.rec();
  rec.onerror({ error: 'network' }); rec.onend();
  check('the first failure waits 1 s', timers[1].ms === 1000 && rec.started === 1);
  timers[1].fn();
  check('the wait then starts the engine', rec.started === 2);
  rec.onerror({ error: 'aborted' }); rec.onend();
  check('the second failure waits 2 s', timers[2].ms === 2000 && rec.started === 2);
  timers[2].fn();
  check('…and starts again', rec.started === 3);
  rec.onerror({ error: 'audio-capture' });
  check('the third failure stops the engine', api.speechRunning() === false && api.gaveUp() === true);
  check('…and says so once', statuses.filter((s) => s === 'Captions cannot reach the speech service').length === 1, statuses.join('|'));
  check('a later sync does not start it again', api.startSpeech() === false && rec.started === 3);
  check('turning captions on clears the give-up', /if \(myStatus\.cc\) \{ speechGaveUp = false;/.test(html));

  // ---- quiet seed ----------------------------------------------------------
  const seedSrc = (html.match(/function whisperSeedBlocked\(\) \{[\s\S]*?\n    \}/) || [])[0];
  check('whisperSeedBlocked is in the page', !!seedSrc);
  if (seedSrc) {
    const blocked = new Function('IS_MOBILE', 'navigator', seedSrc + '\nreturn whisperSeedBlocked;');
    check('a phone does not seed Whisper', blocked(true, {})() === true);
    check('saveData does not seed Whisper', blocked(false, { connection: { saveData: true } })() === true);
    check('a cellular link does not seed Whisper', blocked(false, { connection: { type: 'cellular' } })() === true);
    check('a wifi link without saveData may seed', blocked(false, { connection: { type: 'wifi', saveData: false } })() === false);
    check('no connection object may seed', blocked(false, {})() === false);
  }
  check('the quiet seed asks the idle callback and still calls installWhisper(false)',
    /requestIdleCallback\(run/.test(html) && /if \(whisperSeedBlocked\(\)\) return;/.test(html) && /installWhisper\(false\)/.test(html));

  // ---- rescan cap ----------------------------------------------------------
  const rescanSrc = slice('    let whisperRescan = null;', '    function paintCcState()');
  let scans = 0, cleared = 0, fn = null, arms = 0;
  const GifOS = { providers: { scan() { scans++; return Promise.resolve([]); } } };
  const rescan = new Function('setInterval', 'clearInterval', 'whisperReady', 'ccEngine', 'window', 'GifOS', 'paintCcState', 'syncSpeech', 'setStatus',
    rescanSrc + '\nreturn { arm: armWhisperRescan };')(
    (f) => { fn = f; arms++; return 1; },
    () => { cleared++; },
    () => false, () => 'whisper', { GifOS }, GifOS, () => {}, () => {}, () => {});
  rescan.arm();
  for (let i = 0; i < 15; i++) fn();
  check('fifteen scans run', scans === 15, scans);
  check('the interval is still armed', cleared === 0);
  fn();
  check('the sixteenth scan stops the interval', scans === 15 && cleared === 1, { scans, cleared });
  rescan.arm();
  check('arming again after the cap starts a new bounded look', arms === 2 && cleared === 1, arms);

  // ---- the label -----------------------------------------------------------
  check('the browser-captions label names the vendor speech service',
    html.indexOf("Your browser may send your voice to its maker's speech service (Chrome: Google).") > 0);

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
