/* ══════════════════════════════════════════════════
   ВАЛЮТЫ И КУРСЫ  (этап 2)

   Модель:
     opsState.currencies = [{ id:'USD', name, ord, _editedAt }]   id = код
     opsState.fxCfg      = { base:'RUP', _editedAt }              базовая валюта
     у счёта            — currency
     у прихода/расхода на валютном счёте — rate и rateTo:
         1 единица валюты счёта = rate единиц rateTo (базовой на момент ввода)
     у перевода между валютами — amountFrom и amountTo в своих валютах;
         курс выводится из них и тем самым зафиксирован навсегда.

   Статистика (вариант А): всё пересчитывается в базовую валюту через
   opsBaseAmount(t). Для операций в базовой валюте это ровно t.amount —
   поэтому для старых данных в рублях ПМР ничего не меняется.

   Курс для подстановки (opsFxRate): последний обмен между валютами не
   позже даты операции; если обменов не было — последний курс, введённый
   руками в валютной операции; если и его нет — через базовую валюту.
══════════════════════════════════════════════════ */

const OPS_DEFAULT_CURRENCIES = [
  { id: 'RUP', name: 'Рубль ПМР',         ord: 0 },
  { id: 'USD', name: 'Доллар США',        ord: 1 },
  { id: 'EUR', name: 'Евро',              ord: 2 },
  { id: 'MDL', name: 'Молдавский лей',    ord: 3 },
  { id: 'RUB', name: 'Российский рубль',  ord: 4 }
];

function _fxByOrd(a, b) {
  const ao = Number.isFinite(a.ord) ? a.ord : 1e9;
  const bo = Number.isFinite(b.ord) ? b.ord : 1e9;
  return ao - bo;
}

function opsCurrencies() {
  if (!Array.isArray(opsState.currencies) || !opsState.currencies.length) {
    opsState.currencies = OPS_DEFAULT_CURRENCIES.map(c => ({ ...c }));
  }
  return opsState.currencies.slice().sort(_fxByOrd);
}
function opsCur(code) { return opsCurrencies().find(c => c.id === code) || null; }

function opsBaseCurrency() {
  return (opsState.fxCfg && opsState.fxCfg.base) || 'RUP';
}

// Валюта счёта. У счетов по умолчанию явно RUP — старые данные в рублях ПМР.
function opsAccCurrency(accId) {
  const a = (typeof opsAcc === 'function') ? opsAcc(accId) : null;
  return (a && a.currency) || 'RUP';
}

// Валюта, в которой записана сумма операции (у перевода — сторона «откуда»)
function opsTxnCurrency(t) {
  if (t && t.type === 'transfer') return opsAccCurrency(t.from);
  return opsAccCurrency(opsTxnAccount(t));
}

// Сумма с кодом валюты — код показываем только для небазовой, чтобы для
// обычных рублёвых операций интерфейс выглядел ровно как раньше.
function opsFmtMoney(n, cur, sign) {
  const s = fmtAmt(n, sign);
  return (cur && cur !== opsBaseCurrency()) ? s + ' ' + cur : s;
}

function opsFmtRate(r) {
  if (!(r > 0)) return '—';
  const digits = r >= 100 ? 2 : r >= 1 ? 4 : 6;
  return (+r.toFixed(digits)).toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

/* ── Поиск курса ─────────────────────────────────── */

// Курс по обменам: 1 from = r to, по последнему переводу между этими валютами
function _fxFromExchanges(from, to, date) {
  let best = null;
  for (const t of opsState.txns) {
    if (t._deleted || t.type !== 'transfer' || (date && t.date > date)) continue;
    const a = +t.amountFrom, b = +t.amountTo;
    if (!(a > 0) || !(b > 0)) continue;
    const fc = opsAccCurrency(t.from), tc = opsAccCurrency(t.to);
    let r = null;
    if (fc === from && tc === to) r = b / a;
    else if (fc === to && tc === from) r = a / b;
    if (r == null) continue;
    if (!best || t.date > best.date || (t.date === best.date && String(t.id) > String(best.id)))
      best = { r, date: t.date, id: t.id };
  }
  return best;
}

// Курс, введённый руками в валютных приходах и расходах
function _fxFromManual(from, to, date) {
  let best = null;
  for (const t of opsState.txns) {
    if (t._deleted || t.type === 'transfer' || !(+t.rate > 0) || (date && t.date > date)) continue;
    const cur = opsAccCurrency(opsTxnAccount(t));
    const rto = t.rateTo || 'RUP';
    let r = null;
    if (cur === from && rto === to) r = +t.rate;
    else if (cur === to && rto === from) r = 1 / +t.rate;
    if (r == null) continue;
    if (!best || t.date > best.date || (t.date === best.date && String(t.id) > String(best.id)))
      best = { r, date: t.date, id: t.id };
  }
  return best;
}

function _fxDirect(from, to, date) {
  const ex = _fxFromExchanges(from, to, date);
  if (ex) return { r: ex.r, date: ex.date, src: 'exchange' };
  const mn = _fxFromManual(from, to, date);
  if (mn) return { r: mn.r, date: mn.date, src: 'manual' };
  return null;
}

/**
 * Курс с подробностями: { r, date, src } или null.
 * date — 'YYYY-MM-DD': ищем курс не позже этой даты.
 */
function opsFxRateInfo(from, to, date) {
  if (!from || !to || from === to) return { r: 1, date: null, src: 'same' };
  const d = _fxDirect(from, to, date);
  if (d) return d;
  // через базовую валюту: USD→EUR = USD→RUP × RUP→EUR
  const base = opsBaseCurrency();
  if (from !== base && to !== base) {
    const a = _fxDirect(from, base, date), b = _fxDirect(base, to, date);
    if (a && b) return { r: a.r * b.r, date: a.date > b.date ? a.date : b.date, src: 'cross' };
  }
  return null;
}
function opsFxRate(from, to, date) {
  const i = opsFxRateInfo(from, to, date);
  return i ? i.r : null;
}

/* ── Сумма операции в базовой валюте ────────────── */

/**
 * Знаковая сумма в базовой валюте: приход «+», расход «−», перевод — минус
 * комиссия. null — курс неизвестен (операция в итоги не попадает).
 */
function opsBaseAmountOrNull(t) {
  const base = opsBaseCurrency();
  if (t.type === 'transfer') {
    const fee = +t.fee || 0;
    if (!fee) return 0;
    const fc = opsAccCurrency(t.from);
    if (fc === base) return -fee;
    const tc = opsAccCurrency(t.to);
    if (tc === base && +t.amountFrom > 0) return -fee * (+t.amountTo / +t.amountFrom);
    const r = opsFxRate(fc, base, t.date);
    return r == null ? null : -fee * r;
  }
  const amt = +t.amount || 0;
  const cur = opsAccCurrency(opsTxnAccount(t));
  if (cur === base) return amt;
  if (+t.rate > 0) {
    const rto = t.rateTo || base;
    if (rto === base) return amt * +t.rate;
    const cross = opsFxRate(rto, base, t.date);   // базовую валюту сменили после ввода
    if (cross != null) return amt * +t.rate * cross;
  }
  const r = opsFxRate(cur, base, t.date);
  return r == null ? null : amt * r;
}
function opsBaseAmount(t) {
  const v = opsBaseAmountOrNull(t);
  return v == null ? 0 : v;
}
function opsTxnRateMissing(t) { return opsBaseAmountOrNull(t) == null; }

// Все счета в базовой валюте — по курсу последнего известного обмена
function opsAccountsTotalBase() {
  const base = opsBaseCurrency();
  const today = (typeof opsLocalDate === 'function') ? opsLocalDate(0) : new Date().toISOString().slice(0, 10);
  let total = 0;
  const missing = [];
  let latest = null;
  for (const a of opsActiveAccounts()) {
    const bal = opsAccBalance(a.id);
    const cur = a.currency || 'RUP';
    if (cur === base) { total += bal; continue; }
    if (!bal) continue;
    const info = opsFxRateInfo(cur, base, today);
    if (!info) { if (!missing.includes(cur)) missing.push(cur); continue; }
    total += bal * info.r;
    if (info.date && (!latest || info.date > latest)) latest = info.date;
  }
  return { total: +total.toFixed(2), missing, rateDate: latest, base };
}

/* ── Форма операции: курс и вторая сумма перевода ─ */

let opsRateTouched = false;   // курс правили руками — не перетираем автоподстановкой

function opsRateTouch()  { opsRateTouched = true; opsFxPreview(); }
function opsRateReset(touched) { opsRateTouched = !!touched; }

function _fxVal(id) {
  const el = document.getElementById(id);
  return el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
}

function opsFxFormSync() {
  const typeEl = document.getElementById('m-type');
  if (!typeEl) return;
  const tr   = typeEl.value === 'transfer';
  const base = opsBaseCurrency();
  const fromCur = opsAccCurrency(document.getElementById('m-acc')?.value);
  const toCur   = opsAccCurrency(document.getElementById('m-acc-to')?.value);
  const date    = document.getElementById('m-date')?.value || '';
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  const txt  = (id, v)  => { const el = document.getElementById(id); if (el) el.textContent = v; };

  txt('m-amt-label', tr ? `Сумма (${fromCur})` : `Сумма (${fromCur})`);
  txt('m-fee-label', `Комиссия (${fromCur})`);

  // перевод между разными валютами — нужна вторая сумма
  const cross = tr && fromCur !== toCur;
  show('m-amt-to-field', cross);
  txt('m-amt-to-label', `Получено (${toCur})`);

  // валютный приход или расход — нужен курс к базовой
  const needRate = !tr && fromCur !== base;
  show('m-rate-row', needRate);
  txt('m-rate-label', `Курс: 1 ${fromCur} = ? ${base}`);
  if (needRate && !opsRateTouched) {
    const info = opsFxRateInfo(fromCur, base, date || undefined);
    const el = document.getElementById('m-rate');
    if (el) el.value = info ? +info.r.toFixed(6) : '';
    txt('m-rate-src', info
      ? (info.src === 'exchange' ? `по обмену от ${info.date}` : info.src === 'manual' ? `как в операции от ${info.date}` : 'через базовую валюту')
      : 'обменов не было — введите курс');
  }
  opsFxPreview();
}

function opsFxPreview() {
  const typeEl = document.getElementById('m-type');
  if (!typeEl) return;
  const tr   = typeEl.value === 'transfer';
  const base = opsBaseCurrency();
  const fromCur = opsAccCurrency(document.getElementById('m-acc')?.value);
  const toCur   = opsAccCurrency(document.getElementById('m-acc-to')?.value);
  const amt  = _fxVal('m-amt');
  const prev = document.getElementById('m-fx-preview');
  if (!prev) return;
  let s = '';
  if (tr && fromCur !== toCur) {
    const to = _fxVal('m-amt-to');
    if (amt > 0 && to > 0) {
      s = `курс: 1 ${toCur} = ${opsFmtRate(amt / to)} ${fromCur}` +
          (to / amt >= 1 ? '' : ` · 1 ${fromCur} = ${opsFmtRate(to / amt)} ${toCur}`);
    }
  } else if (!tr && fromCur !== base) {
    const r = _fxVal('m-rate');
    if (amt > 0 && r > 0) s = `≈ ${fmtAmt(amt * r)} ${base}`;
  }
  prev.textContent = s;
  prev.hidden = !s;
}

/* ── Управление валютами ────────────────────────── */

function opsCursPurged(state) {
  const st = state || opsState;
  return Array.isArray(st.curPurged) ? st.curPurged : [];
}
function opsAddCurTombstones(ids) {
  const now  = new Date().toISOString();
  const list = opsCursPurged().slice();
  const have = new Set(list.map(x => String(x.id)));
  for (const id of ids) { const k = String(id); if (!have.has(k)) { list.push({ id: k, at: now }); have.add(k); } }
  const cutoff = Date.now() - SYNC_TOMBSTONE_TTL_DAYS * 86400000;
  opsState.curPurged = list.filter(x => new Date(x.at || 0).getTime() >= cutoff);
}

function _curTouch(c) {
  if (c) c._editedAt = new Date().toISOString();
  opsSave();
  if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
}

function opsCurUsed(code) {
  return opsAccounts().some(a => (a.currency || 'RUP') === code);
}

function opsCurOpenModal()  { opsCurRenderModal(); document.getElementById('cur-modal')?.classList.add('is-open'); }
function opsCurCloseModal() { document.getElementById('cur-modal')?.classList.remove('is-open'); }

function opsCurRenderModal() {
  const box = document.getElementById('cur-list');
  const baseSel = document.getElementById('cur-base');
  if (!box) return;
  const base = opsBaseCurrency();
  const list = opsCurrencies();
  if (baseSel) {
    baseSel.innerHTML = list.map(c => `<option value="${escHtml(c.id)}" ${c.id === base ? 'selected' : ''}>${escHtml(c.id)} — ${escHtml(c.name)}</option>`).join('');
  }
  box.innerHTML = list.map(c => {
    const used = opsCurUsed(c.id);
    const lock = used || c.id === base;
    return `<div class="cur-row">
      <span class="cur-row-code">${escHtml(c.id)}</span>
      <input type="text" class="filter-input cur-row-name" value="${escHtml(c.name)}"
             onchange="opsCurRename('${escHtml(c.id)}', this.value)">
      ${c.id === base ? '<span class="cur-row-badge">базовая</span>' : ''}
      <button type="button" class="btn btn-sm btn-danger" ${lock ? 'disabled' : ''}
              title="${c.id === base ? 'Базовую валюту удалить нельзя' : used ? 'Валюта используется счётом' : 'Удалить валюту'}"
              onclick="opsCurDelete('${escHtml(c.id)}')">✕</button>
    </div>`;
  }).join('');
}

function opsCurAdd() {
  const codeEl = document.getElementById('cur-new-code');
  const nameEl = document.getElementById('cur-new-name');
  const code = (codeEl?.value || '').trim().toUpperCase();
  const name = (nameEl?.value || '').trim();
  if (!/^[A-Z]{2,5}$/.test(code)) { showWarn('Код валюты — от 2 до 5 латинских букв, например GBP'); return; }
  if (opsCur(code)) { showWarn(`Валюта ${code} уже есть`); return; }
  opsCurrencies();
  opsState.currencies.push({ id: code, name: name || code, ord: opsState.currencies.length,
                             _editedAt: new Date().toISOString() });
  _curTouch(null);
  if (codeEl) codeEl.value = '';
  if (nameEl) nameEl.value = '';
  opsCurRenderModal();
  if (typeof opsAccRenderModal === 'function') opsAccRenderModal();
}

function opsCurRename(code, name) {
  opsCurrencies();
  const c = opsState.currencies.find(x => x.id === code);
  const nm = (name || '').trim();
  if (!c || !nm) { opsCurRenderModal(); return; }
  c.name = nm;
  _curTouch(c);
}

function opsCurDelete(code) {
  if (code === opsBaseCurrency()) { showWarn('Базовую валюту удалить нельзя'); return; }
  if (opsCurUsed(code)) { showWarn('Валюта используется счётом'); return; }
  appConfirm(`Удалить валюту ${code}?`).then(ok => {
    if (!ok) return;
    opsAddCurTombstones([code]);
    opsState.currencies = opsCurrencies().filter(c => c.id !== code);
    _curTouch(null);
    opsCurRenderModal();
  });
}

function opsSetBaseCurrency(code) {
  const cur = opsBaseCurrency();
  if (!code || code === cur) return;
  appConfirm(`Сделать ${code} базовой валютой? Вся статистика будет пересчитана в ${code}. ` +
             `Операции в других валютах пересчитаются по сохранённым курсам или по курсу последнего обмена; ` +
             `где курса нет, они не попадут в итоги.`).then(ok => {
    if (!ok) { opsCurRenderModal(); return; }
    opsState.fxCfg = { base: code, _editedAt: new Date().toISOString() };
    _curTouch(null);
    opsCurRenderModal();
    opsReRenderCurrent();
  });
}
