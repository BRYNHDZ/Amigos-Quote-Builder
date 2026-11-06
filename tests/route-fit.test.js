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

// ---- drive polygons + whitelist + income (Nov 2026) ----

test('matchBlacklist: watch scope warns but does not block', () => {
  const r = RouteFit.matchBlacklist('Downers Grove', [{town:'Downers Grove', scope:'watch'}]);
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.watch, true);
  assert.strictEqual(r.scope, 'watch');
});

test('pointInPolygon: simple square', () => {
  const square = { type:'Polygon', coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] };
  assert.strictEqual(RouteFit.pointInPolygon(0, 0, square), true);
  assert.strictEqual(RouteFit.pointInPolygon(2, 0, square), false);
});

test('classifyServiceArea: whitelist town is always in', () => {
  const r = RouteFit.classifyServiceArea(
    {lat:42.5, lng:-89}, // far away
    {lat:41.86, lng:-88.08},
    null,
    { town:'Wheaton', driveWhitelist:['Glen Ellyn','Wheaton','Winfield'] }
  );
  assert.strictEqual(r.status, 'in');
  assert.strictEqual(r.method, 'whitelist');
});

test('classifyServiceArea: uses baked polygons when provided', () => {
  // Tiny fake 25-min polygon around (0,0)
  const polys = {
    in25: { type:'Polygon', coordinates:[[[-0.1,-0.1],[0.1,-0.1],[0.1,0.1],[-0.1,0.1],[-0.1,-0.1]]] },
    borderline30: { type:'Polygon', coordinates:[[[-0.2,-0.2],[0.2,-0.2],[0.2,0.2],[-0.2,0.2],[-0.2,-0.2]]] }
  };
  const base = {lat:0, lng:0};
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0}, base, null, {polygons:polys}).status, 'in');
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0.15}, base, null, {polygons:polys}).status, 'borderline');
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0.5}, base, null, {polygons:polys}).status, 'out');
  assert.strictEqual(RouteFit.classifyServiceArea({lat:0,lng:0}, base, null, {polygons:polys}).method, 'drive');
});

test('lookupIncome: affluent vs satellite vs unknown', () => {
  const data = {
    threshold: 110000,
    towns: {
      wheaton: { name:'Wheaton', median: 119566 },
      lombard: { name:'Lombard', median: 97253 }
    }
  };
  const a = RouteFit.lookupIncome('Wheaton', data);
  assert.strictEqual(a.band, 'affluent');
  assert.match(a.label, /\$110k\+/);
  const s = RouteFit.lookupIncome('Lombard', data);
  assert.strictEqual(s.band, 'satellite');
  assert.match(s.label, /satellite-only/);
  assert.strictEqual(RouteFit.lookupIncome('Nowhere', data).known, false);
});

test('computeFit: blacklist both still wins over income', () => {
  const data = {
    base: {lat:0, lng:0},
    blacklist: ['Villa Park'],
    polygons: {
      in25: { type:'Polygon', coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] },
      borderline30: { type:'Polygon', coordinates:[[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]] }
    },
    townIncome: { threshold:110000, towns:{ 'villa park':{median:94698} } },
    routes: [{name:'Route X', stops:[{lat:0,lng:0}]}]
  };
  const r = RouteFit.computeFit({pin:{lat:0,lng:0}, town:'Villa Park'}, data);
  assert.strictEqual(r.blacklist.blocked, true);
  assert.strictEqual(r.routes, null);
});

// --- Busy road heads-up (non-blocking) ---
const BUSY_MINI = {
  matchMeters: 50,
  roads: [
    {
      name: 'Illinois Route 59',
      ref: 'IL 59',
      highway: 'primary',
      band: 'busy',
      lines: [[
        [-88.2055, 41.7975],
        [-88.2050, 41.7985],
        [-88.2045, 41.7995]
      ]]
    },
    {
      name: 'Roosevelt Road',
      ref: 'IL 38',
      highway: 'primary',
      band: 'busy',
      lines: [[
        [-88.0800, 41.8750],
        [-88.0700, 41.8750],
        [-88.0600, 41.8750]
      ]]
    },
    {
      name: 'Main Street',
      ref: null,
      highway: 'secondary',
      band: 'likely',
      lines: [[
        [-88.0670, 41.8700],
        [-88.0670, 41.8720]
      ]]
    }
  ]
};

test('classifyBusyRoad: pin on Route 59 flags busy via geometry', () => {
  const r = RouteFit.classifyBusyRoad(
    { lat: 41.79808, lng: -88.20483 },
    'Illinois Route 59',
    BUSY_MINI
  );
  assert.strictEqual(r.busy, true);
  assert.strictEqual(r.band, 'busy');
  assert.strictEqual(r.method, 'geometry');
  assert.match(r.label, /Busy road/);
  assert.match(r.label, /your call/);
});

test('classifyBusyRoad: pin on Roosevelt Rd flags busy', () => {
  const r = RouteFit.classifyBusyRoad(
    { lat: 41.87505, lng: -88.0700 },
    'Roosevelt Road',
    BUSY_MINI
  );
  assert.strictEqual(r.busy, true);
  assert.strictEqual(r.band, 'busy');
  assert.match(r.name || '', /Roosevelt/i);
});

test('classifyBusyRoad: residential Glen Ellyn street does not flag', () => {
  // Far from Roosevelt (41.875) and Main Street mini segments
  const r = RouteFit.classifyBusyRoad(
    { lat: 41.8680, lng: -88.0685 },
    'Glenwood Avenue',
    BUSY_MINI
  );
  assert.strictEqual(r.busy, false);
  assert.strictEqual(r.band, null);
  assert.strictEqual(r.label, '');
});

test('classifyBusyRoad: keyword fallback when geometry miss but street says Route', () => {
  const r = RouteFit.classifyBusyRoad(
    { lat: 41.90, lng: -88.30 }, // nowhere near mini lines
    '1200 N Route 59',
    BUSY_MINI
  );
  assert.strictEqual(r.busy, true);
  assert.strictEqual(r.method, 'keyword');
});

test('classifyBusyRoad: name match when pin slightly off centerline', () => {
  const r = RouteFit.classifyBusyRoad(
    { lat: 41.79808, lng: -88.2100 }, // west of Route 59 line
    'Illinois Route 59',
    BUSY_MINI
  );
  assert.strictEqual(r.busy, true);
  assert.ok(r.method === 'name' || r.method === 'geometry');
});

test('computeFit: busyRoad never blocks routes', () => {
  const data = {
    base: { lat: 41.86, lng: -88.07 },
    routes: [{ name: 'Route E', stops: [{ lat: 41.798, lng: -88.205 }] }],
    busyRoads: BUSY_MINI,
    polygons: {
      in25: { type: 'Polygon', coordinates: [[[-89, 41], [-87, 41], [-87, 43], [-89, 43], [-89, 41]]] },
      borderline30: { type: 'Polygon', coordinates: [[[-89.5, 40.5], [-86.5, 40.5], [-86.5, 43.5], [-89.5, 43.5], [-89.5, 40.5]]] }
    }
  };
  const r = RouteFit.computeFit(
    { pin: { lat: 41.79808, lng: -88.20483 }, town: 'Naperville', street: 'Illinois Route 59' },
    data
  );
  assert.strictEqual(r.busyRoad.busy, true);
  assert.ok(r.routes && r.routes.ranked.length >= 1);
  assert.strictEqual(r.blacklist.blocked, false);
});

test('classifyBusyRoad: real baked busy-roads.json flags Route 59, not Glenwood', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const file = path.join(__dirname, '..', 'busy-roads.json');
  if (!fs.existsSync(file)) return; // skip if bake missing
  const busy = JSON.parse(fs.readFileSync(file, 'utf8'));
  const on59 = RouteFit.classifyBusyRoad(
    { lat: 41.79808, lng: -88.20483 },
    'Illinois Route 59',
    busy
  );
  assert.strictEqual(on59.busy, true, 'Route 59 should flag');
  assert.ok(on59.band === 'busy' || on59.band === 'likely');
  const quiet = RouteFit.classifyBusyRoad(
    { lat: 41.87458, lng: -88.06851 },
    'Glenwood Avenue',
    busy
  );
  assert.strictEqual(quiet.busy, false, 'Glenwood Ave should stay quiet');
});
