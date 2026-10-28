// Request-first builder (now the main builder at the root): filtered view must price exactly like the full view and like the previous builder at /previous/ (only one-time weeding OF2 is allowed to differ: exactly 2x).
// Also checks the screens, Spanish toggle, tap-target size and that "Everything" is the same page as the current builder.
// Usage: node request-first/tests/request-first.mjs [baseUrl]   (default http://localhost:8765, repo root served)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [], fails = []; let checks = 0;
const ok = (cond, msg, extra) => { checks++; if (!cond) fails.push({ msg, ...extra }); };
// Old-flow tests open the focus view with all the fields showing (details=1). The new address-first flow is tested in section 8 with details=0.
const withDet = path => (/view=focus/.test(path) && !/details=/.test(path)) ? path + '&details=1' : path;
const open = async (path, vp) => {
  path = withDet(path);
  const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, hasTouch: !!vp });
  const p = await ctx.newPage(); p.setDefaultTimeout(6000); p.on('pageerror', e => errors.push(path + ': ' + e.message));
  await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(base + path); return p;
};
const MOBILE = { width: 390, height: 844 };
const click = (p, sel) => p.locator(sel).first().click();

// ---------- 1. same answers -> same price (focus view vs full view vs live root builder) ----------
const full = await open('/?view=all');
// 'live' = the PREVIOUS builder kept at /previous/ (the old root). It is the price baseline: only one-time weeding (OF2) may differ, and must be exactly 2x.
const live = await open('/previous/');
const setDials = (p, c) => p.evaluate(c => { Object.assign(ST, { lot: c.lot, leaf: c.leaf, complex: c.complex, rate: c.rate, lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0, ov: {} }); render(); }, c);
const readFocus = p => p.evaluate(() => {
  const ids = [...ST.sel].sort(); const px = {};
  ids.forEach(id => { const r = document.querySelector('.fprice[data-svc="' + id + '"]'); const i = r && r.querySelector('input.pi'); px[id] = i ? i.value : (r && r.querySelector('[data-px]') || {}).textContent; });
  return { ids, px, bar: document.querySelector('#bar .bar-amt').textContent, vis: JSON.stringify(ST.leafVisits || {}) };
});
// x2: the live root builder keeps the old one-time weeding price (OF2); the request-first page doubles it. To compare everything else
// (totals, monthly, annual, bar) exactly, the live page is given OF2 typed in as exactly 2x its own suggested price. Nothing else is touched.
const readFull = (p, snap, x2) => p.evaluate(([s, x2]) => {
  delete ST.ov.OF2; if (x2 && s.ids.includes('OF2')) { const b = getSug().OF2; if (b > 0) ST.ov.OF2 = 2 * b; }
  ST.sel = new Set(s.ids); ST.leafVisits = JSON.parse(s.vis); render();
  const px = {}; s.ids.forEach(id => { const r = [...document.querySelectorAll('.svc')].find(x => x.querySelector('[data-id="' + id + '"],[data-px="' + id + '"]')); const i = r && r.querySelector('input.pi'); px[id] = i ? i.value : (r && r.querySelector('[data-px]') || {}).textContent; });
  return { px, bar: document.querySelector('#bar .bar-amt').textContent };
}, [snap, !!x2]);
const cases = [];
for (const lot of [6000, 10890, 21780, 43560, 65000]) for (const leaf of [0, 1, 3, 5]) for (const [complex, rate] of [['low', 80], ['high', 100]]) cases.push({ lot, leaf, complex, rate });
const both = await open('/?view=focus&req=mow,leaf');
const leafOnly = await open('/?view=focus&req=leaf');
const mowOnly = await open('/?view=focus&req=mow');
let compared = 0;
for (const c of process.env.QUICK ? [] : cases) {
  for (const p of [both, leafOnly, mowOnly, full, live]) await setDials(p, c);
  const runs = [];
  for (const m of ['A1', 'A2']) for (const k of ['nut', 'rem']) for (const w of ['during', 'once'])
    runs.push([both, `button.choice[onclick="pickMow('${m}')"]`, `button.choice[onclick="setLeaf('${k}',null)"]`, `button.choice[onclick="setLeaf(null,'${w}')"]`]);
  for (const k of ['nut', 'rem']) runs.push([leafOnly, null, `button.choice[onclick="setLeaf('${k}',null)"]`, `button.choice[onclick="setLeaf(null,'once')"]`]);
  for (const m of ['A1', 'A2']) runs.push([mowOnly, `button.choice[onclick="pickMow('${m}')"]`, null, null]);
  for (const [p, a, b, d] of runs) {
    for (const s of [a, b, d]) if (s) await click(p, s);
    for (const visits of (b && /'once'/.test(d) ? [1, 3] : [1])) {
      if (visits > 1) await p.evaluate(() => { setLeafVisits(leafState().k === 'nut' ? 'OD3' : 'OD4', 3); });
      const f = await readFocus(p);
      const a1 = await readFull(full, f); const a2 = await readFull(live, f);
      compared++;
      ok(JSON.stringify(f.px) === JSON.stringify(a1.px) && f.bar === a1.bar, 'focus != full view', { c, f, a1 });
      ok(JSON.stringify(f.px) === JSON.stringify(a2.px) && f.bar === a2.bar, 'focus != live root builder', { c, f, a2 });
      ok(c.leaf === 0 || f.bar !== '$0', 'price present (leaf 0 legitimately prices leaf work at $0)', { c, f });
      if (visits > 1) await p.evaluate(() => { delete ST.leafVisits; render(); });
    }
  }
}
console.log('price parity: ' + compared + ' focus-vs-full-vs-live comparisons');


// ---------- 1b. every new service path: focus view == full view == live root builder ----------
const CH = {
  A1: `pickMow('A1')`, A2: `pickMow('A2')`,
  H1: `pickGrp(['H1','H2','H4'],'H1',true)`, H2: `pickGrp(['H1','H2','H4'],'H2',true)`, H4: `pickGrp(['H1','H2','H4'],'H4',true)`,
  E1: `pickGrp(['E1','E2','OE1'],'E1',true)`, E2: `pickGrp(['E1','E2','OE1'],'E2',true)`, OE1: `pickGrp(['E1','E2','OE1'],'OE1',true)`,
  E3: `pickGrp(['E3','OE3'],'E3',true)`, OE3: `pickGrp(['E3','OE3'],'OE3',true)`,
  E5: `tgl('E5')`, C2: `tgl('C2')`, OF2: `tgl('OF2')`, OF3: `tgl('OF3')`, F1: `tgl('F1')`
};
const DOMAIN = ['H1', 'H2', 'H4', 'E1', 'E2', 'OE1', 'E3', 'OE3', 'E5', 'C2', 'OF2', 'OF3', 'F1'];
const drive = async (pg, want, tag) => {
  const cur = await pg.evaluate(() => [...ST.sel]);
  // switch off what is not wanted (deepest dependants first), then switch on what is
  for (const id of ['C2', 'E5', 'H1', 'H2', 'H4', 'E1', 'E2', 'OE1', 'E3', 'OE3', 'OF2', 'OF3', 'F1'])
    if (cur.includes(id) && !want.includes(id) && await pg.evaluate(i => ST.sel.has(i), id)) await pg.locator(`button.choice[onclick="${CH[id]}"]`).first().click();
  for (const id of ['A1', 'A2', 'F1', 'H1', 'H2', 'H4', 'E1', 'E2', 'OE1', 'E5', 'E3', 'OE3', 'C2', 'OF2', 'OF3'])
    if (want.includes(id) && !(await pg.evaluate(i => ST.sel.has(i), id))) await pg.locator(`button.choice[onclick="${CH[id]}"]`).first().click();
  const got = await pg.evaluate(d => d.filter(i => ST.sel.has(i)).sort(), DOMAIN);
  ok(JSON.stringify(got) === JSON.stringify(DOMAIN.filter(i => want.includes(i)).sort()), 'tapping the choices gives exactly the picked services', { tag, want, got });
};
const setDials2 = (pg, c) => pg.evaluate(c => { Object.assign(ST, { lot: c.lot, leaf: 3, complex: c.complex, rate: c.rate, weedPressure: c.weed, trimDensity: c.dens, bedFootprint: c.bed, lawn: 0, paved: c.paved || 0, mulch: c.mulch || 0, trim: c.trim || 0, peren: c.peren || 0, ov: {} }); render(); }, c);
const cases2 = [
  { lot: 6000, complex: 'low', rate: 80, weed: 'none', dens: 'light', bed: null },
  { lot: 10890, complex: 'high', rate: 100, weed: 'light', dens: 'std', bed: 'low' },
  { lot: 21780, complex: 'low', rate: 90, weed: 'mod', dens: 'dense', bed: 'mod' },
  { lot: 21780, complex: 'high', rate: 80, weed: 'heavy', dens: 'light', bed: 'high' },
  { lot: 43560, complex: 'low', rate: 100, weed: 'light', dens: 'dense', bed: null },
  { lot: 43560, complex: 'high', rate: 90, weed: 'mod', dens: 'std', bed: 'high' },
  { lot: 65000, complex: 'low', rate: 80, weed: 'heavy', dens: 'dense', bed: 'low' },
  { lot: 65000, complex: 'high', rate: 100, weed: 'none', dens: 'std', bed: 'mod' },
  { lot: 14000, complex: 'med', rate: 80, weed: 'mod', dens: 'std', bed: 'mod', paved: 3200, mulch: 8, trim: 1.5, peren: 2 },
  { lot: 30000, complex: 'low', rate: 100, weed: 'heavy', dens: 'dense', bed: 'high', paved: 900, mulch: 3.5, trim: 0.75, peren: 0.5 },
  { lot: 8000, complex: 'high', rate: 90, weed: 'light', dens: 'light', bed: 'low', paved: 5000 },
  { lot: 0, complex: 'low', rate: 80, weed: 'light', dens: 'light', bed: null }
];
const P = {
  snow: await open('/?view=focus&req=snow'),
  mulch: await open('/?view=focus&req=mulch'),
  bush: await open('/?view=focus&req=bush'),
  bushMulch: await open('/?view=focus&req=bush,mulch'),
  big: await open('/?view=focus&req=mow,bush,mulch,snow'),
  estate: await open('/?view=focus&req=mow,leaf')
};
const paths = [
  ['snow', [[], ['H1'], ['H2'], ['H4']]],
  ['mulch', [['F1'], []]],
  ['bush', [['E1'], ['OE1'], ['OE1', 'E5'], ['E3'], ['OE3'], ['OF2'], ['OF3'], ['E1', 'E3', 'OF2'], ['OE1', 'OE3', 'OF3'], ['OF2', 'OF3']]],
  ['bushMulch', [['F1', 'E1'], ['F1', 'OF2', 'OF3', 'OE1'], ['F1', 'E1', 'E5', 'OE3']]],
  ['big', [['A1', 'E2'], ['A1', 'E2', 'E5', 'E3'], ['A2', 'E1', 'E5', 'F1', 'C2'], ['A1', 'E2', 'E3', 'F1', 'C2', 'OF3', 'H2'], ['A1', 'F1', 'C2'], ['A2', 'OE1', 'OF2', 'F1', 'H4'], ['A1', 'E2', 'E5', 'F1', 'C2', 'OF2', 'OF3', 'E3', 'H1'], ['A1', 'H1']]],
];
let compared2 = 0;
for (const c of process.env.QUICK ? [] : cases2) {
  for (const k in P) await setDials2(P[k], c);
  await setDials2(full, c); await setDials2(live, c);
  for (const [k, wants] of paths) for (const want of wants) {
    await drive(P[k], want, k);
    const f = await readFocus(P[k]);
    const a1 = await readFull(full, f); const a2 = await readFull(live, f, true);
    compared2++;
    ok(JSON.stringify(f.px) === JSON.stringify(a1.px) && f.bar === a1.bar, k + ': focus != full view', { c, want, f, a1 });
    ok(JSON.stringify(f.px) === JSON.stringify(a2.px) && f.bar === a2.bar, k + ': focus != live root builder', { c, want, f, a2 });
    ok(!want.length || c.lot === 0 || (c.weed === 'none' && want.every(i => ['OF2', 'OF3', 'C2'].includes(i))) || f.bar !== '$0', k + ': price present', { c, want, f });
  }
  // Estate leaf option (G3) next to mowing, all three pages again
  const E = P.estate;
  await E.evaluate(() => { ST.sel.clear(); ST.sel.add('A1'); render(); });
  await click(E, `button.choice[onclick="setLeaf('est',null)"]`);
  const fe = await readFocus(E);
  ok(fe.ids.includes('G3') && !fe.ids.includes('G1') && !fe.ids.includes('OD3'), 'Estate picked in the leaf card selects only G3', { fe });
  const e1 = await readFull(full, fe), e2 = await readFull(live, fe, true); compared2++;
  ok(JSON.stringify(fe.px) === JSON.stringify(e1.px) && fe.bar === e1.bar, 'Estate: focus != full view', { c, fe, e1 });
  ok(JSON.stringify(fe.px) === JSON.stringify(e2.px) && fe.bar === e2.bar, 'Estate: focus != live root builder', { c, fe, e2 });
}
console.log('price parity (snow, mulch, bushes and garden, Estate): ' + compared2 + ' focus-vs-full-vs-live comparisons');

// ---------- 2. screens and flow (phone size) ----------
const p = await open('/', MOBILE);
const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; }, sel);
ok(await vis('#pickScreen'), 'first screen shows the pick screen');
ok(!(await vis('#s1')) && !(await vis('#s2')) && !(await vis('#bar')), 'full builder hidden on first screen');
ok((await p.locator('.pk-tile').count()) === 6, 'six tiles');
ok((await p.locator('.pk-tile.soon').count()) === 0 && !(await p.content()).includes('Coming soon'), 'no coming-soon tiles left');
ok((await p.locator('.pk-tile').evaluateAll(es => es.every(e => e.getAttribute('aria-disabled') !== 'true'))), 'every tile can be picked');
ok(await p.locator('#pickGo').isDisabled(), 'continue disabled until something picked');
await p.evaluate(() => document.querySelectorAll('.pk-tile')[0].scrollIntoView());
await p.locator('.pk-tile').nth(1).click(); // leaf only
await p.locator('#pickGo').click();
ok(await vis('#iAddr') && !(await vis('#iLt')) && !(await vis('#dials')) && !(await vis('#s3')) && !(await vis('#moreBtn')), 'picker path lands on address-first: only the address is shown');
await p.evaluate(() => setDetails(true)); // the older checks below look at the full-fields screen

ok(await vis('#focusStrip') && await vis('#s1') && !(await vis('#pickScreen')), 'leaf path shows focus view');
ok(await p.evaluate(() => !ST.sel.has('A1') && ST.sel.has('OD3') && document.querySelectorAll('#svcCol .season').length === 0), 'leaf only: no mowing, no season clutter, once-leaf preselected');
ok(await p.locator('#fcLeaf').count() === 1 && await p.locator('#fcMow').count() === 0, 'only the leaf card shows');
ok(await p.locator('button.choice.dis').count() === 2, 'every-visit option and Estate disabled without mowing');
ok(await vis('#dLeaf') && !(await vis('#dBed')) && !(await vis('#dRate')), 'only leaf-related settings shown; rate hidden under More');
await click(p, '#moreBtn'); ok(await vis('#dRate'), 'More settings reveals the rate');
await click(p, '.f-add');
ok(await vis('#pickScreen') && await p.locator('.pk-tile.on').count() === 1, '+ Add something else returns to picks with leaf still ticked');
await p.locator('.pk-tile').nth(0).click(); await p.locator('#pickGo').click();
ok(await p.evaluate(() => ST.sel.has('A1') && ST.sel.has('OD3')) && await p.locator('#fcMow').count() === 1 && await p.locator('#fcLeaf').count() === 1, 'added mowing; both cards show, leaf choice kept');
await click(p, '.f-all');
ok(await vis('#s2') && await p.locator('#svcCol .season').count() === 4 && await vis('#backStrip') && !(await vis('#focusStrip')), 'Show everything = full builder with all four seasons');
ok(await p.evaluate(() => ST.sel.has('A1') && ST.sel.has('OD3')), 'nothing lost going to Everything');
await click(p, '#backStrip button'); ok(await vis('#pickScreen'), 'way back from Everything to the pick screen');
await p.locator('.pk-tile.all').click(); ok(await p.evaluate(() => UI.view === 'all'), 'Everything tile opens full builder');
// Spanish
await p.evaluate(() => { UI.pick = new Set(); UI.view = 'pick'; render(); });
await click(p, '#lgEs');
ok((await p.locator('.pk-title').textContent()).includes('¿Qué pidieron?'), 'Spanish first screen');
ok((await p.locator('.pk-tile').nth(0).textContent()).includes('Cortar'), 'Spanish tile label');
await p.locator('.pk-tile').nth(0).click(); await p.locator('#pickGo').click();
ok((await p.locator('#fcMow').textContent()).includes('césped'), 'Spanish mowing card');
await click(p, '#lgEn'); ok((await p.locator('#fcMow').textContent()).includes('clippings'), 'back to English');
// tap targets in the new screens
const small = await p.evaluate(() => [...document.querySelectorAll('.lang button,.pk-tile,.choice,.f-add,.f-all,.strip-btn,.more-btn,.vis-ctl button,.fprice input.pi,#lkBtn,#iAddr,#iLt,.seg button')].filter(e => e.offsetParent).map(e => ({ c: e.className || e.id, h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })).filter(x => x.h < 48 || x.w < 48));
ok(small.length === 0, 'focus view tap targets >= 48px', { small });
await p.evaluate(() => { UI.view = 'pick'; render(); });
const small2 = await p.evaluate(() => [...document.querySelectorAll('.lang button,.pk-tile,.pk-go,.strip-btn')].filter(e => e.offsetParent).map(e => ({ c: e.className, h: Math.round(e.getBoundingClientRect().height) })).filter(x => x.h < 48));
ok(small2.length === 0, 'pick screen tap targets >= 48px', { small2 });
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone');


// ---------- 2b. new service screens (phone size): snow, bushes and garden, mulch, Estate ----------
const shot = async (qs, vp) => open('/?' + qs, vp || MOBILE);
const vis2 = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; }, sel);
const tapSmall = pg => pg.evaluate(() => [...document.querySelectorAll('.lang button,.pk-tile,.choice,.f-add,.f-all,.strip-btn,.more-btn,.f-info,.f-rule button,.f-x,.vis-ctl button,.fprice input.pi,.v-focus .seg button,#lkBtn,#iAddr,#iLt,#iPv,#iMu,#iTr,#iPe,.unit-btn')].filter(e => e.offsetParent).map(e => ({ c: e.className || e.id, h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })).filter(x => x.h < 48 || x.w < 48));
// snow
let q = await shot('view=focus&req=snow');
ok(await q.locator('#fcSnow').count() === 1 && await q.locator('#fcMow').count() === 0, 'snow path: only the snow card');
ok(await q.evaluate(() => ST.sel.has('H1') && ST.sel.size === 1), 'snow path: standard plan preselected, nothing else');
ok(await vis2(q, '#measDet') && await vis2(q, '#iPv') && !(await vis2(q, '#iMu')) && !(await vis2(q, '#iTr')) && !(await vis2(q, '#dLeaf')) && !(await vis2(q, '#dBed')) && !(await vis2(q, '#dCx')), 'snow path: only the driveway/walks size is asked');
await q.fill('#iPv', '4000'); await q.waitForTimeout(500);
ok(await q.evaluate(() => ST.paved === 4000), 'snow path: driveway size feeds the price');
await click(q, `button.choice[onclick="pickGrp(['H1','H2','H4'],'H4',true)"]`);
ok(await q.evaluate(() => ST.sel.has('H4') && !ST.sel.has('H1')), 'snow path: picking zero tolerance swaps the plan');
await click(q, '.f-info'); const descEn = await q.locator('.f-desc').textContent();
ok(descEn.length > 20, 'snow path: "What is included" shows the description');
await click(q, '#lgEs'); const descEs = await q.locator('.f-desc').textContent();
ok(descEs.length > 20 && descEs !== descEn && !/\b(the|and|we)\b/i.test(descEs), 'snow path: description in Spanish', { descEs });
ok((await q.locator('#fcSnow').textContent()).includes('Nieve') && (await q.locator('#fcSnow').textContent()).includes('Cero tolerancia'), 'snow path: Spanish card');
ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'snow path: no sideways scroll');
ok((await tapSmall(q)).length === 0, 'snow path: tap targets >= 48px', { small: await tapSmall(q) });
// bushes and garden
q = await shot('view=focus&req=bush');
ok(await q.locator('#fcBush').count() === 1 && await q.locator('#fcFlo').count() === 1 && await q.locator('#fcBed').count() === 1, 'bush path: bushes, flowers and flower beds cards');
ok(await q.evaluate(() => ST.sel.size === 0), 'bush path: nothing preselected (they tell us what they want)');
ok(await q.locator('button.choice.dis').count() === 3 && await q.locator('button.choice.dis[onclick=""]').count() === 3, 'bush path without mowing/mulch/trim: all-season trim, ladder and every-visit weeding are greyed out');
ok(await q.locator('.f-rule').count() === 3, 'bush path: rules explain what is missing (mowing x2, mulch)');
ok(await vis2(q, '#measDet') && await vis2(q, '#iMu') && await vis2(q, '#iTr') && await vis2(q, '#iPe') && !(await vis2(q, '#iPv')) && await vis2(q, '#dBed') && await vis2(q, '#dCx'), 'bush path: shows bush/flower/mulch sizes, bed size and complexity only');
await click(q, `button.choice[onclick="pickGrp(['E1','E2','OE1'],'E1',true)"]`);
ok(await q.locator('#tdF').count() === 1 && await q.evaluate(() => hasTrim()), 'bush path: thickness question appears once a trim is picked');
await click(q, `#tdF button:nth-child(3)`); ok(await q.evaluate(() => ST.trimDensity === 'dense'), 'bush path: thickness button sets density');
ok(await q.locator(`button.choice[onclick="tgl('E5')"]`).count() === 1, 'bush path: ladder unlocked after a trim');
await click(q, `button.choice[onclick="tgl('OF2')"]`);
ok(await q.locator('#wpF').count() === 1, 'bush path: weeds question appears with weeding');
ok(await q.locator('#wpF svg.seg-ico').count() === 4 && !(await q.locator('#wpF').textContent()).includes('undefined'), 'bush path: weed buttons have pictures');
await click(q, `#wpF button:nth-child(4)`); ok(await q.evaluate(() => ST.weedPressure === 'heavy'), 'bush path: weeds button sets pressure');
await click(q, `#fcBed button[onclick="addMulch()"]`); // + Add mulch
ok(await q.evaluate(() => ST.sel.has('F1') && UI.focus.has('mulch')) && await q.locator('#fcMulch').count() === 1, 'bush path: "+ Add mulch" adds mulch card');
ok(await q.locator('#fcBed button.choice').first().getAttribute('aria-disabled') === 'true', 'bush path: every-visit weeding still needs mowing');
await click(q, `#fcBed button[onclick="addMowToLeaf()"]`); // + Add mowing
ok(await q.evaluate(() => ST.sel.has('A1')) && await q.locator(`button.choice[onclick="tgl('C2')"]`).count() === 1, 'bush path: adding mowing unlocks every-visit weeding');
await click(q, '#lgEs');
const esb = await q.locator('#svcCol').textContent();
ok(esb.includes('Arbustos') && esb.includes('Flores') && esb.includes('Jardineras') && esb.includes('Deshierbe'), 'bush path: Spanish cards');
ok((await tapSmall(q)).length === 0, 'bush path: tap targets >= 48px', { small: await tapSmall(q) });
ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'bush path: no sideways scroll');
// mulch
q = await shot('view=focus&req=mulch');
ok(await q.locator('#fcMulch').count() === 1 && await q.evaluate(() => ST.sel.has('F1') && ST.sel.size === 1), 'mulch path: mulch card, mulch preselected');
ok(await vis2(q, '#iMu') && !(await vis2(q, '#iPv')) && !(await vis2(q, '#iTr')) && await vis2(q, '#dBed') && !(await vis2(q, '#dCx')), 'mulch path: only mulch yards and bed size are asked');
await click(q, `#bfPg button:nth-child(3)`); ok(await q.evaluate(() => ST.bedFootprint === 'high'), 'mulch path: bed size button works');
ok((await q.locator('#bfPg .seg-lbl').first().textContent()) === 'Small', 'mulch path: bed size says Small/Medium/Big');
await click(q, '#lgEs'); ok((await q.locator('#fcMulch').textContent()).includes('Mantillo') && (await q.locator('#bfPg').textContent()).includes('Chicas'), 'mulch path: Spanish');
ok((await tapSmall(q)).length === 0, 'mulch path: tap targets >= 48px', { small: await tapSmall(q) });
// everything in one go and Estate
q = await shot('view=focus&req=mow,leaf,snow,bush,mulch');
ok(await q.locator('.fcard').count() === 7, 'all five requests: seven cards (mowing, leaf, snow, bushes, flowers, beds, mulch)');
ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'all five requests: no sideways scroll');
ok((await tapSmall(q)).length === 0, 'all five requests: tap targets >= 48px', { small: await tapSmall(q) });
q = await shot('view=focus&req=leaf');
ok(await q.locator('#fcLeaf button.choice:has-text("Full clear")').getAttribute('aria-disabled') === 'true', 'leaf path: Estate is greyed out without mowing');
await click(q, '#fcLeaf button[onclick="addMowToLeaf()"]');
await click(q, `button.choice[onclick="setLeaf('est',null)"]`);
ok(await q.evaluate(() => ST.sel.has('G3') && !LEAF_IDS.some(i => i !== 'G3' && ST.sel.has(i))), 'leaf path: Estate (G3) can be chosen once mowing is added');
ok(await q.locator('#fcLeaf button.choice:has-text("once at the end"), #fcLeaf button.choice.dis').count() >= 1 && await q.evaluate(() => { const b = [...document.querySelectorAll('#fcLeaf .choices')[1].children]; return b[1].getAttribute('aria-disabled') === 'true'; }), 'leaf path: "once at the end" greyed out for Estate');
await click(q, `button.choice[onclick="setLeaf('nut',null)"]`);
ok(await q.evaluate(() => ST.sel.has('G1') && !ST.sel.has('G3')), 'leaf path: going back to Shred swaps out Estate');
// no raw translation keys (like "c.E2d") ever show on screen, in either language, in any state
for (const lg of ['en', 'es']) for (const qs of ['req=bush', 'req=leaf', 'req=mow,leaf,snow,bush,mulch', 'req=snow,mulch']) {
  const kp = await shot('view=focus&' + qs + '&lang=' + lg);
  const raw = await kp.evaluate(() => (document.getElementById('focusCol') || document.getElementById('svcCol')).innerText.match(/\b[a-z]{1,2}\.[A-Za-z0-9]{1,6}\b/g));
  ok(!raw, 'no raw translation keys on screen (' + lg + ' ' + qs + ')', { raw });
}
// Spanish for the warnings, floor notes and the full list
q = await shot('view=focus&req=snow&lang=es');
await q.fill('#iLt', '3000'); await q.waitForTimeout(500);
const esOut = await q.evaluate(() => document.body.innerText);
ok(/Cálculo solo con el tamaño del terreno/.test(esOut) && /pies²/.test(esOut), 'Spanish rough-estimate note');
ok(/Se usan valores estándar/.test(esOut) && /Precio por hora/.test(esOut), 'Spanish auto-defaults warning');
ok(/marzo hasta febrero/.test(esOut) && !/March|through/.test(esOut.replace(/Details[\s\S]*$/, '')), 'Spanish payment card months');
q = await shot('view=focus&req=mulch&lang=es');
await q.fill('#iLt', '3000'); await q.evaluate(() => { ST.ov = { F1: 100 }; render(); }); await q.waitForTimeout(400);
ok(/Menos del mínimo \(remoto\)/.test(await q.evaluate(() => document.body.innerText)) && /cobra el mínimo de \$/.test(await q.evaluate(() => document.body.innerText)), 'Spanish "below floor" note');
q = await shot('view=focus&req=mow&lang=es');
await q.fill('#iLt', '1500'); await q.evaluate(() => setPay('monthly')); await q.waitForTimeout(400);
ok(/menos del mínimo de \$\d+ al mes/.test(await q.evaluate(() => document.body.innerText)), 'Spanish monthly-minimum note');
q = await shot('view=all&lang=es');
await q.evaluate(() => { ST.lot = 20000; ST.sel = new Set(['A1', 'E2', 'C2', 'G3', 'H2', 'OF2']); ST.rate = 80; render(); });
const esAll = await q.evaluate(() => document.getElementById('svcCol').innerText);
ok(/Corte semanal/.test(esAll) && /Toda la temporada/.test(esAll) && /Primavera/.test(esAll) && /Invierno/.test(esAll) && /seleccionados/.test(esAll), 'Everything view in Spanish: seasons, categories, counts');
await q.evaluate(() => { ST.exp = new Set(['A1', 'H2', 'G3', 'OF2']); render(); });
const esDesc = await q.evaluate(() => document.getElementById('svcCol').innerText);
ok(/Quitamos nieve 24\/7/.test(esDesc) && /Extra al plan de corte/.test(esDesc) && /vinagre/.test(esDesc), 'Everything view in Spanish: service descriptions');
const left = await q.evaluate(() => [...document.querySelectorAll('.svc-nm,.desc-btn,.cat-title,.atag')].map(e => e.innerText).filter(t => /Weekly|Hide description|Popular|One-time|Bush|Leaf|Snow/.test(t) && !/Popular/.test(t)));
ok(left.length === 0, 'Everything view in Spanish: no English service names left', { left });
await q.evaluate(() => { UI.lang = 'en'; });

// ---------- 3. Everything == the current builder ----------
const sameDials = { lot: 14000, leaf: 4, complex: 'med', rate: 90 };
for (const pg of [full, live]) await pg.evaluate(c => { Object.assign(ST, c, { lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0, ov: {}, sel: new Set(['A1', 'G1', 'OD3', 'F1', 'H1']) }); render(); }, sameDials);
const norm = h => h.replace(/\s+/g, ' ');
// The usability pass reworded the payment cards and the bar in plain words, so for those two compare every dollar amount and percent in order (wording is free, numbers are strict).
const nums = h => (h.match(/\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%/g) || []).join(' ');
// One-time weeding (OF2) is listed with its price even when not picked and is exactly 2x in the request-first page, so halve that one number before comparing; every other character must match.
const halveOF2 = h => h.replace(/data-id="OF2" value="(\d+)" placeholder="(\d+)"/, (m, v, ph) => { ok(Number(v) % 2 === 0 && v === ph, 'OF2 price on the request-first page is an exact 2x', { v, ph }); return 'data-id="OF2" value="' + v / 2 + '" placeholder="' + ph / 2 + '"'; });
for (const pg of [full, live]) await pg.evaluate(c => { Object.assign(ST, c, { weedPressure: 'heavy', trimDensity: 'dense', bedFootprint: 'high', lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0, ov: {}, sel: new Set(['A1', 'E2', 'E5', 'E3', 'C2', 'F1', 'OF3', 'G3', 'H2', 'D2', 'B1']) }); render(); }, sameDials);
const [a0, b0] = await Promise.all([full, live].map(pg => pg.evaluate(() => ({ svc: document.getElementById('svcCol').innerHTML, out: document.getElementById('outCol').innerHTML, bar: document.getElementById('bar').innerHTML, s1: document.getElementById('s1').innerText }))));
ok(norm(halveOF2(a0.svc)) === norm(b0.svc) && nums(a0.out) === nums(b0.out) && nums(a0.bar) === nums(b0.bar) && nums(a0.s1) === nums(b0.s1), 'Everything: identical to the current builder with every new service and dial in use, except one-time weeding which is checked below (services, payment cards, bar, property step)');
for (const pg of [full, live]) await pg.evaluate(c => { Object.assign(ST, c, { weedPressure: 'light', trimDensity: 'light', bedFootprint: null, sel: new Set(['A1', 'G1', 'OD3', 'F1', 'H1']) }); render(); }, sameDials);
const [a, b] = await Promise.all([full, live].map(pg => pg.evaluate(() => ({ svc: document.getElementById('svcCol').innerHTML, out: document.getElementById('outCol').innerHTML, bar: document.getElementById('bar').innerHTML, s1: document.getElementById('s1').innerHTML.length }))));
ok(norm(halveOF2(a.svc)) === norm(b.svc), 'Everything: services list identical to current builder (OF2 price halved back)');
ok(nums(a.out) === nums(b.out) && nums(a.out).length > 20, 'Everything: payment card dollar amounts identical to current builder');
ok(nums(a.bar) === nums(b.bar), 'Everything: price bar amounts identical to current builder');

// ---------- 3b. One-time weeding (OF2) is exactly double the current builder's price; nothing else moves ----------
{
  let n = 0, nonzero = 0;
  const grab = (pg, c) => pg.evaluate(c => { Object.assign(ST, c, { lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0, ov: {} }); return getSug(); }, c);
  for (const lot of [0, 6000, 10890, 21780, 43560, 65000]) for (const weedPressure of ['none', 'light', 'mod', 'heavy']) for (const bedFootprint of [null, 'low', 'mod', 'high'])
    for (const [complex, rate] of [['low', 80], ['med', 90], ['high', 100], ['low', 65]]) for (const leaf of [0, 3]) {
      const c = { lot, weedPressure, bedFootprint, complex, rate, leaf };
      const [a, b] = [await grab(full, c), await grab(live, c)]; n++;
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      const others = [...keys].filter(k => k !== 'OF2' && a[k] !== b[k]);
      ok(others.length === 0, 'doubling touches only OF2; other prices changed: ' + others.join(','), { c });
      ok((a.OF2 || 0) === 2 * (b.OF2 || 0), 'OF2 is exactly 2x the current builder price (' + a.OF2 + ' vs ' + b.OF2 + ')', { c });
      if (b.OF2 > 0) nonzero++;
    }
  ok(nonzero > 300, 'weeding doubling was checked on many non-zero prices', { nonzero });
  // OF3 (bed cleanup) and C2 (every-visit weeding) explicitly unchanged at a typical bed size
  await full.evaluate(() => Object.assign(ST, { lot: 10890, weedPressure: 'mod', bedFootprint: 'mod', complex: 'low', rate: 80, ov: {} }));
  await live.evaluate(() => Object.assign(ST, { lot: 10890, weedPressure: 'mod', bedFootprint: 'mod', complex: 'low', rate: 80, ov: {} }));
  const [x, y] = [await full.evaluate(() => getSug()), await live.evaluate(() => getSug())];
  ok(x.OF3 === y.OF3 && x.C2 === y.C2 && x.OF1 === y.OF1 && x.OF2 === 2 * y.OF2, 'bed cleanup (OF3), ongoing weeding (C2) and mulch (OF1) unchanged; OF2 doubled', { x: [x.OF2, x.OF3, x.C2], y: [y.OF2, y.OF3, y.C2] });
  console.log('weeding doubling: ' + n + ' dial combinations (' + nonzero + ' with a price)');
}

// ---------- 4. go-live checks: no preview tag, old links still work, backup builder present ----------
{
  const r = await open('/');
  ok(!(await r.evaluate(() => document.body.innerText)).includes('PREVIEW') && (await r.evaluate(() => document.title)) === 'Amigo Landscaping — Quote Builder', 'root: no PREVIEW tag, plain title');
  ok(await r.evaluate(() => !!document.querySelector('.pk-tile')), 'root: first screen shows the pick tiles');
  const o = await open('/request-first/?view=focus&req=snow&lang=es');
  await o.waitForURL(u => !u.pathname.includes('request-first'), { timeout: 5000 }).catch(() => {});
  ok(new URL(o.url()).pathname === '/' && o.url().includes('req=snow') && o.url().includes('lang=es'), 'old /request-first/ link redirects to the root and keeps its options', { url: o.url() });
  const pv = await open('/previous/');
  ok(await pv.evaluate(() => typeof getSug === 'function' && !document.querySelector('.pk-tile')), '/previous/ still loads the old builder');
}


// ---------- 5. usability pass: quote summary, copy/share, start over, plain words, address errors ----------
{
  const ctx = await browser.newContext({ viewport: MOBILE, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const u = await ctx.newPage(); u.setDefaultTimeout(6000); u.on('pageerror', e => errors.push('usability: ' + e.message));
  await u.route(/nominatim|arcgis|dupage/i, r => r.abort());
  const goto = async qs => { await u.goto(base + withDet('/?' + qs)); await u.waitForTimeout(250); };
  const txt = () => u.evaluate(() => document.body.innerText);
  const barBtn = () => u.evaluate(() => document.querySelector('#bar .bar-btn').textContent.trim());

  // empty states: tell the person what to do next instead of showing $0 and a vague button
  await goto('view=focus&req=mow,leaf');
  ok(/Type the lot size/.test(await u.evaluate(() => document.querySelector('#bar').innerText)) && /lot size/i.test(await barBtn()), 'no lot size: sticky bar asks for the lot size');
  ok(await u.evaluate(() => getComputedStyle(document.getElementById('qrCard')).display === 'none'), 'no price yet: no "Quote ready" box');
  ok(await u.evaluate(() => !document.getElementById('st1').classList.contains('done')), 'step 1 is not ticked before the lot size is typed');
  await u.fill('#iLt', '10890'); await u.waitForTimeout(200);
  ok(/see quote/i.test(await barBtn()), 'lot size typed: bar button says "See quote"');
  ok(await u.evaluate(() => document.getElementById('st1').classList.contains('done') && document.getElementById('st2').classList.contains('done')), 'steps 1 and 2 are ticked once the lot size and a service exist');
  await goto('view=focus&req=snow'); await u.fill('#iLt', '10890'); await u.waitForTimeout(150);
  await u.evaluate(() => { ST.sel.clear(); render(); });
  ok(/Nothing picked yet/.test(await u.evaluate(() => document.querySelector('#bar').innerText)) && /pick a service/i.test(await barBtn()), 'nothing picked: bar says so and points at the services');

  // quote summary matches the prices on the page
  const paths = ['mow', 'leaf', 'snow', 'bush', 'mulch', 'mow,leaf', 'mow,leaf,snow,bush,mulch'];
  for (const lang of ['en', 'es']) for (const req of paths) {
    await goto('view=focus&lang=' + lang + '&req=' + req); await u.fill('#iLt', '10890'); await u.evaluate(() => { if (!ST.sel.size) tgl('E1'); }); await u.waitForTimeout(200);
    const d = await u.evaluate(() => { const qc = document.getElementById('qrCard'); const rows = [...qc.querySelectorAll('.qr-row')].map(r => [r.children[0].textContent, Number(r.children[1].textContent.replace(/[^\d]/g, ''))]); let sum = 0; ST.sel.forEach(id => sum += gp(id) || 0); const tot = Number(qc.querySelector('.qr-big').textContent.replace(/[^\d]/g, '')); return { shown: qc.offsetParent !== null, rows, tot, sum, n: ST.sel.size, bar: document.querySelector('#bar .bar-amt').textContent, text: quoteText() }; });
    const k = lang + ' ' + req;
    ok(d.shown && d.rows.length === d.n && d.rows.every(r => r[0] && r[1] >= 0), k + ': quote lists every picked service', { d });
    ok(d.tot === d.sum && d.rows.reduce((a, r) => a + r[1], 0) === d.sum, k + ': quote total equals the sum of the services', { d });
    ok(d.bar.replace(/[^\d]/g, '') === String(d.sum), k + ': quote total equals the bar price', { d });
    ok(!/undefined|NaN|\[object/.test(d.text) && d.rows.every(r => d.text.includes(r[0])) && d.text.includes('$' + d.sum.toLocaleString()), k + ': copied text has every service and the total', { text: d.text });
    ok(lang === 'es' ? /Cotización|Formas de pago/.test(d.text) && !/Ways to pay/.test(d.text) : /Ways to pay/.test(d.text), k + ': copied text is in the screen language');
  }

  // copy button really copies, and says so
  await goto('view=focus&req=mow,leaf'); await u.fill('#iLt', '10890'); await u.waitForTimeout(200);
  await u.locator('#qrCopy').click(); await u.waitForTimeout(250);
  const clip = await u.evaluate(() => navigator.clipboard.readText());
  ok(/Total: \$1,987/.test(clip) && /Spread monthly/.test(clip) && /Annual Payment/.test(clip), 'Copy quote puts the quote on the clipboard', { clip });
  ok(/Copied/.test(await u.locator('#qrCopy').textContent()), 'Copy button confirms with "Copied"');
  // see-quote button scrolls to the summary
  await u.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await u.locator('#bar .bar-btn').click(); await u.waitForTimeout(900);
  ok(await u.evaluate(() => { const r = document.getElementById('qrCard').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), '"See quote" scrolls the quote into view');
  // 20% extra is shown in the summary the same way as on the pay card
  await u.evaluate(() => { ST.bufferOn = true; render(); });
  ok(/20% extra/.test(await u.locator('#qrCard').innerText()), 'quote shows the 20% extra line when it is on');
  await u.evaluate(() => { ST.bufferOn = false; render(); });

  // start over: needs a second tap, then returns to the first screen with nothing picked
  await u.locator('#qrCard .qr-so').click();
  ok(/Tap again/.test(await u.locator('#qrCard .qr-so').textContent()) && await u.evaluate(() => ST.sel.size > 0), 'Start over asks for a second tap and erases nothing yet');
  await u.locator('#qrCard .qr-so').click(); await u.waitForTimeout(500);
  ok(await u.evaluate(() => !!document.querySelector('.pk-tile') && UI.view === 'pick' && ST.lot === 0), 'second tap on Start over goes back to the first screen, empty');
  await goto('view=focus&req=mow'); await u.locator('#focusStrip .so-btn').click(); await u.waitForTimeout(100);
  await u.waitForTimeout(4300);
  ok(/Start over/.test(await u.locator('#focusStrip .so-btn').textContent()), 'Start over un-arms by itself after a few seconds');

  // plain words: nothing office-only on the phone views
  for (const req of ['mow', 'leaf', 'snow', 'bush', 'mulch']) {
    await goto('view=focus&req=' + req); await u.fill('#iLt', '10890'); await u.waitForTimeout(200);
    const body = await txt();
    ok(!/buffer|\bfloor\b|complexity|man-hour|footprint|perennial|\bICP\b|derived from|auto defaults/i.test(body), req + ': no office jargon on screen', { hit: (body.match(/buffer|\bfloor\b|complexity|man-hour|footprint|perennial|\bICP\b|derived from|auto defaults/i) || [])[0] });
    ok(await u.evaluate(() => document.documentElement.scrollWidth <= innerWidth), req + ': no sideways scrolling');
    const tiny = await u.evaluate(() => [...document.querySelectorAll('#s1 .hint, #s1 .lbl, #qrCard *, .bar-l, #fsChips *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11.5).map(e => e.textContent.trim().slice(0, 30)));
    ok(tiny.length === 0, req + ': hints and labels are at least 12px', { tiny });
  }
  // new buttons are big enough to tap
  await goto('view=focus&req=mow,leaf'); await u.fill('#iLt', '10890'); await u.waitForTimeout(200);
  const smallBtn = await u.evaluate(() => [...document.querySelectorAll('.qr-btn,.so-btn,.f-add,.f-all,#bar .bar-btn')].filter(e => e.offsetParent).map(e => [e.className, Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 48));
  ok(smallBtn.length === 0, 'new buttons are at least 48px tall', { smallBtn });
  // unfinished-address help: clear message right under the address box, in both languages
  for (const lang of ['en', 'es']) {
    await goto('view=focus&lang=' + lang + '&req=mow'); await u.fill('#iAddr', 'zzzz qqq nowhere'); await u.locator('#lkBtn').click(); await u.waitForTimeout(2500);
    const m = await u.evaluate(() => { const e = document.getElementById('addrMsg'); const r = e.getBoundingClientRect(); return { show: e.classList.contains('show'), text: e.textContent, top: r.top + scrollY, addrTop: document.getElementById('iAddr').getBoundingClientRect().top + scrollY, btn: document.getElementById('lkBtn').textContent }; });
    ok(m.show && m.text.length > 20 && m.top - m.addrTop < 150, lang + ': bad address shows a plain message right under the address', { m });
    ok(lang === 'es' ? /No encontramos esa dirección/.test(m.text) : /couldn't find that address/.test(m.text), lang + ': address message language');
    ok(await u.evaluate(() => document.getElementById('mapBox').style.display === 'none'), lang + ': no misleading map after a failed lookup');
  }
  await ctx.close();
  console.log('usability pass: checked quote summary on ' + paths.length * 2 + ' views');
}


// ---------- 8. address-first: one service = type the address; other fields only if the lookup finds nothing, or on "Change details" ----------
{
  const modes = {
    found: async c => { await c.route(/nominatim/i, r => r.fulfill({ json: [{ lat: '41.85', lon: '-88.0', address: { town: 'Wheaton' } }] })); await c.route(/arcgis|dupage/i, r => r.fulfill({ json: { features: [{ attributes: { ACREAGE: 0.25, PIN: '0000' } }] } })); },
    fail: async c => { await c.route(/nominatim|arcgis|dupage/i, r => r.abort()); },
    empty: async c => { await c.route(/nominatim/i, r => r.fulfill({ json: [] })); await c.route(/arcgis|dupage/i, r => r.fulfill({ json: { features: [] } })); },
  };
  const mk = async (mode, qs) => {
    const ctx = await browser.newContext({ viewport: MOBILE, hasTouch: true, isMobile: true });
    const u = await ctx.newPage(); u.setDefaultTimeout(6000); u.on('pageerror', e => errors.push('address-first: ' + e.message));
    await modes[mode](ctx); await u.goto(base + '/?' + qs); await u.waitForTimeout(250); u.ctx = ctx; return u;
  };
  const vis = (u, sel) => u.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
  const lookup = async (u, a = '303 W Wesley St, Wheaton, IL') => { await u.fill('#iAddr', a); await u.locator('#lkBtn').click(); await u.waitForTimeout(1500); };
  const barAmt = u => u.evaluate(() => document.querySelector('#bar .bar-amt').textContent);
  const barTxt = u => u.evaluate(() => document.querySelector('#bar').innerText);
  const FIELDS = ['#iLt', '#dials', '#moreBtn', '#measDet', '#s3', '#mapBox', '#estW'];
  for (const lang of ['en', 'es']) {
    const es = lang === 'es';
    // before typing: ONLY the address box is there, no quote yet, the bar asks for the address
    let u = await mk('found', 'view=focus&lang=' + lang + '&req=mow');
    ok(await vis(u, '#iAddr'), lang + ': address box shown');
    for (const f of FIELDS) ok(!(await vis(u, f)), lang + ': hidden before the address is typed: ' + f);
    ok(!(await vis(u, '#qrCard')), lang + ': no quote yet');
    ok((es ? /Escribe la dirección/ : /Type the address/).test(await barTxt(u)), lang + ': bar asks for the address');
    // address found: still only the address + the quote
    await lookup(u);
    ok(await vis(u, '#qrCard'), lang + ': Quote ready card shows after the address is found');
    for (const f of FIELDS) ok(!(await vis(u, f)), lang + ': fields stay hidden after a successful lookup: ' + f);
    ok(!(await vis(u, '#addrMsg')), lang + ': no error after a successful lookup');
    ok(/10,890/.test(await u.locator('#addrNote').innerText()), lang + ': says what lot size it found');
    ok(await u.evaluate(() => ST.lot) === 10890, lang + ': lot size filled from the lookup');
    const mowPrice = await barAmt(u);
    ok(/^\$[1-9]/.test(mowPrice), lang + ': price shows', { mowPrice });
    const tgt = await u.evaluate(() => [...document.querySelectorAll('#detToggle,#lkBtn,.qr-btn,.so-btn,.f-add,#bar .bar-btn')].filter(e => e.offsetParent).map(e => [e.id || e.className, Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 48));
    ok(tgt.length === 0, lang + ': address-first buttons are at least 48px tall', { tgt });
    // price is the same as the old full-fields screen with the same lot size (auto values, leaf level default)
    const old = await open('/?view=focus&lang=' + lang + '&req=mow'); await old.fill('#iLt', '10890'); await old.waitForTimeout(250);
    ok(mowPrice === await barAmt(old), lang + ': same price as the full-fields screen with the same lot size', { mowPrice, old: await barAmt(old) });
    // Change details: shows the lot size / dials, change a value, the quote follows; tap again to put them away
    ok(/detalles/.test(await u.locator('#detToggle').innerText()) === es, lang + ': "Change details" link in the right language');
    await u.locator('#detToggle').click(); await u.waitForTimeout(150);
    ok(await vis(u, '#iLt') && await vis(u, '#dials'), lang + ': Change details reveals the fields');
    ok(await u.evaluate(() => document.getElementById('iLt').value) === '10890', lang + ': the looked-up lot size is in the field');
    await u.fill('#iLt', '21780'); await u.waitForTimeout(250);
    ok(await barAmt(u) !== mowPrice, lang + ': changing a field changes the quote', { now: await barAmt(u), mowPrice });
    await u.locator('#detToggle').click(); await u.waitForTimeout(150);
    ok(!(await vis(u, '#iLt')), lang + ': second tap puts the fields away again');
    ok(await u.evaluate(() => ST.lot) === 21780, lang + ': the changed value is kept');
    await u.ctx.close();

    // a different address must not keep the old lot size / quote
    u = await mk('found', 'view=focus&lang=' + lang + '&req=mow');
    await lookup(u); await u.fill('#iAddr', '12 Other Ave'); await u.waitForTimeout(300);
    ok(await u.evaluate(() => ST.lot) === 0 && !(await vis(u, '#qrCard')), lang + ': new address clears the old lot size and quote (no stale price)');
    await u.locator('#addrMsg').count();
    await u.ctx.close();
    // blank address: plain message, nothing breaks
    u = await mk('found', 'view=focus&lang=' + lang + '&req=mow');
    await u.locator('#lkBtn').click(); await u.waitForTimeout(300);
    ok(await vis(u, '#addrMsg') && (es ? /Escribe primero/ : /Type the address first/).test(await u.locator('#addrMsg').innerText()), lang + ': blank address gets a plain message');
    await u.ctx.close();

    // address not found (network down, or nothing matched): plain message + only the fields this service needs
    for (const mode of ['fail', 'empty']) {
      u = await mk(mode, 'view=focus&lang=' + lang + '&req=mow');
      await lookup(u);
      ok(await vis(u, '#addrMsg'), lang + '/' + mode + ': plain message shown');
      ok((es ? /No encontramos esa dirección\. Escribe el tamaño del terreno\./ : /We couldn't find that address\. Type the lot size\./).test(await u.locator('#addrMsg').innerText()), lang + '/' + mode + ': message text');
      ok(await vis(u, '#iLt'), lang + '/' + mode + ': lot size box is revealed');
      ok(!(await vis(u, '#dials')) && !(await vis(u, '#s3')) && !(await vis(u, '#moreBtn')) && !(await vis(u, '#measDet')), lang + '/' + mode + ': nothing else is revealed for mowing');
      ok(!(await vis(u, '#qrCard')), lang + '/' + mode + ': no quote until the lot size is typed');
      ok(/lot size|tamaño/i.test(await barTxt(u)), lang + '/' + mode + ': bar asks for the lot size');
      await u.fill('#iLt', '10890'); await u.waitForTimeout(250);
      ok(await vis(u, '#qrCard') && await barAmt(u) === mowPrice, lang + '/' + mode + ': typing the lot size gives the same quote as a found address', { got: await barAmt(u), mowPrice });
      // Change details also works from the not-found state
      await u.locator('#detToggle').click(); await u.waitForTimeout(150);
      ok(await vis(u, '#dials'), lang + '/' + mode + ': Change details works after a failed lookup too');
      await u.ctx.close();
    }
  }
  // each service: found = fields hidden; not found = only the fields THAT service needs
  const needs = { mow: false, leaf: false, snow: true, mulch: true, bush: true }; // true = measurement box is revealed when the lookup fails
  for (const [svc, meas] of Object.entries(needs)) {
    let u = await mk('found', 'view=focus&req=' + svc); await lookup(u);
    for (const f of ['#dials', '#moreBtn', '#measDet', '#s3', '#mapBox']) ok(!(await vis(u, f)), svc + ': hidden after address found: ' + f);
    ok(!(await vis(u, '#iLt')) && await u.evaluate(() => ST.lot) === 10890, svc + ': lot size hidden but filled');
    await u.ctx.close();
    u = await mk('fail', 'view=focus&req=' + svc); await lookup(u);
    ok(await vis(u, '#iLt') && await vis(u, '#addrMsg'), svc + ': not found reveals lot size + message');
    ok(await vis(u, '#measDet') === meas, svc + ': measurement box ' + (meas ? 'revealed' : 'stays hidden') + ' when not found');
    ok(!(await vis(u, '#dials')) && !(await vis(u, '#s3')), svc + ': dials and payment stay hidden when not found');
    await u.ctx.close();
  }
  // several services: still only the address; "Everything" is still the full screen
  { const u = await mk('found', 'view=focus&req=mow,leaf,snow,mulch'); await lookup(u);
    for (const f of ['#iLt', '#dials', '#measDet', '#s3']) ok(!(await vis(u, f)), 'several services: hidden after address found: ' + f);
    ok(await vis(u, '#qrCard'), 'several services: quote ready'); await u.ctx.close(); }
  for (const url of ['view=all', 'view=focus&req=mow&details=1']) {
    const u = await mk('found', url);
    ok(!(await u.evaluate(() => document.body.classList.contains('simple'))), url + ': full screen, not address-first');
    for (const f of ['#iLt', '#dials', '#s3']) ok(await vis(u, f), url + ': shown: ' + f);
    await u.ctx.close();
  }
  { const u = await mk('found', 'view=focus&req=mow'); await u.locator('#focusStrip .f-all').count();
    await u.evaluate(() => goAll()); await u.waitForTimeout(150);
    ok(await vis(u, '#iLt') && await vis(u, '#dials') && await vis(u, '#s3'), 'Everything from the focus screen shows all the fields'); await u.ctx.close(); }
  console.log('address-first flow checked');
}

console.log('checks: ' + checks + ', failures: ' + fails.length + ', page errors: ' + errors.length);
fails.slice(0, 6).forEach(f => console.log(JSON.stringify(f).slice(0, 600)));
errors.slice(0, 5).forEach(e => console.log(e));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
