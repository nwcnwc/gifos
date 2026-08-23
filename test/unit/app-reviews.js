// STORE REVIEWS ARE COMMITTED DATA, AND EVERY LINK IN THE CHAIN IS GUARDED.
//
// A review is a PR: apps/<slug>/reviews/<github-user>.json, validated by CI,
// aggregated into site/apps/reviews.json (generated but COMMITTED — the
// catalog doctrine), painted by store.js. Four ways that chain can rot
// silently, four guards:
//
//  1. the committed reviews.json drifts from apps/*/reviews/ (a generated
//     artifact with no drift gate is a second copy waiting to disagree) —
//     build-app-reviews.mjs --check runs here, the browser-support pattern;
//  2. the validator softens — the schema IS the moderation floor, so the
//     refusals are asserted one by one, including the ownership rule that
//     makes "one review per user per app" structural;
//  3. the aggregation lies — means, ordering and shape are asserted on the
//     pure aggregate() with known inputs;
//  4. the wiring evaporates — store.js stops fetching reviews.json, the
//     workflow stops watching the reviews path, or the docs that tell people
//     AND their AI agents how to review (apps/README.md#reviews, site/llms.txt)
//     lose the recipe. Each is a grep here, so none can vanish in a redesign
//     the way gifosPinTarget once did.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-app-reviews.mjs');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

(async () => {
  // ---- 1. the drift gate ------------------------------------------------------
  let ok = true, why = '';
  try {
    execFileSync(process.execPath, [SCRIPT, '--check'], { stdio: 'pipe' });
  } catch (e) {
    ok = false;
    why = String((e.stdout || '') + (e.stderr || '')).trim().split('\n').slice(0, 3).join(' | ');
  }
  check('committed site/apps/reviews.json matches apps/*/reviews/ (build-app-reviews.mjs --check)', ok, why || undefined);

  const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'apps', 'reviews.json'), 'utf8'));
  check('reviews.json is {catalog, apps} and every entry is coherent',
    published.catalog === '1.0' && published.apps &&
    Object.values(published.apps).every((a) =>
      a.count === a.reviews.length && a.stars >= 1 && a.stars <= 5 &&
      a.reviews.every((r) => r.user && Number.isInteger(r.stars) && r.review && r.date)));

  // ---- 2. the validator refuses what it must ---------------------------------
  const { validateReview, aggregate, USERNAME_RE, MAX_REVIEW_CHARS } = await import(SCRIPT);
  // A slug that really exists, so only the probe under test can fail.
  const slug = fs.readdirSync(path.join(ROOT, 'apps'))
    .find((d) => fs.existsSync(path.join(ROOT, 'apps', d, 'listing.json')));
  const good = { stars: 4, review: 'Solid. My kid loves it.', date: '2026-08-23' };
  const v = (user, obj) => validateReview(slug, user, typeof obj === 'string' ? obj : JSON.stringify(obj));

  check('a valid review passes', v('octocat', good).length === 0, v('octocat', good));
  check('stars must be an integer 1–5: 0 fails', v('octocat', { ...good, stars: 0 }).length === 1);
  check('… 6 fails', v('octocat', { ...good, stars: 6 }).length === 1);
  check('… 4.5 fails (no half stars — the mean is where fractions live)', v('octocat', { ...good, stars: 4.5 }).length === 1);
  check('an empty review fails — a rating with no words is a like button', v('octocat', { ...good, review: '  ' }).length === 1);
  check('a review over ' + MAX_REVIEW_CHARS + ' chars fails', v('octocat', { ...good, review: 'x'.repeat(MAX_REVIEW_CHARS + 1) }).length === 1);
  check('control characters fail (newlines are prose and pass)',
    v('octocat', { ...good, review: 'a\u0007b' }).length === 1 && v('octocat', { ...good, review: 'a\nb' }).length === 0);
  check('an unknown field fails — the schema is exactly {stars, review, date}', v('octocat', { ...good, title: 'hi' }).length === 1);
  check('a malformed date fails', v('octocat', { ...good, date: 'yesterday' }).length === 1);
  check('an impossible date fails', v('octocat', { ...good, date: '2026-13-40' }).length === 1);
  check('non-JSON fails with a parse message', /not valid JSON/.test(v('octocat', '{oops')[0] || ''));
  check('a filename that is not a possible GitHub login fails',
    v('-nope-', good).length === 1 && v('a'.repeat(40), good).length === 1 && USERNAME_RE.test('mona-lisa'));
  check('a slug that is not an app fails',
    validateReview('no-such-app', 'octocat', JSON.stringify(good)).length === 1);

  // ---- 2b. the ownership rule, end to end through --pr -----------------------
  // The exact invocation .github/workflows/app-reviews.yml makes: name-status
  // lines on stdin, the PR author as the argument. Ownership must hold for
  // edits AND deletions — deleting someone else's review is the quiet way to
  // censor a one-star.
  const pr = (author, lines) => {
    try {
      execFileSync(process.execPath, [SCRIPT, '--pr', author], { input: lines.join('\n'), stdio: 'pipe' });
      return 0;
    } catch (e) { return e.status; }
  };
  check('--pr refuses a file named after someone else',
    pr('mallory', ['M\tapps/' + slug + '/reviews/octocat.json']) === 1);
  check('--pr refuses DELETING someone else\'s review',
    pr('mallory', ['D\tapps/' + slug + '/reviews/octocat.json']) === 1);
  check('--pr allows deleting your own (changing your mind is yours to do)',
    pr('octocat', ['D\tapps/' + slug + '/reviews/octocat.json']) === 0);
  check('--pr is case-insensitive about the login, as GitHub is',
    pr('OctoCat', ['D\tapps/' + slug + '/reviews/octocat.json']) === 0);

  // ---- 3. the aggregation math ------------------------------------------------
  const agg = aggregate({
    b: [{ user: 'u1', stars: 5, review: 'a', date: '2026-08-01' },
        { user: 'u2', stars: 4, review: 'b', date: '2026-08-02' },
        { user: 'u3', stars: 4, review: 'c', date: '2026-08-02' }],
    a: [{ user: 'u1', stars: 2, review: 'd', date: '2026-08-01' }],
    empty: [],
  });
  check('mean stars round to one decimal (5+4+4 → 4.3)', agg.apps.b.stars === 4.3 && agg.apps.b.count === 3);
  check('a single review is its own mean', agg.apps.a.stars === 2 && agg.apps.a.count === 1);
  check('an app with no reviews is ABSENT, not an empty record', !('empty' in agg.apps));
  check('newest first, ties by username', agg.apps.b.reviews.map((r) => r.user).join(',') === 'u2,u3,u1');
  check('slugs come out sorted (deterministic bytes = clean diffs)', Object.keys(agg.apps).join(',') === 'a,b');

  // ---- 4. the wiring ------------------------------------------------------------
  const storeJs = fs.readFileSync(path.join(ROOT, 'site', 'js', 'store.js'), 'utf8');
  check('store.js fetches /apps/reviews.json (the ONE published file)', /\/apps\/reviews\.json/.test(storeJs));
  check('store.js deep-links GitHub\'s new-file page under the app\'s reviews/ folder',
    /\/new\/main\/apps\/.{0,40}reviews/.test(storeJs));
  check('store.js links the how-to humans and agents follow (apps/README.md#reviews)',
    /apps\/README\.md#reviews/.test(storeJs));

  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'app-reviews.yml'), 'utf8');
  check('the workflow watches apps/*/reviews/ on BOTH pull_request and push',
    (wf.match(/apps\/\*\/reviews\/\*\*/g) || []).length >= 2 && /pull_request/.test(wf) && /push/.test(wf));
  check('…validates with the same checker asserted above (--pr, author login)',
    /build-app-reviews\.mjs --pr/.test(wf) && /pull_request\.user\.login/.test(wf));
  check('…and regenerates + commits reviews.json after merge (the publish half)',
    /build-app-reviews\.mjs\n/.test(wf) && /git push/.test(wf));

  // The docs ARE part of the feature: a review system nobody can find the
  // recipe for is a folder of JSON. Humans read apps/README.md#reviews (the
  // store links it); agents read site/llms.txt on the live site.
  const readme = fs.readFileSync(path.join(ROOT, 'apps', 'README.md'), 'utf8');
  check('apps/README.md has the Reviews section with the schema and both recipes',
    /^## Reviews$/m.test(readme) && /reviews\/<your-github-username>\.json/.test(readme) &&
    /"stars"/.test(readme) && /gh repo fork/.test(readme));
  const llms = fs.readFileSync(path.join(ROOT, 'site', 'llms.txt'), 'utf8');
  check('site/llms.txt teaches agents the whole flow (path, schema, PR recipe, consent)',
    /reviews\/<their-github-username>\.json/.test(llms) && /"stars"/.test(llms) &&
    /gh pr create/.test(llms) && /never file one they didn't ask for/.test(llms));

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
