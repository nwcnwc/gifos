// MEMORY HAS TO PLAY THE SEQUENCE.
//
// Mnimi's rules (4 pads, extra at 7 and 14, speed 2500→550) shipped as a
// DOM toy with no suite. A guest Invite Start rolled a private seed, so the
// "same sequence" race was a lie, and a tap was a click — late on a phone.
// This suite PLAYS the exported engine: start, demo → play, tap the sequence,
// miss the wrong pad, keep best, keep a seed identical across two devices.
// Phone/input one-liners a vm cannot run are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'memory');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function el() {
  return {
    addEventListener() {},
    setAttribute() {},
    textContent: '',
    hidden: true,
    innerHTML: '',
    className: '',
    disabled: false,
    children: [],
    appendChild() {},
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    getAttribute() { return '0'; },
  };
}

function load() {
  const nodes = {};
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    parseInt, setTimeout() { return 0; }, clearTimeout() {},
    document: {
      getElementById: (id) => (nodes[id] || (nodes[id] = el())),
      createElement: () => el(),
      addEventListener() {},
    },
    gifos: undefined,
    AudioContext: function () { throw new Error('no audio'); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = load();
const R = sandbox.MemoryRules;
check('app.js loads MemoryRules', !!(R && R.padsFor && R.sequenceOf && R.tap && R.begin));

check('four pads until level 7', R.padsFor(1) === 4 && R.padsFor(7) === 4);
check('six pads after level 7', R.padsFor(8) === 6 && R.padsFor(14) === 6);
check('eight pads after level 14', R.padsFor(15) === 8);
check('speed starts at 2500 and floors at 550', R.speedFor(1) === 2500 && R.speedFor(99) === 550);

{
  const a = R.sequenceOf(1, 8), b = R.sequenceOf(1, 8), c = R.sequenceOf(2, 8);
  check('a seed is deterministic', a.join() === b.join());
  check('a different seed is a different sequence', a.join() !== c.join());
  check('early steps stay on the first four pads', a.slice(0, 7).every((n) => n <= 3), a.slice(0, 7));
}

// ---- play the loop ----------------------------------------------------------
{
  const G = R.create();
  R.begin(G, 42);
  check('Start puts you in demo on a 4-pad level-1 sequence',
    G.phase === 'demo' && G.level === 1 && G.seq.length === 1 && G.pads === 4,
    { phase: G.phase, n: G.seq.length });
  const rIdle = R.tap(G, G.seq[0]);
  check('a tap during the demo is ignored', rIdle.reason === 'not-play' && G.phase === 'demo');

  R.ready(G);
  check('after the demo it is your turn', G.phase === 'play');

  const wrong = G.seq[0] === 0 ? 1 : 0;
  const miss = R.tap(G, wrong);
  check('a wrong pad is a miss and ends the round',
    miss.reason === 'miss' && G.phase === 'over' && miss.expected === G.seq[0],
    miss);

  R.begin(G, 42);
  R.ready(G);
  const ok = R.tap(G, G.seq[0]);
  check('the right pad clears the round and raises the level',
    ok.reason === 'level' && G.level === 2 && G.score === 1 && G.best === 1,
    ok);
  check('level 2 is a 2-step sequence on the same seed',
    G.seq.length === 2 && G.seq[0] === R.sequenceOf(42, 2)[0] && G.phase === 'demo');

  R.ready(G);
  R.tap(G, G.seq[0]);
  const mid = R.tap(G, G.seq[1]);
  check('playing the whole sequence again scores 2',
    mid.reason === 'level' && G.score === 2 && G.best === 2, mid);
}

// Two devices, one seed — the invite race.
{
  const host = R.create(), guest = R.create();
  const seed = 99;
  R.begin(host, seed); R.ready(host);
  R.begin(guest, seed); R.ready(guest);
  check('host and guest are dealt the same sequence',
    host.seq.join() === guest.seq.join());
  R.tap(host, host.seq[0]);
  check('a host tap does not move the guest', guest.step === 0 && guest.score === 0);
  R.tap(guest, guest.seq[0]);
  check('both can clear the same round on their own boards',
    host.score === 1 && guest.score === 1);
}

// Best score is sticky across a new round (the file is the save).
{
  const G = R.create();
  G.best = 12;
  R.begin(G, 7);
  check('Start does not wipe a saved best', G.best === 12 && G.score === 0);
  R.ready(G);
  R.tap(G, G.seq[0]);
  check('a short round does not lower best', G.best === 12 && G.score === 1);
}

// ---- shell one-liners a vm cannot run --------------------------------------
{
  const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');

  check('a pad tap is pointerdown, not a late click',
    /pointerdown/.test(src) && !/addEventListener\('click', onPad\)/.test(src));
  check('pads have a thumb-sized min-height', /min-height:\s*72px/.test(css));
  check('pads use touch-action manipulation', /touch-action:\s*manipulation/.test(css));
  check('a miss names the pad you should have hit',
    /classList\.add\('hint'\)/.test(src) && /NAMES\[r\.expected\]/.test(src));
  check('Invite: whoever Starts publishes the seed (not a private guest round)',
    /versusOn\(\) && matchDb/.test(src) && !/iAmManager/.test(src));
  check('Back stops a round then lets the OS close',
    /onBack/.test(src) && /return false/.test(src));
  check('best score is written to gifos.db', /db\('save'\)/.test(src));
  check('Invite is OS chrome', !/id=["']invite["']/.test(html));
  check('no second How-to-play button', !/how to play/i.test(html));
  check('listing leads with why this version',
    /offline/i.test(listing.description) && /file/i.test(listing.description) && /Invite/.test(listing.description));
  check('listing does not mention internals',
    !/gifos\.db|WASM|sandbox|localStorage/.test(JSON.stringify(listing)));
  check('unofficial Mnimi, author is Sepand',
    listing.basedOn.name === 'Mnimi' && listing.basedOn.blessed === false &&
    listing.author.name === 'Sepand Haghighi' && listing.porter.name === 'GifOS');
  check('help covers taps, tones, extra pads, invite, save',
    /Tap/i.test(help) && /tone/i.test(help) && /level 7/i.test(help) && /Invite/.test(help) && /best score/i.test(help));
  check('6-pad and 8-pad boards are not stuck on two columns',
    /n6/.test(css) && /n8/.test(css) && /1fr 1fr 1fr/.test(css));
}

console.log(failures ? failures + ' FAILURES' : 'ALL PASS');
process.exit(failures ? 1 : 0);
