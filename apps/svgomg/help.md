# SVGOMG

Make an SVG picture smaller, on this device.

Drop a file, paste markup, or tap **Demo** for the included car. Toggle clean-up steps, watch the picture and the size change, then **Download** or **Copy**.

## Open a picture

- **Drop an SVG** onto the page, or tap the drop zone / **Open SVG** to pick a file.
- **Paste markup** opens a box. Paste `<svg …>` and tap **Use this**. You can also paste an SVG from the clipboard anywhere except a text field.
- **Demo** loads a sample so you can try the steps without a file of your own.
- Ctrl/⌘ O opens the file picker.

If it does not look like an SVG, the app says so and leaves the last picture alone.

## Preview

- **Image** shows the picture. **Markup** shows the cleaned source.
- **Background** cycles checkerboard, white, and dark so thin strokes stay visible.
- **Show original** displays the file you opened, without cleaning.
- The size line is before → after plus a percent. **Compare gzipped** uses compressed sizes (what a web server would send). Turn it off for raw file size.

A bigger result is possible — some steps, or **Prettify markup**, can grow a tiny file. The percent turns red when that happens.

## Clean-up steps

**Global settings**

- **Prettify markup** — indented source (usually larger, easier to read).
- **Multipass** — run the cleaner more than once. Slower, sometimes smaller.
- **Number precision** and **Transform precision** — how many decimal places to keep. Lower is smaller and coarser.

**Features** is the list of steps (remove comments, round numbers, merge paths, and so on). The defaults are a sensible set. Turn one off if a picture looks wrong after cleaning — a missing `viewBox`, stripped IDs, or a discarded raster image is usually a step you can undo with a toggle.

**Reset all** restores the default steps and precision. It does not close the picture.

## Download

- **Download** saves the cleaned SVG under the same name.
- **Copy** puts the markup on the clipboard.

The picture stays on this device.

## Invite and save

This is a solo tool. **Invite** in the bar above the app does not share the picture you dropped in.

Which steps you chose, gzip / pretty / multipass, and the precision sliders stay in this file so the next picture starts where you left off. The SVG itself is not saved here — download it if you want to keep it.

Unofficial port of [SVGOMG](https://github.com/jakearchibald/svgomg) by jakearchibald.
