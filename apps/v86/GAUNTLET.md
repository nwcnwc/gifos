A stranger who knows copy.sh/v86 uses this copy because the PC is the GIF: SeaBIOS and a 720K FreeDOS floppy are inside the file, it boots with no network, and the disk you write is the save.

## Bars

- **ONE:** https://copy.sh/v86/ — the original, a picker of many OSes (including Windows we will not ship). Floor: a working x86 boot with keyboard, screen, speaker.
- **TWO:** offline; state in the icon (`gifos.db` floppy + Sleep snapshot); no remote BIOS/disk fetch.

## Rounds

1. **License.** v86 BSD-2-Clause; SeaBIOS LGPL-3; FreeDOS floppy GPL-2. All notices packed in the GIF. No Windows/macOS images.
2. **Boot.** libv86.js + v86.wasm + seabios + vgabios + freedos722.img from buffers via `wasm_fn`. Hash-pinned. Node boot reached `A:\>` (SeaBIOS → FreeDOS kernel → FreeCom) in about two seconds. GIF 2.13 MB.
3. **Disk as save.** `get_disk_fda()` into `gifos.db('disk')`. Factory restores the original floppy. Sleep compresses RAM when it fits.
4. **ICON / COVER / LISTING.** CRT sticker boots to `A:\>` with a blinking cursor. Cover is mid-session DIR + `invaders`. Tagline leads with the GIF-is-the-PC reason.
5. **Phone keys.** System keyboard for letters; extra row for Esc/Ctrl/Alt/Fn/arrows.

## Remaining gap

One legal floppy, not copy.sh's OS zoo (no Linux ISO in this build — FreeDOS is the working boot). Live invite of a 16 MB RAM machine is not in.

## Win

The computer is the file: it boots FreeDOS on a plane, and the floppy you typed on is still in the icon when you come back.
