// Request-first builder (preview): filtered view must price exactly like the full view and like the live root builder.
// Also checks the screens, Spanish toggle, tap-target size and that "Everything" is the same page as the current builder.
// Usage: node request-first/tests/request-first.mjs [baseUrl]   (default http://localhost:8765)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [], fails = []; let checks = 0;
const ok = (cond, msg, extra) => { checks++; if (!cond) fails.push({ msg, ...extra }); };
const open = async (path, vp) => {
  const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, hasTouch: !!vp });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(path + ': ' + e.message));
  await p.route(/nominatim|arcgis|dupage/i, r => r.abort()); await p.goto(base + path); return p;
};
const MOBILE = { width: 390, height: 844 };
const click = (p, sel) => p.locator(sel).first().click();

// ---------- 1. same answers -> same price (focus view vs full view vs live root builder) ----------
const full = await open('/request-first/?view=all');
const live = await open('/');
const setDials = (p, c) => p.evaluate(c => { Object.assign(ST, { lot: c.lot, leaf: c.leaf, complex: c.complex, rate: c.rate, lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0, ov: {} }); render(); }, c);
const readFocus = p => p.evaluate(() => {
  const ids = [...ST.sel].sort(); const px = {};
  ids.forEach(id => { const r = document.querySelector('.fprice[data-svc="' + id + '"]'); const i = r && r.querySelector('input.pi'); px[id] = i ? i.value : (r && r.querySelector('[data-px]') || {}).textContent; });
  return { ids, px, bar: document.querySelector('#bar .bar-amt').textContent, vis: JSON.stringify(ST.leafVisits || {}) };
});
const readFull = (p, snap) => p.evaluate(s => {
  ST.sel = new Set(s.ids); ST.leafVisits = JSON.parse(s.vis); render();
  const px = {}; s.ids.forEach(id => { const r = [...document.querySelectorAll('.svc')].find(x => x.querySelector('[data-id="' + id + '"],[data-px="' + id + '"]')); const i = r && r.querySelector('input.pi'); px[id] = i ? i.value : (r && r.querySelector('[data-px]') || {}).textContent; });
  return { px, bar: document.querySelector('#bar .bar-amt').textContent };
}, snap);
const cases = [];
for (const lot of [6000, 10890, 21780, 43560, 65000]) for (const leaf of [0, 1, 3, 5]) for (const [complex, rate] of [['low', 80], ['high', 100]]) cases.push({ lot, leaf, complex, rate });
const both = await open('/request-first/?view=focus&req=mow,leaf');
const leafOnly = await open('/request-first/?view=focus&req=leaf');
const mowOnly = await open('/request-first/?view=focus&req=mow');
let compared = 0;
for (const c of cases) {
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

// ---------- 2. screens and flow (phone size) ----------
const p = await open('/request-first/', MOBILE);
const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; }, sel);
ok(await vis('#pickScreen'), 'first screen shows the pick screen');
ok(!(await vis('#s1')) && !(await vis('#s2')) && !(await vis('#bar')), 'full builder hidden on first screen');
ok((await p.locator('.pk-tile').count()) === 6, 'six tiles');
ok((await p.locator('.pk-tile.soon').count()) === 3, 'three coming-soon tiles');
ok(await p.locator('#pickGo').isDisabled(), 'continue disabled until something picked');
await p.locator('.pk-tile.soon').first().click({ force: true });
ok((await p.locator('#pickHint').textContent()).length > 0, 'coming-soon tile explains itself');
ok(await p.evaluate(() => !UI.pick.size), 'coming-soon tile cannot be picked');
await p.evaluate(() => document.querySelectorAll('.pk-tile')[0].scrollIntoView());
await p.locator('.pk-tile').nth(1).click(); // leaf only
await p.locator('#pickGo').click();
ok(await vis('#focusStrip') && await vis('#s1') && !(await vis('#pickScreen')), 'leaf path shows focus view');
ok(await p.evaluate(() => !ST.sel.has('A1') && ST.sel.has('OD3') && document.querySelectorAll('#svcCol .season').length === 0), 'leaf only: no mowing, no season clutter, once-leaf preselected');
ok(await p.locator('#fcLeaf').count() === 1 && await p.locator('#fcMow').count() === 0, 'only the leaf card shows');
ok(await p.locator('button.choice.dis').count() === 1, 'every-visit option disabled without mowing');
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

// ---------- 3. Everything == the current builder ----------
const sameDials = { lot: 14000, leaf: 4, complex: 'med', rate: 90 };
for (const pg of [full, live]) await pg.evaluate(c => { Object.assign(ST, c, { lawn: 0, paved: 0, mulch: 0, trim: 0, peren: 0, ov: {}, sel: new Set(['A1', 'G1', 'OD3', 'F1', 'H1']) }); render(); }, sameDials);
const norm = h => h.replace(/\s+/g, ' ');
const [a, b] = await Promise.all([full, live].map(pg => pg.evaluate(() => ({ svc: document.getElementById('svcCol').innerHTML, out: document.getElementById('outCol').innerHTML, bar: document.getElementById('bar').innerHTML, s1: document.getElementById('s1').innerHTML.length }))));
ok(norm(a.svc) === norm(b.svc), 'Everything: services list identical to current builder');
ok(norm(a.out) === norm(b.out), 'Everything: payment cards identical to current builder');
ok(norm(a.bar) === norm(b.bar), 'Everything: price bar identical to current builder');

console.log('checks: ' + checks + ', failures: ' + fails.length + ', page errors: ' + errors.length);
fails.slice(0, 6).forEach(f => console.log(JSON.stringify(f).slice(0, 600)));
errors.slice(0, 5).forEach(e => console.log(e));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
