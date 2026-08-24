// Seeded Tools/Social apps: stopwatch format, fortune honesty, guestbook/chat Invite.
// Guards live in site/js/sample-apps.js (TIMER_HTML / FORTUNE_HTML / GUESTBOOK_HTML /
// CHAT_HTML + SAMPLE_HELP + the app() manifests). The apps themselves are GIFs
// packed at seed time; this suite reads the source they are packed FROM.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '../../site/js/sample-apps.js'), 'utf8');

let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d).slice(0, 160) + ')' : ''));
  if (!c) failures++;
};

function grabConst(name) {
  const re = new RegExp('const ' + name + ' = `([\\s\\S]*?)`;\\n');
  const m = re.exec(SRC);
  if (!m) { check('extract ' + name, false, 'not found'); process.exit(1); }
  // Undo one template-literal escape level so we eval the JS the app actually runs.
  return m[1].replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
}

function grabFn(html, name, re) {
  const m = re.exec(html);
  if (!m) { check('extract ' + name, false, 'not found'); process.exit(1); }
  return m[0];
}

const timer = grabConst('TIMER_HTML');
const fortune = grabConst('FORTUNE_HTML');
const guestbook = grabConst('GUESTBOOK_HTML');
const chat = grabConst('CHAT_HTML');

const T = new Function(grabFn(timer, 'pad2', /function pad2\([\s\S]*?\n  \}/) + '\n'
  + grabFn(timer, 'fmtSw', /function fmtSw\([\s\S]*?\n  \}/) + '\n'
  + grabFn(timer, 'fmtT', /function fmtT\([\s\S]*?\n  \}/) + '\n'
  + 'return { pad2, fmtSw, fmtT };')();

check('stopwatch shows hundredths, not tenths', T.fmtSw(0) === '00:00.00', T.fmtSw(0));
check('1230 ms is 00:01.23', T.fmtSw(1230) === '00:01.23', T.fmtSw(1230));
check('a minute is 01:00.00', T.fmtSw(60000) === '01:00.00', T.fmtSw(60000));
check('an hour prefixes hours and keeps hundredths', T.fmtSw(3600000 + 1230) === '1:00:01.23', T.fmtSw(3600000 + 1230));
check('countdown 90s is 1:30', T.fmtT(90000) === '1:30', T.fmtT(90000));
check('countdown ceils the last second (1 ms remaining still reads 0:01)', T.fmtT(1) === '0:01', T.fmtT(1));
check('countdown zero is 0:00', T.fmtT(0) === '0:00', T.fmtT(0));
check('stopwatch has a Lap button and a lap list', /id="lap"/.test(timer) && /id="laps"/.test(timer));
check('stopwatch Start/Stop, not Pause, while running', /go\.textContent=sw\.running\?'Stop':'Start'/.test(timer));
check('the clock persists in gifos.db(\'clock\')', /gifos\.db\('clock'\)/.test(timer) && /function persist\(/.test(timer));
check('laps colour fastest/slowest only once there are two', /n>=2/.test(timer) && /class="'\+\w+\+'fast'/.test(timer) || /'fast'/.test(timer));

const F = new Function('window', 'gifos', grabFn(fortune, 'whyFail', /function whyFail\([\s\S]*?\n  \}/) + '\nreturn whyFail;')({ gifos: { fetch: 1 } }, { fetch: 1 });
check('fortune names a denied Internet instead of inventing a line',
  /Internet is off/.test(F(new Error('Network denied: api.adviceslip.com not in app permissions')))
  && /will not invent/.test(F(new Error('Network denied: x'))));
check('fortune names a timeout', /took too long/.test(F(new Error('timeout'))));
check('fortune names an HTTP status', /HTTP 503/.test(F(new Error('HTTP 503'))));
check('fortune names an empty slip', /no advice/.test(F(new Error('empty'))));
check('fortune never fills a made-up line on a generic failure',
  /will not make a fortune up/.test(F(new Error('Failed to fetch')))
  && !/Don't burn|Always do your best/i.test(F(new Error('nope'))));
check('fortune still fetches only api.adviceslip.com',
  /gifos\.fetch\('https:\/\/api\.adviceslip.com\/advice/.test(fortune));
check('the seeded fortune allowlist is still exactly adviceslip',
  /app\('Fortune', 'fortune'[\s\S]{0,180}network: \['api\.adviceslip\.com'\]/.test(SRC));
check('fortune does not invent a slip when the JSON is empty (throws empty, not …)',
  /throw new Error\('empty'\)/.test(fortune) && !/\|\|'…'/.test(fortune));

check('guestbook empty wall tells you to Invite',
  /No one has signed yet/.test(guestbook) && /Invite/.test(guestbook));
check('guestbook header says just you — Invite when alone',
  /just you — Invite/.test(guestbook));
check('guestbook presence rides gifos.db(\'presence\')', /gifos\.db\('presence'\)/.test(guestbook));
check('guestbook stamps are not a blank pill',
  !/\['💜','','⭐'/.test(guestbook) && /\['💜','✨','⭐'/.test(guestbook));
check('guestbook signatures keep a time', /t: Date\.now\(\)/.test(guestbook) && /function ago\(/.test(guestbook));
check('guestbook Invite is live (RW entries + presence, multiplayer)',
  /app\('Guestbook'[\s\S]{0,280}presence: RW/.test(SRC)
  && /app\('Guestbook'[\s\S]{0,220}multiplayer: true/.test(SRC));

check('chat empty thread tells you to Invite',
  /No messages yet/.test(chat) && /Invite/.test(chat));
check('chat header says just you — Invite when alone',
  /just you — Invite/.test(chat));
check('chat presence rides gifos.db(\'presence\')', /gifos\.db\('presence'\)/.test(chat));
check('chat ✨ draft streams into the box and never sends',
  /onDelta:function\(piece\)/.test(chat)
  && /it never sends/.test(chat)
  && /Drafting with your AI/.test(chat));
check('chat Invite is live (RW messages + presence)',
  /app\('Chat'[\s\S]{0,320}presence: RW/.test(SRC));

// SAMPLE_HELP must describe what the build actually does — an overclaim is a failed round.
const helpTimer = /timer: `# Stopwatch[\s\S]*?(?=\n      \w+: `#)/.exec(SRC);
const helpFortune = /fortune: `# Fortune[\s\S]*?(?=\n      \w+: `#)/.exec(SRC);
const helpGuest = /guestbook: `# Guestbook[\s\S]*?(?=\n      \w+: `#)/.exec(SRC);
const helpChat = /chat: `# Chat[\s\S]*?(?=\n      \w+: `#)/.exec(SRC);
check('SAMPLE_HELP.timer documents laps and hundredths',
  helpTimer && /Lap/.test(helpTimer[0]) && /hundredths/.test(helpTimer[0]));
check('SAMPLE_HELP.timer says Invite does not share a clock',
  helpTimer && /Invite\*\* does not share a clock/.test(helpTimer[0]));
check('SAMPLE_HELP.fortune says it never invents a line',
  helpFortune && /never invents/.test(helpFortune[0]));
check('SAMPLE_HELP.guestbook leads with Invite',
  helpGuest && /just you — Invite/.test(helpGuest[0]));
check('SAMPLE_HELP.chat claims a streaming ✨ draft that never sends',
  helpChat && /never sends/.test(helpChat[0]) && /as the words arrive/.test(helpChat[0]));

// Hard wall: do not touch the other seeded apps in this run.
['PINGPONG_HTML', 'TICTACTOE_HTML', 'CONNECT_FOUR_HTML', 'MINESWEEPER_HTML', 'CHESS_HTML', 'PAINT_HTML', 'NOTES_HTML', 'CALCULATOR_HTML']
  .forEach((name) => check(name + ' is still packed', new RegExp('const ' + name + ' = `').test(SRC)));

console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
process.exit(failures ? 1 : 0);
