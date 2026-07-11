# Working on GifOS

## Workflow — commit directly to main

We work directly on `main`. No feature branches, no PRs, no merge commits —
commit on `main` and push. `main` auto-deploys to gifos.app via GitHub Pages
(`.github/workflows/pages.yml`) on every push, usually live within a minute.
Before starting work, `git pull origin main` — other sessions commit to main
too, and your clone is a snapshot, not a live view.

## Running the tests

Two local servers, then run suites individually:

```bash
python3 -m http.server 8099 -d site     # the static site
node test/relay-local.js                # local relay on ws://127.0.0.1:8790
node test/fake-ai.js                    # only for e2e-caps / AI suites (port 8791)

node test/e2e-relay.js                  # any test/e2e-*.js runs standalone
```

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
