# Flower Bed priority + visual dials

Three small UI changes to `index.html`. No pricing logic touched.

## 1. Mulch / Flower Bed Refresh to top of one-time services

`ONE_CATS` order today: `OB → OD → OE → OF`. Change to: `OF → OB → OD → OE`.
Rationale: Flower bed services are Amigos' headline one-time offering and should be the first thing a customer sees in the one-time view.

## 2. Weed pressure — visual dial

Replace the 4 text buttons (None / Light / Moderate / Heavy) in the `wpPg{C,OF}` segmented control with inline SVG icons + small text label. Style: top-down brown mulch swatch with progressively more green sprigs (0 / 2 / 5 / ~18). Already prototyped and approved via `visual-preview.html`.

## 3. Bed footprint — visual dial

Replace the 3 text buttons (Low / Moderate / High) in `bfPg` with inline SVG icons + small text label. Style: aerial view — green turf + gray house centered + mulch-brown bed ring around the house. Ring thickness grows Low → Mod → High. High adds two island beds. Already prototyped and approved via `visual-preview.html`.

## CSS adjustment

Existing `.seg button` is row-only (text). Add `display:flex; flex-direction:column; align-items:center; gap:4px` so icon stacks above label. Icon class `.seg-ico` sized ~40×30. Selected state keeps existing dark green background; icons stay visible against it (sprig green + mulch brown both contrast acceptably on `#18240F`).

## Non-goals

- No pricing changes
- No state-shape changes (`ST.weedPressure` and `ST.bedFootprint` keep the same string values)
- No mobile layout changes beyond what the new button height implies
