/*
 * vendor.mjs — rebuild vendor/drawnix.js from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline and byte-reproducible from
 * what is committed here. Run this only to move the pin.
 *
 *   node apps/drawnix/vendor.mjs
 *   DRAWNIX_SRC=/path/to/checkout node apps/drawnix/vendor.mjs
 *
 * WHAT IT PRODUCES. One IIFE bundle + one CSS file. Upstream is a React + Plait
 * + Slate ESM graph; GifOS's runtime inlines <script src> by rewriting the tag,
 * which DROPS type="module" (see buildAppHtml in site/js/runtime.js), so ES
 * module semantics do not survive the trip into an app. One classic IIFE does.
 *
 * Persistence is NOT compiled in. boot.js is ordinary source and hangs
 * window.__GIFOS_STORE; the patches below point upstream's localforage calls
 * at that object.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/plait-board/drawnix.git';
const PIN = '8a91504c78b876ebe73abcb5da9fac0b19d60636'; // develop, 2026-08-14 "docs: add AtomGit badge"

// Upstream's Vite 8 (rolldown) needs Node 20.19+ / 22.12+. Node 18 dies at
// `npx vite build` with an engines error; fail here so the message is ours.
{
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 20 || (maj === 20 && min < 19)) {
    throw new Error('vendor.mjs needs Node 20.19+ (this is ' + process.versions.node
      + ') — upstream Vite 8 will not build on 18.');
  }
}

const run = (cmd, args, cwd) => execFileSync(cmd, args, {
  cwd, stdio: 'inherit', timeout: 900000,
  env: {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    CYPRESS_INSTALL_BINARY: '0',
    NX_DAEMON: 'false',
  },
});

let src = process.env.DRAWNIX_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'drawnix-'));
  src = join(tmp, 'drawnix');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

if (!existsSync(join(src, 'node_modules', 'react'))) {
  console.log('npm install (upstream)…');
  run('npm', ['install', '--no-audit', '--no-fund'], src);
}

// PATCHES WE CARRY, applied to upstream's SOURCE before the build. Fail loud
// if upstream moved the code — a silent skip would drop the GifOS seam.
const PATCHES = [
  {
    file: 'apps/web/src/app/app.tsx',
    find: /import localforage from 'localforage';/,
    replace: () => "const localforage = (globalThis as any).__GIFOS_STORE;",
    why: 'GifOS sandbox has no IndexedDB; persist through gifos.db via boot.js',
  },
  {
    file: 'apps/web/src/app/app.tsx',
    find: /localforage\.config\(\{[\s\S]*?\}\);\n/,
    replace: () => '',
    why: 'no localforage to configure once the store is ours',
  },
  {
    file: 'apps/web/src/app/app.tsx',
    find: /language: 'zh',/,
    replace: () => "language: 'en',",
    why: 'GifOS listing is English-first; the in-app language switch still works',
  },
  {
    file: 'packages/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx',
    find: /import type \{ MermaidConfig \} from '@plait-board\/mermaid-to-drawnix\/dist';/,
    replace: () => "import * as mermaidToDrawnixMod from '@plait-board/mermaid-to-drawnix';\nimport type { MermaidConfig } from '@plait-board/mermaid-to-drawnix/dist';",
    why: 'static-import mermaid so the IIFE has no code-split chunk to fetch',
  },
  {
    file: 'packages/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx',
    find: /const module = await import\('@plait-board\/mermaid-to-drawnix'\);/,
    replace: () => 'const module = mermaidToDrawnixMod;',
    why: 'the dynamic import would be a second file the sandbox cannot load',
  },
  {
    file: 'packages/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx',
    find: /import \{ MindElement \} from '@plait\/mind';/,
    replace: () => "import { MindElement } from '@plait/mind';\nimport * as markdownToDrawnixMod from '@plait-board/markdown-to-drawnix';",
    why: 'static-import markdown-to-drawnix so the IIFE has no code-split chunk',
  },
  {
    file: 'packages/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx',
    find: /const module = await import\('@plait-board\/markdown-to-drawnix'\);/,
    replace: () => 'const module = markdownToDrawnixMod;',
    why: 'the dynamic import would be a second file the sandbox cannot load',
  },
];

for (const p of PATCHES) {
  const f = join(src, p.file);
  const before = readFileSync(f, 'utf8');
  if (!p.find.test(before)) {
    throw new Error('PATCH NO LONGER APPLIES: ' + p.file + ' — ' + p.why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY.');
  }
  writeFileSync(f, before.replace(p.find, p.replace));
  console.log('patched ' + p.file + ' — ' + p.why);
}

// mermaid 10 injects a Google Fonts @import unless fontFamily is set. The app
// CSP is font-src data: only, so that request is a console error on every
// convert. Applied to the published package after npm install.
const mermaidParse = join(src, 'node_modules', '@plait-board', 'mermaid-to-drawnix', 'dist', 'parseMermaid.js');
if (existsSync(mermaidParse)) {
  const before = readFileSync(mermaidParse, 'utf8');
  const find = /mermaid\.initialize\(\{\s*\.\.\.MERMAID_CONFIG,\s*\.\.\.config\s*\}\);/;
  if (find.test(before)) {
    writeFileSync(mermaidParse, before.replace(find,
      'mermaid.initialize({ ...MERMAID_CONFIG, ...config, fontFamily: "inherit", themeVariables: { fontFamily: "inherit", ...(MERMAID_CONFIG.themeVariables || {}), ...(config.themeVariables || {}) } });'));
    console.log('patched mermaid-to-drawnix parseMermaid — no Google Fonts under CSP');
  } else {
    console.log('note: mermaid initialize() shape moved — Google Fonts patch skipped');
  }
}

writeFileSync(join(src, 'vite.gifos.config.mjs'), `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: resolve(root, 'apps/web'),
  publicDir: false,
  plugins: [react(), nxViteTsPaths()],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
  },
  resolve: {
    alias: {
      '@drawnix/drawnix': resolve(root, 'packages/drawnix/src/index.ts'),
      '@plait-board/react-board': resolve(root, 'packages/react-board/src/index.ts'),
      '@plait-board/react-text': resolve(root, 'packages/react-text/src/index.ts'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    // Vite 8 minify is oxc; 'esbuild' now requires a separate esbuild install.
    minify: true,
    outDir: resolve(root, 'dist-gifos'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 10000000,
    lib: {
      entry: resolve(root, 'apps/web/src/main.tsx'),
      name: 'DrawnixApp',
      formats: ['iife'],
      fileName: () => 'drawnix.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'drawnix[extname]',
      },
    },
    commonjsOptions: { transformMixedEsModules: true },
  },
});
`);

console.log('vite IIFE build…');
run('npx', ['vite', 'build', '-c', 'vite.gifos.config.mjs'], src);

const dist = join(src, 'dist-gifos');
const jsSrc = join(dist, 'drawnix.js');
if (!existsSync(jsSrc)) throw new Error('vite did not emit dist-gifos/drawnix.js');
let cssSrc = join(dist, 'drawnix.css');
if (!existsSync(cssSrc)) {
  const alt = readdirSync(dist).find((n) => n.endsWith('.css'));
  if (alt) cssSrc = join(dist, alt);
}

let js = readFileSync(jsSrc, 'utf8');
if (/<\/script/i.test(js)) js = js.split('</').join('<\\/');
if (/^\s*export\s|export\{|import\.meta/m.test(js)) {
  throw new Error('vendor/drawnix.js uses ESM syntax — the classic-script inline path cannot carry it.');
}
let css = existsSync(cssSrc) ? readFileSync(cssSrc, 'utf8') : '/* no extracted css */\n';
if (/url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('drawnix CSS fetches a remote url() — that will fail under connect-src none / font-src data:');
}

mkdirSync(join(dir, 'vendor'), { recursive: true });
writeFileSync(join(dir, 'vendor', 'drawnix.js'), js);
writeFileSync(join(dir, 'vendor', 'drawnix.css'), css);
copyFileSync(join(src, 'LICENSE'), join(dir, 'vendor', 'COPYING-drawnix.txt'));
const reactLicense = join(src, 'node_modules', 'react', 'LICENSE');
if (existsSync(reactLicense)) copyFileSync(reactLicense, join(dir, 'vendor', 'COPYING-react.txt'));

writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/drawnix.js is GENERATED. Do not edit it; run node apps/drawnix/vendor.mjs.\n\n' +
  'upstream: ' + UPSTREAM + '\n' +
  'commit:   ' + PIN + '\n' +
  'entry:    apps/web/src/main.tsx, IIFE, mounts #root\n' +
  'store:    window.__GIFOS_STORE (boot.js → gifos.db)\n\n' +
  'Drawnix is MIT (COPYING-drawnix.txt). It bundles Plait, React, Slate,\n' +
  'mermaid and markdown-to-drawnix, all MIT. The notices travel inside the GIF.\n');

console.log('wrote apps/drawnix/vendor/drawnix.js — ' + (Buffer.byteLength(js) / 1024 / 1024).toFixed(2) + ' MB from ' + PIN.slice(0, 10));
if (tmp) rmSync(tmp, { recursive: true, force: true });
