# JSON Editor

View and edit a document as a **tree** or as **code**. The last document stays in this file. Nothing is uploaded.

## The two views

- **Tree** — expand objects and arrays. Double-click a name or a value to type. Right-click (or long-press) a row for insert, duplicate, remove, and type (object / array / string / number / true / false / empty).
- **Code** — the same document as text, with highlighting. Type freely; a red mark appears if the text is not valid yet.
- **Text** — a plain box, no highlighting.

The mode menu is on the toolbar. **Search** finds names and values. **Format** tidies the text. **Compact** takes the spaces out. **Repair** tries to fix a broken document (quotes, trailing commas).

## Jobs

1. Open the app — a small sample document is there if you have not saved one.
2. Edit in the tree, or paste into code view.
3. Switch views; they share the same document.
4. Close the app. The document is already saved.

**New** (toolbar) starts an empty object. That replaces the saved document.

## What is saved

The last document and the last mode (tree / code / text) live in this file on this device. They come back the next time you open it.

Unofficial port of [JSONEditor](https://github.com/josdejong/jsoneditor) by Jos de Jong.
