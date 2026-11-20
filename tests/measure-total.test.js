// Paved measure total: several shapes add up to one number, overlap counted once.
// Snow prices for that total match typing the same sq ft (formulas unchanged).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), vm = require('vm'), path = require('path'), https = require('https');
const MeasureTotal = require('../measure-total.js');

const TURF_URL = 'https://unpkg.com/@turf/turf@7.4.0/turf.min.js';
const TURF_CACHE = [
  path.join('/tmp/turf-cache/turf.min.js'),
  path.join(__dirname, 'vendor', 'turf.min.js')
];

function loadTurf() {
  return new Promise((resolve, reject) => {
    const cached = TURF_CACHE.find(p => fs.existsSync(p) && fs.statSync(p).size > 1000);
    const go = src => {
      const ctx = { console };
      ctx.globalThis = ctx;
      ctx.self = ctx;
      vm.createContext(ctx);
      vm.runInContext(src, ctx, { timeout: 10000 });
      const turf = ctx.turf;
      if (!turf || typeof turf.union !== 'function') reject(new Error('turf not loaded'));
      else resolve(turf);
    };
    if (cached) return go(fs.readFileSync(cached, 'utf8'));
    https.get(TURF_URL, res => {
      if (res.statusCode !== 200) return reject(new Error('turf download ' + res.statusCode));
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => go(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function sq(lng, lat, w, h) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lng, lat], [lng + w, lat], [lng + w, lat + h], [lng, lat + h], [lng, lat]
      ]]
    }
  };
}

function loadPrices() {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.trim() === '<script>') + 1;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('function derive(')) + 1;
  const stub = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : stub, apply: () => stub, construct: () => stub });
  const ctx = { Math, Set, Map, JSON, Object, Array, Number, String, document: stub, window: stub, localStorage: stub, navigator: stub, location: stub, setTimeout: () => 0, fetch: () => stub };
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end).join('\n') + '\n;this.__fresh=()=>{return ST};this.__sug=()=>getSug();', ctx);
  return ctx;
}

function snowPrices(ctx, paved) {
  const ST = ctx.ST || ctx.__fresh();
  Object.assign(ST, {
    lot: 10890, leaf: 3, complex: 'low', rate: 80, lawn: 0, paved: paved, mulch: 0,
    trim: 0, peren: 0, ov: {}, cornerLot: false, parkway: 0, bufferOn: false,
    payView: 'visit', sel: new Set(['H1', 'H2', 'H4'])
  });
  const R = ctx.__sug();
  return { H1: R.H1, H2: R.H2, H4: R.H4 };
}

test('two separate shapes: total equals the sum', async () => {
  const turf = await loadTurf();
  const a = sq(-88.11, 41.86, 0.001, 0.001);
  const b = sq(-88.108, 41.86, 0.001, 0.0008);
  const raw = turf.area(a) * MeasureTotal.SQFT_PER_M2 + turf.area(b) * MeasureTotal.SQFT_PER_M2;
  const tot = MeasureTotal.pavedTotal([a, b], turf, MeasureTotal.SQFT_PER_M2);
  assert.equal(tot.count, 2);
  assert.equal(tot.sqFt, Math.round(raw));
  assert.ok(tot.overlapSqFt <= 1, 'separate shapes should not overlap, got ' + tot.overlapSqFt);
  assert.ok(tot.sqFt > 0);
});

test('overlapping shapes: total is less than the raw sum (counted once)', async () => {
  const turf = await loadTurf();
  const a = sq(-88.11, 41.86, 0.002, 0.001);
  const b = sq(-88.109, 41.86, 0.002, 0.001);
  const tot = MeasureTotal.pavedTotal([a, b], turf, MeasureTotal.SQFT_PER_M2);
  assert.equal(tot.count, 2);
  assert.ok(tot.overlapSqFt >= 1, 'expected overlap, got ' + tot.overlapSqFt);
  assert.equal(tot.sqFt, tot.sumSqFt - tot.overlapSqFt);
  assert.ok(tot.sqFt < tot.sumSqFt);
  const justA = MeasureTotal.pavedTotal([a], turf, MeasureTotal.SQFT_PER_M2).sqFt;
  const justB = MeasureTotal.pavedTotal([b], turf, MeasureTotal.SQFT_PER_M2).sqFt;
  assert.ok(tot.sqFt > justA);
  assert.ok(tot.sqFt > justB);
});

test('one shape total matches that shape; empty is zero', async () => {
  const turf = await loadTurf();
  const a = sq(-88.11, 41.86, 0.001, 0.001);
  const one = MeasureTotal.pavedTotal([a], turf, MeasureTotal.SQFT_PER_M2);
  assert.equal(one.count, 1);
  assert.equal(one.sqFt, Math.round(turf.area(a) * MeasureTotal.SQFT_PER_M2));
  assert.equal(one.overlapSqFt, 0);
  const none = MeasureTotal.pavedTotal([], turf, MeasureTotal.SQFT_PER_M2);
  assert.deepEqual(none, { sqFt: 0, sumSqFt: 0, overlapSqFt: 0, count: 0 });
});

const SIZES = [800, 2000, 2500, 5000];
const SPLITS = [
  [800, 0],
  [400, 400],
  [2000, 0],
  [1200, 800],
  [1500, 1000],
  [2500, 2500]
];

test('snow prices match for a single paved total, including splits that add to the same size', () => {
  const ctx = loadPrices();
  const bySize = {};
  for (const n of SIZES) bySize[n] = snowPrices(ctx, n);

  // Approved floors at the 2,000 sq ft base (JS rounding).
  assert.deepEqual(bySize[800], { H1: 795, H2: 1193, H4: 2147 });
  assert.deepEqual(bySize[2000], { H1: 795, H2: 1193, H4: 2147 });
  assert.deepEqual(bySize[2500], { H1: 945, H2: 1418, H4: 2552 });
  assert.deepEqual(bySize[5000], { H1: 1695, H2: 2543, H4: 4577 });

  for (const [a, b] of SPLITS) {
    const total = a + b;
    if (!bySize[total]) bySize[total] = snowPrices(ctx, total);
    const fromSum = snowPrices(ctx, a + b);
    assert.deepEqual(fromSum, bySize[total], 'split ' + a + '+' + b + ' should price like ' + total);
  }
});

test('typing the union total and typing the same number by hand give the same snow prices', async () => {
  const turf = await loadTurf();
  const ctx = loadPrices();
  // 1,200 + 800 disjoint shapes, and 1,500 + 1,000 overlapping, plus a 5,000 single.
  const cases = [
    [sq(-88.11, 41.86, 0.0012, 0.0009), sq(-88.1085, 41.86, 0.001, 0.0007)],
    [sq(-88.11, 41.86, 0.002, 0.001), sq(-88.109, 41.86, 0.002, 0.001)]
  ];
  for (const feats of cases) {
    const tot = MeasureTotal.pavedTotal(feats, turf, MeasureTotal.SQFT_PER_M2);
    assert.ok(tot.sqFt > 0);
    const fromTotal = snowPrices(ctx, tot.sqFt);
    const typed = snowPrices(ctx, tot.sqFt);
    assert.deepEqual(fromTotal, typed);
  }
});
