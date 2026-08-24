// JSON EDITOR HAS TO PARSE AND EDIT A FIXTURE.
//
// The wrap shipped josdejong/jsoneditor's dist, but nothing in the repo played
// a document: empty first-run dumped a sample, invalid JSON still said
// "Saved", and Tree/Code on a phone was a 24px menu. This suite loads app.js
// in a vm (the Ace bundle needs a real DOM) and parses, formats, repairs,
// and edits a fixture — so a swallowed parse error or a broken save record
// cannot ship again. Phone/input rules a vm cannot run are pinned by source
// scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'json-editor');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error,
    parseInt, isNaN, Promise, setTimeout, clearTimeout, FileReader: function () {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = null;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'mp.js'), 'utf8'), sandbox, { filename: 'mp.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = load();
const App = sandbox.JsonEditorApp;

check('app.js exports parseJson / formatText / repairText / loadRecord',
  !!(App && App.parseJson && App.formatText && App.compactText && App.repairText && App.loadRecord && App.persistRecord && App.setAt));

const FIXTURE = {
  project: 'notes',
  offline: true,
  modes: ['tree', 'code'],
  user: { id: 'a1', role: 'editor' },
  items: [
    { id: 'x', n: 1 },
    { id: 'y', n: 2 }
  ]
};

{
  const p = App.parseJson(JSON.stringify(FIXTURE));
  check('fixture parses', !!(p.value && p.value.project === 'notes' && p.value.items[1].id === 'y'), p.value);
  check('fixture is not empty', !App.isEmptyDoc(p.value));
  const edited = App.setAt(p.value, ['user', 'role'], 'guest');
  check('setAt edits a nested field', edited.user.role === 'guest', edited.user);
  const compact = App.compactText(JSON.stringify(edited));
  check('compact round-trips the edit', compact.value.user.role === 'guest' && compact.text.indexOf('\n') < 0, compact.text && compact.text.slice(0, 80));
  const pretty = App.formatText(compact.text);
  check('format pretty-prints the edited fixture', pretty.text.indexOf('\n') >= 0 && pretty.value.items[0].n === 1, pretty.text && pretty.text.slice(0, 60));
}

{
  const p = App.parseJson('');
  check('empty string is empty, not a parse error', !!(p.empty && !p.error && !('value' in p)));
  check('whitespace-only is empty', !!App.parseJson('  \n\t  ').empty);
  check('empty object is empty-looking', App.isEmptyDoc({}));
  check('empty array is empty-looking', App.isEmptyDoc([]));
  check('null is a document, not empty-looking', App.isEmptyDoc(null) === false);
  check('0 is a document, not empty-looking', App.isEmptyDoc(0) === false);
}

{
  const p = App.parseJson('{');
  check('truncated JSON is an error', !!(p.error && /valid JSON/i.test(p.message)), p);
  check('…and does not invent a value', p.value === undefined);
  const bad = App.parseJson('{not json}');
  check('invalid JSON is an error', !!(bad.error && /valid JSON/i.test(bad.message)), bad);
  const fmt = App.formatText('{');
  check('format refuses invalid JSON', !!(fmt.error && /valid JSON/i.test(fmt.message)));
  const cmp = App.compactText('{not');
  check('compact refuses invalid JSON', !!(cmp.error));
}

{
  const trail = App.repairText('{ "a": 1, }');
  check('repair trailing comma', !!(trail.value && trail.value.a === 1 && trail.repaired), trail);
  const keys = App.repairText('{ a: 1, b: 2 }');
  check('repair unquoted keys', !!(keys.value && keys.value.a === 1 && keys.value.b === 2), keys);
  const comments = App.repairText('{ "a": 1 } // keep me\n');
  check('repair strips a line comment', !!(comments.value && comments.value.a === 1), comments);
  const already = App.repairText('{"a":1}');
  check('repair of valid JSON is not marked repaired', already.repaired === false && already.value.a === 1);
  const hopeless = App.repairText('{');
  check('repair of truncated JSON stays an error', !!(hopeless.error && /valid JSON/i.test(hopeless.message)));
  const html = App.friendlyError({ message: "Parse error on line 1:<br>{<br>-^<br>Expecting 'STRING', '}', got 'EOF'" });
  check('friendlyError strips html from ace parse errors', html.indexOf('<') < 0 && /valid JSON/i.test(html) && /EOF/i.test(html), html);
}

{
  const first = App.loadRecord(null);
  check('first-run is empty, not the sample', !!(first.empty && first.doc && Object.keys(first.doc).length === 0), first);
  check('sample is richer than the empty object', App.SAMPLE && App.SAMPLE.items && App.SAMPLE.items.length === 2);

  const saved = App.persistRecord('tree', App.parseJson(JSON.stringify(FIXTURE)));
  check('persist of a valid document stores doc, not text', saved.id === 'last' && saved.doc && saved.doc.project === 'notes' && saved.text === null, saved);
  const loaded = App.loadRecord(saved);
  check('saved document loads back', loaded.doc && loaded.doc.user.id === 'a1' && loaded.mode === 'tree' && !loaded.empty);

  const invalid = App.persistRecord('code', App.parseJson('{'));
  check('persist of invalid JSON keeps the text', invalid.doc === null && invalid.text === '{' && invalid.mode === 'code', invalid);
  const loadedBad = App.loadRecord(invalid);
  check('invalid last document comes back as text, honestly', !!(loadedBad.invalid && loadedBad.mode === 'code' && loadedBad.text === '{' && /valid JSON/i.test(loadedBad.message)), loadedBad);

  const old = App.loadRecord({ id: 'last', mode: 'tree', doc: { greeting: 'Hello' }, text: null });
  check('v1 save {doc, mode} still loads', old.doc && old.doc.greeting === 'Hello' && old.mode === 'tree');

  const oldText = App.loadRecord({ id: 'last', mode: 'text', doc: null, text: '{"a":1}' });
  check('v1 text-mode save maps to code', oldText.mode === 'code' && oldText.doc && oldText.doc.a === 1);
}

{
  const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const mp = fs.readFileSync(path.join(APP, 'mp.js'), 'utf8');
  const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

  check('Tree and Code tabs exist', html.indexOf('tabTree') >= 0 && html.indexOf('tabCode') >= 0 && html.indexOf('phone-tabs') >= 0);
  check('phone CSS uses a 640px break', css.indexOf('max-width: 640px') >= 0);
  check('phone CSS cancels jsoneditor negative menu margin', css.indexOf('has-main-menu-bar') >= 0 && css.indexOf('margin-top: 0') >= 0);
  check('Back is registered', src.indexOf('gifos.onBack') >= 0);
  check('Ace workers are turned off', src.indexOf('setUseWorker') >= 0);
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('index.html has no remote URL', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  check('app.js does not fetch', !/\bfetch\(/.test(src) && !src.includes('XMLHttpRequest'));
  check('mp.js tells the player to press Invite', mp.indexOf('Invite') >= 0);
  check('listing does not say if you want', !/if you want/i.test(listing));
  check('listing does not say Drop', !/\bDrop\b/.test(JSON.parse(listing).description));
  check('listing leads with the file as the document', /file is the document/i.test(JSON.parse(listing).tagline));
  check('help names invalid JSON and empty first-run', /valid JSON/i.test(help) && /empty/i.test(help) && /Sample/i.test(help));
  check('help names Tree and Code tabs', /Tree/i.test(help) && /Code/i.test(help));
  check('help.md does not document Invite/Save', !/\bInvite\b/.test(help) && !/\bSave\b/.test(help));
  check('capabilities.db and multiplayer stay declared',
    manifest.capabilities && manifest.capabilities.db === true && manifest.capabilities.multiplayer === true && manifest.minBuild === 947);
  check('save is private, room is read-only',
    manifest.data && manifest.data.save && manifest.data.save.visibility === 'private' &&
    manifest.data.room && manifest.data.room.visibility === 'read-only');
  check('author is Jos de Jong, never GifOS', (() => {
    const L = JSON.parse(listing);
    return L.author && /Jos de Jong/i.test(L.author.name) && L.porter && L.porter.name === 'GifOS' && L.basedOn && L.basedOn.blessed === false;
  })());
}

{
  const vendor = fs.readFileSync(path.join(APP, 'vendor', 'jsoneditor.min.js'), 'utf8');
  check('vendored jsoneditor dist is aboard', vendor.indexOf('JSONEditor') >= 0 && vendor.length > 100000);
  const css = fs.readFileSync(path.join(APP, 'vendor', 'jsoneditor.min.css'), 'utf8');
  check('css inlines the icon sprite', css.indexOf('data:image/svg+xml') >= 0);
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll json-editor checks passed.');
