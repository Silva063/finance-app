// Мелочи ввода: местная дата, чипы «сегодня/вчера», сохранение фильтров,
// клик по карточке статистики, «Сохранить и ещё».
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const src = fs.readFileSync(ROOT + 'js/inputaid.js', 'utf8');
const app = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

// ── заглушки DOM ─────────────────────────────────
const nodes = {};
function mkEl(id, tag, opts = {}) {
  const el = {
    id, tagName: (tag || 'input').toUpperCase(), value: opts.value || '',
    options: (opts.options || []).map(v => ({ value: v })),
    classList: { _s: new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
      toggle(c,f){ f ? this._s.add(c) : this._s.delete(c) }, contains(c){ return this._s.has(c) } }
  };
  nodes[id] = el; return el;
}
const store = {};
const sessionStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
let renders = 0;
const listeners = {};

const ctx = vm.createContext({
  document: {
    getElementById: id => nodes[id] || null,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }
  },
  sessionStorage,
  renderP1: () => { renders++; },
  fillMonthSel: (mid, yid) => {
    // повторяет поведение приложения: список месяцев зависит от выбранного года
    const y = nodes[yid] ? nodes[yid].value : '';
    const all = ['2026-01','2026-02','2026-03','2025-11'];
    nodes[mid].options = all.filter(m => !y || m.startsWith(y)).map(v => ({ value: v }));
  },
  console: { log(){} }, Math, JSON, Date, Array, Object, String, Number, Set
});
vm.runInContext(src + `
;globalThis.__i = {
  local: opsLocalDate,
  save: opsFiltersSave, apply: opsFiltersApply, read: opsFiltersRead,
  forget: opsFiltersForget, statType: opsStatFilterType,
  fields: OPS_FILTER_FIELDS
};`, ctx);
const I = ctx.__i;

// ── местная дата ─────────────────────────────────
console.log('— дата по местному календарю —');
const now = new Date();
const p = n => String(n).padStart(2,'0');
const expectToday = now.getFullYear()+'-'+p(now.getMonth()+1)+'-'+p(now.getDate());
t('сегодня = местная дата', I.local(0) === expectToday, `${I.local(0)} vs ${expectToday}`);
const y = new Date(); y.setDate(y.getDate()-1);
const expectYest = y.getFullYear()+'-'+p(y.getMonth()+1)+'-'+p(y.getDate());
t('вчера = минус один день', I.local(-1) === expectYest, `${I.local(-1)} vs ${expectYest}`);
t('формат ровно YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(I.local(0)), I.local(0));
t('переход через месяц корректен', I.local(-40).length === 10 && I.local(-40) < I.local(0),
  I.local(-40));

// ── фильтры ──────────────────────────────────────
console.log('\n— сохранение фильтров —');
mkEl('f1search','input');
mkEl('f1type','select',{ options:['','income','expense'] });
mkEl('f1way','select',{ options:['','Наличный','Безналичный'] });
mkEl('f1cat','select',{ options:['','grocery'] });
mkEl('f1year','select',{ options:['','2026','2025'] });
mkEl('f1month','select',{ options:['','2026-01','2026-02'] });

nodes['f1search'].value = 'шериф';
nodes['f1type'].value   = 'expense';
nodes['f1year'].value   = '2026';
nodes['f1month'].value  = '2026-02';
I.save();
t('сохранены только заполненные поля',
  JSON.stringify(I.read()) === JSON.stringify({ f1search:'шериф', f1type:'expense', f1year:'2026', f1month:'2026-02' }),
  JSON.stringify(I.read()));
t('лежит в sessionStorage, а не в localStorage', 'finOpsFilters' in store, Object.keys(store).join(','));

// имитируем перезагрузку: значения пусты, список месяцев ещё не сужен
for (const id of ['f1search','f1type','f1way','f1cat','f1year','f1month']) nodes[id].value = '';
nodes['f1month'].options = ['','2026-01','2026-02','2025-11'].map(v => ({ value: v }));
let changed = I.apply('op-p1');
t('после обновления фильтры вернулись', changed === true, changed);
t('поиск восстановлен', nodes['f1search'].value === 'шериф', nodes['f1search'].value);
t('тип восстановлен', nodes['f1type'].value === 'expense', nodes['f1type'].value);
t('год восстановлен', nodes['f1year'].value === '2026', nodes['f1year'].value);
t('месяц восстановлен', nodes['f1month'].value === '2026-02', nodes['f1month'].value);
t('второй вызов для той же страницы ничего не делает', I.apply('op-p1') === false, 'сработал дважды');

console.log('\n— краевые случаи фильтров —');
store['finOpsFilters'] = JSON.stringify({ f1year:'1999' });   // такого года в данных нет
delete ctx.__dummy;
const fresh = vm.createContext(Object.assign({}, {
  document: { getElementById: id => nodes[id] || null, addEventListener(){} },
  sessionStorage, renderP1(){}, fillMonthSel(){}, console:{log(){}},
  Math, JSON, Date, Array, Object, String, Number, Set
}));
vm.runInContext(src + ';globalThis.__a = opsFiltersApply;', fresh);
nodes['f1year'].value = '';
t('отсутствующее значение не ставится', fresh.__a('op-p1') === false || nodes['f1year'].value === '',
  nodes['f1year'].value);

store['finOpsFilters'] = JSON.stringify({ f1type:'expense' });
const fresh2 = vm.createContext({
  document: { getElementById: id => nodes[id] || null, addEventListener(){} },
  sessionStorage, renderP1(){}, fillMonthSel(){}, console:{log(){}},
  Math, JSON, Date, Array, Object, String, Number, Set
});
vm.runInContext(src + ';globalThis.__a = opsFiltersApply; globalThis.__f = opsFiltersForget;', fresh2);
nodes['f1type'].value = '';
t('восстановление работает в свежей сессии', fresh2.__a('op-p1') === true, 'не сработало');
fresh2.__f();
t('сброс забывает сохранённое', !('finOpsFilters' in store), Object.keys(store).join(','));

console.log('\n— набор полей по страницам —');
t('описаны все страницы с фильтрами',
  Object.keys(I.fields).sort().join(',') === 'op-p1,op-p2,op-p3,op-p5,op-p6',
  Object.keys(I.fields).sort().join(','));
t('год идёт раньше месяца (месяц от него зависит)',
  I.fields['op-p1'].indexOf('f1year') < I.fields['op-p1'].indexOf('f1month'), 'порядок неверный');

// ── карточки статистики ──────────────────────────
console.log('\n— клик по карточке —');
nodes['f1type'].value = '';
renders = 0;
I.statType('expense');
t('ставит фильтр по типу', nodes['f1type'].value === 'expense', nodes['f1type'].value);
t('перерисовывает страницу', renders === 1, renders);
I.statType('expense');
t('повторный клик снимает фильтр', nodes['f1type'].value === '', nodes['f1type'].value);
I.statType('income');
t('переключение на другой тип', nodes['f1type'].value === 'income', nodes['f1type'].value);
I.statType('');
t('карточка «Итог» сбрасывает', nodes['f1type'].value === '', nodes['f1type'].value);

// ── разметка и интеграция ────────────────────────
console.log('— разметка —');
const css = fs.readFileSync(ROOT + 'css/main.css', 'utf8');

// От кнопок «сегодня/вчера» отказались — следов быть не должно
t('кнопок даты в разметке нет', !html.includes('m-date-today') && !html.includes('date-chip'), 'остались следы');
t('поле даты без лишних обработчиков', html.includes('<input type="date" id="m-date">'), 'на поле что-то навешано');
t('стилей чипов не осталось', !css.includes('.date-chip'), 'стили остались');

// Подвал: три кнопки в заданном порядке
t('есть «Сохранить и закрыть»',  html.includes('>Сохранить и закрыть</button>'),  'нет кнопки');
t('есть «Сохранить и добавить»', html.includes('>Сохранить и добавить</button>'), 'нет кнопки');
t('есть «Отмена»',               html.includes('>Отмена</button>'),               'нет кнопки');
const footer = html.slice(html.indexOf('id="m-del-btn"'), html.indexOf('id="m-del-btn"') + 700);
t('порядок: отмена → добавить → закрыть',
  footer.indexOf('>Отмена<') < footer.indexOf('Сохранить и добавить')
  && footer.indexOf('Сохранить и добавить') < footer.indexOf('Сохранить и закрыть'),
  'порядок не тот');
t('«Сохранить и закрыть» крайняя справа',
  footer.lastIndexOf('Сохранить и закрыть') > footer.indexOf('Сохранить и добавить')
  && footer.lastIndexOf('Сохранить и закрыть') > footer.indexOf('>Отмена<'),
  'не крайняя');
t('«Сохранить и закрыть» — основное действие',
  html.includes('class="btn btn-primary" id="m-save-btn" onclick="opsSaveOp()">Сохранить и закрыть'), 'не primary');
t('у всех кнопок подвала есть id для управления порядком',
  ['m-del-btn','m-cancel-btn','m-save-more-btn','m-save-btn'].every(id => html.includes(`id="${id}"`)),
  'не у всех');

// ── раскладка подвала ────────────────────────────
console.log('— раскладка подвала —');
t('на ПК всё в одну строку (переноса нет)',
  css.includes('#ops-modal .modal-actions { flex-wrap: nowrap; }'), 'перенос не отключён');
t('уплотнение кнопок только для широкого экрана',
  /@media \(min-width: 1025px\) \{\s*\n\s*#ops-modal \.modal-actions \.btn \{ padding/.test(css),
  'уплотнение не ограничено min-width — перебьёт мобильные отступы');
t('на мобильном кнопки столбиком',
  css.includes('flex-direction: column'), 'правило не найдено');

// Главная ловушка: column вместе с wrap раскладывает кнопки в несколько
// колонок, и они наезжают друг на друга. Внутри мобильного блока обязателен nowrap.
// файл в CRLF — нормализуем, иначе поиск по \n ничего не находит
const cssN = css.replace(/\r\n/g, '\n');
const mob = cssN.slice(cssN.indexOf('@media (max-width: 1024px) {\n  /* Только подвал формы операции'));
const mobBlock = mob.slice(0, mob.indexOf('\n}\n'));
t('в мобильном блоке column соседствует с nowrap',
  mobBlock.includes('flex-direction: column') && mobBlock.includes('flex-wrap: nowrap'),
  'column без nowrap — кнопки наедут друг на друга');
t('порядок сверху вниз задан явно',
  ['m-save-btn','m-save-more-btn','m-cancel-btn','m-del-btn'].every(id => mobBlock.includes('#' + id)),
  'порядок не задан');
t('правило не задевает остальные модалки',
  !css.includes('.modal-actions .btn { flex: 1'), 'общее правило всё ещё сжимает все модалки');
t('подписи не ломаются посередине слова',
  css.includes('#ops-modal .modal-actions .btn { white-space: nowrap; }'), 'нет nowrap');

// Подписи должны уместиться в 388px (440 модалки − 52 отступов) при 10.5px моно
const labels = ['Отмена', 'Сохранить и добавить', 'Сохранить и закрыть'];
const widthPx = labels.reduce((a, l) => a + l.length * 6.3 + 22, 0) + 2 * 8;
t(`три кнопки влезают в строку (расчётно ${Math.round(widthPx)}px из 388)`, widthPx < 388, Math.round(widthPx));

t('кнопка добавления есть', html.includes('id="m-save-more-btn"'), 'нет кнопки');
t('кнопка вызывает opsSaveOp(true)', html.includes('opsSaveOp(true)'), 'не передан флаг');
t('модуль подключён после app.js',
  html.indexOf('js/inputaid.js') > html.indexOf('js/app.js'), 'порядок неверный');

console.log('— интеграция в app.js —');
t('opsSaveOp принимает keepOpen', /function opsSaveOp\(keepOpen\)/.test(app), 'сигнатура не та');
t('при keepOpen форма не закрывается',
  app.includes('if (keepOpen) opsPrepareNextOp(); else opsCloseModal();'), 'ветка не найдена');
t('есть подготовка к следующей операции', app.includes('function opsPrepareNextOp()'), 'нет функции');
t('кнопка скрывается при правке операции',
  app.includes("moreBtnE.style.display = 'none'"), 'не скрывается');
t('три карточки кликабельны, четвёртая нет',
  (app.match(/stat-card is-clickable/g) || []).length === 3,
  (app.match(/stat-card is-clickable/g) || []).length);
t('клик карточки зовёт opsStatFilterType',
  (app.match(/opsStatFilterType\(/g) || []).length === 3,
  (app.match(/opsStatFilterType\(/g) || []).length);
t('фильтры применяются после рендера страницы',
  app.includes("opsFiltersApply(id)) opsReRenderCurrent()"), 'не подключено к навигации');
t('и на старте', app.includes("opsFiltersApply('op-p1')) renderP1()"), 'не подключено к старту');
t('сброс фильтров забывает сохранённое',
  /function opsResetP1\(\)\s*\{\s*\n\s*if \(typeof opsFiltersForget/.test(app), 'не подключено');
t('дата в новой операции берётся по местному календарю',
  app.includes('opsLocalDate(0)'), 'всё ещё UTC');

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
