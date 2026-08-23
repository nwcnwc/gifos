// My Media e2e — the default media library seeded loose on the Home Screen.
// Verifies the core: it seeds at desktop root (next to Welcome), imports images
// and audio, round-trips the raw bytes through gifos.db (Uint8Array survives),
// bakes grid thumbnails, opens each format in the right built-in player,
// downloads the original bytes back out as a real file, supports
// categorize / filter / delete, and turns a video into a plain looping GIF.
// Needs a static server (BASE); no relay.
const { chromium, CHROME } = require('../lib/pw');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = 'http://127.0.0.1:8099';
let fail=0; const ok=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' — '+n+(d?'  ('+d+')':''));if(!c)fail++;};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8Dwn4EIwDiqEAAm9gQ9Ax1z8wAAAABJRU5ErkJggg==','base64');
function wav(){ const sr=8000,n=800,b=Buffer.alloc(44+n*2); b.write('RIFF',0); b.writeUInt32LE(36+n*2,4); b.write('WAVE',8); b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40); return b; }
function makeWebm(){
  const out = path.join(os.tmpdir(), 'gifos-mymedia-clip.webm');
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10',
      '-t', '2', '-an', '-c:v', 'libvpx', '-b:v', '200k',
      '-deadline', 'realtime', '-cpu-used', '8',
      out,
    ], { timeout: 30000 });
  } catch (e) {
    throw new Error('ffmpeg failed to make a VP8 webm fixture: ' + ((e && e.message) || e));
  }
  const buf = fs.readFileSync(out);
  if (buf.length < 100) throw new Error('webm fixture too small: ' + buf.length);
  return buf;
}
(async()=>{
  const b=await chromium.launch({executablePath:CHROME});
  const ctx=await b.newContext(); const page=await ctx.newPage();
  page.on('pageerror',e=>console.log('  [pageerror]',e.message));
  await page.goto(BASE+'/index.html'); await page.waitForSelector('.icon',{timeout:20000});
  // My Media should seed LOOSE (at the desktop root), next to Welcome
  const info=await page.evaluate(async()=>{ const its=await GifOS.store.allItems(); const mm=its.find(x=>/^My Media\.gif/i.test(x.name||'')); const w=its.find(x=>/^Welcome\.gif/i.test(x.name||'')); return { id:mm?mm.fileId:null, mmParent:mm?mm.parent||null:'?', wParent:w?w.parent||null:'?' }; });
  ok('My Media app seeds', !!info.id, info.id);
  ok('My Media is loose on the Home Screen (same level as Welcome)', info.mmParent===info.wParent, 'mm='+info.mmParent+' welcome='+info.wParent);

  await page.goto(BASE+'/run.html#id='+info.id); await page.waitForSelector('iframe',{timeout:15000});
  await page.locator('.perm-modal .done').click({timeout:4000}).catch(()=>{}); // mic+camera abilities ack
  const fr=page.frameLocator('iframe');
  await fr.locator('#add').waitFor({timeout:6000});
  ok('capture buttons present (declares camera/mic)', await fr.locator('#cap button').count() === 3);

  // import an image
  await fr.locator('#fi').setInputFiles({ name:'sunset.png', mimeType:'image/png', buffer:PNG });
  await fr.locator('.card').first().waitFor({timeout:6000});
  ok('imported image appears in the library', await fr.locator('.card').count() === 1);
  ok('grid card shows a baked thumbnail', /background-image/.test(await fr.locator('.card .thumb').first().getAttribute('style')||''));

  // Steal / backup serialize state to a GIF via the binary-safe packer. A blob's
  // Uint8Array must survive that round-trip (a plain JSON.stringify mangled it —
  // and on a video-sized blob crashed the steal, so "nothing showed up").
  const binOk = await page.evaluate(async (fid) => {
    const s = await GifOS.store.getState(fid);
    const items = s && s.collections && s.collections.blobs && s.collections.blobs.items;
    const first = items && Object.values(items)[0];
    if (!first || !(first.bytes instanceof Uint8Array) || !first.bytes.length) return { ok:false, why:'no blob' };
    const round = GifOS.store.unpackJSON(GifOS.store.packJSON(s));
    const back = round.collections.blobs.items[first.id].bytes;
    return { ok: back instanceof Uint8Array && back.length === first.bytes.length && back[0] === first.bytes[0] && back[back.length-1] === first.bytes[first.bytes.length-1], len: first.bytes.length };
  }, info.id);
  ok('stored blob survives the steal/backup serializer (binary-safe)', binOk.ok, JSON.stringify(binOk));

  // open it → the image player shows the real bytes (binary round-trip through gifos.db)
  await fr.locator('.card').first().click();
  await fr.locator('#stage img').waitFor({timeout:5000});
  const natW = await fr.locator('#stage img').evaluate(el=>el.naturalWidth).catch(()=>0);
  ok('image opens in the built-in player from stored bytes', natW > 0, 'naturalWidth='+natW);
  ok('opened item offers Download', await fr.locator('#mdown').count() === 1);
  ok('Make GIF is not on a photo', !(await fr.locator('#mgif').isVisible()));

  // Download hands the original bytes back as a real file (the library could
  // import and play, but nothing wrote them out). The item name already has
  // an extension, so the file is named exactly that.
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    fr.locator('#mdown').click(),
  ]);
  ok('Download uses the item name', dl.suggestedFilename() === 'sunset.png', dl.suggestedFilename());
  const got = require('fs').readFileSync(await dl.path());
  ok('downloaded bytes match the imported image', Buffer.compare(got, PNG) === 0, 'len='+got.length);

  // A name with no extension still gets the type's suffix, so a photo named
  // "Grand Canyon" lands as Grand Canyon.png rather than a suffix-less blob.
  await fr.locator('#mname').fill('Grand Canyon');
  await fr.locator('#msave').click();
  await page.waitForTimeout(300);
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    fr.locator('#mdown').click(),
  ]);
  ok('Download adds the type extension when the name has none', dl2.suggestedFilename() === 'Grand Canyon.png', dl2.suggestedFilename());

  // categorize
  await fr.locator('#mcat').fill('Trips'); await fr.locator('#msave').click(); await page.waitForTimeout(400);
  await fr.locator('#mclose').click();
  ok('category saved and shown on the card', (await fr.locator('.card .cat').first().innerText()) === 'Trips');

  // import audio → audio player
  await fr.locator('#fi').setInputFiles({ name:'clip.wav', mimeType:'audio/wav', buffer:wav() });
  await page.waitForTimeout(600);
  ok('audio import adds a second item', await fr.locator('.card').count() === 2);
  // filter to audio only
  await fr.locator('#types button[data-t="audio"]').click(); await page.waitForTimeout(200);
  ok('type filter narrows to audio', await fr.locator('.card').count() === 1);
  await fr.locator('.card').first().click();
  ok('audio opens in an <audio> player', await fr.locator('#stage audio').count() === 1);
  await fr.locator('#mclose').click();

  // delete the audio
  await fr.locator('.card').first().click(); await fr.locator('#mdel').click(); await page.waitForTimeout(500);
  await fr.locator('#types button[data-t="all"]').click(); await page.waitForTimeout(200);
  ok('delete removes the item', await fr.locator('.card').count() === 1);

  // video → GIF. After audio delete, one image remains; this block adds a
  // webm and a GIF so it runs LAST and does not disturb the counts above.
  const WEBM = makeWebm();
  await fr.locator('#fi').setInputFiles({ name:'clip.webm', mimeType:'video/webm', buffer:WEBM });
  await fr.locator('.card').nth(1).waitFor({timeout:8000});
  ok('video import adds a second item', await fr.locator('.card').count() === 2);
  await fr.locator('.card').first().click();
  await fr.locator('#stage video').waitFor({timeout:8000});
  const vw = await fr.locator('#stage video').evaluate(async (el) => {
    if (el.videoWidth) return { w: el.videoWidth, h: el.videoHeight, err: null };
    await new Promise((res) => {
      const done = () => res();
      el.addEventListener('loadeddata', done);
      el.addEventListener('error', done);
      setTimeout(done, 8000);
    });
    return { w: el.videoWidth, h: el.videoHeight, err: el.error && (el.error.message || String(el.error.code)) };
  });
  ok('video opens with decoded frames (videoWidth > 0)', vw.w > 0, JSON.stringify(vw));
  ok('Make GIF is on a video', await fr.locator('#mgif').isVisible());

  await fr.locator('#mgif').click();
  await fr.locator('#gifpanel.on').waitFor({timeout:5000});
  ok('convert panel opens', await fr.locator('#gifpanel.on').count() === 1);
  ok('speed segments exist', await fr.locator('#gifspeeds button').count() === 6);
  ok('1× is selected by default', await fr.locator('#gifspeeds button[data-s="1"]').evaluate((el) => el.classList.contains('on')));
  const b1 = await fr.locator('#gifbudget').innerText();
  ok('budget line mentions 8s at 1×', /8s/.test(b1) && /1×/.test(b1), b1);
  await fr.locator('#gifspeeds button[data-s="2"]').click();
  const b2 = await fr.locator('#gifbudget').innerText();
  ok('2× raises max source to 16s', /16s/.test(b2), b2);
  await fr.locator('#gifspeeds button[data-s="0.25"]').click();
  const b025 = await fr.locator('#gifbudget').innerText();
  ok('0.25× drops max source to 2s', /max 2s/.test(b025), b025);
  await fr.locator('#gifspeeds button[data-s="1"]').click();
  const b1b = await fr.locator('#gifbudget').innerText();
  ok('returning to 1× restores the 8s budget', /8s/.test(b1b) && /1×/.test(b1b), b1b);

  await fr.locator('#gifgo').click();
  await fr.locator('#stage img').waitFor({timeout:90000});
  const gifW = await fr.locator('#stage img').evaluate((el) => el.naturalWidth).catch(() => 0);
  ok('converted GIF opens as an image', gifW > 0, 'naturalWidth='+gifW);
  ok('Make GIF is not on the new GIF', !(await fr.locator('#mgif').isVisible()));

  const [gdl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    fr.locator('#mdown').click(),
  ]);
  const gbuf = fs.readFileSync(await gdl.path());
  ok('GIF download starts with GIF89a', gbuf.slice(0,6).toString() === 'GIF89a', gbuf.slice(0,8).toString('hex'));
  ok('GIF is a reasonable size', gbuf.length > 100, 'len='+gbuf.length);
  ok('plain GIF, not a GifOS app', !gbuf.includes('GIFOS1.0'));

  await fr.locator('#mclose').click();
  await fr.locator('#types button[data-t="image"]').click(); await page.waitForTimeout(200);
  ok('library now has the original photo and the new GIF', await fr.locator('.card').count() === 2);

  await b.close();
  console.log(fail?('\n'+fail+' FAIL'):'\nALL PASS'); process.exit(fail?1:0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || (e && e.message) || e); process.exit(2); });
