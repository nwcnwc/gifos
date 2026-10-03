// room-flood-laws.js — THE SHORTCUTS THAT BRING THE N×N FLOOD BACK, pinned.
//
// GifOS meets are P2P so that nothing a phone pays grows with the room. The
// status plane (docs/status-plane-migration.md, healing-laws § G) took the
// last per-node O(N) cost off the meeting path on 2026-09-28/29, and each
// piece of it is exactly the kind of thing a later change can quietly undo
// while every small-room test stays green:
//
//   1. the heartbeat goes to the SECTION, on its own frame type ('GSPS');
//   2. a status is never taken off the room-wide flood (Rule 1);
//   3. a receiver never re-broadcasts a chat line, caption, file notice or
//      deletion to the room (one message is one flood);
//   4. every seat budgets what a link, and an author on it, may hand it;
//   5. gossip is signed by its author, and the mesh forwards nothing the app
//      refused or the wire could not verify;
//   6. the digest is on by default, and the digests nobody echoes go as stubs.
//
// The browser and harness suites (test/browser/e2e-status-plane.js,
// test/mesh/status-plane.js) prove each of these BEHAVES. This file pins that
// each still EXISTS in the source, in a form a diff reviewer would recognise,
// so deleting one cannot pass the unit tier in silence. It reads the files as
// text on purpose: it is a tripwire, not a parser. Pure Node, sub-second.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const run = read('site/run.html'), mesh = read('site/js/mesh.js'), wire = read('site/js/mesh-wire.js'), ident = read('site/js/mesh-identity.js');
let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const has = (s, re) => (re instanceof RegExp ? re.test(s) : s.indexOf(re) >= 0);

// 1. the heartbeat is section-scoped, ephemeral, on its own frame type
const hb = run.slice(run.indexOf('function broadcastStatus'), run.indexOf('function pushLeaf'));
check('broadcastStatus fans the heartbeat out with { scope: \'section\', ephemeral: true }', has(hb, /fanOut\(payload,[\s\S]*scope: 'section', ephemeral: true/));
check('nothing in broadcastStatus fans a status out room-wide unconditionally', !has(hb, /fanOut\(payload\)/) && !has(hb, /fanOut\(payload, [^,)]+\)\s*;/));
check('a scoped message rides its own frame type (GSPS), never a field on GSP', has(mesh, "e.sc !== undefined ? 'GSPS' : 'GSP'") && has(mesh, "const scoped = m.t === 'GSPS'"));
check("recv() dispatches 'GSPS' as gossip", has(mesh, "case 'GSP': case 'GSPS': this._gspRecv(m)"));

// 2. Rule 1
check('Rule 1: run.html refuses a status that arrives off the room-wide flood', has(run, /g\.msg\.kind === 'status' && !scoped && digestMode\(\)[\s\S]{0,120}return false/));
check('…and the mesh forwards nothing the app refused', has(mesh, /ok === false\)[\s\S]{0,80}return; \} \}/) && has(mesh, 'gspRefused'));

// 3. one message is one flood
const onRemote = run.slice(run.indexOf('function onRemote'), run.indexOf("} else if (m.k === 'sig')"));
const rebroadcasts = (onRemote.match(/sendAll\(\{ k: '(chat|tr|fmeta|fdel|cdel)'/g) || []).filter((x) => !/k: 'hi'/.test(x));
const hiMerge = onRemote.slice(onRemote.indexOf("m.k === 'hi'"), onRemote.indexOf("} else if (m.k === 'chat')"));
const hiSends = (hiMerge.match(/sendAll\(|fanOut\(/g) || []).length;
check('a receiver never re-broadcasts a chat line, caption, file notice or deletion to the room', rebroadcasts.length === 0, { rebroadcasts: rebroadcasts.length });
// The 'hi' merge once re-flooded every line it learned (a newcomer's first
// 'hi' is ALL news: up to 800 room-wide floods per join, O(history × N)).
// What was news is handed on over my own open channels, once, like fmeta.
check('the hi merge originates no room-wide flood (history rides the pair, not the room)', hiSends === 0, { hiSends });
check('…and hands what was news on over my OWN links only, as one hi frame (dcSend), the source excluded', has(hiMerge, /q !== p && q\.dc && q\.dc\.readyState === 'open'\) dcSend\(q, \{ k: 'hi', chats: freshChats, trs: freshTrs \}\)/));
check('…and the replay is taken as backfill, past the live per-author limiter', has(hiMerge, 'takeChat(c, true)') && has(hiMerge, 'takeTr(l, true)') && has(run, /function takeChat\(m, backfill\)[\s\S]{0,200}if \(!backfill && m\.byId !== myId && !chatRateOk\(m\.byId\)\) return false;/) && has(run, /function takeTr\(m, backfill\)[\s\S]{0,300}if \(!backfill && writer !== myId && !chatRateOk\('tr:' \+ writer\)\) return false;/));
check('a file notice is handed on over my OWN links only (dcSend), never fanned out', has(onRemote, /takeMeta\(m\.f, p\)\) \{[^\n]*dcSend\(q, \{ k: 'fmeta'/) && !has(onRemote, "sendAll({ k: 'fmeta'"));

// 4. the flood guard
const rate = +(mesh.match(/const GSP_RATE = (\d+)/) || [])[1], burst = +(mesh.match(/GSP_BURST = (\d+)/) || [])[1];
const srate = +(mesh.match(/const GSP_SRC_RATE = (\d+)/) || [])[1], sburst = +(mesh.match(/GSP_SRC_BURST = (\d+)/) || [])[1];
check('the per-link budget exists and is small (rate ' + rate + '/tick, burst ' + burst + ')', rate > 0 && rate <= 20 && burst > 0 && burst <= 400, { rate, burst });
check('the per-author budget exists and is smaller (rate ' + srate + '/tick, burst ' + sburst + ')', srate > 0 && srate <= rate && sburst > 0 && sburst <= burst, { srate, sburst });
check('_gspRecv spends the budget before a message is seen or forwarded', has(mesh, /if \(!this\._gspBudget\(m\.from, m\.src\)\) \{[^\n]*return; \}\n\s*g\.set\(m\.gid/));
check('the guard has no production off switch (env.GSP_GUARD === false is the harness control only)', (mesh.match(/GSP_GUARD/g) || []).length === 2 && !has(run, 'GSP_GUARD') && !has(wire, 'GSP_GUARD'));

// 5. signed gossip
check('the wire signs the gossip I author and refuses to send unsigned gossip', has(wire, /ident\.GOSSIP_T\.has\(m\.t\) && !m\.s4\) \{\n\s*if \(m\.src !== seat\.id\) return;/));
check('the wire verifies every gossip frame before the seat sees it, and drops the rest', has(wire, 'ident.verifyGossip(seat.pins, m)') && has(wire, 'gspForged'));
check('the mesh takes no unverified gossip under S4', has(mesh, 'if (this.s4 && !m.s4ok) return;'));
check('the signed statement binds the author, the frame id, the scope and the payload hash', has(ident, /gid: String\(m\.gid\), from, sc: [^,]+, ph, ts/) && has(ident, 'from !== m.src'));
check('S4 has no off switch', has(wire, 'const s4on = true;'));

// 6. the digest is on and its wire form is thin
check('the digest is ON by default (GIFOS_DIGEST === false opts out)', has(wire, 'DIGEST: !(typeof root !== \'undefined\' && root.GIFOS_DIGEST === false)') && has(run, "window.GIFOS_DIGEST === false) && !!meshNode"));
check('unechoed digests go as stubs (PONG root, S1SYNC table, rook section digests)', has(mesh, "this.stubFor(m.id, 'root'") && has(mesh, "this.stubFor(t, 's1:' + e.k") && has(mesh, "this.stubFor(tid, 'up'"));
check("G4's subjects are never stubbed (dgPub / dgEcho are pubDig, whole)", has(mesh, 'pong.dgPub = this.pubDig(') && !has(mesh, "stubFor(m.id, 'pub'") && !has(mesh, "stubFor(m.id, 'echo'"));

// 7. and the suites that prove the behaviour are still in the gate's globs
for (const f of ['test/browser/e2e-status-plane.js', 'test/browser/e2e-status-plane-admin.js', 'test/mesh/status-plane.js', 'test/mesh/digest.js', 'test/mesh/claim-birth-tie.js']) check('gate suite present: ' + f, fs.existsSync(path.join(R, f)));
check('e2e-status-plane still carries its tripwire leg (a quiet room originates no room-wide flood)', has(read('test/browser/e2e-status-plane.js'), 'QUIET ROOM, 20 s: no seat originated a room-wide flood'));
check('…and its one-message-one-flood leg', has(read('test/browser/e2e-status-plane.js'), 'nobody re-broadcast it'));
check('status-plane.js still has the flood-guard and forgery legs with their negative controls', has(read('test/mesh/status-plane.js'), 'control, guard OFF') && has(read('test/mesh/status-plane.js'), 'control, unsigned wire'));

// 7. the sga pull-through forgets (2026-10-03). A neighbour's ask registers it
// as a waiter; the chase ran "while wanted", and nothing but a served frame
// or the owner's own drop ever removed a waiter — so an ask for an app whose
// owner left before the bytes spread, or from an asker who then left, chased
// every open channel every 5 s for the rest of the meeting, each receiver
// chasing in turn. A waiter now ages out, leaves with its peer, and a sid no
// one advertises is not wanted at all.
check('a waiter entry ages out (SGA_WANT_TTL) — an asker refreshes it with every ask', /SGA_WANT_TTL\s*=\s*\d+/.test(run) && /function sgaWanters/.test(run));
check('dropPeer forgets the departed peer in every sga want map', /function dropPeer[\s\S]{0,2500}sgaForgetWaiter\(peerId\)/.test(run));
check('a pull-through chase ends when no one advertises the sid (sgaAdvertised)', /function sgaAdvertised\(sid\)/.test(run) && /sgaWanters\(sgaAppWant, sid\)[\s\S]{0,80}sgaAdvertised\(sid\)/.test(run) && /sgaWanters\(sgaWant, sid\)[\s\S]{0,80}sgaAdvertised\(sid\)/.test(run));
check('a neighbour asking for a sid no one advertises is not registered as a waiter', /function sgaAppServe[\s\S]{0,300}sgaAdvertised\(m\.sid\)/.test(run) && /function sgaServe[\s\S]{0,300}sgaAdvertised\(m\.sid\)/.test(run));

console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
