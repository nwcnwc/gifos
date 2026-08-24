// app-credits.mjs — the credit an App GIF carries INSIDE its sealed bytes.
//
// The Help screen credits authors, porters, inspirations and licenses from
// `credits.json` in the GIF's own filesystem, so the credit is under the
// gifos.app signature (gifos-sign.js contentHash covers every packed file
// that is not .state/ .lock/ .assets/) and travels with every copy — a
// stolen copy, a guest's copy on the wire, a Save. Nothing unsigned on a
// desktop record is ever shown as a claim about who made an app.
//
// The MIT/Apache copyright line is read from the packed COPYING / NOTICE
// files in apps/<slug>/ (the same files the GIF carries). listing.copyright
// can override. SPDX `license` stays a name; `copyright` is the notice.
//
// sign-apps.mjs packs it (repack keeps every pixel) before signing;
// build-app-catalog.mjs --check fails when the packed copy drifts.
// Both derive it HERE so they cannot disagree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CREDITS_PATH = 'credits.json';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = path.join(ROOT, 'apps');

function person(p) {
  if (!p || typeof p !== 'object' || !p.name) return undefined;
  const out = { name: String(p.name) };
  if (p.url) out.url = String(p.url);
  if (p.by && typeof p.by === 'object' && p.by.name) out.by = person(p.by);
  if (typeof p.blessed === 'boolean') out.blessed = p.blessed;
  return out;
}

// Files whose names ARE the license/notice, not webpack *.LICENSE.txt dumps.
function isLicenseFilename(name) {
  return /^(COPYING|LICENSE|NOTICE)([._-].*)?$/i.test(name);
}

function walkLicenseFiles(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of ents) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkLicenseFiles(p, out);
    else if (ent.isFile() && isLicenseFilename(ent.name)) out.push(p);
  }
}

// Apache/GPL license BODIES mention "copyright owner" / FSF. Those are not
// the project's holder. NOTICE files and MIT headers are.
export function copyrightLinesFromText(text, filename) {
  const name = path.basename(filename || '');
  const head = String(text || '').slice(0, 800);
  const isNotice = /^NOTICE/i.test(name);
  const isApacheBody = /^\s*Apache License/i.test(head) && !isNotice;
  const isGplBody = /GNU GENERAL PUBLIC LICENSE/i.test(head);
  if (isApacheBody) return [];
  const lines = String(text || '').split(/\r?\n/);
  const found = [];
  const limit = isNotice ? 80 : 40;
  for (const raw of lines.slice(0, limit)) {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (!/^Copyright\s+(\([cC]\)|©|\d{4})/i.test(t)) continue;
    if (isGplBody && /Free Software Foundation/i.test(t)) continue;
    if (/\[yyyy\]|\[name of copyright owner\]/i.test(t)) continue;
    found.push(t);
  }
  return found;
}

export function copyrightFromApp(slug) {
  if (!slug || /[^a-z0-9-]/i.test(slug)) return '';
  const dir = path.join(APPS, slug);
  const files = [];
  walkLicenseFiles(dir, files);
  const seen = new Set();
  const out = [];
  for (const f of files.sort()) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const line of copyrightLinesFromText(text, f)) {
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(line);
    }
  }
  return out.join('; ');
}

// Stable key order → byte-identical JSON → a --check that compares bytes.
export function creditsOf(listing, slug) {
  const l = listing || {};
  const out = {};
  if (l.tagline) out.tagline = String(l.tagline);
  const a = person(l.author); if (a) out.author = a;
  const p = person(l.porter); if (p) out.porter = p;
  const b = person(l.basedOn); if (b) out.basedOn = b;
  const i = person(l.inspiredBy); if (i) out.inspiredBy = i;
  if (l.license) out.license = String(l.license);
  const copyright = (l.copyright && String(l.copyright).trim()) || (slug ? copyrightFromApp(slug) : '');
  if (copyright) out.copyright = copyright;
  if (l.homepage) out.homepage = String(l.homepage);
  if (l.releaseDate) out.releaseDate = String(l.releaseDate);
  return out;
}

export function creditsJson(listing, slug) {
  return JSON.stringify(creditsOf(listing, slug), null, 2) + '\n';
}
