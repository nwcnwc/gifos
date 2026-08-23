// The 3-driver Anyroad GATE is three isolated machines, and FPS deathmatch
// must not force SwiftShader then refuse the first ARM host.
//
// These are the shipped files, not a copy. A one-box ANYROAD_MP_LOCAL run is
// not the gate; hosts.slice(0,2) with no retry is how a GPU box sat idle
// while a software-rasterising board was declared unable to draw.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const anyroad = fs.readFileSync(path.join(ROOT, 'test/browser/e2e-anyroad-mp.js'), 'utf8');
const scen = fs.readFileSync(path.join(ROOT, 'test/behavior/scenarios/26a-anyroad-three-drivers.js'), 'utf8');
const fps = fs.readFileSync(path.join(ROOT, 'test/browser/e2e-fps-simple.js'), 'utf8');

check('e2e-anyroad-mp asks needFleet(3) for the steering gate',
  /needFleet\s*\(\s*3\s*,/.test(anyroad));
check('LOCAL is only the env flag, never assigned true in the suite',
  !/ANYROAD_MP_LOCAL\s*=\s*['"]1['"]/.test(anyroad)
  && /process\.env\.ANYROAD_MP_LOCAL/.test(anyroad));
check('26a does not force ANYROAD_MP_LOCAL=1 (that was the one-box hang)',
  !/ANYROAD_MP_LOCAL\s*=\s*['"]1['"]/.test(scen));
check('26a deletes ANYROAD_MP_LOCAL so a leaked env cannot sneak LOCAL back on',
  /delete env\.ANYROAD_MP_LOCAL/.test(scen));
check('26a forwards needFleet\'s exit 3 instead of turning it into a product red',
  /code === 3/.test(scen) && /process\.exit\(3\)/.test(scen));

check('fps-simple deathmatch FLEET_ARGS default to Vulkan (FPS_GL=sw is the opt-out)',
  /const FLEET_ARGS/.test(fps) && /FPS_GL === 'sw'/.test(fps)
  && /use-angle=vulkan/.test(fps));
check('solo on the orchestrator is allowed software GL (that box often has no GPU)',
  /const SOLO_ARGS/.test(fps) && /chromium.launch\(\{ executablePath: CHROME, args: SOLO_ARGS \}\)/.test(fps));
check('openFleet gets FLEET_ARGS, not the solo software flags',
  /openFleet\(pick, \{ args: FLEET_ARGS/.test(fps));
check('deathmatch prefers gpu-marked hosts instead of weight-order slice(0, 2)',
  /function preferDrawers/.test(fps)
  && /preferDrawers\(fleet\.hosts/.test(fps)
  && !/openFleet\(fleet\.hosts\.slice\(0,\s*BOB_CDP \? 1 : 2\)/.test(fps));
check('mustBeAbleToAnswer returns null so the next host is tried, not process.exit(3) on the first slow ARM',
  /cannot answer while the game is running/.test(fps)
  && /return null/.test(fps.split('async function mustBeAbleToAnswer')[1].slice(0, 1200))
  && /replacing /.test(fps)
  && /pool\.shift\(\)/.test(fps));

// Drive the shipped 26a entry point with no isolated machines: it must refuse
// as NEEDS-FLEET, not hang as three local Chromiums.
const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'gifos-fleet-shape-'));
fs.writeFileSync(path.join(fake, 'hosts.json'), JSON.stringify({
  base: 'http://127.0.0.1:8099',
  relay: 'ws://127.0.0.1:8790',
  hosts: [{ name: 'local', weight: 0 }],
}));
let ran;
try {
  ran = execFileSync(process.execPath, [path.join(ROOT, 'test/behavior/scenarios/26a-anyroad-three-drivers.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      BEHAVIOR_HOSTS: path.join(fake, 'hosts.json'),
      GIFOS_FLEET: path.join(fake, 'hosts.json'),
    }),
    encoding: 'utf8',
    timeout: 120000,
  });
  ran = { status: 0, stdout: ran, stderr: '' };
} catch (e) {
  ran = { status: e.status, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') };
}
const out = ran.stdout + ran.stderr;
check('26a with only an orchestrator exits 3 (NEEDS-FLEET)', ran.status === 3, 'status=' + ran.status);
check('26a did not print WIRING-ONLY (that is the one-box door)', !/WIRING-ONLY/.test(out));
check('26a\'s child asked for three isolated machines', /NEEDS-FLEET/.test(out) && /3 ISOLATED/.test(out), out.slice(0, 400));

if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
