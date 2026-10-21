// Leaf Work split across visits (Bryan, Oct 20), /next-ui/ only.
// Non-mowing end-of-season Leaf Work: OD3 (Nutrient) and OD4 (Removal).
// Every visit pays the full yard-pass part b; the leaf-volume extra is charged once:
//   one visit: OD3 = fb;  OD4 = b + (fb - b) x 1.35  (Removal x1.35 on the leaf extra only, Bryan via Sam Oct 20)
//   price(v) = one-visit price + round((v-1) x b x complexity x rate/RATE_BASE)   (plain b for both)
// Expected prices are computed independently here. Visit count must not move any other service.
// Usage: node next-ui/tests/leaf-visits.mjs [baseUrl]   (default http://localhost:8765); PAGE=/ for the root builder.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const open = async (path) => { const p = await browser.newPage(); p.on('pageerror', e => errors.push(path + ': ' + e.message)); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(base + path); return p; };
const N = await open(process.env.PAGE || '/next-ui/');
const LM = [0, 0, 0.25, 0.5, 0.8, 1.2];
const bOf = lot => lot <= 10000 ? 275 : lot <= 20000 ? 275 + (lot - 10000) * 0.011 : lot <= 43560 ? 385 + (lot - 20000) * 0.007 : 550 + (lot - 43560) * 0.006;
const oneVisit = (c, id) => { const b = bOf(c.lot), fb = b * (1 + LM[c.leaf]); let r = Math.round(id === 'OD3' ? fb : b + (fb - b) * 1.35); const cx = consts.CXM[c.complex] || 1; if (cx !== 1) r = Math.round(r * cx); const rm = c.rate / consts.RATE_BASE; if (rm !== 1) r = Math.round(r * rm); return r; };
const consts = await N.evaluate(() => ({ CXM, RATE_BASE }));
let checked = 0; const fails = [];
const sug = (page, c, visits) => page.evaluate(([c, visits]) => {
  Object.assign(ST, { lot: c.lot, leaf: c.leaf, complex: c.complex, rate: c.rate, lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0 });
  if (visits) ST.leafVisits = { OD3: visits, OD4: visits }; else delete ST.leafVisits;
  return getSug();
}, [c, visits]);
for (const lot of [6000, 10000, 15000, 20000, 21780, 43560, 65000])
  for (const leaf of [1, 2, 3, 5])
    for (const [complex, rate] of [['low', 80], ['med', 90], ['high', 100]]) {
      const c = { lot, leaf, complex, rate };
      const one = await sug(N, c, 1);
      const none = await sug(N, c, 0);
      const old = none;
      // 1 visit = no visit setting, and OD3/OD4 match the formula
      for (const id of Object.keys(none)) { checked++; if (one[id] !== none[id]) fails.push({ c, id, note: '1 visit differs from default', none: none[id], one: one[id] }); }
      for (const id of ['OD3', 'OD4']) { checked++; if (one[id] !== oneVisit(c, id)) fails.push({ c, id, note: '1 visit formula', got: one[id], want: oneVisit(c, id) }); }
      for (const v of [2, 3, 4]) {
        const nv = await sug(N, c, v);
        for (const id of ['OD3', 'OD4']) {
          const want = oneVisit(c, id) + Math.round(bOf(lot) * (v - 1) * (consts.CXM[complex] || 1) * (rate / consts.RATE_BASE));
          checked++; if (nv[id] !== want) fails.push({ c, v, id, got: nv[id], want });
        }
        for (const id of Object.keys(old)) if (id !== 'OD3' && id !== 'OD4') { checked++; if (nv[id] !== old[id]) fails.push({ c, v, id, note: 'other service moved' }); }
      }
    }
// anchor sample from Bryan's chat: 10k lot, leaf 3, Nutrient: $413 for 1 visit, $688 for 2
{ const c = { lot: 10000, leaf: 3, complex: 'low', rate: 80 };
  const a = await sug(N, c, 1), b = await sug(N, c, 2); checked += 2;
  if (a.OD3 !== 413 || b.OD3 !== 688) fails.push({ note: 'anchor 413/688 wrong', got: [a.OD3, b.OD3] }); }
// Sam's example (Oct 20): 11,326 sq ft, leaf 4: b $290 + leaf $232 x 1.35 = $602 for 1 visit, $892 for 2
{ const c = { lot: 11326, leaf: 4, complex: 'low', rate: 80 };
  const a = await sug(N, c, 1), b = await sug(N, c, 2); checked += 2;
  if (a.OD4 !== 602 || b.OD4 !== 892) fails.push({ note: "Sam's example 602/892 wrong", got: [a.OD4, b.OD4] }); }
// visits clamp to 1..4
{ const r = await N.evaluate(() => { ST.leafVisits = { OD3: 9 }; const x = leafVisits('OD3'); ST.leafVisits = { OD3: 0 }; return [x, leafVisits('OD3')]; }); checked++; if (r.join() !== '4,1') fails.push({ note: 'clamp', r }); }
// UI: control appears only when OD3 is selected, buttons change the price, totals and payments follow
const ui = await N.evaluate(() => {
  Object.assign(ST, { lot: 10000, leaf: 3, complex: 'low', rate: 80, lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0 }); ST.ov = {}; ST.leafVisits = {};
  ST.sel = new Set(); render();
  const before = !!document.querySelector('.vis-ctl[data-vis="OD3"]');
  ST.sel = new Set(['OD3']); setPlanStart(3); ST.payView = 'visit'; render();
  const shown = !!document.querySelector('.vis-ctl[data-vis="OD3"]');
  const px1 = document.querySelector('.pi[data-id="OD3"]').value;
  document.querySelectorAll('.vis-ctl[data-vis="OD3"] button')[1].click();
  const px2 = document.querySelector('.pi[data-id="OD3"]').value;
  const label = document.querySelector('.svc[data-svc="OD3"]').innerText.includes('2 visits');
  const go = document.querySelector('#payVisit .amt').innerText, mo = document.querySelector('#payMonthly .amt').innerText, an = document.querySelector('#payAnnual .amt').innerText, bar = document.querySelector('.bar-amt').innerText;
  const card = document.querySelector('.svc[data-svc="OD3"]').classList.contains('sel');
  return { before, shown, px1, px2, label, go, mo, an, bar, card };
});
checked++;
const wantUi = { before: false, shown: true, px1: '413', px2: '688', label: true, go: '$688', mo: '$57/mo', an: '$631', bar: '$688', card: true };
for (const k in wantUi) if (ui[k] !== wantUi[k]) fails.push({ note: 'ui', k, got: ui[k], want: wantUi[k] });
// Fresh page (Bryan, Oct 21): default leaf level is 3 with no leaf input; Tara's lot 11,326 sq ft -> $434 / $485
{ const F = await open(process.env.PAGE || '/next-ui/');
  const r = await F.evaluate(() => { const st0 = ST.leaf; ST.lot = 11326; render(); const s = getSug();
    const btns = [...document.querySelectorAll('#lPg button')]; return { st0, eff: effLeaf(), def: btns.findIndex(b => b.classList.contains('def')), on: btns.findIndex(b => b.classList.contains('on')), warn: document.getElementById('missBox').innerText.includes('Leaf volume (using 3)'), OD3: s.OD3, OD4: s.OD4, G1: s.G1, G2: s.G2 }; });
  const want = { st0: null, eff: 3, def: 3, on: -1, warn: true, OD3: 434, OD4: 485, G1: 434, G2: 485 };
  for (const k in want) { checked++; if (r[k] !== want[k]) fails.push({ note: 'fresh page default leaf', k, got: r[k], want: want[k] }); }
  console.log('fresh page, 11,326 sq ft, no leaf input:', JSON.stringify(r)); }
console.log(`leaf visits: comparisons ${checked}, failures ${fails.length}, page errors ${errors.length}`);
fails.slice(0, 15).forEach(f => console.log('FAIL', JSON.stringify(f)));
errors.forEach(e => console.log('PAGE ERROR', e));
// sample table
console.log('\nlot, leaf 3, rate $80, low complexity: Nutrient 1v / 2v | Removal 1v / 2v');
for (const lot of [10000, 20000, 43560]) { const c = { lot, leaf: 3, complex: 'low', rate: 80 }; const a = await sug(N, c, 1), b = await sug(N, c, 2); console.log(`  ${lot}: $${a.OD3} / $${b.OD3} | $${a.OD4} / $${b.OD4}`); }
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
