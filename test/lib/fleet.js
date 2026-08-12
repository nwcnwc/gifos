/*
 * fleet.js — a suite states that its verdict REQUIRES REAL, ISOLATED MACHINES,
 * and refuses to pretend otherwise.
 *
 * WHY THIS EXISTS, and it is the most expensive lesson in this repo.
 *
 * CLAUDE.md has said it since the beginning: "One box cannot tell a bug from a
 * busy kernel." Every browser suite runs the host, the guests AND the relay on
 * ONE machine — a shape that does not exist in real life — and when a timing
 * number looks bad there you cannot tell a product bug from that kernel
 * scheduling three Chromiums. We knew it, we wrote it down, and then we kept
 * running the suites that depend on it on one box anyway, because they were
 * ALLOWED to run there. They would produce a verdict, so we believed the
 * verdict.
 *
 * What that cost, measured: e2e-anyroad-mp's steering block has been "fixed"
 * three separate times — 2026-08-08 ('steer -1.00/-1.00'), 2026-08-08 again
 * ('speed 0.0 m/s, yaw 0.00/0.00'), and 2026-08-11 ('8 frames', then '10/55
 * frames', then 'cruises hands-free 0.0 m'). Three rounds of somebody root-
 * causing a real mechanism, patching it honestly, and watching the same block
 * fail differently a week later. On 2026-08-11 it was finally cornered: with
 * generous waits the suite TIMES OUT at 600s, and with tight waits it cannot
 * render enough frames to measure. THERE IS NO SETTING THAT WORKS. Three
 * Chromiums rendering 3D through a software rasteriser on one box, at about
 * one frame per second, cannot answer a question about a driving simulation.
 *
 * The suite was never wrong about the product. It was wrong about the
 * MACHINE, and nothing in the suite said so — so every failure it produced
 * arrived dressed as a product defect and got triaged as one.
 *
 * So: a suite whose verdict depends on real per-client hardware DECLARES that,
 * here, and this refuses to run it anywhere else. Same doctrine as need.js for
 * fixture servers — "a missing dependency must never be able to masquerade as
 * a failing assertion" — extended to the hardware the measurement needs.
 *
 *   const needFleet = require('../lib/fleet');
 *   const fleet = needFleet(3, {
 *     why: 'each driver must own a CPU: the steering assertions read a physics
 *           sim that advances per RENDERED FRAME',
 *     roles: ['ada', 'ben', 'cyd'],
 *   });
 *
 * Configure with the SAME local hosts file the behaviour battery already uses
 * (~/.gifos-behavior-hosts.json, or BEHAVIOR_HOSTS / GIFOS_FLEET) — never
 * committed, it describes someone's home network. See test/README
 * § "The BEHAVIOR battery in FLEET mode".
 *
 * EXIT CODE 3 means "this needs machines I was not given". release.sh reports
 * it as its own verdict, NEEDS-FLEET: not green, not a product red, and it
 * blocks a cut, because a guard nobody ran is a guard nobody has.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const FLEET_FILE = process.env.GIFOS_FLEET || process.env.BEHAVIOR_HOSTS
  || path.join(process.env.HOME || '/root', '.gifos-behavior-hosts.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FLEET_FILE, 'utf8')); } catch (e) { return null; }
}

// Hosts that can actually LAUNCH the engine this suite needs, and that were
// given a share of the work. A host with weight 0 is the orchestrator: it
// serves the stack and holds the pipes, and running browsers there is exactly
// the contention this file exists to prevent.
function usable(fleet, engine) {
  return (((fleet && fleet.hosts) || [])
    .filter((h) => h && (h.weight === undefined || h.weight > 0))
    .filter((h) => !h.engines || h.engines.indexOf(engine) >= 0));
}

function refuse(n, have, o) {
  const why = o.why || 'its assertions are about timing, and timing on a shared box is a measurement of the box';
  const roles = o.roles ? '\n  ROLES NEEDING THEIR OWN BOX: ' + o.roles.join(', ') : '';
  console.log('NEEDS-FLEET — this suite requires ' + n + ' ISOLATED machines and was given ' + have + '.');
  console.log('');
  console.log('  WHY: ' + why + roles);
  console.log('');
  console.log('  This is NOT a product failure and NOT a flake. Running it here would');
  console.log('  produce a verdict about this kernel scheduling ' + n + ' browsers, which is how');
  console.log('  the same assertions got "fixed" three times and failed again each week.');
  console.log('');
  console.log('  Give it real machines — the SAME hosts file the behaviour battery uses:');
  console.log('    ' + FLEET_FILE);
  console.log('    {');
  console.log('      "base":  "http://<orchestrator-tailnet-addr>:8099",');
  console.log('      "relay": "ws://<orchestrator-tailnet-addr>:8790",');
  console.log('      "hosts": [');
  console.log('        { "name": "orchestrator", "weight": 0 },');
  for (let i = 0; i < n; i++) {
    console.log('        { "name": "box' + (i + 1) + '", "ssh": "<host>", "dir": "/home/<u>/projects/gifos",'
      + ' "node": "<node22>", "chrome": "<chrome>", "weight": 1 }' + (i < n - 1 ? ',' : ''));
  }
  console.log('      ]');
  console.log('    }');
  console.log('');
  console.log('  The orchestrator serves the stack on 0.0.0.0 and runs NO browsers');
  console.log('  (weight 0). Recipe and every trap paid for so far:');
  console.log('    test/README.md -> "ONE BOX CANNOT ANSWER ..." and "FLEET mode"');
  console.log('0 PASSED, 0 FAILED — no verdict was reached, on purpose.');
  process.exit(3);
}

// VERIFY THE HOSTS, DO NOT TRUST THE FILE. The hosts file is hand-written and
// goes stale: the very first one read here listed the ORCHESTRATOR with
// weight 1 (<orchestrator>, which has no playwright chromium at all — it scores DEAD
// on every browser tier), and a pi whose chrome path pointed at a directory
// layout that had moved. A requirement satisfied on paper, with the browser
// then launching somewhere it cannot, is the same lie in a new place.
function check(h, engine) {
  return new Promise((resolve) => {
    const bin = h[engine === 'chromium' ? 'chrome' : engine];
    if (!h.ssh) {
      // The orchestrator. It serves the stack and holds the pipes; giving it
      // browsers is the contention this whole file exists to prevent.
      return resolve({ h, ok: false, why: 'orchestrator (no ssh) — it must not run browsers; set weight 0' });
    }
    if (!bin) return resolve({ h, ok: false, why: 'no ' + engine + ' path in the hosts entry' });
    // ISOLATED MEANS IDLE, and that has to be measured too. <llm-box> passed
    // every other check and then delivered 17-21 of 55 frames, because it runs
    // a resident 7 GB model over roughly three of its four cores (test/README
    // says so, and the file said nothing). A busy box in the fleet is the same
    // contention we left the one-box world to escape — it just moved.
    const probe = 'test -x ' + JSON.stringify(bin) + ' && echo OK $(cut -d" " -f1 /proc/loadavg) $(nproc)';
    execFile('ssh', ['-n', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', h.ssh, probe],
      { timeout: 20000 }, (err, out) => {
        if (err) return resolve({ h, ok: false, why: 'unreachable, or ' + bin + ' is not executable there' });
        const m = String(out).match(/OK ([\d.]+) (\d+)/);
        if (!m) return resolve({ h, ok: false, why: 'could not read its load' });
        const load = parseFloat(m[1]), cores = parseInt(m[2], 10);
        const ceiling = (h.maxLoad != null ? h.maxLoad : 0.5) * cores;
        if (load > ceiling) {
          return resolve({ h, ok: false, why: 'BUSY — load ' + load.toFixed(2) + ' on ' + cores
            + ' cores (ceiling ' + ceiling.toFixed(1) + '). A loaded box is not an isolated box; stop what is running there,'
            + ' or raise "maxLoad" in the hosts entry if that load is expected and harmless.' });
        }
        resolve({ h, ok: true, load: load, cores: cores });
      });
  });
}

/**
 * Require n isolated browser-capable machines, VERIFIED. Returns the fleet
 * descriptor and the live hosts; never returns when the requirement is unmet.
 */
module.exports = async function needFleet(n, o) {
  o = o || {};
  const engine = o.engine || 'chromium';
  const fleet = load();
  const declared = usable(fleet, engine);
  const seen = await Promise.all(declared.map((h) => check(h, engine)));
  const live = seen.filter((r) => r.ok).map((r) => r.h);
  const dead = seen.filter((r) => !r.ok);
  for (const d of dead) console.log('  FLEET: skipping ' + (d.h.name || d.h.ssh) + ' — ' + d.why);
  if (live.length < n) refuse(n, live.length, o);
  const shown = seen.filter((r) => r.ok).map((r) => (r.h.name || r.h.ssh) + ' (load ' + r.load.toFixed(2) + '/' + r.cores + ')');
  console.log('  FLEET: ' + n + ' isolated ' + engine + ' host(s) required, '
    + live.length + ' verified — ' + shown.join(', '));
  return { fleet: fleet, hosts: live, file: FLEET_FILE };
};
module.exports.FLEET_FILE = FLEET_FILE;
module.exports.load = load;
module.exports.usable = usable;
