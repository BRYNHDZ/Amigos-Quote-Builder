// Multi-select behaviour + before/after screenshots.
// Run: serve origin/main on :8766 and this branch on :8765, then `node request-first/tests/<file>`.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const SH = '/workspace/multi-option/shots/';
let fails = 0, checks = 0; const ok = (c, m, x) => { checks++; if (!c) { fails++; console.log('FAIL', m, x ? JSON.stringify(x) : ''); } };
const open = async (url) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); p.on('pageerror', e => { fails++; console.log('PAGEERR', e.message); }); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(url); await p.evaluate(() => { ST.lot = 10890; render(); }); return p; };
const click = (p, s) => p.locator(s).first().click();
const single = (p, ids) => p.evaluate(ids => { const s = ST.sel; ST.sel = new Set(ids); const r = Object.fromEntries(ids.map(i => [i, gp(i)])); const t = ids.reduce((a, i) => a + gp(i), 0); ST.sel = s; return { r, t }; }, ids);
const fmt = v => '$' + Math.round(v).toLocaleString();

for (const [tag, base] of [['before', 'http://localhost:8766/'], ['after', 'http://localhost:8765/']]) {
  const p = await open(base + '?view=focus&req=mow,leaf');
  await click(p, `button.choice[onclick="setLeaf('rem',null)"]`); await p.waitForTimeout(200);
  await p.locator('#fcLeaf').screenshot({ path: SH + tag + '-leaf-card.png' });
  await p.locator('#qrCard').scrollIntoViewIfNeeded(); await p.locator('#qrCard').screenshot({ path: SH + tag + '-quote-summary.png' });
  if (tag === 'before') { ok(await p.evaluate(() => ST.sel.has('G2') && !ST.sel.has('G1')), 'before: removal replaced nutrient'); await p.context().close(); continue; }
  ok(await p.evaluate(() => ST.sel.has('G1') && ST.sel.has('G2')), 'leaf: nutrient + removal both picked');
  let q = await p.evaluate(() => quoteText());
  const s1 = await single(p, ['A1', 'G1']), s2 = await single(p, ['A1', 'G2']);
  ok(q.includes('In every option:') && q.includes('Option 1') && q.includes('Option 2'), 'quote has Option 1/2', q);
  ok(q.includes(': ' + fmt(s1.r.G1)) && q.includes(': ' + fmt(s2.r.G2)) && q.includes('Total: ' + fmt(s1.t)) && q.includes('Total: ' + fmt(s2.t)), 'each option uses its single-pick price and own total', { q, s1, s2 });
  ok(!q.includes('Total: ' + fmt(s1.r.G1 + s2.r.G2 + s1.r.A1)), 'no combined sum of both options');
  ok(await p.locator('#bar .bar-amt').textContent() === fmt(s1.t) || ['monthly','annual'].includes(await p.evaluate(()=>ST.payView)), 'bottom bar shows Option 1');
  // both timings too -> 4 options
  await click(p, `button.choice[onclick="setLeaf(null,'once')"]`);
  ok(await p.evaluate(() => ['G1', 'G2', 'OD3', 'OD4'].every(i => ST.sel.has(i))), 'leaf: both kinds x both timings = 4 picks');
  q = await p.evaluate(() => quoteText()); ok(q.includes('Option 4') && !q.includes('Option 5'), '4 options');
  // turn nutrient off -> removal only, both timings
  await click(p, `button.choice[onclick="setLeaf('nut',null)"]`);
  ok(await p.evaluate(() => ST.sel.has('G2') && ST.sel.has('OD4') && !ST.sel.has('G1') && !ST.sel.has('OD3')), 'leaf: nutrient off');
  await click(p, `button.choice[onclick="setLeaf(null,'once')"]`);
  ok(await p.evaluate(() => ST.sel.has('G2') && !ST.sel.has('OD4')), 'leaf: back to one pick');
  q = await p.evaluate(() => quoteText()); ok(!q.includes('Option'), 'single pick: normal quote');
  // can't remove the last leaf / mow pick
  await click(p, `button.choice[onclick="setLeaf('rem',null)"]`); ok(await p.evaluate(() => ST.sel.has('G2')), 'last leaf pick stays');
  await click(p, `button.choice[onclick="pickMow('A1')"]`); ok(await p.evaluate(() => ST.sel.has('A1')), 'last mow pick stays');
  // mowing both
  await click(p, `button.choice[onclick="pickMow('A2')"]`); ok(await p.evaluate(() => ST.sel.has('A1') && ST.sel.has('A2')), 'mow: both clipping options');
  q = await p.evaluate(() => quoteText()); const m1 = await single(p, ['A1', 'G2']), m2 = await single(p, ['A2', 'G2']);
  ok(q.includes('Total: ' + fmt(m1.t)) && q.includes('Total: ' + fmt(m2.t)), 'mow options totals', { q });
  await p.locator('#fcMow').screenshot({ path: SH + 'after-mow-card.png' });
  await p.locator('#qrCard').scrollIntoViewIfNeeded(); await p.locator('#qrCard').screenshot({ path: SH + 'after-quote-summary-mow-options.png' });
  await click(p, `button.choice[onclick="pickMow('A1')"]`); ok(await p.evaluate(() => !ST.sel.has('A1') && ST.sel.has('A2')), 'mow: A1 off leaves bagged');
  await p.context().close();
}
// snow / bushes / flowers
{
  const p = await open('http://localhost:8765/?view=focus&req=snow,bush,mow');
  await p.evaluate(() => { ST.paved = 2500; render(); });
  await click(p, `button.choice[onclick="tgl('H2')"]`); await click(p, `button.choice[onclick="tgl('H4')"]`);
  ok(await p.evaluate(() => ['H1', 'H2', 'H4'].every(i => ST.sel.has(i))), 'snow: 3 plans');
  await click(p, `button.choice[onclick="tgl('E1')"]`); await click(p, `button.choice[onclick="tgl('OE1')"]`);
  await click(p, `button.choice[onclick="tgl('E3')"]`); await click(p, `button.choice[onclick="tgl('OE3')"]`);
  ok(await p.evaluate(() => ['E1', 'OE1', 'E3', 'OE3'].every(i => ST.sel.has(i))), 'bush + flowers: both options each');
  const q = await p.evaluate(() => quoteText()); ok(q.includes('Option 3') && !q.includes('Option 4'), 'options = largest group (snow 3)', q);
  await p.locator('#fcSnow').screenshot({ path: SH + 'after-snow-card.png' });
  await p.locator('#fcBush').screenshot({ path: SH + 'after-bush-card.png' });
  await p.context().close();
}
// all-services view: spring cleanup both
{
  const p = await open('http://localhost:8765/?view=all');
  await p.evaluate(() => { ST.sel = new Set(['D1', 'D2', 'B1']); render(); });
  const q = await p.evaluate(() => quoteText()); const d1 = await single(p, ['D1', 'B1']), d2 = await single(p, ['D2', 'B1']);
  ok(q.includes('Total: ' + fmt(d1.t)) && q.includes('Total: ' + fmt(d2.t)) && q.includes('In every option:'), 'all view: D1/D2 as options, aeration in every option', q);
  console.log('--- sample copied text (all view) ---\n' + q);
  await p.context().close();
}
// Spanish
for (const [tag, base] of [['before', 'http://localhost:8766/'], ['after', 'http://localhost:8765/']]) {
  const p = await open(base + '?view=focus&req=mow,leaf&lang=es');
  if (tag === 'after') await click(p, `button.choice[onclick="setLeaf('rem',null)"]`);
  await p.locator('#dCx').scrollIntoViewIfNeeded(); await p.waitForTimeout(150);
  await p.locator('#dCx').screenshot({ path: SH + tag + '-es-complexity.png' });
  await p.locator('#missBox').screenshot({ path: SH + tag + '-es-standard-settings.png' }).catch(() => {});
  const txt = await p.evaluate(() => document.body.innerText);
  if (tag === 'after') { ok(txt.includes('¿Qué tan complicada es esta propiedad?') && !/jard[ií]n\b/.test(txt.replace(/jardineras?/g, '')), 'es: propiedad wording, no jardín'); const q = await p.evaluate(() => quoteText()); ok(q.includes('Opción 1') && q.includes('En todas las opciones:'), 'es: Opción labels'); console.log('--- sample copied text (es) ---\n' + q);
    await p.locator('#fcLeaf').screenshot({ path: SH + 'after-es-leaf-card.png' }); }
  await p.context().close();
}
console.log('multi checks: ' + checks + ', failures: ' + fails);
await b.close(); process.exit(fails ? 1 : 0);
