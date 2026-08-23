// End-to-end: Camera.gif — seeded Home Screen shutter, trusted studio overlay,
// capability-honest chrome, shots deposited into My Media (not from the sandbox).
//
// Needs: static server on 8099. Fake camera/mic like e2e-caps.js.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text()); });

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(500);

  const layout = await page.evaluate(async () => {
    const files = await GifOS.store.allFiles();
    const items = await GifOS.store.allItems();
    const byId = {};
    files.forEach((f) => { byId[f.id] = f; });
    const rootApp = (appId, nameRe) => {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.parent) continue;
        const f = byId[it.fileId];
        if (f && f.isApp && f.isDefault && f.appId === appId) return it;
        if (!appId && nameRe && nameRe.test(it.name || '')) return it;
      }
      return null;
    };
    const welcome = rootApp('welcome');
    const camera = rootApp('camera');
    const mymedia = rootApp('mymedia');
    const stolen = items.find((it) => it.id === 'sys_stolen' && !it.parent);
    const pitch = parseInt(getComputedStyle(document.getElementById('desktop')).getPropertyValue('--row'), 10);
    return {
      camId: camera && camera.fileId,
      mmId: mymedia && mymedia.fileId,
      wParent: welcome ? (welcome.parent || null) : '?',
      cParent: camera ? (camera.parent || null) : '?',
      mParent: mymedia ? (mymedia.parent || null) : '?',
      wx: welcome && welcome.x, wy: welcome && welcome.y,
      cx: camera && camera.x, cy: camera && camera.y,
      mx: mymedia && mymedia.x, my: mymedia && mymedia.y,
      sy: stolen && stolen.y,
      pitch,
    };
  });
  check('Camera app seeds', !!layout.camId, layout.camId);
  check('Camera is loose on the Home Screen (same parent as Welcome)', layout.cParent === layout.wParent, 'cam=' + layout.cParent + ' welcome=' + layout.wParent);
  check('My Media is still loose on the Home Screen', layout.mParent === layout.wParent);
  check('Camera sits between Welcome and My Media (same column, y in between)',
    layout.cx === layout.wx && layout.cy === layout.wy + layout.pitch && layout.mx === layout.cx && layout.my === layout.cy + layout.pitch,
    JSON.stringify({ w: [layout.wx, layout.wy], c: [layout.cx, layout.cy], m: [layout.mx, layout.my], pitch: layout.pitch }));
  check('Stolen Apps scooched one row below My Media',
    layout.sy === layout.my + layout.pitch, 'stolen.y=' + layout.sy + ' myMedia.y=' + layout.my);

  await page.goto(BASE + '/run.html#id=' + layout.camId);
  await page.waitForSelector('iframe', { timeout: 15000 });
  async function ackPerms() {
    await page.locator('.perm-modal .done').click({ timeout: 4000 }).catch(() => {});
    await page.locator('.perm-modal').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
  await ackPerms();
  const fr = page.frameLocator('iframe');

  const studio = page.locator('[data-gifos-studio], [data-gifos-capture]');
  const emptyOn = await fr.locator('#empty.on').waitFor({ timeout: 2500 }).then(() => true).catch(() => false);
  if (emptyOn) {
    const why = await fr.locator('#why').textContent().catch(() => '');
    check('cameraInfo() opened the studio (fake device must work)', false, why);
  } else {
    await studio.first().waitFor({ timeout: 15000 });
    check('studio overlay exists (unfakeable capture signage)', await studio.count() >= 1);
  }

  const info = await fr.locator('body').evaluate(async () => {
    try { return await gifos.cameraInfo(); }
    catch (e) { return { ok: false, reason: String(e && e.message || e), threw: true }; }
  }).catch((e) => ({ ok: false, reason: String(e), threw: true }));
  check('gifos.cameraInfo() returns an object with ok boolean', info && typeof info.ok === 'boolean', JSON.stringify(info));
  if (info && info.threw) check('cameraInfo must not throw — empty state instead', false, info.reason);
  check('cameraInfo has cameras/count/facingModes/torch/zoom/focus/exposure/video/highFps',
    !!(info && Array.isArray(info.cameras) && typeof info.count === 'number'
      && Array.isArray(info.facingModes) && 'torch' in info && 'zoom' in info
      && 'focus' in info && 'exposure' in info && 'video' in info && 'highFps' in info
      && 'maxWidth' in info && 'maxHeight' in info && 'maxFrameRate' in info
      && 'mimeVideo' in info && 'mimeAudio' in info),
    JSON.stringify(info));
  check('fake device probe is ok:true with video', !!(info && info.ok === true && info.video === true), JSON.stringify({ ok: info && info.ok, video: info && info.video, reason: info && info.reason }));

  if (info && info.ok) {
    check('filter strip is present', await page.locator('[data-cs="filters"] [data-filter]').count() >= 18);
    const nFlip = await page.locator('[data-cs="flip"]').count();
    const canFlip = info.count > 1 || (info.facingModes && info.facingModes.indexOf('user') >= 0 && info.facingModes.indexOf('environment') >= 0);
    if (canFlip) check('flip is present (more than one camera)', nFlip === 1);
    else check('flip is absent when there is only one camera', nFlip === 0);
    if (!info.torch) check('torch control is absent when probe.torch is false', await page.locator('[data-cs="torch"]').count() === 0);
    if (!info.zoom) check('zoom slider is absent when probe.zoom is false', await page.locator('[data-cs="zoom"]').count() === 0);
    if (!info.highFps) check('Slow-mo is absent when probe.highFps is false', await page.locator('[data-mode="slowmo"]').count() === 0);
    if (info.video) check('Video mode is offered', await page.locator('[data-mode="video"]').count() === 1);
  }

  await page.waitForFunction(() => {
    const v = document.querySelector('[data-gifos-studio] video');
    return !!(v && v.videoWidth);
  }, null, { timeout: 10000 }).catch(() => {});

  const blobsBefore = await page.evaluate(async (mmId) => {
    if (!mmId) return 0;
    const blobs = await GifOS.store.appGetAll(mmId, 'blobs');
    return (blobs || []).length;
  }, layout.mmId);

  const countBlobs = (mmId) => page.evaluate(async (id) => (await GifOS.store.appGetAll(id, 'blobs') || []).length, mmId);
  const waitBlobs = async (mmId, want, ms) => {
    const until = Date.now() + (ms || 8000);
    let n = await countBlobs(mmId);
    while (n < want && Date.now() < until) { await sleep(250); n = await countBlobs(mmId); }
    return n;
  };

  await page.locator('[data-filter="noir"]').click().catch(() => {});
  await page.locator('[data-cs="shutter"]').click();
  await page.locator('[data-cs="last"].on').waitFor({ timeout: 12000 }).catch(() => {});
  // Per-shot delivery: the photo must land in My Media WHILE the studio is
  // still open — saving must never wait for (or depend on) the close.
  const blobsMidSession = await waitBlobs(layout.mmId, blobsBefore + 1);
  check('shot deposits into My Media while the studio is still open (per-shot delivery)',
    blobsMidSession === blobsBefore + 1, 'before=' + blobsBefore + ' mid=' + blobsMidSession);
  // A second shot in the SAME session must also survive — the session used to
  // deliver only the last capture.
  await page.locator('[data-cs="shutter"]').click();
  const blobsTwo = await waitBlobs(layout.mmId, blobsBefore + 2);
  await page.locator('[data-cs="close"]').click();
  await page.locator('[data-gifos-studio]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await sleep(600);
  check('two shots in one session both deposit (not just the last)',
    blobsTwo === blobsBefore + 2, 'before=' + blobsBefore + ' after=' + blobsTwo);

  const photo = await page.evaluate(async (mmId) => {
    const media = await GifOS.store.appGetAll(mmId, 'media');
    const blobs = await GifOS.store.appGetAll(mmId, 'blobs');
    const cam = (media || []).filter((m) => m && m.category === 'Camera' && m.type === 'image');
    const rec = cam.sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    const blob = rec && (blobs || []).find((b) => b.id === rec.id);
    const u8 = blob && blob.bytes;
    const soi = !!(u8 && u8[0] === 0xff && u8[1] === 0xd8);
    return { n: cam.length, mime: rec && rec.mime, soi, size: u8 && u8.length, id: rec && rec.id };
  }, layout.mmId);
  check('captured photo deposits a Camera image into My Media', photo.n >= 2, JSON.stringify(photo));
  check('deposited blob starts with JPEG SOI (ff d8)', photo.soi === true, JSON.stringify(photo));
  check('capturing with a non-Normal filter still yields a JPEG',
    photo.soi && (!photo.mime || photo.mime === 'image/jpeg' || /^image\//.test(photo.mime)), photo.mime);

  const blobsAfterPhoto = await page.evaluate(async (mmId) => (await GifOS.store.appGetAll(mmId, 'blobs') || []).length, layout.mmId);

  await ackPerms();
  const cancelP = fr.locator('body').evaluate(() => gifos.camera({ mode: 'photo' }).then(() => 'ok', (e) => String(e && e.message || e)));
  await page.locator('[data-gifos-studio]').waitFor({ timeout: 10000 });
  await sleep(300);
  await page.locator('[data-cs="close"]').click();
  const cancelMsg = await cancelP;
  await page.locator('[data-gifos-studio]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await sleep(400);
  const blobsAfterCancel = await page.evaluate(async (mmId) => (await GifOS.store.appGetAll(mmId, 'blobs') || []).length, layout.mmId);
  check('cancel rejects without writing a blob',
    /cancel/i.test(cancelMsg) && blobsAfterCancel === blobsAfterPhoto,
    'msg=' + cancelMsg + ' before=' + blobsAfterPhoto + ' after=' + blobsAfterCancel + ' start=' + blobsBefore);

  check('fake device offers video (MediaRecorder present)', !!(info && info.video));
  const countVids = (mmId) => page.evaluate(async (id) => {
    const media = await GifOS.store.appGetAll(id, 'media');
    return (media || []).filter((m) => m && m.category === 'Camera' && m.type === 'video').length;
  }, mmId);
  const waitVids = async (mmId, want, ms) => {
    const until = Date.now() + (ms || 10000);
    let n = await countVids(mmId);
    while (n < want && Date.now() < until) { await sleep(250); n = await countVids(mmId); }
    return n;
  };
  // Drive the CAMERA APP's own shutter — its session is the one that saves
  // each shot (per-shot onShot → library.put). A bare gifos.camera() from the
  // test would resolve into the test and nothing would deposit; that call
  // pattern is exactly what let the video-save bug hide.
  async function openVideoStudio() {
    await ackPerms();
    await fr.locator('#shutter').click();
    await page.locator('[data-gifos-studio]').waitFor({ timeout: 10000 });
    await page.locator('[data-mode="video"]').click();
    await page.locator('[data-mode="video"].on').waitFor({ timeout: 8000 });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-gifos-studio] video');
      return !!(v && v.videoWidth);
    }, null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
  }

  if (info && info.video) {
    // Stop the recording, then close IMMEDIATELY — the bytes are still
    // materializing in the recorder's onstop when ✕ lands. The close must
    // wait for them, never resolve "cancelled" and drop the clip.
    await openVideoStudio();
    await page.locator('[data-cs="shutter"]').click();
    await page.locator('.cs-shutter.rec').waitFor({ timeout: 5000 });
    await sleep(1200);
    await page.locator('[data-cs="shutter"]').click();
    await page.locator('[data-cs="close"]').click();
    await page.locator('[data-gifos-studio]').waitFor({ state: 'detached', timeout: 12000 }).catch(() => {});
    const vidsA = await waitVids(layout.mmId, 1);
    check('stop then instant close still deposits the video', vidsA >= 1, 'vids=' + vidsA);

    // Close WHILE recording: ✕ means "I'm done", not "throw my clip away" —
    // the studio must stop the recorder, wait for the clip, and deliver it.
    await openVideoStudio();
    await page.locator('[data-cs="shutter"]').click();
    await page.locator('.cs-shutter.rec').waitFor({ timeout: 5000 });
    await sleep(1200);
    await page.locator('[data-cs="close"]').click();
    await page.locator('[data-gifos-studio]').waitFor({ state: 'detached', timeout: 12000 }).catch(() => {});
    const vidsB = await waitVids(layout.mmId, 2);
    check('closing mid-recording stops, saves and deposits the clip', vidsB >= 2, 'vids=' + vidsB);

    const vid = await page.evaluate(async (mmId) => {
      const media = await GifOS.store.appGetAll(mmId, 'media');
      const blobs = await GifOS.store.appGetAll(mmId, 'blobs');
      const vids = (media || []).filter((m) => m && m.category === 'Camera' && m.type === 'video')
        .sort((a, b) => (b.at || 0) - (a.at || 0));
      const blob = vids[0] && (blobs || []).find((b) => b.id === vids[0].id);
      return { n: vids.length, mime: vids[0] && vids[0].mime, bytes: blob && blob.bytes && blob.bytes.length };
    }, layout.mmId);
    check('deposited video has video/* mime and non-empty bytes',
      /^video\//.test(vid.mime || '') && (vid.bytes || 0) > 0, JSON.stringify(vid));
  }

  // The camera app must offer a way INTO My Media: its My Media button asks
  // the OS (gifos.library.open) to switch this tab to the My Media app.
  check('camera app has a My Media button', await fr.locator('#mmbtn').count() === 1);
  await fr.locator('#mmbtn').click();
  await page.waitForFunction((mmId) => location.hash.indexOf('id=' + mmId) >= 0, layout.mmId, { timeout: 8000 })
    .then(() => check('My Media button navigates the tab to run.html#id=<mymedia>', true))
    .catch(async () => check('My Media button navigates the tab to run.html#id=<mymedia>', false,
      'hash=' + await page.evaluate(() => location.hash).catch(() => '?')));
  const mmBooted = await page.frameLocator('iframe').locator('header h1').textContent({ timeout: 15000 }).catch(() => '');
  check('My Media app boots after the switch', /My Media/i.test(mmBooted || ''), mmBooted);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
