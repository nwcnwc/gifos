# OpenJSCAD gauntlet

**Win:** A stranger who knows openjscad.xyz uses this copy because the script and the solid live in one GIF that works offline, and one invite hands the design to a friend.

## Bars

- **ONE** — [openjscad.xyz](https://openjscad.xyz) (JSCAD v2 web UI) / OpenSCAD. Floor: script in, mesh out, orbit, parameters, STL. "As good as" is losing.
- **TWO** — GifOS: offline, `gifos.db` so the file is the save, Invite shares the script with no server.

## Rounds

1. Vendor `@jscad/modeling` 2.13.0 (MIT). Cube CSG hole + parametric gear run to a triangle mesh (840 / 618 tris in Node). STL from those triangles.
2. Split editor / orbit view; phone Model + Script tabs; Run on both; one-finger orbit + pinch. Last script private; room read-only for guests. User scripts compile via an inline `<script>` (GifOS CSP has no `unsafe-eval`).
3. Icon is a spinning gear (the job, not a wiggle). Cover is mid-use: gear script beside a lit solid with sliders. Listing leads with file-is-the-save + invite.
4. Live inlined-srcdoc pass: gear and cube both ran, three param sliders, canvas ~587×581, phone Model hides the editor and Script shows it, Run on both tabs. Desktop frame shows the gold 3D gear over a grid next to the JSCAD source.

## Remaining gap

Ace highlighting and the OpenSCAD `.scad` translator from openjscad.xyz are not here — this is JSCAD JavaScript only. A textarea is enough to write `main()`.
