// Contrast Ratio's "Best" button has to be RIGHT, not merely plausible.
//
// The most contrast any colour can have against a fixed one is pure black or
// pure white — contrast is a ratio of luminances, so it only grows as the two
// separate, and the ceiling is an endpoint of the scale. Which endpoint wins
// is NOT "black if the other is light": against #777 black wins 4.69 to 4.48,
// and the crossover sits well above 50% grey (a mid grey is closer to white
// in luminance than the eye suggests). So the pick is measured, and this
// pins the measurement.
//
// It also pins the asymmetry the button has to respect: alpha is not
// symmetric — the text composites ON the background — so replacing the
// background is a different calculation from replacing the text, and against
// a see-through colour the pick is judged on the WORST case, never the
// average, or the answer flips depending on what happens to sit underneath.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'contrast-ratio');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// app.js boots only when there is a document with its fields in it; with no
// document at all it just publishes ContrastRatio, which is what we want.
function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, String, Number, Boolean,
    parseInt, parseFloat, isNaN, Infinity, Error, TypeError, RegExp,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: function () {},
    addEventListener: function () {}
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'color.js'), 'utf8'), sandbox, { filename: 'color.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = load();
const App = sandbox.ContrastRatio;
const Color = sandbox.Color;

check('app.js publishes ContrastRatio without a document', !!App);
check('…including bestAgainst', !!App && typeof App.bestAgainst === 'function');
if (!App || typeof App.bestAgainst !== 'function') process.exit(1);

// color.js parses ONLY the rgb()/rgba() form the browser hands back from
// getComputedStyle — names and hexes never reach it, the page normalises them
// first. So colours are built here the way the app has them by then.
function c(hex, alpha) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((d) => d + d).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return new Color(alpha === undefined ? rgb : rgb.concat(alpha));
}
const WHITE = c('ffffff');
const BLACK = c('000000');
const best = (other, asBackground) => App.bestAgainst(other, asBackground);

// ---- the obvious ends -------------------------------------------------------
check('best text on white is black', best(WHITE, false).value === 'black', best(WHITE, false));
check('best text on black is white', best(BLACK, false).value === 'white', best(BLACK, false));
check('best background under white text is black', best(WHITE, true).value === 'black', best(WHITE, true));
check('best background under black text is white', best(BLACK, true).value === 'white', best(BLACK, true));

// ---- the endpoint claim itself ----------------------------------------------
// If the ceiling were NOT an endpoint, some mid tone would beat the winner.
// Sweep the greys and every primary ramp: nothing may beat what best() picked.
{
  let beaten = null;
  const others = ['ffffff', '000000', '777777', '808080', '663399', '00aaff', 'ffcc00', '1a7fd4'];
  for (const o of others) {
    const other = c(o);
    const pick = best(other, false);
    const winner = pick.value === 'black' ? Color.BLACK : Color.WHITE;
    const ceiling = other.contrast(winner).min;
    for (let v = 0; v <= 255; v += 5) {
      for (const cand of [new Color([v, v, v]), new Color([v, 0, 0]), new Color([0, v, 0]), new Color([0, 0, v])]) {
        const got = other.contrast(cand).min;
        if (got > ceiling + 1e-9) beaten = { other: o, v, got, ceiling };
      }
    }
  }
  check('no colour beats the endpoint the button picks', beaten === null, beaten);
}

// ---- the measured crossover -------------------------------------------------
// #777 is the case a guess gets wrong: it LOOKS like a mid grey, so "pick the
// opposite end" reasoning says white, and black actually wins.
{
  const grey = c('777777');
  const onBlack = grey.contrast(Color.BLACK).min;
  const onWhite = grey.contrast(Color.WHITE).min;
  check('#777 really is the close call', Math.abs(onBlack - onWhite) < 0.25, { onBlack, onWhite });
  check('…and black wins it', onBlack > onWhite && best(grey, false).value === 'black', { onBlack, onWhite });
  check('…which is above AA, so the button is worth pressing', onBlack >= 4.5, onBlack);
}

// ---- the asymmetry ----------------------------------------------------------
// Text composites ON the background, so the two directions are different sums.
// A see-through text colour over black vs over white is not the same question.
{
  const mist = c('000000', 0.7);              // 70% black TEXT
  const asBg = best(mist, true);              // choose a background under it
  check('a background is chosen under see-through text', !!asBg && (asBg.value === 'white' || asBg.value === 'black'), asBg);
  const white = Color.WHITE.contrast(mist).min;
  const black = Color.BLACK.contrast(mist).min;
  check('…and it is the one that measures higher', asBg.value === (white >= black ? 'white' : 'black'), { white, black, pick: asBg.value });
}

// ---- see-through OTHER: judge the worst case, never the average -------------
// A semi-transparent BACKGROUND makes the contrast a range. A pick made on the
// midpoint can be the wrong colour once something dark slides underneath.
{
  const sheer = c('000000', 0.55);            // see-through BACKGROUND
  const pick = best(sheer, false);
  const black = sheer.contrast(Color.BLACK);
  const white = sheer.contrast(Color.WHITE);
  check('a see-through background really does give a range', black.error > 0 || white.error > 0, { black, white });
  const byWorst = white.min >= black.min ? 'white' : 'black';
  check('the pick maximises the WORST case', pick.value === byWorst, { pick, blackMin: black.min, whiteMin: white.min });
  check('…and reports that worst case, not the midpoint', Math.abs(pick.worst - Math.max(black.min, white.min)) < 1e-9, pick);
}

// ---- it never returns something the app cannot type back --------------------
{
  const values = new Set();
  const cases = [c('ffffff'), c('000000'), c('777777'), c('123456'), c('000000', 0.3), c('f0b840')];
  for (const other of cases) {
    values.add(best(other, false).value);
    values.add(best(other, true).value);
  }
  check('every pick is a plain colour name the field accepts',
    [...values].every((v) => v === 'black' || v === 'white'), [...values]);
}

// ---- the hex readout --------------------------------------------------------
// It is on screen whatever was typed, so it has to be right for every form —
// including the one color.js gets wrong. toHex() multiplies alpha by 255 and
// never rounds, so 70% formats as "b2.8": a hex with a decimal point in it.
{
  check('hexOf is exported', typeof App.hexOf === 'function');
  check('an opaque colour is 6 digits, no alpha tail', App.hexOf(c('ffffff')) === '#ffffff', App.hexOf(c('ffffff')));
  check('black is #000000', App.hexOf(c('000000')) === '#000000', App.hexOf(c('000000')));
  check('a short hex is expanded', App.hexOf(c('777')) === '#777777', App.hexOf(c('777')));
  check('an odd value keeps its digits', App.hexOf(c('123456')) === '#123456', App.hexOf(c('123456')));
  const sheer = App.hexOf(c('000000', 0.7));
  check('a see-through colour gets an 8-digit hex', sheer === '#000000b3', sheer);
  check('…with no decimal point in it', !/\./.test(sheer), sheer);
  check('vendor toHex is the thing being worked around', /\./.test(c('000000', 0.7).toHex(true)), c('000000', 0.7).toHex(true));
  check('fully transparent is #00000000', App.hexOf(c('000000', 0)) === '#00000000', App.hexOf(c('000000', 0)));
  check('a composited colour rounds instead of emitting garbage',
    /^#[0-9a-f]{6}$/.test(App.hexOf(c('000000', 0.7).overlayOn(Color.WHITE))), App.hexOf(c('000000', 0.7).overlayOn(Color.WHITE)));
  check('nothing in, nothing out', App.hexOf(null) === '');
}

// ---- the markup the buttons need --------------------------------------------
{
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  check('index.html carries both Best buttons',
    html.includes('id="backgroundBest"') && html.includes('id="foregroundBest"'));
  check('index.html carries both hex readouts',
    html.includes('id="backgroundHex"') && html.includes('id="foregroundHex"'));
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  check('app.js wires both of them', /backgroundBest'\)\.addEventListener/.test(js) && /foregroundBest'\)\.addEventListener/.test(js));
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASSED');
process.exit(failures ? 1 : 0);
