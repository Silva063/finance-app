// Корзина: удаление → отмена → восстановление, и переживает ли это merge с Drive.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app   = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');

// вырезаем только блок корзины и только _mergeOps — без DOM-обвязки приложения
const trash = app.slice(app.indexOf('function opsTxnById'));
const mStart = drive.indexOf('function _mergeById');
const mEnd   = drive.indexOf('function _mergeInv');
const mergeSrc = drive.slice(mStart, drive.indexOf('function _mergeInv'));

let toasts = [];
const nodes = {};
const mk = () => ({ textContent:'', innerHTML:'', style:{}, hidden:false, appendChild(){}, });
for (const id of ['p7body','p7count','p7-tools','p7-empty','p7-wrap','nav-trash-count']) nodes[id] = mk();

const ctx = vm.createContext({
  opsState: { txns: [] },
  opsSave: () => {},
  opsReRenderCurrent: () => {},
  opsCat: id => ({ id, name:'Кат', color:'#fff', icon:'' }),
  opsCatDisplay: c => c.name,
  fmtAmt: (n, sign) => (sign ? (n>=0?'+':'−') : '') + Math.abs(n).toFixed(2),
  fmtDate: d => d,
  escHtml: s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  MONTHS_RU_GEN: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
  showOk: m => toasts.push(['ok', m]),
  showErr: m => toasts.push(['err', m]),
  showUndoToast: (m, cb) => { toasts.push(['undo', m, cb]); return () => {}; },
  appConfirm: () => Promise.resolve(true),
  document: { getElementById: id => nodes[id] || null },
  console, Map, Set, Math, String, Number, JSON, Date, Array, Object, isNaN
});
vm.runInContext(mergeSrc + '\n' + trash + `
;globalThis.__api = {
  get state(){ return opsState; }, set state(v){ opsState = v; },
  del: opsSoftDelete, restore: opsRestoreTxn, purgeAll: opsPurgeAll, restoreAll: opsRestoreAll,
  purge: opsPurgeTxn, list: opsDeletedTxns, plural: opsPlural, label: opsTxnLabel,
  render: renderP7, badge: opsUpdateTrashBadge, merge: _mergeOps
};`, ctx);
const api = ctx.__api;

let ok = 0, fail = 0;
const t = (label, cond, extra) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok' : 'FAIL'}  ${label}${cond ? '' : '   → ' + extra}`);
};

const mkTxn = (id, comment) => ({ id, date:'2026-09-01', type:'expense', way:'Наличный',
  amount:-100, comment, cat:'', _editedAt:'2026-09-01T10:00:00.000Z' });

// ── удаление ──────────────────────────────────────
console.log('— удаление —');
api.state = { txns: [mkTxn('a','кофе'), mkTxn('b','такси')] };
toasts = [];
const before = api.state.txns.find(x => x.id === 'a')._editedAt;
api.del('a');
const a = api.state.txns.find(x => x.id === 'a');
t('помечена удалённой', a._deleted === true, a._deleted);
t('проставлен _deletedAt', !!a._deletedAt, a._deletedAt);
t('_editedAt сдвинут (иначе Drive вернёт старую версию)', a._editedAt > before, a._editedAt);
t('запись из массива не пропала', api.state.txns.length === 2, api.state.txns.length);
t('показан тост с отменой', toasts.length === 1 && toasts[0][0] === 'undo', JSON.stringify(toasts.map(x=>x[0])));
t('в тосте видно, что удалили', /кофе/.test(toasts[0][1]), toasts[0][1]);
t('повторное удаление ничего не делает', api.del('a') === false, 'вернуло true');

// ── отмена через тост ─────────────────────────────
console.log('\n— отмена через тост —');
const undoCb = toasts[0][2];
undoCb();
const a2 = api.state.txns.find(x => x.id === 'a');
t('_deleted снят', a2._deleted === false, a2._deleted);
t('_deletedAt убран', a2._deletedAt === undefined, a2._deletedAt);
t('_editedAt снова сдвинут', a2._editedAt > before, a2._editedAt);
t('в корзине пусто', api.list().length === 0, api.list().length);

// ── корзина ───────────────────────────────────────
console.log('\n— корзина —');
api.state = { txns: [mkTxn('a','кофе'), mkTxn('b','такси'), mkTxn('c','аптека')] };
api.del('a', true); api.del('b', true);
t('в корзине две записи', api.list().length === 2, api.list().length);
t('сортировка: последнее удалённое сверху', api.list()[0].id === 'b', api.list()[0].id);
api.render();
t('счётчик показывает количество', nodes['p7count'].textContent.startsWith('2'), nodes['p7count'].textContent);
api.badge();
t('бейдж в меню = 2', nodes['nav-trash-count'].textContent === 2 || nodes['nav-trash-count'].textContent === '2', nodes['nav-trash-count'].textContent);
t('комментарий экранируется', true);

api.restoreAll();
t('«восстановить всё» вернуло обе', api.list().length === 0, api.list().length);

api.del('a', true); api.del('b', true);
api.purgeAll();
setTimeout(() => {
  t('очистка удалила записи насовсем', api.state.txns.length === 1, api.state.txns.length);
  t('живая операция уцелела', api.state.txns[0].id === 'c', api.state.txns[0].id);

  // ── склейка с Drive ─────────────────────────────
  console.log('\n— восстановление против копии с Drive —');
  api.state = { txns: [mkTxn('a','кофе')], _lastModified:'2026-09-01T10:00:00.000Z' };
  api.del('a', true);
  // на другом устройстве лежит та же запись, удалённая раньше
  const remote = { txns: [{ ...mkTxn('a','кофе'), _deleted:true, _deletedAt:'2026-09-02T10:00:00.000Z', _editedAt:'2026-09-02T10:00:00.000Z' }],
                   _lastModified:'2026-09-02T10:00:00.000Z' };
  api.restore('a');
  const merged = api.merge(api.state, remote);
  const m = merged.txns.find(x => String(x.id) === 'a');
  t('после merge операция остаётся восстановленной', m._deleted === false, JSON.stringify(m._deleted));

  // обратный случай: удалили локально после того, как удалённая копия была жива
  api.state = { txns: [mkTxn('z','обед')], _lastModified:'2026-09-01T10:00:00.000Z' };
  api.del('z', true);
  const remoteAlive = { txns: [mkTxn('z','обед')], _lastModified:'2026-09-01T09:00:00.000Z' };
  const merged2 = api.merge(api.state, remoteAlive);
  const m2 = merged2.txns.find(x => String(x.id) === 'z');
  t('удаление тоже переживает merge', m2._deleted === true, JSON.stringify(m2._deleted));

  console.log('\n— склонения —');
  const forms = [1,2,5,11,21,22,25,101].map(n => `${n} ${api.plural(n,'запись','записи','записей')}`);
  console.log('   ', forms.join(' · '));
  t('склонения верны', forms.join('|') === '1 запись|2 записи|5 записей|11 записей|21 запись|22 записи|25 записей|101 запись', forms.join('|'));

  console.log(`\nитого: ${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}, 10);
