# Gauntlet — Background Removal

WIN: A stranger who knows remove.bg uses this because the photo never
leaves the device, there is no account or watermark, and the last cut is
still there when they open the file again.

## Bars

- **ONE:** [remove.bg](https://www.remove.bg) — the named product. Cloud
  upload, account, credits, watermark on the free tier. Floor, not ceiling.
- **TWO:** GifOS — works offline after one hash-pinned model download; the
  GIF is the save; take a still without a live camera; no network path out
  of the sandbox; GPU when the device has one.

The upstream library is a developer API, not a product. The product bar is
remove.bg. “As good as the library demo” is losing: this has to be the
version you actually use.

## Rounds

1. **ICON** — a head-and-shoulders subject whose colourful background
   dissolves into a checkerboard. Reads at 64px as a cut, not a generic
   photo. Animation earns the loop: the background goes away.
2. **STORE ART** — 1200×720 mid-use: a cut subject on checkerboard, colour
   chips, Download PNG. Not an empty first boot.
3. **LISTING COPY** — tagline sells the GifOS reason in one line (no
   upload, no account, no watermark). Description leads with that, then
   names the unofficial port and the honest first-download sizes.
4. **PRODUCT** — drop / take / sample → auto-cut; hold to compare; paint a
   new background without re-running the model; feather + shadow;
   transparent PNG and flattened JPEG; last picture restored from gifos.db;
   GPU with wasm fallback; optional pins so Install is not 300 MB.

## Remaining gap

Blind A/B against a live remove.bg cut of the same photo, on a phone-sized
screen, with the 88 MB model already on the device. Edge hair and
semi-transparent objects are where IS-Net still loses to remove.bg’s
cloud models — say so, do not pretend otherwise. The win is structural:
the photo never left.

## Platform powers used

- Offline after first `gifos.assets` fetch of the chosen pin.
- `gifos.db` so the file is the save (prefs + last picture + last mask).
- `gifos.takePhoto` (clip, never live camera).
- Invite multiplayer was not added: other people’s photos do not belong
  on a shared link.
