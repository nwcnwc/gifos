/*
 * fleet-browsers.js — one REAL browser per REAL machine.
 *
 * fleet.js states the requirement and refuses without it. This is the half
 * that makes the requirement true: it starts a Playwright browser server on
 * each host over ssh and hands back a connected Browser per box, so a suite
 * that wants three drivers gets three machines rather than three tabs fighting
 * over one kernel.
 *
 * The remote browsers load the site from the ORCHESTRATOR (the `base`/`relay`
 * in the hosts file — tailnet addresses, not 127.0.0.1), so the orchestrator
 * must serve the stack on 0.0.0.0 and run no browsers of its own.
 *
 *   const needFleet = require('../lib/fleet');
 *   const { openFleet } = require('../lib/fleet-browsers');
 *   const fleet = await needFleet(3, { why: '…', roles: ['ada','ben','cyd'] });
 *   const boxes = await openFleet(fleet.hosts.slice(0, 3), { args: [...] });
 *   const ctx = await boxes[0].browser.newContext(...);   // Ada, on her own box
 *   ...
 *   await closeFleet(boxes);
 *
 * VERSION IS LOAD-BEARING. Playwright refuses to connect across a version gap,
 * and the gap is invisible until it throws: the gate host was on 1.55.1 while
 * the orchestrator was on 1.61.1. A host may therefore carry `pwPath` (a
 * NODE_PATH holding a MATCHING playwright) — installed alongside whatever that
 * box already uses, so its own suites keep their pin.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const casualty = require('./casualty');

const LOCAL_PW = require('playwright/package.json').version;
const BASE_PORT = Number(process.env.FLEET_PORT_BASE || 9400);

function remoteLauncher(h, args) {
  // Printed as one line so the parent can wait for exactly one token.
  //
  // A GLES GPU is invisible to headless ANGLE Vulkan. Measured: the same
  // Playwright Chromium, same board, same user in the `render` group, with
  // Mesa reporting an integrated GPU:
  //   headless + --use-angle=vulkan → ANGLE SwiftShader
  //   headed Wayland, no backend forced → ANGLE (… OpenGL ES 3.1) on that GPU
  // Forcing Vulkan on every fleet box was how a working GPU got declared
  // unable to draw. `gpu: true` in the hosts file means "headless Vulkan
  // actually reaches this GPU" (dGPU / Tegra). Leave it unset on a GLES
  // board; we attach to the seat's Wayland (or X) display instead.
  const payload = { chrome: h.chrome, args: args || [], preferHeadless: !!h.gpu };
  return 'const fs=require("fs");const {chromium}=require("playwright");'
    + 'const o=' + JSON.stringify(payload) + ';'
    + 'const uid=process.getuid();'
    + 'const xdg=process.env.XDG_RUNTIME_DIR||("/run/user/"+uid);'
    + 'process.env.XDG_RUNTIME_DIR=xdg;'
    + 'if(!process.env.WAYLAND_DISPLAY&&fs.existsSync(xdg+"/wayland-0"))process.env.WAYLAND_DISPLAY="wayland-0";'
    + 'const headless=o.preferHeadless||!(process.env.WAYLAND_DISPLAY||process.env.DISPLAY);'
    + 'const args=o.args.slice();'
    + 'if(!headless&&process.env.WAYLAND_DISPLAY&&!args.some(a=>a.indexOf("--ozone-platform=")==0))args.push("--ozone-platform=wayland");'
    + 'chromium.launchServer({executablePath:o.chrome,host:"0.0.0.0",port:0,headless:headless,args:args,env:process.env})'
    + '.then(s=>{console.log("WSENDPOINT "+s.wsEndpoint());})'
    + '.catch(e=>{console.log("LAUNCHFAIL "+String(e&&e.message||e).split("\\n")[0]);process.exit(1);});';
}

function startOne(h, port, opts) {
  return new Promise((resolve, reject) => {
    const node = h.node || 'node';
    const env = h.pwPath || h.nodePath ? 'NODE_PATH=' + (h.pwPath || h.nodePath) + ' ' : '';
    const args = typeof opts.args === 'function' ? opts.args(h) : opts.args;
    const cmd = env + node + ' -e ' + JSON.stringify(remoteLauncher(h, args));
    // No TTY. ssh -tt with stdin ignored hangs up the PTY after a few
    // seconds; a headed Chrome (the GLES path — a window on the seat) treats
    // that SIGHUP as "the session ended" and exits. Headless Vulkan survived
    // the same hangup, which is how only GLES boards looked like they had
    // died. -T still forwards stdout for the endpoint; closeFleet SIGKILLs
    // this ssh, which takes the remote launchServer with it.
    const child = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', h.ssh, cmd],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', done = false;
    const fail = (why) => { if (!done) { done = true; try { child.kill('SIGKILL'); } catch (e) {} reject(new Error((h.name || h.ssh) + ': ' + why)); } };
    const t = setTimeout(() => fail('no ws endpoint within 60s'), 60000);
    child.stdout.on('data', (d) => {
      out += String(d);
      const m = out.match(/WSENDPOINT (ws:\/\/\S+)/);
      const f = out.match(/LAUNCHFAIL (.+)/);
      if (f) { clearTimeout(t); return fail(f[1].trim()); }
      if (m && !done) {
        clearTimeout(t); done = true;
        // launchServer picks an EPHEMERAL port (a fixed one collides with a
        // previous run's leftover server — measured) and reports the endpoint
        // as it bound it, on localhost. The orchestrator has to dial the BOX,
        // so keep the port it chose and swap in an address we can reach.
        const raw = m[1].trim();
        const chosen = (raw.match(/^ws:\/\/[^/:]+:(\d+)/) || [])[1];
        const ws = raw.replace(/^ws:\/\/[^/]+/, 'ws://' + (h.addr || h.ssh) + ':' + chosen);
        resolve({ host: h, ws, child });
      }
    });
    child.stderr.on('data', () => {});
    child.on('exit', (code) => fail('ssh exited (' + code + ') before the server was up'));
  });
}

// A REMOTE BROWSER LOADS THE SITE OVER THE NETWORK, AND THAT IS NOT A SECURE
// CONTEXT. Loopback is privileged, a tailnet IP over http is not — so the very
// first fleet run of e2e-anyroad-mp died on a click that never landed:
//
//   <div id="oldbrowser" data-gaps="secure context (https)"> intercepts pointer events
//
// GifOS's own preflight was correctly telling the browser it lacked the
// platform it needs, and the banner sat over the page. This is the
// insecure-origin trap test/README lists for multi-box work; every existing
// multi-box tool carries these flags by hand (swarm/meet.js, tools/approom-*,
// tools/pipe-freeze-probe). Fleet suites get them automatically instead.
const PNA = 'LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests';
function secureOriginArgs(args, origin) {
  if (typeof args === 'function') {
    return (h) => secureOriginArgs(args(h), origin);
  }
  if (!origin || !/^http:/i.test(origin) || /\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/i.test(origin)) return args;
  const out = [];
  let merged = false;
  for (const a of args || []) {
    // Chrome does not merge two --disable-features flags; fold ours into the
    // caller's rather than letting one silently win.
    if (a.indexOf('--disable-features=') === 0) { out.push(a + ',' + PNA); merged = true; } else out.push(a);
  }
  if (!merged) out.push('--disable-features=' + PNA);
  out.push('--unsafely-treat-insecure-origin-as-secure=' + new URL(origin).origin);
  return out;
}

// A FLEET BOX THAT VANISHES IS A CASUALTY, NOT A FAILING ASSERTION.
//
// casualty.js arms the 98 suites that launch through test/lib/pw.js. These
// browsers do not come from there — they are connect()ed over a websocket to a
// server on somebody else's machine — so they were the one family of browser in
// the repo whose death was NOT covered, and the death that matters most: a
// fleet box is a laptop on someone's wifi, and a laptop sleeps.
//
// It cost a night. <gpu-box> suspended mid-run (measured afterwards: a
// 4h48m silence in its journal, a fresh tty7 login when it woke, wifi
// reactivated one second later) and the suite reported
// "frame.evaluate: Target page, context or browser has been closed" from inside
// its own assertions — a string casualty.js's CASUALTY_RE has always matched,
// arriving through the one door that never asked it. The run before that had
// spent forty minutes producing timings about a box that was on its way out.
//
// So: the same doctrine, through this door too, and named — the report says
// which BOX died, since "a browser" is not a useful thing to be told when the
// browsers are on four different machines.
const teardown = new WeakSet();

function armFleetBrowser(browser, h) {
  const where = h.name || h.ssh;
  try {
    browser.on('disconnected', () => {
      if (teardown.has(browser)) return;
      casualty.refuse({
        what: 'the browser on ' + where + ' — a FLEET BOX',
        why: 'it disconnected mid-run: the box slept, dropped off the network, or was reaped',
        where: where + ' (a remote host; its memory was not read at death time)',
        host: where,
        mem: {},
      });
    });
  } catch (e) { /* never break a launch over this */ }
  // And everything casualty.js does for a local browser: renderer crashes, and
  // marking a close we asked for as one we asked for.
  try { casualty.watchBrowser(browser); } catch (e) {}
  return browser;
}

/** Start a browser server per host and connect to each. */
async function openFleet(hosts, opts) {
  opts = opts || {};
  opts = Object.assign({}, opts, { args: secureOriginArgs(opts.args, opts.origin) });
  const started = [];
  try {
    for (let i = 0; i < hosts.length; i++) {
      const h = hosts[i];
      const s = await startOne(h, BASE_PORT + i, opts);
      const browser = armFleetBrowser(await chromium.connect(s.ws, { timeout: 60000 }), h);
      console.log('  FLEET: ' + (h.name || h.ssh) + ' -> ' + s.ws.replace(/\/[0-9a-f]{8,}$/, '/…'));
      started.push({ host: h, browser: browser, ws: s.ws, child: s.child });
    }
  } catch (e) {
    await closeFleet(started);
    const msg = String(e && e.message || e);
    console.log('NEEDS-FLEET — could not open a browser on every box: ' + msg);
    // A version gap is invisible in the raw error, so name it — but only when
    // it is actually the shape of the failure. Blaming versions for a port
    // collision sends the next person to the wrong place.
    if (/version|protocol|connect/i.test(msg)) {
      console.log('  orchestrator playwright ' + LOCAL_PW + '; each host needs the SAME version'
        + ' (install one alongside and point the host entry at it with "pwPath").');
    }
    console.log('0 PASSED, 0 FAILED — no verdict was reached, on purpose.');
    process.exit(3);
  }
  return started;
}

async function closeFleet(boxes) {
  for (const b of boxes || []) {
    // We are ending this on purpose, so the disconnect that follows is not a
    // casualty. Declared BEFORE the close, or the handler races the teardown
    // and refuses a verdict the suite already reached.
    try { if (b.browser) { teardown.add(b.browser); casualty.deathExpected(b.browser); } } catch (e) {}
    try { if (b.browser) await b.browser.close(); } catch (e) {}
    try { if (b.child) b.child.kill('SIGKILL'); } catch (e) {}
  }
  // WAIT FOR THE BOXES TO ACTUALLY GO QUIET. Killing the local ssh child does
  // not kill the remote launcher and its Chromium at once — they linger for
  // seconds on an ARM box — and a suite's NEXT leg calls needFleet right
  // away, which then refuses those boxes as NOT FREE with the suite's own
  // browsers (e2e-anyroad-mp leg 2, 0.9.12: 10 and 9 processes, all ours).
  // Bounded: a box that will not go quiet is reported by needFleet anyway.
  const hosts = [];
  for (const b of boxes || []) { const h = b.host || b.h; if (h && h.ssh && !hosts.some((x) => x.ssh === h.ssh)) hosts.push(h); }
  const deadline = Date.now() + 20000;
  for (const h of hosts) {
    for (;;) {
      const n = await new Promise((resolve) => {
        const c = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', h.ssh, 'pkill -f "[n]ode -e const fs" ; pgrep -fc "[c]hrome-linux|[c]hrome/chrome" || echo 0'], { stdio: ['ignore', 'pipe', 'ignore'] });
        let out = ''; c.stdout.on('data', (d) => { out += d; });
        c.on('close', () => resolve(parseInt(out, 10) || 0));
        c.on('error', () => resolve(0));
      });
      if (n === 0 || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

module.exports = { openFleet, closeFleet, LOCAL_PW };
