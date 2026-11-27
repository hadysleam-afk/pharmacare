'use strict';
// DEMO DATA ONLY. Names are common generic medicines; prices, stock, batches,
// suppliers, customers and sales are all made up so the app has something to show.
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('./db');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'pharmacare.db');
const db = openDb(dbFile);
if (db.prepare('SELECT COUNT(*) AS n FROM medicines').get().n > 0) {
  console.log('Database already has data, seed skipped.');
  process.exit(0);
}
const d = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const hash = (pw, salt) => crypto.pbkdf2Sync(String(pw), salt, 100000, 32, 'sha256').toString('hex');
const meds = [
  ['Paracetamol 500mg', 'Paracetamol', 'مسكن وخافض حرارة', 12, 30, [[400, 8], [150, 300]]],
  ['Ibuprofen 400mg', 'Ibuprofen', 'مسكن', 25, 20, [[90, 220]]],
  ['Amoxicillin 500mg', 'Amoxicillin', 'مضاد حيوي', 55, 15, [[40, 25], [60, 400]]],
  ['Azithromycin 250mg', 'Azithromycin', 'مضاد حيوي', 70, 10, [[8, 180]]],
  ['Omeprazole 20mg', 'Omeprazole', 'جهاز هضمي', 35, 20, [[120, 500]]],
  ['Cetirizine 10mg', 'Cetirizine', 'حساسية', 18, 20, [[75, 350]]],
  ['Loratadine 10mg', 'Loratadine', 'حساسية', 20, 15, [[5, 40]]],
  ['Metformin 500mg', 'Metformin', 'سكر', 30, 25, [[200, 600]]],
  ['Amlodipine 5mg', 'Amlodipine', 'ضغط', 40, 20, [[110, 450]]],
  ['Vitamin C 1000mg', 'Ascorbic acid', 'فيتامينات', 45, 15, [[60, 280]]],
  ['Oral Rehydration Salts', 'ORS', 'جهاز هضمي', 8, 40, [[0, 0]]],
  ['Salbutamol Inhaler', 'Salbutamol', 'صدر', 65, 8, [[14, 200]]],
  ['Diclofenac Gel', 'Diclofenac', 'مسكن موضعي', 48, 10, [[30, -10], [25, 330]]],
  ['Saline Nasal Spray', 'Sodium chloride', 'أنف وحلق', 32, 10, [[45, 700]]],
  ['Antiseptic Solution 100ml', 'Povidone-iodine', 'مطهرات', 22, 12, [[50, 600]]],
];
db.exec('BEGIN');
// Demo users: the admin from the environment, plus a demo cashier (seller role).
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'demo1234';
const saltA = crypto.randomBytes(16).toString('hex');
const admin = db.prepare('INSERT INTO users (username, pass_hash, salt, role) VALUES (?,?,?,?)').run(adminUser, hash(adminPassword, saltA), saltA, 'admin');
const saltC = crypto.randomBytes(16).toString('hex');
db.prepare('INSERT INTO users (username, pass_hash, salt, role) VALUES (?,?,?,?)').run('cashier', hash('demo1234', saltC), saltC, 'seller');
// Demo suppliers.
const sup1 = db.prepare('INSERT INTO suppliers (name, phone, company) VALUES (?,?,?)').run('الشركة العربية للأدوية', '02-23456789', 'المخازن المركزية');
const sup2 = db.prepare('INSERT INTO suppliers (name, phone, company) VALUES (?,?,?)').run('مخازن المهندس للجملة', '01001234567', '');
// Demo customers.
const custNames = ['أحمد علي', 'منى سيد', 'كابتن محمود', 'الحاجة سعاد'];
const custIds = custNames.map((n, i) => db.prepare('INSERT INTO customers (name, phone) VALUES (?,?)').run(n, i % 2 ? '0109876543' + i : '').lastInsertRowid);
meds.forEach(([name, generic, category, price, min, batches], i) => {
  const r = db.prepare('INSERT INTO medicines (name, generic, category, barcode, price, min_stock) VALUES (?,?,?,?,?,?)')
    .run(name, generic, category, `DEMO${String(1000 + i)}`, price, min);
  batches.forEach(([qty, days], j) => {
    if (qty > 0) {
      const sup = ((i + j) % 2 ? sup1 : sup2).lastInsertRowid;
      db.prepare('INSERT INTO batches (medicine_id, batch_no, expiry, qty, cost, supplier, supplier_id) VALUES (?,?,?,?,?,?,?)')
        .run(r.lastInsertRowid, `DEMO-${i + 1}-${j + 1}`, d(days), qty, Math.round(price * 0.7 * 100) / 100,
          db.prepare('SELECT name FROM suppliers WHERE id = ?').get(sup).name, sup);
    }
  });
});
// Demo sales history for the last 7 days (fake, deterministic) so the dashboard has something to show.
let seedN = 7;
const rnd = (n) => { seedN = (seedN * 9301 + 49297) % 233280; return Math.floor((seedN / 233280) * n); };
for (let back = 6; back >= 0; back--) {
  const count = 3 + rnd(4);
  for (let k = 0; k < count; k++) {
    const stamp = `${d(-back)} ${String(9 + rnd(11)).padStart(2, '0')}:${String(rnd(60)).padStart(2, '0')}:00`;
    const lines = [];
    for (let j = 0; j < 1 + rnd(3); j++) {
      const b = db.prepare('SELECT b.id, b.medicine_id, b.qty, m.price FROM batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.qty > 20 AND b.expiry >= ? ORDER BY RANDOM() LIMIT 1').get(d(0));
      if (b && !lines.some((l) => l.medicine_id === b.medicine_id)) lines.push({ ...b, take: 1 + rnd(4) });
    }
    if (!lines.length) continue;
    const total = lines.reduce((s, l) => s + l.take * l.price, 0);
    const ci = rnd(3) === 0 ? null : custIds[rnd(custIds.length)];
    const cname = ci ? db.prepare('SELECT name FROM customers WHERE id = ?').get(ci).name : '';
    const sale = db.prepare('INSERT INTO sales (created_at, total, customer, customer_id, user_id) VALUES (?,?,?,?,?)').run(stamp, total, cname, ci, admin.lastInsertRowid);
    for (const l of lines) {
      db.prepare('UPDATE batches SET qty = qty - ? WHERE id = ?').run(l.take, l.id);
      db.prepare('INSERT INTO sale_items (sale_id, medicine_id, batch_id, qty, price) VALUES (?,?,?,?,?)').run(sale.lastInsertRowid, l.medicine_id, l.id, l.take, l.price);
    }
  }
}
// Two demo purchase invoices, each adding fresh batches to stock.
const purMeds = [[1, 60, 240, 8.4], [9, 40, 400, 21], [10, 30, 365, 31.5]];
[[sup1.lastInsertRowid, purMeds.slice(0, 2)], [sup2.lastInsertRowid, purMeds.slice(2)]].forEach(([supId, lines]) => {
  const total = lines.reduce((s, [, qty, , cost]) => s + qty * cost, 0);
  const p = db.prepare('INSERT INTO purchases (supplier_id, user_id, total) VALUES (?,?,?)').run(supId, admin.lastInsertRowid, total);
  const supName = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supId).name;
  lines.forEach(([medId, qty, days, cost], j) => {
    const b = db.prepare('INSERT INTO batches (medicine_id, batch_no, expiry, qty, cost, supplier, supplier_id, purchase_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(medId, `PUR-${p.lastInsertRowid}-${j + 1}`, d(days), qty, cost, supName, supId, p.lastInsertRowid);
    db.prepare('INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, qty, cost) VALUES (?,?,?,?,?)')
      .run(p.lastInsertRowid, medId, b.lastInsertRowid, qty, cost);
  });
});
// One demo return against the latest sale (restocks the batch).
const lastLine = db.prepare('SELECT si.*, b.expiry FROM sale_items si JOIN batches b ON b.id = si.batch_id ORDER BY si.id DESC LIMIT 1').get();
if (lastLine) {
  const ret = db.prepare("INSERT INTO returns (sale_id, user_id, total, reason) VALUES (?,?,?,'مرتجع تجريبي')").run(lastLine.sale_id, admin.lastInsertRowid, lastLine.price);
  db.prepare('INSERT INTO return_items (return_id, sale_item_id, medicine_id, batch_id, qty, price) VALUES (?,?,?,?,1,?)')
    .run(ret.lastInsertRowid, lastLine.id, lastLine.medicine_id, lastLine.batch_id, lastLine.price);
  if (lastLine.expiry >= d(0)) db.prepare('UPDATE batches SET qty = qty + 1 WHERE id = ?').run(lastLine.batch_id);
}
db.exec('COMMIT');
console.log(`Seeded ${meds.length} demo medicines, a week of demo sales, 2 suppliers, ${custNames.length} customers, 2 purchase invoices and 1 return.`);
console.log('Demo logins: admin / (ADMIN_PASSWORD or demo1234), cashier / demo1234 (seller role).');
