// Повторяющиеся операции: когда спрашивать, что создаётся, как отключается.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const src = fs.readFileSync(ROOT + 'js/recurring.js', 'utf8');

let state = { txns: [], templates: [], recurring: null };
const nodes = {};
const mk = () => ({ innerHTML:'', classList:{ _s:new Set(), add(c){this._s.add(c)},
  remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} } });
for (const id of ['rec-modal','rec-list']) nodes[id] = mk();

let toasts = [], renders = 0, pushes = 0;
let idSeq = 0;

const ctx = vm.createContext({
  get opsState(){ return state; }, set opsState(v){ state = v; },
  opsSave: () => {},
  opsReRenderCurrent: () => { renders++; },
  opsTpls: () => state.templates,
  opsTplFind: id => state.templates.find(t => String(t.id) === String(id)) || null,
  opsTplRender: () => {},
  opsGenId: () => 'gen_' + (++idSeq),
  opsCat: id => ({ id, name:'Кат', color:'#fff' }),
  opsCatDisplay: c => c.name,
  fmtAmt: n => Math.abs(+n).toFixed(2),
  fmtDate: d => d,
  escHtml: s => String(s == null ? '' : s),
  showOk: m => toasts.push(['ok',m]), showWarn: m => toasts.push(['warn',m]),
  driveToken: null, driveDebouncedPush: () => { pushes++; },
  document: { getElementById: id => nodes[id] || null },
  console:{log(){}}, Math, JSON, Date, Array, Object, String, Number, Set, isNaN, parseInt
});
vm.runInContext(src + `
;globalThis.__r = {
  due: opsRecDue, add: opsRecAdd, skip: opsRecSkip, dateFor: opsRecDateFor,
  sched: opsRecSchedule, enabled: opsRecEnabled, toggle: opsRecToggle,
  check: opsRecCheckOnStart, render: opsRecRenderModal,
  one: opsRecConfirmOne, skipOne: opsRecSkipOne,
  all: opsRecConfirmAll, skipAll: opsRecSkipAll, later: opsRecLater,
  get pending(){ return opsRecPending; }
};`, ctx);
const R = ctx.__r;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

const tpl = (id, name, day, over) => ({ id, name, type:'expense', way:'Безналичный',
  amount:3000, cat:'home', comment:'аренда', items:[], itemsMode:'none',
  repeat: day ? { day, enabled:true, ...(over||{}) } : undefined });

const setup = (templates, rec) => { state = { txns: [], templates, recurring: rec || { enabled:true } }; };

// ── когда спрашивать ─────────────────────────────
console.log('— срок наступил или нет —');
setup([ tpl('t1','Аренда',1) ]);
t('1-го числа срок наступил', R.due('2026-10-01').length === 1, R.due('2026-10-01').length);
t('позже в месяце тоже спросит', R.due('2026-10-15').length === 1, R.due('2026-10-15').length);

setup([ tpl('t1','Аренда',20) ]);
t('до 20-го не спрашивает', R.due('2026-10-05').length === 0, R.due('2026-10-05').length);
t('20-го спрашивает', R.due('2026-10-20').length === 1, R.due('2026-10-20').length);

setup([ tpl('t1','Аренда',1, { lastDone:'2026-10' }) ]);
t('за отмеченный месяц не спрашивает снова', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);
t('в следующем месяце спросит', R.due('2026-11-02').length === 1, R.due('2026-11-02').length);

console.log('\n— шаблоны без расписания —');
setup([ { id:'t9', name:'Разовый', type:'expense', way:'Наличный', amount:100 } ]);
t('без repeat не спрашивает', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);
setup([ tpl('t1','Аренда',1, { enabled:false }) ]);
t('выключенное расписание не спрашивает', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);
setup([ tpl('t1','Аренда',99) ]);
t('некорректное число игнорируется', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);

console.log('\n— короткие месяцы —');
t('31-е в феврале → последний день', R.dateFor('2026-02', 31) === '2026-02-28', R.dateFor('2026-02', 31));
t('29-е в феврале 2028 (високосный)', R.dateFor('2028-02', 31) === '2028-02-29', R.dateFor('2028-02', 31));
t('15-е остаётся 15-м', R.dateFor('2026-10', 15) === '2026-10-15', R.dateFor('2026-10', 15));
setup([ tpl('t1','Аренда',31) ]);
t('в феврале спросит 28-го', R.due('2026-02-28').length === 1, R.due('2026-02-28').length);

console.log('\n— догон пропущенных месяцев —');
setup([ tpl('t1','Аренда',1, { lastDone:'2026-07' }) ]);
let due = R.due('2026-10-05');
t('спросит за каждый пропущенный месяц', due.length === 3, due.length);
t('месяцы по порядку', due.map(d => d.ym).join(',') === '2026-08,2026-09,2026-10', due.map(d=>d.ym).join(','));
setup([ tpl('t1','Аренда',1, { lastDone:'2020-01' }) ]);
t('глубина догона ограничена', R.due('2026-10-05').length <= 7, R.due('2026-10-05').length);

console.log('\n— создание операции —');
setup([ tpl('t1','Аренда',1) ]);
R.add('t1','2026-10');
t('операция создана', state.txns.length === 1, state.txns.length);
let op = state.txns[0];
t('дата из расписания', op.date === '2026-10-01', op.date);
t('расход записан отрицательным', op.amount === -3000, op.amount);
t('категория из шаблона', op.cat === 'home', op.cat);
t('комментарий из шаблона', op.comment === 'аренда', op.comment);
t('помечена как повторяющаяся', op._recurring === 't1', op._recurring);
t('метка правки есть', !!op._editedAt, op._editedAt);
t('месяц отмечен', state.templates[0].repeat.lastDone === '2026-10', state.templates[0].repeat.lastDone);
t('метка шаблона сдвинута (второе устройство не спросит)', !!state.templates[0]._editedAt, state.templates[0]._editedAt);
t('повторно не спросит', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);

setup([ { ...tpl('t1','Подработка',5), type:'income', amount:800 } ]);
R.add('t1','2026-10');
t('приход записан положительным', state.txns[0].amount === 800, state.txns[0].amount);

setup([ { ...tpl('t1','Без суммы',5), amount:0 } ]);
toasts = [];
R.add('t1','2026-10');
t('нулевая сумма в шаблоне — предупреждение', toasts.some(x => x[0] === 'warn'), JSON.stringify(toasts));

console.log('\n— пропуск —');
setup([ tpl('t1','Аренда',1) ]);
R.skip('t1','2026-10');
t('операция не создана', state.txns.length === 0, state.txns.length);
t('месяц всё равно отмечен', state.templates[0].repeat.lastDone === '2026-10', state.templates[0].repeat.lastDone);
t('больше не спросит', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);

console.log('\n— общий выключатель —');
setup([ tpl('t1','Аренда',1) ], { enabled:false });
t('при выключенных напоминаниях не спрашивает', R.due('2026-10-15').length === 0, R.due('2026-10-15').length);
t('enabled() отражает состояние', R.enabled() === false, R.enabled());
R.toggle();
t('переключатель включает', R.enabled() === true, R.enabled());
t('и спрашивает снова', R.due('2026-10-15').length === 1, R.due('2026-10-15').length);
t('метка переключателя двигается', !!state.recurring._editedAt, state.recurring._editedAt);
R.toggle();
t('переключатель выключает', R.enabled() === false, R.enabled());

console.log('\n— диалог при старте —');
setup([ tpl('t1','Аренда',1), { ...tpl('t2','Интернет',1), amount:200 } ]);
R.check();
t('диалог открылся', nodes['rec-modal'].classList.contains('is-open'), 'не открылся');
t('в списке два платежа', R.pending.length === 2, R.pending.length);
t('разметка отрисована', nodes['rec-list'].innerHTML.includes('rec-row'), 'пусто');
R.one(0);
t('«Добавить» создаёт операцию', state.txns.length === 1, state.txns.length);
t('и убирает её из списка', R.pending.length === 1, R.pending.length);
R.skipOne(0);
t('«Пропустить» убирает без операции', state.txns.length === 1 && R.pending.length === 0,
  `txns=${state.txns.length} pending=${R.pending.length}`);
t('пустой список закрывает диалог', !nodes['rec-modal'].classList.contains('is-open'), 'остался открыт');

setup([ tpl('t1','Аренда',1), { ...tpl('t2','Интернет',1), amount:200 } ]);
R.check(); R.all();
t('«Добавить все» создаёт все', state.txns.length === 2, state.txns.length);
t('и закрывает диалог', !nodes['rec-modal'].classList.contains('is-open'), 'остался открыт');

setup([ tpl('t1','Аренда',1), { ...tpl('t2','Интернет',1), amount:200 } ]);
R.check(); R.skipAll();
t('«Пропустить все» ничего не создаёт', state.txns.length === 0, state.txns.length);
t('но отмечает месяц у обоих',
  state.templates.every(x => x.repeat.lastDone === new Date().toISOString().slice(0,7).replace(/^/, m => m) || x.repeat.lastDone),
  JSON.stringify(state.templates.map(x => x.repeat.lastDone)));

setup([ tpl('t1','Аренда',1) ]);
R.check(); R.later();
t('«Позже» не отмечает месяц', state.templates[0].repeat.lastDone === undefined, state.templates[0].repeat.lastDone);
t('и спросит при следующем запуске', R.due('2026-10-15').length === 1, R.due('2026-10-15').length);

console.log('\n— раскладка строки на узком экране —');
{
  const css = fs.readFileSync(ROOT + 'css/main.css', 'utf8').replace(/\r\n/g, '\n');
  t('текстовая часть вынесена в класс', src.includes('<div class="rec-row-main">'), 'всё ещё инлайн');
  // Та же ошибка, что была в списке шаблонов: кнопки с flex:1 отбирали
  // ширину у названия и суммы.
  t('кнопки не конкурируют с текстом', !css.includes('.rec-row .btn { flex: 1; }'), 'вернулось flex: 1');
  const mob = css.slice(css.indexOf('  .rec-row { flex-wrap: wrap;'));
  const block = mob.slice(0, mob.indexOf('\n}'));
  t('на телефоне текст занимает всю ширину',
    block.includes('.rec-row-main { flex: 1 1 100%; }'), block.slice(0, 120));
  t('«Добавить» и «Пропустить» делят вторую строку пополам',
    block.includes('.rec-row .btn { flex: 1 1 0; }'), 'нет правила');
}

console.log('\n— ничего не ожидается —');
setup([ tpl('t1','Аренда',1, { lastDone:'2099-12' }) ]);
R.check();
t('диалог не открывается без причины', !nodes['rec-modal'].classList.contains('is-open'), 'открылся зря');

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
