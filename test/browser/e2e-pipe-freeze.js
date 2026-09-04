// e2e-pipe-freeze.js — THE STG BRIGHT-FREEZE SHAPE, on its own, on the fleet.
//
// This is leg 3 of e2e-pipe-mesh.js in a file of its own, because the gate
// discovers FILES and quarantines FILES: on the 0.9.14 cut the freeze guard
// was red 2 of 3 on a real four-box fleet while the other sixteen checks in
// that file were green 3 of 3, and quarantining the file to ship the cut took
// the sixteen out of the gate with it. Now e2e-pipe-mesh.js scores legs 1-2
// and this file builds the same six-seat room, reports legs 1-2 as setup, and
// scores only the freeze detector (test/batteries/quarantine.txt carries the
// entry, with the rate, until the freeze is fixed).
//
// Needs the fleet (needFleet 2), the orchestrator's stack on 0.0.0.0, and
// everything e2e-pipe-mesh.js needs; see its header.
process.env.PIPE_LEG = 'freeze';
require('./e2e-pipe-mesh.js');
