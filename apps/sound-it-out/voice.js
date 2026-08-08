// Where each sound comes from. Port of gen/voice.py, re-tiered for the
// browser:
//
//     1. the parent's recording, if it exists   -> used verbatim, untouched
//     2. the bundled built-in clips             -> synthesised offline and
//                                                  packed into this GIF
//     3. a Text-to-speech model via gifos.ai    -> words and sentences only
//
// (1) covers levels 1-6, which is where a new reader stays for a long time,
// and nothing there is synthesised. (2) is the desktop app's Kokoro voice,
// with the schwa-stripping and sustain already applied by the real pipeline
// before packing - so the app is useful on day one with zero setup and zero
// network. (3) exists for the open-ended levels and for words added to the
// list that nobody has recorded yet; phonemes are NEVER synthesised at
// runtime - a wrong sound teaches a wrong thing, and the bundled set is
// complete.
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const dsp = () => SIO.dsp;
  const cur = () => SIO.curriculum;

  const SLOW_WORD = 0.80;      // the sound-out arrival (gen/voice.py word slow=)
  const SLOW_TTS_SENT = 0.85;  // brokered TTS reads quicker than a parent would;
                               // milder than the original's 0.68, which was
                               // tuned to Kokoro specifically.

  function recId(kind, key) { return kind + '/' + key; }

  function VoiceSource() {
    this.used = { recorded: 0, builtin: 0, tts: 0, missing: 0 };
    this.missing = [];        // [{kind, label}] - surfaced after a build
    this._cache = new Map();  // resolved AudioBuffers by cache key
    this._recIndex = null;    // Set of recorded ids (from recmeta)
  }

  VoiceSource.prototype.loadRecordedIndex = async function () {
    const meta = await SIO.store.db('recmeta').getAll();
    this._recIndex = new Set((meta || []).map((m) => m.id));
    return this._recIndex;
  };

  VoiceSource.prototype._recorded = async function (kind, key) {
    if (!this._recIndex) await this.loadRecordedIndex();
    let id = recId(kind, key);
    if (!this._recIndex.has(id)) {
      // Try the other transcription of the same sound before giving up:
      // a recorded /a/ must satisfy a request for /æ/.
      const alts = cur().PHONEME_ALIASES[key] || [];
      const alt = alts.find((a) => this._recIndex.has(recId(kind, a)));
      if (!alt) return null;
      id = recId(kind, alt);
    }
    const rec = await SIO.store.db('recordings').get(id);
    if (!rec || !rec.b64) return null;
    // Stored as the recorder's own compressed bytes plus the trim window the
    // studio measured - re-encoding her voice to store it would be a loss for
    // nothing. Slice the room tone off here, exactly as scored.
    const buf = await dsp().decodeBytes(dsp().b64ToBytes(rec.b64));
    if (rec.trimStartS === undefined) return buf;
    const { data, sr } = dsp().toMono(buf);
    const lo = Math.max(0, Math.round((rec.trimStartS || 0) * sr));
    const hi = Math.min(data.length, Math.round((rec.trimEndS || (data.length / sr)) * sr));
    if (hi <= lo) return buf;
    return dsp().bufferFrom(data.subarray(lo, hi), sr);
  };

  VoiceSource.prototype._bundled = function (kind, key) {
    const C = window.SIO_CLIPS;
    if (!C || !C.clips) return null;
    const table = C.clips[kind];
    if (!table) return null;
    if (table[key] !== undefined) return table[key];
    for (const alt of cur().PHONEME_ALIASES[key] || []) {
      if (table[alt] !== undefined) return table[alt];
    }
    return null;
  };

  VoiceSource.prototype._decodeBundled = async function (b64) {
    return dsp().decodeBytes(dsp().b64ToBytes(b64));
  };

  VoiceSource.prototype._tts = async function (text) {
    // Cached by text, so repeated builds never re-hit the model.
    const id = 't/' + text.toLowerCase().slice(0, 120);
    const cached = await SIO.store.db('ttscache').get(id);
    if (cached && cached.b64) return dsp().decodeBytes(dsp().b64ToBytes(cached.b64));
    if (!window.gifos || !window.gifos.ai) return null;
    const r = await window.gifos.ai.tts({ text });
    if (!r || !r.bytes) return null;
    await SIO.store.db('ttscache').put({ id, b64: dsp().bytesToB64(r.bytes), mime: r.mime || 'audio/mpeg' });
    return dsp().decodeBytes(r.bytes);
  };

  VoiceSource.prototype._stretched = function (buffer, tempo) {
    const { data, sr } = dsp().toMono(buffer);
    return dsp().bufferFrom(dsp().stretch(data, sr, tempo), sr);
  };

  // Resolve one clip request ({kind:'phoneme',ipa} | {kind:'word',text,slow} |
  // {kind:'blend',ipas} | {kind:'sentence',text}) to an AudioBuffer, or null
  // when no tier can say it. Null is not an error: the segment still shows,
  // it just holds silently, and the miss is reported after the build.
  VoiceSource.prototype.resolve = async function (req) {
    const ck = JSON.stringify(req);
    if (this._cache.has(ck)) return this._cache.get(ck);
    const out = await this._resolve(req);
    this._cache.set(ck, out);
    return out;
  };

  VoiceSource.prototype._resolve = async function (req) {
    const kind = req.kind;
    try {
      if (kind === 'phoneme') {
        const rec = await this._recorded('phonemes', req.ipa);
        if (rec) { this.used.recorded++; return rec; }
        const b = this._bundled('phonemes', req.ipa);
        if (b) { this.used.builtin++; return this._decodeBundled(b); }
        // Never TTS'd: isolated phonemes are exactly what general models get
        // wrong, and a wrong phoneme teaches a wrong sound.
        this.used.missing++;
        this.missing.push({ kind, label: 'the sound /' + req.ipa + '/' });
        return null;
      }

      if (kind === 'word') {
        const key = req.text.toLowerCase();
        const rec = await this._recorded('words', key);
        if (rec) {
          this.used.recorded++;
          return req.slow ? this._stretched(rec, SLOW_WORD) : rec;
        }
        const b = this._bundled(req.slow ? 'wordsSlow' : 'words', key);
        if (b) { this.used.builtin++; return this._decodeBundled(b); }
        // A slow request with only a normal-speed bundled clip: stretch it.
        const bn = req.slow ? this._bundled('words', key) : null;
        if (bn) { this.used.builtin++; return this._stretched(await this._decodeBundled(bn), SLOW_WORD); }
        const tts = await this._tts(req.text);
        if (tts) {
          this.used.tts++;
          return req.slow ? this._stretched(tts, SLOW_WORD) : tts;
        }
        this.used.missing++;
        this.missing.push({ kind, label: '“' + req.text + '”' });
        return null;
      }

      if (kind === 'blend') {
        const key = req.ipas.join('');
        const rec = await this._recorded('blends', key);
        if (rec) { this.used.recorded++; return rec; }
        const b = this._bundled('blends', key);
        if (b) { this.used.builtin++; return this._decodeBundled(b); }
        this.used.missing++;
        this.missing.push({ kind, label: 'the blend /' + key + '/' });
        return null;
      }

      if (kind === 'sentence') {
        const rec = await this._recorded('sentences', cur().sentenceKey(req.text));
        if (rec) { this.used.recorded++; return rec; } // her own pace, untouched
        const b = this._bundled('sentences', cur().sentenceKey(req.text));
        if (b) { this.used.builtin++; return this._decodeBundled(b); }
        const tts = await this._tts(req.text);
        if (tts) { this.used.tts++; return this._stretched(tts, SLOW_TTS_SENT); }
        this.used.missing++;
        this.missing.push({ kind, label: '“' + req.text + '”' });
        return null;
      }
    } catch (e) {
      // A single failed clip degrades one word, never the whole build.
      this.used.missing++;
      this.missing.push({ kind, label: (req.text || req.ipa || (req.ipas || []).join('')) + ' (' + (e && e.message || 'failed') + ')' });
      return null;
    }
    return null;
  };

  VoiceSource.prototype.summary = function () {
    const u = this.used;
    const total = (u.recorded + u.builtin + u.tts + u.missing) || 1;
    const bits = [`${u.recorded} from your recordings`, `${u.builtin} built-in`];
    if (u.tts) bits.push(`${u.tts} text-to-speech`);
    if (u.missing) bits.push(`${u.missing} with no voice yet`);
    return bits.join(', ') + ` (${Math.floor((u.recorded * 100) / total)}% genuinely yours)`;
  };

  SIO.VoiceSource = VoiceSource;
  SIO.recId = recId;
})();
