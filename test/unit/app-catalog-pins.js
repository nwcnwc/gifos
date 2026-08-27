// Store catalog pin facts: required vs optional downloads are a listing
// fact, not something you discover after Install.
//
// Run: node test/unit/app-catalog-pins.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const appjson = (slug) => JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'apps', slug, 'app.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'apps', 'index.json'), 'utf8'));
const storeJs = fs.readFileSync(path.join(ROOT, 'site', 'js', 'store.js'), 'utf8');
const permsJs = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-perms.js'), 'utf8');
const runtimeJs = fs.readFileSync(path.join(ROOT, 'site', 'js', 'runtime.js'), 'utf8');
const assetsJs = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-assets.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

check('the store has words for the assets ability',
  /assets:\s*'Downloads extra files'/.test(storeJs));
check('the store paints required-pin copy',
  /Downloads at install/.test(storeJs) && /fetched when you install/.test(storeJs));
check('the store paints optional-pin copy',
  /Downloads when you pick them/.test(storeJs) && /None of them download at install/.test(storeJs));
check('Abilities names extra-file downloads as a checkbox',
  /assets:\s*'Download extra files when you pick them'/.test(permsJs) &&
  /Uncheck to block those downloads/.test(permsJs));
check('Abilities offers Download all for the extra-files row',
  /data-dl-all/.test(permsJs) && /Download all/.test(permsJs) &&
  /pullOptional/.test(permsJs));
check('the runtime wires Download all to optional pins, grouped by host',
  /optionalOnly:\s*true/.test(runtimeJs) && /parallelHosts:\s*true/.test(runtimeJs));
check('same-server extra files download one at a time, different servers in parallel',
  /function groupByHost/.test(assetsJs) && /opts\.parallelHosts/.test(assetsJs));

const bible = appjson('bible');
check('Bible listing records optional pins (not a 4 MB install pretending to be the whole library)',
  bible.optionalCount > 100 && bible.optionalDownload > 50e6,
  'count=' + bible.optionalCount + ' bytes=' + bible.optionalDownload);
check('Bible listing injects the assets ability so the store can name it',
  bible.capabilities && bible.capabilities.assets === true);
check('Bible has no required extra download at install',
  !bible.download);

const idx = index.apps.find((a) => a.slug === 'bible');
check('the grid index carries optionalCount so the card can say Extra files later',
  idx && idx.optionalCount === bible.optionalCount && idx.optionalDownload === bible.optionalDownload);

const tesseract = appjson('tesseract');
check('Tesseract listing names its later English pack',
  tesseract.optionalCount === 1 && tesseract.optionalDownload > 10e6);

const uvr = appjson('vocal-remover');
check('Vocal Remover listing names its later models as optional, not as install',
  uvr.optionalCount >= 2 && !uvr.download);

const gemma = appjson('offline-llm-gemma');
check('a required-pin app still quotes the install-time model download',
  gemma.download > 50e6 && !gemma.optionalCount);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
process.exit(failures ? 1 : 0);
