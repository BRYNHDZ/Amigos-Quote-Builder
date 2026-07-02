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
