# Request-first quote builder (preview, Phase 1)

A preview of the quote builder that starts with **"What did they ask for?"**.

- Open `request-first/` — first screen has big picture buttons (Weekly mowing, Leaf work; Snow, Bushes and garden, Mulch are marked "Coming soon") and **Everything**.
- Pick one or more, tap **Continue**: only those questions show, and the price updates as you go.
- **+ Add something else** goes back to the picks. **Show everything** opens the full builder (the same page as today's builder).
- **EN / ES** switch at the top changes all of the new screens to simple Spanish.
- Pricing code is the same as the live builder (`getSug()`, `gp()` etc. are unchanged). The new screens only choose which existing services are selected.
- Optional links for testing: `?view=focus&req=mow,leaf`, `?view=all`, `?lang=es`.

Live `index.html`, `next/`, `next-ui/` and `legacy/` are not touched.

Test (needs the repo served on :8765 and playwright-core):
`node request-first/tests/request-first.mjs` — checks the filtered view prices exactly like the full view and like the live builder, the screens and flow, Spanish, 48px tap targets, and that Everything matches today's builder.
