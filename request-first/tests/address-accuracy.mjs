// Address lookup accuracy test. Runs the builder's real lookupLot() in a headless browser against
// an address sample and scores what it did with each address.
// The sample is real client service addresses, so it is NOT in this (public) repo: point ADDR_SAMPLE at the private copy
// (JSON: {jobber:[{street,city,zip}], tricky:[{q, expectCity|expectAsk|expectNotNum}]}). Without it, only the public
// landmark cases in address-public.json run.
// Usage: node request-first/tests/address-accuracy.mjs [baseUrl] [--json out.json]
//   baseUrl defaults to http://localhost:8765 (repo root served, e.g. `python3 -m http.server 8765`).
// Needs network (OpenStreetMap Nominatim + DuPage County parcel GIS). Responses are cached on disk OUTSIDE the
// repo (ADDR_CACHE, default /tmp/qb-addr-cache) so before/after runs see identical geocoder data and Nominatim
// is asked at most once a second (its usage policy). Nothing personal is stored in the repo.
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const base = args.find(a => /^https?:/.test(a)) || 'http://localhost:8765';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const CACHE = process.env.ADDR_CACHE || '/tmp/qb-addr-cache'; fs.mkdirSync(CACHE, { recursive: true });
const UA = 'AmigosQuoteBuilder-accuracy-test/1.0 (github.com/BRYNHDZ/Amigos-Quote-Builder)';
const DUPAGE = 'https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/ParcelsWithRealEstateCC/MapServer/0/query';

let lastNom = 0;
async function cachedGet(url) {
  const f = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  if (/nominatim/.test(url)) { const w = lastNom + 1100 - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w)); lastNom = Date.now(); }
  let body = '';
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); body = await r.text(); if (r.ok) break; } catch (e) { body = ''; }
    await new Promise(r => setTimeout(r, 2000));
  }
  if (body) fs.writeFileSync(f, body);
  return body || '[]';
}
async function parcelByPin(pin) {
  const u = DUPAGE + '?where=' + encodeURIComponent("PIN='" + pin + "'") + '&outFields=PIN,ACREAGE,PROPADDRL1,PROPCITY,PROPZIP&returnGeometry=false&f=json';
  try { const j = JSON.parse(await cachedGet(u)); const a = j.features && j.features[0] && j.features[0].attributes; return a || null; } catch (e) { return null; }
}

// ---------- typed-address helpers used only for scoring ----------
const TOWNS = ['ADDISON','AURORA','BARTLETT','BENSENVILLE','BLOOMINGDALE','BOLINGBROOK','BURR RIDGE','CAROL STREAM','CLARENDON HILLS','DARIEN','DOWNERS GROVE','ELK GROVE VILLAGE','ELMHURST','GENEVA','GLEN ELLYN','GLENDALE HEIGHTS','HANOVER PARK','HINSDALE','ITASCA','LISLE','LOMBARD','NAPERVILLE','OAK BROOK','OAKBROOK TERRACE','ROSELLE','ST CHARLES','VILLA PARK','WARRENVILLE','WAYNE','WEST CHICAGO','WESTMONT','WHEATON','WILLOWBROOK','WINFIELD','WOOD DALE','WOODRIDGE','WILLIS'];
const SUF = new Set(['ST','STREET','STR','AVE','AVENUE','AV','AVG','DR','DRIVE','RD','ROAD','BLVD','BOULEVARD','CT','COURT','LN','LANE','PL','PLACE','WAY','CIR','CIRCLE','TER','TERRACE','PKWY','PARKWAY','TRL','TRAIL']);
const DIRS = new Set(['N','S','E','W','NORTH','SOUTH','EAST','WEST']);
const up = s => String(s || '').toUpperCase().replace(/[.'’]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function streetParts(s) { const t = up(s).split(' '); const num = t.shift() || ''; while (t.length > 1 && DIRS.has(t[0])) t.shift(); if (t.length > 1 && SUF.has(t[t.length - 1])) t.pop(); return { num, name: t.join(' ') }; }
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function typedTown(city) { const c = up(String(city || '').split(',')[0]).replace(/\s+IL(LINOIS)?(\s+\d{5}.*)?$/, '').trim(); return TOWNS.includes(c) ? c : null; }

const samplePath = process.env.ADDR_SAMPLE || path.join(here, 'address-public.json');
console.error('sample: ' + (process.env.ADDR_SAMPLE ? 'private (ADDR_SAMPLE)' : 'public landmarks only'));
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8')); sample.jobber = sample.jobber || []; sample.tricky = sample.tricky || [];
const cases = [
  ...sample.jobber.map(r => ({ q: `${r.street}, ${r.city}, IL ${r.zip}`, src: 'jobber', num: streetParts(r.street.replace(/,/g, ' ')).num, name: streetParts(r.street.replace(/,/g, ' ')).name, town: typedTown(r.city), zip: String(r.zip).slice(0, 5) })),
  ...sample.tricky.map(t => ({ ...t, num: streetParts(t.q.split(',')[0]).num }))
];

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); page.setDefaultTimeout(20000);
const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/nominatim\.openstreetmap|gis\.dupageco/.test(u)) { const body = await cachedGet(u); return route.fulfill({ status: 200, contentType: 'application/json', body, headers: { 'access-control-allow-origin': '*' } }); }
  if (u.startsWith(base)) return route.continue();
  return route.abort();
});
await page.goto(base + '/?view=all');
await page.waitForFunction(() => typeof lookupLot === 'function');

const results = [];
for (const c of cases) {
  const r = await page.evaluate(async q => {
    const $ = id => document.getElementById(id);
    $('iAddr').value = q; $('iLt').value = ''; $('mapAddr').textContent = ''; if (typeof upd === 'function') upd();
    const pk = $('addrPick'); if (pk) { pk.innerHTML = ''; pk.style.display = 'none'; }
    await lookupLot(q);
    await new Promise(r => setTimeout(r, 50));
    const pick = $('addrPick');
    const asked = !!(pick && pick.style.display !== 'none' && pick.querySelector('[data-pin]'));
    const lot = parseFloat($('iLt').value) || 0;
    const m = ($('mapAddr').textContent || '').match(/PIN (\d{10})/);
    return { lot, pin: lot > 0 && m ? m[1] : null, asked, askPins: asked ? [...pick.querySelectorAll('[data-pin]')].map(b => b.dataset.pin) : [] };
  }, c.q);
  const out = { q: c.q, src: c.src, outcome: r.lot > 0 && !r.asked ? 'auto' : r.asked ? 'ask' : 'manual' };
  if (out.outcome === 'auto') {
    const p = r.pin ? await parcelByPin(r.pin) : null;
    out.got = p ? `${p.PROPADDRL1}, ${(p.PROPCITY || '').trim()} ${p.PROPZIP}` : '(no PIN shown)';
    const gp = p ? streetParts(p.PROPADDRL1) : { num: '', name: '' };
    const gotTown = p ? (p.PROPCITY || '').trim() : '';
    out.houseExact = gp.num === up(c.num);
    out.streetOK = !c.name || !gp.name ? true : (gp.name === c.name || lev(gp.name, c.name) <= 2);
    if (c.src === 'jobber') {
      out.townOK = c.town ? gotTown === c.town : null;
      out.zipOK = c.zip ? (p && p.PROPZIP === c.zip) : null;
      out.wrongTown = c.town ? gotTown !== c.town : (c.zip ? !(p && p.PROPZIP === c.zip) : false);
    } else {
      out.townOK = c.expectCity ? gotTown === c.expectCity : null;
      out.wrongTown = (c.expectCity && gotTown !== c.expectCity) || !!c.expectAsk;
      if (c.expectNotNum && up(gp.num) === up(c.expectNotNum)) out.houseExact = false;
    }
    out.right = out.houseExact && out.streetOK && !out.wrongTown;
  } else if (out.outcome === 'ask') {
    const p = await parcelByPin(r.askPins[0]);
    out.firstSuggestion = p ? `${p.PROPADDRL1}, ${(p.PROPCITY || '').trim()} ${p.PROPZIP}` : null;
  }
  results.push(out);
  process.stdout.write(out.outcome === 'auto' ? (out.right ? '.' : 'X') : out.outcome === 'ask' ? '?' : '-');
}
console.log();
await browser.close();

const S = { total: results.length };
const by = (src) => results.filter(r => !src || r.src === src);
for (const [k, list] of [['all', by()], ['jobber', by('jobber')], ['tricky', by('tricky')]]) {
  const auto = list.filter(r => r.outcome === 'auto');
  S[k] = {
    cases: list.length,
    autoFilled: auto.length,
    autoRight: auto.filter(r => r.right).length,
    asked: list.filter(r => r.outcome === 'ask').length,
    manual: list.filter(r => r.outcome === 'manual').length,
    silentWrongTown: auto.filter(r => r.wrongTown).length,
    silentWrongHouseNumber: auto.filter(r => !r.houseExact).length,
    silentWrongStreet: auto.filter(r => !r.streetOK).length,
    silentWrongAny: auto.filter(r => !r.right).length,
    townOK: auto.filter(r => r.townOK === true).length + '/' + auto.filter(r => r.townOK !== null && r.townOK !== undefined).length,
    zipOK: auto.filter(r => r.zipOK === true).length + '/' + auto.filter(r => r.zipOK !== null && r.zipOK !== undefined).length,
  };
}
console.log(JSON.stringify(S, null, 1));
const bad = results.filter(r => r.outcome === 'auto' && !r.right);
if (bad.length) { console.log('\nSilently accepted a WRONG property:'); bad.forEach(r => console.log('  ' + r.q + '  ->  ' + r.got)); }
if (pageErrors.length) console.log('\nPage errors:', pageErrors.slice(0, 5));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary: S, results }, null, 1));
process.exitCode = (S.all.silentWrongAny > 0 || pageErrors.length) ? 1 : 0;
