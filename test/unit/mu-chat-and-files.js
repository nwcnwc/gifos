// mu-chat-and-files.js — guards for the chat, transcript, and file-pin fixes.
// Lifts the real functions out of site/run.html. Node only. No browser.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function lift(name) {
  const key = 'function ' + name + '(';
  const i = html.indexOf(key);
  if (i < 0) throw new Error('missing ' + name);
  let depth = 0, started = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('unclosed ' + name);
}
function compile(name) {
  const src = lift(name);
  new Function(src + '\nreturn ' + name + ';');
  return src;
}
function load(name, args) {
  const names = Object.keys(args);
  const src = compile(name) + '\nreturn ' + name + ';';
  return new Function(names.join(','), src).apply(null, names.map((k) => args[k]));
}

check('viewport asks the keyboard to resize the layout',
  /<meta name="viewport" content="width=device-width, initial-scale=1\.0, interactive-widget=resizes-content">/.test(html));
check('the on-open hi still sends the 500 chat and 300 transcript caps',
  /chats: Array\.from\(chat\.values\(\)\)\.slice\(-500\), trs: Array\.from\(trs\.values\(\)\)\.slice\(-300\)/.test(html));
check('a channel-less hi is not sent through sendSig', !/sendSig\(pid, \{ k: 'hi'/.test(html));
check('the channel-less hi waits 20s and uses deliverLateHi',
  /deliverLateHi\(pid, \{ k: 'hi'/.test(html) && /20000\);/.test(html.slice(html.indexOf('late.hiLate'))));
check('an open channel clears the channel-less timer', /clearTimeout\(p\.hiLate\)/.test(html));

const lateHiSender = load('lateHiSender', {});
check('the lowest neighbour sends the channel-less hi', lateHiSender('a', ['c', 'a', 'b']) === true);
check('a higher neighbour does not', lateHiSender('b', ['c', 'a', 'b']) === false);
check('an unknown link set still sends', lateHiSender('z', null) === true && lateHiSender('z', []) === true);
check('a seat that is not in the set still sends', lateHiSender('z', ['a']) === true);
compile('targetLinkIds');
compile('deliverLateHi');
check('fhi applies only a hi and forwards otherwise', /m\.k === 'fhi'/.test(html) && /fwdOnward\('fhi'/.test(html));

const nextFileChunk = load('nextFileChunk', {});
check('a full send buffer waits', nextFileChunk(0, 4, (1 << 20) + 1, false) === 'wait');
check('room in the buffer sends one chunk', nextFileChunk(0, 4, 1 << 20, false) === 'send');
check('the last chunk ends the pump', nextFileChunk(4, 4, 0, false) === 'done');
check('a stop ends the pump', nextFileChunk(1, 4, 0, true) === 'stop');
check('the file pump is not a synchronous while', !/while \(seq < total\)/.test(html));
check('file chunks use their own chain and the low-buffer event',
  /const fileTx = net\.makeChain\(\)/.test(html) && /dcSendFile\(/.test(html) && /bufferedamountlow/.test(html));

const partOfB64 = (b) => { const s = Buffer.from(b, 'base64'); return new Uint8Array(s.buffer, s.byteOffset, s.byteLength); };
const b64 = (u8) => Buffer.from(u8).toString('base64');
const tombs = new Map();
const takeFc = load('takeFc', { tombs: tombs, MAX_FILE: 25 * 1024 * 1024, partOfB64: partOfB64, FILE_PART: 32768 });
{
  const f = { id: 'f1', size: 4, bytes: null };
  const bad = takeFc(f, { seq: 1e9, total: 1, b: b64(new Uint8Array([1])) });
  check('a sparse seq is dropped and allocates nothing', bad === 'drop' && f.bytes == null && f.buf == null, bad);
}
{
  const f = { id: 'f2', size: 4, bytes: null };
  const bad = takeFc(f, { seq: 0, total: 1, b: b64(new Uint8Array(8)) });
  check('a body larger than the file is dropped', bad === 'drop' && f.bytes == null, bad);
}
{
  const f = { id: 'f3', size: 4, bytes: null };
  const ok = takeFc(f, { seq: 0, total: 1, b: b64(Uint8Array.from([9, 8, 7, 6])) });
  check('an honest one-part file lands', ok === 'done' && f.bytes && f.bytes.length === 4 && f.bytes[0] === 9 && f.bytes[3] === 6, ok);
}
{
  const size = 32768 + 3;
  const raw = new Uint8Array(size);
  raw[0] = 2; raw[32768] = 5; raw[size - 1] = 9;
  const f = { id: 'f4', size: size, bytes: null };
  const a = takeFc(f, { seq: 0, total: 2, b: b64(raw.subarray(0, 32768)) });
  const b = takeFc(f, { seq: 1, total: 2, b: b64(raw.subarray(32768)) });
  check('two honest parts assemble in order', a === 'part' && b === 'done' && f.bytes[0] === 2 && f.bytes[32768] === 5 && f.bytes[size - 1] === 9, a + ' ' + b);
  const dup = takeFc(f, { seq: 0, total: 2, b: b64(raw.subarray(0, 32768)) });
  check('a chunk after the file is done is dropped', dup === 'drop');
}
{
  const f = { id: 'f5', size: 4, bytes: null };
  tombs.set('f5', { by: 'x' });
  check('a tombstoned file takes no chunk', takeFc(f, { seq: 0, total: 1, b: b64(Uint8Array.from([1, 2, 3, 4])) }) === 'drop');
  tombs.delete('f5');
}

const fdelAllowed = load('fdelAllowed', {});
check('an open room still accepts an unsigned unpin', fdelAllowed(false, false, 'owner', 'guest') === true);
check('an admin room accepts a signed unpin', fdelAllowed(true, true, 'owner', 'guest') === true);
check('an admin room accepts the owner', fdelAllowed(true, false, 'owner', 'owner') === true);
check('an admin room refuses a guest unpin of someone else', fdelAllowed(true, false, 'owner', 'guest') === false);
check('an admin room refuses an unsigned unpin with no owner id', fdelAllowed(true, false, undefined, 'guest') === false);
const fdelList = load('fdelList', {});
check('one id and an ids array both parse', fdelList({ id: 'a' }).join() === 'a' && fdelList({ ids: ['a', 'b'] }).join() === 'a,b');
check('a non-string id is dropped and the list is capped', fdelList({ ids: [1, '', 'ok', 'x'.repeat(80)] }).join() === 'ok');
{
  const many = []; for (let i = 0; i < 600; i++) many.push('i' + i);
  check('fdelList keeps at most 500 ids', fdelList({ ids: many }).length === 500);
}
check('purgeAllFiles announces one ids frame', /sendAll\(msg\)/.test(html) && /k: 'fdel', ids:/.test(html) && !/for \(const id of ids\) \{[\s\S]{0,200}sendAll\(\{ k: 'fdel', id,/.test(html));
{
  const i = html.indexOf("if (pwModal.dataset.mode === 'join')");
  const j = html.indexOf('net.meetPwProof(room, av, roomPw).then(async', i);
  const seg = html.slice(i, j);
  const adminAt = seg.indexOf('hasAdminRoom() && !amAdmin');
  const purgeAt = seg.indexOf('purgeAllFiles(true)');
  check('the password purge runs after the admin refusal', adminAt >= 0 && purgeAt > adminAt, adminAt + ' ' + purgeAt);
}
check('the unpin glyph is owner or admin', /const unpin = \(amAdmin \|\| mine\)/.test(html));
check('askFile is the only want', /function askFile\(/.test(html) && /askFile\(known, p\)/.test(html) && !/dcSend\(p, \{ k: 'want'/.test(html.slice(html.indexOf('function takeMeta'), html.indexOf('function askFile'))));

const logs = new Function(lift('logNearBottom') + '\n' + lift('paintLog') + '\nreturn { logNearBottom, paintLog };')();
const logNearBottom = logs.logNearBottom, paintLog = logs.paintLog;
{
  const up = { scrollHeight: 1000, clientHeight: 200, scrollTop: 10, innerHTML: '' };
  check('a reader scrolled up is not near the bottom', logNearBottom(up) === false);
  paintLog(up, '<div>line</div>');
  check('paint keeps that reader where they were', up.scrollTop === 10 && up.innerHTML === '<div>line</div>');
  const bot = { scrollHeight: 500, clientHeight: 200, scrollTop: 280, innerHTML: '' };
  check('a reader at the bottom is near it', logNearBottom(bot) === true);
  paintLog(bot, '<div>more</div>');
  check('paint follows a reader who was at the bottom', bot.scrollTop === bot.scrollHeight);
}
check('renderChat and renderTranscript paint through paintLog and skip when hidden',
  /function renderChat\(\) \{\n      if \(!chatPanelOpen\(\) \|\| transcriptShown\(\)\) return;/.test(html)
  && /function renderTranscript\(\) \{\n      if \(!chatPanelOpen\(\) \|\| !transcriptShown\(\)\) return;/.test(html)
  && /paintLog\(log, html\)/.test(html)
  && !/log\.scrollTop = log\.scrollHeight/.test(html));

// Own captions trim. Same lift the transcript suite uses, plus keepOwnTranscript.
{
  const start = html.indexOf('    const trs = new Map(); // id -> { id, byId, by, at, text }');
  const end = html.indexOf('    function showCaption(');
  const block = html.slice(start, end);
  const cstart = html.indexOf('    const CHAT_MAX = 500, CHAT_PER_10S = 20;');
  const cend = html.indexOf('    function takeTomb(id, t) {');
  const cblock = html.slice(cstart, cend);
  check('the transcript lift still brackets keepOwnTranscript', start > 0 && end > start && block.indexOf('function keepOwnTranscript') > 0);
  const C = new Function('chat', 'chatTombs', 'chatOffInfo', 'admins', 'myId', cblock + '\n return { trimMap, CHAT_MAX, chatRateOk };')(new Map(), new Map(), () => null, [], 'me');
  const T = new Function('CHAT_MAX', 'trimMap', 'chatRateOk', 'myId', block + '\n return { trs, keepOwnTranscript };')(C.CHAT_MAX, C.trimMap, C.chatRateOk, 'me');
  for (let i = 0; i < 600; i++) T.keepOwnTranscript({ id: 'o' + i, byId: 'me', by: 'Me', at: 9000000 + i, text: 'own caption sentence number ' + i + ' in a long class' });
  check('600 own captions leave trs at CHAT_MAX', T.trs.size === 500, 'size ' + T.trs.size);
  check('the oldest own caption is the one that goes', !T.trs.has('o0') && T.trs.has('o599'));
  check('addTranscriptLine stores through keepOwnTranscript', /if \(!keepOwnTranscript\(m\)\) return;/.test(html));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
