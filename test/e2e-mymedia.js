// My Media e2e — the default media library seeded loose on the Home Screen.
// Verifies the core: it seeds at desktop root (next to Welcome), imports images
// and audio, round-trips the raw bytes through gifos.db (Uint8Array survives),
// bakes grid thumbnails, opens each format in the right built-in player, and
// supports categorize / filter / delete. Needs a static server (BASE); no relay.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:8099';
let fail=0; const ok=(n,c,d)=>{console.log((c?'PASS':'FAIL')+' — '+n+(d?'  ('+d+')':''));if(!c)fail++;};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8Dwn4EIwDiqEAAm9gQ9Ax1z8wAAAABJRU5ErkJggg==','base64');
function wav(){ const sr=8000,n=800,b=Buffer.alloc(44+n*2); b.write('RIFF',0); b.writeUInt32LE(36+n*2,4); b.write('WAVE',8); b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40); return b; }
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

  // open it → the image player shows the real bytes (binary round-trip through gifos.db)
  await fr.locator('.card').first().click();
  await fr.locator('#stage img').waitFor({timeout:5000});
  const natW = await fr.locator('#stage img').evaluate(el=>el.naturalWidth).catch(()=>0);
  ok('image opens in the built-in player from stored bytes', natW > 0, 'naturalWidth='+natW);

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

  await b.close();
  console.log(fail?('\n'+fail+' FAIL'):'\nALL PASS'); process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL',e.message||e);process.exit(2);});
