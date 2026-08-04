'use strict';
// USE CASE 24 — the street broadcaster. Pattern (a): the whole show.
// Hana broadcasts live from her phone-rig (the Broadcast app: meet.html#bc=1,
// an admin room worn as a one-to-many skin). Viewers bring NOTHING — no
// camera, no mic, no permissions — and the show still reaches every one of
// them. The Stage is admin+grantee only; the hand queue is the on-ramp; chat
// is the back-channel the host can silence, line-delete, and reopen; the
// viewer password (the ticket) is what clears the blur, and a late viewer
// holding it walks straight in.
const { scenario } = require('../lib/cast');

const TICKET = 'street-show-1';

scenario('24a-broadcast-street', {
  hana: { profile: 'desktop', adminPw: 'hosts-own-key!', bc: true, ensurePass: TICKET, video: 1 }, // the host
  // viewers are OBSERVERS: the driver must not enable its default swatch
  // camera — a real audience member's page never touches getUserMedia at all
  vera: { profile: 'phone', bc: true, pass: TICKET, observe: true },
  tara: { profile: 'phone', bc: true, pass: TICKET, observe: true },
  gus:  { profile: 'phone', bc: true, pass: TICKET, observe: true },
  zed:  { profile: 'phone', bc: true, pass: TICKET, observe: true }, // joins LATE, mid-show
}, async (cast, check) => {
  const ev = (role, js) => cast.get(role).eval(js);

  // ---- act 1: the host goes live, alone, and locks the ticket ------------
  await cast.joinAll({ roles: ['hana'] });
  await check.until('the host wears the broadcast skin as its admin', async () =>
    (await ev('hana', "(function(){var V=window.__gifosVideo;return V.broadcast()&&V.amAdmin()})()")) === true, { within: 30 });
  // ensure-pass sets the viewer password through the page's own Password UI
  await check.until('the ticket is set (viewer password locks the room)', async () =>
    (await ev('hana', 'window.__gifosVideo.roomPw()')) === TICKET, { within: 45 });
  await check.until('the host auto-steps onto the Stage', async () =>
    (await ev('hana', 'window.__gifosVideo.onStage()')) === true, { within: 30 });
  // go visibly live: camera on, No blur — with the ticket set, this CLEARS
  await ev('hana', "(function(){var V=window.__gifosVideo;if(V.camOff())document.getElementById('cam').click();V.setBlur(0);return true})()");
  await check.until('the host broadcasts CLEAR (ticket + consent, no waiting room)', async () =>
    (await ev('hana', "window.__gifosVideo.blurClassOf('me')")) === 0, { within: 30 });

  // ---- act 2: the audience arrives with tickets — and nothing else -------
  await cast.joinAll({ roles: ['vera', 'tara', 'gus'] });
  await check.converged(4);
  for (const r of ['vera', 'tara', 'gus']) {
    check.assert((await ev(r, "(function(){var V=window.__gifosVideo;var g=document.getElementById('grid');return V.broadcast()&&!V.localStreamActive()&&getComputedStyle(g).display==='none'})()")) === true,
      r + ' is a pure viewer: broadcast skin, NO getUserMedia, no row grid');
  }
  const pid = {};
  for (const a of cast.all()) if (a.joined) pid[a.role] = (await a.state()).pid;
  const stageIs = async (viewerRole, roles) => {
    const s = await cast.get(viewerRole).state();
    const want = roles.map((r) => pid[r]).sort();
    return JSON.stringify((s.stagers || []).slice().sort()) === JSON.stringify(want);
  };
  await check.until('every viewer agrees: the Stage is exactly {Hana}', async () =>
    (await stageIs('vera', ['hana'])) && (await stageIs('gus', ['hana'])), { within: 30 });
  await check.until('the show PAINTS on a viewer\'s screen (live stage feed)', async () =>
    (await ev('tara', "(function(){var v=document.querySelector('#stagefeed video');return !!(v&&v.srcObject&&v.readyState>=2)})()")) === true, { within: 60 });

  // ---- act 3: the call-up — hand raised, granted, on stage, revoked ------
  await ev('vera', 'window.__gifosVideo.raiseHand(true)');
  await check.until('the raised hand reaches the host\'s queue', async () => {
    const q = await ev('hana', 'window.__gifosVideo.handQueue()');
    return Array.isArray(q) && q.some((e) => e.id === pid.vera);
  }, { within: 30 });
  check.assert((await ev('vera', 'window.__gifosVideo.canStageNow()')) === false,
    'an ungranted viewer cannot take the Stage');
  await ev('hana', "window.__gifosVideo.grantApp('" + pid.vera + "', true)");
  await check.until('the grant CALLS VERA UP — Stage = {Hana, Vera} room-wide', async () =>
    (await stageIs('gus', ['hana', 'vera'])) && (await stageIs('tara', ['hana', 'vera'])), { within: 45 });
  await ev('hana', "window.__gifosVideo.grantApp('" + pid.vera + "', false)");
  await check.until('revoking the grant pulls her down everywhere, by arithmetic', async () =>
    (await stageIs('gus', ['hana'])) && ((await ev('vera', 'window.__gifosVideo.canStageNow()')) === false), { within: 45 });

  // ---- act 4: the back-channel — chat, silence, delete, reopen -----------
  await cast.get('gus').cmd('chat hello from the crowd');
  await check.until('viewer chat reaches the host and the room', async () =>
    (await ev('hana', 'window.__gifosVideo.chatTexts()')).includes('hello from the crowd')
    && (await ev('tara', 'window.__gifosVideo.chatTexts()')).includes('hello from the crowd'), { within: 30 });
  await ev('hana', 'window.__gifosVideo.chatOffForTest(true)');
  await check.until('chat-off reaches every viewer (signed mod table)', async () =>
    (await ev('vera', 'window.__gifosVideo.chatOff()')) === true
    && (await ev('gus', "document.getElementById('chat-in').disabled")) === true, { within: 30 });
  // a DOM-hacked send while silenced goes nowhere honest
  await ev('gus', "(function(){var i=document.getElementById('chat-in');i.disabled=false;i.value='heckle';document.getElementById('chatform').dispatchEvent(new Event('submit',{cancelable:true}));return true})()");
  await cast.get('hana').cmd('chat the show goes on');
  await check.until('the host still posts while the room is silenced', async () =>
    (await ev('tara', 'window.__gifosVideo.chatTexts()')).includes('the show goes on'), { within: 30 });
  check.assert(!(await ev('hana', 'window.__gifosVideo.chatTexts()')).includes('heckle'),
    'the silenced heckle never landed anywhere');
  await ev('hana', 'window.__gifosVideo.chatOffForTest(false)');
  await check.until('chat-on reopens every composer', async () =>
    (await ev('gus', "document.getElementById('chat-in').disabled")) === false, { within: 30 });
  // per-line moderation: the host deletes the crowd's line for everyone
  await ev('hana', "(function(){var r=Array.from(document.querySelectorAll('#chatlog .cmsg')).find(function(x){return x.textContent.includes('hello from the crowd')});var b=r&&r.querySelector('[data-cdel]');if(b)b.click();return !!b})()");
  await check.until('the signed delete removes the line on every device', async () =>
    !(await ev('vera', 'window.__gifosVideo.chatTexts()')).includes('hello from the crowd'), { within: 30 });

  // ---- act 5: a LATE viewer with the ticket walks straight into the show --
  await cast.joinAll({ roles: ['zed'] });
  await check.converged(5, { desc: 'the late viewer is in — room of 5' });
  await check.until('…and the show is already on their screen', async () =>
    (await ev('zed', "(function(){var v=document.querySelector('#stagefeed video');return !!(v&&v.srcObject&&v.readyState>=2)})()")) === true, { within: 60 });
  await check.steady('the broadcast holds steady with the full house', async () =>
    (await stageIs('zed', ['hana'])), { for: 20 });
});
