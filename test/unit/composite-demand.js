/*
 * composite-demand.js — A COMPOSITE NOBODY SHIPS AND NOBODY LOOKS AT IS NOT
 * PAINTED.
 *
 * createPacker has carried `setActive` since the day it was written — its own
 * comment reads "demand-gated: a composite nobody ships or shows isn't painted
 * (static canvas ⇒ ~0 encode too)" — and for its whole life NOTHING CALLED IT.
 * An API that exists and is never invoked is indistinguishable from a feature
 * that works, which is precisely why this is a source scan and not a behaviour
 * test: the failure mode is textual (someone drops the gate, or adds a fourth
 * packer and forgets it) and nothing at runtime complains, it just costs a
 * phone a canvas paint + captureStream forever.
 *
 * The concrete waste it closes: prodPack is built the moment a seat is a head,
 * and a seat ALONE ON STAGE is a head — with an empty row, no up-link ship and
 * no stadium tile. It painted, captured and audio-folded for nobody.
 *
 * The gate's two authorities are also pinned here, because getting them wrong
 * is how a demand gate turns into a black tile:
 *   - mosJobs  — every ship is born there, and a PARKED standby still counts
 *                (its whole job is to be able to wake carrying live pixels).
 *   - compOf   — every painted composite registers there (it is also what the
 *                recorder reads).
 */
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-media.js');
const fs = require('fs');
const path = require('path');
const M = globalThis.GifOS.meshMedia;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

// ---- the primitive ---------------------------------------------------------
const pk = M.createPacker({ shape: 'grid' });
check('createPacker exposes setActive', typeof pk.setActive === 'function');
check('a packer is born ACTIVE (the gate may only ever take demand AWAY)',
  pk.stats().active === true, pk.stats().active);
pk.setActive(false);
check('setActive(false) is visible to a harness', pk.stats().active === false);
pk.setActive(true);
check('setActive(true) restores it', pk.stats().active === true);

// ---- run.html actually calls it --------------------------------------------
const RUN = fs.readFileSync(path.join(__dirname, '../../site/run.html'), 'utf8');

check('reconcileMosaic gates its packers (setActive is CALLED, not merely available)',
  /pk\.setActive\(/.test(RUN) && /gatePack\(/.test(RUN));

// EVERY packer run.html owns must pass through the gate. If a fifth is added,
// this fails until it is listed — which is the whole point.
const gateLine = RUN.match(/gatePack\(prodPack\)[\s\S]{0,160}/); // a fixed window: the calls sit together, one clause per packer
check('every packer run.html owns is gated', !!gateLine
  && /prodPack/.test(gateLine[0]) && /sdPack/.test(gateLine[0])
  && /stripPack/.test(gateLine[0]) && /sdnPacks/.test(gateLine[0]),
  gateLine ? gateLine[0].replace(/\s+/g, ' ').slice(0, 160) : null);
const owned = (RUN.match(/= MM\.createPacker\(/g) || []).length;
check('…and there are exactly the four packer birth sites the gate lists',
  owned === 4, { birthSites: owned });

// DEMAND IS READ FROM THE AUTHORITIES, NEVER GUESSED. A hand-maintained list of
// "who consumes what" is the shape that rots; mosJobs + compOf are rebuilt by
// the same sweep that ships and paints.
check('shipped-ness comes from mosJobs\' own source tracks',
  /for \(const job of mosJobs\.values\(\)\) for \(const t of job\.srcTracks\)/.test(RUN));
check('painted-ness comes from compOf\'s registered stream ids',
  /for \(const cv of compOf\.values\(\)\) if \(cv\.streamId\)/.test(RUN));
// A parked standby MUST keep its producer painting — it is claimed, negotiated
// and one control frame away from carrying the room's picture.
check('the gate does not read job.active (a PARKED standby still counts as demand)',
  !/shippedTracks[\s\S]{0,200}job\.active/.test(RUN));

// The gate runs AFTER the sweep's ships, so a pack shipped this sweep is awake
// this sweep — never one sweep of black.
const reap = RUN.indexOf('DEBOUNCED UNSHIP');
const gate = RUN.indexOf('DEMAND GATE');
check('the gate runs after the sweep has shipped and painted', reap > 0 && gate > reap);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
