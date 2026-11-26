'use strict';
// DEMO DATA ONLY. Names are common generic medicines; prices, stock and batches are made up.
const path = require('node:path');
const { openDb } = require('./db');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'pharmacare.db');
const db = openDb(dbFile);
if (db.prepare('SELECT COUNT(*) AS n FROM medicines').get().n > 0) {
  console.log('Database already has data, seed skipped.');
  process.exit(0);
}
const d = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
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
meds.forEach(([name, generic, category, price, min, batches], i) => {
  const r = db.prepare('INSERT INTO medicines (name, generic, category, barcode, price, min_stock) VALUES (?,?,?,?,?,?)')
    .run(name, generic, category, `DEMO${String(1000 + i)}`, price, min);
  batches.forEach(([qty, days], j) => {
    if (qty > 0) db.prepare('INSERT INTO batches (medicine_id, batch_no, expiry, qty, cost, supplier) VALUES (?,?,?,?,?,?)')
      .run(r.lastInsertRowid, `DEMO-${i + 1}-${j + 1}`, d(days), qty, Math.round(price * 0.7 * 100) / 100, 'مورد تجريبي');
  });
});
db.exec('COMMIT');
console.log(`Seeded ${meds.length} demo medicines.`);
