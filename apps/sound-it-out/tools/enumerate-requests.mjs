// Enumerate every clip the SHIPPING curriculum code can request from the
// built-in tier, so the bundle is complete by construction: the same
// curriculum.js that runs in the app runs here, against the DEFAULT word
// list, and every unique clip request it emits is written to requests.json
// for tools/gen-clips.py to synthesise.
//
// Coverage: levels 1-9 (nonsense on, which is a superset) and level 12 at
// every stage. Level 10 is pasted text and level 11 is seeded-random from the
// family's own list - neither is enumerable, which is exactly what the
// runtime text-to-speech tier is for.
//
// Run:  node apps/sound-it-out/tools/enumerate-requests.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const app = (p) => join(dir, '..', p);

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['wordlist.js', 'curriculum.js', 'openended.js']) {
  vm.runInContext(readFileSync(app(f), 'utf8'), sandbox, { filename: f });
}
const SIO = sandbox.window.SIO;

const groups = SIO.wordlist.parse(SIO.wordlist.DEFAULT_TEXT);
const opts = { reps: 3, pauseSeconds: 1.2, nonsense: true };

const seen = new Map(); // stable key -> request
function collect(segs) {
  for (const seg of segs) {
    const c = seg.clip;
    let key, req;
    if (c.kind === 'phoneme') { key = 'p/' + c.ipa; req = { kind: 'phoneme', key: c.ipa }; }
    else if (c.kind === 'word') { key = 'w/' + c.text.toLowerCase() + (c.slow ? '/slow' : ''); req = { kind: 'word', key: c.text.toLowerCase(), text: c.text, slow: !!c.slow }; }
    else if (c.kind === 'blend') { key = 'b/' + c.ipas.join(''); req = { kind: 'blend', key: c.ipas.join(''), ipas: c.ipas }; }
    else if (c.kind === 'sentence') { key = 's/' + SIO.curriculum.sentenceKey(c.text); req = { kind: 'sentence', key: SIO.curriculum.sentenceKey(c.text), text: c.text }; }
    else throw new Error('unknown clip kind ' + c.kind);
    if (!seen.has(key)) seen.set(key, req);
  }
}

for (let level = 1; level <= 9; level++) collect(SIO.curriculum.build(level, opts, groups));
for (const stage of [1, 2, 3]) collect(SIO.curriculum.build(12, { ...opts, stage }, groups));

const requests = [...seen.values()];
const counts = {};
for (const r of requests) counts[r.kind + (r.slow ? '/slow' : '')] = (counts[r.kind + (r.slow ? '/slow' : '')] || 0) + 1;
writeFileSync(join(dir, 'requests.json'), JSON.stringify(requests, null, 1));
console.log('wrote tools/requests.json:', requests.length, 'unique clips', counts);
