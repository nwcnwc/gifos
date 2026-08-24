// app-credits.mjs — the credit an App GIF carries INSIDE its sealed bytes.
//
// The Help screen credits authors, porters, inspirations and licenses from
// `credits.json` in the GIF's own filesystem, so the credit is under the
// gifos.app signature (gifos-sign.js contentHash covers every packed file
// that is not .state/ .lock/ .assets/) and travels with every copy — a
// stolen copy, a guest's copy on the wire, a Save. Nothing unsigned on a
// desktop record is ever shown as a claim about who made an app.
//
// sign-apps.mjs packs it (repack keeps every pixel) before signing;
// build-app-catalog.mjs --check fails when the packed copy drifts from
// apps/<slug>/listing.json. Both derive it HERE so they cannot disagree.
export const CREDITS_PATH = 'credits.json';

function person(p) {
  if (!p || typeof p !== 'object' || !p.name) return undefined;
  const out = { name: String(p.name) };
  if (p.url) out.url = String(p.url);
  if (p.by && typeof p.by === 'object' && p.by.name) out.by = person(p.by);
  if (typeof p.blessed === 'boolean') out.blessed = p.blessed;
  return out;
}

// Stable key order → byte-identical JSON → a --check that compares bytes.
export function creditsOf(listing) {
  const l = listing || {};
  const out = {};
  if (l.tagline) out.tagline = String(l.tagline);
  const a = person(l.author); if (a) out.author = a;
  const p = person(l.porter); if (p) out.porter = p;
  const b = person(l.basedOn); if (b) out.basedOn = b;
  const i = person(l.inspiredBy); if (i) out.inspiredBy = i;
  if (l.license) out.license = String(l.license);
  if (l.homepage) out.homepage = String(l.homepage);
  if (l.releaseDate) out.releaseDate = String(l.releaseDate);
  return out;
}

export function creditsJson(listing) {
  return JSON.stringify(creditsOf(listing), null, 2) + '\n';
}
