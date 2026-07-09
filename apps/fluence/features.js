// Deterministic feature extraction from a transcript + word-level timestamps.
// Pure functions, no I/O, no LLM. Ported verbatim from the fluence project
// (pipeline/features.js) onto the shared window.FL namespace.
//
// Input:  { text, words:[{word,start,end,confidence?}], durationSeconds }
// Output: stable JSON with pace, pauses, fillers, hedges, repetitions, lexical,
//         asr_confidence, structure — cheap to compute, easy to trend, rich
//         enough for the coach LLM to ground feedback in specific moments.
(function () {
  const FILLERS = FL.FILLERS, PHRASE_FILLERS = FL.PHRASE_FILLERS;
  const HEDGES = FL.HEDGES, PHRASE_HEDGES = FL.PHRASE_HEDGES;
  const COMMON_WORDS = FL.COMMON_WORDS, SENTENCE_ENDS = FL.SENTENCE_ENDS;

  const PAUSE_THRESHOLD_S = 0.4;   // gap >= this is a "pause"
  const LONG_PAUSE_S = 1.0;        // gap >= this is a "long pause" (worth flagging)
  const LOW_CONFIDENCE = 0.6;      // ASR confidence below this is "low"

  function clean(w) {
    return (w || '').toLowerCase().replace(/[.,!?;:"()\[\]{}—–]+$/g, '').replace(/^[.,!?;:"()\[\]{}—–]+/, '');
  }
  function median(arr) {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
  }
  function round(x, p = 2) { const m = 10 ** p; return Math.round(x * m) / m; }

  function adjacentRepeats(tokens) {
    let count = 0; const moments = [];
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].clean && tokens[i].clean === tokens[i - 1].clean) {
        count++;
        moments.push({ word: tokens[i].clean, start: tokens[i - 1].start, end: tokens[i].end });
      }
    }
    return { count, moments };
  }

  function segmentSentences(text) {
    if (!text) return [];
    const out = []; let buf = '';
    for (let i = 0; i < text.length; i++) {
      buf += text[i];
      if (SENTENCE_ENDS.test(text[i])) {
        while (i + 1 < text.length && SENTENCE_ENDS.test(text[i + 1])) buf += text[++i];
        out.push(buf.trim()); buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter((s) => s.length > 0);
  }

  function countPhrases(text, phrases) {
    const lower = ' ' + text.toLowerCase().replace(/[^a-z' ]+/g, ' ') + ' ';
    const counts = {}; let total = 0;
    for (const p of phrases) {
      const re = new RegExp('\\s' + p.replace(/'/g, "\\'") + '\\s', 'g');
      const matches = lower.match(re);
      const n = matches ? matches.length : 0;
      if (n > 0) counts[p] = n;
      total += n;
    }
    return { total, breakdown: counts };
  }

  FL.extractFeatures = function extractFeatures({ text = '', words = [], durationSeconds } = {}) {
    const tokens = words.map((w) => ({
      raw: w.word, clean: clean(w.word), start: w.start, end: w.end, confidence: w.confidence,
    })).filter((t) => t.clean);

    const measuredDuration = tokens.length ? Math.max(...tokens.map((t) => t.end || 0)) : 0;
    const duration = durationSeconds || measuredDuration || 0;

    // --- Pace ---
    const wordCount = tokens.length;
    const wpm = duration > 0 ? round((wordCount / duration) * 60, 1) : 0;
    let speakingTime = 0; const gaps = [];
    for (let i = 0; i < tokens.length; i++) {
      speakingTime += (tokens[i].end - tokens[i].start);
      if (i > 0) { const gap = tokens[i].start - tokens[i - 1].end; if (gap > 0) gaps.push(gap); }
    }
    const articulationWpm = speakingTime > 0 ? round((wordCount / speakingTime) * 60, 1) : 0;

    // --- Pauses ---
    const pauses = gaps.filter((g) => g >= PAUSE_THRESHOLD_S);
    const longPauses = gaps.filter((g) => g >= LONG_PAUSE_S);
    const longPauseMoments = [];
    for (let i = 1; i < tokens.length; i++) {
      const gap = tokens[i].start - tokens[i - 1].end;
      if (gap >= LONG_PAUSE_S) {
        longPauseMoments.push({
          gap_seconds: round(gap, 2), after_word: tokens[i - 1].clean,
          before_word: tokens[i].clean, at_seconds: round(tokens[i - 1].end, 2),
        });
      }
    }

    // --- Fillers ---
    const fillerCounts = {}; let fillerTotal = 0;
    for (const t of tokens) if (FILLERS.has(t.clean)) { fillerCounts[t.clean] = (fillerCounts[t.clean] || 0) + 1; fillerTotal++; }
    const phraseFillers = countPhrases(text, PHRASE_FILLERS);
    const totalFillers = fillerTotal + phraseFillers.total;

    // --- Hedges ---
    const hedgeCounts = {}; let hedgeTotal = 0;
    for (const t of tokens) if (HEDGES.has(t.clean)) { hedgeCounts[t.clean] = (hedgeCounts[t.clean] || 0) + 1; hedgeTotal++; }
    const phraseHedges = countPhrases(text, PHRASE_HEDGES);
    const totalHedges = hedgeTotal + phraseHedges.total;

    // --- Repetitions ---
    const reps = adjacentRepeats(tokens);

    // --- Lexical ---
    const types = new Set(tokens.map((t) => t.clean));
    const ttr = wordCount > 0 ? round(types.size / wordCount, 3) : 0;
    const avgWordLength = wordCount > 0 ? round(tokens.reduce((s, t) => s + t.clean.length, 0) / wordCount, 2) : 0;
    const uncommonTokens = tokens.filter((t) => !COMMON_WORDS.has(t.clean) && !FILLERS.has(t.clean));
    const uncommonTypes = new Set(uncommonTokens.map((t) => t.clean));
    const uncommonRatio = wordCount > 0 ? round(uncommonTokens.length / wordCount, 3) : 0;
    const uncommonSample = [...uncommonTypes].slice(0, 30);

    // --- ASR confidence ---
    const confs = tokens.map((t) => t.confidence).filter((c) => typeof c === 'number');
    const asrConfidence = confs.length
      ? { mean: round(confs.reduce((a, b) => a + b, 0) / confs.length, 3), low_count: confs.filter((c) => c < LOW_CONFIDENCE).length }
      : null;

    // --- Structure ---
    const sentences = segmentSentences(text);
    const sentenceLens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const structure = {
      sentence_count: sentences.length,
      mean_sentence_length: sentenceLens.length ? round(sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length, 1) : 0,
      sentence_length_std: round(stddev(sentenceLens), 1),
    };

    return {
      meta: { word_count: wordCount, duration_seconds: round(duration, 2) },
      pace: { wpm, articulation_rate_wpm: articulationWpm },
      pauses: {
        count: pauses.length,
        mean_seconds: pauses.length ? round(pauses.reduce((a, b) => a + b, 0) / pauses.length, 2) : 0,
        median_seconds: round(median(pauses), 2),
        max_seconds: pauses.length ? round(Math.max(...pauses), 2) : 0,
        per_minute: duration > 0 ? round((pauses.length / duration) * 60, 2) : 0,
        long_pause_count: longPauses.length,
        long_pause_moments: longPauseMoments.slice(0, 10),
      },
      fillers: {
        total: totalFillers,
        per_minute: duration > 0 ? round((totalFillers / duration) * 60, 2) : 0,
        single_word_breakdown: fillerCounts, phrase_breakdown: phraseFillers.breakdown,
      },
      hedges: {
        total: totalHedges,
        per_minute: duration > 0 ? round((totalHedges / duration) * 60, 2) : 0,
        single_word_breakdown: hedgeCounts, phrase_breakdown: phraseHedges.breakdown,
      },
      repetitions: { adjacent_count: reps.count, adjacent_moments: reps.moments.slice(0, 10) },
      lexical: {
        tokens: wordCount, types: types.size, ttr, avg_word_length: avgWordLength,
        uncommon_word_count: uncommonTokens.length, uncommon_unique_count: uncommonTypes.size,
        uncommon_word_ratio: uncommonRatio, uncommon_sample: uncommonSample,
      },
      asr_confidence: asrConfidence,
      structure,
    };
  };

  // Per-dimension "weakness score" (0-1, higher = worse). Drives which drill to
  // suggest and what the coach anchors on.
  FL.weaknessScores = function weaknessScores(features) {
    const w = {};
    w.fillers = Math.min(1, (features.fillers.per_minute || 0) / 8);
    w.long_pauses = Math.min(1, (features.pauses.long_pause_count || 0) / 4);
    w.restarts = Math.min(1, (features.repetitions.adjacent_count || 0) / 3);
    w.lexical_diversity = Math.max(0, Math.min(1, (0.5 - (features.lexical.ttr || 0)) / 0.3));
    w.vocabulary_reach = Math.max(0, Math.min(1, (0.20 - (features.lexical.uncommon_word_ratio || 0)) / 0.15));
    w.hedging = Math.min(1, (features.hedges.per_minute || 0) / 5);
    const wpm = features.pace.wpm || 0;
    const paceMiss = wpm < 100 ? (100 - wpm) / 50 : wpm > 190 ? (wpm - 190) / 50 : 0;
    w.pace = Math.max(0, Math.min(1, paceMiss));
    return w;
  };

  FL.topWeakness = function topWeakness(features) {
    const scores = FL.weaknessScores(features);
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return { name: sorted[0][0], score: sorted[0][1], all: scores };
  };
})();
