// DUCK HUNT HAS TO SAVE A SCORE AND STAY IN THE GIF.
//
// The vendored Pixi game wrote a best-score helper that nothing ever called,
// replay assigned window.location.pathname (a srcdoc walk), and Invite was a
// presence count. This suite plays the SHELL — score in, best out, replay
// does not navigate — and greps the vendor for the hooks a vm cannot fire.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'duck-hunt');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function fakeDom() {
  const nodes = {};
  function el(id) {
    if (!nodes[id]) {
      nodes[id] = {
        id: id, hidden: false, disabled: true, textContent: '',
        addEventListener: () => {},
        classList: { add() {}, remove() {}, toggle() {} },
      };
    }
    return nodes[id];
  }
  return {
    getElementById: el,
    querySelectorAll: () => [],
    body: { classList: { add() {}, remove() {} } },
    addEventListener: () => {},
    _nodes: nodes,
  };
}

function load(savedRow, roomRows) {
  const puts = [];
  const document = fakeDom();
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    setTimeout: (fn) => { fn(); return 1; },
    document,
    window: null,
    gifos: {
      db: (name) => ({
        get: () => Promise.resolve(name === 'save' ? savedRow : null),
        put: (row) => { puts.push({ name: name, row: row }); return Promise.resolve(); },
        subscribe: (cb) => { if (name === 'room') cb(roomRows || []); },
      }),
      me: () => Promise.resolve({ id: 'me1', name: 'Pat' }),
      onBack: (fn) => { sandbox._onBack = fn; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'boot.js'), 'utf8'), sandbox, { filename: 'boot.js' });
  return { sandbox, puts, document };
}

// ---- the save that shipped dead ---------------------------------------------
{
  const { sandbox } = load(null, []);
  const DH = sandbox.DHSave;
  check('boot.js attaches DHSave', !!(DH && DH.onScore && DH.replay && DH.onEnd));
  DH.onScore(400);
  check('a score becomes last AND best', DH.prefs.last === 400 && DH.prefs.best === 400, DH.prefs);
  DH.onScore(200);
  check('a worse score keeps the best', DH.prefs.best === 400 && DH.prefs.last === 200, DH.prefs);
  DH.onScore(900);
  check('a better score raises the best', DH.prefs.best === 900, DH.prefs);
}

async function runAsync() {
  const { sandbox, puts, document } = load({ id: 'save', best: 700, last: 300 }, []);
  const DH = sandbox.DHSave;
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  check('a saved best comes back', DH.prefs.best === 700, DH.prefs);
  check('Play is enabled once the save loads', document.getElementById('gate-go').disabled === false);

  DH.onEnd(false, 1200);
  await new Promise((r) => setImmediate(r));
  const savePuts = puts.filter((p) => p.name === 'save');
  check('onEnd writes the best into the file', savePuts.some((p) => p.row.best === 1200), savePuts.map((p) => p.row));
  const roomPuts = puts.filter((p) => p.name === 'room');
  check('onEnd publishes the pond row', roomPuts.some((p) => p.row.best === 1200 && p.row.id === 'me1'), roomPuts.map((p) => p.row));

  let loc = 'about:srcdoc';
  sandbox.window.location = loc;
  document.getElementById('gate').hidden = true;
  check('onBack while playing returns to the gate', typeof sandbox._onBack === 'function' && sandbox._onBack() === true);
  check('replay does not assign window.location', sandbox.window.location === loc, sandbox.window.location);
  check('replay shows the gate again', document.getElementById('gate').hidden === false);
  check('onBack on the gate is not swallowed', sandbox._onBack() === false);
}

// ---- pond board -------------------------------------------------------------
{
  const { document } = load(null, [
    { id: 'a', name: 'Ada', best: 500 },
    { id: 'b', name: 'Bob', best: 900 },
  ]);
  const pond = document.getElementById('pond');
  check('two people at the pond un-hide the board', pond.hidden === false);
  check('the pond lists the higher best first', /Bob 900/.test(pond.textContent) && /Ada 500/.test(pond.textContent), pond.textContent);
}

// ---- vendor hooks a vm cannot fire ------------------------------------------
{
  const vendor = fs.readFileSync(path.join(APP, 'vendor/duckhunt.js'), 'utf8');
  const boot = fs.readFileSync(path.join(APP, 'boot.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
  const man = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
  check('vendor calls DHSave.onScore', vendor.includes('DHSave.onScore'));
  check('vendor calls DHSave.onEnd on win and loss', (vendor.split('DHSave.onEnd').length - 1) >= 2);
  check('vendor replay does not navigate', !vendor.includes('window.location=window.location.pathname'));
  check('vendor replay calls DHSave.replay', vendor.includes('DHSave.replay()'));
  check('no creator.html escape', !vendor.includes('creator.html'));
  check('touch shots get extra radius', vendor.includes('pointerType') && vendor.includes('28'));
  check('DuckHuntStart stores the game', vendor.includes('window.__DHGame'));
  check('phone mute/pause buttons', html.includes('btn-mute') && html.includes('btn-pause'));
  check('canvas no longer paints pause (p)', !vendor.includes('pause (p)'));
  check('canvas touch-action none (phone aim)', /touch-action:\s*none/.test(css));
  check('Invite is mentioned, not an in-app button', boot.includes('Invite') && !/>\s*Invite\s*</.test(html));
  check('help covers tap and the pond', /tap/i.test(help) && /Invite/.test(help) && /best/i.test(help));
  check('listing does not say Nintendo', !/Nintendo/.test(listing) && !/Nintendo/.test(help) && !/Nintendo/.test(html));
  check('multiplayer + db declared', man.capabilities.db === true && man.capabilities.multiplayer === true);
  check('no network/wasm', !man.capabilities.network && !man.capabilities.wasm);
  check('minBuild stays 947', man.minBuild === 947);
}

runAsync().then(function () {
  if (failures) {
    console.log('\n' + failures + ' FAIL');
    process.exit(1);
  }
  console.log('\nAll duck-hunt checks passed.');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
