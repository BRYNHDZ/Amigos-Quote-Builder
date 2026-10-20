// Compares every service price in /next-ui/ (design preview) against /legacy/ across many properties.
// Expected: identical, except one-time fall cleanups (OD3, OD4), which must equal
// legacy Leaf Care Standard (G1) and Leaf Care Pristine (G2).
// Clean Look Plan (C1) was removed from /next/ on purpose and must not appear.
// Usage: node next-ui/tests/next-vs-legacy-prices.mjs [baseUrl]   (default http://localhost:8765)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const open = async (path) => { const p = await browser.newPage(); p.on('pageerror', e => errors.push(path + ': ' + e.message)); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(base + path); return p; };
const L = await open('/legacy/'), N = await open('/next-ui/');
const cases = [];
for (const lot of [6000, 10890, 15000, 21780, 30000, 43560, 65000])
  for (const leaf of [0, 1, 2, 3, 4, 5])
    for (const [complex, rate, start, td, wp, bf, snow] of [['low', 80, 3, 'light', 'light', 'mod', '2plus'], ['med', 90, 6, 'std', 'mod', 'high', '1plus'], ['high', 100, 9, 'dense', 'heavy', 'low', 'zero'], ['low', 80, 11, 'light', 'none', 'mod', '2plus'], ['med', 80, 1, 'std', 'light', 'low', '2plus']])
      cases.push({ lot, leaf, complex, rate, start, td, wp, bf, snow, manual: false });
cases.push({ lot: 12000, leaf: 3, complex: 'low', rate: 80, start: 3, td: 'light', wp: 'light', bf: 'mod', snow: '2plus', manual: { lawn: 7000, paved: 900, mulch: 8, trim: 1.5, peren: 0.5 } });
const setup = (c, mode) => {
  Object.assign(ST, { lot: c.lot, leaf: c.leaf, complex: c.complex, rate: c.rate, trimDensity: c.td, weedPressure: c.wp, bedFootprint: c.bf, snow: c.snow, lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0 });
  if (c.manual) Object.assign(ST, c.manual);
  if (mode) { ST.mode = mode; ST.recView = 'visit'; }
  setPlanStart(c.start);
  return getSug();
};
const ONE_ONLY = ['OF2', 'OF3', 'OE1', 'OE3'];
let checked = 0, fails = [];
const cleanup = { OD3: [], OD4: [] };
for (const c of cases) {
  const lr = await L.evaluate(([c, f]) => (eval(f))(c, 'recurring'), [c, setup.toString()]);
  const lo = await L.evaluate(([c, f]) => (eval(f))(c, 'onetime'), [c, setup.toString()]);
  const n = await N.evaluate(([c, f]) => (eval(f))(c, null), [c, setup.toString()]);
  const nIds = await N.evaluate(() => SEASONS.flatMap(s => s.cats.flatMap(k => k.items.map(i => i.id))));
  if (nIds.includes('C1') || 'C1' in n) fails.push({ c, note: 'Clean Look (C1) should be removed from /next/' });
  for (const id of nIds) {
    let want;
    if (id === 'OD3') want = lr.G1; else if (id === 'OD4') want = lr.G2;
    else if (ONE_ONLY.includes(id)) want = lo[id];
    else want = lr[id];
    checked++;
    if (typeof want !== 'number' || typeof n[id] !== 'number') fails.push({ c, id, note: 'missing price', next: n[id], want });
    else if (n[id] !== want) fails.push({ c, id, next: n[id], want });
    // duplicates that were merged must have matched in legacy too
    const dup = { B1: 'OB1', B2: 'OB2', B3: 'OB3', B4: 'OB4', D1: 'OD1', D2: 'OD2', F1: 'OF1' }[id];
    if (dup && lr[id] !== lo[dup]) fails.push({ c, id, note: 'legacy duplicate mismatch', rec: lr[id], one: lo[dup] });
  }
  if (lr.G4 !== lo.OD3 || lr.G5 !== lo.OD4) fails.push({ c, note: 'legacy G4/G5 vs OD3/OD4 mismatch' });
  if (!c.manual && c.complex === 'low' && c.rate === 80) { cleanup.OD3.push([c.lot, c.leaf, lo.OD3, n.OD3]); cleanup.OD4.push([c.lot, c.leaf, lo.OD4, n.OD4]); }
  // monthly payment = legacy Property Plan monthly for the same selection and start month
  const sel = ['A1', 'F1', 'C2', 'B1', 'D1', 'G1', 'E1', 'H1'];
  const lm = await L.evaluate(sel => { ST.recView = 'plan'; ST.mode = 'recurring'; ST.sel = new Set(sel); ST.ov = {}; let t = 0; ST.sel.forEach(id => t += gp(id) || 0); return Math.round(t / planMonths()); }, sel);
  const nm = await N.evaluate(sel => { ST.sel = new Set(sel); ST.ov = {}; let t = 0; ST.sel.forEach(id => t += gp(id) || 0); return Math.round(t / planMonths()); }, sel);
  checked++; if (lm !== nm) fails.push({ c, note: 'monthly mismatch', legacy: lm, next: nm });
  // annual payment: legacy yearly total, minus one monthly payment only on a 12 month plan
  const la = await L.evaluate(sel => { let t = 0; ST.sel.forEach(id => t += gp(id) || 0); return { t, n: planMonths() }; }, sel);
  const na = await N.evaluate(sel => { let t = 0; ST.sel.forEach(id => t += gp(id) || 0); return annualPay(t); }, sel);
  const wantSave = la.n === 12 ? Math.round(la.t / 12) : 0;
  checked++; if (na.pay !== la.t - wantSave || na.save !== wantSave || na.n !== la.n) fails.push({ c, note: 'annual mismatch', legacyTotal: la.t, months: la.n, next: na });
  if (la.n === 12 && !(na.save > 0)) fails.push({ c, note: '12 month plan should get a free month' });
}
// render smoke test: every service selectable in both pay modes without errors
await N.evaluate(() => { ST.lot = 15000; ST.mulch = 6; SEASONS.forEach(s => s.cats.forEach(k => k.items.forEach(i => ST.sel.add(i.id)))); ST.payView = 'visit'; render(); ST.payView = 'monthly'; render(); });
const txt = await N.evaluate(() => document.getElementById('outCol').innerText);
if (/Clean Look/.test(await N.evaluate(() => document.body.innerText))) fails.push({ note: 'Clean Look text still on page' });
if (!/payments of \$/.test(txt)) fails.push({ note: 'monthly payment line missing' });
// annual payment UI: March start shows the free month, June start shows full price + note
for (const [start, free] of [[3, true], [6, false]]) {
  const r = await N.evaluate(([start]) => { ST.sel = new Set(['A1', 'G1', 'D1']); setPlanStart(start); ST.payView = 'annual'; render(); let t = 0; ST.sel.forEach(id => t += gp(id) || 0); return { txt: document.getElementById('outCol').innerText, t, ap: annualPay(t) }; }, [start]);
  const amt = await N.evaluate(() => document.querySelector('#payAnnual .amt').innerText);
  checked++;
  if (amt !== `$${r.ap.pay.toLocaleString()}`) fails.push({ note: 'annual card amount wrong', start, amt, want: r.ap.pay });
  if (free && !r.txt.includes(`1 month free, save $${Math.round(r.t / 12).toLocaleString()}`)) fails.push({ note: 'free month text missing', start });
  if (!free && (r.ap.pay !== r.t || !r.txt.includes('1 month free needs a 12 month plan'))) fails.push({ note: 'no-discount note/total wrong', start });
  const mamt = await N.evaluate(() => document.querySelector('#payMonthly .amt').innerText);
  const wantMo = `$${Math.round(r.t / (start === 3 ? 12 : 9)).toLocaleString()}/mo`;
  if (mamt !== wantMo) fails.push({ note: 'monthly card amount wrong', start, mamt, wantMo });
  const vamt = await N.evaluate(() => document.querySelector('#payVisit .amt').innerText);
  if (vamt !== `$${r.t.toLocaleString()}`) fails.push({ note: 'pay as you go card amount wrong', start, vamt });
}
console.log(`cases: ${cases.length}, comparisons: ${checked}, failures: ${fails.length}, page errors: ${errors.length}`);
fails.slice(0, 15).forEach(f => console.log('FAIL', JSON.stringify(f)));
errors.forEach(e => console.log('PAGE ERROR', e));
console.log('\nOne-time fall cleanup (rate $80, low complexity): lot, leaf, legacy -> next');
for (const k of ['OD3', 'OD4']) { console.log(k); cleanup[k].filter((r, i, a) => a.findIndex(x => x[0] === r[0] && x[1] === r[1]) === i && [10890, 21780, 43560].includes(r[0]) && [0, 2, 5].includes(r[1])).forEach(r => console.log('  ', r.join(', '))); }
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
