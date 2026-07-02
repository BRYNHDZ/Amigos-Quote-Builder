// One-time offline geocoder for routes.json. Run: node scripts/geocode-routes.mjs
// Uses Nominatim (1 req/sec policy). Adds lat/lng to base + each stop; caches by leaving
// existing coords untouched so re-runs only fill gaps.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../routes.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(address);
    const res = await fetch(url, { headers: { 'User-Agent': 'AmigosQuoteBuilder/1.0 (route geocode)' } });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j.length) return null;
    return { lat: +j[0].lat, lng: +j[0].lon };
  } catch (e) {
    return null;
  }
}

async function ensureCoords(obj, label) {
  if (typeof obj.lat === 'number' && typeof obj.lng === 'number') return true;
  const g = await geocode(obj.address);
  await sleep(1100); // respect 1 req/sec
  if (g) { obj.lat = g.lat; obj.lng = g.lng; console.log('  ok  ', label, '->', g.lat, g.lng); return true; }
  console.log('  MISS', label, '(', obj.address, ')');
  return false;
}

let miss = 0;
console.log('Base:');
await ensureCoords(data.base, data.base.address);
for (const route of data.routes) {
  console.log(route.name + ':');
  for (const stop of route.stops) {
    const ok = await ensureCoords(stop, stop.address);
    if (!ok) miss++;
  }
}
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('\nDone. Missed geocodes:', miss);
