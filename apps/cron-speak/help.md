# Cron Speak

Type a **cron expression**. The app says it in **English**, names each field, and lists the **next times** it fires.

A cron expression is five fields, in order:

`minute  hour  day-of-month  month  day-of-week`

Examples: `0 9 * * 1-5` is weekday mornings at 9. `*/5 * * * *` is every five minutes. `0 0 1 * *` is midnight on the first of the month.

## Translate

1. Type (or tap a chip) in the box.
2. Read the sentence.
3. Tap a **field** under the box to see what that slot means, and pick a common value.
4. **Next times** are the next five clock times this expression matches, on this device.

A red note appears if the expression cannot be read — too few fields, a number out of range, an unknown `@special`. Empty is empty, not an error. Specials like `@daily` and `@hourly` work. `@reboot` is honest: next boot, not a clock time.

**24-hour time** says 17:00 instead of 5:00 PM. **Verbose** spells the sentence out a little more. **Sunday = 0** is the usual Unix numbering (0 or 7 is Sunday); turn it off if your scheduler treats 1 as Sunday.

## What is saved

The last expression, the options, and a short history stay in this file on this device.

Press **Invite** in the bar above the app to show a **read-only** view of the same sentence in a meeting. People who join see it. They do not type over it.

Unofficial port of [cRonstrue](https://github.com/bradymholt/cRonstrue) by bradymholt. English only.
