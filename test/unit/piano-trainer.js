// PIANO TRAINER HAS TO FINISH A SCALE AND SCORE A QUIZ WITHOUT MIDI.
//
// A port of ZaneH/piano-trainer that cannot complete a C major scale from
// taps, or that names C-E-G anything other than "C major", is not a trainer.
// This suite PLAYS the theory loop in a vm: seed Math.random, feed notes,
// score answers. Phone/input rules a vm cannot press are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'piano-trainer');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'theory.js'), 'utf8'), sandbox, { filename: 'theory.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'sound.js'), 'utf8'), sandbox, { filename: 'sound.js' });
  return sandbox;
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = src('index.html');
const css = src('style.css');
const app = src('app.js');
const sound = src('sound.js');
const theory = src('theory.js');
const help = src('help.md');
const listing = JSON.parse(src('listing.json'));
const manifest = JSON.parse(src('manifest.json'));

const sandbox = load();
const PT = sandbox.PT;
check('theory.js loads and attaches PT', !!(PT && PT.Trainer && PT.chordName && PT.quizItem && PT.scoreQuiz));
check('sound.js attaches a local piano bank', sandbox.PTSound && sandbox.PTSound.kind === 'local-piano');

const C = PT.TONICS.filter((t) => t.id === 'c-major')[0];
check('C major is aboard', !!(C && C.root === 48));
const sc = PT.scaleNotes(C);
check('C major is C D E F G A B C', sc.join(',') === '48,50,52,53,55,57,59,60', sc);

{
  const tri = PT.triad(sc, 0);
  check('I of C is C E G', tri.join(',') === '48,52,55', tri);
  check('that triad is named C major', PT.chordName(tri) === 'C major', PT.chordName(tri));
}
{
  const am = PT.triad(PT.scaleNotes(PT.tonicById('a-minor')), 0);
  check('i of A minor is A C E', am.join(',') === '57,60,64', am);
  check('A C E is named A minor', PT.chordName(am) === 'A minor', PT.chordName(am));
}
{
  const g7 = PT.seventh(sc, 4); // V7 of C: G B D F
  check('V7 of C is G B D F', g7.join(',') === '55,59,62,65', g7);
  check('G B D F is named G7', PT.chordName(g7) === 'G7', PT.chordName(g7));
}
{
  const bdim = PT.triad(sc, 6);
  check('vii of C is B D F', bdim.join(',') === '59,62,65', bdim);
  check('B D F is named B diminished', PT.chordName(bdim) === 'B diminished', PT.chordName(bdim));
}
check('fifth of C is G', PT.fifthOf(sc, 48) === 55);
check('fifthAbove(C) is G', PT.fifthAbove('C') === 'G');
check('fifthAbove(G) is D', PT.fifthAbove('G') === 'D');
check('C major has no accidentals', PT.keySignature(C).n === 0, PT.keySignature(C));
check('G major has 1 sharp', PT.keySignature(PT.tonicById('g-major')).n === 1);
check('D major has 2 sharps', PT.keySignature(PT.tonicById('d-major')).n === 2);
check('F major has 1 flat', PT.keySignature(PT.tonicById('f-major')).n === 1);
check('octave-equivalent chord match', PT.chordMatch([60, 52, 55], [48, 52, 55]));

// ---- PLAY a C major scale without MIDI --------------------------------------
{
  const T = PT.Trainer.create({ mode: 'scales', tonicId: 'c-major', rand: () => 0 });
  check('a fresh trainer is on C major scales', T.mode === 'scales' && T.tonicId === 'c-major' && T.step === 0);
  const seq = T.target.slice();
  check('C major up-and-down is 15 notes (8 up, 7 down)', seq.length === 15, seq);
  check('it starts on C3 and hits C4', seq[0] === 48 && seq.indexOf(60) >= 0, seq);
  let advanced = 0;
  seq.forEach((n) => {
    const r = T.down(n);
    if (r.advanced) advanced++;
    T.up(n);
  });
  check('every note of the scale advances the trainer', advanced === 15, { advanced, rounds: T.rounds, step: T.step });
  check('the scale COMPLETES without MIDI', T.rounds === 1, T.rounds);
  check('progress records the finished round', (T.done['c-major:scales'] | 0) === 1, T.done);
}

// Wrong note does not advance.
{
  const T = PT.Trainer.create({ mode: 'scales', tonicId: 'c-major', rand: () => 0 });
  const r = T.down(49); // C#
  check('a wrong pitch does not advance', r.advanced === false && T.step === 0);
  T.up(49);
  const ok = T.down(48);
  check('the right pitch then does', ok.advanced === true && T.step === 1);
}

// ---- PLAY a C major triad (chords mode) -------------------------------------
{
  const T = PT.Trainer.create({ mode: 'chords', tonicId: 'c-major', rand: () => 0 });
  const want = T.want();
  check('first chord of C is C E G', want.join(',') === '48,52,55', want);
  T.down(48); T.down(52);
  check('two notes of a triad are not enough', T.step === 0);
  const r = T.down(55);
  check('holding the whole triad advances', r.advanced === true && T.step === 1);
  const names = [];
  T.target.forEach((ch) => names.push(PT.chordName(ch)));
  check('the seven triads of C are named', names[0] === 'C major' && names[5] === 'A minor' && names[6] === 'B diminished', names);
}

// ---- PLAY fifths around the circle ------------------------------------------
{
  const T = PT.Trainer.create({ mode: 'fifths', tonicId: 'c-major', rand: () => 0 });
  check('fifths walk all seven degrees', T.target.length === 7, T.target.length);
  const first = T.want();
  check('first fifth of C is C then G', first.join(',') === '48,55', first);
  T.down(48); T.down(55);
  check('playing the pair advances', T.step === 1);
}

// ---- SCORE a quiz -----------------------------------------------------------
{
  const rand = seeded(0xC0FFEE);
  const fifth = PT.quizItem(rand, { type: 'fifth' });
  check('a fifth question has four options and a prompt',
    !!(fifth.prompt && fifth.answer && fifth.options.length === 4 && fifth.options.indexOf(fifth.answer) >= 0), fifth);
  const right = PT.scoreQuiz(fifth, fifth.answer);
  const wrong = PT.scoreQuiz(fifth, fifth.options.filter((o) => o !== fifth.answer)[0]);
  check('the right fifth scores', right.ok === true && right.delta === 1, right);
  check('a wrong fifth does not', wrong.ok === false && wrong.delta === 0, wrong);

  const chordQ = PT.quizItem(rand, { type: 'chord' });
  check('a chord question names a real chord',
    !!(chordQ.prompt && chordQ.answer && chordQ.options.length === 4), chordQ);
  check('answering the chord name scores', PT.scoreQuiz(chordQ, chordQ.answer).ok === true);

  const sigQ = PT.quizItem(rand, { type: 'signature' });
  check('a key-signature question includes its answer',
    /Key signature/.test(sigQ.prompt) && sigQ.options.indexOf(sigQ.answer) >= 0 && sigQ.options.length === 4, sigQ);
  const relQ = PT.quizItem(rand, { type: 'relative' });
  check('relative minor of a major is in the options',
    /Relative minor/.test(relQ.prompt) && relQ.options.indexOf(relQ.answer) >= 0, relQ);
  check('C major\'s relative minor is Am', PT.REL_MIN[PT.FIFTHS.indexOf('C')] === 'Am');

  const playQ = PT.quizItem(rand, { type: 'play' });
  check('a play question can be answered by tapping a key (no MIDI)',
    playQ.type === 'play' && playQ.midi != null && PT.scoreQuiz(playQ, playQ.midi).ok === true, playQ);
  check('…and also by picking the note name', PT.scoreQuiz(playQ, playQ.answer).ok === true);
}

{
  const T = PT.Trainer.create({ mode: 'quiz', tonicId: 'c-major', rand: seeded(7) });
  check('quiz mode deals a question', !!(T.quiz && T.quiz.answer && T.quiz.options.length === 4), T.quiz);
  const r = T.answer(T.quiz.answer);
  check('a correct tap on a quiz option increments the score', r.ok === true && T.quizScore === 1 && T.quizAsked === 1, r);
  const miss = T.answer('NOT-A-CHORD');
  check('a miss keeps the score and breaks the streak', miss.ok === false && T.quizScore === 1 && T.quizStreak === 0, miss);
}

{
  const T = PT.Trainer.create({ mode: 'quiz', rand: () => 0.9 });
  // force a play question
  T.quiz = PT.quizItem(() => 0, { type: 'play' });
  const r = T.down(T.quiz.midi);
  check('playing the named key scores the quiz without MIDI', r.ok === true && T.quizScore === 1, r);
}

// ---- saved progress of the CURRENT version still loads ----------------------
{
  const T = PT.Trainer.create({ mode: 'scales', tonicId: 'g-major' });
  T.quizScore = 4; T.rounds = 2; T.done['g-major:scales'] = 2;
  const snap = PT.snapshot(T);
  check('snapshot keeps last key/mode/score', snap.mode === 'scales' && snap.tonicId === 'g-major' && snap.quizScore === 4);
  const fresh = PT.Trainer.create();
  PT.applySave(fresh, { mode: 'chords', tonicId: 'c-major', quizScore: 9, hard: true });
  check('an old save (mode, tonic, score only) still loads',
    fresh.mode === 'chords' && fresh.tonicId === 'c-major' && fresh.quizScore === 9 && fresh.hard === true);
  const empty = PT.Trainer.create();
  PT.applySave(empty, null);
  check('an empty first-run stays on C major scales', empty.mode === 'scales' && empty.tonicId === 'c-major' && empty.quizScore === 0);
}

// ---- source scans a vm cannot run -------------------------------------------
check('home-row A is C3', /KeyA:\s*48/.test(theory) && PT.HOME.KeyA === 48);
check('home-row mapping is used from the keyboard', /PT\.HOME\[e\.code\]/.test(app));
check('MIDI is optional (requestMIDIAccess, never required)', /requestMIDIAccess/.test(app) && !/requires.*midi/i.test(JSON.stringify(manifest)));
check('Web Audio actually plays', /AudioContext/.test(sound) && /createBuffer/.test(sound) && /createBufferSource/.test(sound));
check('progress is written to gifos.db save', /db\('save'\)/.test(app) && /db\('room'\)/.test(app));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html) && !/id=["']invite/i.test(html));
check('together copy points at OS Invite', /Invite in the GifOS menu/.test(app) || /Invite in the GifOS menu/.test(html));
check('phone keys: pointer tracking + capture', /pointerdown/.test(app) && /pointermove/.test(app) && /pointerId/.test(app) && /setPointerCapture/.test(app));
check('phone keys: touch-action none on the piano', /\.piano[^}]*touch-action:\s*none/.test(css.replace(/\s+/g, ' ')));
check('on-screen keys carry midi + a label', /data-midi/.test(app) && /className = 'letter'/.test(app) || /\.letter/.test(css));
check('circle of fifths is a mode with a wheel', /fifths/.test(html) && /id="circle"/.test(html) && /wedge/.test(app));
check('Hear plays the next notes', /id="hearBtn"/.test(html) && /playList/.test(app));
check('hidden quiz cannot leak into other modes', /\[hidden\]/.test(css) && /display:\s*none\s*!important/.test(css.replace(/\s+/g, ' ')));
check('quiz prompts are not ambiguous scale-starts-on', !/Which scale starts on/.test(theory));
check('empty first-run paints a coach line', /id="coach"/.test(html) && /Gold keys are next/.test(app));
check('gifos.onBack is registered', /gifos\.onBack/.test(app));
check('no Tauri / CRA / Sentry / CDN samples',
  !/src-tauri|@tauri-apps|react-scripts|create-react-app|tauri-plugin-sentry|gleitz|soundfont-player/i.test(app + sound + theory + html));
check('no remote URLs in the entry', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
check('minBuild stays 947', manifest.minBuild === 947);
check('db + multiplayer, no network',
  manifest.capabilities.db === true && manifest.capabilities.multiplayer === true && !manifest.capabilities.network);
check('save is private, room is shared',
  manifest.data.save.visibility === 'private' && manifest.data.room.visibility === 'read-write');
check('listing is a port of Zane Helton, not GifOS',
  listing.author.name === 'Zane Helton' && listing.porter.name === 'GifOS' && listing.basedOn.name === 'Piano Trainer' && listing.basedOn.blessed === false);
check('tagline fits a card', listing.tagline.length > 8 && listing.tagline.length < 80);
check('description leads with no-account / the file',
  /no account/i.test(listing.description) && /file/.test(listing.description) && /unofficial port/i.test(listing.description));
check('listing does not name internals',
  !/gifos\.db|WASM|sandbox|localStorage|WebRTC/.test(JSON.stringify(listing)));
check('help.md is a real help page', help.length >= 400 && /home row/i.test(help) && /Quiz/.test(help));
check('help.md does not re-document OS chrome', !/\bInvite\b/.test(help) && !/\bSteal\b/.test(help));
check('no How-to-play button inside the app', !/how to play/i.test(html));

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall ' + (process.stdout.isTTY ? '' : '') + 'PASS');
