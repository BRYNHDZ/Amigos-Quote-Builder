// addr-match.js — pure address matching for the lot-size lookup. Browser global `AddrMatch` + Node module.
// Rule of thumb: only fill the lot size by itself when ONE property matches the house number exactly, the street,
// and the town/zip that were typed. Anything less certain becomes a "Did you mean…?" question. Nothing → manual.
(function (root) {
  'use strict';

  var TOWNS = ['ADDISON','AURORA','BARTLETT','BATAVIA','BENSENVILLE','BLOOMINGDALE','BOLINGBROOK','BURR RIDGE',
    'CAROL STREAM','CLARENDON HILLS','DARIEN','DOWNERS GROVE','ELK GROVE VILLAGE','ELMHURST','GENEVA','GLEN ELLYN',
    'GLENDALE HEIGHTS','HANOVER PARK','HINSDALE','INDIAN HEAD PARK','ITASCA','LEMONT','LISLE','LOMBARD','MEDINAH',
    'NAPERVILLE','OAK BROOK','OAKBROOK TERRACE','PLAINFIELD','ROMEOVILLE','ROSELLE','SCHAUMBURG','ST CHARLES',
    'VILLA PARK','WARRENVILLE','WAYNE','WEST CHICAGO','WESTMONT','WHEATON','WILLOWBROOK','WINFIELD','WOOD DALE',
    'WOODRIDGE','YORK CENTER'];
  var TOWN_ALIAS = { 'GE': 'GLEN ELLYN', 'SAINT CHARLES': 'ST CHARLES', 'OAKBROOK': 'OAK BROOK', 'DG': 'DOWNERS GROVE' };
  // Core towns we serve (used to sort suggestions); routes.json towns are added at runtime.
  // (towns within roughly the 6-mile service radius around the Glen Ellyn base)
  var CORE_AREA = ['GLEN ELLYN','WHEATON','LOMBARD','WINFIELD','CAROL STREAM','WARRENVILLE','GLENDALE HEIGHTS',
    'DOWNERS GROVE','LISLE','WEST CHICAGO'];
  var SUF = { STREET:'ST', ST:'ST', STR:'ST', AVENUE:'AVE', AVE:'AVE', AV:'AVE', AVG:'AVE', DRIVE:'DR', DR:'DR',
    ROAD:'RD', RD:'RD', BOULEVARD:'BLVD', BLVD:'BLVD', COURT:'CT', CT:'CT', LANE:'LN', LN:'LN', PLACE:'PL', PL:'PL',
    WAY:'WAY', CIRCLE:'CIR', CIR:'CIR', TERRACE:'TER', TER:'TER', PARKWAY:'PKWY', PKWY:'PKWY', TRAIL:'TRL', TRL:'TRL',
    HIGHWAY:'HWY', HWY:'HWY' };
  var DIR = { N:'N', NORTH:'N', S:'S', SOUTH:'S', E:'E', EAST:'E', W:'W', WEST:'W' };
  var STATES = /\b(IL|ILL|ILLINOIS|IN|INDIANA|WI|TX|TEXAS|USA|US|UNITED STATES)\b/g;

  function clean(s) { return String(s || '').toUpperCase().replace(/[.'’`]/g, '').replace(/[^A-Z0-9,# ]/g, ' ').replace(/\s+/g, ' ').trim(); }

  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function close(a, b) { // typo-tolerant compare for names and towns
    if (!a || !b) return false;
    if (a === b) return true;
    var lim = Math.min(a.length, b.length) >= 8 ? 2 : (Math.min(a.length, b.length) >= 4 ? 1 : 0);
    return lev(a, b) <= lim || a.replace(/ /g, '') === b.replace(/ /g, '');
  }
  // Grid numbers like 21W565 / 0N029 → canonical "21W565" / "0N29"; plain numbers lose leading zeros.
  function normNum(n) {
    n = String(n || '').toUpperCase().replace(/\s+/g, '');
    var g = n.match(/^(\d+)([NSEW])(\d+)$/);
    if (g) return (+g[1]) + g[2] + (+g[3]);
    return /^\d+$/.test(n) ? String(+n) : n;
  }
  function resolveTown(t) {
    t = clean(t).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return { raw: '', town: null };
    if (TOWN_ALIAS[t]) return { raw: t, town: TOWN_ALIAS[t] };
    if (TOWNS.indexOf(t) > -1) return { raw: t, town: t };
    for (var i = 0; i < TOWNS.length; i++) if (close(t, TOWNS[i])) return { raw: t, town: TOWNS[i] };
    return { raw: t, town: null };
  }

  // Street line → {num, dir, name, suffix}. Works for typed text and for DuPage PROPADDRL1.
  function parseStreet(s) {
    s = clean(s).replace(/,/g, ' ').replace(/\s+(APT|UNIT|STE|SUITE)\b.*$/, '').replace(/\s*#.*$/, '').trim();
    var m = s.match(/^(\d+\s?[NSEW]\s?\d+|\d+)\b\s*(.*)$/);
    if (!m) return { num: '', dir: '', name: s, suffix: '' };
    var num = normNum(m[1]), t = m[2].split(' ').filter(Boolean), dir = '', suffix = '';
    if (t.length > 1 && DIR[t[0]]) dir = DIR[t.shift()];
    if (t.length > 1 && SUF[t[t.length - 1]]) suffix = SUF[t.pop()];
    else if (t.length > 2 && DIR[t[t.length - 1]] && SUF[t[t.length - 2]]) { t.pop(); suffix = SUF[t.pop()]; }
    var name = t.join(' ');
    return { num: num, dir: dir, name: name, suffix: suffix };
  }

  // Whole typed address → street parts + town + zip. Copes with missing commas, "IL", missing zip/town.
  function parseAddress(a) {
    var s = clean(String(a || '').replace(/\b(\d{5})-\d{4}\b/g, '$1'));
    var zip = '', zm, re = /\b(\d{5})(-\d{4})?\b/g, last = null;
    while ((zm = re.exec(s))) if (zm.index > 0) last = zm;
    if (last) {
      zip = last[1];
      var head = s.slice(0, s.indexOf(' ') + 1), tailS = s.slice(head.length); // keep the house number
      s = (head + tailS.replace(/\b\d{5}\b/g, ' ')).replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s+/g, ' ').replace(/[\s,]+$/, '').trim();
    }
    var parts = s.split(',').map(function (p) { return p.trim(); });
    // "0N029, Leonard st" — comma right after the house number
    if (parts.length > 1 && /^(\d+\s?[NSEW]\s?\d+|\d+)$/.test(parts[0])) { parts[1] = parts[0] + ' ' + parts[1]; parts.shift(); }
    var street = parts[0] || '', rest = parts.slice(1).join(' ').replace(STATES, ' ').replace(/\s+/g, ' ').trim();
    if (!rest) { // no comma: look for a known town (or close typo) at the end of the line
      var w = street.replace(STATES, ' ').replace(/\s+/g, ' ').trim().split(' '), found = null;
      for (var k = Math.min(3, w.length - 2); k >= 1 && !found; k--) {
        var tail = w.slice(w.length - k).join(' '), r = resolveTown(tail);
        if (r.town && (k > 1 || tail.length > 3 || TOWN_ALIAS[tail])) { found = r; w = w.slice(0, w.length - k); }
      }
      street = w.join(' ');
      if (found) { var p = parseStreet(street); p.town = found.town; p.rawTown = found.raw; p.zip = zip; return p; }
    }
    var out = parseStreet(street), tr = resolveTown(rest);
    out.town = tr.town; out.rawTown = tr.raw; out.zip = zip;
    return out;
  }

  // Score one DuPage parcel against what was typed. Returns null when it cannot be the same property.
  function scoreParcel(typed, attrs, serviceTowns) {
    var acres = parseFloat(attrs.ACREAGE) || 0;
    if (!(acres > 0) || !attrs.PROPADDRL1) return null;
    var p = parseStreet(attrs.PROPADDRL1);
    if (!typed.num || !typed.name || p.num !== typed.num) return null;                 // exact house number, always
    var nameExact = p.name.replace(/ /g, '') === typed.name.replace(/ /g, '');
    if (!nameExact && !close(p.name, typed.name)) return null;          // street must be the same or a small typo
    var town = String(attrs.PROPCITY || '').trim().toUpperCase(), zip = String(attrs.PROPZIP || '').slice(0, 5);
    var townTyped = !!(typed.town || typed.rawTown);
    var townOK = !townTyped ? null : (typed.town ? town === typed.town : close(town, typed.rawTown));
    var zipOK = typed.zip ? zip === typed.zip : null;
    var dirOK = !typed.dir || !p.dir || typed.dir === p.dir;
    var sufOK = !typed.suffix || !p.suffix || typed.suffix === p.suffix;
    var area = (serviceTowns || CORE_AREA).indexOf(town) > -1;
    return {
      pin: attrs.PIN, acres: acres, line1: String(attrs.PROPADDRL1).trim(), town: town, zip: zip,
      nameExact: nameExact, townOK: townOK, zipOK: zipOK, dirOK: dirOK, sufOK: sufOK, inArea: area,
      sure: nameExact && dirOK && sufOK && townOK !== false && zipOK !== false
    };
  }

  // candidates: [{attrs, viaPoint}] → {action:'auto'|'ask'|'manual', pick, options}
  function decide(typed, candidates, serviceTowns) {
    var byPin = {}, list = [];
    (candidates || []).forEach(function (c) {
      var s = scoreParcel(typed, c.attrs || {}, serviceTowns);
      if (!s) return;
      if (byPin[s.pin]) { byPin[s.pin].viaPoint = byPin[s.pin].viaPoint || !!c.viaPoint; return; }
      s.viaPoint = !!c.viaPoint; byPin[s.pin] = s; list.push(s);
    });
    if (!list.length) return { action: 'manual', options: [] };
    // Same address split into a house lot + a tiny sliver (strip of land, common area): drop the sliver.
    var biggest = {};
    list.forEach(function (s) { var k = s.line1 + '|' + s.town; biggest[k] = Math.max(biggest[k] || 0, s.acres); });
    list = list.filter(function (s) { return s.acres >= 0.15 * biggest[s.line1 + '|' + s.town]; });
    var rank = function (s) {
      return (s.sure ? 64 : 0) + (s.townOK === true ? 32 : 0) + (s.zipOK === true ? 16 : 0) + (s.inArea ? 8 : 0) +
        (s.nameExact ? 4 : 0) + (s.dirOK && s.sufOK ? 2 : 0) + (s.viaPoint ? 1 : 0);
    };
    list.sort(function (a, b) { return rank(b) - rank(a) || b.acres - a.acres; });
    var sure = list.filter(function (s) { return s.sure; });
    var places = {}; sure.forEach(function (s) { places[s.line1 + '|' + s.town] = 1; });
    var nPlaces = Object.keys(places).length;
    if (nPlaces === 1) {
      // One address. If it has several parcels (house + side lot), only go ahead when the map point landed on one.
      if (sure.length === 1) return { action: 'auto', pick: sure[0], options: list.slice(0, 3) };
      var hit = sure.filter(function (s) { return s.viaPoint; });
      if (hit.length === 1) return { action: 'auto', pick: hit[0], options: list.slice(0, 3) };
    }
    return { action: 'ask', options: list.slice(0, 3) };
  }

  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b([a-z])([a-z]*)/g, function (m, a, b) { return a.toUpperCase() + b; })
      .replace(/\b(\d+[nsew]\d+)\b/gi, function (m) { return m.toUpperCase(); })
      .replace(/\b(N|S|E|W)\b/gi, function (m) { return m.toUpperCase(); });
  }
  function full(s) { return titleCase(s.line1) + ', ' + titleCase(s.town) + ', IL' + (s.zip ? ' ' + s.zip : ''); }
  function label(s) { return titleCase(s.line1) + ', ' + titleCase(s.town) + (s.zip ? ' ' + s.zip : ''); }

  var api = { parseAddress: parseAddress, parseStreet: parseStreet, scoreParcel: scoreParcel, decide: decide,
    normNum: normNum, resolveTown: resolveTown, label: label, full: full, titleCase: titleCase, TOWNS: TOWNS, CORE_AREA: CORE_AREA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AddrMatch = api;
})(typeof self !== 'undefined' ? self : this);
