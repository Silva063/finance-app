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
  local: opsLocalDate, setOff: opsSetDateOffset, sync: opsDateChipsSync,
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

console.log('\n— чипы у поля даты —');
mkEl('m-date','input');
mkEl('m-date-today','button');
mkEl('m-date-yesterday','button');
I.setOff(0);
t('кнопка «сегодня» ставит дату', nodes['m-date'].value === expectToday, nodes['m-date'].value);
t('и подсвечивается', nodes['m-date-today'].classList.contains('is-active'), 'не подсвечена');
t('«вчера» при этом не активна', !nodes['m-date-yesterday'].classList.contains('is-active'), 'активна');
I.setOff(-1);
t('кнопка «вчера» ставит дату', nodes['m-date'].value === expectYest, nodes['m-date'].value);
t('подсветка переехала', nodes['m-date-yesterday'].classList.contains('is-active')
  && !nodes['m-date-today'].classList.contains('is-active'), 'подсветка не та');
nodes['m-date'].value = '2020-05-05';
I.sync();
t('произвольная дата — обе кнопки погасли',
  !nodes['m-date-today'].classList.contains('is-active') && !nodes['m-date-yesterday'].classList.contains('is-active'),
  'осталась подсветка');
nodes['m-date'].value = '';
I.sync();
t('пустая дата не подсвечивает «сегодня»', !nodes['m-date-today'].classList.contains('is-active'), 'подсвечена');

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
t('кнопки даты есть в форме', html.includes('id="m-date-today"') && html.includes('id="m-date-yesterday"'), 'нет кнопок');
t('кнопка «И ещё» есть', html.includes('id="m-save-more-btn"'), 'нет кнопки');
t('«И ещё» вызывает opsSaveOp(true)', html.includes('opsSaveOp(true)'), 'не передан флаг');
t('модуль подключён после app.js',
  html.indexOf('js/inputaid.js') > html.indexOf('js/app.js'), 'порядок неверный');

console.log('— интеграция в app.js —');
t('opsSaveOp принимает keepOpen', /function opsSaveOp\(keepOpen\)/.test(app), 'сигнатура не та');
t('при keepOpen форма не закрывается',
  app.includes('if (keepOpen) opsPrepareNextOp(); else opsCloseModal();'), 'ветка не найдена');
t('есть подготовка к следующей операции', app.includes('function opsPrepareNextOp()'), 'нет функции');
t('«И ещё» скрывается при правке операции',
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
