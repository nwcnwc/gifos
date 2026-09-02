/*
 * vendor.mjs — rebuild vendor/* from the pinned svgedit npm package.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/svg-edit/vendor.mjs
 *
 * WHAT IT PRODUCES. The published IIFE editor + its CSS, with toolbar/jgraduate
 * images turned into a filename → data: URL map (boot.js resolves them at
 * runtime). GifOS inlines <script src> and DROPS type="module", so the ESM
 * graph cannot ride into an app as-is; the IIFE does.
 *
 * Persistence is NOT compiled in. boot.js / app.js hang localStorage and
 * gifos.db. Default extensions (shapes library, storage, opensave) stay out —
 * they import() extra files the sandbox cannot fetch. Drawing, undo, layers,
 * source, and export live in the IIFE.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PIN = '7.4.2';
const PKG = 'svgedit@' + PIN;

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const tmp = mkdtempSync(join(tmpdir(), 'svgedit-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 180000 });

console.log('npm pack ' + PKG + ' in ' + tmp);
run('npm', ['pack', PKG], tmp);
const tgz = readdirSync(tmp).find((n) => n.endsWith('.tgz'));
if (!tgz) throw new Error('npm pack did not emit a tarball');
run('tar', ['-xzf', tgz], tmp);
const pkg = join(tmp, 'package');
const editor = join(pkg, 'dist', 'editor');
const iifeSrc = join(editor, 'iife-Editor.js');
const cssSrc = join(editor, 'svgedit.css');
if (!existsSync(iifeSrc)) throw new Error('dist/editor/iife-Editor.js missing from ' + PKG);
if (!existsSync(cssSrc)) throw new Error('dist/editor/svgedit.css missing from ' + PKG);

function walkImages(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const here = stack.pop();
    if (!existsSync(here)) continue;
    for (const name of readdirSync(here)) {
      const p = join(here, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'extensions') continue;
        stack.push(p);
        continue;
      }
      if (MIME[extname(name).toLowerCase()]) out.push(p);
    }
  }
  return out;
}

const imageFiles = [
  ...walkImages(join(editor, 'images')),
  ...walkImages(join(editor, 'components', 'jgraduate', 'images')),
].sort();

const images = Object.create(null);
let imageBytes = 0;
for (const p of imageFiles) {
  const name = p.split(/[/\\]/).pop();
  if (images[name]) {
    throw new Error('duplicate image basename ' + name + ' — map would collide');
  }
  const ext = extname(name).toLowerCase();
  const buf = readFileSync(p);
  imageBytes += buf.length;
  images[name] = 'data:' + MIME[ext] + ';base64,' + buf.toString('base64');
}
console.log('images ' + imageFiles.length + ' files, ' + (imageBytes / 1024).toFixed(0) + ' KB raw');

let js = readFileSync(iifeSrc, 'utf8');
js = js.replace(/\n?\/\/# sourceMappingURL=.*$/m, '\n');
if (/<\/script/i.test(js)) js = js.split('</').join('<\\/');
if (/^\s*export\s|export\{|import\.meta/m.test(js)) {
  throw new Error('iife-Editor.js uses ESM syntax — the classic-script inline path cannot carry it.');
}

function dataFor(name) {
  const d = images[name];
  if (!d) throw new Error('missing image for static rewrite: ' + name);
  return d;
}

// Static CSS-in-JS urls that never go through setAttribute.
js = js.replace(/url\(\.\.\/images\/Maps\.png\)/g, () => 'url(' + JSON.stringify(dataFor('Maps.png')) + ')');
js = js.replace(/url\(\.\/components\/jgraduate\/images\/map-opacity\.png\)/g, () =>
  'url(' + JSON.stringify(dataFor('map-opacity.png')) + ')');

// Cursor files: `url("./images/cursors/${e}_cursor.svg")` — resolve at runtime.
if (!js.includes('url("./images/cursors/${e}_cursor.svg")')) {
  console.log('note: cursor url() shape moved — boot.js still intercepts style.cursor');
} else {
  js = js.replace(
    'url("./images/cursors/${e}_cursor.svg")',
    'url(""+((window.__gifosImg&&window.__gifosImg(e+"_cursor.svg"))||("./images/cursors/"+e+"_cursor.svg")))'
  );
}
const rotateNeedle = 'cursor:url(${MI.curConfig.imgPath}/rotate.svg) 12 12, auto;';
if (js.includes(rotateNeedle)) {
  js = js.replace(rotateNeedle,
    'cursor:url(""+((window.__gifosImg&&window.__gifosImg("rotate.svg"))||"./images/rotate.svg")) 12 12, auto;');
} else {
  console.log('note: rotate.svg cursor shape moved — boot.js still rewrites style urls');
}

// jPicker default path is a root-absolute URL that cannot exist in srcdoc.
js = js.replace('clientPath:`/jPicker/images/`', 'clientPath:`./images/`');

// Editor constructor: `new URL('./extensions/', document.baseURI)` throws on
// about:srcdoc (the sandbox base). Keep the relative path; boot.js also wraps URL.
{
  const extCtor = 'new URL(`./extensions/`,document.baseURI)';
  if (!js.includes(extCtor)) {
    throw new Error('extPath URL construction moved — about:srcdoc still throws on new URL(relative, document.baseURI)');
  }
  js = js.replace(
    'if(typeof document>`u`||!document.baseURI)return`./extensions`;let e=new URL(`./extensions/`,document.baseURI).toString();return e.endsWith(`/`)?e.slice(0,-1):e',
    'return`./extensions`'
  );
}

let css = readFileSync(cssSrc, 'utf8');
css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, url) => {
  const u = url.trim();
  if (/^(data:|https?:|\/\/|#)/i.test(u)) return m;
  const name = u.split('/').pop();
  if (images[name]) return 'url(' + JSON.stringify(images[name]) + ')';
  return m;
});
if (/url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('svgedit.css fetches a remote url() — that will fail under connect-src none');
}

const imagesJs = 'window.__SVGEDIT_IMAGES = ' + JSON.stringify(images) + ';\n';
if (/<\/script/i.test(imagesJs)) throw new Error('images.js contains </script');

const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });
// prompt() in the app frame. The sandbox carries no allow-modals, so
// window.prompt returns null without asking and the feature silently does not
// happen (test/unit/app-modals.js). The five places the editor asks for a
// string — image URL, hyperlink, new/clone/rename layer — are rewritten to
// take the answer late from gifosAsk (boot.js), the same async dialog piskel
// uses. Each patch must match exactly once; a moved pin that changes the
// text fails here rather than shipping a prompt() that does nothing.
const PROMPT_PATCHES = [
  ["let n=prompt(this.editor.i18next.t(`notification.enterNewImgURL`),t);n?this.setImageURL(n):e&&this.editor.svgCanvas.deleteSelectedElements()}",
   "window.gifosAsk(this.editor.i18next.t(`notification.enterNewImgURL`),t).then(n=>{n?this.setImageURL(n):e&&this.editor.svgCanvas.deleteSelectedElements()})}"],
  ["let e=prompt(this.editor.i18next.t(`notification.enterNewLinkURL`),`http://`);e&&this.editor.svgCanvas.makeHyperlink(e)}",
   "window.gifosAsk(this.editor.i18next.t(`notification.enterNewLinkURL`),`http://`).then(e=>{e&&this.editor.svgCanvas.makeHyperlink(e)})}"],
  ["let n=prompt(this.editor.i18next.t(`notification.enterUniqueLayerName`),e);if(n){if(this.editor.svgCanvas.getCurrentDrawing().hasLayer(n)){alert(this.editor.i18next.t(`notification.dupeLayerName`));return}this.editor.svgCanvas.createLayer(n),this.updateContextPanel(),this.populateLayers()}}",
   "window.gifosAsk(this.editor.i18next.t(`notification.enterUniqueLayerName`),e).then(n=>{if(n){if(this.editor.svgCanvas.getCurrentDrawing().hasLayer(n)){alert(this.editor.i18next.t(`notification.dupeLayerName`));return}this.editor.svgCanvas.createLayer(n),this.updateContextPanel(),this.populateLayers()}})}"],
  ["t=prompt(this.editor.i18next.t(`notification.enterUniqueLayerName`),e);if(t){if(this.editor.svgCanvas.getCurrentDrawing().hasLayer(t)){alert(this.editor.i18next.t(`notification.dupeLayerName`));return}this.editor.svgCanvas.cloneLayer(t),this.updateContextPanel(),this.populateLayers()}}",
   "t=e;window.gifosAsk(this.editor.i18next.t(`notification.enterUniqueLayerName`),e).then(t=>{if(t){if(this.editor.svgCanvas.getCurrentDrawing().hasLayer(t)){alert(this.editor.i18next.t(`notification.dupeLayerName`));return}this.editor.svgCanvas.cloneLayer(t),this.updateContextPanel(),this.populateLayers()}})}"],
  ["n=prompt(this.editor.i18next.t(`notification.enterNewLayerName`),``);if(n){if(t===n||this.editor.svgCanvas.getCurrentDrawing().hasLayer(n)){alert(this.editor.i18next.t(`notification.layerHasThatName`));return}this.editor.svgCanvas.renameCurrentLayer(n),this.populateLayers()}}",
   "n=``;window.gifosAsk(this.editor.i18next.t(`notification.enterNewLayerName`),``).then(n=>{if(n){if(t===n||this.editor.svgCanvas.getCurrentDrawing().hasLayer(n)){alert(this.editor.i18next.t(`notification.layerHasThatName`));return}this.editor.svgCanvas.renameCurrentLayer(n),this.populateLayers()}})}"],
];
for (const [from, to] of PROMPT_PATCHES) {
  if (js.split(from).length !== 2) throw new Error('prompt() patch did not match exactly once: ' + from.slice(0, 60));
  js = js.replace(from, to);
}
writeFileSync(join(outDir, 'iife-Editor.js'), js);
writeFileSync(join(outDir, 'svgedit.css'), css);
writeFileSync(join(outDir, 'images.js'), imagesJs);
copyFileSync(join(pkg, 'LICENSE-MIT.txt'), join(outDir, 'COPYING.txt'));
copyFileSync(join(pkg, 'AUTHORS'), join(outDir, 'AUTHORS.txt'));
const apache = join(pkg, 'src', 'editor', 'components', 'jgraduate', 'LICENSE-Apache2.0.txt');
if (existsSync(apache)) copyFileSync(apache, join(outDir, 'COPYING-Apache-2.0.txt'));

writeFileSync(join(outDir, 'UPSTREAM.txt'),
  'vendor/iife-Editor.js is GENERATED. Do not edit it; run node apps/svg-edit/vendor.mjs.\n\n' +
  'upstream: https://github.com/SVG-Edit/svgedit\n' +
  'npm:      ' + PKG + '\n' +
  'entry:    dist/editor/iife-Editor.js (classic IIFE, window.Editor)\n' +
  'images:   dist/editor/images + jgraduate, inlined as vendor/images.js\n' +
  'store:    gifos.db via boot.js / app.js (noDefaultExtensions, noStorageOnLoad)\n\n' +
  'SVG-Edit is MIT (COPYING.txt). jGraduate / context menu are Apache-2.0\n' +
  '(COPYING-Apache-2.0.txt). The IIFE also bundles i18next, elix, html2canvas,\n' +
  'jsPDF and svg2pdf (MIT). Notices travel inside the GIF.\n');

console.log('wrote apps/svg-edit/vendor/iife-Editor.js — ' +
  (Buffer.byteLength(js) / 1024 / 1024).toFixed(2) + ' MB JS, ' +
  (Buffer.byteLength(imagesJs) / 1024 / 1024).toFixed(2) + ' MB images map, from ' + PKG);
rmSync(tmp, { recursive: true, force: true });
