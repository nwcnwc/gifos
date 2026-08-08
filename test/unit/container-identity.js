// container-identity.js — THE CONTAINER-IDENTITY LAW (2026-08-08), pinned in
// source. A (key,to) ship job's announced container id is minted ONCE per
// page life; a source change RECONCILES tracks in place instead of tearing
// down and re-minting. This is the sender-side campaign the FAILOVER-WAKE
// graveyard entry names, and it retires four measured failure classes at
// once: the reship storm (every carrier re-shipping a NEW container id when
// its source changes — ~6s room renegotiation after a kill), the zombie
// parked pipe (a demand-wake aimed at a pre-reship sid is silently ignored
// by the mx-want sid check), the stage-onerow ONE-stream-id red, and the
// stage-voice 20.23s claim drop (the idle-stop re-mint racing the 5s grace).
//
// Why source scans: every one of these fails SILENTLY and only in a live
// room under churn — a refactor that quietly re-minted containers would
// pass syntax, pass most single-run suites, and put all four classes back.
// Each check below is written so that REVERTING the law breaks it.
const fs = require('fs');
const path = require('path');
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

const RUN = fs.readFileSync(path.join(__dirname, '../../site/run.html'), 'utf8');
const SRC = fs.readFileSync(path.join(__dirname, '../../site/js/mesh-pipe.js'), 'utf8');

// ---- the registry: one container per job key, forever ----------------------
check('the forever-container registry exists and fresh ships draw from it',
  /const shipContainers = new Map\(\)/.test(RUN)
  && /shipContainers\.get\(jk\) \|\| new MediaStream\(\)/.test(RUN)
  && /shipContainers\.set\(jk, container\)/.test(RUN));
// The ONLY MediaStream mint in the whole ship path is the registry fallback:
// count the mints in the mosaic block (shipContainers decl .. unshipMos).
check('shipMos mints no container outside the registry fallback', (() => {
  const a = RUN.indexOf('const shipContainers'), b = RUN.indexOf('function unshipMos');
  if (a < 0 || b < 0 || b < a) return false;
  const mints = (RUN.slice(a, b).match(/new MediaStream\(/g) || []).length;
  return mints === 1;
})());
check('unshipMos keeps the container (re-ship of the same job re-announces the same sid)', (() => {
  const a = RUN.indexOf('function unshipMos');
  return a > 0 && !/shipContainers\.delete/.test(RUN.slice(a, a + 2200));
})());
check('the registry is reaped only for DEPARTED peers (bounded by churn)',
  /if \(mosJobs\.has\(cjk\)\) continue;/.test(RUN)
  && /if \(!peers\.has\(cjk\.slice\(cjk\.lastIndexOf\('>'\) \+ 1\)\)\) shipContainers\.delete\(cjk\)/.test(RUN));

// ---- identity is the TRACK SET, and a change reconciles in place -----------
check('job identity is the track set, not the source stream id',
  /const sameSet = !!\(cur && cur\.srcTracks && cur\.srcTracks\.length === want\.length/.test(RUN)
  && /if \(cur && sameSet && !orphaned\)/.test(RUN));
check('a same-kind swap is a pure replaceTrack (invisible downstream)',
  /if \(cur\.active\) \{ try \{ cur\.senders\[i\]\.replaceTrack\(nt\); \} catch \(e\) \{\} \}/.test(RUN));
check('a piped slot re-routes at the worker — sender, carrier and m-line never move',
  /MPipe\.reroute\(jk, pj\.srcId, srcId\)/.test(RUN));
check('a kind appearing/vanishing changes ONE m-line inside the SAME container',
  /function mosAttach\(job, jk, p, tr\)/.test(RUN)
  && /addAux\(p\.pc, carrier\.track, job\.container\)/.test(RUN)
  && /addAux\(p\.pc, tr, job\.container\)/.test(RUN)
  && /function mosDetach\(job, jk, p, idx\)/.test(RUN));
check('the reconcile records itself in __mosReship with kept:true + ops (forensics stay honest)',
  /why: 'sig-change', kept: true, ops: ops\.join\(','\)/.test(RUN));

// ---- a husk is not a candidate ----------------------------------------------
check('a trackless job keeps the sid but stops announcing after the grace (husk-cycle breaker)',
  /if \(!cur\.tracklessAt\) cur\.tracklessAt = Date\.now\(\)/.test(RUN)
  && /Date\.now\(\) - cur\.tracklessAt < MOS_GRACE/.test(RUN)
  && /cur\.tracklessAt = 0;/.test(RUN));

// ---- the receiver side follows the object, keeps the claim -----------------
check('ontrack replaces a same-id corpse in p.incoming, never accumulates',
  /const dup = p\.incoming\.findIndex\(\(s\) => s\.id === stream\.id\)/.test(RUN)
  && /if \(dup >= 0\) p\.incoming\.splice\(dup, 1\)/.test(RUN));
check('a held claim re-binds to a NEW same-sid stream object (redundant + structural)',
  /if \(own\.st && own\.st !== pri\.stream\)/.test(RUN)
  && /if \(st2 && cur\.stream !== st2\)/.test(RUN));

// ---- the worker half --------------------------------------------------------
check('the worker reroute op restarts clean at the next key, never mid-GOP',
  /m\.op === 'reroute'/.test(SRC)
  && /p\.srcId = m\.srcId; p\.q\.length = 0; p\.needKey = true;/.test(SRC));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
