'use strict';
let token = sessionStorage.getItem('token');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  setTimeout(() => (t.className = ''), 3000);
}
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logout(); throw new Error(data.error); }
  if (!r.ok) throw new Error(data.error || 'خطأ');
  return data;
}
function logout() { token = null; sessionStorage.removeItem('token'); showLogin(); }
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('/login', 'POST', { username: f.get('username'), password: f.get('password') });
    token = r.token; sessionStorage.setItem('token', token); start();
  } catch (err) { $('#loginError').textContent = err.message; }
});
$('#logout').addEventListener('click', logout);
$('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) show(e.target.dataset.tab); });

const views = { dashboard, pos, inventory, alerts, sales };
function show(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('hidden', s.id !== tab));
  views[tab]().catch((e) => toast(e.message, true));
}
function start() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); show('dashboard'); }

async function dashboard() {
  const d = await api('/dashboard');
  $('#dashboard').innerHTML = `
    <div class="cards">
      <div class="stat">مبيعات اليوم<b>${money(d.todaySales)}</b><span class="muted small">${d.todayInvoices} فاتورة</span></div>
      <div class="stat">مبيعات الشهر<b>${money(d.monthSales)}</b></div>
      <div class="stat">قيمة المخزون الصالح<b>${money(d.stockValue)}</b></div>
      <div class="stat">عدد الأصناف<b>${d.medicines}</b></div>
      <div class="stat warn">أصناف قاربت على النفاد<b>${d.lowStockCount}</b></div>
      <div class="stat warn">دفعات قاربت على الانتهاء<b>${d.nearExpiryCount}</b></div>
      <div class="stat bad">دفعات منتهية<b>${d.expiredCount}</b><span class="muted small">تكلفتها ${money(d.expiredLoss)}</span></div>
    </div>
    <h2>الأكثر مبيعًا</h2>
    <table><tr><th>الصنف</th><th>الكمية المباعة</th></tr>
    ${d.top.map((t) => `<tr><td>${esc(t.name)}</td><td>${t.qty}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">لا توجد مبيعات بعد</td></tr>'}</table>`;
}

let cart = [];
async function pos() {
  const meds = await api('/medicines');
  const el = $('#pos');
  el.innerHTML = `<div class="pos">
    <div><div class="toolbar"><input id="posSearch" placeholder="ابحث بالاسم أو الاسم العلمي أو الباركود"></div>
      <table><thead><tr><th>الصنف</th><th>السعر</th><th>المتاح</th><th></th></tr></thead><tbody id="posList"></tbody></table></div>
    <div class="card"><h2>الفاتورة</h2><div id="cart"></div>
      <label>اسم العميل (اختياري)<input id="customer"></label>
      <div class="total" id="cartTotal"></div>
      <button class="primary" id="checkout">إتمام البيع</button></div></div>`;
  const draw = () => {
    const s = $('#posSearch').value.trim().toLowerCase();
    $('#posList').innerHTML = meds.filter((m) => !s || (m.name + m.generic + (m.barcode || '')).toLowerCase().includes(s)).map((m) =>
      `<tr><td>${esc(m.name)}<div class="muted small">${esc(m.generic)}</div></td><td>${money(m.price)}</td><td>${m.stock}</td>
       <td><button class="sm" data-add="${m.id}" ${m.stock <= 0 ? 'disabled' : ''}>إضافة</button></td></tr>`).join('');
  };
  const drawCart = () => {
    $('#cart').innerHTML = cart.length ? `<table>${cart.map((c, i) => `<tr><td>${esc(c.name)}</td>
      <td style="width:80px"><input type="number" min="1" max="${c.stock}" value="${c.qty}" data-qty="${i}"></td>
      <td>${money(c.price * c.qty)}</td><td><button class="sm danger" data-del="${i}">✕</button></td></tr>`).join('')}</table>` : '<p class="muted">الفاتورة فاضية</p>';
    $('#cartTotal').textContent = 'الإجمالي: ' + money(cart.reduce((s, c) => s + c.price * c.qty, 0));
  };
  draw(); drawCart();
  $('#posSearch').oninput = draw;
  $('#posList').onclick = (e) => {
    const id = Number(e.target.dataset.add); if (!id) return;
    const m = meds.find((x) => x.id === id); const line = cart.find((c) => c.id === id);
    if (line) line.qty = Math.min(line.qty + 1, m.stock); else cart.push({ id, name: m.name, price: m.price, stock: m.stock, qty: 1 });
    drawCart();
  };
  $('#cart').onchange = (e) => {
    if (e.target.dataset.qty === undefined) return;
    const c = cart[Number(e.target.dataset.qty)]; const v = parseInt(e.target.value, 10);
    c.qty = Number.isInteger(v) && v > 0 ? Math.min(v, c.stock) : 1; drawCart();
  };
  $('#cart').onclick = (e) => { if (e.target.dataset.del !== undefined) { cart.splice(Number(e.target.dataset.del), 1); drawCart(); } };
  $('#checkout').onclick = async () => {
    try {
      const s = await api('/sales', 'POST', { customer: $('#customer').value, items: cart.map((c) => ({ medicine_id: c.id, qty: c.qty })) });
      cart = []; toast(`تم البيع. فاتورة رقم ${s.id} بإجمالي ${money(s.total)}`); pos();
    } catch (err) { toast(err.message, true); }
  };
}

async function inventory() {
  const el = $('#inventory');
  el.innerHTML = `<div class="toolbar"><input id="invSearch" placeholder="بحث"><button class="primary" id="newMed">+ دواء جديد</button></div>
    <table><thead><tr><th>الصنف</th><th>التصنيف</th><th>السعر</th><th>المخزون</th><th>أقرب انتهاء</th><th></th></tr></thead><tbody id="invList"></tbody></table>`;
  const load = async () => {
    const meds = await api('/medicines?q=' + encodeURIComponent($('#invSearch').value.trim()));
    $('#invList').innerHTML = meds.map((m) => {
      const low = m.stock <= m.min_stock;
      return `<tr><td>${esc(m.name)}<div class="muted small">${esc(m.generic)} ${m.barcode ? '· ' + esc(m.barcode) : ''}</div></td><td>${esc(m.category)}</td>
      <td>${money(m.price)}</td><td><span class="tag ${low ? 'low' : 'ok'}">${m.stock}</span>${m.expired_qty ? ` <span class="tag low">منتهي ${m.expired_qty}</span>` : ''}</td>
      <td>${esc(m.next_expiry || '-')}</td>
      <td><button class="sm" data-recv="${m.id}">استلام دفعة</button> <button class="sm" data-edit="${m.id}">تعديل</button> <button class="sm danger" data-rm="${m.id}">حذف</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">لا توجد أصناف</td></tr>';
    el._meds = meds;
  };
  await load();
  let timer; $('#invSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(() => load().catch((e) => toast(e.message, true)), 250); };
  $('#newMed').onclick = () => medForm(null, load);
  $('#invList').onclick = async (e) => {
    const t = e.target.dataset; const find = (id) => el._meds.find((m) => m.id === Number(id));
    if (t.edit) medForm(find(t.edit), load);
    if (t.recv) batchForm(find(t.recv), load);
    if (t.rm && confirm('حذف الصنف من القائمة؟')) { try { await api('/medicines/' + t.rm, 'DELETE'); await load(); toast('تم الحذف'); } catch (err) { toast(err.message, true); } }
  };
}

function dialog(html, onSubmit) {
  const d = $('#dlg'); d.innerHTML = `<form method="dialog">${html}<div class="actions"><button class="primary" value="ok">حفظ</button><button type="button" class="sm" id="cancel">إلغاء</button></div></form>`;
  $('#cancel').onclick = () => d.close();
  d.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); d.close(); } catch (err) { toast(err.message, true); }
  };
  d.showModal();
}
function medForm(m, reload) {
  m = m || {};
  dialog(`<h2>${m.id ? 'تعديل دواء' : 'دواء جديد'}</h2>
    <label>الاسم<input name="name" required value="${esc(m.name)}"></label>
    <label>الاسم العلمي<input name="generic" value="${esc(m.generic)}"></label>
    <label>التصنيف<input name="category" value="${esc(m.category)}"></label>
    <label>الباركود<input name="barcode" value="${esc(m.barcode)}"></label>
    <label>سعر البيع<input name="price" type="number" step="0.01" min="0" required value="${m.price ?? ''}"></label>
    <label>حد التنبيه للمخزون<input name="min_stock" type="number" min="0" value="${m.min_stock ?? 10}"></label>`,
  async (f) => { await api(m.id ? '/medicines/' + m.id : '/medicines', m.id ? 'PUT' : 'POST', f); toast('تم الحفظ'); await reload(); });
}
function batchForm(m, reload) {
  dialog(`<h2>استلام دفعة: ${esc(m.name)}</h2>
    <label>رقم التشغيلة<input name="batch_no"></label>
    <label>تاريخ الانتهاء<input name="expiry" type="date" required></label>
    <label>الكمية<input name="qty" type="number" min="1" required></label>
    <label>سعر التكلفة للوحدة<input name="cost" type="number" step="0.01" min="0"></label>
    <label>المورد<input name="supplier"></label>`,
  async (f) => { f.qty = Number(f.qty); await api(`/medicines/${m.id}/batches`, 'POST', f); toast('تم استلام الدفعة'); await reload(); });
}

async function alerts() {
  const a = await api('/alerts');
  const t = (title, rows, cols) => `<h2>${title} (${rows.length})</h2><table>${rows.length ? rows.map(cols).join('') : '<tr><td class="muted">لا يوجد</td></tr>'}</table><br>`;
  $('#alerts').innerHTML =
    t('منتهية الصلاحية (اسحبها من الرف)', a.expired, (r) => `<tr><td>${esc(r.name)}</td><td>تشغيلة ${esc(r.batch_no)}</td><td>${r.qty} وحدة</td><td><span class="tag low">${esc(r.expiry)}</span></td></tr>`) +
    t(`تنتهي خلال ${a.nearDays} يومًا`, a.nearExpiry, (r) => `<tr><td>${esc(r.name)}</td><td>تشغيلة ${esc(r.batch_no)}</td><td>${r.qty} وحدة</td><td><span class="tag near">${esc(r.expiry)}</span></td></tr>`) +
    t('مخزون منخفض', a.lowStock, (r) => `<tr><td>${esc(r.name)}</td><td>المتاح ${r.stock}</td><td>الحد ${r.min_stock}</td></tr>`);
}

async function sales() {
  const list = await api('/sales');
  $('#sales').innerHTML = `<table><thead><tr><th>#</th><th>التاريخ (UTC)</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr><td>${s.id}</td><td>${esc(s.created_at)}</td><td>${esc(s.customer || '-')}</td><td>${s.items}</td><td>${money(s.total)}</td><td><button class="sm" data-inv="${s.id}">عرض</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا توجد فواتير</td></tr>'}</tbody></table>`;
  $('#sales').onclick = async (e) => {
    if (!e.target.dataset.inv) return;
    const s = await api('/sales/' + e.target.dataset.inv);
    const d = $('#dlg');
    d.innerHTML = `<h2>فاتورة #${s.id}</h2><table>${s.items.map((i) => `<tr><td>${esc(i.name)}<div class="muted small">تشغيلة ${esc(i.batch_no)}</div></td><td>${i.qty} × ${money(i.price)}</td></tr>`).join('')}</table>
      <div class="total">${money(s.total)}</div><button class="sm" id="closeDlg">إغلاق</button>`;
    $('#closeDlg').onclick = () => d.close(); d.showModal();
  };
}

if (token) start(); else showLogin();
