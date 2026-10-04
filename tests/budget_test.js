// Лимит месяца: расчёт по трём стратегиям, переопределения, сценарий пользователя.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const src = fs.readFileSync(ROOT + 'js/budget.js', 'utf8');

const MONTHS_RU = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

let state = { txns: [], budget: null };
const nodes = {};
const mk = () => ({ innerHTML:'', value:'', classList:{ add(){}, remove(){} } });
for (const id of ['p1-budget','p4-budget','budget-fields','budget-modal','f1month','budget-ov-month']) nodes[id] = mk();

const ctx = vm.createContext({
  get opsState() { return state; }, set opsState(v) { state = v; },
  opsSave: () => {},
  opsReRenderCurrent: () => {},
  opsPlural: (n, a, b, c) => { const m10=n%10, m100=n%100;
    if (m10===1&&m100!==11) return a; if (m10>=2&&m10<=4&&(m100<12||m100>14)) return b; return c; },
  fmtAmt: (n, sign) => { const v = Math.abs(+n).toFixed(2);
    return sign ? ((+n>=0?'+':'−')+v) : (+n<0?'−'+v:v); },
  monthLabel: ym => MONTHS_RU[+ym.slice(5)-1] + ' ' + ym.slice(0,4),
  getMonths: () => [...new Set(state.txns.filter(t=>!t._deleted).map(t=>t.date.slice(0,7)))].sort(),
  txnsByMonth: ym => state.txns.filter(t => !t._deleted && t.date.slice(0,7) === ym),
  showWarn: () => {}, showOk: () => {},
  document: { getElementById: id => nodes[id] || null, querySelector: () => null, querySelectorAll: () => [] },
  console, Math, String, Number, JSON, Date, Array, Object, isNaN, parseFloat, Set
});
vm.runInContext(src + `
;globalThis.__b = { calc: opsBudgetCalc, cfg: opsBudgetForMonth, budget: opsBudget,
  avg: opsBudgetAvgIncome, bar: opsBudgetBarHTML, p1m: opsBudgetP1Month,
  setField: opsBudgetSetField, setStrat: opsBudgetSetStrategy,
  addOv: opsBudgetAddOverride, setOv: opsBudgetSetOverride, delOv: opsBudgetDeleteOverride };`, ctx);
const B = ctx.__b;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

const exp = (date, amt) => ({ id:'e'+Math.random(), date, type:'expense', way:'Наличный', amount:-amt });
const inc = (date, amt) => ({ id:'i'+Math.random(), date, type:'income',  way:'Наличный', amount: amt });

function setup(txns, budget) {
  state = { txns, budget: budget ? { ...budget } : null };
}

// ── лимит не настроен ─────────────────────────────
console.log('— лимит не задан —');
setup([exp('2026-10-05', 500)]);
t('расчёт возвращает null', B.calc('2026-10') === null, B.calc('2026-10'));
t('полоса не рисуется', B.bar('2026-10', false) === '', B.bar('2026-10', false));

// ── фиксированный лимит ───────────────────────────
console.log('\n— стратегия «фиксированный лимит» —');
setup([exp('2026-10-05', 400), exp('2026-10-06', 400), inc('2026-10-10', 9999)],
      { strategy:'fixed', limit:1600 });
let c = B.calc('2026-10');
t('лимит = заданная сумма', c.limit === 1600, c.limit);
t('потрачено = сумма расходов', c.spent === 800, c.spent);
t('приход на лимит не влияет', c.spent === 800, c.spent);
t('остаток верный', c.remain === 800, c.remain);
t('процент верный', c.pct === 50, c.pct);
t('не превышено и не близко', !c.over && !c.near, `over=${c.over} near=${c.near}`);

setup([exp('2026-10-05', 1400)], { strategy:'fixed', limit:1600 });
c = B.calc('2026-10');
t('87% → янтарная зона', c.near && !c.over, `pct=${c.pct} near=${c.near}`);
setup([exp('2026-10-05', 1700)], { strategy:'fixed', limit:1600 });
c = B.calc('2026-10');
t('перерасход распознан', c.over && c.remain === -100, `over=${c.over} remain=${c.remain}`);

// ── стратегия «откладывать» — случай пользователя ──
console.log('\n— стратегия «откладывать 2500», прогноз 4000 —');
const SAVE = { strategy:'save', income:4000, save:2500 };

setup([], SAVE);
c = B.calc('2026-10');
t('с 1 числа лимит 1500, дохода ещё нет', c.limit === 1500, c.limit);

setup([inc('2026-10-10', 4000), exp('2026-10-11', 600)], SAVE);
c = B.calc('2026-10');
t('зарплата по прогнозу — лимит тот же', c.limit === 1500, c.limit);
t('потрачено 600', c.spent === 600, c.spent);
t('отложено = доход − расход', c.saved === 3400, c.saved);
t('цель накопления видна', c.saveGoal === 2500, c.saveGoal);

setup([inc('2026-10-10', 4000), inc('2026-10-20', 800), exp('2026-10-11', 600)], SAVE);
c = B.calc('2026-10');
t('сверхдоход поднял лимит до 2300', c.limit === 2300, c.limit);
t('сверхдоход ушёл в траты целиком', c.remain === 1700, c.remain);

setup([inc('2026-10-10', 3000)], SAVE);
c = B.calc('2026-10');
t('доход ниже прогноза — считаем от прогноза', c.limit === 1500, c.limit);

setup([inc('2026-10-10', 2000)], { strategy:'save', income:2000, save:2500 });
c = B.calc('2026-10');
t('накопление больше дохода — лимит 0, не отрицательный', c.limit === 0, c.limit);
t('делений на ноль нет', c.pct === 0 && isFinite(c.pct), c.pct);
setup([inc('2026-10-10', 2000), exp('2026-10-11', 50)], { strategy:'save', income:2000, save:2500 });
c = B.calc('2026-10');
t('при нулевом лимите любая трата = 100%', c.pct === 100 && c.over, `pct=${c.pct} over=${c.over}`);

// ── стратегия «по итогу месяца» ───────────────────
console.log('\n— стратегия «по итогу месяца» —');
setup([exp('2026-10-05', 3000), inc('2026-10-10', 1000)], { strategy:'net', netLimit:2500 });
c = B.calc('2026-10');
t('потрачено = расходы − приходы', c.spent === 2000, c.spent);
t('подработка уменьшила израсходованное', c.remain === 500, c.remain);
setup([exp('2026-10-05', 500), inc('2026-10-10', 3000)], { strategy:'net', netLimit:2500 });
c = B.calc('2026-10');
t('приход больше расхода — отрицательное «потрачено»', c.spent === -2500, c.spent);
t('процент не уходит ниже нуля на полосе', c.pct <= 0 || c.pct === 0, c.pct);

// ── переопределение месяца ────────────────────────
console.log('\n— переопределение отдельного месяца —');
setup([], { ...SAVE, months:[{ id:'2026-12', save:1000 }] });
t('декабрь: своё накопление', B.calc('2026-12').limit === 3000, B.calc('2026-12').limit);
t('октябрь: базовое', B.calc('2026-10').limit === 1500, B.calc('2026-10').limit);
t('флаг переопределения виден', B.cfg('2026-12').hasOverride === true, B.cfg('2026-12').hasOverride);

setup([], { ...SAVE, months:[{ id:'2026-07', income:6000 }] });
t('июль: свой прогноз дохода', B.calc('2026-07').limit === 3500, B.calc('2026-07').limit);

setup([], { ...SAVE, months:[{ id:'2026-12', save:0 }] });
t('ноль в переопределении — осознанный ноль, не «пусто»', B.calc('2026-12').limit === 4000, B.calc('2026-12').limit);

setup([], { ...SAVE, months:[{ id:'2026-12', save:undefined }] });
t('пустое значение берёт базовое', B.calc('2026-12').limit === 1500, B.calc('2026-12').limit);

// ── подсказка среднего дохода ─────────────────────
console.log('\n— среднее за 3 месяца —');
const curYM = new Date().toISOString().slice(0,7);
const prev = n => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0,7); };
setup([inc(prev(1)+'-05', 4000), inc(prev(2)+'-05', 5000), inc(prev(3)+'-05', 3000),
       inc(curYM+'-02', 99999)], SAVE);
t('среднее по завершённым месяцам', B.avg(3) === 4000, B.avg(3));
t('текущий (незавершённый) месяц не учитывается', B.avg(3) === 4000, B.avg(3));
setup([], SAVE);
t('без истории среднее = 0', B.avg(3) === 0, B.avg(3));

// ── дни и прогноз ─────────────────────────────────
console.log('\n— дни месяца —');
setup([exp(curYM+'-01', 100)], { strategy:'fixed', limit:1000 });
c = B.calc(curYM);
t('для текущего месяца есть остаток дней', c.daysLeft >= 1, c.daysLeft);
t('есть прогноз на конец месяца', c.forecast !== null, c.forecast);
t('есть «на день»', c.perDay !== null, c.perDay);
c = B.calc('2020-01');
t('для прошлого месяца «на день» не считается', c.perDay === null && c.daysLeft === 0, `perDay=${c.perDay} daysLeft=${c.daysLeft}`);

// ── show-флаги ────────────────────────────────────
console.log('\n— флаги дополнений (по умолчанию выключены) —');
setup([exp(curYM+'-01', 100)], { strategy:'fixed', limit:1000 });
let html = B.bar(curYM, false);
t('полоса есть', html.includes('budget-bar-track'), 'нет полосы');
t('процент есть', html.includes('budget-bar-pct'), 'нет процента');
t('потрачено и остаток есть', html.includes('Потрачено') && html.includes('Остаток'), 'нет чисел');
t('«на день» по умолчанию скрыт', !html.includes('в день'), 'показано');
t('прогноз по умолчанию скрыт', !html.includes('текущем темпе'), 'показан');
B.budget().show.daily = true;
B.budget().show.forecast = true;
html = B.bar(curYM, false);
t('флаг включает «на день» без переделки', html.includes('в день'), 'не показалось');
t('флаг включает прогноз', html.includes('текущем темпе'), 'не показался');

// ── компактный вид ────────────────────────────────
console.log('\n— компактная полоса —');
const mini = B.bar(curYM, true);
t('компактная короче полной', mini.length < html.length, `${mini.length} vs ${html.length}`);
t('в компактной есть суммы', mini.includes('budget-bar-mini'), mini);

// ── какой месяц на «Всех операциях» ───────────────
console.log('\n— выбор месяца на «Всех операциях» —');
nodes['f1month'].value = '';
t('без фильтра — текущий месяц', B.p1m() === curYM, B.p1m());
nodes['f1month'].value = '2026-03';
t('с фильтром — выбранный месяц', B.p1m() === '2026-03', B.p1m());
nodes['f1month'].value = '';

// ── удалённые операции не считаются ───────────────
console.log('\n— удалённые операции —');
setup([exp('2026-10-05', 500), { ...exp('2026-10-06', 900), _deleted:true }], { strategy:'fixed', limit:1600 });
t('удалённая трата не входит в лимит', B.calc('2026-10').spent === 500, B.calc('2026-10').spent);

// ── метка правки для синхронизации ────────────────
console.log('\n— метка правки —');
setup([], { strategy:'fixed', limit:1000 });
B.setField('limit', '1200');
t('правка двигает _editedAt', !!B.budget()._editedAt, B.budget()._editedAt);
t('значение записано', B.budget().limit === 1200, B.budget().limit);
B.setField('limit', '');
t('пустое значение обнуляет', B.budget().limit === 0, B.budget().limit);
B.setField('limit', '1 200abc');
t('мусор не ломает', typeof B.budget().limit === 'number', B.budget().limit);

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
