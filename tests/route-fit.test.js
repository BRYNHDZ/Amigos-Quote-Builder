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
