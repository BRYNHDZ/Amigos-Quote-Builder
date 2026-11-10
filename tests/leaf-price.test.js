// Leaf prices: 10% across-the-board cut Bryan asked for Nov 10, 2026.
// Loads the pricing definitions from index.html (through derive()) and runs getSug() in node.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), vm = require('vm'), path = require('path');

function load() {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.trim() === '<script>') + 1;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('function derive(')) + 1;
  const stub = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : stub, apply: () => stub, construct: () => stub });
  const ctx = { Math, Set, Map, JSON, Object, Array, Number, String, document: stub, window: stub, localStorage: stub, navigator: stub, location: stub, setTimeout: () => 0, fetch: () => stub };
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end).join('\n') + '\n;this.__q=o=>{ST=Object.assign(ST,{lot:0,leaf:3,rate:0,complex:null,parkway:0,leafVisits:{},cornerLot:false},o);return getSug();};', ctx);
  return ctx.__q;
}
const q = load();

test('small lots (<=10k) leaf prices, every level, shred/haul', () => {
  const want = { 1: [248, 248], 2: [310, 331], 3: [338, 383], 4: [359, 404], 5: [388, 433] };
  for (const lot of [4000, 5000, 7500, 10000]) for (const lv in want) {
    const r = q({ lot, leaf: +lv });
    assert.deepStrictEqual([r.G1, r.G2, r.OD3, r.OD4], [...want[lv], ...want[lv]], `lot ${lot} L${lv}`);
  }
});

test('bigger lots L3 shred/haul', () => {
  for (const [lot, s, h] of [[10890, 353, 400], [15000, 428, 482], [21780, 536, 599], [43560, 743, 829]]) {
    const r = q({ lot });
    assert.deepStrictEqual([r.G1, r.G2], [s, h], `lot ${lot}`);
  }
});

test('multi-visit leaf totals and estate', () => {
  assert.strictEqual(q({ lot: 7500 }).OD3, 338);
  assert.strictEqual(q({ lot: 7500, leafVisits: { OD3: 2 } }).OD3, 585);
  assert.strictEqual(q({ lot: 7500, leafVisits: { OD3: 3 } }).OD3, 833);
  assert.strictEqual(q({ lot: 10000 }).G3, 631);
});

test('non-leaf prices unchanged', () => {
  const r = q({ lot: 10000 });
  assert.deepStrictEqual([r.A1, r.D1, r.H1], [1520, 230, 795]);
});
