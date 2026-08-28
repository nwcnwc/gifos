// The committed pack is the freeze. A dead URL must not wipe packs, and a
// format change migrates the pack without re-fetching.
//
// Run: node test/unit/bible-source-freeze.js
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..', '..');
const bible = path.join(root, 'apps', 'bible');
const read = (p) => fs.readFileSync(path.join(bible, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

const packsBuild = read('tools/build-packs.mjs');
ok(!/rmSync\(outDir/.test(packsBuild) && !/rmSync\(.*packs/.test(packsBuild),
   'build-packs never deletes the packs directory');
ok(/skipIfPacked/.test(packsBuild) && /intake already ran/.test(packsBuild),
   'build-packs does not re-intake a .gbp that is already on disk');
ok(/FROZEN/.test(packsBuild) && /no USFX cache; pack kept/.test(packsBuild),
   'a missing USFX zip during a new intake keeps any committed .gbp');

const helpsBuild = read('tools/build-helps.mjs');
ok(/skipIfPacked/.test(helpsBuild) && /intake already ran/.test(helpsBuild),
   'build-helps does not re-parse TSK (etc.) once the .gbx exists');
ok(/skipIfFrozen/.test(helpsBuild) && /FROZEN/.test(helpsBuild),
   'a brand-new help pack still refuses to die if source is gone mid-intake');

ok(fs.existsSync(path.join(bible, 'tools/source.mjs')),
   'tools/source.mjs is the pull/freeze helper');
ok(fs.existsSync(path.join(bible, 'tools/migrate-packs.mjs')),
   'tools/migrate-packs.mjs rewrites packs; it does not fetch');
ok(/upstream is not consulted/i.test(read('tools/migrate-packs.mjs')) ||
   /Upstream is not consulted/.test(read('tools/migrate-packs.mjs')),
   'migrate-packs states it does not consult upstream');

const pipe = read('PIPELINE.md');
ok(/Two pipelines/.test(pipe) && /INTAKE/.test(pipe) && /MIGRATION/.test(pipe),
   'PIPELINE.md is two pipelines: intake once, then migrate the pack');
ok(/does not hit GitHub or CrossWire/.test(pipe) || /do not hit GitHub/.test(pipe),
   'intake does not contact upstream when the pack already exists');

(async () => {
  const sourceUrl = pathToFileURL(path.join(bible, 'tools/source.mjs')).href;
  const migrateUrl = pathToFileURL(path.join(bible, 'tools/migrate-packs.mjs')).href;
  const source = await import(sourceUrl);
  const migrate = await import(migrateUrl);

  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bible-freeze-'));
  try {
    const dest = path.join(dir, 'a.bin');
    const pack = path.join(dir, 'a.gbp');
    fs.writeFileSync(dest, Buffer.alloc(1500, 1));
    let n = 0;
    const r1 = await source.pull('https://example.invalid/x', dest, {
      fetchImpl: async () => { n++; throw new Error('nope'); },
    });
    ok(r1.status === 'cached' && n === 0, 'pull does not hit the network when dest is good');

    fs.unlinkSync(dest);
    fs.writeFileSync(pack, Buffer.alloc(2000, 2));
    const r2 = await source.pull('https://example.invalid/x', dest, {
      fetchImpl: async () => ({ ok: false, status: 404 }),
      packPath: pack,
    });
    ok(r2.status === 'frozen-pack' && !fs.existsSync(dest),
       'dead URL with no cache freezes the pack and writes nothing');

    const xrefs = path.join(root, 'site', 'apps', 'bible', 'packs', 'help-xrefs.gbx');
    ok(fs.existsSync(xrefs), 'the Treasury pack is committed (the freeze)');
    const opened = migrate.openPackBytes(fs.readFileSync(xrefs));
    ok(opened.magic === 'GBX1' && opened.header.kind === 'xrefs' &&
       opened.sections.some((s) => s.name === 'rows'),
       'migrate-packs can open help-xrefs.gbx without the TSV');
    const ident = migrate.migrateOne(fs.readFileSync(xrefs));
    ok(ident.changed === false, 'with no migrations listed, the pack is not rewritten');
    ok(source.skipIfPacked(xrefs) && source.skipIfPacked(xrefs).packed,
       'Treasury is already packed, so intake will not run again');
    ok(source.skipIfPacked(xrefs, { reintake: true }) === null,
       '--reintake is the only way to take Treasury through intake twice');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
