// The coach LLM prompt. Ported from the fluence project (pipeline/coach.js),
// trimmed to lean-v1 "free speaking" — the connected-speech coaching path. The
// drill-type grading machinery (semantic/letter fluency, picture description,
// etc.) is intentionally left out of v1 and can be grafted back later. Builds
// the system + user messages; app.js sends them through gifos.ai.chat.
(function () {
  FL.COACH_SYSTEM = `You are a sharp, candid speech coach for spontaneous speaking — the kind of coach who tells the truth rather than flattering the user. Your goal is to help them speak more fluently in the moment: better lexical retrieval under pressure, smoother thought-to-speech, more confident phrasing.

Rules:
- Ground every observation in specific evidence from the data provided (a moment, a word, a number).
- Avoid generic praise. If something is good, say what specifically and why.
- Be direct but constructive. Treat the user as an intelligent adult who wants to improve.
- Reference timestamps (in seconds) when pointing to specific moments.
- Do not invent details that aren't in the transcript or features.
- Output valid JSON only, matching the schema below. No prose, no markdown fences.

This was a FREE / open speaking take (connected speech): coach normally — pace, fillers, structure, lexical breadth, hedging, restarts, long pauses.

## Schema

{
  "overall": "1-2 sentences, candid honest summary",
  "strengths": [{"label": "short name", "evidence": "specific detail from transcript or features"}],
  "weaknesses": [{"label": "short name", "evidence": "specific detail", "dimension": "fillers|long_pauses|restarts|lexical_diversity|vocabulary_reach|hedging|pace"}],
  "moments": [{"at_seconds": 12.5, "what_happened": "what you noticed", "suggestion": "what to try next time"}],
  "trend_note": "optional, only include if history shows a clear pattern; otherwise omit this field"
}`;

  FL.buildCoachUser = function buildCoachUser({ transcript, features, drillPrompt, history }) {
    const weakness = FL.topWeakness(features);

    let historyBlock = '';
    if (history && history.length > 0) {
      const summaries = history.map((h) => {
        const f = h.features || null;
        return {
          when: h.created_at ? new Date(h.created_at).toISOString() : null,
          prompt: h.drill_prompt,
          fillers_per_min: f && f.fillers ? f.fillers.per_minute : null,
          long_pauses: f && f.pauses ? f.pauses.long_pause_count : null,
          ttr: f && f.lexical ? f.lexical.ttr : null,
          uncommon_ratio: f && f.lexical ? f.lexical.uncommon_word_ratio : null,
          wpm: f && f.pace ? f.pace.wpm : null,
        };
      });
      historyBlock = '\n\n## Recent history (most recent first)\n' + JSON.stringify(summaries, null, 2);
    }

    const weaknessBlock = '\n\n## Computed weakness scores (higher = worse, 0-1 scale)\nTop weakness: ' +
      weakness.name + ' (' + weakness.score.toFixed(2) + ')\nAll: ' + JSON.stringify(weakness.all, null, 2);

    return '## What the user spoke about\nprompt: ' + (drillPrompt || '(open speaking)') +
      '\n\n## Transcript\n' + (transcript || '(empty)') +
      '\n\n## Deterministic features (computed, not opinion)\n' + JSON.stringify(features, null, 2) +
      weaknessBlock + historyBlock +
      '\n\n## Your task\nCoach the user on this take. Pick 1-2 strengths and 1-2 weaknesses (be honest — if there is nothing genuinely strong, say so in "overall" rather than inventing strengths). Identify 2-3 specific moments worth pointing to, each with a concrete suggestion. Output JSON only, matching the schema.';
  };

  // The coach is told to emit bare JSON, but models sometimes wrap it in fences.
  FL.stripFences = function stripFences(s) {
    return String(s || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  };
})();
