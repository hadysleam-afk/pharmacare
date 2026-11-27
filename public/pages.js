'use strict';
/* PharmaCare v2 pages: customers, suppliers, purchases, reports, users.
   Loaded after app.js; uses its helpers (api, esc, money, egp, icon, toast, dialog, download, show). */

/* ---------- customers ---------- */
async function customers() {
  const el = $('#customers');
  el.innerHTML = `<div class="toolbar"><div class="search">${icon('search')}<input id="custSearch" placeholder="ابحث بالاسم أو التليفون" autocomplete="off"></div>
    <button class="btn primary" id="newCust" style="margin-inline-start:auto">${icon('plus')} عميل جديد</button></div>
    <div class="table-wrap"><table><thead><tr><th>العميل</th><th>التليفون</th><th>الفواتير</th><th>إجمالي المشتريات</th><th>آخر زيارة</th><th></th></tr></thead><tbody id="custTable"></tbody></table></div>`;
  let rows = [];
  const draw = () => {
    $('#custTable').innerHTML = rows.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.notes ? `<div class="sub">${esc(c.notes)}</div>` : ''}</td>
      <td class="num-cell">${esc(c.phone || '-')}</td><td>${c.invoices}</td>
      <td class="num-cell"><b>${money(c.spent)} ج.م</b></td><td class="num-cell">${c.last_visit ? esc(c.last_visit.slice(0, 10)) : '-'}</td>
      <td><div class="row-actions"><button class="btn sm" data-view="${c.id}">عرض</button><button class="btn sm" data-edit="${c.id}">${icon('edit')}</button></div></td></tr>`).join('')
      || `<tr><td colspan="6">${empty('users', 'لا يوجد عملاء', 'العملاء بيتسجلوا تلقائيًا عند البيع باسمهم، أو أضف عميلًا يدويًا')}</td></tr>`;
    hydrateIcons(el);
  };
  const load = async () => { rows = await api('/customers?q=' + encodeURIComponent($('#custSearch').value.trim())); draw(); };
  await load();
  let timer; $('#custSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(() => load().catch((e) => toast(e.message, true)), 220); };
  $('#newCust').onclick = () => custForm(null, load);
  $('#custTable').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) custForm(rows.find((c) => c.id === Number(b.dataset.edit)), load);
    if (b.dataset.view) {
      const c = await api('/customers/' + b.dataset.view);
      const d = $('#dlg');
      d.innerHTML = `<div class="dlg-head"><h2>${esc(c.name)}</h2><button class="x" id="closeDlg">${icon('x')}</button></div>
        <div class="dlg-body"><div class="muted">${c.phone ? esc(c.phone) + ' · ' : ''}${c.invoices !== undefined ? '' : ''}${c.sales.length ? `إجمالي المشتريات <b>${money(c.spent)} ج.م</b>` : 'لا مشتريات بعد'}</div>
        ${c.sales.length ? `<div class="table-wrap" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>#</th><th>التاريخ</th><th>الوحدات</th><th>الإجمالي</th></tr></thead><tbody>
          ${c.sales.map((s) => `<tr><td><b>#${s.id}</b></td><td class="num-cell">${esc(s.created_at.slice(0, 10))}</td><td>${s.items}</td><td class="num-cell">${money(s.total)} ج.م${s.refunded ? ` <span class="tag near">مرتجع ${money(s.refunded)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
        <div class="dlg-foot"><button class="btn" id="close2">إغلاق</button></div>`;
      $('#closeDlg').onclick = $('#close2').onclick = () => d.close();
      d.showModal();
    }
  };
}
function custForm(c, reload) {
  c = c || {};
  dialog(c.id ? 'تعديل عميل' : 'عميل جديد', `
    <label class="field">اسم العميل *<input name="name" required value="${esc(c.name)}"></label>
    <label class="field">التليفون<input name="phone" value="${esc(c.phone)}" placeholder="01xxxxxxxxx"></label>
    <label class="field">ملاحظات<input name="notes" value="${esc(c.notes)}" placeholder="مثال: عميل شهري، حساب آجل..."></label>`,
  async (f) => { await api(c.id ? '/customers/' + c.id : '/customers', c.id ? 'PUT' : 'POST', f); toast(c.id ? 'تم تحديث العميل' : 'تمت إضافة العميل'); await reload(); });
}

/* ---------- suppliers ---------- */
async function suppliers() {
  const el = $('#suppliers');
  el.innerHTML = `<div class="toolbar"><button class="btn primary" id="newSup" style="margin-inline-start:auto">${icon('plus')} مورد جديد</button></div>
    <div class="table-wrap"><table><thead><tr><th>المورد</th><th>الشركة</th><th>التليفون</th><th>فواتير الشراء</th><th>إجمالي المشتريات</th><th>التشغيلات</th><th></th></tr></thead><tbody id="supList2"></tbody></table></div>`;
  let rows = [];
  const draw = () => {
    $('#supList2').innerHTML = rows.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.notes ? `<div class="sub">${esc(s.notes)}</div>` : ''}</td>
      <td>${esc(s.company || '-')}</td><td class="num-cell">${esc(s.phone || '-')}</td><td>${s.purchases}</td>
      <td class="num-cell"><b>${money(s.bought)} ج.م</b></td><td>${s.batches}</td>
      <td><div class="row-actions"><button class="btn sm" data-view="${s.id}">عرض</button><button class="btn sm" data-edit="${s.id}">${icon('edit')}</button></div></td></tr>`).join('')
      || `<tr><td colspan="7">${empty('truck', 'لا يوجد موردون', 'أضف موردًا أو سجّل أول فاتورة شراء وسيُنشأ تلقائيًا')}</td></tr>`;
    hydrateIcons(el);
  };
  const load = async () => { rows = await api('/suppliers'); draw(); };
  await load();
  $('#newSup').onclick = () => supForm(null, load);
  $('#supList2').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) supForm(rows.find((s) => s.id === Number(b.dataset.edit)), load);
    if (b.dataset.view) {
      const s = await api('/suppliers/' + b.dataset.view);
      const d = $('#dlg');
      d.innerHTML = `<div class="dlg-head"><h2>${esc(s.name)}</h2><button class="x" id="closeDlg">${icon('x')}</button></div>
        <div class="dlg-body"><div class="muted">${[s.company, s.phone].filter(Boolean).map(esc).join(' · ') || 'بدون بيانات اتصال'}${s.purchases.length ? ` · إجمالي المشتريات <b>${money(s.bought)} ج.م</b>` : ''}</div>
        ${s.purchases.length ? `<div class="table-wrap" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>#</th><th>التاريخ</th><th>الوحدات</th><th>الإجمالي</th></tr></thead><tbody>
          ${s.purchases.map((p) => `<tr><td><b>#${p.id}</b></td><td class="num-cell">${esc(p.created_at.slice(0, 10))}</td><td>${p.items}</td><td class="num-cell">${money(p.total)} ج.م</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin-top:10px">لا فواتير شراء بعد.</p>'}</div>
        <div class="dlg-foot"><button class="btn" id="close2">إغلاق</button></div>`;
      $('#closeDlg').onclick = $('#close2').onclick = () => d.close();
      d.showModal();
    }
  };
}
function supForm(s, reload) {
  s = s || {};
  dialog(s.id ? 'تعديل مورد' : 'مورد جديد', `
    <label class="field">اسم المورد *<input name="name" required value="${esc(s.name)}"></label>
    <div class="two-col"><label class="field">الشركة<input name="company" value="${esc(s.company)}"></label>
    <label class="field">التليفون<input name="phone" value="${esc(s.phone)}"></label></div>
    <label class="field">ملاحظات<input name="notes" value="${esc(s.notes)}"></label>`,
  async (f) => { await api(s.id ? '/suppliers/' + s.id : '/suppliers', s.id ? 'PUT' : 'POST', f); toast(s.id ? 'تم تحديث المورد' : 'تمت إضافة المورد'); await reload(); });
}

/* ---------- purchases ---------- */
async function purchases() {
  const el = $('#purchases');
  const [list, meds, sups] = await Promise.all([api('/purchases'), api('/medicines'), api('/suppliers')]);
  el.innerHTML = `<div class="toolbar"><button class="btn" id="exportPur">${icon('down')} Excel</button>
    <button class="btn primary" id="newPur" style="margin-inline-start:auto">${icon('plus')} فاتورة شراء جديدة</button></div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>التاريخ (UTC)</th><th>المورد</th><th>الوحدات</th><th>الإجمالي</th><th>سجّلها</th><th></th></tr></thead><tbody>
    ${list.map((p) => `<tr><td><b>#${p.id}</b></td><td class="num-cell">${esc(p.created_at)}</td><td>${esc(p.supplier_name || '-')}</td><td>${p.items}</td>
      <td class="num-cell"><b>${money(p.total)} ج.م</b></td><td>${esc(p.created_by || '-')}</td>
      <td><button class="btn sm" data-view="${p.id}">عرض الفاتورة</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="card">${empty('truck', 'لا توجد فواتير شراء', 'سجّل أول فاتورة شراء وستضاف تشغيلاتها للمخزون تلقائيًا', `<br><button class="btn primary" id="newPur2">${icon('plus')} فاتورة شراء جديدة</button>`)}</div>`}`;
  $('#exportPur').onclick = () => download('/export/purchases.csv', 'purchases.csv').then(() => toast('تم تنزيل ملف المشتريات')).catch((e) => toast(e.message, true));
  const openForm = () => purchaseForm(meds, sups, purchases);
  const b1 = $('#newPur'), b2 = $('#newPur2'); if (b1) b1.onclick = openForm; if (b2) b2.onclick = openForm;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    const p = await api('/purchases/' + b.dataset.view);
    const d = $('#dlg');
    d.innerHTML = `<div class="dlg-head"><h2>فاتورة شراء #${p.id}</h2><button class="x" id="closeDlg">${icon('x')}</button></div>
      <div class="dlg-body receipt"><div class="muted">${esc(p.created_at)} UTC${p.supplier_name ? ' · ' + esc(p.supplier_name) : ''}${p.created_by ? ' · سجّلها: ' + esc(p.created_by) : ''}</div>
      ${p.items.map((i) => `<div class="r-line"><span>${esc(i.name)} × ${i.qty}<div class="sub muted">تشغيلة ${esc(i.batch_no)} · تنتهي ${esc(i.expiry)}</div></span><b>${money(i.cost * i.qty)} ج.م</b></div>`).join('')}
      <div class="r-total"><span>الإجمالي</span><span>${money(p.total)} ج.م</span></div></div>
      <div class="dlg-foot"><button class="btn" id="printR">${icon('print')} طباعة</button></div>`;
    $('#closeDlg').onclick = () => d.close(); $('#printR').onclick = () => window.print();
    d.showModal();
  };
}
function purchaseForm(meds, sups, reload) {
  const min = new Date().toISOString().slice(0, 10);
  const d = $('#dlg');
  const lineHtml = () => `<div class="pur-line">
    <select data-l-med required><option value="">اختر الدواء...</option>${meds.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
    <input type="number" min="1" placeholder="الكمية" data-l-qty required>
    <input type="date" min="${min}" data-l-exp required title="تاريخ الانتهاء">
    <input type="number" min="0" step="0.01" placeholder="تكلفة الوحدة" data-l-cost required>
    <button type="button" class="x" data-l-del aria-label="حذف السطر">${icon('x')}</button></div>`;
  d.innerHTML = `<form method="dialog"><div class="dlg-head"><h2>فاتورة شراء جديدة</h2><button type="button" class="x" id="cancelX">${icon('x')}</button></div>
    <div class="dlg-body">
      <label class="field">المورد<select name="supplier_id"><option value="">— مورد جديد بالاسم —</option>${sups.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field" id="newSupName">اسم المورد الجديد<input name="supplier" placeholder="يُنشأ تلقائيًا في قائمة الموردين"></label>
      <div id="purLines">${lineHtml()}</div>
      <button type="button" class="btn sm" id="addLine">${icon('plus')} سطر آخر</button>
      <div class="cart-total"><span>إجمالي الفاتورة</span><span id="purTotal">0.00 ج.م</span></div>
    </div>
    <div class="dlg-foot"><button class="btn primary" id="okBtn">تسجيل الفاتورة</button><button type="button" class="btn" id="cancel">إلغاء</button></div></form>`;
  hydrateIcons(d);
  $('#cancel').onclick = $('#cancelX').onclick = () => d.close();
  const form = d.querySelector('form');
  const total = () => {
    let t = 0;
    d.querySelectorAll('.pur-line').forEach((l) => { t += (Number(l.querySelector('[data-l-qty]').value) || 0) * (Number(l.querySelector('[data-l-cost]').value) || 0); });
    $('#purTotal').textContent = money(t) + ' ج.م';
  };
  form.elements.supplier_id.onchange = () => { $('#newSupName').style.display = form.elements.supplier_id.value ? 'none' : ''; };
  form.elements.supplier_id.onchange();
  $('#addLine').onclick = () => { $('#purLines').insertAdjacentHTML('beforeend', lineHtml()); hydrateIcons($('#purLines')); };
  d.addEventListener('input', total);
  d.addEventListener('click', (e) => { const b = e.target.closest('[data-l-del]'); if (b && d.querySelectorAll('.pur-line').length > 1) { b.closest('.pur-line').remove(); total(); } });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#okBtn'); btn.disabled = true;
    const items = [...d.querySelectorAll('.pur-line')].map((l) => ({
      medicine_id: Number(l.querySelector('[data-l-med]').value), qty: Number(l.querySelector('[data-l-qty]').value),
      expiry: l.querySelector('[data-l-exp]').value, cost: Number(l.querySelector('[data-l-cost]').value),
    }));
    try {
      const p = await api('/purchases', 'POST', {
        supplier_id: form.elements.supplier_id.value ? Number(form.elements.supplier_id.value) : undefined,
        supplier: form.elements.supplier_id.value ? undefined : form.elements.supplier.value,
        items,
      });
      toast(`تم تسجيل فاتورة الشراء #${p.id} وأُضيفت ${p.items.length} تشغيلة للمخزون`);
      d.close(); reload(); refreshBadge();
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
  d.showModal();
}

/* ---------- reports ---------- */
const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
async function reports() {
  const el = $('#reports');
  el.innerHTML = `<div class="toolbar"><div class="chips" id="presets">
      <button class="chip" data-p="0">اليوم</button><button class="chip active" data-p="7">آخر 7 أيام</button>
      <button class="chip" data-p="30">آخر 30 يومًا</button><button class="chip" data-p="month">هذا الشهر</button></div>
    <label class="rep-date">من <input type="date" id="repFrom" value="${isoDay(-6)}"></label>
    <label class="rep-date">إلى <input type="date" id="repTo" value="${isoDay(0)}"></label>
    <button class="btn primary sm" id="repGo">عرض</button>
    <button class="btn" id="repCsv" style="margin-inline-start:auto">${icon('down')} تصدير المبيعات Excel</button></div>
  <div id="repBody"></div>`;
  const render = async () => {
    const from = $('#repFrom').value, to = $('#repTo').value;
    const body = $('#repBody'); skeleton(body);
    try {
      const r = await api(`/reports/sales?from=${from}&to=${to}`);
      const max = Math.max(1, ...r.daily.map((x) => x.total));
      const topMax = Math.max(1, ...r.top.map((t) => t.qty));
      const catMax = Math.max(1, ...r.categories.map((c) => c.revenue));
      const stat = (ic, color, lbl, val, sub = '') => `<div class="card stat"><span class="ico ${color}">${icon(ic)}</span><div><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
      body.innerHTML = `<div class="grid stats">
          ${stat('money', 'green', 'صافي المبيعات', money(r.net), `إجمالي ${money(r.revenue)} قبل المرتجعات`)}
          ${stat('receipt', 'blue', 'عدد الفواتير', r.invoices, `متوسط الفاتورة ${money(r.avgInvoice)} ج.م`)}
          ${stat('rotate', 'amber', 'المرتجعات', money(r.returned))}
          ${stat('trend', r.profit >= 0 ? 'green' : 'red', 'الربح التقديري', money(r.profit), 'المبيعات − المرتجعات − تكلفة المباع')}
        </div>
        <div class="grid two">
          <div class="card"><h2>${icon('chart')} المبيعات اليومية</h2>
            <div class="bars">${r.daily.map((x, i) => `<div class="bar ${x.date === isoDay(0) ? 'today' : ''}" title="${esc(x.date)}: ${money(x.total)} ج.م (${x.invoices} فاتورة)"><span class="num">${x.total ? Math.round(x.total) : ''}</span><div class="col" style="height:0" data-h="${(x.total / max) * 100}"></div><span class="day">${r.daily.length <= 12 ? dayName(x.date) : x.date.slice(8)}</span></div>`).join('')}</div></div>
          <div class="card"><h2>${icon('pill')} المبيعات حسب التصنيف</h2>
            ${r.categories.length ? `<div class="toplist">${r.categories.map((c) => `<div class="toprow"><span>${esc(c.category)}</span><span>${money(c.revenue)} ج.م</span><div class="meter" style="grid-column:1/3"><span style="width:${(c.revenue / catMax) * 100}%"></span></div></div>`).join('')}</div>` : empty('pill', 'لا مبيعات في الفترة', 'جرّب فترة أطول')}</div>
        </div>
        <div class="card"><h2>${icon('trend')} الأكثر مبيعًا في الفترة</h2>
          ${r.top.length ? `<div class="toplist">${r.top.map((t, i) => `<div class="toprow"><span class="rank">${i + 1}</span><span>${esc(t.name)}</span><span>${t.qty} وحدة · ${money(t.revenue)} ج.م</span><div class="meter"><span style="width:${(t.qty / topMax) * 100}%"></span></div></div>`).join('')}</div>` : empty('receipt', 'لا مبيعات في الفترة', 'جرّب فترة أطول')}</div>`;
      hydrateIcons(body);
      requestAnimationFrame(() => requestAnimationFrame(() => body.querySelectorAll('.col').forEach((c) => (c.style.height = c.dataset.h + '%'))));
    } catch (e) { body.innerHTML = `<div class="card">${empty('warn', 'تعذر تحميل التقرير', esc(e.message))}</div>`; hydrateIcons(body); }
  };
  $('#repGo').onclick = render;
  $('#presets').onclick = (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    document.querySelectorAll('#presets .chip').forEach((c) => c.classList.toggle('active', c === b));
    const p = b.dataset.p;
    $('#repFrom').value = p === 'month' ? isoDay(0).slice(0, 8) + '01' : isoDay(-Number(p) + (p === '0' ? 0 : 1));
    $('#repTo').value = isoDay(0);
    render();
  };
  $('#repCsv').onclick = () => download(`/export/sales.csv?from=${$('#repFrom').value}&to=${$('#repTo').value}`, 'sales.csv').then(() => toast('تم تنزيل ملف المبيعات')).catch((e) => toast(e.message, true));
  await render();
}

/* ---------- users ---------- */
async function users() {
  const el = $('#users');
  const list = await api('/users');
  el.innerHTML = `<div class="toolbar"><button class="btn primary" id="newUser" style="margin-inline-start:auto">${icon('plus')} مستخدم جديد</button></div>
    <div class="table-wrap"><table><thead><tr><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>أُنشئ</th><th></th></tr></thead><tbody>
    ${list.map((u) => `<tr><td><b>${esc(u.username)}</b>${u.username === me.username ? ' <span class="tag info">أنت</span>' : ''}</td>
      <td><span class="tag ${u.role === 'admin' ? 'info' : 'ok'}">${u.role === 'admin' ? 'مدير' : 'بائع'}</span></td>
      <td>${u.active ? '<span class="tag ok">نشط</span>' : '<span class="tag low">معطّل</span>'}</td>
      <td class="num-cell">${esc(u.created_at.slice(0, 10))}</td>
      <td><div class="row-actions">
        <button class="btn sm" data-role="${u.id}" data-cur="${u.role}">${icon('shield')} تغيير الدور</button>
        <button class="btn sm" data-pass="${u.id}">${icon('edit')} كلمة المرور</button>
        <button class="btn sm ${u.active ? 'danger' : ''}" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'تعطيل' : 'تفعيل'}</button>
      </div></td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin-top:12px">البائع يبيع ويسجّل مرتجعات ويرى التنبيهات والعملاء فقط. المدير يدير المخزون والمشتريات والموردين والتقارير والمستخدمين.</p>`;
  hydrateIcons(el);
  $('#newUser').onclick = () => {
    dialog('مستخدم جديد', `
      <label class="field">اسم المستخدم *<input name="username" required minlength="3" autocomplete="off"></label>
      <label class="field">كلمة المرور *<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
      <label class="field">الدور<select name="role"><option value="seller">بائع</option><option value="admin">مدير</option></select></label>`,
    async (f) => { await api('/users', 'POST', f); toast('تم إنشاء المستخدم'); users(); }, 'إنشاء');
  };
  el.querySelector('tbody').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return; const t = b.dataset;
    try {
      if (t.role) {
        const next = t.cur === 'admin' ? 'seller' : 'admin';
        await api('/users/' + t.role, 'PUT', { role: next });
        toast('تم تغيير الدور'); users();
      }
      if (t.toggle) {
        await api('/users/' + t.toggle, 'PUT', { active: t.active === '1' ? false : true });
        toast(t.active === '1' ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب'); users();
      }
      if (t.pass) {
        dialog('كلمة مرور جديدة', `<label class="field">كلمة المرور الجديدة *<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
          <p class="muted">سيتم تسجيل خروج هذا المستخدم من كل الأجهزة.</p>`,
        async (f) => { await api('/users/' + t.pass, 'PUT', { password: f.password }); toast('تم تغيير كلمة المرور'); }, 'تغيير');
      }
    } catch (err) { toast(err.message, true); }
  };
}
