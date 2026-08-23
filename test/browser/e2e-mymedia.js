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
// 400ms of increasing PCM so reverse/clip are visible in the downloaded WAV.
function wavRamp(){
  const sr=8000, n=3200, b=Buffer.alloc(44+n*2);
  b.write('RIFF',0); b.writeUInt32LE(36+n*2,4); b.write('WAVE',8);
  b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34);
  b.write('data',36); b.writeUInt32LE(n*2,40);
  for (let i=0;i<n;i++) b.writeInt16LE(i, 44+i*2);
  return b;
}
function wavInfo(buf){
  if (buf.slice(0,4).toString()!=='RIFF' || buf.slice(8,12).toString()!=='WAVE') return null;
  let o=12, sr=0, samples=[];
  while (o+8<=buf.length){
    const id=buf.slice(o,o+4).toString();
    const n=buf.readUInt32LE(o+4);
    if (id==='fmt ' && n>=8) sr=buf.readUInt32LE(o+12);
    if (id==='data'){
      const end=Math.min(buf.length, o+8+n);
      for (let i=o+8;i+1<end;i+=2) samples.push(buf.readInt16LE(i));
      break;
    }
    o+=8+n;
  }
  return { sr, samples, dur: sr? samples.length/sr : 0 };
}
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

  // ---- flip / clip / reverse (appended so the counts above stay put) ----
  async function pngPixels(buf){
    const b64=Buffer.from(buf).toString('base64');
    return page.evaluate(async (b64) => {
      const img=new Image();
      await new Promise((res, rej) => { img.onload=res; img.onerror=()=>rej(new Error('png decode failed')); img.src='data:image/png;base64,'+b64; });
      const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
      const ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      return { w:c.width, h:c.height, data:Array.from(ctx.getImageData(0,0,c.width,c.height).data) };
    }, b64);
  }
  function pixAt(img,x,y){ const i=(y*img.w+x)*4; return [img.data[i], img.data[i+1], img.data[i+2]]; }
  function pixClose(a,b,tol){ return Math.abs(a[0]-b[0])<=tol && Math.abs(a[1]-b[1])<=tol && Math.abs(a[2]-b[2])<=tol; }
  async function modalOpen(){ return fr.locator('#modal').evaluate((el)=>getComputedStyle(el).display!=='none'); }
  async function closeIfOpen(){ if (await modalOpen()) await fr.locator('#mclose').click(); }
  async function showAll(){ await fr.locator('#types button[data-t="all"]').click(); await page.waitForTimeout(150); }
  async function openNamed(exact){
    await closeIfOpen(); await showAll();
    const re=new RegExp('^'+exact.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
    await fr.locator('.card').filter({ has: fr.locator('.nm', { hasText: re }) }).first().click();
  }
  async function waitName(substr, ms){
    const t0=Date.now(); let last='';
    while (Date.now()-t0<ms){
      last=await fr.locator('#mname').inputValue().catch(()=>'');
      if (last.includes(substr)) return last;
      await page.waitForTimeout(200);
    }
    return last;
  }
  async function downloadNow(ms){
    const [dl]=await Promise.all([
      page.waitForEvent('download', { timeout: ms||8000 }),
      fr.locator('#mdown').click(),
    ]);
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
  }
  async function dragHandle(id, pct){
    const range=await fr.locator('#gifrange').boundingBox();
    const h=await fr.locator(id).boundingBox();
    ok('range handle '+id+' has a box', !!range && !!h, JSON.stringify({ range, h }));
    if (!range || !h) return;
    const y=h.y+h.height/2;
    await page.mouse.move(h.x+h.width/2, y);
    await page.mouse.down();
    await page.mouse.move(range.x+range.width*pct, y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }

  await showAll();
  await openNamed('Grand Canyon');
  await fr.locator('#stage img').waitFor({ timeout: 5000 });
  ok('photo Flip ↔️ is visible', await fr.locator('#mfliph').isVisible());
  ok('photo Flip ↕️ is visible', await fr.locator('#mflipv').isVisible());
  ok('photo Clip is hidden', !(await fr.locator('#mclip').isVisible()));
  ok('photo Reverse is hidden', !(await fr.locator('#mrev').isVisible()));
  ok('photo Make GIF stays hidden', !(await fr.locator('#mgif').isVisible()));

  await fr.locator('#mfliph').click();
  const hName=await waitName('flipped', 15000);
  ok('horizontal flip writes a new image', /flipped/i.test(hName), 'name='+hName);
  await fr.locator('#stage img').waitFor({ timeout: 8000 });
  const hW=await fr.locator('#stage img').evaluate((el)=>el.naturalWidth).catch(()=>0);
  ok('flipped photo opens in #stage img', hW>0, 'naturalWidth='+hW);
  const hdl=await downloadNow();
  ok('flipped download is not the original PNG', Buffer.compare(hdl.buf, PNG)!==0, 'len='+hdl.buf.length);
  const hIsPng=hdl.buf.slice(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const hIsJpg=hdl.buf.slice(0,2).equals(Buffer.from([0xff,0xd8]));
  ok('flipped photo is still a PNG or JPEG', hIsPng || hIsJpg, hdl.buf.slice(0,8).toString('hex'));
  if (hIsPng){
    const origPx=await pngPixels(PNG);
    const flipPx=await pngPixels(hdl.buf);
    const sameSize=origPx.w===flipPx.w && origPx.h===flipPx.h && origPx.w>1;
    ok('flipped PNG keeps its size', sameSize, JSON.stringify({ orig: [origPx.w, origPx.h], flip: [flipPx.w, flipPx.h] }));
    if (sameSize){
      const L=pixAt(origPx,0,0), R=pixAt(origPx,origPx.w-1,0);
      const fL=pixAt(flipPx,0,0), fR=pixAt(flipPx,flipPx.w-1,0);
      ok('horizontal flip swapped left and right columns', pixClose(fL,R,2) && pixClose(fR,L,2), JSON.stringify({ L, R, fL, fR }));
    }
  }

  const beforeV=hdl.buf;
  await fr.locator('#mflipv').click();
  const vName=await waitName('(flipped) (flipped)', 15000);
  ok('vertical flip writes another new image', /flipped/i.test(vName) && vName!==hName, 'name='+vName);
  await fr.locator('#stage img').waitFor({ timeout: 8000 });
  const vW=await fr.locator('#stage img').evaluate((el)=>el.naturalWidth).catch(()=>0);
  ok('vertically flipped photo opens', vW>0, 'naturalWidth='+vW);
  const vdl=await downloadNow();
  ok('vertical flip is not a no-op vs the image it flipped', Buffer.compare(vdl.buf, beforeV)!==0, 'len='+vdl.buf.length);

  const RAMP=wavRamp();
  await closeIfOpen();
  await showAll();
  await fr.locator('#fi').setInputFiles({ name:'tone.wav', mimeType:'audio/wav', buffer:RAMP });
  await page.waitForTimeout(700);
  await fr.locator('#types button[data-t="audio"]').click(); await page.waitForTimeout(200);
  await fr.locator('.card').filter({ has: fr.locator('.nm', { hasText: /^tone\.wav$/ }) }).first().click();
  ok('audio Flip ↔️ is hidden', !(await fr.locator('#mfliph').isVisible()));
  ok('audio Flip ↕️ is hidden', !(await fr.locator('#mflipv').isVisible()));
  ok('audio Clip is visible', await fr.locator('#mclip').isVisible());
  ok('audio Reverse is visible', await fr.locator('#mrev').isVisible());

  await fr.locator('#mrev').click();
  const aRevName=await waitName('reversed', 15000);
  ok('audio reverse writes a new item', /reversed/i.test(aRevName), 'name='+aRevName);
  ok('reversed audio opens in <audio>', await fr.locator('#stage audio').count()===1);
  const aRev=await downloadNow();
  const aRevInfo=wavInfo(aRev.buf);
  ok('reversed download is a RIFF/WAVE', !!aRevInfo, aRev.buf.slice(0,12).toString());
  const origPcm=wavInfo(RAMP).samples;
  const revPcm=aRevInfo ? aRevInfo.samples : [];
  ok('reversed first PCM is not the original first', revPcm.length>0 && revPcm[0]!==origPcm[0], 'first='+(revPcm[0]));
  ok('reversed first PCM matches original last', revPcm.length>0 && Math.abs(revPcm[0]-origPcm[origPcm.length-1])<=50, 'got='+revPcm[0]+' want='+origPcm[origPcm.length-1]);
  ok('reversed last PCM matches original first', revPcm.length>0 && Math.abs(revPcm[revPcm.length-1]-origPcm[0])<=50, 'got='+revPcm[revPcm.length-1]+' want='+origPcm[0]);

  await openNamed('tone.wav');
  await fr.locator('#mclip').click();
  await fr.locator('#gifpanel.on').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  ok('audio clip panel has a range', await fr.locator('#gifrange').isVisible());
  ok('audio clip panel has two handles', await fr.locator('#gifh0').isVisible() && await fr.locator('#gifh1').isVisible());
  ok('audio clip hides the filmstrip', !(await fr.locator('#filmstrip').isVisible()));
  await dragHandle('#gifh0', 0.5);
  await fr.locator('#gifgo').click();
  const aClipName=await waitName('clip', 15000);
  ok('audio clip writes a new item', /clip/i.test(aClipName), 'name='+aClipName);
  const aClip=await downloadNow();
  const aClipInfo=wavInfo(aClip.buf);
  ok('clipped audio is a WAV', !!aClipInfo, aClip.buf.slice(0,12).toString());
  ok('clipped WAV is shorter than the source', aClip.buf.length < RAMP.length, 'clip='+aClip.buf.length+' src='+RAMP.length);
  if (aClipInfo && aClipInfo.dur>0){
    ok('clipped WAV duration is under the source', aClipInfo.dur < 0.35, 'dur='+aClipInfo.dur);
  }

  await openNamed('clip.webm');
  await fr.locator('#stage video').waitFor({ timeout: 8000 });
  ok('video Flip ↔️ is visible', await fr.locator('#mfliph').isVisible());
  ok('video Flip ↕️ is visible', await fr.locator('#mflipv').isVisible());
  ok('video Clip is visible', await fr.locator('#mclip').isVisible());
  ok('video Reverse is visible', await fr.locator('#mrev').isVisible());
  ok('video Make GIF is visible', await fr.locator('#mgif').isVisible());
  const recOk=await fr.locator('body').evaluate(() => typeof MediaRecorder!=='undefined' && !!document.createElement('canvas').captureStream);
  ok('MediaRecorder is available for video edits', recOk);

  const srcDur=await fr.locator('#stage video').evaluate((el)=>el.duration);

  await fr.locator('#mrev').click();
  const vRevName=await waitName('reversed', 90000);
  ok('video reverse writes a new video item', /reversed/i.test(vRevName), 'name='+vRevName);
  await fr.locator('#stage video').waitFor({ timeout: 15000 });
  const vRev=await fr.locator('#stage video').evaluate(async (el) => {
    if (el.videoWidth) return { w:el.videoWidth, h:el.videoHeight };
    await new Promise((res) => { el.addEventListener('loadeddata', res); el.addEventListener('error', res); setTimeout(res, 8000); });
    return { w:el.videoWidth, h:el.videoHeight, err: el.error && (el.error.message||String(el.error.code)) };
  });
  ok('reversed video opens with videoWidth > 0', vRev.w>0, JSON.stringify(vRev));

  await openNamed('clip.webm');
  await fr.locator('#stage video').waitFor({ timeout: 8000 });
  await fr.locator('#mclip').click();
  await fr.locator('#gifpanel.on').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  ok('video clip panel has a range', await fr.locator('#gifrange').isVisible());
  ok('video clip panel has two handles', await fr.locator('#gifh0').isVisible() && await fr.locator('#gifh1').isVisible());
  ok('video clip hides speed', !(await fr.locator('#gifspeeds').isVisible()));
  await dragHandle('#gifh1', 0.45);
  await fr.locator('#gifgo').click();
  const vClipName=await waitName('(clip)', 90000);
  ok('video clip writes a new item', /\(clip\)/i.test(vClipName), 'name='+vClipName);
  await fr.locator('#stage video').waitFor({ timeout: 15000 });
  const vClip=await fr.locator('#stage video').evaluate(async (el) => {
    if (el.videoWidth) return { w:el.videoWidth, h:el.videoHeight, d:el.duration };
    await new Promise((res) => { el.addEventListener('loadeddata', res); el.addEventListener('error', res); setTimeout(res, 8000); });
    return { w:el.videoWidth, h:el.videoHeight, d:el.duration, err: el.error && (el.error.message||String(el.error.code)) };
  });
  ok('clipped video opens with videoWidth > 0', vClip.w>0, JSON.stringify(vClip));
  if (isFinite(vClip.d) && vClip.d>0 && isFinite(srcDur) && srcDur>0){
    ok('clipped video is shorter than the source', vClip.d < srcDur - 0.15, 'clip='+vClip.d+' src='+srcDur);
  }

  await openNamed('clip.webm');
  await fr.locator('#stage video').waitFor({ timeout: 8000 });
  await fr.locator('#mfliph').click();
  const vFlipName=await waitName('flipped', 90000);
  ok('video flip writes a new item', /flipped/i.test(vFlipName), 'name='+vFlipName);
  await fr.locator('#stage video').waitFor({ timeout: 15000 });
  const vFlip=await fr.locator('#stage video').evaluate(async (el) => {
    if (el.videoWidth) return { w:el.videoWidth, h:el.videoHeight };
    await new Promise((res) => { el.addEventListener('loadeddata', res); el.addEventListener('error', res); setTimeout(res, 8000); });
    return { w:el.videoWidth, h:el.videoHeight, err: el.error && (el.error.message||String(el.error.code)) };
  });
  ok('flipped video opens with videoWidth > 0', vFlip.w>0, JSON.stringify(vFlip));
  const vFlipDl=await downloadNow();
  ok('flipped video bytes differ from the source webm', Buffer.compare(vFlipDl.buf, WEBM)!==0, 'len='+vFlipDl.buf.length);

  // Window-drag the range fill (GIF converter and Clip share this control).
  await openNamed('clip.webm');
  await fr.locator('#stage video').waitFor({ timeout: 8000 });
  await fr.locator('#mclip').click();
  await fr.locator('#gifpanel.on').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await dragHandle('#gifh1', 0.5);
  async function rangeSE(){
    return fr.locator('#gifrange').evaluate((el)=>({
      s: parseFloat(el.getAttribute('data-start')),
      e: parseFloat(el.getAttribute('data-end')),
    }));
  }
  const se0=await rangeSE();
  ok('range exposes data-start/data-end', isFinite(se0.s) && isFinite(se0.e) && se0.e>se0.s, JSON.stringify(se0));
  const dur0=se0.e-se0.s;
  const fillBox=await fr.locator('#giffill').boundingBox();
  const rangeBox=await fr.locator('#gifrange').boundingBox();
  ok('range fill is a fat hit target', !!fillBox && fillBox.height>=40, JSON.stringify(fillBox));
  const grab={ x: fillBox.x+fillBox.width/2, y: fillBox.y+fillBox.height/2 };
  const dx=rangeBox.width*0.22;
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x+dx, grab.y, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const se1=await rangeSE();
  const ds=se1.s-se0.s, de=se1.e-se0.e;
  ok('dragging the fill slides the window (both ends up)', ds>0.1 && de>0.1, JSON.stringify({ se0, se1, ds, de }));
  ok('window drag keeps duration', Math.abs((se1.e-se1.s)-dur0)<=0.15, 'dur0='+dur0+' dur1='+(se1.e-se1.s));
  ok('window drag moves both ends by the same amount', Math.abs(ds-de)<=0.15, 'ds='+ds+' de='+de);
  const grab2={ x: (await fr.locator('#giffill').boundingBox()).x + fillBox.width/2, y: grab.y };
  await page.mouse.move(grab2.x, grab2.y);
  await page.mouse.down();
  await page.mouse.move(grab2.x-dx, grab2.y, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const se2=await rangeSE();
  ok('dragging the fill back restores the window', Math.abs(se2.s-se0.s)<=0.2 && Math.abs(se2.e-se0.e)<=0.2, JSON.stringify({ se0, se2 }));
  ok('window drag back keeps duration', Math.abs((se2.e-se2.s)-dur0)<=0.15, 'dur='+(se2.e-se2.s));

  await b.close();
  console.log(fail?('\n'+fail+' FAIL'):'\nALL PASS'); process.exit(fail?1:0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || (e && e.message) || e); process.exit(2); });
