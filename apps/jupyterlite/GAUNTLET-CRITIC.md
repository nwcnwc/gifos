# JupyterLite — gauntlet critic

Bar ONE: [jupyterlite.github.io/demo](https://jupyterlite.github.io/demo/lab/index.html) (JupyterLab in a tab — File / Edit / View / Run / Kernel, file browser) and Google Colab (account, hosted kernel, numpy). Bar TWO: the notebook is the file. Distinct from the original 156 (no Jupyter, no Pyodide, no notebook) and from `monaco-code` (an editor with no kernel). Judged on the packed GIF `site/apps/jupyterlite/jupyterlite.gif` (2 994 739 bytes) in the real GifOS sandbox (`run.html#id=` after install), desktop **1280×800** and phone **390×844**. Listing at `/store.html#app=jupyterlite`. Store search for `jupyter`. Invite sheet opened, not two-tabbed. One Chromium. Comp Lab loaded live; Notebook/REPL/Colab tabs died on this box after the Lab shell (that is the original’s weight, not a skip of the bar).

**Winner: COMP**

**Single biggest remaining gap:** After π prints, a stranger who knows JupyterLite types `import numpy` — and this notebook tells them to `await micropip.install("numpy")` / `pyodide.loadPackage`, which cannot run here (`connect-src` is none; the worker’s fetch map has three files). The listing is honest that numpy is not in the file. The traceback is not. jupyterlite.github.io still has the Lab, the file browser, and the scientific stack. Until the next cell after hello-world is work they already do, they stay on the website.

**Stranger-reason:** I know JupyterLite / Colab. I would open this one when the notebook has to *be a file* — close it, come back, `KeepMe.ipynb` and `PERSIST_1788219792288` were still there with every Out, no Google account, no JupyterHub. That persist actually ran. I will not leave the demo (or Colab) while `import numpy` is a red wall that then lies about how to climb it.

---

## Does Shift+Enter actually print?

**Yes.** That claim is true of the GIF that ships.

Packed GIF, Welcome notebook, first code cell:

```
import sys, math
print(sys.version.split()[0])
print("π ≈", round(math.pi, 6))
```

Clicked the textarea, **Shift+Enter**. Kernel had already reached `Python 0.27.7 · idle` in **6.2 s** (optional `pyodide.asm.wasm` pin, 10 105 545 bytes from jsdelivr, OS-side). Status `Python · busy`, then idle. Under the cell, stream text:

```
3.12.7
π ≈ 3.141593
```

Not a drawing. CPython 3.12.7 printed. Shift+Enter then selected the next cell (Jupyter’s advance). Second Shift+Enter on `Counter(words)` painted **Out [2]:** `Counter({'to': 2, 'be': 2, …})`. Last-expression Out is real. Print is stdout, correctly *not* labelled Out — the cover’s `OUT [1]: PI  3.141593` is the lie, not the product.

---

## Bar check

Bar ONE is not mediocre. jupyterlite.github.io/demo/lab is JupyterLab: File / Edit / View / Run / Kernel / Tabs / Settings / Help, a `/` file browser, launcher, more than one kernel. First paint in this Chromium was that shell with an empty grey main panel (10 s; no notebook open yet). Colab is a Google-account cloud notebook with GPUs and numpy. “As good as” would already lose on a port. Ours is a cell list and a stdlib kernel — and the listing says so.

Bar TWO is why this should have won: cells in the GIF, Invite the same notebook, plane after one 10 MB pin. **Close/reopen held.** Title `KeepMe.ipynb`, seven cells, π stream, Counter Out, numpy traceback, `print("PERSIST_…"); print(2+2)` → `PERSIST_1788219792288` / `4`. Comp’s demo is IndexedDB: clear site data and the notebook is gone. Colab is a Google doc. Ours is the icon.

---

## Face (always judged)

- **Icon — OURS on the sticker, stacked in this harness.** `icon.mjs` is 12 frames, 120 ms: `IN[ ]` types `1+1`, `IN[*]`, `OUT 2`. That loop is the app. At Home Screen size the dark orange-header card still reads “notebook.” Comp is a website with a 32 px favicon. Probe `putItem` landed `Jupyter.gif` on `Welcome.gif` — the harness, not the ornament.

- **Cover — COMP, and it garbles the product.** `screenshot.png` / `cover.jpg` is a 5×7 pixel poster: `JUPYTERLITE` / `PYTHON 3.12  IDLE`, `PRINT SYS. ERSION.SPLIT [0]`, `3.12.7` sitting on top of `PI  3.141593`, `FIB 12` and a Fibonacci row. Right *moment* (mid-use, outputs, no GifOS chrome). The picture is a different app. Live type is system-ui / ui-monospace; live first cell *prints* two lines of stdout with no Out cap; live kernel pill says **0.27.7**, not “PYTHON 3.12 IDLE.” At card size (store search, 16/10) the orange bar and In/Out still say “notebook”; at hero (listing) the missing `V` in VERSION and the overlapping π are a toy ROM. Chess Grandmaster’s cover is a photograph of the thing you get.

- **Listing copy — OURS, and true of this build.** `/store.html#app=jupyterlite`: tagline *A Python notebook that lives in this file. Invite shares the cells.* Description leads with close-it-come-back, then Invite / no JupyterHub / no Google account, then “not the full JupyterLab file browser,” then stdlib named, **numpy and matplotlib are not in this file**, then Welcome can print π, then unofficial port vs their demo forgetting. Cover rule held — listing requested `/apps/jupyterlite/cover.jpg`, zero fetches of `jupyterlite.gif`. Unofficial, JupyterLite Contributors / GifOS porter, BSD-3-Clause, signed gifos.app, 2.9 MB + 1 extra file ~9.6 MB, minBuild 1381 / release 0.9.10, abilities db + wasm + multiplayer + extra files. Persist and Shift+Enter were true. “Invite and someone else lands in the same notebook” was not two-tabbed. Store search for `jupyter` painted this card (Developer / Learning / Works offline / Extra files later). Distinct from the original 156; the live catalog this run had grown to 201 and includes the slug.

---

## Product

1. **It is a notebook. Shift+Enter prints. Run all / + Code / + Text / Restart / Open / Download / New are on the bar.** Welcome markdown is already previewed (`# Welcome`, bold Shift+Enter). Code cells have In [n], orange ▶, ↑↓, row-del trash. Md gutter is `Md`, not a fake In. That is Bar ONE’s floor as a *notebook*, and it holds.

2. **Kernel is CPython via Pyodide 0.27.7, stdlib only.** Glue + `python_stdlib.zip` + lock ride in the GIF (`worker-src.js` 1 309 575, stdlib 2 360 737). Wasm is the optional pin. App iframe `performance` resources: **zero off-origin**. Parent `run.html` fetched `https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.asm.wasm` — that is `gifos.assets`, allowed. First-run Abilities sheet: wasm + assets, both checked, “1 extra file, about 9.6 MB,” Download all, Confirm & Save. Confirm left them on.

3. **`import numpy` is a trap.** Cell In [3] painted Pyodide’s full ModuleNotFoundError, including “The module 'numpy' is included in the Pyodide distribution, but it is not installed. You can install it by calling: await micropip.install("numpy") … await pyodide.loadPackage("numpy") … pyodide.org/….” Then the app’s own sentence: “This notebook ships the Python standard library. Scientific packages are not in this file.” Status: “That cell did not run.” JupyterLite’s demo can import numpy. Ours cannot, and then describes a door that is bricked. See the gap.

4. **File-is-the-save — OURS, held.** Reload of the same `run.html#id=` restored title, every cell, every output. Comp forgets. Colab is an account. This is the port’s reason, and it is not a caption.

5. **Invite is OS chrome (held), occupancy unproven.** `#appinvite` minted the share sheet “Share Jupyter live” / Only I can host / Let a friend keep it going / Create link. No in-app Invite button (`build.mjs` refuses one). Guest path not driven. `data.notebook` is read-write; each device runs Python locally (help.md). Listing’s “lands in the same notebook” is the cells, not a shared kernel — honest if you read help, easy to overhear as one REPL.

6. **Phone (390×844) — usable, chrome-first.** Toolbar wraps two rows (Run … + Text / Restart … New). Play buttons on every cell. Code wraps (`print(sys.version.split()\n[0])`). No horizontal overflow (`390×812` client, `scrollHeight` 1054). First paint still “Python starting…”. Comp’s Lab on a phone is the whole IDE. Ours is the notebook with a chip bar on top. The play button the listing promised is there.

7. **Not the Lab.** No file browser, no launcher, no second notebook, no ipywidgets, no matplotlib canvas, no Markdown beyond headings/lists/`code`/`**bold**`, no Tab completion, no line numbers. `New` wraps under the bar even at 1280. Kernel pill says **Pyodide 0.27.7**, not Python 3.12.7 — the print is what proves 3.12.7. jupyterlite.github.io’s first screen is already JupyterLab. Ours is already a notebook. Different sports after minute one.

Wasm consent is in play and was granted. Worker is a classic blob (glue + `pyodide.asm.js` + `kernel.js`). `kernel.js` replaces `fetch` with a memory map so `loadPyodide`’s CDN URLs never hit the wire from the worker.

---

## Distinctness

Original 156 had no Jupyter, no notebook, no Pyodide. `monaco-code` is VS Code’s editor: buffers, IntelliSense, no `print`. `fend` is units. `hat-sh` is encryption. This Open’d a Welcome.ipynb and CPython printed π. The *engine* is distinct. The *name* is JupyterLite’s. A stranger searching Developer for “python” should land here, not in the editor — and this run’s search for `jupyter` did.

---

## Walls

- **No CDN from the app.** Held. Iframe origin-only. Wasm pin is OS `gifos.assets`, hash in `manifest.json` / `vendor/UPSTREAM.txt`.
- **Saved data in `gifos.db('notebook')`.** Held. Close/reopen restored cells and outputs.
- **Listing truth.** Shift+Enter, persist, stdlib, “numpy not in this file” — true. Invite occupancy untested, not proved false. Traceback micropip/loadPackage is an **overclaim of a capability the sandbox refuses**, inside an otherwise honest listing.
- **Cover rule.** Held on the network.
- **minBuild 1381 / unofficial `blessed:false` / BSD-3-Clause + CPython + Pyodide COPYING packed / Invite is OS chrome / signed gifos.app.** Honest on paper.
- **Catalog.** Live `index.json` this run listed the slug (catalog had moved on from the original 156). `#app=jupyterlite` and search both painted. Not the hole other new ports had.

---

## A/B

Put a stranger who knows jupyterlite.github.io, or who lives in Colab, in front of both.

Comp Lab: File menu, empty `/` browser, grey main, ten seconds of chrome before a notebook exists. Then numpy, matplotlib, widgets, files. Colab: Google, then the universe.

Ours: Welcome is already open; 6 s later Python is idle; Shift+Enter prints 3.12.7 and π; close it, `KeepMe.ipynb` is still the file; Invite sits in the bar above.

They will use the demo, or Colab, the moment the next cell is `import numpy`. The file-is-the-save is why they would come back *after* that cell either runs or the error stops offering micropip, and after the cover is a photograph of the live Out. Until then, **COMP**.
