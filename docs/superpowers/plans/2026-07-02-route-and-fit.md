# Route & Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Route & Fit" panel to the Quote Builder that, from a looked-up address, gives an ICP accept/decline verdict (service-area drive gate + neighborhood blacklist) and suggests which existing Jobber route the property joins.

**Architecture:** Pure decision logic lives in a new browser+Node module `route-fit.js` (haversine distance, service-area classification, blacklist matching, density-weighted route ranking) so it is unit-testable in Node with zero DOM. `routes.json` (already built, 97 stops) is geocoded once by an offline Node script so the browser never geocodes route data. `index.html` loads the module + data, captures the quoted address's lat/lng + town from the existing Nominatim call, and renders the panel under the map.

**Tech Stack:** Vanilla ES5-compatible JS (matches existing `index.html`), Node's built-in `node:test` + `node:assert` for tests (no dependencies), Node global `fetch` for the offline geocoder.

## Global Constraints

- **No browser-required external APIs** — v1 uses the straight-line proxy; the only browser network call is the existing Nominatim geocode of the single quoted address. Copied from spec: *"No required API for v1."*
- **Client-side only** — everything runs in `index.html`; no backend, no build step for the app itself. The geocoder is a one-time offline maintenance script.
- **Match existing code style** — single-quote strings, terse vanilla JS, ES5-safe (no `import` in browser code); the file uses `var`/`function` and inline styles.
- **Service-area rule (verbatim from SOP):** in-area = reachable in 20 min on surface streets from **352 Roosevelt Rd, Glen Ellyn, IL 60137**, no expressway, no tolls. v1 proxy thresholds: 🟢 ≤ 6 mi, 🟡 ≤ 8 mi, 🔴 > 8 mi straight-line (tunable constants).
- **Route-match radius:** 1 mile (density count), tie-break nearest stop, fallback to nearest-stop when all densities are 0.
- **Blacklist is service-scoped:** entry is a string (blocks both) or `{ town, scope: 'mowing'|'landscaping'|'both' }`. `both` hard-stops; partial scopes warn and still show the route match.

---

## File Structure

- **Create `route-fit.js`** — pure logic module (browser global `RouteFit` + Node `module.exports`). Tasks 1–4.
- **Create `tests/route-fit.test.js`** — `node:test` unit tests. Tasks 1–4.
- **Create `scripts/geocode-routes.mjs`** — one-time offline geocoder that fills `lat`/`lng` into `routes.json` (stops + base). Task 5.
- **Modify `routes.json`** — gains `lat`/`lng` per stop and on `base` (via Task 5 script).
- **Modify `index.html`** — load module + data, capture `ST.fitGeo`, add `#fitBox`, `renderFit()`. Task 6.

---

### Task 1: Geo module scaffolding + haversine + service-area gate

**Files:**
- Create: `route-fit.js`
- Test: `tests/route-fit.test.js`

**Interfaces:**
- Produces: `RouteFit.haversineMi(a, b)` where `a`/`b` are `{lat:Number, lng:Number}` → `Number` (miles). `RouteFit.classifyServiceArea(pin, base, cfg?)` → `{status:'in'|'borderline'|'out', distanceMi:Number, method:'proxy'}`. `RouteFit.SERVICE_AREA = {inMi:6, borderlineMi:8}`.

- [ ] **Step 1: Write the failing test**

Create `tests/route-fit.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const RouteFit = require('../route-fit.js');

test('haversineMi ~69 mi per degree longitude at equator', () => {
  const d = RouteFit.haversineMi({lat:0,lng:0}, {lat:0,lng:1});
  assert.ok(Math.abs(d - 69.17) < 0.6, 'got ' + d);
});

test('haversineMi is zero for identical points', () => {
  assert.strictEqual(RouteFit.haversineMi({lat:41.87,lng:-88.06},{lat:41.87,lng:-88.06}), 0);
});

test('classifyServiceArea buckets by straight-line distance', () => {
  const base = {lat:0,lng:0};
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0.05}, base).status, 'in');       // ~3.5 mi
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0.1}, base).status, 'borderline'); // ~6.9 mi
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0.2}, base).status, 'out');        // ~13.8 mi
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0.05}, base).method, 'proxy');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/route-fit.test.js`
Expected: FAIL — `Cannot find module '../route-fit.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `route-fit.js`:

```js
// route-fit.js — pure Route & Fit logic. Browser global `RouteFit` + Node module.
(function (root) {
  'use strict';

  var SERVICE_AREA = { inMi: 6, borderlineMi: 8 }; // straight-line proxy thresholds (mi)
  var ROUTE_RADIUS_MI = 1;

  function haversineMi(a, b) {
    var R = 3958.8; // earth radius, miles
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLng = (b.lng - a.lng) * toRad;
    var la1 = a.lat * toRad, la2 = b.lat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function classifyServiceArea(pin, base, cfg) {
    cfg = cfg || SERVICE_AREA;
    var d = haversineMi(pin, base);
    var status = d <= cfg.inMi ? 'in' : (d <= cfg.borderlineMi ? 'borderline' : 'out');
    return { status: status, distanceMi: Math.round(d * 10) / 10, method: 'proxy' };
  }

  var api = {
    haversineMi: haversineMi,
    classifyServiceArea: classifyServiceArea,
    SERVICE_AREA: SERVICE_AREA,
    ROUTE_RADIUS_MI: ROUTE_RADIUS_MI
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouteFit = api;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/route-fit.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add route-fit.js tests/route-fit.test.js
git commit -m "feat(route-fit): haversine + service-area gate with tests"
```

---

### Task 2: Neighborhood blacklist matching

**Files:**
- Modify: `route-fit.js`
- Test: `tests/route-fit.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RouteFit.matchBlacklist(town, blacklist)` → `{blocked:Boolean, scope:'both'|'mowing'|'landscaping'|null, label:String}`. `blacklist` is an array whose entries are either a town `String` (scope `both`) or `{town:String, scope?:String}`.

- [ ] **Step 1: Write the failing test**

Append to `tests/route-fit.test.js`:

```js
test('matchBlacklist: string entry blocks both services', () => {
  const r = RouteFit.matchBlacklist('Villa Park', ['Villa Park']);
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.scope, 'both');
  assert.match(r.label, /mowing \+ landscaping/);
});

test('matchBlacklist: object entry with mowing scope', () => {
  const r = RouteFit.matchBlacklist('lombard', [{town:'Lombard', scope:'mowing'}]);
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.scope, 'mowing');
  assert.match(r.label, /no new mowing/);
});

test('matchBlacklist: unlisted town is not blocked', () => {
  const r = RouteFit.matchBlacklist('Wheaton', ['Villa Park', {town:'Lombard', scope:'mowing'}]);
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.scope, null);
});

test('matchBlacklist: handles empty/undefined blacklist', () => {
  assert.strictEqual(RouteFit.matchBlacklist('Wheaton', []).blocked, false);
  assert.strictEqual(RouteFit.matchBlacklist('Wheaton').blocked, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/route-fit.test.js`
Expected: FAIL — `RouteFit.matchBlacklist is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `route-fit.js`, add these functions above the `var api = {` line:

```js
  function normTown(s) { return (s || '').toString().trim().toLowerCase(); }

  function matchBlacklist(town, blacklist) {
    var t = normTown(town);
    var entries = (blacklist || []).map(function (e) {
      return typeof e === 'string'
        ? { town: e, scope: 'both' }
        : { town: e.town, scope: e.scope || 'both' };
    });
    for (var i = 0; i < entries.length; i++) {
      if (normTown(entries[i].town) === t && t !== '') {
        var scope = entries[i].scope;
        var label = scope === 'both' ? 'out — mowing + landscaping'
                  : scope === 'mowing' ? 'no new mowing · landscaping OK'
                  : 'no new landscaping · mowing OK';
        return { blocked: true, scope: scope, label: label };
      }
    }
    return { blocked: false, scope: null, label: '' };
  }
```

Then add `matchBlacklist: matchBlacklist,` inside the `var api = {` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/route-fit.test.js`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add route-fit.js tests/route-fit.test.js
git commit -m "feat(route-fit): service-scoped neighborhood blacklist matching"
```

---

### Task 3: Density-weighted route ranking (Approach C)

**Files:**
- Modify: `route-fit.js`
- Test: `tests/route-fit.test.js`

**Interfaces:**
- Consumes: `haversineMi`, `ROUTE_RADIUS_MI`.
- Produces: `RouteFit.rankRoutes(pin, routes, radiusMi?)` → `{ranked:Array<{name:String, density:Number, nearestMi:Number}>, fallback:Boolean}`. `routes` is `[{name, stops:[{lat,lng}]}]`. Stops missing numeric lat/lng are ignored; routes with no usable stop are dropped. Sorted by `density` desc then `nearestMi` asc. `fallback` is `true` when every route's density is 0.

- [ ] **Step 1: Write the failing test**

Append to `tests/route-fit.test.js`:

```js
test('rankRoutes ranks by density within radius, then nearest', () => {
  const pin = {lat:0, lng:0};
  const routes = [
    {name:'Route X', stops:[{lat:0,lng:0.005},{lat:0,lng:0.01}]}, // ~0.35 & ~0.69 mi -> density 2
    {name:'Route Y', stops:[{lat:0,lng:0.02}]}                    // ~1.38 mi -> density 0
  ];
  const r = RouteFit.rankRoutes(pin, routes, 1);
  assert.strictEqual(r.ranked[0].name, 'Route X');
  assert.strictEqual(r.ranked[0].density, 2);
  assert.strictEqual(r.fallback, false);
});

test('rankRoutes flags fallback when all densities are zero', () => {
  const pin = {lat:0, lng:0};
  const routes = [
    {name:'Far A', stops:[{lat:0,lng:0.05}]},  // ~3.5 mi
    {name:'Far B', stops:[{lat:0,lng:0.03}]}   // ~2.1 mi
  ];
  const r = RouteFit.rankRoutes(pin, routes, 1);
  assert.strictEqual(r.fallback, true);
  assert.strictEqual(r.ranked[0].name, 'Far B'); // nearest wins in fallback
});

test('rankRoutes ignores stops without coordinates', () => {
  const r = RouteFit.rankRoutes({lat:0,lng:0}, [
    {name:'Mixed', stops:[{address:'no coords'},{lat:0,lng:0.005}]}
  ], 1);
  assert.strictEqual(r.ranked[0].density, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/route-fit.test.js`
Expected: FAIL — `RouteFit.rankRoutes is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `route-fit.js`, add above `var api = {`:

```js
  function rankRoutes(pin, routes, radiusMi) {
    radiusMi = radiusMi || ROUTE_RADIUS_MI;
    var ranked = (routes || []).map(function (r) {
      var nearest = Infinity, density = 0;
      (r.stops || []).forEach(function (s) {
        if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
        var d = haversineMi(pin, s);
        if (d < nearest) nearest = d;
        if (d <= radiusMi) density++;
      });
      return {
        name: r.name,
        density: density,
        nearestMi: nearest === Infinity ? null : Math.round(nearest * 100) / 100
      };
    }).filter(function (r) { return r.nearestMi !== null; });

    var anyDensity = ranked.some(function (r) { return r.density > 0; });
    ranked.sort(function (a, b) {
      if (b.density !== a.density) return b.density - a.density;
      return a.nearestMi - b.nearestMi;
    });
    return { ranked: ranked, fallback: !anyDensity };
  }
```

Then add `rankRoutes: rankRoutes,` inside the `var api = {` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/route-fit.test.js`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add route-fit.js tests/route-fit.test.js
git commit -m "feat(route-fit): density-weighted route ranking with nearest-stop fallback"
```

---

### Task 4: `computeFit` orchestrator

**Files:**
- Modify: `route-fit.js`
- Test: `tests/route-fit.test.js`

**Interfaces:**
- Consumes: `classifyServiceArea`, `matchBlacklist`, `rankRoutes`.
- Produces: `RouteFit.computeFit(input, data)` where `input = {pin:{lat,lng}, town:String}` and `data = {base:{lat,lng}, blacklist:Array, routes:Array}` → `{area, blacklist, routes}`. `routes` is `null` when `area.status === 'out'` OR blacklist `scope === 'both'`; otherwise the `rankRoutes` result object.

- [ ] **Step 1: Write the failing test**

Append to `tests/route-fit.test.js`:

```js
const DATA = {
  base: {lat:0, lng:0},
  blacklist: ['Villa Park', {town:'Lombard', scope:'mowing'}],
  routes: [
    {name:'Route X', stops:[{lat:0,lng:0.005}]},
    {name:'Route Y', stops:[{lat:0,lng:0.02}]}
  ]
};

test('computeFit: in-area, unlisted town -> full route ranking', () => {
  const r = RouteFit.computeFit({pin:{lat:0,lng:0.03}, town:'Wheaton'}, DATA);
  assert.strictEqual(r.area.status, 'in');
  assert.strictEqual(r.blacklist.blocked, false);
  assert.ok(r.routes && r.routes.ranked.length === 2);
});

test('computeFit: out-of-area -> no route ranking', () => {
  const r = RouteFit.computeFit({pin:{lat:0,lng:0.3}, town:'Wheaton'}, DATA);
  assert.strictEqual(r.area.status, 'out');
  assert.strictEqual(r.routes, null);
});

test('computeFit: blacklisted both -> no route ranking', () => {
  const r = RouteFit.computeFit({pin:{lat:0,lng:0.03}, town:'Villa Park'}, DATA);
  assert.strictEqual(r.blacklist.scope, 'both');
  assert.strictEqual(r.routes, null);
});

test('computeFit: mowing-only blacklist still ranks routes', () => {
  const r = RouteFit.computeFit({pin:{lat:0,lng:0.03}, town:'Lombard'}, DATA);
  assert.strictEqual(r.blacklist.scope, 'mowing');
  assert.ok(r.routes && r.routes.ranked.length === 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/route-fit.test.js`
Expected: FAIL — `RouteFit.computeFit is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `route-fit.js`, add above `var api = {`:

```js
  function computeFit(input, data) {
    var area = classifyServiceArea(input.pin, data.base);
    var bl = matchBlacklist(input.town, data.blacklist);
    var routes = (area.status === 'out' || bl.scope === 'both')
      ? null
      : rankRoutes(input.pin, data.routes);
    return { area: area, blacklist: bl, routes: routes };
  }
```

Then add `computeFit: computeFit,` inside the `var api = {` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/route-fit.test.js`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add route-fit.js tests/route-fit.test.js
git commit -m "feat(route-fit): computeFit orchestrator combining gate, blacklist, routes"
```

---

### Task 5: Offline geocoder — bake lat/lng into `routes.json`

**Files:**
- Create: `scripts/geocode-routes.mjs`
- Modify: `routes.json` (populated by running the script)

**Interfaces:**
- Consumes: `routes.json` shape `{base:{address}, blacklist, routes:[{name, stops:[{address}]}]}`.
- Produces: same file with `lat`/`lng` added to `base` and to each geocodable stop. Stops that fail geocoding are left without coords and logged (they are simply skipped by `rankRoutes`).

- [ ] **Step 1: Write the script**

Create `scripts/geocode-routes.mjs`:

```js
// One-time offline geocoder for routes.json. Run: node scripts/geocode-routes.mjs
// Uses Nominatim (1 req/sec policy). Adds lat/lng to base + each stop; caches by leaving
// existing coords untouched so re-runs only fill gaps.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../routes.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(address);
  const res = await fetch(url, { headers: { 'User-Agent': 'AmigosQuoteBuilder/1.0 (route geocode)' } });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j || !j.length) return null;
  return { lat: +j[0].lat, lng: +j[0].lon };
}

async function ensureCoords(obj, label) {
  if (typeof obj.lat === 'number' && typeof obj.lng === 'number') return true;
  const g = await geocode(obj.address);
  await sleep(1100); // respect 1 req/sec
  if (g) { obj.lat = g.lat; obj.lng = g.lng; console.log('  ok  ', label, '->', g.lat, g.lng); return true; }
  console.log('  MISS', label, '(', obj.address, ')');
  return false;
}

let miss = 0;
console.log('Base:');
await ensureCoords(data.base, data.base.address);
for (const route of data.routes) {
  console.log(route.name + ':');
  for (const stop of route.stops) {
    const ok = await ensureCoords(stop, stop.address);
    if (!ok) miss++;
  }
}
data.generatedAt = data.generatedAt; // unchanged
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('\nDone. Missed geocodes:', miss);
```

- [ ] **Step 2: Run the geocoder**

Run: `node scripts/geocode-routes.mjs`
Expected: prints `ok`/`MISS` per stop; takes ~2 minutes (97 stops at ~1.1s each). A handful of grid-style addresses (e.g. `1N544 Bob O Link Dr`, `s41 Beverly St`) may `MISS` — that is acceptable; note the count.

- [ ] **Step 3: Sanity-check the output**

Run: `node -e "const d=require('./routes.json'); const all=d.routes.flatMap(r=>r.stops); console.log('base', d.base.lat, d.base.lng); console.log('stops with coords:', all.filter(s=>typeof s.lat==='number').length, '/', all.length);"`
Expected: base has numeric lat/lng near `41.87 / -88.06`; the large majority of stops have coords.

- [ ] **Step 4: Commit**

```bash
git add scripts/geocode-routes.mjs routes.json
git commit -m "feat(route-fit): offline geocoder + baked lat/lng into routes.json"
```

---

### Task 6: Wire the panel into `index.html`

**Files:**
- Modify: `index.html` (line 177 area, line 215, line 219, `lookupAddr` ~326, `render` ~428, boot ~429)

**Interfaces:**
- Consumes: `RouteFit.computeFit` (Task 4), `routes.json` (Task 5), the existing Nominatim geocode pattern in `parcelByPoint`.
- Produces: browser globals `ROUTE_DATA`, `ST.fitGeo = {lat, lng, town}`, functions `loadRouteData()`, `geocodeForFit(address)`, `renderFit()`; a `#fitBox` element.

This task is DOM glue with no unit test; it ends with a manual browser verification.

- [ ] **Step 1: Add the module script tag**

In `index.html`, immediately before line 215 (`<script>`), add:

```html
<script src="route-fit.js"></script>
```

- [ ] **Step 2: Add the panel container**

In `index.html`, immediately after line 177 (`<div id="avBox" ...></div>`), add:

```html
<div id="fitBox" style="display:none;margin-bottom:10px"></div>
```

- [ ] **Step 3: Add `fitGeo` to state**

In `index.html` line 219, inside the `ST` object literal, add `,fitGeo:null` before the closing `}`. For example change the trailing `...planStartMonth:3};` to `...planStartMonth:3,fitGeo:null};`.

- [ ] **Step 4: Add data loader + fit geocoder + renderer**

In `index.html`, inside the `<script>` block, immediately after the `const $=id=>document.getElementById(id);` line (line 216), add:

```js
let ROUTE_DATA=null;
async function loadRouteData(){
  try{ROUTE_DATA=await fetch('routes.json').then(r=>r.json());}catch(e){ROUTE_DATA=null;}
  renderFit();
}
async function geocodeForFit(a){
  try{
    const g=await fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q='+encodeURIComponent(a)).then(r=>r.json());
    if(!g||!g.length){ST.fitGeo=null;renderFit();return;}
    const ad=g[0].address||{};
    ST.fitGeo={lat:+g[0].lat,lng:+g[0].lon,town:ad.town||ad.city||ad.village||ad.hamlet||ad.municipality||''};
  }catch(e){ST.fitGeo=null;}
  renderFit();
}
function fitBadge(status){
  return status==='in'?{bd:'#30471F',bg:'#f5f9f4',fg:'#30471F',ic:'✓',txt:'IN AREA'}
    :status==='borderline'?{bd:'#FFB300',bg:'#fffbec',fg:'#7a5800',ic:'!',txt:'BORDERLINE'}
    :{bd:'#cc0000',bg:'#fff5f5',fg:'#a00',ic:'✕',txt:'OUT OF AREA'};
}
function renderFit(){
  const box=$('fitBox');if(!box)return;
  if(!ST.fitGeo||!ROUTE_DATA||typeof RouteFit==='undefined'){box.style.display='none';box.innerHTML='';return;}
  const v=RouteFit.computeFit({pin:{lat:ST.fitGeo.lat,lng:ST.fitGeo.lng},town:ST.fitGeo.town},ROUTE_DATA);
  const c=fitBadge(v.area.status);
  let h='<div style="background:'+c.bg+';border:1.5px solid '+c.bd+';border-radius:10px;padding:10px 14px">';
  h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><div style="width:20px;height:20px;border-radius:50%;background:'+c.bd+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">'+c.ic+'</div><div style="font-size:12px;font-weight:700;color:'+c.fg+'">'+c.txt+' · ~'+v.area.distanceMi+' mi from base</div></div>';
  h+='<div style="font-size:10px;color:#999;margin-bottom:6px">straight-line proxy — verify surface-street route (no highway/toll)</div>';
  if(v.blacklist.blocked){
    const bc=v.blacklist.scope==='both'?'#a00':'#7a5800';
    h+='<div style="font-size:11px;font-weight:700;color:'+bc+';margin-bottom:6px">⛔ '+(ST.fitGeo.town||'This town')+' — '+v.blacklist.label+'</div>';
  }
  if(v.routes&&v.routes.ranked.length){
    const top=v.routes.ranked.slice(0,3);
    if(v.routes.fallback){
      h+='<div style="font-size:11px;color:'+c.fg+'"><b>Outlier — no route within 1 mi.</b> Nearest: '+top[0].name+' ('+top[0].nearestMi+' mi)</div>';
    }else{
      const b=top[0];
      h+='<div style="font-size:12px;font-weight:700;color:#30471F;margin-bottom:2px">Best route: '+b.name+'</div>';
      h+='<div style="font-size:11px;color:#666;margin-bottom:4px">'+b.density+' stop'+(b.density===1?'':'s')+' within 1 mi · closest '+b.nearestMi+' mi</div>';
      const rest=top.slice(1).filter(r=>r.density>0||r.nearestMi<3);
      rest.forEach(r=>{h+='<div style="font-size:11px;color:#888">Runner-up: '+r.name+' — '+r.density+' within 1 mi · '+r.nearestMi+' mi</div>';});
    }
  }else if(v.area.status==='out'){
    h+='<div style="font-size:11px;color:#a00">Outside service area — decline politely or hand off.</div>';
  }
  h+='</div>';
  box.style.display='block';box.innerHTML=h;
}
```

- [ ] **Step 5: Trigger the fit geocode on look-up**

In `index.html` `lookupAddr()` (line 333), immediately after the `lookupLot(a);` line, add:

```js
  geocodeForFit(a);
```

- [ ] **Step 6: Render the panel on every render + load data at boot**

In `index.html` `render()` (line 428), find `renderAvatar();` and change it to:

```js
renderAvatar();renderFit();
```

Then at the very end of the script, change the boot line 429 from `render();` to:

```js
render();loadRouteData();
```

- [ ] **Step 7: Verify tests still pass**

Run: `node --test tests/route-fit.test.js`
Expected: PASS (14 tests) — the module is unchanged, this is a regression guard.

- [ ] **Step 8: Manual browser verification**

Serve the folder (browser `fetch('routes.json')` requires HTTP, not `file://`):

Run: `npx --yes serve -l 5173 .` (from the project root), then open `http://localhost:5173/index.html`.

Check three addresses in the "Property address" box → "Look up":
1. `202 South Lorraine Road, Wheaton, IL` (a real Route A stop) → panel shows 🟢 **IN AREA**, small distance, **Best route: Route A** (or D) with a nonzero "within 1 mi" count.
2. `352 Roosevelt Rd, Glen Ellyn, IL` (base) → 🟢 IN AREA, ~0 mi, a Glen Ellyn route (B/C/E) suggested.
3. `1200 W Lake St, Addison, IL` (edge town) → distance larger; expect 🟡 BORDERLINE or 🔴 depending on distance, with the surface-street caveat shown.

To spot-check the blacklist, temporarily add `"Wheaton"` to `blacklist` in `routes.json`, reload, look up the Wheaton address → expect ⛔ line and no route block; then remove it again.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat(route-fit): render Route & Fit panel from looked-up address"
```

---

## Self-Review

**Spec coverage:**
- Route data file (`routes.json`) → Task 5 (geocode) + already built. ✓
- Service-area gate, pluggable, v1 proxy → Task 1 (`classifyServiceArea`, `method:'proxy'`). ✓ (v2 API is out-of-scope/future per spec; the `cfg`/`method` seam leaves room.)
- Neighborhood blacklist, service-scoped → Task 2. ✓
- ICP soft fit (home value/simplicity) → existing `getAvatar()`/`renderAvatar()` already renders this; the new panel sits beside it (spec says "absorbs and upgrades" — here they render as adjacent cards, keeping `getAvatar` untouched to avoid regressions). ✓ (documented deviation)
- Route match Approach C, 1 mi, density + nearest tie-break + fallback → Task 3. ✓
- Unified verdict order (out / both → stop; partial scope → warn+continue) → Task 4 `computeFit`. ✓
- UI panel under the map → Task 6 (`#fitBox` after `avBox`). ✓ (Spec mockup said "right column"; placed under the map instead so it shows on address look-up without waiting for a pricing mode — noted deviation, better UX.)

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact run/expected lines. ✓

**Type consistency:** `computeFit` returns `{area, blacklist, routes}`; `renderFit` reads `v.area.status`, `v.area.distanceMi`, `v.blacklist.blocked/scope/label`, `v.routes.ranked[].{name,density,nearestMi}`, `v.routes.fallback` — all match Tasks 1–4 signatures. `rankRoutes` return `{ranked, fallback}` used consistently. ✓

**Deviations from spec (intentional, low-risk):**
1. Fit panel placed under the map (not in the right pricing column) so it appears on look-up regardless of pricing mode.
2. `getAvatar()` left intact; the new panel renders adjacent rather than merging, to avoid regressing existing avatar behavior. The home-value/simplicity signal still shows via the existing avatar card.
