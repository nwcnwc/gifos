// Two pipelines, not one with a fallback:
//
//   INTAKE     external URL → cache → pack. Runs once per work.
//   MIGRATION  pack → pack. The only rewrite after intake.
//
// After intake, the URL is history. A later build does not fetch, does not
// read cache, does not rebuild from USFX/TSV. --reintake is only for a
// botched intake: the pack is missing something a migration cannot restore.
// Format changes are migrate-packs.mjs.
//
//   skipIfPacked(path)  pack exists → intake is done
//   pull(url, dest)     intake only: fetch into cache; never empty a dest
//
// Run: node apps/bible/tools/source.mjs --self-test
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const MIN_BYTES = 1000;

export function havePack(path) {
  return !!(path && existsSync(path) && statSync(path).size >= MIN_BYTES);
}

export function haveSource(path) {
  if (!path) return false;
  if (!existsSync(path)) return false;
  const st = statSync(path);
  if (st.isDirectory()) return true;
  return st.size >= MIN_BYTES;
}

// Fetch `url` into `dest`. Never writes a short/failed body over a good dest.
//
//   fetched       URL answered; dest replaced
//   cached        dest already good, URL not contacted
//   frozen-cache  URL failed; dest (last fetch) kept
//   frozen-pack   URL failed, dest gone; committed pack still there
//   missing       URL failed, dest gone, no pack
export async function pull(url, dest, opts) {
  opts = opts || {};
  const min = opts.minBytes || MIN_BYTES;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const packPath = opts.packPath || null;
  const force = !!opts.force;

  if (!force && haveSource(dest) && (!statSync(dest).isDirectory()) &&
      statSync(dest).size >= min) {
    return { status: 'cached', bytes: statSync(dest).size };
  }

  let err = 'no fetch';
  if (typeof fetchImpl === 'function' && url) {
    try {
      const r = await fetchImpl(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < min) throw new Error('short body ' + buf.length);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      return { status: 'fetched', bytes: buf.length };
    } catch (e) {
      err = e && e.message ? e.message : String(e);
    }
  }

  if (haveSource(dest) && !statSync(dest).isDirectory() && statSync(dest).size >= min) {
    return { status: 'frozen-cache', bytes: statSync(dest).size, reason: err };
  }
  if (havePack(packPath)) {
    return { status: 'frozen-pack', bytes: statSync(packPath).size, reason: err };
  }
  return { status: 'missing', reason: err };
}

// Intake gate: a pack on disk means this work already went through intake.
// --reintake is only for recovering content the pack dropped.
export function skipIfPacked(packPath, opts) {
  if (opts && opts.reintake) return null;
  if (havePack(packPath)) {
    return { packed: true, packPath, reason: 'already packed; intake already ran' };
  }
  return null;
}

export function skipIfFrozen(packPath, sources, why) {
  const missing = (sources || []).filter((p) => !haveSource(p));
  if (!missing.length) return null;
  if (havePack(packPath)) {
    return {
      frozen: true,
      packPath,
      reason: why || ('upstream missing: ' + missing.map((p) => p.split('/').pop()).join(', ')),
    };
  }
  return { frozen: false, missing, reason: 'no source and no pack' };
}

export function markFrozen(creditsPath, id, info) {
  if (!creditsPath || !id || !existsSync(creditsPath)) return false;
  const doc = JSON.parse(readFileSync(creditsPath, 'utf8'));
  const sources = Array.isArray(doc.sources) ? doc.sources : [];
  const i = sources.findIndex((s) => s && s.id === id);
  if (i < 0) return false;
  const now = new Date().toISOString().slice(0, 10);
  sources[i] = Object.assign({}, sources[i], {
    frozen: true,
    frozenAt: now,
    frozenReason: (info && info.reason) || sources[i].frozenReason || 'upstream unavailable',
  });
  doc.sources = sources;
  writeFileSync(creditsPath, JSON.stringify(doc, null, 1) + '\n');
  return true;
}

export function clearFrozen(creditsPath, id) {
  if (!creditsPath || !id || !existsSync(creditsPath)) return false;
  const doc = JSON.parse(readFileSync(creditsPath, 'utf8'));
  const sources = Array.isArray(doc.sources) ? doc.sources : [];
  const i = sources.findIndex((s) => s && s.id === id);
  if (i < 0 || !sources[i].frozen) return false;
  const next = Object.assign({}, sources[i]);
  delete next.frozen;
  delete next.frozenAt;
  delete next.frozenReason;
  sources[i] = next;
  doc.sources = sources;
  writeFileSync(creditsPath, JSON.stringify(doc, null, 1) + '\n');
  return true;
}

/* ── self-test ──────────────────────────────────────────────────────────── */

async function selfTest() {
  const dir = join(tmpdir(), 'gifos-source-freeze-' + process.pid);
  mkdirSync(dir, { recursive: true });
  let pass = 0, fail = 0;
  const ok = (c, w) => { if (c) { pass++; console.log('PASS ' + w); } else { fail++; console.log('FAIL ' + w); } };
  try {
    const dest = join(dir, 'src.bin');
    const pack = join(dir, 'out.gbx');
    writeFileSync(dest, Buffer.alloc(2000, 1));
    let calls = 0;
    const fake = async () => { calls++; throw new Error('network'); };
    let r = await pull('https://example.invalid/x', dest, { fetchImpl: fake });
    ok(r.status === 'cached' && calls === 0, 'good dest is used; URL is not contacted');

    writeFileSync(pack, Buffer.alloc(4000, 2));
    rmSync(dest);
    r = await pull('https://example.invalid/x', dest, { fetchImpl: async () => ({ ok: false, status: 404 }), packPath: pack });
    ok(r.status === 'frozen-pack', 'dead URL + no cache + pack present → freeze the pack');

    r = await pull('https://example.invalid/x', dest, { fetchImpl: async () => ({ ok: false, status: 404 }) });
    ok(r.status === 'missing', 'dead URL + nothing on disk → missing, not a silent empty write');

    r = await pull('https://example.invalid/x', dest, {
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(2500, 3) }),
    });
    ok(r.status === 'fetched' && existsSync(dest) && statSync(dest).size === 2500,
       'a live URL replaces dest');

    writeFileSync(dest, Buffer.alloc(2000, 1));
    r = await pull('https://example.invalid/x', dest, {
      force: true,
      fetchImpl: async () => ({ ok: false, status: 410 }),
    });
    ok(r.status === 'frozen-cache' && statSync(dest).size === 2000,
       '--force still keeps dest when the URL is gone');

    const skip = skipIfFrozen(pack, [join(dir, 'no-such.txt')], 'gone');
    ok(skip && skip.frozen, 'builder skip: missing source + pack → frozen');
    const noskip = skipIfFrozen(pack, [dest]);
    ok(noskip === null, 'builder skip: source present → rebuild');

    ok(skipIfPacked(pack) && skipIfPacked(pack).packed,
       'a pack on disk means intake already ran');
    ok(skipIfPacked(pack, { reintake: true }) === null,
       '--reintake is only for recovering dropped content, not a rebuild');
    ok(skipIfPacked(join(dir, 'no-pack.gbx')) === null,
       'no pack yet → intake may run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--self-test')) {
  await selfTest();
}
