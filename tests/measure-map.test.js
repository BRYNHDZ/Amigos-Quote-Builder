// Measure map fixes: header count, stale center, Done, Undo last, full-size map.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'measure-tool.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'measure-tool.css'), 'utf8');

test('Measurements count is a separate span, not wiped by translations', () => {
  assert.match(html, /<summary><span data-i18n="l.meas">Measurements<\/span><span id="measCount"><\/span><\/summary>/);
  assert.match(html, /cnt\.textContent=measured\?\(' · '\+measured\+' '\+tx\('measured','medidas'\)\):''/);
  assert.doesNotMatch(html, /sum\.textContent\s*=\s*label/);
  assert.match(html, /has-measured>summary\{display:list-item\}/);
});

test('translation pass leaves the measured count in place', () => {
  const meas = { dataset: { i18n: 'l.meas' }, textContent: 'Measurements' };
  const count = { textContent: ' · 2 measured' };
  const t = (k) => (k === 'l.meas' ? 'Measurements' : k);
  [meas].forEach((el) => {
    const v = t(el.dataset.i18n);
    if (el.textContent !== v) el.textContent = v;
  });
  assert.strictEqual(meas.textContent, 'Measurements');
  assert.strictEqual(count.textContent, ' · 2 measured');
});

test('a later explicit map center wins over a stale address search', async () => {
  let showGen = 0;
  const applied = [];
  function show(hasCoords) {
    const gen = ++showGen;
    function go(label) {
      if (gen !== showGen) return;
      applied.push(label);
    }
    if (hasCoords) {
      go('parcel');
      return;
    }
    return Promise.resolve().then(() => {
      if (gen !== showGen) return;
      go('nominatim');
    });
  }
  const first = show(false);
  show(true);
  await first;
  assert.deepStrictEqual(applied, ['parcel']);
  assert.match(js, /var gen = \+\+showGen/);
  assert.match(js, /if \(gen !== showGen\) return/);
});

test('Done finishes a complete shape then always leaves drawing mode', () => {
  assert.match(js, /leavingDraw = true/);
  assert.match(js, /if \(shape\.kind === 'area' && restart\) startDraw\('area', true\)/);
  assert.match(js, /function finishDraw\(\) \{[\s\S]*cancelDraw\(\);/);
});

test('Undo last removes the last point and keeps drawing', () => {
  assert.match(js, /function undoLast\(\) \{\s*if \(removeLastDrawVertex\(\)\)/);
  assert.match(js, /_removeLastVertex/);
  assert.match(js, /if \(keep\) startDraw\(keepKind, true\)/);
});

test('Measure area opens a full-size map with an obvious Close map button', () => {
  assert.match(js, /if \(!mapFull\) enterMapFull\(\)/);
  assert.match(js, /t\('Close map', 'Cerrar mapa'\)/);
  assert.match(css, /#mapBox\.is-full\{/);
  assert.match(css, /body\.map-full\{overflow:hidden\}/);
  assert.match(css, /#mapBox\.is-full #mBtnClose/);
  // tools dock to the right on the large map, not the lower left
  assert.match(css, /#mapBox\.is-full \.measure-use\{\s*left:auto;right:12px/);
});

test('a crossing click shows a message and is still blocked for area math', () => {
  assert.match(js, /map\.on\('pm:intersect', onIntersect\)/);
  assert.match(js, /That line crosses itself\. Move the point so the lines do not cross\./);
  assert.match(js, /allowSelfIntersection: false/);
  assert.doesNotMatch(js, /allowSelfIntersection: true/);
});

test('public sidewalks are not clipped to the parcel outline', () => {
  assert.match(js, /interactive: false/);
  assert.doesNotMatch(js, /esriSpatialRelContains/);
});

test('new tool labels have no em dashes', () => {
  const labels = [
    'Close map',
    'Cerrar mapa',
    'That line crosses itself. Move the point so the lines do not cross.',
    'Esa línea se cruza. Mueve el punto para que las líneas no se cruzan.'.replace('cruzan', 'crucen.')
  ];
  // check the actual source strings
  assert.match(js, /That line crosses itself\. Move the point so the lines do not cross\./);
  assert.match(js, /Esa línea se cruza\. Mueve el punto para que las líneas no se crucen\./);
  assert.doesNotMatch(js, /Close map[^\n]*—/);
  assert.doesNotMatch(js, /That line[^\n]*—/);
});

test('taps near the first corner are not swallowed by an 18 px snap', () => {
  assert.doesNotMatch(js, /snapDistance:\s*18/);
  const m = js.match(/var SNAP_PX = (\d+);/);
  assert.ok(m && +m[1] <= 10, 'snap distance should be small');
  assert.match(js, /snapDistance: SNAP_PX/);
});

test('a tap on a finished shape while tracing reaches the map and adds a corner', () => {
  assert.match(js, /layer\.on\('click', function \(ev\) \{\s*\/\/[^\n]*\n\s*if \(drawing\) return;\s*if \(ev && ev\.originalEvent\) L\.DomEvent\.stop\(ev\);/);
  assert.match(css, /#mapBox\.is-drawing #leafletMap path\.m-shape\{pointer-events:none\}/);
});

test('small hand or mouse wiggles still count as a tap, and double tap does not zoom mid-trace', () => {
  assert.match(js, /_draggable\.options\.clickTolerance = CLICK_SLOP_PX/);
  const m = js.match(/var CLICK_SLOP_PX = (\d+);/);
  assert.ok(m && +m[1] >= 8);
  assert.match(js, /if \(on\) map\.doubleClickZoom\.disable\(\);\s*else map\.doubleClickZoom\.enable\(\);/);
});

test('labels and the address chip are never snap targets', () => {
  assert.match(js, /shape\.label = L\.marker\(at, \{[^}]*snapIgnore: true/);
  assert.match(js, /propMarker = L\.marker\(at, \{[\s\S]*?snapIgnore: true/);
});

test('the property being quoted is outlined and labeled, and nothing outside it is dimmed', () => {
  // Bryan measures the city parkway too, so the area outside the lot must stay clear.
  assert.doesNotMatch(js, /m-prop-mask/);
  assert.doesNotMatch(js, /fillOpacity: 0\.55/);
  assert.match(js, /color: '#fff', weight: 3, opacity: 1, fill: false/);
  const src = js.match(/function streetOnly\(a\) \{[\s\S]*?\n  \}/)[0];
  const streetOnly = new Function(src + '; return streetOnly;')();
  assert.strictEqual(streetOnly('855 Ellynwood Dr, Glen Ellyn, IL 60137'), '855 Ellynwood Dr');
  assert.strictEqual(streetOnly(''), '');
  assert.match(js, /replace\(\/\[&<>"\]\/g/);
});

test('the shape being drawn is a different color from finished shapes', () => {
  const m = js.match(/var DRAW_COLOR = '(#[0-9a-f]{6})';/);
  assert.ok(m);
  const uses = js.match(/USE_STYLE = \{[\s\S]*?\};/)[0];
  assert.ok(!uses.includes(m[1]));
  assert.match(js, /templineStyle: \{ color: DRAW_COLOR/);
});

test('Open in Google Earth points at the current address and its map point', () => {
  const src = js.match(/function earthUrl\(addr, pt\) \{[\s\S]*?\n  \}/)[0];
  const earthUrl = new Function(src + '; return earthUrl;')();
  assert.strictEqual(earthUrl('22W389 Glen Valley Dr, Glen Ellyn, IL', { lat: 41.840071, lng: -88.062781 }),
    'https://earth.google.com/web/search/22W389%20Glen%20Valley%20Dr%2C%20Glen%20Ellyn%2C%20IL/@41.840071,-88.062781,230a,300d,35y,0h,0t,0r');
  assert.strictEqual(earthUrl('855 Ellynwood Dr', null), 'https://earth.google.com/web/search/855%20Ellynwood%20Dr');
  assert.strictEqual(earthUrl('', null), '');
  assert.match(js, />' \+ t\('Open in Google Earth', 'Abrir en Google Earth'\) \+ '<\/a>'/);
  // New address clears the old map point so the link can't point at the last property.
  assert.match(js, /lastCenter = null;\s*propPoint = null;/);
});

test('a new address always moves the map: old answers are ignored and the parcel wins', () => {
  assert.match(html, /function lookupAddr\(\)\{\s*const a=getAddr\(\);if\(!a\)return;\s*ADDR_SEQ\+\+;[\s\S]*?ST\.fitGeo=null;/);
  assert.match(html, /async function geocodeForFit\(a,parcel\)\{\s*const seq=ADDR_SEQ;[\s\S]*?if\(seq!==ADDR_SEQ\)return;/);
  assert.match(html, /async function lookupLot\(a\)\{\s*const seq=ADDR_SEQ;/);
  assert.match(html, /if\(seq!==ADDR_SEQ\)return; \/\/ a newer address/);
  assert.match(html, /centerMapOnParcel\(s\);/);
  assert.match(js, /if \(nextAddr && lastAddr && nextAddr !== lastAddr\) \{\s*\/\/[^\n]*\n\s*clearShapes\(\);\s*if \(parcelLayer\) parcelLayer\.clearLayers\(\);/);
});

test('stale lookup guard: only the newest address moves the map', async () => {
  let ADDR_SEQ = 0; const moved = [];
  async function geocodeForFit(a, delay) {
    const seq = ADDR_SEQ;
    await new Promise((r) => setTimeout(r, delay));
    if (seq !== ADDR_SEQ) return;
    moved.push(a);
  }
  ADDR_SEQ++; const pA = geocodeForFit('A', 30);
  ADDR_SEQ++; const pB = geocodeForFit('B', 5);
  await Promise.all([pA, pB]);
  assert.deepStrictEqual(moved, ['B']);
});

test('full map zoom leaves margin around the lot for the parkway and street', () => {
  assert.match(js, /map\.fitBounds\(withMargin\(lastParcelBounds, MARGIN_M\)/);
  const m = js.match(/var MARGIN_M = (\d+);/);
  assert.ok(m && +m[1] >= 12);
});

test('sharpening touches only the photo tiles and stays light', () => {
  assert.match(css, /#leafletMap \.leaflet-tile-pane\{filter:contrast\(1\.1\) saturate\(1\.06\)\}/);
  assert.doesNotMatch(css, /leaflet-(overlay|marker|shadow|tooltip)-pane\{filter/);
  // Phones get contrast only; the sharpen filter is desktop-only for speed.
  assert.match(css, /@media \(hover:hover\) and \(pointer:fine\) and \(min-width:900px\)\{\s*#leafletMap \.leaflet-tile-pane\{filter:url\(#mSharpen\)/);
  assert.match(js, /kernelMatrix="0 -0\.15 0 -0\.15 1\.6 -0\.15 0 -0\.15 0"/);
});

test('lot-size miss does not hide a map that already found the property', () => {
  assert.match(html, /keepFoundResult\(mapVisible,ST\.fitGeo\)/);
  assert.match(html, /if\(failed&&!keep\)\{/);
  assert.match(html, /AddrMatch\.completeAddress\(typed,rows\)/);
  assert.match(js, /GeoFallback\.fromNominatim\(g, typed\)/);
});
