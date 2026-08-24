# Pivot

Rearrange a table by putting field names on **rows** and **columns**. Counts, sums, and lists fill the cells. Nothing is uploaded.

## Start

The app opens on a baked sample (Canadian Members of Parliament: name, party, province, age, gender). Province on rows and Party on columns counts seats.

To use your own numbers:

1. **Paste** comma-separated or tab-separated text into the box, or
2. **Choose a CSV** with the button, or put a `.csv` / `.tsv` file on the page.

The first row is the header. Quotes around commas are fine. An Excel workbook (`.xlsx`) will not read — save it as CSV first.

A missing header, a header with no data rows, or a file that is not a table gets a plain error instead of an empty grid.

## The grid

- Unused fields sit in the **pool** at the top of the original grid.
- On a **computer**, drag a field onto **rows** (left) or **columns** (top). Drag it back to the pool to drop it. Click a field name to **filter** values (tick boxes).
- On a **phone**, pick a role for each field from the menus: Unused, Rows, Columns, or Values. Dragging still works in some browsers; if a drag does nothing, use the menus.
- **Summarise** picks the aggregator (Count, Sum, Average, list unique values…) and **View** picks Table, Heatmap, Row Heatmap, Col Heatmap, Table Barchart, or TSV Export.
- **Copy table** copies the current grid as tab-separated text.

**Reset sample** puts the MP table back. **New blank** clears down to a header so you can type.

## What is saved

The last CSV and the last arrangement (which fields are on which axis, filters, aggregator, view) live in this file on this device. They come back the next time you open it.

Unofficial port of [PivotTable.js](https://github.com/nicolaskruchten/pivottable) by Nicolas Kruchten.
