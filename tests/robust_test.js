// Устойчивость: предупреждение о нулевой сумме, работа без Chart.js и XLSX,
// экранирование пользовательского текста, локальные библиотеки на месте.
const fs = require('fs'), vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..') + path.sep;
const app   = fs.readFileSync(ROOT + 'js/app.js', 'utf8');
const utils = fs.readFileSync(ROOT + 'js/utils.js', 'utf8');
const html  = fs.readFileSync(ROOT + 'index.html', 'utf8');

let ok = 0, fail = 0;
const t = (label, cond, extra) => { cond ? ok++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${label}${cond?'':'   → '+extra}`); };

// ── библиотеки лежат в проекте, а не на CDN ──────
console.log('— внешние зависимости —');
t('Chart.js подключён локально', html.includes('src="vendor/chart.umd.min.js"'), 'нет локального Chart.js');
t('XLSX подключён локально', html.includes('src="vendor/xlsx.full.min.js"'), 'нет локального XLSX');
t('ссылок на cdnjs не осталось', !html.includes('cdnjs.cloudflare.com'), 'cdnjs ещё используется');
for (const f of ['vendor/chart.umd.min.js', 'vendor/xlsx.full.min.js']) {
  const p = ROOT + f;
  t(`${f} существует и не пуст`, fs.existsSync(p) && fs.statSync(p).size > 50000,
    fs.existsSync(p) ? fs.statSync(p).size : 'нет файла');
}
t('Chart.js именно 4.4.1', fs.readFileSync(ROOT + 'vendor/chart.umd.min.js', 'utf8').includes('4.4.1'), 'версия не подтверждается');

// ── прямых вызовов new Chart не осталось ─────────
console.log('— защита графиков —');
const directNew = (app.match(/new Chart\(/g) || []).length;
t('new Chart остался только внутри обёртки', directNew === 1, directNew);
t('все графики строятся через opsNewChart', (app.match(/opsNewChart\(/g) || []).length >= 5,
  (app.match(/opsNewChart\(/g) || []).length);
t('обращения к инстансам защищены от null',
  app.includes('if (chart1Inst) {') && app.includes('if (invChartA) invChartA._rows'),
  'есть незащищённые обращения');

// обёртка реально возвращает null и рисует заглушку, когда Chart недоступен
const wrapSrc = app.slice(app.indexOf('function opsNewChart'), app.indexOf('function getChartDefaults'));
let appended = null;
const wrapCtx = vm.createContext({
  document: { createElement: () => ({ className:'', textContent:'' }) },
  console: { warn(){} }, Math, String, Object
});
vm.runInContext(wrapSrc + ';globalThis.__w = opsNewChart;', wrapCtx);
const canvas = { parentElement: { querySelector: () => null, appendChild: n => { appended = n; } } };
const res = wrapCtx.__w(canvas, {});
t('без Chart.js возвращает null вместо исключения', res === null, res);
t('и показывает заглушку пользователю',
  appended && appended.className === 'chart-unavailable', JSON.stringify(appended));
t('заглушка объясняет причину', appended && /библиотека/i.test(appended.textContent), appended && appended.textContent);
t('null-канвас не ломает', wrapCtx.__w(null, {}) === null, 'бросило');

// ── XLSX: внятная ошибка вместо исключения ───────
console.log('— экспорт и импорт без XLSX —');
t('экспорт проверяет наличие библиотеки',
  /function opsExportXLSX\(\)\s*\{\s*\n\s*if \(typeof XLSX === 'undefined'\)/.test(app), 'нет проверки');
t('импорт проверяет наличие библиотеки',
  app.includes("if (!name.endsWith('.json') && typeof XLSX === 'undefined')"), 'нет проверки');
t('импорт JSON продолжает работать без XLSX',
  app.indexOf("name.endsWith('.json') && typeof XLSX") < app.indexOf("XLSX.read"), 'порядок проверок неверный');

// ── предупреждение о нулевой сумме ───────────────
console.log('— нулевая сумма —');
t('есть предупреждение при пустой сумме',
  /if \(!rawAmt\) showWarn\(/.test(app), 'предупреждения нет');
t('операция всё равно сохраняется (не блокируем)',
  app.indexOf('if (!rawAmt) showWarn(') < app.indexOf('opsState.txns.push({ id: opsGenId(), date, type, way, amount'),
  'предупреждение стоит после сохранения');

// ── экранирование ────────────────────────────────
console.log('— экранирование пользовательского текста —');
const escCtx = vm.createContext({ console, Math, String, Object });
vm.runInContext(utils.slice(utils.indexOf('function escHtml')), escCtx);
const esc = vm.runInContext('escHtml', escCtx);
t('угловые скобки', esc('<b>') === '&lt;b&gt;', esc('<b>'));
t('кавычки для атрибутов', esc('a"b') === 'a&quot;b', esc('a"b'));
t('апостроф', esc("a'b") === 'a&#39;b', esc("a'b"));
t('амперсанд первым', esc('&lt;') === '&amp;lt;', esc('&lt;'));
t('null и undefined', esc(null) === '' && esc(undefined) === '', `${esc(null)}/${esc(undefined)}`);

const raw = [];
for (const m of app.matchAll(/\$\{(?:t\.comment|i\.name|sec\.name|c\.name|g\.name|t\.name)\b[^}]*\}/g)) {
  const line = app.slice(0, m.index).split('\n').length;
  const ctxStr = app.slice(Math.max(0, m.index - 120), m.index + 40);
  // appConfirm/appPrompt безопасны: сообщение ставится через textContent
  if (/appConfirm\(|appPrompt\(/.test(ctxStr)) continue;
  // захват тернарника вида ${t.comment ? `...${escHtml(t.comment)}` : ''} — внутри экранировано
  if (m[0].includes('escHtml')) continue;
  raw.push(line);
}
t('неэкранированных вставок в разметку не осталось', raw.length === 0, 'строки: ' + raw.join(', '));
t('appConfirm ставит текст через textContent',
  (utils.match(/confirm-msg'\)\.textContent = msg/g) || []).length === 2,
  (utils.match(/confirm-msg'\)\.textContent = msg/g) || []).length);
t('имя категории больше не уезжает в onclick-атрибут',
  !app.includes("opsCatEditName('${c.id}','"), 'всё ещё в атрибуте');

console.log(`\nитого: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
