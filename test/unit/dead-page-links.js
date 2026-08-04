// Every page the shipped site links to must EXIST at the site root.
//
// The bug this guards: the one-runtime flag day deleted `run.html`, but
// `runtime.js buildJoinUrl` still handed out `/run.html#s=…` and `/run.html#j=…`
// as its non-prod fallback. That was not a local-dev wart — the `onProd` test
// also requires the DEFAULT relay, so a user on gifos.app with a CUSTOM RELAY
// took the fallback branch and shared an invite link that 404s. The same stale
// name simultaneously broke `scripts/archive-version.sh`, which could not cut a
// release at all because it copied a file that was gone.
//
// A deleted page leaves no compile error and no runtime error until a real user
// clicks a real link, so scan for it: collect every `<name>.html` that appears
// in a URL-shaped position in the shipped site, and require the file.
//
// Deliberately NOT flagged: prose. Comments and docs discuss `run.html`'s
// history legitimately; only a reference that a browser would FETCH counts.
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', '..', 'site');

let failures = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) failures++; };

// The shipped surface: root pages + the JS they load. NOT versions/ (frozen
// snapshots are time capsules — a 0.8.4 snapshot legitimately links to the
// run.html that existed when it was cut, and rewriting one is forbidden).
function shippedFiles() {
  const out = [];
  for (const f of fs.readdirSync(SITE)) {
    if (f.endsWith('.html')) out.push(path.join(SITE, f));
  }
  const js = path.join(SITE, 'js');
  for (const f of fs.readdirSync(js)) {
    if (f.endsWith('.js')) out.push(path.join(js, f));
  }
  return out;
}

// URL-shaped only: the name must be quoted as a path, or carry a hash/query, or
// sit in an href/src. A bare mention inside a sentence is not a link.
const URLISH = [
  /['"`](?:\.{0,2}\/)?([a-z0-9-]+)\.html(?=[#?'"`])/gi,  // '/run.html#…'  "run.html"
  /(?:href|src)\s*=\s*['"`](?:\.{0,2}\/)?([a-z0-9-]+)\.html/gi,
  /\/([a-z0-9-]+)\.html[#?]/gi,                          // /run.html#s=…  in a template
];

const rootPages = new Set(fs.readdirSync(SITE).filter((f) => f.endsWith('.html')));
const dead = new Map(); // page -> [locations]

for (const file of shippedFiles()) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (const re of URLISH) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const page = m[1].toLowerCase() + '.html';
      if (rootPages.has(page)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const where = path.relative(SITE, file) + ':' + line + '  ' + lines[line - 1].trim().slice(0, 90);
      if (!dead.has(page)) dead.set(page, []);
      if (!dead.get(page).includes(where)) dead.get(page).push(where);
    }
  }
}

check('the scan found the shipped site (root pages present)',
  rootPages.has('index.html') && rootPages.has('run.html'));
// If the corpus is empty the scan proves nothing — assert it actually read code.
check('the scan read the shipped JS', shippedFiles().filter((f) => f.endsWith('.js')).length > 5);

if (dead.size) {
  for (const [page, where] of dead) {
    console.log('FAIL — site links to ' + page + ', which does not exist at the site root:');
    for (const w of where) console.log('         ' + w);
    failures++;
  }
} else {
  check('every .html the shipped site links to exists at the site root', true);
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
