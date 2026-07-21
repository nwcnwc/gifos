// q5-designation.js — small-N H-CHAIN designation audit (healing-laws H-CHAIN).
//
// Exhaustively, for every occupancy pattern of a single C-seat row (C=5 → 2^5
// masks), and for every hole that needs a row-clique healer / admitter
// devolution, assert:
//   - if ANY live seat exists that first-hand-witnesses the hole (same row,
//     right of a left-pack hole, or the devolved-admitter walk), the chain
//     names exactly ONE designee (the first occupied seat in the fixed order);
//   - we never "guess" a designee outside the row clique;
//   - an empty row has no designee (E1 / drain is correct).
//
// This is the Q5 standing-guard: a reachable hole with no first-hand-confirming
// designee must STOP the ship — the audit fails loudly.
//
// Pure Node, no browser. Usage: node test/mesh/q5-designation.js
'use strict';
const C = 5;
let fail = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + d + ')' : ''));
  if (!c) fail++;
};

// Left-pack / H-CHAIN heal designee for hole at column h in a row occupancy
// mask (bit i set ⇒ column i occupied). Returns column of designee or -1.
function healDesignee(mask, h) {
  if (mask & (1 << h)) return -1; // not a hole
  // fixed order: right-neighbour, then remaining rightward ascending
  for (let j = h + 1; j < C; j++) if (mask & (1 << j)) return j;
  return -1; // no row-clique designee — E1/drain territory if also no vertical
}

// Admission devolution: designated admitter for cell j is head (0) when j>0;
// when head vacated, walk col 1…C-1 for first occupied. (Head cell itself is
// never an admission target while the row is live — C1.)
function admitDesignee(mask, j) {
  if (j === 0) return -1; // head hole is healer's, not admission
  if (mask & (1 << j)) return -1; // occupied
  if (mask & (1 << 0)) return 0; // head is primary admitter
  for (let dj = 1; dj < C; dj++) if (mask & (1 << dj)) return dj;
  return -1;
}

// ---- exhaustive row patterns ----
let healCases = 0, healNamed = 0, healNone = 0;
let admitCases = 0, admitNamed = 0, admitNone = 0;
let badGuess = 0;

for (let mask = 0; mask < (1 << C); mask++) {
  const live = [];
  for (let i = 0; i < C; i++) if (mask & (1 << i)) live.push(i);
  for (let h = 0; h < C; h++) {
    if (mask & (1 << h)) continue;
    healCases++;
    const d = healDesignee(mask, h);
    if (d < 0) {
      healNone++;
      // must mean nobody to the right is live
      const rightLive = live.some((i) => i > h);
      if (rightLive) { badGuess++; console.log('  BAD heal miss mask=' + mask.toString(2) + ' hole=' + h); }
    } else {
      healNamed++;
      if (d <= h || !(mask & (1 << d))) { badGuess++; console.log('  BAD heal designee mask=' + mask.toString(2) + ' hole=' + h + ' d=' + d); }
      // first occupied rightward only
      for (let j = h + 1; j < d; j++) if (mask & (1 << j)) { badGuess++; console.log('  BAD heal not-first mask=' + mask.toString(2)); }
    }
  }
  for (let j = 1; j < C; j++) {
    if (mask & (1 << j)) continue;
    admitCases++;
    const d = admitDesignee(mask, j);
    if (d < 0) {
      admitNone++;
      // empty chain only if whole row empty of admitters (no head, no col≥1 live)
      if (live.length) { badGuess++; console.log('  BAD admit miss mask=' + mask.toString(2) + ' cell=' + j + ' live=' + live); }
    } else {
      admitNamed++;
      if (!(mask & (1 << d))) { badGuess++; console.log('  BAD admit empty designee'); }
    }
  }
}

check('heal chain: no bad designee / no missed rightward live', badGuess === 0, 'bad=' + badGuess);
check('heal chain: some holes have a named designee', healNamed > 0, 'named=' + healNamed + ' none=' + healNone + ' cases=' + healCases);
check('admit chain: named when anyone live in row', admitNamed > 0 && badGuess === 0,
  'named=' + admitNamed + ' none=' + admitNone + ' cases=' + admitCases);

// Spot checks from the laws
check('empty row: no heal designee for hole 0', healDesignee(0, 0) === -1);
check('only col2 live: heals hole 0 and 1', healDesignee(0b00100, 0) === 2 && healDesignee(0b00100, 1) === 2);
check('head+col3: admit free col1 → head', admitDesignee(0b01001, 1) === 0);
check('col2+col3 only: admit free col1 → col2 (devolved)', admitDesignee(0b01100, 1) === 2);
check('full row: no free admit cell', admitDesignee(0b11111, 1) === -1 && admitDesignee(0b11111, 4) === -1);

console.log(fail ? '\n' + fail + ' FAILED — Q5 designation audit' : '\nALL PASS — Q5 row-clique designation chain is total on C=' + C);
process.exit(fail ? 1 : 0);
