// Стенд для автокатегоризации: движок как есть, данные — синтетическая история.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const engine = fs.readFileSync(ROOT + 'js/autocat.js', 'utf8');

const CATS = [
  { id:'transport',  name:'Транспорт' },
  { id:'grocery',    name:'Супермаркеты и продукты' },
  { id:'cafe',       name:'Кафе и рестораны' },
  { id:'health',     name:'Здравоохранение' },
  { id:'home',       name:'Для дома' },
  { id:'salary',     name:'Зарплата' },
];

// история: [комментарий, категория, тип, сколько раз]
const HIST = [
  ['Шериф',                 'grocery',   'expense', 14],
  ['Шериф продукты',        'grocery',   'expense', 6],
  ['Зеленый двор',          'grocery',   'expense', 4],
  ['такси до работы',       'transport', 'expense', 9],
  ['Такси',                 'transport', 'expense', 7],
  ['маршрутка',             'transport', 'expense', 11],
  ['бензин',                'transport', 'expense', 5],
  ['кофе с собой',          'cafe',      'expense', 8],
  ['обед в кафе',           'cafe',      'expense', 6],
  ['пицца',                 'cafe',      'expense', 3],
  ['аптека',                'health',    'expense', 6],
  ['аптека витамины',       'health',    'expense', 2],
  ['стоматолог',            'health',    'expense', 2],
  ['лампочки',              'home',      'expense', 2],
  ['порошок и моющее',      'home',      'expense', 3],
  ['зарплата',              'salary',    'income',  12],
  ['аванс',                 'salary',    'income',  8],
];

const txns = [];
for (const [comment, cat, type, n] of HIST)
  for (let i = 0; i < n; i++)
    txns.push({ id: txns.length, comment, cat, type, amount: type === 'income' ? 100 : -100 });

const ctx = vm.createContext({
  opsState: { txns },
  opsCats: () => CATS,
  opsCat: id => CATS.find(c => c.id === id) || { name: id },
  document: { getElementById: () => null },
  console, Map, Set, Math, String, Number, JSON, setTimeout, clearTimeout
});
vm.runInContext(engine + '\n;globalThis.__p = opsAcPredict; globalThis.__inv = opsAcInvalidate;', ctx);
const predict = ctx.__p;
const invalidate = ctx.__inv;   // так же, как это делает opsSave()

const name = id => id ? (CATS.find(c => c.id === id) || {}).name : '— молчит —';

// [ввод, тип, ожидаемая категория или null]
const CASES = [
  ['Шериф',                 'expense', 'grocery'],
  ['шериф 250',             'expense', 'grocery'],
  ['в Шерифе',              'expense', 'grocery'],   // склонение
  ['ШЕРИФ продукты',        'expense', 'grocery'],
  ['Зелёный двор',          'expense', 'grocery'],   // ё → е
  ['такси',                 'expense', 'transport'],
  ['такси домой',           'expense', 'transport'],
  ['на маршрутке',          'expense', 'transport'],
  ['бензин 92',             'expense', 'transport'],
  ['кофе',                  'expense', 'cafe'],
  ['обед',                  'expense', 'cafe'],
  ['аптека',                'expense', 'health'],
  ['стоматологу',           'expense', 'health'],
  ['зарплата',              'income',  'salary'],
  ['аванс за январь',       'income',  'salary'],
  // должен молчать:
  ['подарок Ане',           'expense', null],
  ['',                      'expense', null],
  ['на',                    'expense', null],
  ['12345',                 'expense', null],
  ['зарплата',              'expense', null],       // тип не тот
  ['такси',                 'income',  null],       // тип не тот
];

let ok = 0, fail = 0;
for (const [input, type, want] of CASES) {
  const got = predict(input, type);
  const pass = got === want;
  pass ? ok++ : fail++;
  console.log(`${pass ? '  ok' : 'FAIL'}  ${type === 'income' ? '+' : '-'} ${JSON.stringify(input).padEnd(22)} → ${name(got)}${pass ? '' : `   (ждали: ${name(want)})`}`);
}
console.log(`\nитого: ${ok} ok, ${fail} fail`);

// Самообучение: поправили категорию — следующий раз автомат знает
console.log('\n— самообучение —');
console.log('до:   "Андре-Мари" →', name(predict('Андре-Мари', 'expense')));
txns.push({ id: 999, comment: 'Андре-Мари', cat: 'cafe', type: 'expense', amount: -100 });
invalidate();
console.log('после:"Андре-Мари" →', name(predict('Андре-Мари', 'expense')));

// Удалённая категория не должна предлагаться
console.log('\n— категорию удалили из справочника —');
const i = CATS.findIndex(c => c.id === 'cafe'); CATS.splice(i, 1);
invalidate();
console.log('"кофе с собой" →', name(predict('кофе с собой', 'expense')));
