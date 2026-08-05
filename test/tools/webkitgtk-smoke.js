#!/usr/bin/env node
/*
 * webkitgtk-smoke.js — CAN *STOCK* WEBKITGTK BE A MESH PARTICIPANT?
 *
 * A MEASUREMENT TOOL, not a gate. Playwright's WebKit port joins a GifOS
 * meeting but never paints a remote tile and dies on the app share (see
 * test/README "Other ENGINES"). The open question was whether that is
 * PLAYWRIGHT'S EMBEDDER or WebKit itself — so: drive the engine the distro
 * ships (WebKitGTK, what GNOME Web runs) through its own WebKitWebDriver,
 * and ask the same questions.
 *
 * ANSWERED 2026-08-05, and the answer is upstream of every one of them:
 * **stock WebKitGTK has NO WebRTC AT ALL.** `RTCPeerConnection` is undefined.
 * `ENABLE_WEB_RTC` is a PRIVATE cmake option defaulting to
 * ENABLE_EXPERIMENTAL_FEATURES (OFF in release builds), and neither Debian nor
 * Ubuntu overrides it. The `enable-webrtc` WebKitSettings property EXISTS and
 * reads back TRUE after you set it — and does nothing. This tool exists so
 * that verdict is one command to re-check on any box, any distro, any year:
 * the day a build ships with WebRTC on, `caps` goes green and `rtc` becomes
 * the next question.
 *
 *   node test/tools/webkitgtk-smoke.js            # caps + rtc (default)
 *   node test/tools/webkitgtk-smoke.js caps       # the capability matrix only
 *   node test/tools/webkitgtk-smoke.js rtc        # loopback WebRTC: DO FRAMES PAINT?
 *   node test/tools/webkitgtk-smoke.js build      # what the binary was built with
 *   node test/tools/webkitgtk-smoke.js gi         # settings-readback proof (needs python3-gi)
 *
 * It is self-contained: no npm deps (raw WebDriver over fetch), its own probe
 * server, and it starts/stops its own Xvfb + WebKitWebDriver. Needs, from apt:
 *   sudo apt-get install webkit2gtk-driver xvfb        # + gir1.2-webkit2-4.1 for `gi`
 *
 * `rtc` is the test Playwright's WebKit FAILS: one page, two peer connections,
 * a canvas.captureStream sender, and the assertion that the RECEIVING <video>
 * actually reaches readyState>=2 / videoWidth>0 — not merely that getStats
 * says frames decoded. Painting is the thing that was broken, so painting is
 * the thing that is measured.
 *
 * Env: PORT (probe server, default 8399), DRVPORT (8901), XDISPLAY (:99),
 *      KEEP=1 leaves Xvfb/driver running for a follow-up run.
 *
 * Exit 0 = every check passed. A REFUTED engine with a named cause is a
 * SUCCESSFUL measurement — read the verdict lines, not just the exit code.
 */
const http = require('http');
const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = +(process.env.PORT || 8399);
const DRVPORT = +(process.env.DRVPORT || 8901);
const XDISPLAY = process.env.XDISPLAY || ':99';
const DRV = 'http://127.0.0.1:' + DRVPORT;
const mode = process.argv[2] || 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const note = (m) => console.log('  · ' + m);

// ---- where the distro put things -------------------------------------------
function findFile(cands) { for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} } return null; }
const MULTIARCH = ['x86_64-linux-gnu', 'aarch64-linux-gnu', 'arm-linux-gnueabihf'];
const WKD = findFile(['/usr/bin/WebKitWebDriver', '/usr/local/bin/WebKitWebDriver']);
const MINI = findFile(MULTIARCH.flatMap((m) => ['4.1', '4.0'].map((v) => `/usr/lib/${m}/webkit2gtk-${v}/MiniBrowser`)));
const WKLIB = findFile(MULTIARCH.flatMap((m) => ['4.1', '4.0'].map((v) => `/usr/lib/${m}/libwebkit2gtk-${v}.so.0`)));

// ---- raw WebDriver ----------------------------------------------------------
async function wd(method, p, body) {
  const r = await fetch(DRV + p, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch (e) { throw new Error('non-JSON ' + r.status + ': ' + t.slice(0, 300)); }
  if (j.value && j.value.error) throw new Error(j.value.error + ': ' + String(j.value.message || '').slice(0, 400));
  return j.value;
}

// ---- the probe page ---------------------------------------------------------
// Served over http://127.0.0.1 so it is a SECURE CONTEXT: gUM, crypto.subtle
// and the WebRTC surface are all gated on that, and a data: URL is not one.
const PAGE = `<!doctype html><meta charset=utf8><title>webkitgtk-smoke</title>
<body style="margin:0;background:#111"><video id=rx autoplay playsinline muted
  style="width:320px;height:240px"></video><canvas id=src width=320 height=240></canvas>
<script>
window.__caps = function () {
  var codecs = null;
  try { codecs = RTCRtpSender.getCapabilities('video').codecs.map(function (c) { return c.mimeType; })
                  .filter(function (v, i, a) { return a.indexOf(v) === i; }); } catch (e) { codecs = 'n/a'; }
  return {
    ua: navigator.userAgent, secure: window.isSecureContext,
    pc: typeof RTCPeerConnection, dc: typeof RTCDataChannel,
    sdp: typeof RTCSessionDescription, ice: typeof RTCIceCandidate,
    sender: typeof RTCRtpSender, xform: typeof RTCRtpScriptTransform,
    mediastream: typeof MediaStream, gum: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    capture: typeof HTMLCanvasElement.prototype.captureStream,
    subtle: typeof (window.crypto && crypto.subtle), codecs: codecs
  };
};
// Loopback: canvas -> pc1 -> pc2 -> <video id=rx>. No relay, no signalling
// server, no network — if a frame does not paint here it is the ENGINE.
window.__loop = function () {
  window.__out = { phase: 'starting' };
  (async function () {
    try {
      var cv = document.getElementById('src'), cx = cv.getContext('2d'), n = 0;
      setInterval(function () {
        n++; cx.fillStyle = 'hsl(' + (n * 7 % 360) + ',90%,50%)'; cx.fillRect(0, 0, 320, 240);
        cx.fillStyle = '#fff'; cx.font = '48px sans-serif'; cx.fillText('' + n, 20, 120);
      }, 66);
      var stream = cv.captureStream(15);
      var a = new RTCPeerConnection(), b = new RTCPeerConnection();
      a.onicecandidate = function (e) { if (e.candidate) b.addIceCandidate(e.candidate); };
      b.onicecandidate = function (e) { if (e.candidate) a.addIceCandidate(e.candidate); };
      var rx = document.getElementById('rx');
      b.ontrack = function (e) { rx.srcObject = e.streams[0]; rx.play().catch(function (err) { window.__out.playErr = err.name; }); };
      stream.getTracks().forEach(function (t) { a.addTrack(t, stream); });
      var off = await a.createOffer(); await a.setLocalDescription(off); await b.setRemoteDescription(off);
      var ans = await b.createAnswer(); await b.setLocalDescription(ans); await a.setRemoteDescription(ans);
      window.__out.phase = 'negotiated';
      await new Promise(function (r) { setTimeout(r, 6000); });
      var decoded = 0, frameW = 0;
      var st = await b.getStats();
      st.forEach(function (r) { if (r.type === 'inbound-rtp' && r.kind === 'video') {
        decoded = r.framesDecoded || 0; frameW = r.frameWidth || 0; } });
      window.__out = {
        phase: 'done', conn: a.connectionState + '/' + b.connectionState,
        framesDecoded: decoded, statsFrameWidth: frameW,
        rxReadyState: rx.readyState, rxVideoWidth: rx.videoWidth, rxPaused: rx.paused,
        rxHasSrc: !!rx.srcObject, playErr: window.__out.playErr || null
      };
    } catch (e) { window.__out = { phase: 'threw', err: (e && e.name) + ': ' + (e && e.message) }; }
  })();
  return 'kicked';
};
</script>`;

// ---- process plumbing -------------------------------------------------------
const kids = [];
function bg(cmd, args, env) {
  const c = spawn(cmd, args, { stdio: 'ignore', detached: true, env: Object.assign({}, process.env, env || {}) });
  c.unref(); kids.push(c); return c;
}
function stopAll() {
  if (process.env.KEEP) return;
  for (const c of kids) { try { process.kill(-c.pid, 'SIGKILL'); } catch (e) { try { c.kill('SIGKILL'); } catch (e2) {} } }
}
async function up(url, tries) {
  for (let i = 0; i < (tries || 30); i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(500);
  }
  return false;
}

// ---- `build`: what is actually IN the binary --------------------------------
function buildReport() {
  console.log('--- what the distro shipped ---');
  ok(!!WKD, 'WebKitWebDriver present (' + (WKD || 'NOT FOUND — apt-get install webkit2gtk-driver') + ')');
  ok(!!MINI, 'MiniBrowser present (' + (MINI || 'not found') + ')');
  ok(!!WKLIB, 'libwebkit2gtk present (' + (WKLIB || 'not found') + ')');
  try {
    const v = execSync('dpkg-query -W -f=\'${Version}\' libwebkit2gtk-4.1-0 2>/dev/null || true', { encoding: 'utf8' }).trim();
    if (v) note('libwebkit2gtk-4.1-0 version ' + v);
  } catch (e) {}
  if (WKLIB) {
    // WebKit's GStreamer WebRTC backend links libgstwebrtc-1.0/libgstsdp-1.0.
    // ENABLE_WEB_RTC=OFF and they are simply absent — a one-line build census.
    let ldd = '';
    try { ldd = execSync('ldd ' + WKLIB, { encoding: 'utf8' }); } catch (e) {}
    const has = (s) => ldd.includes(s);
    const present = fs.existsSync('/usr/lib/x86_64-linux-gnu/libgstwebrtc-1.0.so.0');
    note('libgstwebrtc-1.0 installed on this box: ' + present + '  (the positive control — if this is'
      + ' true and the link below is false, WebRTC was COMPILED OUT, not merely unavailable)');
    ok(has('libgstwebrtc'), 'libwebkit2gtk links libgstwebrtc-1.0 (the WebRTC backend)');
    ok(has('libgstsdp'), 'libwebkit2gtk links libgstsdp-1.0');
  }
}

// ---- `gi`: the settings-readback proof --------------------------------------
// The strongest possible refutation of "you just did not turn it on": set
// enable-webrtc through the C API itself, read it back TRUE, and watch
// RTCPeerConnection stay undefined anyway.
async function giProof() {
  console.log('--- enable-webrtc via the C API (python3-gi) ---');
  const py = path.join(os.tmpdir(), 'wkgtk-gi-' + process.pid + '.py');
  fs.writeFileSync(py, `import gi
gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib
s = WebKit2.Settings()
s.set_property('enable-media-stream', True)
s.set_property('enable-webrtc', True)
s.set_property('enable-mock-capture-devices', True)
print('READBACK enable-media-stream=%s enable-webrtc=%s enable-mock-capture-devices=%s' % (
  s.get_property('enable-media-stream'), s.get_property('enable-webrtc'),
  s.get_property('enable-mock-capture-devices')))
w = Gtk.Window(); v = WebKit2.WebView(settings=s); w.add(v); w.show_all()
JS = "JSON.stringify({pc:typeof RTCPeerConnection,dc:typeof RTCDataChannel,xform:typeof RTCRtpScriptTransform,ms:typeof MediaStream,gum:!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)})"
def on_load(view, ev):
    if ev != WebKit2.LoadEvent.FINISHED: return
    def done(view, res):
        try: print('JS ' + view.evaluate_javascript_finish(res).to_string())
        except Exception as e: print('JS ERROR %s' % e)
        Gtk.main_quit()
    v.evaluate_javascript(JS, -1, None, None, None, done)
v.connect('load-changed', on_load)
v.load_uri('http://127.0.0.1:${PORT}/')
GLib.timeout_add_seconds(90, Gtk.main_quit)
Gtk.main()`);
  // NOT spawnSync: this probe is served BY US, and a synchronous wait parks
  // the event loop so the page it is waiting for can never be delivered.
  const out = await new Promise((res) => {
    const c = spawn('python3', [py], { env: Object.assign({}, process.env,
      { DISPLAY: XDISPLAY, GDK_BACKEND: 'x11', WAYLAND_DISPLAY: '' }) });
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; });
    c.stderr.on('data', (d) => { buf += d; });
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, 150000);
    c.on('close', () => { clearTimeout(t); res(buf); });
  });
  try { fs.unlinkSync(py); } catch (e) {}
  for (const l of out.split('\n')) if (/^(READBACK|JS)/.test(l)) console.log('  ' + l);
  if (/ModuleNotFoundError|Namespace WebKit2 not available/.test(out)) {
    note('SKIPPED: needs `sudo apt-get install gir1.2-webkit2-4.1 python3-gi`');
    return;
  }
  const readback = /enable-webrtc=True/.test(out);
  const js = /^JS (\{.*\})$/m.exec(out);
  ok(readback, 'the enable-webrtc setting accepts TRUE and reads back TRUE');
  // An ABSENT answer is not a good one. Without this the "pc is undefined"
  // regex silently passes whenever the probe fails to report at all, which is
  // the exact shape of a guard that guards nothing.
  ok(!!js, 'the gi probe reported a JS result at all' + (js ? '' : ' — got none (page never loaded?)'));
  if (!js) note('raw probe output: ' + JSON.stringify(out.slice(-600)));
  if (js) {
    const r = JSON.parse(js[1]);
    ok(r.pc === 'function', 'RTCPeerConnection EXISTS once enable-webrtc is TRUE  [got: ' + r.pc + ']');
    if (readback && r.pc === 'undefined') note('⇒ REFUTED WITH MECHANISM: the setting is a live property over a'
      + ' subsystem that was never compiled in. Not a flag you are missing.');
  }
}

// ---- main -------------------------------------------------------------------
(async () => {
  if (mode === 'build') { buildReport(); return finish(); }

  if (!WKD) { console.log('FAIL no WebKitWebDriver — sudo apt-get install webkit2gtk-driver'); fails++; return finish(); }

  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  console.log('# probe page on http://127.0.0.1:' + PORT + '/');

  // Xvfb: WebKitGTK is a real GTK app and wants a display. Never borrow the
  // user's — a smoke run must not throw windows onto somebody's desktop.
  const dnum = XDISPLAY.replace(':', '');
  if (!fs.existsSync('/tmp/.X11-unix/X' + dnum)) {
    bg('Xvfb', [XDISPLAY, '-screen', '0', '1280x900x24', '-nolisten', 'tcp']);
    await sleep(2000);
  }
  console.log('# display ' + XDISPLAY);

  if (mode === 'gi') { await giProof(); srv.close(); return finish(); }

  if (!(await up(DRV + '/status', 4))) {
    bg(WKD, ['--port=' + DRVPORT, '--host=127.0.0.1'],
      { DISPLAY: XDISPLAY, GDK_BACKEND: 'x11', WAYLAND_DISPLAY: '' });
    if (!(await up(DRV + '/status', 40))) { console.log('FAIL WebKitWebDriver never came up on ' + DRV); fails++; srv.close(); return finish(); }
  }
  console.log('# WebKitWebDriver on ' + DRV);

  // Every knob the docs offer for turning WebRTC on, all at once: the
  // WebKitSettings flags MiniBrowser exposes AND the stock-build
  // WEBKIT_FEATURES env route (addendum 4's premise).
  const v = await wd('POST', '/session', { capabilities: { alwaysMatch: {
    'webkit:browserOptions': {
      args: ['--enable-media-stream=TRUE', '--enable-webrtc=TRUE', '--enable-mock-capture-devices=TRUE'],
      env: { WEBKIT_FEATURES: 'WebRTCEncodedTransform,MediaStreamTrackProcessing' },
    },
  } } });
  const sid = v.sessionId;
  const S = (p) => '/session/' + sid + p;
  try {
    await wd('POST', S('/timeouts'), { script: 60000 });
    await wd('POST', S('/url'), { url: 'http://127.0.0.1:' + PORT + '/' });

    const caps = await wd('POST', S('/execute/sync'), { script: 'return window.__caps()', args: [] });
    console.log('--- capability matrix (stock WebKitGTK via WebKitWebDriver) ---');
    note('UA: ' + caps.ua);
    note('secureContext=' + caps.secure + '  crypto.subtle=' + caps.subtle
      + '  MediaStream=' + caps.mediastream + '  getUserMedia=' + caps.gum
      + '  canvas.captureStream=' + caps.capture);
    note('codecs: ' + JSON.stringify(caps.codecs));
    ok(caps.secure === true, 'page is a secure context (Ed25519/S4 identity needs it)');
    ok(caps.subtle === 'object', 'crypto.subtle present');
    ok(caps.capture === 'function', 'canvas.captureStream present (the injected fake camera)');
    ok(caps.pc === 'function', 'RTCPeerConnection present  [got: ' + caps.pc + ']');
    ok(caps.dc !== 'undefined' || caps.pc === 'function', 'RTCDataChannel reachable  [got: ' + caps.dc + ']');
    ok(caps.xform === 'function', 'RTCRtpScriptTransform present (the mesh-pipe lane)  [got: ' + caps.xform + ']');
    if (caps.pc === 'undefined') {
      note('⇒ NO WebRTC in this build. ENABLE_WEB_RTC is a PRIVATE cmake option defaulting to');
      note('  ENABLE_EXPERIMENTAL_FEATURES (OFF for releases) and no distro overrides it.');
      note('  Run `build` and `gi` for the two corroborating measurements.');
    }

    if ((mode === 'all' || mode === 'rtc') && caps.pc === 'function') {
      console.log('--- loopback WebRTC: do frames PAINT? ---');
      await wd('POST', S('/execute/sync'), { script: 'return window.__loop()', args: [] });
      let out = null;
      for (let i = 0; i < 20; i++) {
        await sleep(2000);
        out = await wd('POST', S('/execute/sync'), { script: 'return window.__out', args: [] });
        if (out && (out.phase === 'done' || out.phase === 'threw')) break;
      }
      console.log('  ' + JSON.stringify(out));
      ok(!!out && out.phase === 'done', 'loopback negotiated and settled');
      ok(!!out && out.framesDecoded > 0, 'getStats: frames DECODING (' + (out && out.framesDecoded) + ')');
      // THE question Playwright's WebKit fails: decoding is not painting.
      ok(!!out && out.rxReadyState >= 2, 'remote <video> readyState>=2 (' + (out && out.rxReadyState) + ')');
      ok(!!out && out.rxVideoWidth > 0, 'remote <video> videoWidth>0 (' + (out && out.rxVideoWidth) + ') — THE TILE PAINTS');
    } else if (mode === 'all' || mode === 'rtc') {
      console.log('--- loopback WebRTC: NOT REACHED (no RTCPeerConnection to loop back through) ---');
    }
    if (mode === 'all') { buildReport(); await giProof(); }
  } finally {
    try { await wd('DELETE', S('')); } catch (e) {}
    srv.close();
  }
  finish();
})().catch((e) => { console.error('FATAL ' + (e && e.message || e)); stopAll(); process.exit(1); });

function finish() {
  console.log(fails === 0 ? '# ALL GREEN' : '# ' + fails + ' FAILED — read the causes above; a refutation with a'
    + ' named mechanism is a finished measurement, not a broken run');
  stopAll();
  setTimeout(() => process.exit(fails === 0 ? 0 : 1), 300);
}
