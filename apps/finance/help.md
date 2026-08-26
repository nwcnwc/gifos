# Financial Tracker

Every account you have, in one place, on your own computer.

## Start with the list, not the numbers

Tap **＋ Add an account** for every place you keep money — and for the things
no bank will ever tell you about: the house, the car, what you still owe on
both, the pension you never look at, money a friend owes you.

Give each one a **link to log in**. It is the humblest thing on the screen and
the one you will use most: fifty institutions is fifty bookmarks nobody has,
and the reason a balance goes stale is almost never unwillingness — it is not
remembering where the login was.

The balance is optional. A list of where your money is, with no numbers in it
at all, is already worth more than nothing, and the numbers can catch up.

## Getting the numbers in

### A CSV from anywhere

Every bank exports one. Look for **Download**, **Export** or **Statements**,
pick CSV, and drop the file on the **Import** screen.

It reads the file and works out which column is which, which way round the
dates are, and whether money going out is written as a negative number or a
positive one. **Every one of those guesses is shown to you as something you
can change** before a single row is saved, and the first few rows are drawn
exactly as they will be stored. If money you spent is not red in that preview,
something is wrong — fix it there.

Two things worth knowing:

- **Import the same file twice and nothing is duplicated.** Overlapping
  exports are the normal case, because most banks only offer "the last 90
  days" and nobody downloads on an exact schedule. You are told both numbers —
  "142 added, 89 already here".
- **Dates like 03/04/2026 mean two different days.** If the file contains any
  date that can only be read one way, that settles it and nothing is said. If
  it genuinely does not — every date in it works both ways — you are told, and
  asked to check one against your statement. It is the only wrong guess that
  produces numbers that look completely fine.

### SimpleFIN, for balances that arrive on their own

SimpleFIN is the service that appeared after Mint closed, and it is the only
one of its kind that works on a computer with no server. You connect your
banks at a SimpleFIN server, it hands you a token once, and after that this
app can ask for your balances.

1. Set up your connection at a SimpleFIN server and copy the **access URL** it
   gives you after you claim your token.
2. In GifOS, open **Settings → Third-party APIs** and add one named
   **simplefin**. Paste the whole access URL into the Base URL box —
   credentials and all — and GifOS will split it correctly. Tap **Test & save**.
3. Back here, tap **↻ Refresh from SimpleFIN**.

This app never sees that credential. GifOS holds it, attaches it, and only ever
sends it to that one address.

Everything works without it. CSV import covers every institution there is;
SimpleFIN just means you type less.

## Save today's figure

Balances get overwritten every time you refresh. So unless today's net worth is
written down **today**, it is gone for good — there is no way to work out
later what you were worth last March.

**Save today's figure** on the Accounts screen writes it down. Do it whenever
the balances look right; once a month is plenty. The **History** chart is
built from those, and needs at least two.

## Money in, money out

The **Money** screen shows what arrived and what left, month by month.

Money you moved **between your own accounts** is found and left out. Without
that, paying a credit card would show up as spending, moving savings would show
up as income, and your savings rate would be nonsense. Every pair it found is
listed on that screen — have a look at them, because those matches decide every
other figure there.

Part months are drawn faded and left out of the averages. A month you have
eleven days of is not a month you spent that little in.

## Handing it to the Retirement Calculator

The **Plan** screen works out the numbers the Retirement Calculator opens by
asking for, and hands them straight over — so it opens on your actual situation
instead of six guesses.

It keeps two things apart that a net worth adds together: what you could
actually retire on (cash, brokerage, retirement accounts) and what you merely
own (the house, the car). You cannot eat a third of a kitchen a year.

Yearly spending and saving need **at least three complete months** of
transactions. Under that it says so rather than guessing — a yearly figure
extrapolated from one statement is a guess wearing a number's clothes. The
balance-sheet figures are ready immediately.

GifOS shows you the whole summary and asks before anything moves, every time.
It stays on this computer.

## What it does not do

- **It does not categorise your spending.** Rules you write are the honest
  version of that and are not built yet.
- **It does not do multiple currencies.** It records the currency of an
  account, but net worth assumes one.
- **It does not know about tax.**
- **It never asks for a bank password**, and there is no version of this app
  that will.
