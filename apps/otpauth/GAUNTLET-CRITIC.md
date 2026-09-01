# OTP Auth — fresh-eyes critic

Comp: **Aegis Authenticator** (floor) / **Google Authenticator** (the name people say).
Inspected: shipped GIF `site/apps/otpauth/otpauth.gif`, listing at `/store.html#app=otpauth`, Home Screen icon, desktop + 390×844 phone in the real sandbox. One Chromium. No guest join (one browser).

## Winner: OURS

A stranger who knows Aegis or Google Authenticator can say why they would use this one, unprompted.

## Stranger-reason

It is a file in a browser tab. The codes live in that file, on this device, with no Google account and no phone app. Close it and they are still ticking. An invite does not hand anyone a secret. Aegis is an Android vault; Google Authenticator is a phone (and, if you turn sync on, a Google account). This one opens on a laptop, on a plane, and the GIF is the backup.

## Single biggest remaining gap

**You cannot use the setup QR the website is showing you.**

Every 2FA enrollment page puts a QR on screen. Aegis and Google Authenticator win that first ten seconds: point the camera, done. This app’s add path is paste an `otpauth://` link or a base32 secret. That path works — live preview, period countdown, save refuses a nameless secret, Google Authenticator `otpauth-migration://` is refused with a plain sentence. It is still the “Can’t scan?” fallback on every site, not the thing a stranger does.

Camera is a sandbox wall. A photo-of-the-QR file picker is not, and it is missing.

## Wall breaks

**Collections are private. No secret-sharing wall is broken.**

- `manifest.data.accounts.visibility` = `private`
- `manifest.data.prefs.visibility` = `private`
- No other collections. Undeclared default in the runtime is private.
- `capabilities.multiplayer` is absent. App chrome has no Invite.
- GIF archive contains no `fetch` / CDN / webfont. MIT notices are packed inside: `COPYING-otpauth.txt`, `COPYING-noble-hashes.txt`, `COPYING-qrcodejs.txt`, `COPYING-qrcode-generator.txt`. Listing license is MIT.

Not empirically guest-joined (one Chromium). Enforcement is the host filter in `site/js/runtime.js`: private collections never leave the owner tab. That is the law this app opted into.

**Ship wall, not a privacy wall:** `site/apps/index.json` does not list `otpauth`. Store search for “otpauth” renders **Nothing matches that.** Direct listing (`/store.html#app=otpauth` / `app.json`) works. A stranger browsing the grid never finds it.

**Not a wall break, still a loaded gun:** OS chrome still draws **Invite** on the solo app bar. Clicking it must not share `accounts` (private). Help and the listing say that. The button is still sitting on an authenticator.

---

### Icon

12 frames, 128×128: dark sticker, cyan ring that empties, amber then flip `482 917` → `193 046`. Animation earns the loop — it is the 30-second tick, not a wiggle. At Home Screen 64px the ring still reads “authenticator”; the six digits smear. Aegis’s shield-and-check and Google Authenticator’s G read at a glance; this one reads as a countdown only if you already know.

### Cover

1200×720 pixel illustration: four accounts mid-tick, Copied, Google amber at 4s, next codes, rings, Add. Not empty first-boot. At grid-card size (~240×144) the rows and rings still parse. It does **not** look like the running app (system-ui, letter avatars). Beside Aegis’s store phones — real service logos, dense list — Aegis still looks like the authenticator. Beside KeeWeb’s real screenshot in this catalog, this cover is a drawing. Mid-use content: yes. Honest crop: yes (no shell toolbar).

### Listing

Rendered tagline: *Authenticator codes that live in this file. Works on a plane. Nothing is uploaded.* Description leads with the reason (file / no account / no cloud / invite does not share a secret), then paste / 30s / tap-to-copy / Aegis JSON / the file-is-the-backup warning, then the unofficial OTPAuth credit. Claims match the build, except **“Import an Aegis JSON backup”** omits *unencrypted* — Help is honest; the listing is the overclaim. License line on the page is MIT with the packed copyrights. Signed by gifos.app. Unofficial-port pill names OTPAuth (the library), not Aegis — correct, and confusing to a store visitor who came here for an authenticator.

### 30s TOTP tick

Observed. Remaining seconds counted down (4→2; phone shot at 1s with the code and ring **red**). Next code sat under the current one. After the period flipped, reload showed the previous “next” as current (`982 051`, 27s). Amber at ≤7s, red at ≤3s. Period is 30 by default.

### Add-via-secret

Observed. Paste `JBSWY3DPEHPK3PXP` fills the secret field, previews a live grouped code + seconds (`362 751 · 6s` desktop; `696 792 · 3s` phone). Save without a name: *Need a site name or an account.* With issuer+label: card appears, status `1 account · private to this file`. `otpauth://` paste fills issuer, label, secret, period. Placeholder on the empty paste field clips the leading “o” (`tpauth://…`) once focused.

### Privacy of db

Accounts persist in the icon across reload (phone: GitHub still there, still ticking). Status line says private. Export JSON is Aegis-shaped and **every secret in the clear**, with a warning. Hide-codes eye turns numbers into `••• •••`. Backup QR is behind a tap and labelled as the secret.

This is not Aegis’s vault. There is no PIN, no AES-256-GCM, no biometrics. Anyone who holds a **copy of the file** holds the codes — the listing says so. GifOS passkey-lock exists as OS chrome and this app does not lean on it. That is the Aegis sentence this version still loses: *steal the file, still can’t read it.*

### Phone

390×844: empty state, add sheet, list, persist all usable. Add / ··· / eye / Import-a-backup stay visible (no `display:none` at 420px). No horizontal overflow. Cards fit. Last-second red is readable. OS Invite/Save/Help eat the top; the app still fits under them. Toast covers the status line (`1 account · priva`).

### MIT

True of the build: listing `license: MIT`, author Héctor Molinero Fernández, notices sealed in the GIF, credits packed. Not GPL like Aegis; the library this wraps is MIT and the listing says so.

---

Aegis still wins encrypted vault, camera QR, icon packs, groups, and “looks like a finished authenticator.” Google Authenticator still wins the name and the scan. This version wins the sentence a stranger can repeat: **the file is the authenticator, it runs in a tab, and an invite does not share a secret.** The loop is not done while the setup QR on the other screen cannot come in.
