# Yopass

Lock a secret and hand it to someone. The invite is the one-time room. Nothing is uploaded to a paste site.

This is an unofficial port. There is no Yopass server in the middle — no Redis, no account, no website that holds the bytes. The ciphertext lives in this file on this device. While an invite is open, the people in that room can read it.

## Lock a secret

1. Type the secret (a password, a note, a token). Up to a few thousand characters.
2. Optional: a **passphrase**. If you set one, the other person has to type it too. If you do not, anyone with the invite can open it.
3. Optional: **Burn after reading**. The first successful open deletes the secret from the room.
4. Press **Lock**. The secret is encrypted in this tab. The box clears.

Then press **Invite** in the bar above the app and send the link. That is the room. Do not draw a second share button — the OS one is the one.

A locked secret sits in the room until you burn it, unlock it yourself and burn it, or close the app without saving. **Save** in the bar keeps the locked secret in this file so you can hand the GIF instead of an invite.

## Open a secret

If someone Invited you, the locked secret is already here. Press **Open**. If they set a passphrase, type it. If they set burn-after-reading, opening it is the last time anyone will see it — including you.

You can also paste a secret you locked earlier on this device (it comes back with the file).

## What this is not

- Not a password manager. One secret at a time in the room.
- Not end-to-end in the Yopass-website sense. The host's browser holds the ciphertext; the invite is the key to the room. A passphrase is extra.
- Not their file-upload / OpenPGP / OpenID product. Text only, in this tab.
- Never put a secret in a screenshot.

## What is saved

The last locked secret (ciphertext only, never the plaintext after you lock) can live in this file. Burned secrets are gone. Passphrases are never saved.

Unofficial port of [Yopass](https://github.com/jhaals/yopass) by Johan Haals. Apache-2.0. Bugs go to GifOS, not their tracker.
