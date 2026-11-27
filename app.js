'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const NEAR_DAYS = 60;
const ROLES = ['admin', 'seller'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isInt = (n) => Number.isInteger(n);
const round2 = (n) => Math.round(n * 100) / 100;

const hashPassword = (password, salt) => crypto.pbkdf2Sync(String(password), salt, 100000, 32, 'sha256').toString('hex');
const newSalt = () => crypto.randomBytes(16).toString('hex');

function createApp({ db, adminUser, adminPassword }) {
  const sessions = new Map(); // token -> { id, username, role }

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  /* ---------- users & auth ---------- */
  function insertUser(username, password, role) {
    const salt = newSalt();
    const r = run('INSERT INTO users (username, pass_hash, salt, role) VALUES (?,?,?,?)', username, hashPassword(password, salt), salt, role);
    return one('SELECT id, username, role, active, created_at FROM users WHERE id = ?', r.lastInsertRowid);
  }
  // First run: bootstrap the admin account from the environment.
  if (!one('SELECT id FROM users LIMIT 1')) insertUser(adminUser, adminPassword, 'admin');

  function checkLogin(username, password) {
    const u = one('SELECT * FROM users WHERE username = ? AND active = 1', String(username || ''));
    if (!u) return null;
    const a = Buffer.from(hashPassword(password, u.salt), 'hex'), e = Buffer.from(u.pass_hash, 'hex');
    return a.length === e.length && crypto.timingSafeEqual(a, e) ? { id: u.id, username: u.username, role: u.role } : null;
  }

  function validateNewUser(b) {
    const username = String(b.username || '').trim();
    if (username.length < 3 || username.length > 40) throw new HttpError(400, 'اسم المستخدم لازم يكون من 3 إلى 40 حرفًا');
    if (typeof b.password !== 'string' || b.password.length < 6) throw new HttpError(400, 'كلمة المرور 6 أحرف على الأقل');
    if (!ROLES.includes(b.role)) throw new HttpError(400, 'الدور غير صحيح');
    return { username, password: b.password, role: b.role };
  }

  /* ---------- medicines & stock ---------- */
  const medicineSelect = `
    SELECT m.*,
      COALESCE((SELECT SUM(qty) FROM batches b WHERE b.medicine_id = m.id AND b.expiry >= ?), 0) AS stock,
      COALESCE((SELECT SUM(qty) FROM batches b WHERE b.medicine_id = m.id AND b.expiry < ?), 0) AS expired_qty,
      (SELECT MIN(expiry) FROM batches b WHERE b.medicine_id = m.id AND b.qty > 0 AND b.expiry >= ?) AS next_expiry
    FROM medicines m`;

  function listMedicines(search) {
    const t = today();
    let sql = medicineSelect + ' WHERE m.active = 1';
    const params = [t, t, t];
    if (search) {
      sql += ' AND (m.name LIKE ? OR m.generic LIKE ? OR m.barcode = ?)';
      params.push(`%${search}%`, `%${search}%`, search);
    }
    return q(sql + ' ORDER BY m.name', ...params);
  }

  function validateMedicine(b) {
    if (!b || typeof b.name !== 'string' || !b.name.trim()) throw new HttpError(400, 'اسم الدواء مطلوب');
    const price = Number(b.price);
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'السعر غير صحيح');
    const min = b.min_stock === undefined || b.min_stock === '' ? 10 : Number(b.min_stock);
    if (!isInt(min) || min < 0) throw new HttpError(400, 'الحد الأدنى للمخزون غير صحيح');
    return {
      name: b.name.trim(), generic: String(b.generic || '').trim(), category: String(b.category || '').trim(),
      barcode: b.barcode ? String(b.barcode).trim() : null, price, min_stock: min,
    };
  }

  function validateBatchInput(medicineId, b) {
    const med = one('SELECT id FROM medicines WHERE id = ? AND active = 1', medicineId);
    if (!med) throw new HttpError(404, 'الدواء غير موجود');
    const qty = Number(b.qty);
    if (!isInt(qty) || qty <= 0) throw new HttpError(400, 'الكمية لازم تكون رقم صحيح أكبر من صفر');
    if (!isDate(b.expiry)) throw new HttpError(400, 'تاريخ الصلاحية غير صحيح (YYYY-MM-DD)');
    if (b.expiry < today()) throw new HttpError(400, 'لا يمكن استلام دفعة منتهية الصلاحية');
    const cost = b.cost === undefined || b.cost === '' ? 0 : Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'سعر التكلفة غير صحيح');
    return { qty, expiry: b.expiry, cost, batchNo: String(b.batch_no || '').trim() || 'B-' + Date.now().toString(36).toUpperCase() };
  }

  function insertBatch(medicineId, b, { supplierId = null, purchaseId = null } = {}) {
    const v = validateBatchInput(medicineId, b);
    const r = run('INSERT INTO batches (medicine_id, batch_no, expiry, qty, cost, supplier, supplier_id, purchase_id) VALUES (?,?,?,?,?,?,?,?)',
      medicineId, v.batchNo, v.expiry, v.qty, v.cost, String(b.supplier || '').trim(), supplierId, purchaseId);
    return one('SELECT * FROM batches WHERE id = ?', r.lastInsertRowid);
  }

  /* ---------- customers & suppliers (find-or-create by name) ---------- */
  function findOrCreateCustomer(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    const found = one('SELECT id FROM customers WHERE name = ?', n);
    if (found) return found.id;
    try {
      return Number(run('INSERT INTO customers (name) VALUES (?)', n).lastInsertRowid);
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return one('SELECT id FROM customers WHERE name = ?', n).id;
      throw e;
    }
  }
  function findOrCreateSupplier(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    const found = one('SELECT id FROM suppliers WHERE name = ?', n);
    if (found) return found.id;
    try {
      return Number(run('INSERT INTO suppliers (name) VALUES (?)', n).lastInsertRowid);
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return one('SELECT id FROM suppliers WHERE name = ?', n).id;
      throw e;
    }
  }

  /* ---------- sales ---------- */
  // Sell using FEFO (first expiry, first out). Expired batches are never sold.
  function createSale(body, user) {
    const items = body && body.items;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'الفاتورة فاضية');
    const merged = new Map();
    for (const it of items) {
      const id = Number(it.medicine_id), qty = Number(it.qty);
      if (!isInt(id) || !isInt(qty) || qty <= 0) throw new HttpError(400, 'بيانات الصنف غير صحيحة');
      merged.set(id, (merged.get(id) || 0) + qty);
    }
    const customerName = String(body.customer || '').trim();
    return tx(() => {
      const lines = [];
      let total = 0;
      for (const [medId, need] of merged) {
        const med = one('SELECT * FROM medicines WHERE id = ? AND active = 1', medId);
        if (!med) throw new HttpError(404, 'صنف غير موجود');
        const batches = q('SELECT * FROM batches WHERE medicine_id = ? AND qty > 0 AND expiry >= ? ORDER BY expiry, id', medId, today());
        const avail = batches.reduce((s, b) => s + b.qty, 0);
        if (avail < need) throw new HttpError(409, `المخزون غير كاف لـ ${med.name} (المتاح ${avail})`);
        let left = need;
        for (const b of batches) {
          if (left === 0) break;
          const take = Math.min(left, b.qty);
          lines.push({ med, batch: b, take });
          left -= take;
        }
        total += med.price * need;
      }
      total = round2(total);
      const customerId = findOrCreateCustomer(customerName);
      const sale = run('INSERT INTO sales (total, customer, customer_id, user_id) VALUES (?,?,?,?)', total, customerName, customerId, user.id);
      for (const l of lines) {
        run('UPDATE batches SET qty = qty - ? WHERE id = ?', l.take, l.batch.id);
        run('INSERT INTO sale_items (sale_id, medicine_id, batch_id, qty, price) VALUES (?,?,?,?,?)',
          sale.lastInsertRowid, l.med.id, l.batch.id, l.take, l.med.price);
      }
      return getSale(Number(sale.lastInsertRowid));
    });
  }

  function getSale(id) {
    const sale = one(`SELECT s.*, u.username AS cashier,
        COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = s.id), 0) AS refunded
      FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id);
    if (!sale) throw new HttpError(404, 'الفاتورة غير موجودة');
    sale.items = q(`SELECT si.id, si.qty, si.price, m.name, b.batch_no, b.expiry,
        COALESCE((SELECT SUM(ri.qty) FROM return_items ri WHERE ri.sale_item_id = si.id), 0) AS returned
      FROM sale_items si JOIN medicines m ON m.id = si.medicine_id JOIN batches b ON b.id = si.batch_id WHERE si.sale_id = ?`, id);
    return sale;
  }

  function listSales() {
    return q(`SELECT s.*, u.username AS cashier,
        (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS items,
        COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = s.id), 0) AS refunded
      FROM sales s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 100`);
  }

  /* ---------- returns ---------- */
  function createReturn(saleId, body, user) {
    const sale = one('SELECT * FROM sales WHERE id = ?', saleId);
    if (!sale) throw new HttpError(404, 'الفاتورة غير موجودة');
    const items = body && body.items;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'حدد الأصناف المرتجعة');
    const reason = String(body.reason || '').trim();
    return tx(() => {
      const lines = [];
      let total = 0;
      for (const it of items) {
        const siId = Number(it.sale_item_id), qty = Number(it.qty);
        if (!isInt(siId) || !isInt(qty) || qty <= 0) throw new HttpError(400, 'بيانات المرتجع غير صحيحة');
        const si = one(`SELECT si.*, b.expiry, m.name FROM sale_items si
          JOIN batches b ON b.id = si.batch_id JOIN medicines m ON m.id = si.medicine_id WHERE si.id = ? AND si.sale_id = ?`, siId, saleId);
        if (!si) throw new HttpError(404, 'صنف غير موجود في الفاتورة');
        const already = one('SELECT COALESCE(SUM(qty),0) AS n FROM return_items WHERE sale_item_id = ?', siId).n;
        if (qty > si.qty - already) throw new HttpError(409, `المرتجع من ${si.name} أكبر من المباع المتبقي (${si.qty - already})`);
        lines.push({ si, qty });
        total += qty * si.price;
      }
      total = round2(total);
      const ret = run('INSERT INTO returns (sale_id, user_id, total, reason) VALUES (?,?,?,?)', saleId, user.id, total, reason);
      for (const { si, qty } of lines) {
        run('INSERT INTO return_items (return_id, sale_item_id, medicine_id, batch_id, qty, price) VALUES (?,?,?,?,?,?)',
          ret.lastInsertRowid, si.id, si.medicine_id, si.batch_id, qty, si.price);
        // Restock only if the batch is still valid; expired stock is written off, not resold.
        if (si.expiry >= today()) run('UPDATE batches SET qty = qty + ? WHERE id = ?', qty, si.batch_id);
      }
      return getReturn(Number(ret.lastInsertRowid));
    });
  }

  function getReturn(id) {
    const ret = one(`SELECT r.*, u.username AS cashier FROM returns r LEFT JOIN users u ON u.id = r.user_id WHERE r.id = ?`, id);
    if (!ret) throw new HttpError(404, 'المرتجع غير موجود');
    ret.items = q(`SELECT ri.qty, ri.price, m.name, b.batch_no FROM return_items ri
      JOIN medicines m ON m.id = ri.medicine_id JOIN batches b ON b.id = ri.batch_id WHERE ri.return_id = ?`, id);
    return ret;
  }

  function listReturns() {
    return q(`SELECT r.*, u.username AS cashier, s.customer FROM returns r
      LEFT JOIN users u ON u.id = r.user_id JOIN sales s ON s.id = r.sale_id ORDER BY r.id DESC LIMIT 100`);
  }

  /* ---------- purchases ---------- */
  function createPurchase(body, user) {
    const items = body && body.items;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'فاتورة الشراء فاضية');
    return tx(() => {
      let supplierId = body.supplier_id ? Number(body.supplier_id) : null;
      if (supplierId) {
        if (!one('SELECT id FROM suppliers WHERE id = ?', supplierId)) throw new HttpError(404, 'المورد غير موجود');
      } else {
        supplierId = findOrCreateSupplier(body.supplier);
      }
      const seen = new Set();
      const lines = [];
      for (const it of items) {
        const medId = Number(it.medicine_id);
        if (!isInt(medId)) throw new HttpError(400, 'بيانات الصنف غير صحيحة');
        if (seen.has(medId)) throw new HttpError(400, 'نفس الدواء مكرر في الفاتورة، ادمج الكمية في سطر واحد');
        seen.add(medId);
        const v = validateBatchInput(medId, it);
        lines.push({ medId, v });
      }
      const total = round2(lines.reduce((s, l) => s + l.v.qty * l.v.cost, 0));
      const p = run('INSERT INTO purchases (supplier_id, user_id, total) VALUES (?,?,?)', supplierId, user.id, total);
      const supplierName = supplierId ? one('SELECT name FROM suppliers WHERE id = ?', supplierId).name : '';
      for (const l of lines) {
        const batch = insertBatch(l.medId, { qty: l.v.qty, expiry: l.v.expiry, cost: l.v.cost, batch_no: l.v.batchNo, supplier: supplierName },
          { supplierId, purchaseId: Number(p.lastInsertRowid) });
        run('INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, qty, cost) VALUES (?,?,?,?,?)',
          p.lastInsertRowid, l.medId, batch.id, l.v.qty, l.v.cost);
      }
      return getPurchase(Number(p.lastInsertRowid));
    });
  }

  function getPurchase(id) {
    const p = one(`SELECT p.*, s.name AS supplier_name, u.username AS created_by FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`, id);
    if (!p) throw new HttpError(404, 'فاتورة الشراء غير موجودة');
    p.items = q(`SELECT pi.qty, pi.cost, m.name, b.batch_no, b.expiry FROM purchase_items pi
      JOIN medicines m ON m.id = pi.medicine_id JOIN batches b ON b.id = pi.batch_id WHERE pi.purchase_id = ?`, id);
    return p;
  }

  function listPurchases() {
    return q(`SELECT p.*, s.name AS supplier_name, u.username AS created_by,
        (SELECT SUM(qty) FROM purchase_items WHERE purchase_id = p.id) AS items
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.id DESC LIMIT 100`);
  }

  /* ---------- alerts & dashboard ---------- */
  function alerts() {
    const t = today();
    const lowStock = q(medicineSelect + ' WHERE m.active = 1', t, t, t).filter((m) => m.stock <= m.min_stock);
    const nearExpiry = q(`SELECT b.id, b.batch_no, b.expiry, b.qty, m.name FROM batches b JOIN medicines m ON m.id = b.medicine_id
      WHERE b.qty > 0 AND b.expiry >= ? AND b.expiry <= ? ORDER BY b.expiry`, t, addDays(NEAR_DAYS));
    const expired = q(`SELECT b.id, b.batch_no, b.expiry, b.qty, m.name FROM batches b JOIN medicines m ON m.id = b.medicine_id
      WHERE b.qty > 0 AND b.expiry < ? ORDER BY b.expiry`, t);
    return { lowStock, nearExpiry, expired, nearDays: NEAR_DAYS };
  }

  function dashboard() {
    const a = alerts();
    const t = today();
    const day = one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM sales WHERE date(created_at) = ?", t);
    const month = one("SELECT COALESCE(SUM(total),0) AS total FROM sales WHERE strftime('%Y-%m', created_at) = ?", t.slice(0, 7));
    const stockValue = one('SELECT COALESCE(SUM(b.qty * m.price),0) AS v FROM batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.expiry >= ?', t).v;
    const expiredLoss = one('SELECT COALESCE(SUM(b.qty * b.cost),0) AS v FROM batches b WHERE b.expiry < ?', t).v;
    const top = q(`SELECT m.name, SUM(si.qty) AS qty FROM sale_items si JOIN medicines m ON m.id = si.medicine_id
      GROUP BY m.id ORDER BY qty DESC LIMIT 5`);
    const rows = q("SELECT date(created_at) AS d, SUM(total) AS total, COUNT(*) AS n FROM sales WHERE date(created_at) >= ? GROUP BY d", addDays(-6));
    const byDay = new Map(rows.map((r) => [r.d, r]));
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(-i);
      const r = byDay.get(d);
      daily.push({ date: d, total: r ? r.total : 0, invoices: r ? r.n : 0 });
    }
    const totalMeds = one('SELECT COUNT(*) AS n FROM medicines WHERE active = 1').n;
    return {
      daily,
      stockStatus: { ok: Math.max(0, totalMeds - a.lowStock.length), low: a.lowStock.length, expired: a.expired.length },
      medicines: totalMeds,
      todaySales: day.total, todayInvoices: day.n, monthSales: month.total, stockValue, expiredLoss,
      lowStockCount: a.lowStock.length, nearExpiryCount: a.nearExpiry.length, expiredCount: a.expired.length, top,
    };
  }

  /* ---------- reports ---------- */
  function salesReport(from, to) {
    if (!isDate(from) || !isDate(to)) throw new HttpError(400, 'حدد تاريخ البداية والنهاية (YYYY-MM-DD)');
    if (from > to) throw new HttpError(400, 'تاريخ البداية بعد تاريخ النهاية');
    const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
    if (spanDays > 366) throw new HttpError(400, 'الفترة أطول من سنة');
    const totals = one(`SELECT COUNT(*) AS invoices, COALESCE(SUM(total),0) AS revenue FROM sales
      WHERE date(created_at) >= ? AND date(created_at) <= ?`, from, to);
    const returned = one(`SELECT COALESCE(SUM(r.total),0) AS v FROM returns r WHERE date(r.created_at) >= ? AND date(r.created_at) <= ?`, from, to).v;
    const cogs = one(`SELECT COALESCE(SUM(si.qty * b.cost),0) AS v FROM sale_items si
      JOIN sales s ON s.id = si.sale_id JOIN batches b ON b.id = si.batch_id
      WHERE date(s.created_at) >= ? AND date(s.created_at) <= ?`, from, to).v;
    const rows = q(`SELECT date(created_at) AS d, SUM(total) AS total, COUNT(*) AS n FROM sales
      WHERE date(created_at) >= ? AND date(created_at) <= ? GROUP BY d`, from, to);
    const retRows = q(`SELECT date(created_at) AS d, SUM(total) AS total FROM returns
      WHERE date(created_at) >= ? AND date(created_at) <= ? GROUP BY d`, from, to);
    const byDay = new Map(rows.map((r) => [r.d, r]));
    const retByDay = new Map(retRows.map((r) => [r.d, r.total]));
    const daily = [];
    for (let i = 0; i <= spanDays; i++) {
      const d = new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10);
      const r = byDay.get(d);
      daily.push({ date: d, total: r ? r.total : 0, invoices: r ? r.n : 0, returned: retByDay.get(d) || 0 });
    }
    const top = q(`SELECT m.name, SUM(si.qty) AS qty, SUM(si.qty * si.price) AS revenue FROM sale_items si
      JOIN sales s ON s.id = si.sale_id JOIN medicines m ON m.id = si.medicine_id
      WHERE date(s.created_at) >= ? AND date(s.created_at) <= ? GROUP BY m.id ORDER BY qty DESC LIMIT 10`, from, to);
    const categories = q(`SELECT COALESCE(NULLIF(m.category,''),'غير مصنف') AS category, SUM(si.qty * si.price) AS revenue, SUM(si.qty) AS qty
      FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN medicines m ON m.id = si.medicine_id
      WHERE date(s.created_at) >= ? AND date(s.created_at) <= ? GROUP BY category ORDER BY revenue DESC`, from, to);
    return {
      range: { from, to },
      revenue: totals.revenue, invoices: totals.invoices, returned,
      net: round2(totals.revenue - returned),
      profit: round2(totals.revenue - returned - cogs),
      avgInvoice: totals.invoices ? round2(totals.revenue / totals.invoices) : 0,
      daily, top, categories,
    };
  }

  /* ---------- CSV export ---------- */
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const toCsv = (header, rows) => '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

  function exportSales(from, to) {
    if (!isDate(from) || !isDate(to) || from > to) throw new HttpError(400, 'فترة غير صحيحة');
    const rows = q(`SELECT s.id, s.created_at, s.customer, u.username AS cashier, s.total,
        (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS items,
        COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = s.id), 0) AS refunded
      FROM sales s LEFT JOIN users u ON u.id = s.user_id
      WHERE date(s.created_at) >= ? AND date(s.created_at) <= ? ORDER BY s.id`, from, to);
    return toCsv(['رقم الفاتورة', 'التاريخ (UTC)', 'العميل', 'الكاشير', 'عدد الوحدات', 'الإجمالي', 'المرتجع', 'الصافي'],
      rows.map((r) => [r.id, r.created_at, r.customer, r.cashier || '', r.items, r.total, r.refunded, round2(r.total - r.refunded)]));
  }

  function exportInventory() {
    return toCsv(['الصنف', 'الاسم العلمي', 'التصنيف', 'الباركود', 'سعر البيع', 'المخزون الصالح', 'كمية منتهية', 'أقرب انتهاء', 'حد التنبيه'],
      listMedicines().map((m) => [m.name, m.generic, m.category, m.barcode || '', m.price, m.stock, m.expired_qty, m.next_expiry || '', m.min_stock]));
  }

  function exportPurchases() {
    const rows = q(`SELECT p.id, p.created_at, s.name AS supplier, m.name AS medicine, b.batch_no, b.expiry, pi.qty, pi.cost
      FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id JOIN medicines m ON m.id = pi.medicine_id JOIN batches b ON b.id = pi.batch_id
      ORDER BY p.id DESC`);
    return toCsv(['فاتورة الشراء', 'التاريخ (UTC)', 'المورد', 'الصنف', 'التشغيلة', 'الانتهاء', 'الكمية', 'تكلفة الوحدة', 'الإجمالي'],
      rows.map((r) => [r.id, r.created_at, r.supplier || '', r.medicine, r.batch_no, r.expiry, r.qty, r.cost, round2(r.qty * r.cost)]));
  }

  /* ---------- routes ---------- */
  // Fourth element 'admin' restricts the route to admins; anything else is open to every logged-in user.
  const routes = [
    ['GET', /^\/api\/me$/, (c) => ({ username: c.user.username, role: c.user.role })],
    ['GET', /^\/api\/dashboard$/, () => dashboard()],
    ['GET', /^\/api\/alerts$/, () => alerts()],
    ['GET', /^\/api\/medicines$/, (c) => listMedicines(c.url.searchParams.get('q'))],
    ['POST', /^\/api\/medicines$/, (c) => {
      const m = validateMedicine(c.body);
      try {
        const r = run('INSERT INTO medicines (name, generic, category, barcode, price, min_stock) VALUES (?,?,?,?,?,?)',
          m.name, m.generic, m.category, m.barcode, m.price, m.min_stock);
        c.status = 201;
        return one('SELECT * FROM medicines WHERE id = ?', r.lastInsertRowid);
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'الباركود مستخدم لدواء آخر');
        throw e;
      }
    }, 'admin'],
    ['PUT', /^\/api\/medicines\/(\d+)$/, (c, id) => {
      const m = validateMedicine(c.body);
      if (!one('SELECT id FROM medicines WHERE id = ? AND active = 1', id)) throw new HttpError(404, 'الدواء غير موجود');
      try {
        run('UPDATE medicines SET name=?, generic=?, category=?, barcode=?, price=?, min_stock=? WHERE id=?',
          m.name, m.generic, m.category, m.barcode, m.price, m.min_stock, id);
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'الباركود مستخدم لدواء آخر');
        throw e;
      }
      return one('SELECT * FROM medicines WHERE id = ?', id);
    }, 'admin'],
    ['DELETE', /^\/api\/medicines\/(\d+)$/, (c, id) => {
      const r = run('UPDATE medicines SET active = 0, barcode = NULL WHERE id = ? AND active = 1', id);
      if (!r.changes) throw new HttpError(404, 'الدواء غير موجود');
      return { ok: true };
    }, 'admin'],
    ['GET', /^\/api\/medicines\/(\d+)\/batches$/, (c, id) => q('SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry', id)],
    ['POST', /^\/api\/medicines\/(\d+)\/batches$/, (c, id) => {
      const supplierId = c.body && c.body.supplier ? findOrCreateSupplier(c.body.supplier) : null;
      const r = insertBatch(Number(id), c.body || {}, { supplierId });
      c.status = 201;
      return r;
    }, 'admin'],
    ['GET', /^\/api\/sales$/, () => listSales()],
    ['GET', /^\/api\/sales\/(\d+)$/, (c, id) => getSale(Number(id))],
    ['POST', /^\/api\/sales$/, (c) => { const r = createSale(c.body, c.user); c.status = 201; return r; }],
    ['POST', /^\/api\/sales\/(\d+)\/returns$/, (c, id) => { const r = createReturn(Number(id), c.body, c.user); c.status = 201; return r; }],
    ['GET', /^\/api\/returns$/, () => listReturns()],
    ['GET', /^\/api\/customers$/, (c) => {
      const search = c.url.searchParams.get('q');
      let sql = `SELECT cu.*,
          (SELECT COUNT(*) FROM sales s WHERE s.customer_id = cu.id) AS invoices,
          COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = cu.id), 0) AS spent,
          (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = cu.id) AS last_visit
        FROM customers cu`;
      const params = [];
      if (search) { sql += ' WHERE cu.name LIKE ? OR cu.phone LIKE ?'; params.push(`%${search}%`, `%${search}%`); }
      return q(sql + ' ORDER BY cu.name LIMIT 200', ...params);
    }],
    ['POST', /^\/api\/customers$/, (c) => {
      const name = String((c.body || {}).name || '').trim();
      if (!name) throw new HttpError(400, 'اسم العميل مطلوب');
      try {
        const r = run('INSERT INTO customers (name, phone, notes) VALUES (?,?,?)', name,
          String(c.body.phone || '').trim(), String(c.body.notes || '').trim());
        c.status = 201;
        return one('SELECT * FROM customers WHERE id = ?', r.lastInsertRowid);
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'يوجد عميل بهذا الاسم');
        throw e;
      }
    }],
    ['PUT', /^\/api\/customers\/(\d+)$/, (c, id) => {
      const name = String((c.body || {}).name || '').trim();
      if (!name) throw new HttpError(400, 'اسم العميل مطلوب');
      if (!one('SELECT id FROM customers WHERE id = ?', id)) throw new HttpError(404, 'العميل غير موجود');
      try {
        run('UPDATE customers SET name=?, phone=?, notes=? WHERE id=?', name, String(c.body.phone || '').trim(), String(c.body.notes || '').trim(), id);
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'يوجد عميل بهذا الاسم');
        throw e;
      }
      return one('SELECT * FROM customers WHERE id = ?', id);
    }],
    ['GET', /^\/api\/customers\/(\d+)$/, (c, id) => {
      const cu = one('SELECT * FROM customers WHERE id = ?', id);
      if (!cu) throw new HttpError(404, 'العميل غير موجود');
      cu.sales = q(`SELECT s.*, (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS items,
          COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = s.id), 0) AS refunded
        FROM sales s WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 50`, id);
      cu.spent = cu.sales.reduce((s, x) => s + x.total, 0);
      return cu;
    }],
    ['GET', /^\/api\/suppliers$/, () => q(`SELECT s.*,
        (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) AS purchases,
        COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id = s.id), 0) AS bought,
        (SELECT COUNT(*) FROM batches b WHERE b.supplier_id = s.id) AS batches
      FROM suppliers s ORDER BY s.name`)],
    ['POST', /^\/api\/suppliers$/, (c) => {
      const name = String((c.body || {}).name || '').trim();
      if (!name) throw new HttpError(400, 'اسم المورد مطلوب');
      try {
        const r = run('INSERT INTO suppliers (name, phone, company, notes) VALUES (?,?,?,?)', name,
          String(c.body.phone || '').trim(), String(c.body.company || '').trim(), String(c.body.notes || '').trim());
        c.status = 201;
        return one('SELECT * FROM suppliers WHERE id = ?', r.lastInsertRowid);
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'يوجد مورد بهذا الاسم');
        throw e;
      }
    }, 'admin'],
    ['PUT', /^\/api\/suppliers\/(\d+)$/, (c, id) => {
      const name = String((c.body || {}).name || '').trim();
      if (!name) throw new HttpError(400, 'اسم المورد مطلوب');
      if (!one('SELECT id FROM suppliers WHERE id = ?', id)) throw new HttpError(404, 'المورد غير موجود');
      try {
        run('UPDATE suppliers SET name=?, phone=?, company=?, notes=? WHERE id=?', name,
          String(c.body.phone || '').trim(), String(c.body.company || '').trim(), String(c.body.notes || '').trim(), id);
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'يوجد مورد بهذا الاسم');
        throw e;
      }
      return one('SELECT * FROM suppliers WHERE id = ?', id);
    }, 'admin'],
    ['GET', /^\/api\/suppliers\/(\d+)$/, (c, id) => {
      const s = one('SELECT * FROM suppliers WHERE id = ?', id);
      if (!s) throw new HttpError(404, 'المورد غير موجود');
      s.purchases = q(`SELECT p.*, (SELECT SUM(qty) FROM purchase_items WHERE purchase_id = p.id) AS items
        FROM purchases p WHERE p.supplier_id = ? ORDER BY p.id DESC LIMIT 50`, id);
      s.bought = s.purchases.reduce((t, x) => t + x.total, 0);
      return s;
    }],
    ['GET', /^\/api\/purchases$/, () => listPurchases()],
    ['GET', /^\/api\/purchases\/(\d+)$/, (c, id) => getPurchase(Number(id))],
    ['POST', /^\/api\/purchases$/, (c) => { const r = createPurchase(c.body, c.user); c.status = 201; return r; }, 'admin'],
    ['GET', /^\/api\/reports\/sales$/, (c) => salesReport(c.url.searchParams.get('from'), c.url.searchParams.get('to')), 'admin'],
    ['GET', /^\/api\/users$/, () => q('SELECT id, username, role, active, created_at FROM users ORDER BY id'), 'admin'],
    ['POST', /^\/api\/users$/, (c) => {
      const u = validateNewUser(c.body || {});
      try {
        const created = insertUser(u.username, u.password, u.role);
        c.status = 201;
        return created;
      } catch (e) {
        if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'اسم المستخدم مستخدم');
        throw e;
      }
    }, 'admin'],
    ['PUT', /^\/api\/users\/(\d+)$/, (c, id) => {
      const target = one('SELECT * FROM users WHERE id = ?', id);
      if (!target) throw new HttpError(404, 'المستخدم غير موجود');
      const b = c.body || {};
      const nextRole = b.role === undefined ? target.role : b.role;
      const nextActive = b.active === undefined ? target.active : (b.active ? 1 : 0);
      if (!ROLES.includes(nextRole)) throw new HttpError(400, 'الدور غير صحيح');
      if (Number(id) === c.user.id && (nextRole !== 'admin' || !nextActive)) throw new HttpError(400, 'لا يمكنك تغيير دورك أو تعطيل حسابك');
      if (target.role === 'admin' && (nextRole !== 'admin' || !nextActive)) {
        const admins = one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?", id).n;
        if (admins === 0) throw new HttpError(400, 'لازم يفضل مدير واحد نشط على الأقل');
      }
      run('UPDATE users SET role = ?, active = ? WHERE id = ?', nextRole, nextActive, id);
      if (typeof b.password === 'string' && b.password) {
        if (b.password.length < 6) throw new HttpError(400, 'كلمة المرور 6 أحرف على الأقل');
        const salt = newSalt();
        run('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?', hashPassword(b.password, salt), salt, id);
        for (const [tok, s] of sessions) if (s.id === Number(id)) sessions.delete(tok);
      }
      return one('SELECT id, username, role, active, created_at FROM users WHERE id = ?', id);
    }, 'admin'],
  ];

  const exportRoutes = [
    [/^\/api\/export\/sales\.csv$/, (u) => [`sales-${u.searchParams.get('from')}-${u.searchParams.get('to')}.csv`, exportSales(u.searchParams.get('from'), u.searchParams.get('to'))]],
    [/^\/api\/export\/inventory\.csv$/, () => ['inventory.csv', exportInventory()]],
    [/^\/api\/export\/purchases\.csv$/, () => ['purchases.csv', exportPurchases()]],
  ];

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (d) => { data += d; if (data.length > 1e6) { reject(new HttpError(413, 'الطلب كبير')); req.destroy(); } });
      req.on('end', () => {
        if (!data) return resolve(undefined);
        try { resolve(JSON.parse(data)); } catch { reject(new HttpError(400, 'JSON غير صحيح')); }
      });
      req.on('error', reject);
    });
  }

  function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  function serveStatic(url, res) {
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const root = path.join(__dirname, 'public');
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) return serveStatic(url, res);

      if (url.pathname === '/api/login' && req.method === 'POST') {
        const b = (await readBody(req)) || {};
        const user = checkLogin(b.username, b.password);
        if (!user) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, user);
        return send(res, 200, { token, username: user.username, role: user.role });
      }
      const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
      const user = sessions.get(auth);
      if (!user) throw new HttpError(401, 'سجّل الدخول أولًا');

      if (req.method === 'GET') {
        for (const [re, make] of exportRoutes) {
          if (re.test(url.pathname)) {
            if (user.role !== 'admin') throw new HttpError(403, 'هذه الصلاحية للمدير فقط');
            const [filename, csv] = make(url);
            res.writeHead(200, {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="${filename}"`,
            });
            return res.end(csv);
          }
        }
      }

      for (const [method, re, handler, minRole] of routes) {
        const m = url.pathname.match(re);
        if (m && method === req.method) {
          if (minRole === 'admin' && user.role !== 'admin') throw new HttpError(403, 'هذه الصلاحية للمدير فقط');
          const ctx = { url, status: 200, user, body: ['POST', 'PUT'].includes(method) ? await readBody(req) : undefined };
          const result = handler(ctx, ...m.slice(1));
          return send(res, ctx.status, result);
        }
      }
      throw new HttpError(404, 'غير موجود');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'خطأ في الخادم' });
    }
  });
  return server;
}

module.exports = { createApp };
