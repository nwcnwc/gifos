const fs = require('fs');
let chromium; try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e) { ({ chromium } = require('playwright')); }
const CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const net = fs.readFileSync('/home/nathan/projects/gifos/site/js/gifos-net.js', 'utf8');
const media = fs.readFileSync('/home/nathan/projects/gifos/site/js/mesh-media.js', 'utf8');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setContent('<body style="margin:0;background:#222"><canvas id="out" width="640" height="400"></canvas></body>');
  await p.addScriptTag({ content: net });
  await p.addScriptTag({ content: media });
  await p.evaluate(async () => {
    const M = GifOS.meshMedia;
    // three fake "faces": colored canvases with a face-ish blob
    const face = (hue) => { const c = document.createElement('canvas'); c.width = 300; c.height = 300; const x = c.getContext('2d');
      x.fillStyle = 'hsl(' + hue + ',30%,55%)'; x.fillRect(0, 0, 300, 300);
      x.fillStyle = 'hsl(' + hue + ',45%,72%)'; x.beginPath(); x.arc(150, 150, 90, 0, 7); x.fill(); return c; };
    const pk = M.createPacker({ shape: 'grid', cell: 150 }).start();
    pk.setTile('a', 0, face(20), null, { n: 1, cols: 1, lbl: { name: 'Priya Nair', hand: false, talking: true } });
    pk.setTile('b', 1, face(140), null, { n: 1, cols: 1, lbl: { name: 'Hiroshi Aoki', hand: true, talking: false } });
    pk.setTile('c', 2, face(260), null, { n: 1, cols: 1, lbl: { name: 'A Really Long Name That Truncates', hand: false, talking: false } });
    pk.setTile('d', 3, face(320), null, { n: 1, cols: 1, lbl: { name: 'Mei', hand: true, talking: true } });
    await new Promise((r) => setTimeout(r, 600));
    const out = document.getElementById('out'); const ox = out.getContext('2d');
    ox.fillStyle = '#222'; ox.fillRect(0, 0, 640, 400);
    ox.drawImage(pk.canvas, 20, 20, pk.canvas.width, pk.canvas.height);
    window.__packDims = { w: pk.canvas.width, h: pk.canvas.height, faces: pk.count(), cols: pk.cols() };
  });
  console.log(JSON.stringify(await p.evaluate(() => window.__packDims)));
  await p.locator('#out').screenshot({ path: '/tmp/claude-1000/-home-nathan-projects-gifos/1270a1af-99d6-4f5c-b245-2a1eb40656dd/scratchpad/overlay-render.png' });
  await b.close(); process.exit(0);
})();
