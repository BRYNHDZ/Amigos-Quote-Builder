# Mid-Year Property Plan Starts — Shipped

**Status:** Done and live. Merged to `main` as `562ddf1` and deployed to GitHub Pages.

**Branch state:** `plan-prorate` is merged. Working tree should be on `main` now (switched back per user's request after deploy went live).

---

## What shipped this session

Plan view (Property Plan — 5% off) now supports mid-year sign-ups via a new **Plan start month** dropdown that lives between the Per-Visit/Plan toggle and the main columns.

**The math model (Brayan's framing):**

> Mowing's the only thing prorated for the visits left. Everything else — mulch, aeration, cleanup, leaf — stays full price because you get the same job. Total's $X, split across the N months until March. Snow stays at full per-visit price either way.

**Implementation:**

1. **`ST.planStartMonth`** added to state (default `3` = March = full annual cycle).
2. **`planMonths()`** helper — returns `15 - m` if m ≥ 3 else `3 - m`. Default 12 when not in plan view.
3. **`setPlanStart(m)`** — sets the start month AND auto-fills `ST.visitsRemain` from a hardcoded lookup (weekly cuts, season ends end of Nov). Writes both to state and to the visible `#iVr` input. User can override the visits field manually after.
4. **Visits lookup** (`PLAN_VISITS_BY_START_MONTH`): `{3:35, 4:30, 5:26, 6:22, 7:17, 8:13, 9:8, 10:4, 11:1, 12:0, 1:0, 2:0}`.
5. **Monthly divisor** changed from hardcoded `/12` to `/planMonths()` in three places: `moOrCut` denom, plan total monthly, plan-equiv monthly, buffer monthly. Per-visit view still divides by 12 (because planMonths returns 12 when not in plan view).
6. **Snow excluded from plan discount.** Removed `H1, H2, H3, H4` from `PLAN_SVCS`. Snow services charge the same per-visit price whether the customer is on the plan or not. Originally Brayan picked "prorate snow by Nov–Mar months remaining," but on second pass he decided the 5% plan discount on snow is too small to bother with and the prepay structure is the real plan value — so snow gets no plan discount at all.
7. **Hint line** in the plan-start row shows `· N months until March · M mowing visits`.

**Visibility wiring:** `setMode` and `setRecView` both toggle `#planStartRow` display so it only appears in `recurring + plan` view.

---

## What was scrapped / deferred

- **Free aeration as a mid-year sign-up perk.** Brayan likes the idea but isn't sure yet whether to commit to free aeration vs another free service. Deferred — not built. If/when he wants it, the simplest implementation is a toggle in the plan-start row that subtracts one B1 or B2 (lower-priced if both selected) from the plan annual total before the monthly divisor.
- **Snow proration.** First built with 5-month Nov–Mar season giving 0.80 for any Apr–Nov start (which Brayan flagged as wrong — June should be 1.0). Recalibrated to 4-month Nov–Feb with Mar–Nov = 1.0, Dec/Jan/Feb prorating. Then scrapped entirely a beat later because Brayan decided snow doesn't get a plan discount in any case.
- **Month-free promo.** Brayan asked "can I do a month free for mid-year joins?" Talked through why a flat 1-month discount scales backwards (the closer to season end someone joins, the bigger the relative discount → late joiners become unprofitable). He moved on to "free aeration" as the better-shaped sign-up incentive — see above.

---

## Customer-facing copy (drafted this session, NOT in the code)

Brayan asked for paste-ready Jobber language to explain the mid-year cycle to customers. He'll keep these as a template he swaps into quotes manually.

**"How Your Plan Works" block:**

> Our plans normally run March through February and renew each March — but since you're joining mid-year, your first cycle is shorter. The total cost of your services is divided evenly across the remaining months. **[N] equal monthly payments, [Start Month] through February.**
>
> At March renewal, your monthly bill is recalculated for the full 12-month cycle.

**Bottom-of-quote terms line:**

> This monthly amount is billed [N] times — [Start Month] through February.

Two swaps in both blocks: `[N]` (installment count) and `[Start Month]` (spelled out). Anchors to the line-item amount Jobber displays (which IS the monthly, not a sum being split) — important: don't reframe "total" as something divided across installments, that wording reads like the line item is the annual.

Brayan may turn the long-form explanation into a VSL later; the quote copy stays factual/contract-feel.

---

## Locked decisions (lock these in)

- **Cycle = March → following February.** 12-month standard. Last payment is February regardless of when they joined.
- **`planMonths()` formula:** `m ≥ 3 ? 15 - m : 3 - m`. Returns 12 for March, 1 for Feb, etc.
- **Snow is never discounted.** No 5% plan discount on H1/H2/H3/H4. No mid-year proration on snow.
- **Mowing is the only service that prorates for mid-year.** Via existing `visits/35` factor — no new code, just auto-filled visits.
- **Auto-fill writes to BOTH `ST.visitsRemain` and the visible input.** User can manually edit after — they're effectively the same field, with start month as a "smart default."

---

## What's NOT done on this branch (still pending)

- **The big flow overhaul** from `2026-05-17-flow-overhaul-WIP-handoff.md` is STILL untouched. Three-card progressive design (Property / Services / Quote), side-by-side per-visit/plan, decluttered output panel — none of it. Branch `flow-overhaul` lives on with its small polish commits + the visual-dials work that already merged to main. Brayan keeps picking off smaller polish work instead of tackling the overhaul.

---

## Pick up here (for next session)

Most likely next moves:

1. **Build the free-aeration sign-up perk** if Brayan decides to commit to it. Implementation note above.
2. **Continue dial-polish work on `main`** — trim density is still a text-only segmented control (`Light / Standard / Dense`) and is the obvious next-up if the visual-dial pattern keeps landing. (Note: this lives in the dynamic render at `index.html:355` area, similar setup to the weed pressure dial.)
3. **The big flow overhaul** from the May 17 handoff. Brayan's not in a rush but it's the largest unbuilt item.
4. **Renewal math sanity check.** At March renewal, the plan recalculates. Today the code just resets `planStartMonth` back to 3 implicitly if the user changes the dropdown to March. There's no actual "this is a renewal" flow — Brayan just resets the form and re-quotes. If renewals become frequent, a "save customer / recall" feature would help.

Don't pre-empt — ask Brayan which direction.

---

## File pointers

- Current code: `index.html` (single file, vanilla HTML/JS)
- Design spec (this session): `docs/superpowers/specs/2026-05-30-plan-start-month-prorate-design.md`
- Prior handoffs:
  - `docs/superpowers/handoffs/2026-05-27-visual-dials-handoff.md` (visual dials + Flower Bed Refresh priority)
  - `docs/superpowers/handoffs/2026-05-17-flow-overhaul-WIP-handoff.md` (big overhaul still pending)
- This handoff: `docs/superpowers/handoffs/2026-05-30-plan-prorate-handoff.md`
- Live site: https://brynhdz.github.io/Amigos-Quote-Builder/ (deploys from `main`, GitHub Pages)
- Branches:
  - `main` — production (this session's work is merged in)
  - `plan-prorate` — merged, can be deleted or kept for reference
  - `flow-overhaul` — older feature branch, has unmerged polish + the WIP big-overhaul handoff

---

## How to resume the conversation

```
User: "let's keep going on the quote builder"
You:  Read this handoff + the 2026-05-17 flow-overhaul-WIP handoff (still load-bearing).
      Summarize in 2 lines: "Last session shipped the mid-year Property Plan start month
      dropdown. Free-aeration sign-up perk and the big flow overhaul are still pending.
      Trim density is the next obvious dial-polish if you want to keep that pattern going.
      Which direction?"
      Wait for answer.
```
