# hat.sh

Encrypt and decrypt files in this tab. Nothing leaves this device — there is no upload, no account, and no network path.

A file this app encrypts opens in hat.sh, and a file hat.sh encrypted opens here (**v2** only).

## Encrypt

1. Open the **Encrypt** tab.
2. Drop a file, or tap the drop zone to choose. You can queue several.
3. Lock with a **password** (type it twice) or a **key pair**.
4. Press **Encrypt**. Download each `.enc` when it is ready.

The password must be **12 or more characters**. **Generate** fills a strong one — copy it somewhere you will not lose it **before** you close the tab. **Show** reveals what you typed.

## Decrypt

1. Open the **Decrypt** tab.
2. Drop a `.enc` file (or tap to choose).
3. Type the same password, or the matching key pair.
4. Press **Decrypt**. Download the original.

Old hat.sh **v1** files (the “Encrypted Using Hat.sh” header) are refused. Re-encrypt them in current hat.sh first. A file locked with a password will not open with keys, and the other way around.

## Keys

A key pair is two strings. You keep the **private** key. You can give anyone the **public** key.

- **Generate a key pair**, then **Save** each one (`key.public`, `key.private`).
- To encrypt to someone: paste **your private key** and **their public key**.
- To decrypt what they sent: **your private key** and **their public key**.

Do not paste the same key twice. Closing the app **forgets** keys you did not save.

If you still have a private key, paste it under **Show public** to recover the matching public key.

## Size

The whole file has to fit in this tab at once. A few hundred megabytes is fine; a multi-gigabyte file may not.

## Invite

This is a tool, not a room. Files never ride an invite. Keep the `.enc` and the password (or the keys) yourself.

Unofficial port of [hat.sh](https://github.com/sh-dv/hat.sh) by sh-dv.
