/* ══════════════════════════════════════════════════
   ЛИМИТ ЗАТРАТ НА МЕСЯЦ

   Три стратегии расчёта лимита:
     fixed — задана сумма расходов напрямую
     save  — «откладывать N»: лимит = max(прогноз дохода, факт) − N.
             Прогноз нужен, чтобы индикатор работал с 1 числа, пока
             зарплата ещё не пришла; факт его перебивает, как только
             дохода стало больше — сверхдоход уходит в траты целиком.
     net   — лимит на просадку: расходы минус приходы

   Состав индикатора вынесен в budget.show — всё, кроме полосы,
   выключено, но код написан: достаточно поменять false на true.
══════════════════════════════════════════════════ */

const OPS_BUDGET_DEFAULT = {
  strategy: 'fixed',       // fixed | save | net
  limit:    0,             // fixed: сумма расходов
  income:   0,             // save: прогноз дохода за месяц
  save:     0,             // save: сколько откладываем
  netLimit: 0,             // net: предел просадки
  months:   [],            // переопределения: [{ id:'2026-12', ... , _editedAt }]
  show:     { daily: false, saved: false, forecast: false, toasts: false },
  _editedAt: null
};

const OPS_BUDGET_WARN_PCT = 80;   // с этого процента полоса янтарная
const OPS_BUDGET_AVG_MONTHS = 3;  // по скольким месяцам считаем подсказку среднего

function opsBudget() {
  if (!opsState.budget) opsState.budget = { ...OPS_BUDGET_DEFAULT, show: { ...OPS_BUDGET_DEFAULT.show } };
  const b = opsState.budget;
  if (!Array.isArray(b.months)) b.months = [];
  if (!b.show) b.show = { ...OPS_BUDGET_DEFAULT.show };
  return b;
}

// Любая правка настроек должна двигать метку — иначе merge с Drive
// выберет копию с другого устройства. См. историю с целями.
function opsBudgetTouch() {
  opsBudget()._editedAt = new Date().toISOString();
  opsSave();
  if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
}

function opsBudgetMonthOverride(ym) {
  return opsBudget().months.find(m => m.id === ym) || null;
}

// Пустое значение в переопределении означает «брать базовое»,
// а ноль — осознанный ноль (например, в декабре не откладываем).
function _opsBudgetPick(ov, base) {
  if (ov === undefined || ov === null || ov === '') return +base || 0;
  const n = +ov;
  return isNaN(n) ? (+base || 0) : n;
}

function opsBudgetForMonth(ym) {
  const b  = opsBudget();
  const ov = opsBudgetMonthOverride(ym) || {};
  return {
    strategy: ov.strategy || b.strategy || 'fixed',
    limit:    _opsBudgetPick(ov.limit,    b.limit),
    income:   _opsBudgetPick(ov.income,   b.income),
    save:     _opsBudgetPick(ov.save,     b.save),
    netLimit: _opsBudgetPick(ov.netLimit, b.netLimit),
    hasOverride: !!opsBudgetMonthOverride(ym)
  };
}

function _r2(n) { return +(+n).toFixed(2); }

// Средний доход за последние завершённые месяцы — подсказка для поля прогноза
function opsBudgetAvgIncome(n) {
  const cur = new Date().toISOString().slice(0, 7);
  const months = getMonths().filter(m => m < cur).slice(-(n || OPS_BUDGET_AVG_MONTHS));
  if (!months.length) return 0;
  const sum = months.reduce((acc, m) =>
    acc + txnsByMonth(m).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), 0);
  return _r2(sum / months.length);
}

/**
 * Считает состояние лимита за месяц. null — лимит не настроен,
 * тогда индикатор просто не рисуется и приложение выглядит как раньше.
 */
function opsBudgetCalc(ym) {
  const cfg = opsBudgetForMonth(ym);

  const configured =
    cfg.strategy === 'save' ? (cfg.save > 0 || cfg.income > 0)
  : cfg.strategy === 'net'  ? (cfg.netLimit > 0)
  :                           (cfg.limit > 0);
  if (!configured) return null;

  let income = 0, expense = 0;
  for (const t of txnsByMonth(ym)) {
    if (t.type === 'income') income += t.amount;
    else expense += Math.abs(t.amount);
  }
  income = _r2(income); expense = _r2(expense);

  let limit, spent;
  if (cfg.strategy === 'save') {
    limit = _r2(Math.max(0, Math.max(cfg.income, income) - cfg.save));
    spent = expense;
  } else if (cfg.strategy === 'net') {
    limit = _r2(Math.max(0, cfg.netLimit));
    spent = _r2(expense - income);
  } else {
    limit = _r2(Math.max(0, cfg.limit));
    spent = expense;
  }

  const remain = _r2(limit - spent);
  const pct    = limit > 0 ? _r2(spent / limit * 100) : (spent > 0 ? 100 : 0);
  const over   = spent > limit;
  const near   = !over && pct >= OPS_BUDGET_WARN_PCT;

  // Дни: «осталось на день» и прогноз имеют смысл только для текущего месяца
  const now = new Date();
  const curYM = now.toISOString().slice(0, 7);
  let daysLeft = null, daysGone = null, daysTotal = null;
  const [yy, mm] = ym.split('-').map(Number);
  daysTotal = new Date(yy, mm, 0).getDate();
  if (ym === curYM) {
    const d = +now.toISOString().slice(8, 10);
    daysGone = d;
    daysLeft = Math.max(1, daysTotal - d + 1);
  } else if (ym < curYM) {
    daysGone = daysTotal; daysLeft = 0;
  } else {
    daysGone = 0; daysLeft = daysTotal;
  }

  const perDay   = daysLeft > 0 ? _r2(Math.max(0, remain) / daysLeft) : null;
  const forecast = (ym === curYM && daysGone > 0) ? _r2(spent / daysGone * daysTotal) : null;
  // сколько фактически отложено — только для стратегии накопления
  const saved     = cfg.strategy === 'save' ? _r2(income - expense) : null;
  const saveGoal  = cfg.strategy === 'save' ? cfg.save : null;

  return { ym, cfg, income, expense, limit, spent, remain, pct, over, near,
           daysLeft, daysGone, daysTotal, perDay, forecast, saved, saveGoal };
}

/* ── Индикатор ──────────────────────────────────── */

function opsBudgetStratLabel(s) {
  return s === 'save' ? 'откладывать' : s === 'net' ? 'по итогу месяца' : 'лимит трат';
}

/**
 * HTML полосы лимита. compact=true — укороченный вид для блоков «По месяцам».
 */
function opsBudgetBarHTML(ym, compact) {
  const c = opsBudgetCalc(ym);
  if (!c) return '';
  const show = opsBudget().show || {};
  const col  = c.over ? 'var(--red)' : c.near ? 'var(--amber)' : 'var(--green)';
  const w    = Math.min(Math.max(c.pct, 0), 100).toFixed(1);
  const icon = c.over ? '✕' : c.near ? '!' : '';

  if (compact) {
    return `<div class="budget-bar is-compact">
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${w}%;background:${col}"></div></div>
      <div class="budget-bar-mini" style="color:${col}">${fmtAmt(c.spent)} / ${fmtAmt(c.limit)}${icon ? ' ' + icon : ''}</div>
    </div>`;
  }

  const extras = [];
  if (show.daily && c.perDay !== null)
    extras.push(`<span>осталось ${c.daysLeft} ${opsPlural(c.daysLeft,'день','дня','дней')} · по ${fmtAmt(c.perDay)} в день</span>`);
  if (show.saved && c.saveGoal)
    extras.push(`<span>отложено ${fmtAmt(c.saved)} из ${fmtAmt(c.saveGoal)}</span>`);
  if (show.forecast && c.forecast !== null)
    extras.push(`<span style="color:${c.forecast > c.limit ? 'var(--red)' : 'var(--muted2)'}">при текущем темпе выйдет ~${fmtAmt(c.forecast)}</span>`);

  return `<div class="budget-bar">
    <div class="budget-bar-head">
      <div class="budget-bar-title">Лимит на ${monthLabel(ym)}
        <span class="budget-bar-strat">${opsBudgetStratLabel(c.cfg.strategy)}${c.cfg.hasOverride ? ' · свой на месяц' : ''}</span>
      </div>
      <div class="budget-bar-pct" style="color:${col}">${Math.round(c.pct)}%${icon ? ' ' + icon : ''}</div>
    </div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${w}%;background:${col}"></div></div>
    <div class="budget-bar-nums">
      <span>Потрачено <b>${fmtAmt(c.spent)}</b> из ${fmtAmt(c.limit)}</span>
      <span style="color:${col}">${c.over ? 'Перерасход ' + fmtAmt(Math.abs(c.remain)) : 'Остаток ' + fmtAmt(c.remain)}</span>
    </div>
    ${extras.length ? `<div class="budget-bar-extra">${extras.join('<span class="budget-sep">·</span>')}</div>` : ''}
  </div>`;
}

// Какой месяц показывать на «Всех операциях»: выбранный в фильтре, иначе текущий
function opsBudgetP1Month() {
  const sel = document.getElementById('f1month');
  const v = sel ? sel.value : '';
  return v || new Date().toISOString().slice(0, 7);
}

function opsBudgetRenderP1() {
  const el = document.getElementById('p1-budget');
  if (el) el.innerHTML = opsBudgetBarHTML(opsBudgetP1Month(), false);
}

function opsBudgetRenderP4(ym) {
  const el = document.getElementById('p4-budget');
  if (el) el.innerHTML = opsBudgetBarHTML(ym, false);
}

/* ── Предупреждения при сохранении операции ─────── */

function opsBudgetWarnAfterSave(date, type) {
  if (!opsBudget().show.toasts) return;
  if (type !== 'expense') return;
  const c = opsBudgetCalc(String(date).slice(0, 7));
  if (!c) return;
  if (c.over)      showWarn(`✕ Лимит месяца превышен: ${fmtAmt(c.spent)} / ${fmtAmt(c.limit)}`);
  else if (c.near) showWarn(`! Лимит месяца: ${Math.round(c.pct)}% (${fmtAmt(c.spent)} / ${fmtAmt(c.limit)})`);
}

/* ── Модалка настроек ───────────────────────────── */

function opsBudgetOpenModal() {
  opsBudgetRenderModal();
  document.getElementById('budget-modal').classList.add('is-open');
}
function opsBudgetCloseModal() {
  document.getElementById('budget-modal').classList.remove('is-open');
}

function opsBudgetSetStrategy(v) {
  opsBudget().strategy = v;
  opsBudgetTouch();
  opsBudgetRenderModal();
  opsReRenderCurrent();
}

function opsBudgetSetField(field, value) {
  const n = parseFloat(String(value).replace(',', '.'));
  opsBudget()[field] = (!value || isNaN(n) || n < 0) ? 0 : _r2(n);
  opsBudgetTouch();
  opsBudgetRenderModal();
  opsReRenderCurrent();
}

function opsBudgetUseAvg() {
  const avg = opsBudgetAvgIncome();
  if (!avg) { showWarn('Нет завершённых месяцев с доходом'); return; }
  opsBudgetSetField('income', avg);
}

function opsBudgetToggleShow(key) {
  const sh = opsBudget().show;
  sh[key] = !sh[key];
  opsBudgetTouch();
  opsBudgetRenderModal();
  opsReRenderCurrent();
}

/* переопределения по месяцам */

function opsBudgetAddOverride() {
  const ym = document.getElementById('budget-ov-month').value;
  if (!ym) { showWarn('Выберите месяц'); return; }
  const b = opsBudget();
  if (b.months.some(m => m.id === ym)) { showWarn('Для этого месяца уже есть своё значение'); return; }
  b.months.push({ id: ym, _editedAt: new Date().toISOString() });
  opsBudgetTouch();
  opsBudgetRenderModal();
  opsReRenderCurrent();
}

function opsBudgetSetOverride(ym, field, value) {
  const ov = opsBudgetMonthOverride(ym);
  if (!ov) return;
  if (value === '' || value === null) delete ov[field];
  else {
    const n = parseFloat(String(value).replace(',', '.'));
    ov[field] = isNaN(n) || n < 0 ? 0 : _r2(n);
  }
  ov._editedAt = new Date().toISOString();
  opsBudgetTouch();
  opsBudgetRenderModal();
  opsReRenderCurrent();
}

function opsBudgetDeleteOverride(ym) {
  const b = opsBudget();
  b.months = b.months.filter(m => m.id !== ym);
  // надгробие не нужно: months сливается по id, а удаление переопределения
  // безопасно «проиграть» — вернётся лишь настройка, не данные
  opsBudgetTouch();
  opsBudgetRenderModal();
  opsReRenderCurrent();
}

function opsBudgetRenderModal() {
  const b   = opsBudget();
  const box = document.getElementById('budget-fields');
  if (!box) return;

  const strat = b.strategy || 'fixed';
  const avg   = opsBudgetAvgIncome();
  const curYM = new Date().toISOString().slice(0, 7);
  const cur   = opsBudgetCalc(curYM);

  const numField = (label, field, hint) => `
    <div class="form-field">
      <label>${label}</label>
      <input type="text" inputmode="decimal" value="${b[field] || ''}" placeholder="0"
             onchange="opsBudgetSetField('${field}', this.value)">
      ${hint ? `<div class="budget-hint">${hint}</div>` : ''}
    </div>`;

  let fields = '';
  if (strat === 'fixed') {
    fields = numField('Лимит расходов за месяц, руб', 'limit',
      'Считаются все расходы месяца, независимо от категории и способа оплаты.');
  } else if (strat === 'save') {
    fields = `
      ${numField('Откладывать за месяц, руб', 'save', 'Эта сумма вычитается из дохода — остальное можно тратить.')}
      <div class="form-field">
        <label>Прогноз дохода за месяц, руб</label>
        <input type="text" inputmode="decimal" value="${b.income || ''}" placeholder="0"
               onchange="opsBudgetSetField('income', this.value)">
        <div class="budget-hint">
          Нужен, чтобы лимит работал с 1 числа, пока доход не пришёл.
          ${avg ? `В среднем за ${OPS_BUDGET_AVG_MONTHS} мес.: <b>${fmtAmt(avg)}</b>
            <button type="button" class="budget-link" onclick="opsBudgetUseAvg()">подставить</button>` : 'Истории для среднего пока нет.'}
        </div>
      </div>
      <div class="budget-formula">
        Лимит трат = max(прогноз, фактический доход) − откладываем.
        Пришёл доход сверх прогноза — лимит поднимется сам.
      </div>`;
  } else {
    fields = numField('Предел просадки за месяц, руб', 'netLimit',
      'Считается разница: расходы минус приходы. Подработка уменьшает израсходованное.');
  }

  const ovRows = b.months.length ? b.months.slice().sort((a, c) => a.id.localeCompare(c.id)).map(ov => {
    const f = strat === 'fixed' ? [['limit', 'лимит']]
            : strat === 'save'  ? [['save', 'откладывать'], ['income', 'прогноз']]
            :                     [['netLimit', 'просадка']];
    return `<div class="budget-ov-row">
      <span class="budget-ov-month">${monthLabel(ov.id)}</span>
      ${f.map(([key, lbl]) => `<input type="text" inputmode="decimal" class="budget-ov-input"
          value="${ov[key] === undefined ? '' : ov[key]}" placeholder="${lbl}"
          title="${lbl} — пусто значит базовое"
          onchange="opsBudgetSetOverride('${ov.id}','${key}', this.value)">`).join('')}
      <button type="button" class="row-edit-btn is-danger" title="Убрать переопределение"
              onclick="opsBudgetDeleteOverride('${ov.id}')">✕</button>
    </div>`;
  }).join('') : '<div class="budget-hint">Переопределений нет — во всех месяцах действуют базовые значения.</div>';

  const showChips = [
    ['daily',    'Осталось на день'],
    ['saved',    'Сколько отложено'],
    ['forecast', 'Прогноз на конец месяца'],
    ['toasts',   'Тосты при 80% и превышении']
  ].map(([k, lbl]) =>
    `<button type="button" class="chart-chip ${b.show[k] ? 'is-active' : ''}" onclick="opsBudgetToggleShow('${k}')">${lbl}</button>`
  ).join('');

  box.innerHTML = `
    <div class="form-field">
      <label>Стратегия</label>
      <select onchange="opsBudgetSetStrategy(this.value)">
        <option value="fixed" ${strat === 'fixed' ? 'selected' : ''}>Фиксированный лимит трат</option>
        <option value="save"  ${strat === 'save'  ? 'selected' : ''}>Откладывать сумму</option>
        <option value="net"   ${strat === 'net'   ? 'selected' : ''}>Лимит по итогу месяца</option>
      </select>
    </div>
    ${fields}

    <div class="budget-section">Текущий месяц</div>
    ${cur ? opsBudgetBarHTML(curYM, false)
          : '<div class="budget-hint">Лимит не задан — индикатор скрыт, приложение работает как раньше.</div>'}

    <div class="budget-section">Свои значения для отдельных месяцев</div>
    ${ovRows}
    <div class="budget-ov-add">
      <input type="month" id="budget-ov-month" class="filter-input" value="${curYM}">
      <button type="button" class="btn btn-sm" onclick="opsBudgetAddOverride()">+ Добавить месяц</button>
    </div>

    <div class="budget-section">Что показывать дополнительно</div>
    <div class="chart-chips">${showChips}</div>
    <div class="budget-hint">Полоса с процентом, потраченным и остатком показывается всегда.</div>`;
}
