// Enter в форме операции: сохраняет, но не мешает кнопкам и вводу позиций.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const start = app.indexOf('/* ── Enter подтверждает операцию');
const src = app.slice(start, app.indexOf('   СОСТАВНЫЕ ПОЗИЦИИ', start) - 60);

let saved = 0, added = 0, focused = 0;
const listeners = [];

function mkEl(tag, opts = {}) {
  const el = { tagName: String(tag).toUpperCase(), _tag: tag, _parent: null,
    children: [], value: '',
    classList: { _s: new Set(opts.cls || []), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                 contains(c){ return this._s.has(c) } },
    querySelector(sel) { return sel === 'input' ? (this._input || null) : null; },
    closest(sel) {
      let n = this;
      while (n) {
        if (sel === '#m-items-list' && n._id === 'm-items-list') return n;
        n = n._parent;
      }
      return null;
    },
    contains(node) { let n = node; while (n) { if (n === this) return true; n = n._parent; } return false; },
    focus() { focused++; }
  };
  el._id = opts.id;
  return el;
}

const modal = mkEl('div', { id: 'ops-modal', cls: ['is-open'] });
const itemsList = mkEl('div', { id: 'm-items-list' });
itemsList._parent = modal;
const outside = mkEl('div', { id: 'elsewhere' });   // вне модалки

const nodes = { 'ops-modal': modal, 'm-items-list': itemsList };

const ctx = vm.createContext({
  document: {
    getElementById: id => nodes[id] || null,
    addEventListener: (type, fn) => { if (type === 'keydown') listeners.push(fn); }
  },
  opsSaveOp: () => { saved++; },
  opsAddItem: () => {
    added++;
    const row = mkEl('div'); row._parent = itemsList;
    row._input = mkEl('input'); row._input._parent = row;
    itemsList.children.push(row);
  },
  console: { log(){} }, Math, Date, String, Number, Object, Array, Set
});
vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

let prevented = 0;
function press(target, over = {}) {
  saved = 0; added = 0; prevented = 0; focused = 0;
  const ev = { key: 'Enter', isComposing: false, shiftKey: false, ctrlKey: false,
    altKey: false, metaKey: false, target, preventDefault() { prevented++; }, ...over };
  listeners.forEach(fn => fn(ev));
  return { saved, added, prevented, focused };
}
const inModal = tag => { const el = mkEl(tag); el._parent = modal; return el; };

// ── обычные поля ──────────────────────────────────
console.log('— Enter в полях формы —');
let r = press(inModal('input'));
t('в текстовом поле сохраняет операцию', r.saved === 1, JSON.stringify(r));
t('и гасит стандартное поведение', r.prevented === 1, r.prevented);
r = press(inModal('select'));
t('в выпадающем списке тоже сохраняет', r.saved === 1, JSON.stringify(r));

// ── кнопки отдаём браузеру ────────────────────────
console.log('— Enter на кнопках —');
r = press(inModal('button'));
t('на кнопке не сохраняет (нажмётся кнопка)', r.saved === 0, JSON.stringify(r));
t('не перехватывает событие', r.prevented === 0, r.prevented);
r = press(inModal('summary'));
t('на summary не сохраняет (раскрытие позиций)', r.saved === 0, JSON.stringify(r));
r = press(inModal('textarea'));
t('в textarea не сохраняет (перенос строки)', r.saved === 0, JSON.stringify(r));

// ── позиции: Enter = следующая строка ─────────────
console.log('— Enter в списке позиций —');
const itemInput = mkEl('input'); itemInput._parent = itemsList;
r = press(itemInput);
t('добавляет новую позицию', r.added === 1, JSON.stringify(r));
t('операцию не сохраняет', r.saved === 0, JSON.stringify(r));
t('фокус уходит в новую строку', r.focused === 1, r.focused);
t('стандартное поведение погашено', r.prevented === 1, r.prevented);

// ── модификаторы и IME ────────────────────────────
console.log('— модификаторы —');
for (const [k, lbl] of [['shiftKey','Shift'],['ctrlKey','Ctrl'],['altKey','Alt'],['metaKey','Meta']]) {
  r = press(inModal('input'), { [k]: true });
  t(`${lbl}+Enter не сохраняет`, r.saved === 0, JSON.stringify(r));
}
r = press(inModal('input'), { isComposing: true });
t('во время ввода через IME не сохраняет', r.saved === 0, JSON.stringify(r));
r = press(inModal('input'), { key: 'a' });
t('другие клавиши игнорируются', r.saved === 0, JSON.stringify(r));

// ── модалка закрыта / цель вне модалки ────────────
console.log('— вне формы операции —');
modal.classList.remove('is-open');
r = press(inModal('input'));
t('при закрытой модалке ничего не делает', r.saved === 0 && r.prevented === 0, JSON.stringify(r));
modal.classList.add('is-open');
r = press(outside);
t('Enter вне модалки не сохраняет', r.saved === 0 && r.prevented === 0, JSON.stringify(r));
r = press(null);
t('без цели не падает', r.saved === 0, JSON.stringify(r));

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
