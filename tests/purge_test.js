// Воспроизводим баг: очистил корзину → merge с Drive вернул записи обратно.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app   = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');

const trash = app.slice(app.indexOf('function opsTxnById'));
const mStart = drive.indexOf('function _mergeById');
const mergeSrc = drive.slice(mStart, drive.indexOf('function _mergeInv'));

const nodes = {};
const mk = () => ({ textContent:'', innerHTML:'', style:{}, hidden:false });
for (const id of ['p7body','p7count','p7-tools','p7-empty','p7-wrap','nav-trash-count']) nodes[id] = mk();

let confirmAnswer = true;
const ctx = vm.createContext({
  opsState: { txns: [] },
  opsSave: () => {}, opsReRenderCurrent: () => {},
  opsCat: id => ({ id, name:'Кат', color:'#fff' }), opsCatDisplay: c => c.name,
  fmtAmt: (n, s) => (s ? (n>=0?'+':'−') : '') + Math.abs(n).toFixed(2),
  fmtDate: d => d, escHtml: s => String(s == null ? '' : s),
  MONTHS_RU_GEN: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
  showOk: () => {}, showErr: () => {}, showUndoToast: () => () => {},
  appConfirm: () => Promise.resolve(confirmAnswer),
  document: { getElementById: id => nodes[id] || null },
  console: { log: () => {} },
  Map, Set, Math, String, Number, JSON, Date, Array, Object, isNaN
});
vm.runInContext(mergeSrc + '\n' + trash + `
;globalThis.__api = {
  get state(){ return opsState; }, set state(v){ opsState = v; },
  del: opsSoftDelete, purgeAll: opsPurgeAll, purge: opsPurgeTxn,
  list: opsDeletedTxns, merge: _mergeOps, tombs: opsPurgedList, ttl: SYNC_TOMBSTONE_TTL_DAYS
};`, ctx);
const api = ctx.__api;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };
const mkTxn = (id, c) => ({ id, date:'2026-09-01', type:'expense', way:'Наличный', amount:-100, comment:c, cat:'', _editedAt:'2026-09-01T10:00:00.000Z' });
const wait = () => new Promise(r => setTimeout(r, 5));

(async () => {
  // ── ровно тот сценарий из отчёта ────────────────
  console.log('— очистка корзины при включённой синхронизации —');
  api.state = { txns: [mkTxn('a','кофе'), mkTxn('b','такси'), mkTxn('c','аптека')], _lastModified:'2026-09-01T10:00:00.000Z' };
  api.del('a', true); api.del('b', true);

  // облако — снимок состояния ДО очистки (так оно и лежит на Drive)
  const cloud = JSON.parse(JSON.stringify(api.state));

  api.purgeAll(); await wait();
  t('после очистки осталась одна живая запись', api.state.txns.length === 1, api.state.txns.length);
  t('надгробий два', api.tombs(api.state).length === 2, JSON.stringify(api.tombs(api.state)));

  // именно это делает driveDebouncedPush перед загрузкой файла
  const merged = api.merge(api.state, cloud);
  t('merge НЕ вернул удалённые записи', merged.txns.length === 1, merged.txns.map(x=>x.id).join(','));
  t('уцелела именно живая', merged.txns[0].id === 'c', merged.txns[0].id);
  t('надгробия уезжают на Drive', (merged.purged||[]).length === 2, JSON.stringify(merged.purged));

  // ── второе устройство ───────────────────────────
  console.log('\n— телефон, который ещё не знал об очистке —');
  const phone = { txns: [mkTxn('a','кофе'), mkTxn('b','такси'), mkTxn('c','аптека')], _lastModified:'2026-09-01T09:00:00.000Z' };
  const m2 = api.merge(phone, merged);   // телефон подтягивает облако с надгробиями
  t('телефон тоже теряет удалённые', m2.txns.length === 1, m2.txns.map(x=>x.id).join(','));
  t('и запоминает надгробия', (m2.purged||[]).length === 2, JSON.stringify(m2.purged));

  // ── надгробие сильнее правки на другом устройстве ─
  console.log('\n— на телефоне ту же запись успели отредактировать —');
  const edited = { txns: [{ ...mkTxn('a','кофе большой'), _editedAt:'2026-12-01T10:00:00.000Z' }], _lastModified:'2026-12-01T10:00:00.000Z' };
  const m3 = api.merge(edited, merged);
  t('надгробие важнее свежей правки', !m3.txns.some(x => String(x.id) === 'a'), m3.txns.map(x=>x.id).join(','));

  // ── одиночное «удалить навсегда» ────────────────
  console.log('\n— удалить навсегда одну запись —');
  api.state = { txns: [mkTxn('x','обед'), mkTxn('y','бензин')] };
  api.del('x', true);
  const cloud2 = JSON.parse(JSON.stringify(api.state));
  api.purge('x'); await wait();
  const m4 = api.merge(api.state, cloud2);
  t('не возвращается после merge', !m4.txns.some(z => String(z.id) === 'x'), m4.txns.map(z=>z.id).join(','));

  // ── срок жизни надгробий ────────────────────────
  console.log('\n— просроченные надгробия —');
  const old = new Date(Date.now() - (api.ttl + 10) * 86400000).toISOString();
  const withOld  = { txns: [], purged: [{ id:'old', at: old }, { id:'fresh', at: new Date().toISOString() }] };
  const resurrect = { txns: [mkTxn('old','древнее'), mkTxn('fresh','свежее')] };
  const m5 = api.merge(withOld, resurrect);
  t('просроченное надгробие больше не держит', m5.txns.some(z => String(z.id) === 'old'), m5.txns.map(z=>z.id).join(','));
  t('свежее — держит', !m5.txns.some(z => String(z.id) === 'fresh'), m5.txns.map(z=>z.id).join(','));
  t('просроченное вычищено из списка', !(m5.purged||[]).some(x => x.id === 'old'), JSON.stringify(m5.purged));

  // ── старый файл без поля purged ─────────────────
  console.log('\n— совместимость со старым файлом на Drive —');
  const legacy = { txns: [mkTxn('p','старое')], _lastModified:'2026-01-01T00:00:00.000Z' };
  const m6 = api.merge(legacy, { txns: [mkTxn('q','тоже старое')] });
  t('merge не падает без поля purged', m6.txns.length === 2, m6.txns.length);
  t('purged появляется пустым', Array.isArray(m6.purged) && m6.purged.length === 0, JSON.stringify(m6.purged));

  // ── отказ в подтверждении ───────────────────────
  console.log('\n— пользователь отменил подтверждение —');
  confirmAnswer = false;
  api.state = { txns: [mkTxn('k','чай')] };
  api.del('k', true);
  api.purgeAll(); await wait();
  t('ничего не удалено и надгробий нет', api.state.txns.length === 1 && api.tombs(api.state).length === 0,
    `txns=${api.state.txns.length} tombs=${api.tombs(api.state).length}`);

  console.log(`\nитого: ${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
