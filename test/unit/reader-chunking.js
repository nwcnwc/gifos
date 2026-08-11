// READER SIZES ITS PASSAGES TO THE VOICE THAT ANSWERS.
//
// A chunk is how much speech must be finished before ANY of it can be heard,
// and Reader cannot know who serves Text → speech: a cloud endpoint, the
// formant synthesiser, or a neural model running on this very device. Those
// differ by two orders of magnitude, so a flat size is wrong for someone
// whatever it is set to.
//
// It was flat 600, chosen when the only provider ran ~100x faster than real
// time. Measured against an on-device neural voice on a 4-core desktop, 600
// characters is 55s of speech that takes 68s to produce — over a minute of
// silence before the first word, which reads exactly like a hang. With the
// ramp + measurement below, the first sound arrived at 16.3s instead (11s of
// that being the one-time engine load), and the fast provider was unaffected:
// 1.7s to first sound, back up to full 600-character passages by the third.
//
// The rules that make that work, all guarded here:
//   * the FIRST passage is one sentence, whatever the provider — start talking
//   * with speed still unknown, take the SMALLEST bite, not a middling one
//   * a fast provider must climb back to the 600 cap (prosody lives there)
//   * a slow one must settle small, so dead air comes in short even pieces
//   * never split mid-sentence, at any budget
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '../../site/js/sample-apps.js'), 'utf8');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d).slice(0, 140) + ')' : '')); if (!c) failures++; };

// Reader's source is a template literal inside sample-apps.js, so its regexes
// are written with doubled backslashes. Pull the three functions out and undo
// that one level of escaping — evaluating the real shipped text, not a copy
// that could drift from it.
function grab(name, re) {
  const m = re.exec(SRC);
  if (!m) { check('extract ' + name + ' from sample-apps.js', false, 'not found — Reader’s chunking was renamed or removed'); process.exit(1); }
  return m[0].replace(/\\\\/g, '\\');
}
const src = [
  grab('budgetNow', /function budgetNow\([\s\S]*?\n\}/),
  grab('sentencesOf', /function sentencesOf\(.*?\n/),
  grab('takeChunk', /function takeChunk\([\s\S]*?\n\}/),
].join('\n');
const R = new Function('let msPerChar = 0;\n' + src
  + '\nreturn { budgetNow, sentencesOf, takeChunk, set: function(v){ msPerChar = v; } };')();

const ARTICLE = 'The quick brown fox jumps over the lazy dog. Speech synthesis on a small device is a study in patience. '
  + 'Every sentence has to be turned into sound before any of it can be heard, and that is the whole story of the wait. '
  + 'A short request comes back quickly; a long one does not, however fast the machine. ';
const sents = R.sentencesOf(ARTICLE.repeat(6));
check('the article splits into sentences', sents.length >= 20, sents.length);

// ---- the opening passage ----------------------------------------------------
R.set(0);
const first = R.takeChunk(sents, 0, true);
check('the FIRST passage is a single sentence', first.next === 1 && first.text === sents[0], first.text);
check('…and it is short enough to start almost at once', first.text.length < 120, first.text.length);

// ---- speed still unknown ----------------------------------------------------
R.set(0);
const second = R.takeChunk(sents, first.next, false);
check('with the voice’s speed still unknown, the next bite is the smallest one',
  second.text.length <= 120 + sents[first.next].length, second.text.length);

// ---- a FAST provider climbs back to full passages ---------------------------
// eSpeak measures well under 1 ms/char; the cap must win, not the formula.
R.set(0.5);
check('a fast voice is given the full 600-character cap', R.budgetNow(false) === 600, R.budgetNow(false));
const fast = R.takeChunk(sents, 0, false);
check('…so it reads in long passages', fast.text.length > 400 && fast.text.length <= 600, fast.text.length);

// ---- a SLOW provider settles small ------------------------------------------
// The neural voice measured ~120 ms/char in the browser.
R.set(120);
const slowBudget = R.budgetNow(false);
check('a near-real-time voice settles on a small passage', slowBudget >= 120 && slowBudget <= 200, slowBudget);
check('…which keeps each silence to a few seconds, not a minute',
  slowBudget * 120 / 1000 < 20, (slowBudget * 120 / 1000).toFixed(1) + 's of work per passage');
// The floor holds even for an absurdly slow provider — below it, prosody dies.
R.set(100000);
check('the floor holds for any speed, however bad', R.budgetNow(false) === 120, R.budgetNow(false));

// ---- never split mid-sentence, at any budget --------------------------------
let split = false;
for (const per of [0.5, 40, 120, 100000]) {
  R.set(per);
  let i = 0, guard = 0;
  while (i < sents.length && guard++ < 500) {
    const c = R.takeChunk(sents, i, i === 0);
    if (!c.text) break;
    // every chunk must be a run of WHOLE sentences joined by single spaces
    if (c.text !== sents.slice(i, c.next).join(' ')) split = true;
    i = c.next;
  }
  if (i !== sents.length) split = true;   // and the whole article must be covered
}
check('passages are whole sentences and cover the article, at every speed', !split);

console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
process.exit(failures ? 1 : 0);
