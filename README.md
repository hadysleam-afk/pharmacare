# PharmaCare 💊

نظام بسيط لإدارة مخزون ومبيعات صيدلية صغيرة (Arabic RTL web app).
A small pharmacy inventory and point-of-sale system. Node.js + SQLite, **zero npm dependencies**.

> **Demo data notice / تنبيه:** the data created by `npm run seed` is **fake demo data** (common generic medicine names, made-up prices, stock and batches). It is not medical advice and not a real pharmacy's records. Add your own data before using it for real.

## What it does / المميزات

- **Inventory with batches (تشغيلات):** each medicine has batches with expiry date, quantity and cost.
- **FEFO selling:** a sale takes stock from the batch that expires first. Expired batches are never sold.
- **Point of sale:** search by name, generic name or barcode, build an invoice, checkout. Overselling is blocked and the sale is atomic (all or nothing).
- **Alerts:** expired batches, batches expiring in 60 days, low stock per medicine (custom threshold).
- **Dashboard:** hero with today's sales, 7-day sales chart, stock-health donut, attention banner for expired/low stock, top sellers.
- **Faster flows:** barcode + Enter adds to the invoice, +/- quantity, receipt after each sale (printable), inventory filters (low / expiring / expired), `/` focuses search, form validation and toasts.
- **Responsive:** sidebar on desktop, bottom navigation on phones.
- **Invoices list** with batch numbers per line.
- Simple admin login (single user).

## Run

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`).

```bash
git clone <this repo>
cd pharmacare
npm run seed        # optional: loads 15 demo medicines and a week of fake demo sales
ADMIN_PASSWORD='choose-a-password' npm start
# open http://localhost:3000   (user: admin)
```

Without `ADMIN_PASSWORD` it falls back to the demo password `demo1234` and prints a warning. Do not use that in real use.

Environment variables: `PORT` (3000), `DB_FILE` (`data/pharmacare.db`), `ADMIN_USER` (`admin`), `ADMIN_PASSWORD`.

## Test

```bash
npm test
```

Covers auth, validation, CRUD, batch rules, FEFO, overselling, atomic rollback, expired stock, alerts and dashboard (7 tests). The UI was also exercised end to end in headless Chrome.

## Honest limits / حدود النسخة الحالية

- Single admin user, in-memory sessions (restart = login again). No roles, no HTTPS (put it behind a reverse proxy for real use).
- No returns/refunds, no purchase orders, no barcode scanner integration (a USB scanner that types the code into the search box works).
- The UI loads the Cairo font from Google Fonts when online and falls back to system fonts offline.
- Prices are in EGP in the UI. Invoice times are shown in UTC.
- It does not check drug interactions or prescriptions. It is an inventory and sales tool only.

## Structure

```
server.js   entry point      app.js   API + static server
db.js       SQLite schema    seed.js  demo data (fake)
public/     Arabic RTL UI    test/    node:test suite
```

License: MIT
