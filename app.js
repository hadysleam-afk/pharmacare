'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const NEAR_DAYS = 60;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isInt = (n) => Number.isInteger(n);

function createApp({ db, adminUser, adminPassword }) {
  const sessions = new Set();

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

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

  function addBatch(medicineId, b) {
    const med = one('SELECT id FROM medicines WHERE id = ? AND active = 1', medicineId);
    if (!med) throw new HttpError(404, 'الدواء غير موجود');
    const qty = Number(b.qty);
    if (!isInt(qty) || qty <= 0) throw new HttpError(400, 'الكمية لازم تكون رقم صحيح أكبر من صفر');
    if (!isDate(b.expiry)) throw new HttpError(400, 'تاريخ الصلاحية غير صحيح (YYYY-MM-DD)');
    if (b.expiry < today()) throw new HttpError(400, 'لا يمكن استلام دفعة منتهية الصلاحية');
    const cost = b.cost === undefined || b.cost === '' ? 0 : Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'سعر التكلفة غير صحيح');
    const batchNo = String(b.batch_no || '').trim() || 'B-' + Date.now().toString(36).toUpperCase();
    const r = run('INSERT INTO batches (medicine_id, batch_no, expiry, qty, cost, supplier) VALUES (?,?,?,?,?,?)',
      medicineId, batchNo, b.expiry, qty, cost, String(b.supplier || '').trim());
    return one('SELECT * FROM batches WHERE id = ?', r.lastInsertRowid);
  }

  // Sell using FEFO (first expiry, first out). Expired batches are never sold.
  function createSale(body) {
    const items = body && body.items;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'الفاتورة فاضية');
    const merged = new Map();
    for (const it of items) {
      const id = Number(it.medicine_id), qty = Number(it.qty);
      if (!isInt(id) || !isInt(qty) || qty <= 0) throw new HttpError(400, 'بيانات الصنف غير صحيحة');
      merged.set(id, (merged.get(id) || 0) + qty);
    }
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
      total = Math.round(total * 100) / 100;
      const sale = run('INSERT INTO sales (total, customer) VALUES (?, ?)', total, String(body.customer || '').trim());
      for (const l of lines) {
        run('UPDATE batches SET qty = qty - ? WHERE id = ?', l.take, l.batch.id);
        run('INSERT INTO sale_items (sale_id, medicine_id, batch_id, qty, price) VALUES (?,?,?,?,?)',
          sale.lastInsertRowid, l.med.id, l.batch.id, l.take, l.med.price);
      }
      return getSale(Number(sale.lastInsertRowid));
    });
  }

  function getSale(id) {
    const sale = one('SELECT * FROM sales WHERE id = ?', id);
    if (!sale) throw new HttpError(404, 'الفاتورة غير موجودة');
    sale.items = q(`SELECT si.qty, si.price, m.name, b.batch_no, b.expiry FROM sale_items si
      JOIN medicines m ON m.id = si.medicine_id JOIN batches b ON b.id = si.batch_id WHERE si.sale_id = ?`, id);
    return sale;
  }

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

  const routes = [
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
    }],
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
    }],
    ['DELETE', /^\/api\/medicines\/(\d+)$/, (c, id) => {
      const r = run('UPDATE medicines SET active = 0, barcode = NULL WHERE id = ? AND active = 1', id);
      if (!r.changes) throw new HttpError(404, 'الدواء غير موجود');
      return { ok: true };
    }],
    ['GET', /^\/api\/medicines\/(\d+)\/batches$/, (c, id) => q('SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry', id)],
    ['POST', /^\/api\/medicines\/(\d+)\/batches$/, (c, id) => { const r = addBatch(Number(id), c.body || {}); c.status = 201; return r; }],
    ['GET', /^\/api\/sales$/, () => q('SELECT s.*, (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS items FROM sales s ORDER BY s.id DESC LIMIT 100')],
    ['GET', /^\/api\/sales\/(\d+)$/, (c, id) => getSale(Number(id))],
    ['POST', /^\/api\/sales$/, (c) => { const r = createSale(c.body); c.status = 201; return r; }],
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
        const a = Buffer.from(String(b.password || '')), e = Buffer.from(adminPassword);
        const ok = b.username === adminUser && a.length === e.length && crypto.timingSafeEqual(a, e);
        if (!ok) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
        const token = crypto.randomBytes(24).toString('hex');
        sessions.add(token);
        return send(res, 200, { token });
      }
      const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!sessions.has(auth)) throw new HttpError(401, 'سجّل الدخول أولًا');

      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && method === req.method) {
          const ctx = { url, status: 200, body: ['POST', 'PUT'].includes(method) ? await readBody(req) : undefined };
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
