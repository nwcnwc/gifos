// The shipped pronunciation dictionary: letters aligned to sounds. Port of
// gen/dictionary.py; the data (window.SIO_DICT) is 0.6.0's aligned.txt,
// built from CMUdict by EM + Viterbi upstream.
//
// An entry is PERMISSION to build a word up: every chunk in it is a
// correspondence common enough across English (or explicitly taught - ai=/ɛ/
// in said, f=/v/ in of) to be honest on screen. Words absent are either
// unknown (names, nonsense - the spelling rules take over) or were refused
// because their spelling lies ("one" would need o=/wʌ/, and no teacher
// writes that on a board) - those are shown whole.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // Every sound a chunk can carry, longest first, for splitting a chunk's
  // sound into the phonemes the voice bank records. "eɪk" is /eɪ/ then /k/.
  const PHONEMES = [
    'aɪ', 'aʊ', 'eɪ', 'iː', 'uː', 'ɔː', 'ɑː', 'ɜː', 'əʊ', 'ɔɪ', 'eə',
    'ɪə', 'tʃ', 'dʒ', 'æ', 'ɛ', 'ɪ', 'ɒ', 'ʌ', 'ʊ', 'ə', 'b', 'd', 'ð',
    'f', 'ɡ', 'h', 'j', 'k', 'l', 'm', 'n', 'ŋ', 'p', 'ɹ', 's', 'ʃ',
    't', 'θ', 'v', 'w', 'z', 'ʒ',
  ].sort((a, b) => b.length - a.length);

  let cache = null;

  // Parsed lazily: 110k lines cost real milliseconds and most sessions never
  // build a video. No dictionary is survivable - the rules still work.
  function load() {
    if (cache === null) {
      cache = new Map();
      const text = window.SIO_DICT || '';
      for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const bits = line.split(' ');
        const word = bits[0];
        const entry = [];
        for (let i = 1; i < bits.length; i++) {
          if (!bits[i]) continue;
          const eq = bits[i].indexOf('=');
          entry.push([bits[i].slice(0, eq), bits[i].slice(eq + 1)]);
        }
        cache.set(word, entry);
      }
    }
    return cache;
  }

  // The aligned (letters, sound) pairs for `word`, cased like the word
  // itself, or null if the dictionary cannot vouch for it.
  function chunks(word) {
    const entry = load().get(word.toLowerCase());
    if (!entry) return null;
    const out = [];
    let i = 0;
    for (const [letters, sound] of entry) {
      out.push([word.slice(i, i + letters.length), sound]);
      i += letters.length;
    }
    return out;
  }

  let catalogCache = null;

  // Every multi-sound chunk the dictionary uses, most useful first. Each
  // entry: {ipa, spelling, example, words} - the spelling is the most common
  // way that sound is written, the example a short real word carrying it,
  // words how many dictionary words use it. This is the Sound Bank's chunk
  // list: everything here plays as a crossfade of the recorded phonemes
  // until somebody records it as one breath.
  function catalog() {
    if (catalogCache === null) {
      const common = new Set((window.SIO_COMMON || '').split(/\s+/).filter(Boolean));
      const count = new Map();
      const spellings = new Map();
      const example = new Map(); // ipa -> [commonMiss, fitMiss, len, word]
      for (const [word, entry] of load()) {
        let pos = 0;
        for (const [letters, sound] of entry) {
          pos += 1;
          if (tokens(sound).length < 2) continue;
          count.set(sound, (count.get(sound) || 0) + 1);
          if (!spellings.has(sound)) spellings.set(sound, new Map());
          const sp = spellings.get(sound);
          const low = letters.toLowerCase();
          sp.set(low, (sp.get(low) || 0) + 1);
          // A good example is a COMMON simple word with the chunk in
          // context: "bring" teaches /ɪŋ/, but "ing" the bare token and
          // "ibn" the name teach doubt.
          const roomy = word.length >= letters.length + 2;
          const fit = [common.has(word) ? 0 : 1,
            (roomy && word.length <= 7 && entry.length <= 3) ? 0 : 1,
            word.length, word];
          const cur = example.get(sound);
          const less = (a, b) => {
            for (let i = 0; i < a.length; i++) {
              if (a[i] < b[i]) return true;
              if (a[i] > b[i]) return false;
            }
            return false;
          };
          if (!cur || less(fit, cur)) example.set(sound, fit);
        }
      }
      catalogCache = [...count.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([s, n]) => ({
          ipa: s,
          spelling: [...spellings.get(s).entries()].sort((a, b) => b[1] - a[1])[0][0],
          example: example.get(s)[3],
          words: n,
        }));
      // The magic-e rime sounds stay listed even when the aligner never
      // chose them for a dictionary word: recordings of them serve the
      // spelling-rule path, and a recording must never become invisible to
      // the person who made it.
      const have = new Set(catalogCache.map((c) => c.ipa));
      for (const [spelling, ipa] of SIO.curriculum.allRimes()) {
        if (!have.has(ipa)) {
          have.add(ipa);
          catalogCache.push({ ipa, spelling, example: spelling, words: 0 });
        }
      }
    }
    return catalogCache;
  }

  // Split a chunk's sound into single phonemes ("eɪk" -> eɪ, k).
  function tokens(sound) {
    const out = [];
    let i = 0;
    while (i < sound.length) {
      let hit = null;
      for (const p of PHONEMES) {
        if (sound.startsWith(p, i)) { hit = p; break; }
      }
      if (hit) { out.push(hit); i += hit.length; }
      else { out.push(sound[i]); i += 1; }
    }
    return out;
  }

  SIO.dictionary = { PHONEMES, load, chunks, tokens, catalog };
})();
