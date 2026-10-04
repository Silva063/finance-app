// Цели: переименование + смена валюты на одном устройстве должны доехать до второго.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');

const mStart = drive.indexOf('function _mergeById');
const mEnd   = drive.indexOf('// \u2500\u2500 Debounce');
const src = drive.slice(mStart, mEnd > 0 ? mEnd : undefined);

const ctx = vm.createContext({
  SYNC_TOMBSTONE_TTL_DAYS: 90,
  console: { log: () => {} },
  Map, Set, Math, String, Number, JSON, Date, Array, Object
});
vm.runInContext(src + '\n;globalThis.__m = { inv: _mergeInv, ops: _mergeOps, byId: _mergeById };', ctx);
const mergeInv = ctx.__m.inv;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

const goal = (id, name, cur, at) => ({ id, name, amount:1000, currency:cur, color:'var(--acc)', blocks:[], _editedAt:at });
const st = (goals, lm, extra) => ({ dates:[], sections:[], goals, _lastModified:lm, ...(extra||{}) });
const find = (s, id) => (s.goals||[]).find(g => g.id === id);

// ── ровно сценарий из отчёта ──────────────────────
console.log('— переименовал цель и сменил валюту на ПК —');
// на обоих устройствах цель была одинаковой
const base = goal('g1', 'Отпуск', 'USD', '2026-09-01T10:00:00.000Z');
// ПК: правка, invSaveState двигает _lastModified
const pc    = st([goal('g1', 'Машина', 'EUR', '2026-09-20T12:00:00.000Z')], '2026-09-20T12:00:00.000Z');
// облако ещё хранит старую версию, но его _lastModified СВЕЖЕЕ (его двигает любой синк телефона)
const cloud = st([{ ...base }], '2026-09-21T08:00:00.000Z');

const m1 = mergeInv(pc, cloud);
t('новое название доехало', find(m1,'g1').name === 'Машина', find(m1,'g1').name);
t('новая валюта доехала',   find(m1,'g1').currency === 'EUR', find(m1,'g1').currency);

console.log('\n— телефон подтягивает облако —');
const phone = st([{ ...base }], '2026-09-21T08:00:00.000Z');
const m2 = mergeInv(phone, m1);
t('на телефоне тоже «Машина»', find(m2,'g1').name === 'Машина', find(m2,'g1').name);
t('и валюта EUR',              find(m2,'g1').currency === 'EUR', find(m2,'g1').currency);

console.log('\n— сходимость: повторный синк ничего не откатывает —');
const m3 = mergeInv(m2, m1);
const m4 = mergeInv(m1, m3);
t('название стабильно', find(m3,'g1').name === 'Машина' && find(m4,'g1').name === 'Машина',
  `${find(m3,'g1').name}/${find(m4,'g1').name}`);

// ── цели, добавленные независимо ──────────────────
console.log('\n— на каждом устройстве добавили свою цель —');
const a = st([goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z'), goal('gA','Ноутбук','USD','2026-09-22T10:00:00.000Z')], '2026-09-22T10:00:00.000Z');
const b = st([goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z'), goal('gB','Велосипед','EUR','2026-09-23T10:00:00.000Z')], '2026-09-23T10:00:00.000Z');
const m5 = mergeInv(a, b);
t('обе новые цели уцелели', m5.goals.length === 3, m5.goals.map(g=>g.id).join(','));

// ── удаление цели ─────────────────────────────────
console.log('\n— удалил цель на ПК —');
const before = st([goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z'), goal('g2','Ремонт','USD','2026-09-01T10:00:00.000Z')], '2026-09-01T10:00:00.000Z');
const afterDel = st([goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z')], '2026-09-24T10:00:00.000Z',
  { goalsPurged: [{ id:'g2', at:'2026-09-24T10:00:00.000Z' }] });
const m6 = mergeInv(afterDel, before);     // облако ещё знает про g2
t('удалённая цель не возвращается', !find(m6,'g2'), m6.goals.map(g=>g.id).join(','));
t('надгробие уезжает на Drive', (m6.goalsPurged||[]).some(x => x.id === 'g2'), JSON.stringify(m6.goalsPurged));
const m7 = mergeInv(before, m6);           // телефон подтягивает
t('на телефоне тоже удалена', !find(m7,'g2'), m7.goals.map(g=>g.id).join(','));

console.log('\n— надгробие сильнее правки на другом устройстве —');
const reEdited = st([goal('g2','Ремонт кухни','EUR','2026-12-01T10:00:00.000Z')], '2026-12-01T10:00:00.000Z');
const m8 = mergeInv(reEdited, m6);
t('цель остаётся удалённой', !find(m8,'g2'), m8.goals.map(g=>g.id).join(','));

// ── совместимость: старые цели без _editedAt ───────
console.log('\n— старые цели без метки правки —');
const legacyA = st([{ id:'g9', name:'Старая', amount:500, currency:'USD', color:'var(--acc)', blocks:[] }], '2026-01-01T00:00:00.000Z');
const legacyB = st([{ id:'g9', name:'Старая с телефона', amount:500, currency:'EUR', color:'var(--acc)', blocks:[] }], '2026-01-02T00:00:00.000Z');
const m9 = mergeInv(legacyA, legacyB);
t('merge не падает без _editedAt', !!find(m9,'g9'), JSON.stringify(m9.goals));
t('расхождение сходится к облачной версии', find(m9,'g9').name === 'Старая с телефона', find(m9,'g9').name);
// а первая же правка перебивает
const editedNow = st([{ id:'g9', name:'Переименовал', amount:500, currency:'USD', color:'var(--acc)', blocks:[], _editedAt:'2026-09-27T10:00:00.000Z' }], '2026-09-27T10:00:00.000Z');
const m10 = mergeInv(editedNow, m9);
t('свежая правка перебивает старьё', find(m10,'g9').name === 'Переименовал', find(m10,'g9').name);

// ── состояние вообще без целей ────────────────────
console.log('\n— состояние без поля goals —');
const noGoals = { dates:[], _lastModified:'2026-01-01T00:00:00.000Z' };
const m11 = mergeInv(noGoals, noGoals);
t('goals становится пустым массивом', Array.isArray(m11.goals) && m11.goals.length === 0, JSON.stringify(m11.goals));
t('dates не потерялись', Array.isArray(m11.dates), JSON.stringify(m11.dates));

// ── записи инвентаризации не пострадали ───────────
console.log('\n— записи дат по-прежнему сливаются —');
const d1 = { dates:[{ id:'2026-09-01', date:'2026-09-01', secs:{}, _editedAt:'2026-09-01T10:00:00.000Z' }], goals:[], _lastModified:'2026-09-01T10:00:00.000Z' };
const d2 = { dates:[{ id:'2026-09-02', date:'2026-09-02', secs:{}, _editedAt:'2026-09-02T10:00:00.000Z' }], goals:[], _lastModified:'2026-09-02T10:00:00.000Z' };
const m12 = mergeInv(d1, d2);
t('обе записи на месте', m12.dates.length === 2, m12.dates.map(x=>x.id).join(','));
t('порядок по дате убывающий', m12.dates[0].id === '2026-09-02', m12.dates[0].id);

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
