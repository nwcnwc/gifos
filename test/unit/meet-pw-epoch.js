// meet-pw-epoch.js — THE PASSWORD GENERATION CANNOT BE POISONED BY A PULSE.
//
// §LOCK (docs/meet-security.md): every grant carries an epoch `ep`, a grant at
// or below my own generation is a replay, and the room's status pulse carries
// `pwEp` so a fresh page learns the room's generation as its FLOOR. The pulse
// is ANY member's word, sealed but unsigned by an admin. Measured in the
// source on 2026-10-03: takeStatus adopted any `number`, so one member pulsing
// pwEp = 1e20 set every listener's epoch to 1e20, storePwEpoch PERSISTED it,
// and the admin's next grant minted ep = 1e20 + 1 === 1e20 — dead on arrival
// at every seat that heard the pulse, for the life of the room name.
//
// The rule now: a pulse may raise the floor only to a non-negative safe
// integer no larger than PW_EP_MAX; a grant's epoch must be a non-negative
// safe integer (exact arithmetic, so +1 is always a new generation); a
// persisted epoch that fails the same test reads as 0 and the room re-floors
// it. takeStatus is lifted verbatim out of site/run.html and run in Node; the
// grant and storage intakes are pinned as text.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}

// ---- lift takeStatus and the epoch rule verbatim ----
const tsStart = html.indexOf('    function takeStatus(from, st) {');
const tsEnd = html.indexOf('    // One global, ordered hand-raise queue');
check('takeStatus is where the lift expects it', tsStart > 0 && tsEnd > tsStart);
const ruleStart = html.indexOf('    function pwEpInt(');
const ruleEnd = ruleStart > 0 ? html.indexOf('\n', html.indexOf('const PW_EP_MAX', ruleStart)) : -1;
check('run.html defines the epoch rule (pwEpInt + PW_EP_MAX)', ruleStart > 0 && ruleEnd > ruleStart);
const rule = ruleStart > 0 && ruleEnd > ruleStart ? html.slice(ruleStart, ruleEnd) : 'function pwEpInt(n) { return typeof n === "number"; } const PW_EP_MAX = Infinity;';
function makeIntake(epoch0) {
  const src = 'let pwEpoch = ' + (epoch0 | 0) + '; const meshGone = new Map(), statusOf = new Map(), TOMB_GRACE = 10000; let gossipAgeMs = 0;'
    + ' let stores = 0; function storePwEpoch(ep) { pwEpoch = ep; stores++; }\n'
    + rule + '\n' + html.slice(tsStart, tsEnd)
    + '\n return { takeStatus, epoch: () => pwEpoch, stores: () => stores, max: PW_EP_MAX, pwEpInt };';
  return new Function(src)();
}

// ---- a hostile or broken pulse cannot saturate the generation ----
{
  const T = makeIntake(3);
  for (const bad of [1e20, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, -1, 2.5, '7', 1e300]) {
    T.takeStatus('guest', { at: 1, pwEp: bad });
    check('a pulse with pwEp=' + String(bad) + ' leaves the epoch at 3', T.epoch() === 3, T.epoch());
  }
  check('…and the grant minted next (ep = epoch + 1) is a NEW generation', T.epoch() + 1 > T.epoch() && Number.isSafeInteger(T.epoch() + 1));
  check('nothing was persisted by the poison', T.stores() === 0, T.stores());
  check('the pulse is still taken as a status (only its epoch field is refused)', T.takeStatus('guest', { at: 2, pwEp: 1e20 }) === true);
}

// ---- the honest floor still works ----
{
  const T = makeIntake(0);
  T.takeStatus('mate', { at: 1, pwEp: 5 });
  check('a fresh page takes the room\'s generation (5) from a pulse', T.epoch() === 5, T.epoch());
  T.takeStatus('mate', { at: 2, pwEp: 4 });
  check('a lower generation never rolls the floor back', T.epoch() === 5, T.epoch());
  T.takeStatus('mate', { at: 3, pwEp: T.max });
  check('a pulse at PW_EP_MAX is taken', T.epoch() === T.max, T.epoch());
  T.takeStatus('mate', { at: 4, pwEp: T.max + 1 });
  check('a pulse past PW_EP_MAX is not', T.epoch() === T.max, T.epoch());
  check('PW_EP_MAX + 1 is still an exact, grant-able generation (the pulse ceiling sits far below exact arithmetic)',
    Number.isSafeInteger(T.max) && T.max >= 1e6 && T.pwEpInt(T.max + 1) && T.max + 1 > T.max, T.max);
  check('pwEpInt: non-negative safe integers only',
    T.pwEpInt(0) && T.pwEpInt(7) && T.pwEpInt(Number.MAX_SAFE_INTEGER) && !T.pwEpInt(-1) && !T.pwEpInt(1.5) && !T.pwEpInt(Infinity) && !T.pwEpInt(NaN) && !T.pwEpInt('3') && !T.pwEpInt(Number.MAX_SAFE_INTEGER + 1));
}

// ---- the other two intakes, pinned as text ----
{
  const grant = html.slice(html.indexOf("} else if (m.k === 'pwinfo') {"), html.indexOf('retainedGrant = { k: \'pwinfo\', pw: m.pw'));
  check('a grant whose ep is not a non-negative safe integer is dead on arrival', /if \(m\.ep != null && !pwEpInt\(m\.ep\)\) return;/.test(grant));
  check('…and the replay guard still follows it', /if \(m\.ep != null && m\.ep <= pwEpoch\) return;/.test(grant));
  const load = html.slice(html.indexOf('    function loadPw() {'), html.indexOf('    function storePw(v) {'));
  check('a persisted epoch is read through the same rule (a poisoned store reads as 0)', /pwEpInt\(/.test(load) && !/parseInt\(localStorage\.getItem\(pwEpochKey\(\)\), 10\) \|\| 0\)/.test(load));
  const mirror = html.slice(html.indexOf("const localEp = parseInt(localStorage.getItem('gifos_vpwep_' + base), 10) || 0;"), html.indexOf("if (newer) localStorage.setItem(MIRROR_AT_PFX + base"));
  check('the admin mirror read takes only a safe-integer epoch', /pwEpInt\(rec\.pwEp\)/.test(mirror));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
