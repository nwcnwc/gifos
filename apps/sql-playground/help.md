# SQL Playground

A SQLite database you can query on this device. The tables stay in this file. Nothing is uploaded.

A tiny **music shop** is already loaded the first time: artists, albums, tracks, customers, invoices, and invoice lines. Join them. Change them. They come back next time you open the app.

## Run a query

Type SQL in the box. **Run** executes it (**Ctrl+Enter** or **Cmd+Enter**). Several statements in one go are fine — each `SELECT` gets its own result table.

**Explain** shows SQLite’s query plan for whatever is in the box, without changing the data.

Tap a table name in the schema list to `SELECT` from it. Tap a chip under the box for a ready-made join.

A statement that fails is named as SQLite named it. It is not rewritten.

## Jobs

1. Open the app. The sample shop is there until you replace it.
2. Run a `SELECT`, or an `INSERT` / `UPDATE` / `CREATE`.
3. **Open** reads a `.sqlite` / `.db` file from this device. **Save** writes one out. **Sample** puts the music shop back. **New** starts empty.
4. Close the app. The database is already saved.

On a phone, **Tables** opens the schema list. Back closes it.

## What is saved

The whole database lives in this file on this device. Sharing the file shares the tables. In a live session, everyone is looking at the same database — a query that writes is live for the others.

Unofficial port of [sql.js](https://github.com/sql-js/sql.js). SQLite is public domain.
