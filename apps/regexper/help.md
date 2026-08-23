# Regexper

Type a regular expression. Press **Display**. You get a railroad diagram of what it matches: boxes for the letters, loops for things that repeat, branches where there is a choice. That is often easier to read than the punctuation.

The picture is drawn on this device. Nothing is uploaded.

## What you do

1. Type or paste a JavaScript-style regular expression in the box.
2. Press **Display**.
3. Read the diagram. Hover a small repeat label for a hint about how many times it matches.
4. **Download SVG** or **Download PNG** to keep the picture.

A small example opens the first time so you see a diagram, not a blank page. Replace it with your own.

**Permalink** puts the current expression in this window’s address so Display can run it again after a reload. That is not a link you can send — download the picture, or copy the expression, if you want it elsewhere.

## How to read the picture

- A **box** is a literal character or an escape (`\d`, `\w`, `\b`).
- A **loop** is a repeat (`+`, `*`, `{n,m}`).
- A **fork** is a choice (`a|b`).
- A **dashed frame** is a group.
- A **grey block** is a character class (`[abc]`, `[^0-9]`).
- Start and end anchors (`^`, `$`) are labelled.

If the expression cannot be drawn, the error (and any warnings) show above the picture.

You can wrap the expression in `/slashes/` and add flags (`i`, `g`, `m`). Bare text is also fine — Display treats that as the pattern.

## Private

Nothing is saved in this file. **Invite** does not share a diagram. There is no account and no history.

Unofficial port of [Regexper](https://github.com/javallone/regexper-static) by javallone.
