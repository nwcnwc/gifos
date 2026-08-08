// The curriculum: what each level puts on screen, and in whose voice.
// Faithful port of sound-it-out gen/levels.py (plus the 42-sound recording
// table from gen/recordings.py and the lookup aliases from gen/voice.py).
//
// Level order follows the Down syndrome reading research rather than the
// obvious phonics-first ordering - sight words come first, phonics only after
// roughly 50 confident words.
//
// A Segment carries a CLIP REQUEST, not audio: { kind, ... } is resolved by
// voice.js (her recordings first, then the bundled built-in clips, then a
// brokered text-to-speech voice). Durations exist only after resolution.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // ---------------------------------------------------------------- content

  // Introduced in phonics order, not alphabetical. After just these six letters
  // a child can already decode sat, pin, tap, nap, pit, tin.
  const SATPIN = [['s', 's'], ['a', 'æ'], ['t', 't'], ['p', 'p'], ['i', 'ɪ'], ['n', 'n']];
  const SET2 = [['m', 'm'], ['d', 'd'], ['g', 'ɡ'], ['o', 'ɒ'], ['c', 'k'], ['k', 'k']];
  const SET3 = [['e', 'ɛ'], ['u', 'ʌ'], ['r', 'ɹ'], ['h', 'h'], ['b', 'b'], ['f', 'f'], ['l', 'l']];

  // Two-sound blends: consonant+vowel and vowel+consonant. The building blocks
  // of blending, and the step most curricula skip too quickly.
  const BLENDS_2 = [
    [['s', 's'], ['a', 'æ']], [['m', 'm'], ['a', 'æ']], [['p', 'p'], ['i', 'ɪ']],
    [['a', 'æ'], ['t', 't']], [['i', 'ɪ'], ['n', 'n']], [['a', 'æ'], ['m', 'm']],
    [['i', 'ɪ'], ['t', 't']], [['o', 'ɒ'], ['n', 'n']],
  ];

  // Real CVC words and decodable nonsense words. Nonsense items are deliberate:
  // a real word can be memorised as a shape, but 'vam' can only be read by
  // actually decoding it.
  const CVC_REAL = ['sat', 'pin', 'man', 'tap', 'nip', 'mat', 'sit', 'pan', 'tin', 'map'];
  const CVC_NONSENSE = ['vam', 'zib', 'fot', 'lun', 'dat', 'mip'];

  const CVC_PHONEMES = {
    s: 's', a: 'æ', t: 't', p: 'p', i: 'ɪ', n: 'n', m: 'm',
    d: 'd', g: 'ɡ', o: 'ɒ', c: 'k', k: 'k', e: 'ɛ', u: 'ʌ',
    r: 'ɹ', h: 'h', b: 'b', f: 'f', l: 'l', v: 'v', z: 'z',
    j: 'dʒ', w: 'w', y: 'j', x: 'k', q: 'k',
  };

  // Multi-letter graphemes, longest first: "ship" must highlight "sh" as ONE
  // unit, because that is what it is. Curated rather than general - correct
  // where it applies, which is the words these levels actually teach.
  const GRAPHEMES = {
    igh: 'aɪ', air: 'eə', ear: 'ɪə', tch: 'tʃ',
    sh: 'ʃ', ch: 'tʃ', th: 'θ', ng: 'ŋ', ck: 'k',
    ph: 'f', wh: 'w', qu: 'kw',
    ai: 'eɪ', ay: 'eɪ', ee: 'iː', ea: 'iː', oa: 'əʊ',
    ow: 'aʊ', oo: 'uː', oi: 'ɔɪ', oy: 'ɔɪ',
    ar: 'ɑː', or: 'ɔː', er: 'ɜː', ir: 'ɜː', ur: 'ɜː',
  };

  function splitGraphemes(word) {
    const out = [];
    const low = word.toLowerCase();
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

  function spell(word) {
    // Level 5 is CVC only, so a straight letter-by-letter mapping is correct;
    // digraphs arrive at level 7 via splitGraphemes.
    return Array.from(word).map((ch) => {
      const low = ch.toLowerCase();
      return [ch, CVC_PHONEMES[low] !== undefined ? CVC_PHONEMES[low] : low];
    });
  }

  // ----------------------------------------------------------------- levels

  const LEVELS = [
    { id: 1, name: 'Paw Patrol', description: "The pups' names as whole words. Where a new reader starts.", voice: 'recorded' },
    { id: 2, name: 'Family and home', description: 'Their own name, the people they love, everyday things.', voice: 'recorded' },
    { id: 3, name: 'Letter sounds', description: 'One letter at a time, with its sound. s a t p i n first.', voice: 'recorded' },
    { id: 4, name: 'Two sounds together', description: 'Joining two sounds: sa, at, ip, um.', voice: 'recorded' },
    { id: 5, name: 'Three-letter words', description: 'sat, pin, man - and some nonsense words too.', voice: 'recorded' },
    { id: 6, name: 'Building up', description: 'The whole journey in one go: single letters grow into words, and the words grow into a sentence.', voice: 'recorded' },
    { id: 7, name: 'Letter teams', description: 'sh, ch, th, ck treated as one sound.', voice: 'generated' },
    { id: 8, name: 'Harder words', description: 'Longer words with clusters: stop, black, hand.', voice: 'generated' },
    { id: 9, name: 'Sentences', description: 'Whole sentences, read word by word then together.', voice: 'generated' },
    { id: 10, name: 'Anything you paste in', description: 'A page of a book, a card from Nana, a note about the day. Read word by word, then whole.', voice: 'open' },
    { id: 11, name: 'Their own sentences', description: 'Sentences built from the names and things in your word list. Different for every family, and they change as you add words.', voice: 'open' },
    { id: 12, name: 'A story that grows', description: 'A story told only with the letters they have learned so far. It gets longer as they learn more.', voice: 'open' },
  ];

  // The Building-up ladder, in chapters. The strict rule: no word may contain
  // a letter that has not already been taught, in this chapter or an earlier
  // one. "a" is the deliberate exception - both a letter and a word, taught as
  // a sight word so a sentence can be formed at all.
  const SIGHT_IN_LADDER = new Set(['a']);

  const LADDER = [
    { letters: [['s', 's'], ['a', 'æ'], ['t', 't'], ['m', 'm']],
      words: ['at', 'am', 'Sam', 'sat', 'mat'],
      sentence: 'Sam sat.' },
    { letters: [['o', 'ɒ'], ['n', 'n']],
      words: ['on', 'not', 'man', 'tan'],
      sentence: 'Sam sat on a mat.' },
    { letters: [['p', 'p'], ['i', 'ɪ']],
      words: ['pin', 'tip', 'pit', 'nap', 'Pat'],
      sentence: 'Pat sat on a pin.' },
    { letters: [['d', 'd'], ['g', 'ɡ']],
      words: ['dog', 'dad', 'mad', 'dig'],
      sentence: 'A dog sat on Sam.' },
  ];

  // Level 7: each digraph taught with words that actually contain it.
  const DIGRAPH_WORDS = [
    'ship', 'shop', 'fish', 'wish', 'chat', 'chip', 'chin', 'much',
    'thin', 'with', 'bath', 'duck', 'sock', 'back', 'kick',
    'ring', 'sing', 'long', 'king',
  ];

  // Level 8: consonant clusters - two sounds that stay two sounds.
  const CLUSTER_WORDS = [
    'stop', 'step', 'spin', 'skip', 'swim',
    'black', 'flag', 'plan', 'clap', 'glad',
    'hand', 'sand', 'bend', 'jump', 'lamp', 'milk',
    'best', 'nest', 'must', 'lost',
  ];

  // Level 9: connected text, built only from what levels 1-8 have taught.
  const SENTENCES = [
    'The fish is in the net.',
    'A duck sat on the rock.',
    'Sam has a red hat.',
    'The king can sing.',
    'Stop and get the lamp.',
    'A chick is on the sand.',
  ];

  // Fail loudly at load if a ladder chapter uses an untaught letter.
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
  // gen/recordings.py's PHONEME_ROWS: what the recording studio prompts for,
  // in RECORDING.md's printed order (read across the rows). `length` is
  // physical, not stylistic: "hold" sounds have a steady state, "crisp" stops
  // are a burst that cannot be held, "free" sounds get no duration target.
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
  const PHONEMES_BY_KEY = Object.fromEntries(PHONEME_ROWS.map((p) => [p.key, p]));

  // The same sound written two ways, and a recording of one must satisfy a
  // request for the other. The recording table transcribes the vowel in "cat"
  // as /a/ (modern British dictionaries); the curriculum writes it /æ/ (what
  // the synthesiser needed). Aliases apply to the LOOKUP only.
  const PHONEME_ALIASES = {
    'æ': ['a'], a: ['æ'],
    'ɛ': ['e'], e: ['ɛ'],
    'ɡ': ['g'], g: ['ɡ'],
  };

  // Stable key for a whole sentence. What the studio saves and what the
  // resolver looks for have to agree exactly, or a recorded sentence is
  // silently never found.
  function sentenceKey(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  // ------------------------------------------------------------- builders

  function Segment(parts, clip, pad, scale, color) {
    return { parts, clip, pad: pad || 0, scale: scale || 1.0, color: color || null, itemEnd: false };
  }
  function whole(text, clip, pad, scale, color) {
    return Segment([[text, false]], clip, pad, scale, color);
  }
  const phonemeClip = (ipa) => ({ kind: 'phoneme', ipa });
  const wordClip = (text, slow) => ({ kind: 'word', text, slow: !!slow });
  const blendClip = (ipas) => ({ kind: 'blend', ipas });
  const sentenceClip = (text) => ({ kind: 'sentence', text });

  function sightWords(words, reps, pause) {
    const segs = [];
    for (const [word, color] of words) {
      for (let i = 0; i < reps; i++) {
        segs.push(whole(word, wordClip(word), i < reps - 1 ? pause : pause + 0.6, 1.0, color));
      }
      segs[segs.length - 1].itemEnd = true;
    }
    return segs;
  }

  function sounds(letters, reps, pause) {
    const segs = [];
    for (const [letter, ipa] of letters) {
      for (let i = 0; i < reps; i++) {
        segs.push(whole(letter, phonemeClip(ipa), i < reps - 1 ? pause : pause + 0.6));
      }
      segs[segs.length - 1].itemEnd = true;
    }
    return segs;
  }

  // The gap never quite reaches zero: 120ms is about where separate clips stop
  // being heard as a list and start being heard as one thing about to happen.
  const APPROACH_FLOOR = 0.12;

  // Say the sounds over and over, the gap shrinking each time. This is
  // successive blending, and the shrink is the actual teaching move: the
  // sounds audibly *become* the word instead of being replaced by it.
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

  // Sound a word out with the gaps closing pass by pass, then blend it. The
  // word is played once, slowed, as the arrival rather than one more item.
  function soundOut(spellings, reps, pause) {
    const segs = [];
    for (const parts of spellings) {
      const word = parts.map(([g]) => g).join('');
      segs.push(...approach(parts, pause, Math.max(2, reps)));
      segs.push(whole(word, wordClip(word, true), pause + 1.2));
      segs[segs.length - 1].itemEnd = true;
    }
    return segs;
  }

  // The whole arc in one video: letters -> words -> a sentence. A word is
  // grown on screen one letter at a time, then the finished words are grown
  // into a sentence the same way. The point is the join.
  function buildUp(reps, pause) {
    const segs = [];
    const inner = Math.max(1, reps - 1);

    for (const chapter of LADDER) {
      // 1. Meet each new letter on its own.
      for (const [letter, ipa] of chapter.letters) {
        for (let i = 0; i < reps; i++) {
          segs.push(whole(letter, phonemeClip(ipa), i < reps - 1 ? pause : pause + 0.5));
        }
      }

      // 2. Grow each word, one letter at a time. These gaps are LONGER than
      // the configured pause: the instant a new letter appears is the most
      // important beat in the level, and the child needs time to notice it.
      for (const word of chapter.words) {
        const parts = spell(word);
        for (let rep = 0; rep < inner; rep++) {
          for (let i = 0; i < parts.length; i++) {
            const sofar = parts.slice(0, i + 1);
            const shown = sofar.map(([g], j) => [g, j === i]);
            // the new letter's own sound, then time to see it
            segs.push(Segment(shown, phonemeClip(sofar[i][1]), pause * 1.15));
            if (i > 0) {
              // ...then everything so far, said with the gaps closing, and
              // only then blended.
              const complete = i === parts.length - 1;
              segs.push(...approach(sofar, pause, complete ? 3 : 2));
              if (!complete) {
                // The halfway blend - /sæ/ on the way to "sat" - is a nonsense
                // fragment nobody can record, so it is synthesised. The payoff
                // of the step, so it gets the longest beat.
                const flat = sofar.map(([g]) => [g, false]);
                segs.push(Segment(flat, blendClip(sofar.map(([, p]) => p)), pause * 1.35));
              }
              // When the word is complete there is no blend step at all: the
              // blend of every sound IS the word, and the recorded word
              // follows immediately below.
            }
          }
          // The arrival, once per growing pass - inside the rep loop, so
          // every repetition of the growth ends on the whole word.
          segs.push(whole(word, wordClip(word), pause + 1.4));
        }
      }

      // 3. Grow the chapter's sentence, one word at a time.
      const words = chapter.sentence.split(/\s+/);
      for (let rep = 0; rep < inner; rep++) {
        words.forEach((w, i) => {
          const parts = [];
          words.slice(0, i + 1).forEach((other, j) => {
            if (j) parts.push([' ', false]);
            parts.push([other, j === i]);
          });
          segs.push(Segment(parts, wordClip(w.replace(/[.,!?]+$/g, '')), pause * 1.1, 0.9));
        });
        segs.push(whole(chapter.sentence, sentenceClip(chapter.sentence), pause + 1.6, 0.9));
      }

      // A chapter is the unit a shortened video may end after: it closes on
      // its sentence, so stopping here is a complete (if shorter) journey.
      segs[segs.length - 1].itemEnd = true;
    }
    return segs;
  }

  // Level 9 (and 10-12): each word lit as it is read, then the whole thing
  // together. The whole read has stress and intonation across the line, which
  // concatenated word clips have not.
  function sentences(lines, reps, pause) {
    const segs = [];
    for (const text of lines) {
      const words = text.split(/\s+/);
      const wholeClip = sentenceClip(text);
      for (let rep = 0; rep < Math.max(1, reps - 1); rep++) {
        words.forEach((w, i) => {
          const parts = [];
          words.forEach((other, j) => {
            if (j) parts.push([' ', false]);
            parts.push([other, j === i]);
          });
          segs.push(Segment(parts, wordClip(w.replace(/[.,!?]+$/g, '')), pause * 0.9, 0.85));
        });
        segs.push(whole(text, wholeClip, pause + 1.6, 0.85));
      }
      segs[segs.length - 1].itemEnd = true;
    }
    return segs;
  }

  // Produce the segment list for a level. `groups` is the parsed word list.
  function build(level, opts, groups) {
    const reps = Math.trunc(opts.reps !== undefined ? opts.reps : 3);
    const pause = Number(opts.pauseSeconds !== undefined ? opts.pauseSeconds : 1.2);

    const group = (...names) => {
      for (const g of groups) {
        if (names.some((n) => g.name.toLowerCase().includes(n))) return g.words;
      }
      return [];
    };

    if (level === 1) return sightWords(group('paw'), reps, pause);
    if (level === 2) {
      const words = [...group('people'), ...group('home'), ...group('first')];
      return sightWords(words, reps, pause);
    }
    if (level === 3) return sounds([...SATPIN, ...SET2, ...SET3], reps, pause);
    if (level === 4) return soundOut(BLENDS_2, reps, pause);
    if (level === 5) {
      let spellings = CVC_REAL.map(spell);
      if (opts.nonsense !== false) spellings = spellings.concat(CVC_NONSENSE.map(spell));
      return soundOut(spellings, reps, pause);
    }
    if (level === 6) return buildUp(reps, pause);
    if (level === 7) return soundOut(DIGRAPH_WORDS.map(splitGraphemes), reps, pause);
    if (level === 8) return soundOut(CLUSTER_WORDS.map(splitGraphemes), reps, pause);
    if (level === 9) return sentences(SENTENCES, reps, pause);

    // ---- open-ended levels: content comes from the parent, not from here ----
    const oe = SIO.openended;
    if (level === 10) {
      const lines = oe.splitSentences(opts.text || '');
      if (!lines.length) {
        throw new Error('Paste some text for this level first - a page of a book, a card, anything they would like read to them.');
      }
      return sentences(lines, reps, pause);
    }
    if (level === 11) {
      const lines = oe.fromWordlist(groups);
      if (!lines.length) {
        throw new Error('This level builds sentences from your own word list, and it needs some names and some things to work with. Add a few to the People and Home groups on the Words tab.');
      }
      return sentences(lines, reps, pause);
    }
    if (level === 12) {
      const lines = oe.storySoFar(opts.stage);
      if (!lines.length) throw new Error('No part of the story is readable yet.');
      return sentences(lines, reps, pause);
    }

    throw new Error(`Level ${level} does not exist.`);
  }

  // Which levels can be built right now, and an honest reason if not.
  // The bundled built-in clips make every fixed level available on day one;
  // the reasons explain whose voice will be heard.
  function levelStatus(caps) {
    return LEVELS.map((lv) => {
      let reason = '';
      let available = true;
      if (lv.voice === 'recorded' || lv.voice === 'generated') {
        if (!caps.recordings) reason = 'Will use the built-in voice until you record yours.';
        else if (lv.voice === 'generated' && !caps.recordedSentences) {
          reason = 'Words you have recorded are in your voice; the rest use the built-in voice.';
        }
      } else {
        // Open-ended: nothing here can be pre-recorded or pre-bundled, so
        // unrecorded words need the Text-to-speech model from GifOS Settings.
        if (lv.id === 11 && !caps.wordlistReady) {
          available = false;
          reason = 'Needs some names in the People group and things in the Home group first.';
        } else if (!caps.tts && !caps.recordings) {
          reason = lv.id === 12
            ? 'The story words are built in; anything you add later needs your recordings or a Text-to-speech model.'
            : 'New words are read by your recordings if you have them, or a Text-to-speech model set up in GifOS Settings.';
        }
      }
      return {
        id: lv.id, name: lv.name, description: lv.description,
        available, reason, kind: lv.voice, needsText: lv.id === 10, needsStage: lv.id === 12,
      };
    });
  }

  SIO.curriculum = {
    SATPIN, SET2, SET3, BLENDS_2, CVC_REAL, CVC_NONSENSE, CVC_PHONEMES, GRAPHEMES,
    splitGraphemes, spell, LEVELS, LADDER, DIGRAPH_WORDS, CLUSTER_WORDS, SENTENCES,
    APPROACH_FLOOR, PHONEME_ROWS, PHONEMES_BY_KEY, PHONEME_ALIASES, sentenceKey,
    build, levelStatus,
  };
})();
