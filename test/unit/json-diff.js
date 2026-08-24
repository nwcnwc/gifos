// JSON DIFF HAS TO ACTUALLY DIFF.
//
// The wrap shipped two paste boxes around jsondiffpatch, but nothing in the
// repo played a pair: empty sides went silent, invalid JSON blanked the
// difference pane, and list items were matched only by position. This suite
// loads the pinned UMD + app.js in a vm and diffs real documents — so a
// formatter regression, a swallowed parse error, or a dead objectHash cannot
// ship again. Phone/input rules a vm cannot run are pinned by source scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'json-diff');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error,
    parseInt, isNaN, Promise, setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  sandbox.document = null;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'jsondiffpatch.umd.js'), 'utf8'), sandbox, { filename: 'jsondiffpatch.umd.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = load();
const App = sandbox.JsonDiffApp;
const J = sandbox.jsondiffpatch;

check('jsondiffpatch UMD attaches', !!(J && typeof J.diff === 'function' && J.formatters && J.formatters.html));
check('app.js exports parseJson / diffPair / compareTexts', !!(App && App.parseJson && App.diffPair && App.compareTexts));

{
  const p = App.parseJson('');
  check('empty string is empty, not a parse error', !!(p.empty && !p.error && !('value' in p)));
  check('whitespace-only is empty', !!App.parseJson('  \n\t  ').empty);
}

{
  const p = App.parseJson('{');
  check('truncated JSON is an error', !!(p.error && /valid JSON/i.test(p.message)), p);
  check('…and does not invent a value', p.value === undefined);
}

{
  const p = App.parseJson('{not json}');
  check('invalid JSON is an error', !!(p.error && p.message));
}

{
  const p = App.parseJson('{"a": 1}');
  check('valid object parses', p.value && p.value.a === 1);
  check('valid array parses', App.parseJson('[1,2]').value[1] === 2);
  check('valid primitive parses', App.parseJson('true').value === true);
  check('null parses as null, not empty', App.parseJson('null').value === null);
}

{
  const c = App.compareTexts('', '');
  check('two empty sides say paste both', !!(c.empty && /both sides/i.test(c.message)), c);
  const L = App.compareTexts('', '{"a":1}');
  check('empty left is named', !!(L.empty && /left/i.test(L.message)), L);
  const R = App.compareTexts('{"a":1}', '   ');
  check('empty right is named', !!(R.empty && /right/i.test(R.message)), R);
  const bad = App.compareTexts('{', '{"a":1}');
  check('invalid vs valid refuses to compare', !!(bad.invalid && /valid JSON/i.test(bad.message)), bad);
}

{
  const d = App.diffPair({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 }, { matchById: false });
  check('modified field is in the delta', d.delta && d.delta.b && d.delta.b[0] === 2 && d.delta.b[1] === 3, d.delta);
  check('added field is in the delta', d.delta && d.delta.c && d.delta.c[0] === 4, d.delta);
  check('html formatter paints the delta', typeof d.html === 'string' && d.html.indexOf('jsondiffpatch') >= 0);
  check('JSON view is stringify of the delta', d.json && d.json.indexOf('"b"') >= 0);
  check('JSON Patch view is a list of ops', typeof d.patch === 'string' && d.patch.indexOf('replace') >= 0 && d.patch.indexOf('/b') >= 0, d.patch);
  check('stats count added and changed', d.stats && d.stats.added >= 1 && d.stats.changed >= 1, d.stats);
}

{
  const same = App.diffPair({ a: 1 }, { a: 1 }, { matchById: false });
  check('equal documents are same, not an empty object', !!(same.same && same.delta === undefined), same);
}

{
  const left = JSON.parse(App.SAMPLE_LEFT);
  const right = JSON.parse(App.SAMPLE_RIGHT);
  const withId = App.diffPair(left, right, { matchById: true });
  const noId = App.diffPair(left, right, { matchById: false });
  check('sample pair diffs', !!(withId.delta && !withId.same));
  check('sample html has an added bit', /jsondiffpatch-added/.test(withId.html || ''));
  check('sample html has a modified bit', /jsondiffpatch-modified/.test(withId.html || ''));
  const items = withId.delta && withId.delta.items;
  check('match-by-id treats the items list as an array delta', !!(items && items._t === 'a'), items);
  const removedX = items && (items._0 || items['_0']);
  check('item id=x is removed, not shifted', !!(removedX && removedX[2] === 0 && removedX[0] && removedX[0].id === 'x'), removedX);
  check('positional match of the same lists is a different delta', JSON.stringify(withId.delta.items) !== JSON.stringify(noId.delta && noId.delta.items));
}

{
  const left = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
  const right = [{ id: 'b', n: 3 }, { id: 'a', n: 1 }];
  const hashed = App.diffPair(left, right, { matchById: true });
  check('reordered objects with ids are not rewritten as whole-list churn', hashed.stats && hashed.stats.changed <= 1 && hashed.stats.added === 0 && hashed.stats.removed === 0, hashed.stats);
  const moved = hashed.delta && hashed.delta._t === 'a';
  check('array delta still records the move', !!moved, hashed.delta);
}

{
  const cmp = App.compareTexts(App.SAMPLE_LEFT, App.SAMPLE_RIGHT, { matchById: true });
  check('compareTexts of the sample yields html + json + patch', !!(cmp.html && cmp.json && cmp.patch && cmp.stats));
  check('formatStats is human', /added/.test(App.formatStats(cmp.stats)));
}

{
  const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  check('phone tabs exist', html.indexOf('phone-tabs') >= 0 && css.indexOf('max-width: 640px') >= 0);
  check('Back is registered', src.indexOf('gifos.onBack') >= 0);
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('index.html has no remote URL', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  check('app.js does not fetch', !/\bfetch\(/.test(src) && !src.includes('XMLHttpRequest'));
  check('listing does not say if you want', !/if you want/i.test(listing));
  check('listing does not say Drop', !/\bDrop\b/.test(JSON.parse(listing).description));
  check('help names invalid JSON', /valid JSON/i.test(help) && /empty/i.test(help));
  check('help names the phone tabs', /Left \/ Right \/ Difference/i.test(help));
  check('capabilities.db and multiplayer stay declared', (() => {
    const m = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
    return m.capabilities && m.capabilities.db === true && m.capabilities.multiplayer === true && m.minBuild === 947;
  })());
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll json-diff checks passed.');
