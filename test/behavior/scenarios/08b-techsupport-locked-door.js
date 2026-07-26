'use strict';
// USE CASE 8 — family tech support. Pattern (b): the locked door fumble.
// Rosa locks the room (keeper). Gigi arrives with the WRONG password twice —
// each bounce must re-present the door (never a fake empty room, never a
// founding) — then gets it right and joins.
const { scenario } = require('../lib/cast');

const PW = 'grandkids2026';
scenario('08b-techsupport-locked-door', {
  rosa: { profile: 'phone', ensurePass: PW }, // joins open, LOCKS the room
  kai: { profile: 'desktop', pass: PW },
  gigi: { profile: 'phone' },
}, async (cast, check) => {
  const gigi = cast.get('gigi');
  await cast.get('rosa').join(cast.room);
  check.assert(await cast.get('rosa').waitSeat(60), 'Rosa founds');
  await check.until('the keeper locks the room', async () =>
    (await cast.get('rosa').eval("localStorage.getItem('gifos_vpw_' + '" + cast.room + "') || ''")) === PW, { within: 30 });

  await cast.get('kai').join(cast.room);
  check.assert(await cast.get('kai').waitSeat(60), 'Kai joins through the locked door with the right password');

  // Gigi fumbles: wrong password → the DOOR, not a fake room, not a fork
  await gigi.join(cast.room, { pass: 'grandkids2025' });
  const seatedWrong = await gigi.waitSeat(25);
  check.assert(!seatedWrong, 'the wrong password never seats her');
  const mode = await gigi.eval("(() => { const m = document.getElementById('pw-modal'); return m && m.style.display !== 'none' ? (m.dataset.mode || 'shown') : 'hidden'; })()");
  check.assert(mode === 'join' || mode === 'shown', 'the door is re-presented after the bounce (honest, not empty)', 'modal=' + mode);
  const sg = await gigi.state();
  check.assert(!sg.coord, 'the bounce founded NOTHING (no solo fragment)', 'coord=' + sg.coord);

  // third time's the charm
  await gigi.join(cast.room, { pass: PW });
  check.assert(await gigi.waitSeat(60), 'the right password seats Gigi');
  await check.converged(3, { desc: 'all three inside the locked room' });
  await check.oneTree(3, { via: 'rosa' });
});
