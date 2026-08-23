/*
 * vendor.mjs — rebuild vendor/* from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/floppy-bird/vendor.mjs
 *   FLOPPYBIRD_SRC=/path/to/checkout node apps/floppy-bird/vendor.mjs
 *
 * WHAT IT PRODUCES. Classic scripts + CSS with assets as data URLs + an
 * assets.js map so JS-constructed <img> / buzz.sound paths work inside a
 * srcdoc iframe (the runtime only rewrites static src/href in HTML).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/nebez/floppybird.git';
const PIN = 'efd2c7f740299688e524e57bfa3f635c9b857f82'; // gh-pages, 2026-02-16

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.FLOPPYBIRD_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'floppybird-'));
  src = join(tmp, 'floppybird');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

const vendor = join(dir, 'vendor');
mkdirSync(join(vendor, 'assets', 'sounds'), { recursive: true });

const MIME = {
  png: 'image/png', ogg: 'audio/ogg', css: 'text/css', js: 'text/javascript',
};

function dataUrlFor(abs, ext) {
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(abs).toString('base64');
}

const PNG = [
  'bird.png', 'ceiling.png', 'land.png', 'sky.png', 'splash.png', 'scoreboard.png',
  'replay.png', 'pipe.png', 'pipe-up.png', 'pipe-down.png',
  'medal_bronze.png', 'medal_silver.png', 'medal_gold.png', 'medal_platinum.png',
];
for (let i = 0; i < 10; i++) {
  PNG.push('font_big_' + i + '.png');
  PNG.push('font_small_' + i + '.png');
}
const OGG = ['sfx_wing.ogg', 'sfx_point.ogg', 'sfx_hit.ogg', 'sfx_die.ogg', 'sfx_swooshing.ogg'];

const assets = {};
for (const name of PNG) {
  const abs = join(src, 'assets', name);
  if (!existsSync(abs)) throw new Error('missing asset ' + name);
  copyFileSync(abs, join(vendor, 'assets', name));
  assets['assets/' + name] = dataUrlFor(abs, 'png');
}
for (const name of OGG) {
  const abs = join(src, 'assets', 'sounds', name);
  if (!existsSync(abs)) throw new Error('missing sound ' + name);
  copyFileSync(abs, join(vendor, 'assets', 'sounds', name));
  assets['assets/sounds/' + name] = dataUrlFor(abs, 'ogg');
}

function rewriteCssUrls(css, fromDir) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, url) => {
    const u = url.trim();
    if (/^(data:|https?:|\/\/|#)/i.test(u)) return m;
    const rel = join(fromDir, u).replace(/\\/g, '/');
    // from css/ → ../assets/sky.png  ⇒  assets/sky.png
    const key = rel.replace(/^\.\.\//, '').replace(/^\.\//, '');
    const du = assets[key];
    if (!du) throw new Error('css url not in assets map: ' + u + ' (key ' + key + ')');
    return 'url("' + du + '")';
  });
}

copyFileSync(join(src, 'css', 'reset.css'), join(vendor, 'reset.css'));
const mainCss = readFileSync(join(src, 'css', 'main.css'), 'utf8');
writeFileSync(join(vendor, 'main.css'), rewriteCssUrls(mainCss, 'css'));

for (const name of ['jquery.min.js', 'jquery.transit.min.js', 'buzz.min.js']) {
  copyFileSync(join(src, 'js', name), join(vendor, name));
}

let jquery = readFileSync(join(vendor, 'jquery.min.js'), 'utf8');
jquery = jquery.replace(/\n\/\/@ sourceMappingURL=.*\n/, '\n');
writeFileSync(join(vendor, 'jquery.min.js'), jquery);

let main = readFileSync(join(src, 'js', 'main.js'), 'utf8');

function mustReplace(srcText, find, replace, why) {
  if (typeof find === 'string') {
    if (!srcText.includes(find)) {
      throw new Error('PATCH NO LONGER APPLIES: main.js — ' + why);
    }
    return srcText.split(find).join(replace);
  }
  if (!find.test(srcText)) {
    throw new Error('PATCH NO LONGER APPLIES: main.js — ' + why);
  }
  return srcText.replace(find, replace);
}

const sounds = [
  ['sfx_wing.ogg', 'soundJump'],
  ['sfx_point.ogg', 'soundScore'],
  ['sfx_hit.ogg', 'soundHit'],
  ['sfx_die.ogg', 'soundDie'],
  ['sfx_swooshing.ogg', 'soundSwoosh'],
];
for (const [file] of sounds) {
  main = mustReplace(
    main,
    'new buzz.sound("assets/sounds/' + file + '")',
    'new buzz.sound(FLOPPY_ASSETS["assets/sounds/' + file + '"])',
    'buzz.sound path ' + file,
  );
}

main = mustReplace(
  main,
  `elemscore.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");`,
  `elemscore.append("<img src='" + FLOPPY_ASSETS["assets/font_big_" + digits[i] + ".png"] + "' alt='" + digits[i] + "'>");`,
  'font_big img src',
);
main = mustReplace(
  main,
  `elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");`,
  `elemscore.append("<img src='" + FLOPPY_ASSETS["assets/font_small_" + digits[i] + ".png"] + "' alt='" + digits[i] + "'>");`,
  'font_small img src',
);
main = mustReplace(
  main,
  `elemmedal.append('<img src="assets/medal_' + medal +'.png" alt="' + medal +'">');`,
  `elemmedal.append('<img src="' + FLOPPY_ASSETS["assets/medal_" + medal + ".png"] + '" alt="' + medal +'">');`,
  'medal img src',
);

// Cookies are disabled in the sandbox. mp.js hangs FloppyBird.getScore /
// setScore; rewrite so a leftover document.cookie call cannot throw.
main = mustReplace(
  main,
  /function getCookie\(cname\)\s*\{[\s\S]*?return "";\n\}/,
  'function getCookie(cname)\n{\n   if (window.FloppyBird && FloppyBird.getScore) return FloppyBird.getScore(cname);\n   return "";\n}',
  'getCookie → prefs',
);
main = mustReplace(
  main,
  /function setCookie\(cname,cvalue,exdays\)\s*\{[\s\S]*?document\.cookie = cname \+ "=" \+ cvalue \+ "; " \+ expires;\n\}/,
  'function setCookie(cname,cvalue,exdays)\n{\n   if (window.FloppyBird && FloppyBird.setScore) FloppyBird.setScore(cname, cvalue);\n}',
  'setCookie → prefs',
);

if (main.includes('document.cookie')) {
  throw new Error('main.js still touches document.cookie after the prefs patch');
}
if (/new buzz\.sound\("assets\//.test(main) || /src='assets\//.test(main) || /src="assets\//.test(main)) {
  throw new Error('main.js still has a raw assets/ path — FLOPPY_ASSETS missed one');
}
writeFileSync(join(vendor, 'main.js'), main);

const assetLines = Object.keys(assets).sort().map((k) =>
  '  ' + JSON.stringify(k) + ': ' + JSON.stringify(assets[k]));
writeFileSync(join(vendor, 'assets.js'),
  '/* generated by vendor.mjs — data URLs for png/ogg inside the GIF */\n' +
  'var FLOPPY_ASSETS = {\n' + assetLines.join(',\n') + '\n};\n');

copyFileSync(join(src, 'LICENSE'), join(dir, 'COPYING.txt'));
copyFileSync(join(src, 'LICENSE'), join(vendor, 'COPYING.txt'));

const sha = (p) => createHash('sha256').update(readFileSync(join(vendor, p))).digest('hex');
console.log('wrote vendor/ from floppybird@' + PIN.slice(0, 10));
console.log('  jquery     ', sha('jquery.min.js'));
console.log('  main.js    ', sha('main.js'));
console.log('  assets.js  ', (readFileSync(join(vendor, 'assets.js')).length / 1024).toFixed(0), 'KB');
if (tmp) rmSync(tmp, { recursive: true, force: true });
