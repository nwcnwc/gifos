# Yopass

Lock a secret and hand it to someone. Nothing is uploaded to a paste site. The ciphertext lives in this file on this device. While people are connected to the same room, they can open it.

This is an unofficial port. There is no Yopass server — no Redis, no account, no website that holds the bytes.

## Lock a secret

1. Type the secret (a password, a note, a token). Up to 8000 characters. Whitespace-only is refused.
2. Optional: a **passphrase**. If you set one, the other person has to type it too. If you do not, anyone in the room can open it.
3. **Lives**: 1 hour, 1 day, 1 week, or until you burn it. Default is 1 hour.
4. Optional: **Burn after reading**. The first successful open deletes the secret from the room. Opening it yourself will also burn it — you will be told before you do.
5. Press **Lock**. The box clears. The secret is encrypted in this tab.

A locked secret sits in the room until it is burned, it expires, or you burn it yourself. The file keeps the ciphertext (never the plaintext, never the passphrase).

## Open a secret

If someone brought you into the room, the locked secret is already here. Press **Open**. If they set a passphrase, type it — a wrong one is refused, honestly. If they set burn-after-reading, opening it is the last time anyone will see it.

**Copy** puts it on this device's clipboard. **Hide** puts it away. Never put a secret in a screenshot.

If you arrive before they lock one, you wait. If it was already burned or the timer ran out, you see that — not a lock form, and not a blank screen.

## What this is not

- Not a password manager. One secret at a time in the room.
- Not their file-upload / OpenPGP / OpenID product. Text only, in this tab.
- The room is the key. A passphrase is extra. Two people who open a burn-after-read secret at the same moment may both see it.

Unofficial port of [Yopass](https://github.com/jhaals/yopass) by Johan Haals. Apache-2.0. Bugs go to GifOS, not their tracker.
