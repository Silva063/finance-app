// Проверяем не merge, а ПУТИ синхронизации: применяется ли результат и что уезжает на Drive.
// Именно здесь терялись цели: merged выбрасывался, если не менялось число записей дат.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

// ── 1. статический разбор: нет ли ещё где-то «применяем merged условно» ──
console.log('— разбор кода —');
const startBlocks = drive.split('mergedAnything');
t('стартовый синк больше не прячет присваивание в if',
  !/if \(after !== before[^)]*\) \{\s*(ops|inv)State = merged;/.test(drive),
  'найдено условное присваивание merged');
t('inv-ветка автопуша не требует remote.dates',
  !/const remote = await driveDownloadFile\('inv'\)[\s\S]{0,80}?if \(remote && remote\.dates\)/.test(drive),
  'guard remote.dates ещё на месте');
t('стартовая inv-ветка не требует remoteData.dates',
  !/if \(remoteData && remoteData\.dates\)/.test(drive),
  'guard remoteData.dates ещё на месте');
const goalRefreshes = (drive.match(/invRefreshGoalsUI\(\)/g) || []).length;
t('перерисовка целей вызывается во всех 4 точках слияния', goalRefreshes === 4, goalRefreshes);

// ── 2. поведенческий тест стартового синка ──
console.log('\n— стартовый синк: правка цели на другом устройстве —');
const mStart = drive.indexOf('function _mergeById');
const mergeSrc = drive.slice(mStart, drive.indexOf('// \u2500\u2500 Debounce'));

const ctx = vm.createContext({ SYNC_TOMBSTONE_TTL_DAYS: 90, console: { log: () => {} },
  Map, Set, Math, String, Number, JSON, Date, Array, Object });
vm.runInContext(mergeSrc + '\n;globalThis.__inv = _mergeInv;', ctx);
const mergeInv = ctx.__inv;

// Воспроизводим стартовую ветку в том виде, в каком она теперь в коде
function startupSyncInv(localState, remoteData) {
  let invState = localState;
  const uploaded = [];
  if (remoteData) {
    const before = (invState.dates || []).filter(r => !r._deleted).length;
    const merged = mergeInv(invState, remoteData);
    const after  = merged.dates.filter(r => !r._deleted).length;
    const invChanged = after !== before || merged.dates.length !== (invState.dates || []).length;
    invState = merged;                     // ← ключевая правка: применяем всегда
    uploaded.push(invState);
    return { invState, invChanged, uploadedGoals: invState.goals };
  }
  return { invState, invChanged: false, uploadedGoals: invState.goals };
}

const goal = (id, name, cur, at) => ({ id, name, amount:1000, currency:cur, color:'var(--acc)', blocks:[], _editedAt:at });
// у обоих устройств одинаковый набор записей дат — число не меняется, старое условие было ложным
const dates = [{ id:'2026-09-01', date:'2026-09-01', secs:{}, _editedAt:'2026-09-01T10:00:00.000Z' }];

const phoneLocal = { dates:[...dates], goals:[goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z')], _lastModified:'2026-09-21T08:00:00.000Z' };
const cloudFromPc = { dates:[...dates], goals:[goal('g1','Машина','EUR','2026-09-20T12:00:00.000Z')], _lastModified:'2026-09-20T12:00:00.000Z' };

const r = startupSyncInv(phoneLocal, cloudFromPc);
t('число записей дат не изменилось (старое условие было бы ложным)', r.invChanged === false, r.invChanged);
t('правка цели всё равно применена', r.invState.goals[0].name === 'Машина', r.invState.goals[0].name);
t('валюта тоже', r.invState.goals[0].currency === 'EUR', r.invState.goals[0].currency);
t('на Drive уезжает уже смерженное состояние', r.uploadedGoals[0].name === 'Машина', r.uploadedGoals[0].name);

console.log('\n— то же в обратную сторону —');
const pcLocal = { dates:[...dates], goals:[goal('g1','Машина','EUR','2026-09-20T12:00:00.000Z')], _lastModified:'2026-09-20T12:00:00.000Z' };
const cloudOld = { dates:[...dates], goals:[goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z')], _lastModified:'2026-09-21T08:00:00.000Z' };
const r2 = startupSyncInv(pcLocal, cloudOld);
t('свежая локальная правка не затирается облаком', r2.invState.goals[0].name === 'Машина', r2.invState.goals[0].name);

console.log('\n— сходимость после двух перезагрузок —');
let a = { dates:[...dates], goals:[goal('g1','Отпуск','USD','2026-09-01T10:00:00.000Z')], _lastModified:'2026-09-21T08:00:00.000Z' };
let cloud = { dates:[...dates], goals:[goal('g1','Машина','EUR','2026-09-20T12:00:00.000Z')], _lastModified:'2026-09-20T12:00:00.000Z' };
for (let i = 0; i < 3; i++) { const s = startupSyncInv(a, cloud); a = s.invState; cloud = s.invState; }
t('устройства сошлись на одной версии', a.goals[0].name === 'Машина' && a.goals[0].currency === 'EUR',
  `${a.goals[0].name}/${a.goals[0].currency}`);

console.log('\n— на Drive файл без поля dates —');
const noDates = { goals:[goal('g1','Из облака','EUR','2026-09-25T10:00:00.000Z')], _lastModified:'2026-09-25T10:00:00.000Z' };
const r3 = startupSyncInv({ dates:[], goals:[goal('g1','Локальная','USD','2026-09-01T10:00:00.000Z')], _lastModified:'2026-09-01T10:00:00.000Z' }, noDates);
t('цель всё равно подтягивается', r3.invState.goals[0].name === 'Из облака', r3.invState.goals[0].name);

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
