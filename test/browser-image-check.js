// Verify the generated GIF is a valid, displayable image in real Chromium.
// Run node test/node-roundtrip.js first to produce test/sample.gif.
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const dataUrl = 'data:image/gif;base64,' + fs.readFileSync(path.join(__dirname, 'sample.gif')).toString('base64');
  const res = await page.evaluate((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ ok: false });
    img.src = src;
  }), dataUrl);
  console.log('browser image decode:', JSON.stringify(res));
  await browser.close();
  process.exit(res.ok && res.w === 32 && res.h === 32 ? 0 : 1);
})();
