// meet-transcript.js — the meeting transcript's three reading rules, lifted
// straight out of site/run.html and run in Node:
//
//   1. ONE VOICE, WRITTEN DOWN ONCE. A device's speech engine hears the raw
//      microphone, so a laptop on speakers writes down everyone it can hear.
//      The same words from a DIFFERENT device within 8s are one utterance:
//      the earlier line wins, a late-arriving earlier line replaces the echo,
//      and short lines ("okay") are allowed to repeat.
//   2. PARAGRAPHS. The engine hands over two-word finals with no punctuation;
//      consecutive lines from one person within 5s read as one block.
//   3. THE CONTROLS EXIST: a Leave button on the always-visible row, a
//      captions-language picker and a rename in Settings, the refusal inside
//      the share sheet, and the share-fills-the-window layout rule.
//
// Born 2026-10-02 from the first customer meeting (Nano AG): every sentence
// twice under two names, Russian nonsense from a phone set to ru-RU, "how do
// I sign off?", and a share nobody could make big.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- lift the transcript block verbatim ----
const start = html.indexOf('    const trs = new Map(); // id -> { id, byId, by, at, text }');
const end = html.indexOf('    function showCaption(');
check('the transcript block is where the lift expects it', start > 0 && end > start);
const block = html.slice(start, end);
function makeTranscript() {
  const src = block
    + '\n return { trs, takeTr, trBlocks, trEcho, drops: () => trDrops };';
  const CHAT_MAX = 500;
  const trimMap = (m, max) => { while (m.size > max) m.delete(m.keys().next().value); };
  const chatRateOk = () => true;
  const myId = 'me';
  return new Function('CHAT_MAX', 'trimMap', 'chatRateOk', 'myId', src)(CHAT_MAX, trimMap, chatRateOk, myId);
}

// ---- rule 1: echoes ----
{
  const T = makeTranscript();
  const t0 = 1000000;
  check('the first phone to write a sentence keeps it',
    T.takeTr({ id: 'a1', byId: 'alex', by: 'Alexandra', at: t0, text: 'you have to run the App instead okay choose what to share' }));
  check('the same sentence from a second phone two seconds later is an echo, not a line',
    T.takeTr({ id: 'b1', byId: 'andrew', by: 'Andrew', at: t0 + 2000, text: 'You have to run the app instead, okay, choose what to share.' }) === false);
  check('…and the transcript holds it once', T.trs.size === 1 && T.trs.get('a1').by === 'Alexandra');
  check('the drop is counted', T.drops() === 1);
  check('the same words nine seconds later are a new line (someone repeated themselves)',
    T.takeTr({ id: 'b2', byId: 'andrew', by: 'Andrew', at: t0 + 9000, text: 'you have to run the app instead okay choose what to share' }));
  check('a short line may repeat across phones ("okay" is not an echo)',
    T.takeTr({ id: 'a2', byId: 'alex', by: 'Alexandra', at: t0 + 500, text: 'okay' })
    && T.takeTr({ id: 'b3', byId: 'andrew', by: 'Andrew', at: t0 + 700, text: 'Okay.' }));
  check('the same person saying the same thing twice keeps both',
    T.takeTr({ id: 'a3', byId: 'alex', by: 'Alexandra', at: t0 + 20000, text: 'can you hear me now can you hear me now' })
    && T.takeTr({ id: 'a4', byId: 'alex', by: 'Alexandra', at: t0 + 21000, text: 'can you hear me now can you hear me now' }));
}
{
  const T = makeTranscript();
  const t0 = 2000000;
  check('the echo arrives first over the wire',
    T.takeTr({ id: 'echo', byId: 'andrew', by: 'Andrew', at: t0 + 1500, text: 'everyone else at the bottom your face has got cut off in half' }));
  check('the real speaker\'s EARLIER line, arriving later, is accepted',
    T.takeTr({ id: 'real', byId: 'ken', by: 'Ken', at: t0, text: 'everyone else at the bottom, your face has got cut off in half.' }));
  check('…and it REPLACES the echo, so the words carry the right name',
    T.trs.size === 1 && !T.trs.has('echo') && T.trs.get('real').by === 'Ken');
  check('a third copy after the swap is still an echo',
    T.takeTr({ id: 'echo2', byId: 'alex', by: 'Alexandra', at: t0 + 1800, text: 'everyone else at the bottom your face has got cut off in half' }) === false);
}

// ---- rule 2: paragraphs ----
{
  const T = makeTranscript();
  const t0 = 3000000;
  T.takeTr({ id: '1', byId: 'andrew', by: 'Andrew', at: t0, text: 'I would like to test' });
  T.takeTr({ id: '2', byId: 'andrew', by: 'Andrew', at: t0 + 1000, text: 'this' });
  T.takeTr({ id: '3', byId: 'andrew', by: 'Andrew', at: t0 + 9000, text: 'one two three' });
  T.takeTr({ id: '4', byId: 'alex', by: 'Alexandra', at: t0 + 9500, text: 'okay there is the transcript' });
  T.takeTr({ id: '5', byId: 'andrew', by: 'Andrew', at: t0 + 10000, text: 'yes it is' });
  const blocks = T.trBlocks();
  check('consecutive lines from one person within 5s read as one paragraph',
    blocks[0] && blocks[0].text === 'I would like to test this', JSON.stringify(blocks[0]));
  check('a gap over 5s starts a new paragraph', blocks[1] && blocks[1].text === 'one two three', JSON.stringify(blocks[1]));
  check('another speaker always starts a new paragraph', blocks[2] && blocks[2].by === 'Alexandra' && blocks[3] && blocks[3].text === 'yes it is', JSON.stringify(blocks.slice(2)));
  check('the raw lines are untouched — only the reading view joins them', T.trs.size === 5);
  check('a paragraph keeps the first line\'s time', blocks[0].at === t0);
}

// ---- rule 3: the controls and the layout rule ----
check('a Leave button sits on the always-visible row, before the collapsible part',
  html.indexOf('<button id="leavebtn"') > 0 && html.indexOf('<button id="leavebtn"') < html.indexOf('<div class="barmore" id="barmore">'));
check('leaving shows a card with the way back', /id="left-modal"[\s\S]*id="left-rejoin"/.test(html));
check('Settings offers a captions-language picker', /<select id="cclang"/.test(html));
check('the engine listens in the chosen language, not the device default', /speech\.lang = ccLang\(\) === 'auto' \? \(navigator\.language \|\| 'en-US'\) : ccLang\(\);/.test(html) && !/speech\.lang = navigator\.language \|\| 'en-US';/.test(html));
check('a Whisper engine can be chosen, fed from the echo-cancelled track, with a backlog cap', /name="ccengine" value="whisper"/.test(html) && /createMediaStreamSource\(new MediaStream\(\[localStream\.getAudioTracks\(\)\[0\]\]\)\)/.test(html) && /WSP_BACKLOG = 3/.test(html));
check('Whisper requests ride the OS provider surface as raw 16 kHz PCM', /GifOS\.providers\.call\('stt'/.test(html) && /audio\/pcm;rate=16000;bits=32/.test(html));
check('a phone is warned that Whisper is slow there', /On a phone, Whisper runs on the processor/.test(html));
check('choosing Whisper without the app falls back to browser captions, never silence', /if \(wsp \|\| startWhisper\(\)\) return;/.test(html));
check('Settings offers a rename', /id="set-rename"/.test(html) && /function renameFlow\(after\)/.test(html));
check('admins get a captions-for-everyone switch that rides the signed mod table',
  /id="ccall"/.test(html) && /\['mute', 'blur', 'cam', 'app', 'chat', 'cc'\]/.test(html));
check('the share sheet carries the refusal itself and hides the picker', /id="share-denied"/.test(html) && /share-go'\)\.style\.display = blocked/.test(html));
check('a refusal holds 12s in the warn colour', /blocking \? 12000 : 4000/.test(html) && /\.bar \.status\.alert/.test(html));
check('while a screen is shared the faces fold into a strip and the stage takes the rest',
  /body\.screen-on #grid \{ flex: 0 0 auto; display: flex;/.test(html) && /body\.screen-on #stagefeed \{ flex: 1 1 auto; min-height: 0;/.test(html));
check('the caption gate reads the mic meter', /myVoiceAt = lastActive/.test(html) && /Date\.now\(\) - myVoiceAt < 3000/.test(html));
check('the name prompt says it is not a password', /It is not a password/.test(html));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
