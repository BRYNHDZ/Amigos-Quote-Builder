// Share link: the quote builder's inputs go into the page address and come back when the link is opened.
// Prices are not stored in the link; they come from getSug() (the live formulas). Typed prices (ST.ov) are stored.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), vm = require('vm'), path = require('path');
const ShareLink = require('../share-link.js');

// Load ST + pricing (same slice of index.html as leaf-price.test.js).
function load() {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split('\n');
  const start = lines.findIndex(l => l.trim() === '<script>') + 1;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('function derive(')) + 1;
  const stub = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : stub, apply: () => stub, construct: () => stub });
  const ctx = { Math, Set, Map, JSON, Object, Array, Number, String, document: stub, window: stub, localStorage: stub, navigator: stub, location: stub, setTimeout: () => 0, fetch: () => stub };
  vm.createContext(ctx);
  vm.runInContext(lines.slice(start, end).join('\n') + '\n;const __DEF=JSON.stringify(ST,(k,v)=>v instanceof Set?{__set:[...v]}:v);'
    + 'this.__fresh=()=>{ST=JSON.parse(__DEF,(k,v)=>v&&v.__set?new Set(v.__set):v);return ST;};this.__st=()=>ST;this.__sug=()=>getSug();this.__gp=id=>gp(id);', ctx);
  return ctx;
}
const Q = s => new URLSearchParams(s);
const plain = st => JSON.parse(JSON.stringify(st, (k, v) => v instanceof Set ? [...v] : v));

function samQuote(st) {
  Object.assign(st, {
    lot: 7500, leaf: 4, complex: 'med', rate: 90, cornerLot: true, parkway: 400, bedFootprint: 'high',
    lawn: 5200, homeFt: 1800, homeVal: 650, planStartMonth: 4, visitsRemain: 30, bufferOn: true,
    trimDensity: 'std', weedPressure: 'mod', oneTier: 'driveby', payView: 'monthly', payPicked: true,
    leafVisits: { OD3: 2 }, ov: { A1: 1500.5, OD4: 420 }
  });
  st.sel = new Set(['A1', 'OD3', 'OD4', 'E1']);
  return st;
}
const UI_FOCUS = { view: 'focus', focus: new Set(['mow', 'leaf']), prev: null };
const ADDR = '303 W Wesley St, Wheaton, IL';

test('filled quote -> link -> fresh builder: every input comes back', () => {
  const c = load();
  const src = samQuote(c.__fresh());
  const qs = ShareLink.encode(src, UI_FOCUS, ADDR);
  const want = plain(src);
  const dst = c.__fresh();
  const r = ShareLink.apply(dst, Q(qs));
  assert.strictEqual(r.addr, ADDR);
  assert.strictEqual(r.lotField, '7500');
  assert.deepStrictEqual(plain(dst), want);
  assert.ok(qs.length < 400, 'compact: ' + qs.length + ' chars');
  assert.match(qs, /^view=focus&req=mow,leaf&a=303\+W\+Wesley\+St,\+Wheaton,\+IL&lot=7500/);
});

test('lot typed in acres comes back to the same sq ft and the acres box', () => {
  const c = load();
  const src = c.__fresh(); src.lotUnit = 'ac'; src.lot = Math.round(0.237 * 43560);
  const dst = c.__fresh(); const r = ShareLink.apply(dst, Q(ShareLink.encode(src, { view: 'all' }, '')));
  assert.strictEqual(dst.lot, src.lot); assert.strictEqual(dst.lotUnit, 'ac'); assert.strictEqual(r.lotField, '0.237');
});

test('no params: nothing changes, and a fresh builder makes an empty link', () => {
  const c = load();
  const def = plain(c.__fresh());
  const st = c.__fresh();
  const r = ShareLink.apply(st, Q(''));
  assert.deepStrictEqual(plain(st), def);
  assert.deepStrictEqual(r, { addr: '', lotField: '' });
  assert.strictEqual(ShareLink.encode(c.__fresh(), { view: 'pick', focus: new Set(), prev: null }, ''), '');
});

test('old lang / view / req links still work and are not treated as a saved quote', () => {
  const c = load();
  for (const s of ['lang=es', 'view=all', 'view=focus&req=mow,leaf', 'lang=en&view=focus&req=snow']) {
    assert.strictEqual(ShareLink.hasShare(Q(s)), false, s);
    const def = plain(c.__fresh()); const st = c.__fresh(); ShareLink.apply(st, Q(s));
    assert.deepStrictEqual(plain(st), def, s + ' leaves the builder defaults alone');
  }
  // and the builder writes them back the same way
  assert.strictEqual(ShareLink.encode(c.__fresh(), { view: 'all' }, ''), 'view=all');
  assert.strictEqual(ShareLink.encode(c.__fresh(), { view: 'focus', focus: new Set(['mow', 'leaf']) }, ''), 'view=focus&req=mow,leaf');
  assert.strictEqual(ShareLink.encode(c.__fresh(), { view: 'all', lang: 'es' }, ''), 'lang=es&view=all');
  // on the request picker the link keeps the screen they came from, not an empty picker
  assert.strictEqual(ShareLink.encode(c.__fresh(), { view: 'pick', focus: new Set(['leaf']), prev: 'focus' }, ''), 'view=focus&req=leaf');
});

test('prices are not in the link: restored prices come from getSug(); typed prices come back exactly', () => {
  const c = load();
  const src = c.__fresh();
  Object.assign(src, { lot: 7500, leaf: 3, leafVisits: { OD3: 2 }, ov: { OD4: 399.99 } });
  src.sel = new Set(['A1', 'OD3', 'OD4']);
  const qs = ShareLink.encode(src, { view: 'all' }, ADDR);
  assert.ok(!/585|383/.test(qs), 'no computed price in the link: ' + qs);
  const st = c.__fresh(); ShareLink.apply(st, Q(qs));
  const sug = c.__sug();
  assert.strictEqual(sug.OD3, 585, 'L3 small lot, 2 visits, from the live (10% cut) leaf formula');
  assert.strictEqual(c.__gp('OD3'), sug.OD3);
  assert.strictEqual(c.__gp('A1'), sug.A1);
  assert.strictEqual(c.__gp('OD4'), 399.99);
  assert.strictEqual(sug.OD4, 383);
});

test('junk in the link is ignored, not crashing', () => {
  const c = load();
  const def = plain(c.__fresh());
  const st = c.__fresh();
  ShareLink.apply(st, Q('lot=abc&lv=9&cx=huge&r=55&o=A1:,ZZ:5,<x>:3,G1:12&vis=OD3:x,G1:9&s=A1,bad,G1'), id => ['A1', 'G1', 'OD3'].includes(id));
  assert.strictEqual(st.lot, 0); assert.strictEqual(st.leaf, def.leaf); assert.strictEqual(st.complex, def.complex); assert.strictEqual(st.rate, def.rate);
  assert.deepStrictEqual(st.ov, { G1: 12 }); assert.deepStrictEqual(st.leafVisits, { G1: 4 }); assert.deepStrictEqual([...st.sel], ['A1', 'G1']);
});

test('example small-lot leaf + mow link stays short', () => {
  const c = load();
  const st = c.__fresh(); Object.assign(st, { lot: 7500, leaf: 3, complex: 'low', rate: 80 }); st.sel = new Set(['A1', 'G1']);
  const qs = ShareLink.encode(st, { view: 'focus', focus: new Set(['mow', 'leaf']) }, '303 W Wesley St, Wheaton, IL');
  assert.strictEqual(qs, 'view=focus&req=mow,leaf&a=303+W+Wesley+St,+Wheaton,+IL&lot=7500&lv=3&cx=low&r=80&s=A1,G1');
});

function box(lng, lat, w, h) {
  return [
    [lng, lat], [lng + w, lat], [lng + w, lat + h], [lng, lat + h], [lng, lat]
  ];
}
function fiveShapes() {
  const uses = ['paved', 'paved', 'lawn', 'parkway', 'lot'];
  return uses.map((use, i) => ({ use, coords: box(-88.11 + i * 0.0004, 41.869, 0.00025, 0.00018) }));
}
function almostEqualRing(a, b) {
  const open = (r) => {
    if (r.length >= 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) return r.slice(0, -1);
    return r;
  };
  const aa = open(a), bb = open(b);
  assert.strictEqual(aa.length, bb.length);
  aa.forEach((c, i) => {
    assert.ok(Math.abs(c[0] - bb[i][0]) <= 1e-6, 'lng ' + c[0] + ' vs ' + bb[i][0]);
    assert.ok(Math.abs(c[1] - bb[i][1]) <= 1e-6, 'lat ' + c[1] + ' vs ' + bb[i][1]);
  });
}

test('traced shapes round-trip in the link (5 shapes), and stay short', () => {
  const src = fiveShapes();
  const packed = ShareLink.encodeShapes(src);
  const back = ShareLink.decodeShapes(packed);
  assert.strictEqual(back.length, 5);
  back.forEach((s, i) => {
    assert.strictEqual(s.use, src[i].use);
    almostEqualRing(s.coords, src[i].coords);
  });
  const c = load();
  const st = samQuote(c.__fresh());
  const qs = ShareLink.encode(st, UI_FOCUS, ADDR, src);
  assert.match(qs, /&sh=/);
  assert.ok(qs.length < 1500, 'typical 5-shape quote link should stay short, got ' + qs.length);
  const dst = c.__fresh();
  const r = ShareLink.apply(dst, Q(qs));
  assert.strictEqual(r.addr, ADDR);
  assert.strictEqual(r.shapes.length, 5);
  r.shapes.forEach((s, i) => {
    assert.strictEqual(s.use, src[i].use);
    almostEqualRing(s.coords, src[i].coords);
  });
  // sq ft fields, not the shapes, still hold the measurements used for price
  assert.strictEqual(dst.paved, st.paved);
  assert.strictEqual(dst.lawn, st.lawn);
  assert.strictEqual(dst.parkway, st.parkway);
});

test('old links without shapes still work exactly as before', () => {
  const c = load();
  const old = 'view=focus&req=mow,leaf&a=303+W+Wesley+St,+Wheaton,+IL&lot=7500&lv=3&cx=low&r=80&s=A1,G1';
  assert.strictEqual(ShareLink.hasShare(Q(old)), true);
  const st = c.__fresh();
  const r = ShareLink.apply(st, Q(old));
  assert.strictEqual(r.addr, '303 W Wesley St, Wheaton, IL');
  assert.strictEqual(r.lotField, '7500');
  assert.deepStrictEqual(r.shapes, []);
  assert.strictEqual(st.lot, 7500);
  assert.strictEqual(st.leaf, 3);
  assert.strictEqual(st.complex, 'low');
  assert.strictEqual(st.rate, 80);
  assert.deepStrictEqual([...st.sel], ['A1', 'G1']);
  // encoding without shapes does not add sh, so old-style links stay identical
  const st2 = c.__fresh(); Object.assign(st2, { lot: 7500, leaf: 3, complex: 'low', rate: 80 }); st2.sel = new Set(['A1', 'G1']);
  assert.strictEqual(ShareLink.encode(st2, { view: 'focus', focus: new Set(['mow', 'leaf']) }, '303 W Wesley St, Wheaton, IL'), old);
  assert.strictEqual(ShareLink.encode(st2, { view: 'focus', focus: new Set(['mow', 'leaf']) }, '303 W Wesley St, Wheaton, IL', []), old);
});

test('shapes in the link do not change prices; getSug still uses the sq ft fields', () => {
  const c = load();
  const src = c.__fresh();
  Object.assign(src, { lot: 10890, leaf: 3, complex: 'low', rate: 80, paved: 2000, lawn: 6000, parkway: 0 });
  src.sel = new Set(['H1', 'H2', 'H4', 'A1']);
  const noShapes = c.__fresh();
  Object.assign(noShapes, { lot: src.lot, leaf: src.leaf, complex: src.complex, rate: src.rate, paved: src.paved, lawn: src.lawn, parkway: src.parkway });
  noShapes.sel = new Set([...src.sel]);
  const want = (function () { Object.assign(c.__fresh(), noShapes); c.__st().sel = new Set([...src.sel]); return c.__sug(); })();

  const qs = ShareLink.encode(src, { view: 'all' }, ADDR, fiveShapes());
  assert.ok(!/=795\b|=1193\b/.test(qs), 'no computed snow price in the link');
  const dst = c.__fresh();
  ShareLink.apply(dst, Q(qs));
  Object.assign(c.__st(), dst);
  c.__st().sel = dst.sel;
  const got = c.__sug();
  assert.strictEqual(dst.paved, 2000);
  assert.strictEqual(got.H1, 795);
  assert.strictEqual(got.H2, 1193);
  assert.strictEqual(got.H4, 2147);
  assert.strictEqual(got.H1, want.H1);
  assert.strictEqual(got.A1, want.A1);
});

test('junk in the sh param is ignored and the rest of the link still applies', () => {
  const c = load();
  const st = c.__fresh();
  const r = ShareLink.apply(st, Q('lot=7500&sh=!!!&s=A1'));
  assert.strictEqual(st.lot, 7500);
  assert.deepStrictEqual(r.shapes, []);
});
