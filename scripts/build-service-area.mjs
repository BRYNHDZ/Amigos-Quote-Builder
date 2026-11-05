// Rebuild service-area.json from the public Valhalla demoserver (no API key).
// Run: node scripts/build-service-area.mjs
// Prefer surface streets: use_highways=0, use_tolls=0.
import { writeFileSync } from 'node:fs';

const BASE = { lat: 41.859261, lon: -88.0755496, address: '352 Roosevelt Rd, Glen Ellyn, IL 60137' };
const body = {
  locations: [{ lat: BASE.lat, lon: BASE.lon }],
  costing: 'auto',
  costing_options: { auto: { use_highways: 0, use_tolls: 0 } },
  contours: [{ time: 25 }, { time: 30 }],
  polygons: true
};

const res = await fetch('https://valhalla1.openstreetmap.de/isochrone', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
if (!res.ok) throw new Error('Valhalla ' + res.status);
const fc = await res.json();

function simplify(ring, epsilon) {
  if (ring.length < 3) return ring;
  const perp = (p, a, b) => {
    const [x,y]=p,[x1,y1]=a,[x2,y2]=b;
    const dx=x2-x1, dy=y2-y1;
    if (!dx && !dy) return Math.hypot(x-x1,y-y1);
    const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(x-(x1+t*dx), y-(y1+t*dy));
  };
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    let idx=0, dmax=0;
    for (let i=1;i<pts.length-1;i++){ const d=perp(pts[i],pts[0],pts[pts.length-1]); if(d>dmax){idx=i;dmax=d;} }
    if (dmax > epsilon) {
      const L=rdp(pts.slice(0,idx+1)), R=rdp(pts.slice(idx));
      return L.slice(0,-1).concat(R);
    }
    return [pts[0], pts[pts.length-1]];
  };
  const closed = ring[0][0]===ring[ring.length-1][0] && ring[0][1]===ring[ring.length-1][1];
  const body = closed ? ring.slice(0,-1) : ring.slice();
  const out = rdp(body);
  return closed ? out.concat([out[0]]) : out;
}

const polys = {};
for (const f of fc.features) {
  const t = Math.round(f.properties.contour);
  const outer = simplify(f.geometry.coordinates[0], 0.0015);
  polys[t] = { type: 'Polygon', coordinates: [outer] };
}

const out = {
  generatedAt: new Date().toISOString().slice(0,10),
  base: { address: BASE.address, lat: BASE.lat, lng: BASE.lon },
  method: 'valhalla-isochrone',
  engine: 'https://valhalla1.openstreetmap.de/isochrone',
  costing: 'auto',
  costingOptions: { use_highways: 0, use_tolls: 0 },
  notes: [
    '25-min = in; 25-30 min = borderline (check); >30 = out.',
    'use_highways=0 and use_tolls=0 discourage limited-access highways and tolls to match surface-street SOP. Valhalla may still use some arterial/primary roads; it is not a hard ban on every limited-access segment.',
    'Glen Ellyn, Wheaton, Winfield are always-in by town whitelist (ICP), regardless of polygon.'
  ],
  inMinutes: 25,
  borderlineMinutes: 30,
  polygons: { in25: polys[25], borderline30: polys[30] }
};
writeFileSync(new URL('../service-area.json', import.meta.url), JSON.stringify(out));
console.log('wrote service-area.json', 'in25 pts', polys[25].coordinates[0].length, 'b30 pts', polys[30].coordinates[0].length);
