/*
 * need.js — a suite states the fixture servers it needs, and says so plainly
 * when they are missing.
 *
 * WHY. e2e-fluence spent a long time recorded as a known-broken suite — "the
 * Deepgram pipeline fails" — in test/README.md and known-unfixed.sh. It was not
 * broken. It needs test/servers/fake-ai.js, and without it the suite times out
 * 20s deep inside the app on a locator that never appears. That looks exactly
 * like a product bug, so somebody wrote it down as one, and every reader after
 * that inherited the claim instead of testing it. With the fixtures up it is
 * 20 assertions, ALL PASS, on both boxes.
 *
 * A missing dependency must never be able to masquerade as a failing assertion.
 * Call this first and it exits 2 immediately with the exact command to run.
 *
 *   const need = require('../lib/need');
 *   need({ 8791: 'fake-ai', 8792: 'fake-keyapi' });
 */
const net = require('net');

function probe(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: host || '127.0.0.1' });
    const done = (v) => { try { s.destroy(); } catch (e) {} resolve(v); };
    s.setTimeout(1500);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

// Returns a promise so a suite can `await need({...})`, but ALSO works when
// called without await: the process exits before the suite gets anywhere.
// `host` (optional 2nd arg): a FLEET suite's browsers live on other machines
// and dial the orchestrator by address, so the stack it needs is not
// necessarily on loopback. Probing 127.0.0.1 there refuses a perfectly good
// remote stack — measured, on the first three-box run.
module.exports = async function need(map, host) {
  const missing = [];
  for (const port of Object.keys(map)) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await probe(parseInt(port, 10), host))) missing.push({ port, name: map[port] });
  }
  if (!missing.length) return true;
  const lines = missing.map((m) => '  node test/servers/' + m.name + '.js   # port ' + m.port);
  console.error('\nMISSING FIXTURE SERVER' + (missing.length > 1 ? 'S' : '') + ' — this suite cannot run:\n'
    + missing.map((m) => '  ' + m.name + ' is not listening on ' + (host ? host + ':' : '') + m.port).join('\n')
    + '\n\nStart them and re-run:\n' + lines.join('\n')
    + '\n  (or test/servers/dev.sh --all, which starts every fixture)\n'
    + '\nNot a product failure. Refusing to run rather than time out inside the app\n'
    + 'and be mistaken for one — which is how e2e-fluence spent months recorded as\n'
    + 'a known bug it never had.\n');
  process.exit(2);
};
