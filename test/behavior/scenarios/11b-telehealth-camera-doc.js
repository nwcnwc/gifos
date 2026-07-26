'use strict';
// USE CASE 11 — the telehealth consult. Pattern (b): the camera as instrument.
// Ren turns the camera off to talk, on to show the rash, off again — three
// cycles with >25s off-gaps. The 20s idle-stop must release the sensor each
// time; the regrab must work EVERY cycle; the far side must track each flip.
const { scenario } = require('../lib/cast');

scenario('11b-telehealth-camera-doc', {
  osei: { profile: 'desktop' },
  ren: { profile: 'phone', battery: '0.5' },
}, async (cast, check) => {
  const ren = cast.get('ren');
  await cast.joinAll();
  await check.converged(2);

  for (let cycle = 1; cycle <= 3; cycle++) {
    await ren.cmd('cam off');
    await check.until('cycle ' + cycle + ': the doctor sees the camera go off', async () => {
      const s = await cast.get('osei').state();
      const r = (s.roster || []).find((x) => x.name === 'Ren');
      return r && r.camOff === true;
    }, { within: 30 });
    await cast.sleep(26, 'camera off past the 20s idle-stop');
    check.assert(await ren.eval('window.__gifosVideo.camTrackLive()') === false,
      'cycle ' + cycle + ': the idle-stop released the SENSOR itself');

    await ren.cmd('cam on'); // "let me show you"
    await check.until('cycle ' + cycle + ': the regrab works (sensor live again)', async () =>
      (await ren.eval('window.__gifosVideo.camTrackLive()')) === true, { within: 20 });
    await check.until('cycle ' + cycle + ": the doctor sees Ren's video again", async () => {
      const s = await cast.get('osei').state();
      const r = (s.roster || []).find((x) => x.name === 'Ren');
      return r && r.camOff === false && r.vid;
    }, { within: 45 });
  }
  await check.converged(2, { desc: 'consult steady after three camera cycles' });
});
