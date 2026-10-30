// Old (origin/main, :8766) vs new (multi-option, :8765): with ONE pick per choice group, every price and the copied quote must be identical.
// Run: serve origin/main on :8766 and this branch on :8765, then `node request-first/tests/single-pick-parity.mjs`.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const open = async (url) => { const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); p.on('pageerror', e => console.log('PAGEERR', url, e.message)); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(url); return p; };
const GROUPS = [['A1', 'A2'], ['G1', 'G2', 'G3', 'OD3', 'OD4'], ['H1', 'H2', 'H4'], ['E1', 'E2', 'OE1'], ['E3', 'OE3'], ['D1', 'D2']];
const ADDONS = ['C2', 'F1', 'OF2', 'OF3', 'E5', 'B1', 'B2', 'B3', 'B4'];
const ALL = GROUPS.flat().concat(ADDONS);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const read = p => p.evaluate(() => { const d = qrData(); const q = quoteText(); return { gp: Object.fromEntries(['A1','A2','G1','G2','G3','OD3','OD4','H1','H2','H4','E1','E2','OE1','E3','OE3','D1','D2','C2','F1','OF2','OF3','E5','B1','B2','B3','B4'].map(i => [i, gp(i)])), rows: d.rows, total: d.total, plans: d.plans, buf: d.buf, q, pay: q.slice(q.indexOf('\n\n' + (UI.lang === 'es' ? 'Formas de pago:' : 'Ways to pay:'))), head: q.split('\n\n')[0], cards: [...document.querySelectorAll('#outCol .pay')].map(e => e.innerText), bar: document.querySelector('#bar .bar-amt').innerText, barL: document.querySelector('#bar .bar-l').innerText, visits: effVisits(), pay_: ST.payView, mowPV: (typeof mowPerVisit === 'function') ? mowPerVisit([...ST.sel]) : 0 }; });
const set = (p, c) => p.evaluate(c => { Object.assign(ST, { lot: c.lot, leaf: c.leaf, complex: c.complex, rate: c.rate, weedPressure: c.weed, trimDensity: c.dens, lawn: 0, paved: c.paved, mulch: c.mulch, trim: 0, peren: 0, ov: c.ov, cornerLot: c.corner, parkway: c.pk, payView: c.pay, bufferOn: c.buf }); UI.lang = c.lang; ST.sel = new Set(c.sel); render(); }, c);
let n = 0, fails = 0, esN = 0;
for (const view of ['?view=all', '?view=focus&req=mow,leaf,snow,bush,mulch']) {
  const O = await open('http://localhost:8766/' + view), N = await open('http://localhost:8765/' + view);
  for (let i = 0; i < 400; i++) {
    const sel = [];
    GROUPS.forEach(g => { if (rnd() < 0.7) sel.push(g[Math.floor(rnd() * g.length)]); });
    ADDONS.forEach(a => { if (rnd() < 0.3) sel.push(a); });
    if (sel.some(s => ['C2', 'G1', 'G2', 'G3', 'E2'].includes(s)) && !sel.includes('A1') && !sel.includes('A2')) sel.unshift('A1');
    const c = { sel, lot: [0, 5500, 10890, 21780, 43560, 65000][Math.floor(rnd() * 6)], leaf: Math.floor(rnd() * 6), complex: ['low', 'med', 'high'][Math.floor(rnd() * 3)], rate: [80, 90, 100][Math.floor(rnd() * 3)], weed: ['none', 'light', 'mod', 'heavy'][Math.floor(rnd() * 4)], dens: ['light', 'std', 'dense'][Math.floor(rnd() * 3)], paved: rnd() < 0.5 ? 0 : 3000, mulch: rnd() < 0.5 ? 0 : 6, ov: rnd() < 0.15 ? { A1: 1500 } : {}, corner: rnd() < 0.4, pk: rnd() < 0.4 ? 1200 : 0, pay: ['visit', 'monthly', 'annual'][Math.floor(rnd() * 3)], buf: rnd() < 0.2, lang: rnd() < 0.5 ? 'en' : 'es' };
    await set(O, c); await set(N, c);
    const a = await read(O), z = await read(N); n++;
    // underlying numbers must match exactly; only the display unit of each line, the bottom bar (Pay-As-You-Go) and the pay-as-you-go card may differ
    const m2 = v => { const c = Math.round(v * 100) / 100; return c === Math.round(c) ? '$' + c.toLocaleString('en-US') : '$' + c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    const why = [];
    if (JSON.stringify(a.gp) !== JSON.stringify(z.gp)) why.push('gp');
    if (a.total !== z.total || a.buf !== z.buf || JSON.stringify(a.plans) !== JSON.stringify(z.plans)) why.push('totals/plans');
    if (a.pay !== z.pay || a.head !== z.head) why.push('ways-to-pay text');
    if (a.rows.length !== z.rows.length || a.rows.some((r, k) => r[0] !== z.rows[k][0] || r[1] !== z.rows[k][1])) why.push('rows');
    z.rows.forEach((r, k) => { const id = c.sel.filter(i => true)[k]; const m = r[2].match(/^\$([\d,.]+) (per visit|por visita|per season|por temporada|per job|por trabajo)$/); if (!m) { why.push('unit fmt ' + r[2]); return; } const amt = +m[1].replace(/,/g, ''); const pv = /visit|visita/.test(m[2]); if (pv ? Math.abs(amt * z.visits - r[1]) > z.visits * 0.005 + 1e-9 : amt !== r[1]) why.push('unit math ' + r[0] + ' ' + r[2] + ' vs ' + r[1]); });
    if (a.cards[1] !== z.cards[1] || a.cards[2] !== z.cards[2]) why.push('monthly/annual cards');
    if (c.pay !== 'visit' || z.mowPV === 0) { if (a.bar !== z.bar) why.push('bar'); } else if (z.bar !== m2(z.mowPV) + (c.lang === 'es' ? '/visita' : '/visit')) why.push('bar per visit ' + z.bar);
    if (z.mowPV > 0) { const mw = (c.sel.includes('A1') ? a.gp.A1 : 0) + (c.sel.includes('A2') ? a.gp.A2 : 0); if (Math.abs(z.mowPV * z.visits - mw) > 1e-6) why.push('mowPV'); }
    if (z.q.includes('Cotización')) esN++; if (c.lang === 'es' && !z.q.includes('Cotización')) why.push('lang');
    const same = !why.length;
    if (!same && fails < 5) console.log('WHY', why.join('; '));
    if (!same) { fails++; if (fails < 5) console.log('DIFF', view, JSON.stringify(c), '\nOLD', JSON.stringify(a).slice(0, 600), '\nNEW', JSON.stringify(z).slice(0, 600)); }
  }
}
console.log('single-pick parity: ' + n + ' random quotes compared (every price, every line amount, totals, ways-to-pay text, monthly/annual cards, bottom bar; per-visit x visits = season), ' + fails + ' differences (' + esN + ' of them in Spanish)');
await b.close(); process.exit(fails ? 1 : 0);
