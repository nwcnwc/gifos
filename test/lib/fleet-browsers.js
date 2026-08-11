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

const LOCAL_PW = require('playwright/package.json').version;
const BASE_PORT = Number(process.env.FLEET_PORT_BASE || 9400);

function remoteLauncher(h, port, args) {
  // Printed as one line so the parent can wait for exactly one token.
  return 'const {chromium}=require("playwright");'
    + 'chromium.launchServer({executablePath:' + JSON.stringify(h.chrome) + ','
    + 'host:"0.0.0.0",port:0,args:' + JSON.stringify(args || []) + '})'
    + '.then(s=>{console.log("WSENDPOINT "+s.wsEndpoint());})'
    + '.catch(e=>{console.log("LAUNCHFAIL "+String(e&&e.message||e).split("\\n")[0]);process.exit(1);});';
}

function startOne(h, port, opts) {
  return new Promise((resolve, reject) => {
    const node = h.node || 'node';
    const env = h.pwPath || h.nodePath ? 'NODE_PATH=' + (h.pwPath || h.nodePath) + ' ' : '';
    const cmd = env + node + ' -e ' + JSON.stringify(remoteLauncher(h, port, opts.args));
    // -tt so the remote dies with us; the server must outlive the command's
    // first line of output but never the suite.
    const child = spawn('ssh', ['-tt', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', h.ssh, cmd],
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

/** Start a browser server per host and connect to each. */
async function openFleet(hosts, opts) {
  opts = opts || {};
  opts = Object.assign({}, opts, { args: secureOriginArgs(opts.args, opts.origin) });
  const started = [];
  try {
    for (let i = 0; i < hosts.length; i++) {
      const h = hosts[i];
      const s = await startOne(h, BASE_PORT + i, opts);
      const browser = await chromium.connect(s.ws, { timeout: 60000 });
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
    try { if (b.browser) await b.browser.close(); } catch (e) {}
    try { if (b.child) b.child.kill('SIGKILL'); } catch (e) {}
  }
}

module.exports = { openFleet, closeFleet, LOCAL_PW };
