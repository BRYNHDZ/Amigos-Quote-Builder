// geocode-fallback.js — pick a map pin when Nominatim has no result.
// Order: Nominatim, then the matched DuPage parcel centroid, then the US Census geocoder.
// The Census API itself can find DuPage grid addresses (22W389, 1N185), but a browser
// fetch is blocked (no Access-Control-Allow-Origin). The live builder therefore uses
// the parcel centroid and leaves Census parsing here for tests / a future CORS-friendly path.
// Browser global `GeoFallback` + Node module. Does not touch prices.
(function (root) {
  'use strict';

  function finite(n) { return typeof n === 'number' && isFinite(n); }

  function centroidFromEsriGeometry(geom) {
    if (!geom) return null;
    if (finite(geom.y) && finite(geom.x)) return { lat: geom.y, lng: geom.x };
    if (finite(geom.lat) && finite(geom.lng)) return { lat: geom.lat, lng: geom.lng };
    var rings = geom.rings;
    if (!rings || !rings.length) return null;
    var ring = rings[0];
    if (!ring || ring.length < 3) return null;
    var a = 0, cx = 0, cy = 0, i, j, x0, y0, x1, y1, f;
    for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      x0 = +ring[j][0]; y0 = +ring[j][1]; x1 = +ring[i][0]; y1 = +ring[i][1];
      if (!finite(x0) || !finite(y0) || !finite(x1) || !finite(y1)) return null;
      f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-16) {
      var n = ring.length, sx = 0, sy = 0, k;
      if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--;
      if (n < 1) return null;
      for (k = 0; k < n; k++) { sx += +ring[k][0]; sy += +ring[k][1]; }
      return { lat: sy / n, lng: sx / n };
    }
    return { lat: cy / (3 * a), lng: cx / (3 * a) };
  }

  function townFromNominatim(ad) {
    ad = ad || {};
    return ad.town || ad.city || ad.village || ad.hamlet || ad.municipality || '';
  }
  function streetFromNominatim(ad) {
    ad = ad || {};
    return ad.road || ad.pedestrian || ad.residential || ad.highway || '';
  }

  // City / town / neighborhood hits (e.g. "Montclair, NJ") when the user typed a house number.
  function isCityLike(g) {
    if (!g) return false;
    var ad = g.address || {};
    if (ad.house_number) return false;
    var typ = String(g.type || '').toLowerCase();
    var cls = String(g.class || '').toLowerCase();
    return cls === 'boundary' || typ === 'administrative' || typ === 'city' || typ === 'town' || typ === 'village' || typ === 'municipality' || typ === 'neighbourhood' || typ === 'neighborhood' || typ === 'locality' || typ === 'suburb';
  }

  function houseOf(g) {
    return String(((g && g.address) || {}).house_number || '').trim();
  }

  function stateOf(g) {
    return String(((g && g.address) || {}).state || '').toLowerCase();
  }

  function sameHouse(g, typed) {
    if (!typed || !typed.num || !g) return false;
    var h = houseOf(g);
    if (!h) return false;
    return h.toUpperCase().replace(/\s+/g, '') === String(typed.num).toUpperCase().replace(/\s+/g, '') || String(+h) === String(+typed.num);
  }

  // Prefer a house that matches the typed number, skip city hits when a house number was typed, prefer Illinois.
  function fromNominatim(results, typed) {
    if (!results || !results.length) return null;
    var list = results.filter(function (g) { return g && finite(+g.lat) && finite(+g.lon); });
    if (!list.length) return null;
    if (typed && typed.num) {
      var numbered = list.filter(function (g) { return sameHouse(g, typed); });
      if (numbered.length) list = numbered;
      else list = list.filter(function (g) { return !isCityLike(g); });
      if (!list.length) return null;
    }
    var il = list.filter(function (g) { return /illinois|^il$/.test(stateOf(g)); });
    if (il.length) list = il;
    var g = list[0];
    var ad = g.address || {};
    return { lat: +g.lat, lng: +g.lon, town: townFromNominatim(ad), street: streetFromNominatim(ad), source: 'nominatim' };
  }

  // A later failed lot lookup must not hide a map or pin that already found the property.
  function keepFoundResult(mapVisible, fitGeo) {
    return !!(mapVisible || (fitGeo && finite(+fitGeo.lat) && finite(+fitGeo.lng)));
  }

  function censusUrl(address) {
    return 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(address || '');
  }

  function fromCensus(json) {
    var matches = json && json.result && json.result.addressMatches;
    if (!matches || !matches.length) return null;
    var m = matches[0];
    var c = m.coordinates || {};
    var lat = +c.y, lng = +c.x;
    if (!finite(lat) || !finite(lng)) return null;
    var a = m.addressComponents || {};
    var street = [a.preDirection, a.streetName, a.suffixType, a.suffixDirection].filter(Boolean).join(' ');
    return { lat: lat, lng: lng, town: a.city || '', street: street, source: 'census' };
  }

  // Priority: a usable Nominatim hit (not a city when a house number was typed), then parcel centroid, then Census.
  function pick(opts) {
    opts = opts || {};
    var nom = fromNominatim(opts.nominatim, opts.typed);
    if (nom) return nom;
    var c = opts.parcelCentroid || centroidFromEsriGeometry(opts.parcelGeometry);
    if (c && finite(c.lat) && finite(c.lng)) {
      return { lat: c.lat, lng: c.lng, town: opts.town || '', street: opts.street || '', source: 'parcel' };
    }
    return fromCensus(opts.census);
  }

  var api = {
    centroidFromEsriGeometry: centroidFromEsriGeometry,
    isCityLike: isCityLike,
    fromNominatim: fromNominatim,
    fromCensus: fromCensus,
    censusUrl: censusUrl,
    pick: pick,
    keepFoundResult: keepFoundResult
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GeoFallback = api;
})(typeof self !== 'undefined' ? self : this);
