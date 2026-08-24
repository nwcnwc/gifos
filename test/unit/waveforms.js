// WAVEFORMS HAS TO TEACH AND PLAY.
//
// The store copy is an explorable: sine / square / saw, harmonics you can
// hear assembling, a place in the guide that lives in the file. This suite
// PLAYS that loop in a vm — math, save round-trip, launch-to-a-step — and
// source-scans the phone/Back/Hear one-liners a vm cannot click.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'waveforms');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    Float32Array, Uint8Array,
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    requestAnimationFrame: () => 0,
    addEventListener: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['vendor/waveform.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const S = load();
const M = S.WaveformMath;
const A = S.WaveformsApp;
check('waveform math and app load', !!(M && A && A.STEPS && A.STEPS.length >= 10));

{
  check('sine at 0 is rest', M.getPositionAtPointRelativeToAxis('sine', 1, 1, 0) === 0);
  const peak = M.getPositionAtPointRelativeToAxis('sine', 1, 1, 25);
  check('sine peaks at +1 a quarter cycle in', Math.abs(peak - 1) < 1e-9, peak);
  check('square is high then low',
    M.getPositionAtPointRelativeToAxis('square', 1, 1, 10) === 1 &&
    M.getPositionAtPointRelativeToAxis('square', 1, 1, 60) === -1);
  const saw0 = M.getPositionAtPointRelativeToAxis('sawtooth', 1, 1, 0);
  const saw99 = M.getPositionAtPointRelativeToAxis('sawtooth', 1, 1, 99);
  check('saw runs −1 → +1 across a cycle', Math.abs(saw0 + 1) < 1e-9 && saw99 > 0.9, { saw0, saw99 });
  const tri = M.getPositionAtPointRelativeToAxis('triangle', 1, 1, 25);
  check('triangle peaks at +1', Math.abs(tri - 1) < 1e-9, tri);
}

{
  const sqH = M.getHarmonicsForWave('square', 1, 1, 2);
  check('square harmonics are 3× and 5×', sqH[0].frequency === 3 && sqH[1].frequency === 5, sqH);
  const sawH = M.getHarmonicsForWave('sawtooth', 1, 1, 3);
  check('saw harmonics are 2× 3× 4×',
    sawH[0].frequency === 2 && sawH[1].frequency === 3 && sawH[2].frequency === 4, sawH);
  check('a sine has no extras', M.getHarmonicsForWave('sine', 1, 1, 8).length === 0);
  const mixed = M.applyWaveformAddition(
    [{ x: 0, y: 1 }, { x: 1, y: 1 }],
    [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
    1
  );
  check('converge 1 replaces the fundamental with the stack', mixed[0].y === 0);
  const none = M.applyWaveformAddition(
    [{ x: 0, y: 1 }],
    [[{ x: 0, y: 0 }]],
    0
  );
  check('converge 0 keeps the fundamental', none[0].y === 1);
}

{
  A.loadRecord({ step: 10, amp: 0.5, freq: 2, shape: 'square', harm: 8, conv: 0.65, vol: 0.4 });
  const st = A.getState();
  check('saved square lesson reloads', st.step === 10 && st.shape === 'square' && st.harm === 8, st);
  check('saved amp/freq/vol reload', st.amp === 0.5 && st.freq === 2 && st.vol === 0.4, st);
  const rec = A.toRecord();
  check('toRecord keeps the gifos.db id and the same keys the current version wrote',
    rec.id === 'state' && rec.step === 10 && rec.shape === 'square' && rec.harm === 8);
  A.loadRecord({ step: 99, amp: 9, freq: 0, shape: 'nope', harm: -1, conv: 4, vol: 2 });
  const bad = A.getState();
  check('a corrupt save is clamped, not a crash',
    bad.step === A.STEPS.length - 1 && bad.shape !== 'nope' && bad.amp === 1, bad);
}

{
  A.loadRecord({ step: 0, amp: 1, freq: 1, shape: 'sine', harm: 0, conv: 0, vol: 0 });
  A.applyLaunch({ step: 'square' });
  check('launch step=square opens the square lesson', A.getState().step === 10, A.getState());
  A.applyLaunch({ step: 13, shape: 'saw' });
  check('launch step=13 (1-indexed) is sawtooth', A.getState().step === 12, A.getState());
  check('launch shape=saw aliases sawtooth', A.getState().shape === 'sawtooth', A.getState());
}

{
  A.loadRecord({ step: 10, amp: 1, freq: 1, shape: 'square', harm: 4, conv: 0.5, vol: 0 });
  const pack = A.pointsFor(64, 0);
  check('pointsFor draws a mixed square when harmonics are on',
    pack.mixed.length > 10 && pack.extras.length === 4, { mixed: pack.mixed.length, extras: pack.extras.length });
  const tab = A.harmonicTable('square', 4, 1);
  check('the audible table has the 3rd and 5th harmonic',
    tab.imag[3] > 0 && tab.imag[5] > 0, { h3: tab.imag[3], h5: tab.imag[5] });
  check('audible Hz is the slow graph × 110 (1 cycle → 110 Hz)', A.audibleHz(1) === 110);
  check('4 cycles is 440 Hz — an A4', A.audibleHz(4) === 440);
}

{
  const ids = A.STEPS.map((s) => s.id);
  check('the walk-through still has air, square, saw, and an end',
    ids.indexOf('air') >= 0 && ids.indexOf('square') >= 0 && ids.indexOf('saw') >= 0 && ids.indexOf('end') >= 0, ids);
  const air = A.STEPS.filter((s) => s.air);
  check('exactly one air-molecule step', air.length === 1);
  const harmSteps = A.STEPS.filter((s) => s.harm);
  check('harmonics show up for square/triangle/saw', harmSteps.length >= 3);
}

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

check('viewport-fit for a phone', /viewport-fit=cover/.test(html));
check('Hear is a real button, not a slider the thumb misses', /id="hearBtn"/.test(html));
check('shape chips exist for a thumb (not only a <select>)', /data-shape="square"/.test(html));
check('no Invite button in the app chrome', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('no CDN / remote at load', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
check('classic scripts, no type=module', !/type=["']module["']/.test(html));
check('gifos.onBack steps the guide', /gifos\.onBack/.test(js));
check('gifos.db save is the file', /db\('save'\)/.test(js));
check('no eval / Function / fetch / getUserMedia',
  !/eval\(|new Function\(|fetch\(|getUserMedia|XMLHttpRequest|WebSocket/.test(js));
check('buttons are 44px tall', /min-height:\s*44px/.test(css));
check('nav is sticky on a phone', /position:\s*fixed/.test(css) && /bottom:\s*0/.test(css));
check('graph stays on screen while you read', /position:\s*sticky/.test(css));
check('[hidden] wins over display:grid so the walk-through can reveal controls',
  /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));
check('no webfont import', !/@import|fonts\.google|typekit/i.test(css));
check('listing leads with the reason to use this version',
  /offline/i.test(listing) && /file/i.test(listing) && /thumb|phone/i.test(listing));
check('listing does not mention internals',
  !/gifos\.db|WASM|sandbox|localStorage|WebRTC|React/.test(listing));
check('help covers Hear, harmonics, and what is saved',
  /Hear/.test(help) && /Harmonics/.test(help) && /file/.test(help) && help.trim().length >= 400);
check('manifest is solo + private save + launch-to-a-step',
  manifest.capabilities.db === true &&
  !manifest.capabilities.multiplayer &&
  manifest.data.save.visibility === 'private' &&
  !!(manifest.launch && manifest.launch.step) &&
  manifest.minBuild === 947);

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll ' + (failures, 'PASS lines above') + ' — waveforms core loop holds.');
process.exit(0);
