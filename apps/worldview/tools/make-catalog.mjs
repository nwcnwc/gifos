/*
 * make-catalog.mjs — build apps/worldview/assets/catalog.json.
 *
 * The catalog is what the app knows about NASA's imagery before it has a
 * connection: which layers exist, what to call them, which WMTS tile matrix
 * set and format to ask for, how often the data changes, and what each layer
 * actually is. It rides inside the GIF, so the layer browser and every saved
 * view work on a plane.
 *
 * Two inputs:
 *
 *   tools/layers.curated.json   the hand-kept half — which layers earn a place,
 *                               their titles, start dates, and where they sit.
 *   a checkout of NASA's own Worldview configuration:
 *                               git clone --depth 1 https://github.com/nasa-gibs/worldview
 *                               (config/default/common/config/…)
 *
 * From the checkout this reads, per layer:
 *   - EXISTENCE. Every curated id must appear in wv.json/layers/**; an id that
 *     does not is a typo that would ship as a layer nobody can see, and it
 *     fails the build here instead.
 *   - group (baselayers | overlays) → whether it draws under or over, and so
 *     whether its tiles are opaque JPEG or transparent PNG.
 *   - the layer's own description (config/metadata/layers/**.md, NASA-authored,
 *     public domain), trimmed to the first paragraph for the info panel.
 *   - "imagery resolution is 250 m" out of that description → the GIBS tile
 *     matrix set, and "the temporal resolution is daily" → the period. The
 *     curated file overrides both where the upstream text does not say.
 *
 * Run:  node apps/worldview/tools/make-catalog.mjs --wv /path/to/worldview
 * Check: add --check to fail if the committed catalog is stale.
 *
 * The output is COMMITTED. Same doctrine as the store catalog: the GIF is
 * packed from the tree, so a generated file that is not in the tree does not
 * exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'assets', 'catalog.json');
const CHECK = process.argv.includes('--check');
const wvArg = process.argv.indexOf('--wv');
const WV = wvArg > 0 ? process.argv[wvArg + 1] : process.env.WORLDVIEW_SRC;

if (!WV) {
  console.error('need --wv <path to a nasa-gibs/worldview checkout> (or WORLDVIEW_SRC)');
  process.exit(2);
}

const CONF = path.join(WV, 'config', 'default', 'common', 'config');
const curated = JSON.parse(fs.readFileSync(path.join(HERE, 'layers.curated.json'), 'utf8'));

// ---- walk NASA's config -----------------------------------------------------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.json') || e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const upstream = new Map();          // layer id -> { group }
for (const f of walk(path.join(CONF, 'wv.json', 'layers'))) {
  if (!f.endsWith('.json')) continue;
  let d;
  try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
  for (const [id, v] of Object.entries(d.layers || {})) {
    upstream.set(id, { group: v.group || 'overlays' });
  }
}

const docs = new Map();              // layer id -> markdown
for (const f of walk(path.join(CONF, 'metadata', 'layers'))) {
  if (!f.endsWith('.md')) continue;
  docs.set(path.basename(f, '.md'), fs.readFileSync(f, 'utf8'));
}

// ---- what the upstream prose tells us ---------------------------------------
// GIBS names its EPSG:4326 tile matrix sets after the imagery resolution, so
// the sentence "imagery resolution is 250 m" in NASA's own layer description IS
// the matrix set. Anything coarser than 2 km is served on the 2 km set (that is
// the coarsest one GIBS defines); anything finer than 31.25 m is not in this
// catalog.
const SETS = { '15.625m': 12, '31.25m': 11, '250m': 8, '500m': 7, '1km': 6, '2km': 5 };
function setFromResolution(text) {
  const m = /imagery resolution is ([0-9.]+)\s*(m|km)\b/i.exec(text || '');
  if (!m) return null;
  const metres = parseFloat(m[1]) * (m[2].toLowerCase() === 'km' ? 1000 : 1);
  if (metres <= 40) return '31.25m';
  if (metres <= 250) return '250m';
  if (metres <= 750) return '500m';
  if (metres <= 1000) return '1km';
  return '2km';
}

function periodFromText(text) {
  const m = /temporal resolution is ([^.,;]+)/i.exec(text || '');
  if (!m) return null;
  const s = m[1].toLowerCase();
  if (/half.?hour|30 ?min/.test(s)) return '30min';
  if (/10 ?min/.test(s)) return '10min';
  if (/daily|one day|1 day/.test(s)) return 'daily';
  if (/8.?day/.test(s)) return '8day';
  if (/16.?day/.test(s)) return '16day';
  if (/month/.test(s)) return 'monthly';
  if (/annual|year/.test(s)) return 'yearly';
  return null;
}

// The first paragraph of NASA's own description, links flattened. Enough to
// answer "what am I looking at" in the info panel without becoming a document
// viewer; the full text lives at worldview.earthdata.nasa.gov.
function blurbFrom(md) {
  if (!md) return '';
  const paras = md.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  let text = paras[0] || '';
  if (text.length < 90 && paras[1]) text += ' ' + paras[1];
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // links -> their text
             .replace(/[*_`#>]/g, '')
             .replace(/\s+/g, ' ')
             .trim();
  // Trim on a SENTENCE if there is one, otherwise on a WORD, and say that it
  // was trimmed. "…thermal anomalies, such as volcanoes, and gas flares. Fire
  // is oft" is a description amputated mid-word, and it reads as a bug in the
  // panel rather than as an edit.
  if (text.length > 460) {
    const cut = text.slice(0, 460);
    const dot = cut.lastIndexOf('. ');
    if (dot > 240) {
      text = cut.slice(0, dot + 1).trim();
    } else {
      const sp = cut.lastIndexOf(' ');
      text = cut.slice(0, sp > 240 ? sp : cut.length).trim() + '…';
    }
  }
  return text;
}

// ---- compose ---------------------------------------------------------------
const problems = [];
const layers = curated.layers.map((c) => {
  const up = upstream.get(c.id);
  if (!up) problems.push(c.id + ' is not in NASA\'s Worldview configuration — check the spelling');
  const md = docs.get(c.id) || '';
  const group = c.group || (up && up.group === 'baselayers' ? 'base' : 'overlay');
  const set = c.set || setFromResolution(md);
  if (!set) problems.push(c.id + ' has no imagery resolution upstream — give it a "set" in layers.curated.json');
  const period = c.period || periodFromText(md) || 'daily';
  const rec = {
    id: c.id,
    title: c.title,
    sub: c.sub || '',
    m: c.m,
    group,
    // JPEG for the opaque imagery a map is BUILT on, PNG for everything drawn
    // over it — that is GIBS's own split, and getting it wrong is a layer of
    // 404s indistinguishable from a day with no data.
    fmt: c.fmt || (group === 'base' ? 'jpg' : 'png'),
    set,
    z: SETS[set],
    period,
  };
  if (period !== 'static') rec.start = c.start || '2000-01-01';
  if (c.end) rec.end = c.end;
  if (c.recent) rec.recent = c.recent;           // only the last N days are kept
  if (c.opacity) rec.opacity = c.opacity;
  if (c.featured) rec.featured = 1;
  if (c.ref) rec.ref = 1;                         // a reference layer: sits on top
  const blurb = blurbFrom(md);
  if (blurb) rec.about = blurb;
  return rec;
});

if (problems.length) {
  console.error('catalog problems:');
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}

const out = {
  v: 1,
  source: 'NASA Worldview / GIBS configuration (nasa-gibs/worldview), public domain',
  categories: curated.categories,
  measurements: curated.measurements,
  layers,
};

const json = JSON.stringify(out);
const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (CHECK) {
  if (old !== json) {
    console.error('✗ assets/catalog.json is stale — re-run without --check');
    process.exit(1);
  }
  console.log('✓ catalog.json is current (' + layers.length + ' layers)');
} else {
  fs.writeFileSync(OUT, json);
  const withAbout = layers.filter((l) => l.about).length;
  console.log('wrote assets/catalog.json — ' + layers.length + ' layers, ' +
              withAbout + ' with an upstream description, ' +
              (json.length / 1024).toFixed(0) + ' KB');
}
