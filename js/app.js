// Pantry Inventory BD — DOM wiring + localStorage persistence.
(function () {
  'use strict';
  var L = window.PantryLogic, STR = window.PantryI18n.STR;
  var KEY = 'pantry-inventory-bd-v1';
  var LANG_KEY = 'pantry-inventory-bd-lang';

  var state = { items: [], lang: 'en', editingId: null, nextId: 1 };
  var filters = { query: '', category: 'all', status: 'all', sort: 'expiry' };

  function $(id) { return document.getElementById(id); }
  function t(key) { return STR[state.lang][key] || STR.en[key] || key; }
  function num(str) { return state.lang === 'bn' ? L.toBengaliDigits(str) : str; }
  function catName(id) {
    var c = L.CATEGORIES.filter(function (x) { return x.id === id; })[0];
    return c ? (state.lang === 'bn' ? c.bn : c.en) : id;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (Array.isArray(data.items)) {
          state.items = data.items.filter(function (it) { return L.validateItem(it).length === 0; });
          state.nextId = data.nextId || (state.items.length + 1);
        }
      }
      var lang = localStorage.getItem(LANG_KEY);
      if (lang === 'bn' || lang === 'en') state.lang = lang;
    } catch (e) { /* corrupted storage: start empty */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ items: state.items, nextId: state.nextId })); } catch (e) {}
    try { localStorage.setItem(LANG_KEY, state.lang); } catch (e) {}
  }

  function showMsg(msg, isError) {
    var el = $('msg');
    el.textContent = msg;
    el.className = 'msg' + (isError ? ' error' : '');
    el.hidden = !msg;
  }

  function fillStatic() {
    document.documentElement.lang = state.lang;
    $('appTitle').textContent = t('title');
    $('appSubtitle').textContent = t('subtitle');
    $('langBtn').textContent = t('langBtn');
    $('formTitle').textContent = t('addItem');
    $('lblName').textContent = t('name');
    $('itemName').placeholder = t('namePh');
    $('lblCategory').textContent = t('category');
    $('lblQty').textContent = t('qty');
    $('lblUnit').textContent = t('unit');
    $('lblExpiry').textContent = t('expiry');
    $('lblLowAt').textContent = t('lowAt');
    $('saveBtn').textContent = t('save');
    $('cancelEditBtn').textContent = t('cancelEdit');
    $('searchInput').placeholder = t('search');
    $('sampleBtn').textContent = t('loadSample');
    $('shoppingTitle').textContent = t('shoppingTitle');
    $('shoppingHint').textContent = t('shoppingHint');
    $('copyBtn').textContent = t('copyList');
    $('exportBtn').textContent = t('exportJson');
    $('importBtn').textContent = t('importJson');
    $('eraseTitle').textContent = t('erase');
    $('eraseHint').textContent = t('eraseHint');
    $('eraseBtn').textContent = t('eraseBtn');
    $('footerText').textContent = t('footer');
    $('sampleNote').textContent = t('sampleNote');
    $('sampleNote').hidden = !state.items.some(function (i) { return i.sample; });

    var catSel = $('filterCategory'), statusSel = $('filterStatus'), sortSel = $('filterSort');
    var keepCat = catSel.value, keepStatus = statusSel.value, keepSort = sortSel.value;
    catSel.innerHTML = '<option value="all">' + t('allCategories') + '</option>' +
      L.CATEGORIES.map(function (c) { return '<option value="' + c.id + '">' + (state.lang === 'bn' ? c.bn : c.en) + '</option>'; }).join('');
    statusSel.innerHTML = '<option value="all">' + t('allStatuses') + '</option>' +
      '<option value="low">' + t('lowOnly') + '</option>' +
      '<option value="expiring">' + t('expiringOnly') + '</option>' +
      '<option value="expired">' + t('expiredOnly') + '</option>';
    sortSel.innerHTML = '<option value="name">' + t('sortName') + '</option>' +
      '<option value="expiry">' + t('sortExpiry') + '</option>' +
      '<option value="qty">' + t('sortQty') + '</option>';
    catSel.value = keepCat || 'all'; statusSel.value = keepStatus || 'all'; sortSel.value = keepSort || 'expiry';
    if (!keepCat) catSel.value = filters.category;
    if (!keepStatus) statusSel.value = filters.status;
    if (!keepSort) sortSel.value = filters.sort;

    var fCat = $('formCategory');
    fCat.innerHTML = L.CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '">' + (state.lang === 'bn' ? c.bn : c.en) + '</option>';
    }).join('');
    var fUnit = $('formUnit');
    fUnit.innerHTML = L.UNITS.map(function (u) { return '<option value="' + u + '">' + u + '</option>'; }).join('');
    $('cancelEditBtn').hidden = !state.editingId;
  }

  function expiryBadge(it, today) {
    var st = L.expiryStatus(it, today);
    if (st === 'expired') return '<span class="badge bad">' + t('expiredBadge') + '</span>';
    if (st === 'soon') {
      var n = L.daysUntil(it.expiry, today);
      return '<span class="badge warn">' + t('soonBadge') + ' · ' + num(n + 'd') + '</span>';
    }
    if (st === 'ok') return '<span class="badge ok">' + t('okBadge') + '</span>';
    return '<span class="badge dim">' + t('noExpiry') + '</span>';
  }

  function render() {
    fillStatic();
    var today = L.todayStr();
    var s = L.summary(state.items, today);
    $('statTotal').textContent = num(s.total);
    $('statLow').textContent = num(s.low);
    $('statSoon').textContent = num(s.soon);
    $('statExpired').textContent = num(s.expired);
    $('lblTotal').textContent = t('total');
    $('lblLow').textContent = t('low');
    $('lblSoon').textContent = t('soon');
    $('lblExpired').textContent = t('expired');

    var list = L.sortItems(L.filterItems(state.items, filters, today), filters.sort, today);
    var wrap = $('itemList');
    $('emptyState').hidden = state.items.length > 0;
    $('emptyText').textContent = t('empty');
    if (!list.length && state.items.length > 0) {
      wrap.innerHTML = '<p class="nomatch">' + (state.lang === 'bn' ? 'কোনো আইটেম মেলেনি।' : 'No items match these filters.') + '</p>';
    } else {
      wrap.innerHTML = list.map(function (it) {
        var low = L.isLow(it);
        return '<article class="card" data-id="' + it.id + '">' +
          '<div class="card-top"><strong>' + escapeHtml(it.name) + '</strong>' +
          (low ? ' <span class="badge bad">' + t('lowBadge') + '</span>' : '') + '</div>' +
          '<div class="meta">' + catName(it.category) + ' · ' +
          (it.expiry ? it.expiry : t('noExpiry')) + '</div>' +
          '<div class="qtyrow"><button class="step" data-act="minus" aria-label="decrease">−</button>' +
          '<span class="qty">' + num(L.formatQty(it.qty)) + ' ' + it.unit + '</span>' +
          '<button class="step" data-act="plus" aria-label="increase">+</button>' +
          '<span class="lowat">' + t('lowAt') + ': ' + num(it.lowAt) + '</span></div>' +
          '<div class="card-badges">' + expiryBadge(it, today) + '</div>' +
          '<div class="card-actions"><button data-act="edit">' + t('edit') + '</button>' +
          '<button data-act="del" class="danger">' + t('del') + '</button></div>' +
          '</article>';
      }).join('');
    }

    var shop = L.buildShoppingList(state.items, today);
    $('shopList').innerHTML = shop.length ? shop.map(function (e) {
      return '<li>' + escapeHtml(e.name) + ' — ' + num(L.formatQty(e.buyQty)) + ' ' + e.unit +
        ' <span class="reason">(' + e.reason + ')</span></li>';
    }).join('') : '<li>' + (state.lang === 'bn' ? 'কিছু কেনার দরকার নেই।' : 'Nothing to buy.') + '</li>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function resetForm() {
    $('itemName').value = ''; $('formQty').value = ''; $('formExpiry').value = '';
    $('formLowAt').value = '1'; state.editingId = null;
  }

  function onSave(ev) {
    ev.preventDefault();
    var raw = {
      name: $('itemName').value,
      category: $('formCategory').value,
      qty: parseFloat($('formQty').value),
      unit: $('formUnit').value,
      lowAt: parseFloat($('formLowAt').value),
      expiry: $('formExpiry').value
    };
    var errs = L.validateItem(raw);
    if (errs.length) { showMsg(errs.join('; '), true); return; }
    try {
      if (state.editingId) {
        var idx = state.items.findIndex(function (i) { return i.id === state.editingId; });
        if (idx >= 0) {
          var keptSample = !!state.items[idx].sample;
          state.items[idx] = L.createItem(raw, state.editingId);
          if (keptSample) state.items[idx].sample = true;
        }
      } else {
        state.items.push(L.createItem(raw, state.nextId++));
      }
    } catch (e) { showMsg(e.message, true); return; }
    save(); resetForm(); showMsg(''); render();
  }

  function onListClick(ev) {
    var btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    var card = ev.target.closest('.card');
    if (!card) return;
    var id = +card.dataset.id;
    var it = state.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var act = btn.dataset.act;
    if (act === 'plus' || act === 'minus') {
      state.items = state.items.map(function (x) { return x.id === id ? L.changeQty(x, act === 'plus' ? 1 : -1) : x; });
    } else if (act === 'del') {
      if (!window.confirm(t('confirmDel'))) return;
      state.items = state.items.filter(function (x) { return x.id !== id; });
    } else if (act === 'edit') {
      state.editingId = id;
      $('itemName').value = it.name; $('formCategory').value = it.category;
      $('formQty').value = it.qty; $('formUnit').value = it.unit;
      $('formLowAt').value = it.lowAt; $('formExpiry').value = it.expiry || '';
      render(); $('itemName').focus(); return;
    }
    save(); render();
  }

  function loadSample() {
    var today = new Date();
    var iso = function (plusDays) {
      var d = new Date(today.getTime() + plusDays * 86400000);
      return L.todayStr(d);
    };
    var samples = [
      { name: 'Miniket rice', category: 'rice-grains', qty: 2, unit: 'kg', lowAt: 5, expiry: '' },
      { name: 'Masoor dal', category: 'dal-pulses', qty: 0.5, unit: 'kg', lowAt: 1, expiry: iso(4) },
      { name: 'Soybean oil', category: 'oil-spices', qty: 1, unit: 'litre', lowAt: 1, expiry: iso(40) },
      { name: 'Full-cream milk powder', category: 'dairy', qty: 0, unit: 'packet', lowAt: 1, expiry: iso(-3) },
      { name: 'Potato', category: 'vegetables', qty: 3, unit: 'kg', lowAt: 2, expiry: iso(10) }
    ];
    samples.forEach(function (s) {
      var it = L.createItem(s, state.nextId++);
      it.sample = true;
      state.items.push(it);
    });
    save(); render();
  }

  function onCopy() {
    var today = L.todayStr();
    var text = L.shoppingListText(L.buildShoppingList(state.items, today), state.lang);
    var done = function () { $('copyBtn').textContent = t('copied'); setTimeout(render, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); done();
  }

  function onExport() {
    var blob = new Blob([L.exportData(state.items)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'pantry-inventory-bd.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function onImportFile(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var res = L.validateImport(JSON.parse(reader.result));
        if (!res.ok) { showMsg(t('importFail').replace('{msg}', res.error), true); return; }
        state.items = res.items.map(function (it) { return L.createItem(it, state.nextId++); });
        save(); render();
        showMsg(t('importOk').replace('{n}', String(state.items.length)));
      } catch (e) { showMsg(t('importFail').replace('{msg}', 'invalid JSON'), true); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  }

  function onErase() {
    if ($('eraseInput').value !== 'DELETE') {
      showMsg(t('eraseHint'), true); return;
    }
    state.items = []; state.editingId = null;
    save(); $('eraseInput').value = ''; showMsg(t('eraseDone')); render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    $('addForm').addEventListener('submit', onSave);
    $('cancelEditBtn').addEventListener('click', function () { resetForm(); render(); });
    $('itemList').addEventListener('click', onListClick);
    $('searchInput').addEventListener('input', function (e) { filters.query = e.target.value; render(); });
    $('filterCategory').addEventListener('change', function (e) { filters.category = e.target.value; render(); });
    $('filterStatus').addEventListener('change', function (e) { filters.status = e.target.value; render(); });
    $('filterSort').addEventListener('change', function (e) { filters.sort = e.target.value; render(); });
    $('sampleBtn').addEventListener('click', loadSample);
    $('copyBtn').addEventListener('click', onCopy);
    $('exportBtn').addEventListener('click', onExport);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', onImportFile);
    $('eraseBtn').addEventListener('click', onErase);
    $('langBtn').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      save(); render();
    });
    render();
  });

  // Test hooks for the headless-Chrome smoke test.
  window.__pantry = {
    getItems: function () { return state.items; },
    getLang: function () { return state.lang; },
    addSample: loadSample,
    clearAll: function () { state.items = []; save(); render(); }
  };
})();
