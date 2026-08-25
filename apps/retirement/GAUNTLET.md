# Retirement Calculator gauntlet

Comp (bar ONE): **FI Calc** (ficalc.app) as the free-tool floor — the modern one
the FIRE community actually uses — with **FIRECalc** as the thing it replaced,
**cFIREsim** for input depth, **Engaging Data's "Rich, Broke or Dead?"** as the
visual bar, and **ProjectionLab** ($129/yr) as the polish bar.

Bar TWO: GifOS — offline, no account, the file IS the save, one Invite and two
people plan together, nothing uploaded.

---

## Round 0 — setting the bars (2026-08-25)

Read the field before writing a line of the app. Two research sweeps: what the
community actually links to and why, and what the underlying papers actually
say.

### Where the field is weak

The gaps are stated by the community, unprompted, and by the tool authors
themselves.

- **First-result latency.** Every serious planner takes 20–60 minutes before it
  says anything. A product engineer's note to the cFIREsim author, upvoted and
  seconded: *"don't make people enter 30 things before demonstrating value. Let
  them enter 6 things, get value, and then some will want to keep going."*
- **Mobile.** FIRECalc ships **no viewport meta tag at all**. "Rich, Broke or
  Dead?" drops its x-axis label on small screens. ProjectionLab is PWA-only. The
  cFIREsim author: *"I don't test things on mobile often enough. I feel like
  these apps are 'big screen' activities lol."*
- **The number is a score, not a strategy.** Income Lab's own framing, and they
  cite that most advisers say a probability of success *creates* anxiety in a
  downturn. TPAW's homepage attacks the same thing: pass/fail *"treats coming up
  short by \$1 in the last year of life the same as going broke midway through
  retirement."*
- **Signup walls.** *"google auth, however, is a hard-no from me."*
- **Black-box distrust** is the top reason people churn off paid planners:
  *"because I can't see under the hood… I don't really trust the numbers."*
- **Nothing is local-first, modern AND saveable at once.** ProjectionLab's free
  mode is local-first but *deliberately cannot persist*. That is the open ground,
  and GifOS occupies it by construction.

### And where it is strong — what we have to beat

- FI Calc: 12 withdrawal strategies, colour-vision-deficiency palettes, Web
  Worker, URL state, a two-question "Help Me Choose".
- Engaging Data: the stacked mortality area is the most-shared, most emotionally
  effective picture in the category.
- ProjectionLab: a year-scrubbable cash-flow Sankey nobody else has.
- TPAW: ends with **"Tasks for This Month"** — the only actionable output in the
  field, and buried under the graphs.

**The sentence to earn:** *it opens with an answer, it tells you what to change,
and it never asks who you are.*

---

## Round 1 — the engine (2026-08-25)

Shiller's monthly record vendored inside the GIF, 1871-01 to 2026-08. Columns 9
and 18 — **real TOTAL return**, not price. Checked against the record:

| | |
| --- | --- |
| stock real CAGR 1871–2026 | 7.11% |
| bond real CAGR | 2.38% |
| 1929-09 → 1932-06 | −76.8% |
| 1966-01 → 1982-07 | −26.1% |
| 4% / 30y / 75-25 | **98.2%** over 1,508 monthly cohorts |
| SAFEMAX 75/25 30y | 3.81% |
| worst 30-year cohort | **January 1966** |

An independent computation from the same data (annual, start-of-year) got 97.6%
and 3.78% — the residual is the monthly convention, and 1966 is the right
answer. It beats 1929 because stagflation hurts a *withdrawing* portfolio in a
way a fast crash does not.

**Data freshness beats the field.** Ours runs to 2026-08; FI Calc's bundle stops
at 2024, Engaging Data at 2023.

**Cohort count beats the field.** Monthly start dates give 1,508 thirty-year
retirements against FIRECalc's 126 and cFIREsim's 127.

### Three strategies were wrong, all in the same direction

Each had been copied from a popularization rather than the paper:

- **Vanguard's floor.** Two published numbers, both real: the 2020 paper's body
  and figures use −1.5%; its appendix, the flyer, the 2023 white paper and
  Morningstar's 2025 implementation all use −2.5%. Shipped −2.5% (current spec),
  with both papers named in the comment rather than one asserted.
- **Guyton-Klinger's 6% inflation cap.** Every write-up lists it as one of the
  four rules. The authors **dropped it** — removing it *"increased the purchasing
  power maintained by more than 10 percent without reducing the probability of
  success."* Their headline 5.2–5.6% results do not use it.
- **VPW** was an approximation. Now the real thing — r = stocks×5.0% +
  bonds×1.9%, n = 100 − age, **annuity-due**. Reproduces the published Bogleheads
  table to the decimal across all nine cells checked.

---

## Round 2 — the face and the words (2026-08-25)

Inspected the running GIF in the real sandbox (1280×860 and 390×844), not the
source.

### Icon (Home Screen, 64px)

The app's own picture, in 21 frames: a portfolio climbing through the working
years, a rule where the paycheck starts, then the fan — three futures from the
same savings. Two hold. One bleeds to the axis and stays there, and it is the
only red thing on the icon.

You cannot read a number at 64px. You can read a shape that goes up, splits, and
has one branch on the floor. **It demonstrates rather than wiggles** — which is
the whole test.

### Store art

`screenshot.png` is the app mid-use at 1400×868: the verdict, both solved
numbers, the fan of 1,268 real retirements with a **live tooltip** hanging off
age 81, the reading underneath, and *What would fix it* open below. Shell chrome
is out of frame (iframe-only shot), so no `coverCrop` needed.

Blind against FIRECalc's 920×400 static PNG spaghetti and cFIREsim's Dygraph
pair: **ours**, and not by a hair. Theirs are charts; ours is a chart plus a
verdict plus a list of measured things to do, on one screen. Against
ProjectionLab's marketing stills we lose on Sankey polish and win on "this is
the actual app, at first open, with no account."

### Listing copy

Leads with the reason to use this one: it opens with an answer; nothing leaves
your computer; the file is the save. Then the method, then what it will not do.
Every claim in it is enforced by `build.mjs` — the tax disclaimer and the privacy
sentence are both assertions that fail the build if removed.

### First run, defaults

> **This is tighter than it looks.**
> 90% of 1,268 real retirements made it, against the 95% you asked for. The rest
> ran out — the earliest at 82.
> Could retire at **66** · Could spend a year **\$73.1k**

Then five measured levers, cheapest first, each with **Try it**. That is the
whole thesis in one screen to somebody who has typed nothing.

The defaults land at 90% *on purpose*. The first set reported a serene 100% and
taught a reader that the tool always says yes.

---

## Round 3 — what the render found (2026-08-25)

Nine defects, none of them visible in source:

1. The naming dialog was **on screen at boot** — `display:grid` beats `hidden`.
2. Cards were **wider than the phone** — a grid item defaults to
   `min-width:auto` and will not shrink past min-content.
3. *Where each year's money comes from* drew **25 empty columns** before
   retirement.
4. The worst run was named by the year the **plan** started, not the retirement.
5. *Rich, broke, or gone* was meaningless before retirement — every working year
   scored as "less than you retired with".
6. An axis with **two gridlines**: the nice-number ladder went 1, 2, 5, so a
   range of 81,000 asking for four intervals rounded to a step of 50,000.
7. **`-$0`** — `money()` took the sign before rounding.
8. The two money wedges were one step apart on the blue ramp and could not be
   told apart.
9. The worst-case note recited "January 1966" on a card headed *"if you had
   retired in April 1976"*.

On a phone the answer and the hero chart now sit **above** the inputs: someone
who opens this should see the answer and its shape before they meet an input box.

---

## Where we beat the comp, in one line each

| | |
| --- | --- |
| FIRECalc | mobile at all; a chart you can hover; an answer before you press Submit |
| cFIREsim | the same depth without a wall of form; and a picture people like |
| FI Calc | it ends with what to change; mortality on the same axis; and it is a file, so it works on a plane and the plans travel in it |
| Engaging Data | their chart, plus the whole backtest and the advice around it |
| ProjectionLab / Boldin | no account, no \$129/yr, no 40-minute setup — and the engine is readable |
| all of them | data through 2026-08, 1,508 cohorts instead of ~126, and one Invite link puts two people in the same plans |

## Fresh-eyes sentence

*"I'd open this instead of FIRECalc because it answers before I type anything,
it tells me what to change instead of just scoring me, and the whole thing is one
file I can keep — no account, works on a plane."*

## Remaining gaps

- **No tax.** Same as every free tool in the category, and said plainly — but
  ProjectionLab and Pralana model it, and that is a real difference.
- **No spending smile.** Blanchett's finding that real spending falls ~1–2%/yr
  through retirement raises the safe rate from 4.03% to 4.73%. Evidenced,
  implementable, not built.
- **No two-person model.** A named structural gap nobody free fills: partners who
  retire at different ages. The Invite makes two people *plan together*, which is
  a different thing.
- **No CAPE-based strategy.** ERN's `WR = 1.75% + 0.5/CAPE`. Worth noting only
  one historical cohort ever began with CAPE above 25, and today's is 41.
- Compare is two plans, not N.
- The Invite path is wired and unit-proven, but has not been driven through two
  live browsers in this run.
