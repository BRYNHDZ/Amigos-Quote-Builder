// route-fit.js — pure Route & Fit logic. Browser global `RouteFit` + Node module.
(function (root) {
  'use strict';

  // Legacy straight-line thresholds kept for tests / fallback when no polygon is loaded.
  var SERVICE_AREA = { inMi: 6, borderlineMi: 8 };
  var ROUTE_RADIUS_MI = 1;
  var DRIVE_WHITELIST = ['glen ellyn', 'wheaton', 'winfield'];
  var INCOME_THRESHOLD = 110000;

  function haversineMi(a, b) {
    var R = 3958.8; // earth radius, miles
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLng = (b.lng - a.lng) * toRad;
    var la1 = a.lat * toRad, la2 = b.lat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function normTown(s) { return (s || '').toString().trim().toLowerCase(); }

  function pointInRing(lng, lat, ring) {
    // Ray casting. ring is [[lng,lat], ...] (GeoJSON order).
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1];
      var xj = ring[j][0], yj = ring[j][1];
      var intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-30) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(lng, lat, geom) {
    if (!geom) return false;
    if (geom.type === 'Polygon') {
      var rings = geom.coordinates;
      if (!rings || !rings.length || !pointInRing(lng, lat, rings[0])) return false;
      for (var h = 1; h < rings.length; h++) {
        if (pointInRing(lng, lat, rings[h])) return false;
      }
      return true;
    }
    if (geom.type === 'MultiPolygon') {
      for (var i = 0; i < geom.coordinates.length; i++) {
        if (pointInPolygon(lng, lat, { type: 'Polygon', coordinates: geom.coordinates[i] })) return true;
      }
      return false;
    }
    return false;
  }

  function isDriveWhitelist(town, list) {
    // Only when an explicit list is provided (from routes.json). Avoids
    // surprising legacy proxy tests that use "Wheaton" as a dummy town name.
    var t = normTown(town);
    if (!t || !list || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      if (normTown(list[i]) === t) return true;
    }
    return false;
  }

  // Classify by baked drive polygons when present; else fall back to the old mile proxy.
  // Whitelist towns (Glen Ellyn / Wheaton / Winfield) are always "in".
  function classifyServiceArea(pin, base, cfg, opts) {
    opts = opts || {};
    cfg = cfg || SERVICE_AREA;
    var d = (pin && base) ? haversineMi(pin, base) : null;
    var distanceMi = d == null ? null : Math.round(d * 10) / 10;

    if (isDriveWhitelist(opts.town, opts.driveWhitelist)) {
      return { status: 'in', distanceMi: distanceMi, method: 'whitelist', driveMinutes: null };
    }

    var polys = opts.polygons || null;
    if (polys && polys.in25 && pin && typeof pin.lat === 'number' && typeof pin.lng === 'number') {
      var lng = pin.lng, lat = pin.lat;
      if (pointInPolygon(lng, lat, polys.in25)) {
        return { status: 'in', distanceMi: distanceMi, method: 'drive', driveMinutes: 25 };
      }
      if (pointInPolygon(lng, lat, polys.borderline30)) {
        return { status: 'borderline', distanceMi: distanceMi, method: 'drive', driveMinutes: 30 };
      }
      return { status: 'out', distanceMi: distanceMi, method: 'drive', driveMinutes: null };
    }

    // Legacy proxy fallback
    var status = d <= cfg.inMi ? 'in' : (d <= cfg.borderlineMi ? 'borderline' : 'out');
    return { status: status, distanceMi: distanceMi, method: 'proxy', driveMinutes: null };
  }

  function matchBlacklist(town, blacklist) {
    var t = normTown(town);
    var entries = (blacklist || []).map(function (e) {
      return typeof e === 'string'
        ? { town: e, scope: 'both' }
        : { town: e.town, scope: e.scope || 'both' };
    });
    for (var i = 0; i < entries.length; i++) {
      if (normTown(entries[i].town) === t && t !== '') {
        /* t !== '' guard: unnamed-municipality geocodes (empty town) bypass the blacklist */
        var scope = entries[i].scope;
        if (scope === 'watch') {
          return { blocked: false, watch: true, scope: 'watch', label: 'on watch — review carefully' };
        }
        var label = scope === 'both' ? 'out — mowing + landscaping'
                  : scope === 'mowing' ? 'no new mowing · landscaping OK'
                  : 'no new landscaping · mowing OK';
        return { blocked: true, watch: false, scope: scope, label: label };
      }
    }
    return { blocked: false, watch: false, scope: null, label: '' };
  }

  // Town median household income vs $110k rule (ICP / triage).
  // Under $110k inside the drive area → satellite-only (NOT out of area).
  // $110k+ → normal (walk-throughs OK). Missing data → unknown.
  function lookupIncome(town, townIncome) {
    var threshold = (townIncome && townIncome.threshold) || INCOME_THRESHOLD;
    var t = normTown(town);
    if (!t || !townIncome || !townIncome.towns) {
      return { known: false, median: null, threshold: threshold, band: null, label: '' };
    }
    var row = townIncome.towns[t];
    if (!row || row.median == null) {
      return { known: false, median: null, threshold: threshold, band: null, label: '' };
    }
    var median = row.median;
    var affluent = median >= threshold;
    return {
      known: true,
      median: median,
      threshold: threshold,
      band: affluent ? 'affluent' : 'satellite',
      label: affluent
        ? ('median HH income ~$' + Math.round(median / 1000) + 'k · $110k+ → normal quote / walk-throughs OK')
        : ('median HH income ~$' + Math.round(median / 1000) + 'k · under $110k → satellite-only quote')
    };
  }

  function rankRoutes(pin, routes, radiusMi) {
    radiusMi = radiusMi || ROUTE_RADIUS_MI;
    var ranked = (routes || []).map(function (r) {
      var nearest = Infinity, density = 0;
      (r.stops || []).forEach(function (s) {
        if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
        var d = haversineMi(pin, s);
        if (d < nearest) nearest = d;
        if (d <= radiusMi) density++;
      });
      return {
        name: r.name,
        density: density,
        nearestMi: nearest === Infinity ? null : Math.round(nearest * 100) / 100
      };
    }).filter(function (r) { return r.nearestMi !== null; });

    var anyDensity = ranked.some(function (r) { return r.density > 0; });
    ranked.sort(function (a, b) {
      if (b.density !== a.density) return b.density - a.density;
      return a.nearestMi - b.nearestMi;
    });
    return { ranked: ranked, fallback: !anyDensity };
  }

  function computeFit(input, data) {
    data = data || {};
    var area = classifyServiceArea(input.pin, data.base, data.serviceAreaCfg, {
      town: input.town,
      driveWhitelist: data.driveWhitelist,
      polygons: data.polygons
    });
    var bl = matchBlacklist(input.town, data.blacklist);
    var income = lookupIncome(input.town, data.townIncome);
    var routes = (area.status === 'out' || bl.scope === 'both')
      ? null
      : rankRoutes(input.pin, data.routes);
    return { area: area, blacklist: bl, income: income, routes: routes };
  }

  var api = {
    haversineMi: haversineMi,
    pointInPolygon: pointInPolygon,
    classifyServiceArea: classifyServiceArea,
    matchBlacklist: matchBlacklist,
    lookupIncome: lookupIncome,
    rankRoutes: rankRoutes,
    computeFit: computeFit,
    isDriveWhitelist: isDriveWhitelist,
    SERVICE_AREA: SERVICE_AREA,
    ROUTE_RADIUS_MI: ROUTE_RADIUS_MI,
    DRIVE_WHITELIST: DRIVE_WHITELIST,
    INCOME_THRESHOLD: INCOME_THRESHOLD
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouteFit = api;
})(typeof self !== 'undefined' ? self : this);
