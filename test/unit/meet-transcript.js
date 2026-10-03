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
// ---- and the chat bounds it shares (CHAT_MAX, chatRateOk, trimMap, takeChat), verbatim ----
const cstart = html.indexOf('    const CHAT_MAX = 500, CHAT_PER_10S = 20;');
const cend = html.indexOf('    function takeTomb(id, t) {');
check('the chat-bounds block is where the lift expects it', cstart > 0 && cend > cstart);
const cblock = html.slice(cstart, cend);
function makeChat() {
  const src = cblock + '\n return { chat, takeChat, trimMap, chatRateOk, CHAT_MAX };';
  const chat = new Map(), chatTombs = new Map(), chatOffInfo = () => null, admins = [], myId = 'me';
  return new Function('chat', 'chatTombs', 'chatOffInfo', 'admins', 'myId', src)(chat, chatTombs, chatOffInfo, admins, myId);
}
function makeTranscript() {
  const src = block
    + '\n return { trs, trSeen, takeTr, trBlocks, trEcho, drops: () => trDrops, setSource: (id) => { ccSourceId = id; } };';
  const C = makeChat(); // the real trimMap and the real per-author limiter, as the page runs them
  const myId = 'me';
  return new Function('CHAT_MAX', 'trimMap', 'chatRateOk', 'myId', src)(C.CHAT_MAX, C.trimMap, C.chatRateOk, myId);
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

// ---- rule 1b: a scribe can offer, never impose ----
{
  const T = makeTranscript();
  const t0 = 4000000;
  check('another device\'s scribed line is dropped while I have not chosen that scribe',
    T.takeTr({ id: 's1', byId: 'oleg', by: 'Oleg', at: t0, text: 'we need to think what to do with this black box', scribe: 'andrew', scribeBy: 'Andrew' }) === false);
  T.setSource('andrew');
  check('…and kept, with the scribe\'s name on it, once I chose them',
    T.takeTr({ id: 's2', byId: 'oleg', by: 'Oleg', at: t0 + 100, text: 'we need to think what to do with this black box', scribe: 'andrew', scribeBy: 'Andrew' }) === true
    && T.trs.get('s2').scribeBy === 'Andrew' && T.trs.get('s2').by === 'Oleg');
  check('a scribe writing down THEMSELVES is refused (their own voice rides as their plain line)',
    T.takeTr({ id: 's3', byId: 'andrew', by: 'Andrew', at: t0 + 200, text: 'and also kansas city camera something longer', scribe: 'andrew', scribeBy: 'Andrew' }) === false);
  check('the speaker\'s own line and the scribe\'s line for the same words are one utterance',
    T.takeTr({ id: 'o1', byId: 'oleg', by: 'Oleg', at: t0 + 2500, text: 'We need to think what to do with this black box.' }) === false);
  const blocks = T.trBlocks();
  check('a scribed block carries who wrote it', blocks.length === 1 && blocks[0].scribeBy === 'Andrew', JSON.stringify(blocks));
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

// ---- rule 4: the bounds hold, and the history replay is whole ----
// trimMap deleted by value.id, but trSeen is keyed by the line's TEXT: nothing
// was ever trimmed, and every caption past 500 paid a sort over all of them.
{
  const C = makeChat();
  const byText = new Map();
  for (let i = 0; i < 600; i++) byText.set('line number ' + i, { at: 1000 + i, src: 'x', id: 't' + i });
  C.trimMap(byText, 500);
  check('trimMap bounds a map keyed by text (deletes by key, not by value.id)', byText.size === 500, 'size ' + byText.size);
  check('…and keeps the NEWEST by at', !byText.has('line number 0') && byText.has('line number 599'));
  const T = makeTranscript();
  for (let i = 0; i < 600; i++) T.takeTr({ id: 'l' + i, byId: 'me', by: 'Me', at: 5000000 + i * 1000, text: 'distinct sentence number ' + i + ' spoken in a long captioned class' });
  check('600 distinct captions leave trSeen bounded by CHAT_MAX', T.trSeen.size <= 500 && T.trs.size <= 500, 'trSeen ' + T.trSeen.size + ' trs ' + T.trs.size);
}
// The 'hi' replay on a channel open carries one speaker's whole backlog in a
// burst. The per-author limiter (20 per 10 s) is for a LIVE flood; applied to
// the replay it kept 20 lines of 60 and the rest never came again.
{
  const T = makeTranscript();
  const t0 = 6000000;
  let live = 0;
  for (let i = 0; i < 60; i++) if (T.takeTr({ id: 'v' + i, byId: 'oleg', by: 'Oleg', at: t0 + i * 1000, text: 'live sentence number ' + i + ' from one busy speaker' })) live++;
  check('a live burst from one speaker is still capped at 20 per 10 s', live === 20, 'took ' + live);
  const T2 = makeTranscript();
  let replay = 0;
  for (let i = 0; i < 60; i++) if (T2.takeTr({ id: 'v' + i, byId: 'oleg', by: 'Oleg', at: t0 + i * 1000, text: 'replayed sentence number ' + i + ' from one busy speaker' }, true)) replay++;
  check('the same 60 lines as a hi replay (backfill) all land', replay === 60 && T2.trs.size === 60, 'took ' + replay);
  const C = makeChat();
  let cl = 0, cr = 0;
  for (let i = 0; i < 40; i++) if (C.takeChat({ id: 'c' + i, byId: 'alex', by: 'Alexandra', at: t0 + i, text: 'live chat ' + i })) cl++;
  check('a live chat burst from one author is still capped at 20 per 10 s', cl === 20, 'took ' + cl);
  const C2 = makeChat();
  for (let i = 0; i < 40; i++) if (C2.takeChat({ id: 'c' + i, byId: 'alex', by: 'Alexandra', at: t0 + i, text: 'replayed chat ' + i }, true)) cr++;
  check('the same 40 chat lines as a hi replay (backfill) all land', cr === 40 && C2.chat.size === 40, 'took ' + cr);
  check('a replayed duplicate is still refused', C2.takeChat({ id: 'c1', byId: 'alex', by: 'Alexandra', at: t0, text: 'again' }, true) === false);
}

// ---- rule 3: the controls and the layout rule ----
check('a Leave button sits on the always-visible row, before the collapsible part',
  html.indexOf('<button id="leavebtn"') > 0 && html.indexOf('<button id="leavebtn"') < html.indexOf('<div class="barmore" id="barmore">'));
// The bar is collapsed by default and nothing expands it on a message, so a
// status inside .barmore (display:none) was a refusal, a ban, "reconnecting…"
// and the five-minute host-absence countdown written into an invisible element.
check('the status line sits on the always-visible row, before the collapsible part',
  html.indexOf('<span class="status" id="status">') > 0 && html.indexOf('<span class="status" id="status">') < html.indexOf('<div class="barmore" id="barmore">'));
check('…and so does the host-absence countdown',
  html.indexOf('<div class="admcount" id="admcount"') > 0 && html.indexOf('<div class="admcount" id="admcount"') < html.indexOf('<div class="barmore" id="barmore">'));
check('the first status text does not promise a camera (the page joins quiet and hidden)', !/id="status">Starting camera/.test(html) && /id="status">Joining…</.test(html));
check('leaving shows a card with the way back', /id="left-modal"[\s\S]*id="left-rejoin"/.test(html));
check('Settings offers a captions-language picker', /<select id="cclang"/.test(html));
check('the engine listens in the chosen language, not the device default', /speech\.lang = ccLang\(\) === 'auto' \? \(navigator\.language \|\| 'en-US'\) : ccLang\(\);/.test(html) && !/speech\.lang = navigator\.language \|\| 'en-US';/.test(html));
check('a Whisper engine can be chosen, fed from the echo-cancelled track, with a backlog cap', /name="ccengine" value="whisper"/.test(html) && /createMediaStreamSource\(new MediaStream\(\[localStream\.getAudioTracks\(\)\[0\]\]\)\)/.test(html) && /WSP_BACKLOG = 3/.test(html));
check('Whisper requests ride the OS provider surface as raw 16 kHz PCM', /GifOS\.providers\.call\('stt'/.test(html) && /audio\/pcm;rate=16000;bits=32/.test(html));
check('a phone is warned that Whisper is slow there', /On a phone, Whisper runs on the processor/.test(html));
check('choosing Whisper without the app falls back to browser captions, never silence', /if \(wspCaps\.has\('me'\) \|\| startWhisper\(\)\) \{ wspSync\(\); return; \}/.test(html));
check('one tap installs the provider from the meeting, and a missing app is rescanned', /GifOS\.providers\.install\(WHISPER_APP_ID/.test(html) && /function armWhisperRescan/.test(html));
check('the provider seeds itself quietly once a meeting is up', /WHISPER_SEED_KEY/.test(html) && /installWhisper\(false\)/.test(html));
check('a scribe captures neighbours off the meter sources, capped', /WSP_SCRIBE_MAX = 8/.test(html) && /function wspSync/.test(html) && /wspSource\(pid\)/.test(html));
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
