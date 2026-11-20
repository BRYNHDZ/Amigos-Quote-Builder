/* Paved-area total for the measure tool. Unions polygons so overlap is
   counted once. Does not change prices — it only returns a square-foot total. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MeasureTotal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SQFT_PER_M2 = 10.76391041671;

  function asFeature(input) {
    if (!input) return null;
    if (input.type === 'Feature') return input;
    if (input.type === 'FeatureCollection') return null;
    if (input.type === 'Polygon' || input.type === 'MultiPolygon') {
      return { type: 'Feature', properties: {}, geometry: input };
    }
    if (input.geometry) return input;
    return null;
  }

  function areaPolys(inputs) {
    var out = [];
    (inputs || []).forEach(function (raw) {
      var f = asFeature(raw);
      var typ = f && f.geometry && f.geometry.type;
      if (typ === 'Polygon' || typ === 'MultiPolygon') out.push(f);
    });
    return out;
  }

  function areaSqFt(feature, turf, sqftPerM2) {
    if (!feature || !turf || typeof turf.area !== 'function') return 0;
    var n = turf.area(feature) * (sqftPerM2 || SQFT_PER_M2);
    return n > 0 ? n : 0;
  }

  function unionFeatures(features, turf) {
    var polys = areaPolys(features);
    if (!polys.length) return null;
    if (polys.length === 1) return polys[0];
    if (!turf || typeof turf.union !== 'function') return null;
    try {
      if (typeof turf.featureCollection === 'function') {
        var u = turf.union(turf.featureCollection(polys));
        if (u) return u;
      }
    } catch (e) {}
    try {
      var acc = polys[0];
      for (var i = 1; i < polys.length; i++) {
        var next = turf.union(acc, polys[i]);
        if (next) acc = next;
      }
      return acc;
    } catch (e2) {
      return null;
    }
  }

  function pavedTotal(features, turf, sqftPerM2) {
    var polys = areaPolys(features);
    var empty = { sqFt: 0, sumSqFt: 0, overlapSqFt: 0, count: 0 };
    if (!polys.length) return empty;
    var sum = 0;
    for (var i = 0; i < polys.length; i++) sum += areaSqFt(polys[i], turf, sqftPerM2);
    var unioned = unionFeatures(polys, turf);
    var union = unioned ? areaSqFt(unioned, turf, sqftPerM2) : sum;
    if (!(union > 0) && sum > 0) union = sum;
    var sqFt = Math.round(union);
    var sumSqFt = Math.round(sum);
    var overlapSqFt = Math.max(0, sumSqFt - sqFt);
    return { sqFt: sqFt, sumSqFt: sumSqFt, overlapSqFt: overlapSqFt, count: polys.length };
  }

  return {
    SQFT_PER_M2: SQFT_PER_M2,
    areaPolys: areaPolys,
    areaSqFt: areaSqFt,
    unionFeatures: unionFeatures,
    pavedTotal: pavedTotal
  };
});
