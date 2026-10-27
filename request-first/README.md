# Request-first quote builder (preview, Phase 2)

A preview of the quote builder that starts with **"What did they ask for?"**.

- Open `request-first/` — first screen has big picture buttons: **Weekly mowing, Leaf work, Snow, Bushes and garden, Mulch**, and **Everything**.
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

Live `index.html`, `next/`, `next-ui/` and `legacy/` are not touched.

Test (needs the repo served on :8765 and playwright-core):
`node request-first/tests/request-first.mjs` — checks every service path prices exactly like the full view and like the live builder (except one-time weeding, which must be exactly 2x), the screens and flow, Spanish, 48px tap targets, and that Everything matches today's builder. (`QUICK=1` skips the long price matrix.)
