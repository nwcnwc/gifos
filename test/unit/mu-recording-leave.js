// mu-recording-leave.js — recording sink, second-start guard, dialogs,
// fold label, source-list cache, and the freeze reload. Lifted out of
// site/run.html and run in Node. The browser suites stay unrun here.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = a < 0 ? -1 : html.indexOf(end, a + start.length);
  check('slice ' + start.trim().slice(0, 48), a >= 0 && b > a, a < 0 ? 'missing start' : (b < 0 ? 'missing end' : ''));
  return a >= 0 && b > a ? html.slice(a, b) : '';
}

// recOpenSink names the picker's file type from the page's recType (the container chosen by pickRecMime).
const pure = 'let recType = "video/webm";\n' + sliceBetween('    function recDefaultQuality(isMobile)', '    function recFileName()');
const sinks = new Function('window', 'navigator', 'URL', 'Blob', pure + '\nreturn { recDefaultQuality, recStadiumLabel, recFoldLabel, recFoldBus, recResumePlan, recStreamSink, recOpenSink };')(
  {}, {}, { createObjectURL(b) { return 'blob:' + (b && b.size); } }, typeof Blob === 'function' ? Blob : function Blob() {});

check('a phone defaults to 720p', sinks.recDefaultQuality(true) === 'low');
check('a computer defaults to 1080p standard', sinks.recDefaultQuality(false) === 'std');
check('stadium label names the count', sinks.recStadiumLabel({ cnt: 3, rws: [] }) === 'The stadium (3 people)');
check('one person is singular', sinks.recStadiumLabel({ cnt: 1 }) === 'The stadium (1 person)');
check('a fold with no count is still the stadium', sinks.recStadiumLabel({}) === 'The stadium');
check('the sd composite does not fall through to Rows', sinks.recFoldLabel('sd', { rws: [], cnt: 4 }) === 'The stadium (4 people)');
check('the stage strip is not labelled Rows', sinks.recFoldLabel('sgs', { via: 'stage', rws: [], names: [] }) === 'On stage');
check('a real row fold still lists its rows', sinks.recFoldLabel('r2', { rws: ['2', '3'] }) === 'Rows 2, 3');
check('sd is a stadium bus', sinks.recFoldBus('sd', { via: 'mosaic' }) === 'stadium');
check('sgs is a stage bus', sinks.recFoldBus('sgs', { via: 'stage' }) === 'stage');
check('an in-flight recording is saved, not reloaded', sinks.recResumePlan(true, false) === 'save');
check('a second freeze waits for that save', sinks.recResumePlan(true, true) === 'wait');
check('no recording reloads immediately', sinks.recResumePlan(false, false) === 'reload');

(async () => {
  const order = [];
  const writable = {
    write(b) {
      order.push('start' + b);
      return new Promise((res) => setTimeout(() => { order.push('end' + b); res(); }, b));
    },
    close() { order.push('close'); return Promise.resolve(); },
    abort() { order.push('abort'); return Promise.resolve(); },
  };
  const streamed = sinks.recStreamSink('file', writable, async () => ({ saved: true, name: 'a.webm' }));
  const w1 = streamed.write(20);
  const w2 = streamed.write(5);
  await Promise.resolve();
  check('a second chunk does not start until the first write finishes', order.length === 1 && order[0] === 'start20', order);
  const meta = await streamed.finish();
  await w1; await w2;
  check('writes stay in order and the file closes after them', JSON.stringify(order) === JSON.stringify(['start20', 'end20', 'start5', 'end5', 'close']));
  check('a file sink reports saved, not a blob url', meta && meta.saved === true && !meta.href);

  let picked = 0, opfs = 0;
  const win = {
    async showSaveFilePicker() {
      picked++;
      return { name: 'meet.webm', async createWritable() { return { writes: [], write(b) { this.writes.push(b); }, close() {}, abort() {} }; } };
    },
  };
  const nav = { storage: { async getDirectory() { opfs++; throw new Error('should not'); } } };
  const opener = new Function('window', 'navigator', 'URL', 'Blob', pure + '\nreturn recOpenSink;')(win, nav, { createObjectURL() { return 'blob:x'; } }, Blob);
  const fileSink = await opener('gifos-meeting.webm');
  check('the picker is used when it exists', picked === 1 && fileSink.kind === 'file');
  await fileSink.write('chunk-a');
  await fileSink.write('chunk-b');
  const saved = await fileSink.finish();
  check('picker writes do not accumulate a chunk array on the sink', fileSink.kind === 'file' && saved.saved === true && opfs === 0);

  const cancelWin = { async showSaveFilePicker() { const e = new Error('no'); e.name = 'AbortError'; throw e; } };
  let opfsWrites = 0;
  const cancelNav = { storage: { async getDirectory() { opfsWrites++; return {}; } } };
  const cancelOpen = new Function('window', 'navigator', 'URL', 'Blob', pure + '\nreturn recOpenSink;')(cancelWin, cancelNav, {}, Blob);
  const cancelled = await cancelOpen('x.webm');
  check('cancelling the picker does not fall through to OPFS', cancelled.kind === 'cancel' && opfsWrites === 0);

  const noPick = {};
  const opfsChunks = [];
  const opfsRemoved = [];
  const opfsNav = {
    storage: {
      async getDirectory() {
        return {
          async removeEntry(name) { opfsRemoved.push(name); },
          async getFileHandle(name, opts) {
            check('OPFS creates the recording file', opts && opts.create === true && name === 'clip.webm');
            return {
              async createWritable() {
                return { write(b) { opfsChunks.push(b); }, close() {}, abort() {} };
              },
              async getFile() { return { size: opfsChunks.length, name: 'clip.webm' }; },
            };
          },
        };
      },
    },
  };
  const opfsOpen = new Function('window', 'navigator', 'URL', 'Blob', pure + '\nreturn recOpenSink;')(noPick, opfsNav, { createObjectURL(b) { return 'blob:opfs:' + b.size; } }, Blob);
  const opfsSink = await opfsOpen('clip.webm');
  await opfsSink.write('c1');
  await opfsSink.write('c2');
  const opfsSaved = await opfsSink.finish();
  check('without a picker the chunks go to OPFS in order', opfsSink.kind === 'opfs' && JSON.stringify(opfsChunks) === JSON.stringify(['c1', 'c2']) && opfsSaved.href === 'blob:opfs:2');
  check('the OPFS result can delete its file', typeof opfsSaved.drop === 'function' && opfsRemoved.length === 0);
  if (typeof opfsSaved.drop === 'function') await opfsSaved.drop();
  check('drop removes the recording file from OPFS', JSON.stringify(opfsRemoved) === JSON.stringify(['clip.webm']));

  // recDeliver: the OPFS file goes with the blob url, after the download had its minute.
  {
    const dsrc = sliceBetween('    function recDeliver(saved) {', '    function resumeReload() {');
    const timers = [];
    const revoked = [];
    let clicked = 0, dropped = 0;
    const docD = { createElement() { return { click() { clicked++; } }; } };
    const deliver = new Function('document', 'URL', 'setTimeout', 'setStatus', 'recFileName', dsrc + '\nreturn recDeliver;')(
      docD, { revokeObjectURL(h) { revoked.push(h); } }, (fn, ms) => { timers.push({ fn, ms }); }, () => {}, () => 'x.webm');
    const how = deliver({ href: 'blob:opfs:9', name: 'clip.webm', drop() { dropped++; return Promise.resolve(); } });
    check('an OPFS result downloads and waits before cleanup', how === 'download' && clicked === 1 && dropped === 0 && revoked.length === 0);
    for (const t of timers) t.fn();
    check('the revoke timeout also deletes the OPFS file', revoked[0] === 'blob:opfs:9' && dropped === 1);
    const how2 = deliver({ href: 'blob:ram', name: 'r.webm' });
    for (const t of timers.slice(1)) t.fn();
    check('a RAM result with no file still downloads', how2 === 'download');
  }

  // resumeReload: a save that never settles still reloads.
  {
    const rsrc = sliceBetween('    function resumeReload() {', '    // One dialog behaviour');
    const timers = [];
    let reloads = 0, stops = 0;
    const env = new Function('recResumePlan', 'setStatus', 'location', 'setTimeout',
      'let recRec = { state: "recording", stop() { env.stops++; } }; let recRestart = null; let recDraw = null; let recReloadAfterStop = false; const env = { stops: 0 };\n' + rsrc +
      '\nreturn { resumeReload, env, latched: () => recReloadAfterStop };')(
      sinks.recResumePlan, () => {}, { reload() { reloads++; } }, (fn, ms) => { timers.push({ fn, ms }); });
    env.resumeReload();
    check('a freeze while recording stops the recorder and does not reload yet', env.env.stops === 1 && reloads === 0 && env.latched() === true);
    env.resumeReload();
    check('a second freeze waits for the save', env.env.stops === 1 && reloads === 0);
    const fb = timers.filter((t) => t.ms >= 15000 && t.ms <= 30000);
    check('a fallback reload is armed for a save that never settles', fb.length === 1, timers.map((t) => t.ms));
    for (const t of fb) t.fn();
    check('the fallback reloads the page', reloads === 1);
  }

  const ramHeld = [];
  const ramOpen = new Function('window', 'navigator', 'URL', 'Blob', pure + '\nreturn { recOpenSink, hold: null };')(
    {}, {}, { createObjectURL(b) { ramHeld.push(b); return 'blob:ram'; } },
    class Blob { constructor(parts, opts) { this.parts = parts.slice(); this.opts = opts; this.size = this.parts.length; } });
  const ramSink = await ramOpen.recOpenSink('ram.webm');
  await ramSink.write('r1');
  await ramSink.write('r2');
  const ramSaved = await ramSink.finish();
  check('ram is only the fallback, and it still emits one blob', ramSink.kind === 'ram' && ramSaved.href === 'blob:ram' && ramHeld[0] && ramHeld[0].parts.length === 2);

  const rs = sliceBetween('    function recSources() {', '    function recNoteStruct()');
  check('recSources does not query the DOM per frame', rs.indexOf('.querySelector(') < 0);
  check('recSources reads the element stored on the fold', rs.indexOf('c.el') >= 0);
  check('a quiet frame does not rebuild the source list', rs.indexOf('if (!recSrcDirty && recSrcCache)') >= 0);

  const touch = sliceBetween('    function recTouchSource(src)', '    function recNoteStruct()');
  let stageCalls = 0, blurCalls = 0;
  const videoEl = { id: 'fold-video' };
  const compOf = new Map([['sd', { via: 'mosaic', stream: { id: 's' }, streamId: 's', cnt: 2, rws: [], el: videoEl }]]);
  const peers = new Map([['p1', { name: 'Ada', video: { srcObject: { id: 'cam' } } }]]);
  const statusOf = new Map([['p1', { stg: 0 }]]);
  const meTile = { video: { id: 'mev' } };
  const factory = new Function('compOf', 'seatDark', 'myStatus', 'myName', 'meTile', 'localStream', 'peers', 'statusOf', 'blurLevelFor', 'modOf', 'mosIn', 'stageIds', 'rowMates',
    pure + '\nlet recSrcDirty = true;\n' + touch + '\nreturn { recSources, dirty(){ return recSrcDirty; }, setDirty(v){ recSrcDirty = v; }, cache(){ return recSrcCache; } };');
  const rec = factory(compOf, (st) => !!(st && st.camOff), { stg: 0, camOff: false }, () => 'Me', meTile, { id: 'mic' }, peers, statusOf,
    (id) => { blurCalls++; return id === 'p1' ? 2 : 0; }, () => ({ mute: { on: true } }), new Map(),
    () => { stageCalls++; return []; }, () => ['p1']);
  const g1 = rec.recSources();
  check('the first frame builds once', stageCalls === 1 && rec.dirty() === false);
  const fold = g1.stadium.filter((s) => s.fold)[0];
  check('the stadium fold uses its element and its label', fold && fold.video === videoEl && fold.label === 'The stadium (2 people)' && fold.bus === 'stadium');
  check('a row mate is not a DOM lookup', g1.row.some((s) => s.key === 'p1' && s.blur === 2 && s.mute === true));
  blurCalls = 0;
  const g2 = rec.recSources();
  check('the next frame reuses the list and does not call stageIds', g2 === g1 && stageCalls === 1);
  check('blur is still read on the quiet frame', blurCalls >= 1 && g2.row.some((s) => s.key === 'p1' && s.blur === 2));
  compOf.get('sd').cnt = 9;
  const g3 = rec.recSources();
  check('the quiet frame still refreshes the stadium count', g3 === g1 && fold.label === 'The stadium (9 people)');
  rec.setDirty(true);
  rec.recSources();
  check('a structural change builds again', stageCalls === 2);

  const note = sliceBetween('    function recNoteStruct() {', '    // Scope →');
  const noted = new Function('rosterIds', 'peers', 'myStatus', 'statusOf', 'meshCoord', 'digLists', 'compOf',
    'const recRec = { state: "recording" }; let recSrcDirty = false; let recStructSig = "";\n' + note + '\nrecNoteStruct();\nconst d1 = recSrcDirty;\nrecSrcDirty = false;\nrecNoteStruct();\nconst d2 = recSrcDirty;\nrosterIds.push("new");\nrecNoteStruct();\nconst d3 = recSrcDirty;\nreturn { d1, d2, d3 };');
  const nres = noted([], peers, { stg: 0 }, statusOf, () => ({ pc: '', r: 0, i: 0 }), () => null, compOf);
  check('recNoteStruct dirties on the first roster picture only', nres.d1 === true && nres.d2 === false);
  check('recNoteStruct dirties when the roster changes', nres.d3 === true);
  let rosterReads = 0;
  const idleRoster = new Proxy(['a', 'b'], { get(t, k) { rosterReads++; return t[k]; } });
  const idle = new Function('rosterIds', 'peers', 'myStatus', 'statusOf', 'meshCoord', 'digLists', 'compOf', 'recRec',
    'let recSrcDirty = false; let recStructSig = "";\n' + note + '\nrecNoteStruct();\nreturn { dirty: recSrcDirty };');
  const ir = idle(idleRoster, peers, { stg: 0 }, statusOf, () => null, () => null, compOf, null);
  check('with no recorder the tick does not walk the roster', rosterReads === 0, rosterReads);
  check('with no recorder the source list is left stale for the next start', ir.dirty === true);
  rosterReads = 0;
  idle(idleRoster, peers, { stg: 0 }, statusOf, () => null, () => null, compOf, { state: 'inactive' });
  check('a stopped recorder does not walk the roster either', rosterReads === 0, rosterReads);

  // A deep seat's stg feed is audio-only: the stager's picture comes from the strip.
  {
    const stripEl = { id: 'strip' }, aoEl = { id: 'ao-el' }, vidEl = { id: 'vid-el' };
    const aoStream = { id: 'ao', getVideoTracks() { return []; }, getAudioTracks() { return [{}]; } };
    const vStream = { id: 'v', getVideoTracks() { return [{ readyState: 'live' }]; }, getAudioTracks() { return [{}]; } };
    const comp2 = new Map([['sgs', { via: 'stage', stream: { id: 'sg' }, streamId: 'sg', el: stripEl }]]);
    const peers2 = new Map([['s1', { name: 'Stager', video: { srcObject: { id: 'cam' } } }]]);
    const mos2 = new Map([['stg:s1', { stream: aoStream, el: aoEl }]]);
    const rec2 = factory(comp2, () => false, { stg: 0 }, () => 'Me', meTile, { id: 'mic' }, peers2, new Map([['s1', { stg: 1 }]]),
      () => 0, () => ({}), mos2, () => ['s1'], () => []);
    const s1 = rec2.recSources().stage.filter((x) => x.key === 's1')[0];
    check('an audio-only stg feed draws the received strip', s1 && s1.video === stripEl && s1.stream === aoStream, s1 && s1.video);
    rec2.recSources();
    check('a quiet frame keeps the strip picture', s1 && s1.video === stripEl);
    mos2.set('stg:s1', { stream: vStream, el: vidEl });
    rec2.recSources();
    check('a stg feed with video draws its own element', s1 && s1.video === vidEl && s1.stream === vStream);
  }

  const keys = [];
  let hid = 0, restored = 0;
  const openerEl = { focus() { restored++; } };
  const doc = {
    body: {},
    activeElement: openerEl,
    addEventListener(type, fn, cap) { keys.push({ type, fn, cap }); },
  };
  const modalSrc = sliceBetween('    let modalSeq = 0;', '    function recTouchSource(src)');
  const modal = new Function('document', modalSrc + '\nreturn { openModal, stack: modalStack };')(doc);
  check('Escape is handled in the capture phase', keys.length === 1 && keys[0].type === 'keydown' && keys[0].cap === true);
  const heading = { id: '' };
  const first = { focus() { first.did = true; } };
  const box = {
    attrs: {},
    listeners: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelector(sel) { return sel === 'h3' ? heading : first; },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
  };
  let closed = 0;
  const finish = modal.openModal(box, () => { closed++; });
  check('openModal marks a dialog and focuses the first control', box.attrs.role === 'dialog' && box.attrs['aria-modal'] === 'true' && first.did === true && heading.id);
  keys[0].fn({ key: 'Escape', preventDefault() { this.pd = true; }, stopPropagation() { this.sp = true; } });
  check('Escape closes the top dialog and restores focus', closed === 1 && restored === 1 && modal.stack.length === 0);
  const ev = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
  keys[0].fn(ev);
  check('Escape with no dialog does not close again', closed === 1);
  const finish2 = modal.openModal(box, () => { hid++; });
  box.listeners[0].fn({ target: box });
  check('the backdrop closes the dialog', hid === 1 && finish2);
  finish2();
  check('a second close is a no-op', hid === 1);

  const sr = sliceBetween('    async function startRec(opts) {', '    function showRecOptions()');
  const setAt = sr.indexOf('recStarting = true');
  const awaitAt = sr.indexOf('await');
  const guardAt = sr.indexOf("if (recStarting || (recRec && recRec.state !== 'inactive')) return;");
  check('startRec returns while a start is already in flight', guardAt >= 0 && guardAt < setAt);
  check('recStarting is set before the first await', setAt >= 0 && awaitAt > setAt);
  const stopFn = sr.slice(sr.indexOf('recRec.onstop'));
  check('onstop detaches the sink before it waits for the file', stopFn.indexOf('const sink = recSink') >= 0 && stopFn.indexOf('const sink = recSink') < stopFn.indexOf('await sink.finish'));
  check('the reload waits until after the file is finished', stopFn.indexOf('await sink.finish') < stopFn.indexOf('if (recReloadAfterStop)'));
  check('chunks are written to the sink, not pushed onto an array', sr.indexOf('recSink.write(e.data)') >= 0 && sr.indexOf('recChunks') < 0);

  const opts = sliceBetween('    function showRecOptions() {', '    function warnRecorderNewApp()');
  check('the quality default follows IS_MOBILE', opts.indexOf('recDefaultQuality(IS_MOBILE)') >= 0);
  check('the phone line says why 720p is the default', opts.indexOf('On a phone, 720p is the default') >= 0);
  check('1080p is not hardcoded as the checked quality', opts.indexOf('value="std" checked') < 0);
  check('the record sheet goes through openModal', opts.indexOf('openModal(') >= 0);
  const warn = sliceBetween('    function warnRecorderNewApp() {', '    recBtn.onclick');
  check('the record warning goes through openModal', warn.indexOf('openModal(') >= 0);
  const click = sliceBetween('    recBtn.onclick = () => {', '    // ---- controls: mic + camera');
  check('the Record button does nothing while a start is in flight', click.indexOf('if (recStarting) return;') >= 0);

  check('a visible freeze saves or reloads through resumeReload', html.indexOf('if (frozeGap && !document.hidden) { resumeReload(); return; }') >= 0);
  check('a resumed tab uses the same path', /if \(\(frozeGap \|\| frozeThisBeat\(wallGap, monoNow - hbLastMono, peers\.size\)\) && peers\.size\) \{ resumeReload\(\); return; \}/.test(html));
  check('the stadium composite stores its element and not an empty rws list',
    /compOf\.set\('sd', \{ via: 'mosaic', streamId: stream\.id, stream, names: \[\], cnt: roomPastSection\(\) \? displayCount\(\) : knownTotal\(\), el: v \}\);/.test(html));
  check('the stage strip stores its element', /compOf\.set\('sgs', \{ via: 'stage', streamId: stream\.id, stream, names: stageIds\(\), el: v \}\);/.test(html));
  check('a new status dirties the recorder source list', /storePwEpoch\(st\.pwEp\);\n\s*recSrcDirty = true;/.test(html));
  check('the mesh tick notes recorder structure', html.indexOf('recNoteStruct();') >= 0);
  check('the vote sheet goes through openModal', html.indexOf('closeVoteModal = openModal') >= 0);
  check('the invite sheet goes through openModal', html.indexOf('closeInvModal = openModal') >= 0);
  check('the meeting page no longer keeps a recChunks array', html.indexOf('recChunks') < 0);

  const iScript = html.lastIndexOf('<script>');
  const jScript = html.lastIndexOf('</script>');
  let parsed = false, parseErr = '';
  try { new Function(html.slice(iScript + '<script>'.length, jScript)); parsed = true; }
  catch (e) { parseErr = e.message; }
  check('site/run.html script parses', parsed, parseErr);

  console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL PASS (' + pass + ')');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL harness — ' + e.stack); process.exit(1); });
