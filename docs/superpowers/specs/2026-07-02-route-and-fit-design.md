# Route & Fit — Design Spec

**Date:** 2026-07-02
**Project:** Amigos Quote Builder (`index.html`)
**Status:** Approved design, pending spec review

## Purpose

When a lead comes in, answer two questions inside the existing quote builder,
using data the tool already collects and **without adding any required API**:

1. **Should we take this property?** — an ICP verdict driven by the real
   accept/reject rule (drive-time service area + affluence + simplicity).
2. **If yes, which route does it join?** — match the property against the
   footprint of the existing Jobber routes.

The verdict and route suggestion appear in a new **"Route & Fit"** panel in the
existing right-hand column, under the map. Everything is a suggestion; the user
always decides.

## Source of truth for the ICP rule

From Notion, SOP Capture DB → *ICP & Lead Qualifier Capture*
(added 2026-06-15). The rule the user "could never put into words" is the
**Service Area hard route filter**:

> A property is in the service area only if a crew can get there in **20 minutes
> or less** of drive time, **without any expressway/interstate/on-ramp/off-ramp**,
> and **without any tolls/tollways** — surface streets only, from base
> **352 Roosevelt Rd, Glen Ellyn, IL 60137**.

Reason: the crew tows a truck + trailer; highway merging and tolls with a trailer
are slow and risky. Softer signals from the same SOP: recurring-maintenance
service fit (yes) vs one-time rescue/chemical (no), and standard-suburban
property fit ("a direction, not a hard rule").

The user's dream ICP, in their words: affluent neighborhood, home value near
**$1,000,000**, small/simple/low-complexity property, within the drive-time rule.
They will do mowing **or** landscaping for any property that fits.

## What the tool already has (reuse, don't rebuild)

- **Home value** input (`iHv` → `ST.homeVal`, in thousands) — line ~124.
- **Complexity** Low/Med/High (`ST.complex`).
- **Lot size / leaf** inputs.
- **`getAvatar()`** — an existing green/yellow/red ICP scorer using homeVal
  ($700K–$1.5M sweet spot), lot (0.23–0.5 ac), complexity, leaf.
- **Geocoding** — Nominatim lookup returns lat/lng **and** town/postcode for the
  quoted address (already fetched for the map + DuPage GIS parcel call).

The new panel **absorbs and upgrades `getAvatar()`** into one unified verdict
rather than duplicating scoring logic.

## Components

### 1. Route data file — `routes.json`

Produced by the coworker's Jobber-connected agent (separate session/tool). One
entry per active client:

```json
{
  "generatedAt": "2026-07-02",
  "base": { "address": "352 Roosevelt Rd, Glen Ellyn, IL 60137", "lat": null, "lng": null },
  "blacklist": ["Villa Park"],
  "routes": [
    { "name": "Wheaton North", "stops": [
      { "address": "123 Main St, Wheaton IL", "lat": 41.87, "lng": -88.10 }
    ]}
  ]
}
```

- If the export includes lat/lng, use it directly.
- If it only has addresses, the tool geocodes each **once** (Nominatim) and
  **caches** the result back so it never re-geocodes.
- `base.lat/lng` geocoded once and cached the same way.
- Drop-in replace the file whenever routes change.

### 2. Service-area gate (hard) — pluggable

Signature (fixed, so the implementation can be swapped without touching callers):

```
checkServiceArea(pin) -> { status: 'in' | 'borderline' | 'out',
                           distanceMi?, driveMin?, method: 'proxy' | 'api',
                           note? }
```

- **v1 (ships now, no API):** straight-line (haversine) distance from base.
  - 🟢 `in` ≤ ~6 mi · 🟡 `borderline` ~6–8 mi · 🔴 `out` > 8 mi.
  - Thresholds are named constants, tunable.
  - On `borderline`, show the honest caveat: *"proxy can't see highways/tolls —
    check the surface-street route."*
- **v2 (optional, drop-in later):** real directions API (e.g. OpenRouteService
  free tier or Google Directions) with **avoid highways + avoid tolls**, returning
  true surface-street `driveMin`. Same signature; only the internals change.

### 3. Neighborhood blacklist (hard)

- Editable `blacklist` array of town names in `routes.json`.
- Matched against the **town** the geocoder already returns for the address.
- If the property's town is blacklisted → verdict is 🔴 regardless of other
  signals, with reason "blacklisted area."
- Same machinery can be inverted to an allowlist of affluent towns later.

### 4. ICP soft fit (direction, not gate)

Reuses/extends `getAvatar()` inputs:
- **Home value** near the affluent sweet spot (~$700K–$1.5M, centered ~$1M).
- **Property simplicity** — lot size + complexity.
- **Service fit** — recurring maintenance (good) vs one-time/chemical (flag).

These produce non-blocking badges, never a hard reject.

### 5. Route match (Approach C — density-weighted, R = 1 mile)

Runs only when the gate is not 🔴.

- For each route vs the property pin:
  - `density` = count of that route's stops within **1 mi** (haversine).
  - `nearestMi` = distance to the single closest stop.
- **Rank:** `density` desc, tie-break `nearestMi` asc.
- **Fallback:** if every route has `density = 0`, rank by pure `nearestMi` and
  flag "outlier — no route nearby."
- Output: best fit + runner-up(s) with their density and nearest-stop numbers.

## Unified verdict order

```
1. Service-area gate  (hard)  → 🔴 out  ⇒ stop, show reason
2. Neighborhood blacklist (hard) → 🔴 out ⇒ stop, show reason
3. ICP soft fit (home value / simplicity / service) → badges
4. Route match (Approach C) → best route + runners-up
```

## UI — "Route & Fit" panel

Sits in the existing right column, under the map. Client-side render, same style
as existing cards.

```
┌─ Route & Fit ──────────────────────────┐
│ 🟢 IN AREA · ~4.2 mi from base          │
│    (straight-line proxy — verify route) │
│                                         │
│ Best route: Wheaton North               │
│   6 stops within 1 mi · closest 0.3 mi  │
│ Runner-up: Glen Ellyn                   │
│   2 within 1 mi · closest 0.9 mi        │
│                                         │
│ ⚑ Recurring maintenance — good fit      │
│ ⚑ ~$1.0M home — on-avatar               │
└─────────────────────────────────────────┘
```

Blacklisted / out-of-area states replace the route block with the stop reason.

## Architecture / constraints

- **Pure client-side** inside `index.html`. No backend, no build step.
- **No required API** for v1. Reuses the lat/lng + town the tool already fetches.
- API is an **optional** upgrade for drive-time precision only (Component 2 v2);
  nothing else depends on it.

## Configuration / tunables

- Service-area thresholds (in/borderline/out miles).
- Route-match radius (default **1 mi**).
- Home-value sweet spot band.
- `blacklist` town list (data file, user-editable).

## Out of scope (YAGNI)

- No writing back to Jobber; no live Jobber sync.
- No auto-fetching home value (stays manual entry).
- No route-internal drive-time optimization / stop ordering.
- No re-clustering or re-proposing routes (keeps existing Jobber routes as truth).

## Testing

- Haversine + ranking: unit-check with known coordinates (nearest-stop, density,
  fallback, blacklist override, gate thresholds).
- Verdict order: property that is close but blacklisted → 🔴; outlier with no
  nearby stops → fallback nearest-stop; borderline distance → caveat shown.
- Manual: run a handful of real addresses (Wheaton client = in + right route;
  Villa Park = blacklisted; Elk Grove Village = out) and eyeball the panel.

## Open items

- Coworker's Jobber agent to export active clients → `routes.json`.
- User to finalize the `blacklist` town list.
- Decide if/when to wire the v2 directions API for the drive-time gate.
