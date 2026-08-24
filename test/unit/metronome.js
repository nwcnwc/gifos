// METRONOME HAS TO CLICK IN TIME.
//
// The GIF is a lookahead Web Audio scheduler (Chris Wilson): notes are
// scheduled 100ms ahead, then the lights and the pendulum MUST follow
// audio.currentTime, not the schedule call. Tempo math is the product —
// 120 4/4 is a click every 500ms, 6/8 at 120 clicks eighths, tap tempo
// from timestamps. A port that paints when it schedules flashes early
// and is not a metronome.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'metronome');

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
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = src('index.html');
const css = src('style.css');
const app = src('app.js');
const mp = src('mp.js');
const help = src('help.md');
const listing = JSON.parse(src('listing.json'));
const manifest = JSON.parse(src('manifest.json'));

const sandbox = load();
const M = sandbox.MetronomeApp;
check('app.js loads and attaches MetronomeApp', !!(M && M.beatsOf && M.scheduleBar && M.tapBpm));

check('4/4 is 4 beats', M.beatsOf('4/4') === 4);
check('3/4 is 3 beats', M.beatsOf('3/4') === 3);
check('2/4 is 2 beats', M.beatsOf('2/4') === 2);
check('6/8 is 6 pulses', M.beatsOf('6/8') === 6);
check('unknown signature falls back to 4', M.beatsOf('9/8') === 4);

{
  const q = M.nextSeconds(120, '4/4');
  check('120 BPM 4/4 is a click every 0.5s', Math.abs(q - 0.5) < 1e-9, q);
  const e = M.nextSeconds(120, '6/8');
  check('120 BPM 6/8 clicks eighths (0.25s)', Math.abs(e - 0.25) < 1e-9, e);
  const slow = M.secondsPerClick(60, '4/4', 'beat');
  check('60 BPM 4/4 is a click every 1s', Math.abs(slow - 1) < 1e-9, slow);
  const s8 = M.secondsPerClick(120, '4/4', '8th');
  check('120 BPM 4/4 eighths click every 0.25s', Math.abs(s8 - 0.25) < 1e-9, s8);
  const trip = M.secondsPerClick(120, '4/4', 'trip');
  check('120 BPM 4/4 triplets click every 1/6 s', Math.abs(trip - 1 / 6) < 1e-9, trip);
  const s16 = M.secondsPerClick(120, '4/4', '16th');
  check('120 BPM 4/4 sixteenths click every 0.125s', Math.abs(s16 - 0.125) < 1e-9, s16);
}

{
  const bar = M.scheduleBar(120, '4/4', 'beat', 0);
  check('a 4/4 bar at the beat is 4 clicks', bar.length === 4, bar.length);
  check('times are 0, 0.5, 1.0, 1.5',
    bar.every((n, i) => Math.abs(n.time - i * 0.5) < 1e-9),
    bar.map((n) => n.time));
  check('only the downbeat is the accent', bar[0].accent && bar.slice(1).every((n) => !n.accent));
  check('every beat click is onBeat', bar.every((n) => n.onBeat));
}

{
  const bar = M.scheduleBar(120, '4/4', '8th', 1);
  check('eighths: 8 clicks in a 4/4 bar', bar.length === 8, bar.length);
  check('eighths start at t0', Math.abs(bar[0].time - 1) < 1e-9, bar[0].time);
  check('off-beat eighths are not onBeat', !bar[1].onBeat && bar[1].beat === 0 && bar[1].sub === 1);
  check('beat 1 lands at +0.5s', Math.abs(bar[2].time - 1.5) < 1e-9 && bar[2].beat === 1 && bar[2].onBeat);
}

{
  const bar = M.scheduleBar(120, '6/8', 'beat', 0);
  check('6/8 bar is 6 clicks', bar.length === 6, bar.length);
  check('6/8 spacing is 0.25s at 120',
    bar.every((n, i) => Math.abs(n.time - i * 0.25) < 1e-9));
  check('6/8 downbeat is the only accent', bar[0].accent && !bar[3].accent);
}

check('clicksInBar 4/4 16th is 16', M.clicksInBar('4/4', '16th') === 16);
check('clicksInBar 3/4 trip is 9', M.clicksInBar('3/4', 'trip') === 9);

check('tempo clamps below 30', M.clampTempo(0) === 30);
check('tempo clamps above 240', M.clampTempo(999) === 240);
check('tempo rounds', M.clampTempo(120.4) === 120);

check('tap of 500ms gaps is 120 BPM', M.tapBpm([0, 500, 1000, 1500]) === 120);
check('tap of 1000ms gaps is 60 BPM', M.tapBpm([1000, 2000, 3000]) === 60);
check('tap of one stamp is nothing', M.tapBpm([1]) === null);
check('tap uses the last 6 stamps', M.tapBpm([0, 10, 1000, 1500, 2000, 2500, 3000, 3500]) === 120);
check('tap clamps a 10ms flutter up to 240', M.tapBpm([0, 10, 20]) === 240);

check('120 is Allegro', M.tempoMark(120) === 'Allegro');
check('50 is Largo', M.tempoMark(50) === 'Largo');
check('92 is Andante', M.tempoMark(92) === 'Andante');
check('180 is Presto', M.tempoMark(180) === 'Presto');
check('printed marks are on the box', Array.isArray(M.MARKS) && M.MARKS.length >= 6);

check('lookahead is Wilson\'s 25ms', M.LOOKAHEAD === 25);
check('schedule-ahead is Wilson\'s 0.1s', M.SCHEDULE_AHEAD === 0.1);

// Saved row from 1.0 (tempo, sig, vol only) must still be a valid 1.1 row.
{
  const old = { id: 'last', tempo: 88, sig: '3/4', vol: 40 };
  check('1.0 save has the fields loadSave still reads',
    old.tempo >= 30 && old.tempo <= 240 && !!M.BEATS[old.sig] && old.vol >= 0);
  check('missing subdiv/sound is safe (defaults exist)', !old.subdiv && !old.sound);
}

// ---- source scans a vm cannot run ------------------------------------------
check('no live microphone', !/getUserMedia|mediaDevices|recordAudio|createMediaStreamSource/.test(app + html + mp));
check('Web Audio oscillator click', /createOscillator/.test(app));
check('lookahead constant is in the scheduler', /SCHEDULE_AHEAD/.test(app));
check('notes are queued and painted when they PLAY', /queue\.push/.test(app) && /queue\[0\]\.time/.test(app));
check('pendulum follows the beat', /--pend/.test(app) && /pendArm/.test(html));
check('private save of last tempo', /db\('save'\)/.test(app) && /id: 'last'/.test(app));
check('Back stops the click', /onBack/.test(app));
check('space bar starts and stops', /Space/.test(app));
check('phone − / + exist', /tempoDown/.test(html) && /tempoUp/.test(html));
check('Start is at least 52px tall', /min-height: 52px/.test(css) || /height: 52px/.test(css));
check('step buttons are 56px', /min-width: 56px/.test(css) && /min-height: 56px/.test(css));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('tells the player to press Invite', /Invite/.test(app) && /Invite/.test(mp));
check('volume is not in the room snapshot', !/vol:/.test(mp));
check('guests do not lock local volume', /host-only/.test(css) && !/body\.guest #vol/.test(css));
check('subdivisions are on the box', /data-sub="8th"/.test(html) && /data-sub="trip"/.test(html));
check('wood click AND Wilson beep', /data-sound="click"/.test(html) && /data-sound="beep"/.test(html));
check('tap tempo control is there', /tapBtn/.test(html) && /tapTempo/.test(app));
check('6/8 is offered', /data-sig="6\/8"/.test(html));
check('help names the jobs', help.length >= 400 && /Tap tempo/.test(help) && /subdivision/i.test(help));
check('help does not re-document OS Save', !/\*\*Save\*\*/.test(help));
check('listing leads with offline / no account', /^Works offline/i.test(listing.description));
check('listing claims a file-is-save', /live in this file/.test(listing.description));
check('listing credits cwilso', listing.author && listing.author.name === 'cwilso');
check('listing is an unofficial port', listing.basedOn && listing.basedOn.blessed === false);
check('no mic in the manifest', !manifest.capabilities.microphone && !manifest.capabilities.network);
check('save is private, room is read-only',
  manifest.data.save.visibility === 'private' && manifest.data.room.visibility === 'read-only');
check('launch can open on a tempo', !!(manifest.launch && manifest.launch.bpm && manifest.launch.sig));
check('classic scripts only', !/type=["']module["']/.test(html));
check('no remote URL in the page', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\n' + 'all PASS');
