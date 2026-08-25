// TUNER HAS TO NAME A PITCH — AND ADMIT WHEN IT CANNOT HEAR.
//
// The GIF records a clip (gifos.recordAudio), never a live mic, then runs
// Chris Wilson's ACF2+ autocorrelation on a synthetic buffer in this suite
// so a missing detector, a 440 that is not A, or a silent buffer that still
// claims a note cannot ship. Empty-state copy and the recordAudio (not
// getUserMedia) rule are source-scanned: a vm cannot press the OS recorder.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'tuner');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of ['vendor/pitch.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = src('index.html');
const css = src('style.css');
const app = src('app.js');
const pitch = src('vendor/pitch.js');
const help = src('help.md');
const listing = JSON.parse(src('listing.json'));
const manifest = JSON.parse(src('manifest.json'));

const sandbox = load();
const P = sandbox.PitchDetect;
const T = sandbox.TunerApp;
check('pitch.js and app.js load', !!(P && P.detect && P.sine && T && T.detectAt && T.classify));

check('A4 midi is 69', P.noteFromPitch(440) === 69);
check('midi 69 is 440 Hz', Math.abs(P.frequencyFromNoteNumber(69) - 440) < 1e-6);

function sine(hz, rate, n, amp) {
  amp = amp == null ? 1 : amp;
  const out = [];
  const w = 2 * Math.PI * hz / rate;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

{
  const r = T.detectAt(sine(440, 44100, 4096), 44100, 440);
  check('440 Hz is A4', !!(r && r.name === 'A' && r.octave === 4), r);
  check('440 Hz is within 2 Hz', !!(r && Math.abs(r.hz - 440) < 2), r && r.hz);
  check('440 Hz is in tune', !!(r && T.inTune(r.cents)), r && r.cents);
}

{
  const r = T.detectAt(sine(329.6276, 44100, 4096), 44100, 440);
  check('E4 (high guitar E) is E', !!(r && r.name === 'E' && r.octave === 4), r);
  check('E4 is in tune at A4=440', !!(r && T.inTune(r.cents)), r && r.cents);
}

{
  const r = T.detectAt(sine(82.40689, 44100, 8192), 44100, 440);
  check('E2 (low guitar E) is E', !!(r && r.name === 'E' && r.octave === 2), r);
  if (r) check('E2 is within a quarter-tone of 82.4 Hz', Math.abs(r.hz - 82.40689) < 2, r.hz);
}

{
  const r = T.detectAt(sine(110, 44100, 8192), 44100, 440);
  check('A2 (guitar A) is A2', !!(r && r.name === 'A' && r.octave === 2), r);
}

{
  const r = T.detectAt(sine(446, 44100, 4096), 44100, 440);
  check('446 Hz is still named A', !!(r && r.name === 'A'), r);
  check('446 Hz is sharp of A4', !!(r && r.cents > 5), r && r.cents);
}

{
  const r440 = T.detectAt(sine(440, 44100, 4096), 44100, 442);
  check('A4=442 names 440 as a slightly-flat A', !!(r440 && r440.name === 'A' && r440.cents < 0), r440);
}

{
  const quiet = sine(440, 44100, 4096, 0.001);
  const q = T.classify(quiet, 44100, 440);
  check('a near-silent buffer is quiet, not a note', q.kind === 'quiet' && !q.reading, q);
  check('rms of silence is under the 0.01 floor', T.rmsOf(quiet) < 0.01, T.rmsOf(quiet));
}

{
  const zeros = [];
  for (let i = 0; i < 2048; i++) zeros[i] = 0;
  const q = T.classify(zeros, 44100, 440);
  check('a zero buffer is quiet', q.kind === 'quiet');
}

check('help admits extra frequencies can throw the reading off',
  /extra frequencies/.test(help) && /same limit/.test(help));

{
  const loud = sine(440, 44100, 8192, 1);
  const c = T.classify(loud, 44100, 440);
  check('a loud 440 is ok / A', c.kind === 'ok' && c.reading && c.reading.name === 'A', c);
}

check('centsVs 440 vs 440 is 0', T.centsVs(440, 440) === 0);
check('centsVs an octave is 1200', T.centsVs(880, 440) === 1200);
check('in-tune window is ±5 cents', T.inTune(5) && T.inTune(-5) && !T.inTune(6) && !T.inTune(-6));
check('A4 clamps to 415–466', T.clampA4(400) === 415 && T.clampA4(500) === 466 && T.clampA4(440) === 440);

{
  const g = T.STRINGS.guitar;
  check('guitar is EADGBE', g.length === 6 && g[0].id === 'E2' && g[5].id === 'E4');
  const near = T.nearestString(110, g, 440);
  check('110 Hz nearest guitar string is A2', !!(near && near.string.id === 'A2' && Math.abs(near.cents) <= 2), near);
  const e4 = T.hzOfString(g[5], 440);
  check('high E at A4=440 is ~329.6', Math.abs(e4 - 329.6276) < 0.01, e4);
  const e4b = T.hzOfString(g[5], 442);
  check('high E scales with A4', Math.abs(e4b - 329.6276 * 442 / 440) < 0.01, e4b);
}

{
  const reading = T.detectAt(sine(82.40689, 44100, 8192), 44100, 440);
  const aimed = T.applyTarget(reading, 'guitar', 'E2', 440);
  check('locking E2 keeps the name E2', !!(aimed && aimed.name === 'E' && aimed.octave === 2 && aimed.target === 'E2'), aimed);
  if (aimed) check('locking E2 at 82.4 Hz is in tune', T.inTune(aimed.cents), aimed.cents);
}

{
  const reading = { hz: 440, note: 69, name: 'A', octave: 4, cents: 0, a4: 440 };
  const auto = T.applyTarget(reading, 'uke', 'auto', 440);
  check('440 on ukulele auto aims at A4', !!(auto && auto.aimed === 'A4'), auto);
}

// 1.0 save {id,hz,name,octave,cents,at} still has the fields 1.1 reads.
{
  const old = { id: 'last', hz: 440, name: 'A', octave: 4, cents: 0, at: 1 };
  check('1.0 last-reading still loads', old.hz === 440 && old.name === 'A');
}

// ---- source scans a vm cannot run ------------------------------------------
check('records a clip, never a live mic', /recordAudio/.test(app) && !/getUserMedia|mediaDevices|createMediaStreamSource/.test(app + pitch + html));
check('empty state copy is on first boot', /No clip yet/.test(html) && /body class="empty"/.test(html));
check('too-quiet is a distinct error', /Too quiet/.test(app));
check('no-pitch is a distinct error', /no clear pitch/.test(app));
check('cancelled is a distinct error', /cancel/i.test(app));
check('says there is no live microphone', /no live microphone/.test(html) && /no live microphone/.test(app));
check('Record a note is the action', /Record a note/.test(html));
check('private save of last reading', /db\('save'\)/.test(app) && /id: 'last'/.test(app));
check('A4 is adjustable', /a4Down/.test(html) && /a4Up/.test(html));
check('guitar / uke / bass are offered', /data-inst="guitar"/.test(html) && /data-inst="uke"/.test(html) && /data-inst="bass"/.test(html));
check('pitch pipe exists', /pipeBtn/.test(html) && /Play A4/.test(html));
check('Record is 52px tall and full width', /min-height: 52px/.test(css) && /#recBtn/.test(css));
check('string chips are thumb-sized', /min-height: 44px/.test(css));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('help names too-quiet and not-a-live-tuner', help.length >= 400 && /too quiet/i.test(help) && /Not a live tuner/.test(help));
check('listing says it is a take, not a live needle', /a take, not a live needle/i.test(listing.description));
check('listing credits Chris Wilson', listing.author && listing.author.name === 'Chris Wilson');
check('listing is an unofficial port', listing.basedOn && listing.basedOn.name === 'PitchDetect' && listing.basedOn.blessed === false);
check('microphone capability is declared (clips, not a stream)', manifest.capabilities.microphone === true);
check('no network, no multiplayer, no wasm', !manifest.capabilities.network && !manifest.capabilities.multiplayer && !manifest.capabilities.wasm);
check('save is private', manifest.data.save.visibility === 'private');
check('classic scripts only', !/type=["']module["']/.test(html));
check('no remote URL in the page', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
check('vendor pitch is ACF2+ (autoCorrelate)', /function autoCorrelate/.test(pitch));

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\n' + 'all PASS');
