# Working on GifOS

## Workflow — ALWAYS COMMIT, so there is history

**Commit early and often — after every milestone, ALWAYS, with no exception.**
A test goes green, a bug is fixed, a design decision lands, a file is created —
commit it and push it. Never let work accumulate uncommitted: the clone is a
snapshot, not durable, and a single end-of-session lump commit destroys the
step-by-step history (the dead-ends, fixes, and reverts) that we treat as
valuable. If unsure whether something is commit-worthy, commit anyway — small
commits are cheap; lost work and lost history are not. **Always `git push`** so
it lives on the remote, not just locally.

We work directly on `main`. No PRs, no merge commits — commit on `main` and
push. `main` auto-deploys to gifos.app via GitHub Pages
(`.github/workflows/pages.yml`) on every push, usually live within a minute.
Before starting work, `git pull origin main` — other sessions commit to main
too, and your clone is a snapshot, not a live view. (A dedicated feature branch
is fine ONLY for a not-yet-deployable flag-day like the mesh-v2 rewrite — and
the always-commit-and-push rule still applies there, to the branch.)

## Release clones — NEVER the development tree

A release gate, a fleet actor, or `archive-version.sh` must run from a
**separate clone**: `~/release-process/gifos`, checked out at the freeze tag
(e.g. `v0.9.10-freeze`). The development clone (`~/projects2/gifos` on this
box) is for ongoing development on `main`. The two collide: fleet `dir` used to point at the development tree, so
a gate `cd`'d in, pushed `test/swarm/.bb-meet.js`, and `git pull`'d while
someone was mid-edit. That is how a cut and a Camera session fought over one
folder.

- Tag the freeze (`git tag -a v<x.y.z>-freeze && git push origin v<x.y.z>-freeze`)
  **before** the gate. Further commits on `main` are not this release.
- Clone once per box: `git clone <repo> ~/release-process/gifos && git -C ~/release-process/gifos checkout v<x.y.z>-freeze`.
  Symlink `node_modules` from a development clone if needed; do not `git pull`
  that tree onto `main`.
- The local hosts file (`~/.gifos-behavior-hosts.json`) `dir` for every fleet
  host is `~/release-process/gifos`, never the development clone.
- Cut from the freeze clone. `v<x.y.z>` itself is tagged on the archive
  commit, after `scripts/archive-version.sh`.
- **Bugfixes during a cut land TWICE.** `main` keeps moving while the gate
  runs. A product fix goes on `release/<x.y.z>` (from the freeze tag, in
  `~/release-process/gifos`) AND on `main` (cherry-pick or replay). One
  without the other either ships the bug or drops the fix from development.
  An unpublished snapshot may be deleted and `archive-version.sh` re-run
  after the fix; a snapshot that has been pushed is frozen — that is a new
  release.

## The release gate — GREEN OR WE DO NOT CUT

**Every test is green, or there is no release. No exceptions, no "known red",
no "that one predates this work", no "it's only the harness".**

This rule exists because it was broken. Release 0.8.4 shipped with red and dead
suites, and every one of the bugs that killed the 2026-07-26 demo lived exactly
where a suite was red, dead, or unrunnable:

- `e2e-meet-app-guest-perms.js` — the guard for the EXACT app-in-a-meeting case
  that failed — was written pointing at a chromium path that does not exist. It
  had never executed once. All 10 drills, the swarm and the behavior battery
  shared that dead path.
- `e2e.js`'s version-pinning assertions call `window.gifosPinTarget`, which had
  been deleted from the site during a loader redesign. They failed as a
  TypeError, in precisely the area that broke in production. (Since restored on
  every loader page; `test/unit/channel-loader.js` guards it.)
- Nobody could tell which of those reds were "expected", so all of them were
  ignored equally.

A red suite is not information you carry around; it is a release blocker. If a
test is wrong, FIX THE TEST and say so in the commit. Never soften an assertion
to make it green, and never cut with a red you plan to explain afterwards.

Three mechanical rules that follow from this:

- **A suite that cannot LAUNCH is red, not absent.** Exit non-zero with no
  assertions is the most dangerous state there is — it looks like silence. Check
  that a suite actually ran (`PASS` lines > 0), not merely that you invoked it.
- **A test that guards nothing is worse than no test.** Every regression guard
  must be reachable from a battery in `test/batteries/`. If it is in no battery,
  no gate runs it and it will rot — that is how the two app drills stayed dead.
- **A suite that could not MEASURE must refuse to judge, not guess.** There are
  now two ways to say so, both exiting with no assertions and both BLOCKING a
  cut without ever being a product red: `NEEDS-FLEET` (exit 3,
  `test/lib/fleet.js` — the verdict needs real per-client hardware) and
  `NO-VERDICT` (exit 4 — a browser the suite was driving DIED; see test/README
  "A DEAD BROWSER IS NOT A VERDICT"). Neither is retried. A red you cannot
  attribute is worse than a refusal you can.

The ONE sanctioned red is `test/batteries/known-unfixed.sh`: the graveyard of
behaviours we deliberately decided not to fix. It is expected RED end to end, is
not a gate, and is not run by CI. It may only ever SHRINK. Moving a failing test
into it is a deliberate, argued decision recorded in the commit — never a way to
get a release out.

## Running the tests

Suites live in `test/<environment>/` — see `test/README.md` for the full index
of what each directory needs. Two local servers, then run suites individually:

```bash
python3 -m http.server 8099 -d site       # the static site
node test/servers/relay-local.js          # local relay on ws://127.0.0.1:8790
node test/servers/fake-ai.js              # only for AI suites (port 8791)
node test/servers/fake-keyapi.js          # only for e2e-api (port 8792)
node test/servers/fake-cors-proxy.js      # only for e2e-api (port 8793)

node test/browser/e2e-knock-first.js      # any suite runs standalone
```

`test/unit/` and `test/tools/` need nothing; `test/drills/` spawn their own
servers (safe from a worktree); `test/swarm/` is scale/production-hitting.

Note: e2e-fetch-bridge spawns its OWN server on 8791 — kill fake-ai first.

Playwright + Chromium are resolved by SEARCH in `test/lib/pw.js` (newest
installed build first — the hardcoded paths are gone, and the unpacked dir is
`chrome-linux/` or `chrome-linux64/` depending on the build). If suites start
timing out on page-opens for no reason, kill leftover Chromium processes first —
and kill BOTH binaries, because the suites are split between them: a suite run
under `MEET_CHROME` launches `…/chrome`, while one taking Playwright's default
channel launches `…/headless_shell`.
Measured mid-gate 2026-08-02: 12 of the first and 2 of the second alive at once.
Hunting only one leaves the other piling up invisibly while the box sits at
loadavg 18 and suites "flake".

    pkill -f "[c]hrome-linux"    # matches chrome-linux/ AND chrome-linux64/, chrome AND headless_shell

Bracket the pattern or pgrep matches its own command line. Check `nproc` and
`/proc/loadavg` BEFORE believing any red: this box is 4 cores and a browser
suite spawns 6-10 of these.

## One box cannot tell a bug from a busy kernel

Every browser suite runs the host, the guests AND the relay on ONE machine —
not a shape that exists in real life. When a timing number looks bad there, you
cannot tell a product bug from that kernel scheduling three Chromiums, and
guessing has burned whole sessions. **Rebuild the topology across DEVICES, one
or two clients per box** — the fleet's boxes plus a phone over adb — and the
answer is unambiguous. Which machine is which lives in the LOCAL, never-committed
hosts file (`~/.gifos-behavior-hosts.json`), not here: this repo is public and
machine names, addresses and chat ids do not belong in it.

The harnesses already exist — `test/swarm/meet.js` for meetings/topology, and
`test/tools/approom-host.js` + `test/tools/approom-join.js` for app-room join
latency (the latter prints a per-leg `TRACE snap@… ask@… app-frame@… mounted@…`
so you read WHICH leg was slow, not just the total). Full recipe, and every trap
paid for so far — insecure-origin flag, worktrees with no node_modules, silent
stale clones, hosts that degrade after ~20 guests, interleaving A/Bs — is in
**test/README.md → "ONE BOX CANNOT ANSWER…"**. Read it before building anything
new; then build freely if the bug needs machinery that isn't there.

## Conventions that bite

- `site/versions/<x.y.z>/` are FROZEN archived builds — never edit them.
  Releases are cut with `scripts/archive-version.sh <version>` **from
  `~/release-process/gifos` at the freeze tag**, which snapshots
  the current `site/` (js, css, themes, html) into `site/versions/<version>/`,
  stamps that snapshot's `GIFOS_VERSION`, bakes its build number, and rewrites
  `version.json`. The site ROOT stays `GIFOS_VERSION='edge'` (the unreleased edge
  build) — do NOT bump it; a fresh visitor follows `version.json.current` to the
  release snapshot. After cutting, commit + push; Pages deploys and stamps the
  live edge build number. (The archive script's build number is anchored — bump
  `ANCHOR_SHA`/`ANCHOR_BUILD` in it when you re-anchor at a future release.)
- The link/crypto derivation scheme ("derive, don't send", `site/js/gifos-net.js`)
  is versioned by its `DS` tag. Changing any derivation is a deliberate flag
  day — old and new clients land in different relay sessions.
- Sample apps (`site/js/sample-apps.js`) are baked into GIFs at desktop seed
  time — but SEEDED defaults now refresh on existing desktops too: on any
  explicit build switch AND on the first boot after a silent deploy (build
  stamp `gifos_reseed_build`, `desktop.js` `reseedDefaultsIfNeeded` /
  `rebuildDefaultApps` — code+icon swap in place, saved data kept). Stolen /
  renamed / user-built copies are never touched, and data-format compat across
  builds is still unguarded (the remedy is erase).
- `saveItem()` in `desktop.js` is the ONLY place an item may be written. It
  decides which cell an icon lands on, so an arrival never stacks on an
  occupant: pass `{ into: parentId }` to move (it sets `parent` itself — by the
  time a writer sees `it`, it IS the object in `items`, so a move is undetectable
  after the fact), `{ at: {x,y} }` to aim, `{ keepCell: true }` to write
  verbatim. `store.putItem` for an item is called in exactly two places —
  `saveItem`, and `restoreDesktop` (a backup is restored verbatim, and
  `clearAll()` has just made `items` untrustworthy). `e2e-icon-placement.js`
  counts both call sites, so adding a third is a deliberate act.
- Desktop icons are LOCKED to touch by default — a finger can never move one
  until the user enters **Arrange mode** (`setArrangeMode` in `desktop.js`;
  entered from the GifOS ▾ menu, an icon's long-press menu, or the desktop
  menu). Locked means `.icon { touch-action: pan-x pan-y pinch-zoom }` AND no
  `preventDefault`/`setPointerCapture` on the pointerdown, so the page scrolls
  from an icon; `touch-action: none` alone is what made scrolling a phone post
  apps into random folders. MOUSE drag is deliberately untouched. Any page that
  loads `desktop.js` must ship the `#arrange-bar` markup (`e2e-icon-lock.js`
  enforces this by scanning `site/*.html`) — the mode hides the menubar, so a
  page without the bar strands you with no Done button. Note headless Chromium
  cannot synthesize a touch scroll (`gestureSourceType: 'touch'` moves nothing
  while `'mouse'` scrolls the same container) — guard the mechanisms
  (touch-action, `defaultPrevented`), never the scroll itself.
- The App Store catalog under `site/apps/` is GENERATED but COMMITTED (Pages
  serves static files; there is no build step on deploy). Sources are
  `apps/<slug>/manifest.json` + `apps/<slug>/listing.json`; regenerate with
  `node scripts/build-app-catalog.mjs`, and `--check` fails if the committed
  catalog has drifted. Listed GIFs are signed as gifos.app by
  `node scripts/sign-apps.mjs` (`GIFOS_SIGN_KEY`; the private key never goes
  in GitHub Secrets). `--check --require-signed` is the gate once the catalog
  is signed. A built App GIF lives at `site/apps/<slug>/<slug>.gif`
  and NOWHERE else — `site/` is the whole publish boundary, so a GIF outside it
  is not downloadable, and a second copy is 8 MB twice in every clone plus two
  versions that drift. Tests must resolve it through `test/lib/apps.js`.
  **THE COVER RULE:** the store never references an App GIF as an image —
  a grid of them would pull the entire catalog to paint one screen. Every
  picture is `cover.jpg`; the GIF crosses the wire once, on Install.
  `e2e-app-store.js` guards this by COUNTING NETWORK REQUESTS, not by reading
  the source (a CSS background or a preload hint would sail past a source
  scan). And the store never places an icon: it writes the file, then hands
  off to `index.html#place=<fileId>` so `saveItem` picks the cell. Anything
  that must survive a version redirect goes in the HASH — the channel loader
  carries `pathname + hash` and DROPS the query.
- Browser support is DATA: `site/browser-support.json` is the single source of
  truth for every browser × feature (meet / cast / desktop) cutoff, and nothing
  else may hard-code a version number. `site/browser-support.html` fetches it
  and cannot drift; `run.html`'s preflight CANNOT fetch (it is ES5, runs before
  everything, and the browser it is talking to may have no `Promise`), so its
  copy table is GENERATED but COMMITTED — same doctrine as the App Store
  catalog. Regenerate with `node scripts/build-browser-support.mjs`; `--check`
  fails on drift and `test/unit/browser-support.js` runs it in the gate. Edit
  the JSON, never the block between the GENERATED markers in run.html. The
  preflight's VERDICT is feature detection only and must stay that way — the
  table chooses words, never outcomes. Honesty is enforced mechanically:
  `supported` must carry a version, `unknown`/`unsupported` must not (an
  unknown with a number is a guess). Ed25519 is still mandatory at
  every join (`mesh-wire.js` S4), but a built-in fallback signer
  (`gifos-ed.js` + `vendor/nacl-fast.js`) covers browsers without WebCrypto
  Ed25519, so it no longer sets a version floor — the floor is the ES6
  baseline; `site/browser-support.json` is the source of truth.
- An icon's picture is an **ORNAMENT**, and it is NOT the file. An app GIF
  carries a whole filesystem (hundreds of MB); the Home Screen shows only the
  animation. `GifOS.gif.stripForDisplay()` cuts the GifOS Application Extension
  out whole, `store.putFile` stores the result in the `<db>::art` SIBLING
  database (never a new store in the main one — `DB_VERSION` must not move),
  and `desktop.js` paints from that. **Those bytes do not decode, carry no
  manifest, no saved state and no signature, and their hash is not the app's
  hash.** Anything that runs, installs, exports, shares, signs, verifies or
  backs up an app reads the real bytes through `getFile()`. `e2e-icon-ornament.js`
  guards both halves.
  The paint's critical path may NEVER read a file: icons go up from ornaments
  alone, and everything learned by reading an app (shield, identity pill,
  Provider ✕, NEW tag, MIRROR band) is a decoration applied by `decorate()`
  afterwards and cached back into the ornament as `facts`. Adding a byte read
  to `render()` costs seconds — it was 4749 ms to first icon before this split,
  352 ms after, and the suite asserts a repaint reads ZERO files.
- Row-delete buttons are standardized: `button.row-del` + the shared inline
  trash SVG (defined per-surface, identical glyph). ✕ is reserved for
  close/dismiss, never delete.
- Meeting scale vocabulary is the STADIUM metaphor (docs/healing-laws.md +
  docs/media-plane.md): seat (coord `{pc, r, i}` — pc the section path, r the
  row, i the column), row (every section has an ordinary row 0 — just its
  first row, NOT a stage), Stage (a SPECIAL decoupled chosen set capped at C —
  the broadcast-to-the-whole-room tier whose membership is CHOSEN by a
  deliberate act (self step-up in open rooms, admin-granted in admin rooms),
  never filled by seating; it is NOT "row 0" of anything), section (an
  internal C×C block of the tree — NOT its own relay session), stadium (the
  whole room = ONE relay session = one URL; the relay is a zero-knowledge
  greeter registry for the entire stadium — healing-laws R2/R3 — and sections
  are pure peer-to-peer tree structure). The control plane is site/js/mesh.js
  (a faithful port of the C++ reference sim — test/sim/mesh.cpp is source of
  truth), bound to transports by site/js/mesh-wire.js; security doctrines
  (crypto lock, signed authority, sponsor forwarding) live in
  docs/meet-security.md. The old deacon/deck/fold model is DEAD (git history
  has docs/rows.md + docs/mesh-refactor.md if archaeology is ever needed).
