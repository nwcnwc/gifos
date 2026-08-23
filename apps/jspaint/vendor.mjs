/*
 * vendor.mjs — rebuild vendor/* from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline and byte-reproducible from
 * what is committed here. Run this only to move the pin.
 *
 *   node apps/jspaint/vendor.mjs
 *   JSPAINT_SRC=/path/to/checkout node apps/jspaint/vendor.mjs
 *
 * WHAT IT PRODUCES. Classic scripts + one CSS file + a small assets map.
 * Upstream is ES modules; GifOS's runtime inlines <script src> by rewriting
 * the tag, which DROPS type="module" (see buildAppHtml in site/js/runtime.js),
 * so ES module semantics do not survive the trip into an app. Two IIFEs do:
 * vendor/core.js (everything app-state.js needs on window) then vendor/app.js
 * (the UI), with src/app-state.js — still a classic script — in between, the
 * same order upstream used.
 *
 * Persistence is NOT compiled in. boot.js is ordinary source and hangs a
 * localStorage stand-in; the patches below point upstream at that.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/1j01/jspaint.git';
const PIN = '53be67ab8c47cc0d2168899e7481bc04839c4c81'; // master, 2026-04-09 "Enable macOS build"

const run = (cmd, args, cwd, opts = {}) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 900000, ...opts });

let src = process.env.JSPAINT_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'jspaint-'));
  src = join(tmp, 'jspaint');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

const MIME = {
  png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  svg: 'image/svg+xml', ico: 'image/x-icon', css: 'text/css',
  woff: 'font/woff', woff2: 'font/woff2',
};

function dataUrlFor(rel) {
  const abs = join(src, rel);
  if (!existsSync(abs)) throw new Error('missing asset ' + rel);
  const ext = extname(rel).slice(1).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(abs).toString('base64');
}

function rewriteCssUrls(css, fromFile) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, url) => {
    const u = url.trim();
    if (/^(data:|https?:|\/\/|#)/i.test(u)) return m;
    const resolved = posix.normalize(posix.join(posix.dirname(fromFile.replace(/\\/g, '/')), u));
    try { return 'url("' + dataUrlFor(resolved) + '")'; }
    catch { return m; }
  });
}

function flattenCss(file, seen = new Set()) {
  const norm = file.replace(/\\/g, '/');
  if (seen.has(norm)) return '';
  seen.add(norm);
  const abs = join(src, norm);
  if (!existsSync(abs)) throw new Error('missing css ' + norm);
  let css = readFileSync(abs, 'utf8');
  css = css.replace(/@import\s+(?:url\(\s*)?['"]?([^'" )]+)['"]?\s*\)?\s*;/g, (m, p) => {
    const resolved = posix.normalize(posix.join(posix.dirname(norm), p));
    return flattenCss(resolved, seen);
  });
  return rewriteCssUrls(css, norm);
}

function rewriteStaticAssetStrings(js) {
  return js.replace(/(["'`])((?:images|help)\/[^"'`$]+)\1/g, (m, q, path) => {
    if (path.includes('${')) return m;
    try { return q + dataUrlFor(path) + q; }
    catch { return m; }
  });
}

// PATCHES WE CARRY, applied to upstream's SOURCE before the build. Fail loud
// if upstream moved the code — a silent skip would drop the GifOS seam.
const PATCHES = [
  {
    file: 'src/storage.js',
    find: /const item = localStorage\.getItem\(key\);/g,
    replace: () => 'const item = (window.localStorage && window.localStorage.getItem(key));',
    why: 'read through the gifos.db-backed Storage stand-in in boot.js',
  },
  {
    file: 'src/storage.js',
    find: /localStorage\.setItem\(key, JSON\.stringify\(value\)\);/,
    replace: () => 'window.localStorage.setItem(key, JSON.stringify(value));',
    why: 'write through the gifos.db-backed Storage stand-in in boot.js',
  },
  {
    file: 'src/helpers.js',
    find: /return `url\(images\/cursors\/\$\{name\}\.png\) \$\{coords\.join\(" "\)\}, \$\{fallback\}`;/,
    replace: () => 'return `url(${(window.GIFOS_CURSORS && window.GIFOS_CURSORS[name]) || ""}) ${coords.join(" ")}, ${fallback}`;',
    why: 'cursors are data URLs; the sandbox has no files to fetch',
  },
  {
    file: 'src/helpers.js',
    find: /icon_img\.src = `help\/\$\{file_name\}`;/,
    replace: () => 'icon_img.src = (window.GIFOS_HELP && window.GIFOS_HELP[file_name]) || "";',
    why: 'history icons are data URLs',
  },
  {
    file: 'src/helpers.js',
    find: /Promise\.all\(tools\.map\(\(tool\) => load_image_simple\(`help\/\$\{tool\.help_icon\}`\)\)\)/,
    replace: () => 'Promise.all(tools.map((tool) => load_image_simple((window.GIFOS_HELP && window.GIFOS_HELP[tool.help_icon]) || "")))',
    why: 'multi-tool history icon uses the same data-URL table',
  },
  {
    file: 'src/msgbox.js',
    find: /`images\/\$\{iconID\}-32x32-8bpp\.png`/,
    replace: () => '(window.GIFOS_ASSETS && window.GIFOS_ASSETS["images/" + iconID + "-32x32-8bpp.png"]) || ""',
    why: 'message-box icons are data URLs',
  },
  {
    file: 'src/functions.js',
    find: /src: `images\/transforms\/\$\{img_src\}\.png`/,
    replace: () => 'src: (window.GIFOS_ASSETS && window.GIFOS_ASSETS["images/transforms/" + img_src + ".png"]) || ""',
    why: 'flip/rotate dialog art is data URLs',
  },
  {
    file: 'src/functions.js',
    find: /async function load_image_from_uri\(uri\) \{/,
    replace: () => `async function load_image_from_uri(uri) {
	if (typeof uri === "string" && /^data:/i.test(uri)) {
		const blob = dataUriToBlob(uri);
		return await new Promise((resolve, reject) => {
			read_image_file(blob, (error, info) => error ? reject(error) : resolve(info));
		});
	}
	if (typeof uri === "string" && /^blob:/i.test(uri)) {
		return await new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ file_format: "image/png", image: img, source_blob: null });
			img.onerror = () => reject(new Error("failed to load blob image"));
			img.src = uri;
		});
	}
	if (typeof uri === "string" && /^(https?:|\\/\\/)/i.test(uri)) {
		const error = new Error("this local copy of JS Paint cannot load pictures from the web");
		error.code = "access-failure";
		throw error;
	}
`,
    why: 'data: URIs must not go through fetch (connect-src none); http is refused',
  },
  {
    file: 'src/functions.js',
    find: /const is_blob_uri = uri\.match\(\/\^blob:\/i\);/,
    replace: () => `function dataUriToBlob(u) {
		if (/^blob:/i.test(u)) {
			throw new Error("blob URIs are loaded via Image, not here");
		}
		const comma = u.indexOf(",");
		const header = u.slice(5, comma);
		const body = u.slice(comma + 1);
		const mime = (header.split(";")[0] || "application/octet-stream");
		const bytes = /;base64/i.test(header) ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
		return new Blob([bytes], { type: mime });
	}
	const is_blob_uri = uri.match(/^blob:/i);`,
    why: 'turn a data URL into a Blob without fetch',
  },
  {
    file: 'src/sessions.js',
    find: /if \(is_discord_embed\) \{[\s\S]*?update_session_from_location_hash\(\);\n\}/,
    replace: () => `if (window.__gifosReady) {
	window.__gifosReady.then(() => {
		end_current_session();
		current_session = new LocalSession("gifos");
	});
} else {
	current_session = new LocalSession("gifos");
}`,
    why: 'one local canvas, restored after gifos.db loads; no Firebase, no URL hash',
  },
  {
    file: 'src/sessions.js',
    find: /const new_local_session = \(\) => \{\n\tend_current_session\(\);\n\tlog\("Changing URL to start new session\.\.\."\);\n\tchange_url_param\("local", generate_session_id\(\)\);\n\};/,
    replace: () => `const new_local_session = () => {
	end_current_session();
	current_session = new LocalSession("gifos");
};`,
    why: 'File > New must not try to rewrite the iframe URL',
  },
  {
    file: 'src/app-localization.js',
    find: /const available_languages = \[[^\]]+\];/,
    replace: () => 'const available_languages = ["en"];',
    why: 'localization JSON is not shipped; English is the language of this copy',
  },
  {
    file: 'src/msgbox.js',
    find: /const CHORD_WAV_URL = "audio\/chord\.wav";/,
    replace: () => 'const CHORD_WAV_URL = (window.GIFOS_ASSETS && window.GIFOS_ASSETS["audio/chord.wav"]) || "";',
    why: 'error ding is a data URL; the sandbox has no files to fetch',
  },
  {
    file: 'src/functions.js',
    find: /function file_load_from_url\(\) \{/,
    replace: () => `function file_load_from_url() {
	showMessageBox({ message: "This local copy of JS Paint cannot load pictures from the web. Use File > Open to pick a file on this device." });
	return;`,
    why: 'File > Load From URL is refused; no fetch, no CORS proxy',
  },
  {
    file: 'src/functions.js',
    find: /function render_history_as_gif\(\) \{/,
    replace: () => `function render_history_as_gif() {
	showMessageBox({ message: "Animated-history GIF is not included in this local copy. Use File > Save As to save a PNG, GIF or JPEG of the picture." });
	return;`,
    why: 'gif.js worker is not shipped',
  },
  {
    file: 'src/functions.js',
    find: /function show_multi_user_setup_dialog\(from_current_document\) \{/,
    replace: () => `function show_multi_user_setup_dialog(from_current_document) {
	showMessageBox({ message: "This local copy of JS Paint has no multi-user sessions. The picture stays on this device." });
	return;`,
    why: 'no Firebase, no shared session URL',
  },
  {
    file: 'src/functions.js',
    find: /if \(is_discord_embed\) \{\n\t\t\/\/ No checking for updates in the Discord Activity/,
    replace: () => 'if (true) {\n\t\t// No checking for updates in the Discord Activity',
    why: 'About Paint must never fetch jspaint.app news',
  },
  {
    file: 'src/menus.js',
    find: /window\.location = "https:\/\/98\.js\.org\/";/,
    replace: () => 'try { window.close(); } catch (_e) { /* stay put */ }',
    why: 'File > Exit must not navigate the iframe to 98.js.org',
  },
];

for (const p of PATCHES) {
  const f = join(src, p.file);
  const before = readFileSync(f, 'utf8');
  if (!p.find.test(before)) {
    throw new Error('PATCH NO LONGER APPLIES: ' + p.file + ' — ' + p.why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY;'
      + '\n  building without it silently loses what it was for.');
  }
  writeFileSync(f, before.replace(p.find, p.replace));
  console.log('patched ' + p.file + ' — ' + p.why);
}

// Whole-file stubs for extras that need the network or a worker we do not ship.
writeFileSync(join(src, 'src', 'theme.js'), `// @ts-check
const default_theme = "classic.css";
let current_theme = default_theme;
try {
	const saved = window.localStorage && window.localStorage.getItem("jspaint theme");
	if (saved === "classic.css" || saved === "dark.css") current_theme = saved;
} catch (_error) { /* ignore */ }

function apply_theme_css(theme) {
	let el = document.getElementById("theme-style");
	if (!el) {
		el = document.createElement("style");
		el.id = "theme-style";
		document.head.appendChild(el);
	}
	const css = (window.GIFOS_THEMES && (window.GIFOS_THEMES[theme] || window.GIFOS_THEMES[default_theme])) || "";
	el.textContent = css;
}
apply_theme_css(current_theme);

const get_theme = () => current_theme;
const set_theme = (theme) => {
	if (!(window.GIFOS_THEMES && window.GIFOS_THEMES[theme])) {
		try { window.showMessageBox && window.showMessageBox({ message: "That theme is not included in this local copy. Classic Light and Classic Dark are." }); } catch (_e) {}
		return;
	}
	current_theme = theme;
	try { window.localStorage && window.localStorage.setItem("jspaint theme", theme); } catch (_error) { /* ignore */ }
	apply_theme_css(theme);
	if (window.$) {
		$(window).triggerHandler("theme-load");
		$(window).trigger("resize");
	}
};

export { get_theme, set_theme };
`);
console.log('patched src/theme.js — inlined classic/dark CSS, no file fetch');

writeFileSync(join(src, 'src', 'imgur.js'), `import { showMessageBox } from "./msgbox.js";
export function show_imgur_uploader() {
	showMessageBox({ message: "This local copy of JS Paint cannot upload to Imgur. Use File > Save As to keep the picture on this device." });
}
`);
console.log('patched src/imgur.js — no Imgur');

writeFileSync(join(src, 'src', 'speech-recognition.js'), `export let speech_recognition_active = false;
export const speech_recognition_available = false;
export function disable_speech_recognition() {}
export function enable_speech_recognition() {}
export function trace_and_sketch_stop() {}
export function trace_and_sketch() {}
export function interpret_command() { return []; }
`);
console.log('patched src/speech-recognition.js — no Google speech');

writeFileSync(join(src, 'src', 'help.js'), `import { showMessageBox } from "./msgbox.js";
export function show_help() {
	showMessageBox({
		title: "Paint Help",
		message: "The CHM help viewer is not included in this local copy. The tools are the MS Paint tools — hover one for a description in the status bar.",
	});
}
`);
console.log('patched src/help.js — no CHM fetch');

writeFileSync(join(src, 'src', 'eye-gaze-mode.js'), `// not shipped
`);
console.log('patched src/eye-gaze-mode.js — not shipped');

// Facades. Core runs BEFORE app-state.js so window.get_tool_by_id etc. exist.
writeFileSync(join(src, 'src', '_gifos-core.js'), `
import { get_theme, set_theme } from './theme.js';
import './msgbox.js';
import './helpers.js';
import './functions.js';
import './storage.js';
import './$Component.js';
import './$ToolWindow.js';
import './error-handling-enhanced.js';
import './$ToolBox.js';
import './$ColorBox.js';
import './$FontBox.js';
import './Handles.js';
import './OnCanvasObject.js';
import './OnCanvasSelection.js';
import './OnCanvasTextBox.js';
import './OnCanvasHelperLayer.js';
import './image-manipulation.js';
import './tool-options.js';
import './tools.js';
import './color-data.js';
import './edit-colors.js';
import './file-format-data.js';
import './manage-storage.js';
import './imgur.js';
import './help.js';
import './simulate-random-gestures.js';
import './menus.js';
import './speech-recognition.js';
window.get_theme = get_theme;
window.set_theme = set_theme;
`);

writeFileSync(join(src, 'src', '_gifos-app.js'), `
import './app.js';
import './sessions.js';
import './konami.js';
`);

function escapeScript(s) {
  return s.replace(/<\/script/gi, '<\\/script');
}

const LIBS = [
  'lib/jquery-3.4.1.min.js',
  'lib/pako-2.0.3.min.js',
  'lib/UPNG.js',
  'lib/UTIF.js',
  'lib/bmp.js',
  'lib/anypalette-0.6.0.js',
  'lib/FileSaver.js',
  'lib/font-detective.js',
  'lib/libtess.min.js',
  'lib/os-gui/parse-theme.js',
  'lib/os-gui/$Window.js',
  'lib/os-gui/MenuBar.js',
  'lib/imagetracer_v1.2.5.js',
  'src/error-handling-basic.js',
];

let libs = '';
for (const f of LIBS) {
  libs += '\n/* ---- ' + f + ' ---- */\n' + readFileSync(join(src, f), 'utf8') + '\n';
}
libs = escapeScript(libs);

console.log('bundling core + app with esbuild…');
const outCore = join(src, '_gifos-core.iife.js');
const outApp = join(src, '_gifos-app.iife.js');
run('npx', ['--yes', 'esbuild', 'src/_gifos-core.js', '--bundle', '--format=iife', '--outfile=' + outCore, '--minify', '--target=es2018', '--log-level=warning'], src);
run('npx', ['--yes', 'esbuild', 'src/_gifos-app.js', '--bundle', '--format=iife', '--outfile=' + outApp, '--minify', '--target=es2018', '--log-level=warning'], src);

let coreJs = rewriteStaticAssetStrings(readFileSync(outCore, 'utf8'));
let appJs = rewriteStaticAssetStrings(readFileSync(outApp, 'utf8'));
coreJs = escapeScript(coreJs);
appJs = escapeScript(appJs);

const cssParts = [
  flattenCss('styles/normalize.css'),
  flattenCss('styles/layout.css'),
  flattenCss('lib/os-gui/build/layout.css'),
  flattenCss('lib/98.css/98.custom-build.css'),
  flattenCss('styles/print.css'),
];
const styleCss = cssParts.join('\n') + `
html, body { height: 100%; margin: 0; overflow: hidden; }
body { background: var(--AppWorkspace, #808080); }
`;

const themes = {
  'classic.css': flattenCss('styles/themes/classic.css'),
  'dark.css': flattenCss('styles/themes/dark.css'),
};

const helpFiles = readdirSync(join(src, 'help')).filter((n) => /\.(png|gif)$/i.test(n) && n.startsWith('p_'));
const helpMap = {};
for (const n of helpFiles) helpMap[n] = dataUrlFor('help/' + n);

const cursorFiles = readdirSync(join(src, 'images/cursors')).filter((n) => /\.png$/i.test(n));
const cursorMap = {};
for (const n of cursorFiles) cursorMap[n.replace(/\.png$/i, '')] = dataUrlFor('images/cursors/' + n);

const extraAssets = [
  'images/error-32x32-8bpp.png',
  'images/warning-32x32-8bpp.png',
  'images/info-32x32-8bpp.png',
  'images/question-32x32-8bpp.png',
  'images/nuke-32x32-8bpp.png',
  'images/options-airbrush-size.png',
  'images/transforms/skew-x.png',
  'images/transforms/skew-y.png',
  'images/transforms/stretch-x.png',
  'images/transforms/stretch-y.png',
  'images/icons/128x128.png',
  'images/icons/32x32.png',
  'audio/chord.wav',
];
const assetMap = {};
for (const p of extraAssets) {
  try { assetMap[p] = dataUrlFor(p); } catch { /* optional */ }
}

function asJsObject(obj) {
  const parts = [];
  for (const k of Object.keys(obj)) {
    parts.push(JSON.stringify(k) + ':' + JSON.stringify(obj[k]));
  }
  return '{' + parts.join(',') + '}';
}

const assetsJs = escapeScript(
  'window.GIFOS_THEMES=' + asJsObject(themes) + ';\n' +
  'window.GIFOS_HELP=' + asJsObject(helpMap) + ';\n' +
  'window.GIFOS_CURSORS=' + asJsObject(cursorMap) + ';\n' +
  'window.GIFOS_ASSETS=' + asJsObject(assetMap) + ';\n'
);

const dest = join(dir, 'vendor');
mkdirSync(dest, { recursive: true });
mkdirSync(join(dir, 'src'), { recursive: true });
writeFileSync(join(dest, 'libs.js'), libs);
writeFileSync(join(dest, 'core.js'), coreJs);
writeFileSync(join(dest, 'app.js'), appJs);
writeFileSync(join(dest, 'style.css'), styleCss);
writeFileSync(join(dest, 'assets.js'), assetsJs);
copyFileSync(join(src, 'LICENSE.txt'), join(dest, 'COPYING-jspaint.txt'));
copyFileSync(join(src, 'src/app-state.js'), join(dir, 'src/app-state.js'));
copyFileSync(join(src, 'src/app-localization.js'), join(dir, 'src/app-localization.js'));
copyFileSync(join(src, 'images/icons/128x128.png'), join(dest, 'icon-128.png'));

writeFileSync(join(dest, 'UPSTREAM.txt'),
  'vendor/*.js and vendor/style.css are GENERATED. Do not edit them; run node apps/jspaint/vendor.mjs.\n\n' +
  'upstream: ' + UPSTREAM + '\n' +
  'commit:   ' + PIN + '\n' +
  'entry:    src/_gifos-core.js + src/_gifos-app.js (written by vendor.mjs), IIFE\n\n' +
  'MIT licence travels beside it as COPYING-jspaint.txt and is packed into the GIF.\n'
);

const sizes = ['libs.js', 'core.js', 'app.js', 'style.css', 'assets.js'].map((n) => {
  const b = readFileSync(join(dest, n)).length;
  return n + ' ' + (b / 1024).toFixed(0) + ' KB';
});
console.log('wrote apps/jspaint/vendor — ' + sizes.join(', ') + ' from ' + PIN.slice(0, 10));
if (tmp) rmSync(tmp, { recursive: true, force: true });
