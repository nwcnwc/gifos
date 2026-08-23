/*
 * vendor.mjs — rebuild vendor/ from the pinned Kully/pixel-paint commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/pixel-paint/vendor.mjs
 *   PIXELPAINT_SRC=/path/to/checkout node apps/pixel-paint/vendor.mjs
 *
 * WHAT IT PRODUCES. Original classic scripts + CSS, with toolbar/cursor images
 * as data URLs (inlined stylesheets cannot resolve a relative url()), tool
 * dispatch by STATE.activeTool (filenames vanish once the cursor is a data
 * URL), Save_Canvas_State / undo / redo hooked so a shared board can see the
 * pixels, and a PixelPaint.* API at the end of script.js.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/Kully/pixel-paint.git';
const PIN = '6dca77a1882ac55ef45bbfb299051d93c35b7113'; // 2026-05-12 "reroute appreciation link"

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

function mustReplace(src, find, replace, why) {
  if (typeof find === 'string') {
    if (!src.includes(find)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
    return src.split(find).join(replace);
  }
  if (!find.test(src)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
  return src.replace(find, replace);
}

function dataUrl(abs) {
  if (!existsSync(abs)) throw new Error('missing asset ' + abs);
  return 'data:image/png;base64,' + readFileSync(abs).toString('base64');
}

let src = process.env.PIXELPAINT_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'pixel-paint-'));
  src = join(tmp, 'pixel-paint');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

mkdirSync(join(out, 'js'), { recursive: true });
copyFileSync(join(src, 'LICENSE.md'), join(out, 'COPYING-pixel-paint.txt'));

const IMG = {
  undo: dataUrl(join(src, 'img', 'undo.png')),
  redo: dataUrl(join(src, 'img', 'redo.png')),
  pencil: dataUrl(join(src, 'img', 'pencil.png')),
  selection: dataUrl(join(src, 'img', 'selection.png')),
  fill: dataUrl(join(src, 'img', 'fill.png')),
  eraserBig: dataUrl(join(src, 'img', 'eraserBig.png')),
  eraser: dataUrl(join(src, 'img', 'eraser.png')),
  colorpicker: dataUrl(join(src, 'img', 'colorpicker.png')),
  grid: dataUrl(join(src, 'img', 'grid.png')),
  floppy: dataUrl(join(src, 'img', 'floppy.png')),
};

let css = readFileSync(join(src, 'main.css'), 'utf8');
css = css.split("font-family: 'Open Sans', sans-serif;").join(
  'font-family: system-ui, -apple-system, Segoe UI, sans-serif;',
);
if (css.includes('Open Sans')) throw new Error('Open Sans still in CSS — Google Fonts must not load');
const cssImgs = {
  'undo.png': IMG.undo,
  'redo.png': IMG.redo,
  'pencil.png': IMG.pencil,
  'selection.png': IMG.selection,
  'fill.png': IMG.fill,
  'eraserBig.png': IMG.eraserBig,
  'colorpicker.png': IMG.colorpicker,
  'grid.png': IMG.grid,
  'floppy.png': IMG.floppy,
};
for (const [name, url] of Object.entries(cssImgs)) {
  css = mustReplace(css, 'url(img/' + name + ')', 'url("' + url + '")', 'css ' + name);
}
css = mustReplace(
  css,
  '#canvas-div {\n	position: relative;',
  '#canvas-div {\n	touch-action: none;\n	position: relative;',
  'touch-action none on canvas',
);
if (/url\(\s*['"]?img\//.test(css)) throw new Error('vendor CSS still has a relative img/ url');
writeFileSync(join(out, 'main.css'), css);

let tools = readFileSync(join(src, 'js', 'tools.js'), 'utf8');
tools = mustReplace(tools, '"hotkey": "KeyN"', '"hotkey": "KeyP"', 'pencil hotkey matches the Shortcuts table (P)');
tools = mustReplace(tools, 'url("img/pencil.png")', 'url("' + IMG.pencil + '")', 'pencil cursor data URL');
tools = mustReplace(tools, 'url("img/fill.png")', 'url("' + IMG.fill + '")', 'fill cursor data URL');
tools = mustReplace(tools, 'url("img/eraser.png")', 'url("' + IMG.eraser + '")', 'eraser cursor data URL');
tools = mustReplace(tools, 'url("img/colorpicker.png")', 'url("' + IMG.colorpicker + '")', 'colorpicker cursor data URL');
tools = mustReplace(
  tools,
  `function Get_Tool_Action_Callback()
{
	const cursor = Get_Cursor();
	if (cursor.includes("eraser.png")) {
		return function (cell) {
			cell.style.backgroundColor = CANVAS_INIT_COLOR;
		};
	} else if (cursor.includes("pencil.png")) {
		return function (cell) {
			cell.style.backgroundColor = STATE[ACTIVE_COLOR_SELECT];
		};
	} else if (cursor.includes("fill.png")) {
		return function (cell) {
			// Fill tool action can be defined here if needed
		};
	} else if (cursor.includes("colorpicker.png")) {
		return function (cell) {
			const pickedColor = cell.style.backgroundColor;
			STATE[ACTIVE_COLOR_SELECT] = pickedColor;
			Update_Active_Color_Preview();
			Update_Active_Color_Label();
		};
	} else if (cursor.includes("selection.png")) {
		return function (cell) {
			// Selection tool action can be defined here if needed
		};
	} else {
		console.warn("Unknown tool action");
		return function (cell) {
			// Do nothing for unknown tool action
		};
	}
}`,
  `function Get_Tool_Action_Callback()
{
	// Dispatch on the tool name, not the cursor url — cursors are data URLs
	// now, so they no longer contain "pencil.png".
	const tool = STATE["activeTool"];
	if (tool === "eraser") {
		return function (cell) {
			cell.style.backgroundColor = CANVAS_INIT_COLOR;
		};
	} else if (tool === "pencil") {
		return function (cell) {
			cell.style.backgroundColor = STATE[ACTIVE_COLOR_SELECT];
		};
	} else if (tool === "fill") {
		return function (cell) {
		};
	} else if (tool === "colorpicker") {
		return function (cell) {
			const pickedColor = cell.style.backgroundColor;
			STATE[ACTIVE_COLOR_SELECT] = pickedColor;
			Update_Active_Color_Preview();
			Update_Active_Color_Label();
		};
	} else if (tool === "selection") {
		return function (cell) {
		};
	} else {
		return function (cell) {
		};
	}
}`,
  'tool dispatch by activeTool',
);
if (tools.includes('img/')) throw new Error('tools.js still mentions img/');
writeFileSync(join(out, 'js', 'tools.js'), tools);

let events = readFileSync(join(src, 'js', 'eventHandlers.js'), 'utf8');
events = mustReplace(
  events,
  `		canvasCells[i].addEventListener("mouseup", function (e) {
			let cursor = Get_Cursor();
			if (cursor.includes("fill.png")) {`,
  `		canvasCells[i].addEventListener("mouseup", function (e) {
			let cursor = Get_Cursor();
			if (STATE["activeTool"] === "fill") {`,
  'fill by activeTool',
);
events = mustReplace(
  events,
  `		canvasCells[i].addEventListener("click", function (e) {
			let cursor = Get_Cursor();
			if (cursor.includes("colorpicker.png")) {`,
  `		canvasCells[i].addEventListener("click", function (e) {
			let cursor = Get_Cursor();
			if (STATE["activeTool"] === "colorpicker") {`,
  'colorpicker by activeTool',
);
if (events.includes('.png"))') && /includes\("[^"]+\.png"\)/.test(events)) {
  throw new Error('eventHandlers.js still dispatches on a .png filename');
}
writeFileSync(join(out, 'js', 'eventHandlers.js'), events);

let hist = readFileSync(join(src, 'js', 'historyStates.js'), 'utf8');
hist = mustReplace(
  hist,
  `function Save_Canvas_State()
{
	let canvasPixels = Get_Canvas_Pixels();
	HISTORY_STATES.pushToPtr(canvasPixels);
}`,
  `function Save_Canvas_State()
{
	let canvasPixels = Get_Canvas_Pixels();
	HISTORY_STATES.pushToPtr(canvasPixels);
	if (window.PixelPaint && window.PixelPaint.onChanged) window.PixelPaint.onChanged(canvasPixels);
}`,
  'Save_Canvas_State → onChanged',
);
writeFileSync(join(out, 'js', 'historyStates.js'), hist);

let script = readFileSync(join(src, 'js', 'script.js'), 'utf8');
script = mustReplace(
  script,
  `function Undo()
{
    HISTORY_STATES.decPtr();
    Transfer_Canvas_State_To_Screen(HISTORY_STATES.ptr);
}

function Redo()
{
    HISTORY_STATES.incPtr();
    Transfer_Canvas_State_To_Screen(HISTORY_STATES.ptr);
}`,
  `function Undo()
{
    HISTORY_STATES.decPtr();
    Transfer_Canvas_State_To_Screen(HISTORY_STATES.ptr);
    if (window.PixelPaint && window.PixelPaint.onChanged) window.PixelPaint.onChanged(Get_Canvas_Pixels());
}

function Redo()
{
    HISTORY_STATES.incPtr();
    Transfer_Canvas_State_To_Screen(HISTORY_STATES.ptr);
    if (window.PixelPaint && window.PixelPaint.onChanged) window.PixelPaint.onChanged(Get_Canvas_Pixels());
}`,
  'undo/redo → onChanged',
);
script += `
window.PixelPaint = window.PixelPaint || {};
window.PixelPaint.pack = function () { return Get_Canvas_Pixels(); };
window.PixelPaint.replace = function (pixels) {
	if (!pixels) return;
	var cells = document.querySelectorAll(".canvasCell");
	var n = Math.min(cells.length, pixels.length);
	for (var i = 0; i < n; i++) cells[i].style.backgroundColor = pixels[i];
};
window.PixelPaint.empty = function () { Reset_Color_Of_Canvas_Cells(); };
window.PixelPaint.size = CELLS_PER_ROW * CELLS_PER_ROW;
window.PixelPaint.row = CELLS_PER_ROW;
if (window.PixelPaint.onReady) window.PixelPaint.onReady();

(function () {
	var drawing = false;
	function cellFromTouch(t) {
		var el = document.elementFromPoint(t.clientX, t.clientY);
		if (!el) return null;
		if (el.classList && el.classList.contains("canvasCell")) return el;
		return el.closest ? el.closest("div.canvasCell") : null;
	}
	function mouse(type, t, target) {
		var ev = new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			view: window,
			clientX: t.clientX,
			clientY: t.clientY,
			button: 0,
			buttons: type === "mouseup" ? 0 : 1
		});
		(target || document.getElementById("canvas-div")).dispatchEvent(ev);
	}
	var canvasDiv = document.getElementById("canvas-div");
	if (!canvasDiv) return;
	canvasDiv.addEventListener("touchstart", function (e) {
		e.preventDefault();
		drawing = true;
		var t = e.changedTouches[0];
		var cell = cellFromTouch(t);
		if (cell) mouse("mousedown", t, cell);
	}, { passive: false });
	canvasDiv.addEventListener("touchmove", function (e) {
		e.preventDefault();
		if (!drawing) return;
		var t = e.changedTouches[0];
		var cell = cellFromTouch(t);
		if (cell) mouse("mousemove", t, cell);
	}, { passive: false });
	function end(e) {
		e.preventDefault();
		var t = e.changedTouches[0];
		var cell = cellFromTouch(t);
		if (cell) mouse("mouseup", t, cell);
		else document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		drawing = false;
	}
	canvasDiv.addEventListener("touchend", end, { passive: false });
	canvasDiv.addEventListener("touchcancel", end, { passive: false });
})();
`;
if (script.includes('https://') || script.includes('http://')) {
  throw new Error('script.js still has an http URL');
}
writeFileSync(join(out, 'js', 'script.js'), script);

for (const name of ['palette.js', 'algo.js', 'utils.js']) {
  const body = readFileSync(join(src, 'js', name), 'utf8');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(body)) {
    throw new Error(name + ' uses ESM — classic scripts only');
  }
  writeFileSync(join(out, 'js', name), body);
}

const JS = ['tools.js', 'palette.js', 'algo.js', 'historyStates.js', 'eventHandlers.js', 'utils.js', 'script.js'];
for (const name of JS) {
  const body = readFileSync(join(out, 'js', name), 'utf8');
  if (/<\/script/i.test(body)) throw new Error(name + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(body)) {
    throw new Error(name + ' uses ESM — classic scripts only');
  }
  if (name !== 'script.js' && (body.includes('fetch(') || body.includes('XMLHttpRequest') || body.includes('WebSocket'))) {
    throw new Error(name + ' has a network call');
  }
}
if (!readFileSync(join(out, 'js', 'script.js'), 'utf8').includes('window.PixelPaint')) {
  throw new Error('script.js does not expose PixelPaint');
}

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/pixel-paint/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
date:     2026-05-12
license:  MIT, Adam Kulidjian / Kully (COPYING-pixel-paint.txt)

js/* are the original page scripts with these seams:
  toolbar + cursor images are data URLs (inlined CSS cannot resolve url())
  tools dispatch on STATE.activeTool, not a .png filename in the cursor
  pencil hotkey is KeyP (matches the Shortcuts table; upstream said KeyN)
  Save_Canvas_State / Undo / Redo call PixelPaint.onChanged
  PixelPaint.pack / replace / empty / size appended at end of script.js
  touchstart/move/end synthesize mouse events on the cell under the finger

main.css is the original with Open Sans dropped (system fonts) and img/
urls inlined as data URLs, plus touch-action: none on the canvas.

sha256:
  js/tools.js          ${sha('js/tools.js')}
  js/palette.js        ${sha('js/palette.js')}
  js/algo.js           ${sha('js/algo.js')}
  js/historyStates.js  ${sha('js/historyStates.js')}
  js/eventHandlers.js  ${sha('js/eventHandlers.js')}
  js/utils.js          ${sha('js/utils.js')}
  js/script.js         ${sha('js/script.js')}
  main.css             ${sha('main.css')}
  COPYING              ${sha('COPYING-pixel-paint.txt')}

The notice travels INSIDE the GIF as COPYING-pixel-paint.txt.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });

console.log('wrote apps/pixel-paint/vendor/ — classic scripts + inlined toolbar icons + COPYING');
console.log('pin', PIN.slice(0, 10), 'script.js', sha('js/script.js').slice(0, 12) + '…');
