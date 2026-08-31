# v86

An unofficial GifOS port of **[v86](https://github.com/copy/v86)** (copy,
BSD-2-Clause): an x86 PC emulator with an x86-to-wasm JIT. copy.sh/v86 fetches
BIOS and disk images at run time. This copy does not — SeaBIOS, the VGA BIOS
and a 720K FreeDOS floppy are packed inside the GIF.

```
index.html     CRT chrome, screen_container, extra keys
style.css      phosphor / bezel
boot.js        V86 from buffers, floppy + sleep in gifos.db
touch.js       Esc/Ctrl/Alt/Fn/arrows; hidden input for the system keyboard
icon.mjs       CRT sticker + 1200×720 cover
build.mjs      packs site/apps/v86/v86.gif
vendor/        pinned libv86.js, v86.wasm, seabios, vgabios, freedos722.img
```

## Why this can run as a GifOS app

v86 already accepts `{ buffer: ArrayBuffer }` for BIOS and disks and
`wasm_fn` for the wasm (no `wasm_path` fetch). The sandbox has no base URL
and `connect-src` is closed, so that is the whole port: instantiate from
bytes we packed, persist `get_disk_fda()` in `gifos.db('disk')`.

## capabilities

| capability | why |
|---|---|
| `wasm` | v86 JIT compiles wasm at run time; `'wasm-unsafe-eval'` and `blob:` workers. |
| `db` | Floppy (720 KB) and an optional compressed Sleep snapshot. Private. |
| `fullscreen` | CRT fills the screen; orientation lock while fullscreen. |

`minBuild` is **1314** (`capabilities.fullscreen`). No
`network`, no `assets` pin — everything boots from the GIF.

Invite would mean sharing 16 MB of RAM live. Not this version.

## Disk

`vendor/freedos722.img` is the FreeDOS Ripcord 720K floppy from
`https://i.copy.sh/freedos722.img` (same bytes copy.sh/v86 boots for
`?profile=freedos`). GPL-2 kernel and utilities. No Windows, no macOS.

## Building

```bash
node apps/v86/build.mjs   # -> site/apps/v86/v86.gif
```

`build.mjs` checks the sha256 pins in `vendor/PIN.txt` before packing.

## Licence

- v86: Simplified BSD (`COPYING-v86.txt`); QEMU floppy bits MIT
  (`COPYING-v86-qemu-floppy.txt`)
- SeaBIOS / VGA BIOS: LGPL-3 (`COPYING-seabios.txt` + `COPYING-gpl-3.0.txt`)
- FreeDOS floppy: GPL-2 (`COPYING-freedos.txt`)

Those files ride **inside the GIF**.
