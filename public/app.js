'use strict';
const ICONS = {
  logo: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  down: '<path d="M12 4v13M6 12l6 6 6-6"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-4v4M17 14h2"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach((e) => { if (!e.firstChild) e.innerHTML = icon(e.dataset.icon); });

let token = sessionStorage.getItem('token');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const egp = (n) => `${money(n)} <small>ج.م</small>`;
const dayName = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('ar-EG', { weekday: 'short', timeZone: 'UTC' });
const daysLeft = (iso) => Math.round((new Date(iso + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);

let toastTimer;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), 3200);
}
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logout(); throw new Error(data.error); }
  if (!r.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}
function logout() { token = null; sessionStorage.removeItem('token'); $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }

// count-up animation for hero/stat numbers
function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 700), v = end * (1 - Math.pow(1 - p, 3));
      el.firstChild.nodeValue = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
const skeleton = (el) => { el.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; };
const empty = (ic, title, text, action = '') => `<div class="empty"><div class="ring">${icon(ic)}</div><b>${title}</b><div>${text}</div>${action}</div>`;

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), btn = e.target.querySelector('button');
  btn.disabled = true; $('#loginError').textContent = '';
  try {
    const r = await api('/login', 'POST', { username: f.get('username'), password: f.get('password') });
    token = r.token; sessionStorage.setItem('token', token); start();
  } catch (err) { $('#loginError').textContent = err.message; }
  btn.disabled = false;
});
$('#logout').addEventListener('click', logout);
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });

const TITLES = {
  dashboard: ['لوحة التحكم', 'نظرة سريعة على أداء الصيدلية اليوم'],
  pos: ['نقطة البيع', 'ابحث عن الدواء وأضفه للفاتورة. اضغط / للبحث السريع'],
  inventory: ['المخزون', 'كل الأدوية والتشغيلات وتواريخ الصلاحية'],
  alerts: ['التنبيهات', 'ما يحتاج تصرفًا الآن: المنتهي والقارب على الانتهاء والناقص'],
  sales: ['الفواتير', 'آخر 100 فاتورة'],
};
const views = { dashboard, pos, inventory, alerts, sales };
function show(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('hidden', s.id !== tab));
  $('#pageTitle').textContent = TITLES[tab][0]; $('#pageSub').textContent = TITLES[tab][1];
  skeleton($('#' + tab));
  views[tab]().then(() => hydrateIcons($('#' + tab))).catch((e) => toast(e.message, true));
  refreshBadge();
}
async function refreshBadge() {
  try {
    const a = await api('/alerts'); const n = a.expired.length + a.nearExpiry.length + a.lowStock.length;
    const b = $('#alertBadge'); b.textContent = n; b.classList.toggle('hidden', n === 0);
  } catch { /* ignore */ }
}
function start() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); hydrateIcons(); show('dashboard'); }
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    const s = $('#posSearch:not(.hidden)') || $('#invSearch'); if (s && s.offsetParent) { e.preventDefault(); s.focus(); }
  }
});

/* ---------- dashboard ---------- */
async function dashboard() {
  const d = await api('/dashboard');
  const max = Math.max(1, ...d.daily.map((x) => x.total));
  const st = d.stockStatus, tot = Math.max(1, st.ok + st.low + st.expired);
  const C = 2 * Math.PI * 52; let off = 0;
  const seg = (n, color) => { const len = (n / tot) * C; const s = `<circle cx="70" cy="70" r="52" fill="none" stroke="${color}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return s; };
  const topMax = Math.max(1, ...d.top.map((t) => t.qty));
  const need = d.expiredCount + d.lowStockCount + d.nearExpiryCount;
  const greet = new Date().getUTCHours() + 2 < 12 ? 'صباح الخير' : 'مساء الخير';
  $('#dashboard').innerHTML = `
    <div class="hero">
      <div>
        <h2>${greet}، مبيعات اليوم</h2>
        <div class="big"><span data-count="${d.todaySales}" data-dec="2">0</span><small>ج.م</small></div>
        <p>${d.todayInvoices} فاتورة اليوم · مبيعات الشهر ${money(d.monthSales)} ج.م</p>
        <div class="cta"><button class="btn light" data-go="pos">${icon('cart')} بيع جديد</button><button class="btn ghost" data-go="inventory">${icon('box')} إدارة المخزون</button></div>
      </div>
      <div class="hero-side">
        <div class="mini"><div class="l">قيمة المخزون الصالح</div><div class="v">${money(d.stockValue)}</div></div>
        <div class="mini"><div class="l">عدد الأصناف</div><div class="v">${d.medicines}</div></div>
        <div class="mini warn"><div class="l">قاربت على النفاد</div><div class="v">${d.lowStockCount}</div></div>
        <div class="mini ${d.expiredCount ? 'bad' : ''}"><div class="l">دفعات منتهية</div><div class="v">${d.expiredCount}</div></div>
      </div>
    </div>
    ${need ? `<div class="attention ${d.expiredCount ? 'bad' : ''}" data-go="alerts">${d.expiredCount ? '<span class="pulse"></span>' : icon('warn')}
      <div><b>${need} تنبيه يحتاج انتباهك</b><div class="muted">${d.expiredCount ? `${d.expiredCount} دفعة منتهية الصلاحية (تكلفتها ${money(d.expiredLoss)} ج.م) · ` : ''}${d.nearExpiryCount} قاربت على الانتهاء · ${d.lowStockCount} مخزون منخفض</div></div>
      <span class="go">عرض التنبيهات ${icon('arrow')}</span></div>` : ''}
    <div class="grid two">
      <div class="card"><h2>${icon('trend')} مبيعات آخر 7 أيام</h2>
        <div class="bars">${d.daily.map((x, i) => `<div class="bar ${i === 6 ? 'today' : ''}" title="${esc(x.date)}: ${money(x.total)} ج.م"><span class="num">${x.total ? Math.round(x.total) : ''}</span><div class="col" style="height:0" data-h="${(x.total / max) * 100}"></div><span class="day">${i === 6 ? 'اليوم' : dayName(x.date)}</span></div>`).join('')}</div></div>
      <div class="card"><h2>${icon('pill')} حالة المخزون</h2>
        <div class="donut-wrap"><svg width="150" height="150" viewBox="0 0 140 140"><circle cx="70" cy="70" r="52" fill="none" stroke="#edf3f4" stroke-width="20"/>${seg(st.ok, '#14b8a6')}${seg(st.low, '#f59e0b')}${seg(st.expired, '#dc2626')}<text x="70" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="#0f2a2e">${d.medicines}</text><text x="70" y="88" text-anchor="middle" font-size="11" fill="#64797d">صنف</text></svg>
        <div class="legend"><div><i style="background:#14b8a6"></i>سليم ${st.ok}</div><div><i style="background:#f59e0b"></i>ناقص ${st.low}</div><div><i style="background:#dc2626"></i>دفعات منتهية ${st.expired}</div></div></div></div>
    </div>
    <div class="card"><h2>${icon('trend')} الأكثر مبيعًا</h2>
      ${d.top.length ? `<div class="toplist">${d.top.map((t, i) => `<div class="toprow"><span class="rank">${i + 1}</span><span>${esc(t.name)}</span><span>${t.qty} وحدة</span><div class="meter"><span style="width:${(t.qty / topMax) * 100}%"></span></div></div>`).join('')}</div>`
      : empty('receipt', 'لا توجد مبيعات بعد', 'ابدأ أول عملية بيع من نقطة البيع', `<br><button class="btn primary" data-go="pos">${icon('cart')} بيع جديد</button>`)}</div>`;
  const root = $('#dashboard');
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.col').forEach((c) => (c.style.height = c.dataset.h + '%'))));
  countUp(root);
}

/* ---------- POS ---------- */
let cart = JSON.parse(sessionStorage.getItem('cart') || '[]');
const saveCart = () => sessionStorage.setItem('cart', JSON.stringify(cart));
async function pos() {
  const meds = await api('/medicines');
  cart = cart.filter((c) => meds.some((m) => m.id === c.id)).map((c) => { const m = meds.find((x) => x.id === c.id); return { ...c, price: m.price, stock: m.stock, qty: Math.min(c.qty, m.stock) || 1 }; });
  const el = $('#pos');
  el.innerHTML = `<div class="pos">
    <div><div class="toolbar"><div class="search">${icon('search')}<input id="posSearch" placeholder="ابحث بالاسم أو الاسم العلمي أو الباركود  (Enter للإضافة)" autocomplete="off"></div><span class="muted small">اضغط <span class="kbd">/</span></span></div>
      <div class="products" id="posList"></div></div>
    <div class="card cart"><h2>${icon('receipt')} الفاتورة <span class="cart-count" id="cartCount">0</span></h2><div id="cart"></div>
      <label class="field">اسم العميل (اختياري)<input id="customer" placeholder="مثال: أحمد"></label>
      <div class="cart-total"><span>الإجمالي</span><span id="cartTotal"></span></div>
      <button class="btn primary block" id="checkout">${icon('check')} إتمام البيع</button>
      <button class="btn block" id="clearCart" style="margin-top:8px">تفريغ الفاتورة</button></div></div>`;
  const filtered = () => { const s = $('#posSearch').value.trim().toLowerCase(); return meds.filter((m) => !s || (m.name + ' ' + m.generic + ' ' + (m.barcode || '')).toLowerCase().includes(s)); };
  const draw = () => {
    const list = filtered();
    $('#posList').innerHTML = list.map((m) => `<button class="product" data-add="${m.id}" ${m.stock <= 0 ? 'disabled' : ''}>
      <span class="nm">${esc(m.name)}</span><span class="gn">${esc(m.generic)}</span>
      <span class="pr"><b>${money(m.price)} ج.م</b><span class="tag ${m.stock <= 0 ? 'low' : m.stock <= m.min_stock ? 'near' : 'ok'}">${m.stock <= 0 ? 'نفد' : 'متاح ' + m.stock}</span></span></button>`).join('')
      || `<div style="grid-column:1/-1">${empty('search', 'لا توجد نتائج', 'جرّب اسمًا أو باركودًا آخر')}</div>`;
  };
  const add = (id) => {
    const m = meds.find((x) => x.id === id); if (!m || m.stock <= 0) return;
    const line = cart.find((c) => c.id === id);
    if (line) { if (line.qty >= m.stock) return toast(`المتاح من ${m.name} هو ${m.stock} فقط`, true); line.qty++; }
    else cart.push({ id, name: m.name, price: m.price, stock: m.stock, qty: 1 });
    drawCart();
  };
  const drawCart = () => {
    saveCart();
    $('#cartCount').textContent = cart.reduce((s, c) => s + c.qty, 0);
    $('#cart').innerHTML = cart.length ? cart.map((c, i) => `<div class="cart-line"><div><div class="nm">${esc(c.name)}</div><div class="lp">${money(c.price)} × ${c.qty} = ${money(c.price * c.qty)} ج.م</div></div>
      <div class="qty"><button data-dec="${i}" aria-label="أنقص">−</button><span>${c.qty}</span><button data-inc="${i}" aria-label="زوّد">+</button></div>
      <button class="x" data-del="${i}" aria-label="حذف">${icon('x')}</button></div>`).join('')
      : empty('cart', 'الفاتورة فاضية', 'اضغط على أي دواء لإضافته');
    $('#cartTotal').innerHTML = egp(cart.reduce((s, c) => s + c.price * c.qty, 0));
    $('#checkout').disabled = !cart.length; $('#clearCart').classList.toggle('hidden', !cart.length);
  };
  draw(); drawCart();
  $('#posSearch').oninput = draw;
  $('#posSearch').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim(), list = filtered();
    const hit = meds.find((m) => m.barcode && m.barcode === v) || (list.length === 1 ? list[0] : null);
    if (hit) { add(hit.id); e.target.value = ''; draw(); } else toast(list.length ? 'اختر الدواء من القائمة' : 'لا يوجد دواء بهذا الاسم', true);
  };
  $('#posList').onclick = (e) => { const b = e.target.closest('[data-add]'); if (b) add(Number(b.dataset.add)); };
  $('#cart').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.inc !== undefined) { const c = cart[+d.inc]; if (c.qty < c.stock) c.qty++; else toast(`المتاح ${c.stock} فقط`, true); }
    if (d.dec !== undefined) { const c = cart[+d.dec]; if (c.qty > 1) c.qty--; else cart.splice(+d.dec, 1); }
    if (d.del !== undefined) cart.splice(+d.del, 1);
    drawCart();
  };
  $('#clearCart').onclick = () => { cart = []; drawCart(); };
  $('#checkout').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const s = await api('/sales', 'POST', { customer: $('#customer').value, items: cart.map((c) => ({ medicine_id: c.id, qty: c.qty })) });
      cart = []; saveCart(); refreshBadge(); receipt(s); pos();
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}
function receipt(s) {
  const d = $('#dlg');
  d.innerHTML = `<div class="dlg-head"><h2>تم البيع بنجاح</h2><button class="x" id="closeDlg">${icon('x')}</button></div>
    <div class="dlg-body receipt"><div class="success-ring">${icon('check')}</div><div style="text-align:center" class="muted">فاتورة رقم #${s.id}${s.customer ? ' · ' + esc(s.customer) : ''}</div>
    ${s.items.map((i) => `<div class="r-line"><span>${esc(i.name)} × ${i.qty}</span><b>${money(i.price * i.qty)} ج.م</b></div>`).join('')}
    <div class="r-total"><span>الإجمالي</span><span>${money(s.total)} ج.م</span></div></div>
    <div class="dlg-foot"><button class="btn primary" id="newSale">${icon('plus')} بيع جديد</button><button class="btn" id="printR">${icon('print')} طباعة</button></div>`;
  $('#closeDlg').onclick = $('#newSale').onclick = () => d.close();
  $('#printR').onclick = () => window.print();
  d.showModal(); setTimeout(() => $('#posSearch') && $('#posSearch').focus(), 50);
}

/* ---------- inventory ---------- */
let invFilter = 'all';
async function inventory() {
  const el = $('#inventory');
  el.innerHTML = `<div class="toolbar"><div class="search">${icon('search')}<input id="invSearch" placeholder="ابحث في المخزون" autocomplete="off"></div>
    <div class="chips" id="chips"></div><button class="btn primary" id="newMed" style="margin-inline-start:auto">${icon('plus')} دواء جديد</button></div>
    <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>التصنيف</th><th>السعر</th><th>المخزون</th><th>أقرب انتهاء</th><th></th></tr></thead><tbody id="invList"></tbody></table></div>`;
  let meds = [];
  const flags = (m) => ({ low: m.stock <= m.min_stock, expired: m.expired_qty > 0, near: m.next_expiry && daysLeft(m.next_expiry) <= 60 });
  const draw = () => {
    const c = { all: meds.length, low: 0, near: 0, expired: 0 };
    meds.forEach((m) => { const f = flags(m); if (f.low) c.low++; if (f.near) c.near++; if (f.expired) c.expired++; });
    const L = { all: 'الكل', low: 'ناقص', near: 'قارب على الانتهاء', expired: 'به منتهي' };
    $('#chips').innerHTML = Object.keys(L).map((k) => `<button class="chip ${invFilter === k ? 'active' : ''}" data-f="${k}">${L[k]} <em>${c[k]}</em></button>`).join('');
    const rows = meds.filter((m) => invFilter === 'all' || flags(m)[invFilter]);
    $('#invList').innerHTML = rows.map((m) => {
      const f = flags(m), pct = Math.min(100, (m.stock / Math.max(1, m.min_stock * 3)) * 100), dl = m.next_expiry ? daysLeft(m.next_expiry) : null;
      return `<tr><td><b>${esc(m.name)}</b><div class="sub">${esc(m.generic)}${m.barcode ? ' · ' + esc(m.barcode) : ''}</div></td><td>${esc(m.category) || '-'}</td>
      <td class="num-cell">${money(m.price)} ج.م</td>
      <td><span class="tag ${f.low ? 'low' : 'ok'}">${m.stock} وحدة</span>${f.expired ? ` <span class="tag low">منتهي ${m.expired_qty}</span>` : ''}<div class="stock-bar"><span style="width:${pct}%;background:${f.low ? '#dc2626' : '#14b8a6'}"></span></div></td>
      <td>${m.next_expiry ? `${esc(m.next_expiry)}<div class="sub">${dl <= 60 ? `<span class="tag near">بعد ${dl} يوم</span>` : `بعد ${dl} يوم`}</div>` : '-'}</td>
      <td><div class="row-actions"><button class="btn sm" data-recv="${m.id}">${icon('down')} استلام</button><button class="btn sm" data-edit="${m.id}">${icon('edit')}</button><button class="btn sm danger" data-rm="${m.id}">${icon('trash')}</button></div></td></tr>`;
    }).join('') || `<tr><td colspan="6">${empty('box', 'لا توجد أصناف هنا', invFilter === 'all' ? 'أضف أول دواء للمخزون' : 'لا شيء في هذا التصنيف')}</td></tr>`;
    hydrateIcons(el);
  };
  const load = async () => { meds = await api('/medicines?q=' + encodeURIComponent($('#invSearch').value.trim())); draw(); };
  await load();
  let timer; $('#invSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(() => load().catch((e) => toast(e.message, true)), 220); };
  $('#chips').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { invFilter = b.dataset.f; draw(); } };
  $('#newMed').onclick = () => medForm(null, load);
  $('#invList').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return; const t = b.dataset; const find = (id) => meds.find((m) => m.id === Number(id));
    if (t.edit) medForm(find(t.edit), load);
    if (t.recv) batchForm(find(t.recv), load);
    if (t.rm) confirmBox(`حذف "${find(t.rm).name}"؟`, 'سيختفي الصنف من القوائم. سجل الفواتير القديمة يفضل كما هو.', async () => { await api('/medicines/' + t.rm, 'DELETE'); await load(); refreshBadge(); toast('تم حذف الصنف'); });
  };
}

function dialog(title, html, onSubmit, okText = 'حفظ') {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog"><div class="dlg-head"><h2>${title}</h2><button type="button" class="x" id="cancelX" aria-label="إغلاق">${icon('x')}</button></div>
    <div class="dlg-body">${html}</div><div class="dlg-foot"><button class="btn primary" value="ok" id="okBtn">${okText}</button><button type="button" class="btn" id="cancel">إلغاء</button></div></form>`;
  $('#cancel').onclick = $('#cancelX').onclick = () => d.close();
  const form = d.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#okBtn'); btn.disabled = true;
    form.querySelectorAll('.err-msg').forEach((x) => x.remove()); form.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
    try { await onSubmit(Object.fromEntries(new FormData(form))); d.close(); }
    catch (err) { toast(err.message, true); const m = err.field && form.querySelector(`[name=${err.field}]`); if (m) m.classList.add('invalid'); btn.disabled = false; }
  };
  d.showModal(); const first = form.querySelector('input'); if (first) first.focus();
}
function confirmBox(title, text, onYes) {
  const d = $('#dlg');
  d.innerHTML = `<div class="dlg-head"><h2>${title}</h2></div><div class="dlg-body"><p class="muted">${text}</p></div>
    <div class="dlg-foot"><button class="btn danger" id="yes">${icon('trash')} نعم، احذف</button><button class="btn" id="no">إلغاء</button></div>`;
  $('#no').onclick = () => d.close();
  $('#yes').onclick = async () => { try { await onYes(); d.close(); } catch (e) { toast(e.message, true); } };
  d.showModal();
}
function medForm(m, reload) {
  m = m || {};
  dialog(m.id ? 'تعديل دواء' : 'دواء جديد', `
    <label class="field">اسم الدواء *<input name="name" required value="${esc(m.name)}" placeholder="مثال: Paracetamol 500mg"></label>
    <div class="two-col"><label class="field">الاسم العلمي<input name="generic" value="${esc(m.generic)}"></label>
    <label class="field">التصنيف<input name="category" value="${esc(m.category)}" placeholder="مسكن، مضاد حيوي..."></label></div>
    <label class="field">الباركود<input name="barcode" value="${esc(m.barcode)}"></label>
    <div class="two-col"><label class="field">سعر البيع (ج.م) *<input name="price" type="number" step="0.01" min="0" required value="${m.price ?? ''}"></label>
    <label class="field">حد التنبيه للمخزون<input name="min_stock" type="number" min="0" value="${m.min_stock ?? 10}"></label></div>`,
  async (f) => { await api(m.id ? '/medicines/' + m.id : '/medicines', m.id ? 'PUT' : 'POST', f); toast(m.id ? 'تم تحديث الدواء' : 'تمت إضافة الدواء. استلم له دفعة ليظهر في المخزون'); await reload(); });
}
function batchForm(m, reload) {
  const min = new Date().toISOString().slice(0, 10);
  dialog('استلام دفعة', `<p class="muted" style="margin:6px 0 0">${esc(m.name)}</p>
    <div class="two-col"><label class="field">الكمية *<input name="qty" type="number" min="1" required></label>
    <label class="field">تاريخ الانتهاء *<input name="expiry" type="date" min="${min}" required></label></div>
    <div class="two-col"><label class="field">رقم التشغيلة<input name="batch_no" placeholder="يُولَّد تلقائيًا"></label>
    <label class="field">تكلفة الوحدة (ج.م)<input name="cost" type="number" step="0.01" min="0"></label></div>
    <label class="field">المورد<input name="supplier"></label>`,
  async (f) => { f.qty = Number(f.qty); await api(`/medicines/${m.id}/batches`, 'POST', f); toast('تم استلام الدفعة وتحديث المخزون'); await reload(); refreshBadge(); }, 'استلام');
}

/* ---------- alerts ---------- */
async function alerts() {
  const a = await api('/alerts');
  const section = (title, ic, color, tag, rows, row) => `<div class="card"><div class="alert-head"><span class="ico ${color}">${icon(ic)}</span>${title}<span class="tag ${tag} count">${rows.length}</span></div>
    ${rows.length ? `<div class="table-wrap" style="box-shadow:none"><table><tbody>${rows.map(row).join('')}</tbody></table></div>` : empty('check', 'كل شيء تمام', 'لا يوجد ما يحتاج تصرفًا هنا')}</div>`;
  const bRow = (cls) => (r) => `<tr><td><b>${esc(r.name)}</b><div class="sub">تشغيلة ${esc(r.batch_no)}</div></td><td>${r.qty} وحدة</td><td><span class="tag ${cls}">${esc(r.expiry)} (${daysLeft(r.expiry) < 0 ? 'منذ ' + -daysLeft(r.expiry) : 'بعد ' + daysLeft(r.expiry)} يوم)</span></td></tr>`;
  $('#alerts').innerHTML = `<div class="alert-sections">
    ${section('منتهية الصلاحية، اسحبها من الرف', 'warn', 'red', 'low', a.expired, bRow('low'))}
    ${section(`تنتهي خلال ${a.nearDays} يومًا`, 'clock', 'amber', 'near', a.nearExpiry, bRow('near'))}
    ${section('مخزون منخفض', 'box', 'blue', 'info', a.lowStock, (r) => `<tr><td><b>${esc(r.name)}</b></td><td>المتاح <b>${r.stock}</b> من حد ${r.min_stock}</td><td><button class="btn sm" data-recv="${r.id}">${icon('down')} استلام دفعة</button></td></tr>`)}</div>`;
  const root = $('#alerts');
  root.onclick = async (e) => {
    const b = e.target.closest('[data-recv]'); if (!b) return;
    const meds = await api('/medicines'); batchForm(meds.find((m) => m.id === Number(b.dataset.recv)), alerts);
  };
}

/* ---------- sales ---------- */
async function sales() {
  const list = await api('/sales');
  $('#sales').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>التاريخ (UTC)</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr><td><b>#${s.id}</b></td><td class="num-cell">${esc(s.created_at)}</td><td>${esc(s.customer || '-')}</td><td>${s.items}</td><td class="num-cell"><b>${money(s.total)} ج.م</b></td><td><button class="btn sm" data-inv="${s.id}">عرض الفاتورة</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="card">${empty('receipt', 'لا توجد فواتير بعد', 'أول عملية بيع هتظهر هنا', `<br><button class="btn primary" id="goPos">${icon('cart')} بيع جديد</button>`)}</div>`;
  const g = $('#goPos'); if (g) g.onclick = () => show('pos');
  $('#sales').onclick = async (e) => {
    const b = e.target.closest('[data-inv]'); if (!b) return;
    const s = await api('/sales/' + b.dataset.inv); const d = $('#dlg');
    d.innerHTML = `<div class="dlg-head"><h2>فاتورة #${s.id}</h2><button class="x" id="closeDlg">${icon('x')}</button></div>
      <div class="dlg-body receipt"><div class="muted">${esc(s.created_at)} UTC${s.customer ? ' · ' + esc(s.customer) : ''}</div>
      ${s.items.map((i) => `<div class="r-line"><span>${esc(i.name)} × ${i.qty}<div class="sub muted">تشغيلة ${esc(i.batch_no)}</div></span><b>${money(i.price * i.qty)} ج.م</b></div>`).join('')}
      <div class="r-total"><span>الإجمالي</span><span>${money(s.total)} ج.م</span></div></div>
      <div class="dlg-foot"><button class="btn" id="printR">${icon('print')} طباعة</button></div>`;
    $('#closeDlg').onclick = () => d.close(); $('#printR').onclick = () => window.print(); d.showModal();
  };
}

hydrateIcons();
if (token) start(); else $('#login').classList.remove('hidden');
