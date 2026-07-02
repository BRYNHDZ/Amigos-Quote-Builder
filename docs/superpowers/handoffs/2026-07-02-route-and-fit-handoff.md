# Route & Fit — Shipped & Live

**Status:** Done and live. Merged to `main` via PR #6 (`766db50`) and deployed to GitHub Pages **via a new GitHub Actions workflow** (the legacy Jekyll builder was failing — see "Deploy change" below, it's load-bearing).

**Branch state:** `route-and-fit` is merged and deleted (remote + local). Working tree is on `main`. Two follow-up commits landed directly on `main` after the merge to fix deployment: `184f705` (`.nojekyll`) and `38144a5` (Actions workflow).

**Live site:** https://brynhdz.github.io/Amigos-Quote-Builder/ — verified serving the new version (`route-fit.js`, `routes.json`, `#fitBox` panel, `escHtml` hardening all 200).

---

## What shipped this session

A **Route & Fit** panel in the Quote Builder. When you look up a property address, a card appears **under the map** answering two questions:

1. **Should we take it?** — a service-area gate + neighborhood blacklist.
2. **Which route does it join?** — density-ranked suggestion across the existing Routes A–E.

Everything is a suggestion; the human always decides. Fully client-side, **no required APIs for v1** (only the Nominatim geocode the tool already did).

### The model (what it computes)

- **Service-area gate (the accept/decline rule).** Straight-line ("haversine") distance from base **352 Roosevelt Rd, Glen Ellyn**. Thresholds (tunable constants): 🟢 IN ≤ **6 mi** · 🟡 BORDERLINE ≤ **8 mi** · 🔴 OUT > **8 mi**. This is a **proxy** for the real rule from the Notion SOP *ICP & Lead Qualifier Capture*: reachable in **20 min on surface streets, no expressway, no tolls**. The gate is a **pluggable seam** (`classifyServiceArea(pin, base, cfg)` stamps `method:'proxy'`) so a real directions API can drop in later without touching callers.
- **Neighborhood blacklist (service-scoped).** `routes.json → blacklist`. Entry is either a town string (blocks **both** services) or `{town, scope:'mowing'|'landscaping'|'both'}`. Only `both` hard-stops (nulls the route suggestion); `mowing`/`landscaping` just warn and still rank routes. **Currently empty** — Brayan is still deciding which towns (Villa Park at minimum) are mowing-only vs both.
- **Route match (Approach C — density-weighted).** For the pin: count each route's stops within **1 mi** (`density`); rank by density desc, tie-break nearest stop asc; fall back to pure nearest-stop when no route has a stop within 1 mi (flagged "outlier"). Reads like *"Best route: Route B — 12 stops within 1 mi · closest 0.34 mi."*

### Implementation (files)

- **`route-fit.js`** (NEW) — pure UMD logic module, browser global `RouteFit` + Node CommonJS. `haversineMi`, `classifyServiceArea`, `matchBlacklist`, `rankRoutes`, `computeFit`. ES5-style to match `index.html`. **14 unit tests** in `tests/route-fit.test.js` (`node --test`), all passing.
- **`routes.json`** (NEW) — 97 real customers across Routes A–E, shaped from the Jobber "Recurring Jobs" CSV (route letter parsed from the job title). Geocoded lat/lng baked in. **92/97 geocoded**; 5 grid-style DuPage addresses (`1N544 Bob O Link Dr`, `26W021 Quail Run Dr`, `1228 Champion Forest Ct`, `22W141 Arbor Ln`, `3S201 Sequoia Dr`) don't resolve on Nominatim and are silently skipped by ranking.
- **`scripts/geocode-routes.mjs`** (NEW) — one-time offline geocoder. Idempotent (only fills missing coords), 1.1s/req (Nominatim policy), try/catch-guarded. **Re-run this after adding new clients.**
- **`index.html`** (MODIFIED) — loads the module + data, captures the looked-up address's lat/lng + town from a Nominatim `addressdetails=1` call into `ST.fitGeo`, renders the panel via `renderFit()` under the existing `#avBox`. External `town` is HTML-escaped (`escHtml`). Existing avatar/map/pricing untouched.

---

## Deploy change (LOAD-BEARING — read before touching Pages)

**GitHub Pages no longer uses the legacy Jekyll builder. It deploys via GitHub Actions.**

- After the merge, the **legacy builder failed instantly** (`duration:0`, opaque "Page build failed") on every build. Root cause was the legacy builder itself, not our content — proven: `.nojekyll` didn't help, the odd `#`-named lock file was in the *successful* June build too, and `duration:0` means it died before parsing any file.
- Fix: switched Pages source to **GitHub Actions** (`build_type: workflow`) and added **`.github/workflows/deploy-pages.yml`** (`upload-pages-artifact` path `.` + `deploy-pages`). Runs on every push to `main`.
- **Implication for future sessions:** deploys now happen through the Actions run, not a Jekyll build. Check `gh run list` for deploy status. If a deploy fails, you get **real logs** (unlike the old builder). `.nojekyll` is still in the repo and harmless.

---

## Locked decisions

- **Base = 352 Roosevelt Rd, Glen Ellyn.** All distances measured from here.
- **Gate thresholds:** 6 mi IN / 8 mi BORDERLINE / >8 OUT (straight-line proxy). Tunable constants in `route-fit.js` (`SERVICE_AREA`).
- **Route-match radius = 1 mile**, Approach C (density + nearest tie-break + fallback).
- **Blacklist is service-scoped;** only `both` hard-stops.
- **No required browser APIs for v1.** Home value stays manually entered (no Zillow fetch). Keep the tool simple; APIs are opt-in upgrades behind the existing seam.
- **Routes are the existing Jobber routes** (kept as-is, not re-clustered). Book is 4 towns: Glen Ellyn 55, Wheaton 37, Lombard 4, Winfield 1 — all affluent DuPage core.
- **Density can disagree with historical assignment for border properties** (a Route A address in dense Route B territory suggests B, with A as runner-up). This is intended "not too rigid" behavior — always shows runner-ups.

---

## What's NOT done / follow-ups (all optional, none blocking)

1. **Fill in `blacklist` towns** in `routes.json`. Currently empty. Brayan wanted to think about mowing-only vs both per town (Villa Park, Glendale Heights, Addison, etc.). Drop-in edit, no code.
2. **`197 Hill Avenue`** was billing-only in the CSV; assigned to Route B by neighbor inference — confirm if a routing question ever comes up.
3. **v2 directions API** for the drive-time gate (real 20-min surface-street time avoiding highways/tolls). The seam is ready; Brayan said he "may consider adding the API for the route." Not built.
4. **Re-geocode on new clients:** re-export the Jobber CSV, reshape into `routes.json` (route letter from job title, dedupe, normalize city), then `node scripts/geocode-routes.mjs`. The 5 grid-style addresses will keep missing.

---

## File pointers

- Current code: `index.html` (single file) + `route-fit.js` (logic) + `routes.json` (data)
- Geocoder: `scripts/geocode-routes.mjs`
- Tests: `tests/route-fit.test.js` (`node --test tests/route-fit.test.js` → 14/14)
- Deploy: `.github/workflows/deploy-pages.yml`
- Design spec: `docs/superpowers/specs/2026-07-02-route-and-fit-design.md`
- Plan: `docs/superpowers/plans/2026-07-02-route-and-fit.md`
- This handoff: `docs/superpowers/handoffs/2026-07-02-route-and-fit-handoff.md`
- Source of the ICP rule: Notion → SOP Capture DB → *ICP & Lead Qualifier Capture*
- Live site: https://brynhdz.github.io/Amigos-Quote-Builder/ (deploys from `main` via GitHub Actions)

---

## How to resume the conversation

```
User: "let's keep going on the quote builder"
You:  Read this handoff. Summarize in 2 lines: "Last session shipped Route & Fit —
      the ICP accept/decline gate + density route suggestion, live on GitHub Pages
      (now deployed via Actions, not the old Jekyll builder). Still open: fill in the
      blacklist towns, and optionally wire the real drive-time API. Which direction?"
      Wait for answer. Don't pre-empt.
```
