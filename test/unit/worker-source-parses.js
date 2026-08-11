// worker-source-parses.js — every WORKER SOURCE STRING in the site must be
// valid JavaScript.
//
// WHY THIS EXISTS, and it is a paid-for lesson (2026-08-10). mesh-pipe.js keeps
// its whole worker in a template literal (`const WORKER_SRC = \`…\``), because a
// Worker needs a URL and a Blob is the only same-origin one available. That
// string is INVISIBLE to every check we run:
//
//   * `node --check` parses the FILE, and the worker is a string inside it —
//     broken JS in there parses fine and fails at runtime, inside a Worker,
//     where the failure surfaces as "the encoded-passthrough lane is silently
//     off" rather than as an error anyone sees.
//   * worse, a stray BACKTICK in a comment inside that literal ends the string
//     early and breaks the whole module. That is exactly what happened: a
//     comment-only commit wrote `wrote` with backticks inside WORKER_SRC and
//     shipped mesh-pipe.js as a syntax error, on main, for twenty minutes.
//     The commit changed no behaviour and so was pushed without re-running
//     anything — which is precisely the change most likely to skip a test.
//
// So: find every worker-source string in site/js, parse it as real JavaScript,
// and fail loudly if one is missing (a rename must not make this guard vacuous).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', '..', 'site');
let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

// file -> the const names whose template-literal value must be valid JS.
const SOURCES = [
  { file: 'js/mesh-pipe.js', names: ['WORKER_SRC'] },
];

for (const spec of SOURCES) {
  const full = path.join(SITE, spec.file);
  const src = fs.readFileSync(full, 'utf8');

  // The file itself must parse. A backtick escaping its literal usually breaks
  // this first, so it is the cheapest signal and worth asserting separately.
  let fileOk = true, fileErr = null;
  try { new vm.Script(src, { filename: full }); } catch (e) { fileOk = false; fileErr = String(e.message).slice(0, 160); }
  check(spec.file + ' parses as JavaScript', fileOk, fileOk ? undefined : { err: fileErr });

  for (const name of spec.names) {
    const re = new RegExp('const\\s+' + name + '\\s*=\\s*`([\\s\\S]*?)`;');
    const m = src.match(re);
    // NOT FOUND is a FAILURE, never a skip: a renamed constant would otherwise
    // silently retire this guard, which is the rot CLAUDE.md names.
    check(spec.file + ': ' + name + ' was found (the guard is not vacuous)', !!m,
      m ? { lines: m[1].split('\n').length } : { why: 'no template literal assigned to ' + name + ' — was it renamed? Update SOURCES.' });
    if (!m) continue;
    let ok = true, err = null;
    try { new vm.Script(m[1], { filename: full + ' :: ' + name }); } catch (e) { ok = false; err = String(e.message).slice(0, 160); }
    check(spec.file + ': ' + name + ' is valid JavaScript (the worker actually runs)', ok, ok ? undefined : { err });
    // A backtick or ${ inside the literal ends or interpolates it. Both are
    // legal JS in general and always a mistake here — the worker body is
    // authored as plain source, and nothing in it wants page-side substitution.
    check(spec.file + ': ' + name + ' contains no backtick or ${ (they would terminate the literal)',
      m[1].indexOf('`') < 0 && m[1].indexOf('${') < 0,
      { backtick: m[1].indexOf('`'), interp: m[1].indexOf('${') });
  }
}

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
