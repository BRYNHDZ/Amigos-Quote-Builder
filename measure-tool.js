/* Property measure tool: Leaflet + Geoman + Turf on USGS NAIP.
   Fills existing quote-builder fields through upd(). Does not change prices. */
(function (root) {
  'use strict';

  var NAIP_EXPORT = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
  var DUPAGE_IMG = 'https://gis.dupageco.org/arcgis/rest/services/Imagery_20162017_WGS84/ImageServer/tile/{z}/{y}/{x}';
  var SQFT_PER_M2 = 10.76391041671;
  var SQFT_PER_AC = 43560;

  var map, naipLayer, countyLayer, parcelLayer, labelLayer;
  var shapes = []; // {id, layer, kind, value, label}
  var selected = null;
  var view = 'google'; // google by default (current photos). county/naip only while measuring.
  var drawing = null; // 'area' | 'length' | null
  var inited = false;
  var loading = 0;
  var lastAddr = '';
  var seq = 0;
  var reviewMode = false;
  var importing = false;
  var activeUse = null;
  var showGen = 0;
  var lastCenter = null;
  var lastParcelBounds = null;
  var mapFull = false;
  var leavingDraw = false;
  var tileRefreshTimer = null;
  var USE_STYLE = {
    paved: { color: '#ea580c', fillColor: '#ea580c' },
    lawn: { color: '#2563eb', fillColor: '#2563eb' },
    house: { color: '#dc2626', fillColor: '#dc2626' },
    parkway: { color: '#7c3aed', fillColor: '#7c3aed' },
    lot: { color: '#0f766e', fillColor: '#0f766e' }
  };
  var QUOTE_FIELDS = { house: 'iHf', lawn: 'iLn', paved: 'iPv' };

  function $(id) { return document.getElementById(id); }
  function t(en, es) { return (typeof tx === 'function') ? tx(en, es) : en; }
  function gisUrl() { return (typeof DUPAGE_GIS === 'string') ? DUPAGE_GIS : 'https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/ParcelsWithRealEstateCC/MapServer/0/query'; }

  function tileBBox(x, y, z) {
    var n = Math.pow(2, z);
    var west = x / n * 360 - 180;
    var east = (x + 1) / n * 360 - 180;
    var north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    var south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    return [west, south, east, north];
  }

  function NaipLayer() {
    return L.gridLayer({
      tileSize: 256,
      minZoom: 14,
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: 'U.S. Geological Survey',
      keepBuffer: 0
    });
  }

  function wireNaip(layer) {
    layer.createTile = function (coords, done) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'width:256px;height:256px;background:transparent';
      var img = document.createElement('img');
      img.alt = '';
      img.style.cssText = 'width:256px;height:256px;display:block;background:transparent';
      var z = coords.z;
      var scale = 1;
      var tz = z;
      if (z > 19) { scale = Math.pow(2, z - 19); tz = 19; }
      var x = coords.x, y = coords.y;
      if (tz !== z) {
        x = Math.floor(coords.x / scale);
        y = Math.floor(coords.y / scale);
      }
      var bb = tileBBox(x, y, tz);
      var url = NAIP_EXPORT
        + '?bbox=' + bb.join(',')
        + '&bboxSR=4326&imageSR=3857&size=256,256&format=jpg&f=image';
      loadingAdd();
      var finished = false;
      function finish(err) {
        if (finished) return;
        finished = true;
        loadingDone();
        if (!err) wrap.appendChild(img);
        done(null, wrap);
      }
      var timer = setTimeout(function () { img.dataset.timeout = '1'; finish(new Error('timeout')); }, 22000);
      img.onload = function () { clearTimeout(timer); finish(null); };
      img.onerror = function () { clearTimeout(timer); finish(new Error('naip')); };
      img.src = url;
      return wrap;
    };
    return layer;
  }

  function loadingAdd() {
    loading++;
    var el = $('measureLoad');
    if (el && view === 'naip') { el.textContent = t('Loading newer photos…', 'Cargando fotos nuevas…'); }
  }
  function loadingDone() {
    loading = Math.max(0, loading - 1);
    var el = $('measureLoad');
    if (el && (loading === 0 || view !== 'naip')) el.classList.remove('show');
  }
  function hideLoading() {
    var el = $('measureLoad');
    if (el) el.classList.remove('show');
  }

  function ensureDom() {
    var box = $('mapBox');
    if (!box) return null;
    if (!$('leafletMap')) {
      box.innerHTML =
        '<div id="measureBar" class="measure-bar" role="toolbar" aria-label="Measure"></div>'
        + '<div id="measureHint" class="measure-hint"><span id="measureHintT"></span>'
        + '<button type="button" id="measureDone">Done</button>'
        + '<button type="button" class="m-cancel" id="measureCancel">Cancel</button></div>'
        + '<div id="leafletMap" class="leaflet-host"></div>'
        + '<div id="googleMap" class="google-host"></div>'
        + '<div id="measureLoad" class="measure-load">Loading photos…</div>'
        + '<div id="measureUse" class="measure-use"></div>';
    }
    return box;
  }

  function renderBar() {
    var bar = $('measureBar');
    if (!bar) return;
    var b = function (id, label, on, title) {
      return '<button type="button" id="' + id + '" class="' + (on ? 'on' : '') + '"'
        + (title ? ' title="' + title + '"' : '') + '>' + label + '</button>';
    };
    var html =
      b('mBtnArea', t('Measure area', 'Medir área'), drawing === 'area')
      + b('mBtnLen', t('Measure length', 'Medir largo'), drawing === 'length');
    if (view !== 'google') {
      html += b('mBtnEdit', t('Edit', 'Editar'), !!(map && map.pm && map.pm.globalEditModeEnabled && map.pm.globalEditModeEnabled()), t('Move corners', 'Mover esquinas'))
        + '<span class="m-sep"></span>'
        + b('mBtnNaip', 'USGS', view === 'naip', t('Newer government photos', 'Fotos del gobierno'))
        + b('mBtnCounty', t('County', 'Condado'), view === 'county', t('DuPage photos, 2016', 'Fotos de DuPage, 2016'));
    }
    html += b('mBtnGoogle', t('Google view', 'Vista Google'), view === 'google');
    var closeHtml = '';
    if (mapFull) {
      closeHtml = b('mBtnClose', t('Close map', 'Cerrar mapa'), false, t('Leave the full-size map', 'Salir del mapa grande'));
    }
    bar.innerHTML = '<div class="measure-bar-tools">' + html + '</div>' + closeHtml;
    $('mBtnArea').onclick = function () { toggleDraw('area'); };
    $('mBtnLen').onclick = function () { toggleDraw('length'); };
    if ($('mBtnEdit')) $('mBtnEdit').onclick = function () { toggleEdit(); };
    if ($('mBtnNaip')) $('mBtnNaip').onclick = function () { setView('naip'); };
    if ($('mBtnCounty')) $('mBtnCounty').onclick = function () { setView('county'); };
    $('mBtnGoogle').onclick = function () { setView('google'); };
    if ($('mBtnClose')) $('mBtnClose').onclick = function () { exitMapFull(); };
    var done = $('measureDone'), cancel = $('measureCancel');
    if (done) done.onclick = finishDraw;
    if (cancel) cancel.onclick = cancelDraw;
  }

  function setHint(on, text) {
    var el = $('measureHint');
    if (!el) return;
    el.classList.toggle('show', !!on);
    if (text) $('measureHintT').textContent = text;
  }

  function toggleDraw(kind) {
    if (view === 'google') setView('county');
    if (!mapFull) enterMapFull();
    if (drawing === kind) { cancelDraw(); return; }
    startDraw(kind);
  }

  function areaShapeCount() {
    return shapes.filter(function (sh) { return sh.kind === 'area'; }).length;
  }

  function startDraw(kind, again) {
    if (!map) return;
    setReviewMode(false);
    if (map.pm.globalEditModeEnabled && map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
    drawing = kind;
    if (kind === 'area') map.pm.enableDraw('Polygon', { continueDrawing: false, snappable: true, snapDistance: 18, finishOn: null });
    else map.pm.enableDraw('Line', { continueDrawing: false, snappable: true, snapDistance: 18, finishOn: null });
    var keepAdding = !!again || areaShapeCount() > 0;
    setHint(true, kind === 'area'
      ? (keepAdding
        ? t('Added. Trace the next paved area, then Done. Or use the total when you are finished.', 'Sumado. Traza la siguiente área pavimentada y toca Listo. O usa el total cuando termines.')
        : t('Tap each corner, then Done. Keep adding the driveway and walks to get one total.', 'Toca cada esquina, luego Listo. Sigue sumando la entrada y las banquetas: un solo total.'))
      : t('Tap along the line. Tap Done when you finish.', 'Toca a lo largo de la línea. Toca Listo al terminar.'));
    renderBar();
  }

  function activeDrawTool() {
    if (!map || !map.pm || !map.pm.Draw || typeof map.pm.Draw.getActiveShape !== 'function') return null;
    var name = map.pm.Draw.getActiveShape();
    return name ? map.pm.Draw[name] : null;
  }

  function drawVertexCount(tool) {
    if (!tool) return 0;
    if (tool._markers && tool._markers.length) return tool._markers.length;
    if (typeof tool.getVertexCount === 'function') return tool.getVertexCount() || 0;
    var layer = tool._layer;
    if (layer && typeof layer.getLatLngs === 'function') {
      var ll = layer.getLatLngs();
      if (Array.isArray(ll) && Array.isArray(ll[0])) ll = ll[0];
      return (ll && ll.length) || 0;
    }
    return 0;
  }

  function removeLastDrawVertex() {
    var tool = activeDrawTool();
    if (!tool || drawVertexCount(tool) < 1) return false;
    if (typeof tool._removeLastVertex === 'function') {
      tool._removeLastVertex();
      return true;
    }
    return false;
  }

  function finishDraw() {
    if (!map) return;
    var tool = activeDrawTool();
    var name = map.pm.Draw && map.pm.Draw.getActiveShape && map.pm.Draw.getActiveShape();
    var need = (name === 'Line' || drawing === 'length') ? 2 : 3;
    var n = drawVertexCount(tool);
    if (tool && n >= need) {
      leavingDraw = true;
      try {
        if (typeof map.pm.finishDraw === 'function') map.pm.finishDraw();
        else if (tool._finishShape) tool._finishShape();
      } finally {
        cancelDraw();
        leavingDraw = false;
      }
    } else {
      cancelDraw();
    }
  }

  function cancelDraw() {
    if (map) map.pm.disableDraw();
    drawing = null;
    setHint(false);
    renderBar();
  }

  function toggleEdit() {
    if (view === 'google') setView('county');
    if (!map) return;
    setReviewMode(false);
    cancelDraw();
    if (map.pm.globalEditModeEnabled && map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
    else map.pm.enableGlobalEditMode({ snappable: true, snapDistance: 18, allowSelfIntersection: false });
    renderBar();
  }

  function rememberView() {
    if (!map) return;
    var c = map.getCenter();
    lastCenter = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
  }

  function refreshCountyTiles() {
    if (!map || !countyLayer || view === 'google') return;
    try {
      if (map.hasLayer(countyLayer)) map.removeLayer(countyLayer);
      countyLayer.addTo(map);
      if (view === 'naip') {
        if (!map.hasLayer(naipLayer)) naipLayer.addTo(map);
        try { naipLayer.bringToFront(); } catch (e) {}
      }
      if (labelLayer) labelLayer.bringToFront();
      if (parcelLayer) parcelLayer.bringToFront();
      shapes.forEach(function (sh) {
        if (sh.layer && sh.layer.bringToFront) try { sh.layer.bringToFront(); } catch (e) {}
      });
    } catch (e) {}
  }

  function afterMapResize() {
    if (!map) return;
    map.invalidateSize({ animate: false });
    if (lastCenter) {
      map.setView([lastCenter.lat, lastCenter.lng], lastCenter.zoom || map.getZoom(), { animate: false });
    }
    refreshCountyTiles();
    layoutLabels();
  }

  function enterMapFull() {
    var box = $('mapBox');
    if (!box) return;
    mapFull = true;
    box.classList.add('is-full');
    document.body.classList.add('map-full');
    renderBar();
    afterMapResize();
    setTimeout(afterMapResize, 80);
    setTimeout(afterMapResize, 250);
  }

  function exitMapFull() {
    var box = $('mapBox');
    mapFull = false;
    if (box) box.classList.remove('is-full');
    document.body.classList.remove('map-full');
    cancelDraw();
    renderBar();
    afterMapResize();
    setTimeout(afterMapResize, 80);
    setTimeout(afterMapResize, 250);
  }

  function setView(next) {
    if (next === 'google' && mapFull) {
      mapFull = false;
      var fullBox = $('mapBox');
      if (fullBox) fullBox.classList.remove('is-full');
      document.body.classList.remove('map-full');
    }
    view = next;
    var box = $('mapBox');
    if (box) box.classList.toggle('is-google', next === 'google');
    if (map) {
      if (next === 'naip') {
        if (map.hasLayer(naipLayer) === false) naipLayer.addTo(map);
        refreshCountyTiles();
        try { naipLayer.bringToFront(); } catch (e) {}
        if (labelLayer) labelLayer.bringToFront();
        if (parcelLayer) parcelLayer.bringToFront();
      } else if (next === 'county') {
        if (map.hasLayer(naipLayer)) map.removeLayer(naipLayer);
        refreshCountyTiles();
        hideLoading();
      }
    }
    if (next !== 'naip') hideLoading();
    if (next === 'google') {
      cancelDraw();
      fillGoogle();
      // Leaflet is hidden, so pick the last area shape so Use as stays available.
      if (!selected || selected.kind !== 'area') {
        var areas = shapes.filter(function (s) { return s.kind === 'area'; });
        if (areas.length) selected = areas[areas.length - 1];
      }
    } else if (map) {
      setTimeout(afterMapResize, 80);
      setTimeout(afterMapResize, 250);
    }
    renderBar();
    renderUse();
  }

  function fillGoogle() {
    var host = $('googleMap');
    if (!host) return;
    var a = lastAddr || (typeof getAddr === 'function' ? getAddr() : '');
    if (!a) return;
    var url = 'https://maps.google.com/maps?q=' + encodeURIComponent(a) + '&t=k&z=19&output=embed';
    if (host.getAttribute('data-src') !== url) {
      host.innerHTML = '<iframe width="100%" height="100%" frameborder="0" style="border:0;display:block" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="' + url + '"></iframe>';
      host.setAttribute('data-src', url);
    }
  }

  function measureLayer(layer) {
    var gj = layer.toGeoJSON();
    var feat = gj.type === 'Feature' ? gj : { type: 'Feature', properties: {}, geometry: gj };
    var typ = feat.geometry && feat.geometry.type;
    if (typ === 'Polygon' || typ === 'MultiPolygon') {
      return { kind: 'area', value: Math.round(turf.area(feat) * SQFT_PER_M2) };
    }
    return { kind: 'length', value: Math.round(turf.length(feat, { units: 'feet' })) };
  }

  function fmt(kind, value) {
    var n = (value || 0).toLocaleString();
    if (kind === 'area') return { num: n, unit: t('sq ft', 'pies²') };
    return { num: n, unit: t('ft', 'pies') };
  }

  function centroid(layer) {
    try {
      var c = turf.centroid(layer.toGeoJSON());
      var p = c.geometry.coordinates;
      return L.latLng(p[1], p[0]);
    } catch (e) {
      return layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLngs()[0];
    }
  }

  function labelBox(it) {
    return {
      x: it.pt.x + it.dx - it.w / 2,
      y: it.pt.y + it.dy - it.h / 2,
      w: it.w,
      h: it.h
    };
  }

  function labelsOverlap(a, b, pad) {
    pad = pad == null ? 6 : pad;
    var ra = labelBox(a), rb = labelBox(b);
    return ra.x < rb.x + rb.w + pad && ra.x + ra.w + pad > rb.x
      && ra.y < rb.y + rb.h + pad && ra.y + ra.h + pad > rb.y;
  }

  function layoutLabels() {
    if (!map) return;
    var items = [];
    shapes.forEach(function (s) {
      if (!s.label) return;
      if (reviewMode && s !== selected) {
        setLabelVisible(s, false);
        return;
      }
      var root = s.label.getElement && s.label.getElement();
      var el = root && (root.querySelector('.m-label') || root);
      if (!el) return;
      var ll = s.label.getLatLng && s.label.getLatLng();
      if (!ll) return;
      var pt = map.latLngToLayerPoint(ll);
      el.style.visibility = '';
      el.style.transform = 'translate(-50%, -50%)';
      items.push({
        shape: s,
        el: el,
        pt: pt,
        w: Math.max(el.offsetWidth || 0, 72),
        h: Math.max(el.offsetHeight || 0, 22),
        value: s.value || 0,
        dx: 0,
        dy: 0
      });
    });
    items.sort(function (a, b) { return b.value - a.value; });
    var size = map.getSize ? map.getSize() : { x: 0, y: 0 };
    var topLeft = map.containerPointToLayerPoint ? map.containerPointToLayerPoint([0, 0]) : { x: 0, y: 0 };
    var box = { x: topLeft.x, y: topLeft.y, w: size.x, h: size.y };
    function clampLabel(it) {
      var pad = 8;
      var hw = it.w / 2, hh = it.h / 2;
      var x = it.pt.x + it.dx, y = it.pt.y + it.dy;
      var minX = box.x + pad + hw, maxX = box.x + box.w - pad - hw;
      var minY = box.y + pad + hh, maxY = box.y + box.h - pad - hh;
      if (maxX >= minX) x = Math.min(maxX, Math.max(minX, x));
      else x = box.x + box.w / 2;
      if (maxY >= minY) y = Math.min(maxY, Math.max(minY, y));
      else y = box.y + box.h / 2;
      it.dx = x - it.pt.x;
      it.dy = y - it.pt.y;
    }
    items.forEach(clampLabel);
    var steps = [];
    (function buildSteps() {
      var r, a, i;
      for (r = 1; r <= 8; r++) {
        for (i = 0; i < 16; i++) {
          a = (i / 16) * Math.PI * 2;
          steps.push({ dx: Math.cos(a) * r * 18, dy: Math.sin(a) * r * 18 });
        }
      }
    })();
    var kept = [];
    items.forEach(function (it) {
      function clear() { return !kept.some(function (k) { return labelsOverlap(it, k); }); }
      if (!clear()) {
        var odx = it.dx, ody = it.dy, found = false;
        for (var s = 0; s < steps.length; s++) {
          it.dx = odx + steps[s].dx;
          it.dy = ody + steps[s].dy;
          clampLabel(it);
          if (clear()) { found = true; break; }
        }
        if (!found) {
          it.dx = odx;
          it.dy = ody;
          clampLabel(it);
          it.el.style.visibility = 'hidden';
          return;
        }
      }
      kept.push(it);
      it.el.style.transform = 'translate(calc(-50% + ' + Math.round(it.dx) + 'px), calc(-50% + ' + Math.round(it.dy) + 'px))';
    });
  }

  function styleFor(shape, isSel) {
    if (!shape || shape.kind !== 'area') {
      return { color: '#18240F', weight: isSel ? 5 : 3, fillOpacity: 0, opacity: 1, className: 'm-shape' };
    }
    var pal = USE_STYLE[shape.use] || USE_STYLE.paved;
    return {
      color: pal.color,
      fillColor: pal.fillColor,
      weight: isSel ? 4 : 3,
      fillOpacity: isSel ? 0.2 : 0.12,
      opacity: 1,
      className: 'm-shape'
    };
  }

  function applyShapeStyle(shape) {
    if (!shape || !shape.layer || !shape.layer.setStyle) return;
    shape.layer.setStyle(styleFor(shape, shape === selected));
  }

  function labelLatLng(shape) {
    if (!map || !shape || !shape.layer || !shape.layer.getBounds) return (shape.layer && centroid(shape.layer));
    var b = shape.layer.getBounds();
    var mid = L.latLng(b.getNorth(), (b.getWest() + b.getEast()) / 2);
    var pt = map.latLngToLayerPoint(mid);
    pt.y -= 14;
    return map.layerPointToLatLng(pt);
  }

  function setLabelVisible(shape, on) {
    if (!shape || !shape.label) return;
    var root = shape.label.getElement && shape.label.getElement();
    var el = root && (root.querySelector('.m-label') || root);
    if (el) el.style.visibility = on ? '' : 'hidden';
  }

  function syncLabelVisibility() {
    shapes.forEach(function (s) {
      var on = !reviewMode || s === selected;
      setLabelVisible(s, on);
    });
    if (!reviewMode) layoutLabels();
  }

  function setReviewMode(on) {
    reviewMode = !!on;
    var el = $('measureUse');
    if (el) el.classList.toggle('is-collapsed', reviewMode);
    if (!reviewMode) {
      shapes.forEach(function (s) { setLabelVisible(s, true); });
      layoutLabels();
    } else {
      syncLabelVisibility();
    }
    renderUse();
  }

  function fitToShapes() {
    if (!map) return;
    var layers = shapes.map(function (s) { return s.layer; }).filter(Boolean);
    if (!layers.length) return;
    var el = $('measureUse');
    var isNarrow = (typeof window !== 'undefined' && window.innerWidth < 900);
    var top = 18, left = 18, right = 18, bottom = 28;
    if (el && el.classList.contains('show')) {
      if (mapFull && !isNarrow) right = Math.max(28, (el.offsetWidth || 0) + 28);
      else bottom = Math.max(28, (el.offsetHeight || 0) + 28);
    }
    try {
      map.invalidateSize({ animate: false });
      map.fitBounds(L.featureGroup(layers).getBounds(), {
        paddingTopLeft: [left, top],
        paddingBottomRight: [right, bottom],
        maxZoom: 21,
        animate: false
      });
      rememberView();
    } catch (e) {}
    layoutLabels();
  }

  function useName(use) {
    if (use === 'lawn') return t('Lawn', 'Césped');
    if (use === 'house') return t('House', 'Casa');
    if (use === 'parkway') return t('Parkway', 'Parkway');
    if (use === 'lot') return t('Lot', 'Terreno');
    if (use === 'paved') return t('Paved', 'Pavimento');
    return t('New', 'Nuevo');
  }

  function useLegend(use) {
    var name = useName(use);
    if (use !== 'paved' && use !== 'lawn' && use !== 'house') return name;
    return '<span class="mu-key mu-key-' + use + '"></span><span class="mu-name-' + use + '">' + name + '</span>';
  }

  function upsertLabel(shape) {
    if (shape.label) { map.removeLayer(shape.label); shape.label = null; }
    var f = fmt(shape.kind, shape.value);
    var text = f.num + ' ' + f.unit;
    if (shape.kind === 'area') text = useName(shape.use) + ' ' + text;
    var use = shape.use || 'new';
    var icon = L.divIcon({
      className: 'm-label-wrap',
      html: '<div class="m-label m-label-' + use + '">' + text + '</div>',
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    var at = labelLatLng(shape) || centroid(shape.layer);
    shape.label = L.marker(at, { icon: icon, interactive: false, keyboard: false, zIndexOffset: 600 });
    if (labelLayer) shape.label.addTo(labelLayer);
    setLabelVisible(shape, !reviewMode || shape === selected);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(layoutLabels);
    else setTimeout(layoutLabels, 0);
  }

  function selectShape(shape) {
    selected = shape;
    shapes.forEach(function (s) { applyShapeStyle(s); });
    syncLabelVisibility();
    renderUse();
  }

  function turfLib() {
    if (typeof turf !== 'undefined') return turf;
    return root.turf || null;
  }

  function isUseGroup(shape, use) {
    return shape && shape.kind === 'area' && shape.use === use;
  }

  function isPavedGroup(shape) {
    return isUseGroup(shape, 'paved');
  }

  function useFeatures(use) {
    return shapes.filter(function (sh) { return isUseGroup(sh, use); }).map(function (sh) {
      return sh.layer && sh.layer.toGeoJSON ? sh.layer.toGeoJSON() : null;
    }).filter(Boolean);
  }

  function useTotalNow(use) {
    var lib = (root.MeasureTotal || (typeof MeasureTotal !== 'undefined' ? MeasureTotal : null));
    var feats = useFeatures(use);
    if (!lib || typeof lib.pavedTotal !== 'function') {
      var sum = 0, n = 0;
      shapes.forEach(function (sh) { if (isUseGroup(sh, use)) { sum += sh.value || 0; n++; } });
      return { sqFt: Math.round(sum), sumSqFt: Math.round(sum), overlapSqFt: 0, count: n };
    }
    return lib.pavedTotal(feats, turfLib(), SQFT_PER_M2);
  }

  function pavedTotalNow() { return useTotalNow('paved'); }

  function syncUseToQuote(use) {
    if (importing) return;
    if (!QUOTE_FIELDS[use]) return;
    var el = $(QUOTE_FIELDS[use]);
    if (!el) return;
    var total = useTotalNow(use);
    if (total.count > 0) el.value = String(total.sqFt);
    else el.value = '';
    if ($('measDet')) $('measDet').open = true;
    if (typeof upd === 'function') upd();
    if (typeof updateMeasSources === 'function') updateMeasSources();
  }

  function renderUse() {
    var el = $('measureUse');
    if (!el) return;
    var areaCount = areaShapeCount();
    if (!selected && !areaCount) { el.classList.remove('show', 'is-collapsed'); el.innerHTML = ''; return; }
    if (reviewMode) {
      var uses = [];
      shapes.forEach(function (sh) {
        if (sh.kind !== 'area') return;
        var use = sh.use || 'new';
        if (uses.indexOf(use) === -1) uses.push(use);
      });
      var summary = uses.map(useLegend).join(' · ');
      el.innerHTML = '<div class="mu-sum">' + summary + '</div>'
        + '<button type="button" id="muExpand">' + t('Edit traces', 'Editar trazos') + '</button>';
      el.classList.add('show', 'is-collapsed');
      var exp = $('muExpand');
      if (exp) exp.onclick = function () { setReviewMode(false); };
      return;
    }
    var html = '';
    ['paved', 'lawn', 'house'].forEach(function (use) {
      var tot = useTotalNow(use);
      if (!tot.count) return;
      var f = fmt('area', tot.sqFt);
      var meta = useLegend(use) + ' · ' + tot.count + ' ' + (tot.count === 1 ? t('area', 'área') : t('areas', 'áreas'));
      if (tot.overlapSqFt >= 1) meta += t(' · overlap taken out', ' · sin contar el traslape');
      html += '<div class="mu-row mu-total-row"><span class="mu-num">' + f.num + '</span><span class="mu-unit">' + f.unit + '</span></div>';
      html += '<div class="mu-meta">' + meta + '</div>';
    });
    if (selected) {
      var one = fmt(selected.kind, selected.value);
      if (!selected.use) {
        html += '<div class="mu-row"><span class="mu-num">' + one.num + '</span><span class="mu-unit">' + one.unit + '</span></div>';
        html += '<div class="mu-meta">' + t('Tap House, Lawn, or Paved to add this to the quote.', 'Toca Casa, Césped o Pavimento para sumarlo a la cotización.') + '</div>';
      }
    }
    html += '<div class="mu-row mu-actions">';
    html += '<button type="button" id="muUndo">' + t('Undo last', 'Deshacer') + '</button>';
    html += '<button type="button" id="muClear">' + t('Clear', 'Borrar todo') + '</button>';
    if (selected) html += '<button type="button" class="mu-del" id="muDel">' + t('Delete', 'Borrar') + '</button>';
    html += '</div>';
    if (areaCount && (selected && selected.kind === 'area' || !selected)) {
      var cur = (selected && selected.use) || activeUse;
      html += '<div class="mu-row mu-fills">'
        + '<span class="mu-lbl">' + t('Use as', 'Usar como') + '</span>'
        + '<button type="button" data-fill="house"' + (cur === 'house' ? ' class="used"' : '') + '>' + t('House', 'Casa') + '</button>'
        + '<button type="button" data-fill="lawn"' + (cur === 'lawn' ? ' class="used"' : '') + '>' + t('Lawn', 'Césped') + '</button>'
        + '<button type="button" data-fill="paved"' + (cur === 'paved' ? ' class="used"' : '') + '>' + t('Paved', 'Pavimento') + '</button>'
        + '</div>';
    }
    html += '<div class="mu-row mu-review"><button type="button" id="muCollapse">' + t('Hide tools', 'Ocultar herramientas') + '</button></div>';
    el.innerHTML = html;
    el.classList.add('show');
    el.classList.remove('is-collapsed');
    var hide = $('muCollapse');
    if (hide) hide.onclick = function () { selected = null; shapes.forEach(function (s) { applyShapeStyle(s); }); setReviewMode(true); fitToShapes(); };
    el.querySelectorAll('[data-fill]').forEach(function (btn) {
      btn.onclick = function () { applyFill(btn.getAttribute('data-fill'), selected ? selected.value : 0, btn); };
    });
    var del = $('muDel');
    if (del) del.onclick = function () { removeShape(selected); };
    var undo = $('muUndo');
    if (undo) undo.onclick = function () { undoLast(); };
    var clr = $('muClear');
    if (clr) clr.onclick = function () { clearShapes(); };
  }

  function applyFill(field, value, btn) {
    if (field !== 'house' && field !== 'lawn' && field !== 'paved') return;
    activeUse = field;
    var prev = null;
    if (selected && selected.kind === 'area') {
      prev = selected.use;
      selected.use = field;
      applyShapeStyle(selected);
      upsertLabel(selected);
    }
    shapes.forEach(function (sh) {
      if (sh.kind === 'area' && !sh.use) {
        sh.use = field;
        applyShapeStyle(sh);
        upsertLabel(sh);
      }
    });
    if (prev && prev !== field && QUOTE_FIELDS[prev]) syncUseToQuote(prev);
    syncUseToQuote(field);
    renderUse();
    notifyChange();
    if (btn) {
      btn.classList.add('used');
      var label = btn.textContent;
      btn.textContent = '✓ ' + label.replace(/^✓\s*/, '');
      setTimeout(function () { btn.textContent = label; }, 1200);
    }
  }

  function undoLast() {
    if (removeLastDrawVertex()) {
      renderBar();
      return;
    }
    if (!shapes.length) return;
    var keepKind = drawing || 'area';
    var keep = !!drawing || mapFull;
    removeShape(shapes[shapes.length - 1]);
    if (keep) startDraw(keepKind, true);
  }

  function removeShape(shape) {
    if (!shape) return;
    var prev = shape.use;
    try { map.removeLayer(shape.layer); } catch (e) {}
    if (shape.label) try { map.removeLayer(shape.label); } catch (e) {}
    shapes = shapes.filter(function (s) { return s !== shape; });
    if (selected === shape) selected = shapes[shapes.length - 1] || null;
    if (selected) selectShape(selected);
    else renderUse();
    layoutLabels();
    if (prev) syncUseToQuote(prev);
    notifyChange();
  }

  function registerShape(layer, opts) {
    var m = measureLayer(layer);
    if (!m.value || m.value <= 0) return null;
    var shape = {
      id: ++seq,
      layer: layer,
      kind: m.kind,
      value: m.value,
      label: null,
      use: m.kind === 'area' ? ((opts && opts.use) || activeUse || null) : null
    };
    layer.setStyle(styleFor(shape, false));
    shapes.push(shape);
    upsertLabel(shape);
    layer.on('click', function (ev) {
      if (ev && ev.originalEvent) L.DomEvent.stop(ev);
      selectShape(shape);
    });
    layer.on('pm:edit pm:markerdragend pm:vertexremoved', function () {
      var mm = measureLayer(layer);
      shape.kind = mm.kind;
      shape.value = mm.value;
      upsertLabel(shape);
      renderUse();
      if (shape.use) syncUseToQuote(shape.use);
      notifyChange();
    });
    if (!importing) {
      selectShape(shape);
      if (shape.use) syncUseToQuote(shape.use);
      notifyChange();
    } else {
      applyShapeStyle(shape);
    }
    return shape;
  }

  function notifyChange() {
    if (typeof root.PropertyMap !== 'undefined' && typeof root.PropertyMap.onChange === 'function') {
      try { root.PropertyMap.onChange(); } catch (e) {}
    }
  }

  function ringFromLayer(layer) {
    if (!layer || !layer.toGeoJSON) return [];
    var gj = layer.toGeoJSON();
    var feat = gj.type === 'Feature' ? gj : (gj.features && gj.features[0]) || gj;
    var g = (feat && feat.geometry) || feat;
    if (!g) return [];
    if (g.type === 'Polygon') return g.coordinates[0] || [];
    if (g.type === 'MultiPolygon') return (g.coordinates[0] && g.coordinates[0][0]) || [];
    if (g.type === 'LineString') return g.coordinates || [];
    return [];
  }

  function exportShapes() {
    var out = [];
    shapes.forEach(function (s) {
      if (s.kind !== 'area' || !s.layer) return;
      var ring = ringFromLayer(s.layer);
      if (ring.length < 3) return;
      out.push({ use: s.use || 'paved', coords: ring });
    });
    return out;
  }

  function importShapes(list) {
    if (!list || !list.length) return 0;
    var box = ensureDom();
    if (box) { box.style.display = 'block'; var meta = $('mapMeta'); if (meta) meta.style.display = 'flex'; }
    initMap();
    if (!map) return 0;
    importing = true;
    var n = 0;
    list.forEach(function (s) {
      var ring = (s && s.coords) ? s.coords.slice() : [];
      if (ring.length < 3) return;
      var a = ring[0], b = ring[ring.length - 1];
      if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) ring = ring.concat([ring[0]]);
      var gj = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
      var shape = addAreaFromGeoJSON(gj);
      if (shape) {
        shape.use = s.use || 'paved';
        applyShapeStyle(shape);
        upsertLabel(shape);
        n++;
      }
    });
    importing = false;
    selected = null;
    setView('county');
    setReviewMode(true);
    fitToShapes();
    setTimeout(function () { fitToShapes(); }, 120);
    setTimeout(function () { fitToShapes(); }, 400);
    notifyChange();
    return n;
  }

  function addAreaFromGeoJSON(gj) {
    if (!map || typeof L === 'undefined') return null;
    var layer = L.geoJSON(gj, {
      style: styleFor({ kind: 'area', use: 'paved' }, false)
    }).getLayers()[0];
    if (!layer) return null;
    layer.addTo(map);
    return registerShape(layer);
  }

  function onCreated(e) {
    var restart = !leavingDraw;
    drawing = null;
    setHint(false);
    renderBar();
    var layer = e.layer;
    var shape = registerShape(layer);
    if (!shape) {
      try { map.removeLayer(layer); } catch (err) {}
      return;
    }
    if (shape.kind === 'area' && restart) startDraw('area', true);
  }

  function onIntersect() {
    setHint(true, t(
      'That line crosses itself. Move the point so the lines do not cross.',
      'Esa línea se cruza. Mueve el punto para que las líneas no se crucen.'
    ));
  }

  function initMap() {
    if (inited) return;
    var box = ensureDom();
    if (!box || typeof L === 'undefined') return;
    naipLayer = wireNaip(NaipLayer());
    countyLayer = L.tileLayer(DUPAGE_IMG, {
      attribution: 'DuPage County GIS (2016–2017)',
      maxZoom: 21,
      maxNativeZoom: 20,
      updateWhenIdle: false,
      keepBuffer: 6,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    });
    map = L.map('leafletMap', {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 21,
      minZoom: 15
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    countyLayer.addTo(map);
    if (view === 'naip') naipLayer.addTo(map);
    labelLayer = L.layerGroup().addTo(map);
    parcelLayer = L.layerGroup().addTo(map);
    map.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 18,
      allowSelfIntersection: false,
      finishOn: null,
      markerStyle: { radius: 7, fillColor: '#30471F', color: '#fff', weight: 2, fillOpacity: 1 },
      templineStyle: { color: '#30471F', weight: 3 },
      hintlineStyle: { color: '#30471F', weight: 3, dashArray: '6,6' },
      pathOptions: { color: '#30471F', fillColor: '#30471F', fillOpacity: 0.28, weight: 3 }
    });
    map.on('pm:create', onCreated);
    map.on('pm:intersect', onIntersect);
    map.on('pm:drawend', function () { /* keep hint until create or cancel */ });
    map.on('zoomend', function () {
      layoutLabels();
      rememberView();
      if (view !== 'google' && map.getZoom() >= 20) {
        clearTimeout(tileRefreshTimer);
        tileRefreshTimer = setTimeout(function () {
          if (countyLayer && countyLayer.redraw) countyLayer.redraw();
          var loaded = document.querySelectorAll('#leafletMap img.leaflet-tile').length;
          var ok = 0;
          document.querySelectorAll('#leafletMap img.leaflet-tile').forEach(function (img) {
            if (img.complete && img.naturalWidth > 1) ok++;
          });
          if (!ok) refreshCountyTiles();
        }, 200);
      }
    });
    map.on('moveend resize', function () { layoutLabels(); rememberView(); });
    ['measureBar', 'measureHint', 'measureUse'].forEach(function (id) {
      var el = $(id);
      if (el && L.DomEvent) {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && mapFull) exitMapFull();
    });
    inited = true;
    renderBar();
    var done = $('measureDone'), cancel = $('measureCancel');
    if (done) done.onclick = finishDraw;
    if (cancel) cancel.onclick = cancelDraw;
  }

  function loadParcel(lat, lng, gen) {
    if (!parcelLayer) return;
    parcelLayer.clearLayers();
    lastParcelBounds = null;
    var url = gisUrl() + '?geometry=' + lng + ',' + lat
      + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
      + '&outFields=ACREAGE,PIN,PROPADDRL1&returnGeometry=true&outSR=4326&f=json';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (gen != null && gen !== showGen) return;
      var feats = (data && data.features) || [];
      var all = [];
      feats.forEach(function (f) {
        var rings = (f.geometry && f.geometry.rings) || [];
        rings.forEach(function (ring) {
          var latlngs = ring.map(function (p) { return [p[1], p[0]]; });
          all = all.concat(latlngs);
          L.polygon(latlngs, {
            color: '#fff',
            weight: 3,
            opacity: 0.95,
            fill: false,
            interactive: false,
            dashArray: null
          }).addTo(parcelLayer);
          L.polygon(latlngs, {
            color: '#18240F',
            weight: 1.5,
            opacity: 0.9,
            fill: false,
            interactive: false
          }).addTo(parcelLayer);
        });
      });
      if (all.length && typeof L.latLngBounds === 'function') {
        lastParcelBounds = L.latLngBounds(all);
        if (!shapes.length && !drawing) {
          try {
            map.fitBounds(lastParcelBounds, { padding: [28, 28], maxZoom: 20, animate: false });
            rememberView();
          } catch (e) {}
        }
      }
    }).catch(function () {});
  }

  function clearShapes() {
    shapes.slice().forEach(function (s) { removeShape(s); });
    selected = null;
    renderUse();
    ['paved', 'lawn', 'house'].forEach(syncUseToQuote);
  }

  function show(addr, lat, lng) {
    var gen = ++showGen;
    var nextAddr = addr || lastAddr;
    if (nextAddr && lastAddr && nextAddr !== lastAddr) clearShapes();
    lastAddr = nextAddr;
    var box = ensureDom();
    if (!box) return Promise.resolve();
    box.style.display = 'block';
    var meta = $('mapMeta');
    if (meta) meta.style.display = 'flex';
    initMap();
    setView('google');
    function go(la, lo) {
      if (gen !== showGen) return;
      if (!map) return;
      lastCenter = { lat: +la, lng: +lo, zoom: 19 };
      lastParcelBounds = null;
      map.setView([la, lo], 19, { animate: false });
      loadParcel(la, lo, gen);
    }
    if (lat != null && lng != null) {
      go(+lat, +lng);
      return Promise.resolve();
    }
    if (typeof nomSearch !== 'function') return Promise.resolve();
    return nomSearch(lastAddr).then(function (g) {
      if (gen !== showGen) return;
      if (g && g.length) go(+g[0].lat, +g[0].lon);
    }).catch(function () {});
  }

  function hide() {
    var box = $('mapBox'), meta = $('mapMeta');
    if (box) box.style.display = 'none';
    if (meta) meta.style.display = 'none';
  }

  root.PropertyMap = {
    show: show,
    hide: hide,
    applyFill: applyFill,
    pavedTotal: pavedTotalNow,
    undoLast: undoLast,
    clearShapes: clearShapes,
    addAreaFromGeoJSON: addAreaFromGeoJSON,
    exportShapes: exportShapes,
    importShapes: importShapes,
    onChange: null,
    finishDraw: finishDraw,
    enterMapFull: enterMapFull,
    exitMapFull: exitMapFull,
    _shapes: function () { return shapes; },
    _map: function () { return map; },
    _view: function () { return view; },
    _setView: setView,
    _isFull: function () { return mapFull; },
    _showGen: function () { return showGen; },
    SQFT_PER_M2: SQFT_PER_M2
  };
})(window);
