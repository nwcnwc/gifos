# JupyterLite

A Python notebook on this device. The cells stay in this file. Nothing is uploaded.

A **Welcome** notebook is already open the first time, so the first **Run** can print π. Python 3.12 downloads about 10 MB the first time the kernel starts, then stays here.

## Cells

- **Code** cells run Python. The last line’s value is **Out**, the way a notebook does it. Prints land under the cell.
- **Text** cells are Markdown: headings, lists, `code`, **bold**. Run a text cell to preview it; tap the preview to edit again.

**Run** (the orange button, or **Shift+Enter**) runs the selected cell and moves to the next. **Ctrl+Enter** / **Cmd+Enter** runs and stays. On a phone, the play button on the cell is the same as Run.

**Run all** walks every code cell from the top, in order, on the same kernel — variables you set in cell 1 are there in cell 3.

**+ Code** / **+ Text** insert below the selected cell. **↑** / **↓** reorder. Delete removes a cell (one cell always remains).

## The kernel

One Python, shared by every cell. `import math` in one cell is still imported in the next.

**Restart** wipes that memory and starts Python again. Cell text stays; **Out** stays until you run again.

A line that fails is named as Python named it. This build ships the **standard library** (math, json, collections, datetime, statistics, pathlib, random, re, csv…). Packages such as numpy and matplotlib are not in this file; importing them says so, and that there is no pip.

## Jobs

1. Open the app. The Welcome notebook is there until you replace it.
2. Change a cell. Press **Run**.
3. **Open** reads a `.ipynb` from this device. **Download** writes one out. **New** starts a blank notebook.
4. Close the app. The notebook is already saved.

On a phone the toolbar wraps. Back blurs the cell you are typing in.

## What is saved

The whole notebook (every cell, every output, the title) lives in this file on this device. Sharing the file shares the work. In a live session, everyone is looking at the same cells — an edit is live for the others. Each person runs Python on their own device.

Unofficial port of [JupyterLite](https://github.com/jupyterlite/jupyterlite). Python is CPython 3.12 via Pyodide.
