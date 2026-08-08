// Levels whose content is not written in advance. Port of gen/openended.py.
//
// No language model: everything is either text the parent supplied, or a
// template filled from their own word list, or a line from a curated bank
// filtered by which letters have been taught. A model would happily produce a
// sentence full of letters the child has never met; a filter cannot.
//
// Determinism: sentences are shuffled with a seed derived from the input
// itself, so a parent who adds a name gets different sentences, and one who
// does not gets the same video every time.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // Long enough to be worth watching, short enough that a pasted chapter does
  // not become a nine-hour build.
  const MAX_SENTENCES = 40;
  // A sentence a beginner can hold in their head.
  const MAX_WORDS = 12;

  // ------------------------------------------------------------ pasted text

  function splitSentences(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const out = [];
    for (const raw of text.split(/(?<=[.!?])\s+/)) {
      const line = raw.trim();
      if (!line) continue;
      const words = line.split(/\s+/);
      if (words.length <= MAX_WORDS) { out.push(line); continue; }
      // Break at punctuation the reader would breathe at, and only chop
      // mid-phrase for whatever is still too long after that.
      for (const rawPart of line.split(/(?<=[,;:])\s+/)) {
        const part = rawPart.trim();
        if (!part) continue;
        const pw = part.split(/\s+/);
        if (pw.length <= MAX_WORDS) { out.push(part); continue; }
        for (let i = 0; i < pw.length; i += MAX_WORDS) {
          out.push(pw.slice(i, i + MAX_WORDS).join(' '));
        }
      }
    }
    return out.slice(0, MAX_SENTENCES);
  }

  // -------------------------------------------------- their own word list

  // Every slot is a word they typed, so the result is about their family -
  // which is what the research on reading and Down syndrome keeps pointing at.
  const TEMPLATES = [
    ['{person} can see the {thing}.', ['person', 'thing']],
    ['{person} has a {thing}.', ['person', 'thing']],
    ['I can see {person}.', ['person']],
    ['{person} and {person2} can go.', ['person', 'person2']],
    ['The {thing} is for {person}.', ['thing', 'person']],
    ['{person} likes the {thing}.', ['person', 'thing']],
    ['Here is the {thing}.', ['thing']],
    ['{person} can go to {person2}.', ['person', 'person2']],
    ['I like my {thing}.', ['thing']],
    ['{person} sees my {thing}.', ['person', 'thing']],
  ];

  function groupsNamed(groups, ...names) {
    for (const g of groups) {
      if (names.some((n) => g.name.toLowerCase().includes(n))) return g.words.map(([w]) => w);
    }
    return [];
  }

  // Deterministic RNG seeded from a string (FNV-1a into mulberry32). Not the
  // same stream as the Python original's, and doesn't need to be - only
  // stability for a given word list matters.
  function rng(seedStr) {
    let h = 0x811c9dc5;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return function () {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  function fromWordlist(groups, limit) {
    limit = limit || MAX_SENTENCES;
    const people = groupsNamed(groups, 'people', 'family');
    const things = groupsNamed(groups, 'home', 'thing', 'toy');
    // Characters are people too, and for a child who cares about them they
    // may be the strongest words in the list.
    people.push(...groupsNamed(groups, 'paw', 'character'));
    if (!people.length || !things.length) return [];

    const r = rng([...people].sort().join('|') + '//' + [...things].sort().join('|'));
    const order = [...TEMPLATES];
    // Fisher-Yates with the seeded rng: round-robin through the templates so
    // the same shape does not repeat three times before the second appears.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const out = [], seen = new Set();
    for (let i = 0; i < limit * 3; i++) {
      const [text, slots] = order[i % order.length];
      const person = pick(r, people);
      const fill = { person, thing: pick(r, things) };
      if (slots.includes('person2')) {
        const others = people.filter((p) => p !== person);
        if (!others.length) continue;
        fill.person2 = pick(r, others);
      }
      const line = text.replace(/\{(\w+)\}/g, (_, k) => fill[k]);
      if (seen.has(line.toLowerCase())) continue;
      seen.add(line.toLowerCase());
      out.push(line);
      if (out.length >= limit) break;
    }
    return out;
  }

  // --------------------------------------------------- the growing story

  // Written INSIDE each stage's alphabet rather than filtered afterwards:
  // natural sentences reach for "the", "run", "big" long before e, u, r and b
  // are taught, so a filtered story never got past its opening lines.
  // "the" cannot appear until stage 3: h and e are both in SET3.
  const STORY = [
    // Stage 1 - s a t p i n. Thin on purpose; six letters is not much of an
    // alphabet.
    'Sit.',
    'Sit in it.',
    'A pin.',
    'It is a pin.',
    'Tip it in.',
    'A pan is tan.',
    'Sip it.',
    'It is tin.',
    // Stage 2 - adds m d g o c k. Sam and the animals arrive.
    'Sam sat.',
    'Sam sat on a mat.',
    'A cat sat on Sam.',
    'Sam is mad.',
    'A dog is in it.',
    'A dog can dig.',
    'Sam got a cat.',
    'Sam and a dog.',
    'A cat can nap.',
    'Sam pats a cat.',
    'A cat sat on a cot.',
    'Sam is sad.',
    'Dad got a mop.',
    'Dad can mop it.',
    'A dog is on top.',
    'Sam can not stop.',
    'A cat naps on a cot.',
    'Sam and Dad.',
    // Stage 3 - adds e u r h b f. "the" becomes possible, and so does most of
    // ordinary early reading.
    'The dog ran.',
    'The cat is red.',
    'Sam fed the cat.',
    'The dog had a bed.',
    'Sam had a red hat.',
    'The dog hid the hat.',
    'Sam ran to the dog.',
    'The hat is in the mud.',
    'Dad got the hat.',
    'The hat is red.',
    'Sam put it in the sun.',
    'The cat sat in the sun.',
    'The dog sat in the sun.',
    'Sam had a big hug.',
    'The cat and the dog nap.',
    'Sam is not sad.',
  ];

  const letters = (text) => new Set(text.toLowerCase().replace(/[^a-z]/g, ''));

  // Every letter taught by the end of `stage` (1, 2 or 3) - level 3's own
  // letter sets, which is what "has been taught" actually means in this app.
  function taughtLetters(stage) {
    const cur = SIO.curriculum;
    const sets = [cur.SATPIN, cur.SET2, cur.SET3];
    const n = (stage === undefined || stage === null)
      ? sets.length
      : Math.max(1, Math.min(Math.trunc(stage), sets.length));
    const out = new Set(['a']); // both a letter and a word, taught from the start
    for (const group of sets.slice(0, n)) for (const [letter] of group) out.add(letter);
    return out;
  }

  // The story as far as it can be read with the letters taught so far. A line
  // is included only when every letter in it has been taught - a filter, not
  // a judgement, so it cannot be wrong the way a generated sentence could be.
  function storySoFar(stage, limit) {
    const known = taughtLetters(stage);
    const out = STORY.filter((line) => [...letters(line)].every((c) => known.has(c)));
    return limit ? out.slice(0, limit) : out;
  }

  function storyProgress(stage) {
    const known = taughtLetters(stage);
    return {
      letters: [...known].sort().join(''),
      lines: storySoFar(stage).length,
      total: STORY.length,
    };
  }

  SIO.openended = {
    MAX_SENTENCES, MAX_WORDS, TEMPLATES, STORY,
    splitSentences, fromWordlist, taughtLetters, storySoFar, storyProgress,
  };
})();
