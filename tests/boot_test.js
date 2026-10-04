// Загружает все скрипты в том порядке, что в index.html, на снисходительных
// заглушках DOM и проверяет, что приложение стартует без исключений и что
// top-level объявления инициализировались (TDZ-ловушка из прошлого бага).
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
const order = [...html.matchAll(/<script src="js\/([\w-]+\.js)"><\/script>/g)].map(m => m[1]);

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

// ── снисходительная заглушка элемента: любое свойство возвращает что-то разумное
function mkEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), _tag: tag, nodeType: 1,
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    hidden: false, disabled: false, checked: false, selected: false,
    options: [], files: [], children: [], scrollLeft: 0, scrollTop: 0,
    clientWidth: 360, clientHeight: 200, scrollWidth: 360, offsetWidth: 360,
    classList: { _s: new Set(), add(...c){c.forEach(x=>this._s.add(x))}, remove(...c){c.forEach(x=>this._s.delete(x))},
                 toggle(c,f){ f===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (f?this._s.add(c):this._s.delete(c)) },
                 contains(c){ return this._s.has(c) } },
    appendChild(c){ this.children.push(c); return c; }, removeChild(){}, remove(){},
    insertAdjacentHTML(){}, insertBefore(c){ return c; }, setAttribute(){}, getAttribute(){ return null; },
    removeAttribute(){}, addEventListener(){}, removeEventListener(){}, focus(){}, blur(){}, click(){},
    scrollIntoView(){}, getBoundingClientRect(){ return { top:0,left:0,right:360,bottom:200,width:360,height:200 }; },
    querySelector(){ return mkEl('div'); }, querySelectorAll(){ return []; },
    closest(){ return null; }, contains(){ return false; }, add(){}, remove2(){}
  };
  return el;
}

const listeners = {};
const docEl = mkEl('html');
const body  = mkEl('body');
const document = {
  documentElement: docEl, body, head: mkEl('head'), readyState: 'loading',
  getElementById: () => mkEl('div'),
  querySelector:  () => mkEl('div'),
  querySelectorAll: () => [],
  createElement: tag => mkEl(tag),
  createTextNode: () => mkEl('text'),
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener: () => {}
};
const winListeners = {};
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k] = String(v); },
                       removeItem: k => { delete store[k]; }, clear: () => {} };

class Chart {
  static register() {} static defaults = { font: {} };
  constructor(c, cfg) { this.canvas = c; this.data = cfg && cfg.data; this.options = cfg && cfg.options; this.ctx = {
    save(){}, restore(){}, fillText(){}, measureText(){ return { width: 10 }; } }; }
  destroy() {} update() {} resize() {} getDatasetMeta() { return { hidden:false, data:[] }; }
}

const ctx = vm.createContext({
  document, localStorage, Chart,
  window: {
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
    removeEventListener: () => {}, innerWidth: 390, innerHeight: 800,
    location: { href: 'http://localhost/', origin: 'http://localhost' },
    matchMedia: () => ({ matches:false, addEventListener(){}, addListener(){} }),
    getComputedStyle: () => ({ getPropertyValue: () => '#888' })
  },
  getComputedStyle: () => ({ getPropertyValue: () => '#888' }),
  navigator: { userAgent: 'node', language: 'ru-RU' },
  fetch: () => Promise.reject(new Error('нет сети в тесте')),
  XLSX: { utils: { book_new(){}, json_to_sheet(){}, book_append_sheet(){} }, writeFile(){} },
  google: undefined,
  requestAnimationFrame: fn => { fn(); return 0; }, cancelAnimationFrame: () => {},
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  console: { log(){}, warn(){}, error(){}, info(){} },
  URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} },
  Blob: class {}, FileReader: class { readAsText(){} },
  Math, JSON, Date, Array, Object, String, Number, Boolean, Map, Set, WeakMap, Promise,
  isNaN, isFinite, parseFloat, parseInt, Error, TypeError, RangeError, encodeURIComponent,
  decodeURIComponent, Intl, Proxy, Reflect, Symbol, globalThis: undefined
});
ctx.globalThis = ctx;
ctx.self = ctx;

// ── грузим файлы в порядке из index.html ──────────
console.log('— загрузка скриптов —');
console.log('   порядок:', order.join(' → '));
let loadError = null;
for (const f of order) {
  try {
    vm.runInContext(fs.readFileSync(ROOT + 'js/' + f, 'utf8'), ctx, { filename: f });
  } catch (e) {
    loadError = `${f}: ${e.message}`;
    break;
  }
}
t('все скрипты выполнились без исключений', loadError === null, loadError);

// ── запускаем старт приложения ────────────────────
console.log('\n— старт приложения —');
let bootError = null;
try {
  for (const fn of (listeners['DOMContentLoaded'] || [])) fn({});
} catch (e) { bootError = e.message; }
t('DOMContentLoaded отработал без исключений', bootError === null, bootError);
t('обработчик старта вообще зарегистрирован', (listeners['DOMContentLoaded'] || []).length > 0,
  'ни одного DOMContentLoaded');

// ── именно та ловушка: top-level const должен быть доступен ──
console.log('\n— доступность top-level объявлений (TDZ) —');
const probe = name => {
  try { return vm.runInContext(`typeof ${name} !== 'undefined' ? String(${name}) : 'undefined'`, ctx); }
  catch (e) { return 'THROWS: ' + e.message; }
};
const ttl = probe('SYNC_TOMBSTONE_TTL_DAYS');
t('SYNC_TOMBSTONE_TTL_DAYS доступна (не в TDZ)', ttl === '90', ttl);
for (const name of ['OPS_BUDGET_DEFAULT', 'OPS_PAGES', 'C1_CFG_DEFAULT', 'AC_STEM_LEN', 'SW_TRIGGER']) {
  const v = probe(name);
  t(`${name} инициализирована`, !v.startsWith('THROWS') && v !== 'undefined', v);
}

// ── функции, которые зовёт синхронизация, должны существовать ──
console.log('\n— доступность функций слияния —');
for (const name of ['_mergeById', '_mergeOps', '_mergeInv', 'opsBudget', 'opsBudgetCalc',
                    'opsUpdateTrashBadge', 'opsBudgetRenderP1', 'invRefreshGoalsUI']) {
  const v = probe(name);
  t(`${name} определена`, v.startsWith('function'), v.slice(0, 40));
}

// ── и собственно merge вызывается без падения ──────
console.log('\n— merge на пустом состоянии —');
let mergeErr = null;
try {
  vm.runInContext(`_mergeOps({txns:[]}, {txns:[]}); _mergeInv({dates:[],goals:[]}, {dates:[],goals:[]});`, ctx);
} catch (e) { mergeErr = e.message; }
t('_mergeOps и _mergeInv работают', mergeErr === null, mergeErr);

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
