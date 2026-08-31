/*
 * vendor.mjs — rebuild vendor/wiki.html.gz from the pinned TiddlyWiki5 tag.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/tiddlywiki/vendor.mjs
 *   TIDDLYWIKI_SRC=/path/to/TiddlyWiki5 node apps/tiddlywiki/vendor.mjs
 *
 * WHAT IT PRODUCES. An empty TiddlyWiki 5 HTML file (core + vanilla/snowwhite
 * + markdown) with GifOS config tiddlers folded in, gzipped. boot.js is not
 * compiled in — it hangs off the HTML as a classic script src.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/TiddlyWiki/TiddlyWiki5.git';
const TAG = 'v5.4.1';
const PIN = 'd391595836e2aead565480763f9bf9eb52e29e75';

const run = (cmd, args, cwd) => execFileSync(cmd, args, {
  cwd, stdio: 'inherit', timeout: 300000
});

function writeTid(folder, fields, text) {
  const lines = [];
  for (const [k, v] of Object.entries(fields)) lines.push(k + ': ' + v);
  lines.push('');
  lines.push(text == null ? '' : String(text));
  const safe = String(fields.title).replace(/[^A-Za-z0-9._-]+/g, '_');
  writeFileSync(join(folder, safe + '.tid'), lines.join('\n') + '\n');
}

let src = process.env.TIDDLYWIKI_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'tiddlywiki-'));
  src = join(tmp, 'TiddlyWiki5');
  console.log('cloning ' + UPSTREAM + ' @ ' + TAG + '…');
  run('git', ['clone', '--quiet', '--depth', '1', '--branch', TAG, UPSTREAM, src]);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

const license = readFileSync(join(src, 'license'), 'utf8');
if (!license.includes('All rights reserved') || !license.includes('UnaMesa Association')) {
  throw new Error('upstream license file is not the BSD-3-Clause notice we pack');
}

const wikiTmp = tmp || mkdtempSync(join(tmpdir(), 'tw-wiki-'));
const wiki = join(wikiTmp, 'wiki');
mkdirSync(join(wiki, 'tiddlers'), { recursive: true });

writeFileSync(join(wiki, 'tiddlywiki.info'), JSON.stringify({
  description: 'GifOS TiddlyWiki empty+markdown',
  plugins: ['tiddlywiki/markdown'],
  themes: ['tiddlywiki/vanilla', 'tiddlywiki/snowwhite']
}, null, 2) + '\n');

const tids = join(wiki, 'tiddlers');

writeTid(tids, { title: '$:/SiteTitle' }, 'TiddlyWiki');
writeTid(tids, { title: '$:/SiteSubtitle' }, 'a notebook in a GIF');
writeTid(tids, { title: '$:/DefaultTiddlers' }, 'GettingStarted');
writeTid(tids, { title: '$:/palette' }, '$:/palettes/Nord');
writeTid(tids, { title: '$:/config/AutoSave' }, 'no');
writeTid(tids, { title: '$:/config/DownloadSaver/AutoSave' }, 'no');
writeTid(tids, {
  title: '$:/config/PageControlButtons/Visibility/$:/core/ui/Buttons/save-wiki'
}, 'hide');
writeTid(tids, {
  title: '$:/themes/tiddlywiki/vanilla/metrics/sidebarbreakpoint'
}, '56em');
writeTid(tids, {
  title: 'GettingStarted',
  type: 'text/vnd.tiddlywiki'
}, `! This wiki lives in the file

Close the app and open it again — every tiddler is still here. Press ''Invite'' in the bar above and the same notebook is live with whoever opens the link. There is no account and no server.

!! Write a note

* The plus button (or ''alt-N'') opens a new tiddler.
* Type a title, then the body. Wiki-text: ''bold'', //italic//, \`[[links]]\`. Set the type to \`text/markdown\` for Markdown.
* The tick keeps it. Notes save themselves as you go — there is no download step.
* Tag a tiddler to group it. Search is in the sidebar.

!! On a phone

The sidebar tucks away. Open it from the top-left control. Back closes the tiddler you are reading, or cancels an edit.

!! This copy

This is TiddlyWiki 5 by Jeremy Ruston and the UnaMesa Association. The original downloads a new HTML file when you save; here the notebook ''is'' the app file.

Edit or delete [[HelloThere]] — it is a first note, not a required page.
`);
writeTid(tids, {
  title: 'HelloThere',
  tags: 'journal',
  type: 'text/vnd.tiddlywiki'
}, `A first tiddler. Rename it, tag it, or delete it.

* Link to [[GettingStarted]]
* Make a new one with the plus button
`);

console.log('building empty wiki…');
run('node', [
  join(src, 'tiddlywiki.js'), wiki,
  '--output', join(wiki, 'output'),
  '--rendertiddler', '$:/core/save/all', 'empty.html', 'text/plain'
], src);

const built = join(wiki, 'output', 'empty.html');
if (!existsSync(built)) throw new Error('tiddlywiki did not write empty.html');
let html = readFileSync(built, 'utf8');
if (!html.includes('tiddlywiki-tiddler-store')) {
  throw new Error('empty.html is missing the tiddler store');
}
if (!html.includes('TiddlyWiki') || !html.includes('$:/core')) {
  throw new Error('empty.html does not look like TiddlyWiki core');
}
if (!html.includes('markdown') && !html.includes('Markdown')) {
  throw new Error('markdown plugin did not land in the wiki');
}
if (!html.includes('GettingStarted')) {
  throw new Error('GettingStarted tiddler did not land');
}

// The sandbox CSP is script-src 'unsafe-inline' with NO 'unsafe-eval'.
// TiddlyWiki compiles every JS module (widgets, filters, markdown-it) with
// Function("return "+code), which Chrome reports as eval and refuses. Inline
// <script> tags ARE allowed, so compile the same function expression by
// inserting a classic script and reading it back. Without this the wiki
// HTML parses and then paints nothing.
const EVAL_NEEDLE = 'fn = Function("return " + code + "\\n\\n//# sourceURL=" + filename)();';
const EVAL_PATCH = 'fn = (function(){var k="__twfn"+Math.random().toString(36).slice(2);var s=document.createElement("script");s.textContent="window."+k+"="+code+";\\n//# sourceURL="+filename;document.head.appendChild(s);document.head.removeChild(s);var f=window[k];try{delete window[k];}catch(e){window[k]=undefined;}return f;})();';
if (!html.includes(EVAL_NEEDLE)) {
  throw new Error('boot kernel no longer uses Function() to eval modules — update the CSP patch');
}
html = html.split(EVAL_NEEDLE).join(EVAL_PATCH);
if (html.includes(EVAL_NEEDLE) || html.split(EVAL_PATCH).length < 2) {
  throw new Error('CSP patch did not apply');
}

const HEAD_INJECT = [
  '<script>',
  'window.$tw=window.$tw||{};window.$tw.boot=window.$tw.boot||{};window.$tw.boot.suppressBoot=true;',
  '</script>',
  '<link rel="stylesheet" href="style.css">'
].join('');

if (!/<head[^>]*>/i.test(html)) throw new Error('empty.html has no <head>');
html = html.replace(/<head[^>]*>/i, function (m) { return m + HEAD_INJECT; });

html = html.replace(
  /<meta\s+name=["']viewport["'][^>]*>/i,
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
);

if (!html.includes('suppressBoot')) throw new Error('failed to inject suppressBoot');

const BODY_INJECT = '<div id="gifos-boot">Opening notebook…</div><script src="boot.js"></script>';
if (!/<\/body>/i.test(html)) throw new Error('empty.html has no </body>');
html = html.replace(/<\/body>/i, BODY_INJECT + '</body>');
if (!html.includes('src="boot.js"')) throw new Error('failed to inject boot.js');

mkdirSync(out, { recursive: true });
const gz = gzipSync(Buffer.from(html, 'utf8'), { level: 9 });
writeFileSync(join(out, 'wiki.html.gz'), gz);

const copying = readFileSync(join(dir, 'COPYING.txt'), 'utf8');
if (copying.trim() !== license.trim()) {
  // Keep COPYING.txt as the canonical notice we pack; warn if they drifted.
  writeFileSync(join(out, 'COPYING-tiddlywiki.txt'), license);
} else {
  writeFileSync(join(out, 'COPYING-tiddlywiki.txt'), license);
}

const sha = createHash('sha256').update(gz).digest('hex');
const wikiSha = createHash('sha256').update(html).digest('hex');

writeFileSync(join(out, 'UPSTREAM.txt'), [
  'upstream: ' + UPSTREAM,
  'tag: ' + TAG,
  'pin: ' + PIN,
  'plugins: tiddlywiki/markdown, tiddlywiki/vanilla, tiddlywiki/snowwhite',
  'wiki.html sha256: ' + wikiSha,
  'wiki.html.gz sha256: ' + sha,
  'wiki.html bytes: ' + Buffer.byteLength(html),
  'wiki.html.gz bytes: ' + gz.length,
  ''
].join('\n'));

console.log('wrote vendor/wiki.html.gz —', (gz.length / 1024).toFixed(0), 'KB gzip,',
  (Buffer.byteLength(html) / 1024).toFixed(0), 'KB html, sha256', sha.slice(0, 12) + '…');

rmSync(wikiTmp, { recursive: true, force: true });
