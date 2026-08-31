# v86

A whole IBM-compatible PC in this file. It boots **FreeDOS** from a 720K floppy that travels with the app. There is no network, and nothing is fetched when it starts.

## What disk is this?

The A: drive is a **FreeDOS Ripcord boot floppy** (720 KB). It is the same image copy.sh/v86 uses for its FreeDOS demo: kernel, COMMAND.COM, and a small toolkit.

On first boot you land at `A:\>` after a short BIOS screen. AUTOEXEC puts `A:\FDOS` and `A:\GAMES` on the PATH, so you can type a game name from anywhere.

## What is on the floppy

- **Games** (`cd games`): `invaders`, `snake`, `tetris`, `rogue`, `jumper`, `minesweeper`
- **Tools**: `vim`, `nasm`, `debug`, `edit` (in `\FDOS`), `cal`, `clock`
- **Demos** (`cd demos`): tiny graphics COM files
- **hello.asm** / **hello.com** — assemble with `nasm -o hello.com hello.asm`

Type `dir` to see the rest. Type `type readme` for the disk’s own notes.

This is **not** a hard disk, Windows, or Linux. It is one 720K DOS floppy. There is no installer and no extra images.

## Keyboard

On a computer, type as you would on a PC. Esc, arrows, Ctrl and Alt work.

On a phone, tap the screen so the system keyboard opens, then use **Keys** for Esc, Tab, Ctrl, Alt, function keys and arrows (the on-screen row that a phone keyboard does not have).

## Buttons

- **Pause** — freeze the PC. Press again to continue.
- **Reboot** — Ctrl-Alt-Del / reset. The floppy (your files) stays.
- **Factory** — put the original floppy back and reboot. Your saved disk is discarded.
- **Sleep** — freeze and keep the running machine (when the snapshot is small enough). Next open resumes there. If Sleep cannot fit, the floppy is still saved.
- **Mute** — PC speaker off.
- **Full** — the CRT fills the screen.

## What is saved

The **floppy** is saved in this file: anything you copy or edit on A: is still there the next time you open the app. Sharing the GIF shares that disk.

Sleep, mute, and whether the extra keys are showing are saved too. RAM that Sleep could not keep is not.

## Sound

The emulated PC speaker beeps. It starts **on**. Mute if you do not want it.
