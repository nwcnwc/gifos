// meet-app-stop.js — a room stop must not resurrect the stopper's older ad.
//
// The outbid host withdraws on the coalesced room pass, up to
// REACT_COALESCE_MS after the newer ad arrives. appWinner() is findSharedApp
// and updates in takeStatus, so a stop can run while myStatus.app still
// carries the share that already lost. The stop names only the current
// winner. If that is the only tombstone, the next reconcile elects the
// older ad and the room's app comes back. stopRoomApp tombstones the
// stopper's other sid in the same act. A later re-share still wins: runApp
// stamps ts above the tombstone.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!cond) failures++;
}

const start = html.indexOf('    function stopRoomApp(ad) {');
const end = html.indexOf('    function findSharedApp() {');
const fn = start > 0 && end > start ? html.slice(start, end) : '';
check('stopRoomApp is where the lift expects it', !!fn);

const tomb = fn.indexOf('appStops.set(ad.s, { at, by: myName() });');
const mine = fn.indexOf("myStatus.app.s !== ad.s");
const setMine = fn.indexOf('appStops.set(myStatus.app.s, { at: mineAt, by: myName() });');
const recon = fn.indexOf('reconcileApp();');
check('the winner is tombstoned, then my other sid, then reconcile',
  tomb > 0 && mine > tomb && setMine > mine && recon > setMine);

// The election the tombstone exists to close. Same rule as findSharedApp:
// an ad whose ts is <= its tombstone is gone; the newest remaining ad wins.
function elect(mine, winner, stops) {
  const consider = (ad) => {
    if (!ad || !ad.s) return null;
    const stop = stops.get(ad.s);
    if (stop && (ad.ts || 0) <= stop.at) return null;
    return ad;
  };
  const a = consider(mine), b = consider(winner);
  if (!a) return b;
  if (!b) return a;
  return (a.ts || 0) >= (b.ts || 0) ? a : b;
}
function roomStop(mine, winner) {
  const at = 5000;
  const stops = new Map();
  stops.set(winner.s, { at });
  if (mine && mine.s && mine.s !== winner.s) {
    const mineAt = Math.max(at, mine.ts || 0);
    stops.set(mine.s, { at: mineAt });
  }
  return { stops, left: elect(mine, winner, stops) };
}

const older = { s: 'mine', ts: 1000 };
const newer = { s: 'guest', ts: 4000 };
const fixed = roomStop(older, newer);
check('stopping the guest share also retires my older ad', fixed.left === null);
const onlyWinner = new Map([['guest', { at: 5000 }]]);
check('without the second tombstone my older ad is elected again',
  elect(older, newer, onlyWinner) && elect(older, newer, onlyWinner).s === 'mine');
const again = { s: 'mine', ts: (fixed.stops.get('mine').at || 0) + 1 };
check('a later re-share of my sid beats the tombstone', elect(again, null, fixed.stops) && elect(again, null, fixed.stops).s === 'mine');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
process.exit(failures ? 1 : 0);
