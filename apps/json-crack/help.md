# JSON Crack

Paste JSON on the left. See it as a graph of cards on the right. Nothing is uploaded.

## Edit

1. Type or paste JSON in the **text** pane.
2. The graph updates as you type (after a short pause).
3. **Format** pretty-prints. **Minify** packs it onto one line.
4. **Sample** loads a starter document. **Choose file** opens a `.json` from this device.

On a phone, **Text** and **Graph** swap so the keyboard does not cover the cards.

An empty pane is empty — not an error. A red line means the JSON is not valid yet. The last good graph stays until you fix it.

## Read the graph

Each **object** or **array** is a card. Nested objects and arrays stay as a row on the parent *and* become a child card with an arrow. Strings, numbers, booleans and null stay on the parent as rows.

- Drag the background to pan.
- Scroll, pinch, or use **+/−** to zoom. **Fit** frames the whole graph.
- Tap a card's **–** to fold its children; tap **+** to open them.
- Tap a row to copy that value.

## What is saved

The document you were editing stays on this device, inside the file. Close it, come back, it is still there.

Unofficial port of [JSON Crack](https://github.com/AykutSarac/jsoncrack.com) by Aykut Saraç. Graph view only.
