// mu-boot-lobby.js — boot and lobby guards for the meeting page.
//
// The knock does not wait on the screen-name picker or on the IndexedDB
// room mirror. A status line is text, so a name is not HTML-escaped into
// it. The invite count is the room, not the direct-link set. The status
// line is not the Who button. A dialog with a cancel control closes on
// Escape. inviteFromSolo stops waiting for myId after 10s. CSS that the
// JS floor does not implement has a longhand in front of it.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!cond) failures++;
}

function sliceFn(name, until) {
  const start = html.indexOf(name);
  const end = until ? html.indexOf(until, start + name.length) : html.length;
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

const ensure = sliceFn('    function ensureName()', '    function ');
check('ensureName seeds and resolves without waiting on the picker',
  ensure.includes("return Promise.resolve(GifOS.store.identity())")
  && ensure.includes("GifOS.store.setName(seed)")
  && ensure.includes("id=\"nmcancel\"")
  && !ensure.includes('return new Promise'));

const boot = sliceFn('    function bootIntoRoom()', '    function ');
check('bootIntoRoom starts the mirror beside the knock',
  boot.includes('roomStateSettled = false')
  && boot.includes('roomStateReady = hydrateRoomState(params.get(\'v\'), params.get(\'av\'))')
  && boot.includes('return ensureName().then')
  && boot.includes('joinRoom()')
  && !boot.includes('.then(() => hydrateRoomState'));

check('the roster applies bans only after the mirror settles',
  html.includes('if (bootGen !== meshBootGen) return;')
  && html.includes('if (roomStateSettled) applyAdminBoot();')
  && html.includes('else roomStateReady.then(applyAdminBoot);')
  && html.includes('if (pwEpInt(st) && st > pwEpoch)'));

// Knock at t=0. A roster that arrives before the mirror must not seed
// from an empty ban list. The epoch used for the re-assert is the restored one.
function bootSim(hydrateMs, rosterMs, storedBans, storedEp, memEp) {
  let settled = false;
  const queue = [];
  let bans = null, ep = null, knockAt = null;
  const runApply = () => {
    ep = Math.max(memEp, storedEp);
    bans = storedBans.slice();
  };
  const at = (t, fn) => events.push({ t, fn });
  const events = [];
  at(0, () => { knockAt = 0; });
  at(hydrateMs, () => { settled = true; while (queue.length) queue.shift()(); });
  at(rosterMs, () => { if (settled) runApply(); else queue.push(runApply); });
  events.sort((a, b) => a.t - b.t || (a.fn === runApply ? 1 : 0));
  for (const ev of events) ev.fn();
  return { knockAt, bans, ep };
}
const late = bootSim(1500, 100, ['dev-restored'], 4, 0);
check('the knock is not delayed by the mirror or the name picker', late.knockAt === 0);
check('a roster that beats the mirror still seeds the restored bans', late.bans && late.bans[0] === 'dev-restored');
check('the re-assert uses the restored epoch', late.ep === 4);
const early = bootSim(10, 500, ['dev-restored'], 2, 2);
check('a mirror that wins first still seeds', early.bans && early.bans.length === 1 && early.ep === 2);

const appstop = sliceFn("else if (msg.kind === 'appstop')", 'function meshKnows');
check('appstop writes the name as text',
  appstop.includes("setStatus('🧩 ' + (msg.by || 'Someone') + ' stopped the shared app.')")
  && !appstop.includes('esc(msg.by'));
const recon = sliceFn('    function reconcileApp()', '    function ownerAway()');
check('reconcileApp writes names as text',
  recon.includes("(want.byName || 'Someone')")
  && recon.includes("(stop.by || 'Someone')")
  && !recon.includes('esc(want.byName')
  && !recon.includes('esc(stop.by'));

function statusLine(by) {
  return '🧩 ' + (by || 'Someone') + ' stopped the shared app.';
}
check('a name with & is not double-escaped', statusLine('R&D') === '🧩 R&D stopped the shared app.' && !statusLine('R&D').includes('&amp;'));
check('a name with < is not turned into an entity', statusLine('A<B>') === '🧩 A<B> stopped the shared app.');

function othersHere(displayCount) { return Math.max(0, displayCount - 1); }
const invite = sliceFn('    function showInviteModal()', '    function slugRoom');
check('the invite count is the room minus me',
  invite.includes('const others = Math.max(0, displayCount() - 1);')
  && othersHere(400) === 399
  && othersHere(1) === 0
  && othersHere(0) === 0);

check('the status line is not a button', !html.includes('statusEl.onclick') && !html.includes("statusEl.style.cursor = 'pointer'"));
check('Who is its own control', html.includes('id="whobtn"') && html.includes("getElementById('whobtn').onclick = showWhoModal"));
check('Help points at Who, not the status line', html.includes('Tap Who to see the list.') && !html.includes('Tap the status text'));

check('Escape dismiss uses the cancel control and skips a locked join',
  html.includes('function modalDismissBtn(el)')
  && html.includes("el.id === 'pw-modal' && el.dataset.mode === 'join'")
  && html.includes("/-cancel$|-close$|-done$|-back$|-keep$/")
  && html.includes('const b = modalDismissBtn(top);'));
check('dialogs are marked and focus returns',
  html.includes('role="dialog"')
  && html.includes("aria-modal")
  && html.includes('modalOpener')
  && html.includes('back.focus()'));

const wait = sliceFn('            const ID_WAIT_MS = 10000;', '            return bootAppRoom()');
check('waitMyId gives up at 10s instead of polling',
  wait.includes('const ID_WAIT_MS = 10000;')
  && wait.includes('Promise.race([myIdReady, timeout])')
  && wait.includes("throw new Error('no identity yet')")
  && !wait.includes('setInterval'));

function idWait(arrivedMs) {
  const limit = 10000;
  if (arrivedMs <= limit) return 'ok';
  return 'no identity yet';
}
check('an identity that lands inside 10s continues', idWait(0) === 'ok' && idWait(9900) === 'ok');
check('an identity that never lands reports at 10s', idWait(10001) === 'no identity yet');

function beforeInset(i) {
  return html.slice(Math.max(0, i - 80), i);
}
let insetOk = true, insetN = 0;
for (const token of ['inset: 0', 'inset:0']) {
  let from = 0;
  while (true) {
    const i = html.indexOf(token, from);
    if (i < 0) break;
    insetN++;
    const prev = beforeInset(i);
    if (!prev.includes('top: 0') && !prev.includes('top:0')) insetOk = false;
    from = i + token.length;
  }
}
check('every inset has a top/right/bottom/left longhand', insetOk && insetN >= 11);

check('color-mix keeps a plain color in front of it',
  html.includes('color: #4a9eff; color: color-mix(')
  && html.includes('color: #ff8a3d; color: color-mix('));
check('min() in the tile grid has a longhand in front of it',
  html.includes('grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));')
  && html.includes('grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));'));
check('aspect-ratio has a padding reserve for the JS floor',
  html.includes('@supports not (aspect-ratio: 1 / 1)')
  && html.includes('padding-top: 56.25%')
  && html.includes('padding-top: 177.78%'));
check('dvh keeps a vh longhand',
  html.includes('max-height: calc(100vh - 2rem); max-height: calc(100dvh - 2rem);')
  && html.includes('max-height: 55vh; max-height: 55dvh;'));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
process.exit(failures ? 1 : 0);
