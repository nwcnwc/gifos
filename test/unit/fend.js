// FEND HAS TO CONVERT 1 FT TO CM — AND SAY SO WHEN IT CANNOT.
//
// The GIF ships printfn's wasm engine. This suite boots that engine in a vm
// (same glue as the GIF: classic IIFE, bytes in, no fetch) and evaluates the
// fixtures the listing claims. If this box cannot instantiate wasm, the glue
// is still played with a JS wrapper around those known answers, and the phone
// keypad / empty / miss rules are source-scanned — a vm cannot press a 44px key.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'fend');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = src('index.html');
const css = src('style.css');
const appSrc = src('app.js');
const help = src('help.md');
const listing = JSON.parse(src('listing.json'));
const manifest = JSON.parse(src('manifest.json'));

function loadApp(extra) {
  const sandbox = Object.assign({
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error,
    Uint8Array, Int32Array, DataView, TextEncoder, TextDecoder, WebAssembly,
    setTimeout: () => 0, clearTimeout: () => {},
    Promise, Map,
    performance: { now: () => Date.now() },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    document: {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {}, setAttribute: () => {}, appendChild: () => {},
        addEventListener: () => {}, textContent: '', className: ''
      }),
      body: { classList: { add: () => {} } }
    }
  }, extra || {});
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

// ---- listing / manifest / help: every claim true, no internals --------------
check('capabilities.wasm and db, no network',
  !!(manifest.capabilities && manifest.capabilities.wasm === true &&
     manifest.capabilities.db === true && !manifest.capabilities.network));
check('minBuild stays 947', manifest.minBuild === 947);
check('listing author is printfn, porter GifOS, unofficial',
  listing.author && listing.author.name === 'printfn' &&
  listing.porter && listing.porter.name === 'GifOS' &&
  listing.basedOn && listing.basedOn.blessed === false);
check('listing leads with offline / file / no website',
  /offline/i.test(listing.description) && /this file/i.test(listing.description) &&
  /no website/i.test(listing.description));
check('listing claims 1 ft to cm', /1 ft to cm/.test(listing.tagline + listing.description));
check('listing does not mention WASM or gifos.db',
  !/WASM|gifos\.db|sandbox|WebRTC|localStorage/i.test(JSON.stringify(listing)));
check('help names the phone keypad and roll 4d6',
  /keypad/i.test(help) && /roll 4d6/.test(help));
check('help does not mention WASM or gifos.db',
  !/WASM|gifos\.db|sandbox/i.test(help));
check('help.md is a real page', help.trim().length >= 400);

// ---- phone keypad + miss sentence are in the shipped source -----------------
check('index.html has a keypad and unit chips',
  html.includes('id="pad"') && html.includes('data-token="ft"') &&
  html.includes('data-token="to"') && html.includes('data-token="7"'));
check('inputmode none so the phone keypad is the keyboard',
  /inputmode="none"/.test(html));
check('css shows the pad at phone width',
  css.includes('max-width: 640px') && css.includes('.pad { display: grid; }'));
check('pad keys are at least 44px', /min-height:\s*44px/.test(css));
check('WASM miss is one sentence',
  appSrc.includes('The calculator engine did not start on this device.'));
check('errors use the engine message, not a generic error',
  appSrc.includes('out.message') || appSrc.includes('answerOf'));
check('pad is saved privately as last',
  appSrc.includes("db('save')") && appSrc.includes("id: 'last'"));
check('engine boots from packed bytes',
  appSrc.includes('initSync') && appSrc.includes('FEND_WASM_B64'));
check('empty pad offers 1 ft to cm',
  appSrc.includes('Type a line. Try one of these.') && appSrc.includes('1 ft to cm'));
check('app.js does not fetch',
  !appSrc.includes('fetch(') && !appSrc.includes('XMLHttpRequest') && !appSrc.includes('WebSocket'));

// ---- glue: insertToken builds the signature line; answerOf is honest --------
const sandbox = loadApp();
vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
const A = sandbox.FendApp;
check('app.js exports FendApp', !!(A && A.evaluate && A.insertToken && A.answerOf && A.MISS));

{
  let cur = '';
  cur = A.insertToken(cur, '1', 'key');
  cur = A.insertToken(cur, 'ft', 'unit');
  cur = A.insertToken(cur, 'to', 'word');
  cur = A.insertToken(cur, 'cm', 'unit');
  check('insertToken types 1 ft to cm on the phone pad', cur === '1 ft to cm', cur);
  check('backspace drops the last character', A.insertToken('1 ft', '⌫', 'bksp') === '1 f');
  check('space is a no-op on an empty prompt', A.insertToken('', 'spc', 'spc') === '');
}

check('empty input is skipped, not an error line',
  !!(A.evaluate('', '{}', { evaluateFendWithVariablesJson: () => { throw new Error('should not run'); } }).skip));

{
  const fake = {
    evaluateFendWithVariablesJson: function (q) {
      const known = {
        '1 ft to cm': { ok: true, result: '30.48 cm', variables: '{}' },
        '2 + 2': { ok: true, result: '4', variables: '{}' },
        'nope': { ok: false, message: "unknown identifier 'nope'" }
      };
      return JSON.stringify(known[q] || { ok: false, message: 'unknown' });
    }
  };
  const ok = A.evaluate('1 ft to cm', '{}', fake);
  check('wrapper: 1 ft to cm is 30.48 cm', ok.ok && ok.a === '30.48 cm', ok);
  const bad = A.evaluate('nope', '{}', fake);
  check('wrapper: a miss is the engine sentence, not "error"',
    !bad.ok && bad.a === "unknown identifier 'nope'", bad);
  check('answerOf reads message when ok is false',
    A.answerOf({ ok: false, message: 'exchange rates are not available' }) ===
      'exchange rates are not available');
}

check('MISS is a single sentence',
  typeof A.MISS === 'string' && A.MISS.indexOf('.') === A.MISS.length - 1 &&
  A.MISS.indexOf(' ') > 0);

// ---- real engine, if this box can instantiate the packed wasm ---------------
let engine = null;
try {
  const glue = src('vendor/fend_wasm.js');
  const wasm = fs.readFileSync(path.join(APP, 'vendor/fend_wasm_bg.wasm'));
  const engBox = loadApp();
  vm.runInContext(glue, engBox, { filename: 'fend_wasm.js' });
  if (!engBox.Fend || typeof engBox.Fend.initSync !== 'function') throw new Error('no Fend.initSync');
  engBox.Fend.initSync({ module: wasm });
  engine = engBox.Fend;
  check('wasm boots in the vm (initSync from bytes)', true);
} catch (e) {
  check('wasm boots in the vm (initSync from bytes)', false, String(e && e.message || e));
}

if (engine) {
  const ft = A.evaluate('1 ft to cm', '{}', engine);
  check('1 ft to cm is 30.48 cm', ft.ok && ft.a === '30.48 cm', ft);
  const kg = A.evaluate('5 kg in lb', '{}', engine);
  check('5 kg in lb names pounds', kg.ok && /lb/i.test(kg.a), kg);
  const c = A.evaluate('100 C to F', '{}', engine);
  check('100 C to F is 212 °F', c.ok && /212/.test(c.a) && /F/.test(c.a), c);
  const sum = A.evaluate('2 + 2 * 3', '{}', engine);
  check('2 + 2 * 3 is 8', sum.ok && sum.a === '8', sum);
  const hex = A.evaluate('0xFF', '{}', engine);
  check('0xFF is hex 0xff', hex.ok && /ff/i.test(hex.a), hex);
  const sin = A.evaluate('sin(pi / 2)', '{}', engine);
  check('sin(pi / 2) is 1', sin.ok && sin.a === '1', sin);
  const a = A.evaluate('a = 3', '{}', engine);
  const twice = A.evaluate('a * 2', a.vars, engine);
  check('variables stick: a = 3 then a * 2 is 6', twice.ok && twice.a === '6', twice);
  const nope = A.evaluate('nope', '{}', engine);
  check('unknown identifier is a sentence, not "error"',
    !nope.ok && /unknown identifier/.test(nope.a) && nope.a !== 'error', nope);
  const fx = A.evaluate('1 USD to GBP', '{}', engine);
  check('currency without a network is refused honestly',
    !fx.ok && /not available/i.test(fx.a), fx);
  const roll = A.evaluate('roll 4d6', '{}', engine);
  check('roll 4d6 is a number between 4 and 24',
    roll.ok && /^\d+$/.test(roll.a) && Number(roll.a) >= 4 && Number(roll.a) <= 24, roll);
} else {
  console.log('NOTE — wasm did not instantiate here; fixtures ran through the JS wrapper only.');
}

if (failures) {
  console.log(failures + ' failure(s)');
  process.exit(1);
}
console.log('ok');
