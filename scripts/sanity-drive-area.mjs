// Sanity-check baked 25/30-min polygons against known pins. Run: node scripts/sanity-drive-area.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RouteFit = require('../route-fit.js');
const area = JSON.parse(readFileSync(new URL('../service-area.json', import.meta.url)));
const routes = JSON.parse(readFileSync(new URL('../routes.json', import.meta.url)));
const income = JSON.parse(readFileSync(new URL('../town-income.json', import.meta.url)));

const data = {
  base: routes.base,
  blacklist: routes.blacklist,
  driveWhitelist: routes.driveWhitelist,
  polygons: area.polygons,
  townIncome: income,
  routes: routes.routes
};

const cases = [
  { name:'base', pin: routes.base, town:'Glen Ellyn', expect:'in' },
  { name:'Wheaton Lorraine', pin:{lat:41.864317,lng:-88.0820032}, town:'Wheaton', expect:'in' },
  { name:'New Lenox', pin:{lat:41.5120,lng:-87.9656}, town:'New Lenox', expect:'out' },
  { name:'Crystal Lake', pin:{lat:42.2411,lng:-88.3342}, town:'Crystal Lake', expect:'out' },
  { name:'Romeoville', pin:{lat:41.6475,lng:-88.0895}, town:'Romeoville', expect:'out' },
];

let fail = 0;
for (const c of cases) {
  const r = RouteFit.computeFit({ pin:c.pin, town:c.town }, data);
  const ok = r.area.status === c.expect || (c.expect==='out' && (r.area.status==='out' || r.blacklist.blocked));
  // For blacklisted far towns, area may be out OR blacklist blocks — both fine for "should fail"
  const pass = c.expect === 'in' ? r.area.status === 'in' : (r.area.status === 'out' || r.blacklist.blocked);
  console.log((pass?'OK ':'FAIL'), c.name, 'area='+r.area.status, 'method='+r.area.method, 'bl='+(r.blacklist.blocked||r.blacklist.watch||false), 'income='+(r.income.band||'?'));
  if (!pass) fail++;
}
process.exit(fail ? 1 : 0);
