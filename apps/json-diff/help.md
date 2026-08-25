# JSON Diff

Paste **two documents**. Added bits light up **green**, removed bits **red**, and changed bits show both sides.

## Compare

1. Paste the **old** document on the left.
2. Paste the **new** document on the right.
3. The difference updates as you type.

Each side must be valid JSON (an object, a list, a string, a number, `true` / `false` / `null`). A red note appears under a box that cannot be read, and the difference pane says so instead of guessing. Empty sides stay empty — they are not treated as `{}`.

**Pretty** rewrites a valid box with indent; a box that is not JSON is left alone and the error stays. **Swap** exchanges the two sides. **Sample** loads a pair that shows a renamed field, a list change, and an object matched by `id`. **Clear** empties both.

On a phone, **Left / Right / Difference** tabs show one pane at a time so the colours are not buried under the editors. Back returns to Left.

## The difference

- **Visual** — the tree the original demo draws.
- **JSON** — the compact delta (what you would store or send).
- **Patch** — [JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) operations.
- **Copy** copies the JSON or Patch, whichever is showing.

**Show unchanged** keeps fields that did not move. **Match lists by id** pairs objects that share `id`, `_id`, or `key` instead of matching only by position.

Choose a `.json` file under a box, or drop a file onto it.

## What is saved

The last pair, the checkboxes, and the visual/JSON/Patch choice stay in this file on this device. They come back the next time you open it.

Press **Invite** in the bar above the app to show a **read-only** view of the same pair in a meeting. People who join see the difference. They do not type over it — the host’s pair is the one shown.

Unofficial port of [jsondiffpatch](https://github.com/benjamine/jsondiffpatch) by benjamine.
