// mu-stage-votes.js — stage, votes, leave and the room clocks, lifted out of
// site/run.html.
//
// The guards that already landed stay pinned here (one vote per voter,
// vote-off is final, an excluded step-up disarms, stage/hands/votes use
// stHold, one verify per signed mod table). The guards added with this file
// are the ones the checkout still had.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + JSON.stringify(detail) : '')); }
}
function between(start, end) {
  const a = html.indexOf(start);
  const b = a < 0 ? -1 : html.indexOf(end, a + start.length);
  check('found ' + start.slice(0, 48).trim(), a >= 0 && b > a);
  return a >= 0 && b > a ? html.slice(a, b) : '';
}

// ---- peerAway: 13s keeps the firewall chip, 25s is the away chip ----
{
  const i = html.indexOf('    const peerAway = (pid, ms) => {');
  const j = i < 0 ? -1 : html.indexOf('\n    };', i);
  check('peerAway takes a silence window', i >= 0 && j > i);
  const src = i >= 0 && j > i ? html.slice(i, j + '\n    };'.length) : 'function peerAway(){ throw new Error("missing"); }';
  let now = 1000000;
  const statusOf = new Map();
  const peers = new Map();
  const peerAway = new Function('statusOf', 'peers', 'Date', src + '\nreturn peerAway;')(
    statusOf, peers, { now: () => now });
  peers.set('p', { lastHeard: now - 14000 });
  check('14s of silence is away at the 13s default', peerAway('p') === true);
  check('14s of silence is not the away chip', peerAway('p', 25000) === false);
  peers.set('p', { lastHeard: now - 12000 });
  check('12s of silence is inside the default window', peerAway('p') === false);
  peers.set('p', { lastHeard: now - 26000 });
  check('26s of silence is the away chip', peerAway('p', 25000) === true);
  statusOf.set('p', { away: true });
  peers.set('p', { lastHeard: now - 1000 });
  check('an away pulse shows the chip while lastHeard is fresh', peerAway('p', 25000) === true);
  check('a peer with no pulse and no lastHeard is not away', peerAway('q') === false);
  check('the tile chip waits 25s', html.includes('peerAway(id, 25000)'));
  check('the tile chip no longer says it is waiting', !html.includes('waiting for them'));
  check('the firewall suppressor still uses the default window', html.includes('!peerAway(pid)') && html.includes('awayOf: (id) => peerAway(id)'));
}

// ---- a full stage does not eat an admin call-up ----
{
  const src = between('    function reactHandCall() {', '    // ---- the stage:');
  function make(opts) {
    const calls = [];
    let full = !!opts.full;
    const myStatus = { hand: opts.hand === undefined ? 11 : opts.hand, stg: opts.stg || 0 };
    const app = { on: opts.on !== false, at: opts.at === undefined ? 5 : opts.at };
    const fn = new Function('hasAdminRoom', 'modOf', 'myId', 'myStatus', 'canStage', 'stageIds', 'setStatus', 'setStage', 'SCALE',
      'let handCallAt = 0, handCallNoted = 0;\n' + src + '\nreturn reactHandCall;')(
      () => opts.admin !== false,
      () => ({ app: app }),
      'me',
      myStatus,
      () => opts.can !== false,
      () => (full ? [1, 2] : [1]),
      (m) => calls.push('s:' + m),
      (v) => calls.push('up:' + v),
      { C: 2 });
    return { fn: fn, calls: calls, myStatus: myStatus, setFull: (v) => { full = v; } };
  }
  const full = make({ full: true });
  full.fn();
  check('a full stage does not step the guest up', !full.calls.some((c) => c.indexOf('up:') === 0));
  check('a full stage tells the guest a seat will open', full.calls.some((c) => c.indexOf('seat will open') >= 0));
  const n = full.calls.length;
  full.fn();
  check('the same full-stage grant does not repeat the status', full.calls.length === n);
  full.setFull(false);
  full.fn();
  check('a freed seat steps the guest up once', full.calls.filter((c) => c === 'up:true').length === 1);
  full.fn();
  check('the consumed grant does not step the guest up again', full.calls.filter((c) => c === 'up:true').length === 1);

  const up = make({ stg: 9 });
  up.fn();
  check('a guest already on stage is not stepped up again', !up.calls.some((c) => c.indexOf('up:') === 0));
  const denied = make({ can: false });
  denied.fn();
  check('a grant that is not a stage right does not step up', !denied.calls.some((c) => c.indexOf('up:') === 0));
  const down = make({ hand: null });
  down.fn();
  check('a lowered hand is not a call-up', down.calls.length === 0);
  const open = make({ admin: false });
  open.fn();
  check('an open room does not treat the grant as a call-up', open.calls.length === 0);
  check('the admin queue names a full stage', html.includes("(stage full)") && html.includes('amAdmin && stageIds().length >= SCALE.C'));
}

// ---- broadcast host steps up from the key and the peer id, not a poll ----
{
  const src = between('    function tryBroadcastStage() {', '    async function adoptAdmKey');
  function make(opts) {
    const calls = [];
    let full = !!opts.full;
    const myStatus = { stg: opts.stg || 0 };
    const run = new Function('myStatus', 'setStage', 'adminsNow', 'canStage', 'stageIds', 'bcHostStored', 'SCALE',
      'let bcStageWant = true;\nlet admins = [];\nlet myId = ' + JSON.stringify(opts.myId === undefined ? 'me' : opts.myId) +
      ';\nlet amAdmin = ' + (opts.amAdmin === false ? 'false' : 'true') + ';\nlet BROADCAST = true;\n' +
      src + '\nreturn function () { tryBroadcastStage(); return { want: bcStageWant, admins: admins.slice() }; };')(
      myStatus,
      (v) => calls.push('up:' + v),
      () => ['me'],
      () => opts.can !== false,
      () => (full ? [1, 2] : [1]),
      () => opts.host !== false,
      { C: 2 });
    return { run: run, calls: calls, myStatus: myStatus, setFull: (v) => { full = v; } };
  }
  const ready = make({});
  const readyOut = ready.run();
  check('a ready broadcast host steps up', ready.calls[0] === 'up:true' && readyOut.want === false, ready.calls);
  check('the step-up refreshes the admin view first', readyOut.admins[0] === 'me');
  ready.run();
  check('the want stays down after the step-up', ready.calls.length === 1);

  const already = make({ stg: 5 });
  const alreadyOut = already.run();
  check('a host already on stage is not stepped up again', already.calls.length === 0 && alreadyOut.want === false);
  already.myStatus.stg = 0;
  already.run();
  check('a later step-down is not undone', already.calls.length === 0);

  const packed = make({ full: true });
  const packedOut = packed.run();
  check('a full stage keeps the host waiting', packed.calls.length === 0 && packedOut.want === true);
  packed.setFull(false);
  const freed = packed.run();
  check('a freed stage seat steps the host up', packed.calls[0] === 'up:true' && freed.want === false);

  const late = make({ myId: '' });
  const lateOut = late.run();
  check('the step-up waits until the peer id exists', late.calls.length === 0 && lateOut.want === true);
  const viewer = make({ host: false });
  check('a viewer does not auto-step', viewer.run().want === true && viewer.calls.length === 0);

  const boot = between('              // The HOST auto-steps onto the Stage', '\n            }\n');
  check('the host step-up is not a 250ms poll', boot.indexOf('setInterval') < 0 && boot.indexOf('bcStageWant = true') >= 0);
  check('a missed step-up says why', boot.indexOf('Could not step onto the Stage') >= 0 && boot.indexOf('30000') >= 0);
  check('adoptAdmKey refreshes admins and tries the step-up',
    /async function adoptAdmKey[\s\S]{0,500}admins = adminsNow\(\)/.test(html)
    && /async function adoptAdmKey[\s\S]{0,700}tryBroadcastStage\(\)/.test(html));
  check('a new peer id tries the step-up', /myId = identity\.peerId;[\s\S]{0,160}tryBroadcastStage\(\)/.test(html));
}

// ---- Leave stops a share locally, then the clocks, after the farewell ----
{
  // Leave runs stopLocalCapture and releaseAudioContext, defined just above it.
  const src = between('    function stopLocalCapture() {', '    const leaveBtn = ');
  function load(extra, myStatus) {
    const calls = [];
    const leaveMeeting = new Function(
      'myStatus', 'stopScreenShare', 'stopSpeech', 'sendMeshLeave', 'localStream', 'peers', 'dropPeer', 'document',
      'recRec', 'recDraw', 'stopWhisper', 'whisperRescan', 'clearInterval', 'stopRoomClocks', 'calls',
      extra + '\n' + src + '\nreturn leaveMeeting;')(
      myStatus,
      () => calls.push('share'),
      () => calls.push('speech'),
      () => calls.push('bye'),
      { getTracks: () => [{ stop: () => calls.push('cam') }] },
      new Map([['p', {}]]),
      (id) => calls.push('drop:' + id),
      { getElementById: () => ({ style: {} }) },
      null, () => {}, () => {}, 0, () => {},
      () => calls.push('clocks'),
      calls);
    return { leaveMeeting: leaveMeeting, calls: calls, myStatus: myStatus };
  }
  const sharing = load(
    'let screenStream = { getTracks() { return [{ onended: null, stop() { calls.push("disp"); } }]; } };\nlet screenSteppedUp = true;',
    { scr: true, stg: 7 });
  let threw = false;
  try { sharing.leaveMeeting(); } catch (e) { threw = e; }
  check('Leave with a share does not throw', threw === false, threw && threw.message);
  check('Leave stops the display track before the farewell', sharing.calls.indexOf('disp') >= 0 && sharing.calls.indexOf('disp') < sharing.calls.indexOf('bye'), sharing.calls);
  check('Leave sends the farewell before it stops the clocks', sharing.calls.indexOf('bye') < sharing.calls.indexOf('clocks'), sharing.calls);
  check('Leave does not run the share teardown', sharing.calls.indexOf('share') < 0, sharing.calls);
  check('Leave clears the share flag and the stage flag the share raised', sharing.myStatus.scr === 0 && sharing.myStatus.stg === 0, sharing.myStatus);
  const plain = load('', { scr: false, stg: 0 });
  try { plain.leaveMeeting(); } catch (e) { threw = e; }
  check('Leave with no share still says goodbye and stops the clocks', plain.calls.indexOf('bye') >= 0 && plain.calls.indexOf('clocks') > plain.calls.indexOf('bye') && plain.calls.indexOf('share') < 0, plain.calls);
  check('Leave does not call stopScreenShare', !/stopScreenShare\s*\(/.test(src));
  check('stopScreenShare itself remains', html.indexOf('function stopScreenShare(why)') > 0);
  const clk = between('    function stopRoomClocks() {', '    function bgClock');
  check('stopRoomClocks terminates the worker and revokes its url', clk.indexOf('hbWorker.terminate()') >= 0 && clk.indexOf('URL.revokeObjectURL') >= 0);
  check('stopRoomClocks clears the fallback and the sentinel', clk.indexOf('clearInterval(hbFallback)') >= 0 && clk.indexOf('clearInterval(loopSentinel)') >= 0);
  check('closeRoomNoHost stops the clocks', /function closeRoomNoHost\(\) \{[\s\S]{0,500}stopRoomClocks\(\)/.test(html));
  check('the freeze detector still arms at load', html.indexOf('if (bgClock(SCALE.HB,') >= 0);
}

// ---- cap stays off the status pulse ----
{
  check('the status object has no cap key', !/\bcap\s*:\s*0/.test(html.slice(html.indexOf('const myStatus = {'), html.indexOf('const myStatus = {') + 220)));
  check('measureCap writes myCap and never myStatus.cap', html.indexOf('myCap = Math.max(1') > 0 && html.indexOf('myStatus.cap') < 0);
  check('capOf remains on the debug hook', html.indexOf('capOf: (id) => capOf(id)') > 0);
}

// ---- tile controls have names and a keyboard path ----
{
  check('the full-screen button has an accessible name', html.indexOf("maxbtn.setAttribute('aria-label', 'Full screen')") > 0);
  check('the vote button is born with a name', html.indexOf("voteBtn.setAttribute('aria-label', 'Vote')") > 0);
  check('updateTile refreshes the vote name', html.indexOf("t.voteBtn.setAttribute('aria-label', voteLabel)") > 0);
  check('moderation buttons are born with names',
    html.indexOf('aria-label="Mute for everyone"') > 0
    && html.indexOf('aria-label="Blur for everyone"') > 0
    && html.indexOf('aria-label="Allow apps & sharing"') > 0
    && html.indexOf('aria-label="Ban this device"') > 0);
  check('updateTile keeps the moderation name in step with the text', html.indexOf("setAttribute('aria-label', muteLabel)") > 0 && html.indexOf("setAttribute('aria-label', appLabel)") > 0);
  check('a focused tile shows its menu', html.indexOf('.tile:focus-within .modbar') > 0);
  check('filmstrip thumbs are buttons', html.indexOf("chip.setAttribute('role', 'button')") > 0 && html.indexOf('th.tabIndex = 0') > 0 && html.indexOf("e.key !== 'Enter' && e.key !== ' '") > 0);
}

// ---- guards that already landed (do not redo) ----
{
  const vote = between('    function castVote(id) {', "    document.getElementById('votebtn')");
  check('one vote retracts the opposite', vote.indexOf("myStageVotes[voteMode === 'up' ? 'down' : 'up'].delete(dev)") > 0);
  const react = between('    function reactStageVotes() {', '    let connBcastT');
  check('a vote-off dismisses the standing up tally', react.indexOf('vupDismissedSig = myUpVoteSig()') >= 0 && react.indexOf('vupDismissedSig = myUpVoteSig()') < react.indexOf('setStage(false)'));
  check('a down majority blocks the up path', react.indexOf('!votedDown') > 0);
  const lost = between('    function reactStageLost() {', '    function setStage');
  check('an excluded step-up waits two beats', lost.indexOf('2 * SCALE.HB') > 0);
  check('stageIdsNow holds a late hidden beat', /const stageIdsNow = \(\) => \{[\s\S]{0,900}stHold\(id\)/.test(html));
  check('handQueue holds a late hidden beat', /function handQueue\(\) \{[\s\S]{0,900}stHold\(pid\)/.test(html));
  check('stage votes hold a late hidden beat', html.indexOf('if (!stHold(pid)) continue;') > 0);
  check('takeMod returns before a second verify', /function takeMod\(from, msg\) \{[\s\S]{0,450}if \(seen\) \{[\s\S]{0,240}return;/.test(html));
  check('confirmGone deletes the departed target', (() => { const a = html.indexOf('function confirmGone(pid, why) {'); const e = html.indexOf('\n    }\n', a); const b = html.indexOf('delete modTable[pid]', a); return a > 0 && b > a && b < e; })());
  check('mergeMod leaves a buried target buried', /target !== '\*' && meshGone\.has\(target\)/.test(html));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
