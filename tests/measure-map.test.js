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
