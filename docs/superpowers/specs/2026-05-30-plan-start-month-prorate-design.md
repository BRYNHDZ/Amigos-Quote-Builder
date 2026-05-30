# Property Plan — mid-year start month

Add a "Plan start month" input to the Property Plan view so a customer joining mid-cycle is billed correctly.

## Rule of thumb (the user's framing)

> Mowing's the only thing prorated for the visits left. Everything else — mulch, aeration, cleanup, leaf — stays full price because you get the same job. Total's $X, split across the N months until March.

Snow is the exception: it prorates by months remaining in the Nov–Mar snow season.

## Cycle

Annual cycle = March → following February. Months until March:

| Start | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Months | 12 | 11 | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |

Formula: `m ≥ 3 ? 15 - m : 3 - m`.

## Mowing visits auto-fill

Weekly cuts, season ends late November. Picking a start month auto-fills `ST.visitsRemain` and the visible input. User can override.

| Start | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Visits | 35 | 30 | 26 | 22 | 17 | 13 | 8 | 4 | 1 | 0 | 0 | 0 |

## Snow — no discount, no proration

Snow services (H1–H4) charge the same on a Plan as they do Per-Visit. No 5% plan discount, no mid-year proration. Reason: the 5% plan discount is small and the real value of the plan is the prepay structure, not the per-line discount — snow doesn't need it.

## Pricing flow

When in Plan view with `planStartMonth !== 3`:
- Mowing (A1/A2) — already prorates via `visits/35`. No change beyond auto-fill.
- All other plan services — full annual × `PLAN_DISCOUNT`. No change.
- Snow services — full per-visit price, never discounted.
- Monthly display divisor: `planMonths()` (replaces hardcoded `/12`).

## UI

New row appears between the `Per-Visit / Property Plan` toggle and the main two columns, only when `mode === 'recurring' && recView === 'plan'`:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Plan start month: [ March (full year) ▼ ]  · 8 months · 17 mowing   │
│                                              visits · snow ×0.80    │
└─────────────────────────────────────────────────────────────────────┘
```

The hint on the right auto-updates from current state (uses `ST.visitsRemain` so manual overrides reflect immediately).

## State

Add `ST.planStartMonth: 3` (default = March = full cycle).

## Non-goals

- No change to Per-Visit view.
- No change to One-Off mode.
- No change to which services are in plan / per-visit. Same `PLAN_SVCS` list.
- No change to plan discount (still 5%).
