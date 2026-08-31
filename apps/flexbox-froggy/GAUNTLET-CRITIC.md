# Flexbox Froggy — gauntlet critic

Blind play of **OURS** (GifOS GIF in the sandbox, plus the unpacked lesson) against **COMP** (https://flexboxfroggy.com). Labels stripped while playing; names restored here.

**Winner: OURS**

**Stranger-reason:** Close the GIF on level 12, open it tomorrow — still on 12, still with the CSS you typed, no account, works on a plane. Press Invite in the bar and a friend lands in this pond: whoever types, the frogs hop on both screens. The website cannot do that, and it serves ads.

**Single biggest remaining gap:** The lesson still looks like a cheaper Froggy. Fredoka One never ships (Trebuchet is named and missing, so the title is generic system sans), and the 4-line finale editor is a transparent textarea that eats `flex-direction: column-reverse` into the `#pond {` prelude — the last puzzle is harder to read here than on the website. A classroom that came for “that round logo and the white CSS box” still has a reason to stay on flexboxfroggy.com.

## What I actually opened

- COMP: live site, desktop and 390×844. Google Fonts (Fredoka One, PT Sans, Source Code Pro), AdSense, analytics, 54-language picker, Carbon-style “Discover more” chips under the editor.
- OURS: unpacked `apps/flexbox-froggy/` through all 24 levels; persistence via `gifos.db`; a two-page shared pond; then `?run=flexbox-froggy` in the real sandbox (Invite / Save / Help in OS chrome, `window.gifos.db` present, Next lights when the frog sits). Store listing at `store.html#app=flexbox-froggy`. Icon at 64 / 96 / 128 next to Grid Garden and 2048.

## Face (icon, cover, listing)

**Icon — OURS.** A green frog hops onto a pad, then a yellow friend lands beside it. At 64px it still reads as two frogs in a pond; the loop demonstrates the product (solo hop, then a guest) instead of wiggling. COMP has no Home Screen icon to beat.

**Cover — COMP, barely.** Ours is a punchy pixel poster of solved level 3 with YOU / MAYA on the waterline — mid-use, sells the pond. It is not a photograph of the running app: the live UI is Trebuchet/system sans and Thomas Park’s SVGs, not the poster’s pixel type and block frogs. COMP’s official `images/screenshot.png` is the real lesson (Fredoka, white editor, frogs above pads). Grid-card size, the poster wins; listing hero, you can tell it is a drawing.

**Listing copy — OURS.** Tagline and body lead with the reason (“close it… still on the same pad — or invite a friend”). Claims I could check are true: 24 levels, click-a-property, colorblind shapes, Invite is OS chrome, 209 KB, signed, unofficial port credited to Thomas Park. COMP has no store page, only the game plus ads.

The committed catalog index does **not** list the slug. Searching the store grid for “froggy” or “flexbox” returns “Nothing matches that.” The listing URL and `?run=flexbox-froggy` work; browsing the grid does not.

## Play

**24 levels — OURS, tied on puzzles, wins on chrome.** All 24 solutions hop the frogs onto matching pads and light Next (1–21 on the first pass; 22–24 on a longer wait — view-transition compare needs a beat). Win screen fills the pond with 25 hoppy frogs. COMP is the same puzzles; its page also loads ads and a language menu under the editor.

**CSS editor — COMP.** Same grey box, same line numbers, same click-a-property tooltip (six values, tap `flex-end`, frog hops, Next lights). COMP’s textarea is white, so a 4-property answer stays readable. Ours is `background: transparent`; on level 24 `flex-direction: column-reverse` clips through `display: flex` as `…umn-reverse`. That is the climax of the course.

**Frogs / pads — tie.** Same SVGs, same pulse, same lilypad notches, same colorblind shapes. Ours hops via view transitions + local keyframes (no animate.css CDN). Presence frogs along the water when a mate is in the pond — COMP has nothing like them.

**Progress saved — OURS.** Close on level 1 with the answer in the box, reopen: level 2, solved map kept. Lives in `gifos.db`, not `localStorage`. COMP only remembers if the browser does.

**Invite pond — OURS.** Two pages, shared `players` rows: Ada and Maya pills, named frogs on the waterline, CSS mirrored, Next lit on both. In the sandbox the OS bar really does say Invite (listing copy is not a lie). COMP is one player, always.

**Phone — OURS.** Pond on top (`viewTop: 0`, board ~390×388), editor below, scroll reaches Next. COMP also stacks, then buries the lesson under ads and a settings overlay. Ours has no `min-width: 600px`.

**No Google Fonts CDN — OURS (wall held).** App requests stay on origin. COMP pulls fonts.googleapis / gstatic, pagead, doubleclick, analytics on first paint.

## Walls

- **Broken:** `site/apps/index.json` does not contain `flexbox-froggy` (cover, GIF, and `app.json` are on disk). Store search cannot find it. `node scripts/build-app-catalog.mjs --check` reports the index stale.
- **Held:** no CDN / webfont / remote load in the GIF; no `localStorage`; Invite is OS chrome; save is a private `gifos.db` row; images vendored; listing does not overclaim the Invite bar.
- **Not a wall, still wrong:** win banner says “Reset in Settings.” Reset is in the level map. Settings has difficulty and colorblind only.

English-only (COMP has 54 locales) is a real classroom loss and not the biggest remaining gap — the file would balloon, and the ads went with it on purpose.
