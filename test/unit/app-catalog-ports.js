// The store catalog's port relationship: author is THEM, GifOS is the porter.
//
// listing.json `basedOn` is the named product this listing is a port of.
// Without it the published record is first-party. With it, the builder must
// have refused GifOS as author — that is how "this is UVR, moved into GifOS"
// stops being a sentence the catalog will ship. Donate, if present, is their
// page, never a GifOS/Stripe checkout, and it lives on app.json only (the
// grid does not need it).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const listing = (slug) => JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', slug, 'listing.json'), 'utf8'));
const appjson = (slug) => JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'apps', slug, 'app.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'apps', 'index.json'), 'utf8'));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

function isGifos(p) {
  if (!p) return false;
  if (String(p.name || '').toLowerCase() === 'gifos') return true;
  try { return new URL(p.url).hostname.replace(/^www\./, '') === 'gifos.app'; } catch (e) { return false; }
}

const PORTS = {
  'vocal-remover': {
    product: 'Ultimate Vocal Remover',
    author: /Anjok07/,
    donate: 'https://www.buymeacoffee.com/uvr5',
  },
  'fps-simple': {
    product: 'Claude of Duty',
    author: /mshumer/,
    donate: null,
  },
};

for (const [slug, want] of Object.entries(PORTS)) {
  const l = listing(slug), rec = appjson(slug);
  const idx = index.apps.find((a) => a.slug === slug);
  check(slug + ': listing.json declares basedOn ' + want.product,
    l.basedOn && l.basedOn.name === want.product && l.basedOn.blessed === false);
  check(slug + ': listing.json author is them, not GifOS',
    want.author.test((l.author && l.author.name) || '') && !isGifos(l.author));
  check(slug + ': listing.json names GifOS as the porter',
    isGifos(l.porter));
  check(slug + ': published author survived the catalog build',
    rec.author && want.author.test(rec.author.name) && !isGifos(rec.author));
  check(slug + ': published porter is GifOS', isGifos(rec.porter));
  check(slug + ': published basedOn keeps the product name + https url',
    rec.basedOn && rec.basedOn.name === want.product && /^https:\/\//.test(rec.basedOn.url));
  check(slug + ': unofficial until they say otherwise', rec.basedOn.blessed === false);
  if (want.donate) {
    check(slug + ': donate is their page, not GifOS/Stripe',
      rec.basedOn.donate === want.donate && !/gifos\.app|stripe\.com/i.test(rec.basedOn.donate));
  } else {
    check(slug + ': no donate page invented', rec.basedOn.donate == null);
  }
  check(slug + ': the grid index carries basedOn.name so search/cards work',
    idx && idx.basedOn && idx.basedOn.name === want.product && idx.basedOn.blessed === false);
  check(slug + ': donate is NOT on the grid index',
    !idx.basedOn || idx.basedOn.donate === undefined);
}

for (const a of index.apps) {
  const rec = appjson(a.slug);
  check(a.slug + ': published author is an object with a name',
    rec.author && typeof rec.author === 'object' && !!rec.author.name);
  if (rec.basedOn) {
    check(a.slug + ': a port cannot list GifOS as author', !isGifos(rec.author));
    check(a.slug + ': a port names a porter', !!(rec.porter && rec.porter.name && rec.porter.url));
  } else {
    check(a.slug + ': first-party listings omit basedOn and porter',
      rec.porter == null && a.basedOn == null && a.porter == null);
  }
}

check('the two known ports are in the catalog',
  index.apps.some((a) => a.slug === 'vocal-remover') &&
  index.apps.some((a) => a.slug === 'fps-simple'));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
