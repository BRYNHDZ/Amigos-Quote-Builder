// Unit tests for geocode-fallback.js (pin fallback when Nominatim is empty).
const test = require('node:test');
const assert = require('node:assert');
const G = require('../geocode-fallback.js');

// Real DuPage parcel rings fetched 2026-11-17 (outSR=4326). Used as fixtures, no network in these tests.
const RING_22W389 = {
  rings: [[[-88.06260159278405, 41.84036067008999], [-88.06261593034543, 41.83974502344991], [-88.06276954714856, 41.83974717440718], [-88.06289102260618, 41.839748875840215], [-88.06287673465157, 41.840364519031155], [-88.06276431648858, 41.84036294606031], [-88.06260159278405, 41.84036067008999]]]
};
const RING_1N185_MAIN = {
  rings: [[[-88.0627063959248, 41.89222857512723], [-88.06277077115936, 41.892227434818366], [-88.06325527727908, 41.892218851567634], [-88.06325896541111, 41.8925461725636], [-88.06276606693098, 41.89255464151926], [-88.06270958720067, 41.892555612259436], [-88.0627063959248, 41.89222857512723]]]
};

function near(a, b, eps) {
  assert.ok(Math.abs(a - b) < (eps || 0.0003), a + ' not near ' + b);
}

test('centroid of a square ring is the center', () => {
  const g = { rings: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
  const c = G.centroidFromEsriGeometry(g);
  near(c.lng, 1, 1e-9);
  near(c.lat, 1, 1e-9);
});

test('empty or short geometry returns null', () => {
  assert.strictEqual(G.centroidFromEsriGeometry(null), null);
  assert.strictEqual(G.centroidFromEsriGeometry({}), null);
  assert.strictEqual(G.centroidFromEsriGeometry({ rings: [[[0, 0], [1, 1]]] }), null);
});

test('22W389 Glen Valley Dr parcel centroid lands on the lot', () => {
  const c = G.centroidFromEsriGeometry(RING_22W389);
  // Lot sits just west of the Census street point (-88.06168, 41.84037).
  near(c.lng, -88.06275, 0.0003);
  near(c.lat, 41.84005, 0.0003);
});

test('1N185-style parcel (1N185 Main St, Glen Ellyn) has a centroid on the lot', () => {
  const c = G.centroidFromEsriGeometry(RING_1N185_MAIN);
  near(c.lng, -88.06298, 0.0003);
  near(c.lat, 41.89239, 0.0003);
});

test('fromNominatim uses the first hit and its town/street; empty list is null', () => {
  assert.strictEqual(G.fromNominatim([]), null);
  assert.strictEqual(G.fromNominatim(null), null);
  const g = G.fromNominatim([{
    lat: '41.8753773', lon: '-88.0580',
    address: { house_number: '535', road: 'Duane Street', town: 'Glen Ellyn' }
  }]);
  assert.strictEqual(g.source, 'nominatim');
  assert.strictEqual(g.town, 'Glen Ellyn');
  assert.strictEqual(g.street, 'Duane Street');
  near(g.lat, 41.8753773, 1e-9);
  near(g.lng, -88.0580, 1e-9);
});

test('fromCensus reads coordinates x/y and address components; no match is null', () => {
  assert.strictEqual(G.fromCensus({ result: { addressMatches: [] } }), null);
  const g = G.fromCensus({
    result: {
      addressMatches: [{
        coordinates: { x: -88.061683566014, y: 41.840373436748 },
        addressComponents: { city: 'GLEN ELLYN', streetName: 'GLEN VALLEY', suffixType: 'DR' }
      }]
    }
  });
  assert.strictEqual(g.source, 'census');
  assert.strictEqual(g.town, 'GLEN ELLYN');
  assert.strictEqual(g.street, 'GLEN VALLEY DR');
  near(g.lat, 41.840373436748, 1e-9);
  near(g.lng, -88.061683566014, 1e-9);
});

test('censusUrl builds the public one-line endpoint', () => {
  const u = G.censusUrl('22W389 Glen Valley Dr, Glen Ellyn');
  assert.ok(u.startsWith('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'));
  assert.ok(u.includes('benchmark=Public_AR_Current'));
  assert.ok(u.includes('format=json'));
  assert.ok(u.includes('address=22W389'));
});

test('pick: a normal Nominatim result wins over parcel and census (no regression)', () => {
  const nom = [{ lat: '41.8753773', lon: '-88.058', address: { town: 'Glen Ellyn', road: 'Duane Street' } }];
  const picked = G.pick({
    nominatim: nom,
    parcelGeometry: RING_22W389,
    census: { result: { addressMatches: [{ coordinates: { x: -88.06, y: 41.84 }, addressComponents: { city: 'X' } }] } }
  });
  assert.strictEqual(picked.source, 'nominatim');
  assert.strictEqual(picked.town, 'Glen Ellyn');
  near(picked.lat, 41.8753773, 1e-9);
});

test('pick: empty Nominatim uses the 22W389 parcel centroid, not census', () => {
  const census = {
    result: { addressMatches: [{ coordinates: { x: -88.061683566014, y: 41.840373436748 }, addressComponents: { city: 'GLEN ELLYN', streetName: 'GLEN VALLEY', suffixType: 'DR' } }] }
  };
  const picked = G.pick({
    nominatim: [],
    parcelGeometry: RING_22W389,
    census,
    town: 'Glen Ellyn',
    street: 'Glen Valley Dr'
  });
  assert.strictEqual(picked.source, 'parcel');
  assert.strictEqual(picked.town, 'Glen Ellyn');
  assert.strictEqual(picked.street, 'Glen Valley Dr');
  const c = G.centroidFromEsriGeometry(RING_22W389);
  near(picked.lat, c.lat, 1e-12);
  near(picked.lng, c.lng, 1e-12);
});

test('pick: 1N185-style falls back to census when Nominatim and parcel are empty', () => {
  const census = {
    result: { addressMatches: [{ coordinates: { x: -88.063380380919, y: 41.893402690345 }, addressComponents: { city: 'GLEN ELLYN', streetName: 'MAIN', suffixType: 'ST' } }] }
  };
  const picked = G.pick({ nominatim: [], parcelGeometry: null, census });
  assert.strictEqual(picked.source, 'census');
  near(picked.lat, 41.893402690345, 1e-9);
  near(picked.lng, -88.063380380919, 1e-9);
  assert.strictEqual(picked.street, 'MAIN ST');
});

test('pick: nothing to go on returns null', () => {
  assert.strictEqual(G.pick({ nominatim: [], parcelGeometry: null, census: null }), null);
  assert.strictEqual(G.pick({}), null);
});

const NJ_CITIES = [
  { lat: '40.8164458', lon: '-74.2210643', type: 'administrative', class: 'boundary', address: { town: 'Montclair', state: 'New Jersey' } },
  { lat: '34.0775104', lon: '-117.6897776', type: 'administrative', class: 'boundary', address: { city: 'Montclair', state: 'California' } },
  { lat: '38.6097746', lon: '-77.3575148', type: 'village', class: 'place', address: { village: 'Montclair', state: 'Virginia' } }
];
const HOUSE_248 = {
  lat: '41.8685642', lon: '-88.0580980', type: 'house', class: 'place',
  address: { house_number: '248', road: 'North Montclair Avenue', town: 'Glen Ellyn', state: 'Illinois' }
};

test('fromNominatim ignores city hits when a house number was typed (248 n montclair)', () => {
  const typed = { num: '248', dir: 'N', name: 'MONTCLAIR' };
  assert.strictEqual(G.fromNominatim(NJ_CITIES, typed), null);
  assert.ok(G.isCityLike(NJ_CITIES[0]));
  assert.strictEqual(G.isCityLike(HOUSE_248), false);
  // Without a typed house number, the first hit still wins (no regression).
  const raw = G.fromNominatim(NJ_CITIES);
  assert.strictEqual(raw.town, 'Montclair');
  near(raw.lat, 40.8164458, 1e-9);
});

test('fromNominatim prefers the Illinois house over a city or an out-of-state house', () => {
  const typed = { num: '248', dir: 'N', name: 'MONTCLAIR' };
  const fl = { lat: '27.94', lon: '-82.27', type: 'house', class: 'place', address: { house_number: '248', road: 'North Montclair Avenue', city: 'Brandon', state: 'Florida' } };
  const g = G.fromNominatim(NJ_CITIES.concat([fl, HOUSE_248]), typed);
  assert.strictEqual(g.town, 'Glen Ellyn');
  assert.strictEqual(g.street, 'North Montclair Avenue');
  near(g.lat, 41.8685642, 1e-9);
});

test('pick: city-only Nominatim yields to the parcel pin when a house number was typed', () => {
  const picked = G.pick({
    nominatim: NJ_CITIES,
    typed: { num: '248', name: 'MONTCLAIR' },
    parcelGeometry: RING_22W389,
    town: 'Glen Ellyn',
    street: 'Montclair Ave'
  });
  assert.strictEqual(picked.source, 'parcel');
  assert.strictEqual(picked.town, 'Glen Ellyn');
});

test('keepFoundResult: a later lot miss must not hide a map or pin that already found the property', () => {
  assert.strictEqual(G.keepFoundResult(true, null), true);
  assert.strictEqual(G.keepFoundResult(false, { lat: 41.8685642, lng: -88.0580980 }), true);
  assert.strictEqual(G.keepFoundResult(false, null), false);
  assert.strictEqual(G.keepFoundResult(false, {}), false);
});
