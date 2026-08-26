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

Defects invisible in source, every one caught by looking at the running app:

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
8. The two money wedges were one step apart on the blue ramp and indistinguishable.
9. The worst-case note recited "January 1966" on a card headed *"if you had
   retired in April 1976"*.
10. **Every redraw APPENDED a chart.** `Frame()` added its SVG without emptying
    the host, and `clear()` only emptied the SVG's own children — a different
    thing that looks identical in source. The app grew a second copy of its hero
    chart the moment anybody changed an input. Found by clicking *Add college*
    and seeing two fan charts stacked in one card.

On a phone the answer and the hero chart now sit **above** the inputs.

---

## Round 4 — the harsh critics (2026-08-25)

Three critics with fresh context, none of whom read the source's reasoning.

### The icon — VERDICT: FAILED

Measured, not asserted: marks covered **10.3%** of the tile at their fullest
against the 30–50% a working glyph carries; the upper-left 40% was empty in
every frame; strokes were hairlines that merged at 64px; and the loop opened by
growing a line from a single dot, so **a third of every 1.9 seconds the icon was
a blank black square**.

Rebuilt: the spread is a **filled wedge** (mass is what survives 64px), every
mark is drawn in every frame, the plot runs corner to corner, and the only thing
that moves is a marker running down the branch that fails. **28.9–29.1% ink in
every frame.** `build.mjs` now refuses a GIF below 24%, because "it looks better
now" is not something a future edit can be held to.

### The store art — VERDICT: FAILED, last of nine

Rendered at the 248px the card actually uses, nothing read. The catalog's house
style, visible once you render twenty covers at real size, is *one big
high-contrast object* — jspaint's house, civiclock's city, contrast-ratio's
giant figure. A dense full-desktop screenshot is a 5.6× reduction and every
piece of type lands under 4px.

Reshot at **840 CSS px** — below the app's own two-column breakpoint, so no
input rail — clipped to the verdict plus the fan, landing at 1.55:1 against the
card's 16/10. Type is 3.4× down instead of 5.6×.

### The adversarial numbers audit — 12 defects, engine clean

The auditor rebuilt the engine from scratch and reproduced it **to the run** —
27 failures of 1,508 at 4%/30y/75-25, identical at every allocation. The
arithmetic was right. Almost everything wrong was a **sentence**:

- **The advice was measured on a third of history and asserted about all of it.**
  Searching sampled every third cycle; the app then printed "bringing the budget
  to $73,000 is the smallest change that clears 95%". False in **69% of 84
  audited plans**. Rounding to the nearest $100 could round *up* past the edge
  the search had just found. Answers are settled at full resolution now.
- **"Your money lasted every single time" fired with a failure in it** — the
  branch tested `rate >= 0.999`, and 1 in 1,508 is 99.934%.
- **"2% of these retirements have run out"** sat directly beneath a verdict
  saying 10% did — the mortality wedges are *joint* probabilities.
- **"Spend it down" left 36–41% of the portfolio.** A 10% cap I had added
  "prudently" breaks the published VPW table from age 88 and made the strategy's
  own promise false by $358,000.
- **An inheritance arrived a year late** — the lump was applied after the year's
  paycheck had been decided. Fixing it also fixed Guyton-Klinger, which was
  reading house sales as rallies and new roofs as crashes, flipping the sign of
  the return it tests in a third to a half of cohorts.
- **94.96% printed as "95%"** beside an amber dot and "against the 95% you asked
  for".

Plus five smaller: the Depression note contradicted its own card; the mix
suggestion ignored an active glidepath; "the leanest year pays about $0" offered
a failure as the price of flexibility; US Social Security deferral rules were
applied to anything matching "state pension", including the UK one; and an event
dated past the plan's end vanished in silence.

---

## Round 5 — asked for, and missing (2026-08-25)

**College.** Events were single-year lumps, so the most common big outflow
anybody has could only be faked as one enormous payment on one birthday. An
event is a **span** now; `years` defaults to 1, so a one-off is a span of one.
That one field also covers a mortgage, a sabbatical, and years of helping a
parent. On the defaults, four years at $30,000 takes the plan from 90% to 72%
and moves the earliest failure from 82 to 77. The minus-sign convention is gone.

Two bugs came with it: a bill you could not pay left the **stock sleeve
negative** (the second clamp pushed the overdraft back into it, and the plan ran
the rest of its life on a phantom short position), and the chart-stacking bug in
Round 3.

**A light theme.** Selected, not inverted — the light categorical slots are
their own set, validated against `#fcfcfb` as the dark ones were against
`#16161d`. The sharpest case is the two money wedges: on light they must run
`#86b6ef → #2a78d6`, and `#86b6ef` is not an aesthetic pick but the lightest
step that clears 2:1 on white. The dark theme's lighter step measures 1.74:1
there and vanishes. Status colours do **not** theme. One consequence worth
keeping: the JS drew legend swatches and the CSS drew the marks, so there were
two lists of colours that could disagree — there is one now, in the stylesheet.

---

## Round 6 — the Invite, driven for real (2026-08-25)

The listing claims one link puts two people in the same plans. That claim is now
a suite: the host saves two named plans, presses Invite, a guest walks in
through the link and **sees them by name with the host's numbers**, edits one,
and **the host sees the edit**. `prefs` stayed private — the guest's view did not
overwrite the host's — and **neither camera was ever opened**, counted at
`getUserMedia` rather than inferred from a dark grid.

---

## Where we beat the comp, in one line each

| | |
| --- | --- |
| FIRECalc | mobile at all; a chart you can hover; an answer before you press Submit |
| cFIREsim | the same depth without a wall of form; and a picture people like |
| FI Calc | it ends with what to change; mortality on the same axis; and it is a file, so it works on a plane and the plans travel in it |
| Engaging Data | their chart, plus the whole backtest and the advice around it |
| ProjectionLab / Boldin | no account, no $129/yr, no 40-minute setup — and the engine is readable |
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
- **No ACA / healthcare-before-65 model**, which for an early retiree in the US
  is the single biggest number on the page: the 400% FPL subsidy cliff is back
  for 2026, and one dollar of income over it costs a 60-year-old couple about
  $23,400.
- Compare is two plans, not N.
- The store art still has no hero number, which the art critic wanted; the
  counter-argument is that this catalog's rule is *the app at its best moment*,
  not a composed advert. Unresolved — re-judging.
