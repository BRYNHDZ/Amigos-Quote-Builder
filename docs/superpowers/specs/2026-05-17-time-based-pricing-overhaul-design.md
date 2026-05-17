# Time-Based Pricing Overhaul — Design Spec

**Date:** 2026-05-17
**Tool:** Amigos Quote Builder (`Amigos-Quote-Builder/index.html`)
**Status:** Awaiting user approval before implementation plan

---

## 1. Problem

Current pricing formulas in `getSug()` were derived by feel against an $80/hr per-man-hour baseline. Two consequences:

- **Trimming pricing reads "off"** — formula undercharges mid-range and large ICP properties by 15–25%.
- **Customer-facing quotes feel arbitrary** — no clean mental model to defend numbers in conversation, no consistent way to bump prices for harder properties.

User wants pricing tied to a single concrete unit ("how long would a 2-person crew spend on site?") so every quote has a defensible structure: time × crew rate + materials.

---

## 2. Foundation

### 2.1 Labor base

- **2-person crew rate: $160 / on-site hour** (= $80/hr per person, both on site)
- **Quarter day** = 2h on-site = **$320**
- **Half day** = 4h on-site = **$640**
- **3/4 day** = 6h on-site = **$960**
- **Full day** = 8h on-site = **$1,280**

The $80/hr per-person baseline absorbs downtime (drive between jobs, equipment maintenance, weather days). On-site time only is billed; drive time is not.

### 2.2 Crew-size invariant

**All pricing is calculated as if 2 people are on site, period.** If a third crew member is sent for logistics, that's an internal cost decision — the customer still pays the 2-person estimate.

Rationale: adding a 3rd person doesn't scale labor speed linearly (a 30-min job doesn't become 20 min with a 3rd body), but cost scales linearly. Pricing by 2-person time keeps the customer-facing math honest.

### 2.3 Quote psychology

For services that have a time range estimate, **quote at the midpoint by default**, with an optional **+20% buffer toggle** for variance-prone jobs (weed-infested, awkward access, unmaintained property).

### 2.4 ICP context (informs bracket boundaries)

Strong-fit property: single-family, $500K+, **0.25–0.75 acre lot**, maintained, existing mulch beds, low-moderate weed pressure. All pricing brackets are tuned for this range. Properties >0.75 ac fall in the "caution zone" and trigger an outside-ICP flag.

---

## 3. Pricing Dials

### 3.1 Global Complexity (existing — keep)

Property-wide traits: access, terrain, slope, tree coverage. Same weights as today: **1.0× / 1.15× / 1.35×** (Low / Med / High). Applies to all services that take the global complexity multiplier today.

### 3.2 Trim Density (NEW — replaces global Complexity for trim services)

Captures bush density / hedge runs / overgrowth specifically. Only visible when a trim service is selected.

| Setting | E1 Annual (recurring) | E2 Premium (recurring, frequent) | OE1 One-Time (reset risk) |
|---|---|---|---|
| **Light** | 1.0× | 1.0× | 1.0× |
| **Standard** | 1.15× | 1.10× | 1.40× |
| **Dense** | 1.35× | 1.20× | 1.80× |

**Why different weights:** A one-time trim on a Dense property is a reset job — complexity dominates. A recurring trim on the same property is maintenance — complexity barely matters because frequent visits smooth the work. E2 (Premium Managed) gets the lightest weighting since ongoing checks during mow visits absorb most variance.

### 3.3 Weed Pressure (NEW — applies to beds & mulch services)

Captures condition of flower beds. Drives both per-yard time (mulch install) and recurring bed maintenance scaling.

For mulch install (F1, OF1), Weed Pressure directly determines **min/yd**:

| Setting | Min/yd | Labor/yd ($160/h × min) | + Material ($70/yd) | **Total/yd** |
|---|---|---|---|---|
| **Light** | 10 | $26.67 | $70 | **~$100** |
| **Moderate** | 20 | $53.33 | $70 | **~$125** |
| **Heavy** | 30 | $80.00 | $70 | **~$150** |

Material/yd = $70 = mulch + delivery + Preen. Bed-edging labor is included in the per-yard time (no separate line).

For typical 4-yard ICP property: $400 (light) / $500 (moderate) / $600 (heavy).

Hard cap: **never exceed 30 min/yd**. If a property would push past 30 min/yd, it's a different kind of job (bed restoration) and should be quoted manually.

For bed maintenance and one-time weeding services, Weed Pressure applies as a multiplier (similar to Trim Density):

| Service | Light | Moderate | Heavy |
|---|---|---|---|
| C1 Clean Look (recurring) | 1.0× | 1.15× | 1.30× |
| C2 Estate Detail (recurring) | 1.0× | 1.15× | 1.30× |
| OF2 One-Time Weeding | 1.0× | 1.40× | 1.80× |
| OF3 Bed Reset | 1.0× | 1.40× | 1.80× |

---

## 4. Service-by-Service Changes

### 4.1 Mowing (A1, A2)

**No change.** Already calibrated against the user's 2025 Excel review.

### 4.2 Trim Ladder (E1, E2, E5, E3, OE1, OE3)

**E1 Annual Shaping** — lot-driven on-site time, linearly interpolated:

| Lot range | On-site time (2-man) | Base price |
|---|---|---|
| <0.25 ac (<10,890 sqft) | 2h flat | $320 |
| 0.25–0.5 ac (10,890–21,780) | 2h → 4h linear | $320 → $640 |
| 0.5–0.75 ac (21,780–32,670) | 4h → 6h linear | $640 → $960 |
| >0.75 ac (>32,670) | 6h → 8h linear, capped | $960 → $1,280 + outside-ICP flag |

Final E1 = base × Trim Density (recurring weights).

**E2 Premium Managed** = **2.25 × E1** (covers 2 trim visits + the "we check during mow visits" premium). Trim Density applies with E2-specific weights (lighter).

**E4 Bi-annual** — **REMOVED from UI.** User never offers it.

**E5 Ladder Upgrade** = 0.35 × E1, min $100. Unchanged.

**E3 Perennial Pruning** = `peren_hrs × $160/h`. Effectively unchanged (formula already matched the crew-hour rate).

**OE1 One-Time Trim** — same lot-driven base as E1, but with **one-time** Trim Density weights (1.0× / 1.4× / 1.8×). A clean Light property pays the same as recurring; a Dense one-time pays significantly more.

**OE3 One-Time Perennial Pruning** = `peren_hrs × $160/h`.

### 4.3 Mulch & Beds (F1, OF1, C1, C2, OF2, OF3)

**F1 / OF1 Mulch Install** — time-per-yard model (see §3.3). `price = yards × ($70 material + min_per_yd × $160 / 60)` where `min_per_yd` comes from Weed Pressure.

**C1 / C2 Recurring Bed Maintenance** — keep existing `bp()` formula, multiply by Weed Pressure (recurring weights).

**OF2 One-Time Weeding** — keep existing formula, multiply by Weed Pressure (one-time weights).

**OF3 Bed Reset** — keep existing formula, multiply by Weed Pressure (one-time weights).

### 4.4 Spring/Fall Cleanups (D1, D2, OD1–OD4)

**No formula changes.** Verified that man-hour rate, global complexity, and leaf level all already drive these prices through `RATE_SVCS`, `cxM`, and `SLM`/`fb` respectively.

### 4.5 Leaf Services (G1–G5)

**No formula changes.** Same wiring confirmed.

### 4.6 Aeration & Overseeding (B1–B4, OB1–OB4)

**No formula changes.** ADD a labor-vs-material info bar in the output column when these services are selected:

- **Aeration** (B1, B2, OB1, OB2): `total · ~$10 equipment · rest labor`
- **Overseeding** (B3, B4, OB3, OB4): `total · {lawn × $0.02} seed · rest labor` (the `lawn × $0.02` is already explicit in the formula)

Internal margin check at quote time. Not shown to customer.

### 4.7 Snow (H1, H2, H4, H3)

Tier multipliers re-calibrated against NOAA climate normals (Wheaton 1981–2010, Chicago 1991–2020):

| Tier (code) | Old multiplier | New multiplier | 600 sqft drive price |
|---|---|---|---|
| 2"+ (H1) | 1.0× | 1.0× | $695 (unchanged) |
| 1"+ (H2) | 1.4× | **1.5×** | $1,043 |
| Zero tolerance (H4) | 2.0× | **2.7×** | **$1,877** |

Zero tolerance bumped most because:
- Event count is ~22 events/yr (vs ~6 at 2"+ tier) — old 2.0× multiplier undercounted by ~33%
- Plus staffing premium for standby on every dusting, late-night dispatches, equipment wear

`snb` base formula and H3 salt formula unchanged.

**Future calibration:** When location-specific event counts are pulled from the precip.ai app, multipliers can be re-tuned per ZIP. For now, NOAA-anchored defaults apply.

---

## 5. UI Changes

### 5.1 New controls

- **Trim Density dial** — shown in the trim card when any of E1/E2/E5/OE1 is selected. Three-button segmented (Light / Standard / Dense). **Defaults to Light** so a clean ICP property quotes at the lot-bracket base (matches the user's mental anchors of $320 / $640 / $960 for small / medium / large).
- **Weed Pressure dial** — shown in the beds/mulch card when any of F1/OF1/C1/C2/OF2/OF3 is selected. Three-button segmented (Light / Moderate / Heavy). **Defaults to Light** (10 min/yd, $100/yd for mulch) so a clean ICP property gets honest pricing, not the legacy flat-$150 heavy-default.
- **+20% buffer toggle** — a single toggle near the quote-total info bar that bumps the displayed total by 20% for variance-prone properties. Off by default. Affects the displayed total only; per-service prices in the left column stay at their unbuffered values.

### 5.2 Removed controls

- **E4 (Bi-annual Shaping)** — removed from the recurring service list.

### 5.3 New info bars (output column)

- Labor-vs-material breakdown for aeration and overseeding when selected (similar style to the existing mulch margin bar).
- Outside-ICP flag when lot >0.75 ac, suggesting manual review of the trim quote.

### 5.4 Updated label

- Mowing visits remaining: keep as-is.
- Property Plan label: keep "5% off" — no change to plan-discount design.

---

## 6. Implementation Notes

### 6.1 Where the changes land in `index.html`

All formula changes are in **`getSug()`** (currently one long line near line 206). Adding the two new dials adds:

- Two state fields on `ST`: `ST.trimDensity` (default `'light'`), `ST.weedPressure` (default `'light'`). Plus `ST.bufferOn` (boolean, default `false`) for the +20% buffer toggle.
- Two new lookup tables for per-service density/pressure multipliers.
- Conditional rendering of the dials in `renderSvc()` (visible when the relevant service group is selected).
- Removal of E4 from `REC_CATS` items.

### 6.2 Backward-compat for `ST.ov` overrides

User-set price overrides (`ST.ov[id]`) continue to bypass all multipliers (Trim Density, Weed Pressure, global Complexity, rate scaling, plan discount). This matches existing behavior — overrides represent the user's final say.

### 6.3 Plan-discount interaction

Trim Density and Weed Pressure multipliers are applied **before** `PLAN_DISCOUNT` (0.95). So plan view still shows 5% less than per-visit view for the same density/pressure setting. The plan-floor advisory logic from the previous pricing pass is unaffected.

### 6.4 Rate slider interaction

The $80/hr per-man-hour baseline (`RATE_BASE`) and `rateM = rate / 80` retrofit still apply. All time-based formulas use `$160/h crew = 2 × per-person rate`, so they scale correctly when the user moves the rate slider to $90 or $100.

### 6.5 Memory references

- `pricing_baseline.md` — $80/hr per-person rate baseline (still authoritative).
- `plan_discount_design.md` — 5% plan discount, no floor override (unchanged by this overhaul).
- `reference_precip_ai.md` — future per-property snow calibration source.

---

## 7. Out of Scope

- **Precip.ai API integration** — manual lookup remains. No automated per-property snow calibration in this pass.
- **Per-property snow event counts as a tool input** — NOAA-anchored defaults are baked in. Future enhancement once user has precip.ai data flow.
- **H3 salt pricing recalibration** — flagged as possibly low but user didn't request the change.
- **Mowing formula changes** — Excel-calibrated, untouched.
- **Itemized customer-facing breakdown** — user explicitly prefers single-total quotes. Internal margin display only.
- **3-man-crew premium** — pricing stays 2-man for all customer-facing math. Explicitly rejected as a design path.

---

## 8. Acceptance Criteria

- Trim quotes for a 0.5-acre ICP property hit **$640 at Light density** (default), $736 at Standard, $864 at Dense. (Current tool: ~$492 regardless of density.)
- Mulch quotes for a 4-yard ICP property show **$400 / $500 / $600** at Light / Moderate / Heavy Weed Pressure respectively. Default Light = $400.
- Zero-tolerance snow on a 600 sqft drive quotes at ~$1,877 (vs $1,390 current).
- E4 is no longer visible in the UI.
- Aeration & overseeding selections show a margin info bar.
- Property Plan total remains exactly 5% cheaper than Per-Visit for the same selections.
- Rate slider at $90 scales all time-based prices by 1.125× (90/80) as today.

---

## 9. Open Questions / Risks

- **Excel mowing calibration** assumed correct; if user wants to recalibrate against more recent jobs, that's a separate pass.
- **Snow base price** ($695 for 600 sqft) carried forward from current. If the user finds zero-tolerance contracts still feel under, the lever to pull is the 2.7× multiplier (or the base itself), not new structure.
- **E2 multiplier (2.25×)** is a "feels right" number anchored to "a bit more than double a single trim." Real-world calibration should be re-checked after a season.
