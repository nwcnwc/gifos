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

## Running the tests

Suites live in `test/<environment>/` — see `test/README.md` for the full index
of what each directory needs. Two local servers, then run suites individually:

```bash
python3 -m http.server 8099 -d site       # the static site
node test/servers/relay-local.js          # local relay on ws://127.0.0.1:8790
node test/servers/fake-ai.js              # only for AI suites (port 8791)
node test/servers/fake-keyapi.js          # only for e2e-api (port 8792)
node test/servers/fake-cors-proxy.js      # only for e2e-api (port 8793)

node test/browser/e2e-relay.js            # any suite runs standalone
```

`test/unit/` and `test/tools/` need nothing; `test/drills/` spawn their own
servers (safe from a worktree); `test/swarm/` is scale/production-hitting.

Note: e2e-fetch-bridge spawns its OWN server on 8791 — kill fake-ai first.

Playwright + Chromium paths are hardcoded in the tests (already installed).
If suites start timing out on page-opens for no reason, kill leftover
Chromium processes first: `pkill -f "chrome-linux/chrome"`.

Known failure that predates current work: `e2e-fluence` (Deepgram pipeline).

## Conventions that bite

- `site/versions/<x.y.z>/` are FROZEN archived builds — never edit them.
  Releases are cut with `scripts/archive-version.sh <version>`, which snapshots
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
  time — edits only reach NEWLY seeded desktops, never existing users' files.
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
