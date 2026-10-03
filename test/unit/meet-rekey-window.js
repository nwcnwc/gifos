// meet-rekey-window.js — A FRAME SEALED UNDER THE KEY I AM STILL DERIVING IS
// HELD, NOT DROPPED (§LOCK, the re-key window).
//
// A member who adopts a new room password derives the new key with the slow
// password stretch (about half a second, seconds on a loaded phone). The
// setter moved to the new key the moment its grant left. Measured in
// e2e-video on 3 Oct 2026 (4 burner runs): Ada set a password and pinned a
// file at once; Bob and Cai installed the new key 470-510 ms after adopting
// it, the file's announcement (fmeta, one-shot) opened under neither of their
// keys, was dropped, and the file never reached either of them. The island
// leg lost LeftIsle's fmeta at the Hub the same way.
//
// The rule now: while a re-key is deriving, a frame that opens under no key I
// hold is held (at most REKEY_HOLD_MAX frames, REKEY_HOLD_MS each) and opened
// again when the key lands. A held frame that still does not open goes to
// healStaleFrom exactly as before. Nothing is held when no re-key runs.
//
// The DataChannel and relay receive paths, holdForRekey/replayRekeyHeld and
// rekeyRoom are lifted verbatim out of site/run.html and run in Node against
// real AES-GCM keys (gifos-net.js), with the key derivation gated so the test
// decides when it lands.
'use strict';
const fs = require('fs');
const path = require('path');
require('../../site/js/gifos-net.js');
const net = globalThis.GifOS.net;
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
const slice = (a, b) => { const i = html.indexOf(a), j = i < 0 ? -1 : html.indexOf(b, i + a.length); return i > 0 && j > i ? html.slice(i, j) : ''; };

// ---- the lifts ----
const stateSrc = slice('    let rekeysPending = 0;', '    // THE MESH NODE');
const holdSrc = slice('    function holdForRekey(take) {', '    function healStaleFrom(pid, envPiece) {');
const rekeySrc = slice('    function rekeyRoom(restarting) {', '    // A per-tab, per-room peer id');
const dcSrc = slice('      dc.onmessage = (ev) => {', '\n    }\n    // admOk is the OS');
const relaySrc = slice("        const from = m.from;\n        const piece = meshDefrag(m.msg, from);", "      }\n      else if (m.t === 'ban') {");
check('run.html carries the re-key window state (rekeysPending, rekeyHeld, REKEY_HOLD_MAX, REKEY_HOLD_MS)',
  /rekeysPending/.test(stateSrc) && /rekeyHeld/.test(stateSrc) && /REKEY_HOLD_MAX/.test(stateSrc) && /REKEY_HOLD_MS/.test(stateSrc));
check('run.html defines holdForRekey and replayRekeyHeld beside healStaleFrom', /function holdForRekey/.test(holdSrc) && /function replayRekeyHeld/.test(holdSrc));
check('rekeyRoom and both receive paths are where the lift expects them', !!rekeySrc && !!dcSrc && !!relaySrc);
check('rekeyRoom counts its derivation and replays the held frames when it lands, success or failure',
  /rekeysPending\+\+/.test(rekeySrc) && /replayRekeyHeld\(\)/.test(rekeySrc) && /\(err\) => \{ landed\(\); throw err; \}/.test(rekeySrc));
check('the DataChannel path holds before it gives up (holdForRekey before healStaleFrom)',
  dcSrc.indexOf('holdForRekey(take)') > 0 && dcSrc.indexOf('holdForRekey(take)') < dcSrc.indexOf('healStaleFrom('));
check('the relay path holds before it gives up (holdForRekey before healStaleFrom)',
  relaySrc.indexOf('holdForRekey(take)') > 0 && relaySrc.indexOf('holdForRekey(take)') < relaySrc.indexOf('healStaleFrom('));

// A receiver built from the lifted source. Without the fix's helpers in the
// page the harness still builds (stubs that never hold), so the behaviour
// checks below go red on the old page instead of crashing.
function makeReceiver() {
  let release = null;
  let gate = Promise.resolve();
  const fakeNet = Object.assign({}, net, {
    deriveMeetKey: (r, a, pw) => gate.then(() => (pw === 'FAIL' ? Promise.reject(new Error('derive failed')) : net.deriveMeetKey(r, a, pw))),
  });
  const body = [
    "let room = 'rk-room', av = '', roomPw = '', roomE2E = null, prevRoomE2E = null, rekeyAt = 0, meshNode = null, pwEpoch = 0;",
    'const pwLog = () => {}; const clog = null;',
    'const got = [], healed = [];',
    "const onDc = (p, dc, inner) => got.push('dc:' + inner.k + ':' + (inner.id || ''));",
    "const onSignal = (from, inner) => got.push('relay:' + inner.kind);",
    "const onRemote = (from, inner) => got.push('relay:' + inner.k + ':' + (inner.id || ''));",
    'const healStaleFrom = (pid, m) => { healed.push(pid); };',
    'const meshDefrag = (m) => m;',
    'const rxm = net.makeChain();',
    stateSrc || 'let rekeysPending = 0; const rekeyHeld = []; const REKEY_HOLD_MAX = 64, REKEY_HOLD_MS = 10000;',
    holdSrc || 'function holdForRekey() { return false; } function replayRekeyHeld() {}',
    rekeySrc,
    'function wireDc(p, dc) {', dcSrc, '}',
    'function relayIn(m) { if (m.t === "peer" && m.msg) {', relaySrc, '} }',
    'return { wireDc, relayIn, rekeyRoom, got, healed,',
    '  setKey: (k) => { roomE2E = k; }, setPw: (v) => { roomPw = v; },',
    '  state: () => ({ pending: rekeysPending, held: rekeyHeld.length, max: REKEY_HOLD_MAX, isNew: roomE2E }) };',
  ].join('\n');
  const api = new Function('net', body)(fakeNet);
  api.gateDerivation = () => { gate = new Promise((r) => { release = r; }); };
  api.release = () => { if (release) release(); };
  return api;
}
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)); };

(async () => {
  const oldKey = await net.deriveMeetKey('rk-room', '', '');
  const newKey = await net.deriveMeetKey('rk-room', '', 'vault');
  const thirdKey = await net.deriveMeetKey('rk-room', '', 'someone-else');
  const env = (key, obj) => net.seal(key, obj);
  const dcFrame = (dc, e) => dc.onmessage({ data: JSON.stringify(e) });

  // 1. THE BUG: the setter's next frame lands while my re-key derives.
  {
    const R = makeReceiver(); R.setKey(oldKey);
    const p = { id: 'ada' }, dc = {}; R.wireDc(p, dc);
    R.setPw('vault'); R.gateDerivation();
    const rk = R.rekeyRoom(false);
    check('a re-key in flight is counted while it derives', R.state().pending === 1, R.state());
    dcFrame(dc, await env(newKey, { k: 'fmeta', id: 'f1' }));
    await settle();
    check('the new-key frame is not delivered before the key lands (nothing can open it yet)', R.got.length === 0, R.got);
    check('…and it is held, not handed to healStaleFrom', R.state().held === 1 && R.healed.length === 0, { st: R.state(), healed: R.healed });
    R.release(); await rk; await settle();
    check('the held fmeta is delivered once the new key lands (it used to be dropped)', R.got.join() === 'dc:fmeta:f1', R.got);
    check('the hold empties and the derivation count returns to zero', R.state().held === 0 && R.state().pending === 0, R.state());
  }
  // 2. The relay path gets the same treatment (a sealed app frame or signaling).
  {
    const R = makeReceiver(); R.setKey(oldKey);
    R.setPw('vault'); R.gateDerivation();
    const rk = R.rekeyRoom(false);
    R.relayIn({ t: 'peer', from: 'ada', msg: await env(newKey, { kind: 'ice', candidate: { candidate: 'x' } }) });
    R.relayIn({ t: 'peer', from: 'ada', msg: await env(newKey, { k: 'chat', id: 'c1' }) });
    await settle();
    check('relay frames under the deriving key wait too', R.got.length === 0 && R.state().held === 2, { got: R.got, st: R.state() });
    R.release(); await rk; await settle();
    check('…and arrive in order when it lands', R.got.join() === 'relay:ice,relay:chat:c1', R.got);
  }
  // 3. Old-key traffic during the derivation is untouched: it opens at once.
  {
    const R = makeReceiver(); R.setKey(oldKey);
    const p = { id: 'cai' }, dc = {}; R.wireDc(p, dc);
    R.setPw('vault'); R.gateDerivation();
    const rk = R.rekeyRoom(false);
    dcFrame(dc, await env(oldKey, { k: 'want', id: 'f1' }));
    await settle();
    check('a frame under the key I still hold is delivered at once, never held', R.got.join() === 'dc:want:f1' && R.state().held === 0, { got: R.got, st: R.state() });
    R.release(); await rk;
  }
  // 4. No re-key running: nothing is held (the old behaviour, exactly).
  {
    const R = makeReceiver(); R.setKey(newKey);
    const p = { id: 'eve' }, dc = {}; R.wireDc(p, dc);
    dcFrame(dc, await env(thirdKey, { k: 'chat', id: 'x' }));
    await settle();
    check('with no re-key running an unopenable frame goes straight to healStaleFrom', R.healed.join() === 'eve' && R.state().held === 0 && R.got.length === 0, { got: R.got, healed: R.healed, st: R.state() });
  }
  // 5. A held frame that still cannot open is handled as before, once.
  {
    const R = makeReceiver(); R.setKey(oldKey);
    const p = { id: 'rogue' }, dc = {}; R.wireDc(p, dc);
    R.setPw('vault'); R.gateDerivation();
    const rk = R.rekeyRoom(false);
    dcFrame(dc, await env(thirdKey, { k: 'chat', id: 'x' }));
    await settle();
    R.release(); await rk; await settle();
    check('a held frame that opens under no key after the re-key goes to healStaleFrom once and is never delivered',
      R.got.length === 0 && R.healed.join() === 'rogue' && R.state().held === 0, { got: R.got, healed: R.healed, st: R.state() });
  }
  // 6. Bounded: past REKEY_HOLD_MAX the excess is handled as before.
  {
    const R = makeReceiver(); R.setKey(oldKey);
    const p = { id: 'flood' }, dc = {}; R.wireDc(p, dc);
    R.setPw('vault'); R.gateDerivation();
    const rk = R.rekeyRoom(false);
    const max = R.state().max;
    const junk = await env(thirdKey, { k: 'chat', id: 'j' });
    for (let i = 0; i < max + 5; i++) dcFrame(dc, junk);
    await settle();
    check('the hold never exceeds REKEY_HOLD_MAX (' + max + ')', R.state().held === max && R.healed.length === 5, { st: R.state(), healed: R.healed.length });
    R.release(); await rk; await settle();
    check('…and it is empty again after the re-key', R.state().held === 0, R.state());
  }
  // 7. A derivation that fails still releases the hold.
  {
    const R = makeReceiver(); R.setKey(oldKey);
    const p = { id: 'ada' }, dc = {}; R.wireDc(p, dc);
    R.setPw('FAIL'); R.gateDerivation();
    const rk = R.rekeyRoom(false).catch((e) => 'rejected');
    dcFrame(dc, await env(newKey, { k: 'fmeta', id: 'f2' }));
    await settle();
    R.release(); const r = await rk; await settle();
    check('a failed derivation still ends the count and empties the hold (the frame goes to healStaleFrom)',
      r === 'rejected' && R.state().pending === 0 && R.state().held === 0 && R.healed.join() === 'ada', { r, st: R.state(), healed: R.healed });
  }
  // 8. Two overlapping re-keys (a password set twice in a row): the hold
  //    waits for the last one, then opens under the newest key.
  {
    const R = makeReceiver(); R.setKey(oldKey);
    const p = { id: 'ada' }, dc = {}; R.wireDc(p, dc);
    R.setPw('vault'); R.gateDerivation();
    const rk1 = R.rekeyRoom(false);
    const rk2 = R.rekeyRoom(false);
    check('two derivations in flight are both counted', R.state().pending === 2, R.state());
    dcFrame(dc, await env(newKey, { k: 'fmeta', id: 'f3' }));
    await settle();
    R.release(); await rk1; await rk2; await settle();
    check('the frame is delivered once both have landed', R.got.join() === 'dc:fmeta:f3' && R.state().pending === 0, { got: R.got, st: R.state() });
  }
  console.log('\nmeet-rekey-window: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
