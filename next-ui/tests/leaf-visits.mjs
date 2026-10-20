// Leaf Work split across visits (Bryan, Oct 20), /next-ui/ only.
// Non-mowing end-of-season Leaf Work: OD3 (Nutrient) and OD4 (Removal).
// Every visit pays the full yard-pass part b; the leaf-volume extra is charged once:
//   price(v) = one-visit price + round((v-1) x b x (1 | 1.35) x complexity x rate/RATE_BASE)
// With 1 visit every price must equal the page before this change (the root builder, still identical to it).
// Usage: node next-ui/tests/leaf-visits.mjs [baseUrl]   (default http://localhost:8765)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const open = async (path) => { const p = await browser.newPage(); p.on('pageerror', e => errors.push(path + ': ' + e.message)); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(base + path); return p; };
const OLD = await open('/'), N = await open('/next-ui/');
const bOf = lot => lot <= 10000 ? 275 : lot <= 20000 ? 275 + (lot - 10000) * 0.011 : lot <= 43560 ? 385 + (lot - 20000) * 0.007 : 550 + (lot - 43560) * 0.006;
const M = { OD3: 1, OD4: 1.35 };
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
      const old = await sug(OLD, c, 0);
      const one = await sug(N, c, 1);
      const none = await sug(N, c, 0);
      // 1 visit: every service identical to the old page
      for (const id of Object.keys(old)) { checked++; if (one[id] !== old[id] || none[id] !== old[id]) fails.push({ c, id, note: '1 visit changed a price', old: old[id], now: one[id] }); }
      for (const v of [2, 3, 4]) {
        const nv = await sug(N, c, v);
        for (const id of ['OD3', 'OD4']) {
          const want = old[id] + Math.round(bOf(lot) * M[id] * (v - 1) * (consts.CXM[complex] || 1) * (rate / consts.RATE_BASE));
          checked++; if (nv[id] !== want) fails.push({ c, v, id, got: nv[id], want });
        }
        for (const id of Object.keys(old)) if (!(id in M)) { checked++; if (nv[id] !== old[id]) fails.push({ c, v, id, note: 'other service moved' }); }
      }
    }
// anchor sample from Bryan's chat: 10k lot, leaf 3, Nutrient: $413 for 1 visit, $688 for 2
{ const c = { lot: 10000, leaf: 3, complex: 'low', rate: 80 };
  const a = await sug(N, c, 1), b = await sug(N, c, 2); checked += 2;
  if (a.OD3 !== 413 || b.OD3 !== 688) fails.push({ note: 'anchor 413/688 wrong', got: [a.OD3, b.OD3] }); }
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
console.log(`leaf visits: comparisons ${checked}, failures ${fails.length}, page errors ${errors.length}`);
fails.slice(0, 15).forEach(f => console.log('FAIL', JSON.stringify(f)));
errors.forEach(e => console.log('PAGE ERROR', e));
// sample table
console.log('\nlot, leaf 3, rate $80, low complexity: Nutrient 1v / 2v | Removal 1v / 2v');
for (const lot of [10000, 20000, 43560]) { const c = { lot, leaf: 3, complex: 'low', rate: 80 }; const a = await sug(N, c, 1), b = await sug(N, c, 2); console.log(`  ${lot}: $${a.OD3} / $${b.OD3} | $${a.OD4} / $${b.OD4}`); }
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
