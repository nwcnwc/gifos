# Financial Tracker

Every account you have, in one place, on your own computer. Any bank's CSV,
SimpleFIN for the ones it covers, net worth over time, and a handoff to the
Retirement Calculator.

Built into `site/apps/finance/finance.gif` by `node apps/finance/build.mjs`.

## Why this is not a Provider app

The obvious design — one Provider per institution, a Bank of America GIF that
logs in and serves `finance.*` to every other app — is the wrong shape, and it
is worth writing down why, because it is attractive enough to be proposed
again. The full argument is `docs/roadmap.md` §21; the short version:

- `gifos.fetch` sends `credentials: 'omit'`, deliberately. An allow-listed
  bank host would be reached as an anonymous stranger, never as you.
- Banks send no CORS headers, so even the trusted OS page is blocked.
- A `provides` manifest may not declare `network` or `api` at all — refused
  mechanically, and a credential-holding bank provider is the exact machine
  that rule exists to prevent.
- Scraping is a treadmill: MFA, push approval, device fingerprinting and bot
  detection are a large part of why Intuit shut Mint down rather than fix it.

So: CSV, which every institution exports and which involves no login, plus
SimpleFIN, which is the only aggregator in its class that fits a computer with
no server of its own.

## The files

| file | what it is |
|------|------------|
| `csv.js` | the dialect sniffer. Pure. Finds the header, works out the date order, the decimal separator and the sign convention, and reports every guess instead of applying it silently. |
| `model.js` | accounts, net worth, the deduplicating ledger, transfer matching, and the plan derivation. Pure. |
| `simplefin.js` | one call, both response shapes. Never sees the credential — it goes through `gifos.api`. |
| `chart.js` | net worth over time, and money in/out per month. SVG strings. |
| `app.js` | the five screens. |
| `build.mjs` | packs the GIF, and holds the sniffer to six real bank dialects. |
| `icon.mjs` | the animation, and the ink measurement that keeps it from being blank. |

## The four things that were hard

**The header is not row 0.** Banks print an account name, a date range and a
blank line above the columns. The header is found — the first row that looks
like column names — not assumed.

**03/04/2026 is two different days.** The whole date column is scanned for a
value that can only be read one way. If one exists it settles the file
silently. If none does, the ambiguity is *reported*, because this is the only
wrong guess that produces output which looks entirely correct: every date lands
in a real month, just the wrong one.

**Money out is sometimes a positive number.** Three conventions are live: one
signed Amount column; separate Debit and Credit columns; and an Amount column
of magnitudes whose sign lives in a neighbouring DR/CR column. Credit cards
invert the lot — a purchase is a positive number that makes you poorer — and
the app warns when a file on a liability account is overwhelmingly positive.

**Transfers are the whole ballgame.** Move $1,000 from checking to a brokerage
and a naive reading books $1,000 of income and $1,000 of spending in the same
month; both figures are then wrong, in opposite directions, and the savings
rate that falls out of them is meaningless. Pairs are matched on amount and
date across *different* accounts, deliberately not on description — "ONLINE
TRANSFER" and "PAYMENT THANK YOU" are the same event written by two banks that
have never spoken. The cost is a rare false positive, which is why every pair
found is listed on the screen that quotes the savings rate.

## The bar under it

`build.mjs` will not produce a GIF unless the sniffer still reads six real
dialects correctly (title block, DR/CR column, split debit/credit, day-first
dates, semicolons with a decimal comma, and a card written backwards), the
transfer matcher still excludes twelve monthly transfers from a twelve-month
ledger, `derivePlan` still refuses to give a yearly figure from two months of
data, and re-importing an identical file still adds nothing while keeping two
identical coffees bought on one day.

A sniffer regression is otherwise completely silent, and shows up months later
as a wrong year of spending.
