# OTP Auth

Login codes for sites that ask for a six-digit number from an authenticator. The codes live in this file, on this device. Nothing is uploaded. An invite does not share them.

## Add an account

Tap **Add**. Paste the `otpauth://` link the site showed you, or type:

- **Issuer** — the site name (GitHub, Google, …)
- **Account** — your login on that site
- **Secret** — the base32 key, spaces allowed

Most sites use a 6-digit code that changes every 30 seconds. Open **Advanced** only if the site asked for 8 digits, SHA-256, or a 60-second period. **HOTP** is the rarer counter style — tap **Next** each time you need a new number.

You can also **Import** a list of `otpauth://` links or an unencrypted Aegis JSON backup.

## Using a code

The number on each row is the current login code. Tap the row to copy it. A thin ring counts down the time left; in the last few seconds the number turns amber, then red, then it changes.

The smaller grey number is the **next** code, so you are not stuck if the one you started typing expires.

Tap **···** for the backup QR, the secret, edit, or delete. Delete asks first.

The star pins a row to the top.

## Hide codes

The eye in the header hides every number until you tap a row. Use it if someone is looking over your shoulder.

## Search

Type in the search box to filter by site or account.

## What is saved

Every account — including its secret — is saved in this file. Close the app and come back: they are still here, still ticking.

**Save** in the bar above writes a copy of the file. That copy is a backup of your authenticator. Anyone who opens it can see the same codes. Treat it like the phone you would otherwise keep these on. Do not send it in a chat.

There is no cloud and no second device unless you give that file to it.

## Import and export

**Export JSON** writes an Aegis-shaped backup you can keep elsewhere or open in Aegis. **Export links** writes one `otpauth://` line per account. Both are the secrets in the clear — same care as the file itself.

Google Authenticator “transfer” (`otpauth-migration://`) links are not read here. Ask that app for individual `otpauth://` links, or export from Aegis.
