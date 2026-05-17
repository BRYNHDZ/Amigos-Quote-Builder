# Flow / UI Overhaul — Work in Progress

**Status:** Mid-brainstorm. Branch `flow-overhaul` created (off `main` at commit `793f95d`). No code changes yet. User paused before approving the proposed design.

**To resume:** invoke `superpowers:brainstorming` skill, read this doc, jump straight to the "Pick up here" section below.

---

## Context the next session needs

The pricing overhaul shipped (PR #3 merged to main, see `2026-05-17-pricing-overhaul-handoff.md`). The user then asked for a separate UI/flow overhaul:

> "can u do a UI overhaul. i dont know exactly what i need but im not really a fan of the flow"

Branch created: `flow-overhaul`. Function changes are in scope, not just visual polish.

**Critical context the user shared mid-brainstorm:**

- **This tool is NEVER customer-facing.** It's internal-only. Don't optimize for customer presentation — optimize for the user (Brayan) at quote time.
- There is a SECOND repo `BRYNHDZ/AmigosEstimates` (public, ~25KB single file). It's a mobile-first "Drive-By Assessment" tool: qualitative inputs (Small/Medium/Large lawn, "About 2 hours" trim time, leaf scale 0–5, bush condition, bed condition, flags like 🔒 Gate / 🐕 Dogs / ⛰️ Hill / 🌺 Fragile / 💧 Sprinklers / 🚗 Hard to park). Output is a plain-text summary copied to clipboard. EN/ES support (currently hidden via `display:none`). No prices.
- User considered merging the two tools but **decided AGAINST it for now** — different physical contexts (phone on-site vs desktop in office), different mental models (qualitative vs quantitative), and a real merge would need a database/bridge to flow field data into pricing. Parked as a future project.
- User wants to **borrow aesthetic patterns from AmigosEstimates** into the Quote-Builder UI overhaul without merging the tools: icon section headers + the flags concept.

---

## What's been decided (lock these in)

1. **Flow pattern: "one page but progressive."** Same single-page structure as today, but later sections subdued/collapsed until earlier ones are filled. User explicitly chose this over wizard / sticky-rail / declutter-only alternatives.
2. **Per-Visit vs Property Plan toggle: gone.** Both numbers shown **side-by-side at all times** (no toggle to switch between them). User picked this over "keep toggle, make it obvious" and "drop Per-Visit entirely."
3. **Output panel must be decluttered.** Top three issues confirmed by user:
   - Too many info bars stacking (trim $/man-hr, mid-season, mulch margin, aeration margin, overseed margin, buffered total, plan-floor advisory, etc.)
   - Per-Visit/Plan toggle confusion (solved by side-by-side per #2)
   - Reference section at the bottom feels like noise
4. **Borrow from AmigosEstimates:**
   - Sectioned cards with icons (🏡 Property, 🌿 Services, 💰 Quote)
   - **Flags concept** as a new row in the Property section. Chips: `🔒 Gate` `🐕 Dogs` `⛰️ Hill on lawn` `💧 Sprinklers` `🌺 Fragile plants` `🚗 Hard to park`. Open question on behavior — see below.

---

## Proposed design (waiting on user approval)

**Three big sectioned cards stacked top-to-bottom:**

### 🏡 1. Property (always-on)
- Address + Look up + map (current behavior)
- Property numbers in tighter grid (lot, home, lawn, paved, mulch, trim, peren)
- Property-wide segments (rate, leaf, complexity, snow trigger)
- **New: Flags chip row** (see open question below)

### 🌿 2. Services (subdued until §1 has lot size; full-strength once it does)
- Mode bar (Recurring / One-Off) — tighter
- Category cards (Mowing / Trimming / Beds / Lawn Health / Cleanups / Leaf / Snow), each collapsed to compact header by default — tap to expand options
- Trim Density / Weed Pressure dials live INLINE within their relevant category cards (not as floating add-ons)

### 💰 3. Quote (right column on desktop, bottom-stacked on mobile)

Headline = two cards side by side:
```
┌────────────────────────┐  ┌────────────────────────┐
│ PER-VISIT              │  │ PROPERTY PLAN          │
│ $51/cut · $1,782/yr    │  │ $48/cut · $1,694/yr    │
│                        │  │ saves $89 (5%)         │
└────────────────────────┘  └────────────────────────┘
```

- `+20% buffer` toggle stays near these cards. When ON, adds a third yellow card with the buffered total.
- **ONE collapsible section below**: `▸ Internal details (margins, breakdowns, advisories)` — closed by default. Inside: mulch margin / aeration labor split / overseed seed cost / mid-season proration / below-plan-floor advisory / trim $/man-hr metric.
- **Outside-ICP red flag** stays prominent ABOVE the headline cards (not buried in expand).
- **Reference section** ("Line Items & Subtitles") becomes a small `?` link in the top-right of the Quote card → opens as a slide-in drawer or modal. No longer column-stacked.

---

## Pick up here

Last message I sent to the user proposed the design above and asked them to pick **one of two paths**:

1. **Sign off on this text design** and I build it directly into `index.html` (full implementation, no mockup intermediate).
2. **I generate a static mockup HTML** at `mockups/flow-overhaul-v1.html` first so they can see/click it before touching the real app. Slower, lower-risk.

**User did not answer — they ran out of time and asked for this handoff.** The very next move when they return is:
- Greet, summarize this doc in 2 lines
- Ask them path 1 vs path 2

---

## Open questions to ask once they're back

1. **Flag behavior:** Should flags just be informational notes in the output (like the AmigosEstimates "Things to Know" section), or should certain flags auto-bump pricing? E.g., `⛰️ Hill on lawn` could nudge Complexity from Low → Med. `🐕 Dogs` is information-only. User hasn't decided.
2. **Mobile layout:** User uses desktop primarily (inferred). Confirm mobile is a "secondary" target (stack everything vertically) and not worth heavy responsive engineering.
3. **Service category collapsing:** Does "tap to expand category" feel too clicky? Alternative: keep all categories visible like today but with the icon-header polish.
4. **Mockup path** (path 1 vs path 2 from above).

---

## Already considered and rejected

- **Wizard flow (Step 1 → 2 → 3)** — user preferred "one page but progressive" over strict wizard
- **Three sections with no gating (option C earlier)** — user wanted progressive, not just visual polish
- **Sticky quote rail + slide-out drawer (option B earlier)** — too disruptive to muscle memory; user picked progressive single-page over this
- **Merging AmigosEstimates and Quote-Builder into one app** — parked as future project (different contexts, needs DB bridge)
- **Dropping Per-Visit view entirely** — user prefers side-by-side over killing it

---

## Future / Day-Two ideas (don't do now)

- **Zero-DB bridge between AmigosEstimates and Quote-Builder**: AmigosEstimates already copies a text summary to clipboard. Quote-Builder could add a "Paste Assessment" button that parses that text and fills inputs. No database needed. Worth doing once UI overhaul is shipped.
- **Full merger of both apps** — bigger project, needs design pass of its own.
- **EN/ES support in Quote-Builder** — AmigosEstimates has the i18n pattern already; could port it.
- **Property memory** (the "would need a database" thing user mentioned): saved quotes per address, so you don't re-enter the same lot details twice.

---

## File pointers

- Current code: `index.html` (single file, vanilla HTML/JS)
- Pricing spec (just shipped): `docs/superpowers/specs/2026-05-17-time-based-pricing-overhaul-design.md`
- Pricing plan (just shipped): `docs/superpowers/plans/2026-05-17-time-based-pricing-overhaul.md`
- Pricing handoff (post-ship): `docs/superpowers/handoffs/2026-05-17-pricing-overhaul-handoff.md`
- AmigosEstimates source: `https://github.com/BRYNHDZ/AmigosEstimates` (public, branch `main`)
- This handoff: `docs/superpowers/handoffs/2026-05-17-flow-overhaul-WIP-handoff.md`
- Branch: `flow-overhaul` (off `main` at `793f95d`)

---

## How to resume the conversation

```
User: "let's continue the UI overhaul"
You:  /skill superpowers:brainstorming (or just continue if skill already loaded)
      Read this handoff doc.
      Summarize in 2 lines: "Picked up where we left off — design proposed, you were about to choose
      between (1) build directly into index.html or (2) static mockup first. Which?"
      Wait for answer.
```
