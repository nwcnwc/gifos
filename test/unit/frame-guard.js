/*
 * EVERY TRUSTED PAGE CARRIES THE FRAME GUARD.
 *
 * GitHub Pages cannot send X-Frame-Options or a Content-Security-Policy
 * header, and frame-ancestors is ignored inside a <meta> — so nothing stopped
 * a third-party page from framing gifos.app at opacity 0 and steering a tap
 * onto Allow (the Abilities sheet), Install (the store) or Approve (the pay
 * sheet). The guard is a parser-blocking ES5 snippet at the top of <head>
 * that lets same-origin framing through (booted images, app mounts) and
 * replaces any other embedding with a link to open the page itself.
 *
 * This test makes the guard a property of the tree, not of the pages that
 * happen to have it today: a new page under site/ ships it or this goes red.
 * Frozen snapshots under site/versions/ are what they were when cut.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();
check('there are trusted pages to check', pages.length >= 6, pages);

for (const f of pages) {
  const html = fs.readFileSync(path.join(SITE, f), 'utf8');
  const head = html.slice(0, 8192);
  const at = head.indexOf('<script id="gifos-frame-guard">');
  check(f + ' carries the frame guard in its first 8 KB', at >= 0);
  if (at < 0) continue;
  const firstExternal = head.search(/<script[^>]*\ssrc=/i);
  check(f + ': the guard runs before any external script', firstExternal < 0 || at < firstExternal, { guard: at, firstExternal });
  const guard = head.slice(at, head.indexOf('</script>', at));
  check(f + ': the guard lets same-origin framing through', /top\.location\.origin===window\.location\.origin/.test(guard));
  check(f + ': the guard replaces the page rather than trusting the embedder', /removeChild/.test(guard) && /Open it in its own tab/.test(guard));
  check(f + ': the guard is ES5 (no arrow, let, const or template literal)', !/=>|\blet\b|\bconst\b|`/.test(guard));
}

if (failures) { console.log('\n' + failures + ' failure(s)'); process.exit(1); }
console.log('\nall ok');
