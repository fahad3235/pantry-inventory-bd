// Node unit tests for Pantry Inventory BD logic. Run: node --test tests/logic.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../js/logic.js');

const TODAY = '2026-10-27';
const rice = { id: 1, name: 'Miniket rice', category: 'rice-grains', qty: 2, unit: 'kg', lowAt: 5, expiry: '' };
const dal = { id: 2, name: 'Masoor dal', category: 'dal-pulses', qty: 0.5, unit: 'kg', lowAt: 1, expiry: '2026-10-31' };
const oil = { id: 3, name: 'Soybean oil', category: 'oil-spices', qty: 1, unit: 'litre', lowAt: 1, expiry: '2026-12-06' };
const milk = { id: 4, name: 'Milk powder', category: 'dairy', qty: 0, unit: 'packet', lowAt: 1, expiry: '2026-10-24' };

test('daysUntil: past, today, future, invalid', () => {
  assert.strictEqual(L.daysUntil('2026-10-26', TODAY), -1);
  assert.strictEqual(L.daysUntil('2026-10-27', TODAY), 0);
  assert.strictEqual(L.daysUntil('2026-11-03', TODAY), 7);
  assert.strictEqual(L.daysUntil('2026-02-30', TODAY), null);
  assert.strictEqual(L.daysUntil('not-a-date', TODAY), null);
});

test('expiryStatus boundaries: expired / soon (0..7d) / ok / none', () => {
  assert.strictEqual(L.expiryStatus(milk, TODAY), 'expired');
  assert.strictEqual(L.expiryStatus(dal, TODAY), 'soon'); // 4 days
  assert.strictEqual(L.expiryStatus({ expiry: '2026-11-03' }, TODAY), 'soon'); // exactly 7
  assert.strictEqual(L.expiryStatus({ expiry: '2026-11-04' }, TODAY), 'ok'); // 8 days
  assert.strictEqual(L.expiryStatus(oil, TODAY), 'ok');
  assert.strictEqual(L.expiryStatus(rice, TODAY), 'none');
  assert.strictEqual(L.expiryStatus({ expiry: '2026-02-30' }, TODAY), 'none');
});

test('isLow: at threshold counts as low', () => {
  assert.strictEqual(L.isLow(rice), true); // 2 <= 5
  assert.strictEqual(L.isLow(oil), true); // 1 <= 1
  assert.strictEqual(L.isLow({ qty: 3, lowAt: 2 }), false);
});

test('validateItem rejects bad input, accepts good input', () => {
  assert.deepStrictEqual(L.validateItem(rice), []);
  assert.ok(L.validateItem({ ...rice, name: '   ' }).includes('name required'));
  assert.ok(L.validateItem({ ...rice, name: 'x'.repeat(61) }).includes('name too long (max 60)'));
  assert.ok(L.validateItem({ ...rice, category: 'nope' }).includes('unknown category'));
  assert.deepStrictEqual(L.validateItem({ ...rice, qty: 0 }), []); // 0 = out of stock, still a valid item
  assert.ok(L.validateItem({ ...rice, qty: -1 }).includes('qty must be 0 or more'));
  assert.ok(L.validateItem({ ...rice, unit: 'bag' }).includes('unknown unit'));
  assert.ok(L.validateItem({ ...rice, lowAt: -1 }).includes('lowAt must be 0 or more'));
  assert.ok(L.validateItem({ ...rice, expiry: '27-10-2026' }).includes('expiry must be YYYY-MM-DD'));
  assert.ok(L.validateItem({ ...rice, expiry: '2026-13-01' }).includes('expiry must be YYYY-MM-DD'));
});

test('createItem trims name, keeps expiry empty string, throws on invalid', () => {
  const it = L.createItem({ ...rice, name: '  Rice  ' }, 9);
  assert.strictEqual(it.name, 'Rice');
  assert.strictEqual(it.id, 9);
  assert.throws(() => L.createItem({ ...rice, qty: -1 }, 10), /Invalid item/);
});

test('changeQty steps and never goes below 0', () => {
  assert.strictEqual(L.changeQty(rice, 1).qty, 3);
  assert.strictEqual(L.changeQty(rice, -1).qty, 1);
  assert.strictEqual(L.changeQty(milk, -1).qty, 0);
  assert.strictEqual(L.changeQty({ qty: 0.5 }, -1).qty, 0);
});

test('filterItems: query, category, status filters combine', () => {
  const items = [rice, dal, oil, milk];
  assert.strictEqual(L.filterItems(items, { query: 'dal' }, TODAY).length, 1);
  assert.strictEqual(L.filterItems(items, { category: 'dairy' }, TODAY).length, 1);
  assert.strictEqual(L.filterItems(items, { status: 'low' }, TODAY).length, 4);
  assert.strictEqual(L.filterItems(items, { status: 'expiring' }, TODAY).length, 1);
  assert.strictEqual(L.filterItems(items, { status: 'expired' }, TODAY).length, 1);
  assert.strictEqual(L.filterItems(items, { query: 'oil', status: 'low' }, TODAY).length, 1);
  assert.strictEqual(L.filterItems(items, { query: 'zzz' }, TODAY).length, 0);
});

test('sortItems: expiry puts dated items first, undated last', () => {
  const sorted = L.sortItems([rice, oil, milk, dal], 'expiry', TODAY).map((i) => i.name);
  assert.deepStrictEqual(sorted, ['Milk powder', 'Masoor dal', 'Soybean oil', 'Miniket rice']);
  assert.deepStrictEqual(L.sortItems([oil, rice], 'name', TODAY).map((i) => i.name), ['Miniket rice', 'Soybean oil']);
});

test('summary counts low / soon / expired', () => {
  assert.deepStrictEqual(L.summary([rice, dal, oil, milk], TODAY), { total: 4, low: 4, soon: 1, expired: 1 });
  assert.deepStrictEqual(L.summary([], TODAY), { total: 0, low: 0, soon: 0, expired: 0 });
});

test('buildShoppingList: low tops up above threshold, expired/soon buy 1', () => {
  const list = L.buildShoppingList([rice, dal, oil, milk], TODAY);
  const byName = Object.fromEntries(list.map((e) => [e.name, e]));
  assert.strictEqual(byName['Miniket rice'].buyQty, 4); // 5 - 2 + 1
  assert.strictEqual(byName['Miniket rice'].reason, 'low');
  assert.strictEqual(byName['Masoor dal'].buyQty, 1.5); // low: 1 - 0.5 + 1
  assert.strictEqual(byName['Milk powder'].buyQty, 2); // low: 1 - 0 + 1
  assert.strictEqual(byName['Soybean oil'].buyQty, 1); // low at threshold: 1 - 1 + 1
});

test('buildShoppingList excludes healthy items', () => {
  const healthy = { id: 5, name: 'Salt', category: 'oil-spices', qty: 5, unit: 'kg', lowAt: 1, expiry: '2027-06-01' };
  assert.deepStrictEqual(L.buildShoppingList([healthy], TODAY), []);
});

test('shoppingListText: header, lines, empty case', () => {
  const text = L.shoppingListText([{ name: 'Rice', buyQty: 2, unit: 'kg', reason: 'low' }], 'en');
  assert.ok(text.startsWith('Shopping list'));
  assert.ok(text.includes('- Rice — 2 kg (low)'));
  assert.ok(L.shoppingListText([], 'en').includes('Nothing to buy.'));
  assert.ok(L.shoppingListText([], 'bn').includes('কিছু কেনার দরকার নেই।'));
});

test('toBengaliDigits converts every digit', () => {
  assert.strictEqual(L.toBengaliDigits('0123456789'), '০১২৩৪৫৬৭৮৯');
  assert.strictEqual(L.toBengaliDigits('Qty 12 kg'), 'Qty ১২ kg');
});

test('formatQty trims float noise', () => {
  assert.strictEqual(L.formatQty(2), '2');
  assert.strictEqual(L.formatQty(1.5), '1.5');
  assert.strictEqual(L.formatQty(0.30000000000000004), '0.3');
});

test('validateImport: strict whole-file rejection', () => {
  assert.strictEqual(L.validateImport({ app: 'pantry-inventory-bd', version: 1, items: [rice] }).ok, true);
  assert.strictEqual(L.validateImport({ app: 'other-app', version: 1, items: [] }).ok, false);
  assert.strictEqual(L.validateImport({ app: 'pantry-inventory-bd', version: 2, items: [] }).ok, false);
  assert.strictEqual(L.validateImport({ app: 'pantry-inventory-bd', version: 1, items: 'nope' }).ok, false);
  assert.strictEqual(L.validateImport({ app: 'pantry-inventory-bd', version: 1, items: [rice, { ...rice, qty: -1 }] }).ok, false);
  assert.strictEqual(L.validateImport(null).ok, false);
  assert.strictEqual(L.validateImport('{"app":1}').ok, false);
});

test('exportData round-trips through validateImport', () => {
  const parsed = JSON.parse(L.exportData([rice, dal]));
  assert.strictEqual(parsed.app, 'pantry-inventory-bd');
  assert.strictEqual(parsed.version, 1);
  assert.strictEqual(L.validateImport(parsed).ok, true);
});
