// DUPLICATE KEYS IN THE DEBUG API ARE SILENT DELETIONS.
//
// `window.__gifosVideo` is one object literal ~400 keys long that every suite
// in the repo reads and that a dozen sessions have appended to. JavaScript
// says nothing about a repeated key: the LAST one wins and the earlier one is
// gone. Not overridden loudly — gone, with every field it carried returning
// `undefined` to callers that have read it for months.
//
// That is not hypothetical. 31b7617 appended a second `pwState:` (the §LOCK
// forensics fields) 240 lines below the existing `pwState:` (the grant-heal
// fields). The password work itself was correct and the product was never
// broken, but `pwState().epoch` and `.rekeyAt` became `undefined` for every
// caller, and the release gate's drills/e2e-pw-heal went RED reading
// `ep1 >= 1` as false — 22 seconds in, on a check about the grant flood, which
// pointed the investigation at exactly the wrong place.
//
// A behavioral test cannot guard this class in general: it can only pin the
// fields it happens to read, and the next casualty will be some other field.
// So the guard is MECHANICAL and reads the source — every debug-API literal
// this site ships, no duplicates, ever.
//
// The scanner below is tokenizer-grade on purpose (strings, template literals,
// regex literals and comments all contain characters that a naive scan would
// read as structure) and it SELF-TESTS against fixtures before it is trusted:
// a scanner that silently stops finding keys is the same failure mode as the
// bug it is here to catch.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  ' + d : '')); if (!c) failures++; };

// ---- the scanner ------------------------------------------------------------
// From the `{` at `start`, walk to its matching `}` and return the source text
// that sits at NESTING DEPTH 1 — i.e. the literal's own members, with every
// string, comment, regex and nested {} [] () construct replaced by a space.
// Braces, brackets and parens all count as nesting, so a `key:` buried in an
// argument list or an arrow body can never be mistaken for a member.
function depth1(src, start) {
  let out = '', d = 0, i = start;
  // A `/` starts a REGEX rather than a division when the previous meaningful
  // character cannot end an expression. This is the standard heuristic and it
  // is exact for the shapes that occur here (`x.replace(/…/)`, `(/…/).test`).
  let prev = '';
  const emit = (ch) => { if (d === 1) out += ch; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; emit(' '); continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; emit(' '); continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, body = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { body += src[j + 1] || ''; j += 2; } else body += src[j++]; }
      // a STRING KEY ('foo': 1) is a real key — keep it quoted so the key regex sees it
      emit('"' + body.replace(/[^\w$.-]/g, '') + '"');
      i = j + 1; prev = '"'; continue;
    }
    if (c === '`') { // template literal, incl. ${ } which may itself contain anything
      let j = i + 1, nest = 0;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (nest === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') { nest++; j += 2; continue; }
        if (nest > 0 && src[j] === '}') nest--;
        j++;
      }
      emit(' '); i = j + 1; prev = '`'; continue;
    }
    if (c === '/' && !/[\w$)\]]/.test(prev)) { // regex literal
      let j = i + 1, cls = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        else if (src[j] === '\n') break; // not a regex after all; bail rather than run away
        j++;
      }
      emit(' '); i = j + 1; prev = '/'; continue;
    }
    if (c === '{' || c === '[' || c === '(') { d++; if (d === 1) out += ' '; else emit(' '); i++; prev = c; continue; }
    if (c === '}' || c === ']' || c === ')') { emit(' '); d--; if (d === 0) return out; i++; prev = c; continue; }
    emit(c);
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out; // unbalanced — the caller's key list will be short, which self-test catches
}

// Members of a literal: `ident:` / `'str':` / `"str":` immediately after the
// opening brace or a comma. Anything else at depth 1 (a ternary's `:`, a
// label) is not preceded by one of those two, and is not counted.
function keysOf(src, braceIdx) {
  const body = depth1(src, braceIdx);
  const out = [];
  const re = /(?:^|,)\s*(?:([A-Za-z_$][\w$]*)|"([\w$.-]*)")\s*:/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

// ---- SELF-TEST: the scanner is only evidence if it can be shown to work -----
// Each fixture hides a would-be key somewhere the scanner must NOT look, and
// the dup fixture hides the real duplicate somewhere it MUST.
const fxOk = "{ a: 1, b: 'x: {, y:', c: /a:{[)]/.test(s), d: (p) => ({ a: 9, b: 8 }), /* e: 0 */ e: `t:${ { a: 1 } }`, // f: 0\n f: [{ a: 1 }], 'g-1': 2 }";
const okKeys = keysOf(fxOk, 0);
check('self-test: the scanner reads a literal past strings, regex, comments, templates and nesting',
  okKeys.join(',') === 'a,b,c,d,e,f,g-1', okKeys.join(','));
const fxDup = "{ a: 1, b: () => ({ a: 2, z: 3 }), c: 'a: 4', a: 5 }";
const dupKeys = keysOf(fxDup, 0);
check('self-test: the scanner CATCHES a real duplicate (and only the real one)',
  dupKeys.join(',') === 'a,b,c,a', dupKeys.join(','));

// ---- the real thing ---------------------------------------------------------
// Discover the debug APIs mechanically rather than listing them: a new
// `window.__gifosX = {` on any shipped page is covered the day it lands.
// ROOT ONLY, deliberately: site/versions/<x.y.z>/ are FROZEN archived builds
// and may not be edited, so a red there would be unfixable by construction.
// (Checked when this landed: no snapshot through 0.9.4 carries the duplicate —
// it lived only on edge, between 31b7617 and this commit.)
const PAGES = [];
for (const dir of ['site', path.join('site', 'js')]) {
  const abs = path.join(ROOT, dir);
  for (const f of fs.readdirSync(abs)) {
    if (/\.(html|js)$/.test(f) && fs.statSync(path.join(abs, f)).isFile()) PAGES.push(path.join(dir, f));
  }
}
let literals = 0;
for (const rel of PAGES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const re = /window\.__gifos([A-Za-z]*)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    literals++;
    const name = '__gifos' + m[1];
    const keys = keysOf(src, src.indexOf('{', m.index + m[0].length - 1));
    const seen = new Set(), dups = [];
    for (const k of keys) { if (seen.has(k)) dups.push(k); else seen.add(k); }
    check(rel + ': ' + name + ' has no duplicate key (' + keys.length + ' keys)',
      dups.length === 0, dups.length ? 'DUPLICATED: ' + dups.join(', ') + ' — the FIRST definition is deleted' : '');
  }
}
// A discovery scan that finds nothing passes vacuously — that is the dead-suite
// failure mode this repo has already paid for once. Pin the floor.
check('the debug-API scan actually found the runtime API', literals >= 1, 'literals=' + literals);

// ---- the specific casualty, named -------------------------------------------
// The class guard above would have caught 31b7617 on its own. This pins the
// REPAIR: both families of pwState fields must live in one literal, because a
// future session's instinct on seeing a crowded key is to "add another".
{
  const src = fs.readFileSync(path.join(ROOT, 'site', 'run.html'), 'utf8');
  const i = src.search(/window\.__gifosVideo\s*=\s*\{/);
  const body = depth1(src, src.indexOf('{', i));
  const m = body.match(/(?:^|,)\s*pwState\s*:([\s\S]*?)(?=,\s*[A-Za-z_$][\w$]*\s*:|$)/);
  const one = m ? m[1] : '';
  // depth1 blanks nested constructs, so read the fields off the source slice.
  const at = src.indexOf('pwState: ()');
  const slice = at < 0 ? '' : src.slice(at, at + 900);
  for (const f of ['epoch', 'rekeyAt', 'havePrevKey', 'haveGrant', 'fromStore', 'probe', 'stored', 'storedAt']) {
    check('pwState carries ' + f + ' (heal + §LOCK fields in ONE object)', new RegExp('\\b' + f + '\\b').test(slice));
  }
  check('there is exactly one pwState key on the video debug API',
    (body.match(/(?:^|,)\s*pwState\s*:/g) || []).length === 1, one ? '' : 'none found');
}

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
