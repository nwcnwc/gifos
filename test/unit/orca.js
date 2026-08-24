// ORCA HAS TO BANG, AND A STRANGER HAS TO HEAR A C.
//
// The port shipped an empty canvas and MIDI-only IO, so first-run taught
// nothing and made no sound without a device. This suite plays the operator
// core in a vm (same files the GIF loads) and source-scans the GifOS shell
// for the lesson, the Web Audio fallback, and the phone pad.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'orca');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const midi = {
    stack: [],
    push: function (channel, octave, note, velocity, length) {
      this.stack.push({ channel, octave, note, velocity, length });
    },
    run: function () {},
    trigger: function () {}
  };
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    client: { io: { midi, cc: { stack: [] }, mono: { push: function () {} } }, commander: { trigger: function () {} } }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const core = path.join(APP, 'vendor', 'core');
  vm.runInContext(fs.readFileSync(path.join(core, 'operator.js'), 'utf8'), sandbox, { filename: 'operator.js' });
  vm.runInContext(fs.readFileSync(path.join(core, 'library.js'), 'utf8') + '\nthis.library = library;', sandbox, { filename: 'library.js' });
  vm.runInContext(fs.readFileSync(path.join(core, 'orca.js'), 'utf8'), sandbox, { filename: 'orca.js' });
  vm.runInContext(fs.readFileSync(path.join(core, 'transpose.js'), 'utf8') + '\nthis.transposeTable = transposeTable;', sandbox, { filename: 'transpose.js' });
  sandbox.midi = midi;
  return sandbox;
}

const G = load();
check('operator / library / orca load', !!(G.Orca && G.library && G.library.d && G.library[':']));

const STARTER = ['.D4.....', '........', '.:04C...'].join('');
check('starter is 8x3 = 24 cells', STARTER.length === 24, STARTER.length);

{
  const o = new G.Orca(G.library);
  o.load(8, 3, STARTER, 0);
  check('starter D sits at (1,0)', o.glyphAt(1, 0) === 'D');
  check('starter 4 is D\'s mod (right)', o.glyphAt(2, 0) === '4');
  check('starter : sits under D so a bang is a neighbour', o.glyphAt(1, 2) === ':');
  check('starter note is C', o.glyphAt(4, 2) === 'C');

  const bangs = [];
  const notes = [];
  for (let f = 0; f < 12; f++) {
    G.midi.stack.length = 0;
    o.run();
    if (o.glyphAt(1, 1) === '*') bangs.push(o.f - 1);
    if (G.midi.stack.length) notes.push({ f: o.f - 1, n: G.midi.stack[0] });
  }
  check('D bangs on frame 0 and every 4 frames', bangs[0] === 0 && bangs.indexOf(4) >= 0 && bangs.indexOf(8) >= 0, bangs);
  check('a bang neighbour fires :04C', notes.length >= 1 && notes[0].n.note === 'C' && notes[0].n.octave === 4, notes[0]);
  check('the C is channel 0', notes.length >= 1 && notes[0].n.channel === 0, notes[0] && notes[0].n);
}

{
  const o = new G.Orca(G.library);
  o.load(8, 2, 'D4..............');
  check('D row starts empty below', o.glyphAt(0, 1) === '.');
  o.run();
  check('D writes a bang below itself', o.glyphAt(0, 1) === '*', o.s);
}

{
  const o = new G.Orca(G.library);
  o.load(5, 1, '1A2..');
  // A is add: ports a at -1, b at +1, output below. 1-wide row cannot write below.
  o.reset(3, 2);
  o.write(1, 0, 'A');
  o.write(0, 0, '2');
  o.write(2, 0, '3');
  o.run();
  check('A (add) outputs the sum of its sides', o.glyphAt(1, 1) === '5', o.s);
}

{
  const o = new G.Orca(G.library);
  const rec = { orca: STARTER, w: 8, h: 3, f: 12, bpm: 140 };
  o.load(rec.w, rec.h, rec.orca, rec.f);
  check('a saved grid record still loads (id/orca/w/h/f)', o.glyphAt(1, 0) === 'D' && o.f === 12);
  const withNewlines = '.D4.....\n........\n.:04C...';
  o.load(8, 3, withNewlines, 0);
  check('a toString() save (newlines) still loads', o.glyphAt(1, 0) === 'D' && o.glyphAt(1, 2) === ':');
}

// ---- shell: the lesson, the sound, the pad (a vm cannot click these) --------
const boot = fs.readFileSync(path.join(APP, 'boot.js'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));

check('boot.js saves the grid privately as id grid', boot.includes("db('save')") && boot.includes("id: 'grid'"));
check('boot.js ships the D4/:04C starter', boot.includes(':04C') && boot.includes('STARTER'));
check('boot.js wraps MIDI with Web Audio (AudioContext)', boot.includes('AudioContext') && boot.includes('hearNote'));
check('boot.js only hears in-browser when no MIDI device', boot.includes('outputDevice()') && boot.includes('hearNote'));
check('boot.js has a Hear control', /hudHear/.test(boot) && /Hear/.test(boot));
check('boot.js turns the operator guide off so the starter is visible', boot.includes('toggleGuide(false)'));
check('boot.js injects a phone pad', boot.includes("id = 'pad'") || boot.includes('id="pad"'));
check('boot.js onBack returns true only when it closed something', /onBack\(function \(\) \{[\s\S]*return closed;/.test(boot));
check('style.css shows the pad on coarse pointers / phone width', css.includes('pointer: coarse') && css.includes('#pad'));
check('no CDN / no type=module in index.html', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) && !/type=["']module["']/.test(html));
check('help.md teaches D / bang / :04C first', help.includes(':04C') && help.includes('Hear'));
check('help.md does not document Invite/Save (OS chrome)', !/\bInvite\b/.test(help) && !/\bSave\b/.test(help));
check('listing leads with the file as the save', /file is the save/i.test(listing.tagline) || /stays in the file/i.test(listing.description));
check('listing says MIDI is optional and you still hear it', /MIDI hardware is optional/i.test(listing.description) && /hear/i.test(listing.description));
check('listing is an unofficial port of Hundredrabbits', listing.basedOn && listing.basedOn.name === 'Orca' && listing.author.name === 'Hundredrabbits');
check('clock.js has no blob Worker', !fs.readFileSync(path.join(APP, 'vendor', 'clock.js'), 'utf8').includes('new Worker'));

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nAll orca checks green.');
