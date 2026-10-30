// Old (origin/main, :8766) vs new (multi-option, :8765): with ONE pick per choice group, every price and the copied quote must be identical.
// Run: serve origin/main on :8766 and this branch on :8765, then `node request-first/tests/<file>`.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const open = async (url) => { const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); p.on('pageerror', e => console.log('PAGEERR', url, e.message)); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(url); return p; };
const GROUPS = [['A1', 'A2'], ['G1', 'G2', 'G3', 'OD3', 'OD4'], ['H1', 'H2', 'H4'], ['E1', 'E2', 'OE1'], ['E3', 'OE3'], ['D1', 'D2']];
const ADDONS = ['C2', 'F1', 'OF2', 'OF3', 'E5', 'B1', 'B2', 'B3', 'B4'];
const ALL = GROUPS.flat().concat(ADDONS);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const read = p => p.evaluate(() => ({ gp: Object.fromEntries(['A1','A2','G1','G2','G3','OD3','OD4','H1','H2','H4','E1','E2','OE1','E3','OE3','D1','D2','C2','F1','OF2','OF3','E5','B1','B2','B3','B4'].map(i => [i, gp(i)])), q: quoteText(), out: document.querySelector('#outCol').innerText, bar: document.querySelector('#bar').innerText, qr: (document.querySelector('#qrCard') || {}).innerText || '' }));
const set = (p, c) => p.evaluate(c => { Object.assign(ST, { lot: c.lot, leaf: c.leaf, complex: c.complex, rate: c.rate, weedPressure: c.weed, trimDensity: c.dens, lawn: 0, paved: c.paved, mulch: c.mulch, trim: 0, peren: 0, ov: c.ov, cornerLot: c.corner, parkway: c.pk, payView: c.pay, bufferOn: c.buf }); if (window.UI) UI.lang = c.lang; ST.sel = new Set(c.sel); render(); }, c);
let n = 0, fails = 0;
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
    const strip = s => s.replace(/Tap more than one to quote options|Toca más de una para cotizar opciones/g, '');
    const same = JSON.stringify(a.gp) === JSON.stringify(z.gp) && a.q === z.q && a.out === z.out && a.bar === z.bar && strip(a.qr) === strip(z.qr);
    if (!same) { fails++; if (fails < 5) console.log('DIFF', view, JSON.stringify(c), '\nOLD', JSON.stringify(a).slice(0, 600), '\nNEW', JSON.stringify(z).slice(0, 600)); }
  }
}
console.log('single-pick parity: ' + n + ' random quotes compared (all prices, copied quote text, price panel, bottom bar, quote card), ' + fails + ' differences');
await b.close(); process.exit(fails ? 1 : 0);
