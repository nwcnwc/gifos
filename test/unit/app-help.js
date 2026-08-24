// OS Help: the app bar button, the markdown dialect, and the GIF file it reads.
//
// Help is OS chrome (run.html #apphelp), not an in-app How-to-play. The
// markdown comes from help.md inside the GIF. This suite pins the contract
// so a refactor cannot drop the button, execute HTML from a GIF, or follow
// a javascript: link.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
require(path.join(ROOT, 'site', 'js', 'gifos-help.js'));
const help = globalThis.GifOS.help;

let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : ''));
  if (!c) failures++;
};

const run = fs.readFileSync(path.join(ROOT, 'site', 'run.html'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'site', 'js', 'runtime.js'), 'utf8');

check('run.html loads gifos-help.js before runtime.js',
  /js\/gifos-help\.js[\s\S]*js\/runtime\.js/.test(run));
check('app bar has Help immediately after Save',
  /id="appsave"[\s\S]{0,280}id="apphelp"/.test(run));
check('app Help modal exists',
  /id="apphelp-modal"/.test(run) && /id="apphelp-body"/.test(run) && /id="apphelp-close"/.test(run));
check('runtime ctl exposes help()',
  /\bhelp:\s*\(\)\s*=>/.test(runtime));
check('GifOS.help attaches read/render/parse',
  typeof help.read === 'function' && typeof help.render === 'function' && typeof help.parse === 'function');

const html = help.render([
  '# Title',
  '',
  'A **bold** and *italic* word, plus `code`.',
  '',
  '## Section',
  '- one',
  '- two',
  '',
  '1. first',
  '2. second',
  '',
  '[safe](https://gifos.app/store/isocity)',
  '[unsafe](javascript:alert(1))',
  '',
  '<script>alert(1)</script>',
  '',
  '```',
  '<img src=x onerror=alert(1)>',
  '```',
].join('\n'));

check('headings render', /<h3>Title<\/h3>/.test(html) && /<h4>Section<\/h4>/.test(html));
check('bold/italic/code render', /<b>bold<\/b>/.test(html) && /<i>italic<\/i>/.test(html) && /<code>code<\/code>/.test(html));
check('lists render', /<ul>/.test(html) && /<ol>/.test(html) && /<li>one<\/li>/.test(html));
check('https links render', /href="https:\/\/gifos\.app\/store\/isocity"/.test(html));
check('javascript: links are NOT hrefs', !/href="javascript:/i.test(html));
check('raw HTML is escaped, never executed',
  html.indexOf('<script>') === -1 && /&lt;script&gt;/.test(html));
check('fenced blocks escape HTML',
  /<pre><code>/.test(html) && html.indexOf('<img') === -1 && /&lt;img/.test(html));

const parsed = help.parse('# 2048\n\nSlide tiles.\n');
check('parse strips the leading h1 into title',
  parsed.title === '2048' && parsed.html.indexOf('2048') === -1 && /Slide tiles/.test(parsed.html));

const files = {
  'help.md': new TextEncoder().encode('# Hi\n\nBody.\n'),
  'other.md': new TextEncoder().encode('nope'),
};
check('read() defaults to help.md', /^\s*# Hi/.test(help.read(files, {})));
check('read() honours manifest.help', help.read(files, { help: 'other.md' }).trim() === 'nope');
check('read() refuses path traversal', help.read(files, { help: '../help.md' }) === '');
check('read() is empty when the file is missing', help.read({}, {}) === '');

check('withOsFooter is on GifOS.help', typeof help.withOsFooter === 'function');
const footed = help.withOsFooter('# Hi\n\nBody.\n');
check('withOsFooter keeps the app\'s own help', /# Hi/.test(footed) && /Body/.test(footed));
check('withOsFooter appends Invite / Save / Steal / Abilities',
  /\*\*Invite\*\*/.test(footed) && /\*\*Save\*\*/.test(footed)
  && /\*\*Steal\*\*/.test(footed) && /\*\*Abilities\*\*/.test(footed));
check('withOsFooter plugs remix: save the GIF, ask an AI, add it back',
  /remix/i.test(footed) && /AI chat/i.test(footed)
  && /Home Screen/.test(footed) && /do not need to know how to code/i.test(footed));
check('an empty help.md still gets the OS footer (and a title)',
  /^# Help/.test(help.withOsFooter('')) && /\*\*Invite\*\*/.test(help.withOsFooter('')));
check('run.html opens Help through withOsFooter, so every screen gets the footer',
  /withOsFooter\(currentAppHelpMd\(\), currentAppCredits\(\)\)/.test(run));

// CREDITS — UNDER THE SEAL, at the VERY BOTTOM. Who made an app is read from
// credits.json INSIDE the GIF (packed + signed by scripts/sign-apps.mjs), never
// from a desktop record; the record adds only WHEN this copy was installed.
const store = fs.readFileSync(path.join(ROOT, 'site', 'js', 'store.js'), 'utf8');
check('readCredits and creditsMd are on GifOS.help',
  typeof help.readCredits === 'function' && typeof help.creditsMd === 'function');
const CREDITS = {
  tagline: 'Two paddles on the ice.',
  author: { name: 'MortimerGoro', url: 'https://github.com/MortimerGoro/AirHockeyWebGL' },
  porter: { name: 'GifOS', url: 'https://gifos.app' },
  basedOn: { name: 'AirHockeyWebGL', url: 'https://github.com/MortimerGoro/AirHockeyWebGL', blessed: false },
  inspiredBy: { name: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', by: { name: 'Someone' } },
  license: 'MIT', copyright: 'Copyright (c) 2015 MortimerGoro',
  homepage: 'https://github.com/nwcnwc/gifos/tree/main/apps/air-hockey', releaseDate: '2026-08-23',
};
const MAN = { name: 'Air Hockey', version: '1.0.0' };
const sealed = help.readCredits({ 'credits.json': JSON.stringify(CREDITS) }, MAN);
check('readCredits merges credits.json with the manifest name/version and marks it sealed',
  sealed && sealed.sealed === true && sealed.name === 'Air Hockey' && sealed.version === '1.0.0'
  && sealed.author.name === 'MortimerGoro' && sealed.porter.name === 'GifOS'
  && sealed.license === 'MIT' && sealed.copyright === 'Copyright (c) 2015 MortimerGoro');
const bare = help.readCredits({ 'help.md': '# x' }, MAN);
check('a GIF with no credits.json credits only its own manifest (name + version), unsealed',
  bare && !bare.sealed && bare.name === 'Air Hockey' && bare.version === '1.0.0' && !bare.author);
check('a broken credits.json falls back to the manifest instead of throwing',
  (() => { const c = help.readCredits({ 'credits.json': '{not json' }, MAN); return c && !c.sealed && c.name === 'Air Hockey'; })());
check('nothing to credit → null', help.readCredits({}, {}) === null);

const META = Object.assign({}, sealed, { installedAt: '2026-08-24T17:40:00.000Z', signedBy: 'gifos.app' });
const credited = help.withOsFooter('# Hi\n\nBody.\n', META);
const creditsAt = credited.indexOf('## Credits');
check('credits render author, porter, basedOn, inspiredBy, license',
  creditsAt !== -1 && /\*\*By\*\* \[MortimerGoro\]\(https:\/\/github\.com\/MortimerGoro\/AirHockeyWebGL\)/.test(credited)
  && /Brought to GifOS by\*\* \[GifOS\]\(https:\/\/gifos\.app\)/.test(credited)
  && /Based on\*\* \[AirHockeyWebGL\]/.test(credited) && /Inspired by\*\* .* by Someone/.test(credited)
  && /License\*\* MIT — Copyright \(c\) 2015 MortimerGoro/.test(credited));
check('credits say they are sealed in the GIF, who signed it, and when this copy was installed',
  /Sealed inside this GIF and signed by \*\*gifos\.app\*\*; installed on this device on 2026-08-24\./.test(credited));
check('credits are the VERY BOTTOM — after the app help AND the OS footer',
  creditsAt > credited.indexOf('## Make it yours') && credited.indexOf('## Make it yours') > credited.indexOf('Body.'));
const creditedHtml = help.render(credited.slice(creditsAt));
check('a listing cannot script the Help modal (HTML escaped, javascript: dropped)',
  creditedHtml.indexOf('<img') === -1 && /&lt;img/.test(creditedHtml) && !/javascript:/i.test(creditedHtml));
check('an unsealed GIF still credits its manifest name + version and says where that came from',
  /\*\*Air Hockey 1\.0\.0\*\*/.test(help.withOsFooter('# Hi', bare)) && /From this GIF.s own manifest\./.test(help.withOsFooter('# Hi', bare)));
check('no credits, no Credits section',
  help.withOsFooter('# Hi\n\nBody.\n').indexOf('## Credits') === -1 && help.withOsFooter('# Hi', null).indexOf('## Credits') === -1);

// The seal rule, mechanically: the desktop record carries WHEN and WHICH, never WHO.
check('store.js install record has installedAt + sha256 and NO author/porter/basedOn fields',
  /function storeSnapshot\(app\)/.test(store) && /installedAt: new Date\(\)\.toISOString\(\)/.test(store) && /sha256: app\.sha256/.test(store)
  && !/author: /.test(store.slice(store.indexOf('function storeSnapshot'), store.indexOf('async function install'))));
check('the store stamps the record on BOTH install paths (fresh install and Update)',
  (store.match(/storeMeta: storeSnapshot\(app\)/g) || []).length === 2);
check('runtime ctl exposes credits() from the sealed files at BOTH mounts (host/solo and guest)',
  (runtime.match(/credits: \(\) => \(GifOS\.help && GifOS\.help\.readCredits\)/g) || []).length === 2);
check('run.html credits from ctl.credits() plus local install facts; a guest gets no local facts',
  /withOsFooter\(currentAppHelpMd\(\), currentAppCredits\(\)\)/.test(run) && /ctl\.credits\(\)/.test(run)
  && (run.match(/appInstall = installFactsOf\(rec\)/g) || []).length === 2 && /appInstall = null;/.test(run)
  && !/storeMeta\.author/.test(run));
check('scripts derive the packed credits from ONE module (signer and catalog check cannot disagree)',
  /from '\.\/app-credits\.mjs'/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'sign-apps.mjs'), 'utf8'))
  && /from '\.\/app-credits\.mjs'/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'build-app-catalog.mjs'), 'utf8')));

console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
process.exit(failures ? 1 : 0);
