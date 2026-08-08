// THE SOUND-IT-OUT PORT IS HELD AGAINST ITS PYTHON ORIGINAL, MECHANICALLY.
//
// apps/sound-it-out is a port of the sound-it-out desktop app (0.4.x: the
// sentence-library design), and a port of a curriculum is exactly the kind of
// code that rots invisibly: a wrong pad or a missing highlight is not a
// crash, it is a subtly worse video that nobody re-watches frame by frame.
// The desktop pipeline writes a fixture (tools/gen-clips.py: every segment
// gen/levels.py's library builder produces for a canonical library) and this
// suite replays the SAME library through the shipped curriculum.js and
// compares segment by segment.
//
// It also guards the bundle-completeness invariant the voice design rests
// on: every clip the starter packs can request must exist in clips-data.js -
// phonemes are never synthesised at runtime, so a missing bundled phoneme is
// a silently mute letter, forever.
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
for (const f of ['fonts-data.js', 'clips-data.js', 'curriculum.js', 'library.js', 'dsp.js', 'store.js', 'voice.js', 'storyboard.js']) {
  vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
}
const SIO = sandbox.window.SIO;
const CLIPS = sandbox.window.SIO_CLIPS;
check('modules load and attach window.SIO',
  !!(SIO && SIO.curriculum && SIO.library && SIO.dsp && SIO.storyboard));

const cur = SIO.curriculum, lib = SIO.library;

// ---- word mechanics ---------------------------------------------------------
{
  const j = (x) => JSON.stringify(x);
  check('magic-e splits onset + rime: case = c + ase',
    j(cur.splitGraphemes('case')) === j([['c', 'k'], ['ase', 'eɪs']]), cur.splitGraphemes('case'));
  check('digraph + rime: Chase = Ch + ase',
    j(cur.splitGraphemes('Chase')) === j([['Ch', 'tʃ'], ['ase', 'eɪs']]), cur.splitGraphemes('Chase'));
  check('the rime softens c: face = f + ace said /eɪs/',
    j(cur.splitGraphemes('face')) === j([['f', 'f'], ['ace', 'eɪs']]), cur.splitGraphemes('face'));
  check('the rime softens g: cage = c + age said /eɪdʒ/',
    j(cur.splitGraphemes('cage')) === j([['c', 'k'], ['age', 'eɪdʒ']]), cur.splitGraphemes('cage'));
  check('the voiced-s lexicon wins: is = i + /z/',
    j(cur.wordParts('is')) === j([['i', 'ɪ'], ['s', 'z']]), cur.wordParts('is'));
  for (const w of ['sat', 'case', 'chase', 'is', 'vam', 'ship', 'like']) {
    check(`decodable: ${w}`, cur.decodable(w) === true);
  }
  for (const w of ['the', 'said', 'have', 'happy', 'one', 'nose', 'care']) {
    check(`NOT decodable (taught whole): ${w}`, cur.decodable(w) === false);
  }
  check('entry kinds: letter / word / sentence',
    lib.entryKind('s') === 'letter' && lib.entryKind('Chase') === 'word'
    && lib.entryKind('Sam sat.') === 'sentence' && lib.entryKind('a') === 'letter');
}

// ---- curriculum parity with gen/levels.py -----------------------------------
const fixturePath = path.join(APP, 'tools', 'curriculum-fixture.json');
if (!fs.existsSync(fixturePath)) {
  check('curriculum fixture exists (tools/gen-clips.py writes it)', false);
} else {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const clipTuple = (c) => {
    if (c.kind === 'phoneme') return ['phoneme', c.ipa];
    if (c.kind === 'word') return ['word', c.text.toLowerCase(), !!c.slow];
    if (c.kind === 'sentence') return ['sentence', cur.sentenceKey(c.text)];
    return ['?'];
  };
  // Expand the JS builder's output to the Python fixture's shape: the
  // read-along marker becomes one slice row per word.
  const segs = cur.library(fixture.library, fixture.opts);
  const expanded = [];
  for (const seg of segs) {
    if (!seg.readalong) {
      expanded.push({
        parts: seg.parts.map(([t, h]) => [t, !!h]),
        pad: seg.pad, scale: seg.scale || 1, color: seg.color || null,
        itemEnd: !!seg.itemEnd, clip: clipTuple(seg.clip),
      });
      continue;
    }
    const words = seg.readalong.text.split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      const parts = [];
      words.forEach((other, j) => {
        if (j) parts.push([' ', false]);
        parts.push([other, j === i]);
      });
      const last = i === words.length - 1;
      expanded.push({
        parts, pad: last ? seg.pad : 0, scale: seg.readalong.scale, color: null,
        itemEnd: last ? !!seg.itemEnd : false, clip: ['slice'],
      });
    });
  }
  const want = fixture.segments;
  let mismatch = null;
  if (expanded.length !== want.length) {
    mismatch = { reason: 'segment count', js: expanded.length, py: want.length };
  } else {
    for (let i = 0; i < expanded.length && !mismatch; i++) {
      const s = expanded[i], w = want[i];
      if (JSON.stringify(s.parts) !== JSON.stringify(w.parts)) mismatch = { i, reason: 'parts', js: s.parts, py: w.parts };
      else if (Math.abs(s.pad - w.pad) > 1e-3) mismatch = { i, reason: 'pad', js: s.pad, py: w.pad };
      else if (Math.abs(s.scale - w.scale) > 1e-9) mismatch = { i, reason: 'scale', js: s.scale, py: w.scale };
      else if ((s.color || null) !== (w.color || null)) mismatch = { i, reason: 'color', js: s.color, py: w.color };
      else if (s.itemEnd !== !!w.itemEnd) mismatch = { i, reason: 'itemEnd', js: s.itemEnd, py: w.itemEnd };
      else if (JSON.stringify(s.clip) !== JSON.stringify(w.clip)) mismatch = { i, reason: 'clip', js: s.clip, py: w.clip };
    }
  }
  check(`library builder: ${want.length} segments match gen/levels.py exactly`, !mismatch, mismatch);
}

// ---- the two-voice policy ---------------------------------------------------
// The bundle is the STARTER VOICE and nothing else: the app author's own
// recordings - every sound, every rime, every pack word and line - shipped so
// a buildup is never two voices and every shipped pack is READY on day one.
{
  const inTable = (table, key) => {
    const t = CLIPS.clips[table];
    if (!t) return false;
    if (t[key] !== undefined) return true;
    return (cur.PHONEME_ALIASES[key] || []).some((a) => t[a] !== undefined);
  };
  check('the bundle is the starter voice, nothing synthetic',
    /starter/.test(CLIPS.voice || '') && !/kokoro/i.test(CLIPS.voice || ''), CLIPS.voice);

  const missing42 = cur.PHONEME_ROWS.filter((p) => !inTable('phonemes', p.ipa)).map((p) => p.key);
  check('every one of the 42 sounds has a starter clip', missing42.length === 0, missing42);

  const rimes = cur.allRimes();
  check('the magic-e rule produces 65 rimes', rimes.length === 65, rimes.length);
  const rimeMiss = rimes.filter(([, ipa]) => !inTable('phonemes', ipa)).map(([sp]) => sp);
  check('every rime sound has a starter clip', rimeMiss.length === 0, rimeMiss);

  // every shipped pack is fully covered: letters, words, lines
  const missing = [];
  for (const p of lib.packDefs()) {
    for (const item of p.items) {
      const kind = lib.entryKind(item);
      if (kind === 'letter') {
        const ipa = cur.CVC_PHONEMES[item.toLowerCase()] || item.toLowerCase();
        if (!inTable('phonemes', ipa)) missing.push('sound:' + item);
        continue;
      }
      for (const w of lib.uniqueWords(item)) {
        if (!inTable('words', w.toLowerCase())) missing.push('word:' + w);
      }
      if (kind === 'sentence' && !inTable('sentences', cur.sentenceKey(item))) missing.push('line:' + item);
    }
  }
  check('every pack letter, word and line is covered by the starter voice',
    missing.length === 0, missing.slice(0, 8));

  // the buildup gate: a word whose sounds cannot all be said is shown
  // WHOLE, never half-built (synthetic gate - the real bundle covers all)
  const yes = cur.oneWord('case', 3, 1.2, () => true);
  const no = cur.oneWord('case', 3, 1.2, () => false);
  check('a fully-voiced word builds up', yes.some((seg) => seg.clip.kind === 'phoneme'));
  check('a word with an unsayable sound is shown whole, never half-built',
    no.every((seg) => seg.clip.kind === 'word'), no.map((seg) => seg.clip.kind));

  // readiness: the starter voice makes pack content ready with NOTHING
  // recorded; a family's own words wait for the family's voice
  const rows = [{ id: 's', text: 's' }, { id: 'sat', text: 'sat' },
    { id: 'sam_sat', text: 'Sam sat.' }, { id: 'nana', text: 'Nana' },
    { id: 'nana_is_here', text: 'Nana is here.' }];
  const cold = lib.statusOf(rows, new Set());
  check('unrecorded: starter-covered entries are ready, family words are not',
    cold[0].ready && cold[1].ready && cold[2].ready && !cold[3].ready && !cold[4].ready,
    cold.map((r) => r.ready));
  const warm = lib.statusOf(rows, new Set(['words/nana', 'words/is', 'words/here', 'sentences/nana_is_here']));
  check('recording a family word and line flips them ready',
    warm[3].ready && warm[4].ready, warm.map((r) => r.ready));
}

// ---- packs ------------------------------------------------------------------
{
  const packs = lib.packDefs();
  check('packs exist in both groups',
    packs.some((p) => p.group === 'favourites') && packs.some((p) => p.group === 'skills'));
  check('no pack is empty', packs.every((p) => p.items.length > 0));
  const letterPack = packs.find((p) => p.id === 'letters');
  check('the letters pack is single letters',
    letterPack.items.every((i) => lib.entryKind(i) === 'letter'));
}

// ---- read-along timing ------------------------------------------------------
{
  const n = 1000;
  const audio = new Float32Array(n);
  for (let i = 100; i < 900; i++) audio[i] = 0.5;
  const spans = lib.wordSpans(audio, ['the', 'dog'], [300, 300]);
  check('wordSpans tiles the audio exactly',
    spans[0][0] === 0 && spans[spans.length - 1][1] === n
    && spans.every((s, i) => i === 0 || s[0] === spans[i - 1][1]), spans);
  check('function words are discounted ("the" gets the smaller slice)',
    (spans[0][1] - spans[0][0]) < (spans[1][1] - spans[1][0]), spans);
  check('no words -> one span', JSON.stringify(lib.wordSpans(audio, [], [])) === JSON.stringify([[0, n]]));
}

// ---- the estimate -----------------------------------------------------------
{
  const short = lib.estimateSeconds(['s'], 3, 1.5);
  const sent = lib.estimateSeconds(['Chase is on the case.'], 3, 1.5);
  check('estimate: a letter costs less than a sentence', short > 0 && sent > short, [short, sent]);
  const slower = lib.estimateSeconds(['Chase is on the case.'], 3, 2.5);
  check('estimate tracks the gap option', slower > sent, [sent, slower]);
}

// ---- the neutral-pad rule ---------------------------------------------------
check('the highlight goes out on long pads (NEUTRAL_PAD ported)',
  SIO.storyboard.NEUTRAL_PAD === 0.35, SIO.storyboard.NEUTRAL_PAD);
check('the approach floor pressed closer (50ms)',
  cur.APPROACH_FLOOR === 0.05, cur.APPROACH_FLOOR);

// ---- the DSP port -----------------------------------------------------------
{
  const dsp = SIO.dsp;
  const sr = 24000;

  const silence = new Float32Array(sr);
  const sil = dsp.scoreTake(silence, sr, { kind: 'phoneme', ipa: 's', length: 'hold' });
  check('digital silence is fatal, never scored', !!sil.fatal);

  const clean = new Float32Array(Math.round(sr * 2.4));
  for (let i = 0; i < sr * 2; i++) clean[Math.round(sr * 0.2) + i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / sr);
  const good = dsp.scoreTake(clean, sr, { kind: 'phoneme', ipa: 's', length: 'hold' });
  check('a clean held take scores high', !good.fatal && good.value > 80, { fatal: good.fatal, value: good.value });

  const n = Math.round(sr * 0.65);
  const schwa = new Float32Array(n);
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x40000000 - 1; };
  for (let i = 0; i < Math.round(sr * 0.45); i++) schwa[i] = 0.3 * rnd();
  for (let i = Math.round(sr * 0.45); i < n; i++) schwa[i] = 0.35 * Math.sin((2 * Math.PI * 300 * i) / sr);
  check('the schwa detector hears an "uh" after a fricative', dsp.schwaTail(schwa, sr, 's') !== null);
  check('…and stays quiet when there is none', dsp.schwaTail(schwa.slice(0, Math.round(sr * 0.45)), sr, 's') === null);

  const st = dsp.stretch(new Float32Array(sr).fill(0.1), sr, 0.8);
  check('the time-stretch lands within 1% of the asked-for length',
    Math.abs(st.length - sr / 0.8) < sr * 0.01, st.length);
}

console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
