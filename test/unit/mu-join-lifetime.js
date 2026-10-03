// Join-lifetime guards. The meeting page is one script, so the pure
// decisions are lifted out of site/run.html and run here. A browser suite
// is not started.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../../site/run.html'), 'utf8');
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : ''));
  if (!c) failures++;
};

function extractFn(name) {
  const key = 'function ' + name + '(';
  const i = src.indexOf(key);
  if (i < 0) throw new Error('missing ' + name);
  if (src.indexOf(key, i + key.length) >= 0) throw new Error('dup ' + name);
  let depth = 0;
  const k0 = src.indexOf('{', i);
  for (let j = k0; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}
function lift(name) {
  return vm.runInNewContext('(' + extractFn(name) + ')', {});
}

const nameInitial = lift('nameInitial');
const emoji = String.fromCodePoint(0x1F600);
check('avatar initial keeps an emoji', nameInitial(emoji + 'Bob') === emoji, nameInitial(emoji + 'Bob'));
check('avatar initial of a letter is uppercase', nameInitial('ab') === 'A');
check('empty name initial is a bullet', nameInitial('') === '\u2022');

const mobileDevice = lift('mobileDevice');
check('iPadOS Safari Macintosh UA with touch points is mobile',
  mobileDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }) === true);
check('a desktop Mac with no touch points is not mobile',
  mobileDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }) === false);
check('Android stays mobile',
  mobileDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }) === true);

const frozeThisBeat = lift('frozeThisBeat');
check('a real freeze gaps both clocks', frozeThisBeat(200000, 200000, 2) === true);
check('a forward clock step is not a freeze', frozeThisBeat(200000, 4000, 2) === false);
check('an empty room does not reload', frozeThisBeat(200000, 200000, 0) === false);
check('a short gap does not reload', frozeThisBeat(100000, 100000, 2) === false);

const drainStep = lift('drainStep');
const st = { tier: 0, last: null, falls: 0, trip: null };
check('the first charging sample does not trip', drainStep(st, true, 0.80) === false && st.tier === 0);
check('one fall does not trip', drainStep(st, true, 0.79) === false && st.falls === 1 && st.tier === 0);
check('a rise clears the fall count', drainStep(st, true, 0.80) === false && st.falls === 0);
drainStep(st, true, 0.79);
check('a second fall trips the emergency tier', drainStep(st, true, 0.78) === true && st.tier === 3 && st.trip === 0.78);
check('a rise above the trip clears it', drainStep(st, true, 0.79) === false && st.tier === 0);
drainStep(st, true, 0.70);
drainStep(st, true, 0.69);
check('unplugging clears the charger tier', drainStep(st, false, 0.60) === false && st.tier === 0 && st.falls === 0);

const constraintDue = lift('constraintDue');
const track = { id: 'cam' };
const q = { t: null, k: '', failK: '', failedAt: 0 };
check('a new rung is due', constraintDue(q, track, '180x320@15', 1000) === true);
q.t = track; q.k = '180x320@15'; q.failK = '';
check('the same successful ask is not repeated', constraintDue(q, track, '180x320@15', 5000) === false);
q.failK = '180x320@15'; q.failedAt = 5000;
check('a rejection backs off for 30s', constraintDue(q, track, '180x320@15', 5000 + 29999) === false);
check('the backoff ends at 30s', constraintDue(q, track, '180x320@15', 5000 + 30000) === true);
check('a rung change retries during the backoff', constraintDue(q, track, '320x180@30', 6000) === true);

const fwdSeenNote = lift('fwdSeenNote');
{
  const map = new Map();
  for (let i = 0; i < 600; i++) map.set('o' + i, 1);
  fwdSeenNote(map, 'n0', 1000000);
  check('one insert drops at most 32 stale fwdSeen entries', map.size === 569 && map.has('n0'), map.size);
}
{
  const map = new Map();
  const t0 = Date.now();
  for (let i = 0; i < 10000; i++) fwdSeenNote(map, 'id' + i, 5000000);
  const ms = Date.now() - t0;
  check('a 10000-id storm stays at the cap', map.size === 4096 && map.has('id9999') && !map.has('id0'), { size: map.size, ms });
  check('that storm finishes quickly', ms < 50, ms);
}

const refreshGifosCurrent = vm.runInNewContext('(' + extractFn('refreshGifosCurrent') + ')', {
  fetch: (url, opts) => {
    refreshGifosCurrent.calls.push({ url, opts });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ current: '0.9.99' }) });
  },
  localStorage: { setItem: (k, v) => { refreshGifosCurrent.store[k] = String(v); } },
});
refreshGifosCurrent.calls = [];
refreshGifosCurrent.store = {};
refreshGifosCurrent();
setTimeout(() => {
  check('refreshGifosCurrent reads version.json with no-store',
    refreshGifosCurrent.calls.length === 1 && refreshGifosCurrent.calls[0].url === '/version.json' && refreshGifosCurrent.calls[0].opts.cache === 'no-store');
  check('refreshGifosCurrent stores a release number', refreshGifosCurrent.store.gifos_current === '0.9.99');

  const bad = vm.runInNewContext('(' + extractFn('refreshGifosCurrent') + ')', {
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ current: 'edge' }) }),
    localStorage: { setItem: (k, v) => { bad.store[k] = String(v); } },
  });
  bad.store = {};
  bad();
  setTimeout(() => {
    check('a non-release current is not stored', !bad.store.gifos_current);

    const pinAt = src.indexOf('function pinTarget');
    const pinEnd = src.indexOf('window.gifosPinTarget');
    const pinBody = src.slice(pinAt, pinEnd);
    check('the fast path still redirects on gifos_current', pinBody.indexOf('if (cur) return to(cur);') >= 0);
    const after = src.slice(pinEnd);
    check('the loader refreshes gifos_current after the decision',
      after.indexOf("fetch('/version.json', { cache: 'no-store' })") >= 0 && after.indexOf("localStorage.setItem('gifos_current'") >= 0);

    function bodyOf(name) {
      return extractFn(name);
    }
    const close = bodyOf('closeRoomNoHost');
    check('closeRoomNoHost stops capture and sends the mesh leave',
      close.indexOf('stopLocalCapture') >= 0 && close.indexOf('sendMeshLeave') >= 0 && close.indexOf('releaseAudioContext') >= 0);
    const stop = bodyOf('stopLocalCapture');
    check('stopLocalCapture stops the share, speech, wake lock, and camera idle timer',
      stop.indexOf('stopScreenShare') >= 0 && stop.indexOf('stopSpeech') >= 0 && stop.indexOf('wakeLock') >= 0 && stop.indexOf('camIdleT') >= 0 && stop.indexOf('recRec.stop') >= 0);
    check('leaveMeeting uses the same capture stop', bodyOf('leaveMeeting').indexOf('stopLocalCapture') >= 0);

    check('dropPeer releases the meter', src.indexOf('releaseMeter(peerId)') >= 0);
    check('a gone pid leaves the starve maps',
      src.indexOf('pidFirstSeen.delete(pid); meshRxByPid.delete(pid); tlFiredPid.delete(pid); speakingOf.delete(pid);') >= 0);
    check('the starve sweep uses a roster set', src.indexOf('const rosterSet = new Set(rosterIds);') >= 0 && src.indexOf('rosterSet.has(pid)') >= 0);
    check('updateStatus does not count an unused live total', src.indexOf('const live = Array.from(peers.values()).filter((p) => p.connected).length;') < 0);
    check('updateStatus writes the status text only when it changes', src.indexOf('if (statusEl.textContent !== nextStatus) statusEl.textContent = nextStatus;') >= 0);
    check('the empty app room link opens in a new tab', src.indexOf('<a class="aw-home" href="/" target="_blank" rel="noopener">') >= 0);
    check('the filmstrip and the relay chip share displayName',
      src.indexOf('label: displayName(pid)') >= 0 && src.indexOf('esc(displayName(t.relayed))') >= 0);
    check('tile and learn avatars use nameInitial',
      src.indexOf('avatar.textContent = nameInitial(name)') >= 0 && src.split('nameInitial(nm)').length === 3);
    check('the join veil does not promise a 200s seat', src.indexOf('be seated within') < 0 && src.indexOf('Finding you a seat') >= 0);
    check('the join veil is a live status', src.indexOf('role="status" aria-live="polite"') >= 0);
    check('the fwdSeen full scan is gone', src.indexOf('for (const [k, at] of fwdSeen)') < 0);

    console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
    process.exit(failures === 0 ? 0 : 1);
  }, 20);
}, 20);
