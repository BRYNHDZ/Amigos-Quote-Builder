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
