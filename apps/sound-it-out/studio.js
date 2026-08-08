// Recording, one item at a time, scored the moment it lands. Port of
// gen/studio.py's scoring flow, re-plumbed for the sandbox: each take is a
// brokered gifos.recordAudio() clip, captured by GifOS behind its own
// indicator. Two callers share it: Setup's 42-sound session (best of three),
// and each library entry's walk-through (its unrecorded words, then the whole
// line - see library.walkthroughItems).
//
// Stored: the recorder's own compressed bytes in `recordings` with the
// measured trim window - never re-encoded - plus a blob-free row in `recmeta`
// (the shared word BANK's catalog: every word on record, listed from what is
// stored rather than from any curriculum list, because the bank holds words
// recorded through sentences that appear on no list anywhere).
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const cur = () => SIO.curriculum;
  const dsp = () => SIO.dsp;

  const MAX_SECONDS = { hold: 7, crisp: 5, free: 5, line: 12 };

  // Setup's session: the 42 sounds, in RECORDING.md's printed order.
  function phonemePlan() {
    return cur().PHONEME_ROWS.map((p) => {
      const hold = p.length === 'hold';
      return {
        key: p.key, kind: 'phoneme', display: p.display, ipa: p.ipa, length: p.length,
        say: `Say the “${p.display}” sound, as in “${p.example}” - `
          + (hold ? 'hold it for about two seconds.'
            : p.length === 'crisp' ? 'keep it short and crisp.' : 'say it naturally.'),
      };
    });
  }

  function storageId(item) {
    const sub = { phoneme: 'phonemes', sentence: 'sentences' }[item.kind] || 'words';
    const key = item.kind === 'phoneme' ? item.ipa : item.key;
    return SIO.recId(sub, key);
  }

  async function doneMap() {
    const meta = await SIO.store.db('recmeta').getAll();
    return new Map((meta || []).filter((m) => !m.id.endsWith('/previous')).map((m) => [m.id, m]));
  }

  // The shared word bank, listed from what is actually stored.
  async function bankList() {
    const meta = await doneMap();
    return [...meta.values()].filter((m) => m.part === 'words')
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }

  // One brokered take. Returns { audio, sr, bytes, mime }, null if the user
  // cancelled, or throws with directions when the microphone path is walled
  // off (the desktop app's dead-mic lesson: a silent failure looks alive).
  async function takeOne(item) {
    if (!window.gifos || !window.gifos.recordAudio) {
      throw new Error('Recording needs this app to be open inside GifOS.');
    }
    let clip;
    try {
      clip = await window.gifos.recordAudio({ maxSeconds: MAX_SECONDS[item.length] || 6 });
    } catch (e) {
      if (/denied/i.test(String(e && e.message))) {
        throw new Error('The microphone was refused. Allow it for this site in the browser, then try again - nothing needs restarting.');
      }
      if (/cancel/i.test(String(e && e.message))) return null;
      throw e;
    }
    if (!clip || !clip.bytes) return null;
    const buf = await dsp().decodeBytes(clip.bytes);
    const { data, sr } = dsp().toMono(buf);
    return { audio: data, sr, bytes: clip.bytes, mime: clip.mime || 'audio/webm' };
  }

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
  async function removeId(id) {
    await SIO.store.db('recordings').delete(id);
    await SIO.store.db('recordings').delete(id + '/previous');
    await SIO.store.db('recmeta').delete(id);
  }
  const remove = (item) => removeId(storageId(item));

  async function playBackId(id) {
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
  const playBack = (item) => playBackId(storageId(item));

  SIO.studio = {
    phonemePlan, storageId, doneMap, bankList,
    takeOne, saveBest, remove, removeId, playBack, playBackId, MAX_SECONDS,
  };
})();
