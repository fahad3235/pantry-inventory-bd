// Pantry Inventory BD — pure logic (no DOM). Shared by the app and node tests.
// All dates are plain YYYY-MM-DD calendar dates, compared in UTC so results
// never depend on the viewer's timezone.
(function (root) {
  'use strict';

  var APP_ID = 'pantry-inventory-bd';
  var EXPORT_VERSION = 1;
  var SOON_DAYS = 7;

  var CATEGORIES = [
    { id: 'rice-grains', en: 'Rice & Grains', bn: 'চাল ও শস্য' },
    { id: 'dal-pulses', en: 'Dal & Pulses', bn: 'ডাল' },
    { id: 'oil-spices', en: 'Oil & Spices', bn: 'তেল ও মসলা' },
    { id: 'vegetables', en: 'Vegetables', bn: 'সবজি' },
    { id: 'dairy', en: 'Dairy', bn: 'দুগ্ধজাত' },
    { id: 'snacks', en: 'Snacks', bn: 'নাস্তা' },
    { id: 'cleaning', en: 'Cleaning', bn: 'পরিষ্কার' },
    { id: 'other', en: 'Other', bn: 'অন্যান্য' }
  ];

  var UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'packet'];

  function parseDate(str) {
    if (typeof str !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, mo - 1, d);
    var dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return t;
  }

  function todayStr(d) {
    d = d || new Date();
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  // Whole days from today to expiry: negative = already expired.
  function daysUntil(expiry, today) {
    var e = parseDate(expiry), t = parseDate(today);
    if (e === null || t === null) return null;
    return Math.round((e - t) / 86400000);
  }

  // 'expired' | 'soon' (within SOON_DAYS, today included) | 'ok' | 'none'
  function expiryStatus(item, today) {
    if (!item.expiry) return 'none';
    var n = daysUntil(item.expiry, today);
    if (n === null) return 'none';
    if (n < 0) return 'expired';
    if (n <= SOON_DAYS) return 'soon';
    return 'ok';
  }

  function isLow(item) {
    return item.qty <= item.lowAt;
  }

  function categoryIds() { return CATEGORIES.map(function (c) { return c.id; }); }

  function validateItem(raw) {
    var errors = [];
    if (!raw || typeof raw !== 'object') return ['Item must be an object'];
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) errors.push('name required');
    else if (raw.name.trim().length > 60) errors.push('name too long (max 60)');
    if (categoryIds().indexOf(raw.category) === -1) errors.push('unknown category');
    if (typeof raw.qty !== 'number' || !isFinite(raw.qty) || raw.qty < 0) errors.push('qty must be 0 or more');
    if (UNITS.indexOf(raw.unit) === -1) errors.push('unknown unit');
    if (typeof raw.lowAt !== 'number' || !isFinite(raw.lowAt) || raw.lowAt < 0) errors.push('lowAt must be 0 or more');
    if (raw.expiry !== '' && raw.expiry !== null && raw.expiry !== undefined && parseDate(raw.expiry) === null) errors.push('expiry must be YYYY-MM-DD');
    return errors;
  }

  function createItem(raw, id) {
    var errors = validateItem(raw);
    if (errors.length) { var e = new Error('Invalid item: ' + errors.join('; ')); e.errors = errors; throw e; }
    return {
      id: id, name: raw.name.trim(), category: raw.category,
      qty: raw.qty, unit: raw.unit, lowAt: raw.lowAt,
      expiry: raw.expiry ? raw.expiry : ''
    };
  }

  function changeQty(item, delta) {
    var next = Math.round((item.qty + delta) * 100) / 100;
    if (next < 0) next = 0;
    return Object.assign({}, item, { qty: next });
  }

  function filterItems(items, opts, today) {
    var q = (opts.query || '').trim().toLowerCase();
    return items.filter(function (it) {
      if (opts.category && opts.category !== 'all' && it.category !== opts.category) return false;
      if (q && it.name.toLowerCase().indexOf(q) === -1) return false;
      if (opts.status && opts.status !== 'all') {
        var st = expiryStatus(it, today);
        if (opts.status === 'low' && !isLow(it)) return false;
        if (opts.status === 'expiring' && st !== 'soon') return false;
        if (opts.status === 'expired' && st !== 'expired') return false;
      }
      return true;
    });
  }

  function sortItems(items, key, today) {
    var copy = items.slice();
    if (key === 'name') copy.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (key === 'qty') copy.sort(function (a, b) { return a.qty - b.qty; });
    else if (key === 'expiry') {
      copy.sort(function (a, b) {
        var da = a.expiry ? daysUntil(a.expiry, today) : Infinity;
        var db = b.expiry ? daysUntil(b.expiry, today) : Infinity;
        return da - db;
      });
    }
    return copy;
  }

  function summary(items, today) {
    var s = { total: items.length, low: 0, soon: 0, expired: 0 };
    items.forEach(function (it) {
      if (isLow(it)) s.low++;
      var st = expiryStatus(it, today);
      if (st === 'soon') s.soon++;
      if (st === 'expired') s.expired++;
    });
    return s;
  }

  // Shopping list: every low item, plus every expired/soon item (even when
  // not low, because it must be replaced). Suggested quantity tops a low
  // item back up above its threshold; otherwise 1 unit as a replacement.
  function buildShoppingList(items, today) {
    var out = [];
    items.forEach(function (it) {
      var st = expiryStatus(it, today);
      var need = isLow(it) || st === 'expired' || st === 'soon';
      if (!need) return;
      var buyQty = isLow(it) ? Math.max(it.lowAt - it.qty + 1, 1) : 1;
      out.push({
        id: it.id, name: it.name, unit: it.unit, buyQty: buyQty,
        reason: st === 'expired' ? 'expired' : st === 'soon' ? 'expiring' : 'low'
      });
    });
    return out;
  }

  function shoppingListText(list, lang) {
    var lines = [];
    lines.push(lang === 'bn' ? 'বাজারের তালিকা' : 'Shopping list');
    list.forEach(function (e) {
      lines.push('- ' + e.name + ' — ' + formatQty(e.buyQty) + ' ' + e.unit +
        ' (' + e.reason + ')');
    });
    if (!list.length) lines.push(lang === 'bn' ? 'কিছু কেনার দরকার নেই।' : 'Nothing to buy.');
    return lines.join('\n');
  }

  function formatQty(q) {
    var s = String(Math.round(q * 100) / 100);
    return s;
  }

  var BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  function toBengaliDigits(str) {
    return String(str).replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
  }

  function exportData(items) {
    return JSON.stringify({ app: APP_ID, version: EXPORT_VERSION, items: items }, null, 2);
  }

  // Strict import: wrong app, wrong version, non-array, or ANY invalid item
  // rejects the whole file — nothing is half-imported.
  function validateImport(data) {
    if (!data || typeof data !== 'object') return { ok: false, error: 'not an object' };
    if (data.app !== APP_ID) return { ok: false, error: 'wrong app' };
    if (data.version !== EXPORT_VERSION) return { ok: false, error: 'unsupported version' };
    if (!Array.isArray(data.items)) return { ok: false, error: 'items must be an array' };
    for (var i = 0; i < data.items.length; i++) {
      var errs = validateItem(data.items[i]);
      if (errs.length) return { ok: false, error: 'item ' + (i + 1) + ': ' + errs.join('; ') };
    }
    return { ok: true, items: data.items };
  }

  var api = {
    APP_ID: APP_ID, EXPORT_VERSION: EXPORT_VERSION, SOON_DAYS: SOON_DAYS,
    CATEGORIES: CATEGORIES, UNITS: UNITS,
    parseDate: parseDate, todayStr: todayStr, daysUntil: daysUntil,
    expiryStatus: expiryStatus, isLow: isLow, validateItem: validateItem,
    createItem: createItem, changeQty: changeQty, filterItems: filterItems,
    sortItems: sortItems, summary: summary, buildShoppingList: buildShoppingList,
    shoppingListText: shoppingListText, formatQty: formatQty,
    toBengaliDigits: toBengaliDigits, exportData: exportData,
    validateImport: validateImport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PantryLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
