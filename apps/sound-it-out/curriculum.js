// The reading mechanics, ported from the redesigned sound-it-out (0.4.x):
// gen/levels.py's word-building rules and the library video builder. The
// twelve-level UI is gone upstream — the research-backed progression lives on
// as starter packs of ordinary library entries (see library.js) — so this
// module now holds only what the library video needs: how a word splits into
// sounds, which words may honestly be built up, and the segment builders.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // ---------------------------------------------------------------- content

  // Phonics order, not alphabetical: after s a t p i n a child can already
  // decode sat, pin, tap, nap, pit, tin.
  const SATPIN = [['s', 's'], ['a', 'æ'], ['t', 't'], ['p', 'p'], ['i', 'ɪ'], ['n', 'n']];
  const SET2 = [['m', 'm'], ['d', 'd'], ['g', 'ɡ'], ['o', 'ɒ'], ['c', 'k'], ['k', 'k']];
  const SET3 = [['e', 'ɛ'], ['u', 'ʌ'], ['r', 'ɹ'], ['h', 'h'], ['b', 'b'], ['f', 'f'], ['l', 'l']];

  const CVC_PHONEMES = {
    s: 's', a: 'æ', t: 't', p: 'p', i: 'ɪ', n: 'n', m: 'm',
    d: 'd', g: 'ɡ', o: 'ɒ', c: 'k', k: 'k', e: 'ɛ', u: 'ʌ',
    r: 'ɹ', h: 'h', b: 'b', f: 'f', l: 'l', v: 'v', z: 'z',
    j: 'dʒ', w: 'w', y: 'j', x: 'k', q: 'k',
  };

  // Real decodable nonsense words - a real word can be memorised as a shape,
  // but 'vam' can only be read by actually decoding it. Pack content.
  const CVC_NONSENSE = ['vam', 'zib', 'fot', 'lun', 'dat', 'mip'];

  // Multi-letter graphemes, longest first: "ship" must highlight "sh" as ONE
  // unit, because that is what it is.
  const GRAPHEMES = {
    igh: 'aɪ', air: 'eə', ear: 'ɪə', tch: 'tʃ',
    sh: 'ʃ', ch: 'tʃ', th: 'θ', ng: 'ŋ', ck: 'k',
    ph: 'f', wh: 'w', qu: 'kw',
    ai: 'eɪ', ay: 'eɪ', ee: 'iː', ea: 'iː', oa: 'əʊ',
    ow: 'aʊ', oo: 'uː', oi: 'ɔɪ', oy: 'ɔɪ',
    ar: 'ɑː', or: 'ɔː', er: 'ɜː', ir: 'ɜː', ur: 'ɜː',
  };

  // Magic-e, taught the onset-rime way: "case" is c + ase, said /k/ + /eɪs/.
  // The consonant class is deliberately narrow: no r (r-controlled vowels are
  // a different sound), no v ("have", "give" keep their short vowel and would
  // be taught WRONG as long ones). "nose"-type /z/ words are irregular.
  const MAGIC_E = /[aeiou][bcdfgklmnpstz]e$/;
  const LONG_VOWELS = { a: 'eɪ', e: 'iː', i: 'aɪ', o: 'əʊ', u: 'uː' };
  // Inside a rime the e also softens c and g: "face" is /eɪs/, "cage" is
  // /eɪdʒ/. Everywhere else c stays /k/ and g stays /ɡ/.
  const RIME_CONS = { c: 's', g: 'dʒ' };

  // Buildable exceptions the letter rules cannot produce: the s in these is
  // voiced. Small and explicit beats a clever rule that misfires.
  const WORD_SOUNDS = {
    is: [['i', 'ɪ'], ['s', 'z']],
    his: [['h', 'h'], ['i', 'ɪ'], ['s', 'z']],
    has: [['h', 'h'], ['a', 'æ'], ['s', 'z']],
    as: [['a', 'æ'], ['s', 'z']],
  };

  // Common words the grapheme table gets WRONG - not merely words it cannot
  // split, but words it would split confidently into the wrong sounds ("said"
  // as s-ai-d says "sayed"). Always shown and spoken whole.
  const IRREGULAR_WORDS = new Set([
    'the', 'a', 'an', 'i', 'to', 'of', 'was',
    'said', 'are', 'were', 'you', 'your', 'they', 'their', 'there', 'one',
    'once', 'two', 'who', 'what', 'want', 'we', 'me', 'be', 'he', 'she',
    'my', 'by', 'no', 'go', 'so', 'do', 'into', 'some', 'come', 'love',
    'have', 'give', 'live', 'does', 'gone', 'put', 'pull', 'push', 'full',
    'oh', 'mr', 'mrs', 'any', 'many', 'only', 'very', 'every', 'again',
    'friend', 'school', 'people', 'because', 'could', 'would', 'should',
    'here', 'where', 'little',
    'nose', 'rose', 'close', 'those', 'these', 'chose', 'whose', 'use',
    'wise', 'cheese', 'please',
  ]);

  const PUNCT = /^[.,!?;:‘’“”'"]+|[.,!?;:‘’“”'"]+$/g;
  const cleanWord = (w) => w.replace(PUNCT, '');

  function splitGraphemes(word) {
    const low = word.toLowerCase();
    if (low.length >= 3 && MAGIC_E.test(low)) {
      const head = word.length > 3 ? splitGraphemes(word.slice(0, -3)) : [];
      const v = low[low.length - 3], c = low[low.length - 2];
      const cons = RIME_CONS[c] !== undefined ? RIME_CONS[c]
        : (CVC_PHONEMES[c] !== undefined ? CVC_PHONEMES[c] : c);
      return head.concat([[word.slice(-3), LONG_VOWELS[v] + cons]]);
    }
    const out = [];
    let i = 0;
    while (i < word.length) {
      let matched = false;
      for (const n of [3, 2]) {
        const chunk = low.slice(i, i + n);
        if (chunk.length === n && GRAPHEMES[chunk] !== undefined) {
          out.push([word.slice(i, i + n), GRAPHEMES[chunk]]);
          i += n;
          matched = true;
          break;
        }
      }
      if (!matched) {
        const ch = low[i];
        out.push([word[i], CVC_PHONEMES[ch] !== undefined ? CVC_PHONEMES[ch] : ch]);
        i += 1;
      }
    }
    return out;
  }

  // The (letters, sound) pairs a word is built up from, lexicon first.
  function wordParts(word) {
    const lex = WORD_SOUNDS[cleanWord(word).toLowerCase()];
    if (lex) {
      const out = [];
      let i = 0;
      for (const [g, p] of lex) {
        out.push([word.slice(i, i + g.length), p]);
        i += g.length;
      }
      return out;
    }
    return splitGraphemes(word);
  }

  // Can this word honestly be built up from the sounds we can say?
  // Conservative on purpose: the cost of a false no is a word taught whole;
  // the cost of a false yes is a child taught wrong sounds.
  function decodable(word) {
    const w = cleanWord(word).toLowerCase();
    if (WORD_SOUNDS[w]) return true;
    if (!w || !/^[a-z]+$/.test(w)) return false;
    if (IRREGULAR_WORDS.has(w)) return false;
    // Magic-e outside the safe rime pattern: "have", "care" - the rule cannot
    // say these, so they are read whole.
    if (/[aeiou][b-df-hj-np-tv-z]+e$/.test(w) && !MAGIC_E.test(w)) return false;
    // "happy", "pony": final y as a vowel sound the table does not model.
    if (w.length > 2 && /[b-df-hj-np-tv-z]y$/.test(w)) return false;
    return true;
  }

  // The Building-up ladder (pack content; the strict rule - no word may use
  // an untaught letter - still holds and is still checked).
  const SIGHT_IN_LADDER = new Set(['a']);
  const LADDER = [
    { letters: [['s', 's'], ['a', 'æ'], ['t', 't'], ['m', 'm']],
      words: ['at', 'am', 'Sam', 'sat', 'mat'], sentence: 'Sam sat.' },
    { letters: [['o', 'ɒ'], ['n', 'n']],
      words: ['on', 'not', 'man', 'tan'], sentence: 'Sam sat on a mat.' },
    { letters: [['p', 'p'], ['i', 'ɪ']],
      words: ['pin', 'tip', 'pit', 'nap', 'Pat'], sentence: 'Pat sat on a pin.' },
    { letters: [['d', 'd'], ['g', 'ɡ']],
      words: ['dog', 'dad', 'mad', 'dig'], sentence: 'A dog sat on Sam.' },
  ];
  const DIGRAPH_WORDS = [
    'ship', 'shop', 'fish', 'wish', 'chat', 'chip', 'chin', 'much',
    'thin', 'with', 'bath', 'duck', 'sock', 'back', 'kick',
    'ring', 'sing', 'long', 'king',
  ];
  const SENTENCES = [
    'The fish is in the net.',
    'A duck sat on the rock.',
    'Sam has a red hat.',
    'The king can sing.',
    'Stop and get the lamp.',
    'A chick is on the sand.',
  ];

  (function checkLadder() {
    const taught = new Set(SIGHT_IN_LADDER);
    LADDER.forEach((ch, idx) => {
      for (const [g] of ch.letters) taught.add(g);
      const items = ch.words.concat(ch.sentence.replace(/\./g, '').split(/\s+/));
      for (const item of items) {
        const unknown = [...item.toLowerCase()].filter((c) => /[a-z]/.test(c) && !taught.has(c));
        if (unknown.length) throw new Error(`Ladder chapter ${idx + 1}: '${item}' uses untaught letter(s) ${unknown}`);
      }
    });
  })();

  // ------------------------------------------------- the 42-sound table
  // What Setup's recording session prompts for, in RECORDING.md's order.
  const HOLD = 'hold', CRISP = 'crisp', FREE = 'free';
  const _ROWS = [
    [['s', 's', 'sun', 's', HOLD], ['m', 'm', 'man', 'm', HOLD]],
    [['t', 't', 'top', 't', CRISP], ['n', 'n', 'net', 'n', HOLD]],
    [['p', 'p', 'pan', 'p', CRISP], ['ng', 'ng', 'ring', 'ŋ', HOLD]],
    [['k', 'k', 'cat', 'k', CRISP], ['l', 'l', 'leg', 'l', HOLD]],
    [['b', 'b', 'bat', 'b', CRISP], ['r', 'r', 'run', 'ɹ', HOLD]],
    [['d', 'd', 'dog', 'd', CRISP], ['w', 'w', 'wet', 'w', FREE]],
    [['g', 'g', 'got', 'ɡ', CRISP], ['y', 'y', 'yes', 'j', FREE]],
    [['f', 'f', 'fan', 'f', HOLD], ['h', 'h', 'hat', 'h', FREE]],
    [['v', 'v', 'van', 'v', HOLD], ['sh', 'sh', 'shop', 'ʃ', HOLD]],
    [['z', 'z', 'zip', 'z', HOLD], ['ch', 'ch', 'chip', 'tʃ', CRISP]],
    [['th', 'th', 'thin', 'θ', HOLD], ['j', 'j', 'jam', 'dʒ', CRISP]],
    [['th-this', 'th', 'this', 'ð', HOLD], ['zh', 'zh', 'vision', 'ʒ', HOLD]],
    [['a', 'a', 'cat', 'a', HOLD], ['ee', 'ee', 'see', 'iː', HOLD]],
    [['e', 'e', 'bed', 'ɛ', HOLD], ['oo', 'oo', 'moon', 'uː', HOLD]],
    [['i', 'i', 'sit', 'ɪ', HOLD], ['or', 'or', 'door', 'ɔː', HOLD]],
    [['o', 'o', 'dog', 'ɒ', HOLD], ['ur', 'ur', 'her', 'ɜː', HOLD]],
    [['u', 'u', 'cup', 'ʌ', HOLD], ['ay', 'ay', 'day', 'eɪ', HOLD]],
    [['oo-put', 'oo', 'put', 'ʊ', HOLD], ['igh', 'igh', 'my', 'aɪ', HOLD]],
    [['ar', 'ar', 'car', 'ɑː', HOLD], ['oy', 'oy', 'boy', 'ɔɪ', HOLD]],
    [['ow', 'ow', 'now', 'aʊ', HOLD], ['oa', 'oa', 'go', 'əʊ', HOLD]],
    [['air', 'air', 'hair', 'eə', HOLD], ['ear', 'ear', 'near', 'ɪə', HOLD]],
  ];
  const PHONEME_ROWS = _ROWS.flat().map(([key, display, example, ipa, length]) =>
    ({ key, display, example, ipa, length }));

  // Every (spelling, ipa) rime the magic-e rule can produce. The spelling
  // doubles as the recording prompt ("ase", "ike", "ome" read aloud ARE the
  // rimes); the ipa is the key the phoneme lookup asks for.
  function allRimes() {
    const out = [];
    for (const v of 'aeiou') {
      for (const c of 'bcdfgklmnpstz') {
        const cons = RIME_CONS[c] !== undefined ? RIME_CONS[c] : CVC_PHONEMES[c];
        out.push([v + c + 'e', LONG_VOWELS[v] + cons]);
      }
    }
    return out;
  }

  // A real word carrying each rime's SOUND, so the prompt can always say
  // "as in…". Where no same-spelled everyday word exists, a sound-alike
  // anchors it - the anchor is for the ear, not the spelling.
  const RIME_EXAMPLES = {
    abe: 'babe', ace: 'face', ade: 'made', afe: 'safe',
    age: 'page', ake: 'cake', ale: 'tale', ame: 'name',
    ane: 'plane', ape: 'tape', ase: 'case', ate: 'gate',
    aze: 'maze',
    ebe: 'Beebe', ece: 'niece', ede: 'Swede', efe: 'beef',
    ege: 'siege', eke: 'week', ele: 'eel', eme: 'theme',
    ene: 'gene', epe: 'deep', ese: 'geese', ete: 'Pete',
    eze: 'sneeze',
    ibe: 'tribe', ice: 'nice', ide: 'ride', ife: 'life',
    ige: 'oblige', ike: 'like', ile: 'smile', ime: 'time',
    ine: 'nine', ipe: 'pipe', ise: 'rice', ite: 'kite',
    ize: 'prize',
    obe: 'robe', oce: 'dose', ode: 'rode', ofe: 'loaf',
    oge: 'doge', oke: 'joke', ole: 'hole', ome: 'home',
    one: 'bone', ope: 'hope', ose: 'dose', ote: 'note',
    oze: 'doze',
    ube: 'tube', uce: 'spruce', ude: 'rude', ufe: 'roof',
    uge: 'huge', uke: 'duke', ule: 'rule', ume: 'zoom',
    une: 'June', upe: 'soup', use: 'goose', ute: 'flute',
    uze: 'snooze',
  };
  // How each half of a rime is said, in plain letters a non-linguist can
  // read aloud. The vowel says its NAME (that is what the magic e does).
  const RIME_VOWEL_HINT = { a: 'ay', e: 'ee', i: 'eye', o: 'oh', u: 'oo' };
  const RIME_CONS_HINT = {
    b: 'b', c: 'sss', d: 'd', f: 'fff', g: 'j', k: 'k',
    l: 'lll', m: 'mmm', n: 'nnn', p: 'p', s: 'sss', t: 't',
    z: 'zzz',
  };

  // The same sound written two ways; a recording of one satisfies the other.
  const PHONEME_ALIASES = {
    'æ': ['a'], a: ['æ'],
    'ɛ': ['e'], e: ['ɛ'],
    'ɡ': ['g'], g: ['ɡ'],
  };

  function sentenceKey(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  // ------------------------------------------------------------- builders

  function Segment(parts, clip, pad, scale, color) {
    return { parts, clip, pad: pad || 0, scale: scale || 1.0, color: color || null, itemEnd: false };
  }
  // A segment speaking `text` whole, so the whole text is LIT. The rule,
  // everywhere: whatever the audio is saying is in the highlight colour, and
  // everything else is neutral.
  function whole(text, clip, pad, scale, color) {
    return Segment([[text, true]], clip, pad, scale, color);
  }
  const phonemeClip = (ipa) => ({ kind: 'phoneme', ipa });
  const wordClip = (text, slow) => ({ kind: 'word', text, slow: !!slow });
  const sentenceClip = (text) => ({ kind: 'sentence', text });

  // The gap never quite reaches zero - a few hundredths of a second keeps a
  // seam from clicking - but by the final pass the sounds should all but
  // touch: the closer they land to the blended word, the smaller the leap.
  const APPROACH_FLOOR = 0.05;

  // Successive blending: the sounds over and over, the gap shrinking each
  // time, so they audibly become the word instead of being replaced by it.
  function approach(parts, pause, passes) {
    const segs = [];
    for (let r = 0; r < passes; r++) {
      const frac = (passes - 1 - r) / Math.max(1, passes - 1);
      const gap = APPROACH_FLOOR * Math.pow(Math.max(pause, APPROACH_FLOOR * 2) / APPROACH_FLOOR, frac);
      parts.forEach(([, ipa], j) => {
        const shown = parts.map(([g], k) => [g, k === j]);
        segs.push(Segment(shown, phonemeClip(ipa), gap));
      });
    }
    return segs;
  }

  // A single word met on its own: sounded out with the gaps closing if the
  // grapheme table can honestly say it, shown and spoken whole if it cannot.
  // `buildable` is the runtime's extra gate - a buildup must never be half
  // voiced, so a word whose sounds cannot all actually be said (a magic-e
  // rime outside the recorded 42, say) is shown whole too.
  function oneWord(word, reps, pause, buildable) {
    const segs = [];
    if (decodable(word) && (!buildable || buildable(word))) {
      segs.push(...approach(wordParts(word), pause, Math.max(2, reps)));
      segs.push(whole(word, wordClip(word), pause + 1.0));
    } else {
      const clip = wordClip(word);
      const n = Math.max(2, reps - 1);
      for (let i = 0; i < n; i++) {
        segs.push(whole(word, clip, i < n - 1 ? pause : pause + 1.0));
      }
    }
    return segs;
  }

  // The read-along marker: the whole line read once, the highlight following
  // the voice. The actual slicing needs the RESOLVED audio (her line clip and
  // her word clips give the timing - see library.js wordSpans), so the
  // builder emits one marker segment and the storyboard expands it.
  function readalongMarker(text, scale) {
    return { readalong: { text, scale }, parts: null, clip: sentenceClip(text), pad: 0, scale, color: null, itemEnd: false };
  }

  // The library's video. An entry is a letter, a word, or a sentence, and
  // each gets exactly as much journey as it has:
  //   letter    its sound, repeated - straight from the phoneme bank
  //   word      sounded out (or shown whole - see decodable), no more
  //   sentence  words on their own, grown into the line, then her own read
  //             with the highlight following her voice
  function library(texts, opts) {
    const reps = Math.trunc(opts.reps !== undefined ? opts.reps : 3);
    const pause = Number(opts.pauseSeconds !== undefined ? opts.pauseSeconds : 1.2);
    const kindOf = SIO.library.entryKind;

    const segs = [];
    for (const text of texts) {
      const kind = kindOf(text);
      const words = text.split(/\s+/).filter(Boolean);

      if (kind === 'letter') {
        const letter = cleanWord(words[0]);
        const low = letter.toLowerCase();
        const clip = phonemeClip(CVC_PHONEMES[low] !== undefined ? CVC_PHONEMES[low] : low);
        for (let i = 0; i < reps; i++) {
          segs.push(whole(letter, clip, i < reps - 1 ? pause : pause + 0.6));
        }
        segs[segs.length - 1].itemEnd = true;
        continue;
      }

      if (kind === 'word') {
        segs.push(...oneWord(cleanWord(words[0]), reps, pause, opts.buildable));
        segs[segs.length - 1].itemEnd = true;
        continue;
      }

      // 1. Each word on its own, first time it appears.
      const seen = new Set();
      for (const w of words) {
        const clean = cleanWord(w);
        if (!clean || seen.has(clean.toLowerCase())) continue;
        seen.add(clean.toLowerCase());
        segs.push(...oneWord(clean, reps, pause, opts.buildable));
      }

      // 2. Grow the sentence word by word.
      words.forEach((w, i) => {
        const parts = [];
        words.slice(0, i + 1).forEach((other, j) => {
          if (j) parts.push([' ', false]);
          parts.push([other, j === i]);
        });
        segs.push(Segment(parts, wordClip(cleanWord(w)), pause, 0.9));
      });

      // 3. The payoff: her whole read, highlight following the voice.
      const marker = readalongMarker(text, 0.9);
      marker.pad = pause + 1.6;
      marker.itemEnd = true;
      segs.push(marker);
    }
    return segs;
  }

  SIO.curriculum = {
    SATPIN, SET2, SET3, CVC_PHONEMES, CVC_NONSENSE, GRAPHEMES,
    MAGIC_E, LONG_VOWELS, WORD_SOUNDS, IRREGULAR_WORDS,
    LADDER, DIGRAPH_WORDS, SENTENCES,
    cleanWord, splitGraphemes, wordParts, decodable,
    RIME_CONS, allRimes, RIME_EXAMPLES, RIME_VOWEL_HINT, RIME_CONS_HINT,
    PHONEME_ROWS, PHONEME_ALIASES, sentenceKey,
    APPROACH_FLOOR, approach, oneWord, library,
  };
})();
