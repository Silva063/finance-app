/* ══════════════════════════════════════════════════
   ПОВТОРЯЮЩИЕСЯ ОПЕРАЦИИ

   Надстройка над шаблонами: у шаблона появляется расписание
   «каждый месяц, N-го числа». При запуске приложение смотрит,
   какие платежи уже должны были пройти, и спрашивает — добавить
   или пропустить. Само ничего не создаёт.

   Отключается целиком переключателем в модалке шаблонов.
══════════════════════════════════════════════════ */

const OPS_REC_CATCHUP_MONTHS = 6;   // насколько глубоко догонять пропущенные месяцы

function opsRec() {
  if (!opsState.recurring) opsState.recurring = { enabled: true, _editedAt: null };
  return opsState.recurring;
}
function opsRecEnabled() { return opsRec().enabled !== false; }

function opsRecToggle() {
  const r = opsRec();
  r.enabled = !opsRecEnabled();
  r._editedAt = new Date().toISOString();
  opsSave();
  if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
  opsTplRender();
  showOk(r.enabled ? 'Напоминания включены' : 'Напоминания выключены');
}

function _opsRecPad(n) { return String(n).padStart(2, '0'); }
function _opsRecDaysIn(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function _opsRecAddMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return d.getFullYear() + '-' + _opsRecPad(d.getMonth() + 1);
}

// Дата платежа в конкретном месяце: 31-е в феврале превращается в последний день
function opsRecDateFor(ym, day) {
  const d = Math.min(Math.max(+day || 1, 1), _opsRecDaysIn(ym));
  return ym + '-' + _opsRecPad(d);
}

function opsRecSchedule(t) {
  const r = t && t.repeat;
  if (!r || r.enabled === false) return null;
  const day = +r.day;
  if (!(day >= 1 && day <= 31)) return null;
  return r;
}

/**
 * Что уже должно было пройти, но не отмечено.
 * today — 'YYYY-MM-DD', по умолчанию сегодня.
 */
function opsRecDue(today) {
  if (!opsRecEnabled()) return [];
  const t0 = today || new Date().toISOString().slice(0, 10);
  const curYM = t0.slice(0, 7);
  const out = [];

  for (const tpl of opsTpls()) {
    const r = opsRecSchedule(tpl);
    if (!r) continue;

    // с какого месяца догонять: со следующего после отмеченного, иначе с текущего
    let from = r.lastDone ? _opsRecAddMonths(r.lastDone, 1) : curYM;
    const earliest = _opsRecAddMonths(curYM, -OPS_REC_CATCHUP_MONTHS);
    if (from < earliest) from = earliest;

    for (let ym = from; ym <= curYM; ym = _opsRecAddMonths(ym, 1)) {
      const date = opsRecDateFor(ym, r.day);
      if (date > t0) continue;                  // срок ещё не наступил
      out.push({ tplId: tpl.id, name: tpl.name, ym, date,
                 type: tpl.type, way: tpl.way, amount: tpl.amount, cat: tpl.cat,
                 comment: tpl.comment });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function _opsRecMarkDone(tplId, ym) {
  const tpl = opsTplFind(tplId);
  if (!tpl || !tpl.repeat) return;
  if (!tpl.repeat.lastDone || tpl.repeat.lastDone < ym) tpl.repeat.lastDone = ym;
  tpl._editedAt = new Date().toISOString();   // чтобы второе устройство не спросило снова
}

// Создаёт операцию из шаблона за указанный месяц
function opsRecAdd(tplId, ym, silent) {
  const tpl = opsTplFind(tplId);
  if (!tpl) return false;
  const r = opsRecSchedule(tpl);
  if (!r) return false;
  const date = opsRecDateFor(ym, r.day);
  const amt  = Math.abs(+tpl.amount || 0);
  const now  = new Date().toISOString();

  opsState.txns.push({
    id: opsGenId(), date,
    type: tpl.type, way: tpl.way,
    amount: tpl.type === 'expense' ? -amt : amt,
    comment: tpl.comment || '', cat: tpl.cat || '',
    items: tpl.items || [], itemsMode: (tpl.items && tpl.items.length) ? tpl.itemsMode : undefined,
    _recurring: tplId, _editedAt: now
  });
  _opsRecMarkDone(tplId, ym);
  opsSave();
  if (!silent) {
    opsReRenderCurrent();
    if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
    if (!amt) showWarn(`! «${tpl.name}»: в шаблоне не задана сумма — операция на нуле`);
  }
  return true;
}

function opsRecSkip(tplId, ym, silent) {
  _opsRecMarkDone(tplId, ym);
  opsSave();
  if (!silent && typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
  return true;
}

/* ── Диалог «ожидаются платежи» ──────────────────── */

let opsRecPending = [];

function opsRecCheckOnStart() {
  const due = opsRecDue();
  if (!due.length) return;
  opsRecPending = due;
  opsRecRenderModal();
  document.getElementById('rec-modal')?.classList.add('is-open');
}

function opsRecCloseModal() {
  document.getElementById('rec-modal')?.classList.remove('is-open');
  opsRecPending = [];
}

function opsRecRenderModal() {
  const box = document.getElementById('rec-list');
  if (!box) return;
  if (!opsRecPending.length) { opsRecCloseModal(); return; }

  box.innerHTML = opsRecPending.map((d, i) => {
    const cat = d.cat ? opsCat(d.cat) : null;
    const sign = d.type === 'income' ? '+' : '−';
    const col  = d.type === 'income' ? 'var(--green)' : 'var(--red)';
    return `<div class="rec-row">
      <div class="rec-row-main">
        <div class="rec-row-name">${escHtml(d.name)}</div>
        <div class="rec-row-meta">
          <span>${fmtDate(d.date)}</span>
          <span style="color:${col}">${sign}${fmtAmt(Math.abs(d.amount || 0))}</span>
          ${cat ? `<span>${escHtml(opsCatDisplay(cat))}</span>` : ''}
          ${d.comment ? `<span style="color:var(--muted2)">${escHtml(d.comment)}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="opsRecConfirmOne(${i})">Добавить</button>
      <button class="btn btn-sm" title="Больше не спрашивать за этот месяц"
              onclick="opsRecSkipOne(${i})">Пропустить</button>
    </div>`;
  }).join('');
}

function opsRecConfirmOne(i) {
  const d = opsRecPending[i];
  if (!d) return;
  opsRecAdd(d.tplId, d.ym);
  showOk(`✓ Добавлено: ${d.name}`);
  opsRecPending.splice(i, 1);
  opsRecRenderModal();
}

function opsRecSkipOne(i) {
  const d = opsRecPending[i];
  if (!d) return;
  opsRecSkip(d.tplId, d.ym);
  opsRecPending.splice(i, 1);
  opsRecRenderModal();
}

function opsRecConfirmAll() {
  const list = opsRecPending.slice();
  for (const d of list) opsRecAdd(d.tplId, d.ym, true);
  opsRecPending = [];
  opsReRenderCurrent();
  if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
  showOk(`✓ Добавлено операций: ${list.length}`);
  opsRecCloseModal();
}

function opsRecSkipAll() {
  for (const d of opsRecPending.slice()) opsRecSkip(d.tplId, d.ym, true);
  opsRecPending = [];
  if (typeof driveToken !== 'undefined' && driveToken) driveDebouncedPush('ops');
  opsRecCloseModal();
}

// «Позже» — ничего не отмечаем, спросим при следующем запуске
function opsRecLater() { opsRecCloseModal(); }
