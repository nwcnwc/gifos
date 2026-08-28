// Migration pipeline. Pack → pack. Upstream is not consulted, cache is not
// read. Intake (fetch + build-*) is the other pipeline and runs once.
//
//   node apps/bible/tools/migrate-packs.mjs           # apply pending
//   node apps/bible/tools/migrate-packs.mjs --check    # open every pack, write nothing
//   node apps/bible/tools/migrate-packs.mjs --only help-xrefs.gbx
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PACKS = join(dir, '..', '..', '..', 'site', 'apps', 'bible', 'packs');

// Each entry: { id, magic: 'GBP2'|'GBX1'|'*', apply(header, sections) ->
// { header, sections } or null to skip }. `id` is stamped on the header so a
// pack is migrated once. Add new ids; never reuse one.
export const MIGRATIONS = [
  // none yet — identity check is --check
];

export function openPackBytes(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const magic = bytes.subarray(0, 4).toString('latin1');
  if (magic !== 'GBP2' && magic !== 'GBX1') throw new Error('not a pack (' + magic + ')');
  const raw = inflateRawSync(bytes.subarray(4));
  const hlen = raw.readUInt32LE(0);
  const header = JSON.parse(raw.subarray(4, 4 + hlen).toString('utf8'));
  let at = 4 + hlen;
  const sections = [];
  if (magic === 'GBP2') {
    for (const name of ['body', 'layout', 'heads', 'notes', 'xrefs']) {
      const n = header.sec[name] || 0;
      sections.push({ name, bytes: raw.subarray(at, at + n) });
      at += n;
    }
  } else if (Array.isArray(header.sec)) {
    for (const [name, n] of header.sec) {
      sections.push({ name, bytes: raw.subarray(at, at + n) });
      at += n;
    }
  } else {
    for (const name of header.order) {
      const n = header.sec[name] || 0;
      sections.push({ name, bytes: raw.subarray(at, at + n) });
      at += n;
    }
  }
  return { magic, header, sections };
}

export function writePackBytes(magic, header, sections) {
  const bufs = sections.map((s) => s.bytes);
  const next = Object.assign({}, header);
  if (magic === 'GBP2') {
    next.sec = {};
    for (const s of sections) next.sec[s.name] = s.bytes.length;
  } else if (Array.isArray(header.sec)) {
    next.sec = sections.map((s) => [s.name, s.bytes.length]);
  } else {
    next.order = sections.map((s) => s.name);
    next.sec = {};
    for (const s of sections) next.sec[s.name] = s.bytes.length;
  }
  const hb = Buffer.from(JSON.stringify(next), 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32LE(hb.length, 0);
  const blob = deflateRawSync(Buffer.concat([len, hb, ...bufs]), { level: 9 });
  return Buffer.concat([Buffer.from(magic, 'latin1'), blob]);
}

function appliedSet(header) {
  const list = header && header.migrations;
  return new Set(Array.isArray(list) ? list : []);
}

export function migrateOne(buf) {
  const open = openPackBytes(buf);
  const done = appliedSet(open.header);
  let header = open.header;
  let sections = open.sections;
  const ran = [];
  for (const m of MIGRATIONS) {
    if (m.magic !== '*' && m.magic !== open.magic) continue;
    if (done.has(m.id)) continue;
    const out = m.apply(header, sections);
    if (!out) continue;
    header = out.header;
    sections = out.sections;
    ran.push(m.id);
  }
  if (!ran.length) return { changed: false, magic: open.magic, header };
  const migrations = [...done, ...ran];
  header = Object.assign({}, header, { migrations });
  return { changed: true, magic: open.magic, header, bytes: writePackBytes(open.magic, header, sections), ran };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const onlyIx = process.argv.indexOf('--only');
  const only = onlyIx > -1 ? process.argv[onlyIx + 1] : null;
  if (!existsSync(PACKS)) {
    console.error('no packs at ' + PACKS);
    process.exit(1);
  }
  const names = readdirSync(PACKS).filter((f) => /\.(gbp|gbx)$/.test(f))
    .filter((f) => !only || f === only);
  let opened = 0, wrote = 0;
  for (const name of names) {
    const path = join(PACKS, name);
    const buf = readFileSync(path);
    const r = migrateOne(buf);
    opened++;
    if (check) {
      console.log('  ' + name + (r.changed ? ' would migrate ' + r.ran.join(',') : ' ok'));
      continue;
    }
    if (r.changed) {
      writeFileSync(path, r.bytes);
      wrote++;
      console.log('  ' + name + ' migrated ' + r.ran.join(',') + '  sha256=' +
        createHash('sha256').update(r.bytes).digest('hex'));
    }
  }
  console.log((check ? 'checked ' : 'opened ') + opened + ' pack(s)' +
    (check ? '' : ', wrote ' + wrote));
}
