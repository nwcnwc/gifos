// A tiny OpenAI-shaped endpoint for tests: enough to exercise the GifOS AI
// broker + the Settings "Test" button without a real provider. CORS-open (like
// a provider the user would point GifOS at), and it 401s without a Bearer key
// so the key path is real.
const http = require('http');

const PORT = process.env.FAKE_AI_PORT ? +process.env.FAKE_AI_PORT : 8791;

function send(res, code, type, body) {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(body);
}

// stream:true — answer as OpenAI-shaped server-sent events, one word per
// chunk with a gap between them. The gap is the point: a test can only tell a
// streamed answer from a single-shot one if the fragments are OBSERVABLY
// separated in time, and a whole answer flushed in one packet would sail past
// a guard that meant to prove incremental rendering.
function sendStream(res, text, gapMs) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  const parts = String(text).split(/(?<=\s)/);
  let i = 0;
  const tick = () => {
    if (i >= parts.length) { res.write('data: [DONE]\n\n'); res.end(); return; }
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] }) + '\n\n');
    setTimeout(tick, gapMs);
  };
  tick();
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');
  const auth = req.headers['authorization'] || '';
  if (!/^Bearer\s+\S/.test(auth)) return send(res, 401, 'application/json', JSON.stringify({ error: 'no key' }));
  const url = req.url.split('?')[0];
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (url.endsWith('/chat/completions')) {
      // Branch on the system/user text so callers that expect JSON (Fluence's
      // drill generation, coach, weekly review, picture scenes) get well-formed
      // JSON. Anything unrecognized still returns 'pong' (keeps e2e-caps green).
      let text = 'pong';
      let stream = false;
      try {
        const body = JSON.parse(raw || '{}');
        stream = !!body.stream;
        const msgs = body.messages || [];
        const blob = msgs.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
        // MEMORY PROBE. Says back exactly what the caller sent as context, so a
        // test can prove the CONVERSATION crossed the wire rather than just the
        // latest question. Anything else keeps its old answer.
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        const lastTxt = (last && typeof last.content === 'string') ? last.content.trim() : '';
        if (lastTxt === 'ctx?') {
          const firstUser = msgs.filter((m) => m.role === 'user')[0];
          text = 'ctx=' + msgs.length + ' first=' + String((firstUser && firstUser.content) || '');
        } else if (lastTxt === 'stream?') {
          // Ten known words. A streaming guard needs an answer long enough to
          // be caught HALF-drawn — 'pong' arrives as one chunk and proves
          // nothing about incremental rendering.
          text = 'One two three four five six seven eight nine ten.';
        } else if (/Legal moves:/i.test(blob)) {
          // The default Chess app's Hint: pick the first move from the exact
          // legal list it hands us, so the reply is always a real, legal move.
          const mm = blob.match(/Legal moves:\s*([a-h1-8 ]+)/i);
          const first = mm ? mm[1].trim().split(/\s+/)[0] : 'e2e4';
          text = JSON.stringify({ move: first, why: 'A principled developing move.' });
        } else if (/operate a web app/i.test(blob)) {
          // The in-app agent loop: click element 0 first, then report done.
          text = /ACTIONS SO FAR:\s*\n?\s*\(none/i.test(blob)
            ? JSON.stringify({ action: 'click', index: 0, say: 'clicking the first control' })
            : JSON.stringify({ action: 'done', say: 'finished' });
        } else if (/candid speech coach/i.test(blob)) {
          text = JSON.stringify({
            overall: 'Solid, but you leaned on fillers early.',
            strengths: [{ label: 'clear open', evidence: 'named the topic in the first sentence' }],
            weaknesses: [{ label: 'fillers', evidence: 'two "um"s by 0.2s', dimension: 'fillers' }],
            moments: [{ at_seconds: 0.2, what_happened: 'a filler before the first content word', suggestion: 'pause silently instead' }],
            suggested_drill_type: 'forced_substitution', drill_rationale: 'targets your filler habit',
          });
        } else if (/design picture-description drills/i.test(blob)) {
          text = JSON.stringify({ prompt: 'Describe this scene in detail for 90 seconds.', scene_description: 'A sunlit carpentry workshop with a workbench, hand tools on a pegboard, and shavings on the floor.', ground_truth_elements: ['workbench', 'pegboard of tools', 'wood shavings', 'a window'] });
        } else if (/reviewing a week/i.test(blob)) {
          text = JSON.stringify({ period_summary: 'Steady week; fillers trended down.', patterns: [{ label: 'fewer fillers', evidence: 'takes 1→3', direction: 'improving' }], breakthroughs: [{ take_index: 3, what_happened: 'no long pauses' }], recommended_focus_next_week: { what: 'vocabulary reach', why: 'uncommon ratio flat', drill_suggestion: 'letter_fluency' } });
        } else if (/generate short spontaneous-speaking drills/i.test(blob)) {
          let params = {};
          if (/'semantic_fluency'/.test(blob)) params = { category: 'kitchen utensils', time_seconds: 60 };
          else if (/'forced_substitution'/.test(blob)) params = { banned_words: ['good', 'bad', 'thing', 'really', 'very'] };
          else if (/'bridging'/.test(blob)) params = { start_sentence: 'The kettle had just boiled.', end_sentence: 'And that is why the bridge was never built.' };
          else if (/'topic_switch'/.test(blob)) params = { topics: ['Why maps distort the poles', 'How a lock and key actually work', 'The case for eating breakfast last'], switch_interval_seconds: 30 };
          else if (/'bullet_points'/.test(blob)) params = { topic: 'How compost works', bullets: ['what compost actually is', 'the organisms doing the work', 'why heat and air matter', 'when it is finished'], duration_seconds: 120 };
          text = JSON.stringify({ prompt: 'Explain a everyday process to a curious ten-year-old.', params });
        }
      } catch (e) { /* fall through to pong */ }
      if (stream) return sendStream(res, text, process.env.FAKE_AI_GAP_MS ? +process.env.FAKE_AI_GAP_MS : 120);
      return send(res, 200, 'application/json', JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }));
    }
    if (url.endsWith('/audio/speech')) {
      return send(res, 200, 'audio/mpeg', Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00])); // fake ID3 header
    }
    if (url.endsWith('/audio/transcriptions')) {
      return send(res, 200, 'application/json', JSON.stringify({ text: 'hello world' }));
    }
    if (url.endsWith('/images/generations')) {
      // 1x1 transparent PNG, base64
      return send(res, 200, 'application/json', JSON.stringify({
        data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==' }],
      }));
    }
    if (url.endsWith('/video/generations')) {
      return send(res, 200, 'application/json', JSON.stringify({ id: 'job_123', status: 'queued' }));
    }
    return send(res, 404, 'application/json', JSON.stringify({ error: 'unknown route' }));
  });
});

server.listen(PORT, () => console.log('fake AI on http://127.0.0.1:' + PORT));
