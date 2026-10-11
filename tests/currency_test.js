// Валюты и курсы (этап 2): неизменность рублёвых данных, обмен с фиксацией
// курса, валютные траты, поиск курса, пересчёт в базовую, итог по счетам,
// лимит, форма, управление валютами, слияние с Drive.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app    = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const curSrc = fs.readFileSync(ROOT + 'js/currency.js', 'utf8');
const accSrc = fs.readFileSync(ROOT + 'js/accounts.js', 'utf8');
const budSrc = fs.readFileSync(ROOT + 'js/budget.js', 'utf8');
const recSrc = fs.readFileSync(ROOT + 'js/recurring.js', 'utf8');
const drive  = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');
const html   = fs.readFileSync(ROOT + 'index.html', 'utf8');

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
const mkEl = (id, value) => (nodes[id] = { id, value: value == null ? '' : value, hidden: false, textContent: '',
  innerHTML: '', options: [], classList: { add(){}, remove(){}, contains(){ return true; } }, focus(){} });
let toasts = [], confirmAnswer = true;

const ctx = vm.createContext({
  get opsState() { return state; }, set opsState(v) { state = v; },
  SYNC_TOMBSTONE_TTL_DAYS: 90,
  opsSave(){}, opsReRenderCurrent(){}, opsCloseModal(){}, opsPrepareNextOp(){},
  opsGetCurrentMode: () => 'none', opsGetItems: () => [], opsCats: () => [], opsTplRender(){},
  opsBudgetWarnAfterSave(){},
  opsGenId: (() => { let n = 0; return () => 'id' + (++n); })(),
  driveToken: null, driveDebouncedPush(){},
  fmtAmt: (n, sign) => (sign ? (+n >= 0 ? '+' : '−') : '') + Math.abs(+n).toFixed(2),
  fmtDate: d => d, monthLabel: ym => ym, opsPlural: (n, a, b, c) => c,
  escHtml: s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  getMonths: () => [...new Set(state.txns.filter(t => !t._deleted).map(t => t.date.slice(0,7)))].sort(),
  txnsByMonth: ym => state.txns.filter(t => !t._deleted && t.date.slice(0,7) === ym),
  opsLocalDate: () => '2026-10-11',
  showErr: m => toasts.push(['err', m]), showWarn: m => toasts.push(['warn', m]), showOk: m => toasts.push(['ok', m]),
  appConfirm: () => Promise.resolve(confirmAnswer), appPrompt: () => Promise.resolve(null),
  document: { getElementById: id => nodes[id] || null, querySelector: () => null, querySelectorAll: () => [] },
  console: { log(){} }, Math, JSON, Date, Array, Object, String, Number, Set, Map, isNaN, parseFloat, Promise
});

vm.runInContext([
  curSrc, accSrc, budSrc, recSrc,
  extractFn(app, 'opsStatAmt'), extractFn(app, 'calcSummary'),
  extractFn(app, 'opsStripTransferFields'), extractFn(app, 'opsSaveTransfer'), extractFn(app, 'opsSaveOp'),
  'function opsBudgetWarnAfterSave(){}',
  drive.slice(drive.indexOf('function _mergeById'), drive.indexOf('function _mergeInv')),
  'var opsEditId = null;'
].join('\n') + `
;globalThis.__c = {
  curs: opsCurrencies, cur: opsCur, base: opsBaseCurrency, accCur: opsAccCurrency,
  rate: opsFxRate, rateInfo: opsFxRateInfo, baseAmt: opsBaseAmount, baseOrNull: opsBaseAmountOrNull,
  missing: opsTxnRateMissing, total: opsAccountsTotalBase, fmt: opsFmtMoney,
  bal: opsAccBalance, accounts: opsAccounts, summary: calcSummary, budget: opsBudgetCalc,
  saveOp: opsSaveOp, saveTransfer: opsSaveTransfer, amountHTML: opsTxnAmountHTML,
  formSync: opsFxFormSync, rateTouch: opsRateTouch, rateReset: opsRateReset,
  setAccCur: opsAccSetCurrency, curAdd: opsCurAdd, curDel: opsCurDelete, setBase: opsSetBaseCurrency,
  recAdd: opsRecAdd, merge: _mergeOps
};`, ctx);
const C = ctx.__c;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };
const near = (a, b) => Math.abs(a - b) < 0.005;
const wait = () => new Promise(r => setTimeout(r, 5));

const ACC = (extra) => [
  { id: 'cash', name: 'Наличные', kind: 'cash', currency: 'RUP', ord: 0 },
  { id: 'card', name: 'Безнал',   kind: 'card', currency: 'RUP', ord: 1 },
  { id: 'usd',  name: 'Доллары',  kind: 'cash', currency: 'USD', ord: 2 },
  { id: 'eur',  name: 'Евро',     kind: 'cash', currency: 'EUR', ord: 3 },
  ...(extra || [])
];
const inc = (date, amt, account, x) => ({ id: 'i' + Math.random(), date, type: 'income',  account, amount:  amt, ...(x||{}) });
const exp = (date, amt, account, x) => ({ id: 'e' + Math.random(), date, type: 'expense', account, amount: -amt, ...(x||{}) });
const xfer = (date, from, to, aFrom, aTo, fee, x) => ({ id: 'x' + date + Math.random(), date, type: 'transfer', from, to,
  amountFrom: aFrom, amountTo: aTo, fee: fee || 0, amount: -(fee || 0), account: from, ...(x||{}) });

(async () => {
  // ── неизменность для рублёвых данных ───────────────
  console.log('— старые рублёвые данные не меняются —');
  state = { txns: [
    { id:'a', date:'2026-10-01', type:'income',  way:'Безналичный', amount: 4000 },
    { id:'b', date:'2026-10-02', type:'expense', way:'Наличный',    amount: -320.5 },
    { id:'c', date:'2026-10-03', type:'expense', way:'Безналичный', amount: -99.99 }
  ] };
  t('базовая валюта по умолчанию — RUP', C.base() === 'RUP', C.base());
  t('валюты по умолчанию: RUP, USD, EUR, MDL, RUB', C.curs().map(c => c.id).join(',') === 'RUP,USD,EUR,MDL,RUB',
    C.curs().map(c => c.id).join(','));
  t('сумма в базовой ровно равна amount для каждой операции',
    state.txns.every(x => C.baseAmt(x) === x.amount), state.txns.map(x => C.baseAmt(x)).join(','));
  const s0 = C.summary(state.txns);
  t('сводка совпадает с прежней логикой', s0.income === 4000 && near(s0.expense, -420.49), JSON.stringify(s0));
  t('у рублёвых сумм не появилось кода валюты', C.fmt(100, 'RUP') === '100.00', C.fmt(100, 'RUP'));

  // ── обмен ──────────────────────────────────────────
  console.log('\n— покупка долларов за рубли —');
  state = { accounts: ACC(), txns: [ inc('2026-10-01', 5000, 'card'),
                                     xfer('2026-10-05', 'card', 'usd', 1650, 100, 10) ] };
  t('с рублёвого счёта ушло 1650 + комиссия', C.bal('card') === 5000 - 1650 - 10, C.bal('card'));
  t('на долларовый пришло 100', C.bal('usd') === 100, C.bal('usd'));
  const s1 = C.summary(state.txns);
  t('обмен — не расход: в расход попала только комиссия', near(s1.expense, -10), s1.expense);
  t('курс зафиксирован самим обменом: 1 USD = 16,5', near(C.rate('USD', 'RUP'), 16.5), C.rate('USD', 'RUP'));
  t('и в обратную сторону', near(C.rate('RUP', 'USD'), 1 / 16.5), C.rate('RUP', 'USD'));
  const rowX = C.amountHTML(state.txns[1]);
  t('в строке обмена видны обе стороны', rowX.includes('1650.00') && rowX.includes('100.00 USD'), rowX);
  t('и курс', rowX.includes('1 USD = 16,5'), rowX);

  // ── валютная трата ─────────────────────────────────
  console.log('\n— трата в долларах —');
  state.txns.push(exp('2026-10-06', 10, 'usd', { rate: 16.5, rateTo: 'RUP' }));
  t('в базовой: −165', near(C.baseAmt(state.txns[2]), -165), C.baseAmt(state.txns[2]));
  t('сводка учитывает её в рублях', near(C.summary(state.txns).expense, -175), C.summary(state.txns).expense);
  t('с долларового счёта списано 10 долларов', C.bal('usd') === 90, C.bal('usd'));
  const rowE = C.amountHTML(state.txns[2]);
  t('строка: сумма в долларах и пересчёт', rowE.includes('−10.00 USD') && rowE.includes('≈ −165.00 RUP'), rowE);

  console.log('\n— сохранённый курс не «плывёт» —');
  state.txns.push(xfer('2026-10-20', 'card', 'usd', 1700, 100, 0));
  t('новый обмен по 17 не меняет прошлую трату', near(C.baseAmt(state.txns[2]), -165), C.baseAmt(state.txns[2]));
  t('свежий курс для подстановки — 17', near(C.rate('USD', 'RUP'), 17), C.rate('USD', 'RUP'));
  t('для даты 10 октября — курс на ту дату, 16,5', near(C.rate('USD', 'RUP', '2026-10-10'), 16.5),
    C.rate('USD', 'RUP', '2026-10-10'));
  t('до первого обмена курса нет', C.rate('USD', 'RUP', '2026-10-01') === null, C.rate('USD', 'RUP', '2026-10-01'));

  // ── источники курса ────────────────────────────────
  console.log('\n— если обменов не было —');
  state = { accounts: ACC(), txns: [ exp('2026-10-03', 20, 'eur', { rate: 19, rateTo: 'RUP' }) ] };
  let info = C.rateInfo('EUR', 'RUP');
  t('берётся курс, введённый руками в операции', info && near(info.r, 19) && info.src === 'manual', JSON.stringify(info));

  state = { accounts: ACC(), txns: [ xfer('2026-10-01', 'card', 'usd', 1650, 100, 0),
                                     xfer('2026-10-02', 'card', 'eur', 1900, 100, 0) ] };
  info = C.rateInfo('USD', 'EUR');
  t('USD→EUR через базовую: 16,5 / 19', info && near(info.r, 16.5 / 19) && info.src === 'cross', JSON.stringify(info));

  console.log('\n— курса нет совсем —');
  state = { accounts: ACC(), txns: [ inc('2026-10-01', 1000, 'card'), exp('2026-10-04', 5, 'eur') ] };
  t('операция без курса помечена', C.missing(state.txns[1]) === true, C.missing(state.txns[1]));
  t('и не искажает итоги (не попадает в них)', C.summary(state.txns).expense === 0, C.summary(state.txns).expense);
  t('в строке видно «нет курса»', C.amountHTML(state.txns[1]).includes('нет курса'), C.amountHTML(state.txns[1]));

  // ── комиссия в валюте ──────────────────────────────
  console.log('\n— продажа долларов с комиссией в долларах —');
  state = { accounts: ACC(), txns: [ xfer('2026-10-05', 'usd', 'card', 100, 1640, 1) ] };
  t('комиссия 1 USD пересчитана по курсу этой сделки', near(C.baseAmt(state.txns[0]), -16.4), C.baseAmt(state.txns[0]));
  t('с долларового списано 101', C.bal('usd') === -101, C.bal('usd'));

  // ── итог по счетам ─────────────────────────────────
  console.log('\n— «Всего на счетах» в базовой валюте —');
  state = { accounts: ACC(), txns: [ inc('2026-10-01', 3000, 'card'),
                                     xfer('2026-10-05', 'card', 'usd', 1650, 100, 0) ] };
  let tb = C.total();
  t('рубли + доллары по курсу последнего обмена', near(tb.total, 3000 - 1650 + 100 * 16.5), tb.total);
  t('дата курса указана', tb.rateDate === '2026-10-05', tb.rateDate);
  state.txns.push(inc('2026-10-06', 50, 'eur'));
  tb = C.total();
  t('валюта без курса перечислена отдельно, а не сложена как попало', tb.missing.join(',') === 'EUR' && near(tb.total, 3000),
    JSON.stringify(tb));

  // ── лимит месяца ───────────────────────────────────
  console.log('\n— лимит месяца в базовой валюте —');
  state = { accounts: ACC(), budget: { strategy: 'fixed', limit: 1000, months: [], show: {} }, txns: [
    inc('2026-10-01', 4000, 'card'), xfer('2026-10-02', 'card', 'usd', 1650, 100, 0),
    exp('2026-10-03', 10, 'usd', { rate: 16.5, rateTo: 'RUP' }) ] };
  const b = C.budget('2026-10');
  t('покупка долларов не тратит лимит, трата в долларах — тратит по курсу', near(b.spent, 165), b.spent);

  // ── смена базовой валюты ───────────────────────────
  console.log('\n— смена базовой валюты —');
  state = { accounts: ACC(), fxCfg: { base: 'USD' }, txns: [
    xfer('2026-10-01', 'card', 'usd', 1650, 100, 0),
    exp('2026-10-02', 330, 'card'),
    exp('2026-10-03', 5, 'eur', { rate: 19, rateTo: 'RUP' }) ] };
  t('рублёвая трата пересчитана в доллары по обмену', near(C.baseAmt(state.txns[1]), -20), C.baseAmt(state.txns[1]));
  t('евро с курсом к рублю — через рубль в доллары', near(C.baseAmt(state.txns[2]), -5 * 19 / 16.5), C.baseAmt(state.txns[2]));

  // ── форма: приход/расход на валютном счёте ─────────
  console.log('\n— форма: трата в долларах —');
  state = { accounts: ACC(), txns: [ xfer('2026-10-05', 'card', 'usd', 1650, 100, 0) ] };
  for (const [id, v] of [['m-date','2026-10-07'],['m-type','expense'],['m-acc','usd'],['m-acc-to','card'],
      ['m-amt','12'],['m-comment','кофе'],['m-cat',''],['m-rate',''],['m-amt-to',''],['m-fee',''],
      ['m-rate-row'],['m-rate-label'],['m-rate-src'],['m-amt-label'],['m-fee-label'],['m-amt-to-field'],
      ['m-amt-to-label'],['m-fx-preview'],['m-transfer-row'],['m-cat-field'],['m-items-details'],['m-acc-label']])
    mkEl(id, v);
  C.rateReset(false);
  C.formSync();
  t('для долларового счёта показано поле курса', nodes['m-rate-row'].hidden === false, nodes['m-rate-row'].hidden);
  t('курс подставлен из последнего обмена', near(+nodes['m-rate'].value, 16.5), nodes['m-rate'].value);
  t('подпись говорит, откуда курс', nodes['m-rate-src'].textContent.includes('обмену от 2026-10-05'), nodes['m-rate-src'].textContent);
  t('подпись суммы в валюте счёта', nodes['m-amt-label'].textContent.includes('USD'), nodes['m-amt-label'].textContent);
  t('пересчёт показан сразу', nodes['m-fx-preview'].textContent.includes('198.00 RUP'), nodes['m-fx-preview'].textContent);

  nodes['m-rate'].value = '17.2'; C.rateTouch();
  C.formSync();
  t('поправленный руками курс не перетирается', nodes['m-rate'].value === '17.2', nodes['m-rate'].value);

  C.saveOp(false);
  const saved = state.txns[state.txns.length - 1];
  t('операция сохранена с курсом', saved.type === 'expense' && saved.rate === 17.2 && saved.rateTo === 'RUP', JSON.stringify(saved));
  t('сумма записана в долларах', saved.amount === -12, saved.amount);
  t('в базовой — по введённому курсу', near(C.baseAmt(saved), -206.4), C.baseAmt(saved));

  console.log('\n— форма: без курса не сохранить —');
  const before = state.txns.length;
  nodes['m-rate'].value = ''; toasts = [];
  C.saveOp(false);
  t('без курса — ошибка, операция не создана', state.txns.length === before && toasts.some(x => x[0] === 'err'),
    JSON.stringify(toasts));

  console.log('\n— форма: рублёвый счёт — поля курса нет —');
  nodes['m-acc'].value = 'card'; C.rateReset(false); C.formSync();
  t('поле курса скрыто', nodes['m-rate-row'].hidden === true, nodes['m-rate-row'].hidden);
  nodes['m-amt'].value = '50';
  C.saveOp(false);
  const rub = state.txns[state.txns.length - 1];
  t('рублёвая операция без курса', rub.rate === undefined && rub.amount === -50, JSON.stringify(rub));

  // ── форма: обмен ───────────────────────────────────
  console.log('\n— форма: обмен —');
  state = { accounts: ACC(), txns: [] };
  nodes['m-type'].value = 'transfer'; nodes['m-acc'].value = 'card'; nodes['m-acc-to'].value = 'usd';
  nodes['m-amt'].value = '1650'; nodes['m-amt-to'].value = ''; nodes['m-fee'].value = '10';
  C.formSync();
  t('для обмена показано поле «Получено»', nodes['m-amt-to-field'].hidden === false, nodes['m-amt-to-field'].hidden);
  t('подпись в валюте получателя', nodes['m-amt-to-label'].textContent.includes('USD'), nodes['m-amt-to-label'].textContent);
  t('поле курса для перевода не нужно', nodes['m-rate-row'].hidden === true, nodes['m-rate-row'].hidden);
  toasts = [];
  C.saveTransfer(false, '2026-10-08');
  t('без полученной суммы — ошибка', state.txns.length === 0 && toasts.some(x => x[0] === 'err'), JSON.stringify(toasts));
  nodes['m-amt-to'].value = '100';
  C.formSync();
  t('курс показан, пока вводишь', nodes['m-fx-preview'].textContent.includes('1 USD = 16,5'), nodes['m-fx-preview'].textContent);
  C.saveTransfer(false, '2026-10-08');
  const ex = state.txns[0];
  t('обмен сохранён с двумя суммами', ex && ex.amountFrom === 1650 && ex.amountTo === 100 && ex.fee === 10, JSON.stringify(ex));
  t('курса в отдельном поле нет — он в суммах', ex.rate === undefined, ex.rate);

  console.log('\n— форма: перевод в одной валюте —');
  state = { accounts: ACC(), txns: [] };
  nodes['m-acc'].value = 'card'; nodes['m-acc-to'].value = 'cash';
  nodes['m-amt'].value = '700'; nodes['m-amt-to'].value = '999'; nodes['m-fee'].value = '';
  C.formSync();
  t('поле «Получено» скрыто', nodes['m-amt-to-field'].hidden === true, nodes['m-amt-to-field'].hidden);
  C.saveTransfer(false, '2026-10-08');
  t('получено ровно столько, сколько ушло (старое значение поля игнорируется)',
    state.txns[0].amountTo === 700, state.txns[0].amountTo);

  // ── валюта счёта ───────────────────────────────────
  console.log('\n— валюта счёта —');
  state = { accounts: ACC([{ id: 'empty', name: 'Новый', kind: 'card', currency: 'RUP', ord: 9 }]),
            txns: [ exp('2026-10-01', 5, 'usd', { rate: 16, rateTo: 'RUP' }) ] };
  for (const id of ['acc-list']) mkEl(id);
  toasts = [];
  C.setAccCur('usd', 'EUR');
  t('у счёта с историей валюту не сменить', C.accCur('usd') === 'USD' && toasts.some(x => x[0] === 'warn'),
    `${C.accCur('usd')} ${JSON.stringify(toasts)}`);
  C.setAccCur('empty', 'MDL');
  t('у пустого счёта — можно', C.accCur('empty') === 'MDL', C.accCur('empty'));

  // ── управление валютами ────────────────────────────
  console.log('\n— управление валютами —');
  state = { accounts: ACC(), txns: [] };
  for (const id of ['cur-list','cur-base','cur-new-code','cur-new-name']) mkEl(id);
  nodes['cur-new-code'].value = 'gbp'; nodes['cur-new-name'].value = 'Фунт';
  C.curAdd();
  t('добавлена валюта, код приведён к верхнему регистру', !!C.cur('GBP') && C.cur('GBP').name === 'Фунт', JSON.stringify(C.cur('GBP')));
  nodes['cur-new-code'].value = 'GBP'; toasts = [];
  C.curAdd();
  t('дубликат не добавляется', C.curs().filter(c => c.id === 'GBP').length === 1 && toasts.some(x => x[0] === 'warn'),
    JSON.stringify(toasts));
  nodes['cur-new-code'].value = 'доллар'; toasts = [];
  C.curAdd();
  t('кириллица в коде — ошибка', toasts.some(x => x[0] === 'warn'), JSON.stringify(toasts));
  toasts = [];
  C.curDel('USD'); await wait();
  t('валюту, которой пользуется счёт, не удалить', !!C.cur('USD') && toasts.some(x => x[0] === 'warn'), JSON.stringify(toasts));
  C.curDel('RUP'); await wait();
  t('базовую — тоже', !!C.cur('RUP'), 'RUP удалена');
  C.curDel('GBP'); await wait();
  t('неиспользуемая удаляется', !C.cur('GBP'), 'GBP осталась');
  t('и оставляет надгробие', (state.curPurged || []).some(x => x.id === 'GBP'), JSON.stringify(state.curPurged));
  confirmAnswer = false;
  C.setBase('USD'); await wait();
  t('смена базовой требует подтверждения', C.base() === 'RUP', C.base());
  confirmAnswer = true;
  C.setBase('USD'); await wait();
  t('после подтверждения базовая — USD', C.base() === 'USD', C.base());
  t('у настройки есть метка правки', !!state.fxCfg._editedAt, JSON.stringify(state.fxCfg));

  // ── повторяющиеся операции ─────────────────────────
  console.log('\n— повторяющаяся операция на валютный счёт —');
  state = { accounts: ACC(), recurring: { enabled: true }, txns: [ xfer('2026-09-01', 'card', 'usd', 1650, 100, 0) ],
            templates: [ { id: 'tp', name: 'Подписка', type: 'expense', account: 'usd', amount: 9.99, repeat: { day: 3, enabled: true } } ] };
  ctx.opsTpls = () => state.templates;
  ctx.opsTplFind = id => state.templates.find(x => x.id === id) || null;
  vm.runInContext('opsTpls = globalThis.opsTpls; opsTplFind = globalThis.opsTplFind;', ctx);
  C.recAdd('tp', '2026-10');
  const r = state.txns[state.txns.length - 1];
  t('создана с курсом на дату платежа', r && near(r.rate, 16.5) && r.rateTo === 'RUP', JSON.stringify(r));

  // ── слияние с Drive ────────────────────────────────
  console.log('\n— слияние валют с Drive —');
  const pc = { txns: [], _lastModified: '2026-10-04T12:00:00.000Z', fxCfg: { base: 'USD', _editedAt: '2026-10-04T12:00:00.000Z' },
               currencies: [ { id: 'GBP', name: 'Фунт', ord: 5, _editedAt: '2026-10-04T12:00:00.000Z' } ] };
  const cloud = { txns: [], _lastModified: '2026-10-09T12:00:00.000Z', fxCfg: { base: 'RUP', _editedAt: '2026-09-01T00:00:00.000Z' },
                  currencies: [ { id: 'RUP', name: 'Рубль ПМР', ord: 0 } ] };
  const m = C.merge(pc, cloud);
  t('смена базовой доехала, хотя облако «новее» по _lastModified', m.fxCfg && m.fxCfg.base === 'USD', JSON.stringify(m.fxCfg));
  t('валюты с двух сторон объединены', m.currencies.map(c => c.id).join(',') === 'RUP,GBP', m.currencies.map(c => c.id).join(','));
  const legacy = { txns: [], _lastModified: '2026-01-01T00:00:00.000Z' };
  const ml = C.merge(legacy, legacy);
  t('старый файл без валют не ломает слияние', ml.currencies === undefined && ml.fxCfg === undefined, JSON.stringify(ml));

  // ── статические проверки ───────────────────────────
  console.log('\n— интеграция —');
  t('статистика везде через базовую валюту',
    ['daySum  = dayTxns.reduce((a,t) => a+opsStatAmt(t)', 'totalRun += opsStatAmt(t)', 'groups[cid].sum += Math.abs(opsStatAmt(t))',
     'limitExpenses[cid] = (limitExpenses[cid] || 0) + Math.abs(opsStatAmt(t))'].every(x => app.includes(x)), 'есть места на amount');
  t('лимит месяца — в базовой', budSrc.includes('income += _budAmt(t)') && budSrc.includes('Math.abs(_budAmt(t))'), 'нет');
  t('экспорт пишет валюту шестой колонкой', app.includes('opsTxnCurrency(t)]') && app.includes("{wch:8}"), 'нет колонки');
  t('быстрый ввод понимает код валюты', app.includes('opsCur(curM[1].toUpperCase())'), 'нет');
  t('модуль валют подключён до счетов', html.indexOf('js/currency.js') < html.indexOf('js/accounts.js'), 'порядок');
  t('в окне счетов есть кнопка валют', html.includes('onclick="opsCurOpenModal()"'), 'нет');

  console.log(`\nитого: ${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
