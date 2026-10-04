// Настройки бюджета не должны повторить историю с целями: правка на одном
// устройстве обязана доезжать до другого, несмотря на _lastModified.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');
const mStart = drive.indexOf('function _mergeById');
const src = drive.slice(mStart, drive.indexOf('function _mergeInv'));

const ctx = vm.createContext({ SYNC_TOMBSTONE_TTL_DAYS: 90, console:{log(){}},
  Map, Set, Math, String, Number, JSON, Date, Array, Object });
vm.runInContext(src + '\n;globalThis.__m = _mergeOps;', ctx);
const mergeOps = ctx.__m;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

const txn = { id:'t1', date:'2026-10-01', type:'expense', amount:-100, _editedAt:'2026-10-01T10:00:00.000Z' };
const st = (budget, lm) => ({ txns:[{ ...txn }], budget, _lastModified: lm });

// ── ключевой сценарий: правка лимита на ПК, у облака свежее _lastModified ──
console.log('— правка лимита на одном устройстве —');
const pc    = st({ strategy:'save', income:4000, save:2500, months:[], _editedAt:'2026-10-04T12:00:00.000Z' }, '2026-10-04T12:00:00.000Z');
// облако хранит старый бюджет, но его _lastModified новее — его двигает любой синк телефона
const cloud = st({ strategy:'fixed', limit:1600, months:[], _editedAt:'2026-10-01T09:00:00.000Z' }, '2026-10-05T08:00:00.000Z');

let m = mergeOps(pc, cloud);
t('стратегия доехала', m.budget.strategy === 'save', m.budget.strategy);
t('сумма накопления доехала', m.budget.save === 2500, m.budget.save);
t('прогноз дохода доехал', m.budget.income === 4000, m.budget.income);

console.log('\n— второе устройство подтягивает —');
const phone = st({ strategy:'fixed', limit:1600, months:[], _editedAt:'2026-10-01T09:00:00.000Z' }, '2026-10-05T08:00:00.000Z');
const m2 = mergeOps(phone, m);
t('на телефоне та же стратегия', m2.budget.strategy === 'save', m2.budget.strategy);
t('и та же сумма', m2.budget.save === 2500, m2.budget.save);

console.log('\n— сходимость —');
let a = phone, cl = m;
for (let i = 0; i < 3; i++) { const r = mergeOps(a, cl); a = r; cl = r; }
t('после нескольких синков стабильно', a.budget.save === 2500 && a.budget.strategy === 'save',
  `${a.budget.strategy}/${a.budget.save}`);

console.log('\n— переопределения месяцев с двух устройств —');
const devA = st({ strategy:'save', income:4000, save:2500, _editedAt:'2026-10-04T12:00:00.000Z',
  months:[{ id:'2026-12', save:1000, _editedAt:'2026-10-04T12:00:00.000Z' }] }, '2026-10-04T12:00:00.000Z');
const devB = st({ strategy:'save', income:4000, save:2500, _editedAt:'2026-10-03T12:00:00.000Z',
  months:[{ id:'2026-07', income:6000, _editedAt:'2026-10-03T12:00:00.000Z' }] }, '2026-10-06T12:00:00.000Z');
const m3 = mergeOps(devA, devB);
t('оба переопределения уцелели', m3.budget.months.length === 2, JSON.stringify(m3.budget.months.map(x=>x.id)));
t('декабрь на месте', m3.budget.months.some(x => x.id === '2026-12' && x.save === 1000), JSON.stringify(m3.budget.months));
t('июль на месте', m3.budget.months.some(x => x.id === '2026-07' && x.income === 6000), JSON.stringify(m3.budget.months));

console.log('\n— конфликт по одному месяцу —');
const c1 = st({ strategy:'save', _editedAt:'2026-10-04T12:00:00.000Z',
  months:[{ id:'2026-12', save:1000, _editedAt:'2026-10-04T12:00:00.000Z' }] }, '2026-10-04T12:00:00.000Z');
const c2 = st({ strategy:'save', _editedAt:'2026-10-02T12:00:00.000Z',
  months:[{ id:'2026-12', save:500,  _editedAt:'2026-10-02T12:00:00.000Z' }] }, '2026-10-09T12:00:00.000Z');
const m4 = mergeOps(c1, c2);
t('побеждает более поздняя правка месяца', m4.budget.months[0].save === 1000, JSON.stringify(m4.budget.months));

console.log('\n— совместимость со старым файлом —');
const legacy = { txns:[{ ...txn }], _lastModified:'2026-01-01T00:00:00.000Z' };   // бюджета нет вообще
const m5 = mergeOps(legacy, legacy);
t('merge не падает без бюджета', m5.budget === undefined, JSON.stringify(m5.budget));
t('операции не потерялись', m5.txns.length === 1, m5.txns.length);

const m6 = mergeOps(legacy, st({ strategy:'save', save:2500, months:[], _editedAt:'2026-10-04T12:00:00.000Z' }, '2026-10-04T12:00:00.000Z'));
t('бюджет приезжает на устройство, где его не было', m6.budget && m6.budget.save === 2500, JSON.stringify(m6.budget));

const m7 = mergeOps(st({ strategy:'net', netLimit:2500, months:[], _editedAt:'2026-10-04T12:00:00.000Z' }, '2026-10-04T12:00:00.000Z'), legacy);
t('локальный бюджет не стирается пустым облаком', m7.budget && m7.budget.netLimit === 2500, JSON.stringify(m7.budget));

console.log('\n— надгробия операций не сломались —');
const withTomb = { txns:[{ ...txn }], purged:[{ id:'gone', at:'2026-10-01T10:00:00.000Z' }], _lastModified:'2026-10-01T10:00:00.000Z' };
const resurrect = { txns:[{ ...txn }, { id:'gone', date:'2026-09-01', type:'expense', amount:-50, _editedAt:'2026-09-01T10:00:00.000Z' }], _lastModified:'2026-09-01T10:00:00.000Z' };
const m8 = mergeOps(withTomb, resurrect);
t('вычищенная запись не вернулась', !m8.txns.some(x => x.id === 'gone'), m8.txns.map(x=>x.id).join(','));

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
