# Pivot

Rearrange a table by dragging field names onto **rows** and **columns**. Counts, sums, and lists fill the cells. Nothing is uploaded.

## Start

The app opens on a baked sample (Canadian Members of Parliament: name, party, province, age, gender). Drag **Province** onto rows and **Party** onto columns to see a count of seats.

To use your own numbers:

1. **Paste** comma-separated text into the box, or
2. **Drop** a `.csv` file onto the page, or
3. **Choose a file** with the button.

The first row is the header. Quotes around commas are fine.

## The grid

- Unused fields sit in the **pool** at the top.
- Drag a field onto **rows** (left) or **columns** (top).
- Drag it back to the pool to drop it.
- Click a field name to **filter** values (tick boxes).
- The menu in the top-left picks the **aggregator** (Count, Sum, Average, list unique values…) and which number column it uses.
- The other menu picks the **view**: Table, Table Heatmap, Col Heatmap, Row Heatmap, or TSV Export.

On a phone, drag still works (the grid is the original, with a touch helper).

**Reset sample** puts the MP table back. **New blank** clears the paste box so you can type.

## What is saved

The last CSV and the last arrangement (which fields are on which axis, filters, aggregator, view) live in this file on this device. They come back the next time you open it.

Unofficial port of [PivotTable.js](https://github.com/nicolaskruchten/pivottable) by Nicolas Kruchten.
