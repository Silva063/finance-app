/* ══════════════════════════════════════════════════
   СЧЕТА И ПЕРЕВОДЫ  (этап 1: одна валюта)

   Модель данных:
     opsState.accounts = [{ id, name, kind:'cash'|'card', currency, ord,
                            archived, _editedAt }]
     перевод — одна запись:
       { type:'transfer', from, to, amountFrom, amountTo, fee,
         amount: -fee, way, account: from, comment, ... }

   Два принципа, на которых держится совместимость:

   1. Старые операции не переписываются. Поля account у них нет — счёт
      выводится на лету из «способа» (Наличный → cash, иначе → card).
      Новые и отредактированные записи получают и account, и way.

   2. У перевода amount = −комиссия. Весь существующий код, который
      суммирует amount, сразу получает правильный общий итог: перевод на
      итог влияет только комиссией. А старая версия приложения на другом
      устройстве посчитает перевод расходом на сумму комиссии, а не на
      всю сумму обмена.
══════════════════════════════════════════════════ */

const OPS_DEFAULT_ACCOUNTS = [
  { id: 'cash', name: 'Наличные', kind: 'cash', currency: 'RUP', ord: 0 },
  { id: 'card', name: 'Безнал',   kind: 'card', currency: 'RUP', ord: 1 }
];

function _accR2(n) { return +(+n || 0).toFixed(2); }
function _accByOrd(a, b) {
  const ao = Number.isFinite(a.ord) ? a.ord : 1e9;
  const bo = Number.isFinite(b.ord) ? b.ord : 1e9;
  return ao - bo;
}

// id у счетов по умолчанию фиксированные — оба устройства создают одни и те
// же cash/card, поэтому при слиянии они совпадают, а не дублируются.
function opsAccounts() {
  if (!Array.isArray(opsState.accounts) || !opsState.accounts.length) {
    opsState.accounts = OPS_DEFAULT_ACCOUNTS.map(a => ({ ...a }));
  }
  return opsState.accounts.slice().sort(_accByOrd);
}
function opsActiveAccounts() { return opsAccounts().filter(a => !a.archived); }
function opsAcc(id)          { return opsAccounts().find(a => a.id === id) || null; }
function opsAccName(id)      { const a = opsAcc(id); return a ? a.name : (id || '—'); }

// «Способ» для совместимости со старыми версиями и вкладками, которые его читают
function opsAccWay(id) {
  const a = opsAcc(id);
  return a && a.kind === 'cash' ? 'Наличный' : 'Безналичный';
}

// Счёт по умолчанию нужного вида — для быстрого ввода «нал/безнал»
function opsAccDefaultOfKind(kind) {
  const act = opsActiveAccounts();
  const hit = act.find(a => a.kind === kind) || act[0];
  return hit ? hit.id : (kind === 'cash' ? 'cash' : 'card');
}

function opsTxnAccount(t) {
  if (t.account) return t.account;
  return t.way === 'Наличный' ? 'cash' : 'card';
}
function opsIsTransfer(t) { return t && t.type === 'transfer'; }

// Тип операции для статистики. Перевод не приход и не расход — расходом
// считается только его комиссия. Перевод без комиссии в статистику не идёт.
function opsStatType(t) {
  if (t.type === 'income')   return 'income';
  if (t.type === 'transfer') return (+t.fee > 0) ? 'expense' : null;
  return 'expense';
}

function opsTxnTouches(t, accId) {
  if (opsIsTransfer(t)) return t.from === accId || t.to === accId;
  return opsTxnAccount(t) === accId;
}

// Как операция меняет остаток конкретного счёта
function opsTxnDelta(t, accId) {
  if (opsIsTransfer(t)) {
    let d = 0;
    if (t.from === accId) d -= (+t.amountFrom || 0) + (+t.fee || 0);
    if (t.to   === accId) d += (+t.amountTo   || 0);
    return d;
  }
  return opsTxnAccount(t) === accId ? (+t.amount || 0) : 0;
}

function opsAccBalance(accId) {
  let s = 0;
  for (const t of opsState.txns) if (!t._deleted) s += opsTxnDelta(t, accId);
  return _accR2(s);
}

function opsAccUsed(accId) {
  return opsState.txns.some(t => !t._deleted && opsTxnTouches(t, accId));
}

/* ── Надгробия: счета сливаются по id ───────────── */

function opsAccsPurged(state) {
  const st = state || opsState;
  return Array.isArray(st.accPurged) ? st.accPurged : [];
}
function opsAddAccTombstones(ids) {
  const now  = new Date().toISOString();
  const list = opsAccsPurged().slice();
  const have = new Set(list.map(x => String(x.id)));
  for (const id of ids) {
    const key = String(id);
    if (!have.has(key)) { list.push({ id: key, at: now }); have.add(key); }
  }
  const cutoff = Date.now() - SYNC_TOMBSTONE_TTL_DAYS * 86400000;
  opsState.accPurged = list.filter(x => new Date(x.at || 0).getTime() >= cutoff);
}

function opsAccTouch(acc) {
  if (acc) acc._editedAt = new Date().toISOString();
  opsSave();
  if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
}

/* ── Общие кусочки разметки для строк операций ──── */

function opsTxnTypeTag(t, small) {
  const fs = small ? ' style="font-size:9px;"' : '';
  if (opsIsTransfer(t)) return `<span class="tag tag-transfer"${fs}>${small ? '⇄' : '⇄ Перевод'}</span>`;
  return t.type === 'income'
    ? `<span class="tag tag-income"${fs}>${small ? '↑' : '↑ Приход'}</span>`
    : `<span class="tag tag-expense"${fs}>${small ? '↓' : '↓ Расход'}</span>`;
}

function opsTxnAccTag(t, small) {
  const fs = small ? ' style="font-size:9px;"' : '';
  if (opsIsTransfer(t)) {
    return `<span class="tag tag-acc"${fs}>${escHtml(opsAccName(t.from))} → ${escHtml(opsAccName(t.to))}</span>`;
  }
  const id = opsTxnAccount(t);
  const a  = opsAcc(id);
  const cls = a && a.kind === 'cash' ? 'tag-cash' : 'tag-card';
  return `<span class="tag ${cls}"${fs}>${escHtml(opsAccName(id))}</span>`;
}

// Ячейка суммы: у перевода сумма нейтральная — это не расход
function opsTxnAmountHTML(t) {
  const fx = typeof opsFmtMoney === 'function';
  if (opsIsTransfer(t)) {
    const fee = +t.fee || 0;
    const fc  = fx ? opsAccCurrency(t.from) : '';
    const tc  = fx ? opsAccCurrency(t.to)   : '';
    const money = (n, c) => fx ? opsFmtMoney(n, c) : fmtAmt(n);
    // обмен валют: обе стороны и курс, зафиксированный этой записью
    const crossPart = (fx && fc !== tc && +t.amountTo > 0)
      ? ` → ${money(+t.amountTo, tc)}<span class="amt-sub">1 ${tc} = ${opsFmtRate(+t.amountFrom / +t.amountTo)} ${fc}</span>`
      : '';
    return `<span class="amt-transfer">${money(+t.amountFrom || 0, fc)}${crossPart}</span>` +
           (fee ? `<span class="amt-fee"> −${money(fee, fc)} комиссия</span>` : '');
  }
  const cur = fx ? opsTxnCurrency(t) : '';
  const main = `<span class="${t.amount >= 0 ? 'amt-pos' : 'amt-neg'}">${fx ? opsFmtMoney(t.amount, cur, true) : fmtAmt(t.amount, true)}</span>`;
  if (!fx || cur === opsBaseCurrency()) return main;
  const v = opsBaseAmountOrNull(t);
  return main + (v == null
    ? '<span class="amt-sub is-warn">нет курса</span>'
    : `<span class="amt-sub">≈ ${fmtAmt(v, true)} ${opsBaseCurrency()}</span>`);
}

/* ── Списки счетов в формах ─────────────────────── */

function opsFillAccSel(selId, selected, extraId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const list = opsActiveAccounts();
  // архивный счёт показываем, только если он уже выбран в редактируемой записи
  [selected, extraId].forEach(id => {
    if (id && !list.some(a => a.id === id) && opsAcc(id)) list.push(opsAcc(id));
  });
  sel.innerHTML = list.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)}${a.archived ? ' (архив)' : ''}</option>`
  ).join('');
  if (selected && list.some(a => a.id === selected)) sel.value = selected;
}

// Переключение формы операции между «приход/расход» и «перевод»
function opsModalTypeChange() {
  const typeEl = document.getElementById('m-type');
  if (!typeEl) return;
  const tr = typeEl.value === 'transfer';
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  show('m-transfer-row', tr);
  show('m-cat-field', !tr);
  show('m-items-details', !tr);
  const lbl = document.getElementById('m-acc-label');
  if (lbl) lbl.textContent = tr ? 'Со счёта' : 'Счёт';
  // в перевод по умолчанию — на другой счёт, а не на тот же
  if (tr) {
    const from = document.getElementById('m-acc');
    const to   = document.getElementById('m-acc-to');
    // форму могли открыть через шаблон — тогда список «На счёт» ещё пуст
    if (to && !to.options.length) opsFillAccSel('m-acc-to', opsAccDefaultOfKind('cash'));
    if (from && to && to.value === from.value) {
      const other = opsActiveAccounts().find(a => a.id !== from.value);
      if (other) to.value = other.id;
    }
  }
  if (typeof opsAcRun === 'function') opsAcRun();
  if (typeof opsFxFormSync === 'function') opsFxFormSync();
}

/* ── Вкладка «Счета» ────────────────────────────── */

function opsAccSelected() {
  const sel = document.getElementById('facc-acc');
  const act = opsActiveAccounts();
  if (sel && sel.value && opsAcc(sel.value)) return sel.value;
  return act[0] ? act[0].id : 'card';
}

function opsAccSelect(id) {
  const sel = document.getElementById('facc-acc');
  if (sel) sel.value = id;
  if (typeof opsFiltersSave === 'function') opsFiltersSave();
  renderAccounts();
}

function opsResetAcc() {
  ['facc-search', 'facc-year', 'facc-month'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  if (typeof opsFiltersForget === 'function') opsFiltersForget();
  renderAccounts();
}

function renderAccounts() {
  const accSel = document.getElementById('facc-acc');
  if (!accSel) return;
  const cur = accSel.value;
  const list = opsAccounts();
  accSel.innerHTML = list.filter(a => !a.archived || a.id === cur).map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)}${a.archived ? ' (архив)' : ''}</option>`).join('');
  const accId = (cur && opsAcc(cur)) ? cur : opsAccSelected();
  accSel.value = accId;

  fillYearSel('facc-year'); fillMonthSel('facc-month', 'facc-year');
  const search = (document.getElementById('facc-search')?.value || '').toLowerCase();
  const year   = document.getElementById('facc-year')?.value || '';
  const month  = document.getElementById('facc-month')?.value || '';

  // карточки балансов
  const act = opsActiveAccounts();
  const cards = act.map(a => {
    const b = opsAccBalance(a.id);
    return `<div class="stat-card is-clickable ${a.id === accId ? 'is-active' : ''}" onclick="opsAccSelect('${a.id}')">
      <div class="stat-card-label">${escHtml(a.name)}</div>
      <div class="stat-card-value ${b >= 0 ? 'is-pos' : 'is-neg'}">${opsFmtMoney(b, a.currency || 'RUP', true)}</div>
      <div class="stat-card-sub">${a.kind === 'cash' ? 'наличные' : 'безнал'} · ${escHtml(a.currency || 'RUP')}</div>
    </div>`;
  }).join('');
  // Итог в базовой валюте — по курсу последнего обмена, о чём честно пишем
  const tb = opsAccountsTotalBase();
  const totalSub = tb.missing.length
    ? `без ${tb.missing.join(', ')} — нет курса`
    : tb.rateDate ? `в ${tb.base}, по курсу обмена от ${tb.rateDate}`
                  : `${act.length} ${opsPlural(act.length, 'счёт', 'счёта', 'счетов')}`;
  const cardsEl = document.getElementById('acc-cards');
  if (cardsEl) cardsEl.innerHTML = cards + `<div class="stat-card">
      <div class="stat-card-label">Всего на счетах</div>
      <div class="stat-card-value ${tb.total >= 0 ? 'is-pos' : 'is-neg'}">${fmtAmt(tb.total, true)}</div>
      <div class="stat-card-sub">${totalSub}</div>
    </div>`;

  // Остаток считаем по всей истории счёта, а показываем отфильтрованное —
  // иначе при выбранном месяце нарастающий итог начинался бы с нуля и не
  // совпадал с реальным остатком.
  const all = opsState.txns
    .filter(t => !t._deleted && opsTxnTouches(t, accId))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  let run = 0;
  const withRun = all.map(t => { const d = opsTxnDelta(t, accId); run = _accR2(run + d); return { t, d, run }; });

  let rows = withRun;
  if (month)     rows = rows.filter(r => r.t.date.startsWith(month));
  else if (year) rows = rows.filter(r => r.t.date.startsWith(year));
  if (search)    rows = rows.filter(r =>
    (r.t.comment || '').toLowerCase().includes(search) ||
    (r.t.items || []).some(i => (i.name || '').toLowerCase().includes(search)));

  const accCur = opsAccCurrency(accId);
  const countEl = document.getElementById('acc-count');
  if (countEl) countEl.textContent = `${rows.length} ${opsPlural(rows.length, 'операция', 'операции', 'операций')} · остаток ${opsFmtMoney(opsAccBalance(accId), accCur, true)}`;

  const body = document.getElementById('acc-body');
  if (!body) return;
  body.innerHTML = rows.slice().reverse().map(({ t, d, run }) => `<tr data-txnid="${t.id}">
    <td style="white-space:nowrap;color:var(--muted)">${fmtDate(t.date)}</td>
    <td><div class="txn-tags">${opsTxnTypeTag(t)}${opsIsTransfer(t) ? opsTxnAccTag(t) : ''}</div></td>
    <td class="${d >= 0 ? 'amt-pos' : 'amt-neg'}" style="font-weight:500;white-space:nowrap">${opsFmtMoney(d, accCur, true)}</td>
    <td style="color:var(--muted);font-size:11px;white-space:nowrap">${opsFmtMoney(run, accCur, true)}</td>
    <td style="color:var(--muted)">${escHtml(t.comment) || '—'}</td>
    <td><button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')">✎</button></td>
  </tr>`).join('');
}

/* ── Управление счетами ─────────────────────────── */

function opsAccOpenModal()  { opsAccRenderModal(); document.getElementById('acc-modal')?.classList.add('is-open'); }
function opsAccCloseModal() { document.getElementById('acc-modal')?.classList.remove('is-open'); }

function opsAccRenderModal() {
  const box = document.getElementById('acc-list');
  if (!box) return;
  const list = opsAccounts();
  box.innerHTML = list.map((a, i) => {
    const used = opsAccUsed(a.id);
    return `<div class="acc-row ${a.archived ? 'is-archived' : ''}">
      <div class="acc-row-order">
        <button type="button" class="row-edit-btn" title="Выше" ${i === 0 ? 'disabled' : ''} onclick="opsAccMove('${a.id}',-1)">↑</button>
        <button type="button" class="row-edit-btn" title="Ниже" ${i === list.length - 1 ? 'disabled' : ''} onclick="opsAccMove('${a.id}',1)">↓</button>
      </div>
      <input type="text" class="filter-input acc-row-name" value="${escHtml(a.name)}"
             onchange="opsAccRename('${a.id}', this.value)">
      <select class="filter-input acc-row-kind" onchange="opsAccSetKind('${a.id}', this.value)">
        <option value="cash" ${a.kind === 'cash' ? 'selected' : ''}>нал</option>
        <option value="card" ${a.kind !== 'cash' ? 'selected' : ''}>безнал</option>
      </select>
      <select class="filter-input acc-row-cur" ${used ? 'disabled title="По счёту есть операции — валюту менять нельзя, иначе пересчитается вся история"' : ''}
              onchange="opsAccSetCurrency('${a.id}', this.value)">
        ${opsCurrencies().map(c => `<option value="${escHtml(c.id)}" ${c.id === (a.currency || 'RUP') ? 'selected' : ''}>${escHtml(c.id)}</option>`).join('')}
      </select>
      <span class="acc-row-bal">${opsFmtMoney(opsAccBalance(a.id), a.currency || 'RUP', true)}</span>
      <button type="button" class="btn btn-sm" onclick="opsAccToggleArchive('${a.id}')"
              title="${a.archived ? 'Вернуть из архива' : 'Скрыть из выбора, история сохранится'}">${a.archived ? 'Вернуть' : 'В архив'}</button>
      <button type="button" class="btn btn-sm btn-danger" ${used ? 'disabled title="По счёту есть операции — его можно только архивировать"' : 'title="Удалить счёт"'}
              onclick="opsAccDelete('${a.id}')">✕</button>
    </div>`;
  }).join('');
}

function opsAccAdd() {
  appPrompt('Название нового счёта:', '').then(name => {
    const nm = (name || '').trim();
    if (!nm) return;
    const list = opsAccounts();
    const acc = { id: 'acc_' + Date.now().toString(36), name: nm, kind: 'card', currency: opsBaseCurrency(),
                  ord: list.length, _editedAt: new Date().toISOString() };
    opsState.accounts.push(acc);
    opsAccTouch(null);
    opsAccRenderModal();
    opsReRenderCurrent();
  });
}

function opsAccRename(id, name) {
  const a = opsState.accounts.find(x => x.id === id);
  const nm = (name || '').trim();
  if (!a || !nm) { opsAccRenderModal(); return; }
  a.name = nm;
  opsAccTouch(a);
  opsReRenderCurrent();
}

function opsAccSetKind(id, kind) {
  const a = opsState.accounts.find(x => x.id === id);
  if (!a) return;
  a.kind = kind === 'cash' ? 'cash' : 'card';
  opsAccTouch(a);
  opsAccRenderModal();
  opsReRenderCurrent();
}

// Валюту меняем только у пустого счёта: у счёта с историей это молча
// переинтерпретировало бы все прошлые суммы в другой валюте.
function opsAccSetCurrency(id, cur) {
  const a = opsState.accounts.find(x => x.id === id);
  if (!a) return;
  if (opsAccUsed(id)) { showWarn('По счёту есть операции — валюту менять нельзя'); opsAccRenderModal(); return; }
  a.currency = cur;
  opsAccTouch(a);
  opsAccRenderModal();
  opsReRenderCurrent();
}

function opsAccToggleArchive(id) {
  const a = opsState.accounts.find(x => x.id === id);
  if (!a) return;
  if (!a.archived && opsActiveAccounts().length <= 1) { showWarn('Должен остаться хотя бы один активный счёт'); return; }
  a.archived = !a.archived;
  opsAccTouch(a);
  opsAccRenderModal();
  opsReRenderCurrent();
}

function opsAccMove(id, dir) {
  const list = opsAccounts();
  const i = list.findIndex(a => a.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // порядок — явным полем, иначе слияние по id его не сохранит
  const now = new Date().toISOString();
  list.forEach((a, k) => { a.ord = k; a._editedAt = now; });
  opsAccTouch(null);
  opsAccRenderModal();
  opsReRenderCurrent();
}

function opsAccDelete(id) {
  if (opsAccUsed(id)) { showWarn('По счёту есть операции — его можно только архивировать'); return; }
  if (opsAccounts().length <= 1) { showWarn('Нельзя удалить последний счёт'); return; }
  const a = opsAcc(id);
  appConfirm(`Удалить счёт «${a ? a.name : id}»?`).then(ok => {
    if (!ok) return;
    opsAddAccTombstones([id]);
    opsState.accounts = opsState.accounts.filter(x => x.id !== id);
    opsAccTouch(null);
    opsAccRenderModal();
    opsReRenderCurrent();
  });
}
