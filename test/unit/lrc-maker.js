// LRC Maker has to stamp lines, follow the singing line, export LRC, and keep
// the song bytes in the file. The parser + LRCCore play that loop in a vm.
// Phone Stamp size and Back are one-liners, scanned in source.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'lrc-maker');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Map, Number, Intl, isFinite, Uint8Array, Array, Object, JSON,
    String, Boolean, Date, setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'lrc-parser.js'), 'utf8'), sandbox, { filename: 'lrc-parser.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const S = load();
const P = S.lrcParser;
const C = S.LRCCore;
check('parser and LRCCore load', !!(P && P.parser && P.stringify && C && C.stampLine && C.singingAt && C.persistRecord));

{
  const st = P.parser('[00:01.00]Hello\nWorld');
  check('parser: two lines', st.lyric.length === 2, st.lyric.length);
  check('parser: first line is t=1', st.lyric[0].time === 1, st.lyric[0].time);
  const out = P.stringify({ info: new Map(), lyric: st.lyric }, { spaceStart: 0, spaceEnd: 0, fixed: 2, endOfLine: '\n' });
  check('stringify roundtrip keeps the tag', out.indexOf('[00:01.00]Hello') >= 0, out);
}

{
  const parsed = C.parseText('[ti:Demo]\n[00:01.00]Hello\nWorld');
  check('parseText: two lyric lines', parsed.lines.length === 2);
  check('parseText: info.ti', parsed.info.ti === 'Demo', parsed.info);
  check('parseText: unsung second line has no time', parsed.lines[1].time === undefined);

  const cur = C.stampLine(parsed.lines, 1, 2.5);
  check('stamp writes the time and advances', parsed.lines[1].time === 2.5 && cur === 1);

  check('singingAt before first stamp is -1', C.singingAt(parsed.lines, 0) === -1);
  check('singingAt 1.2 is line 0', C.singingAt(parsed.lines, 1.2) === 0);
  check('singingAt 2.5 is line 1 (karaoke follow)', C.singingAt(parsed.lines, 2.5) === 1);
  check('singingAt 9 is still the last stamped line', C.singingAt(parsed.lines, 9) === 1);

  C.unstampLine(parsed.lines, 1);
  check('unstamp clears the time', parsed.lines[1].time === undefined);
  check('singingAt after unstamp falls back to line 0', C.singingAt(parsed.lines, 9) === 0);

  const text = C.exportText(parsed.lines, parsed.info);
  check('export includes [ti: Demo] and the stamped line',
    text.indexOf('[ti: Demo]') >= 0 && text.indexOf('[00:01.00]') >= 0, text);
}

{
  const lines = [{ time: 1, text: 'a' }, { text: 'b' }];
  const small = C.persistRecord({
    lines: lines, cur: 0,
    audioBytes: new Uint8Array([1, 2, 3, 4]),
    audioName: 'song.mp3', audioMime: 'audio/mpeg'
  });
  check('persist keeps lyrics', small.lines.length === 2 && small.id === 'lrc');
  check('persist keeps small audio in the file', small.audioBytes && small.audioBytes.length === 4 && small.audioName === 'song.mp3');
  check('small audio is not flagged too big', small.audioTooBig === false);

  const big = new Uint8Array(C.MAX_AUDIO + 1);
  const rec = C.persistRecord({ lines: lines, cur: 1, audioBytes: big, audioName: 'huge.wav' });
  check('audio over 8 MB is not stuffed into the file', !rec.audioBytes);
  check('…and the save says so honestly', rec.audioTooBig === true);

  const old = C.persistRecord({ lines: lines, cur: 0 });
  check('old saves without audio still load (no audioBytes key required)', old.lines.length === 2 && !old.audioBytes);
}

{
  const empty = C.parseText('one\ntwo\nthree');
  check('plain lyrics become untimed lines', empty.lines.length === 3 && empty.lines[0].time === undefined);
  const i0 = C.stampLine(empty.lines, 0, 0.4);
  const i1 = C.stampLine(empty.lines, i0, 1.1);
  const i2 = C.stampLine(empty.lines, i1, 2.0);
  check('stamping through a song advances 0 → 1 → 2', i0 === 1 && i1 === 2 && i2 === 2);
  check('karaoke lights line 1 at t=1.5', C.singingAt(empty.lines, 1.5) === 1);
  const lrc = C.exportText(empty.lines, {});
  check('export writes three tagged lines',
    (lrc.match(/\[\d/g) || []).length === 3, lrc);
}

const src = {
  app: fs.readFileSync(path.join(APP, 'app.js'), 'utf8'),
  html: fs.readFileSync(path.join(APP, 'index.html'), 'utf8'),
  css: fs.readFileSync(path.join(APP, 'style.css'), 'utf8'),
  mp: fs.readFileSync(path.join(APP, 'mp.js'), 'utf8'),
  listing: JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8')),
  help: fs.readFileSync(path.join(APP, 'help.md'), 'utf8'),
  manifest: JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8')),
};

check('audio bytes are written to gifos.db save', src.app.includes('audioBytes') && src.app.includes("db('save')"));
check('karaoke follow uses singingAt during play', src.app.includes('singingAt') && src.app.includes("'sing'"));
check('onBack closes the lyrics editor, then leaves a shared sheet', src.app.includes('onBack') && src.app.includes('editor'));
check('Stamp sits in a dock under the thumb', src.html.includes('id="dock"') && src.html.includes('id="stampBtn"'));
check('Stamp is at least 56px tall', src.css.includes('#stampBtn') && src.css.includes('min-height: 56px'));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(src.html));
check('Look together still tells you to press Invite', src.mp.includes('Invite'));
check('no fetch / XHR / WebSocket / eval',
  !['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function('].some((b) => src.app.includes(b) || src.mp.includes(b)));
check('no microphone capability (clips are not required)', !src.manifest.capabilities.microphone);
check('no network capability', !src.manifest.capabilities.network);
check('help.md covers Stamp, seek, and the song in the file',
  /Stamp/.test(src.help) && /seek/i.test(src.help) && /8 MB/.test(src.help) && src.help.trim().length > 400);
check('listing leads with the song living in the file', /live in the file|stays in this file/i.test(src.listing.description));
check('listing does not say Drop', !/\bDrop\b/.test(src.listing.tagline + src.listing.description));
check('listing names Stamp and the unofficial port',
  /Stamp/.test(src.listing.description) && /unofficial port/i.test(src.listing.description));
check('author is magic-akari, porter is GifOS',
  src.listing.author.name === 'magic-akari' && src.listing.porter.name === 'GifOS');

console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
process.exit(failures ? 1 : 0);
