// Build apps/bible/data/ebible-pd.json — the vetted PUBLIC-DOMAIN slice of the
// eBible.org catalog.
//
// The filter is not a judgement call. eBible.org publishes translations.csv
// with a per-title `Copyright` string and a `Redistributable` flag written by
// the people who hold or cleared the rights. A row enters this app's catalog
// only when that string says public domain AND the row is redistributable and
// downloadable. Everything else — every modern translation, every Bible
// society copyright, every Wycliffe/Biblica/Door43 line — is dropped here and
// never reaches the build.
//
// Run: node apps/bible/tools/catalog.mjs        (needs the network)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const CSV = 'https://ebible.org/Scriptures/translations.csv';

// A minimal RFC4180 reader — the catalog quotes fields containing commas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, ''));
  return rows.filter((r) => r.length === head.length)
             .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const res = await fetch(CSV);
if (!res.ok) throw new Error('eBible catalog: HTTP ' + res.status);
const rows = parseCsv(await res.text());

const isPublicDomain = (r) =>
  /^\s*public domain\s*$/i.test(r.Copyright || '') &&
  r.Redistributable === 'True' &&
  r.downloadable === 'True';

const num = (v) => parseInt(v || '0', 10) || 0;

const kept = rows.filter(isPublicDomain).map((r) => ({
  id: r.translationId,
  lang: r.languageCode,
  language: r.languageNameInEnglish || r.languageName,
  languageNative: r.languageName,
  title: r.title,
  shortTitle: r.shortTitle || r.title,
  dir: r.textDirection === 'rtl' ? 'rtl' : 'ltr',
  script: r.script || '',
  copyright: r.Copyright,
  otBooks: num(r.OTbooks), ntBooks: num(r.NTbooks), dcBooks: num(r.DCbooks),
  verses: num(r.OTverses) + num(r.NTverses) + num(r.DCverses),
  sourceDate: r.sourceDate || '',
  updated: r.UpdateDate || '',
}));

kept.sort((a, b) => a.language.localeCompare(b.language) || a.id.localeCompare(b.id));

// The rows we refuse, kept as a count so a reviewer can see the filter bit.
const refused = rows.length - kept.length;

mkdirSync(join(dir, '..', 'data'), { recursive: true });
writeFileSync(join(dir, '..', 'data', 'ebible-pd.json'),
  JSON.stringify({ source: CSV, fetched: new Date().toISOString().slice(0, 10),
                   scanned: rows.length, refused, translations: kept }, null, 1) + '\n');

const langs = new Set(kept.map((t) => t.language));
console.log(`scanned ${rows.length}, kept ${kept.length} public-domain texts in ${langs.size} languages, refused ${refused}`);
