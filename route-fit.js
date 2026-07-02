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

  var api = {
    haversineMi: haversineMi,
    classifyServiceArea: classifyServiceArea,
    matchBlacklist: matchBlacklist,
    SERVICE_AREA: SERVICE_AREA,
    ROUTE_RADIUS_MI: ROUTE_RADIUS_MI
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouteFit = api;
})(typeof self !== 'undefined' ? self : this);
