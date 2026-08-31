# JupyterLite gauntlet

**Win:** A CPython notebook that lives in this GIF — close it, come back, every cell is still there; Invite is the same notebook with no JupyterHub.

## Bars

- **ONE** — JupyterLite / JupyterLab. A real notebook: code cells, Markdown, Shift+Enter, last-expression Out, one shared kernel.
- **TWO** — the notebook is the file. After Python downloads once (~10 MB), it works on a plane. One invite link is a live notebook with a friend, no account, no server.

## Rounds

1. **Kernel.** Pyodide 0.27.7 (CPython 3.12.7) in a classic blob worker. Glue + stdlib ride in the GIF; `pyodide.asm.wasm` is an optional hash pin. A memory `fetch` map answers the loader — no CDN at runtime.
2. **Save.** Last notebook in `gifos.db('notebook')`. Sharing the GIF shares the work. Invite is read-write cells; each person runs Python on their own device.
3. **Face.** Icon types `1+1` into In [ ] and prints Out [1]: 2. Cover is mid-use: version, π, Fibonacci.

## Remaining gap

This is a notebook and a stdlib kernel, not JupyterLab: no file browser, no numpy/matplotlib wheels, no ipywidgets. A stranger who wants the full lab still has jupyterlite.github.io; a stranger who wants the notebook in their pocket has this.
