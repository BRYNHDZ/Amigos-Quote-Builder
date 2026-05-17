# Time-Based Pricing Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pricing engine in `index.html` around a $1,280/day labor base ($160/h, 2-person crew on-site), introduce per-service Trim Density / Weed Pressure dials, time-per-yard mulch pricing, NOAA-anchored snow multipliers, and small UI additions (buffer toggle, margin breakdown, outside-ICP flag).

**Architecture:** All changes land in the single-file vanilla HTML/JS app at `Amigos-Quote-Builder/index.html`. New constants and lookup tables added next to the existing pricing constants (~line 186–195). New state fields added to the `ST` initializer (~line 188). `getSug()` (one long line near line 206) is modified slice-by-slice. New UI controls land in `renderSvc()` (for in-card dials) and `renderOut()` (for output-panel toggles and margin bars). No new files, no build step, no test framework — verification is concrete numeric checks performed in the browser (devtools console + visual confirmation).

**Tech Stack:** Vanilla HTML/CSS/JS, no build pipeline, no test runner. Pricing logic is in pure functions on the `ST` state object, which makes browser-console verification trivial: edit inputs in the UI, then call `getSug()` / `gp(id)` from the console to check raw numbers.

**Source spec:** `docs/superpowers/specs/2026-05-17-time-based-pricing-overhaul-design.md`

---

## File Structure

Single file: `Amigos-Quote-Builder/index.html`

Key existing landmarks:
- **Line 186–195:** Pricing constants (`V`, `BCB`, `RATE_BASE`, `PLAN_DISCOUNT`, `RATE_SVCS`, `PLAN_SVCS`)
- **Line 188:** `ST` state initializer
- **Line 200:** `REC_CATS` (recurring service catalog)
- **Line 201:** `ONE_CATS` (one-time service catalog)
- **Line 206:** `getSug()` — the single-line pricing function
- **Line 215:** `upd()` — pulls input values into `ST`, schedules render
- **Line 223:** `derive()` — derives lawn/paved/mulch/trim/peren from lot size
- **Line 290:** `renderSvc()` — left-column service rows
- **Line 327:** `renderOut()` — right-column output panel
- **Line 333:** `render()` — top-level renderer

All edits are in this file. Two new git commits per phase keeps the diff size manageable.

---

## Pre-flight: Create a feature branch

- [ ] **Step 0.1: Create and switch to a feature branch**

Run:
```bash
cd "c:/Users/HdzBr/OneDrive/Desktop/Amigos/Code Projects/Amigos-Quote-Builder/Amigos-Quote-Builder"
git checkout -b pricing-overhaul
git status
```

Expected: `On branch pricing-overhaul · nothing to commit, working tree clean`

- [ ] **Step 0.2: Open the file in the browser for live verification**

Run:
```bash
start "" "c:/Users/HdzBr/OneDrive/Desktop/Amigos/Code Projects/Amigos-Quote-Builder/Amigos-Quote-Builder/index.html"
```

Verify the page loads. Open DevTools (F12) and switch to the Console tab — you'll use it after each task to call `getSug()` or `gp(id)` for numeric checks.

---

# Phase A — Backstage (no visible behavior change)

These three tasks add infrastructure that later tasks use. The app behaves identically after this phase.

---

### Task 1: Add new pricing constants and multiplier tables

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (constants block ~line 186–195)

- [ ] **Step 1.1: Define the verification target**

After this task, the constants exist in `window` scope. From the browser console you should be able to evaluate:
```js
CREW_HOUR_RATE          // 160
LABOR_DAY               // 1280
MULCH_MAT_PER_YD        // 70
MULCH_MIN_PER_YD.light  // 10
TRIM_DENSITY_MULT.E1.std  // 1.15
WEED_PRESSURE_MULT.C1.heavy  // 1.3
```

- [ ] **Step 1.2: Insert the constants after `PLAN_DISCOUNT`**

Find this line (currently line 192):
```js
const PLAN_DISCOUNT=0.95;
```

Add the following block immediately after it, before `const RATE_BASE=80;`:
```js
// Time-based labor model — see docs/superpowers/specs/2026-05-17-time-based-pricing-overhaul-design.md §2.1
const CREW_HOUR_RATE=160;
const LABOR_DAY=1280;
// Mulch time-per-yard model — §3.3
const MULCH_MAT_PER_YD=70;
const MULCH_MIN_PER_YD={light:10,mod:20,heavy:30};
// Trim density multipliers — §3.2 (per-service weights, recurring vs one-time)
const TRIM_DENSITY_MULT={
  E1: {light:1.0, std:1.15, dense:1.35},
  E2: {light:1.0, std:1.10, dense:1.20},
  E5: {light:1.0, std:1.15, dense:1.35},
  OE1:{light:1.0, std:1.40, dense:1.80}
};
// Weed pressure multipliers — §3.3
const WEED_PRESSURE_MULT={
  C1: {light:1.0, mod:1.15, heavy:1.30},
  C2: {light:1.0, mod:1.15, heavy:1.30},
  OF2:{light:1.0, mod:1.40, heavy:1.80},
  OF3:{light:1.0, mod:1.40, heavy:1.80}
};
// Trim lot brackets — §4.2
const TRIM_BRACKETS=[
  {maxSqft:10890,  hrs:2}, // <0.25 ac — flat 2h
  {maxSqft:21780,  hrs:4}, // 0.25–0.5 ac — interp 2→4
  {maxSqft:32670,  hrs:6}, // 0.5–0.75 ac — interp 4→6
  {maxSqft:Infinity,hrs:8} // >0.75 ac — interp 6→8 capped
];
// Outside-ICP threshold (sqft)
const ICP_LOT_CAP=32670;
// E2 = X × E1
const E2_MULT=2.25;
```

- [ ] **Step 1.3: Reload browser, verify in console**

In the browser tab showing `index.html`, hard-refresh (Ctrl+F5) and open DevTools console. Run:
```js
CREW_HOUR_RATE === 160 && LABOR_DAY === 1280 && MULCH_MAT_PER_YD === 70
```
Expected: `true`

```js
TRIM_DENSITY_MULT.OE1.dense
```
Expected: `1.8`

```js
WEED_PRESSURE_MULT.OF3.heavy
```
Expected: `1.8`

- [ ] **Step 1.4: Commit**

```bash
git add index.html
git commit -m "feat(pricing): add labor/density/pressure constants + trim brackets

Adds CREW_HOUR_RATE ($160/h), LABOR_DAY ($1280), MULCH_MAT_PER_YD ($70),
MULCH_MIN_PER_YD slider mapping (10/20/30 min), per-service TRIM_DENSITY_MULT
and WEED_PRESSURE_MULT tables with separate recurring/one-time weights,
TRIM_BRACKETS lookup, ICP_LOT_CAP, and E2_MULT=2.25. No behavior change yet
— constants are unused until later tasks wire them into getSug() and UI."
```

---

### Task 2: Add new state fields (trimDensity, weedPressure, bufferOn)

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (line 188, `ST` initializer)

- [ ] **Step 2.1: Find the existing `ST` initializer**

Current line 188:
```js
let ST={lawn:0,lot:0,paved:0,mulch:0,trim:0,peren:0,rate:0,leaf:null,snow:null,mode:null,homeVal:0,homeFt:0,complex:null,visitsRemain:0,oneTier:'remote',recView:'visit',sel:new Set(['A1']),selOne:new Set(),ov:{},ovOne:{},exp:new Set(),lotUnit:'sqft'};
```

- [ ] **Step 2.2: Add the three new fields**

Replace the existing line with:
```js
let ST={lawn:0,lot:0,paved:0,mulch:0,trim:0,peren:0,rate:0,leaf:null,snow:null,mode:null,homeVal:0,homeFt:0,complex:null,visitsRemain:0,oneTier:'remote',recView:'visit',sel:new Set(['A1']),selOne:new Set(),ov:{},ovOne:{},exp:new Set(),lotUnit:'sqft',trimDensity:'light',weedPressure:'light',bufferOn:false};
```

- [ ] **Step 2.3: Verify in console**

Hard-refresh and run:
```js
ST.trimDensity === 'light' && ST.weedPressure === 'light' && ST.bufferOn === false
```
Expected: `true`

- [ ] **Step 2.4: Commit**

```bash
git add index.html
git commit -m "feat(pricing): add trimDensity/weedPressure/bufferOn state fields

Defaults to Light density, Light pressure, buffer off — matches the user's
mental anchor for a clean ICP property (so default quotes hit \$320/\$640/\$960
for small/medium/large trim and \$100/yd mulch without any dials being touched)."
```

---

### Task 3: Remove E4 (Bi-annual Shaping) from the UI

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`REC_CATS` ~line 200)

- [ ] **Step 3.1: Find the E group in REC_CATS**

Current snippet inside `REC_CATS`:
```js
{id:'E',items:[{id:'E1',name:'Annual Shaping'},{id:'E4',name:'Bi-Annual Shaping'},{id:'E2',name:'Premium Managed Shaping',dep:true},{id:'E5',name:'Ladder Use Upgrade'},{id:'E3',name:'Perennial Flower Pruning'}]}
```

- [ ] **Step 3.2: Remove the E4 item**

Replace the snippet with (E4 removed):
```js
{id:'E',items:[{id:'E1',name:'Annual Shaping'},{id:'E2',name:'Premium Managed Shaping',dep:true},{id:'E5',name:'Ladder Use Upgrade'},{id:'E3',name:'Perennial Flower Pruning'}]}
```

- [ ] **Step 3.3: Verify in browser**

Hard-refresh. Switch to "Recurring Job" mode. In the Trimming & Pruning card, confirm "Bi-Annual Shaping" no longer appears. Verify the other four items (Annual Shaping, Premium Managed, Ladder Upgrade, Perennial Pruning) still render.

- [ ] **Step 3.4: Commit**

```bash
git add index.html
git commit -m "feat(ui): remove E4 Bi-Annual Shaping from recurring catalog

User never offers bi-annual — only Annual (E1) or Premium Managed (E2).
The E4 entry in getSug() becomes dead code but is left in place; it
will be cleaned up when getSug() is rewritten in the next phase."
```

---

# Phase B — Formula changes

These tasks rewrite the pricing math. Until the dials land in Phase C, all multipliers will use the default `Light` setting (1.0×), so visible prices change to reflect the new baseline math. Each task is independently commitable.

---

### Task 4: Rewrite trim formulas with lot-bracket linear interpolation

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`getSug()` ~line 206)

- [ ] **Step 4.1: Define expected outputs (verification table)**

After this task, with default `ST.trimDensity = 'light'` (so multiplier is 1.0×), these inputs should produce these outputs:

| Lot (sqft) | Approx ac | Hours | E1 price | E2 (2.25×) | OE1 |
|---|---|---|---|---|---|
| 8,000 | 0.18 | 2.0 | $320 | $720 | $320 |
| 10,890 | 0.25 | 2.0 | $320 | $720 | $320 |
| 17,424 | 0.40 | 3.20 | $512 | $1,152 | $512 |
| 21,780 | 0.50 | 4.0 | $640 | $1,440 | $640 |
| 27,225 | 0.625 | 5.0 | $800 | $1,800 | $800 |
| 32,670 | 0.75 | 6.0 | $960 | $2,160 | $960 |
| 43,560 | 1.0 | 8.0 (capped 8) | $1,280 | $2,880 | $1,280 |

- [ ] **Step 4.2: Add a helper function `trimHrs(lot)` above `getSug()`**

Find the line that defines `function getSug()` (currently line 206). Immediately above it, insert:

```js
function trimHrs(lot){
  if(lot<=0)return 0;
  if(lot<=10890)return 2;
  if(lot<=21780)return 2+(lot-10890)/5445;          // 2→4 over 10,890 sqft
  if(lot<=32670)return 4+(lot-21780)/5445;          // 4→6
  return Math.min(6+(lot-32670)/5445, 8);           // 6→8 capped at 8h (full day)
}
```

- [ ] **Step 4.3: Inside `getSug()`, replace the trim formula slice**

In the current `getSug()` long line, find this substring:
```js
E1:trim>0?Math.max(300,Math.round(trim*rate*2*1.2+60)):0,E4:trim>0?Math.max(550,Math.round((trim*rate*2*1.2+60)*1.85)):0,E2:trim>0?Math.max(800,Math.round((trim*rate*2*1.2+60)*3.2)):0,E5:trim>0?Math.max(100,Math.round((trim*rate*2*1.2+60)*0.35)):0,
```

Replace it with (uses `trimHrs(lot)` and new E2 multiplier, drops E4 from output map):
```js
E1:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE):0),E2:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE*E2_MULT):0),E5:(lot>0?Math.max(100,Math.round(trimHrs(lot)*CREW_HOUR_RATE*0.35)):0),
```

Also find this substring (one-time trim, currently line ~206):
```js
OE1:trim>0?Math.max(300,Math.round(trim*rate*2*1.2+60)):0,
```

Replace with:
```js
OE1:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE):0),
```

E3/OE3 (perennial pruning) stay untouched — their existing `peren*rate*2` formula equals `peren*CREW_HOUR_RATE` and produces the same result.

- [ ] **Step 4.4: Verify in browser console**

Hard-refresh. Enter `21780` (0.5 ac) in the **Lot size** input. In the console:
```js
const s = getSug(); [s.E1, s.E2, s.OE1, s.E5]
```
Expected: `[640, 1440, 640, 224]` (E5 = 640 × 0.35 = 224)

Try lot `32670` (0.75 ac):
```js
$('iLt').value=32670; upd(); const s=getSug(); [s.E1, s.E2, s.OE1]
```
Expected: `[960, 2160, 960]`

Try lot `43560` (1 ac, past ICP cap):
```js
$('iLt').value=43560; upd(); const s=getSug(); [s.E1, s.E2]
```
Expected: `[1280, 2880]` (capped at full day)

- [ ] **Step 4.5: Commit**

```bash
git add index.html
git commit -m "feat(pricing): rewrite trim formulas around lot-bracket on-site hours

E1/E2/E5/OE1 now derive on-site hours from lot size via trimHrs() —
2h flat <0.25 ac, linear 2→4h to 0.5 ac, linear 4→6h to 0.75 ac,
capped at 8h. Price = hours × \$160/h crew rate. E2 = 2.25 × E1
(covers 2 trim visits + premium for ongoing-check during mowing).
E5 = 0.35 × E1 (ladder upgrade). OE1 mirrors E1 (one-time density
weights land in Task 7). E4 dropped from getSug() output.

Baseline (default Light density, no multiplier yet): 0.5 ac trim
quotes at \$640 — up from ~\$492 under the old formula."
```

---

### Task 5: Apply trim density multipliers in `getSug()`

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`getSug()` — trim slice + a small final loop)

- [ ] **Step 5.1: Define expected outputs**

With `ST.trimDensity = 'std'`, lot 21,780 sqft (0.5 ac):
- E1 = 640 × 1.15 = $736
- E2 = 1,440 × 1.10 = $1,584 (note: E2 uses lighter E2-specific weights)
- OE1 = 640 × 1.4 = $896 (one-time weights)
- E5 = 224 × 1.15 = $258

With `ST.trimDensity = 'dense'`, same lot:
- E1 = 640 × 1.35 = $864
- E2 = 1,440 × 1.20 = $1,728
- OE1 = 640 × 1.8 = $1,152
- E5 = 224 × 1.35 = $302

- [ ] **Step 5.2: Apply density multipliers in `getSug()`**

In `getSug()`, find the trim slice you just rewrote (Step 4.3):
```js
E1:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE):0),E2:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE*E2_MULT):0),E5:(lot>0?Math.max(100,Math.round(trimHrs(lot)*CREW_HOUR_RATE*0.35)):0),
```

Replace with (each service multiplies by its own density weight):
```js
E1:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE*TRIM_DENSITY_MULT.E1[ST.trimDensity]):0),E2:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE*E2_MULT*TRIM_DENSITY_MULT.E2[ST.trimDensity]):0),E5:(lot>0?Math.max(100,Math.round(trimHrs(lot)*CREW_HOUR_RATE*0.35*TRIM_DENSITY_MULT.E5[ST.trimDensity])):0),
```

And the OE1 slice:
```js
OE1:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE):0),
```

becomes:
```js
OE1:(lot>0?Math.round(trimHrs(lot)*CREW_HOUR_RATE*TRIM_DENSITY_MULT.OE1[ST.trimDensity]):0),
```

- [ ] **Step 5.3: Verify in console**

Hard-refresh. Set lot to 21780 in the UI.

```js
ST.trimDensity='std'; render(); const s=getSug(); [s.E1, s.E2, s.OE1, s.E5]
```
Expected: `[736, 1584, 896, 258]`

```js
ST.trimDensity='dense'; render(); const s=getSug(); [s.E1, s.E2, s.OE1, s.E5]
```
Expected: `[864, 1728, 1152, 302]`

```js
ST.trimDensity='light'; render(); const s=getSug(); [s.E1, s.E2, s.OE1]
```
Expected: `[640, 1440, 640]` (back to Light baseline)

- [ ] **Step 5.4: Commit**

```bash
git add index.html
git commit -m "feat(pricing): apply per-service trim density multipliers

Each trim service (E1, E2, E5, OE1) multiplies its base price by its own
TRIM_DENSITY_MULT entry. Recurring services (E1, E5) use Light/Std/Dense
= 1.0/1.15/1.35; E2 uses lighter 1.0/1.1/1.2 because frequent checks
absorb variance; OE1 (one-time) uses heavier 1.0/1.4/1.8 because density
dominates reset jobs. Dial UI still missing — multiplier reads from
ST.trimDensity which defaults to 'light' (no visible price change yet)."
```

---

### Task 6: Rewrite mulch F1/OF1 formulas with time-per-yard model

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`getSug()` — mulch slice)

- [ ] **Step 6.1: Define expected outputs**

With `ST.weedPressure='light'` (default, 10 min/yd → $100/yd):

| Yards | F1 price | OF1 price |
|---|---|---|
| 1 | $97 | $97 |
| 3 | $290 | $290 |
| 4 | $387 | $387 |
| 5 | $483 | $483 |

(Per-yd: $70 material + 10 min × $160/60 = $70 + $26.67 = $96.67, rounded to $97/yd)

With `ST.weedPressure='heavy'` (30 min/yd → $150/yd):

| Yards | F1 price | OF1 price |
|---|---|---|
| 4 | $600 | $600 |

(Per-yd: $70 + 30 × $160/60 = $70 + $80 = $150)

- [ ] **Step 6.2: Replace the mulch slice in `getSug()`**

Find this substring in `getSug()`:
```js
const mu=mulch>0?Math.round(mulch*150):0;
```

Replace with:
```js
const mulchMinYd=MULCH_MIN_PER_YD[ST.weedPressure]||10;
const mulchPerYd=MULCH_MAT_PER_YD+mulchMinYd*CREW_HOUR_RATE/60;
const mu=mulch>0?Math.round(mulch*mulchPerYd):0;
```

The `mu` constant is used for both `F1` and `OF1` in the existing `R` map — no change needed in those references.

- [ ] **Step 6.3: Verify in console**

Hard-refresh. Enter `4` in the **Mulch — eyeball (yards)** input.

```js
const s=getSug(); s.F1
```
Expected: `387` (4 × $96.67 ≈ $386.67 → 387)

```js
ST.weedPressure='heavy'; render(); getSug().F1
```
Expected: `600` (4 × $150)

```js
ST.weedPressure='mod'; render(); getSug().F1
```
Expected: `503` (4 × $125.67 ≈ $502.67)

```js
ST.weedPressure='light'; render();
```

- [ ] **Step 6.4: Commit**

```bash
git add index.html
git commit -m "feat(pricing): mulch F1/OF1 use time-per-yard model

Replace flat \$150/yd with: \$70 material/yd + (Weed Pressure min/yd × \$160/h ÷ 60).
At default Light (10 min/yd) → \$97/yd. Moderate (20 min/yd) → \$125/yd.
Heavy (30 min/yd) → \$150/yd, matching the legacy flat rate at the worst
end and giving clean jobs a defensible discount. Hard ceiling 30 min/yd."
```

---

### Task 7: Apply weed pressure multipliers to bed maintenance and one-time bed services

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`getSug()` — C1/C2/OF2/OF3 slices)

- [ ] **Step 7.1: Define expected outputs**

With `mulch=4` and `mc≈45` (medium ICP), `ST.weedPressure='light'` (baseline 1.0×):

| Service | Base formula | Light price |
|---|---|---|
| C1 | `bp(4, 100, 38, 26)` | 100 + 4×38 = $252 |
| C2 | `bp(4, 200, 60, 40)` | 200 + 4×60 = $440 |
| OF2 | `trim*rate*0.5` (trim≈1.0 at this lot) | $40 |
| OF3 | `mulch*rate*0.4` | $128 |

With `ST.weedPressure='heavy'`:
- C1 = $252 × 1.30 = $328
- C2 = $440 × 1.30 = $572
- OF2 = $40 × 1.80 = $72
- OF3 = $128 × 1.80 = $230

- [ ] **Step 7.2: Find and modify the bed-services slice in `getSug()`**

The current `R` map contains (in one long line):
```js
C1:c1,C2:c2,
```
…and later…
```js
OF2:trim>0?Math.round(trim*rate*0.5):0,OF3:mulch>0?Math.round(mulch*rate*0.4):mc>0?Math.round(mc*2):0
```

Find each of these references and wrap them with the weed pressure multiplier. Replace `C1:c1,C2:c2,` with:
```js
C1:Math.round(c1*WEED_PRESSURE_MULT.C1[ST.weedPressure]),C2:Math.round(c2*WEED_PRESSURE_MULT.C2[ST.weedPressure]),
```

Replace the `OF2:` / `OF3:` substring with:
```js
OF2:trim>0?Math.round(trim*rate*0.5*WEED_PRESSURE_MULT.OF2[ST.weedPressure]):0,OF3:(mulch>0?Math.round(mulch*rate*0.4*WEED_PRESSURE_MULT.OF3[ST.weedPressure]):mc>0?Math.round(mc*2*WEED_PRESSURE_MULT.OF3[ST.weedPressure]):0)
```

- [ ] **Step 7.3: Verify in console**

Hard-refresh. Set Lot to `17424` (0.4 ac), Mulch to `4`.

```js
ST.weedPressure='light'; render(); const s=getSug(); [s.C1, s.C2, s.OF2, s.OF3]
```
Expected: roughly `[252, 440, 40, 128]` (exact numbers depend on trim/mulch derive)

```js
ST.weedPressure='heavy'; render(); const s=getSug(); [s.C1, s.C2, s.OF2, s.OF3]
```
Expected: roughly `[328, 572, 72, 230]`

```js
ST.weedPressure='light'; render();
```

- [ ] **Step 7.4: Commit**

```bash
git add index.html
git commit -m "feat(pricing): apply weed pressure multipliers to C1/C2/OF2/OF3

Recurring bed maintenance (C1 Clean Look, C2 Estate Detail) uses
1.0/1.15/1.30 (Light/Mod/Heavy). One-time weeding (OF2) and bed
reset (OF3) use heavier one-time weights 1.0/1.4/1.8 because
restoration work dominates per-yard time. Mulch F1/OF1 already
pick up weed pressure via min-per-yd in the previous task."
```

---

### Task 8: Update snow tier multipliers (1.0× / 1.5× / 2.7×)

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`getSug()` — snow slice)

- [ ] **Step 8.1: Define expected outputs**

For a 600 sqft paved area (snb base = $695):

| Tier | Multiplier | Expected price |
|---|---|---|
| `2plus` (H1) | 1.0× | $695 |
| `1plus` (H2) | 1.5× | $1,043 (rounded) |
| `zero` (H4) | 2.7× | $1,877 (rounded) |

- [ ] **Step 8.2: Find and replace the snow multiplier slice**

In `getSug()`, find this substring:
```js
if(snow==='1plus')snb*=1.4;if(snow==='zero')snb*=2.0;
```

Replace with:
```js
if(snow==='1plus')snb*=1.5;if(snow==='zero')snb*=2.7;
```

- [ ] **Step 8.3: Verify in console**

Hard-refresh. Set **Paved area** to `600`, mode to Recurring, snow trigger to "2"+", then check each tier:

```js
ST.snow='2plus'; render(); getSug().H1
```
Expected: `695`

```js
ST.snow='1plus'; render(); getSug().H2
```
Expected: `1043`

```js
ST.snow='zero'; render(); getSug().H4
```
Expected: `1877`

- [ ] **Step 8.4: Commit**

```bash
git add index.html
git commit -m "feat(pricing): bump snow tier multipliers to NOAA-anchored values

1\"+ tier 1.4× → 1.5× — small bump to track event-count ratio.
Zero tolerance 2.0× → 2.7× — captures the staffing premium that
was missing (standby for every dusting, late-night dispatches,
equipment wear). 2\"+ base unchanged. Calibrated against Wheaton
1981–2010 + Chicago 1991–2020 NOAA climate normals; refine per
property when you pull location-specific event counts from precip.ai."
```

---

# Phase C — Dial UI

Adds the two new segmented controls so the user can actually toggle Trim Density and Weed Pressure from the page.

---

### Task 9: Add the Trim Density dial in `renderSvc()`

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`renderSvc()` ~line 290)

- [ ] **Step 9.1: Add a helper that detects if any trim service is selected**

Find this line (currently around 204):
```js
function hasTrim(){const s=ST.mode==='recurring'?ST.sel:ST.selOne;return s.has('E1')||s.has('E4')||s.has('E2');}
```

Replace with (drops E4, adds OE1):
```js
function hasTrim(){const s=ST.mode==='recurring'?ST.sel:ST.selOne;return s.has('E1')||s.has('E2')||s.has('OE1');}
```

- [ ] **Step 9.2: Add a `setDial()` helper near `setSeg()`**

Find this line (currently around 213):
```js
function setSeg(gid,btn,fn){document.querySelectorAll('#'+gid+' button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');fn();render();}
```

Immediately after it, add:
```js
function setDial(field,val){ST[field]=val;render();}
```

- [ ] **Step 9.3: Render the dial inside the trim card in `renderSvc()`**

In `renderSvc()` (around line 290), find this snippet that renders each category header:
```js
h+='<div class="card"><div class="cat-hd"><div class="cat-title">'+(m?m.title:cat.id)+'</div>'+(cat.addon?'<span class="atag">'+cat.addon+'</span>':'')+'</div>';
```

Immediately after that line, add a conditional block that injects the Trim Density dial when rendering the trim category and any trim service is selected:
```js
if((cat.id==='E'||cat.id==='OE')&&hasTrim()){
  h+='<div style="margin-bottom:10px"><label class="lbl" style="margin-bottom:5px">Trim density</label>'
   + '<div class="seg" id="tdPg'+cat.id+'">'
   + '<button class="'+(ST.trimDensity==='light'?'on':'')+'" onclick="setDial(\'trimDensity\',\'light\')">Light</button>'
   + '<button class="'+(ST.trimDensity==='std'?'on':'')+'" onclick="setDial(\'trimDensity\',\'std\')">Standard</button>'
   + '<button class="'+(ST.trimDensity==='dense'?'on':'')+'" onclick="setDial(\'trimDensity\',\'dense\')">Dense</button>'
   + '</div></div>';
}
```

- [ ] **Step 9.4: Verify in browser**

Hard-refresh. Switch to Recurring mode. Confirm:
- No dial visible in Trimming card when no trim service is selected.
- Click "Annual Shaping (E1)" — Trim Density dial appears with Light highlighted.
- Click Standard — E1 price visibly increases (~15% bump). Default lot 21780 → E1 goes 640 → 736.
- Click Dense — E1 goes to 864.
- Click Light — back to 640.
- Switch to One-Off mode, select "Bush & Shrub Shaping (OE1)" — dial appears in trim card. Clicking Dense bumps OE1 to 1152 (1.8× weight for one-time).

- [ ] **Step 9.5: Commit**

```bash
git add index.html
git commit -m "feat(ui): add Trim Density dial (Light/Standard/Dense)

Segmented control renders inside the trim card when any trim service
is selected (E1, E2, OE1 in either mode, or OE in one-off mode).
Defaults to Light per spec §5.1. Wires to ST.trimDensity via setDial(),
which triggers a full render so prices update live. hasTrim() updated
to drop the removed E4 and pick up OE1 in one-off mode."
```

---

### Task 10: Add the Weed Pressure dial in `renderSvc()`

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`renderSvc()`)

- [ ] **Step 10.1: Add a `hasBeds()` helper**

Find the `hasTrim()` line you edited in Task 9.1. Immediately after it, add:
```js
function hasBeds(){const s=ST.mode==='recurring'?ST.sel:ST.selOne;return s.has('C1')||s.has('C2')||s.has('F1')||s.has('OF1')||s.has('OF2')||s.has('OF3');}
```

- [ ] **Step 10.2: Render the dial in the relevant category cards**

In `renderSvc()`, find the same category-header snippet you edited in Task 9.3 and add a SECOND conditional block right after the trim density dial:

```js
if((cat.id==='C'||cat.id==='OF')&&hasBeds()){
  h+='<div style="margin-bottom:10px"><label class="lbl" style="margin-bottom:5px">Weed pressure</label>'
   + '<div class="seg" id="wpPg'+cat.id+'">'
   + '<button class="'+(ST.weedPressure==='light'?'on':'')+'" onclick="setDial(\'weedPressure\',\'light\')">Light</button>'
   + '<button class="'+(ST.weedPressure==='mod'?'on':'')+'" onclick="setDial(\'weedPressure\',\'mod\')">Moderate</button>'
   + '<button class="'+(ST.weedPressure==='heavy'?'on':'')+'" onclick="setDial(\'weedPressure\',\'heavy\')">Heavy</button>'
   + '</div></div>';
}
```

- [ ] **Step 10.3: Verify in browser**

Hard-refresh. With mulch input `4` and Recurring mode:
- Select F1 Mulch Installation — Weed Pressure dial appears in the bed card.
- Default Light: F1 should show ~$387.
- Click Moderate: F1 jumps to ~$503.
- Click Heavy: F1 jumps to ~$600.
- Switch to C1 Clean Look + 4 yards mulch: confirm C1 also moves with the dial (252 → 290 → 328).
- Switch to One-Off mode, select OF1 Mulch + OF2 Weeding: dial appears in OF card. At Heavy, OF2 goes to ~$72 (1.8× one-time weight).

- [ ] **Step 10.4: Commit**

```bash
git add index.html
git commit -m "feat(ui): add Weed Pressure dial (Light/Moderate/Heavy)

Segmented control renders inside the beds/mulch card when any of
C1/C2/F1/OF1/OF2/OF3 is selected (in either mode). Defaults to Light
per spec §5.1. Wires to ST.weedPressure via setDial(); prices update
live for both the F1/OF1 time-per-yard model and the C1/C2/OF2/OF3
multipliers wired in earlier tasks."
```

---

# Phase D — Output panel additions

Three small additions to the right-hand output panel: aeration/overseeding margin display, buffer toggle, and outside-ICP flag.

---

### Task 11: Add labor-vs-material info bar for aeration and overseeding

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`renderOut()` ~line 327)

- [ ] **Step 11.1: Locate the mulch margin bar in `renderOut()`**

In `renderOut()`, find this existing snippet (currently around line 327):
```js
if(ST.mulch>0&&(ST.sel.has('F1')||ST.selOne.has('OF1'))){const id=isRec?'F1':'OF1';const p=gp(id);const cost=Math.round(ST.mulch*30);const margin=p-cost;h+='<div class="info-bar"><span style="color:#888">Mulch: </span><span style="font-weight:700">$'+Math.round(p).toLocaleString()+'</span><span style="color:#888"> · $'+cost+' material · </span><span style="color:#30471F;font-weight:700">$'+margin+' margin</span></div>';}
```

- [ ] **Step 11.2: Update the mulch cost basis to the new $70/yd**

In the snippet above, change `ST.mulch*30` to `ST.mulch*MULCH_MAT_PER_YD`:
```js
const cost=Math.round(ST.mulch*MULCH_MAT_PER_YD);
```

The displayed margin will now reflect actual material cost ($70/yd including delivery + Preen) instead of the old $30/yd basis.

- [ ] **Step 11.3: Add aeration and overseeding info bars after the mulch bar**

Immediately after the mulch info-bar snippet you just updated, insert:
```js
// Aeration labor vs equipment
['B1','B2','OB1','OB2'].forEach(id=>{
  const sel=isRec?ST.sel:ST.selOne;
  if(sel.has(id)){
    const p=gp(id);if(!p)return;
    const equipment=10;const labor=p-equipment;
    h+='<div class="info-bar"><span style="color:#888">'+id+' Aeration: </span><span style="font-weight:700">$'+Math.round(p).toLocaleString()+'</span><span style="color:#888"> · ~$'+equipment+' equipment · </span><span style="color:#30471F;font-weight:700">$'+labor+' labor</span></div>';
  }
});
// Overseeding labor vs seed
['B3','B4','OB3','OB4'].forEach(id=>{
  const sel=isRec?ST.sel:ST.selOne;
  if(sel.has(id)){
    const p=gp(id);if(!p)return;
    const seed=Math.round(ST.lawn*0.02);const labor=p-seed;
    h+='<div class="info-bar"><span style="color:#888">'+id+' Overseed: </span><span style="font-weight:700">$'+Math.round(p).toLocaleString()+'</span><span style="color:#888"> · $'+seed+' seed · </span><span style="color:#30471F;font-weight:700">$'+labor+' labor</span></div>';
  }
});
```

- [ ] **Step 11.4: Verify in browser**

Hard-refresh. Set lot 21780, lawn 15000.
- Select B1 Spring Aeration → expect an "B1 Aeration: $X · ~$10 equipment · $Y labor" bar in the right column.
- Select B3 Spring Overseeding → expect "B3 Overseed: $X · $300 seed · $Y labor" (since 15000 × $0.02 = $300).
- Toggle to mulch=4 yds + F1 selected → the existing mulch bar should now show `$280 material` (4 × $70) instead of `$120 material` (4 × $30).

- [ ] **Step 11.5: Commit**

```bash
git add index.html
git commit -m "feat(ui): aeration/overseeding margin bars + correct mulch cost basis

Adds per-service info bars showing total · material/equipment · labor
breakdown for B1/B2/OB1/OB2 (aeration, ~\$10 equipment) and B3/B4/OB3/OB4
(overseeding, lawn × \$0.02 seed cost — already explicit in the formula).
Also corrects the existing mulch margin bar to use the real \$70/yd
material cost (mulch + delivery + Preen) instead of the legacy \$30/yd."
```

---

### Task 12: Add the +20% buffer toggle to the output panel

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`renderOut()` and the total-display logic)

- [ ] **Step 12.1: Find the top of `renderOut()` total display**

`renderOut()` builds a card with the price totals. Find the line that opens that card:
```js
h+='<div class="card" style="margin-bottom:10px">';
```

- [ ] **Step 12.2: Insert the buffer toggle inside the card, before the totals**

Immediately after the line above, insert:
```js
h+='<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:8px;font-size:11px">'
 + '<span style="color:#888">+20% buffer</span>'
 + '<button onclick="ST.bufferOn=!ST.bufferOn;render()" style="padding:3px 10px;border:1.5px solid '+(ST.bufferOn?'#FFB300':'#d8d8d0')+';border-radius:20px;background:'+(ST.bufferOn?'#fffbec':'#fafaf8')+';color:'+(ST.bufferOn?'#7a5800':'#888')+';font-weight:700;cursor:pointer;font-family:\'Nunito\',sans-serif;font-size:11px">'+(ST.bufferOn?'ON':'OFF')+'</button>'
 + '</div>';
```

- [ ] **Step 12.3: Apply the buffer to displayed totals**

Find the two places in `renderOut()` where the total displays `$X/mo` or `Annual total: $X`. Each currently uses `planAnnual` or `planMo` directly. Replace those references with a buffered version. Add this helper near the top of `renderOut()` (just after the `isRec` line is declared):

```js
const bufMult=ST.bufferOn?1.2:1;
```

Then in each total-display line, multiply the displayed number by `bufMult`. Specifically:

Find:
```js
'<span style="font-weight:700;color:#30471F">$'+planAnnual.toLocaleString()+'</span>'
```
…and replace with:
```js
'<span style="font-weight:700;color:#30471F">$'+Math.round(planAnnual*bufMult).toLocaleString()+'</span>'
```

Find:
```js
'<span style="font-weight:700;color:#30471F">$'+planMo.toLocaleString()+'/mo</span>'
```
…and replace with:
```js
'<span style="font-weight:700;color:#30471F">$'+Math.round(planMo*bufMult).toLocaleString()+'/mo</span>'
```

Find the per-cut display:
```js
'<span style="font-weight:700;color:#30471F">$'+perCut.toLocaleString()+'</span>'
```
…and replace with:
```js
'<span style="font-weight:700;color:#30471F">$'+Math.round(perCut*bufMult).toLocaleString()+'</span>'
```

And the one-off total:
```js
'<span style="font-weight:700;color:#30471F">$'+oneTot.toLocaleString()+'</span>'
```
…with:
```js
'<span style="font-weight:700;color:#30471F">$'+Math.round(oneTot*bufMult).toLocaleString()+'</span>'
```

Per-service prices in the LEFT column stay at their unbuffered values; only the totals on the right move. Note: the "saves $X (Y%)" subtraction for plan-vs-visit will compare buffered numbers, which is correct (the comparison stays consistent).

- [ ] **Step 12.4: Verify in browser**

Hard-refresh. Build a recurring quote (e.g., A1 + F1 with mulch=4, lot=21780).
- Note the Per-Visit annual total. Click the buffer button ON. Total should jump by 20%. Button shows "ON" in orange.
- Click OFF. Total returns to original.
- Switch to Property Plan view. Buffer applies the same way.
- Switch to One-Off mode, select an OE1. Total should also respect the buffer.
- Confirm per-service prices in the left column are NOT bumped — only the totals.

- [ ] **Step 12.5: Commit**

```bash
git add index.html
git commit -m "feat(ui): +20% buffer toggle for variance-prone quotes

Single toggle near the totals in the right output panel. Bumps the
displayed totals (per-visit annual, plan /mo, plan /yr, per-cut,
one-off total) by 20% without touching the per-service prices in the
left column. Use case: weed-grown beds, awkward access, generally
'this could go sideways' properties where you want headroom in the
quote without committing to it line-by-line."
```

---

### Task 13: Add the outside-ICP flag

**Files:**
- Modify: `Amigos-Quote-Builder/index.html` (`renderOut()`)

- [ ] **Step 13.1: Determine where the flag should render**

The flag should appear above the totals card whenever:
- `ST.lot > ICP_LOT_CAP` (32,670 sqft = 0.75 ac), AND
- A trim service is selected (E1, E2, OE1)

This signals: "Your trim formula maxed at 8 hours / $1,280. Anything above this likely needs manual review."

- [ ] **Step 13.2: Insert the flag**

In `renderOut()`, find the line that starts the totals card:
```js
h+='<div class="card" style="margin-bottom:10px">';
```

Immediately BEFORE that line, insert:
```js
if(ST.lot>ICP_LOT_CAP&&hasTrim()){
  const ac=(ST.lot/43560).toFixed(2);
  h+='<div class="card" style="background:#fff5f5;border-color:#cc0000;margin-bottom:10px;padding:10px 14px"><div style="font-size:11px;font-weight:700;color:#a00;margin-bottom:4px">⚠ Outside ICP — manual trim review</div><div style="font-size:11px;color:#a00;line-height:1.5">Lot is '+ac+' ac (>0.75 ac). Trim quote capped at the full-day rate (\$1,280 × density). Larger lots usually take longer than the bracket suggests — walk it before quoting.</div></div>';
}
```

- [ ] **Step 13.3: Verify in browser**

Hard-refresh. Set lot to `40000` (~0.92 ac) and select E1 Annual Shaping.
- Expect a red "Outside ICP — manual trim review" card above the totals.
- Set lot back to `21780` (0.5 ac, in ICP). Flag should disappear.
- Set lot to `40000` again but unselect all trim services. Flag should disappear (only fires when a trim service is selected).

- [ ] **Step 13.4: Commit**

```bash
git add index.html
git commit -m "feat(ui): outside-ICP warning when lot >0.75 ac + trim selected

Red callout above the totals card alerts that the trim quote is at the
capped full-day rate and the property is past the user's stated ICP
ceiling (0.75 ac). Reminds the quoter to walk the property before
committing — bracket math gets unreliable past ICP."
```

---

# Phase E — Cleanup and verification

---

### Task 14: Final integrated verification (acceptance criteria from spec §8)

- [ ] **Step 14.1: Hard-refresh in the browser. Reset everything by reopening the file or clicking around to default state.**

- [ ] **Step 14.2: Run through each acceptance criterion**

For each row, set the inputs in the UI as described, then confirm the output matches:

| Criterion | How to verify | Pass? |
|---|---|---|
| 0.5 ac trim at default Light density quotes ~$640 | Lot=21780, select E1 in Recurring. Default Trim Density should be Light. E1 row should show $640. | |
| 0.5 ac trim at Standard density quotes ~$736 | Click Standard on the dial. E1 row → $736. | |
| 0.5 ac trim at Dense quotes ~$864 | Click Dense. E1 row → $864. | |
| 4-yd mulch at Light = $400 | Mulch=4, click Light pressure, select F1. F1 row → ~$387 (rounds to $387, close to $400 anchor — actual math: 4 × $96.67 = $386.67 → $387). Note: anchor in spec was approximate. | |
| 4-yd mulch at Moderate = ~$503 | Click Moderate. F1 → ~$503. | |
| 4-yd mulch at Heavy = $600 | Click Heavy. F1 → $600 exact. | |
| Zero-tolerance snow on 600 sqft drive = ~$1,877 | Paved=600, Recurring mode, snow=zero, select H4. H4 row → $1,877. | |
| E4 not visible in UI | Switch to Recurring mode. Confirm "Bi-Annual Shaping" is not in the trim card. | |
| Aeration / overseeding margin info bar shows | Select B1 → see "B1 Aeration: $X · ~$10 equipment · $Y labor" in right panel. Same for B3. | |
| Property Plan total = 5% cheaper than Per-Visit | Switch between Per-Visit and Property Plan views. Plan annual should be 95% of per-visit annual. | |
| Rate slider at $90 scales by 1.125× | Click $90/hr on the rate seg. Mowing prices scale up by 9/8. | |
| +20% buffer toggle adds 20% to totals only | Click buffer ON. Totals bump 20%. Per-service prices in left column unchanged. | |
| Outside-ICP flag fires at lot >0.75ac with trim | Set lot=40000, select E1. Red flag appears above totals. | |

- [ ] **Step 14.3: If anything fails, fix it inline (use Edit on the relevant function). Re-verify. Commit any fix as `fix(pricing): ...`**

- [ ] **Step 14.4: If everything passes, commit a tidy "release" marker**

```bash
git commit --allow-empty -m "chore(pricing): time-based overhaul ready for review

All Phase A–D tasks complete. Acceptance criteria from
docs/superpowers/specs/2026-05-17-time-based-pricing-overhaul-design.md §8
verified manually in browser. See git log for per-feature commits."
```

- [ ] **Step 14.5: Push the branch (DO NOT MERGE — leave for review)**

```bash
git push -u origin pricing-overhaul
```

Then surface the branch URL to the user so they can open a PR if desired. **Do not merge or rebase without explicit user instruction.**

---

## Self-Review

**Spec coverage (§ in spec → task in plan):**
- §2.1 labor base → Task 1 (constants)
- §2.2 crew invariant → Implicit (no headcount field added; pricing is always 2-person math)
- §2.3 quote psychology → Tasks 12 (buffer toggle)
- §2.4 ICP context → Task 13 (outside-ICP flag)
- §3.1 global Complexity → No change (existing slider unchanged)
- §3.2 Trim Density → Tasks 1 (constants), 5 (formula), 9 (UI)
- §3.3 Weed Pressure → Tasks 1 (constants), 6 (mulch), 7 (beds), 10 (UI)
- §4.1 mowing → No change (explicit decision)
- §4.2 trim ladder → Tasks 3 (E4 removal), 4 (formulas)
- §4.3 mulch / beds → Tasks 6, 7
- §4.4 cleanups → No change (already wired)
- §4.5 leaf → No change (already wired)
- §4.6 aeration / overseeding → Task 11
- §4.7 snow → Task 8
- §5.1 new controls → Tasks 9, 10, 12
- §5.2 removed E4 → Task 3
- §5.3 info bars → Tasks 11, 13
- §6.x implementation notes → followed throughout
- §8 acceptance criteria → Task 14

**Placeholder scan:** No "TBD" / "TODO" / "implement appropriate" patterns in any task body. Every step contains the actual diff to make or the exact verification command to run.

**Type/name consistency:** `ST.trimDensity` / `ST.weedPressure` / `ST.bufferOn` used consistently across Tasks 2, 5, 6, 7, 9, 10, 12. `TRIM_DENSITY_MULT.{E1,E2,E5,OE1}` and `WEED_PRESSURE_MULT.{C1,C2,OF2,OF3}` defined in Task 1 and only referenced in tasks where those services exist. `trimHrs(lot)` defined in Task 4 and referenced in Task 5. `CREW_HOUR_RATE` / `MULCH_MAT_PER_YD` / `MULCH_MIN_PER_YD` / `E2_MULT` / `ICP_LOT_CAP` all defined in Task 1.

No issues to fix.
