// JSON CRACK HAS TO DRAW A FIXTURE, AND BAD JSON MUST NOT WIPE THE LAST GRAPH.
//
// The loop is paste → parse → toGraph → layout → cards. graph.js is a classic
// IIFE, so this suite loads the shipped source in a vm and PLAYS that loop on
// a real document (the Super hero squad sample). Phone/input rules a vm cannot
// run (pinch, Text/Graph tabs, Back, no CDN) are pinned by source scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'json-crack');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function loadGraph() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error,
    parseInt, isNaN,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'graph.js'), 'utf8'), sandbox, { filename: 'graph.js' });
  return sandbox;
}

for (const f of ['graph.js', 'mp.js', 'app.js']) {
  try {
    new vm.Script(fs.readFileSync(path.join(APP, f), 'utf8'), { filename: f });
    check(f + ' parses as classic JS', true);
  } catch (e) {
    check(f + ' parses as classic JS', false, String(e && e.message || e));
  }
}

const S = loadGraph();
const JC = S.JsonCrack;
check('graph.js attaches JsonCrack', !!(JC && JC.toGraph && JC.layout && JC.parseJson && JC.SAMPLE));

{
  const p = JC.parseJson('');
  check('empty string is empty, not a parse error', !!(p.empty && !p.error));
  check('whitespace-only is empty', !!JC.parseJson('  \n\t  ').empty);
}

{
  const p = JC.parseJson('{');
  check('truncated JSON is an error', !!(p.error && /Not valid JSON/i.test(p.message)), p.message);
  check('…and does not invent a value', p.value === undefined);
}

{
  const p = JC.parseJson('{\n  a: 1}');
  check('invalid JSON names a line and column', /line \d/.test(p.message) && /column \d/.test(p.message), p.message);
}

{
  check('valid object parses', JC.parseJson('{"a": 1}').value.a === 1);
  check('valid array parses', JC.parseJson('[1,2]').value[1] === 2);
  check('valid primitive parses', JC.parseJson('true').value === true);
  check('null parses as null, not empty', JC.parseJson('null').value === null);
}

{
  const g = JC.toGraph({ a: 1, b: { c: 'x' }, d: [true, { e: null }] });
  check('fixture {a, b:{c}, d:[true,{e}]} is 4 cards', g.nodes.length === 4, g.nodes.length);
  check('…and 3 edges (b, d, d[1])', g.edges.length === 3, g.edges.length);
  const root = g.nodes[0];
  check('nested keys stay as rows on the parent', root.rows.length === 3 && root.rows[1].nested && root.rows[1].k === 'b', root.rows);
  check('primitives stay on the parent', root.rows[0].k === 'a' && root.rows[0].t === 'number' && !root.rows[0].nested);
  const L = JC.layout(g, {});
  check('layout assigns x/y/w/h', !!(L.nodes[0].w && L.nodes[0].h && L.nodes[0].x >= 0));
  check('cards do not overlap', JC.cardsOverlap(L) === false);
  const child = L.nodes.filter((n) => n.id !== root.id)[0];
  check('children sit to the right of the parent', !!(child && child.x >= L.nodes[0].x + L.nodes[0].w), child && { x: child.x, px: L.nodes[0].x, pw: L.nodes[0].w });
  const folded = JC.layout(g, (function () { const o = {}; o[root.id] = true; return o; })());
  check('collapse hides descendants', folded.nodes.length === 1, folded.nodes.length);
}

{
  const g = JC.toGraph(JC.SAMPLE);
  check('sample Super hero squad is 6 cards (root, members, 2 people, 2 power lists)', g.nodes.length === 6, g.nodes.length);
  check('sample has 5 edges', g.edges.length === 5, g.edges.length);
  const root = g.nodes[0];
  const memberRow = root.rows.filter((r) => r.k === 'members')[0];
  check('members is a nested row on the root card', !!(memberRow && memberRow.nested && memberRow.t === 'array' && memberRow.size === 2), memberRow);
  const L = JC.layout(g, {});
  check('sample layout does not overlap', JC.cardsOverlap(L) === false);
  check('sample graph has a positive bounding box', L.width > 200 && L.height > 200, { w: L.width, h: L.height });
  const byId = {};
  L.nodes.forEach((n) => { byId[n.id] = n; });
  const membersEdge = L.edges.filter((e) => e.label === 'members')[0];
  check('members edge is attached, not floating', !!(membersEdge && membersEdge.x1 > 0 && membersEdge.x2 > membersEdge.x1));
  if (membersEdge) {
    const parent = byId[membersEdge.from];
    const dy = Math.abs(membersEdge.y1 - (parent.y + 18));
    check('members edge leaves the members row, not only the title', dy > 8, { y1: membersEdge.y1, titleY: parent.y + 18, dy: dy });
  }
}

{
  const g = JC.toGraph([1, { a: 2 }, 3]);
  check('root array keeps primitive slots as rows', g.nodes[0].isArray && g.nodes[0].rows.length === 3);
  check('only the nested object becomes a child card', g.nodes.length === 2, g.nodes.length);
}

{
  const g = JC.toGraph(42);
  check('a primitive root is one card', g.nodes.length === 1 && g.nodes[0].rows[0].v === 42);
}

// ---- mock DOM: paste → cards, empty, invalid keeps last --------------------
function el(id, extra) {
  const e = Object.assign({
    id: id,
    value: '',
    innerHTML: '',
    textContent: '',
    hidden: true,
    className: '',
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    style: {},
    _l: {},
    children: [],
    addEventListener: function (ev, fn) { this._l[ev] = fn; },
    setAttribute: function (k, v) { this[k] = v; },
    getAttribute: function (k) { return this[k] == null ? null : this[k]; },
    querySelector: function () { return this._svg || null; },
    querySelectorAll: function () { return this._list || []; },
    appendChild: function (c) { this.children.push(c); this._svg = c; return c; },
    closest: function () { return null; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 640, height: 400 }; },
    clientWidth: 640,
    clientHeight: 400,
  }, extra || {});
  return e;
}

function loadApp() {
  const nodes = {
    src: el('src'),
    err: el('err'),
    meta: el('meta'),
    format: el('format'),
    minify: el('minify'),
    sample: el('sample'),
    'file-input': el('file-input'),
    'graph-inner': el('graph-inner'),
    stage: el('stage', { clientWidth: 640, clientHeight: 400 }),
    'zoom-in': el('zoom-in'),
    'zoom-out': el('zoom-out'),
    'zoom-fit': el('zoom-fit'),
    'tab-text': el('tab-text'),
    'tab-graph': el('tab-graph'),
    toast: el('toast'),
    meet: el('meet'),
  };
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error, Promise,
    setTimeout: function (fn) { fn(); return 1; },
    clearTimeout: function () {},
    document: {
      getElementById: function (id) { return nodes[id] || null; },
      body: { classList: { toggle: function () {} }, appendChild: function () {}, removeChild: function () {} },
      createElement: function (tag) { return el(tag); },
      createElementNS: function (ns, tag) {
        const n = el(tag);
        n.namespaceURI = ns;
        n.querySelectorAll = function () { return []; };
        return n;
      },
    },
    window: null,
    gifos: null,
    navigator: { clipboard: null },
    FileReader: function () {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'graph.js'), 'utf8'), sandbox, { filename: 'graph.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'mp.js'), 'utf8'), sandbox, { filename: 'mp.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return { sandbox, nodes };
}

{
  const { sandbox, nodes } = loadApp();
  check('app.js attaches JsonCrackApp', !!(sandbox.JsonCrackApp && sandbox.JsonCrackApp.parseAndDraw));
  check('first boot pastes the sample and draws cards',
    /super hero squad/i.test(nodes.src.value) && /<g class="node"/.test(nodes['graph-inner']._svg && nodes['graph-inner']._svg.innerHTML || ''),
    (nodes['graph-inner']._svg && nodes['graph-inner']._svg.innerHTML || '').slice(0, 80));
  const good = nodes['graph-inner']._svg && nodes['graph-inner']._svg.innerHTML;
  check('meta counts cards after a draw', /cards/.test(nodes.meta.textContent), nodes.meta.textContent);

  nodes.src.value = '{';
  sandbox.JsonCrackApp.parseAndDraw();
  check('invalid JSON shows a short Not valid JSON', /Not valid JSON/.test(nodes.err.textContent) && nodes.err.hidden === false, nodes.err.textContent);
  check('invalid JSON keeps the last good graph', nodes['graph-inner']._svg && nodes['graph-inner']._svg.innerHTML === good);

  nodes.src.value = '   ';
  sandbox.JsonCrackApp.parseAndDraw();
  check('empty textarea is an empty state, not a parser dump',
    /Paste JSON/.test(nodes['graph-inner'].innerHTML) && nodes.err.hidden === true,
    nodes['graph-inner'].innerHTML.slice(0, 80));
}

// ---- shell (a vm cannot tap these) -----------------------------------------
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const mp = fs.readFileSync(path.join(APP, 'mp.js'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));

check('phone Text/Graph tabs exist', html.includes('tab-text') && html.includes('tab-graph') && css.includes('tab-graph'));
check('zoom +/−/Fit exist (phones have no wheel)', html.includes('zoom-in') && html.includes('zoom-out') && html.includes('zoom-fit'));
check('pinch-zoom is wired', app.includes('pinch') && css.includes('touch-action: none'));
check('first view frames the root at 1×, not a microscopic fit-all', app.includes('frameRoot') && /fittedOnce = true; frameRoot/.test(app));
check('app.js saves the last document privately', app.includes("db('save')") && app.includes("id: 'last'"));
check('empty saved text is restored, not replaced by the sample', /typeof rec\.text === 'string'/.test(app));
check('gifos.onBack is registered', app.includes('gifos.onBack'));
check('mp.js tells the player to press Invite (OS chrome)', mp.includes('Invite'));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('no CDN / no type=module', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) && !/type=["']module["']/.test(html));
check('help.md teaches paste, pan/zoom, empty, fold, copy',
  /Paste JSON/.test(help) && /pinch/.test(help) && /empty/.test(help) && /copy/i.test(help));
check('help.md does not document Invite/Save', !/\bInvite\b/.test(help) && !/\bSave\b/.test(help));
check('listing is an unofficial port of JSON Crack',
  /unofficial port of JSON Crack/i.test(listing.description) && listing.basedOn.name === 'JSON Crack');
check('listing leads with paste-and-see', /^Paste JSON/i.test(listing.description));
check('tagline says the data never leaves', /never leaves your device/i.test(listing.tagline));
check('listing says the data stays here', /never leaves this device/i.test(listing.description));
check('author is Aykut Saraç, never GifOS', listing.author.name === 'Aykut Saraç' && listing.porter.name === 'GifOS');

const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
check('no network capability', !manifest.capabilities.network);
check('save collection is private', manifest.data.save.visibility === 'private');
check('minBuild stays 947', manifest.minBuild === 947);

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
