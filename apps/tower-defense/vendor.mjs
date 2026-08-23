/*
 * vendor.mjs — rebuild vendor/ from the pinned oldj/html5-tower-defense commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/tower-defense/vendor.mjs
 *   TD_SRC=/path/to/checkout node apps/tower-defense/vendor.mjs
 *
 * WHAT IT PRODUCES. Original classic scripts (already page scripts, not
 * modules), English strings, getEventXY that hits a CSS-scaled canvas,
 * canvas touch, and seams so a shared map can apply a placement. No images
 * — upstream draws everything.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/oldj/html5-tower-defense.git';
const PIN = 'e3e009c7673121e98d6ff02c85fb442c774b6391'; // 2019-03-15 merge #11

const FILES = [
  'td.js',
  'td-lang.js',
  'td-event.js',
  'td-stage.js',
  'td-element.js',
  'td-obj-map.js',
  'td-obj-grid.js',
  'td-obj-building.js',
  'td-obj-monster.js',
  'td-obj-panel.js',
  'td-data-stage-1.js',
  'td-cfg-buildings.js',
  'td-cfg-monsters.js',
  'td-render-buildings.js',
  'td-msg-en.js',
  'td-walk.js',
];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

function mustReplace(src, find, replace, why) {
  if (typeof find === 'string') {
    if (!src.includes(find)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
    return src.split(find).join(replace);
  }
  if (!find.test(src)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
  return src.replace(find, replace);
}

let src = process.env.TD_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'html5-td-'));
  src = join(tmp, 'html5-tower-defense');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'License.md'), join(out, 'COPYING.txt'));

for (const name of FILES) {
  copyFileSync(join(src, 'src', 'js', name), join(out, name));
}

// --- td.js: retina cap, CSS-scaled + touch hit testing, expose _TD.game ---
{
  let js = readFileSync(join(out, 'td.js'), 'utf8');
  js = mustReplace(
    js,
    '\tretina: window.devicePixelRatio || 1,\n',
    '\tretina: Math.min(window.devicePixelRatio || 1, 2),\n',
    'cap retina at 2',
  );
  js = mustReplace(
    js,
    `\t\t\tgetEventXY: function (e) {
\t\t\t\tvar wra = TD.lang.$e("wrapper"),
\t\t\t\t\tx = e.clientX - wra.offsetLeft - this.canvas.offsetLeft + Math.max(document.documentElement.scrollLeft, document.body.scrollLeft),
\t\t\t\t\ty = e.clientY - wra.offsetTop - this.canvas.offsetTop + Math.max(document.documentElement.scrollTop, document.body.scrollTop);

\t\t\t\treturn [x * _TD.retina, y * _TD.retina];
\t\t\t},`,
    `\t\t\tgetEventXY: function (e) {
\t\t\t\tvar t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
\t\t\t\tvar rect = this.canvas.getBoundingClientRect();
\t\t\t\tvar sx = this.canvas.width / Math.max(1, rect.width);
\t\t\t\tvar sy = this.canvas.height / Math.max(1, rect.height);
\t\t\t\tvar x = (t.clientX - rect.left) * sx;
\t\t\t\tvar y = (t.clientY - rect.top) * sy;
\t\t\t\treturn [x, y];
\t\t\t},`,
    'getEventXY uses the canvas box',
  );
  js = mustReplace(
    js,
    `\t\t\t\tthis.canvas.onmousemove = function (e) {
\t\t\t\t\tvar xy = _this.getEventXY.call(_this, e);
\t\t\t\t\t_this.hover(xy[0], xy[1]);
\t\t\t\t};
\t\t\t\tthis.canvas.onclick = function (e) {
\t\t\t\t\tvar xy = _this.getEventXY.call(_this, e);
\t\t\t\t\t_this.click(xy[0], xy[1]);
\t\t\t\t};`,
    `\t\t\t\tthis.canvas.onmousemove = function (e) {
\t\t\t\t\tvar xy = _this.getEventXY.call(_this, e);
\t\t\t\t\t_this.hover(xy[0], xy[1]);
\t\t\t\t};
\t\t\t\tthis.canvas.onclick = function (e) {
\t\t\t\t\tvar xy = _this.getEventXY.call(_this, e);
\t\t\t\t\t_this.click(xy[0], xy[1]);
\t\t\t\t};
\t\t\t\tthis.canvas.addEventListener("touchstart", function (e) {
\t\t\t\t\tif (e.preventDefault) e.preventDefault();
\t\t\t\t\tvar xy = _this.getEventXY.call(_this, e);
\t\t\t\t\t_this.hover(xy[0], xy[1]);
\t\t\t\t\t_this.click(xy[0], xy[1]);
\t\t\t\t}, { passive: false });
\t\t\t\tthis.canvas.addEventListener("touchmove", function (e) {
\t\t\t\t\tif (e.preventDefault) e.preventDefault();
\t\t\t\t\tvar xy = _this.getEventXY.call(_this, e);
\t\t\t\t\t_this.hover(xy[0], xy[1]);
\t\t\t\t}, { passive: false });`,
    'canvas touchstart/move',
  );
  js = mustReplace(
    js,
    '\t\tTD.init(td_board);\n\t}\n};',
    '\t\tTD.init(td_board);\n\t\t_TD.game = TD;\n\t}\n};',
    'expose _TD.game',
  );
  if (js.includes('wra.offsetLeft')) throw new Error('td.js still uses wrapper offsets');
  if (!js.includes('_TD.game = TD')) throw new Error('td.js does not expose _TD.game');
  writeFileSync(join(out, 'td.js'), js);
}

// --- td-obj-grid.js: placements go through TDHooks.onPlace ---
{
  let js = readFileSync(join(out, 'td-obj-grid.js'), 'utf8');
  js = mustReplace(
    js,
    `\t\t\t\t} else {
\t\t\t\t\t// 购买建筑
\t\t\t\t\tthis.buyBuilding(this.map.pre_building.type);
\t\t\t\t}`,
    `\t\t\t\t} else {
\t\t\t\t\t// 购买建筑
\t\t\t\t\tvar _ptype = this.map.pre_building.type;
\t\t\t\t\tvar _cost = TD.getDefaultBuildingAttributes(_ptype).cost || 0;
\t\t\t\t\tif (TD.money < _cost) {
\t\t\t\t\t\tthis.scene.panel.balloontip.msg(TD._t("not_enough_money", [_cost]), this);
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tif (window.TDHooks && window.TDHooks.onPlace) {
\t\t\t\t\t\tif (window.TDHooks.onPlace(this.mx, this.my, _ptype) === false) return;
\t\t\t\t\t}
\t\t\t\t\tthis.buyBuilding(_ptype);
\t\t\t\t\tif (this.building && window.TDHooks && window.TDHooks.meId) {
\t\t\t\t\t\tthis.building.owner = window.TDHooks.meId();
\t\t\t\t\t}
\t\t\t\t}`,
    'onClick → TDHooks.onPlace',
  );
  if (!js.includes('window.TDHooks.onPlace')) throw new Error('grid.js missing onPlace hook');
  writeFileSync(join(out, 'td-obj-grid.js'), js);
}

// --- td-obj-building.js: upgrade / sell go through TDHooks ---
{
  let js = readFileSync(join(out, 'td-obj-building.js'), 'utf8');
  js = mustReplace(
    js,
    `\t\ttryToUpgrade: function (btn) {
\t\t\tvar cost = this.getUpgradeCost(),
\t\t\t\tmsg = "";
\t\t\tif (cost > TD.money) {
\t\t\t\tmsg = TD._t("not_enough_money", [cost]);
\t\t\t} else {
\t\t\t\tTD.money -= cost;`,
    `\t\ttryToUpgrade: function (btn) {
\t\t\tvar cost = this.getUpgradeCost(),
\t\t\t\tmsg = "";
\t\t\tif (cost > TD.money) {
\t\t\t\tmsg = TD._t("not_enough_money", [cost]);
\t\t\t} else {
\t\t\t\tif (window.TDHooks && window.TDHooks.onUpgrade) {
\t\t\t\t\tif (window.TDHooks.onUpgrade(this.grid.mx, this.grid.my) === false) return;
\t\t\t\t}
\t\t\t\tTD.money -= cost;`,
    'tryToUpgrade → TDHooks.onUpgrade',
  );
  js = mustReplace(
    js,
    `\t\ttryToSell: function () {
\t\t\tif (!this.is_valid) return;

\t\t\tTD.money += this.getSellMoney();`,
    `\t\ttryToSell: function () {
\t\t\tif (!this.is_valid) return;
\t\t\tif (window.TDHooks && window.TDHooks.onSell) {
\t\t\t\tif (window.TDHooks.onSell(this.grid.mx, this.grid.my) === false) return;
\t\t\t}

\t\t\tTD.money += this.getSellMoney();`,
    'tryToSell → TDHooks.onSell',
  );
  if (!js.includes('window.TDHooks.onUpgrade') || !js.includes('window.TDHooks.onSell')) {
    throw new Error('building.js missing upgrade/sell hooks');
  }
  writeFileSync(join(out, 'td-obj-building.js'), js);
}

// --- td-obj-panel.js: slightly larger buttons; restart notifies the room ---
{
  let js = readFileSync(join(out, 'td-obj-panel.js'), 'utf8');
  js = mustReplace(
    js,
    `\t\t\tthis.width = cfg.width || 80 * _TD.retina;
\t\t\tthis.height = cfg.height || 30 * _TD.retina;`,
    `\t\t\tthis.width = cfg.width || 90 * _TD.retina;
\t\t\tthis.height = cfg.height || 36 * _TD.retina;`,
    'larger canvas buttons',
  );
  js = mustReplace(
    js,
    `\t\t\t\tonClick: function () {
\t\t\t\t\tsetTimeout(function () {
\t\t\t\t\t\tTD.stage.clear();
\t\t\t\t\t\tTD.is_paused = true;
\t\t\t\t\t\tTD.start();
\t\t\t\t\t\tTD.mouseHand(false);
\t\t\t\t\t}, 0);
\t\t\t\t}`,
    `\t\t\t\tonClick: function () {
\t\t\t\t\tsetTimeout(function () {
\t\t\t\t\t\tTD.stage.clear();
\t\t\t\t\t\tTD.is_paused = true;
\t\t\t\t\t\tTD.start();
\t\t\t\t\t\tTD.mouseHand(false);
\t\t\t\t\t\tif (window.TDHooks && window.TDHooks.onRestart) window.TDHooks.onRestart();
\t\t\t\t\t}, 0);
\t\t\t\t}`,
    'restart → TDHooks.onRestart',
  );
  writeFileSync(join(out, 'td-obj-panel.js'), js);
}

for (const name of FILES) {
  const s = readFileSync(join(out, name), 'utf8');
  if (/<\/script/i.test(s)) throw new Error(name + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(name + ' uses ESM — classic scripts only');
  }
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(s)) {
    throw new Error(name + ' talks to the network');
  }
}

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');

writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/tower-defense/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
date:     2019-03-15
license:  MIT, oldj (COPYING.txt)

Original classic scripts with these seams:
  td.js getEventXY uses the canvas box (CSS-scaled + touch)
  td.js canvas listens for touchstart/move; synthetic click is preventDefault'd
  td.js exposes _TD.game after init so the GifOS shell can talk to it
  retina capped at 2
  English strings (td-msg-en.js), not Chinese
  grid buy goes through TDHooks.onPlace
  building upgrade/sell go through TDHooks.onUpgrade / onSell
  restart notifies TDHooks.onRestart
  canvas buttons are a little larger (90×36)

sha256:
${FILES.map((n) => '  ' + n.padEnd(24) + sha(n)).join('\n')}
  COPYING.txt             ${sha('COPYING.txt')}

Notices travel INSIDE the GIF as COPYING.txt.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });

console.log('wrote apps/tower-defense/vendor/ —', FILES.length, 'scripts + COPYING');
console.log('pin', PIN.slice(0, 10));
