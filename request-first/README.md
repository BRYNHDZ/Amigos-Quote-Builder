# Request-first quote builder (LIVE as the main builder since Oct 27, 2026)

The main quote builder (root `index.html`) now starts with **"What did they ask for?"**.

- Open the root page — first screen has big picture buttons: **Weekly mowing, Leaf work, Snow, Bushes and garden, Mulch**, and **Everything**.
- Pick one or more, tap **Continue**: only those questions show, and the price updates as you go.
  - **Mowing**: leave clippings or bag them.
  - **Leaf work**: shred, haul away, or **Full clear (Estate)**; every visit or once at the end. Estate and "every visit" need mowing (a button adds it).
  - **Snow**: Standard, Premium or Zero tolerance. Only the driveway/walks size is asked.
  - **Bushes and garden**: three cards (Bushes, Flowers, Flower beds). Questions for bush thickness, ladder, and how many weeds. Items that need mowing or mulch say so and have a "+ Add mowing" / "+ Add mulch" button.
  - **Mulch**: mulch and edging. Asks for mulch yards and bed size.
- **+ Add something else** goes back to the picks. **Show everything** opens the full builder (the same page as today's builder).
- **EN / ES** switch at the top changes all of the new screens, plus the service descriptions, warnings and notes workers see, to simple Spanish. The office-only "Details" box stays English.
- Pricing code is the same as the live builder (`getSug()`, `gp()` etc.) with **one change: One-time weeding (OF2, "Weed one time") costs exactly double** the live builder's price for the same answers (Bryan, Oct 27 2026). It is doubled last, after complexity and rate. Bed cleanup (OF3), Ongoing weeding (C2), mulch and every other price are identical to the live builder. The live `index.html` still has the old weeding price. The new screens only choose which existing services are selected.
  - Example, 10,890 sq ft lot, medium bed size (6 yd of mulch), $80/hr, low complexity: light weeds $60 → $120; medium $120 → $240; heavy $180 → $360.
- Optional links for testing: `?view=focus&req=mow,leaf,snow,bush,mulch`, `?view=all`, `?lang=es`.

## Go-live (Oct 27, 2026) and rollback

- Root `index.html` (plus `route-fit.js`, `routes.json`) is this builder. The old Oct 20 builder is kept at **`/previous/`** (exact copy of the old root) and tagged **`legacy-2026-10-27`**. `/legacy/` (older builder), `/next/` and `/next-ui/` are unchanged.
- Old links to `/request-first/…` redirect to the root and keep their `?view=` / `?req=` / `?lang=` options. This folder now only holds this README, the redirect page and the tests.
- **One-time weeding (OF2) is 2x the previous builder's price** (Bryan, Oct 27). `/previous/` still has the old price. Every other price is identical to `/previous/`.
- **Rollback:** revert the go-live merge commit on `main` (`git revert -m 1 <merge commit>`), or copy `previous/index.html`, `previous/route-fit.js`, `previous/routes.json` over the root files and push. Pages redeploys in about a minute.
- Edit the root `index.html` directly from now on (it is no longer generated).

## Usability pass 1 (Oct 28, 2026) — UI only, no price changes

- **Quote ready** card at the end: lists each service with its price, the total, and the three ways to pay, with **Copy quote** (and Share on phones that have it). It only shows once there is a lot size and a service. Text follows the screen language.
- **Start over** button (asks twice, so no accidental wipe) in the top strip and under the quote.
- Step bubbles show a check only when that step is really done (no check on Services while there is no lot size).
- The bottom bar says what to do next: "Type the lot size", "Pick a service ↓", "See quote ↓".
- Office words replaced with plain ones on the phone screens (buffer, floor, auto defaults, rate, complexity, tier). Warnings say what to do.
- Smaller header and strip so the first screen shows the form; office-only details are tucked into "Details for the office".
- Same pricing code. Tests compare every dollar amount with `/previous/` (only one-time weeding may differ, exactly 2x).

Test (needs the repo served on :8765 and playwright-core; the comparison baseline is `/previous/`):
`node request-first/tests/request-first.mjs` — checks every service path prices exactly like the full view and like the previous builder (except one-time weeding, which must be exactly 2x), the screens and flow, Spanish, 48px tap targets, and that Everything matches today's builder. (`QUICK=1` skips the long price matrix.)
