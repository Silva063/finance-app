// Счета и переводы (этап 1): старые данные без поля account, балансы,
// переводы с комиссией, статистика, лимит, совместимость со старой версией,
// управление счетами и слияние с Drive.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app    = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const accSrc = fs.readFileSync(ROOT + 'js/accounts.js', 'utf8');
const curSrc = fs.readFileSync(ROOT + 'js/currency.js', 'utf8');
const budSrc = fs.readFileSync(ROOT + 'js/budget.js', 'utf8');
const drive  = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');

// вырезает функцию из исходника по имени, считая фигурные скобки
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('нет функции ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

let state = { txns: [] };
const nodes = {};
const mkEl = (id, value) => (nodes[id] = { id, value: value || '', hidden: false, textContent: '', innerHTML: '',
  classList: { add(){}, remove(){}, contains(){ return true; } }, focus(){} });
let toasts = [], saves = 0, pushes = 0, renders = 0;

const ctx = vm.createContext({
  get opsState() { return state; }, set opsState(v) { state = v; },
  SYNC_TOMBSTONE_TTL_DAYS: 90,
  opsSave: () => { saves++; }, opsReRenderCurrent: () => { renders++; },
  opsCloseModal: () => {}, opsPrepareNextOp: () => {},
  opsGenId: (() => { let n = 0; return () => 'id' + (++n); })(),
  driveToken: null, driveDebouncedPush: () => { pushes++; },
  fmtAmt: (n, sign) => (sign ? (+n >= 0 ? '+' : '−') : '') + Math.abs(+n).toFixed(2),
  fmtDate: d => d, monthLabel: ym => ym,
  escHtml: s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  opsPlural: (n, a, b, c) => c,
  getMonths: () => [...new Set(state.txns.filter(t => !t._deleted).map(t => t.date.slice(0,7)))].sort(),
  txnsByMonth: ym => state.txns.filter(t => !t._deleted && t.date.slice(0,7) === ym),
  fillYearSel(){}, fillMonthSel(){},
  showErr: m => toasts.push(['err', m]), showWarn: m => toasts.push(['warn', m]), showOk: m => toasts.push(['ok', m]),
  appConfirm: () => Promise.resolve(true), appPrompt: () => Promise.resolve(null),
  document: { getElementById: id => nodes[id] || null, querySelector: () => null, querySelectorAll: () => [] },
  console: { log(){} }, Math, JSON, Date, Array, Object, String, Number, Set, Map, isNaN, parseFloat, Promise
});

const pieces = [
  curSrc,
  accSrc,
  budSrc,
  extractFn(app, 'opsStatAmt'),
  extractFn(app, 'calcSummary'),
  extractFn(app, 'opsStripTransferFields'),
  extractFn(app, 'opsSaveTransfer'),
  'function opsBudgetWarnAfterSave(){}',   // перекрываем — проверяется отдельно в стенде лимита
  drive.slice(drive.indexOf('function _mergeById'), drive.indexOf('function _mergeInv'))
];
vm.runInContext(pieces.join('\n') + `
;globalThis.__a = {
  accounts: opsAccounts, active: opsActiveAccounts, acc: opsAcc, name: opsAccName, way: opsAccWay,
  txnAcc: opsTxnAccount, stat: opsStatType, delta: opsTxnDelta, bal: opsAccBalance, used: opsAccUsed,
  summary: calcSummary, saveTransfer: opsSaveTransfer, strip: opsStripTransferFields,
  budget: opsBudgetCalc, merge: _mergeOps, defKind: opsAccDefaultOfKind,
  move: opsAccMove, archive: opsAccToggleArchive, del: opsAccDelete, rename: opsAccRename,
  setKind: opsAccSetKind, render: renderAccounts, amountHTML: opsTxnAmountHTML, accTag: opsTxnAccTag,
  set editId(v) { opsEditId = v; }
};
var opsEditId = null;`, ctx);
const A = ctx.__a;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };
const wait = () => new Promise(r => setTimeout(r, 5));

const inc = (date, amt, way, extra) => ({ id: 'i' + Math.random(), date, type: 'income',  way, amount:  amt, ...(extra||{}) });
const exp = (date, amt, way, extra) => ({ id: 'e' + Math.random(), date, type: 'expense', way, amount: -amt, ...(extra||{}) });
const tr  = (date, from, to, sum, fee, extra) => ({ id: 't' + Math.random(), date, type: 'transfer', from, to,
  amountFrom: sum, amountTo: sum, fee: fee || 0, amount: -(fee || 0), account: from, way: 'Безналичный', ...(extra||{}) });

(async () => {
  // ── старые данные ──────────────────────────────────
  console.log('— старые операции без поля account —');
  state = { txns: [ inc('2026-10-01', 4000, 'Безналичный'), exp('2026-10-02', 300, 'Наличный'),
                    exp('2026-10-03', 200, 'Безналичный') ] };
  t('счета по умолчанию создаются сами', A.accounts().map(a => a.id).join(',') === 'cash,card',
    A.accounts().map(a => a.id).join(','));
  t('«Наличный» → счёт cash', A.txnAcc(state.txns[1]) === 'cash', A.txnAcc(state.txns[1]));
  t('«Безналичный» → счёт card', A.txnAcc(state.txns[0]) === 'card', A.txnAcc(state.txns[0]));
  t('записи при этом не переписаны', state.txns.every(x => x.account === undefined), 'поле account появилось');
  t('баланс безнала', A.bal('card') === 3800, A.bal('card'));
  t('баланс налички', A.bal('cash') === -300, A.bal('cash'));
  t('способ выводится из вида счёта', A.way('cash') === 'Наличный' && A.way('card') === 'Безналичный',
    `${A.way('cash')}/${A.way('card')}`);
  t('явное поле account приоритетнее способа',
    A.txnAcc({ way: 'Наличный', account: 'card' }) === 'card', 'способ перебил счёт');

  // ── переводы ───────────────────────────────────────
  console.log('\n— перевод между счетами —');
  state = { txns: [ inc('2026-10-01', 4000, 'Безналичный'), tr('2026-10-05', 'card', 'cash', 1000, 15) ] };
  t('со счёта списано сумма + комиссия', A.bal('card') === 4000 - 1000 - 15, A.bal('card'));
  t('на счёт пришла сумма', A.bal('cash') === 1000, A.bal('cash'));
  const totalBal = A.bal('card') + A.bal('cash');
  const totalAmt = state.txns.reduce((s, x) => s + x.amount, 0);
  t('сумма остатков = сумма amount (перевод теряет только комиссию)', Math.abs(totalBal - totalAmt) < 0.001,
    `${totalBal} vs ${totalAmt}`);

  console.log('\n— статистика —');
  let s = A.summary(state.txns);
  t('перевод не попал в приход', s.income === 4000, s.income);
  t('в расход попала только комиссия', s.expense === -15, s.expense);
  t('итог уменьшился только на комиссию', s.net === 3985, s.net);
  t('переводы посчитаны отдельно', s.transfers === 1 && s.fees === 15, `${s.transfers}/${s.fees}`);
  state.txns.push(tr('2026-10-06', 'cash', 'card', 500, 0));
  s = A.summary(state.txns);
  t('перевод без комиссии вообще не влияет на итог', s.net === 3985, s.net);
  t('тип для статистики: без комиссии — не учитывается', A.stat(state.txns[2]) === null, A.stat(state.txns[2]));
  t('тип для статистики: с комиссией — расход', A.stat(state.txns[1]) === 'expense', A.stat(state.txns[1]));

  // ── лимит месяца ───────────────────────────────────
  console.log('\n— лимит месяца —');
  state = { txns: [ inc('2026-10-01', 4000, 'Безналичный'), exp('2026-10-02', 600, 'Безналичный'),
                    tr('2026-10-05', 'card', 'cash', 2000, 0) ],
            budget: { strategy: 'fixed', limit: 1600, months: [], show: {} } };
  let b = A.budget('2026-10');
  t('перевод не съедает лимит', b.spent === 600, b.spent);
  state.txns.push(tr('2026-10-06', 'cash', 'card', 300, 20));
  b = A.budget('2026-10');
  t('комиссия перевода — это трата', b.spent === 620, b.spent);
  state.budget = { strategy: 'save', income: 4000, save: 2500, months: [], show: {} };
  b = A.budget('2026-10');
  t('«отложено» не уменьшается из-за перевода', b.saved === 4000 - 600 - 20, b.saved);

  // ── совместимость со старой версией приложения ─────
  console.log('\n— как перевод увидит старая версия на другом устройстве —');
  const oldSummary = txns => {                     // логика до счетов: всё, что не приход, — расход
    let income = 0, expense = 0;
    for (const x of txns) { if (x.type === 'income') income += x.amount; else expense += x.amount; }
    return { income, expense };
  };
  state = { txns: [ inc('2026-10-01', 4000, 'Безналичный'), tr('2026-10-05', 'card', 'cash', 1650, 10) ] };
  const old = oldSummary(state.txns);
  t('старая версия не видит обмен как трату 1650', old.expense === -10, old.expense);
  t('у записи перевода есть способ для старой версии', state.txns[1].way === 'Безналичный', state.txns[1].way);

  // ── сохранение перевода из формы ───────────────────
  console.log('\n— сохранение перевода из формы —');
  state = { txns: [] };
  A.accounts();
  for (const [id, v] of [['m-acc','card'],['m-acc-to','cash'],['m-amt','1000'],['m-fee','12.5'],['m-comment','снял']])
    mkEl(id, v);
  toasts = [];
  A.saveTransfer(false, '2026-10-07');
  let rec = state.txns[0];
  t('запись создана', state.txns.length === 1, state.txns.length);
  t('тип перевод', rec && rec.type === 'transfer', rec && rec.type);
  t('стороны записаны', rec.from === 'card' && rec.to === 'cash', `${rec.from}→${rec.to}`);
  t('сумма в одной валюте одинакова с обеих сторон', rec.amountFrom === 1000 && rec.amountTo === 1000,
    `${rec.amountFrom}/${rec.amountTo}`);
  t('комиссия записана', rec.fee === 12.5, rec.fee);
  t('amount = −комиссия', rec.amount === -12.5, rec.amount);
  t('счёт и способ для совместимости', rec.account === 'card' && rec.way === 'Безналичный', `${rec.account}/${rec.way}`);
  t('у перевода нет категории и позиций', rec.cat === '' && rec.items.length === 0, `${rec.cat}/${rec.items.length}`);
  t('метка правки есть', !!rec._editedAt, rec._editedAt);

  console.log('\n— проверки формы перевода —');
  state = { txns: [] };
  nodes['m-acc-to'].value = 'card';
  toasts = [];
  A.saveTransfer(false, '2026-10-07');
  t('один и тот же счёт — ошибка, ничего не создано', state.txns.length === 0 && toasts.some(x => x[0] === 'err'),
    JSON.stringify(toasts));
  nodes['m-acc-to'].value = 'cash'; nodes['m-amt'].value = '';
  toasts = [];
  A.saveTransfer(false, '2026-10-07');
  t('пустая сумма — ошибка', state.txns.length === 0 && toasts.some(x => x[0] === 'err'), JSON.stringify(toasts));
  nodes['m-amt'].value = '500'; nodes['m-fee'].value = '-5';
  A.saveTransfer(false, '2026-10-07');
  t('отрицательная комиссия → 0', state.txns[0] && state.txns[0].fee === 0, state.txns[0] && state.txns[0].fee);

  console.log('\n— перевод превратили в обычную операцию —');
  const conv = tr('2026-10-01', 'card', 'cash', 100, 5);
  A.strip(conv);
  t('поля перевода убраны', ['from','to','amountFrom','amountTo','fee'].every(k => !(k in conv)),
    JSON.stringify(conv));

  // ── разметка ───────────────────────────────────────
  console.log('\n— отображение —');
  state = { txns: [] }; A.accounts();
  const trx = tr('2026-10-01', 'card', 'cash', 1000, 15);
  const amt = A.amountHTML(trx);
  t('сумма перевода нейтральная, не красная', amt.includes('amt-transfer') && !amt.includes('amt-neg'), amt);
  t('комиссия показана отдельно', amt.includes('комиссия'), amt);
  t('тег перевода показывает направление', A.accTag(trx).includes('Безнал → Наличные'), A.accTag(trx));
  t('тег обычной операции — имя счёта', A.accTag(exp('2026-10-01', 5, 'Наличный')).includes('Наличные'),
    A.accTag(exp('2026-10-01', 5, 'Наличный')));

  // ── вкладка «Счета»: остаток по всей истории ───────
  console.log('\n— вкладка «Счета» —');
  state = { txns: [ inc('2026-09-01', 1000, 'Безналичный'), exp('2026-10-02', 100, 'Безналичный') ] };
  for (const id of ['facc-acc','facc-search','facc-year','facc-month','acc-cards','acc-count','acc-body']) mkEl(id);
  nodes['facc-acc'].value = 'card';
  nodes['facc-month'].value = '2026-10';
  A.render();
  t('при фильтре по месяцу остаток считается по всей истории',
    nodes['acc-body'].innerHTML.includes('+900.00'), nodes['acc-body'].innerHTML.slice(0, 300));
  t('сентябрьская операция скрыта фильтром', !nodes['acc-body'].innerHTML.includes('2026-09-01'),
    'видна операция вне месяца');
  t('в подписи реальный остаток', nodes['acc-count'].textContent.includes('+900.00'), nodes['acc-count'].textContent);

  // ── управление счетами ─────────────────────────────
  console.log('\n— управление счетами —');
  state = { txns: [ exp('2026-10-02', 100, 'Наличный') ] };
  A.accounts();
  state.accounts.push({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'RUP', ord: 2 });
  t('счёт с операциями считается занятым', A.used('cash') === true && A.used('usd') === false,
    `${A.used('cash')}/${A.used('usd')}`);
  toasts = [];
  A.del('cash'); await wait();
  t('занятый счёт удалить нельзя', A.acc('cash') !== null && toasts.some(x => x[0] === 'warn'), JSON.stringify(toasts));
  A.del('usd'); await wait();
  t('пустой счёт удаляется', A.acc('usd') === null, JSON.stringify(state.accounts.map(a => a.id)));
  t('и оставляет надгробие', (state.accPurged || []).some(x => x.id === 'usd'), JSON.stringify(state.accPurged));

  A.rename('card', 'Е-кошелёк');
  t('переименование', A.name('card') === 'Е-кошелёк', A.name('card'));
  t('метка правки двигается', !!A.acc('card')._editedAt, A.acc('card')._editedAt);

  A.move('card', -1);
  t('перемещение меняет порядок', A.accounts().map(a => a.id).join(',') === 'card,cash',
    A.accounts().map(a => a.id).join(','));
  t('порядок записан явно в ord', A.acc('card').ord === 0 && A.acc('cash').ord === 1,
    `${A.acc('card').ord}/${A.acc('cash').ord}`);

  A.archive('cash');
  t('архивирование убирает из активных', !A.active().some(a => a.id === 'cash'), A.active().map(a => a.id).join(','));
  toasts = [];
  A.archive('card');
  t('последний активный счёт архивировать нельзя', A.active().length === 1 && toasts.some(x => x[0] === 'warn'),
    JSON.stringify(toasts));
  t('у архивного счёта баланс сохраняется', A.bal('cash') === -100, A.bal('cash'));

  A.archive('cash');   // вернуть
  A.setKind('card', 'cash');
  t('быстрый ввод «нал» берёт первый наличный счёт', A.defKind('cash') === 'card', A.defKind('cash'));

  // ── слияние с Drive ────────────────────────────────
  console.log('\n— слияние счетов с Drive —');
  const acc = (id, name, ord, at) => ({ id, name, kind: 'card', currency: 'RUP', ord, _editedAt: at });
  const pc = { txns: [], _lastModified: '2026-10-04T12:00:00.000Z',
    accounts: [ acc('cash','Наличные',0,'2026-09-01T00:00:00.000Z'), acc('card','Е-кошелёк',1,'2026-10-04T12:00:00.000Z') ] };
  const cloud = { txns: [], _lastModified: '2026-10-05T08:00:00.000Z',
    accounts: [ acc('cash','Наличные',0,'2026-09-01T00:00:00.000Z'), acc('card','Безнал',1,'2026-09-01T00:00:00.000Z') ] };
  let m = A.merge(pc, cloud);
  t('переименование счёта доехало (облако «новее» по _lastModified)',
    m.accounts.find(a => a.id === 'card').name === 'Е-кошелёк', m.accounts.find(a => a.id === 'card').name);

  const devA = { txns: [], _lastModified: '2026-10-04T12:00:00.000Z', accounts: [ acc('usd','Доллары',2,'2026-10-04T12:00:00.000Z') ] };
  const devB = { txns: [], _lastModified: '2026-10-06T12:00:00.000Z', accounts: [ acc('eur','Евро',3,'2026-10-06T12:00:00.000Z') ] };
  m = A.merge(devA, devB);
  t('счета с двух устройств уцелели', m.accounts.length === 2, m.accounts.map(a => a.id).join(','));
  t('и упорядочены по ord', m.accounts[0].id === 'usd', m.accounts.map(a => a.id).join(','));

  const delSide = { txns: [], _lastModified: '2026-10-07T00:00:00.000Z', accounts: [ acc('card','Безнал',1,'2026-09-01T00:00:00.000Z') ],
    accPurged: [ { id: 'usd', at: '2026-10-07T00:00:00.000Z' } ] };
  const stillHas = { txns: [], _lastModified: '2026-10-01T00:00:00.000Z',
    accounts: [ acc('usd','Доллары',2,'2026-10-01T00:00:00.000Z'), acc('card','Безнал',1,'2026-09-01T00:00:00.000Z') ] };
  m = A.merge(delSide, stillHas);
  t('удалённый счёт не возвращается', !m.accounts.some(a => a.id === 'usd'), m.accounts.map(a => a.id).join(','));

  const legacy = { txns: [ exp('2026-10-01', 5, 'Наличный') ], _lastModified: '2026-01-01T00:00:00.000Z' };
  m = A.merge(legacy, legacy);
  t('старый файл без счетов не ломает слияние', m.txns.length === 1 && m.accounts === undefined,
    JSON.stringify({ n: m.txns.length, acc: m.accounts }));

  const withTr = { txns: [ tr('2026-10-05','card','cash',1000,15, { _editedAt: '2026-10-05T00:00:00.000Z' }) ],
    _lastModified: '2026-10-05T00:00:00.000Z' };
  m = A.merge(withTr, { txns: [], _lastModified: '2026-09-01T00:00:00.000Z' });
  const mt = m.txns[0];
  t('перевод переживает слияние целиком',
    mt && mt.type === 'transfer' && mt.from === 'card' && mt.to === 'cash' && mt.fee === 15 && mt.amount === -15,
    JSON.stringify(mt));

  // ── статические проверки интеграции ────────────────
  console.log('\n— интеграция —');
  t('импорт Excel проверяет «безнал» раньше «нал»',
    app.includes("wayStr.includes('безнал') || !wayStr.includes('нал')"), 'старая ошибка: всё становилось наличным');
  t('импорт Excel пропускает переводы и сообщает об этом', app.includes('skippedTransfers++'), 'нет обработки');
  t('график считает комиссии расходом', app.includes("filter(t=>t.type!=='income')"), 'комиссии выпадают из графика');
  t('категории учитывают перевод только комиссией', app.includes('txns.filter(t => opsStatType(t))'), 'нет фильтра');
  t('старых вкладок нал/безнал нет', !app.includes('function renderP2') && !app.includes('function renderP5'), 'остались');
  t('быстрый ввод пишет счёт', app.includes("opsAccDefaultOfKind(way === 'Наличный' ? 'cash' : 'card')"), 'не пишет');

  console.log(`\nитого: ${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
