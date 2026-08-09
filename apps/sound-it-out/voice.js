// Where each sound comes from. Two tiers, and NOTHING synthetic:
//
//     1. her recording, if it exists     -> content verbatim, levelled
//     2. the starter voice               -> the app author's own recordings,
//                                           shipped in clips-data.js
//
// The buildup must never be two voices: sounds arriving in one voice and the
// word in another is jarring enough to make the buildup not worth doing. So
// there is no synthesiser tier and no text-to-speech tier - a clip neither
// she nor the starter voice has is honestly MISSING, the entry shows as not
// ready, and the fix is recording it. (Today the starter voice ships the 42
// phonemes; the pack words and sentences follow when the author records them
// upstream - the tables are already read here.)
//
// Every return passes through loud(): gain only, so a quiet recording session
// does not become a quiet television. Content is still verbatim.
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const dsp = () => SIO.dsp;
  const cur = () => SIO.curriculum;

  const SLOW_WORD = 0.80;

  // gen/soundout.loud(): bring one clip to a consistent speaking level.
  const LOUD_TARGET_RMS = 0.09, LOUD_CEILING = 0.97, LOUD_MAX_GAIN = 12.0;
  function loudGain(data) {
    if (!data.length) return 1;
    const rms = dsp().rmsOf(data);
    if (rms < 1e-5) return 1;
    let g = Math.min(LOUD_TARGET_RMS / rms, LOUD_MAX_GAIN);
    const peak = dsp().peakOf(data);
    if (peak * g > LOUD_CEILING) g = LOUD_CEILING / peak;
    return Math.abs(g - 1) < 0.05 ? 1 : g;
  }
  function loud(buffer) {
    const { data, sr } = dsp().toMono(buffer);
    const g = loudGain(data);
    if (g === 1 && buffer.numberOfChannels === 1) return buffer;
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] * g;
    return dsp().bufferFrom(out, sr);
  }

  function recId(kind, key) { return kind + '/' + key; }

  function starterTable(table, key) {
    const C = window.SIO_CLIPS;
    if (!C || !C.clips || !C.clips[table]) return null;
    const t = C.clips[table];
    if (t[key] !== undefined) return t[key];
    for (const alt of cur().PHONEME_ALIASES[key] || []) {
      if (t[alt] !== undefined) return t[alt];
    }
    return null;
  }

  function VoiceSource() {
    this.used = { recorded: 0, starter: 0, missing: 0 };
    this.missing = [];
    this._cache = new Map();
    this._recIndex = null;
  }

  VoiceSource.prototype.loadRecordedIndex = async function () {
    const meta = await SIO.store.db('recmeta').getAll();
    this._recIndex = new Set((meta || []).filter((m) => !m.id.endsWith('/previous')).map((m) => m.id));
    return this._recIndex;
  };

  // Synchronous once the index is loaded: can a phoneme be said at all, in
  // either her voice or the starter voice? The buildup gate reads this - a
  // word whose sounds cannot all be said is shown whole instead, because a
  // half-voiced buildup is worse than none.
  VoiceSource.prototype.phonemeAvailable = function (ipa) {
    const keys = [ipa].concat(cur().PHONEME_ALIASES[ipa] || []);
    if (this._recIndex && keys.some((k) => this._recIndex.has(recId('phonemes', k)))) return true;
    return starterTable('phonemes', ipa) !== null;
  };

  VoiceSource.prototype._recorded = async function (kind, key) {
    if (!this._recIndex) await this.loadRecordedIndex();
    let id = recId(kind, key);
    if (!this._recIndex.has(id)) {
      const alts = cur().PHONEME_ALIASES[key] || [];
      const alt = alts.find((a) => this._recIndex.has(recId(kind, a)));
      if (!alt) return null;
      id = recId(kind, alt);
    }
    const rec = await SIO.store.db('recordings').get(id);
    if (!rec || !rec.b64) return null;
    // The recorder's own compressed bytes plus the measured trim window -
    // never re-encoded. Slice the room tone off here.
    const buf = await dsp().decodeBytes(dsp().b64ToBytes(rec.b64));
    if (rec.trimStartS === undefined) return buf;
    const { data, sr } = dsp().toMono(buf);
    const lo = Math.max(0, Math.round((rec.trimStartS || 0) * sr));
    const hi = Math.min(data.length, Math.round((rec.trimEndS || (data.length / sr)) * sr));
    if (hi <= lo) return buf;
    return dsp().bufferFrom(data.subarray(lo, hi), sr);
  };

  VoiceSource.prototype._decode = async function (b64) {
    return dsp().decodeBytes(dsp().b64ToBytes(b64));
  };

  VoiceSource.prototype._stretched = function (buffer, tempo) {
    const { data, sr } = dsp().toMono(buffer);
    return dsp().bufferFrom(dsp().stretch(data, sr, tempo), sr);
  };

  VoiceSource.prototype.resolve = async function (req) {
    const ck = JSON.stringify(req);
    if (this._cache.has(ck)) return this._cache.get(ck);
    const out = await this._resolve(req);
    const levelled = out ? loud(out) : null;
    this._cache.set(ck, levelled);
    return levelled;
  };

  VoiceSource.prototype._resolve = async function (req) {
    const kind = req.kind;
    try {
      if (kind === 'phoneme') {
        // req.cap: the buildup's per-pass ceiling (see curriculum.approach) -
        // sliced here so each pass gets its own compressed variant, cached
        // separately by the request key.
        const capped = (buf) => {
          if (!req.cap || !buf) return buf;
          const { data, sr } = dsp().toMono(buf);
          const cut = dsp().capData(data, sr, req.cap);
          return cut === data ? buf : dsp().bufferFrom(cut, sr);
        };
        const rec = await this._recorded('phonemes', req.ipa);
        if (rec) { this.used.recorded++; return capped(rec); }
        const st = starterTable('phonemes', req.ipa);
        if (st) { this.used.starter++; return capped(await this._decode(st)); }
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
        const st = starterTable('words', key);
        if (st) {
          this.used.starter++;
          const buf = await this._decode(st);
          return req.slow ? this._stretched(buf, SLOW_WORD) : buf;
        }
        this.used.missing++;
        this.missing.push({ kind, label: '“' + req.text + '”' });
        return null;
      }

      if (kind === 'sentence') {
        const skey = cur().sentenceKey(req.text);
        const rec = await this._recorded('sentences', skey);
        if (rec) { this.used.recorded++; return rec; } // her own pace, untouched
        const st = starterTable('sentences', skey);
        if (st) { this.used.starter++; return this._decode(st); }
        this.used.missing++;
        this.missing.push({ kind, label: '“' + req.text + '”' });
        return null;
      }
    } catch (e) {
      this.used.missing++;
      this.missing.push({ kind, label: (req.text || req.ipa || '?') + ' (' + (e && e.message || 'failed') + ')' });
      return null;
    }
    return null;
  };

  VoiceSource.prototype.summary = function () {
    const u = this.used;
    const total = (u.recorded + u.starter + u.missing) || 1;
    const bits = [`${u.recorded} in your voice`];
    if (u.starter) bits.push(`${u.starter} starter voice`);
    if (u.missing) bits.push(`${u.missing} with no voice yet`);
    return bits.join(', ') + ` (${Math.floor((u.recorded * 100) / total)}% genuinely yours)`;
  };

  SIO.VoiceSource = VoiceSource;
  SIO.recId = SIO.recId || recId;
  SIO.starterTable = starterTable;
  SIO.voiceLoud = { loudGain, loud };
})();
