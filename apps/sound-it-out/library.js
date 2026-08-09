// The sentence library: any sentence she adds, recorded as its parts.
// Port of gen/sentences.py, with gifos.db as the store.
//
// This is the simplified shape of the whole app. A sentence carries
// everything a video needs - its words, their sounds, and the whole line -
// so a library entry is just the text. Words are saved to the SHARED word
// bank, not to anything per-sentence, so every sentence she adds gets
// cheaper to record than the one before it.
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const cur = () => SIO.curriculum;
  // shared with voice.js/studio.js; defined by whichever loads first
  SIO.recId = SIO.recId || function (kind, key) { return kind + '/' + key; };

  // Words whose isolated clip is a poor guide to their length in flowing
  // speech: alone, "the" is a full careful syllable; inside a sentence it is
  // squeezed to a fraction of that.
  const FUNCTION_WORDS = new Set([
    'the', 'a', 'an', 'to', 'of', 'and', 'in', 'on', 'at', 'is', 'it',
    'as', 'or', 'for', 'was', 'are', 'be', 'his', 'her', 'its', 'with',
    'you', 'i',
  ]);
  const FUNCTION_DISCOUNT = 0.5;

  // What sort of thing one library entry is. The library holds more than
  // sentences, on purpose - it is the ONLY list in the app:
  //   "s"      one letter -> its sound, from the phoneme bank
  //   "Chase"  one word   -> sight or sounded out, no line read
  //   "Sam sat." a sentence -> the full journey
  function entryKind(text) {
    const words = text.split(/\s+/).map(cur().cleanWord).filter(Boolean);
    if (words.length === 1 && words[0].length === 1 && /[a-zA-Z]/.test(words[0])) return 'letter';
    if (words.length === 1) return 'word';
    return 'sentence';
  }

  function uniqueWords(text) {
    const out = [], seen = new Set();
    for (const w of text.split(/\s+/)) {
      const c = cur().cleanWord(w);
      if (c && !seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        out.push(c);
      }
    }
    return out;
  }

  // Break pasted text into sentences (the surviving piece of the old
  // open-ended levels). Deliberately simple; the failure mode is one line
  // reading slightly long.
  const MAX_WORDS = 12, MAX_SENTENCES = 40;
  function splitSentences(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const out = [];
    for (const raw of text.split(/(?<=[.!?])\s+/)) {
      const line = raw.trim();
      if (!line) continue;
      const words = line.split(/\s+/);
      if (words.length <= MAX_WORDS) { out.push(line); continue; }
      for (const rawPart of line.split(/(?<=[,;:])\s+/)) {
        const part = rawPart.trim();
        if (!part) continue;
        const pw = part.split(/\s+/);
        if (pw.length <= MAX_WORDS) { out.push(part); continue; }
        for (let i = 0; i < pw.length; i += MAX_WORDS) out.push(pw.slice(i, i + MAX_WORDS).join(' '));
      }
    }
    return out.slice(0, MAX_SENTENCES);
  }

  // ------------------------------------------------------------- the library
  // db 'library': one record per entry { id: sentenceKey, text, order }.
  // Order is the order she added them, which is the order the video plays.

  async function load() {
    const rows = await SIO.store.db('library').getAll();
    return (rows || []).filter((r) => r && r.text)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  async function add(text) {
    const lines = splitSentences(text);
    if (!lines.length) throw new Error('That did not contain a sentence to add.');
    const existing = await load();
    const seen = new Set(existing.map((r) => r.id));
    let order = existing.reduce((m, r) => Math.max(m, r.order || 0), 0);
    const added = [];
    for (const line of lines) {
      const key = cur().sentenceKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      order += 1;
      const row = { id: key, text: line, order };
      await SIO.store.db('library').put(row);
      added.push(row);
    }
    return added;
  }

  // Recordings are kept on remove: the words belong to the shared bank and
  // may serve other sentences, and the line clip is precious if she re-adds.
  async function remove(key) {
    await SIO.store.db('library').delete(key);
  }

  // ------------------------------------------------------ recording status

  const wordId = (w) => SIO.recId('words', w.toLowerCase());
  const lineId = (text) => SIO.recId('sentences', cur().sentenceKey(text));

  // Where a clip could come from: her bank, or the shipped starter voice
  // (the app author's recordings). Nothing else exists - no synthesiser, no
  // text-to-speech - because a buildup must never be two voices, let alone a
  // human voice and a computer one.
  function inStarter(table, key) {
    return SIO.starterTable ? SIO.starterTable(table, key) !== null : false;
  }
  function letterCovered(ch, recorded) {
    const low = ch.toLowerCase();
    const ipa = cur().CVC_PHONEMES[low] !== undefined ? cur().CVC_PHONEMES[low] : low;
    const keys = [ipa].concat(cur().PHONEME_ALIASES[ipa] || []);
    return keys.some((k) => recorded.has(SIO.recId('phonemes', k))) || inStarter('phonemes', ipa);
  }
  const wordCovered = (w, recorded) => recorded.has(wordId(w)) || inStarter('words', w.toLowerCase());
  const lineCovered = (text, recorded) => recorded.has(lineId(text)) || inStarter('sentences', cur().sentenceKey(text));

  // Every entry, with what is recorded, what the starter voice covers, and
  // what is still to do. `recorded` is the Set of recmeta ids. `ready` means
  // every clip the entry needs can actually be said - unready entries are
  // skipped at build time rather than played half-voiced.
  function statusOf(rows, recorded) {
    return rows.map((row) => {
      const kind = entryKind(row.text);
      const words = uniqueWords(row.text);
      let missing = [], uncovered = [], lineDone = true, lineOk = true, ready;
      if (kind === 'letter') {
        ready = letterCovered(words[0], recorded);
      } else {
        // missing = not in HER voice (drives the walk-through);
        // uncovered = in nobody's voice (blocks the video).
        missing = words.filter((w) => !recorded.has(wordId(w)));
        uncovered = words.filter((w) => !wordCovered(w, recorded));
        if (kind === 'sentence') {
          lineDone = recorded.has(lineId(row.text));
          lineOk = lineCovered(row.text, recorded);
        }
        ready = !uncovered.length && lineOk;
      }
      return {
        key: row.id, text: row.text, kind,
        words: words.length, missing, uncovered,
        // Buildup sound pieces not yet in the family's own voice - the
        // walk-through queues these after the line and the words.
        missingSounds: kind === 'letter' ? 0 : pieceItems(row.text, recorded).length,
        // The shared bank makes recording quietly cheap, and quiet reads as
        // broken - the row says where the other words came from.
        recordedWords: words.length - missing.length,
        lineRecorded: lineDone,
        ready,
      };
    });
  }

  // The sound pieces of this entry's buildups the family has NOT recorded
  // themselves: chunks first, then single sounds. These queue in the
  // walk-through so a sentence can become fully hers, and they shrink to
  // nothing as the shared bank fills - pieces are keyed by sound, recorded
  // once, used everywhere. `recorded` is the recmeta id set.
  function pieceItems(text, recorded) {
    const seen = new Set(), chunksOut = [], singles = [];
    for (const w of uniqueWords(text)) {
      if (!cur().decodable(w)) continue;
      for (const [g, ipa] of cur().wordParts(w)) {
        if (seen.has(ipa)) continue;
        seen.add(ipa);
        const keys = [ipa].concat(cur().PHONEME_ALIASES[ipa] || []);
        if (keys.some((k) => recorded.has(SIO.recId('phonemes', k)))) continue;
        const many = SIO.dictionary.tokens(ipa).length > 1;
        const item = {
          key: ipa, kind: 'phoneme', display: g.toLowerCase(), ipa,
          length: 'free', takes: many ? 2 : 3,
          say: `From “${cur().cleanWord(w)}”: say “${g.toLowerCase()}” — ${SIO.studio.soundRecipe(ipa)}`
            + (many ? ', run together' : '') + `. No word around it. (/${ipa}/)`,
        };
        (many ? chunksOut : singles).push(item);
      }
    }
    return chunksOut.concat(singles);
  }

  // What to record for one entry: the whole line FIRST, then its words, then
  // whatever sound pieces of the buildup are not yet in the family's own
  // voice - chunks, then single sounds. Missing means "not recorded by you":
  // the shipped starter voice only ever fills gaps at video time.
  // A single word skips the line (the word IS the line); a letter entry
  // records nothing here - its sound belongs to the Sound Bank.
  function walkthroughItems(text, recorded) {
    const kind = entryKind(text);
    if (kind === 'letter') return [];
    const items = [];
    if (kind === 'sentence') {
      items.push({
        key: cur().sentenceKey(text), kind: 'sentence', display: text, length: 'line',
        say: 'Read the whole line the way you would to your child - not word by word.',
      });
    }
    items.push(...uniqueWords(text).map((w) => ({
      key: w.toLowerCase(), kind: 'word', display: w, length: 'free',
      say: 'Say it normally, the way you would in a sentence.',
    })));
    items.push(...pieceItems(text, recorded || new Set()));
    return items;
  }

  // ------------------------------------------------------------ starter packs
  // The old levels, reborn as content. Themed packs are SENTENCES, because
  // the library is sentences; two skill packs are the deliberate exception -
  // letter sounds and nonsense practice cannot be sentences by nature.
  function packDefs() {
    const c = cur();
    const ladder = [];
    for (const ch of c.LADDER) ladder.push(...ch.words, ch.sentence);
    // No invented "first words" pack: the personally-meaningful words - their
    // name, Mum, the pets - are exactly the ones a family types in themselves
    // and records in their own voice. Every pack shipped here is fully
    // covered by the starter voice on day one.
    return [
      { id: 'paw-patrol', group: 'favourites', name: 'Paw Patrol',
        description: 'The pups and their lines.',
        items: [
          'Chase is on the case.',
          'Skye is up in the sky.',
          'Marshall is all fired up.',
          'Rubble on the double.',
          'Rocky can fix it.',
          'Zuma is in the water.',
          'Ryder needs us.',
          'The pups save the day.',
          'No job is too big.',
          'No pup is too small.',
        ] },
      { id: 'veggie-tales', group: 'favourites', name: 'VeggieTales',
        description: 'Bob, Larry, and the song at the end of the show.',
        items: [
          'Bob is a tomato.',
          'Larry is a cucumber.',
          'It is time for silly songs.',
          'God made you special.',
          'He loves you very much.',
        ] },
      { id: 'gods-world', group: 'favourites', name: "God's world",
        description: 'Short lines of faith and thanks.',
        items: [
          'God made the sun.',
          'God made the sea.',
          'God made the dog.',
          'God made me.',
          'God loves me.',
          'Jesus loves me.',
          'Give thanks to the Lord.',
          'The Lord is my shepherd.',
        ] },
      { id: 'family-day', group: 'favourites', name: 'Around home',
        description: 'The lines of an ordinary day.',
        items: [
          'I love you.',
          'Time for bed.',
          'The dog wants to play.',
          'We can go to the park.',
          'What is for dinner?',
          'Come and see this.',
        ] },
      { id: 'letters', group: 'skills', name: 'Letter sounds',
        description: 'One letter at a time, in phonics order - s a t p i n first. Nothing to record: these use the sounds from Setup.',
        items: [...c.SATPIN, ...c.SET2, ...c.SET3].map(([l]) => l) },
      { id: 'ladder', group: 'skills', name: 'Building up',
        description: 'The whole journey in order: at, am, Sam, sat… ending in whole sentences, each built only from letters already met.',
        items: ladder },
      { id: 'nonsense', group: 'skills', name: 'Sounding-out practice',
        description: 'Made-up words like vam and zib. They cannot be memorised as shapes, so reading one proves the sounding-out is real.',
        items: [...c.CVC_NONSENSE] },
      { id: 'letter-teams', group: 'skills', name: 'Letter teams',
        description: 'sh, ch, th, ck as one sound: ship, chat, duck.',
        items: [...c.DIGRAPH_WORDS] },
      { id: 'first-sentences', group: 'skills', name: 'First sentences',
        description: 'Short decodable lines: A duck sat on the rock.',
        items: [...c.SENTENCES] },
    ];
  }

  async function packs() {
    const have = new Set((await load()).map((r) => r.id));
    return packDefs().map((p) => ({
      id: p.id, name: p.name, group: p.group, description: p.description,
      count: p.items.length,
      added: p.items.filter((i) => have.has(cur().sentenceKey(i))).length,
    }));
  }

  async function addPack(packId) {
    const p = packDefs().find((x) => x.id === packId);
    if (!p) throw new Error('No such pack.');
    let added = 0;
    for (const item of p.items) added += (await add(item)).length ? 1 : 0;
    return added;
  }

  // ---------------------------------------------------------------- estimate
  // Roughly how long the video will run, without building it. "Pick 20
  // minutes" was the wrong control: nobody can know what a length request
  // costs in buildup time, so the app says what the chosen content costs in
  // time instead. Rough is fine - it is a label, not a contract - but it
  // must track the options.
  function estimateSeconds(texts, reps, pause) {
    reps = reps === undefined ? 3 : reps;
    pause = pause === undefined ? 1.5 : pause;
    const c = cur();
    const PH = 0.75, WORD = 0.55, LINE = 2.6;
    const passes = Math.max(2, reps);
    const gap = 0.12; // mean of the (now brisk) shrinking approach gaps

    const wordCost = (w) => {
      if (c.decodable(w)) {
        const n = c.wordParts(w).length;
        return passes * n * (PH + gap) + WORD + pause + 1.0;
      }
      return Math.max(2, reps - 1) * (WORD + pause) + 1.0;
    };

    let total = 1.0; // the loop pad
    for (const text of texts) {
      const kind = entryKind(text);
      const words = uniqueWords(text);
      if (kind === 'letter') total += reps * (PH + pause) + 0.6;
      else if (kind === 'word') total += wordCost(words[0]);
      else {
        total += words.reduce((s, w) => s + wordCost(w), 0);
        total += text.split(/\s+/).length * (WORD + pause); // growing the line
        total += LINE + pause + 1.6;                        // the read-along
      }
    }
    return total;
  }

  // ------------------------------------------------------- read-along timing
  // Where each word falls inside a whole-line recording, as [start, end)
  // sample ranges that tile the audio exactly. No aligner: the isolated word
  // clips give each word's RELATIVE length, the line recording gives the
  // total. Room tone outside the speech is attached to the first and last
  // word, so the slices concatenate back to the original audio and the
  // picture can never drift from the sound.
  function wordSpans(audio, words, clipLens) {
    const n = audio.length;
    if (!words.length || n === 0) return [[0, n]];

    const thr = Math.max(SIO.dsp.peakOf(audio) * 0.06, 0.004);
    let start = 0, end = n, found = false;
    for (let i = 0; i < n; i++) if (Math.abs(audio[i]) > thr) { start = i; found = true; break; }
    if (found) {
      for (let i = n - 1; i >= 0; i--) if (Math.abs(audio[i]) > thr) { end = i + 1; break; }
    }

    const weights = words.map((w, i) => {
      const L = i < clipLens.length && clipLens[i] ? clipLens[i] : 0;
      let wt = L || Math.max(cur().cleanWord(w).length, 2);
      if (FUNCTION_WORDS.has(cur().cleanWord(w).toLowerCase())) wt *= FUNCTION_DISCOUNT;
      return wt;
    });
    const total = weights.reduce((s, x) => s + x, 0) || 1;

    let run = 0;
    const cuts = [];
    for (const wt of weights.slice(0, -1)) {
      run += wt;
      cuts.push(start + Math.trunc((end - start) * run / total));
    }
    const bounds = [0, ...cuts, n];
    return bounds.slice(0, -1).map((b, i) => [b, bounds[i + 1]]);
  }

  SIO.library = {
    FUNCTION_WORDS, FUNCTION_DISCOUNT,
    entryKind, uniqueWords, splitSentences,
    load, add, remove, statusOf, walkthroughItems, pieceItems, wordId, lineId,
    packDefs, packs, addPack, estimateSeconds, wordSpans,
  };
})();
