# BeepBox gauntlet

A stranger who knows beepbox.co would use this copy because the song lives in the GIF — sharing the file shares the song — and one Invite is a jam on the same track, with no URL to copy and no account.

Bar ONE: **beepbox.co** (BeepBox 4.2.2 by John Nesky). The original chiptune song tracker. Floor, not ceiling.

Bar TWO: GifOS — offline, the file IS the save, Invite is multiplayer.

## Round 1 — vendor the tracker

Pinned BeepBox 4.2.2 (`3a88cd67`) as the official editor IIFE. Persistence is song JSON in `gifos.db('songs')`, not the URL hash. First-run seed is a 4-bar pentatonic loop so the grid is not empty.

## Round 2 — the file is the save, Invite is the jam

Solo: close it, come back, the same notes. Hand someone the GIF, they get the song. In a room the host copies a legal song onto the `song` row; guests write only their own row.

## Round 3 — phone grid

Zoom chips and two-finger pinch scale the editor; overflow pan. Default 135% under 710px. BeepBox's own mobile layout still stacks the controls.

## Round 4 — icon, cover, listing

Icon: piano-roll with a white playhead walking the bar. Cover: mid-song, cyan melody + yellow bass + orange pad + drums, playhead a third of the way in, "2 JAMMING". Tagline leads with the GIF-is-the-save and Invite jam.

## Round 5 — boot actually finishes

The sandbox CSP (`script-src 'unsafe-inline'`, no `unsafe-eval`) refused the editor's Function-constructor synth compile. `SongEditor` painted, then threw; `BeepEditor` was never assigned; a catch retry constructed a second editor on the same container (doubled Play / pattern rows); persist, zoom, File-menu traps, and jam never wired; `gifos.db('songs')` stayed empty.

Fix: `shim.js` compiles those functions by inserting a classic `<script>` (same hatch as TiddlyWiki). `build.mjs` rewrites the three packed call sites onto `GifOSBeepboxShim.compile`, and wraps the constructor tail so `history.scrollRestoration` and `serviceWorker.register` cannot throw SecurityError in the opaque-origin sandbox (that throw painted the chrome, then aborted before `BeepEditor` was assigned). Boot constructs `SongEditor` once, applies the seed if the grid came up empty, writes `songs`/`current` on first boot, and attaches zoom + jam + File-menu stripping after the editor exists. The 710px container cap is gone so the viewport width matches the editor's own 711px layout breakpoint. Seed pitches sit two octaves up so they land in the visible piano-roll window (octave 3 + pitches 0–4 were off the bottom of the grid).

## Remaining gap

Two people editing the same bar at the same moment last-write-wins the whole song (no per-note OT). Fine for a jam, not a DAW. MP3 export is refused (upstream fetched lamejs). WAV / MIDI / JSON stay.

## One-sentence win

The original tracker, but the song is the file, and one link is two people on the same grid.
