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

Two local servers, then run suites individually:

```bash
python3 -m http.server 8099 -d site     # the static site
node test/relay-local.js                # local relay on ws://127.0.0.1:8790
node test/fake-ai.js                    # only for e2e-caps / AI suites (port 8791)
node test/fake-keyapi.js                # only for e2e-api (port 8792)
node test/fake-cors-proxy.js            # only for e2e-api (port 8793)

node test/e2e-relay.js                  # any test/e2e-*.js runs standalone
```

Note: e2e-fetch-bridge spawns its OWN server on 8791 — kill fake-ai first.

Playwright + Chromium paths are hardcoded in the tests (already installed).
If suites start timing out on page-opens for no reason, kill leftover
Chromium processes first: `pkill -f "chrome-linux/chrome"`.

Known failure that predates current work: `e2e-fluence` (Deepgram pipeline).

## Conventions that bite

- `site/versions/<x.y.z>/` are FROZEN archived builds — never edit them.
  Releases are cut with `scripts/archive-version.sh <version>`; bump
  `window.GIFOS_VERSION` in BOTH `site/index.html` and `site/boot.html`
  (and in the fresh copies under the new archive).
- The link/crypto derivation scheme ("derive, don't send", `site/js/gifos-net.js`)
  is versioned by its `DS` tag. Changing any derivation is a deliberate flag
  day — old and new clients land in different relay sessions.
- Sample apps (`site/js/sample-apps.js`) are baked into GIFs at desktop seed
  time — edits only reach NEWLY seeded desktops, never existing users' files.
- Row-delete buttons are standardized: `button.row-del` + the shared inline
  trash SVG (defined per-surface, identical glyph). ✕ is reserved for
  close/dismiss, never delete.
- Meeting scale vocabulary is the STADIUM metaphor (docs/rows.md): seat,
  row (every section has an ordinary row 0 — just its first row, NOT a stage),
  Stage (a SPECIAL standalone single-row entity, decoupled from the seating
  tree — the broadcast-to-the-whole-room tier whose membership is CHOSEN by a
  deliberate act, not filled by arrival-order seating; it is NOT "row 0" of any
  section — row-0-of-Section-1 was rejected precisely because dense seating
  would put random early arrivers on stage), section (an internal C×C block of
  the tree — NOT its own relay
  session), deck (sections sharing a level-1 space), level, stadium (the whole
  room = ONE relay session = one URL; the relay is a single front door for the
  entire stadium, sections are pure peer-to-peer tree structure). Wire gossip
  fields stay terse
  (`st.leaf` = section number, `st.branch` = deck id, `'b:'` = deck fold) —
  see the wire glossary at meet.html's STADIUM section header.
