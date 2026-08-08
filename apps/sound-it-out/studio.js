// Record the clip library in the app, one item at a time. Port of
// gen/studio.py, re-plumbed for the sandbox: the app never holds the live
// microphone - each take is a brokered gifos.recordAudio() clip, captured by
// GifOS behind its own indicator and scored the moment it lands. Best take
// kept; a schwa on /t/ is discovered NOW, not after the session.
//
// What is stored: the recorder's own compressed bytes (b64) in `recordings`,
// with the measured trim window alongside - never re-encoded - plus a
// blob-free row in `recmeta` so progress and review lists stay cheap.
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const cur = () => SIO.curriculum;
  const dsp = () => SIO.dsp;

  const MAX_SECONDS = { hold: 7, crisp: 5, free: 5, line: 12 };

  // ------------------------------------------------------------------ plan

  // The ordered list of things to record, with on-screen guidance.
  function plan(part, groups) {
    const items = [];
    if (part === 'phonemes') {
      for (const p of cur().PHONEME_ROWS) {
        const hold = p.length === 'hold';
        items.push({
          key: p.key, kind: 'phoneme', display: p.display, ipa: p.ipa, length: p.length,
          // "as in", not "at the start of": nearly every vowel example has the
          // sound in the middle or at the end (oo in moon, ar in car).
          say: `Say the “${p.display}” sound, as in “${p.example}” - `
            + (hold ? 'hold it for about two seconds.'
              : p.length === 'crisp' ? 'keep it short and crisp.' : 'say it naturally.'),
        });
      }
    } else if (part === 'sentences') {
      // Every whole line any level reads out. About ten, and they take a
      // minute; without them the sentence read is the one thing that can
      // never be your voice however much else you record.
      const seen = new Set();
      const texts = cur().LADDER.map((ch) => ch.sentence).concat(cur().SENTENCES);
      for (const text of texts) {
        const key = cur().sentenceKey(text);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          key, kind: 'sentence', display: text, length: 'line',
          say: 'Read the whole line the way you would to your child - not word by word.',
        });
      }
    } else {
      // Your own list first, then every word the fixed levels teach that is
      // not already in it - without these, the build-up level was 32% real
      // voice even after a full recording session.
      const seen = new Set(), order = [];
      const add = (w) => {
        const k = w.toLowerCase();
        if (!seen.has(k)) { seen.add(k); order.push(w); }
      };
      for (const w of SIO.wordlist.allWords(groups)) add(w);
      for (const ch of cur().LADDER) {
        for (const w of ch.words) add(w);
        for (const w of ch.sentence.split(/\s+/)) add(w.replace(/[.,!?]+$/g, ''));
      }
      for (const w of cur().DIGRAPH_WORDS) add(w);
      for (const w of cur().CLUSTER_WORDS) add(w);
      for (const sent of cur().SENTENCES) for (const w of sent.split(/\s+/)) add(w.replace(/[.,!?]+$/g, ''));
      for (const w of order) {
        items.push({
          key: w.toLowerCase(), kind: 'word', display: w, length: 'free',
          say: 'Say it normally, the way you would in a sentence.',
        });
      }
    }
    return items;
  }

  function storageId(item) {
    const sub = { phoneme: 'phonemes', sentence: 'sentences' }[item.kind] || 'words';
    const key = item.kind === 'phoneme' ? item.ipa : item.key;
    return SIO.recId(sub, key);
  }

  async function doneMap() {
    const meta = await SIO.store.db('recmeta').getAll();
    return new Map((meta || []).map((m) => [m.id, m]));
  }

  // ---------------------------------------------------------------- record

  // One brokered take -> { audio: Float32Array, sr, bytes, mime } or null if
  // the user cancelled the capture.
  async function takeOne(item) {
    if (!window.gifos || !window.gifos.recordAudio) {
      throw new Error('Recording needs this app to be open inside GifOS.');
    }
    let clip;
    try {
      clip = await window.gifos.recordAudio({ maxSeconds: MAX_SECONDS[item.length] || 6 });
    } catch (e) {
      if (/denied|cancel/i.test(String(e && e.message))) return null;
      throw e;
    }
    if (!clip || !clip.bytes) return null;
    const buf = await dsp().decodeBytes(clip.bytes);
    const { data, sr } = dsp().toMono(buf);
    return { audio: data, sr, bytes: clip.bytes, mime: clip.mime || 'audio/webm' };
  }

  // Score a set of takes, save the chosen one, and report back in the words
  // the original used. `takes` come from takeOne().
  async function saveBest(item, takes) {
    const sr = takes[0].sr;
    const result = dsp().choose(takes.map((t) => t.audio), sr, item);
    if (result.allFailed) return result;

    const chosen = takes[result.best];
    const [lo, hi] = dsp().trimBounds(chosen.audio, chosen.sr);
    const id = storageId(item);
    // Keep the previous take before overwriting: a worse second attempt is
    // not a one-way door.
    const prev = await SIO.store.db('recordings').get(id);
    if (prev && prev.b64) {
      await SIO.store.db('recordings').put(Object.assign({}, prev, { id: id + '/previous' }));
    }
    await SIO.store.db('recordings').put({
      id,
      b64: dsp().bytesToB64(chosen.bytes),
      mime: chosen.mime,
      trimStartS: lo / chosen.sr,
      trimEndS: hi / chosen.sr,
    });
    const takeInfo = result.takes[result.best];
    await SIO.store.db('recmeta').put({
      id,
      part: { phoneme: 'phonemes', sentence: 'sentences' }[item.kind] || 'words',
      key: item.key,
      display: item.display,
      seconds: takeInfo.seconds,
      value: takeInfo.value,
      notes: takeInfo.notes,
      when: Date.now(),
    });
    return result;
  }

  // Deleting a clip is the redo: progress is read from what is stored, so
  // removing one puts exactly that item back in the queue.
  async function remove(item) {
    const id = storageId(item);
    await SIO.store.db('recordings').delete(id);
    await SIO.store.db('recordings').delete(id + '/previous');
    await SIO.store.db('recmeta').delete(id);
  }

  async function clearPart(part, groups) {
    for (const item of plan(part, groups)) {
      const id = storageId(item);
      const meta = await SIO.store.db('recmeta').get(id);
      if (meta) await remove(item);
    }
  }

  async function playBack(item) {
    const id = storageId(item);
    const rec = await SIO.store.db('recordings').get(id);
    if (!rec || !rec.b64) return false;
    const buf = await dsp().decodeBytes(dsp().b64ToBytes(rec.b64));
    const actx = dsp().audioContext();
    if (actx.state === 'suspended') actx.resume();
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    src.start();
    return true;
  }

  SIO.studio = { plan, storageId, doneMap, takeOne, saveBest, remove, clearPart, playBack, MAX_SECONDS };
})();
