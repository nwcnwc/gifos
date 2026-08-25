# JSON Editor

View and edit a document as a **tree** or as **code**. The last document comes back next time.

## The two views

- **Tree** — expand objects and arrays. Double-click a name or a value to type. Right-click (or long-press) a row for insert, duplicate, remove, and type (object / array / string / number / true / false / empty).
- **Code** — the same document as text, with highlighting. Type freely.

The **Tree** and **Code** tabs sit above the editor. On a phone they are full-width so the switch is a tap, not a tiny menu. Back on a phone returns to Tree.

A document must be valid JSON (an object, a list, a string, a number, `true` / `false` / `null`). If the text is not valid yet, a red note names the parse error and the tree will not open over it — it is not silently rewritten. **Repair** tries trailing commas, comments, and unquoted keys.

## Jobs

1. Open the app. The file is empty until you paste, open, or tap **Sample**.
2. Edit in the tree, or paste into Code.
3. **Format** indents a valid document. **Compact** takes the spaces out. **Copy** copies the text. **Open** reads a `.json` file on this device. **New** starts an empty object.
4. Close the app. The document is already saved.

Search lives on the editor toolbar (tree view).

## What is saved

The last document and the last mode (tree / code) live in this file on this device. They come back the next time you open it. Text that is not valid JSON yet is kept as text so you do not lose the typing.

Unofficial port of [JSONEditor](https://github.com/josdejong/jsoneditor) by Jos de Jong.
