A stranger who knows jsnes.org uses this copy because the cart and the save live in the GIF, and Invite is player two on a second phone.

**READY-TO-SIGN**

## Bars

- **ONE:** https://jsnes.org / FCEUX — a NES that plays a ROM you fetch or open. Floor: a working 256×240 picture, two pads, SRAM. jsnes.org forgets the game when the tab dies; FCEUX is a desktop install.
- **TWO:** offline; the ROM + last-play snapshot (and SRAM when the cart has a battery) sit in the icon (`gifos.db`); one invite is controller 2, no server.

## Rounds

1. **License.** JSNES Apache-2.0. Sample carts: Concentration Room (GPL-3 + iNES-binary exception) and Lawn Mower (Shiru, public domain / CC0). No commercial Nintendo dumps. Notices packed in the GIF.
2. **Engine.** jsnes 2.1.0 UMD vendored and hash-pinned. Canvas + ScriptProcessor APU. Drop a `.nes` dump.
3. **Touch pad.** Plus-shaped d-pad with diagonals, B then A the way a NES pad is, Select/Start above them — Start is a 44px target, not under B. At 390 the picture is 1.5× (384×360), not a 1× stamp. Mute fits the bar.
4. **Save in the file.** Packed carts have flags6 = 1 (no battery bit) — honest. Last-play snapshot → `gifos.db('saves')` per cart hash, plus SRAM when a dropped dump's battery bit is set. Quick states F5/F7 in three slots; Load paints the restored frame.
5. **Two controllers.** Host is P1, first guest is P2. Each writes only their pad row. A dump the host dropped is published once on `cart`.
6. **ICON / COVER / LISTING.** Pad sticker (d-pad then A). Cover is a real Lawn Mower frame in a CRT, P1/P2 labelled. Tagline leads with the file-is-the-cart reason; copy does not claim a battery chip the samples do not have.

## Remaining gap

Pad exchange is ~24 Hz, not lockstep-60, so a twitch dump two people drop in (Contra, etc.) can drift. Homebrew two-player (Concentration Room) does not mind.

## Win

The cart is the file: drop a dump, where you were stays in the icon, and the friend who opens your invite is player two.
