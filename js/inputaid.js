/* ══════════════════════════════════════════════════
   МЕЛОЧИ ВВОДА

   - фильтры переживают обновление страницы (sessionStorage:
     F5 сохраняет, закрытие браузера — сбрасывает, поэтому
     никакой настройки не нужно);
   - «Сохранить и добавить» — ввод нескольких операций подряд;
   - дата по местному календарю вместо UTC.
══════════════════════════════════════════════════ */

/* ── Локальная дата ─────────────────────────────── */
// Везде в проекте дата берётся как new Date().toISOString().slice(0,10) —
// это UTC, и после полуночи по местному времени он отдаёт вчерашнее число.
// Операция, введённая в час ночи, получала вчерашнюю дату, поэтому для
// подстановки в форму считаем по местному календарю.
function opsLocalDate(offsetDays) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ── Сохранение фильтров на время сессии ────────── */

const OPS_FILTERS_KEY = 'finOpsFilters';

// Поля фильтров по страницам. Порядок важен: год заполняет список месяцев,
// поэтому год восстанавливаем раньше месяца.
const OPS_FILTER_FIELDS = {
  'op-p1': ['f1search', 'f1type', 'f1way', 'f1cat', 'f1year', 'f1month'],
  'op-p2': ['f2search', 'f2year', 'f2month'],
  'op-p5': ['f5search', 'f5year', 'f5month'],
  'op-p3': ['f3year'],
  'op-p6': ['f6year', 'f6month', 'f6type', 'f6chart']
};

function opsFiltersRead() {
  try { return JSON.parse(sessionStorage.getItem(OPS_FILTERS_KEY)) || {}; }
  catch (e) { return {}; }
}

function opsFiltersSave() {
  const out = {};
  for (const page in OPS_FILTER_FIELDS) {
    for (const id of OPS_FILTER_FIELDS[page]) {
      const el = document.getElementById(id);
      if (el && el.value) out[id] = el.value;
    }
  }
  try {
    if (Object.keys(out).length) sessionStorage.setItem(OPS_FILTERS_KEY, JSON.stringify(out));
    else sessionStorage.removeItem(OPS_FILTERS_KEY);
  } catch (e) {}
}

// Применяем по одному разу на страницу: списки годов и месяцев собираются
// во время рендера, поэтому до первого рендера ставить value бессмысленно.
const _opsFiltersApplied = {};

function opsFiltersApply(page) {
  if (_opsFiltersApplied[page]) return false;
  _opsFiltersApplied[page] = true;
  const fields = OPS_FILTER_FIELDS[page];
  if (!fields) return false;

  const saved = opsFiltersRead();
  let changed = false;
  for (const id of fields) {
    const want = saved[id];
    if (!want) continue;
    const el = document.getElementById(id);
    if (!el || el.value === want) continue;
    if (el.tagName === 'SELECT') {
      // значение могло исчезнуть вместе с данными — тогда молча пропускаем
      if (![...el.options].some(o => o.value === want)) continue;
      // месяц зависит от выбранного года: пересобираем список
      if (id.endsWith('month')) {
        const yid = id.replace('month', 'year');
        if (document.getElementById(yid)) fillMonthSel(id, yid);
        if (![...el.options].some(o => o.value === want)) continue;
      }
    }
    el.value = want;
    changed = true;
  }
  return changed;
}

// Сброс фильтров должен очищать и сохранённое
function opsFiltersForget() {
  try { sessionStorage.removeItem(OPS_FILTERS_KEY); } catch (e) {}
}

// Любое изменение фильтра запоминаем. Делегирование — чтобы не трогать
// 20 инлайновых обработчиков в разметке.
document.addEventListener('change', e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('filter-input')) opsFiltersSave();
}, true);
document.addEventListener('input', e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('filter-input')) opsFiltersSave();
}, true);

/* ── Клик по карточке статистики ────────────────── */

// Карточка «Безнал / Нал» содержит два числа, однозначного фильтра для неё
// нет — поэтому кликабельны только три, и только они подсвечены.
function opsStatFilterType(type) {
  const sel = document.getElementById('f1type');
  if (!sel) return;
  sel.value = (sel.value === type) ? '' : type;   // повторный клик снимает
  opsFiltersSave();
  renderP1();
}
