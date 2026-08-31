# OTP Auth gauntlet

**Win:** The GIF is the authenticator — codes tick offline, stay private, and a copy of the file is the backup. Aegis needs a phone and a vault file; Google Authenticator needs a Google account to move.

Bar ONE: **Aegis** (floor) / Google Authenticator (the name people actually say).
Bar TWO: GifOS — accounts live in the file, work on a plane, never leave over an invite.

## Round 0 — first build

OTPAuth 9.4.1 UMD vendored. RFC 6238 SHA-1 8-digit vectors and RFC 4226 HOTP C=0 pass in the packer. List + add/edit + detail, 30s ring, next code, tap to copy, Aegis JSON import/export, backup QR, private `accounts`/`prefs` only. No multiplayer, no network.

GIF `site/apps/otpauth/otpauth.gif` 225 KB.

## Round 1 — face + phone reach

Inspected icon frames (0/6/8/11) and `screenshot.png` 1200×720, not just the source.

### Icon (Home Screen 64px)

A dark sticker, a cyan ring that empties (amber in the last third), six digits that flip 482 917 → 193 046. Not a wiggle — it is the 30-second tick. Reads as an authenticator at a glance.

### Store art

Four accounts mid-tick: GitHub copied, Google amber at 4s, Amazon, pinned Proton. Next codes, rings, Add. Not empty first-boot. Pixel face matches the sticker language of other listings.

### Listing copy

Tagline leads with file / plane / nothing uploaded. Description repeats private-even-on-invite, then paste / 30s / Aegis JSON / the file-is-the-backup warning, then the unofficial OTPAuth credit. Claims match the build.

### Product

- Empty state names the paste. Add sheet parses `otpauth://` live and previews the code.
- Tap copies. Last 7s amber, last 3s red. Next code sits under the current one.
- Import/export live in a header ··· on every width, on the empty state, and on the add sheet — a first-pass CSS rule that hid `.ghost` at 420px would have made backup unreachable on a phone.
- Hide-codes eye for a shoulder. Delete uses in-page ask (`confirm()` is silent in the sandbox).
- Invite is omitted from the app chrome on purpose. Help says an invite does not share secrets.

**Blind vs Aegis:** they still win live QR scan and an encrypted vault. Ours wins “the file in my pocket is the authenticator, and it runs in a browser tab on a plane.”

## Remaining gap

No photograph-a-setup-QR path (the sandbox has no live camera; paste/URI/JSON is the add). No encrypted vault PIN — anyone who holds a copy of the file holds the secrets. That is the same sentence as “the file is the save,” and Help says it.
