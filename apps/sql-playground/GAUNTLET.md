A stranger who knows DB Browser or sql.js.org would use this copy because the database is the file — close it and the tables are still there, send Invite and someone else is in the same database, and it runs on a plane with no install.

## Bars

- **ONE:** DB Browser for SQLite / sql.js.org GUI. Schema list, SQL box, results grid, open/save a .sqlite. Floor, not ceiling: sql.js.org forgets the database when the tab closes; DB Browser needs an install.
- **TWO:** The database lives in the GIF. Invite shares it live. Works offline.

## Pieces

| piece | bar | status |
|---|---|---|
| Icon | reads as a query filling a table at 64px | round 2 — bars, not 1px glyphs |
| Store art | mid-query join with real rows, schema visible | round 2 — rows match ORDER BY minutes |
| Listing copy | leads with file-is-the-save + Invite | round 1 |
| Schema list | tables, columns, counts; tap to SELECT | round 1 |
| Query + results | Run, Explain, chips, errors named, timing | round 1 |
| Sample shop | tiny Chinook, joins work on first run | round 1 |
| Persist | sqlite bytes in the file collection | round 1 |
| Invite | read-write shared database | round 1 |
| Phone | Tables drawer, 42px buttons, Back closes it | round 1 |

## Remaining gap

No browse-data grid editor (DB Browser’s “Browse Data” tab). Query-and-results is the product; cell-in-place edit is the next climb if a stranger still picks the desktop app for that reason.

Round 3: guest first-load waits on `gifos.info()` so it cannot overwrite the host’s database with the sample.
