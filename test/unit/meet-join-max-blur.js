// meet-join-max-blur.js — PRIVACY GUARD: everyone joins a meeting Max-blurred.
//
// THE DESIGN RULE (docs/meeting.md, "Blur"):
//   "Everyone joins muted, camera off, and Max-blurred — invisible until they
//    choose to be seen."
//
// WHY IT IS A PRIVACY RULE, NOT A PREFERENCE. A person's face is shown only by
// a choice they make in THIS meeting, in front of THESE people. A blur level
// picked in one room (a family call, a room of friends) must never walk into
// the next room, where the people, the password and the consent are all
// different. If a remembered "No blur" seeded the next join, the camera's
// first frames would leave the device less blurred than its owner ever chose
// for that room: their face would be visible before they decided to be seen.
// Remembering the level is a convenience that costs exactly that, so the
// level is never stored, never read back, and every join starts at Max.
//
// History: on 3 Oct 2026 a "remember the blur level" finding was implemented
// (c32621d5: localStorage key gifos_blur restored at boot). It was reverted in
// 84280e7a. This suite is in the release gate (test/unit is discovered by
// glob) so the rule cannot be loosened again by accident. Changing the rule
// means changing docs/meeting.md AND this file, on purpose, with the owner's
// consent.
//
// Pure node. No browser, no fleet.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'site', 'run.html'), 'utf8');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'meeting.md'), 'utf8');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};
function extractFn(text, name) {
  const i = text.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const brace = text.indexOf('{', i);
  let depth = 0;
  for (let j = brace; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}' && --depth === 0) return text.slice(i, j + 1);
  }
  return null;
}
// A storage stub that already holds every blur level a past build, a hand
// edit or another app could have left behind, and records any write.
function hostileStorage() {
  const data = { gifos_blur: '0', blur: '0', gifos_meet_blur: '0', myBlur: '0' };
  const writes = [];
  return {
    data, writes,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { writes.push([k, String(v)]); data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// ---- 1. the rule is still the documented design -----------------------------
{
  const flat = doc.replace(/\s+/g, ' ');
  check('docs/meeting.md still states the rule: everyone joins muted, camera off, and Max-blurred',
    flat.includes('Everyone joins muted, camera off, and Max-blurred'));
}

// ---- 2. "Max" is level 2 ------------------------------------------------------
{
  check('the slider\'s Max segment is level 2', /id="blur-max" data-blur="2"/.test(src));
  const m = src.match(/const blurLevel = \(v\) => [^\n;]+;/);
  check('blurLevel is in run.html', !!m);
  if (m) {
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(m[0] + '\nthis.lv = blurLevel(2);', ctx);
    check('blurLevel(2) is Max (2)', ctx.lv === 2);
  }
}

// ---- 3. a join starts at Max, whatever the device remembers -----------------
{
  const line = (src.match(/const myStatus = \{[^}]*\};/) || [''])[0];
  check('myStatus is declared once in run.html', (src.match(/const myStatus = \{/g) || []).length === 1);
  check('the boot level is the literal 2, not read from anywhere', /\bblur:\s*2\s*,/.test(line), line);
  if (line) {
    // Run the real boot line with storage and the URL both asking for No blur.
    const ls = hostileStorage(), ss = hostileStorage();
    const ctx = { localStorage: ls, sessionStorage: ss, location: { search: '?blur=0', hash: '#blur=0' } };
    vm.createContext(ctx);
    // If the boot line calls a helper (as the 3 Oct build's storedBlurLevel()
    // did), run that helper too, so the check shows what a stored level does.
    const helper = (src.match(/function (\w+)\(\)/g) || []).map((f) => f.slice(9, -2)).filter((n) => new RegExp('blur:\\s*' + n + '\\(').test(line));
    const prelude = helper.map((n) => extractFn(src, n) || '').join('\n') + '\n' + ((src.match(/const BLUR_KEY = [^;]+;/) || [''])[0]);
    try { vm.runInContext(prelude + '\n' + line + '\nthis.st = myStatus;', ctx); }
    catch (e) { check('the boot line runs on its own', false, String(e && e.message)); }
    check('with No blur stored and in the URL, a join still starts at Max (2)', ctx.st && ctx.st.blur === 2, ctx.st);
    check('a join starts muted', ctx.st && ctx.st.muted === true);
    check('a join starts with the camera off', ctx.st && ctx.st.camOff === true);
    check('the boot line wrote nothing to storage', ls.writes.length === 0 && ss.writes.length === 0);
  }
}

// ---- 4. nothing reads or writes a blur level from storage --------------------
{
  check('no storage read names a blur level', !/(local|session)Storage\.getItem\([^)]*blur/i.test(src));
  check('no storage write names a blur level', !/(local|session)Storage\.setItem\([^)]*blur/i.test(src));
  check('no helper restores a stored blur level', !/storedBlurLevel|BLUR_KEY/.test(src));
}

// ---- 5. picking a level in a meeting is never remembered ---------------------
{
  const body = extractFn(src, 'setPersonalBlur');
  check('setPersonalBlur is in run.html', !!body);
  if (body) {
    const ls = hostileStorage(), ss = hostileStorage();
    const ctx = {
      localStorage: ls, sessionStorage: ss,
      myStatus: { muted: true, camOff: true, blur: 2 },
      paintControls() {}, refreshOutbound() {}, broadcastStatus() {}, reactRoomState() {},
      modOf: () => ({}), setStatus() {}, roomPw: '', hasAdminRoom: () => false, amAdmin: false,
      adminPresent: () => false, allConsent: () => false, consentCount: () => 0, participantCount: () => 1,
    };
    vm.createContext(ctx);
    // Load any storage-key constant the page defines, so a write through it
    // really lands in the stub instead of failing silently in the vm.
    const keys = (src.match(/const \w*BLUR\w* = '[^']*';/g) || []).join('\n');
    vm.runInContext(keys + '\n' + body + '\nsetPersonalBlur(0); this.after0 = myStatus.blur; setPersonalBlur(1); this.after1 = myStatus.blur;', ctx);
    check('the slider still changes the level inside this meeting', ctx.after0 === 0 && ctx.after1 === 1);
    check('choosing No blur or Min blur writes nothing to storage', ls.writes.length === 0 && ss.writes.length === 0, { ls: ls.writes, ss: ss.writes });
  }
  // The slider is the ONLY writer of the local level. Any new writer (a lobby
  // picker, a rejoin, a reload, a URL knob) must be checked against the rule
  // and added here deliberately.
  const writers = src.match(/myStatus\.blur\s*=[^=]/g) || [];
  check('setPersonalBlur is the only code that changes the local blur level', writers.length === 1, writers);
  check('Rejoin reloads the page, so it boots fresh at Max', /leftRejoin\.onclick = \(\) => location\.reload\(\)/.test(src));
}

// ---- 6. the level a 3 Oct build stored is removed at boot ------------------
{
  const line = (src.match(/try \{ localStorage\.removeItem\('gifos_blur'\); \} catch \(e\) \{\}/) || [''])[0];
  check('boot removes the gifos_blur key an older build stored', !!line);
  if (line) {
    const ls = hostileStorage();
    const ctx = { localStorage: ls }; vm.createContext(ctx);
    vm.runInContext(line, ctx);
    check('after boot, no gifos_blur key is left on the device', ls.getItem('gifos_blur') === null);
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed — everyone joins Max-blurred');
process.exit(failures ? 1 : 0);
