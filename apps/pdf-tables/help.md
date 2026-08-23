# PDF Tables → Excel

Turn a **text-based PDF** into an Excel workbook — one sheet per page — on this device. Nothing is uploaded.

It was built for **SERFF** insurance rate and rule filings: those PDFs are exported from actuarial software, so the numbers are real text sitting in real places. The grid is rebuilt **exactly**, not guessed from a picture.

A normal text PDF works the same way. A scan does not.

## Drop a file

- **Computer:** drag a `.pdf` onto the dashed box, or click the box and choose one.
- **Phone:** tap the box and pick a PDF from Files.

The status line tells you which page it is reading. When it is done you get a preview (first twelve rows of each page) and **Download .xlsx** lights up.

## What you get

- One Excel sheet per PDF page, named `Page 1`, `Page 2`, …
- The download is `your-filename.xlsx`.
- Rows and columns come from where the text sat on the page — left edges that line up become columns; similar heights become rows.
- Empty-looking pages are skipped. Only pages with table-shaped text become sheets.

The preview is a peek. The spreadsheet has **every** row, not just the twelve on screen.

## Scanned pages

If the PDF is only a picture of a page, there is no text to read. The app says so instead of handing you an empty sheet.

Install the sibling **Scanned PDF Tables → Excel** from the store for those. This app stays the small, exact one.

## What it will not do

- Merged or nested cells become a flat, aligned grid. Spanning headers may split across columns.
- A table that crosses a page break becomes two sheets, not one.
- There is no page-range picker and no CSV button.
- Handwriting, stamps, and photos of paper are scans — they need the sibling app.

## Private vs shared

The PDF you drop and the Excel you download **never leave this device**. Nothing is saved inside the app: drop the file again to retry.

**Invite** in the bar above does not share a document. This is a tool for this computer, not a live room.
