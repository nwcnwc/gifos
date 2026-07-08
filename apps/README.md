# GifOS-certified apps

First-party apps that ship **with the GifOS project but are not seeded as
default apps** on the Home Screen. They're built and maintained here, signed as
first-party, and downloadable as finished GIFs — drop one on any GifOS desktop
to run it. A certified app can later be **promoted to a default** (seeded from
`site/js/sample-apps.js`) if it earns its place.

## Layout

```
apps/
  <name>.gif        ← the finished, downloadable App GIF (built artifact)
  <name>/           ← the project source for that app
    index.html      ← (or a small multi-file project: app.js, style.css, …)
    README.md       ← what it is, which gifos.* capabilities it uses
    build.*         ← how the .gif above is produced from this source
```

A finished `<name>.gif` at the top level is what a user downloads and runs; the
same-named subfolder holds the source it's built from. Rebuild the GIF from the
source with the app's build script (or the MCP `pack_app` tool / `+ Add`).

## What "certified" means here

- **First-party**: lives in this repo, built by us, signed with the gifos.app
  domain key so it verifies as **✓ Signed by gifos.app**.
- **Sandbox-honest**: runs as a normal sandboxed GifOS app — data in
  `gifos.db`, network only via the manifest allowlist, brokered capture/AI via
  `gifos.recordAudio` / `gifos.ai.*` (keys never touch the app).
- **Not a default**: not seeded automatically; you choose to add it.

## Apps

_(none yet — fluence is the first, in progress)_
