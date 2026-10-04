// Проверка поведения модалки: когда подставляем, когда только предлагаем, когда молчим.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const engine = fs.readFileSync(ROOT + 'js/autocat.js', 'utf8');

const CATS = [
  { id:'transport', name:'Транспорт' },
  { id:'grocery',   name:'Супермаркеты и продукты' },
  { id:'cafe',      name:'Кафе и рестораны' },
];
const txns = [];
const add = (comment, cat, n) => { for (let i=0;i<n;i++) txns.push({ comment, cat, type:'expense', amount:-1 }); };
add('Шериф', 'grocery', 10);
add('такси до работы', 'transport', 10);

const nodes = {};
const mk = id => ({ id, value:'', hidden:true, textContent:'', dataset:{} });
for (const id of ['m-cat','m-cat-auto','m-cat-suggest','m-comment','m-type']) nodes[id] = mk(id);
nodes['m-type'].value = 'expense';

const ctx = vm.createContext({
  opsState: { txns }, opsCats: () => CATS,
  opsCat: id => CATS.find(c => c.id === id) || { name:id },
  document: { getElementById: id => nodes[id] || null },
  console, Map, Set, Math, String, Number, JSON,
  setTimeout: (f) => { f(); return 0; },   // debounce выполняем сразу
  clearTimeout: () => {}
});
vm.runInContext(engine + `
;globalThis.__ui = { reset:opsAcReset, touch:opsAcTouch, type:opsAcOnComment, apply:opsAcApply };`, ctx);
const ui = ctx.__ui;

const st = () => ({
  cat:    nodes['m-cat'].value || '—',
  badge:  nodes['m-cat-auto'].hidden ? '' : 'авто',
  sug:    nodes['m-cat-suggest'].hidden ? '' : nodes['m-cat-suggest'].textContent
});
const typeIn = t => { nodes['m-comment'].value = t; ui.type(); };
let ok = 0, fail = 0;
function check(label, want) {
  const g = st();
  const got = `cat=${g.cat} badge=${g.badge||'-'} sug=${g.sug||'-'}`;
  const pass = got === want;
  pass ? ok++ : fail++;
  console.log(`${pass?'  ok':'FAIL'}  ${label.padEnd(46)} ${got}${pass?'':`\n        ждали: ${want}`}`);
}

console.log('— новая операция, категорию не трогали —');
ui.reset(false);
typeIn('Шериф');
check('печатаем «Шериф» → подставилось + пометка', 'cat=grocery badge=авто sug=-');
typeIn('Шериф 250 продукты');
check('дописываем — остаётся подставленным',        'cat=grocery badge=авто sug=-');
typeIn('');
check('стёрли комментарий → автомат убрал за собой','cat=— badge=- sug=-');

console.log('\n— пользователь выбрал категорию руками —');
ui.reset(false);
nodes['m-cat'].value = 'cafe'; ui.touch();
typeIn('Шериф');
check('не перетёрли, показали подсказку',           'cat=cafe badge=- sug=↳ похоже на: Супермаркеты и продукты');
ui.apply();
check('нажали на подсказку → применилось',          'cat=grocery badge=- sug=-');
typeIn('такси до работы');
check('после ручного выбора молчим, не меняем',     'cat=grocery badge=- sug=↳ похоже на: Транспорт');

console.log('\n— автомат согласен с ручным выбором —');
ui.reset(false);
nodes['m-cat'].value = 'grocery'; ui.touch();
typeIn('Шериф');
check('подсказки нет, лишнего шума нет',            'cat=grocery badge=- sug=-');

console.log('\n— редактирование операции с категорией —');
ui.reset(true);
nodes['m-cat'].value = 'cafe';
typeIn('Шериф');
check('существующую категорию не перетираем',       'cat=cafe badge=- sug=↳ похоже на: Супермаркеты и продукты');

console.log('\n— редактирование операции БЕЗ категории —');
ui.reset(false);
nodes['m-cat'].value = '';
typeIn('такси до работы');
check('пустую категорию заполняем',                 'cat=transport badge=авто sug=-');

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
