// Share link, in a real browser: fill a quote, Copy link, open the link in a fresh tab, everything is filled back in.
// Usage: node request-first/tests/share-link.mjs [baseUrl]   (default http://localhost:8765, repo root served)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [], fails = []; let checks = 0;
const ok = (cond, msg, extra) => { checks++; if (!cond) fails.push({ msg, ...extra }); };
// The address lookup is faked: DuPage says the parcel is 0.30 ac (13,068 sq ft), so we can see the link's lot win.
const PARCEL = { features: [{ attributes: { PIN: '0516', ACREAGE: 0.3, PROPADDRL1: '303 W WESLEY ST', PROPCITY: 'WHEATON', PROPZIP: '60187' } }] };
const open = async (path) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.setDefaultTimeout(6000); p.on('pageerror', e => errors.push(path + ': ' + e.message));
  await p.route(/nominatim/i, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '41.866', lon: '-88.110', display_name: '303 W Wesley St, Wheaton, IL', address: { city: 'Wheaton', postcode: '60187' } }]) }));
  await p.route(/arcgis|dupage/i, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(PARCEL) }));
  await p.route(/maps\.google/i, r => r.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await p.goto(base + path); return p;
};
const state = p => p.evaluate(() => ({ lot: ST.lot, leaf: ST.leaf, complex: ST.complex, rate: ST.rate, corner: ST.cornerLot, pk: ST.parkway, vis: ST.leafVisits, ov: ST.ov, sel: [...ST.sel], view: UI.view, focus: [...UI.focus], addr: getAddr(), lt: document.getElementById('iLt').value, pkF: document.getElementById('iPk').value, corF: document.getElementById('iCorner').checked, leafOn: [...document.querySelectorAll('#lPg button')].findIndex(b => b.classList.contains('on')), cxOn: [...document.querySelectorAll('#cxPg button')].findIndex(b => b.classList.contains('on')), qr: [...document.querySelectorAll('#qrCard .qr-row')].map(r => r.textContent), gp: { A1: gp('A1'), OD3: gp('OD3'), G1: gp('G1') }, sug: getSug().OD3, mapShown: document.getElementById('mapBox').style.display, pick: document.getElementById('addrPick').style.display }));

// 1. no params: same as before (request picker, clean address bar)
{ const p = await open('/'); const s = await state(p);
  ok(s.view === 'pick' && s.sel.join() === 'A1' && s.lot === 0 && new URL(p.url()).search === '', 'plain open: picker, defaults, no params', s);
  await p.context().close(); }

// 2. old links still work
{ const p = await open('/?view=all'); ok((await state(p)).view === 'all', 'view=all opens everything'); await p.context().close(); }
{ const p = await open('/?lang=es&view=focus&req=mow,leaf'); const s = await state(p);
  ok(s.view === 'focus' && s.focus.join() === 'mow,leaf' && await p.evaluate(() => UI.lang) === 'es', 'lang=es&view=focus&req=mow,leaf still works', s);
  ok(new URL(p.url()).searchParams.get('lang') === 'es', 'lang stays in the address bar'); await p.context().close(); }
{ const p = await open('/request-first/?view=focus&req=leaf'); await p.waitForTimeout(300); const s = await state(p);
  ok(s.view === 'focus' && s.focus.join() === 'leaf', 'old /request-first/ link forwards', s); await p.context().close(); }

// 3. Sam fills a quote: address lookup, then types his own lot over it, leaf 3, med, corner, parkway, 2 leaf visits, a typed price
const sam = await open('/?view=focus&req=mow,leaf');
await sam.fill('#iAddr', '303 W Wesley St, Wheaton, IL'); await sam.click('#lkBtn'); await sam.waitForTimeout(600);
ok(await sam.evaluate(() => ST.lot) === 13068, 'lookup fills the parcel lot');
await sam.fill('#iLt', '7500'); await sam.fill('#iPk', '400'); await sam.check('#iCorner');
await sam.locator('#lPg button').nth(3).click(); await sam.locator('#cxPg button').nth(1).click();
await sam.evaluate(() => { setLeafVisits('G1', 2); ovr('A1', '1500'); }); await sam.waitForTimeout(300);
const before = await state(sam);
ok(!(await sam.locator('text=Copy quote').count()) && !(await sam.locator('text=Share…').count()), 'Copy quote and Share… are gone');
ok((await sam.locator('#qrCopy').textContent()).includes('Copy link'), 'one Copy link button');
await sam.locator('#qrCopy').click(); await sam.waitForTimeout(250);
const link = await sam.evaluate(() => navigator.clipboard.readText());
ok(/Copied/.test(await sam.locator('#qrCopy').textContent()), 'button says Copied');
ok(link === sam.url(), 'copied link = address bar', { link, url: sam.url() });
ok(link.length < 2000 && !/1952|392/.test(link), 'short, no prices besides typed ones', { link });
console.log('share link:', link);

// 4. Bryan opens it: same screen, same inputs, URL lot beats the lookup, prices from the live formulas
const bry = await open(link.replace(base, ''));
await bry.waitForTimeout(900);
const after = await state(bry);
for (const k of ['lot', 'leaf', 'complex', 'corner', 'pk', 'view', 'addr', 'lt', 'pkF', 'corF', 'leafOn', 'cxOn', 'qr'])
  ok(JSON.stringify(after[k]) === JSON.stringify(before[k]), 'restored ' + k, { before: before[k], after: after[k] });
ok(JSON.stringify(after.sel.slice().sort()) === JSON.stringify(before.sel.slice().sort()) && JSON.stringify(after.focus) === JSON.stringify(before.focus), 'same services and request types', { before, after });
ok(after.ov.A1 === 1500 && after.gp.A1 === 1500, 'typed price comes back exactly');
ok(after.gp.G1 === before.gp.G1, 'leaf price recomputed the same', { a: after.gp, b: before.gp });
ok(after.mapShown === 'block' && after.pick !== 'block', 'map shown, no "did you mean"');
ok(bry.url() === link, 'address bar still holds the whole quote', { url: bry.url() });

// 5. Start over clears the link
await bry.locator('.qr-so').click(); await bry.locator('.qr-so').click(); await bry.waitForURL(u => !String(u).includes('?')); 
ok(new URL(bry.url()).search === '', 'Start over clears the link');

await browser.close();
if (errors.length) console.log('page errors:', errors);
console.log(fails.length ? 'FAIL ' + fails.length + '/' + checks : 'PASS ' + checks + '/' + checks);
for (const f of fails) console.log(' ✖', JSON.stringify(f).slice(0, 600));
process.exit(fails.length || errors.length ? 1 : 0);
