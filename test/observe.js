/*
 * observe.js — attach to a GifOS meeting as a (camera-off) participant and
 * drive it from an interactive command line. The debug companion to swarm.js:
 * swarm FILLS a room, observe INSPECTS it. Reads the rich __gifosVideo.debugDump
 * hook (meet.html) plus arbitrary page state, so you get ground truth about
 * seating, the roster, ghosts, dup coords, the media composites, and consent.
 *
 * Usage:
 *   node test/observe.js --room stadium --pass swarm --relay wss://HOST.nip.io
 *   node test/observe.js --room stadium --pass swarm --relay wss://HOST --once state
 *
 * Flags:
 *   --room  <name>     room to join            (default: test)
 *   --pass  <pw>       room password           (locked rooms need it to decrypt)
 *   --relay <ws(s)://> relay                    (default: the site's prod relay)
 *   --base  <url>      site origin              (default: https://gifos.app)
 *   --name  <n>        observer display name    (default: observer)
 *   --once  <cmd>      run one command, print, exit (else: interactive REPL)
 *   --headful          show the browser window  (debug the observer itself)
 *
 * Commands (type at the prompt, or --once):
 *   state     my seat, mesh state, link count, participant count
 *   roster    every peer: name · coord · ip · cam · blur · status-age · vid
 *   ghosts    peers with NO fresh status (churn residue that shouldn't be here)
 *   dups      two peers claiming the same coord (a convergence bug)
 *   rows      the row layout (stage / my row / the rest)
 *   mosaic    the media composites: which channels are live, drawn/dropped
 *   consent   the clear-video tally (X/N ready) and who is blocking it
 *   tiles     tile count · live-video count · blurred count
 *   dump      the whole debugDump as JSON
 *   eval <js> evaluate arbitrary JS in the page (e.g. eval __gifosVideo.meshLinks())
 *   watch [s] re-print `state` every s seconds (default 3) until you press enter
 *   help      this list          quit / exit   leave and terminate
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true; args[k] = v; }
}
const ROOM = args.room || 'test';
const PASS = args.pass || '';
const RELAY = args.relay || '';
const BASE = (args.base || 'https://gifos.app').replace(/\/$/, '');
const NAME = args.name || 'observer';

let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { try { ({ chromium } = require('playwright')); } catch (e2) { console.error('playwright not found — npm i playwright && npx playwright install chromium'); process.exit(1); } }
const CHROME = process.env.OBS_CHROME
  || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => (String(s == null ? '' : s) + ' '.repeat(n)).slice(0, n);

async function main() {
  const browser = await chromium.launch({
    headless: !args.headful, executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'],
  });
  const ctx = await browser.newContext();
  // roomKey = room[.av]; the pw is stored under gifos_vpw_<roomKey> exactly as meet.html reads it.
  const roomKey = ROOM + (args.av ? '.' + args.av : '');
  await ctx.addInitScript({
    content: (RELAY ? `localStorage.setItem('gifos_relay',${JSON.stringify(RELAY)});` : '')
      + (PASS ? `localStorage.setItem('gifos_vpw_${roomKey}',${JSON.stringify(PASS)});` : '')
      + `localStorage.setItem('gifos_name',${JSON.stringify(NAME)});localStorage.setItem('gifos_meet_bar','0');`,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('  [page error] ' + String(e).slice(0, 200)));
  const url = BASE + '/meet.html#v=' + ROOM + (args.av ? '&av=' + args.av : '') + (RELAY ? '&relay=' + encodeURIComponent(RELAY) : '');
  console.log('observer → ' + url + '  (room "' + ROOM + '"' + (PASS ? ', [password]' : '') + ')');
  await page.goto(url);
  // wait for the hook, then for a coord (seated) — up to 60s
  await page.waitForFunction(() => !!(window.__gifosVideo && window.__gifosVideo.debugDump), null, { timeout: 30000 }).catch(() => {});
  const seatWait = Date.now();
  while (Date.now() - seatWait < 60000) {
    const c = await page.evaluate(() => { try { return window.__gifosVideo.meshCoord(); } catch (e) { return null; } }).catch(() => null);
    if (c) { console.log('seated at ' + c.pc + '/' + c.r + '.' + c.i); break; }
    await sleep(1500);
  }

  const D = () => page.evaluate(() => { try { return window.__gifosVideo.debugDump(); } catch (e) { return { err: String(e) }; } }).catch((e) => ({ err: String(e).slice(0, 120) }));

  async function run(line) {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    const arg = rest.join(' ');
    if (!cmd) return true;
    if (cmd === 'quit' || cmd === 'exit') return false;
    if (cmd === 'help') { console.log(require('fs').readFileSync(__filename, 'utf8').match(/Commands[\s\S]*?quit \/ exit[^\n]*/)[0]); return true; }
    const d = await D();
    if (d.err) { console.log('  ! ' + d.err); return true; }
    switch (cmd) {
      case 'state':
        console.log(`  me ${d.me.name} @ ${d.me.coord || '(unseated)'}  state=${d.me.state}  links=${d.me.links}  occ=${d.me.occ}`);
        console.log(`  participants=${d.participants}  inMeeting=${d.inMeeting}  ghosts=${d.ghosts.length}  dups=${d.dups.length}  consent=${JSON.stringify(d.consent)}`);
        break;
      case 'roster':
        console.log('  ' + pad('name', 16) + pad('coord', 10) + pad('ip', 16) + pad('cam', 5) + pad('blur', 5) + pad('age', 5) + pad('conn', 5) + 'vid');
        for (const r of d.roster) console.log('  ' + pad(r.name || '—', 16) + pad(r.coord || '—', 10) + pad(r.ip || '—', 16) + pad(r.camOff == null ? '?' : (r.camOff ? 'off' : 'ON'), 5) + pad(r.blur == null ? '?' : r.blur, 5) + pad(r.stAge == null ? '?' : r.stAge + 's', 5) + pad(r.conn ? 'y' : '-', 5) + (r.vid ? 'LIVE' : '-'));
        console.log('  (' + d.roster.length + ' peers)');
        break;
      case 'ghosts':
        console.log(d.ghosts.length ? '  GHOSTS (no fresh status): ' + d.ghosts.join(', ') : '  no ghosts');
        for (const g of d.ghosts) { const r = d.roster.find((x) => x.peer === g); if (r) console.log('    ' + g + '  coord=' + (r.coord || '—') + ' conn=' + r.conn + ' vid=' + r.vid); }
        break;
      case 'dups':
        console.log(d.dups.length ? d.dups.map((x) => '  DUP ' + x.coord + ': ' + x.a + ' & ' + x.b).join('\n') : '  no duplicate coords');
        break;
      case 'rows':
        d.rows.forEach((r, i) => console.log('  row ' + i + (i === 0 ? ' (stage)' : '') + ': [' + r.join(', ') + ']'));
        break;
      case 'mosaic':
        console.log('  ' + JSON.stringify(d.mosaic, null, 0));
        break;
      case 'consent':
        console.log('  consent=' + JSON.stringify(d.consent));
        console.log('  blocking (cam off or blurred or no status):');
        for (const r of d.roster) if (r.camOff !== false || (r.blur != null && r.blur !== 0) || r.stAge == null) console.log('    ' + pad(r.name || r.peer, 16) + ' cam=' + (r.camOff == null ? '?' : (r.camOff ? 'off' : 'ON')) + ' blur=' + r.blur + ' age=' + r.stAge);
        break;
      case 'tiles': {
        const t = await page.evaluate(() => ({ tiles: document.querySelectorAll('.tile').length, live: [...document.querySelectorAll('.tile video')].filter((v) => v.srcObject && v.videoWidth > 0).length, camoff: document.querySelectorAll('.tile.cam-off').length, sec: !!document.querySelector('[data-row="sec"] video'), sd: !!document.querySelector('[data-row="sd"] video'), stage: !!document.querySelector('[data-row="sgs"] video') }));
        console.log('  tiles=' + t.tiles + ' liveVideo=' + t.live + ' camOff=' + t.camoff + ' | composites: section=' + t.sec + ' stadium=' + t.sd + ' stage=' + t.stage);
        break;
      }
      case 'dump': console.log(JSON.stringify(d, null, 2)); break;
      case 'eval': { const v = await page.evaluate((code) => { try { return JSON.stringify(eval(code)); } catch (e) { return 'ERR ' + e; } }, arg).catch((e) => String(e)); console.log('  ' + v); break; }
      case 'watch': {
        const secs = parseFloat(arg) || 3; console.log('  watching every ' + secs + 's — press enter to stop');
        let stop = false; const onLine = () => { stop = true; };
        process.stdin.once('data', onLine);
        while (!stop) { await run('state'); await sleep(secs * 1000); }
        break;
      }
      default: console.log('  unknown command "' + cmd + '" — type help');
    }
    return true;
  }

  if (args.once) { await run(String(args.once)); await browser.close(); process.exit(0); }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'obs> ' });
  console.log('interactive — type "help" for commands, "quit" to leave.');
  rl.prompt();
  rl.on('line', async (line) => {
    let cont = true;
    try { cont = await run(line); } catch (e) { console.log('  ! ' + String(e).slice(0, 160)); }
    if (!cont) { rl.close(); return; }
    rl.prompt();
  });
  rl.on('close', async () => { try { await browser.close(); } catch (e) {} process.exit(0); });
}
main().catch((e) => { console.error(e); process.exit(1); });
