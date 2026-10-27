# Pantry Inventory BD — Test Results (2026-10-27)

## Unit tests — 16/16 pass

`node --test tests/logic.test.js`

- `daysUntil`: past (−1), today (0), +7 days, invalid dates (Feb 30,
  free text) return null.
- `expiryStatus` boundaries: expired yesterday, soon at 0–7 days
  (exactly 7 = soon, 8 = ok), ok, none (no expiry / invalid date).
- `isLow`: at-threshold counts as low (qty == lowAt).
- `validateItem`: rejects blank name, >60 chars, unknown category,
  negative qty, unknown unit, negative lowAt, non-YYYY-MM-DD expiry;
  accepts qty 0 (out of stock is a real pantry state).
- `createItem`: trims names, throws on invalid input.
- `changeQty`: steps +/−, clamps at 0 (0.5 − 1 → 0).
- `filterItems`: query, category and status filters combine.
- `sortItems`: expiry sort puts dated items first (expired → soon →
  ok), undated last.
- `summary`: counts low / soon / expired.
- `buildShoppingList`: low items top up above threshold
  (5 − 2 + 1 = 4; 1 − 0.5 + 1 = 1.5); healthy items excluded.
- `shoppingListText`: header, lines, empty case in both languages.
- `toBengaliDigits`, `formatQty` (float-noise trim: 0.30000000000000004 → 0.3).
- `validateImport`: strict whole-file rejection (wrong app, wrong
  version, non-array, any invalid item); export round-trips cleanly.

## Headless-Chrome smoke tests — 26/26 pass

`node tests/smoke.js` (raw CDP, real Chromium, `file://`)

- Title contains "Pantry"; empty state + zero stats on a fresh profile.
- Add via the real form → 1 card, stat total 1, empty state hidden.
- Qty stepper + raises "5 kg" to "6 kg".
- Low + expired item → LOW and EXPIRED badges; shopping list has
  exactly 1 entry (the healthy item is not listed).
- Soon-expiring item (3 days out) → EXPIRING SOON badge; stats
  expired 1 / soon 1.
- Search narrows to 1 card; clearing restores 3.
- Language toggle: `lang` → bn, button reads "English", stats use
  Bengali digits.
- Sample loader adds 5 items (total 8) and shows the sample note;
  items persist across a page reload.
- Typed-DELETE erase clears all items; empty state returns.
- 390 px viewport: no horizontal overflow.
- Zero page console errors and zero uncaught exceptions.

## Fixes found by testing (1 real app bug, 1 test fix)

1. **App bug**: sample data included a 0-qty item (milk powder, out of
   stock) that validation rejected, so the whole sample load aborted
   mid-way (3 smoke failures). Fixed properly: qty 0 is now a valid
   pantry state ("out of stock"), form min changed 0.01 → 0, and the
   unit tests were updated to assert it. Re-ran: all green.
2. **Test fix**: the strict-import test used qty 0 as its invalid item
   after the fix above — changed to qty −1.
