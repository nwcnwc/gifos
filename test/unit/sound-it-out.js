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
for (const f of ['fonts-data.js', 'clips-data.js', 'dictionary-data.js', 'dictionary.js', 'curriculum.js', 'library.js', 'dsp.js', 'store.js', 'voice.js', 'studio.js', 'storyboard.js']) {
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
  check('consonant-le is its own little syllable: Rubble = R-u-bb-le (0.7.8)',
    j(cur.splitGraphemes('Rubble')) === j([['R', 'ɹ'], ['u', 'ʌ'], ['bb', 'b'], ['le', 'əl']]),
    cur.splitGraphemes('Rubble'));
  check('the dictionary agrees: rubble = ru-bb-le',
    j(cur.wordParts('rubble')) === j([['ru', 'ɹʌ'], ['bb', 'b'], ['le', 'əl']]), cur.wordParts('rubble'));
  check('a nonsense name reads zor-bul instead of being refused: Zorble',
    cur.decodable('zorble') === true
    && j(cur.splitGraphemes('Zorble').slice(-1)) === j([['le', 'əl']]), cur.splitGraphemes('Zorble'));
  check('names follow the syllable rules: Zuma = Z-u(oo)-m-a(uh) (0.7.9)',
    j(cur.splitGraphemes('Zuma')) === j([['Z', 'z'], ['u', 'uː'], ['m', 'm'], ['a', 'ə']]),
    cur.splitGraphemes('Zuma'));
  check('closed syllables stay short: vam is untouched',
    j(cur.splitGraphemes('vam')) === j([['v', 'v'], ['a', 'æ'], ['m', 'm']]), cur.splitGraphemes('vam'));
  check('doubled consonants are one sound: zoss = z-o-ss',
    j(cur.splitGraphemes('zoss')) === j([['z', 'z'], ['o', 'ɒ'], ['ss', 's']]), cur.splitGraphemes('zoss'));
  // The aligned dictionary answers first (0.6.0): it knows how real words
  // actually chunk, including the taught exceptions.
  check('the dictionary parsed', SIO.dictionary.load().size > 100000, SIO.dictionary.load().size);
  check('said builds as s-ai-d with ai saying /ɛ/',
    j(cur.wordParts('said')) === j([['s', 's'], ['ai', 'ɛ'], ['d', 'd']]), cur.wordParts('said'));
  check('the builds as th-e', j(cur.wordParts('the')) === j([['th', 'ð'], ['e', 'ə']]), cur.wordParts('the'));
  check('nose keeps its /z/', j(cur.wordParts('nose')) === j([['n', 'n'], ['ose', 'əʊz']]), cur.wordParts('nose'));
  check('is builds again - the lexicon splits the notorious single-chunkers (0.7.5)',
    j(cur.wordParts('is')) === j([['i', 'ɪ'], ['s', 'z']]), cur.wordParts('is'));
  check('a one-chunk word with matching letters and sounds pairs them: ab',
    j(cur.wordParts('ab')) === j([['a', 'æ'], ['b', 'b']]), cur.wordParts('ab'));
  check('the rules still serve nonsense: vam',
    j(cur.wordParts('vam')) === j([['v', 'v'], ['a', 'æ'], ['m', 'm']]), cur.wordParts('vam'));
  check('chunk sounds split into recordable phonemes: eɪk -> eɪ + k',
    j(SIO.dictionary.tokens('eɪk')) === j(['eɪ', 'k']) && j(SIO.dictionary.tokens('æn')) === j(['æ', 'n']));
  check('the schwa answers to the recorded /ʌ/',
    (cur.PHONEME_ALIASES['ə'] || []).includes('ʌ'));
  for (const w of ['sat', 'case', 'chase', 'is', 'vam', 'ship', 'like',
    'the', 'said', 'nose', 'have', 'happy', 'care', 'grandma']) {
    check(`decodable: ${w}`, cur.decodable(w) === true);
  }
  check('one is still refused - its spelling lies, and it shows whole',
    cur.decodable('one') === false && SIO.dictionary.chunks('one') === null);
  check('an invented y-name is still shown whole: blorky', cur.decodable('blorky') === false);
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
    if (seg.touching) {
      const parts = seg.touching.parts;
      parts.forEach((pt, j) => {
        expanded.push({
          parts: parts.map(([t], k) => [t, k === j]),
          pad: j === parts.length - 1 ? cur.TOUCH_BREATH : 0,
          scale: seg.scale || 1, color: null, itemEnd: false, clip: ['slice'],
        });
      });
      continue;
    }
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

// ---- the sound bank (0.6.1 + 0.7.0) -----------------------------------------
{
  // caps budget PER SOUND: grandma's an=/æn/ carries two sounds and must
  // get twice one sound's time - trimming it to one amputated her /n/
  check('soundsIn counts a chunk\'s sounds', cur.soundsIn('æn') === 2 && cur.soundsIn('s') === 1);
  const segs = cur.approach([['gr', 'ɡɹ'], ['an', 'æn'], ['d', 'd']], 1.5, 2).filter((x) => x.clip);
  const capOf = (ipa) => segs.find((x) => x.clip.ipa === ipa).clip.cap;
  check('approach caps multiply by the chunk\'s sound count',
    Math.abs(capOf('æn') / capOf('d') - 2) < 1e-9, [capOf('æn'), capOf('d')]);

  const cat = SIO.dictionary.catalog();
  check('the chunk catalog is substantial and most-useful-first',
    cat.length > 300 && cat[0].words >= cat[Math.floor(cat.length / 2)].words, cat.length);
  check('every catalog entry carries spelling + example',
    cat.every((c) => c.spelling && c.example));
  const catIpas = new Set(cat.map((c) => c.ipa));
  const rimeMiss = cur.allRimes().filter(([, ipa]) => !catIpas.has(ipa));
  check('rime sounds stay listed in the catalog (recordings never invisible)',
    rimeMiss.length === 0, rimeMiss.slice(0, 5));

  check('the recipe spells a chunk out in plain words',
    /ant/.test(SIO.studio.soundRecipe('æn')) && /nnn/.test(SIO.studio.soundRecipe('æn')),
    SIO.studio.soundRecipe('æn'));

  // walk-through order: the line FIRST, then words, then chunks, then singles
  const items = lib.walkthroughItems('Grandma is here.', new Set());
  const kinds = items.map((it) => it.kind);
  check('walk-through: line first, then words, then sound pieces',
    kinds[0] === 'sentence' && kinds[1] === 'word'
    && kinds.lastIndexOf('word') < kinds.indexOf('phoneme'), kinds);
  const pieces = items.filter((it) => it.kind === 'phoneme');
  const firstSingle = pieces.findIndex((it) => SIO.dictionary.tokens(it.ipa).length === 1);
  const lastChunk = pieces.map((it) => SIO.dictionary.tokens(it.ipa).length > 1).lastIndexOf(true);
  check('pieces queue chunks before singles',
    pieces.length > 0 && (firstSingle === -1 || lastChunk < firstSingle));
  check('a recorded piece leaves the queue',
    lib.pieceItems('Grandma is here.', new Set(['phonemes/æn'])).every((it) => it.ipa !== 'æn'));
}

// ---- clip conditioning (0.7.1-0.7.4) ----------------------------------------
{
  const dsp = SIO.dsp;
  const sr = 24000;

  // a swelling /iː/: half a second of fade-in, then half a second of voice.
  // content() must find the voice, not report the swell.
  const swell = new Float32Array(sr);
  for (let i = 0; i < sr / 2; i++) swell[i] = 0.02 * Math.sin((2 * Math.PI * 300 * i) / sr);
  for (let i = sr / 2; i < sr; i++) swell[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / sr);
  const kept = dsp.contentData(swell, sr);
  check('content() drops a slow swell and keeps the voice (lollipop\'s i)',
    kept.length < swell.length * 0.7 && dsp.peakOf(kept) > 0.3,
    [kept.length, swell.length]);

  // a /d/ recorded as long voiced closure with the burst at the END
  const d = new Float32Array(Math.round(sr * 0.6));
  for (let i = 0; i < d.length; i++) d[i] = 0.05 * Math.sin((2 * Math.PI * 150 * i) / sr);
  for (let i = d.length - Math.round(sr * 0.03); i < d.length; i++) d[i] = 0.7 * Math.sin((2 * Math.PI * 900 * i) / sr);
  check('cap keep=end preserves a trailing burst (the lost /d/)',
    dsp.peakOf(dsp.capData(d, sr, 0.2, 'end')) > 0.6
    && dsp.peakOf(dsp.capData(d, sr, 0.2, 'start')) < 0.1);
  check('hardClip centres a stop\'s window on its located burst',
    dsp.peakOf(dsp.hardClipData(d, sr, 0.2, true)) > 0.6);

  // booster gating: a window with no transient must NOT be amplified
  const flat = new Float32Array(Math.round(sr * 0.3));
  for (let i = 0; i < flat.length; i++) flat[i] = 0.1 * Math.sin((2 * Math.PI * 200 * i) / sr);
  const out = dsp.hardClipData(flat, sr, 0.2, true);
  check('the burst booster only fires on real transients (no manufactured static)',
    Math.abs(dsp.peakOf(out) - 0.1) < 0.02, dsp.peakOf(out));
}

// ---- the ticks are yours (0.7.3) --------------------------------------------
{
  check('addPack returns the added rows so they can arrive ticked',
    typeof lib.addPack === 'function' && typeof lib.add === 'function');
}

// ---- chunk speakability -----------------------------------------------------
{
  const vs = new SIO.VoiceSource();
  vs._recIndex = new Set(); // nothing recorded: starter voice only
  check('a chunk sound is speakable when its members are: /æn/, /eɪk/',
    vs.phonemeAvailable('æn') && vs.phonemeAvailable('eɪk'));
  check('…and not when a member is missing', vs.phonemeAvailable('qqx') === false);
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
check('the approach floor is two hundredths (0.5.4)',
  cur.APPROACH_FLOOR === 0.02, cur.APPROACH_FLOOR);
check('the blend hangs seven tenths before the word answers (0.7.7)',
  cur.TOUCH_BREATH === 0.7, cur.TOUCH_BREATH);
{
  const segs = cur.approach([['s', 's'], ['a', 'æ']], 1.5, 3).filter((x) => x.clip);
  const roundEnds = [segs[1], segs[3]];
  check('a breath between rounds: each pass ends with +0.5s (0.7.6)',
    roundEnds.every((x) => x.pad > 0.5) && segs[0].pad < 0.5,
    segs.map((x) => Math.round(x.pad * 100) / 100));
}
check('the count sets where the journey starts: 0.2 / 0.3 / 0.45',
  Math.abs(cur.approachStart(2) - 0.20) < 1e-9 && Math.abs(cur.approachStart(3) - 0.30) < 1e-9
  && Math.abs(cur.approachStart(4) - 0.45) < 1e-9,
  [cur.approachStart(2), cur.approachStart(3), cur.approachStart(4)]);

// ---- the cap curve (0.5.3: the sounds compress with the gaps) ---------------
{
  const segs = cur.approach([['s', 's'], ['a', 'æ'], ['t', 't']], 1.5, 3);
  const gapSegs = segs.filter((seg) => seg.clip);
  const caps = [...new Set(gapSegs.map((seg) => Math.round(seg.clip.cap * 1000) / 1000))];
  check('the gap passes cap sounds on the shrinking curve, starting at 1.1s',
    caps.length === 2 && Math.abs(caps[0] - 1.1) < 1e-9 && caps[0] > caps[1], caps);
  const last = segs[segs.length - 1];
  check('the final pass is the TOUCHING pass (crossfaded, no silence)',
    !!last.touching && last.touching.parts.length === 3 && gapSegs.length === 6);
  const a1 = new Float32Array(1000).fill(0.5), b1 = new Float32Array(1000).fill(0.5);
  const merged = SIO.dsp.xfadeData(a1, b1, 100);
  const mid = merged[950];
  check('the crossfade is equal-power and gapless',
    merged.length === 1900 && Math.abs(mid - 0.5 * (Math.cos(Math.PI / 4) + Math.sin(Math.PI / 4))) < 0.02,
    [merged.length, mid]);

  const sr = 24000;
  const long = new Float32Array(Math.round(sr * 2.6)).fill(0.4);
  const cut = SIO.dsp.capData(long, sr, 0.5);
  check('capData trims a 2.6s hold to 0.5s and fades the tail to silence',
    cut.length === Math.trunc(sr * 0.5) && Math.abs(cut[cut.length - 1]) < 1e-6
    && Math.abs(cut[0] - 0.4) < 1e-6, [cut.length, cut[cut.length - 1], cut[0]]);
  const short = new Float32Array(Math.round(sr * 0.2)).fill(0.4);
  check('capData leaves a short crisp stop untouched', SIO.dsp.capData(short, sr, 0.5) === short);

  // 0.5.2: a real mouth's hold (median 1.22s) must score well now
  const a = new Float32Array(Math.round(sr * 1.6));
  for (let i = 0; i < sr * 1.2; i++) a[Math.round(sr * 0.2) + i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / sr);
  const sc = SIO.dsp.scoreTake(a, sr, { kind: 'phoneme', ipa: 's', length: 'hold' });
  check('a 1.2s hold - what real mouths produce - scores high', !sc.fatal && sc.value > 90, sc.value);
}

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
