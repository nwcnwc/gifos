# Release channels & versioned delivery

**Status: PROPOSED design — not yet built.** This document describes where
GifOS delivery is going, not how it works today. Where it says "today," that is
current reality; everything else is the target. When it ships, fold the "today"
notes into history and make this canonical.

---

## Why

Today **the web root *is* production**. GitHub Pages ships `site/` as-is, and
every push to `main` is live on gifos.app within a minute. That means:

- No staging. A half-finished change on `main` is instantly public.
- No clean rollback. There are **no git tags**, so undoing a bad deploy is a
  raw `git revert`/`reset` mid-incident.
- No way to test the real production URL before real users get it.

We want the ordinary web-app safety net: **deliberate promotion to production,
instant rollback, a staging/edge lane, and user-selectable pinning** — without
adding a server (GitHub Pages is static, and staying static is the point).

## What already exists (we build on this, not from scratch)

- **Immutable version snapshots.** `scripts/archive-version.sh <x.y.z>` copies
  the current `site/` into `site/versions/<x.y.z>/` — frozen, never edited.
  Today `0.6.0` and `0.7.0` exist; `0.7.0` is live.
- **A pointer file.** `site/version.json` already carries
  `{ current, versions[], minData, note }`.
- **An opt-in update flow.** `desktop.js` fetches `version.json` network-first
  and shows an "update available" bar; `sw.js` treats `version.json` /
  `changelog.json` as network-first.
- **The load-bearing data invariant, already stated** in `version.json`'s note:
  *migrations are additive-only and the App-GIF `window.gifos` API is a stable,
  add-only contract, so any archived build can safely read the current desktop.*
  This is what makes code rollback safe (see [Data compatibility](#data-compatibility)).

The one thing that changes: **the web root stops being production.** It becomes
the loader + the edge lane. Production becomes whatever the pointer names.

## The model: three channels + a pointer

- **Stable** (default) — follows `version.json.current`. What everyone gets.
- **Pinned** — a specific `/versions/<x.y.z>/` the user chose to stay on.
- **Edge** — the staged next build (`version.json.staging`), for testing the
  real production URL before promotion. Opt-in only.

**Production is a pointer, not a place.** Promote by moving `current`; roll back
by moving it back. Both are instant and require no redeploy — just a one-line
edit to `version.json` (which Pages serves, and Cloudflare can purge in
seconds).

## The web root becomes a thin loader

All app code runs from `/versions/<x.y.z>/`. The root holds only the things that
can't themselves be versioned:

```
/                     ← the loader (index.html): reads version.json, resolves the
                        channel, loads the chosen version's app. Tiny + stable.
/version.json         ← the pointer (see schema below)
/sw.js                ← one version-aware service worker (see below)
/404.html             ← the pretty-link router, now version-aware
/CNAME /manifest.webmanifest /.well-known/… /gifos.key /og.png   ← shared immutables
/versions/<x.y.z>/…   ← every build, immutable, cache-forever
```

The loader is **the one unversioned, rarely-changed file** — it is the
redirector, so changing it is the riskiest act in the system. Keep it minimal:
read `version.json`, pick the channel, hand off. Nothing else.

## `version.json` schema (extended)

```json
{
  "current":  "0.8.0",
  "staging":  "0.9.0",
  "versions": ["0.9.0", "0.8.0", "0.7.0", "0.6.0"],
  "minData":  "0.6.0",
  "protocol":    { "meet": 3, "app": 2 },
  "minProtocol": { "meet": 3, "app": 1 },
  "note": "Migrations additive-only; window.gifos add-only. Any build >= minData reads the current DB."
}
```

- `current` — the Stable/production pointer.
- `staging` — the Edge pointer (optional; omit when nothing is staged).
- `minData` — oldest build guaranteed to read the current IndexedDB. The loader
  refuses to pin below it.
- `protocol` / `minProtocol` — the meeting/app wire + `DS`-derivation tags of the
  current build, and the oldest still interoperable (see
  [Meetings](#meetings-detect-and-prompt-never-silently-fail)).

## Channels & URLs

- **Stable:** `gifos.app/` → loader → `/versions/<current>/`.
- **Pinned:** `gifos.app/?v=0.7.0` → loader pins to `/versions/0.7.0/` and
  records the choice (`localStorage['gifos_channel'] = 'pin:0.7.0'`). Clearing
  it returns to Stable.
- **Edge:** `gifos.app/?channel=edge` → loader → `/versions/<staging>/`.
- **Deep links** (`/meet/<room>`, `/join/<code>`, `/run/…`) resolve the version
  through the loader / `404.html` first, then load
  `/versions/<resolved>/<page>` with the original hash intact.

*(Open decision: query form `?v=` vs a path form `/v/<x.y.z>/…`. Query is
simpler for the loader; a path is prettier and lets Pages serve the pinned
build directly without the loader hop. Pick one before building.)*

## Service worker

One **stable, version-aware** SW at root:

- Versioned assets live under `/versions/<x.y.z>/` and are **immutable**, so they
  cache **forever** by URL — no cache-busting query strings, no staleness.
- `version.json` is fetched **network-first** (Cloudflare serves it no-cache /
  short-TTL; the immutable version dirs cache forever). A pointer flip therefore
  reaches clients on their next `version.json` read.
- **Shipping a new app version requires no SW change at all** — the new version
  is just new immutable paths the SW will cache on first use. The SW only has to
  change when the *loader or SW itself* changes, which should be rare. This kills
  the classic "the service worker won't let me update" bug: app updates ride the
  pointer, not the SW lifecycle.

## Data compatibility (the invariant everything rests on)

IndexedDB (`gifos` DB: files, per-app state, desktop layout) is **per-origin**,
so **every version shares one database**. Pinning the *code* does **not** pin the
*data*. Rollback of code is only safe because of a hard rule (already GifOS
doctrine, now enforced):

> **Migrations are additive-only. The `window.gifos` app API is add-only.**
> A newer build may add fields/collections; it must never remove or rewrite what
> an older build reads. Therefore any build `>= minData` can read a DB last
> touched by any newer build.

Consequences:
- Rolling `current` back is always safe — the older code finds a superset of
  what it expects.
- The loader **refuses to pin below `minData`** (or warns hard), because that's
  the one case where an old build might not understand the DB.
- A change that *can't* be additive is a **data flag day**: it bumps `minData`
  and forfeits clean rollback across that line. Those must be rare and loud.

## Meetings: detect and prompt, never silently fail

Meetings are P2P over the relay, with the session id derived from the room +
the `DS` protocol tag. A protocol change is a flag day: two builds with
different `protocol.meet` derive **different relay sessions** and would never see
each other. We do **not** force everyone onto one version. Instead:

1. `version.json` publishes `protocol.meet` (the current build's tag) and
   `minProtocol.meet` (the oldest build still interoperable with current
   meetings).
2. **On meeting join**, the client compares *its own* build's `protocol.meet`
   against `minProtocol.meet` from a fresh `version.json`.
3. If the client is **too old** (`its.meet < minProtocol.meet`), it must not
   silently land in an empty session. It shows a blocking, friendly prompt —
   *"This meeting needs a newer version of GifOS. Update to join."* — with an
   **Update** button that switches the user to Stable/current and reloads
   straight back into the meeting link.
4. If compatible, it joins normally.

This is the key refinement: **pinned/old users keep using their files and apps
solo, but the moment they try to join a meeting they'd be incompatible with,
they're told plainly to update first** — no baffling "I'm alone in the room."

*(Corollary for the relay: during a protocol transition the relay may need to
accept both the old and new protocol for a window, so in-flight meetings aren't
severed the instant `current` flips. Scope that with the relay deploy.)*

## Release & rollback workflow

**Cut a release**
1. `scripts/archive-version.sh <next>` — immutable snapshot into `/versions/<next>/`.
2. Set `version.json.staging = <next>` (Edge only; Stable users untouched).
3. Exercise it on the **Edge** URL — full suite, the swarm, a real phone.
4. When green, **promote**: set `version.json.current = <next>` (and clear
   `staging`). Production moves. Purge `version.json` at Cloudflare so it
   propagates in seconds.
5. **Tag it in git**: `git tag v<next> && git push --tags` — the rollback tags
   we don't have today.

**Roll back** — set `version.json.current = <prev>`. Done. Instant, no redeploy,
no git history surgery. (Because data is additive-only, the old code is happy.)

## How this de-risks the mesh rip-and-replace

This scheme *is* the seatbelt for the mesh-v2 swap:

- Stage mesh-v2 as `/versions/0.8.0/`, set `staging = 0.8.0`.
- Beat on it via the **Edge** URL — swarm bots + your phone — while every real
  user stays on `0.7.0` (Stable), untouched.
- The relay protocol bump is handled by the [meeting compat check](#meetings-detect-and-prompt-never-silently-fail):
  old clients that try to join a mesh meeting are told to update.
- Promote by flipping `current` to `0.8.0`. If anything smells wrong, flip it
  back to `0.7.0` — instant rollback, no scramble.

So build this **before** the mesh swap, not after.

## Open decisions (resolve before building)

- **Pin/edge URL form:** `?v=` (loader-resolved) vs `/v/<x.y.z>/…` (Pages-direct).
- **Loader vs. router:** how much the thin loader does vs. the existing
  `404.html` pretty-link router; they overlap and should merge cleanly.
- **SW migration:** moving from today's root-app caching to versioned caching
  without stranding users on a stale root SW during the cutover.
- **Version pruning:** `/versions/` grows with every release; decide a retention
  window and keep `minData` honest as old builds are pruned.
- **Relay dual-protocol window:** how long the relay accepts the previous
  `protocol.meet` after a promotion.

## Migration from today (incremental, each step shippable)

1. **Move the app off root.** Snapshot current `site/` into `/versions/0.7.0/`
   (already done), then replace root `index.html` with the loader; keep
   `version.json`, `sw.js`, `404.html`, and the shared immutables at root.
2. **Add `staging` + `protocol`/`minProtocol`** to `version.json` and the
   release script.
3. **Make the SW version-aware** (cache `/versions/**` immutable, `version.json`
   network-first).
4. **Add the meeting protocol check** + the "update to join" prompt.
5. **Start tagging every release** in git.

Each step is independently deployable; none requires the mesh rewrite to land
first. Step 1 alone already buys deliberate promotion and instant rollback.
