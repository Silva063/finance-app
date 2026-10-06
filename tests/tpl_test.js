// Шаблоны: правка существующего, перезапись по имени, удаление с надгробием, слияние.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app   = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const drive = fs.readFileSync(ROOT + 'js/drive.js', 'utf8');

const _tplEnd = app.indexOf('   БЫСТРЫЙ ВВОД');
const tplSrc = app.slice(app.indexOf('function opsTpls()'), app.lastIndexOf('/*', _tplEnd));
const mergeSrc = drive.slice(drive.indexOf('function _mergeById'), drive.indexOf('function _mergeInv'));

const CATS = [{ id:'grocery', name:'Супермаркеты', color:'#f59e0b', icon:'🛒' },
               { id:'cafe',    name:'Кафе',         color:'#f97316', icon:'🍕' }];

let state = { txns: [], templates: [] };
const fields = {};
const mkEl = id => ({ id, value:'', textContent:'', innerHTML:'', style:{},
  focus(){}, classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
    contains(c){return this._s.has(c)} }, children:[], querySelector(){ return null; },
  closest(){ return null; } });
for (const id of ['tpl-list','tpl-modal','ops-modal','ops-modal-title','m-date','m-type','m-way',
                  'm-amt','m-comment','m-cat','m-del-btn','m-items-list']) fields[id] = mkEl(id);

let confirmAnswer = true, promptAnswer = null, toasts = [];
const ctx = vm.createContext({
  SYNC_TOMBSTONE_TTL_DAYS: 90,
  get opsState(){ return state; }, set opsState(v){ state = v; },
  opsSave: () => {},
  opsCats: () => CATS,
  opsCat: id => CATS.find(c => c.id === id) || { id, name:id, color:'#888', icon:'' },
  opsCatDisplay: c => c.name,
  opsFillCatSel: () => {},
  opsLoadItems: () => {},
  opsGetCurrentMode: () => 'none',
  opsGetItems: () => [],
  opsAcReset: () => {},
  opsAddItem: () => {},
  fmtAmt: n => Math.abs(+n).toFixed(2),
  escHtml: s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  showOk: m => toasts.push(['ok',m]), showWarn: m => toasts.push(['warn',m]),
  showErr: m => toasts.push(['err',m]), showInlineErr: (a,m) => toasts.push(['inline',m]),
  appConfirm: () => Promise.resolve(confirmAnswer),
  appPrompt: () => Promise.resolve(promptAnswer),
  document: { getElementById: id => fields[id] || null },
  console:{log(){}}, Math, JSON, Date, Array, Object, String, Number, Set, Map, isNaN, parseFloat
});
vm.runInContext(mergeSrc + '\n' + tplSrc + `
;globalThis.__t = {
  all: opsTpls, purged: opsTplsPurged, find: opsTplFind,
  render: opsTplRender, rowHTML: opsTplRowHTML, formHTML: opsTplEditFormHTML,
  edit: opsTplEdit, cancel: opsTplCancelEdit, saveEdit: opsTplSaveEdit,
  clearItems: opsTplClearItems, del: opsTplDelete, apply: opsTplApply,
  saveFromModal: opsTplSaveFromModal, merge: _mergeOps,
  get editId(){ return opsTplEditId; }
};`, ctx);
const T = ctx.__t;

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };
const wait = () => new Promise(r => setTimeout(r, 5));

const mkTpl = (id, name, over) => ({ id, name, type:'expense', way:'Безналичный',
  amount:250, cat:'grocery', comment:'Шериф', items:[], itemsMode:'none', ...(over||{}) });

(async () => {
  // ── правка существующего шаблона ────────────────
  console.log('— правка существующего шаблона —');
  state = { txns:[], templates:[ mkTpl('tpl_1','Продукты') ] };
  T.edit('tpl_1');
  t('форма правки открылась', T.editId === 'tpl_1', T.editId);
  t('в списке отрисована форма, а не строка', fields['tpl-list'].innerHTML.includes('tpl-edit'), 'нет формы');

  fields['tpl-e-name']    = mkEl('tpl-e-name');    fields['tpl-e-name'].value = 'Продукты неделя';
  fields['tpl-e-type']    = mkEl('tpl-e-type');    fields['tpl-e-type'].value = 'expense';
  fields['tpl-e-way']     = mkEl('tpl-e-way');     fields['tpl-e-way'].value = 'Наличный';
  fields['tpl-e-amt']     = mkEl('tpl-e-amt');     fields['tpl-e-amt'].value = '1 480,50'.replace(' ','');
  fields['tpl-e-cat']     = mkEl('tpl-e-cat');     fields['tpl-e-cat'].value = 'cafe';
  fields['tpl-e-comment'] = mkEl('tpl-e-comment'); fields['tpl-e-comment'].value = 'Зелёный двор';
  toasts = [];
  T.saveEdit('tpl_1');

  let tpl = T.find('tpl_1');
  t('новых шаблонов не появилось', T.all().length === 1, T.all().length);
  t('id сохранён', tpl.id === 'tpl_1', tpl.id);
  t('название изменено', tpl.name === 'Продукты неделя', tpl.name);
  t('способ изменён', tpl.way === 'Наличный', tpl.way);
  t('сумма разобрана с запятой', tpl.amount === 1480.5, tpl.amount);
  t('категория изменена', tpl.cat === 'cafe', tpl.cat);
  t('комментарий изменён', tpl.comment === 'Зелёный двор', tpl.comment);
  t('метка правки проставлена', !!tpl._editedAt, tpl._editedAt);
  t('форма закрылась', T.editId === null, T.editId);
  t('показан тост об обновлении', toasts.some(x => x[0] === 'ok'), JSON.stringify(toasts));

  console.log('\n— валидация —');
  T.edit('tpl_1');
  fields['tpl-e-name'].value = '   ';
  toasts = [];
  T.saveEdit('tpl_1');
  t('пустое название не сохраняется', T.find('tpl_1').name === 'Продукты неделя', T.find('tpl_1').name);
  t('показана ошибка у поля', toasts.some(x => x[0] === 'inline'), JSON.stringify(toasts));
  t('форма осталась открытой', T.editId === 'tpl_1', T.editId);

  fields['tpl-e-name'].value = 'Продукты';
  fields['tpl-e-amt'].value  = '';
  T.saveEdit('tpl_1');
  t('пустая сумма → 0 (сумма не задана)', T.find('tpl_1').amount === 0, T.find('tpl_1').amount);

  T.edit('tpl_1');
  fields['tpl-e-name'].value = 'Продукты';
  fields['tpl-e-amt'].value  = 'abc';
  T.saveEdit('tpl_1');
  t('мусор в сумме не ломает', T.find('tpl_1').amount === 0, T.find('tpl_1').amount);

  console.log('\n— отмена правки —');
  state = { txns:[], templates:[ mkTpl('tpl_1','Исходное') ] };
  T.edit('tpl_1');
  T.cancel();
  t('форма закрыта', T.editId === null, T.editId);
  t('данные не изменились', T.find('tpl_1').name === 'Исходное', T.find('tpl_1').name);

  console.log('\n— позиции внутри шаблона —');
  state = { txns:[], templates:[ mkTpl('tpl_1','С позициями',
    { items:[{name:'Хлеб',qty:1,price:10}], itemsMode:'detail' }) ] };
  t('в строке видно число позиций', T.rowHTML(T.find('tpl_1')).includes('позиций: 1'), 'нет счётчика');
  t('форма упоминает позиции', T.formHTML(T.find('tpl_1')).includes('<b>1</b>'), 'нет упоминания');
  T.clearItems('tpl_1');
  t('позиции убраны', T.find('tpl_1').items.length === 0, JSON.stringify(T.find('tpl_1').items));
  t('режим позиций сброшен', T.find('tpl_1').itemsMode === undefined, T.find('tpl_1').itemsMode);

  console.log('\n— сохранение из формы операции: имя занято —');
  state = { txns:[], templates:[ mkTpl('tpl_1','Продукты') ] };
  fields['m-type'].value = 'expense'; fields['m-way'].value = 'Наличный';
  fields['m-amt'].value = '999'; fields['m-comment'].value = 'новый коммент';
  fields['m-cat'].value = 'cafe';
  promptAnswer = 'Продукты'; confirmAnswer = true; toasts = [];
  T.saveFromModal(); await wait();
  t('дубликат не создан', T.all().length === 1, T.all().length);
  t('существующий перезаписан', T.find('tpl_1').amount === 999, T.find('tpl_1').amount);
  t('комментарий перезаписан', T.find('tpl_1').comment === 'новый коммент', T.find('tpl_1').comment);
  t('id остался тем же', T.all()[0].id === 'tpl_1', T.all()[0].id);

  console.log('\n— имя занято, но замену отклонили —');
  state = { txns:[], templates:[ mkTpl('tpl_1','Продукты') ] };
  promptAnswer = 'продукты';   // регистр не должен иметь значения
  confirmAnswer = false; toasts = [];
  T.saveFromModal(); await wait();
  t('ничего не создано и не изменено', T.all().length === 1 && T.find('tpl_1').amount === 250,
    `${T.all().length} / ${T.find('tpl_1').amount}`);
  t('предупреждение показано', toasts.some(x => x[0] === 'warn'), JSON.stringify(toasts));

  console.log('\n— новое имя создаёт новый шаблон —');
  state = { txns:[], templates:[ mkTpl('tpl_1','Продукты') ] };
  promptAnswer = 'Кафе обед'; confirmAnswer = true;
  T.saveFromModal(); await wait();
  t('создан второй шаблон', T.all().length === 2, T.all().length);
  t('у нового есть метка правки', !!T.all()[1]._editedAt, T.all()[1]._editedAt);

  console.log('\n— удаление оставляет надгробие —');
  state = { txns:[], templates:[ mkTpl('tpl_1','Продукты'), mkTpl('tpl_2','Кафе') ] };
  confirmAnswer = true;
  T.del('tpl_1'); await wait();
  t('шаблон удалён', T.all().length === 1, T.all().length);
  t('надгробие поставлено', T.purged(state).some(x => x.id === 'tpl_1'), JSON.stringify(T.purged(state)));

  console.log('\n— слияние с Drive —');
  // правка на ПК, у облака свежее _lastModified
  const pcState = { txns:[], _lastModified:'2026-10-04T12:00:00.000Z',
    templates:[ mkTpl('tpl_1','Продукты неделя', { _editedAt:'2026-10-04T12:00:00.000Z' }) ] };
  const cloud = { txns:[], _lastModified:'2026-10-05T08:00:00.000Z',
    templates:[ mkTpl('tpl_1','Продукты', { _editedAt:'2026-10-01T09:00:00.000Z' }) ] };
  let m = T.merge(pcState, cloud);
  t('правка шаблона доехала', m.templates[0].name === 'Продукты неделя', m.templates[0].name);

  const phone = { txns:[], _lastModified:'2026-10-05T08:00:00.000Z',
    templates:[ mkTpl('tpl_1','Продукты', { _editedAt:'2026-10-01T09:00:00.000Z' }) ] };
  const m2 = T.merge(phone, m);
  t('на втором устройстве тоже', m2.templates[0].name === 'Продукты неделя', m2.templates[0].name);

  const devA = { txns:[], _lastModified:'2026-10-04T12:00:00.000Z',
    templates:[ mkTpl('a','А', { _editedAt:'2026-10-04T12:00:00.000Z' }) ] };
  const devB = { txns:[], _lastModified:'2026-10-06T12:00:00.000Z',
    templates:[ mkTpl('b','Б', { _editedAt:'2026-10-03T12:00:00.000Z' }) ] };
  const m3 = T.merge(devA, devB);
  t('шаблоны с двух устройств уцелели', m3.templates.length === 2, m3.templates.map(x=>x.id).join(','));

  const delState = { txns:[], _lastModified:'2026-10-07T12:00:00.000Z',
    templates:[], tplPurged:[{ id:'tpl_1', at:'2026-10-07T12:00:00.000Z' }] };
  const stillHas = { txns:[], _lastModified:'2026-10-01T12:00:00.000Z',
    templates:[ mkTpl('tpl_1','Продукты', { _editedAt:'2026-10-01T09:00:00.000Z' }) ] };
  const m4 = T.merge(delState, stillHas);
  t('удалённый шаблон не возвращается', m4.templates.length === 0, JSON.stringify(m4.templates.map(x=>x.id)));
  t('надгробие уезжает на Drive', (m4.tplPurged||[]).some(x => x.id === 'tpl_1'), JSON.stringify(m4.tplPurged));

  const legacy = { txns:[], _lastModified:'2026-01-01T00:00:00.000Z' };   // без templates вообще
  const m5 = T.merge(legacy, legacy);
  t('merge не падает без шаблонов', Array.isArray(m5.templates) && m5.templates.length === 0, JSON.stringify(m5.templates));

  console.log('\n— раскладка строки на узком экране —');
  {
    const css = fs.readFileSync(ROOT + 'css/main.css', 'utf8').replace(/\r\n/g, '\n');
    const appSrc = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
    t('текстовая часть вынесена в класс, а не инлайн',
      appSrc.includes('<div class="tpl-row-main">'), 'всё ещё инлайн-стили');
    // Кнопки с flex:1 делили ширину с текстом наравне — от названия и
    // комментария на телефоне почти ничего не оставалось.
    t('кнопки больше не конкурируют с текстом',
      !css.includes('.tpl-row .btn { flex: 1; }'), 'вернулось flex: 1');
    const mob = css.slice(css.indexOf('  .tpl-row { flex-wrap: wrap;'));
    const block = mob.slice(0, mob.indexOf('\n}'));
    t('на телефоне текст занимает всю ширину',
      block.includes('.tpl-row-main { flex: 1 1 100%; }'), block.slice(0, 120));
    t('иконочные кнопки по содержимому',
      block.includes('.tpl-row .btn { flex: 0 0 auto; }'), 'нет правила');
    t('«Применить» занимает остаток строки',
      block.includes('.tpl-row .btn-primary { flex: 1 1 auto; }'), 'нет правила');
  }

  console.log('\n— экранирование —');
  state = { txns:[], templates:[ mkTpl('tpl_1','<b>Жирный</b>', { comment:'цена < 100 & "кавычки"' }) ] };
  const row = T.rowHTML(T.find('tpl_1'));
  t('название экранировано', row.includes('&lt;b&gt;') && !row.includes('<b>Жирный'), 'не экранировано');
  t('комментарий экранирован', row.includes('&lt; 100') && row.includes('&amp;'), 'не экранирован');
  const form = T.formHTML(T.find('tpl_1'));
  t('значение в input экранировано', form.includes('&quot;') || !form.includes('"кавычки"'), 'кавычка ломает атрибут');

  console.log(`\nитого: ${ok} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
