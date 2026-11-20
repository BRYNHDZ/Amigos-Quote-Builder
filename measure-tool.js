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
    bar.innerHTML = html;
    $('mBtnArea').onclick = function () { toggleDraw('area'); };
    $('mBtnLen').onclick = function () { toggleDraw('length'); };
    if ($('mBtnEdit')) $('mBtnEdit').onclick = function () { toggleEdit(); };
    if ($('mBtnNaip')) $('mBtnNaip').onclick = function () { setView('naip'); };
    if ($('mBtnCounty')) $('mBtnCounty').onclick = function () { setView('county'); };
    $('mBtnGoogle').onclick = function () { setView('google'); };
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
    if (drawing === kind) { cancelDraw(); return; }
    startDraw(kind);
  }

  function areaShapeCount() {
    return shapes.filter(function (sh) { return sh.kind === 'area'; }).length;
  }

  function startDraw(kind, again) {
    if (!map) return;
    if (map.pm.globalEditModeEnabled && map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
    drawing = kind;
    if (kind === 'area') map.pm.enableDraw('Polygon', { continueDrawing: false, snappable: true, snapDistance: 18, finishOn: null });
    else map.pm.enableDraw('Line', { continueDrawing: false, snappable: true, snapDistance: 18, finishOn: null });
    var keepAdding = !!again || areaShapeCount() > 0;
    setHint(true, kind === 'area'
      ? (keepAdding
        ? t('Added. Trace the next paved area, then Done. Or use the total when you are finished.', 'Sumado. Traza la siguiente área pavimentada y toca Listo. O usa el total cuando termines.')
        : t('Tap each corner, then Done. Keep adding the driveway and walks — one running total.', 'Toca cada esquina, luego Listo. Sigue sumando la entrada y las banquetas: un solo total.'))
      : t('Tap along the line. Tap Done when you finish.', 'Toca a lo largo de la línea. Toca Listo al terminar.'));
    renderBar();
  }

  function finishDraw() {
    if (!map) return;
    if (typeof map.pm.finishDraw === 'function') map.pm.finishDraw();
    else if (map.pm.Draw && map.pm.Draw.getActiveShape && map.pm.Draw.getActiveShape()) {
      var sh = map.pm.Draw[map.pm.Draw.getActiveShape()];
      if (sh && sh._finishShape) sh._finishShape();
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
    cancelDraw();
    if (map.pm.globalEditModeEnabled && map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
    else map.pm.enableGlobalEditMode({ snappable: true, snapDistance: 18, allowSelfIntersection: false });
    renderBar();
  }

  function setView(next) {
    view = next;
    var box = $('mapBox');
    if (box) box.classList.toggle('is-google', next === 'google');
    if (map) {
      if (next === 'naip') {
        if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
        if (!map.hasLayer(naipLayer)) naipLayer.addTo(map);
        try { naipLayer.bringToFront(); } catch (e) {}
        if (labelLayer) labelLayer.bringToFront();
        if (parcelLayer) parcelLayer.bringToFront();
      } else if (next === 'county') {
        if (map.hasLayer(naipLayer)) map.removeLayer(naipLayer);
        if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
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
      setTimeout(function () { map.invalidateSize(); }, 80);
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

  function upsertLabel(shape) {
    if (shape.label) { map.removeLayer(shape.label); shape.label = null; }
    var f = fmt(shape.kind, shape.value);
    var icon = L.divIcon({
      className: '',
      html: '<div class="m-label"><b>' + f.num + '</b><i>' + f.unit + '</i></div>',
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    shape.label = L.marker(centroid(shape.layer), { icon: icon, interactive: false, keyboard: false, zIndexOffset: 600 });
    if (labelLayer) shape.label.addTo(labelLayer);
  }

  function selectShape(shape) {
    selected = shape;
    shapes.forEach(function (s) {
      if (s.kind === 'area') s.layer.setStyle({ weight: s === shape ? 4 : 2, fillOpacity: s === shape ? 0.38 : 0.22 });
      else s.layer.setStyle({ weight: s === shape ? 5 : 3 });
    });
    renderUse();
  }

  function turfLib() {
    if (typeof turf !== 'undefined') return turf;
    return root.turf || null;
  }

  function isPavedGroup(shape) {
    return shape && shape.kind === 'area' && (!shape.use || shape.use === 'paved');
  }

  function pavedFeatures() {
    return shapes.filter(isPavedGroup).map(function (sh) {
      return sh.layer && sh.layer.toGeoJSON ? sh.layer.toGeoJSON() : null;
    }).filter(Boolean);
  }

  function pavedTotalNow() {
    var lib = (root.MeasureTotal || (typeof MeasureTotal !== 'undefined' ? MeasureTotal : null));
    if (!lib || typeof lib.pavedTotal !== 'function') {
      var sum = 0, n = 0;
      shapes.forEach(function (sh) { if (isPavedGroup(sh)) { sum += sh.value || 0; n++; } });
      return { sqFt: Math.round(sum), sumSqFt: Math.round(sum), overlapSqFt: 0, count: n };
    }
    return lib.pavedTotal(pavedFeatures(), turfLib(), SQFT_PER_M2);
  }

  function renderUse() {
    var el = $('measureUse');
    if (!el) return;
    var total = pavedTotalNow();
    var showPaved = total.count > 0;
    if (!selected && !showPaved) { el.classList.remove('show'); el.innerHTML = ''; return; }
    var html = '';
    if (showPaved) {
      var f = fmt('area', total.sqFt);
      var meta = t('Paved total', 'Total pavimentado') + ' · ' + total.count + ' ' + (total.count === 1 ? t('area', 'área') : t('areas', 'áreas'));
      if (total.overlapSqFt >= 1) meta += t(' · overlap taken out', ' · sin contar el traslape');
      html += '<div class="mu-row mu-total-row"><span class="mu-num">' + f.num + '</span><span class="mu-unit">' + f.unit + '</span></div>';
      html += '<div class="mu-meta">' + meta + '</div>';
      html += '<div class="mu-row mu-actions">';
      html += '<button type="button" id="muUndo">' + t('Undo last', 'Deshacer') + '</button>';
      html += '<button type="button" id="muClear">' + t('Clear', 'Borrar todo') + '</button>';
      if (selected) html += '<button type="button" class="mu-del" id="muDel">' + t('Delete', 'Borrar') + '</button>';
      html += '</div>';
    } else if (selected) {
      var one = fmt(selected.kind, selected.value);
      html += '<div class="mu-row"><span class="mu-num">' + one.num + '</span><span class="mu-unit">' + one.unit + '</span>';
      html += '<button type="button" class="mu-del" id="muDel">' + t('Delete', 'Borrar') + '</button></div>';
    }
    if (selected && selected.kind === 'area') {
      html += '<div class="mu-row mu-fills">'
        + '<span class="mu-lbl">' + t('Use as', 'Usar como') + '</span>'
        + '<button type="button" data-fill="parkway">' + t('Parkway', 'Parkway') + '</button>'
        + '<button type="button" data-fill="lawn">' + t('Lawn', 'Césped') + '</button>'
        + '<button type="button" data-fill="paved">' + t('Paved', 'Pavimento') + '</button>'
        + '<button type="button" data-fill="lot">' + t('Lot', 'Terreno') + '</button>'
        + '</div>';
    }
    el.innerHTML = html;
    el.classList.add('show');
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
    var v = Math.round(value);
    if (field === 'paved') {
      v = pavedTotalNow().sqFt;
      shapes.forEach(function (sh) { if (isPavedGroup(sh)) sh.use = 'paved'; });
    } else if (selected && (field === 'lawn' || field === 'parkway' || field === 'lot')) {
      selected.use = field;
    }
    if (field === 'lot') {
      var inp = $('iLt');
      if (!inp) return;
      var unit = (typeof ST !== 'undefined' && ST.lotUnit === 'ac') ? 'ac' : 'sqft';
      inp.value = unit === 'ac' ? +(v / SQFT_PER_AC).toFixed(3) : String(v);
    } else {
      var id = { parkway: 'iPk', lawn: 'iLn', paved: 'iPv' }[field];
      var el = $(id);
      if (!el) return;
      el.value = String(v);
      if ((field === 'lawn' || field === 'paved') && $('measDet')) $('measDet').open = true;
    }
    if (typeof upd === 'function') upd();
    renderUse();
    if (btn) {
      btn.classList.add('used');
      var prev = btn.textContent;
      btn.textContent = '✓ ' + prev.replace(/^✓\s*/, '');
      setTimeout(function () { btn.textContent = prev; }, 1200);
    }
  }

  function undoLast() {
    if (!shapes.length) return;
    removeShape(shapes[shapes.length - 1]);
  }

  function removeShape(shape) {
    if (!shape) return;
    try { map.removeLayer(shape.layer); } catch (e) {}
    if (shape.label) try { map.removeLayer(shape.label); } catch (e) {}
    shapes = shapes.filter(function (s) { return s !== shape; });
    if (selected === shape) selected = shapes[shapes.length - 1] || null;
    if (selected) selectShape(selected);
    else renderUse();
  }

  function registerShape(layer, opts) {
    var m = measureLayer(layer);
    if (!m.value || m.value <= 0) return null;
    layer.setStyle({
      color: '#30471F',
      weight: 3,
      fillColor: '#30471F',
      fillOpacity: m.kind === 'area' ? 0.28 : 0,
      opacity: 1
    });
    var shape = {
      id: ++seq,
      layer: layer,
      kind: m.kind,
      value: m.value,
      label: null,
      use: m.kind === 'area' ? 'paved' : null
    };
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
    });
    selectShape(shape);
    return shape;
  }

  function addAreaFromGeoJSON(gj) {
    if (!map || typeof L === 'undefined') return null;
    var layer = L.geoJSON(gj, {
      style: { color: '#30471F', weight: 3, fillColor: '#30471F', fillOpacity: 0.28, opacity: 1 }
    }).getLayers()[0];
    if (!layer) return null;
    layer.addTo(map);
    return registerShape(layer);
  }

  function onCreated(e) {
    drawing = null;
    setHint(false);
    renderBar();
    var layer = e.layer;
    var shape = registerShape(layer);
    if (!shape) {
      try { map.removeLayer(layer); } catch (err) {}
      return;
    }
    if (shape.kind === 'area') startDraw('area', true);
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
    map.on('pm:drawend', function () { /* keep hint until create or cancel */ });
    inited = true;
    renderBar();
    var done = $('measureDone'), cancel = $('measureCancel');
    if (done) done.onclick = finishDraw;
    if (cancel) cancel.onclick = cancelDraw;
  }

  function loadParcel(lat, lng) {
    if (!parcelLayer) return;
    parcelLayer.clearLayers();
    var url = gisUrl() + '?geometry=' + lng + ',' + lat
      + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
      + '&outFields=ACREAGE,PIN,PROPADDRL1&returnGeometry=true&outSR=4326&f=json';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var feats = (data && data.features) || [];
      feats.forEach(function (f) {
        var rings = (f.geometry && f.geometry.rings) || [];
        rings.forEach(function (ring) {
          var latlngs = ring.map(function (p) { return [p[1], p[0]]; });
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
    }).catch(function () {});
  }

  function clearShapes() {
    shapes.slice().forEach(function (s) { removeShape(s); });
    selected = null;
    renderUse();
  }

  function show(addr, lat, lng) {
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
      if (!map) return;
      map.setView([la, lo], 19, { animate: false });
      setTimeout(function () { map.invalidateSize(); }, 80);
      loadParcel(la, lo);
    }
    if (lat != null && lng != null) {
      go(+lat, +lng);
      return Promise.resolve();
    }
    if (typeof nomSearch !== 'function') return Promise.resolve();
    return nomSearch(lastAddr).then(function (g) {
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
    _shapes: function () { return shapes; },
    _map: function () { return map; },
    _view: function () { return view; },
    _setView: setView,
    SQFT_PER_M2: SQFT_PER_M2
  };
})(window);
