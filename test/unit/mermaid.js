// MERMAID HAS TO DRAW A FIXTURE, AND A BAD LINE MUST NOT WIPE THE LAST GOOD PICTURE.
//
// The loop is textarea → mermaid.render → SVG. This suite plays that loop in a
// vm with a stub engine (the real UMD needs a browser DOM), then source-scans
// the shell for the phone tabs, empty state, and file-is-the-save.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'mermaid');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const FIXTURE = 'flowchart TD\n  A[Start] --> B{Edit me}\n  B -->|Yes| C[Nice]';
const BAD = 'flowchart TD\n  A -->';

function el(id, extra) {
  const e = Object.assign({
    id: id,
    value: '',
    innerHTML: '',
    textContent: '',
    hidden: true,
    className: '',
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    _l: {},
    addEventListener: function (ev, fn) { this._l[ev] = fn; },
    setAttribute: function () {},
    getAttribute: function () { return null; },
    focus: function () {}
  }, extra || {});
  return e;
}

function loadApp() {
  const nodes = {
    src: el('src'),
    view: el('view'),
    err: el('err'),
    sampleBtn: el('sampleBtn'),
    kind: el('kind', { value: 'flowchart' }),
    copyBtn: el('copyBtn'),
    tabSrc: el('tabSrc'),
    tabPic: el('tabPic'),
    shareBtn: el('shareBtn'),
    leaveBtn: el('leaveBtn'),
    'friend-bar': el('friend-bar'),
    'friend-status': el('friend-status'),
    'friend-scores': el('friend-scores')
  };
  const body = { classList: { toggle: function () {}, add: function () {}, remove: function () {} } };
  let rendered = [];
  const mermaid = {
    initialize: function (opts) { this.opts = opts; },
    render: function (id, text) {
      rendered.push({ id: id, text: text });
      if (!String(text).trim()) return Promise.reject(new Error('Empty'));
      if (/-->\s*$/.test(String(text).trim())) {
        return Promise.reject(new Error('Parse error on line 2:\nUnexpected end'));
      }
      return Promise.resolve({ svg: '<svg data-id="' + id + '">' + String(text).slice(0, 24) + '</svg>' });
    }
  };
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise, setTimeout, clearTimeout,
    document: {
      getElementById: function (id) { return nodes[id] || null; },
      body: body,
      createElement: function (tag) { return el(tag); }
    },
    window: null,
    mermaid: mermaid,
    gifos: null,
    navigator: { clipboard: null }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return { sandbox, nodes, mermaid, rendered };
}

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

(async function main() {
  const { sandbox, nodes, mermaid, rendered } = loadApp();
  check('app.js loads and attaches MMApp', !!(sandbox.MMApp && sandbox.MMApp.draw && sandbox.MMApp.tidyError));
  check('first boot draws the flowchart fixture', rendered.length >= 1 && /flowchart TD/.test(rendered[0].text), rendered[0] && rendered[0].text);
  await flush();
  check('first boot paints an SVG', /<svg/.test(nodes.view.innerHTML), nodes.view.innerHTML.slice(0, 80));

  nodes.src.value = FIXTURE;
  sandbox.MMApp.draw();
  await flush();
  check('mermaid.render of a flowchart fixture returns SVG into #view', /<svg/.test(nodes.view.innerHTML) && nodes.view.innerHTML.indexOf('flowchart') >= 0);
  const good = nodes.view.innerHTML;

  nodes.src.value = BAD;
  sandbox.MMApp.draw();
  await flush();
  check('bad syntax shows a short parse error', /Parse error on line 2/.test(nodes.err.textContent), nodes.err.textContent);
  check('bad syntax keeps the last good picture', nodes.view.innerHTML === good, nodes.view.innerHTML.slice(0, 60));

  nodes.src.value = '   ';
  sandbox.MMApp.draw();
  await flush();
  check('empty text is a hint, not a parser dump', /Type a flowchart/.test(nodes.view.innerHTML) && nodes.err.hidden);

  const long = sandbox.MMApp.tidyError({ message: 'Error: ' + 'x'.repeat(400) });
  check('tidyError caps a long dump', long.length <= 181, long.length);

  check('initialize turns htmlLabels off', mermaid.opts && mermaid.opts.flowchart && mermaid.opts.flowchart.htmlLabels === false);
  check('samples include flowchart, sequence, class, pie',
    !!(sandbox.MMApp.samples.flowchart && sandbox.MMApp.samples.sequence && sandbox.MMApp.samples.class && sandbox.MMApp.samples.pie));

  // ---- shell (a vm cannot tap these) ----------------------------------------
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const mp = fs.readFileSync(path.join(APP, 'mp.js'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));

  check('phone Recipe/Picture tabs exist', html.includes('tabSrc') && html.includes('tabPic') && css.includes('tab-pic'));
  check('app.js saves the document privately', js.includes("db('save')") && js.includes("id: 'doc'"));
  check('Copy SVG is aboard', html.includes('copyBtn') && js.includes('copySvg'));
  check('bad syntax scrubs mermaid\'s bomb overlay', js.includes('Syntax error in text') && css.includes('error-icon'));
  check('mp.js tells the player to press Invite (OS chrome)', mp.includes('Invite'));
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('no CDN / no type=module', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) && !/type=["']module["']/.test(html));
  check('help.md teaches the loop and the phone tabs', help.includes('Recipe') && help.includes('Picture') && help.includes('flowchart TD'));
  check('help.md does not document Invite/Save', !/\bInvite\b/.test(help) && !/\bSave\b/.test(help));
  check('listing is an unofficial wrap of the engine', /unofficial wrap/i.test(listing.description) && listing.basedOn.name === 'mermaid');
  check('listing leads with the file as the save', /file is the save/i.test(listing.tagline));
  check('listing mentions the phone swap', /Recipe and Picture/i.test(listing.description));

  const vendor = fs.readFileSync(path.join(APP, 'vendor', 'mermaid.min.js'), 'utf8');
  check('vendored mermaid UMD is aboard', vendor.includes('ZM.mermaid=Dg()'));

  if (failures) {
    console.log('\n' + failures + ' failing');
    process.exit(1);
  }
  console.log('\nAll mermaid checks green.');
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
