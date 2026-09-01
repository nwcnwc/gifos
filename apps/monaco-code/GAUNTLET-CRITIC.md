# Monaco Code gauntlet critic

Blind A/B against **the Monaco Editor playground** ([microsoft.github.io/monaco-editor/playground.html](https://microsoft.github.io/monaco-editor/playground.html), latest stable 0.55.1 in the live page) and **VS Code for the Web** ([vscode.dev](https://vscode.dev)). Played the shipped GIF `site/apps/monaco-code/monaco-code.gif` (4,321,220 bytes) in the real GifOS sandbox via `/?run=monaco-code` — desktop 1280×820 and a 390 viewport pass that the renderer did not survive. Store listing at `/store.html#app=monaco-code`. Distinct from `json-editor` (Jos de Jong tree/code JSON forms; Invite there is read-only watch).

**Winner: OURS**

A stranger who knows the playground has a reason they can say back after a cold run: the buffers are in the file, the language workers are blob URLs minted from GIF bytes, and nothing is fetched from a CDN. That is not true of the playground (66 requests, `node_modules/monaco-editor/min/vs/…` plus `dev/vs/…` plus a woff2), and it is not true of vscode.dev (empty workspace until you open a folder, network for the workbench, Live Share behind an account).

It is not a win against vscode.dev *as an IDE*. It is a win against the named bars as the gauntlet set them.

## Stranger-reason

Asked: you know the original — why would you use this one?

The listing's answer is: the buffers live in this file; it works on a plane; one Invite is a pair session; no account, no server, no pastebin; this is the real Monaco, not a JSON form.

After a cold run:

| claim | running build |
| --- | --- |
| Real Monaco, IntelliSense for JS/TS | **True.** `monaco.languages.typescript.getTypeScriptWorker()` returned. Hover on `greet` is `function greet(who: Guest): string`. Completions on `console.` are `assert, clear, count, …`. Suggest widget painted. |
| Workers from GIF bytes, no CDN | **True.** Packed `.assets/ts.worker.js` (6,022,799), `json.worker.js`, `editor.worker.js`. App-frame scripts after mount are `blob:null/…`. Off-origin requests from the app: none. Playground loads `min/vs/workers-*.js` off microsoft.github.io. |
| Buffers in the file | **True as a write.** `gifos.db('files')` had `hello.ts` / `app.js` / `data.json` / `README.md` after first boot. Reopen-after-edit was not finished this run (renderer died); the write landed. |
| Not a JSON form | **True.** No Tree/Code tabs, no schema form. json-editor is the other app. |
| Invite → friend types in the same editor | **Wired, not driven to a guest.** OS `#appinvite` is in the bar. `Mp.live` is true. Guest join was not completed — Chromium died under load, not a product exception. Pair code is whole-file last-write-wins. |
| Works on a plane | **True after the 4.1 MB install.** Nothing to fetch. First open *is* that download. |
| File tree, Find, format, minimap, Markdown | Minimap **on** at desktop. Sidebar is a **flat list**, not a tree (slashes stripped from names). Markdown is highlighting, no preview. Find/format buttons exist; Find widget was not captured. |
| Phone: files behind one tap, keyboard room | CSS is a Files drawer under 719px, wrap forced on, minimap off, 40px taps. **Not driven** at 390 — same renderer death. |

Lead claims that I could measure are true of the build. That is not a failed listing round. "File tree" is a stretch (it is four names). It is not the lead.

## Single biggest remaining gap

**The cover and the first minute are a pair session that first boot is not.**

`cover.jpg` (listing hero 680×409, `alt` "Monaco Code screenshot") is a pixel-font drawing: `hello.ts` selected at the top of FILES, an IntelliSense card on `greet`, a red **Alex** caret, status `Alex is in this editor.` It is not a frame of the running app.

Cold run, same GIF, desktop:

1. First paint (screenshot at editor-ready + 1.2s): empty FILES, empty buffer, language `plaintext`, "Saved in this file." / "Press Invite…".
2. Seeded paint (~16s from `?run=`): four files, real Consolas-like Monaco on `hello.ts`, minimap, "Sample project — edit anything. It stays in this file." Status on the right: **Waiting for a friend… Invite sends the link.** — on a solo app, before anyone pressed Invite. `net.js` sets `on = true` as soon as `gifos.db` exists.

`bootEditor()` creates the empty model, then `startDb()` is async. A finger can type into the void; `openFile('hello.ts')` then throws that buffer away. Cover Crop is `top: 0` because the picture is not a screenshot of the shell.

Until first paint is the sample (or a saved buffer) with a quiet solo status, the listing is selling a mid-session the GIF does not open onto. Last-write-wins pair is the next gap after that, not instead of it.

## Piece judgements

### Icon — OURS

12 GIF frames (GCE count 12), 128² procedural VS Code window that types syntax then a red second caret. The playground is a website with a purple wordmark; vscode.dev is the default workbench. At icon size the loop is the product (type, then a friend). Not judged on a populated Home Screen this run: a fresh profile had zero seeded `.icon` nodes before `?run=` stole the GIF. The frames still read as an editor.

### Cover — COMP

Pixel illustration, not a capture. Listing hero is readable as "code editor." Grid card was not on the first store screen (200+ apps; Monaco is not above the fold under All). Next to the running iframe the lie is obvious: the live editor has real glyphs, no Alex, hello.ts last in an alphabetical list. The playground's "store art" *is* the live editor. Ours is a drawing of a session the first minute does not contain.

### Listing — OURS (not a failed round)

Rendered copy matches `listing.json`. Tagline is a card line. Description leads with file / plane / Invite, then "real Monaco, not a JSON form," then the feature list, then unofficial. Credits are honest (`blessed: false`, bugs to GifOS). 4.1 MB, signed, minBuild 1178.

IntelliSense, workers-in-GIF, db write, "not a JSON form" held under the GIF. Invite guest and persist-reopen were not finished; they are not shown to be false. "File tree" and "Markdown" as peers of IntelliSense are generous.

### Monaco subset vs playground — COMP as a demo, OURS as a place to type

Playground at the same 1280×820: three editors (JS / HTML / CSS) plus a live Preview, example menu, hover-on-property docs, pin 0.55.1. Ours is monaco-editor **0.52.2**, one editor, four buffers, no run/preview, no HTML/CSS language-service workers (highlight only — `pathFor` maps those labels to `editor.worker.js`). That is a thinner Monaco.

What the playground does not have: a project that survives a close, a file list, Invite in the OS bar, workers that keep working with the network cut. Those are why a playground user would switch. "As good as the playground as a Monaco demo" would lose. This is not that.

### vs vscode.dev — COMP as an IDE

vscode.dev cold: Explorer, Open Folder, Command Palette, Find in Files, Settings, Timeline. Ours has none of that. The listing does not claim VS Code; it claims VS Code's *editor*. That sentence is true. A stranger who wanted vscode.dev will still open vscode.dev. The reason to use this one is the file and the Invite, not the workbench.

### Buffers in the GIF / offline / no CDN — OURS

Decode of the shipped GIF:

```
vendor/monaco.js              3,808,780
.assets/ts.worker.js          6,022,799
.assets/json.worker.js          394,817
.assets/editor.worker.js        264,054
```

No `https://` in `index.html`. `workers.js` is `gifos.assets` → `blob:` Worker, classic, no `type:module`. First-run net log: site origin + `blob:` + `blob:null` worker scripts. Playground: microsoft.github.io `min/vs` and `dev/vs` plus a font. Wall held.

### Invite pair — not scored (guest not landed)

Host chrome is correct (Invite is OS, app does not draw the button). Footer already says "Waiting for a friend" on solo, which is the wrong sentence. Implementation is last-write-wins per file (`persistFile` puts the whole `text`). Help.md is honest about that; the listing is not. Cover's overlapping carets read as character-level pair. They are not.

### Phone — not scored

`style.css` `@media (max-width: 719px)` hides the sidebar behind `#filesBtn`, 40px tabs/buttons, wrap forced (`wrap = wrap || phone` so More → Word wrap cannot turn it off), minimap off. 390 drive died with the renderer. Keyboard-room is a claim I will not rubber-stamp from CSS.

## Wall breaks

- **No remote load.** Held.
- **Workers from GIF bytes as blob URLs.** Held. TypeScript worker answered.
- **Saved data in gifos.db.** Write held (`files` collection, four sample rows). Reopen-after-edit not finished this run.
- **Listing truth.** Lead claims that were measured are true. Cover is not a screenshot. "File tree" is a list.
- **Invite is OS chrome.** Held.
- **wasm hatch for blob Workers.** Declared, used.
- **Unofficial, blessed:false, MIT, Microsoft as author.** Honest.
- **Distinct from json-editor.** Held.

## Bar check

Bar ONE is not mediocre. The playground is the best way to *see* Monaco; vscode.dev is the best way to *use* it in a browser. "As good as" either, as those products, is losing.

Bar TWO is why this wins: the file is the save, the workers ride in the GIF, Invite is the pair door. A stranger can say that back. The remaining work is to make the first minute and the cover the same session, and to make "a friend types" mean characters, not whole-file last write wins.
