#!/usr/bin/env node
/*
 * build-app-reviews.mjs — compose site/apps/reviews.json (the PUBLISHED store
 * reviews) from apps/<slug>/reviews/ (the review SOURCE files).
 *
 * A review is a PULL REQUEST: one small JSON file per GitHub user per app,
 * named after the reviewer —
 *
 *   apps/<slug>/reviews/<github-username>.json
 *   { "stars": 5, "review": "what you think of it", "date": "2026-08-23" }
 *
 * The filename IS the identity: .github/workflows/app-reviews.yml refuses a PR
 * whose author does not match the filenames it touches, so one review per user
 * per app is structural and editing your review is just changing your own
 * file. There is no server anywhere in this — GitHub is the account system,
 * the spam filter (a PR costs effort and carries history) and the moderation
 * queue (review-by-merge; a bad call is a revert).
 *
 * Output (GENERATED but COMMITTED — the same doctrine as the catalog itself;
 * Pages serves static files, there is no build step on deploy):
 *
 *   site/apps/reviews.json     every app's stars + comments, in ONE fetch
 *
 * ONE file for the whole store, not one per app, so the grid can paint stars
 * on every card with a single request — the same reason index.json exists.
 * It is deliberately NOT merged into index.json/app.json: reviews change on a
 * different cadence than listings (any merged PR, no rebuild of any GIF), and
 * keeping them out of build-app-catalog.mjs means regenerating after a review
 * merge needs node and NOTHING else — no sharp, no node_modules — which is
 * what lets app-reviews.yml regenerate and commit it mechanically on merge.
 *
 * Run: node scripts/build-app-reviews.mjs [--check] [--pr <author>]
 *   --check        verify the committed file matches the sources; write nothing.
 *                  (test/unit/app-reviews.js runs this in the gate.)
 *   --pr <author>  validate a pull request instead of building: reads
 *                  `git diff --name-status` lines on stdin and fails unless
 *                  every touched review file is valid AND named after <author>.
 *                  (This is what .github/workflows/app-reviews.yml runs.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'apps');
const OUT = path.join(ROOT, 'site', 'apps', 'reviews.json');

// GitHub's own username rule: 1–39 chars, alphanumeric or single hyphens,
// no leading/trailing hyphen. The filename must BE a possible GitHub login,
// because the workflow compares it to the PR author's login.
export const USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
export const MAX_REVIEW_CHARS = 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/*
 * Validate one review file. Returns a list of problems, empty when valid.
 * Deliberately strict about SHAPE (exactly the three fields, nothing else) so
 * the published file never grows fields nobody decided on — and deliberately
 * silent about OPINION: stars and words are the reviewer's, and merge is the
 * only editorial act.
 */
export function validateReview(slug, username, raw) {
  const problems = [];
  const where = 'apps/' + slug + '/reviews/' + username + '.json';
  if (!USERNAME_RE.test(username)) {
    problems.push(where + ': the filename must be your GitHub username (letters, digits, single hyphens; then .json)');
  }
  if (!fs.existsSync(path.join(SRC, slug))) {
    problems.push(where + ': there is no app at apps/' + slug + ' — check the slug (it is the store URL: gifos.app/store/<slug>)');
  }
  let r;
  try { r = JSON.parse(raw); } catch (e) {
    problems.push(where + ': not valid JSON — ' + e.message);
    return problems;
  }
  if (!r || typeof r !== 'object' || Array.isArray(r)) {
    problems.push(where + ': must be a JSON object { "stars": …, "review": …, "date": … }');
    return problems;
  }
  const keys = Object.keys(r).sort();
  const extra = keys.filter((k) => !['stars', 'review', 'date'].includes(k));
  if (extra.length) problems.push(where + ': unknown field(s) ' + extra.join(', ') + ' — a review is exactly {stars, review, date}');
  if (!Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5) {
    problems.push(where + ': "stars" must be a whole number from 1 to 5 (got ' + JSON.stringify(r.stars) + ')');
  }
  if (typeof r.review !== 'string' || !r.review.trim()) {
    problems.push(where + ': "review" must be a non-empty string — say something, a sentence is plenty');
  } else {
    if (r.review.length > MAX_REVIEW_CHARS) {
      problems.push(where + ': "review" is ' + r.review.length + ' chars — keep it under ' + MAX_REVIEW_CHARS + ' (it has to fit a listing page)');
    }
    // Newlines are prose; other control characters are not.
    if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(r.review)) {
      problems.push(where + ': "review" contains control characters — plain text and newlines only');
    }
  }
  if (typeof r.date !== 'string' || !ISO_DATE_RE.test(r.date)) {
    problems.push(where + ': "date" must be YYYY-MM-DD (the day you wrote it)');
  } else {
    const [y, mo, d] = r.date.split('-').map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2026) {
      problems.push(where + ': "date" is not a real date');
    }
  }
  return problems;
}

/*
 * Aggregate validated reviews into the published shape. Pure, so the math can
 * be unit-tested: mean stars to one decimal, newest first (ties by username),
 * slugs sorted. Only apps with at least one review appear — absence is the
 * ordinary state, not an empty record.
 */
export function aggregate(bySlug) {
  const apps = {};
  for (const slug of Object.keys(bySlug).sort()) {
    const list = bySlug[slug].slice().sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.user < b.user ? -1 : 1));
    if (!list.length) continue;
    const sum = list.reduce((s, r) => s + r.stars, 0);
    apps[slug] = {
      stars: Math.round((sum / list.length) * 10) / 10,
      count: list.length,
      reviews: list,
    };
  }
  return { catalog: '1.0', apps };
}

// ---- everything below runs only as a script --------------------------------
function collect(fail) {
  const bySlug = {};
  const slugs = fs.existsSync(SRC)
    ? fs.readdirSync(SRC).filter((d) => fs.statSync(path.join(SRC, d)).isDirectory()).sort()
    : [];
  for (const slug of slugs) {
    const dir = path.join(SRC, slug, 'reviews');
    if (!fs.existsSync(dir)) continue;
    const seen = {};   // lowercase → filename, so Octocat.json + octocat.json can't both land
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.json')) { fail('apps/' + slug + '/reviews/' + f + ': only <github-username>.json files belong here'); continue; }
      const username = f.slice(0, -5);
      const lower = username.toLowerCase();
      if (seen[lower]) { fail('apps/' + slug + '/reviews/' + f + ': duplicates ' + seen[lower] + ' (GitHub usernames are case-insensitive — one review per user)'); continue; }
      seen[lower] = f;
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const problems = validateReview(slug, username, raw);
      if (problems.length) { problems.forEach(fail); continue; }
      const r = JSON.parse(raw);
      // Published only for apps that are actually IN the store: an unpublished
      // app (listing.unpublished.json, the sound-it-out pattern) keeps its
      // reviews in the source tree for the day it lists.
      if (!fs.existsSync(path.join(SRC, slug, 'listing.json'))) continue;
      (bySlug[slug] = bySlug[slug] || []).push({ user: username, stars: r.stars, review: r.review, date: r.date });
    }
  }
  return bySlug;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let errors = 0;
  const fail = (msg) => { console.error('  ✗ ' + msg); errors++; };
  const prAt = process.argv.indexOf('--pr');

  if (prAt !== -1) {
    // PR MODE: stdin is `git diff --name-status base...head` output. Every
    // touched review file must be valid and must be the AUTHOR'S OWN file —
    // adding, editing or deleting someone else's review is refused outright.
    // Case-insensitive, because GitHub logins are.
    const author = String(process.argv[prAt + 1] || '').trim();
    if (!author) { console.error('--pr needs the PR author\'s GitHub login'); process.exit(2); }
    const lines = fs.readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    let touched = 0;
    for (const line of lines) {
      // name-status: "M\tpath", "A\tpath", "D\tpath", "R100\told\tnew" …
      const parts = line.split('\t');
      const status = parts[0][0];
      for (const p of parts.slice(1)) {
        const m = /^apps\/([^/]+)\/reviews\/([^/]+)$/.exec(p);
        if (!m) continue;
        touched++;
        const [, slug, file] = m;
        const username = file.endsWith('.json') ? file.slice(0, -5) : file;
        if (username.toLowerCase() !== author.toLowerCase()) {
          fail(p + ': this PR is by @' + author + ', but the file is @' + username + '\'s review — you may only add, edit or delete YOUR OWN review file (' + author + '.json)');
          continue;
        }
        if (status === 'D') continue;   // deleting your own review is always fine
        if (!file.endsWith('.json')) { fail(p + ': a review file is <github-username>.json'); continue; }
        validateReview(slug, username, fs.readFileSync(path.join(ROOT, p), 'utf8')).forEach(fail);
      }
    }
    if (!touched) console.log('No review files in this diff.');
    else if (!errors) console.log(touched + ' review file(s) valid, all owned by @' + author + '.');
    if (errors) { console.error('\n' + errors + ' problem(s) — see docs: apps/README.md → Reviews.'); process.exit(1); }
    process.exit(0);
  }

  const CHECK = process.argv.includes('--check');
  const doc = aggregate(collect(fail));
  const body = JSON.stringify(doc, null, 2) + '\n';
  const rel = path.relative(ROOT, OUT);
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === body;
  if (CHECK) {
    if (!same) fail(rel + ' is stale — run: node scripts/build-app-reviews.mjs');
  } else if (!same) {
    fs.writeFileSync(OUT, body);
    console.log('  → ' + rel);
  }
  if (errors) { console.error('\n' + errors + ' problem(s). Reviews NOT ' + (CHECK ? 'valid' : 'written cleanly') + '.'); process.exit(1); }
  const n = Object.keys(doc.apps).length;
  console.log((CHECK ? 'Reviews are current' : 'Reviews built') + ' — ' + n + ' app(s) reviewed.');
}
