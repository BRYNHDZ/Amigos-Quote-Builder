// share-link.js — the quote builder's inputs <-> a short query string, so a copied link reopens the builder filled in.
// Only inputs go in the link (address, measurements, dials, picked services, typed prices). Prices are never stored:
// they are figured again from the live formulas when the link opens. Typed price overrides (ST.ov) are the one exception.
// Browser global `ShareLink` + Node module.
(function (root) {
  'use strict';

  // Keys that belong to a share link. `lang`, `view` and `req` are older keys read by initUI(); they stay as they are.
  var NUM = { ln: 'lawn', pv: 'paved', mu: 'mulch', tr: 'trim', pe: 'peren', pk: 'parkway', hf: 'homeFt', hv: 'homeVal' };
  var ENUM = {
    lv: { f: 'leaf', ok: ['0', '1', '2', '3', '4', '5'], num: true },
    cx: { f: 'complex', ok: ['low', 'med', 'high'] },
    r: { f: 'rate', ok: ['80', '90', '100'], num: true },
    bf: { f: 'bedFootprint', ok: ['low', 'mod', 'high'] },
    sn: { f: 'snow', ok: null },
    td: { f: 'trimDensity', ok: ['light', 'std', 'dense'] },
    wp: { f: 'weedPressure', ok: ['none', 'light', 'mod', 'heavy'] },
    tier: { f: 'oneTier', ok: ['remote', 'driveby', 'appt'] },
    pay: { f: 'payView', ok: ['visit', 'monthly', 'annual'] }
  };
  var DEF = { leaf: null, complex: null, rate: 0, bedFootprint: null, snow: null, trimDensity: 'light', weedPressure: 'light', oneTier: 'remote', payView: 'visit' };
  var SHARE_KEYS = ['a', 'lot', 'lu', 's', 'o', 'vis', 'cl', 'sm', 'vr', 'buf', 'mo'].concat(Object.keys(NUM), Object.keys(ENUM));
  var ID = /^[A-Z]{1,2}\d{1,2}$/;

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return String(Math.round(n * 100000) / 100000); }
  // Like encodeURIComponent, but keeps , : and spaces (as +) readable so the link stays short.
  function enc(v) { return encodeURIComponent(v).replace(/%2C/gi, ',').replace(/%3A/gi, ':').replace(/%20/g, '+'); }

  // st: the builder's ST. ui: {view, focus:Set|Array, prev, lang?}. addr: the address box text.
  function encode(st, ui, addr) {
    ui = ui || {};
    var p = [];
    var add = function (k, v) { p.push(k + '=' + enc(v)); };
    if (ui.lang) add('lang', ui.lang);
    var focus = Array.from(ui.focus || []);
    // On the request picker, keep the screen they came from so the link never opens on an empty picker.
    var view = ui.view === 'pick' ? (ui.prev === 'all' ? 'all' : (focus.length ? 'focus' : null)) : ui.view;
    if (view === 'all') add('view', 'all');
    if (view === 'focus') { add('view', 'focus'); if (focus.length) add('req', focus.join(',')); }
    var a = String(addr || '').trim();
    if (a) add('a', a);
    if (st.lot > 0) {
      if (st.lotUnit === 'ac') {
        // shortest acres number that gives back the same sq ft (0.237 stays 0.237, not 0.23701)
        var ac = st.lot / 43560, d = 1, s;
        for (; d <= 6; d++) { s = Number(ac.toFixed(d)); if (Math.round(s * 43560) === st.lot) break; }
        add('lot', fmt(s)); add('lu', 'ac');
      }
      else add('lot', fmt(st.lot));
    }
    for (var k in NUM) if (st[NUM[k]] > 0) add(k, fmt(st[NUM[k]]));
    for (var e in ENUM) { var fd = ENUM[e].f, v = st[fd]; if (v != null && v !== DEF[fd] && v !== '') add(e, v); }
    if (st.payPicked && st.payView === 'visit') add('pay', 'visit'); // picked on purpose (step 3 shows done)
    if (st.cornerLot) add('cl', '1');
    if (st.bufferOn) add('buf', '1');
    if (st.mulchOverride) add('mo', '1');
    if (st.planStartMonth && st.planStartMonth !== 3) add('sm', st.planStartMonth);
    if (st.visitsRemain > 0) add('vr', st.visitsRemain);
    var lv = st.leafVisits || {}, vl = [];
    for (var id in lv) if (ID.test(id) && lv[id] > 1) vl.push(id + ':' + Math.min(4, lv[id]));
    if (vl.length) add('vis', vl.join(','));
    var ov = st.ov || {}, ol = [];
    for (var oid in ov) if (ID.test(oid) && isFinite(ov[oid])) ol.push(oid + ':' + fmt(ov[oid]));
    if (ol.length) add('o', ol.join(','));
    var sel = Array.from(st.sel || []);
    var isDefSel = sel.length === 1 && sel[0] === 'A1';
    var hasState = p.some(function (x) { return !/^(lang|view|req)=/.test(x); });
    if (!isDefSel || hasState) add('s', sel.join(','));
    return p.join('&');
  }

  // True when the query string carries a saved quote (not just lang/view/req).
  function hasShare(q) { return SHARE_KEYS.some(function (k) { return q.has(k); }); }

  // Restores the encoded inputs onto st (mutates it). q: URLSearchParams. validId(id) optionally filters service ids.
  // Returns {addr, lotField} so the page can fill the address box and the lot box.
  function apply(st, q, validId) {
    var okId = function (id) { return ID.test(id) && (!validId || validId(id)); };
    var out = { addr: '', lotField: '' };
    if (!hasShare(q)) return out;
    out.addr = (q.get('a') || '').trim();
    st.lotUnit = q.get('lu') === 'ac' ? 'ac' : 'sqft';
    var lt = num(q.get('lot'));
    if (lt > 0) { st.lot = st.lotUnit === 'ac' ? Math.round(lt * 43560) : Math.round(lt); out.lotField = fmt(lt); }
    for (var k in NUM) if (q.has(k)) st[NUM[k]] = Math.max(0, num(q.get(k)));
    for (var e in ENUM) if (q.has(e)) {
      var v = q.get(e), d = ENUM[e];
      if (d.ok && d.ok.indexOf(v) < 0) continue;
      st[d.f] = d.num ? Number(v) : v;
    }
    if (q.has('pay')) st.payPicked = true;
    st.cornerLot = q.get('cl') === '1';
    st.bufferOn = q.get('buf') === '1';
    st.mulchOverride = q.get('mo') === '1';
    var sm = parseInt(q.get('sm'), 10);
    if (sm >= 1 && sm <= 12) st.planStartMonth = sm;
    var vr = parseInt(q.get('vr'), 10);
    if (vr > 0) st.visitsRemain = Math.min(35, vr);
    st.leafVisits = {};
    (q.get('vis') || '').split(',').forEach(function (x) {
      var m = x.split(':'); var n = parseInt(m[1], 10);
      if (okId(m[0]) && n > 1) st.leafVisits[m[0]] = Math.min(4, n);
    });
    st.ov = {};
    (q.get('o') || '').split(',').forEach(function (x) {
      var m = x.split(':'); var n = parseFloat(m[1]);
      if (okId(m[0]) && m.length === 2 && m[1] !== '' && isFinite(n)) st.ov[m[0]] = n;
    });
    if (q.has('s')) {
      st.sel = new Set();
      (q.get('s') || '').split(',').forEach(function (id) { if (okId(id)) st.sel.add(id); });
    }
    return out;
  }

  var api = { encode: encode, apply: apply, hasShare: hasShare, SHARE_KEYS: SHARE_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShareLink = api;
})(typeof self !== 'undefined' ? self : this);
