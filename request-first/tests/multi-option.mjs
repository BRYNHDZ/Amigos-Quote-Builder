// Multi-select behaviour + before/after screenshots.
// Run: serve origin/main on :8766 and this branch on :8765, then `node request-first/tests/multi-option.mjs`.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const SH = '/workspace/multi-option/shots/';
const fs = require('fs');
let fails = 0, checks = 0; const ok = (c, m, x) => { checks++; if (!c) { fails++; console.log('FAIL', m, x ? JSON.stringify(x) : ''); } };
const open = async (url) => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); p.on('pageerror', e => { fails++; console.log('PAGEERR', e.message); }); await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(url); await p.evaluate(() => { ST.lot = 10890; render(); }); return p; };
const click = (p, s) => p.locator(s).first().click();
const single = (p, ids) => p.evaluate(ids => { const s = ST.sel; ST.payView = 'visit'; ST.sel = new Set(ids); const r = Object.fromEntries(ids.map(i => [i, gp(i)])); const t = ids.reduce((a, i) => a + gp(i), 0); ST.sel = s; return { r, t }; }, ids);
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
  ok(!/Option|In every option|Ways to pay:|Pay-As-You-Go/.test(q) && q.includes('Ways to pay depend on the options chosen.'), 'flat list: no Option grouping, no pay sections, just a short note', q);
  ok(q.includes(': ' + fmt(s1.r.G1) + ' per season') && q.includes(': ' + fmt(s2.r.G2) + ' per season') && (q.match(/^• /gm) || []).length === 3, 'one line per pick (mowing + 2 leaf), each leaf at its single-pick price per season', { q, s1, s2 });
  ok(!(await p.locator('#qrCard .opt-tag, #svcCol .opt-tag').count()) && !(await p.locator('#outCol .pay').count()), 'no Option tags on screen, no pay cards while alternatives are picked');
  const pv = await p.evaluate(() => money2(gp('A1') / effVisits())); ok(q.includes('Mowing, clippings left: ' + pv + ' per visit'), 'mowing shown per visit', { pv, q });
  ok(!/Total: |Option \d total/.test(q) && !(await p.locator('#qrCard .qr-big').count()), 'no big season total headline in the copied text or the summary');
  ok(!q.includes(fmt(s1.r.G1 + s2.r.G2 + s1.r.A1)), 'no combined sum of both options');
  ok(!/\$[\d,]+$/.test(await p.locator('#bar .bar-amt').textContent()) && /no single total/.test(await p.locator('#bar .bar-l').textContent()), 'bottom bar shows no total while alternatives are picked', await p.locator('#bar').textContent());
  // both timings too -> 4 options
  await click(p, `button.choice[onclick="setLeaf(null,'once')"]`);
  ok(await p.evaluate(() => ['G1', 'G2', 'OD3', 'OD4'].every(i => ST.sel.has(i))), 'leaf: both kinds x both timings = 4 picks');
  q = await p.evaluate(() => quoteText()); ok((q.match(/^• /gm) || []).length === 5 && !q.includes('Option'), '4 leaf picks + mowing = 5 lines', q);
  // turn nutrient off -> removal only, both timings
  await click(p, `button.choice[onclick="setLeaf('nut',null)"]`);
  ok(await p.evaluate(() => ST.sel.has('G2') && ST.sel.has('OD4') && !ST.sel.has('G1') && !ST.sel.has('OD3')), 'leaf: nutrient off');
  await click(p, `button.choice[onclick="setLeaf(null,'once')"]`);
  ok(await p.evaluate(() => ST.sel.has('G2') && !ST.sel.has('OD4')), 'leaf: back to one pick');
  q = await p.evaluate(() => quoteText()); ok(!q.includes('Option') && q.includes('Ways to pay:') && q.includes('Pay-As-You-Go: ') && (await p.locator('#outCol .pay').count()) === 3, 'single pick: ways to pay and pay cards are back', q);
  // can't remove the last leaf / mow pick
  await click(p, `button.choice[onclick="setLeaf('rem',null)"]`); ok(await p.evaluate(() => ST.sel.has('G2')), 'last leaf pick stays');
  await click(p, `button.choice[onclick="pickMow('A1')"]`); ok(await p.evaluate(() => ST.sel.has('A1')), 'last mow pick stays');
  // mowing both
  await click(p, `button.choice[onclick="pickMow('A2')"]`); ok(await p.evaluate(() => ST.sel.has('A1') && ST.sel.has('A2')), 'mow: both clipping options');
  q = await p.evaluate(() => quoteText()); const m1 = await single(p, ['A1', 'G2']), m2 = await single(p, ['A2', 'G2']);
  { const a1 = await p.evaluate(() => money2(gp('A1') / effVisits())), a2 = await p.evaluate(() => money2(gp('A2') / effVisits()));
    ok(q.includes('Mowing, clippings left: ' + a1 + ' per visit') && q.includes(a2 + ' per visit') && !q.includes('Pay-As-You-Go'), 'both mowing picks get their own per-visit line', { q, a1, a2 }); }
  await p.locator('#fcMow').screenshot({ path: SH + 'after-mow-card.png' });
  await p.locator('#qrCard').scrollIntoViewIfNeeded(); await p.locator('#qrCard').screenshot({ path: SH + 'after-quote-summary-mow-options.png' });
  await click(p, `button.choice[onclick="pickMow('A1')"]`); ok(await p.evaluate(() => !ST.sel.has('A1') && ST.sel.has('A2')), 'mow: A1 off leaves bagged');
  await p.context().close();
}
// v3: Bryan's example -- mowing x2 + mulch + leaves x2 = 5 lines, in on-screen order
{
  const p = await open('http://localhost:8765/?view=focus&req=mow,leaf,mulch');
  await click(p, `button.choice[onclick="pickMow('A2')"]`); await click(p, `button.choice[onclick="setLeaf('rem',null)"]`); await p.waitForTimeout(200);
  const ids = await p.evaluate(() => [...ST.sel]);
  const q = await p.evaluate(() => quoteText());
  const want = await p.evaluate(() => qrOrder([...ST.sel]).map(id => itemName(id) + ': ' + qrUnit(id, gp(id)).txt));
  const lines = q.split('\n').filter(l => l.startsWith('• ')).map(l => l.slice(2));
  ok(lines.length === 5 && JSON.stringify(lines) === JSON.stringify(want), 'v3: 5 lines, each its own price', { ids, lines, want });
  const cards = await p.evaluate(() => [...document.querySelectorAll('#svcCol .fcard')].map(c => c.id));
  const firstCard = await p.evaluate(ls => ls.map(nm => { const e = [...document.querySelectorAll('#svcCol [data-svc]')].find(x => nm.startsWith(itemName(x.dataset.svc))); return e ? [...document.querySelectorAll('#svcCol .fcard')].indexOf(e.closest('.fcard')) : -1; }), lines);
  ok(firstCard.every((v, k) => v >= 0 && (k === 0 || v >= firstCard[k - 1])), 'v3: lines follow the on-screen card order', { firstCard, cards });
  ok(/^\$[\d,.]+ per visit$/.test(lines[0].split(': ')[1]) && /^\$[\d,.]+ per visit$/.test(lines[1].split(': ')[1]) && lines.filter(l => / per season$/.test(l)).length === 2 && lines.filter(l => / per job$/.test(l)).length === 1, 'v3: units (mowing per visit x2, leaves per season x2, mulch per job)', lines);
  await p.locator('#qrCard').scrollIntoViewIfNeeded(); await p.waitForTimeout(150);
  await p.locator('#qrCard').screenshot({ path: SH + 'v3-quote-summary-en.png' });
  await p.locator('#outCol').screenshot({ path: SH + 'v3-side-panel-en.png' }); await p.locator('#bar').screenshot({ path: SH + 'v3-bottom-bar-en.png' });
  fs.writeFileSync(SH + 'v3-copied-text-en.txt', q + '\n');
  const tp = await p.context().newPage(); await tp.setContent('<pre style="font:15px/1.45 monospace;padding:16px;margin:0;white-space:pre-wrap;width:520px">' + q.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>'); await tp.locator('pre').screenshot({ path: SH + 'v3-copied-text-en.png' });
  console.log('--- v3 sample copied text ---\n' + q);
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
  const q = await p.evaluate(() => quoteText()); ok(['H1', 'H2', 'H4', 'E1', 'OE1', 'E3', 'OE3'].every(i => true) && (q.match(/^• /gm) || []).length === (await p.evaluate(() => ST.sel.size)) && !q.includes('Option'), 'every pick is its own line', q);
  await p.locator('#fcSnow').screenshot({ path: SH + 'after-snow-card.png' });
  await p.locator('#fcBush').screenshot({ path: SH + 'after-bush-card.png' });
  await p.context().close();
}
// all-services view: spring cleanup both
{
  const p = await open('http://localhost:8765/?view=all');
  await p.evaluate(() => { ST.sel = new Set(['D1', 'D2', 'B1']); render(); });
  const q = await p.evaluate(() => quoteText()); const d1 = await single(p, ['D1', 'B1']), d2 = await single(p, ['D2', 'B1']);
  ok(q.includes(fmt(d1.r.B1) + ' per job') && q.includes(fmt(d1.r.D1) + ' per job') && q.includes(fmt(d2.r.D2) + ' per job') && !q.includes('Option'), 'all view: D1, D2 and aeration each their own line per job', q);
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
  if (tag === 'after') { ok(txt.includes('¿Qué tan complicada es esta propiedad?') && !/jard[ií]n\b/.test(txt.replace(/jardineras?/g, '')), 'es: propiedad wording, no jardín'); const q = await p.evaluate(() => quoteText()); ok(!q.includes('Opción') && q.includes(' por visita') && q.includes(' por temporada') && q.includes('Las formas de pago dependen de las opciones que escoja.'), 'es: flat list, por visita / por temporada, short note', q);
    console.log('--- sample copied text (es) ---\n' + q);
    await p.locator('#fcLeaf').screenshot({ path: SH + 'after-es-leaf-card.png' }); }
  await p.context().close();
}
console.log('multi checks: ' + checks + ', failures: ' + fails);
await b.close(); process.exit(fails ? 1 : 0);
