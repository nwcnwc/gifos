# RegExr

Type a **regular expression** and some **text**. Matches light up as you type. Roll over a token or a match for details.

## Expression

The box under **Expression** is the pattern (without the slashes). Flag chips on the right are **g** global, **i** ignore case, **m** multiline, **s** dotall, **u** unicode, **y** sticky. This copy runs **JavaScript** RegExp in this tab.

Click a row in the **Cheatsheet** to insert that token. The **Reference** has the full notes and a **Load example** button on many entries.

## Text and Tests

**Text** is what the pattern is tried against. Click a highlighted match to open **Details** (the match and its capture groups).

**Tests** is a suite: each test can require the pattern to **Match any**, **Match full**, or **Match none**. **Add test** makes a new row. The tally says PASSED or how many failed.

## Tools

- **Replace** — substitution string (`$&`, `$1`, `\n`…). The result updates as you type.
- **List** — every match, joined by a delimiter (default `$&\n`).
- **Details** — groups for the selected match.
- **Explain** — a walk through each token in the expression.

**Copy result** copies whatever Replace or List is showing.

## Recents and a friend

**Keep** stores this pattern under Recents in this file. The current pattern and text come back the next time you open it.

Press **Invite** in the bar above and send the link. Whoever opens it is on the **same pattern and text** — when they type, you see it.

**Sample** puts back the original capitalized-word pattern.

Unofficial port of [RegExr](https://regexr.com) by Grant Skinner / gskinner.com.
