// route-fit.js — pure Route & Fit logic. Browser global `RouteFit` + Node module.
(function (root) {
  'use strict';

  var SERVICE_AREA = { inMi: 6, borderlineMi: 8 }; // straight-line proxy thresholds (mi)
  var ROUTE_RADIUS_MI = 1;

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

  function classifyServiceArea(pin, base, cfg) {
    cfg = cfg || SERVICE_AREA;
    var d = haversineMi(pin, base);
    var status = d <= cfg.inMi ? 'in' : (d <= cfg.borderlineMi ? 'borderline' : 'out');
    return { status: status, distanceMi: Math.round(d * 10) / 10, method: 'proxy' };
  }

  function normTown(s) { return (s || '').toString().trim().toLowerCase(); }

  function matchBlacklist(town, blacklist) {
    var t = normTown(town);
    var entries = (blacklist || []).map(function (e) {
      return typeof e === 'string'
        ? { town: e, scope: 'both' }
        : { town: e.town, scope: e.scope || 'both' };
    });
    for (var i = 0; i < entries.length; i++) {
      if (normTown(entries[i].town) === t && t !== '') {
        var scope = entries[i].scope;
        var label = scope === 'both' ? 'out — mowing + landscaping'
                  : scope === 'mowing' ? 'no new mowing · landscaping OK'
                  : 'no new landscaping · mowing OK';
        return { blocked: true, scope: scope, label: label };
      }
    }
    return { blocked: false, scope: null, label: '' };
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
    var area = classifyServiceArea(input.pin, data.base);
    var bl = matchBlacklist(input.town, data.blacklist);
    var routes = (area.status === 'out' || bl.scope === 'both')
      ? null
      : rankRoutes(input.pin, data.routes);
    return { area: area, blacklist: bl, routes: routes };
  }

  var api = {
    haversineMi: haversineMi,
    classifyServiceArea: classifyServiceArea,
    matchBlacklist: matchBlacklist,
    rankRoutes: rankRoutes,
    computeFit: computeFit,
    SERVICE_AREA: SERVICE_AREA,
    ROUTE_RADIUS_MI: ROUTE_RADIUS_MI
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouteFit = api;
})(typeof self !== 'undefined' ? self : this);
