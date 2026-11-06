// Rebuild busy-roads.json from OpenStreetMap (no API key on the quote page).
//
// Preferred (reliable): extract trunk/primary/secondary ways from a Geofabrik
// Illinois .osm.pbf with osmium, clipped to the Route & Fit service-area bbox.
//   1) Download https://download.geofabrik.de/north-america/us/illinois-latest.osm.pbf
//   2) python3 -m venv /tmp/osm-bake/.venv && /tmp/osm-bake/.venv/bin/pip install osmium
//   3) Run the extractor in docs comments / agent notes (same logic as last bake).
//
// Fallback: public Overpass API (often rate-limited):
//   node scripts/build-busy-roads.mjs
//
// Baked file is committed so the live page needs no live OSM dependency.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const BBOX = [41.65, -88.42, 42.05, -87.84]; // s,w,n,e — padded borderline-30
const HIGHWAYS = ['trunk', 'primary', 'secondary'];
const SIMPLIFY_DEG = 0.0015;
const OUT = new URL('../busy-roads.json', import.meta.url);

function bandFor(highway) {
  if (highway === 'trunk' || highway === 'primary') return 'busy';
  return 'likely';
}

function simplify(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const p = pts[i];
    if (Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) >= SIMPLIFY_DEG) out.push(p);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const query = `
[out:json][timeout:180];
(
  way["highway"~"^(trunk|primary|secondary)$"](${BBOX.join(',')});
);
out geom;
`.trim();

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

async function fetchOverpass() {
  let lastErr;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'AmigosQuoteBuilder/1.0 (busy-roads bake)'
        },
        body: 'data=' + encodeURIComponent(query)
      });
      if (!res.ok) throw new Error(url + ' ' + res.status);
      const data = await res.json();
      if (!(data.elements || []).length) throw new Error(url + ' empty elements');
      return data;
    } catch (e) {
      lastErr = e;
      console.warn('Overpass failed:', e.message || e);
    }
  }
  throw lastErr;
}

function roadsFromOverpass(data) {
  const byKey = new Map();
  const roads = [];
  for (const el of data.elements || []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags || {};
    const highway = tags.highway;
    if (!HIGHWAYS.includes(highway)) continue;
    const name = tags.name || null;
    const ref = tags.ref || null;
    const line = simplify(el.geometry.map(g => [+g.lon.toFixed(5), +g.lat.toFixed(5)]));
    if (line.length < 2) continue;
    const key = (name || ref || ('id:' + el.id)) + '|' + highway;
    let row = byKey.get(key);
    if (!row) {
      row = {
        name,
        ref,
        highway,
        band: bandFor(highway),
        maxspeed: tags.maxspeed || null,
        lanes: tags.lanes && Number.isFinite(+tags.lanes) ? +tags.lanes : null,
        lines: []
      };
      byKey.set(key, row);
      roads.push(row);
    }
    row.lines.push(line);
  }
  return roads;
}

const data = await fetchOverpass();
const roads = roadsFromOverpass(data);
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap via Overpass (ODbL)',
  bbox: { south: BBOX[0], west: BBOX[1], north: BBOX[2], east: BBOX[3] },
  highways: HIGHWAYS,
  matchMeters: 50,
  notes: [
    'trunk/primary → busy; secondary → likely. Motorways omitted (limited-access).',
    'Non-blocking heads-up only; never rejects a quote.',
    'Street-name keywords (Route/Rte/Hwy/IL-/US-) are a fallback when geometry miss.'
  ],
  roads
};
writeFileSync(OUT, JSON.stringify(out));
console.log('Wrote busy-roads.json:', roads.length, 'roads,', Buffer.byteLength(JSON.stringify(out)), 'bytes');
if (existsSync(OUT)) {
  const sample = roads.filter(r => /59|Roosevelt|Butterfield|Ogden|North Ave/i.test((r.name || '') + (r.ref || ''))).slice(0, 8);
  console.log('Sample:', sample.map(r => r.band + ':' + (r.name || r.ref)));
}
