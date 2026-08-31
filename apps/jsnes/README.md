# jsnes

A JavaScript NES emulator as an ordinary sandboxed GifOS app. Solo it is
Ben Firshman's [JSNES](https://github.com/bfirsh/jsnes) (Apache-2.0) plus
two homebrew carts. Send the invite and the friend is **player 2**.

The engine is vendored at **2.1.0** (`vendor/jsnes.min.js`). Upstream has
no persistence and no netplay; jsnes.org fetches ROMs from the network.
This copy keeps the ROM and the battery SRAM in `gifos.db`, so the file
is the save, and the invite is the second controller.

```
index.html      screen, library, NES pad markup
style.css       CRT chrome + thumb pad
vendor/jsnes.min.js   JSNES 2.1.0 UMD. Never fetch it at runtime.
roms.js         generated: Concentration Room + Lawn Mower as bytes
emu.js          canvas, APU, keyboard, SRAM, quick states
touch.js        plus-shaped d-pad, A/B, Start/Select
net.js          player-2 over a meeting — each peer writes only their pad
boot.js         library, drop a dump, wiring
icon.mjs        NES pad sticker + a real in-game cover
build.mjs       packs site/apps/jsnes/jsnes.gif
```

Sample ROMs are homebrew only. Concentration Room is GPL-3 with Damian
Yerrick's iNES-binary exception. Lawn Mower is Shiru, public domain.
A user may drop their own dump; nothing Nintendo ships in this tree.

## capabilities

| capability | why |
|---|---|
| `db` | Battery SRAM and quick states in a `private` collection; the live pad in a `read-write` one; the host's cart in a `read-only` one the guest reads once. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Two controllers

The host is player 1. The first guest is player 2. Each writes only their
own row in `pads` (a button mask). Both run the same cart. A custom dump
the host dropped is published once on `cart` so the guest can load it.

## Building

```bash
node apps/jsnes/build.mjs   # -> site/apps/jsnes/jsnes.gif
```

## Licence

Apache-2.0, Ben Firshman / JSNES. Notices for the engine and for each
sample ROM ride **inside the GIF**.
