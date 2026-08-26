# BIP39

A calculator for **recovery words**. Type an existing phrase, or generate a new one, and this tab shows the wallet addresses those words belong to.

This is **not a wallet**. It does not send coins. It does not talk to the internet. Anyone who sees the words can take the coins — treat them like cash on the table.

## They stay on this device

Recovery words **stay on this device**. Nothing is uploaded. **Close the app and they are gone** — they are not saved in the file. Do not press **Invite** with words on the screen; a guest gets a blank copy of the tool, but anyone looking at your display can still steal.

**Hide all private info** greys out the secrets if someone is standing behind you.

## Make or type words

- **GENERATE** makes a random phrase. The length menu goes from 3 to 24 words; **15 is the default**. Fewer than 12 is weak.
- Or type a phrase you already have into **BIP39 Mnemonic**. Twelve random English words usually **fail** — the last word is a checksum, not a free choice.
- Optional **BIP39 Passphrase** (the 25th word). Leave it blank unless you used one when you made the wallet.
- **Mnemonic Language** picks English, Japanese, Spanish, Chinese (simplified / traditional), French, Italian, Korean, Czech, or Portuguese. The lists ride inside the app.

**Show entropy details** is for people who already know what entropy is. Skip it unless you do.

## Addresses

Pick a **Coin**, then a derivation tab:

- **BIP44** — the usual account path (`m/44'/…`)
- **BIP49** — nested SegWit
- **BIP84** — native SegWit
- **BIP32** / **BIP141** — custom paths

**Derived Addresses** lists address, public key, and private key. Click a field to show a **QR** (click again to hide). A scanner may keep history — do not point a phone camera at a private key unless you trust that phone.

**Auto compute** (on by default) refreshes the list as you type. Turn it off on a slow phone, then change a field to compute.

**Show BIP85** and **Show split mnemonic cards** are advanced. Leave them off unless you know you need them.

## What stays private

Everything. The file does not store your phrase. There is nothing for **Save** to keep and nothing for **Invite** to share except a blank tool.
