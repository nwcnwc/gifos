# Cron Speak

Type a **cron expression**. The app says it in **English**. Nothing is uploaded.

A cron expression is five fields, in order:

`minute  hour  day-of-month  month  day-of-week`

Examples: `0 9 * * 1-5` is weekday mornings at 9. `*/5 * * * *` is every five minutes. `0 0 1 * *` is midnight on the first of the month.

## Translate

1. Type (or tap a chip) in the box.
2. Read the sentence.

**24-hour time** says 17:00 instead of 5:00 PM. **Verbose** spells the sentence out a little more. **Sunday = 0** is the usual Unix numbering (0 or 7 is Sunday); turn it off if your scheduler treats 1 as Sunday.

A red note appears if the expression cannot be read. Specials like `@daily` and `@hourly` work too.

## What is saved

The last expression and the two options stay in this file on this device.

Press **Invite** in the bar above the app to show a **read-only** view of the same sentence in a meeting. People who join see it. They do not type over it.

Unofficial port of [cRonstrue](https://github.com/bradymholt/cRonstrue) by bradymholt. English only.
