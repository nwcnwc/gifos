# Contrast Ratio

Check whether **text can be read** on a colour. Type two colours. The number in the circle is the contrast: **bigger is easier to read**.

## The loop

1. Put the **page colour** in **Background**.
2. Put the **word colour** in **Text color**.
3. Read the circle, then the sentence under it.

You can type a name (`white`, `black`, `rebeccapurple`), a hex (`#333` or `333`), `rgb()`, `hsl()`, or `hsla()` with a see-through amount. The little swatch next to each box is a colour picker.

**Swap colors** flips the pair.

The sample paragraph on the left paints in those two colours so you can *see* the verdict, not only read it.

## What the circle means

The circle’s colour is the verdict:

- **Red** — too close. Ordinary text fails.
- **Amber** — only good enough for **large** type (about 18pt, or bold 14pt) and for icons.
- **Yellow-green** — ordinary text is fine (**AA**).
- **Green** — the strict level (**AAA**) for any size.

The sentence under the circle spells that out. A second number is the exact ratio (or a range, if a colour is see-through).

When a colour is **see-through**, the number is a range, because what sits underneath changes the result. The circle may split into more than one colour; the list below names each case.

Each box also shows **luminance** — how light that colour is on its own.

## Private vs Invite

The last pair you typed comes back the next time you open the app.

This app has no shared board. **Invite** in the bar above the app shares the app itself, not the colours you typed.

## Credit

Unofficial port of [contrast-ratio](https://github.com/siege-media/contrast-ratio) by siege-media, from the checker Lea Verou first wrote.
