// LINKS FOR AI AGENTS ARE STATIC, OFF-SCREEN, AND THE SAME ON EVERY PAGE.
//
// The site's only footer is the JS-painted build badge, which an agent that
// fetches raw HTML never sees. So every page that carries the badge also
// carries a static <nav id="agent-links"> pointing at llms.txt and the rest
// (robots.txt and sitemap.xml already point there for crawlers; this is the
// in-page pointer). Three things this guards:
//   - it is on EVERY badge page, not just the ones someone remembered
//   - it is hidden with the screen-reader CLIP, never display:none or
//     hidden — readability-style extractors drop those before the model
//     ever sees the text, and then the links might as well not exist
//   - all copies are byte-identical (there is no include mechanism, so the
//     seven copies can only stay one text if something checks)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const pages = fs.readdirSync(SITE).filter((f) => /^[a-z0-9-]+\.html$/.test(f))
  .filter((f) => fs.readFileSync(path.join(SITE, f), 'utf8').includes('build-badge.js'));
check('there are badge pages to check', pages.length >= 5, pages.join(', '));
const navs = {};
for (const f of pages) {
  const html = fs.readFileSync(path.join(SITE, f), 'utf8');
  const m = /<nav id="agent-links"[\s\S]*?<\/nav>/.exec(html);
  check(f + ' carries the agent-links nav', !!m);
  if (!m) continue;
  navs[f] = m[0];
  check(f + ': the nav is a static element after the page (not painted by script)', html.indexOf(m[0]) < html.lastIndexOf('</body>'));
  check(f + ': hidden by the screen-reader clip, not display:none / hidden', /clip:rect\(0 0 0 0\)/.test(m[0]) && !/display:\s*none/.test(m[0]) && !/\shidden[\s>]/.test(m[0]));
}
const texts = [...new Set(Object.values(navs))];
check('every copy is byte-identical (' + Object.keys(navs).length + ' pages)', texts.length === 1);
const nav = texts[0] || '';
check('it links llms.txt', /href="https:\/\/gifos\.app\/llms\.txt"/.test(nav));
check('it links the machine-readable catalog', /href="https:\/\/gifos\.app\/apps\/index\.json"/.test(nav));
check('it names the one-tap run link', /gifos\.app\/\?run=/.test(nav));
check('it links the source and the issue form', /github\.com\/nwcnwc\/gifos"/.test(nav) && /issues\/new/.test(nav));
check('every href is absolute https (a snapshot under /versions/ must still point at the live site)',
  (nav.match(/href="([^"]+)"/g) || []).every((h) => /^href="https:\/\//.test(h)));
// The crawler side, which this nav complements rather than replaces.
const robots = fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
check('robots.txt still points AI assistants at llms.txt', /llms\.txt/.test(robots));
check('sitemap.xml still lists llms.txt', /gifos\.app\/llms\.txt/.test(sitemap));
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
