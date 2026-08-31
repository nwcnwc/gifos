# RAWGraphs

Turn a table into a picture. Paste numbers, pick a visual model, map columns onto it.

## Start

The app opens on a baked sample of recent prize films (studio, genre, year, budget, box office, origin) drawn as an **alluvial diagram**: origin → studio → genre, sized by box office.

To use your own numbers:

1. **Paste** comma-separated or tab-separated text, or
2. **Choose a CSV**.

The first row is the header. Quotes around commas are fine. An Excel workbook (`.xlsx`) will not read — save it as CSV first.

## Pick a chart

Tap a type. This copy has the models RAWGraphs is for, not only bars:

- **Alluvial diagram** — how the same rows regroup across categories
- **Treemap**, **circle packing**, **sunburst** — nested amounts
- **Bar** and **stacked bar** — a category and an amount (bars grow sideways)
- **Line**, **bump**, **streamgraph** — a value or a rank over an ordered axis
- **Bubble chart**, **beeswarm**, **pie**

## Map columns

Each chart asks for visual variables. **Steps** on an alluvial wants two or more columns. **Size** is a number; leave it empty and every row counts as one. **Hierarchy** is one or more columns from coarse to fine.

On a phone, **Data / Type / Map / Chart** swap so the keyboard does not cover the picture. Back steps out of those.

## Copy SVG

**Copy SVG** puts the current picture on the clipboard as vector markup, ready for a drawing app.

## Play together

Working alone is the original wrap. The last table and the last mapping stay on this device.

Want a friend looking at the same chart? Press **Play together**, then send the link from the bar above. When anyone remaps a field or pastes a new table, everyone gets the new picture.

**← Solo** puts you back on the original wrap with the chart you left.

## What is saved

The last CSV, the chart type, and the column mapping live in this file. Close it, come back, they are still there.

Unofficial port of [RAWGraphs](https://rawgraphs.io) by DensityDesign Lab, Calibro and INMAGIK.
