A stranger who knows TIC-80 or PICO-8 uses this copy because the carts live in the GIF, and Invite puts a friend on the same desk with no account.

## Bars

- **ONE:** TIC-80 1.1.2837 / PICO-8 — a fantasy computer you install, or tic80.com in a tab that forgets the disk. Floor: the real 240×136 picture, the console, Lua carts, the editors. PICO-8 is the name people know; it is paid, and its carts are not ours to ship.
- **TWO:** offline; every cart you save sits in the icon (`gifos.db`); one invite is the same desk on a second phone, no server.

## Rounds

1. **License.** TIC-80 MIT (Vadim Grigoruk). Sample carts: official `luademo.lua` and `fire.lua` from the same tag. No commercial PICO-8 carts. Notice packed in the GIF.
2. **Engine.** Official 1.1.2837 HTML wasm + glue, hash-pinned. `wasmBinary` from `gifos.assets('tic80.wasm')`. IDBFS replaced so the disk survives without IndexedDB.
3. **Carts boot.** `--skip --fs=/work --cmd "load hello & run"` — HELLO WORLD is on screen, not the empty console. Fire is `load fire`. Drop a `.tic` / `.lua` / `.gif` cart.
4. **Touch pad.** Plus-shaped d-pad, B then A, Esc/Run in the gutter. Phone playable without a keyboard.
5. **Disk in the file.** Every save under `/work` snapshots to `gifos.db('disk')`. Close it, the carts are still there.
6. **Desk over Invite.** Host and guests share `desk` (filename + bytes). A cart you save or drop shows up for them. Each writes only their own pad row.
7. **ICON / COVER / LISTING.** The default little-computer sprite walks. Cover is HELLO WORLD on the 240×136 screen in a bezel. Tagline leads with the file-is-the-cart reason.

## Remaining gap

Pad exchange is ~24 Hz, not lockstep-60, and TIC-80 leaves player-2 keys unmapped by default — a twitch two-player cart can drift. The desk (the carts themselves) is the invite that holds.

## Win

The cart is the file: make one, close it, hand the GIF over, and the friend who opens your invite is sitting at the same tiny computer.
