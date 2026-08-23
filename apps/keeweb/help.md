# KeeWeb

A KeePass vault on this device. Open a `.kdbx`, or start a new one. Copy a password — this app never fills another site, and nothing is uploaded.

This is **not** a cloud vault. There is no Dropbox, Google Drive, OneDrive, or WebDAV. There is no browser extension and no autofill. Secrets stay in this app, encrypted, on this device.

## Unlock, create, or open

- If a vault is already in this app, **Unlock** with the master password (and an optional key file).
- **New vault** — name, master password (8+ characters), confirm. Optional key file. Creating a new vault **replaces** the one stored here; export first if you still need the old file.
- **Open a .kdbx** — drop a KeePass file onto the card, or tap to choose. Enter its master password. That file stays in this tab; it is not uploaded.

Wrong password is refused, same as KeePass itself. The master password is **never stored**.

## The vault

Three panes: **groups** on the left, **entries** in the middle, the open entry on the right.

- **New group** / **New entry**
- **Search** — title, username, URL, notes
- Title, username, password, URL, notes
- **Generate** — a random password; drag the slider for length, then copy it
- **TOTP secret** — paste a one-time-code secret; the code ticks in the entry. Copy it. This app still does not fill another site.
- Custom fields — **Add field**
- **Save entry** writes it into the vault. **Delete** moves it to the Recycle Bin.

Copy username, password, URL, or the login code with the **Copy** buttons.

## Lock and idle

**Lock** in the bar seals the vault. Five minutes idle locks it too. Unlock again with the master password. Closing the app locks it.

## Export

**Export .kdbx** writes a KeePass file you can open in KeePassXC or KeePass. That is the backup. There is no other copy.

## Invite

**Invite** in the bar above the app is OS chrome. This vault is **private**. Invite does not sync passwords, does not share an unlocked vault, and is not a cloud backup. Do not use it as one. If you hand someone this app file, they get the **encrypted** vault and still need the master password — treat that like handing them a `.kdbx`.

## What is saved

The encrypted vault auto-saves inside this app after you edit. That is the only store. Lose the master password and the vault is gone. Export a `.kdbx` if you need a file you can keep elsewhere.
