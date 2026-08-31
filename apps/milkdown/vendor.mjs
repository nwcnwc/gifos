/*
 * vendor.mjs — rebuild vendor/milkdown.js from the pinned @milkdown/kit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/milkdown/vendor.mjs
 *
 * WHAT IT PRODUCES. One classic IIFE exposing `window.Milkdown` — a thin
 * factory over @milkdown/kit (commonmark + GFM + history/clipboard/cursor
 * /indent/trailing/listener). Crepe's Vue/CodeMirror/KaTeX tree is NOT
 * bundled: the sandbox has no eval, no webfonts, and no network.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = dirname(fileURLToPath(import.meta.url));

const KIT = '7.22.1';
const ESBUILD = '0.25.9';

const tmp = mkdtempSync(join(tmpdir(), 'milkdown-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

console.log('installing @milkdown/kit@' + KIT + ' in ' + tmp);
run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev',
  '@milkdown/kit@' + KIT,
  'esbuild@' + ESBUILD,
], tmp);

const facade = join(tmp, 'gifos-facade.js');
writeFileSync(facade, `import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx } from '@milkdown/kit/core'
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  turnIntoTextCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleLinkCommand,
  updateLinkCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  gfm,
  toggleStrikethroughCommand,
  insertTableCommand,
} from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { indent } from '@milkdown/kit/plugin/indent'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { getMarkdown, replaceAll, callCommand, insert } from '@milkdown/kit/utils'

const KEYS = {
  bold: toggleStrongCommand.key,
  italic: toggleEmphasisCommand.key,
  strike: toggleStrikethroughCommand.key,
  code: toggleInlineCodeCommand.key,
  heading: wrapInHeadingCommand.key,
  quote: wrapInBlockquoteCommand.key,
  bullet: wrapInBulletListCommand.key,
  ordered: wrapInOrderedListCommand.key,
  paragraph: turnIntoTextCommand.key,
  codeBlock: createCodeBlockCommand.key,
  hr: insertHrCommand.key,
  table: insertTableCommand.key,
  link: toggleLinkCommand.key,
  updateLink: updateLinkCommand.key,
}

function create(opts) {
  opts = opts || {}
  const root = opts.root
  if (!root) return Promise.reject(new Error('Milkdown.create needs a root'))
  let editableFn = typeof opts.editable === 'function' ? opts.editable : function () { return true }
  const editor = Editor.make()
    .config(function (ctx) {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, opts.defaultValue || '')
      ctx.set(editorViewOptionsCtx, {
        editable: function () { return editableFn() },
      })
      const lm = ctx.get(listenerCtx)
      if (typeof opts.onMarkdown === 'function') {
        lm.markdownUpdated(function (_c, md, prev) {
          if (md !== prev) opts.onMarkdown(md)
        })
      }
      if (typeof opts.onFocus === 'function') lm.focus(function () { opts.onFocus() })
      if (typeof opts.onBlur === 'function') lm.blur(function () { opts.onBlur() })
    })
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(cursor)
    .use(indent)
    .use(trailing)
  return editor.create().then(function () {
    return {
      editor: editor,
      keys: KEYS,
      getMarkdown: function () { return editor.action(getMarkdown()) },
      setMarkdown: function (md, flush) { editor.action(replaceAll(String(md == null ? '' : md), !!flush)) },
      insert: function (md) { editor.action(insert(String(md == null ? '' : md))) },
      command: function (key, payload) { return editor.action(callCommand(key, payload)) },
      focus: function () {
        editor.action(function (ctx) {
          const view = ctx.get(editorViewCtx)
          if (view && view.focus) view.focus()
        })
      },
      setEditable: function (fn) { editableFn = typeof fn === 'function' ? fn : function () { return !!fn } },
      destroy: function () { return editor.destroy() },
    }
  })
}

export { create, KEYS, Editor }
`)

const outJs = join(tmp, 'milkdown.js');
const esbuild = join(tmp, 'node_modules', '.bin', 'esbuild');
run(esbuild, [
  facade,
  '--bundle',
  '--format=iife',
  '--global-name=Milkdown',
  '--platform=browser',
  '--target=es2018',
  '--minify',
  '--legal-comments=none',
  '--define:process.env.NODE_ENV="production"',
  '--outfile=' + outJs,
], tmp);

let js = readFileSync(outJs, 'utf8');
if (/<\/script/i.test(js)) {
  js = js.split('</').join('<\\/');
}
if (/^\s*export\s|export\{|import\.meta/m.test(js)) {
  throw new Error('bundle still has ESM syntax — the classic-script inline path cannot carry it');
}

const evalHits = [];
if (/\beval\s*\(/.test(js)) evalHits.push('eval(');
if (/\bnew Function\b/.test(js)) evalHits.push('new Function');
if (evalHits.length) {
  throw new Error('bundle still contains ' + evalHits.join(', ') + ' — the sandbox CSP will throw EvalError');
}

function copyCss(rel, name) {
  const p = join(tmp, 'node_modules', '@milkdown', 'prose', 'lib', 'style', rel);
  if (!existsSync(p)) throw new Error('missing prose css ' + rel);
  let css = readFileSync(p, 'utf8');
  if (/url\(\s*['"]?https?:/i.test(css)) {
    throw new Error(name + ' fetches a remote url() — that will fail under connect-src none');
  }
  if (/fonts\.google|@font-face/i.test(css)) {
    throw new Error(name + ' pulls a webfont');
  }
  return css;
}

const proseCss = copyCss('prosemirror.css', 'prosemirror.css');
const tableCss = copyCss('tables.css', 'tables.css');
const gapCss = copyCss('gapcursor.css', 'gapcursor.css');

const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });
writeFileSync(join(vendor, 'milkdown.js'), js);
writeFileSync(join(vendor, 'milkdown.css'),
  '/* ProseMirror + table + gapcursor CSS from @milkdown/kit@' + KIT + ' */\n' +
  proseCss + '\n' + tableCss + '\n' + gapCss);

const kitLicense = join(tmp, 'node_modules', '@milkdown', 'kit', 'LICENSE');
const coreLicense = join(tmp, 'node_modules', '@milkdown', 'core', 'LICENSE');
const licenseSrc = existsSync(kitLicense) ? kitLicense
  : existsSync(coreLicense) ? coreLicense
  : null;
if (licenseSrc) {
  copyFileSync(licenseSrc, join(vendor, 'COPYING-milkdown.txt'));
} else {
  writeFileSync(join(vendor, 'COPYING-milkdown.txt'),
    'The MIT License (MIT)\n\n' +
    'Copyright (c) 2020-present Mirone\n\n' +
    'Permission is hereby granted, free of charge, to any person obtaining a copy\n' +
    'of this software and associated documentation files (the "Software"), to deal\n' +
    'in the Software without restriction, including without limitation the rights\n' +
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' +
    'copies of the Software, and to permit persons to whom the Software is\n' +
    'furnished to do so, subject to the following conditions:\n\n' +
    'The above copyright notice and this permission notice shall be included in all\n' +
    'copies or substantial portions of the Software.\n\n' +
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' +
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' +
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' +
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' +
    'LIABILITY, WHETHER IN ANY ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' +
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n' +
    'SOFTWARE.\n');
}

const kitPkg = JSON.parse(readFileSync(join(tmp, 'node_modules', '@milkdown', 'kit', 'package.json'), 'utf8'));
const sha = createHash('sha256').update(js).digest('hex');
writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/milkdown.js and vendor/milkdown.css are GENERATED.\n' +
  'Do not edit them; run node apps/milkdown/vendor.mjs.\n\n' +
  'upstream: https://github.com/Milkdown/milkdown\n' +
  'npm:      @milkdown/kit@' + kitPkg.version + '\n' +
  'entry:    gifos-facade.js (written by vendor.mjs), IIFE, global Milkdown\n' +
  '          exposing { create, KEYS, Editor }\n' +
  'sha256:   ' + sha + '\n\n' +
  'Crepe (Vue, CodeMirror language packs, KaTeX, AI providers) is NOT bundled.\n' +
  'This is the Milkdown kit: commonmark + GFM + history/clipboard/cursor/\n' +
  'indent/trailing/listener, styled by this app. Licences ride beside the\n' +
  'bundle and inside the GIF: COPYING-milkdown.txt.\n');

console.log('wrote apps/milkdown/vendor/milkdown.js — ' +
  (Buffer.byteLength(js) / 1024).toFixed(0) + ' KB, css ' +
  (Buffer.byteLength(proseCss + tableCss) / 1024).toFixed(0) + ' KB, sha256 ' + sha.slice(0, 16) + '…');

rmSync(tmp, { recursive: true, force: true });
