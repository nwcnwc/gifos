// EVERY CHANNEL LOADER IS THE SAME LOADER, AND EVERY ONE OF THEM IS TESTED.
//
// The channel loader is the first code a visitor runs: it decides whether this
// page stays on the edge build or hands the visitor to /versions/<x.y.z>/. Four
// entry pages ship it, each comment claiming it is "identical across the entry
// pages" — and sign.html's copy was NOT. It was an older shape with no
// window.gifosPinTarget hook (so nothing could call it), no pretty-path
// translation, and no pin-vs-current comparison. Nothing tested it, because the
// only page list in the repo was hand-written and named index/boot/run.
//
// That is the rot pattern the release-gate doctrine names: a guard that iterates
// a hand-written list guards exactly the things somebody remembered. So this
// file DISCOVERS the loaders by scanning site/*.html, refuses to let the set
// change without a deliberate edit, pins that their pinTarget() bodies are
// byte-identical, and then EXECUTES each page's own copy and checks its
// decisions. A fifth entry page with a divergent loader fails here on the day
// it is written, not on the day a stranger's link dies.
//
// (Frozen /versions/ snapshots are out of scope by design — they ship whatever
// loader they were cut with and are never edited.)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();
const inlineScripts = (s) => (s.match(/<script(?![^>]*src=)(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g) || [])
  .map((b) => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));

const loaderOf = (file) => {
  const s = fs.readFileSync(path.join(SITE, file), 'utf8');
  // A loader is the thing that DECIDES the channel (pinTarget). Touching the
  // keys is not enough: 404.html clears a retired pin and is not a loader.
  return inlineScripts(s).find((b) => /function pinTarget\(/.test(b)) || null;
};

// ---- 1. WHO ships a loader is a deliberate list, discovered not remembered ---
const withLoader = pages.filter((p) => loaderOf(p));
check('exactly the four entry pages ship a channel loader',
  withLoader.join(',') === 'boot.html,index.html,run.html,sign.html', withLoader);
// The recorded exception, with its reason, so nobody "fixes" it back: a release
// user's loader would send them to /versions/<current>/store.html, and every
// snapshot cut before the store existed 404s there.
check('store.html deliberately ships NO channel loader (it is served from the root for everyone)',
  !loaderOf('store.html'));

// ---- 2. one loader, copied — not four that drifted --------------------------
const bodyOf = (file) => {
  const s = fs.readFileSync(path.join(SITE, file), 'utf8');
  const i = s.indexOf('function pinTarget'), j = s.indexOf('window.gifosPinTarget');
  return (i === -1 || j === -1 || j < i) ? null : s.slice(i, j);
};
const bodies = withLoader.map((p) => [p, bodyOf(p)]);
check('every loader page exposes window.gifosPinTarget (a loader nothing can call is a loader nothing can test)',
  bodies.every(([, b]) => b !== null), bodies.filter(([, b]) => !b).map(([p]) => p));
const distinct = [...new Set(bodies.map(([, b]) => b))];
check('every pinTarget() is byte-identical — "identical across the entry pages" is mechanical, not a claim',
  distinct.length === 1, withLoader);

// ---- 3. and each page's OWN copy makes the right decisions ------------------
// A source comparison alone would pass four identically-wrong loaders. Run them.
function runLoader(file, { pathname, hash, search, hostname, store }) {
  const src = loaderOf(file);
  const ls = Object.assign({}, store || {});
  const location = {
    pathname, hash: hash || '', search: search || '', hostname, origin: 'https://' + hostname,
    replace: (u) => { location.__replaced = u; },
  };
  const win = {
    location,
    localStorage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; },
    },
    URLSearchParams, XMLHttpRequest: function () { throw new Error('offline'); },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: file });
  // A page with no hook must still produce READABLE reds for every decision
  // below rather than a stack trace — an exception mid-file leaves the rest of
  // the suite un-run, which is the "exits non-zero having asserted nothing"
  // state the release gate treats as the most dangerous of all.
  const missing = () => ({ __noHook: true });
  return { pinTarget: typeof win.gifosPinTarget === 'function' ? win.gifosPinTarget : missing, replaced: location.__replaced, store: ls };
}

const HOST = 'gifos.app';
for (const file of withLoader) {
  const at = (o) => runLoader(file, Object.assign({ pathname: '/', hostname: HOST }, o));

  // A snapshot never redirects again — otherwise a pinned build loops forever.
  {
    const r = at({ pathname: '/versions/0.9.4/' + file, store: { gifos_pin: '0.9.1' } });
    check(file + ': a /versions/ page never redirects',
      r.pinTarget('/versions/0.9.4/' + file, '', '') === null && !r.replaced);
  }
  // A pin carries the PAGE and its hash across — the whole point of `here`.
  {
    const r = at({ store: { gifos_pin: '0.9.4' } });
    const d = r.pinTarget('/' + file, '', '#k=abc');
    check(file + ': a pin redirects to the same page on the pinned build, hash intact',
      !!d && d.redirect === '/versions/0.9.4/' + file + '#k=abc', d);
  }
  // Pretty router paths are TRANSLATED, never decorated: /versions/<v>/meet/<room>
  // exists nowhere, and prepending it drops the invite silently. sign.html's old
  // loader did exactly that.
  {
    const r = at({ store: { gifos_current: '0.9.4' } });
    check(file + ': a pretty /meet/<room> path is translated, not decorated',
      (r.pinTarget('/meet/skylark', '', '') || {}).redirect === '/versions/0.9.4/run.html#v=skylark');
    check(file + ': a pretty /join/<code> path is translated too',
      (r.pinTarget('/join/tumbleweed', '', '') || {}).redirect === '/versions/0.9.4/run.html#j=tumbleweed');
  }
  // ?edge opts into the root build and STAYS there.
  {
    const r = at({});
    const d = r.pinTarget('/' + file, '?edge', '');
    check(file + ': ?edge opts into the root build and stays', !d || !d.redirect, d);
    check(file + ': …and it is remembered', r.store.gifos_channel === 'edge');
  }
  // Local dev / preview hosts are the build you are editing — never redirect.
  {
    const r = runLoader(file, { pathname: '/' + file, hostname: '127.0.0.1', store: { gifos_current: '0.9.4' } });
    const d = r.pinTarget('/' + file, '', '');
    check(file + ': a non-prod host stays on the build it was served from', !d || !d.redirect, d);
  }
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
