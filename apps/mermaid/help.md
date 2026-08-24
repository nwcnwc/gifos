# Mermaid

Type a diagram. See it live. The last chart stays in this file.

## The loop

1. The left box is the recipe. The right box is the picture.
2. Type a **flowchart**, a **sequence**, a **class** diagram, a **pie**, or any other mermaid kind you already know.
3. The picture updates a moment after you stop typing.
4. Pick a kind and press **Sample** to drop a starter in the box.
5. **Copy SVG** puts the current picture on the clipboard.

On a phone, **Recipe** and **Picture** swap: type on one, look on the other, so the keyboard does not cover the chart.

You do not need every kind. A flowchart is enough:

```
flowchart TD
  A[Start] --> B{Branch}
  B -->|Yes| C[Done]
  B -->|No| D[Try again]
```

A sequence looks like:

```
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi
```

If the recipe cannot be drawn, a short error appears above the picture. The last good picture stays until you fix the line.

## Play together

Working alone is the original wrap. The last diagram stays on this device.

Want a friend looking at the same chart? Press **Play together**, then send the link from the bar above. You both start from this recipe. When anyone types, everyone gets the new picture.

**← Solo** puts you back on the original wrap with the diagram you left.

## What is saved

The diagram text lives in this file. Close it, come back, it is still there. A live share is the room for that session, not a second save.

## Credit

Unofficial wrap of [mermaid](https://github.com/mermaid-js/mermaid) by mermaid-js. This is the engine plus a textarea — not the mermaid live editor website.
