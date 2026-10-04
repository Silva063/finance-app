// Категории: правка доезжает между устройствами, порядок сохраняется,
// удаление не отменяется, а старые файлы без метки не ломают слияние.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');
const src = drive.slice(drive.indexOf('function _mergeById'), drive.indexOf('function _mergeInv'));

const ctx = vm.createContext({ SYNC_TOMBSTONE_TTL_DAYS: 90, console:{log(){}},
  Map, Set, Math, String, Number, JSON, Date, Array, Object });
vm.runInContext(src + '\n;globalThis.__m = _mergeOps;', ctx);
const mergeOps = ctx.__m;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

const cat = (id, name, ord, at, over) => ({ id, name, color:'#fff', icon:'', ord, _editedAt:at, ...(over||{}) });
const st = (categories, lm, over) => ({ txns:[], categories, _lastModified:lm, ...(over||{}) });
const find = (s, id) => (s.categories||[]).find(c => c.id === id);

// ── переименование при более свежем _lastModified у облака ──
console.log('— переименование категории на одном устройстве —');
const pc = st([ cat('grocery','Продукты и химия',1,'2026-10-04T12:00:00.000Z'),
                cat('cafe','Кафе',2,'2026-09-01T10:00:00.000Z') ], '2026-10-04T12:00:00.000Z');
const cloud = st([ cat('grocery','Супермаркеты',1,'2026-09-01T10:00:00.000Z'),
                   cat('cafe','Кафе',2,'2026-09-01T10:00:00.000Z') ], '2026-10-05T08:00:00.000Z');
let m = mergeOps(pc, cloud);
t('новое название доехало', find(m,'grocery').name === 'Продукты и химия', find(m,'grocery').name);
t('остальные не пострадали', find(m,'cafe').name === 'Кафе', find(m,'cafe').name);

const phone = st([ cat('grocery','Супермаркеты',1,'2026-09-01T10:00:00.000Z') ], '2026-10-05T08:00:00.000Z');
const m2 = mergeOps(phone, m);
t('на втором устройстве тоже', find(m2,'grocery').name === 'Продукты и химия', find(m2,'grocery').name);

console.log('\n— правка лимита —');
const withLimit = st([ cat('grocery','Супермаркеты',1,'2026-10-06T12:00:00.000Z',{limit:3000}) ], '2026-10-06T12:00:00.000Z');
const noLimit   = st([ cat('grocery','Супермаркеты',1,'2026-10-01T12:00:00.000Z') ], '2026-10-07T12:00:00.000Z');
const m3 = mergeOps(withLimit, noLimit);
t('лимит доехал', find(m3,'grocery').limit === 3000, find(m3,'grocery').limit);

console.log('\n— порядок категорий —');
const reordered = st([ cat('cafe','Кафе',0,'2026-10-08T12:00:00.000Z'),
                       cat('grocery','Супермаркеты',1,'2026-10-08T12:00:00.000Z'),
                       cat('home','Для дома',2,'2026-10-08T12:00:00.000Z') ], '2026-10-08T12:00:00.000Z');
const oldOrder = st([ cat('grocery','Супермаркеты',0,'2026-09-01T10:00:00.000Z'),
                      cat('cafe','Кафе',1,'2026-09-01T10:00:00.000Z'),
                      cat('home','Для дома',2,'2026-09-01T10:00:00.000Z') ], '2026-10-09T12:00:00.000Z');
const m4 = mergeOps(reordered, oldOrder);
t('порядок после перетаскивания сохранён',
  m4.categories.map(c => c.id).join(',') === 'cafe,grocery,home', m4.categories.map(c=>c.id).join(','));

console.log('\n— категории без поля ord —');
const noOrd = st([ { id:'a', name:'А', color:'#fff', icon:'' }, { id:'b', name:'Б', color:'#fff', icon:'' } ], '2026-01-01T00:00:00.000Z');
const m5 = mergeOps(noOrd, noOrd);
t('merge не падает без ord', m5.categories.length === 2, JSON.stringify(m5.categories.map(c=>c.id)));

console.log('\n— добавили по категории на каждом устройстве —');
const devA = st([ cat('x','Икс',0,'2026-10-10T12:00:00.000Z') ], '2026-10-10T12:00:00.000Z');
const devB = st([ cat('y','Игрек',1,'2026-10-11T12:00:00.000Z') ], '2026-10-11T12:00:00.000Z');
const m6 = mergeOps(devA, devB);
t('обе уцелели', m6.categories.length === 2, m6.categories.map(c=>c.id).join(','));
t('и встали по ord', m6.categories[0].id === 'x', m6.categories.map(c=>c.id).join(','));

console.log('\n— удаление категории —');
const afterDel = st([ cat('cafe','Кафе',1,'2026-10-12T12:00:00.000Z') ], '2026-10-12T12:00:00.000Z',
  { catPurged:[{ id:'grocery', at:'2026-10-12T12:00:00.000Z' }] });
const stillHas = st([ cat('grocery','Супермаркеты',0,'2026-09-01T10:00:00.000Z'),
                      cat('cafe','Кафе',1,'2026-09-01T10:00:00.000Z') ], '2026-10-01T12:00:00.000Z');
const m7 = mergeOps(afterDel, stillHas);
t('удалённая не возвращается', !find(m7,'grocery'), m7.categories.map(c=>c.id).join(','));
t('надгробие уезжает на Drive', (m7.catPurged||[]).some(x => x.id === 'grocery'), JSON.stringify(m7.catPurged));
const m8 = mergeOps(stillHas, m7);
t('на втором устройстве тоже удалена', !find(m8,'grocery'), m8.categories.map(c=>c.id).join(','));

console.log('\n— надгробие сильнее правки на другом устройстве —');
const renamedLater = st([ cat('grocery','Переименовал',0,'2026-12-01T12:00:00.000Z') ], '2026-12-01T12:00:00.000Z');
const m9 = mergeOps(renamedLater, m7);
t('категория остаётся удалённой', !find(m9,'grocery'), m9.categories.map(c=>c.id).join(','));

console.log('\n— старый файл без категорий —');
const legacy = { txns:[], _lastModified:'2026-01-01T00:00:00.000Z' };
const m10 = mergeOps(legacy, legacy);
t('merge не падает', Array.isArray(m10.txns), JSON.stringify(m10.txns));
t('categories не навязывается пустым', m10.categories === undefined, JSON.stringify(m10.categories));
const m11 = mergeOps(legacy, st([ cat('a','А',0,'2026-10-01T12:00:00.000Z') ], '2026-10-01T12:00:00.000Z'));
t('категории приезжают туда, где их не было', (m11.categories||[]).length === 1, JSON.stringify(m11.categories));

console.log('\n— всё остальное из _mergeOps не сломалось —');
const txn = { id:'t1', date:'2026-10-01', type:'expense', amount:-100, _editedAt:'2026-10-01T10:00:00.000Z' };
const full = { txns:[txn], categories:[cat('a','А',0,'2026-10-01T12:00:00.000Z')],
  templates:[{ id:'tp1', name:'Ш', _editedAt:'2026-10-01T12:00:00.000Z' }],
  budget:{ strategy:'save', save:2500, months:[], _editedAt:'2026-10-01T12:00:00.000Z' },
  recurring:{ enabled:false, _editedAt:'2026-10-01T12:00:00.000Z' },
  purged:[], _lastModified:'2026-10-01T12:00:00.000Z' };
const m12 = mergeOps(full, { txns:[], _lastModified:'2026-09-01T12:00:00.000Z' });
t('операции на месте', m12.txns.length === 1, m12.txns.length);
t('шаблоны на месте', m12.templates.length === 1, m12.templates.length);
t('бюджет на месте', m12.budget && m12.budget.save === 2500, JSON.stringify(m12.budget));
t('переключатель напоминаний на месте', m12.recurring && m12.recurring.enabled === false, JSON.stringify(m12.recurring));

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
