# OpenJSCAD — gauntlet critic

Blind A/B against **https://openjscad.xyz/v2/** (JSCAD v2 web UI — the named floor). Distinct from `apps/gltf-viewer` (open a `.glb` / `.gltf`, inspect meshes; no `main()`) and `apps/cascade-studio` (sketch a profile, OpenCascade B-rep, 8.9 MB wasm — not CSG JavaScript).

Judged on the packed GIF in the real GifOS sandbox (`run.html#id=`, desktop 1100×820), the same JS unpacked for phone / slider / cube / STL, `/store.html#app=openjscad`, Home Screen at 64px, cover at card 240 and hero 680, and openjscad.xyz/v2 in the same Chromium. One Chromium at a time. Invite two-tab and GIF close-and-reopen were attempted; the box was at load 13–50 on 6 cores and those follow-ups died before a guest mounted — they are **not** awarded.

**Winner: COMP**

**Single biggest remaining gap:** The script is a `<textarea>`. No highlighting, no line numbers, no matching parens, no Ctrl-S. `gearProfile` clips mid-token on both desktop and phone. A stranger who knows openjscad.xyz lives in Ace. Ours puts a notepad next to a solid. Until writing `main()` here is the job they already know, the GIF and the plane are not a reason to leave the original.

**Does `main()` actually mesh a gear? Yes.** Packed GIF, first boot after restore: Gear lit, `gearProfile` + `const main = (p) => {`, Teeth/Thickness/Bore 16/6/4, brass 16-tooth gear with hub and bore on a grid, status **`618 triangles · 241 ms`**. Node engine on the same samples: gear 618 tris, cube 840, STL 30 984 bytes. That is not a poster.

**Stranger-reason:** Asked “you know openjscad.xyz — why this one?” the listing answers: the script and the solid live in the file, it works on a plane, one Invite hands a friend the design.

After a cold run I can say the first two about the *mesh*. I cannot say the Invite back: I never landed a guest on `HOST_SHARE_99`. Search for `jscad` on the store is “Nothing matches that.” And I would not *write* a design here. That is not a reason to leave openjscad.xyz. Give them an editor, ship the catalog row, prove the guest gets the host’s script; then the file-is-the-save line is enough.

## Wall breaks

- **Catalog (broken).** `site/apps/openjscad/{openjscad.gif,app.json,cover.jpg}` exist (286 KB, signed gifos.app). `site/apps/index.json` has 156 apps and does **not** list `openjscad`. Store search for `jscad` paints “Nothing matches that.” Deep-link `#app=openjscad` still loads `app.json` and the listing. A stranger browsing the grid cannot find it. (`cascade-studio` is missing from the index too; `gltf-viewer` is present.)
- **No CDN (held).** Packed GIF filesystem: `index.html`, `style.css`, `engine.js`, `viewer.js`, `samples.js`, `net.js`, `boot.js`, `vendor/jscad-modeling.min.js` (`@jscad/modeling` 2.13.0), `COPYING-jscad.txt`, `UPSTREAM.txt`, `help.md`, `manifest.json`. Manifest has no `network`. Unpacked app-origin requests stayed on `127.0.0.1:18791`; off-origin list was empty. Comp’s hosts this run were `openjscad.xyz` only — and it still posted `Error: cannot start service worker, reload required`.
- **unsafe-eval (held).** Engine compiles user `main()` via an inline `<script>` in the app (CSP has no `unsafe-eval`). Packed GIF meshed. Console in the GIF boot was quiet enough to finish 618 tris.
- **Listing truth (soft fail on the face, not the body).** Description claims are true of the running *mesh* (Cube/Gear, sliders, STL, phone tabs, unofficial, `require('@jscad/modeling')`). Invite is OS chrome, not an in-app button — the meet line tells you to press it. “A friend who opens your invite gets the same design” was **not executed** this run. Cover art prints **1840 TRIANGLES**; the live gear is **618**. That is an overclaim on the picture, not a style note.
- **minBuild 947 / unofficial `blessed:false` / MIT inside the GIF / signed gifos.app.** Honest on paper.
- **gifos.db persist / Invite.** Code is in `boot.js` (`save` / `last`) and `net.js` (read-only room, host script). Unpacked mock `put` wrote `PERSIST_GEAR_42`. GIF close-and-reopen and a second context on `#appinvite` did not survive this box. **Not awarded. Not a product red I measured.**

## Face (always judged)

- **Icon (64px):** 12-frame brass gear on a dark rounded card, 128², spinning. At Home Screen size next to Welcome.gif / Camera.gif it still reads as a gear — the job, not a wiggle. Comp is a website with no icon. This slot wins.

- **Cover:** Procedural pixel-font drawing (`icon.mjs` `screenshotPng`), not a frame of the running app. Live UI is system-ui, a real `gearProfile` listing, 618 tris. The poster is a truncated fake `CONST MAIN`, a gear with no hub flange, and **1840 TRIANGLES · 32 MS**. At hero (678×407 on the listing) it still sells “script beside a solid.” At card (240×150) the code dies; the gear remains. Honesty nick: the number is a lie, and a shopper who then opens the app sees 618.

- **Listing copy (read on `/store.html#app=openjscad`, desktop and 390):** Tagline *Write JavaScript, get a 3D solid — the script lives in the file.* Description leads with file + plane + Invite, then Cube/Gear / sliders / STL / close-and-come-back, then phone Model/Script, then unofficial JSCAD Organization. Right shape. 286 KB, MIT, porter GifOS, blessed false, abilities Saves-in-the-icon + Multiplayer. Grid card could not be judged: the slug is missing from `index.json`.

## Product (evidence, not the winner)

### `main()` meshes a gear — OURS (the question)

Packed GIF, sandbox, after ~2 s of restore:

- Status `618 triangles · 241 ms`.
- Script is the shipped gear sample (`require('@jscad/modeling')`, `gearProfile`, `extrudeLinear`, `subtract(union(body, hub), hole)`, `colorize([0.95, 0.72, 0.18], …)`).
- Three sliders: Teeth 16, Thickness 6, Bore radius 4.
- Canvas: lit brass gear, teeth, hub, bore, floor grid. Orbit drag turns it.

Node pin of the same engine: cube 840 tris, gear 618, STL 30 984 bytes, header `GifOS OpenJSCAD`. Empty/`main() => 1` refuses (“no 3D triangles”). This is not glTF Viewer (no file open, no scene graph) and not CascadeStudio (no sketch plane, no wasm kernel).

### CAD IDE — COMP

Blind, same job (script in, mesh out):

- Comp: numbered, coloured editor; gizmo cube; default cube−sphere CSG + inner intersect; Export 3MF / STL ascii+binary / OBJ / X3D / DXF / JSON / SVG; “Copy JSCAD script (URL) to clipboard”; examples; file drop. First paint is a tutorial overlay on a light grid, plus a red service-worker banner in this Chromium.
- Ours: dark split, Gear already running, sliders, STL only, unnumbered textarea, lines clip. Phone Model/Script is a real layout. No examples catalog, no `.scad`, no 3MF.

The original is an IDE that happens to mesh. Ours is a mesher that happens to have a box you type in. “As good as” is losing on a port. We lost the half they spend their time in.

### Phone — OURS

390×844, Model default: tabs `flex`, editor `display:none`, canvas 364×490, Run 40 px, no page scroll, gear filling the view, 618 tris. Script tab hides the canvas, keeps Run, shows the source. Airplane mode still remeshed (`618 triangles · 154 ms`, `navigator.onLine` false). openjscad.xyz on a phone is the desktop IDE squeezed. This is the one interaction that already beats the floor.

### STL — OURS for “a printer”, COMP for “formats”

Download fired `gear.stl`, 30 984 bytes, 618 tris, `GifOS OpenJSCAD` header. Cube CSG hole (unpacked, same `samples.js` packed in the GIF): 840 tris, cyan cuboid minus sphere, sliders Cube size 20 / Sphere radius 13. Teeth 16→10 remeshed 618→522 and the solid lost teeth on screen. Comp still has the rest of the export menu.

### Script+solid in the GIF — OURS on first boot

The file that ships is the editor and the mesh. g00 is white OS chrome; g03 is the gear. That is bar TWO’s first sentence, and it is true of this build.

### Invite shares the design — not awarded

Meet line is correct. `#appinvite` is OS chrome (`Invite` in the bar, no in-app button). `net.js` publishes `{script, params, sample}` to a read-only room; guests get `body.guest` and a read-only textarea. I did not get a second context onto that link this run. Comp’s share is “Copy JSCAD script (URL)” — ugly, and it works without a live host. I cannot tell a stranger theirs is worse until a guest actually lands on this script.

## Bar check

Bar ONE is not mediocre. Ace + parameters + export + examples is the product. Beating it by “we remembered the tab” would still be a weak win; beating it with a notepad is a loss.

Bar TWO is why this should have won: the script and the solid in one GIF, one Invite is the design, it runs on a plane. The mesh half is real. The catalog does not ship it. The editor is the thing a JSCAD user will bounce off before they ever press Invite.
