// Weekly review — synthesizes ~7 days of takes into a longer-form pattern
// analysis the per-take coach can't see. Ported from the fluence project
// (pipeline/weekly_review.js), rewired to gifos.ai.chat (the "smartest" role,
// which stands in for the long-context coach_weekly). Attaches to window.FL.
(function () {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  FL.WEEKLY_SYSTEM = `You are reviewing a week of spontaneous-speech practice takes for a single user. Find patterns the per-take coach can't see: improvements, regressions, persistent weak spots, breakthrough moments.

Rules:
- Look across takes, not individual moments — the per-take coach already did that.
- Be specific. Cite take indices (1, 2, 3…) and drill types. No generic praise.
- If the week shows a real improvement on a dimension, name it. If it shows regression or being stuck, say so honestly.
- One concrete focus recommendation for next week. Not five.
- Do not invent details that aren't in the data.
- Output valid JSON only, matching the schema. No prose, no markdown fences.

Schema:
{
  "period_summary": "2-3 sentences on the arc of this week",
  "patterns": [{ "label": "short name", "evidence": "specific takes / metrics / drill types", "direction": "improving|worsening|flat" }],
  "breakthroughs": [{ "take_index": 1, "what_happened": "what was notable" }],
  "recommended_focus_next_week": { "what": "the specific thing", "why": "tied to what you observed", "drill_suggestion": "free|semantic_fluency|forced_substitution|bridging|recast|letter_fluency|topic_switch|picture_description|bullet_points" }
}`;

  FL.buildWeeklyUser = function buildWeeklyUser(takes, priorSummary) {
    const summaries = takes.map((s, i) => {
      const f = s.features || null;
      const cf = s.feedback || null;
      return {
        index: i + 1,
        when: s.created_at ? new Date(s.created_at).toISOString() : null,
        drill_type: s.drill_type,
        prompt: (s.drill_prompt || '').slice(0, 200),
        transcript_excerpt: (s.transcript || '').slice(0, 400),
        key_metrics: f ? {
          wpm: f.pace && f.pace.wpm, fillers_per_min: f.fillers && f.fillers.per_minute,
          ttr: f.lexical && f.lexical.ttr, uncommon_ratio: f.lexical && f.lexical.uncommon_word_ratio,
          long_pauses: f.pauses && f.pauses.long_pause_count, hedges_per_min: f.hedges && f.hedges.per_minute,
        } : null,
        coach_overall: cf && cf.overall || null,
        coach_top_weakness: cf && cf.weaknesses && cf.weaknesses[0] && cf.weaknesses[0].label || null,
      };
    });
    const prior = priorSummary ? '\n\n## Prior week summary (for comparison)\n' + JSON.stringify(priorSummary, null, 2) : '';
    return "## This week's takes (" + takes.length + ')\n' + JSON.stringify(summaries, null, 2) + prior +
      '\n\n## Your task\nWrite the weekly review for this user. Look across the takes for patterns the per-take coach missed. Output JSON only.';
  };

  function summarizeWeek(takes) {
    const fs = takes.map((s) => s.features).filter(Boolean);
    if (!fs.length) return null;
    const avg = (g) => { const v = fs.map(g).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return {
      takes: takes.length,
      avg_wpm: avg((f) => f.pace && f.pace.wpm),
      avg_fillers_per_min: avg((f) => f.fillers && f.fillers.per_minute),
      avg_ttr: avg((f) => f.lexical && f.lexical.ttr),
      avg_uncommon_ratio: avg((f) => f.lexical && f.lexical.uncommon_word_ratio),
    };
  }

  // allTakes: every take (newest first). now: current ms. Returns parsed review.
  FL.generateWeekly = async function generateWeekly(allTakes, now) {
    const periodStart = now - WEEK_MS;
    const thisWeek = allTakes.filter((s) => (s.created_at || 0) >= periodStart).slice().sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    if (!thisWeek.length) throw new Error('No takes in the last 7 days to review.');
    const priorWeek = allTakes.filter((s) => (s.created_at || 0) >= periodStart - WEEK_MS && (s.created_at || 0) < periodStart);
    const prior = summarizeWeek(priorWeek);
    const res = await gifos.ai.chat({ model: 'smartest', messages: [
      { role: 'system', content: FL.WEEKLY_SYSTEM },
      { role: 'user', content: FL.buildWeeklyUser(thisWeek, prior) },
    ], maxTokens: 2500, temperature: 0.4 });
    let review;
    try { review = JSON.parse(FL.stripFences(res.text)); }
    catch (e) { review = { period_summary: (res.text || '').slice(0, 800), patterns: [], breakthroughs: [], recommended_focus_next_week: null }; }
    return { count: thisWeek.length, review };
  };
})();
