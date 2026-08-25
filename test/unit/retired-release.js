// A RETIRED RELEASE BOUNCES ONCE — IT NEVER LOOPS, AND IT NEVER STRANDS.
//
// Old snapshots under site/versions/ get pruned (the 0.8.x line went on
// 2026-08-25). A visitor whose localStorage still names one — gifos_pin, or
// gifos_current, the last-known release every default visitor redirects on
// without re-reading version.json — used to loop forever: / → loader →
// /versions/<v>/ → 404.html → / → … This runs 404.html's router in a vm with
// a fake location/localStorage/XHR and holds the three outcomes:
//   - build gone       → pin + current cleared, gifos_gone=<v>, ONE hop home
//                        carrying the page and the hash
//   - build alive, page missing → that build's own index.html (the pin stays)
//   - not a /versions/ path → untouched by this branch
// and keeps version.json honest about what is actually on disk.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const html = fs.readFileSync(path.join(SITE, '404.html'), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

function run(pathname, opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const ctx = {
    location: { pathname, search: opts.search || '', hash: opts.hash || '', replace(u) { ctx.__to = u; } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    XMLHttpRequest: function () { this.open = (m, u) => { this.__u = u; }; this.send = () => { this.status = opts.alive ? 200 : 404; }; },
    Date, encodeURIComponent, decodeURIComponent, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { to: ctx.__to, store };
}

// build gone
let r = run('/versions/0.8.4/index.html', { storage: { gifos_pin: '0.8.4', gifos_current: '0.8.4', gifos_channel: 'x' } });
check('a retired build clears the pin and the last-known current', !('gifos_pin' in r.store) && !('gifos_current' in r.store), JSON.stringify(r.store));
check('…remembers WHICH build went away for the desktop notice', r.store.gifos_gone === '0.8.4');
check('…leaves unrelated keys alone', r.store.gifos_channel === 'x');
check('…and goes home ONCE, to the same page', r.to === '/index.html', r.to);
r = run('/versions/0.8.4/run.html', { hash: '#id=file_abc&db=t' });
check('a run.html#id=… link keeps its page and hash (the app still opens, on the live build)', r.to === '/run.html#id=file_abc&db=t', r.to);
r = run('/versions/0.8.4/', {});
check('a bare /versions/<v>/ goes to /', r.to === '/', r.to);
r = run('/versions/0.8.4/js/x.js', {});
check('a non-page path under a retired build goes home, never to a made-up page', r.to === '/', r.to);
// build alive, page missing
r = run('/versions/0.9.3/store.html', { alive: true, storage: { gifos_pin: '0.9.3' }, hash: '#app=x' });
check('a live build with a missing page → that build\'s own desktop', r.to === '/versions/0.9.3/index.html#app=x', r.to);
check('…and the pin is NOT touched', r.store.gifos_pin === '0.9.3' && !r.store.gifos_gone);
// untouched paths
r = run('/store/anyroad', {});
check('/store/<slug> still routes to the store', /^\/store\.html#app=anyroad/.test(r.to), r.to);
check('the probe HEADs the snapshot\'s build.js', /open\('HEAD', '\/versions\/' \+ rv\[1\] \+ '\/js\/build\.js/.test(script));

// the desktop says it, once
const desktop = fs.readFileSync(path.join(SITE, 'js', 'desktop.js'), 'utf8');
check('desktop.js reads gifos_gone on boot and clears it', /localStorage\.getItem\('gifos_gone'\)[\s\S]{0,80}removeItem\('gifos_gone'\)/.test(desktop));
check('…before the run/place handlers (a notice must not sit behind an app launch)', desktop.indexOf('.then(noteRetiredBuild).then(handleRunParam)') !== -1);

// version.json is the truth about the disk
const vj = JSON.parse(fs.readFileSync(path.join(SITE, 'version.json'), 'utf8'));
const dirs = fs.readdirSync(path.join(SITE, 'versions')).filter((d) => /^\d+\.\d+\.\d+$/.test(d));
check('version.json.versions lists exactly the snapshots on disk', vj.versions.slice().sort().join() === dirs.slice().sort().join(), vj.versions.length + ' vs ' + dirs.length);
check('current is shipped', dirs.includes(vj.current), vj.current);
check('minData is the oldest shipped build', vj.minData === vj.versions[vj.versions.length - 1], vj.minData);
check('builds names only shipped releases', Object.keys(vj.builds).every((v) => dirs.includes(v)));
check('no pre-0.9 snapshot remains (retired 2026-08-25)', dirs.every((d) => !/^0\.[0-8]\./.test(d)), dirs.join(','));
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
