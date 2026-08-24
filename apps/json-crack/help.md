# JSON Crack

Paste JSON on the left. See it as a graph of cards on the right. Nothing is uploaded.

## Edit

1. Type or paste JSON in the **text** pane.
2. The graph updates as you type (after a short pause).
3. **Format** pretty-prints. **Minify** packs it onto one line.
4. **Choose file** opens a `.json` from this device.

A red line under the text means the JSON is not valid yet. The last good graph stays until you fix it.

## Read the graph

Each **object** or **array** is a card. Keys that hold another object or array become an arrow to a child card. Strings, numbers, booleans and null stay on the parent as rows.

- Drag the background to pan.
- Scroll or pinch to zoom.
- Tap a card's **–** to fold its children; tap **+** to open them.
- Tap a row to copy that value.

## A live friend

Press **Invite** in the bar above the app. A friend who opens the link sees the **same document**. Either of you can type; the graph follows. There is no account.

## What is saved

The document you were editing stays on this device, inside the file. Close it, come back, it is still there.

Unofficial port of [JSON Crack](https://github.com/AykutSarac/jsoncrack.com) by Aykut Saraç. Graph view only.
