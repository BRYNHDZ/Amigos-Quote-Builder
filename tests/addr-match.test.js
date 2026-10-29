// Unit tests for addr-match.js (address parsing + "is this the same property?" decisions).
const test = require('node:test');
const assert = require('node:assert');
const A = require('../addr-match.js');

const P = (line1, town, zip, acres = 0.25, pin = line1 + town) => ({ attrs: { PIN: pin, ACREAGE: acres, PROPADDRL1: line1, PROPCITY: town + '   ', PROPZIP: zip } });

test('parses typed addresses with and without commas', () => {
  let p = A.parseAddress('9400 Forest Ave Glen Ellyn');
  assert.deepStrictEqual([p.num, p.name, p.suffix, p.town, p.zip], ['9400', 'FOREST', 'AVE', 'GLEN ELLYN', '']);
  p = A.parseAddress('0N099, Leonard st, Winfield, IL 60190');
  assert.deepStrictEqual([p.num, p.name, p.town, p.zip], ['0N99', 'LEONARD', 'WINFIELD', '60190']);
  p = A.parseAddress('9434 north grace, GE, IL 60137');
  assert.deepStrictEqual([p.dir, p.name, p.town], ['N', 'GRACE', 'GLEN ELLYN']);
  p = A.parseAddress('9302 Oxford Ln, Wheaten, IL');
  assert.strictEqual(p.town, 'WHEATON');
  p = A.parseAddress('9304 Oak St 60126');
  assert.deepStrictEqual([p.town, p.zip], [null, '60126']);
});

test('9400 Forest Ave Glen Ellyn never becomes 19400 E Forest Ave Wheaton', () => {
  const d = A.decide(A.parseAddress('9400 Forest Ave, Glen Ellyn, IL 60137'), [P('19400 E FOREST AVE', 'WHEATON', '60187')]);
  assert.strictEqual(d.action, 'manual');
});

test('house number must match exactly (94 is not 947)', () => {
  const d = A.decide(A.parseAddress('94 Dorset Pl, Glen Ellyn'), [P('947 DORSET PL', 'GLEN ELLYN', '60137')]);
  assert.strictEqual(d.action, 'manual');
});

test('same street in several towns: town decides, or we ask', () => {
  const c = [P('9304 E OAK ST', 'VILLA PARK', '60181'), P('9304 OAK ST', 'ELMHURST', '60126'), P('9304 OAK ST', 'GLEN ELLYN', '60137')];
  let d = A.decide(A.parseAddress('9304 Oak St, Glen Ellyn, IL 60137'), c);
  assert.strictEqual(d.action, 'auto'); assert.strictEqual(d.pick.town, 'GLEN ELLYN');
  d = A.decide(A.parseAddress('9304 Oak St'), c);
  assert.strictEqual(d.action, 'ask'); assert.strictEqual(d.options[0].town, 'GLEN ELLYN'); // service area first
  d = A.decide(A.parseAddress('9304 Oak St 60126'), c);
  assert.strictEqual(d.action, 'auto'); assert.strictEqual(d.pick.town, 'ELMHURST');
});

test('wrong town or wrong zip typed → ask, never silent', () => {
  const c = [P('9159 FOREST AVE', 'GLEN ELLYN', '60137')];
  assert.strictEqual(A.decide(A.parseAddress('9159 Forest Ave, Wheaton, IL 60187'), c).action, 'ask');
  assert.strictEqual(A.decide(A.parseAddress('9159 Forest Ave, Glen Ellyn, IL 60187'), c).action, 'ask');
  assert.strictEqual(A.decide(A.parseAddress('9159 Forest Ave, Glen Ellyn, IL 60137'), c).action, 'auto');
});

test('street typo → ask with the right street', () => {
  const d = A.decide(A.parseAddress('9804 Highveiw Ave, Glen Ellyn, IL 60137'), [P('9804 HIGHVIEW AVE', 'GLEN ELLYN', '60137')]);
  assert.strictEqual(d.action, 'ask'); assert.strictEqual(d.options[0].line1, '9804 HIGHVIEW AVE');
});

test('parcels without acreage are ignored; two parcels at one address need the map point', () => {
  assert.strictEqual(A.decide(A.parseAddress('1 Main St, Wheaton'), [P('1 MAIN ST', 'WHEATON', '60187', 0)]).action, 'manual');
  const two = [P('9618 PRAIRIE AVE', 'GLEN ELLYN', '60137', 0.16, 'A'), P('9618 PRAIRIE AVE', 'GLEN ELLYN', '60137', 0.11, 'B')];
  assert.strictEqual(A.decide(A.parseAddress('9618 Prairie Ave, Glen Ellyn'), two).action, 'ask');
  two[1].viaPoint = true;
  const d = A.decide(A.parseAddress('9618 Prairie Ave, Glen Ellyn'), two);
  assert.strictEqual(d.action, 'auto'); assert.strictEqual(d.pick.pin, 'B');
});

test('street names starting with STE.. are not mistaken for "Suite"; ZIP+4 and repeated zips are handled', () => {
  assert.strictEqual(A.parseAddress('97 Stephanie Lane, Glen Ellyn, IL 60137').name, 'STEPHANIE');
  let p = A.parseAddress('9568 Brighton Dr, Wheaton, IL 60189-8104');
  assert.deepStrictEqual([p.town, p.zip], ['WHEATON', '60189']);
  p = A.parseAddress('9735 Glenbard, Glen Ellyn IL 60137, IL 60137');
  assert.deepStrictEqual([p.name, p.town, p.zip], ['GLENBARD', 'GLEN ELLYN', '60137']);
  assert.strictEqual(A.parseAddress('10000 Main St 60137').num, '10000');
});

test('a tiny sliver parcel at the same address does not block the house lot', () => {
  const d = A.decide(A.parseAddress('9684 Duane St, Glen Ellyn, IL 60137'), [P('9684 DUANE ST', 'GLEN ELLYN', '60137', 0.24, 'A'), P('9684 DUANE ST', 'GLEN ELLYN', '60137', 0.004, 'B')]);
  assert.strictEqual(d.action, 'auto'); assert.strictEqual(d.pick.pin, 'A');
});
