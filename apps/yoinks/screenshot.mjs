// Render the picking screen (upstream's download-options.png moment) into
// screenshot.png, the store cover. Runs the real index.html/style.css/app.js
// in headless Chromium with the demo hook set, no OS around it.
//   node apps/yoinks/screenshot.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium, CHROME } = require('../../test/lib/pw.js');

const css = readFileSync(join(dir, 'style.css'), 'utf8');
const js = readFileSync(join(dir, 'app.js'), 'utf8');
const html = readFileSync(join(dir, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
  .replace('<script src="app.js"></script>',
    '<script>window.YOINKS_DEMO = ' + JSON.stringify({
      phase: 'picking',
      theme: 'dark',
      instance: 'https://cobalt.example.com',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      info: { title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)', uploader: 'Rick Astley' }
    }) + ';</script><script>' + js.split('</').join('<\\/') + '</script>');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForSelector('.choices .sel');
  await page.waitForTimeout(300);
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(join(dir, 'screenshot.png'), png);
  console.log('wrote apps/yoinks/screenshot.png —', (png.length / 1024).toFixed(0), 'KB');
} finally {
  await browser.close();
}
