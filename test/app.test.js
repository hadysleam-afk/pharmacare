'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../db');
const { createApp } = require('../app');

let server, base, token;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function call(path, method = 'GET', body, auth = true) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}

test.before(async () => {
  const db = openDb(':memory:');
  server = createApp({ db, adminUser: 'admin', adminPassword: 'pw-test' });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

test('auth is required and wrong password is rejected', async () => {
  assert.equal((await call('/api/medicines', 'GET', null, false)).status, 401);
  assert.equal((await call('/api/login', 'POST', { username: 'admin', password: 'x' })).status, 401);
  const r = await call('/api/login', 'POST', { username: 'admin', password: 'pw-test' });
  assert.equal(r.status, 200);
  token = r.data.token;
});

test('medicine validation and CRUD', async () => {
  assert.equal((await call('/api/medicines', 'POST', { name: '', price: 5 })).status, 400);
  assert.equal((await call('/api/medicines', 'POST', { name: 'A', price: -1 })).status, 400);
  const c = await call('/api/medicines', 'POST', { name: 'Test A', price: 10, barcode: 'X1', min_stock: 5 });
  assert.equal(c.status, 201);
  assert.equal((await call('/api/medicines', 'POST', { name: 'Dup', price: 1, barcode: 'X1' })).status, 409);
  const u = await call('/api/medicines/' + c.data.id, 'PUT', { name: 'Test A2', price: 12 });
  assert.equal(u.data.name, 'Test A2');
  const list = await call('/api/medicines?q=A2');
  assert.equal(list.data.length, 1);
});

test('batches: reject expired and bad input', async () => {
  const m = (await call('/api/medicines', 'POST', { name: 'Batchy', price: 10 })).data;
  const p = `/api/medicines/${m.id}/batches`;
  assert.equal((await call(p, 'POST', { qty: 5, expiry: day(-1) })).status, 400);
  assert.equal((await call(p, 'POST', { qty: 0, expiry: day(30) })).status, 400);
  assert.equal((await call(p, 'POST', { qty: 5, expiry: 'nope' })).status, 400);
  assert.equal((await call(p, 'POST', { qty: 5, expiry: day(30) })).status, 201);
});

test('sale uses FEFO, skips expired stock, blocks overselling, and is atomic', async () => {
  const m = (await call('/api/medicines', 'POST', { name: 'Fefo', price: 10, min_stock: 2 })).data;
  const p = `/api/medicines/${m.id}/batches`;
  await call(p, 'POST', { batch_no: 'LATE', qty: 10, expiry: day(300) });
  await call(p, 'POST', { batch_no: 'SOON', qty: 3, expiry: day(20) });
  const s = await call('/api/sales', 'POST', { items: [{ medicine_id: m.id, qty: 5 }] });
  assert.equal(s.status, 201);
  assert.equal(s.data.total, 50);
  const used = Object.fromEntries(s.data.items.map((i) => [i.batch_no, i.qty]));
  assert.deepEqual(used, { SOON: 3, LATE: 2 });
  // 8 left in LATE; ask for 9 -> rejected and nothing changes
  const bad = await call('/api/sales', 'POST', { items: [{ medicine_id: m.id, qty: 9 }] });
  assert.equal(bad.status, 409);
  const after = (await call('/api/medicines?q=Fefo')).data[0];
  assert.equal(after.stock, 8);
  assert.equal((await call('/api/sales', 'POST', { items: [] })).status, 400);
  assert.equal((await call('/api/sales', 'POST', { items: [{ medicine_id: m.id, qty: -1 }] })).status, 400);
});

test('expired batches inserted directly are never sold and show as alerts', async () => {
  const db = openDb(':memory:');
  const srv = createApp({ db, adminUser: 'a', adminPassword: 'b' });
  await new Promise((r) => srv.listen(0, r));
  const b = 'http://127.0.0.1:' + srv.address().port;
  const tk = (await (await fetch(b + '/api/login', { method: 'POST', body: JSON.stringify({ username: 'a', password: 'b' }) })).json()).token;
  const h = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
  db.prepare("INSERT INTO medicines (name, price) VALUES ('Old', 5)").run();
  db.prepare("INSERT INTO batches (medicine_id, batch_no, expiry, qty) VALUES (1, 'EXP', ?, 10)").run(day(-5));
  const r = await fetch(b + '/api/sales', { method: 'POST', headers: h, body: JSON.stringify({ items: [{ medicine_id: 1, qty: 1 }] }) });
  assert.equal(r.status, 409);
  const al = await (await fetch(b + '/api/alerts', { headers: h })).json();
  assert.equal(al.expired.length, 1);
  assert.equal(al.lowStock.length, 1);
  srv.close();
});

test('dashboard, alerts, sales list and static page', async () => {
  const d = await call('/api/dashboard');
  assert.equal(d.status, 200);
  assert.ok(d.data.todayInvoices >= 1);
  assert.ok(d.data.top.length >= 1);
  assert.equal((await call('/api/sales')).data.length >= 1, true);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /PharmaCare/);
  assert.equal((await fetch(base + '/../package.json')).status, 404);
  const del = await call('/api/medicines/1', 'DELETE');
  assert.equal(del.status, 200);
  assert.equal((await call('/api/medicines/1', 'DELETE')).status, 404);
});

test('dashboard returns a 7-day series and stock status', async () => {
  const d = (await call('/api/dashboard')).data;
  assert.equal(d.daily.length, 7);
  assert.equal(d.daily[6].date, new Date().toISOString().slice(0, 10));
  assert.ok(d.daily[6].total >= 50);
  assert.equal(typeof d.stockStatus.ok, 'number');
});
