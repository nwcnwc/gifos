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

  SIO.dictionary = { PHONEMES, load, chunks, tokens };
})();
