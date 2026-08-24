// PIVOT HAS TO ACTUALLY PIVOT.
//
// The wrap shipped Papa Parse + PivotTable.js, but nothing in the repo counted
// a cell: empty CSV still called pivotUI, Excel files were read as text, and
// phone drag was claimed without a fallback. This suite loads the pinned
// vendor (Papa + a jQuery stub + PivotData) and app.js in a vm, parses the
// baked MP sample, and asserts the Quebec×NDP count — so a parser or
// aggregator regression cannot ship again. Phone/input rules a vm cannot run
// are pinned by source scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'pivot');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function jqueryStub() {
  const $ = function () {
    const api = {
      length: 0,
      pivotUI: function () { return api; },
      each: function () { return api; },
      text: function () { return ''; },
      heatmap: function () { return api; },
      barchart: function () { return api; },
    };
    return api;
  };
  $.extend = function (tgt) {
    let i = 1;
    if (typeof tgt === 'boolean') { tgt = arguments[1] || {}; i = 2; }
    tgt = tgt || {};
    for (; i < arguments.length; i++) {
      const s = arguments[i];
      if (!s) continue;
      Object.keys(s).forEach((k) => { tgt[k] = s[k]; });
    }
    return tgt;
  };
  $.isArray = Array.isArray;
  $.isFunction = (f) => typeof f === 'function';
  $.isEmptyObject = (o) => {
    if (!o) return true;
    for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return false;
    return true;
  };
  $.fn = {};
  return $;
}

function load() {
  const $ = jqueryStub();
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error,
    parseInt, parseFloat, isNaN, isFinite, Promise, setTimeout, clearTimeout,
    jQuery: $, $: $,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  sandbox.document = {
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  vm.createContext(sandbox);
  const run = (rel) => {
    vm.runInContext(fs.readFileSync(path.join(APP, rel), 'utf8'), sandbox, { filename: rel });
  };
  run('vendor/papaparse.min.js');
  run('vendor/pivot.js');
  run('vendor/export_renderers.js');
  run('vendor/sample.js');
  run('app.js');
  return sandbox;
}

const sandbox = load();
const App = sandbox.PivotApp;
const Papa = sandbox.Papa;
const utils = sandbox.$ && sandbox.$.pivotUtilities;

check('Papa Parse attaches', !!(Papa && typeof Papa.parse === 'function'));
check('PivotData and aggregators attach', !!(utils && utils.PivotData && utils.aggregators && utils.aggregators.Count));
check('app.js exports parseTable / pivotValue', !!(App && App.parseTable && App.pivotValue));
check('baked MP sample is aboard', typeof sandbox.PIVOT_SAMPLE_CSV === 'string' && sandbox.PIVOT_SAMPLE_CSV.indexOf('Name,Party,Province') === 0);

{
  const empty = App.parseTable('', Papa);
  check('empty CSV is empty, not a grid', !!(empty.empty && /paste a table/i.test(empty.message)), empty);
  check('whitespace-only is empty', !!App.parseTable('  \n\t  ', Papa).empty);
}

{
  const headerOnly = App.parseTable('item,region,qty\n', Papa);
  check('header with no data rows is an error', !!(headerOnly.error && /data row/i.test(headerOnly.message)), headerOnly);
}

{
  const badHeader = App.parseTable('\n\n', Papa);
  check('no header is empty or error, never a silent grid', !!(badHeader.empty || badHeader.error), badHeader);
}

{
  const parsed = App.parseTable(sandbox.PIVOT_SAMPLE_CSV, Papa);
  check('sample parses with fields', !!(parsed.data && parsed.fields && parsed.fields.indexOf('Province') >= 0 && parsed.fields.indexOf('Party') >= 0), parsed.fields);
  check('sample has hundreds of MP rows', parsed.rows > 200 && parsed.rows < 400, parsed.rows);

  let quebecNdp = 0, ontarioLib = 0, total = 0;
  for (let i = 1; i < parsed.data.length; i++) {
    const rec = {};
    parsed.fields.forEach((k, j) => { rec[k] = parsed.data[i][j]; });
    total++;
    if (rec.Province === 'Quebec' && rec.Party === 'NDP') quebecNdp++;
    if (rec.Province === 'Ontario' && rec.Party === 'Liberal') ontarioLib++;
  }
  check('manual count of the sample ran', total === parsed.rows, { total: total, rows: parsed.rows });

  const cell = App.pivotValue(parsed.data, {
    aggregatorName: 'Count',
    rows: ['Province'],
    cols: ['Party'],
    rowKey: ['Quebec'],
    colKey: ['NDP']
  }, utils);
  check('PivotData Count of Quebec × NDP matches the CSV', cell === quebecNdp, { cell: cell, quebecNdp: quebecNdp });

  const ont = App.pivotValue(parsed.data, {
    aggregatorName: 'Count',
    rows: ['Province'],
    cols: ['Party'],
    rowKey: ['Ontario'],
    colKey: ['Liberal']
  }, utils);
  check('PivotData Count of Ontario × Liberal matches the CSV', ont === ontarioLib, { ont: ont, ontarioLib: ontarioLib });

  const grand = App.pivotValue(parsed.data, {
    aggregatorName: 'Count',
    rows: ['Province'],
    cols: ['Party'],
    rowKey: [],
    colKey: []
  }, utils);
  check('grand total is every MP', grand === parsed.rows, { grand: grand, rows: parsed.rows });

  const avg = App.pivotValue(parsed.data, {
    aggregatorName: 'Average',
    rows: [],
    cols: [],
    vals: ['Age'],
    rowKey: [],
    colKey: []
  }, utils);
  check('Average of Age is a plausible number of years', typeof avg === 'number' && avg > 30 && avg < 70, avg);
}

{
  check('xlsx is refused', App.looksSpreadsheet('budget.xlsx') === true);
  check('xls is refused', App.looksSpreadsheet('old.xls') === true);
  check('csv is allowed', App.looksSpreadsheet('seats.csv') === false);
}

{
  const tiny = App.parseTable('item,region,qty\nWidget,East,12\nGadget,West,5\n', Papa);
  const east = App.pivotValue(tiny.data, {
    aggregatorName: 'Sum',
    rows: ['region'],
    cols: [],
    vals: ['qty'],
    rowKey: ['East'],
    colKey: []
  }, utils);
  check('Sum of qty for East is 12', Number(east) === 12, east);
}

{
  const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const vendors = html;
  check('touch-punch is still in the GIF', vendors.indexOf('jquery.ui.touch-punch.min.js') >= 0);
  check('assign panel exists for phone', html.indexOf('id="assign"') >= 0 && css.indexOf('pointer: coarse') >= 0);
  check('Back is registered', src.indexOf('gifos.onBack') >= 0);
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('index.html has no remote URL', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  check('app.js does not fetch', !/\bfetch\(/.test(src) && !src.includes('XMLHttpRequest'));
  check('listing does not say Drop', !/\bDrop\b/.test(listing.description));
  check('listing does not say if you want', !/if you want/i.test(listing.description));
  check('help names the phone menus', /phone/i.test(help) && /Unused/i.test(help) && /Rows/i.test(help));
  check('help is honest about Excel', /xlsx/i.test(help) || /Excel/i.test(help));
  check('capabilities.db stays declared, no network', (() => {
    const m = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
    return m.capabilities && m.capabilities.db === true && !m.capabilities.network && m.minBuild === 947;
  })());
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll pivot checks passed.');
