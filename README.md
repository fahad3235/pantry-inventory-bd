# Pantry Inventory BD

Know what is in your kitchen — before you go to the bazar. An offline,
bilingual (English / বাংলা) pantry manager for Bangladeshi households:
track stock levels, expiry dates and low-stock alerts, and auto-build a
bazar shopping list from what is actually running low, expiring, or
already expired.

> Built by the MUSE Project Factory Ω (run #154, 12:00 slot, 2026-10-27).
> Ships EMPTY — no real pantry data is included. A clearly-labelled
> sample loader is provided for trying the app out.

## Features

1. **Item management** — name, category (rice & grains, dal & pulses,
   oil & spices, vegetables, dairy, snacks, cleaning, other), quantity +
   unit (kg / g / litre / ml / piece / packet), optional expiry date,
   and a per-item low-stock threshold. Quantities can be 0 (out of stock).
2. **Expiry intelligence** — expired (red), expiring within 7 days
   (amber, with days-left), OK (green), or no expiry. Items sort by
   expiry urgency by default.
3. **Low-stock alerts** — an item at or below its threshold gets a LOW
   badge and counts toward the low-stock stat.
4. **Auto shopping list** — low, expiring and expired items are collected
   automatically. Suggested quantities top a low item back up above its
   threshold; expired / expiring items suggest 1 replacement unit.
   Copy the list as plain text for the bazar.
5. **Search, filter & sort** — text search, category filter, status
   filter (low / expiring / expired), sort by name, expiry or quantity.
6. **Edit, steppers & erase** — inline quantity +/− steppers (never
   below 0), edit-in-place, delete with confirmation, and a typed-DELETE
   erase-all guard.
7. **Data portability** — JSON export and strict JSON import (wrong app,
   wrong version, or any invalid item rejects the whole file).
8. **Bilingual + mobile** — EN/বাংলা toggle persisted in localStorage,
   Bengali digits in Bangla mode, 390 px mobile layout, zero network
   requests. All data stays in the browser's localStorage.

## Stack

Pure static HTML + CSS + vanilla JavaScript. No build step, no
dependencies, no backend, no network calls.

## Run it

Open `index.html` in any modern browser, or serve the folder:

```sh
npx serve .
# or
python3 -m http.server 8000
```

## Testing

```sh
node --test tests/logic.test.js   # 16 unit tests (pure logic)
node tests/smoke.js               # 26 headless-Chrome smoke checks (raw CDP)
```

See [TEST_RESULTS.md](TEST_RESULTS.md) for the verified run.

## Limitations

- Data lives only in the browser's localStorage on one device; there is
  no account, sync, or backup.
- Quantities, dates and thresholds are whatever the user enters — the
  app cannot verify what is actually in a packet. Check packets before
  cooking.
- The shopping-list quantities are suggestions, not a diet or budget
  recommendation.
- Sample items (Miniket rice, Masoor dal, Soybean oil, milk powder,
  potato) are examples only, with relative dates computed at load time.

## Status

MVP complete and verified (see TEST_RESULTS.md). Future ideas: barcode
entry, household sharing via file exchange, and recipe-based depletion.
