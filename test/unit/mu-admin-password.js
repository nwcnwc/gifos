// mu-admin-password.js — door copy, rejection handling, and relay-copy bounds.
//
// Findings 27, 113, 125, 134, 135, 141, 144, 149, 151, 270, 274.
// The page script is the source. Behaviors that do not need a document
// are lifted and run. The rest are pinned as text.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
function sliceBetween(a, b) {
  const i = html.indexOf(a);
  const j = html.indexOf(b, i < 0 ? 0 : i + a.length);
  check('slice ' + a.slice(0, 40), i >= 0 && j > i, { i: i, j: j });
  return i >= 0 && j > i ? html.slice(i, j) : '';
}

// ---- 27: saved credentials must not fill either password ----
{
  const tags = html.match(/<input\b[^>]*type="password"[^>]*>/g) || [];
  check('every password input is present', tags.length === 7, tags.length);
  check('every password input uses autocomplete new-password',
    tags.every((t) => /autocomplete="new-password"/.test(t)) && !/type="password"[^>]*autocomplete="off"/.test(html));
}

// ---- 274: touchPw writes at most once per 10 minutes ----
{
  const src = sliceBetween('    const PW_TOUCH_MS', '    function forgetPw(');
  function harness(roomPw, seed) {
    const store = new Map(seed || []);
    const writes = [];
    const localStorage = {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); writes.push(String(v)); },
    };
    const touchPw = new Function('roomPw', 'localStorage', 'pwAtKey', src + '\nreturn touchPw;')(roomPw, localStorage, () => 'gifos_vpwat_room');
    return { touchPw, writes, store };
  }
  const idle = harness('');
  idle.touchPw();
  check('touchPw does nothing when the room has no password', idle.writes.length === 0);
  const live = harness('secret');
  live.touchPw();
  check('a missing stamp is written once', live.writes.length === 1);
  live.touchPw();
  check('a second pass inside 10 minutes does not write', live.writes.length === 1);
  live.store.set('gifos_vpwat_room', String(Date.now() - 11 * 60 * 1000));
  live.touchPw();
  check('a stamp older than 10 minutes is rewritten', live.writes.length === 2);
  check('PW_TOUCH_MS is 10 minutes', /const PW_TOUCH_MS = 10 \* 60 \* 1000;/.test(src));
}

// ---- 113 / 141: relay copies skip open channels and socketless ids ----
{
  const src = sliceBetween('    function relayCopyTargets()', '    function channelsDrained()');
  const peers = new Map();
  peers.set('open', { dc: { readyState: 'open', bufferedAmount: 0 } });
  peers.set('closed', { dc: { readyState: 'connecting', bufferedAmount: 0 } });
  const relaySocketed = new Set(['open', 'closed', 'bare', 'me']);
  const out = new Function('relaySocketed', 'peers', 'myId', src + '\nreturn relayCopyTargets();')(relaySocketed, peers, 'me');
  check('relayCopyTargets keeps a socket with no open channel', out.indexOf('closed') >= 0 && out.indexOf('bare') >= 0, out);
  check('relayCopyTargets skips an open DataChannel and my own id', out.indexOf('open') < 0 && out.indexOf('me') < 0, out);
  check('an id that is not on the relay roster is absent', out.indexOf('deep') < 0, out);
}

// ---- 270: the re-grant stays under the non-door frame budget ----
{
  const src = sliceBetween('    const RELAY_COPY_BURST', '    function pwChainFailed(');
  function run(ids, leaving) {
    const sent = [];
    const timers = [];
    const net = { sendChunked(env, emit) { emit(env); } };
    const relaySendObj = (o) => sent.push(o.to);
    const prev = global.setTimeout;
    global.setTimeout = (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; };
    try {
      new Function('net', 'relaySendObj', 'myId', 'leaving', src + '\nreturn paceRelayCopies;')(net, relaySendObj, 'me', leaving)(ids, { k: 'pwinfo' });
    } finally { global.setTimeout = prev; }
    return { sent: sent, timers: timers };
  }
  const small = run(['a', 'b', 'me'], false);
  check('a short list is sent at once and not paced', small.sent.join(',') === 'a,b' && small.timers.length === 0, small.sent);
  const big = run(Array.from({ length: 500 }, (_, i) => 'p' + i), false);
  check('the first send stays at 480 frames', big.sent.length === 480, big.sent.length);
  check('the remainder waits 500 ms', big.timers.length === 1 && big.timers[0].ms === 500, big.timers.map((t) => t.ms));
  const prev = global.setTimeout;
  const more = [];
  global.setTimeout = (fn, ms) => { more.push(ms); return more.length; };
  try { big.timers[0].fn(); }
  finally { global.setTimeout = prev; }
  check('each later gap sends one frame', big.sent.length === 481 && more.length === 1 && more[0] === 500, big.sent.length);
  const stopped = run(['a', 'b', 'c'], true);
  check('a leaving page sends no further copies', stopped.sent.length === 0, stopped.sent);
  const fan = sliceBetween('const fan = () => paceRelayCopies(relaySocketed, env);', 'if (relayRosterScope');
  check('the admin re-grant calls the paced sender', /paceRelayCopies\(relaySocketed, env\)/.test(fan) && !/for \(const pid of relaySocketed\)/.test(fan));
}

// ---- 113: createAdminRoom does not sleep or address every roster id ----
{
  const car = sliceBetween('    async function createAdminRoom(', "    document.getElementById('invite').onclick");
  check('createAdminRoom relay-copies relayCopyTargets', /relayCopyTargets\(/.test(car) && !/gossipIds\(/.test(car));
  check('createAdminRoom flushes outbound bytes and has no bare timer', /flushOutbound\(600\)/.test(car) && !/setTimeout\(/.test(car));
  const caller = sliceBetween('go.disabled = true; go.textContent =', 'for (const i of body.querySelectorAll');
  check('a failed createAdminRoom restores the invite modal and the button',
    /try \{[\s\S]*await createAdminRoom\(chosen, pass, post, guest\);[\s\S]*invModal\.style\.display = 'flex'/.test(caller)
    && /go\.disabled = false/.test(caller)
    && /Could not create the room/.test(caller));
}

// ---- 135 / 149: Leave, Escape, and the admin-only hint ----
{
  const modal = sliceBetween('    function showPwModal(locked) {', "document.getElementById('pwbtn').onclick");
  check('a locked room shows Leave instead of hiding Close', /cancel\.textContent = locked \? 'Leave' : 'Close'/.test(modal) && !/pw-cancel'\)\.style\.display = locked \? 'none'/.test(modal));
  check('an admin room says only the admin can change the password', /hasAdminRoom\(\)/.test(modal) && /Only the admin can set or change it/.test(modal));
  check('an open room still says anyone can change the password', /Anyone in the meeting can set or change it/.test(modal));
  const esc = sliceBetween("document.getElementById('pw-cancel').onclick", "document.getElementById('pw-save').onclick");
  check('Escape on a locked room leaves for the lobby', /e\.key !== 'Escape'/.test(esc) && /pwModal\.dataset\.mode === 'join'/.test(esc) && /location\.href = MEET_PATH/.test(esc));
}

// ---- 134 / 141: rejection handlers and the password-change fan ----
{
  const save = sliceBetween("document.getElementById('pw-save').onclick", "document.getElementById('pw-new').addEventListener");
  check('the join proof chain reports a rejection', /pwChainFailed\(err, true\)/.test(save));
  check('the manage proof chain reports a rejection', /pwChainFailed\(err, false\)/.test(save));
  check('a password change relay-copies relayCopyTargets, not gossipIds', /relayCopyTargets\(/.test(save) && !/gossipIds\(/.test(save));
  check('a password change paces its relay copies like the door re-grant', /paceRelayCopies\(relayCopyTargets\(\), env\)/.test(save) && !/for \(const pid of relayCopyTargets\(\)\)/.test(save));
  check('both remembered-password probes report a rejection', (html.match(/pwChainFailed\(err, true\)/g) || []).length >= 3);
  check('adopting a grant reports a rejection', /pwChainFailed\(err, wasBlocked\)/.test(html));
  check('joinRoom names a derivation failure', /Could not join the meeting/.test(html));
}

// ---- 144: the admin button waits, and the error stays in the modal ----
{
  const adm = sliceBetween("document.getElementById('adm-enable').onclick", '// ---- who is on this meeting');
  const off = adm.indexOf('btn.disabled = true');
  const derive = adm.indexOf('await deriveAdminKey');
  const wrong = adm.indexOf("hint.textContent = 'Wrong admin password.'");
  const clear = adm.indexOf("adm-pass').value = ''");
  check('the sign-in button is disabled before derivation', off >= 0 && off < derive, { off: off, derive: derive });
  check('a wrong password is written into the modal hint', wrong >= 0);
  check('the field is cleared only after the password is accepted', wrong >= 0 && clear > wrong, { wrong: wrong, clear: clear });
  check('the status line still says Wrong admin password', /setStatus\('[^']*Wrong admin password\.'\)/.test(adm));
}

// ---- 151: one ban-name read per paint ----
{
  const rb = sliceBetween('    function renderBanned() {', '    function showAdmModal() {');
  check('renderBanned reads ban names once, above the row loop', /const names = banNames\(\);[\s\S]*for \(const b of roomBan\)/.test(rb) && !/banNames\(\)\[/.test(rb));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
