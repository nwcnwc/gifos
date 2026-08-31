/*
 * vendor.mjs — rebuild vendor/digitaljs.js from the pinned npm package.
 *
 * Network is used ONLY here. build.mjs is offline from what this commits.
 *
 *   node apps/digitaljs/vendor.mjs
 *
 * One classic IIFE exposing window.digitaljs and window.$ (JointJS cells
 * use jQuery). ELK and the worker engine are stubbed: layout is dagre,
 * simulation is the in-page BrowserSynchEngine. The sandbox has no
 * worker-src unless capabilities.wasm is declared, and we do not need it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PIN = '0.14.2';

const tmp = mkdtempSync(join(tmpdir(), 'digitaljs-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

console.log('installing digitaljs@' + PIN + ' in ' + tmp);
run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev',
  'digitaljs@' + PIN,
  'webpack@5.104.1',
  'webpack-cli@6.0.1',
  'css-loader@7.1.3',
  'style-loader@4.0.0',
  'expose-loader@5.0.1',
], tmp);

const stubElk = join(tmp, 'elk-stub.js');
writeFileSync(stubElk, [
  'export default class ELK {',
  '  layout(g) { return Promise.resolve(g); }',
  '}',
  '',
].join('\n'));

const stubWorker = join(tmp, 'worker-stub.js');
writeFileSync(stubWorker, [
  'export default class Worker {',
  '  constructor() { throw new Error("DigitalJS worker engine is not in this build"); }',
  '}',
  '',
].join('\n'));

const stubEngine = join(tmp, 'engine-worker-stub.js');
writeFileSync(stubEngine, 'export class WorkerEngine {}\n');

const facade = join(tmp, 'gifos-facade.js');
writeFileSync(facade, [
  "import $ from 'jquery';",
  "import { Vector3vl } from '3vl';",
  "import * as digitaljs from 'digitaljs';",
  "var g = typeof window !== 'undefined' ? window : globalThis;",
  "g.$ = g.jQuery = $;",
  "g.digitaljs = digitaljs;",
  "g.Vector3vl = Vector3vl;",
  "export default digitaljs;",
  '',
].join('\n'));

const outJs = join(tmp, 'digitaljs.js');
const webpack = (await import(pathToFileURL(join(tmp, 'node_modules', 'webpack', 'lib', 'index.js')))).default;
const reqTmp = createRequire(join(tmp, 'package.json'));
const jqueryAbs = reqTmp.resolve('jquery');

await new Promise((resolve, reject) => {
  webpack({
    mode: 'production',
    context: tmp,
    entry: facade,
    output: {
      path: tmp,
      filename: 'digitaljs.js',
      library: { name: 'digitaljs', type: 'umd' },
      globalObject: 'this',
      publicPath: '',
      uniqueName: 'gifosdigitaljs',
    },
    devtool: false,
    target: ['web', 'es2018'],
    resolve: {
      alias: {
        'elkjs/lib/elk.bundled.js': stubElk,
        'web-worker': stubWorker,
        [join(tmp, 'node_modules', 'digitaljs', 'src', 'engines', 'worker.mjs')]: stubEngine,
      },
    },
    module: {
      parser: { javascript: { worker: false, url: false } },
      rules: [
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        { test: /\.(svg|png|gif|woff2?)$/i, type: 'asset/inline' },
        {
          test: jqueryAbs,
          loader: 'expose-loader',
          options: { exposes: ['$', 'jQuery'] },
        },
      ],
    },
    optimization: { splitChunks: false, runtimeChunk: false },
  }, (err, stats) => {
    if (err) return reject(err);
    if (stats.hasErrors()) return reject(new Error(stats.toString({ colors: false })));
    resolve();
  });
});

let js = readFileSync(outJs, 'utf8');
if (/<\/script/i.test(js)) js = js.split('</').join('<\\/');

const extra = ['285.digitaljs.js', '821.digitaljs.js', '285.main.js', '821.main.js']
  .filter((n) => existsSync(join(tmp, n)));
if (extra.length) throw new Error('webpack split chunks: ' + extra.join(','));

const outCss = join(tmp, 'digitaljs.css');
let css = existsSync(outCss) ? readFileSync(outCss, 'utf8') : '/* JointJS / jQuery UI CSS is injected by the JS bundle */\n';
if (/url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('digitaljs CSS fetches a remote url()');
}

js = js.replace(/\/\/# sourceMappingURL=.*/g, '');
if (/^\s*import\s|export\{|import\.meta/m.test(js)) {
  throw new Error('bundle still has ESM syntax');
}
if (!js.includes('Circuit') && !js.includes('displayOn')) {
  throw new Error('bundle missing Circuit');
}
if (!js.includes('jQuery')) throw new Error('bundle missing jQuery expose');

mkdirSync(join(dir, 'vendor'), { recursive: true });
writeFileSync(join(dir, 'vendor', 'digitaljs.js'), js);
if (css) writeFileSync(join(dir, 'vendor', 'digitaljs.css'), css);

const pkg = join(tmp, 'node_modules', 'digitaljs');
copyFileSync(join(pkg, 'LICENSE'), join(dir, 'vendor', 'COPYING-digitaljs.txt'));

function copyIf(src, dest) {
  if (existsSync(src)) copyFileSync(src, dest);
}
copyIf(join(tmp, 'node_modules', 'jquery', 'LICENSE.txt'), join(dir, 'vendor', 'COPYING-jquery.txt'));
copyIf(join(tmp, 'node_modules', 'jquery-ui', 'LICENSE.txt'), join(dir, 'vendor', 'COPYING-jquery-ui.txt'));
const jointLic = [
  join(tmp, 'node_modules', '@joint', 'core', 'LICENSE'),
  join(tmp, 'node_modules', '@joint', 'core', 'LICENSE.md'),
].find(existsSync);
if (jointLic) copyFileSync(jointLic, join(dir, 'vendor', 'COPYING-joint.txt'));

const hex = createHash('sha256').update(js).digest('hex');
const notice = [
  'vendor/digitaljs.js is digitaljs@' + PIN + ' bundled with webpack (UMD).',
  'Layout uses JointJS dagre; elkjs and the worker engine are stubbed.',
  '',
  'package: digitaljs@' + PIN,
  'npm:     https://registry.npmjs.org/digitaljs/-/digitaljs-' + PIN + '.tgz',
  'sha256:  ' + hex,
  'bytes:   ' + js.length,
  css ? 'css:     vendor/digitaljs.css (' + css.length + ' bytes)' : 'css:     inlined by esbuild',
  '',
  'COPYING-digitaljs.txt  BSD-2-Clause, Copyright 2018 Marek Materzok',
  'jQuery / jQuery UI     MIT',
  '@joint/core            MPL-2.0',
  '3vl / wavecanvas       BSD-2-Clause (tilk)',
  'fastpriorityqueue      Apache-2.0',
  '',
  'basedOn: DigitalJS',
  'url:     https://github.com/tilk/digitaljs',
  '',
].join('\n');
writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'), notice);
console.log(notice);
console.log('wrote vendor/digitaljs.js —', (js.length / 1024).toFixed(0), 'KB, sha256', hex);

rmSync(tmp, { recursive: true, force: true });
