// ONE FULLSCREEN TOGGLE, WIRED INTO EVERY BAR THAT HAS ONE.
//
// The Home Screen menubar (index.html / boot.html) and the app bar in run.html
// both carry the toggle. They are the same control, so this pins that they are
// the same code (site/js/gifos-fullscreen.js) rather than two hand-rolled
// copies that drift on the details that actually matter:
//
//   - the button is HIDDEN unless the browser really has element fullscreen.
//     iPhone Safari has none (only video's own webkitEnterFullscreen), and a
//     control that silently does nothing is worse than no control. It is also
//     why the markup ships display:none and the module reveals it: a page whose
//     module failed to load shows no dead button either.
//   - the glyph is painted from document.fullscreenElement, never from a
//     boolean the button keeps. Esc, the browser's own affordance and another
//     element grabbing the screen all change fullscreen WITHOUT passing through
//     the click handler, and a toggle that lies about the current mode is the
//     whole bug class here.
//   - a version number never enters into it: site/browser-support.json is the
//     only place cutoffs live (CLAUDE.md, "Browser support is DATA").
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// ---- the markup: every bar that has a toggle has THE toggle ----------------
const SRC = 'js/gifos-fullscreen.js';
const bars = [
  { page: 'index.html', id: 'fs-btn', bar: /<div class="menubar">[\s\S]*?<\/div>/ },
  { page: 'boot.html', id: 'fs-btn', bar: /<div class="menubar">[\s\S]*?<\/div>/ },
  { page: 'run.html', id: 'appfull', bar: /<div id="appbar">[\s\S]*?<\/div>/ },
];
for (const b of bars) {
  const html = fs.readFileSync(path.join(SITE, b.page), 'utf8');
  const bar = (b.bar.exec(html) || [''])[0];
  const btn = (new RegExp('<button[^>]*id="' + b.id + '"[^>]*>').exec(bar) || [''])[0];
  check(b.page + ': the bar carries the fullscreen toggle', !!btn);
  check(b.page + ': …shipped hidden, for the module to reveal', /style="display:none"/.test(btn));
  check(b.page + ': …and it says what it is to a screen reader', /aria-label="Full screen"/.test(btn));
  check(b.page + ': loads the one implementation', html.includes(SRC));
  // PLACEMENT IS THE ASK, not an accident: the toggle sits in the bar's far
  // right corner, last past the named actions, so the Home Screen and the app
  // bar put it in the same place on screen. A later edit that inserts a button
  // after it moves the control the user reaches for without meaning to.
  if (b.id === 'fs-btn') {
    const tags = bar.match(/<button[^>]*id="([a-z-]+)"/g) || [];
    check(b.page + ': …in the far right corner, last in the bar',
      /id="fs-btn"/.test(tags[tags.length - 1] || ''), tags.length + ' buttons');
  }
  check(b.page + ': wires it through GifOS.fullscreen.attach, hand-rolling nothing',
    b.page === 'run.html'
      ? /GifOS\.fullscreen\.attach\(document\.getElementById\('appfull'\)/.test(html)
      : /GifOS\.fullscreen\.attach\(document\.getElementById\('fs-btn'\)/.test(
          fs.readFileSync(path.join(SITE, 'js', 'desktop.js'), 'utf8')));
}
// Every page that ships the desktop ships the toggle — the same "no page gets
// forgotten" scan e2e-icon-lock.js runs for the arrange bar.
const deskPages = fs.readdirSync(SITE).filter((f) => /^[a-z0-9-]+\.html$/.test(f))
  .filter((f) => fs.readFileSync(path.join(SITE, f), 'utf8').includes('js/desktop.js'));
check('every desktop page carries the toggle and the module',
  deskPages.length >= 2 && deskPages.every((f) => {
    const h = fs.readFileSync(path.join(SITE, f), 'utf8');
    return h.includes('id="fs-btn"') && h.includes(SRC);
  }), deskPages.join(', '));

const mod = fs.readFileSync(path.join(SITE, 'js', 'gifos-fullscreen.js'), 'utf8');
check('the glyph lives in the module, not copied into a page',
  !bars.some((b) => /<svg[^>]*class="fs-glyph"/.test(fs.readFileSync(path.join(SITE, b.page), 'utf8'))));
check('support is decided by feature detection — no user-agent sniff, no version compare',
  !/navigator\s*\.\s*(userAgent|platform|vendor)/.test(mod)
  && /fullscreenEnabled/.test(mod) && /requestFullscreen/.test(mod));

// ---- the behaviour, on a document small enough to reason about -------------
function fakeDoc(opts) {
  const listeners = {};
  const mk = () => ({
    style: {}, dataset: {}, attrs: {}, innerHTML: '', title: '', classes: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    classList: { toggle(c, on) { mk.last = on; } },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
  });
  const doc = {
    documentElement: null, fullscreenElement: null, calls: [],
    fullscreenEnabled: opts.enabled,
    exitFullscreen() { doc.calls.push('exit'); doc.fullscreenElement = null; return Promise.resolve(); },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    fire(t) { for (const fn of listeners[t] || []) fn(); },
  };
  const el = (name) => {
    const e = mk();
    e.name = name;
    e.classList = { toggle: (c, on) => { e.on = on; } };
    e.requestFullscreen = opts.enabled ? function () { doc.calls.push('enter:' + name); doc.fullscreenElement = e; return Promise.resolve(); } : undefined;
    return e;
  };
  doc.documentElement = el('root');
  doc.listeners = listeners;
  doc.el = el;
  return doc;
}
function loadModule(doc) {
  const root = { document: doc };
  const src = mod.replace(/\(typeof window !== 'undefined' \? window : globalThis\)/, '(arguments[0])');
  new Function('m', 'return (function(){' + src.replace('})(arguments[0]);', '})(m);') + '})()')(root);
  return root.GifOS.fullscreen;
}

// (a) no fullscreen in this browser → the button is not offered at all
{
  const doc = fakeDoc({ enabled: false });
  const F = loadModule(doc);
  const btn = doc.el('btn');
  check('a browser with no element fullscreen reports unsupported', F.supported() === false);
  F.attach(btn, doc.documentElement);
  check('…so the toggle stays hidden', btn.style.display === 'none' && btn.dataset.fsUnsupported === '1');
  check('…and no click handler was wired to do nothing', !(doc.listeners.click || []).length && !btn.attrs['aria-pressed']);
}
// (b) the ordinary case: reveal, enter, paint from the document, leave
{
  const doc = fakeDoc({ enabled: true });
  const F = loadModule(doc);
  const btn = doc.el('btn');
  btn.style.display = 'none';
  const clicks = [];
  btn.addEventListener = (t, fn) => { if (t === 'click') clicks.push(fn); };
  F.attach(btn, doc.documentElement);
  check('a browser that has it reveals the toggle', btn.style.display === '');
  check('…starting unpressed, with the enter label', btn.attrs['aria-pressed'] === 'false' && btn.title === 'Full screen');
  check('…and the enter glyph, drawn by the module', /class="fs-glyph"/.test(btn.innerHTML));
  const before = btn.innerHTML;
  clicks[0]({ preventDefault() {} });
  doc.fire('fullscreenchange');
  check('a click takes the target fullscreen', doc.calls.join(',') === 'enter:root', doc.calls.join(','));
  check('…and the button repaints as pressed, saying how to get out',
    btn.attrs['aria-pressed'] === 'true' && btn.title === 'Leave full screen' && btn.innerHTML !== before);
  // THE POINT OF PAINTING FROM THE DOCUMENT: Esc never touches our handler.
  doc.fullscreenElement = null;
  doc.fire('fullscreenchange');
  check('Esc (no click at all) still puts the button back', btn.attrs['aria-pressed'] === 'false' && btn.innerHTML === before);
}
// (c) toggling while ANOTHER element owns the screen is a switch, not a leave
{
  const doc = fakeDoc({ enabled: true });
  const F = loadModule(doc);
  const pane = doc.el('pane');
  const other = doc.el('video');
  doc.fullscreenElement = other;
  return F.toggle(pane).then(() => {
    check('taking the screen from another element exits it first',
      doc.calls.join(',') === 'exit,enter:pane', doc.calls.join(','));
    check('…and toggling the element that HAS it just leaves', (() => {
      doc.calls.length = 0; doc.fullscreenElement = pane;
      F.toggle(pane);
      return doc.calls.join(',') === 'exit';
    })());
    done();
  });
}
function done() {
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
}
