// flood-burst.js — THE 10:00 MEETING: everyone clicks join at the same moment.
//
// test/mesh/flood.js at the sizes the gate never reached. The default
// `flood.js` burst is 20 nodes, which fits inside Section 1 (25 seats) and
// under the relay's old 30-socket session cap, so it could not see any of the
// 2026-09-28 failures that a 1,000-bot swarm found:
//   - the relay's roster was re-sent to every socket on every connect (~N³/3
//     entries; 13 GB at N=700 — only the founder ever seated);
//   - steadySocket reset its backoff on every OPEN, and the relay refuses a
//     crowd AFTER opening, so a full door was hammered every ~0.5s forever;
//   - R6 counted time queued outside the door as "unreachable" and stranded
//     every joiner the moment it got in, holding one of five joiner slots;
//   - a deep seat answering a newcomer had to reopen a relay socket that the
//     full door refused, so answers were lost while joiners held every slot.
// The session cap is gone and the roster is scoped to the doors; this runs the
// burst in both relay modes and passes only if every joiner seats, with one
// genesis key, no duplicate seat, and the relay under flood.js's memory ceiling.
//
//   node test/mesh/flood-burst.js            # 1000 (dev) + 500 (RELAY_PROD=1)
//   FLOOD_BURST="300:dev 300:prod" node test/mesh/flood-burst.js
const { spawnSync } = require('child_process');
const path = require('path');

const legs = (process.env.FLOOD_BURST || '1000:dev 500:prod').trim().split(/\s+/).map((s) => {
  const [n, mode] = s.split(':'); return { n: parseInt(n, 10), prod: mode === 'prod' };
});
let fails = 0;
for (const leg of legs) {
  const label = 'burst of ' + leg.n + ' joiners, relay ' + (leg.prod ? 'RELAY_PROD=1 (production guards)' : 'dev mode');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'flood.js'), String(leg.n)], {
    env: { ...process.env, ...(leg.prod ? { RELAY_PROD: '1' } : {}) }, encoding: 'utf8', timeout: 600000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const verdict = (out.match(/^(PASS|FAIL) —.*$/m) || [''])[0];
  const mem = (out.match(/^relay peak RSS: .*$/m) || [''])[0];
  const ok = r.status === 0;
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label + ' (' + Math.round((Date.now() - t0) / 1000) + 's)  ' + (verdict || ('exit ' + r.status + (r.signal ? ' ' + r.signal : ''))) + (mem ? '  [' + mem + ']' : ''));
  if (!ok) { fails++; console.log(out.split('\n').filter((l) => /^t\+/.test(l)).slice(-5).map((l) => '    ' + l).join('\n')); }
}
console.log(fails ? ('\n' + fails + ' FAIL') : '\nALL PASS');
process.exit(fails ? 1 : 0);
