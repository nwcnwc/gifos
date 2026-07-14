#!/usr/bin/env node
/*
 * observer.js — attach to any GifOS meeting as a member and continuously
 * stream live, system-level debug stats to stdout. A read-only instrument:
 * it joins like a normal participant (a light fake camera so it holds a real
 * seat), never speaks, and prints one status block per interval. Point it at
 * a room to debug convergence live, or leave it running to keep a history of
 * what a meeting did at the protocol level.
 *
 * USAGE
 *   node test/observer.js --room <name> [options]
 *
 * OPTIONS
 *   --room <name>      room to join (default: test)
 *   --relay <ws://…>   custom relay (default: the site's production relay).
 *                      A LAN/tailnet relay (ws://… or wss://…) is fine — the
 *                      Local-Network-Access checks are disabled for it.
 *   --base <url>       site origin serving meet.html (default https://gifos.app)
 *   --av <hex>         admin verifier, to observe an admin room (/meet/<room>/<av>)
 *   --pass <pw>        room password, if the room is locked
 *   --name <label>     display name in the room (default: Observer)
 *   --every <secs>     seconds between status blocks (default 5)
 *   --for <secs>       stop after this many seconds (default: run forever)
 *   --verbose          also dump the fold flight-recorder + per-deacon pc state
 *   --json             emit one JSON object per interval instead of the text block
 *   --chrome <path>    launch this chromium binary (e.g. system Chrome) instead
 *                      of playwright's bundled one
 *   --headful          show the browser window (default headless)
 *
 * EXAMPLES
 *   node test/observer.js --room stadium --relay wss://my.relay:8443 --every 3 --verbose
 *   node test/observer.js --room team --pass hunter2 --for 600 --json > meeting-history.jsonl
 */
'use strict';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const nx = process.argv[i + 1];
    if (nx === undefined || nx.startsWith('--')) args[k] = true;   // boolean flag
    else { args[k] = nx; i++; }
  }
}
const ROOM = args.room || 'test';
const RELAY = args.relay || '';
const BASE = args.base || 'https://gifos.app';
const AV = args.av || '';
const PASS = args.pass || '';
const NAME = args.name || 'Observer';
const EVERY = Math.max(1, parseFloat(args.every || '5'));
const FOR = args['for'] ? Math.max(1, parseFloat(args['for'])) : Infinity;
const VERBOSE = !!args.verbose;
const JSONOUT = !!args.json;
const HEADFUL = !!args.headful;

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('playwright-core')); }
  catch (e2) { console.error('playwright not found — run: npm i playwright && npx playwright install chromium'); process.exit(1); }
}

// A tiny solid fake camera via canvas.captureStream, so getUserMedia succeeds
// and this observer holds a real seat (folds only forward to seated members).
const fakeCam = `
  (() => {
    const mk = async () => {
      const c = document.createElement('canvas'); c.width = 240; c.height = 426;
      const x = c.getContext('2d');
      const paint = () => { x.fillStyle = '#334'; x.fillRect(0,0,c.width,c.height);
        x.fillStyle = '#9ab'; x.font = 'bold 24px system-ui'; x.textAlign = 'center';
        x.fillText(${JSON.stringify(NAME)}, c.width/2, c.height/2); };
      paint(); setInterval(paint, 1000);
      const s = c.captureStream(3);
      try { const ac = new AudioContext(); const d = ac.createMediaStreamDestination();
        for (const t of d.stream.getAudioTracks()) s.addTrack(t); } catch (e) {}
      return s;
    };
    if (navigator.mediaDevices) { navigator.mediaDevices.getUserMedia = mk; navigator.mediaDevices.getDisplayMedia = mk; }
  })();
`;

// The whole snapshot is gathered inside the page from window.__gifosVideo — the
// same test hook the e2e suites use. Guarded field-by-field so a missing hook
// on an older build degrades gracefully instead of throwing.
function snapshotInPage(verbose) {
  const V = window.__gifosVideo;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  if (!V) return { err: 'no __gifosVideo yet' };
  const rows = g(() => V.rows(), []);
  const myRow = g(() => V.myRow(), -1);
  const deacons = g(() => V.rowDeacons(), []);
  const myDeacon = deacons[myRow];
  const folds = g(() => V.stadium(), []);
  const out = {
    n: g(() => V.participants(), 0),
    total: g(() => (V.totalCount ? V.totalCount() : 0), 0),
    section: g(() => V.sectionNum(), 1),
    myRow,
    amDeacon: g(() => V.amDeacon(), false),
    rows: rows.map((r) => r.length),
    secSize: rows.reduce((a, r) => a + r.length, 0),
    links: g(() => V.liveLinks(), 0),
    up: g(() => V.upOn(), false),
    up2: g(() => V.up2On(), false),
    stadiumShown: g(() => V.stadiumShown(), false),
    folds: folds.length,
    foldsLive: folds.filter((f) => f.live).length,
    foldRows: folds.map((f) => String(f.row) + (f.live ? '' : '·')),
    myDeacon: String(myDeacon || '').slice(0, 6),
    myDeaconConn: g(() => { const p = V.pcState(myDeacon); return p ? p.conn : 'none'; }, 'n/a'),
    deacons: deacons.map((d) => String(d || '').slice(0, 6)),
  };
  if (verbose) {
    out.deaconPcs = rows.map((r, i) => {
      const d = deacons[i]; if (!d || i === myRow) return null;
      const p = g(() => V.pcState(d), null);
      return { row: i, d: String(d).slice(0, 6), conn: p && p.conn, sig: p && p.sig, tx: p && (p.tx || []).length };
    }).filter(Boolean);
    out.compLog = g(() => V.compLog().slice(-14), []);
    out.foldTable = g(() => (V.compTable ? V.compTable() : []), []);
  }
  return out;
}

function render(t, s) {
  if (s.err) return `t+${t}s  (${s.err})`;
  const rowsStr = '[' + s.rows.join(',') + ']';
  const foldStr = s.folds ? `${s.foldsLive}/${s.folds} live [${s.foldRows.join(',')}]` : '0';
  let line = `t+${t}s  n=${s.n} total=${s.total} sec=${s.section} row=${s.myRow}${s.amDeacon ? '(DEACON)' : ''}`
    + `  rows=${rowsStr} secSize=${s.secSize}  links=${s.links}`
    + `  folds=${foldStr}  stadium=${s.stadiumShown ? 'on' : 'off'}`
    + `  deacon=${s.myDeacon}/${s.myDeaconConn}${s.up ? ' up' : ''}${s.up2 ? ' up2' : ''}`;
  if (s.deaconPcs && s.deaconPcs.length) {
    line += '\n    sibling deacons: ' + s.deaconPcs.map((p) => `r${p.row}:${p.d}=${p.conn}(tx${p.tx})`).join('  ');
  }
  if (s.compLog && s.compLog.length) line += '\n    fold-log: ' + s.compLog.join(' | ');
  return line;
}

(async () => {
  const launchOpts = { headless: !HEADFUL, args: [
    '--no-sandbox', '--mute-audio', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    // expose real LAN IPs as ICE candidates (mDNS .local names don't resolve
    // across a tailnet/WireGuard), and allow a public page → LAN relay socket.
    '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests',
  ] };
  if (args.chrome) launchOpts.executablePath = args.chrome;
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 } });
  const seed = "localStorage.setItem('gifos_name'," + JSON.stringify(NAME) + ");"
    + "localStorage.setItem('gifos_meet_bar','0');"
    + (RELAY ? "localStorage.setItem('gifos_relay'," + JSON.stringify(RELAY) + ");" : '')
    + (PASS ? "localStorage.setItem(" + JSON.stringify('gifos_vpw_' + ROOM + (AV ? '.' + AV : '')) + "," + JSON.stringify(PASS) + ");" : '');
  await ctx.addInitScript({ content: seed + fakeCam });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror] ' + e.message));

  const hash = '#v=' + ROOM + (AV ? '&av=' + AV : '') + (RELAY ? '&relay=' + encodeURIComponent(RELAY) : '');
  console.error('[observer] joining ' + BASE + '/meet.html' + hash + ' as "' + NAME + '"');
  await page.goto(BASE + '/meet.html' + hash, { waitUntil: 'domcontentloaded' }).catch((e) => console.error('[goto] ' + e.message));

  let stop = false;
  const shut = async () => { if (stop) return; stop = true; try { await browser.close(); } catch (e) {} process.exit(0); };
  process.on('SIGINT', shut); process.on('SIGTERM', shut);

  const t0 = Date.now();
  while (!stop && (Date.now() - t0) / 1000 < FOR) {
    const t = Math.round((Date.now() - t0) / 1000);
    const snap = await page.evaluate(snapshotInPage, VERBOSE).catch((e) => ({ err: e.message }));
    if (JSONOUT) console.log(JSON.stringify(Object.assign({ t }, snap)));
    else console.log(render(t, snap));
    await new Promise((r) => setTimeout(r, EVERY * 1000));
  }
  await shut();
})().catch((e) => { console.error('FATAL ' + e.message); process.exit(1); });
