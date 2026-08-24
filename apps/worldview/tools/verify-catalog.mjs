/*
 * verify-catalog.mjs — ask GIBS whether the catalogue is telling the truth.
 *
 * The catalogue says, per layer, which tile matrix set to use, which format,
 * how often the data changes and when the record starts. Those four facts
 * build a URL, and GIBS answers a WRONG url with 404 — the same answer it
 * gives for a day with no imagery. So a mistake here does not crash anything:
 * it ships as a layer that is quietly, permanently empty.
 *
 * Nothing in the repo's own gate can catch that (the gate is hermetic on
 * purpose — see test/lib/gibs-fixtures.js). This is the one command that can,
 * and it needs a machine that can reach gibs.earthdata.nasa.gov:
 *
 *     node apps/worldview/tools/verify-catalog.mjs
 *     node apps/worldview/tools/verify-catalog.mjs --layer MODIS_Terra_Aerosol
 *
 * It asks for ONE tile per layer, over a piece of the world that layer should
 * have something for, on a day inside its own record — 74 requests, spaced, in
 * the same order a person browsing the catalogue would make them. Run it after
 * changing layers.curated.json, and before believing a layer works.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'assets', 'catalog.json'), 'utf8'));
const only = process.argv.indexOf('--layer') > 0 ? process.argv[process.argv.indexOf('--layer') + 1] : null;

const ENDPOINT = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
const RES0 = 0.5625, TILE = 512;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (ms) => {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
};

// Somewhere with land, sea and a good chance of clear sky at a middling
// latitude — the Mediterranean, at a level every matrix set has.
const PROBE = { lon: 20, lat: 33, level: 3 };

function tileFor(level, lon, lat) {
  const span = RES0 * TILE / Math.pow(2, level);
  return { row: Math.floor((90 - lat) / span), col: Math.floor((lon + 180) / span) };
}

// A day inside the layer's record that the layer actually publishes: three
// days ago for daily imagery (NRT has landed by then), the first of last month
// for a monthly composite, and so on.
function probeDay(l) {
  const now = Date.now();
  let ms = now - 3 * 86400000;
  if (l.recent) ms = now - Math.min(2, l.recent) * 86400000;
  let day = iso(ms);
  if (l.end && Date.parse(l.end) < Date.parse(day)) day = l.end;
  if (l.start && Date.parse(day) < Date.parse(l.start)) day = l.start;
  if (l.period === 'monthly') day = day.slice(0, 8) + '01';
  if (l.period === 'yearly') day = day.slice(0, 4) + '-01-01';
  if (l.period === '8day' || l.period === '16day') {
    const step = l.period === '8day' ? 8 : 16;
    const jan1 = Date.parse(day.slice(0, 4) + '-01-01');
    const n = Math.floor((Date.parse(day) - jan1) / 86400000 / step) * step;
    day = iso(jan1 + n * 86400000);
  }
  if (l.period === '30min') return day + 'T12:00:00Z';
  if (l.period === '10min') return day + 'T12:00:00Z';
  if (l.period === 'static') return 'default';
  return day;
}

const rows = [];
let bad = 0;

for (const l of catalog.layers) {
  if (only && l.id !== only) continue;
  const level = Math.min(PROBE.level, l.z);
  const { row, col } = tileFor(level, PROBE.lon, PROBE.lat);
  const time = probeDay(l);
  const url = ENDPOINT + '/' + l.id + '/default/' + time + '/' + l.set + '/' + level + '/' + row + '/' + col + '.' + l.fmt;
  let status = 0, bytes = 0, type = '', err = '';
  try {
    const r = await fetch(url);
    status = r.status;
    type = (r.headers.get('content-type') || '').split(';')[0];
    if (r.ok) bytes = (await r.arrayBuffer()).byteLength;
  } catch (e) {
    err = String(e && e.message || e);
  }
  // A 404 on ONE tile is not proof of a broken layer (that tile may have no
  // data on that day) — but a 400 is a rejected request, and a content-type
  // that is not an image means the service answered with something else.
  const verdict = err ? 'UNREACHABLE'
    : status === 400 ? 'BAD REQUEST'
    : status === 404 ? 'no tile here'
    : !/^image\//.test(type) ? 'NOT AN IMAGE (' + type + ')'
    : 'ok';
  if (verdict !== 'ok' && verdict !== 'no tile here') bad++;
  rows.push({ id: l.id, set: l.set, fmt: l.fmt, time, status, bytes, verdict, err });
  console.log(
    (verdict === 'ok' ? '  ok   ' : verdict === 'no tile here' ? '  ·    ' : '  ✗    ') +
    l.id.padEnd(56) + ' ' + String(status).padStart(3) + '  ' +
    (bytes ? (bytes / 1024).toFixed(0) + ' KB' : '').padStart(7) + '  ' + verdict + (err ? ' ' + err : ''));
  await sleep(120);
}

const ok = rows.filter((r) => r.verdict === 'ok').length;
const empty = rows.filter((r) => r.verdict === 'no tile here').length;
console.log('\n' + ok + ' answered with imagery, ' + empty + ' had nothing at the probe point, ' + bad + ' look wrong.');
if (empty) {
  console.log('A "no tile here" is usually a swath that missed the probe point — check those by hand,');
  console.log('with --layer <id> on a different day, before deciding anything.');
}
process.exit(bad ? 1 : 0);
