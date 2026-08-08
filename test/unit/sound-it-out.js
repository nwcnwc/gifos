// THE SOUND-IT-OUT PORT IS HELD AGAINST ITS PYTHON ORIGINAL, MECHANICALLY.
//
// apps/sound-it-out is a port of the sound-it-out desktop app's curriculum
// (gen/levels.py), and a port of a curriculum is exactly the kind of code that
// rots invisibly: a wrong pad or a missing highlight is not a crash, it is a
// subtly worse video that nobody re-watches frame by frame. So the desktop
// pipeline writes a fixture (tools/gen-clips.py -> curriculum-fixture.json:
// every segment gen/levels.py produces for the fixed levels, parts,
// highlights, pads, clip requests and all) and this suite replays the SAME
// levels through the shipped curriculum.js and compares segment by segment.
//
// It also guards the bundle-completeness invariant the whole voice design
// rests on: every clip the curriculum can request from the built-in tier must
// exist in clips-data.js — phonemes are never synthesised at runtime, so a
// missing bundled phoneme is a silently mute letter, forever.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'sound-it-out');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// ---- load the shipped modules exactly as the GIF would run them -------------
const sandbox = { window: {}, atob, btoa, console };
vm.createContext(sandbox);
for (const f of ['fonts-data.js', 'clips-data.js', 'wordlist.js', 'curriculum.js', 'openended.js', 'dsp.js', 'storyboard.js']) {
  vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
}
const SIO = sandbox.window.SIO;
const CLIPS = sandbox.window.SIO_CLIPS;
check('modules load and attach window.SIO', !!(SIO && SIO.curriculum && SIO.wordlist && SIO.openended && SIO.dsp && SIO.storyboard));

const groups = SIO.wordlist.parse(SIO.wordlist.DEFAULT_TEXT);

// ---- word list parser -------------------------------------------------------
check('default list parses into the four groups',
  groups.map((g) => g.name).join('|') === 'Paw Patrol|People|Home|First words',
  groups.map((g) => g.name));
check('default list has the expected word count', SIO.wordlist.allWords(groups).length === 53,
  SIO.wordlist.allWords(groups).length);
check('per-word colours survive parsing', SIO.wordlist.colors(groups).Chase === '#4da6ff');
check('placeholder names are detected', SIO.wordlist.placeholders(groups).length >= 5);

// ---- curriculum parity with gen/levels.py -----------------------------------
const fixturePath = path.join(APP, 'tools', 'curriculum-fixture.json');
if (!fs.existsSync(fixturePath)) {
  check('curriculum fixture exists (tools/gen-clips.py writes it)', false);
} else {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const clipTuple = (c) => {
    if (c.kind === 'phoneme') return ['phoneme', c.ipa];
    if (c.kind === 'word') return ['word', c.text.toLowerCase(), !!c.slow];
    if (c.kind === 'blend') return ['blend', c.ipas.join('')];
    if (c.kind === 'sentence') return ['sentence', SIO.curriculum.sentenceKey(c.text)];
    return ['?'];
  };
  const opts = { reps: 3, pauseSeconds: 1.2, nonsense: true };
  for (const key of Object.keys(fixture)) {
    const m = /^(\d+)(?:\/stage(\d))?$/.exec(key);
    const level = Number(m[1]);
    const o = m[2] ? Object.assign({}, opts, { stage: Number(m[2]) }) : opts;
    let segs;
    try {
      segs = SIO.curriculum.build(level, o, groups);
    } catch (e) {
      check(`level ${key}: builds`, false, String(e.message));
      continue;
    }
    const want = fixture[key];
    let mismatch = null;
    if (segs.length !== want.length) {
      mismatch = { reason: 'segment count', js: segs.length, py: want.length };
    } else {
      for (let i = 0; i < segs.length && !mismatch; i++) {
        const s = segs[i], w = want[i];
        const jsParts = JSON.stringify(s.parts.map(([t, h]) => [t, !!h]));
        if (jsParts !== JSON.stringify(w.parts)) mismatch = { i, reason: 'parts', js: s.parts, py: w.parts };
        else if (Math.abs(s.pad - w.pad) > 1e-3) mismatch = { i, reason: 'pad', js: s.pad, py: w.pad };
        else if (Math.abs((s.scale || 1) - w.scale) > 1e-9) mismatch = { i, reason: 'scale', js: s.scale, py: w.scale };
        else if ((s.color || null) !== (w.color || null)) mismatch = { i, reason: 'color', js: s.color, py: w.color };
        else if (!!s.itemEnd !== !!w.itemEnd) mismatch = { i, reason: 'itemEnd', js: s.itemEnd, py: w.itemEnd };
        else if (JSON.stringify(clipTuple(s.clip)) !== JSON.stringify(w.clip)) mismatch = { i, reason: 'clip', js: clipTuple(s.clip), py: w.clip };
      }
    }
    check(`level ${key}: ${want.length} segments match gen/levels.py exactly`, !mismatch, mismatch);
  }
}

// ---- bundle completeness ----------------------------------------------------
// Re-enumerate from the shipped curriculum (never trust a stale requests.json)
// and demand every request resolves in clips-data.js.
{
  const missing = [];
  const seen = new Set();
  const collect = (segs) => {
    for (const seg of segs) {
      const c = seg.clip;
      let table, key;
      if (c.kind === 'phoneme') { table = 'phonemes'; key = c.ipa; }
      else if (c.kind === 'word') { table = c.slow ? 'wordsSlow' : 'words'; key = c.text.toLowerCase(); }
      else if (c.kind === 'blend') { table = 'blends'; key = c.ipas.join(''); }
      else { table = 'sentences'; key = SIO.curriculum.sentenceKey(c.text); }
      const sk = table + '/' + key;
      if (seen.has(sk)) continue;
      seen.add(sk);
      if (!CLIPS.clips[table] || CLIPS.clips[table][key] === undefined) missing.push(sk);
    }
  };
  const opts = { reps: 3, pauseSeconds: 1.2, nonsense: true };
  for (let level = 1; level <= 9; level++) collect(SIO.curriculum.build(level, opts, groups));
  for (const stage of [1, 2, 3]) collect(SIO.curriculum.build(12, Object.assign({}, opts, { stage }), groups));
  check(`every curriculum clip request (${seen.size}) is in the bundle`, missing.length === 0, missing.slice(0, 8));
  check('bundle is the built-in voice, not a placeholder', !/placeholder/.test(CLIPS.voice || ''), CLIPS.voice);
  const b64ish = Object.values(CLIPS.clips.phonemes)[0] || '';
  check('bundled clips look like base64 mp3 payloads', b64ish.length > 500 && /^[A-Za-z0-9+/=]+$/.test(b64ish.slice(0, 100)));
}

// ---- open-ended levels ------------------------------------------------------
{
  const oe = SIO.openended;
  check('splitSentences: empty in, empty out', oe.splitSentences('').length === 0);
  const long = oe.splitSentences('one two three four five six seven eight nine ten eleven twelve thirteen fourteen.');
  check('splitSentences: an over-long line is chopped, never dropped',
    long.length >= 2 && long.every((l) => l.split(/\s+/).length <= oe.MAX_WORDS), long);
  const s1 = oe.storySoFar(1), s2 = oe.storySoFar(2), s3 = oe.storySoFar(3);
  check('the story grows with the stages', s1.length > 0 && s1.length < s2.length && s2.length < s3.length,
    [s1.length, s2.length, s3.length]);
  const taught1 = oe.taughtLetters(1);
  check('stage 1 lines use only taught letters',
    s1.every((line) => [...line.toLowerCase().replace(/[^a-z]/g, '')].every((c) => taught1.has(c))));
  const a = oe.fromWordlist(groups), b = oe.fromWordlist(groups);
  check('level 11 is deterministic for the same word list',
    a.length > 0 && JSON.stringify(a) === JSON.stringify(b));
}

// ---- fitting (gen/service.py port) ------------------------------------------
{
  const mk = (n) => { // n items, each 2 segments of 5s
    const segs = [];
    for (let i = 0; i < n; i++) {
      segs.push({ id: i + 'a', itemEnd: false }, { id: i + 'b', itemEnd: true });
    }
    return segs;
  };
  const durOf = () => 5;
  const cut = SIO.storyboard.wholeItemsUpto(mk(5), durOf, 25, false);
  check('trim cuts at item ends, landing nearest the target', cut.length === 4, cut.length);
  const tiny = SIO.storyboard.wholeItemsUpto(mk(5), durOf, 3, false);
  check('a request shorter than one item still keeps the first item whole', tiny.length === 2, tiny.length);
  const empty = SIO.storyboard.wholeItemsUpto(mk(5), durOf, 3, true);
  check('allowEmpty may return nothing', empty.length === 0, empty.length);
  const o6 = SIO.storyboard.levelOpts(6, { minutes: 30, reps: 3 });
  check('level 6 stretches reps instead of repeating', o6.reps === 4, o6.reps);
  check('other levels keep their reps', SIO.storyboard.levelOpts(5, { minutes: 30, reps: 3 }).reps === 3);
}

// ---- the DSP port -----------------------------------------------------------
{
  const dsp = SIO.dsp;
  const sr = 24000;

  const silence = new Float32Array(sr);
  const sil = dsp.scoreTake(silence, sr, { kind: 'phoneme', ipa: 's', length: 'hold' });
  check('digital silence is fatal, never scored', !!sil.fatal);

  // a clean 2s held tone with room-tone either side
  const clean = new Float32Array(Math.round(sr * 2.4));
  for (let i = 0; i < sr * 2; i++) clean[Math.round(sr * 0.2) + i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / sr);
  const good = dsp.scoreTake(clean, sr, { kind: 'phoneme', ipa: 's', length: 'hold' });
  check('a clean held take scores high', !good.fatal && good.value > 80, { fatal: good.fatal, value: good.value });

  // a "fricative" (white noise, centroid ~ sr/4) with a low "uh" tail
  const n = Math.round(sr * 0.65);
  const schwa = new Float32Array(n);
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x40000000 - 1; };
  for (let i = 0; i < Math.round(sr * 0.45); i++) schwa[i] = 0.3 * rnd();
  for (let i = Math.round(sr * 0.45); i < n; i++) schwa[i] = 0.35 * Math.sin((2 * Math.PI * 300 * i) / sr);
  check('the schwa detector hears an "uh" after a fricative', dsp.schwaTail(schwa, sr, 's') !== null);
  const noTail = schwa.slice(0, Math.round(sr * 0.45));
  check('…and stays quiet when there is none', dsp.schwaTail(noTail, sr, 's') === null);

  const st = dsp.stretch(new Float32Array(sr).fill(0.1), sr, 0.8);
  check('the time-stretch lands within 1% of the asked-for length',
    Math.abs(st.length - sr / 0.8) < sr * 0.01, st.length);
}

console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
