# PharmaCare 💊

نظام متكامل لإدارة صيدلية صغيرة: مخزون وتشغيلات وصلاحية، نقطة بيع، مرتجعات، عملاء وموردون وفواتير شراء، تقارير، وصلاحيات مستخدمين (Arabic RTL web app).
A complete small-pharmacy management system. Node.js + SQLite, **zero npm dependencies**.

> **Demo data notice / تنبيه:** the data created by `npm run seed` is **fake demo data** (common generic medicine names, made-up prices, stock, batches, suppliers, customers and sales). It is not medical advice and not a real pharmacy's records. Add your own data before using it for real.

## What it does / المميزات

- **Inventory with batches (تشغيلات):** each medicine has batches with expiry date, quantity and cost.
- **FEFO selling:** a sale takes stock from the batch that expires first. Expired batches are never sold.
- **Point of sale:** search by name, generic name or barcode, build an invoice, checkout. Overselling is blocked and the sale is atomic (all or nothing). The customer field autocompletes from saved customers and registers new names automatically.
- **Returns (مرتجعات):** partial or full returns per invoice line. Stock goes back on the shelf only if the batch is still valid; expired stock is written off, never resold. The invoice shows returned quantities and the net total.
- **Customers (العملاء):** a customer register with phone and notes, auto-created at checkout, with each customer's invoices, total spend and last visit.
- **Suppliers (الموردون):** supplier records with company and phone, their purchase invoices and totals.
- **Purchase invoices (المشتريات):** multi-line purchase invoices; every line creates a stock batch linked to the invoice and supplier. Suppliers are auto-created from the invoice when new.
- **Users & roles (مستخدمون وصلاحيات):** admin and seller accounts with hashed passwords (PBKDF2). The seller sells, registers returns and views alerts and customers; only the admin manages stock, purchases, suppliers, reports, exports and users. Every sale, return and purchase records who did it. You cannot lock out the last admin.
- **Reports (التقارير):** sales report for any date range: net sales, invoices, returns, estimated profit (sales − returns − cost of goods sold), daily chart, top sellers and sales by category, with presets (today / 7 days / 30 days / this month).
- **Excel export (تصدير):** sales (any range), inventory and purchases as CSV files that open correctly in Excel (UTF-8 BOM, Arabic headers).
- **Alerts:** expired batches, batches expiring in 60 days, low stock per medicine (custom threshold).
- **Dashboard:** hero with today's sales, 7-day sales chart, stock-health donut, attention banner for expired/low stock, top sellers.
- **Faster flows:** barcode + Enter adds to the invoice, +/- quantity, receipt after each sale (printable), inventory filters (low / expiring / expired), `/` focuses search, form validation and toasts.
- **Responsive:** sidebar on desktop, scrollable bottom navigation on phones.

## Run

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`).

```bash
git clone <this repo>
cd pharmacare
npm run seed        # optional: loads demo medicines, sales, suppliers, customers and users
ADMIN_PASSWORD='choose-a-password' npm start
# open http://localhost:3000   (admin user: admin)
```

Without `ADMIN_PASSWORD` it falls back to the demo password `demo1234` and prints a warning. Do not use that in real use. The seed also creates a demo seller account `cashier` / `demo1234`.

Environment variables: `PORT` (3000), `DB_FILE` (`data/pharmacare.db`), `ADMIN_USER` (`admin`), `ADMIN_PASSWORD`.

Databases created by v1 open cleanly in v2: the new columns and tables are added automatically on start.

## Test

```bash
npm test
```

16 tests cover auth, validation, CRUD, batch rules, FEFO, overselling, atomic rollback, expired stock, users and role enforcement, last-admin protection, customers, suppliers and purchase invoices (stock effect, totals, validation), returns (restock, over-return block, expired-batch write-off), sales reports and CSV exports. The UI was also exercised end to end in headless Chrome (sale, return and purchase flows included).

## Honest limits / حدود النسخة الحالية

- In-memory sessions (restart = login again). No HTTPS (put it behind a reverse proxy for real use). Single pharmacy, no branches.
- Profit in reports is an estimate: cost of sold items is taken from their batch costs, and return shipping/handling costs are not modeled.
- Export is CSV (opens in Excel), not a native .xlsx workbook.
- No barcode scanner integration (a USB scanner that types the code into the search box works).
- The UI loads the Cairo font from Google Fonts when online and falls back to system fonts offline.
- Prices are in EGP in the UI. Invoice times are shown in UTC.
- It does not check drug interactions or prescriptions. It is an inventory and sales tool only.

## Structure

```
server.js      entry point       app.js         API + static server
db.js          SQLite schema     seed.js        demo data (fake)
public/        Arabic RTL UI     public/app.js  core + POS + sales + inventory
public/pages.js  customers, suppliers, purchases, reports, users
test/          node:test suite
```

License: MIT
