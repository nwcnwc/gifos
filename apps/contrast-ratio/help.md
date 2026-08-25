# Contrast Ratio

Check whether **text can be read** on a colour. Type two colours. The number in the circle is the contrast: **bigger is easier to read**.

## The loop

1. Put the **page colour** in **Background**.
2. Put the **word colour** in **Text**.
3. Read the circle and the line beside it.

You can type a name (`white`, `black`, `rebeccapurple`), a hex (`#333` or `333`), `rgb()`, `hsl()`, or `hsla()` with a see-through amount. The **swatch** at the left of each box shows the colour and opens a colour picker when you tap it.

The **⇆** button between the two boxes flips the pair.

The panel below the verdict is painted in those two colours, at large size and at ordinary reading size, so you can *see* the answer as well as read it.

## What the circle means

The circle’s colour is the verdict, and the words beside it say the same thing:

- **Red — Fails.** Too close. Not readable at any size.
- **Amber — Large text only.** Good enough above 18pt, or bold above 14pt, and for icons and controls.
- **Yellow-green — Passes AA.** Ordinary text is fine at any size.
- **Green — Passes AAA.** The strict level, at any size.

The small grey line underneath is the detail: the exact ratio, then how light each colour is on its own (its luminance).

When a colour is **see-through**, there is no single answer — what sits underneath changes the result. The verdict then reads **Between 4.75 and 21**, the line beneath names every case it could be, and the circle splits into those colours.

## Private vs Invite

The last pair you typed comes back the next time you open the app.

This app has no shared board. **Invite** in the bar above the app shares the app itself, not the colours you typed.

## Credit

Unofficial port of [contrast-ratio](https://github.com/siege-media/contrast-ratio) by siege-media, from the checker Lea Verou first wrote.
