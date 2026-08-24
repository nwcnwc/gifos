# JSON Diff

Paste **two documents**. Added bits light up **green**, removed bits **red**, and changed bits show both sides. Nothing is uploaded.

## Compare

1. Paste the **old** document on the left.
2. Paste the **new** document on the right.
3. The difference updates as you type.

Each side must be valid JSON (an object, a list, a string, a number, `true` / `false` / `null`). A red note appears under a box that cannot be read. **Pretty** rewrites a valid box with indent. **Sample** loads a tiny pair so you can see the colours.

**Show unchanged** keeps fields that did not move, so you can read the whole tree. Off by default, so only the difference is on screen.

## What is saved

The last pair stays in this file on this device. It comes back the next time you open it.

Press **Invite** in the bar above the app to show a **read-only** view of the same pair in a meeting. People who join see the difference. They do not type over it — the host’s pair is the one shown.

Unofficial port of [jsondiffpatch](https://github.com/benjamine/jsondiffpatch) by benjamine.
