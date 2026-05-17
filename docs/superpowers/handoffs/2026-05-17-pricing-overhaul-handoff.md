# Pricing Overhaul Handoff — 2026-05-17

## Status

✅ **Shipped.** PR #3 merged to `main` (merge commit `bc9d9c3`). Working tree clean, local main in sync with `origin/main`.

## What Changed

**Labor model:** Every quote now keys off **$1,280/day** = **$160/h** for a 2-person on-site crew. Drive time excluded. Per-person rate (`effRate()`) stays $80 baseline and is multiplied by 2 inside the formulas (so the rate slider scales trim and mulch correctly).

**New dials (state lives on `ST`):**
- `ST.trimDensity` — Light / Standard / Dense — visible only when a trim service is selected (E1, E2, OE1). E2 weights are lighter (1.0/1.10/1.20×) because frequent maintenance smooths variance. OE1 weights are heavier (1.0/1.4/1.8×) because density dominates reset jobs.
- `ST.weedPressure` — Light / Moderate / Heavy — visible when any bed/mulch service is selected. Drives mulch time-per-yard (10/20/30 min/yd → $97/$123/$150 per yd at default rate) and scales C1/C2/OF2/OF3.
- `ST.bufferOn` — +20% buffer toggle near the totals card. Doesn't override the honest total — appends a yellow "With +20% buffer: $X" info bar below it.

**Trim ladder** (lot-bracket linear interpolation via `trimHrs(lot)`):
- <0.25 ac (<10,890 sqft): 2h on-site → **$320** at Light
- 0.25–0.5 ac: 2h → 4h linear → **$640** at 0.5 ac
- 0.5–0.75 ac: 4h → 6h linear → **$960** at 0.75 ac
- 0.75 ac+: 6h → 8h capped, plus red "Outside ICP" flag above the totals

**E2 Premium Managed = 2.25 × E1** (covers 2 trim visits + ongoing-check premium). **E4 bi-annual removed entirely** (UI catalog, PLAN_SVCS, DESCS, cxM array, toggle E5 guard, renderOut vM).

**Mulch (F1/OF1):** `$70 material/yd + (min/yd × $160/h ÷ 60)`. Per-yard time controlled by Weed Pressure dial. Hard cap 30 min/yd.

**Snow (NOAA-anchored):** 2"+ unchanged at 1.0×, 1"+ bumped 1.4× → **1.5×**, Zero tolerance bumped 2.0× → **2.7×** (captures staffing/standby premium for every-dusting dispatch).

**Output panel additions:**
- Aeration labor-vs-material info bar (`B1 Aeration: $X · ~$10 equipment · $Y labor`)
- Overseeding info bar (`B3 Overseed: $X · $Z seed · $Y labor`) where seed = lawn × $0.02
- Mulch margin info bar corrected to use real $70/yd cost (was hardcoded $30)
- +20% buffer additive info bar
- Outside-ICP red callout

**Mowing, cleanups (D1/D2, OD1-4), leaf (G1-G5), aeration/overseeding base formulas unchanged.** All previously responded to rate/complexity/leaf sliders — verified during the design pass.

## Where Things Live

| | Path |
|---|---|
| Design spec | `docs/superpowers/specs/2026-05-17-time-based-pricing-overhaul-design.md` |
| Implementation plan | `docs/superpowers/plans/2026-05-17-time-based-pricing-overhaul.md` |
| Code | `index.html` (single file, vanilla HTML/JS, no build) |
| PR | https://github.com/BRYNHDZ/Amigos-Quote-Builder/pull/3 (merged) |
| Memory: $80/hr baseline | `~/.claude/projects/c--Users-HdzBr-...-Amigos-Quote-Builder/memory/pricing_baseline.md` |
| Memory: 5% plan discount | `…/plan_discount_design.md` |
| Memory: precip.ai reference | `…/reference_precip_ai.md` |
| Memory: feedback (plan before acting) | `…/feedback_plan_before_acting.md` |

## How to Verify Everything Still Works

Open `index.html` in a browser. Quick smoke:

1. **Default 0.5 ac quote.** Lot=21780, select E1. Should show **$640**. Click Standard density → $736. Click Dense → $864.
2. **Mulch.** Mulch=4, select F1. Light → $387. Moderate → $493. Heavy → $600.
3. **Snow.** Paved=600, select H4, snow=Zero. Should show **$1,877**.
4. **Plan vs Per-Visit.** Toggle the recurring view bar. Plan annual = 95% of Per-Visit annual.
5. **Rate slider.** Bump $80 → $90. E1 at 0.5 ac → $720 (was $640). Mulch labor portion bumps but $70 material stays.
6. **Outside-ICP flag.** Lot=40000 + any trim selected. Red callout above totals.
7. **+20% buffer.** Click "OFF" → "ON" in totals card. Yellow info bar appears below total.

For deeper verification, the prior session ran 40 Playwright + console assertions. Re-run via:
```bash
cd "c:/Users/HdzBr/OneDrive/Desktop/Amigos/Code Projects/Amigos-Quote-Builder/Amigos-Quote-Builder"
python -m http.server 8765
# In another shell, open http://localhost:8765/index.html and use DevTools Console
```

## Known Follow-Ups (Not Blocking)

These came out of the code-review pass — all flagged "Minor" or "Nice to have":

1. **`TRIM_BRACKETS` constant is dead** — `trimHrs()` inlines the same numbers instead of consuming the array. Either delete the constant or refactor `trimHrs()` to read from it. The two can drift silently otherwise.
2. **`LABOR_DAY = 1280` is a magic number** — could be `CREW_HOUR_RATE * 8` to express the dependency.
3. **`E5_UPGRADE_FRAC = 0.35`** — the ladder upgrade multiplier is inline; should be a named constant like `E2_MULT` is.
4. **`WEED_PRESSURE_MULT` lookups have no `|| 1` fallback** — if the dial state ever drifts (e.g., user injects an unexpected value), the result is `NaN`. Add fallback for safety.
5. **Naming inconsistency** — Trim Density uses `'std'`, Weed Pressure uses `'mod'`. Pick one convention.
6. **Trim $/man-hr info bar** in `renderOut()` still computes `tH = trim_sqft × visits_per_year` from the old formula. With the lot-driven model, this ratio is meaningless when both `ST.trim` and `ST.lot` are entered. Fix: replace with `tH = trimHrs(ST.lot) * 2` and hide the bar when `ST.lot === 0`.
7. **`getSug()` is now ~80KB on one line** — pre-existing issue, not worse but not better. Extracting `mulchPrice(yards, pressure)` and `bedPrice(id, base, pressure)` as named helpers would help next time anyone touches the function.

## Future Calibration

- **Snow tiers.** When you pull location-specific snow event counts from the precip.ai app (use `precip.ai/snow-totals/zipcode/<your-zip>` then open the app for historical event-count breakdowns), the 1.0×/1.5×/2.7× tier multipliers can be re-tuned. The current values are NOAA-anchored to Wheaton/Chicago normals.
- **E2 multiplier (2.25× E1).** Locked as "a bit more than double a single trim" plus ongoing-check premium. Real-world calibration should be re-checked after a full season.
- **Mulch ceiling at 30 min/yd.** Hard cap baked in. If you find Heavy jobs genuinely taking longer, the spec recommends a bed-restoration line item rather than raising the cap.

## Quick Reference: Constants Worth Remembering

```js
CREW_HOUR_RATE   = 160     // doc anchor; formulas use effRate()*2
LABOR_DAY        = 1280    // 8h × 2 people × $80
MULCH_MAT_PER_YD = 70      // mulch + delivery + Preen
ICP_LOT_CAP      = 32670   // 0.75 ac in sqft
E2_MULT          = 2.25    // E2 = 2.25 × E1
PLAN_DISCOUNT    = 0.95    // Property Plan saves 5%
PLAN_FLOOR       = 149     // /mo — advisory only, never overrides
```

## Operating Notes for Next Session

- User goes by "Brayan" / `hdzbryn@gmail.com`. Pricing is for **Amigos Landscaping**, ICP is maintained single-family $500K+ in DuPage County, IL (0.25–0.75 ac sweet spot).
- User prefers single-total quotes — never itemize materials/labor to the customer. Internal margin bars are for the user's eyes only.
- User has a global Stop-hook chime at `~/.claude/notify-done.ps1` — drop a `.wav` at `~/.claude/notif.wav` to override the default (currently a BO3 chime).
- User prefers "plan before acting" on non-trivial pricing/UI changes. Trivial edits OK to just-do.
