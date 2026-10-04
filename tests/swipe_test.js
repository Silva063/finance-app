// Свайп: распознавание жеста, пороги, и главное — что вертикальный скролл не перехватывается.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const src = fs.readFileSync(ROOT + 'js/swipe.js', 'utf8');

const listeners = {};
let prevented = 0, edited = [], deleted = [];

function mkEl(tag, opts = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    dataset: opts.txnid ? { txnid: opts.txnid } : {},
    style: {}, parentElement: null, _tag: tag,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      get list() { return [...this._s].sort().join(' '); }
    },
    closest(sel) {
      // упрощённо: интересует только «это кнопка/поле внутри строки»
      const tags = sel.split(',').map(s => s.trim());
      let n = this;
      while (n) { if (tags.includes(n._tag)) return n; n = n.parentElement; }
      return null;
    }
  };
  return el;
}

const body = mkEl('body');
const ctx = vm.createContext({
  document: {
    body,
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: () => {},
    querySelector: () => null
  },
  window: {},
  localStorage: { getItem: () => '1', setItem: () => {} },
  opsOpenEditModal: id => edited.push(id),
  opsSoftDelete: id => deleted.push(id),
  setTimeout: (f, ms) => { if (ms <= 200) f(); return 0; },
  console, Math, String, Number
});
vm.runInContext(src, ctx);

const fire = (type, ev) => (listeners[type] || []).forEach(f => f(ev));
const touch = (x, y) => ({ clientX: x, clientY: y });
const mkEvent = (target, pts) => ({
  target, touches: pts, cancelable: true,
  preventDefault() { prevented++; }
});

function newRow(id) {
  const row = mkEl('tr', { txnid: id });
  const td = mkEl('td'); td.parentElement = row;
  return { row, td };
}

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

function swipe(startX, startY, steps, target) {
  prevented = 0;
  fire('touchstart', mkEvent(target, [touch(startX, startY)]));
  for (const [x, y] of steps) fire('touchmove', mkEvent(target, [touch(x, y)]));
  fire('touchend', mkEvent(target, []));
}

// ── свайп влево = удалить ─────────────────────────
console.log('— свайп влево —');
let { row, td } = newRow('t1'); deleted = []; edited = [];
swipe(300, 100, [[290,102],[250,104],[210,105]], td);
t('операция удалена', deleted.length === 1 && deleted[0] === 't1', JSON.stringify(deleted));
t('редактирование не открылось', edited.length === 0, JSON.stringify(edited));

// ── свайп вправо = редактировать ──────────────────
console.log('\n— свайп вправо —');
({ row, td } = newRow('t2')); deleted = []; edited = [];
swipe(100, 100, [[112,101],[150,103],[190,102]], td);
t('открылось редактирование', edited.length === 1 && edited[0] === 't2', JSON.stringify(edited));
t('ничего не удалено', deleted.length === 0, JSON.stringify(deleted));
t('строка вернулась на место', row.style.transform === '', JSON.stringify(row.style.transform));
t('классы жеста сняты', row.classList.list === '', row.classList.list);

// ── короткий свайп = ничего ───────────────────────
console.log('\n— короткий свайп (меньше порога) —');
({ row, td } = newRow('t3')); deleted = []; edited = [];
swipe(300, 100, [[290,100],[260,100]], td);   // 40px < 64
t('ничего не сработало', deleted.length === 0 && edited.length === 0, `del=${deleted} ed=${edited}`);
t('строка вернулась', row.style.transform === '', row.style.transform);

// ── вертикальный скролл не перехватываем ──────────
console.log('\n— вертикальное движение —');
({ row, td } = newRow('t4')); deleted = []; edited = [];
prevented = 0;
fire('touchstart', mkEvent(td, [touch(200, 300)]));
fire('touchmove',  mkEvent(td, [touch(203, 285)]));   // dy заметно больше dx
fire('touchmove',  mkEvent(td, [touch(206, 200)]));
fire('touchend',   mkEvent(td, []));
t('скролл не заблокирован (preventDefault не звался)', prevented === 0, prevented);
t('жест не сработал', deleted.length === 0 && edited.length === 0, `del=${deleted} ed=${edited}`);
t('строка не сдвинута', !row.style.transform, row.style.transform);

// ── горизонтальный свайп блокирует скролл ─────────
console.log('\n— горизонтальный свайп —');
({ row, td } = newRow('t5')); deleted = [];
prevented = 0;
fire('touchstart', mkEvent(td, [touch(300, 100)]));
fire('touchmove',  mkEvent(td, [touch(280, 101)]));
fire('touchmove',  mkEvent(td, [touch(220, 102)]));
fire('touchend',   mkEvent(td, []));
t('preventDefault вызван — страница не едет', prevented === 2, prevented);

// ── тап по кнопке внутри строки ───────────────────
console.log('\n— тап по кнопке ✎ внутри строки —');
({ row, td } = newRow('t6')); deleted = []; edited = [];
const btn = mkEl('button'); btn.parentElement = row;
swipe(300, 100, [[250,100],[210,100]], btn);
t('свайп по кнопке игнорируется', deleted.length === 0 && edited.length === 0, `del=${deleted} ed=${edited}`);

// ── касание вне строки операции ───────────────────
console.log('\n— касание вне строки —');
deleted = []; edited = [];
const stray = mkEl('div'); stray.parentElement = body;
swipe(300, 100, [[250,100],[200,100]], stray);
t('ничего не происходит', deleted.length === 0 && edited.length === 0, `del=${deleted} ed=${edited}`);

// ── мультитач (масштабирование) ───────────────────
console.log('\n— два пальца —');
({ row, td } = newRow('t7')); deleted = [];
fire('touchstart', mkEvent(td, [touch(300,100), touch(200,100)]));
fire('touchmove',  mkEvent(td, [touch(200,100), touch(300,100)]));
fire('touchend',   mkEvent(td, []));
t('мультитач не считается свайпом', deleted.length === 0, JSON.stringify(deleted));

// ── сдвиг ограничен ───────────────────────────────
console.log('\n— ограничение сдвига —');
({ row, td } = newRow('t8')); deleted = [];
fire('touchstart', mkEvent(td, [touch(400, 100)]));
fire('touchmove',  mkEvent(td, [touch(380, 100)]));
fire('touchmove',  mkEvent(td, [touch(50, 100)]));    // -350px
const shift = row.style.transform;
t('строка не уезжает дальше 96px', shift === 'translateX(-96px)', shift);
t('взведено состояние «сработает»', row.classList.contains('is-swipe-armed'), row.classList.list);
t('подсвечено красным (удаление)', row.classList.contains('is-swipe-del'), row.classList.list);
fire('touchend', mkEvent(td, []));

// ── touchcancel ───────────────────────────────────
console.log('\n— прерванное касание —');
({ row, td } = newRow('t9')); deleted = [];
fire('touchstart', mkEvent(td, [touch(300, 100)]));
fire('touchmove',  mkEvent(td, [touch(220, 100)]));
fire('touchcancel', mkEvent(td, []));
t('жест отменён, строка вернулась', deleted.length === 0 && row.style.transform === '', `del=${deleted} tr=${row.style.transform}`);
t('классы сняты', row.classList.list === '', row.classList.list);

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
