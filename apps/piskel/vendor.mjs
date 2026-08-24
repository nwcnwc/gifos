/*
 * vendor.mjs — rebuild vendor/* from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline and byte-reproducible from
 * what is committed here. Run this only to move the pin.
 *
 *   node apps/piskel/vendor.mjs
 *   PISKEL_SRC=/path/to/checkout node apps/piskel/vendor.mjs
 *
 * WHAT IT PRODUCES. One classic script + one CSS file (assets as data URLs) +
 * the inlined editor markup as index.html. Upstream is already a concat of
 * classic scripts; GifOS's runtime inlines <script src> by rewriting the tag,
 * which DROPS type="module", so that concat is the right shape.
 *
 * Persistence is NOT compiled in as a library. boot.js hangs a localStorage
 * stand-in; PiskelDatabase / BackupDatabase are rewritten to gifos.db.
 * gif.js workers become a main-thread FakeWorker (no wasm hatch).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const UPSTREAM = 'https://github.com/piskelapp/piskel.git';
const PIN = 'a6b9c02daefceb10093f71e92d52d16920ccb16e'; // master, 2026-04-09 "Test flakes"

const run = (cmd, args, cwd, opts = {}) => execFileSync(cmd, args, {
  cwd, stdio: 'inherit', timeout: 900000,
  env: { ...process.env, HUSKY: '0', ...(opts.env || {}) },
  ...opts,
});

let src = process.env.PISKEL_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'piskel-'));
  src = join(tmp, 'piskel');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

const MIME = {
  png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  svg: 'image/svg+xml', ico: 'image/x-icon', css: 'text/css',
  woff: 'font/woff', ttf: 'font/ttf', eot: 'application/vnd.ms-fontobject',
};

function dataUrlFor(abs) {
  if (!existsSync(abs)) throw new Error('missing asset ' + abs);
  const ext = extname(abs).slice(1).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(abs).toString('base64');
}

function apply(file, find, replace, why) {
  const f = join(src, file);
  const before = readFileSync(f, 'utf8');
  if (!find.test(before)) {
    throw new Error('PATCH NO LONGER APPLIES: ' + file + ' — ' + why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY;'
      + '\n  building without it silently loses what it was for.');
  }
  writeFileSync(f, before.replace(find, replace));
  console.log('patched ' + file + ' — ' + why);
}

// ---- PATCHES on upstream SOURCE before the build ----------------------------

apply(
  'src/js/utils/WorkerUtils.js',
  /createWorker:\s*function\s*\(worker,\s*workerId\)\s*\{[\s\S]*?return new Worker\(workers\[workerId\]\);\s*\}/,
  `createWorker: function (WorkerCtor, workerId) {
      // GifOS sandbox has no worker-src. Run the same constructor on the main
      // thread: HashWorker / FrameColorsWorker / ImageProcessorWorker already
      // speak postMessage/onmessage on \`this\`.
      var instance = new WorkerCtor();
      var fake = {
        onmessage: null,
        terminate: function () {},
        postMessage: function (data) {
          instance.postMessage = function (msg) {
            var h = fake.onmessage;
            setTimeout(function () { if (h) h({ data: msg }); }, 0);
          };
          setTimeout(function () {
            if (instance.onmessage) instance.onmessage({ data: data });
          }, 0);
        }
      };
      return fake;
    }`,
  'Piskel colour/hash workers run on the main thread (no blob Worker under CSP)'
);

apply(
  'src/js/lib/gif/gif.js',
  /b=new Worker\(a\.options\.workerScript\)/,
  'b=new window.__GifFakeWorker()',
  'gif.js encoding uses the main-thread FakeWorker, not a blob Worker'
);

apply(
  'src/js/controller/settings/exportimage/GifExportController.js',
  /workers:\s*5,/,
  'workers: 1,',
  'one main-thread encoder is enough; five FakeWorkers would just serialise'
);

apply(
  'src/js/utils/UserAgent.js',
  /ns\.UserAgent\.supportedUserAgents = \[\s*"isIE11",\s*"isEdge",\s*"isChrome",\s*"isFirefox"\s*\];/,
  'ns.UserAgent.supportedUserAgents = [\n    "isIE11",\n    "isEdge",\n    "isChrome",\n    "isFirefox",\n    "isSafari"\n  ];',
  'Safari is a supported GifOS browser; do not show the unsupported-browser dialog'
);

writeFileSync(join(src, 'src/js/service/storage/GalleryStorageService.js'), `(function () {
  var ns = $.namespace("pskl.service.storage");

  ns.GalleryStorageService = function (piskelController) {
    this.piskelController = piskelController;
  };

  ns.GalleryStorageService.prototype.init = function () {};

  ns.GalleryStorageService.prototype.save = function () {
    return Q.reject(
      "This local copy of Piskel cannot save to piskelapp.com. Use Save as .piskel or Export as GIF."
    );
  };
})();
`);
console.log('rewrote GalleryStorageService.js — no piskelapp.com gallery');

apply(
  'src/templates/debug-header.html',
  /href="index\.html"\s+target="_blank"/,
  'href="#"',
  'New-sprite button must not navigate the srcdoc iframe'
);

apply(
  'src/js/controller/HeaderController.js',
  /this\.updateHeader_\(\);\s*\};/,
  `this.updateHeader_();

    var newBtn = document.querySelector(".new-piskel-desktop");
    if (newBtn) {
      newBtn.addEventListener("click", function (e) {
        e.preventDefault();
        var size = pskl.UserSettings.get(pskl.UserSettings.DEFAULT_SIZE);
        var descriptor = new pskl.model.piskel.Descriptor("New Piskel", "");
        var fresh = new pskl.model.Piskel(size.width, size.height, Constants.DEFAULT.FPS, descriptor);
        var layer = new pskl.model.Layer("Layer 1");
        layer.addFrame(new pskl.model.Frame(size.width, size.height));
        fresh.addLayer(layer);
        pskl.app.piskelController.setPiskel(fresh);
      });
    }
  };`,
  'New-sprite button creates a blank piskel in place instead of loading index.html'
);

apply(
  'src/js/service/BackupService.js',
  /this\.backupDatabase\.init\(\)\.then\(\s*function \(\) \{\s*window\.setInterval\(this\.backup\.bind\(this\),\s*BACKUP_INTERVAL\);\s*\}\.bind\(this\)\s*\);/,
  `this.backupDatabase.init().then(
      function () {
        window.setInterval(this.backup.bind(this), BACKUP_INTERVAL);
        return this.backupDatabase.findLastSnapshot(function () { return true; });
      }.bind(this)
    ).then(function (snapshot) {
      if (!snapshot || !snapshot.serialized) return;
      try {
        pskl.utils.serialization.Deserializer.deserialize(
          JSON.parse(snapshot.serialized),
          function (piskel) {
            pskl.app.piskelController.setPiskel(piskel, { noSnapshot: true });
          }
        );
      } catch (e) { /* a corrupt snapshot must not brick the editor */ }
    });`,
  'restore the last sprite from gifos.db so close/open keeps the animation'
);

apply(
  'src/templates/debug-header.html',
  /<div class="fake-piskelapp-header">/,
  `<div class="fake-piskelapp-header">
  <span style="position:absolute;left:10px;top:0;font-size:11px;color:#888;letter-spacing:.02em">unofficial · local</span>`,
  'header says this is the unofficial local copy'
);

// gif.js worker: wrap gif.ie.worker.js so encoding runs as a function, not a Worker.
{
  const ie = readFileSync(join(src, 'src/js/lib/gif/gif.ie.worker.js'), 'utf8');
  writeFileSync(join(src, 'src/js/lib/gif/gif.worker.js'),
`(function () {
  // GifOS: no blob workers. Host gif.js's encoder on the main thread.
  // \`self\` is a parameter, so the encoder's self.onmessage / self.postMessage
  // bind to the FakeWorker, not window.
  window.__installGifEncoder = function (self) {
${ie}
  };
  window.__GifFakeWorker = function () {
    var result;
    var workerSelf = { postMessage: function (data) { result = data; } };
    window.__installGifEncoder(workerSelf);
    this.onmessage = null;
    this.postMessage = function (data) {
      result = undefined;
      workerSelf.onmessage({ data: data });
      var r = result;
      var me = this;
      setTimeout(function () { if (me.onmessage) me.onmessage({ data: r }); }, 0);
    };
    this.terminate = function () {};
    this.addEventListener = function () {};
    this.removeEventListener = function () {};
  };
  window.GifWorkerURL = "gifos-main-thread";
})();
`);
  console.log('patched src/js/lib/gif/gif.worker.js — encoder on the main thread');
}

// IndexedDB replacements: gifos.db. In-memory fallback so dest/prod still
// boots for the screenshot (no gifos there).
writeFileSync(join(src, 'src/js/database/PiskelDatabase.js'), `(function () {
  var ns = $.namespace("pskl.database");

  ns.PiskelDatabase = function () {
    this.mem = {};
    this._db = null;
  };

  ns.PiskelDatabase.DB_NAME = "PiskelDatabase";

  ns.PiskelDatabase.prototype.init = function () {
    var self = this;
    try { if (window.gifos && gifos.db) this._db = gifos.db("piskels"); } catch (e) {}
    if (!this._db) return Q.resolve(this);
    return this._db.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.name) self.mem[r.name] = r;
      });
      return self;
    }).catch(function () { return self; });
  };

  ns.PiskelDatabase.prototype._put = function (rec) {
    this.mem[rec.name] = rec;
    if (this._db) return this._db.put({ id: rec.name, name: rec.name, description: rec.description, date: rec.date, serialized: rec.serialized });
    return Q.resolve();
  };

  ns.PiskelDatabase.prototype.get = function (name) {
    return Q.resolve(this.mem[name]);
  };

  ns.PiskelDatabase.prototype.list = function () {
    var out = [];
    Object.keys(this.mem).forEach(function (k) {
      var r = this.mem[k];
      out.push({ name: r.name, date: r.date, description: r.description });
    }.bind(this));
    return Q.resolve(out);
  };

  ns.PiskelDatabase.prototype.update = function (name, description, date, serialized) {
    return this._put({ name: name, description: description, date: date, serialized: serialized });
  };

  ns.PiskelDatabase.prototype.create = function (name, description, date, serialized) {
    return this._put({ name: name, description: description, date: date, serialized: serialized });
  };

  ns.PiskelDatabase.prototype.delete = function (name) {
    delete this.mem[name];
    if (this._db) return this._db.delete(name);
    return Q.resolve();
  };
})();
`);
console.log('rewrote src/js/database/PiskelDatabase.js — gifos.db, no IndexedDB');

writeFileSync(join(src, 'src/js/database/BackupDatabase.js'), `(function () {
  var ns = $.namespace("pskl.database");

  ns.BackupDatabase = function () {
    this.mem = [];
    this._next = 1;
    this._db = null;
  };

  ns.BackupDatabase.DB_NAME = "PiskelSessionsDatabase";

  ns.BackupDatabase.prototype.init = function () {
    var self = this;
    try { if (window.gifos && gifos.db) this._db = gifos.db("backups"); } catch (e) {}
    if (!this._db) return Q.resolve(this);
    return this._db.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r) return;
        var snap = {
          id: r.snapId || Number(String(r.id).replace(/^s/, "")) || r.id,
          session_id: r.session_id,
          date: r.date,
          name: r.name,
          description: r.description,
          frames: r.frames,
          width: r.width,
          height: r.height,
          fps: r.fps,
          serialized: r.serialized
        };
        self.mem.push(snap);
        if (typeof snap.id === "number" && snap.id >= self._next) self._next = snap.id + 1;
      });
      self.mem.sort(function (a, b) { return b.date - a.date; });
      return self;
    }).catch(function () { return self; });
  };

  ns.BackupDatabase.prototype._persist = function (snap) {
    if (!this._db) return Q.resolve();
    return this._db.put({
      id: "s" + snap.id,
      snapId: snap.id,
      session_id: snap.session_id,
      date: snap.date,
      name: snap.name,
      description: snap.description,
      frames: snap.frames,
      width: snap.width,
      height: snap.height,
      fps: snap.fps,
      serialized: snap.serialized
    });
  };

  ns.BackupDatabase.prototype.createSnapshot = function (snapshot) {
    if (snapshot.id == null) snapshot.id = this._next++;
    this.mem.push(snapshot);
    return this._persist(snapshot);
  };

  ns.BackupDatabase.prototype.updateSnapshot = function (snapshot) {
    for (var i = 0; i < this.mem.length; i++) {
      if (this.mem[i].id === snapshot.id) { this.mem[i] = snapshot; break; }
    }
    return this._persist(snapshot);
  };

  ns.BackupDatabase.prototype.deleteSnapshot = function (snapshot) {
    this.mem = this.mem.filter(function (s) { return s.id !== snapshot.id; });
    if (this._db) return this._db.delete("s" + snapshot.id);
    return Q.resolve();
  };

  ns.BackupDatabase.prototype.getSnapshot = function (snapshotId) {
    for (var i = 0; i < this.mem.length; i++) {
      if (this.mem[i].id === snapshotId) return Q.resolve(this.mem[i]);
    }
    return Q.resolve(undefined);
  };

  ns.BackupDatabase.prototype.findLastSnapshot = function (accept) {
    var sorted = this.mem.slice().sort(function (a, b) { return b.date - a.date; });
    for (var i = 0; i < sorted.length; i++) {
      if (accept(sorted[i])) return Q.resolve(sorted[i]);
    }
    return Q.resolve(null);
  };

  ns.BackupDatabase.prototype.getSnapshotsBySessionId = function (sessionId) {
    var out = this.mem.filter(function (s) { return s.session_id === sessionId; });
    out.sort(function (a, b) { return b.date - a.date; });
    return Q.resolve(out);
  };

  ns.BackupDatabase.prototype.getSessions = function () {
    var sessions = {};
    this.mem.forEach(function (snapshot) {
      var s = sessions[snapshot.session_id];
      if (!s) {
        sessions[snapshot.session_id] = {
          startDate: snapshot.date,
          endDate: snapshot.date,
          name: snapshot.name,
          description: snapshot.description,
          id: snapshot.session_id,
          count: 1
        };
      } else {
        s.startDate = Math.min(s.startDate, snapshot.date);
        s.endDate = Math.max(s.endDate, snapshot.date);
        s.count++;
        if (s.endDate === snapshot.date) {
          s.name = snapshot.name;
          s.description = snapshot.description;
        }
      }
    });
    return Q.resolve(Object.keys(sessions).map(function (k) { return sessions[k]; }));
  };

  ns.BackupDatabase.prototype.deleteSnapshotsForSession = function (sessionId) {
    var gone = this.mem.filter(function (s) { return s.session_id === sessionId; });
    this.mem = this.mem.filter(function (s) { return s.session_id !== sessionId; });
    var self = this;
    if (!this._db) return Q.resolve();
    return Q.all(gone.map(function (s) { return self._db.delete("s" + s.id); }));
  };
})();
`);
console.log('rewrote src/js/database/BackupDatabase.js — gifos.db, no IndexedDB');

// ---- build: sprites + concat (no Vite — it wants Node 20, this box is 18) ----
// Upstream is already a concat of classic scripts. We do the same job as
// vite-plugins/concat-scripts.js + html-include.js without spinning Vite.
if (!existsSync(join(src, 'node_modules', 'spritesmith'))) {
  console.log('npm install spritesmith + spritesheet-templates…');
  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts',
    'spritesmith@3.5.1', 'spritesheet-templates@10.5.2'], src);
}
console.log('generating sprites…');
run('node', ['scripts/sprite.js'], src);

const srcDir = join(src, 'src');
const dest = join(src, 'dest', 'prod');
mkdirSync(join(dest, 'css'), { recursive: true });
mkdirSync(join(dest, 'js'), { recursive: true });
mkdirSync(join(dest, 'img'), { recursive: true });

function concatList(listFile, property, separator) {
  delete require.cache[join(srcDir, listFile)];
  const paths = require(join(srcDir, listFile))[property];
  return paths.map((rel) => {
    const full = join(srcDir, rel);
    if (!existsSync(full)) throw new Error('concat missing ' + rel);
    return readFileSync(full, 'utf8');
  }).join(separator);
}

let js = concatList('piskel-script-list.js', 'scripts', ';\n');
// Escape ONLY `</script` (case-insensitive). The bundle is inlined into a
// <script> block by the runtime (runtime.js buildAppHtml), where a literal
// `</script` would terminate the block early — that ONE sequence must not
// survive raw. The previous blanket `</` → `<\/` escape was WRONG: `<\/` only
// means the same as `</` inside STRING literals; inside a REGEX literal the
// `\/` escapes the closing slash, so upstream's `key.replace(/</g, "&lt;")`
// became the unterminated `/<\/g` and the whole bundle was a SyntaxError.
// `</script` never occurs unescaped inside a regex literal (an unescaped `/`
// would already terminate it), so this narrow escape is safe everywhere.
js = js.replace(/<\/(script)/gi, '<\\/$1');
js += '\n;if(window.__gifosReady)window.__gifosReady.then(window.__gifosStartPiskel);else window.__gifosStartPiskel();\n';

let css = concatList('piskel-style-list.js', 'styles', '\n');
css = css.replace(/var\(--highlight-color\)/g, 'gold');

function rewriteCssUrls(cssText, cssDir) {
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, url) => {
    let u = url.trim();
    if (/^(data:|https?:|\/\/|#)/i.test(u)) return m;
    u = u.replace(/[?#].*$/, '');
    const resolved = posix.normalize(posix.join(cssDir.replace(/\\/g, '/'), u));
    // CSS in src/css/*; urls are relative to that folder (../img/..., fonts/...).
    const abs = join(srcDir, resolved);
    try { return 'url("' + dataUrlFor(abs) + '")'; }
    catch { return m; }
  });
}
css = rewriteCssUrls(css, 'css');
css += `
html, body { height: 100%; margin: 0; overflow: hidden; background: #1d1d1d; }
`;

function resolveIncludes(content, baseDir) {
  return content.replace(/@@include\(\s*'([^']+)'\s*,\s*\{[^}]*\}\s*\)/g, (match, includePath) => {
    const fullPath = join(baseDir, includePath);
    if (!existsSync(fullPath)) throw new Error('include missing ' + includePath);
    return resolveIncludes(readFileSync(fullPath, 'utf8'), dirname(fullPath));
  });
}

let builtHtml = readFileSync(join(srcDir, 'index.html'), 'utf8');
builtHtml = resolveIncludes(builtHtml, srcDir);
builtHtml = builtHtml.replace(/@@version/g, '').replace(/@@releaseVersion/g, '0.15.2');
writeFileSync(join(dest, 'index.html'), builtHtml);

// dest/prod/img + css/fonts copies, for the screenshot server (data-URL CSS
// already inlined for the GIF; dest still needs files to serve as a page).
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const a = join(from, name), b = join(to, name);
    if (statSync(a).isDirectory()) copyTree(a, b);
    else copyFileSync(a, b);
  }
}
copyTree(join(srcDir, 'img'), join(dest, 'img'));
if (existsSync(join(srcDir, 'css', 'fonts'))) copyTree(join(srcDir, 'css', 'fonts'), join(dest, 'css', 'fonts'));
if (existsSync(join(srcDir, 'logo.png'))) copyFileSync(join(srcDir, 'logo.png'), join(dest, 'logo.png'));
writeFileSync(join(dest, 'css', 'piskel-style-packaged.css'), concatList('piskel-style-list.js', 'styles', '\n').replace(/var\(--highlight-color\)/g, 'gold'));
writeFileSync(join(dest, 'js', 'piskel-packaged-min.js'), concatList('piskel-script-list.js', 'scripts', ';\n'));
// dest/prod boot expects versioned filenames; rewrite boot to unversioned.
{
  let boot = readFileSync(join(srcDir, 'piskel-boot.js'), 'utf8');
  boot = boot.replace(/@@version/g, '').replace(/@@releaseVersion/g, '0.15.2');
  boot = boot.replace(/piskel-style-packaged" \+ version \+ "\.css/, 'piskel-style-packaged.css" + "');
  boot = boot.replace(/piskel-packaged-min" \+ version \+ "\.js/, 'piskel-packaged-min.js" + "');
  writeFileSync(join(dest, 'piskel-boot.js'), boot);
}
// The dest index still has @@include-resolved markup and an inline boot. For
// the screenshot, point the inline boot at our unversioned files.
builtHtml = builtHtml.replace("@@include('piskel-boot.js', {})", readFileSync(join(dest, 'piskel-boot.js'), 'utf8'));
// resolveIncludes already inlined piskel-boot.js via @@include. Rewrite load paths.
builtHtml = builtHtml.replace(/piskel-style-packaged" \+ version \+ "\.css/g, 'piskel-style-packaged.css" + "');
builtHtml = builtHtml.replace(/piskel-packaged-min" \+ version \+ "\.js/g, 'piskel-packaged-min.js" + "');
builtHtml = builtHtml.replace(/"css\/piskel-style-packaged" \+ version \+ "\.css"/g, '"css/piskel-style-packaged.css"');
builtHtml = builtHtml.replace(/"js\/piskel-packaged-min" \+ version \+ "\.js"/g, '"js/piskel-packaged-min.js"');
writeFileSync(join(dest, 'index.html'), builtHtml);
console.log('concatenated piskel.js / piskel.css (no Vite)');

let html = readFileSync(join(dest, 'index.html'), 'utf8');
// Drop the inline boot that dynamically load()s CSS/JS — the sandbox has no
// files to fetch, and the runtime inlines <script src> / <link href>.
html = html.replace(/<script type="text\/javascript">[\s\S]*?<\/script>\s*<!--body-main-end-->/,
  '<!--body-main-end-->');
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
);
if (!html.includes('name="viewport"')) {
  html = html.replace('<meta charset="UTF-8">',
    '<meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
}
if (!/<link[^>]+piskel-style/.test(html) && !html.includes('href="vendor/piskel.css"')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="vendor/piskel.css">\n</head>');
}
if (!html.includes('src="boot.js"')) {
  const lastBody = html.lastIndexOf('</body>');
  if (lastBody < 0) throw new Error('index.html has no </body>');
  html = html.slice(0, lastBody) +
    '<script src="boot.js"></script>\n<script src="vendor/piskel.js"></script>\n' +
    html.slice(lastBody);
}
if (!html.includes('src="boot.js"')) throw new Error('index.html rewrite dropped boot.js');
if (!html.includes('src="vendor/piskel.js"')) throw new Error('index.html rewrite dropped vendor/piskel.js');
if (!html.includes('href="vendor/piskel.css"')) throw new Error('index.html rewrite dropped vendor/piskel.css');

const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });
writeFileSync(join(vendor, 'piskel.js'), js);
writeFileSync(join(vendor, 'piskel.css'), css);
copyFileSync(join(src, 'LICENSE'), join(vendor, 'LICENSE'));
copyFileSync(join(src, 'LICENSE'), join(dir, 'LICENSE'));
writeFileSync(join(dir, 'index.html'), html);

writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/piskel.js and vendor/piskel.css are GENERATED. Do not edit them; run node apps/piskel/vendor.mjs.\n\n' +
  'upstream: ' + UPSTREAM + '\n' +
  'commit:   ' + PIN + '\n' +
  'version:  0.15.2-SNAPSHOT (packaged as 0.15.2)\n' +
  'entry:    dest/prod concat, classic scripts, FakeWorker GIF encoder\n' +
  'store:    gifos.db via boot.js + rewritten PiskelDatabase/BackupDatabase\n\n' +
  'Piskel is Apache-2.0 (LICENSE). The notice travels inside the GIF.\n'
);

console.log('wrote apps/piskel/vendor/piskel.js —', (js.length / 1024).toFixed(0), 'KB');
console.log('wrote apps/piskel/vendor/piskel.css —', (css.length / 1024).toFixed(0), 'KB');

// ---- screenshot of dest/prod (real editor, empty canvas is still the UI) ----
async function shoot() {
  const shotOut = join(dir, 'screenshot.png');
  let pw;
  try {
    pw = require('../../test/lib/pw.js');
  } catch (e) {
    console.log('note: playwright not resolved, skipping screenshot —', e.message);
    return;
  }
  const { chromium, CHROME } = pw;
  const files = Object.create(null);
  function walk(base, rel) {
    for (const name of readdirSync(base)) {
      const abs = join(base, name);
      const r = rel ? rel + '/' + name : name;
      if (statSync(abs).isDirectory()) walk(abs, r);
      else files['/' + r] = abs;
    }
  }
  walk(dest, '');
  const server = createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    const p = u === '/' ? files['/index.html'] : files[u];
    if (!p) { res.writeHead(404); res.end('no'); return; }
    const ext = extname(p).slice(1).toLowerCase();
    const mime = ({ html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', woff: 'font/woff', ttf: 'font/ttf' })[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime });
    res.end(readFileSync(p));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#drawing-canvas-container canvas', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));
    // Draw a little walk-cycle so the canvas is not an empty checkerboard.
    await page.evaluate(() => {
      const R = '#E8B923', C = '#F4E8C8', K = '#111111', B = '#8A6A08';
      function grid(rows) {
        return rows.map((row) => row.split('').map((ch) => {
          if (ch === 'R') return R; if (ch === 'C') return C;
          if (ch === 'K') return K; if (ch === 'B') return B;
          return 'rgba(0, 0, 0, 0)';
        }));
      }
      const frames = [
        grid([
          '................................',
          '................................',
          '..............CC................',
          '.............CRRC...............',
          '.............CRKC...............',
          '.............RRRR...............',
          '............RRRRRR..............',
          '............RRRRRR..............',
          '.............RRRR...............',
          '............RR..RR..............',
          '............B....B..............',
          '...........B......B.............',
          '................................',
          '................................',
          '................................',
          '................................',
        ]),
        grid([
          '................................',
          '................................',
          '..............CC................',
          '.............CRRC...............',
          '.............CRKC...............',
          '.............RRRR...............',
          '............RRRRRR..............',
          '............RRRRRR..............',
          '.............RRRR...............',
          '.............RRRR...............',
          '.............BBBB...............',
          '............B....B..............',
          '................................',
          '................................',
          '................................',
          '................................',
        ]),
      ];
      const size = 32;
      const descriptor = new window.pskl.model.piskel.Descriptor('Walk', 'GifOS cover');
      const piskel = new window.pskl.model.Piskel(size, size, 8, descriptor);
      const layer = new window.pskl.model.Layer('Layer 1');
      frames.forEach((g) => {
        const pixelGrid = window.pskl.utils.FrameUtils.toFrameGrid(g);
        layer.addFrame(window.pskl.model.Frame.fromPixelGrid(pixelGrid));
      });
      piskel.addLayer(layer);
      window.pskl.app.piskelController.setPiskel(piskel, { noSnapshot: true });
    });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: shotOut, type: 'png' });
    console.log('wrote apps/piskel/screenshot.png');
  } finally {
    await browser.close();
    server.close();
  }
}

try {
  await shoot();
} catch (e) {
  console.log('note: screenshot failed —', e && e.message ? e.message : e);
}

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/piskel/vendor from ' + PIN.slice(0, 10));
