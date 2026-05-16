/* ══════════════════════════════════════════════════
   app.js — ядро приложения
   Содержит: переключение приложений, мобильный сайдбар,
   весь модуль OPS (операции/финучёт),
   весь модуль INV (инвентаризация/склад).
   Данные хранятся в localStorage.
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   APP SWITCHER
══════════════════════════════════════════════════ */
function switchApp(app) {
  document.querySelectorAll('.app-frame').forEach(f => f.classList.remove('is-active'));
  document.querySelectorAll('.topbar-tab').forEach(t => t.classList.remove('is-active'));
  document.getElementById('app-' + app).classList.add('is-active');
  document.getElementById('tab-' + app).classList.add('is-active');
  if (app === 'ops') opsReRenderCurrent();
  // mobile bottom nav active state
  document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('is-active'));
  const mnavEl = document.getElementById('mnav-' + app);
  if (mnavEl) mnavEl.classList.add('is-active');
  // FAB visibility
  const fab = document.getElementById('mobile-fab');
  if (fab) fab.style.display = (app === 'ops') ? '' : 'none';
  // store current app
  document.body.dataset.app = app;
}

/* ══════════════════════════════════════════════════
   MOBILE SIDEBAR DRAWER
══════════════════════════════════════════════════ */
function toggleSidebar() {
  // Open the sidebar belonging to the active app frame
  const activeFrame = document.querySelector('.app-frame.is-active');
  if (!activeFrame) return;
  const sidebar = activeFrame.querySelector('.sidebar');
  if (!sidebar) return;
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen = sidebar.classList.contains('is-open');
  if (isOpen) {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-open');
  } else {
    // Close any other open sidebars first
    document.querySelectorAll('.sidebar.is-open').forEach(s => s.classList.remove('is-open'));
    sidebar.classList.add('is-open');
    overlay.classList.add('is-open');
  }
}

function closeSidebar() {
  document.querySelectorAll('.sidebar.is-open').forEach(s => s.classList.remove('is-open'));
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.classList.remove('is-open');
}

// Close sidebar on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSidebar();
    // Close topmost open modal
    const open = [...document.querySelectorAll('.overlay.is-open')];
    if (open.length) open[open.length - 1].classList.remove('is-open');
  }
});

// Click on overlay backdrop closes the modal (but not when clicking inside .modal)
document.addEventListener('click', e => {
  if (!e.target.classList.contains('overlay')) return;
  e.target.classList.remove('is-open');
});

// Init mobile nav state
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mnav-ops')?.classList.add('is-active');
  document.body.dataset.app = 'ops';
});


/* ══════════════════════════════════════════════════
   SHARED CHART CONFIG
══════════════════════════════════════════════════ */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: cssVar('--muted'), font: { family: 'JetBrains Mono', size: 10 } } },
      tooltip: {
        backgroundColor: cssVar('--bg3'), borderColor: cssVar('--line2'), borderWidth: 1,
        titleColor: cssVar('--text'), bodyColor: cssVar('--muted'),
        titleFont: { family: 'JetBrains Mono', size: 10 },
        bodyFont:  { family: 'JetBrains Mono', size: 10 }
      }
    },
    scales: {
      x: { ticks: { color: cssVar('--muted'), font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: cssVar('--line') } },
      y: { ticks: { color: cssVar('--muted'), font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: cssVar('--line') } }
    }
  };
}
// Keep CHART_DEFAULTS as alias for legacy callers — spread it fresh each use
const CHART_DEFAULTS = new Proxy({}, { get: (_, k) => getChartDefaults()[k] });

/* ══════════════════════════════════════════════════
   ╔════════════════════╗
   ║   APP 2 — ФИНУЧЁТ  ║
   ╚════════════════════╝
══════════════════════════════════════════════════ */

// ── Storage ──────────────────────────────────────
function opsLoad() {
  try { const s = localStorage.getItem('finOps2026'); if (s) return JSON.parse(s); } catch(e) {}
  return { txns: [], nextId: 1, categories: OPS_DEFAULT_CATS, templates: [] };
}
function opsSave() {
  if (!opsState._lastModified) opsState._lastModified = new Date().toISOString();
  localStorage.setItem('finOps2026', JSON.stringify(opsState));
}

const OPS_DEFAULT_CATS = [
  { id:'transport',   name:'Транспорт',                    color:'#3b82f6', icon:'🚗' },
  { id:'grocery',     name:'Супермаркеты и продукты',      color:'#f59e0b', icon:'🛒' },
  { id:'cafe',        name:'Кафе и рестораны',             color:'#f97316', icon:'🍕' },
  { id:'electronics', name:'Бытовая техника и электроника',color:'#6366f1', icon:'💻' },
  { id:'finance',     name:'Банки и финансы',              color:'#10b981', icon:'💳' },
  { id:'home',        name:'Для дома',                     color:'#8b5cf6', icon:'🏠' },
  { id:'repair',      name:'Ремонт и материалы',           color:'#78716c', icon:'🔧' },
  { id:'health',      name:'Здравоохранение',              color:'#ec4899', icon:'💊' },
  { id:'books',       name:'Книги и пресса',               color:'#14b8a6', icon:'📚' },
  { id:'stationery',  name:'Канцтовары',                   color:'#a78bfa', icon:'✏️' },
  { id:'clothes',     name:'Одежда и обувь',               color:'#f43f5e', icon:'👗' },
  { id:'other',       name:'Разное',                       color:'#6b7280', icon:'📦' },
];

let opsState = opsLoad();
if (!opsState.nextId) opsState.nextId = opsState.txns.length + 1;
if (!opsState.categories) opsState.categories = OPS_DEFAULT_CATS;
// emoji OFF by default
if (opsState.catUseEmoji === undefined) opsState.catUseEmoji = false;
if (!opsState.templates) opsState.templates = [];

// ── ID generation — globally unique, no cross-device collisions ──────
// Format: timestamp (ms) + 4 random hex chars → e.g. 1718000000000_a3f2
// Safe to compare with old numeric ids because String(number) never contains '_'
function opsGenId() {
  return Date.now() + '_' + Math.random().toString(16).slice(2, 6);
}

function opsCats() { return opsState.categories || OPS_DEFAULT_CATS; }
function opsCat(id) { return opsCats().find(c => c.id === id) || { name: id || '—', color:'#6b7280', icon:'📦' }; }
function opsCatDisplay(cat) {
  // Returns display name — with or without emoji depending on setting
  if (!cat) return '';
  const useEmoji = opsState.catUseEmoji === true;
  return useEmoji ? `${cat.icon} ${cat.name}` : cat.name;
}

let opsCurPage = 'op-p1';
let p4Month    = new Date().toISOString().slice(0,7);
let opsEditId  = null;
let chart1Inst = null;

// ── Locale helpers ────────────────────────────────
const MONTHS_RU      = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_RU_GEN  = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_SHORT   = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const DAYS_SHORT     = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function fmtAmt(n, sign = false) {
  const s = Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits:2, maximumFractionDigits:2 });
  if (sign) return (n >= 0 ? '+' : '−') + s;
  return n < 0 ? '−' + s : s;
}
function fmtDate(d) {
  const dt = new Date(d + 'T12:00:00');
  return `${dt.getDate()} ${MONTHS_RU_GEN[dt.getMonth()]}`;
}
function fmtDateFull(d) {
  const dt = new Date(d + 'T12:00:00');
  return `${DAYS_SHORT[dt.getDay()]} ${dt.getDate()} ${MONTHS_RU_GEN[dt.getMonth()]} ${dt.getFullYear()} г.`;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return MONTHS_RU[+m - 1] + ' ' + y;
}
function getMonths() {
  return [...new Set(opsState.txns.filter(t => !t._deleted).map(t => t.date.slice(0, 7)))].sort();
}
function getYears() {
  return [...new Set(opsState.txns.filter(t => !t._deleted).map(t => t.date.slice(0, 4)))].sort();
}
function txnsByMonth(ym) { return opsState.txns.filter(t => !t._deleted && t.date.slice(0, 7) === ym); }

function calcSummary(txns) {
  let income=0, expense=0, cashIn=0, cashEx=0, cardIn=0, cardEx=0;
  for (const t of txns) {
    const a = t.amount;
    if (t.type === 'income') { income += a; t.way === 'Наличный' ? (cashIn += a) : (cardIn += a); }
    else                     { expense += a; t.way === 'Наличный' ? (cashEx += a) : (cardEx += a); }
  }
  return { income, expense, cashIn, cashEx, cardIn, cardEx,
           net: income + expense, cashNet: cashIn + cashEx, cardNet: cardIn + cardEx };
}

// ── Navigation ────────────────────────────────────
const OPS_PAGES = ['op-p1','op-p2','op-p5','op-p3','op-p4','op-p6'];
function opsNav(id) {
  document.querySelectorAll('#app-ops .page').forEach(p => p.classList.remove('is-active'));
  document.querySelectorAll('#app-ops .sidebar-nav-item').forEach(n => n.classList.remove('is-active'));
  document.getElementById(id).classList.add('is-active');
  const idx = OPS_PAGES.indexOf(id);
  if (idx >= 0) document.querySelectorAll('#app-ops .sidebar-nav-item')[idx].classList.add('is-active');
  opsCurPage = id;
  if (id === 'op-p1') renderP1();
  if (id === 'op-p2') renderP2();
  if (id === 'op-p5') renderP5();
  if (id === 'op-p3') renderP3();
  if (id === 'op-p4') renderP4();
  if (id === 'op-p6') renderP6();
}
function opsReRenderCurrent() {
  if (opsCurPage === 'op-p1') renderP1();
  else if (opsCurPage === 'op-p2') renderP2();
  else if (opsCurPage === 'op-p5') renderP5();
  else if (opsCurPage === 'op-p3') renderP3();
  else if (opsCurPage === 'op-p4') renderP4();
  else if (opsCurPage === 'op-p6') renderP6();
}

// ── Filter helpers ────────────────────────────────
function fillYearSel(id) {
  const sel = document.getElementById(id), cur = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  for (const y of getYears()) { const o = document.createElement('option'); o.value = y; o.textContent = y; sel.appendChild(o); }
  if (cur) sel.value = cur;
}
function fillMonthSel(id, yearId) {
  const sel = document.getElementById(id), cur = sel.value;
  const yr = yearId ? document.getElementById(yearId).value : '';
  while (sel.options.length > 1) sel.remove(1);
  let months = getMonths();
  if (yr) months = months.filter(m => m.startsWith(yr));
  for (const m of months) { const o = document.createElement('option'); o.value = m; o.textContent = monthLabel(m); sel.appendChild(o); }
  if (cur) sel.value = cur;
}

function opsResetP1() {
  ['f1search','f1type','f1way','f1year','f1month','f1cat'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderP1();
}
function opsResetP2() { document.getElementById('f2search').value = ''; document.getElementById('f2year').value = ''; document.getElementById('f2month').value = ''; renderP2(); }
function opsResetP5() { document.getElementById('f5search').value = ''; document.getElementById('f5year').value = ''; document.getElementById('f5month').value = ''; renderP5(); }
function opsResetP3() { document.getElementById('f3year').value = ''; renderP3(); }

// ── Page 1 — All ──────────────────────────────────
function renderP1() {
  fillYearSel('f1year'); fillMonthSel('f1month', 'f1year');
  // fill category filter
  const f1cat = document.getElementById('f1cat');
  if (f1cat) {
    const cur = f1cat.value;
    f1cat.innerHTML = '<option value="">Все категории</option>' +
      '<option value="__none__"' + (cur==='__none__'?' selected':'') + '>— без категории</option>' +
      opsCats().map(c => `<option value="${c.id}" ${c.id===cur?'selected':''}>${opsCatDisplay(c)}</option>`).join('');
  }
  const search = document.getElementById('f1search').value.toLowerCase();
  const type  = document.getElementById('f1type').value;
  const way   = document.getElementById('f1way').value;
  const year  = document.getElementById('f1year').value;
  const month = document.getElementById('f1month').value;
  const f1catVal = f1cat?.value || '';

  let txns = opsState.txns.filter(t => !t._deleted);
  if (type)     txns = txns.filter(t => t.type === type);
  if (way)      txns = txns.filter(t => t.way === way);
  if (f1catVal === '__none__') txns = txns.filter(t => !t.cat);
  else if (f1catVal) txns = txns.filter(t => (t.cat||'') === f1catVal);
  if (month)    txns = txns.filter(t => t.date.startsWith(month));
  else if (year) txns = txns.filter(t => t.date.startsWith(year));
  if (search)   txns = txns.filter(t =>
    (t.comment||'').toLowerCase().includes(search) ||
    t.date.includes(search) ||
    (t.items||[]).some(i => (i.name||'').toLowerCase().includes(search))
  );

  const s = calcSummary(txns);
  document.getElementById('p1stats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Приход</div><div class="stat-card-value is-pos">+${fmtAmt(s.income)}</div><div class="stat-card-sub">${txns.filter(t=>t.type==='income').length} операций</div></div>
    <div class="stat-card"><div class="stat-card-label">Расход</div><div class="stat-card-value is-neg">−${fmtAmt(Math.abs(s.expense))}</div><div class="stat-card-sub">${txns.filter(t=>t.type==='expense').length} операций</div></div>
    <div class="stat-card"><div class="stat-card-label">Итог</div><div class="stat-card-value ${s.net>=0?'is-pos':'is-neg'}">${fmtAmt(s.net,true)}</div><div class="stat-card-sub">${txns.length} всего</div></div>
    <div class="stat-card"><div class="stat-card-label">Безнал / Нал итог</div><div class="stat-card-value is-neu" style="font-size:13px">${fmtAmt(s.cardNet,true)}</div><div class="stat-card-sub">Нал: ${fmtAmt(s.cashNet,true)}</div></div>`;

  document.getElementById('p1count').textContent = `${txns.length} операций`;

  const hasCat = txns.some(t => !!t.cat);

  const byMonth = {};
  const sorted = [...txns].sort((a,b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  for (const t of sorted) { const m = t.date.slice(0,7); if (!byMonth[m]) byMonth[m] = []; byMonth[m].push(t); }

  let rows = '';
  const colspan = hasCat ? 6 : 5;
  for (const m of Object.keys(byMonth).sort().reverse()) {
    const mt = byMonth[m], ms = calcSummary(mt);
    rows += mt.map(t => {
      const cat = t.cat ? opsCat(t.cat) : null;
      const catCell = hasCat
        ? `<td>${cat ? `<span class="tag tag-neutral" style="border-left:2px solid ${cat.color};max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-flex;">${opsCatDisplay(cat)}</span>` : '<span style="color:var(--muted2)">—</span>'}</td>`
        : '';
      const hasItems = t.items && t.items.length > 0;
      const expandBtn = hasItems
        ? `<button class="txn-expand-btn" onclick="opsToggleItems('${t.id}')" title="Показать позиции">▸ ${t.items.length}</button>`
        : '';
      return `<tr data-txnid="${t.id}">
      <td style="white-space:nowrap;color:var(--muted)">${fmtDate(t.date)}</td>
      <td><div class="txn-tags">
        <span class="tag ${t.type==='income'?'tag-income':'tag-expense'}">${t.type==='income'?'↑ Приход':'↓ Расход'}</span>
        <span class="tag ${t.way==='Наличный'?'tag-cash':'tag-card'}">${t.way}</span>
        ${expandBtn}
      </div></td>
      ${catCell}
      <td class="${t.amount>=0?'amt-pos':'amt-neg'}" style="font-weight:500;white-space:nowrap">${fmtAmt(t.amount,true)}</td>
      <td style="color:var(--muted)">${t.comment||'—'}</td>
      <td><button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')">✎</button></td>
    </tr>`;
    }).join('');
    rows += `<tr class="month-subtotal-row"><td colspan="${colspan}">
      <span style="opacity:.6">${monthLabel(m)}:</span>
      &nbsp;<span style="color:var(--green)">+${fmtAmt(ms.income)}</span>
      &nbsp;<span style="color:var(--red)">−${fmtAmt(Math.abs(ms.expense))}</span>
      &nbsp;<span style="color:${ms.net>=0?'var(--green)':'var(--red)'}">= ${fmtAmt(ms.net,true)}</span>
    </td></tr>`;
  }

  // Update table header dynamically
  const thead = document.querySelector('#op-p1 table thead tr');
  if (thead) {
    thead.innerHTML = `<th>Дата</th><th>Операция</th>${hasCat ? '<th>Категория</th>' : ''}<th>Сумма</th><th>Комментарий</th><th></th>`;
  }
  document.getElementById('p1body').innerHTML = rows;

  // chart
  if (chart1Inst) { chart1Inst.destroy(); chart1Inst = null; }
  const allMonths   = getMonths();
  const filtMonths  = year ? allMonths.filter(m => m.startsWith(year)) : allMonths;
  const incomeData  = filtMonths.map(m => +(txnsByMonth(m).filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)).toFixed(2));
  const expenseData = filtMonths.map(m => +(Math.abs(txnsByMonth(m).filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))).toFixed(2));
  const netData     = filtMonths.map((m,i) => +(incomeData[i] - expenseData[i]).toFixed(2));
  // Full month name label (e.g. "Январь 2025")
  const labels      = filtMonths.map(m => {
    const [y, mo] = m.split('-');
    return MONTHS_RU[+mo - 1].charAt(0).toUpperCase() + MONTHS_RU[+mo - 1].slice(1) + ' ' + y;
  });

  const shortLabels = filtMonths.map(m => MONTHS_SHORT[+m.split('-')[1]-1]);

  const nowYM = new Date().toISOString().slice(0,7);
  const curIdx = filtMonths.indexOf(nowYM);

  chart1Inst = new Chart(document.getElementById('chart1'), {
    type: 'bar',
    data: { labels, datasets: [
      { label:'Приход', data:incomeData,  backgroundColor: cssVar('--green')+'8c', borderColor: cssVar('--green'), borderWidth:1, borderRadius:3 },
      { label:'Расход', data:expenseData, backgroundColor: cssVar('--red')+'8c',   borderColor: cssVar('--red'),   borderWidth:1, borderRadius:3 }
    ]},
    options: { ...getChartDefaults(),
      plugins: { ...getChartDefaults().plugins,
        annotation: undefined,
        tooltip: { ...getChartDefaults().plugins.tooltip,
          callbacks: {
            title: ctx => labels[ctx[0]?.dataIndex] || '',
            afterBody(ctx) {
              const i = ctx[0]?.dataIndex;
              if (i === undefined) return '';
              const net = netData[i];
              return `Итог: ${net >= 0 ? '+' : ''}${net.toLocaleString('ru-RU', {maximumFractionDigits:2})}`;
            }
          }
        }
      },
      scales: { ...getChartDefaults().scales,
        x: { ...getChartDefaults().scales.x,
          ticks: { ...getChartDefaults().scales.x.ticks,
            callback(val, i) {
              const lbl  = shortLabels[i] || '';
              const net  = netData[i];
              const sign = net >= 0 ? '+' : '';
              return i === curIdx ? ['▸ ' + lbl, sign + Math.round(net)] : [lbl, sign + Math.round(net)];
            },
            color(ctx) {
              const net = netData[ctx.index];
              if (ctx.index === curIdx) return cssVar('--acc2');
              return net >= 0 ? cssVar('--green') : cssVar('--red');
            },
            maxRotation: 0,
            font: { family: 'JetBrains Mono', size: 9 }
          }
        }
      }
    }
  });
}

// ── Page 2 — Beznal ───────────────────────────────
function renderP2() {
  fillYearSel('f2year'); fillMonthSel('f2month', 'f2year');
  const search = document.getElementById('f2search').value.toLowerCase();
  const year   = document.getElementById('f2year').value;
  const month  = document.getElementById('f2month').value;

  let txns = opsState.txns.filter(t => !t._deleted && t.way === 'Безналичный');
  if (month)  txns = txns.filter(t => t.date.startsWith(month));
  else if (year) txns = txns.filter(t => t.date.startsWith(year));
  if (search) txns = txns.filter(t =>
    (t.comment||'').toLowerCase().includes(search) ||
    (t.items||[]).some(i => (i.name||'').toLowerCase().includes(search))
  );

  const s = calcSummary(txns);
  const totalBeznal = opsState.txns.filter(t => !t._deleted && t.way === 'Безналичный').reduce((a,t) => a+t.amount, 0);

  document.getElementById('p2stats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Приход</div><div class="stat-card-value is-pos">+${fmtAmt(s.cardIn)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Расход</div><div class="stat-card-value is-neg">−${fmtAmt(Math.abs(s.cardEx))}</div></div>
    <div class="stat-card"><div class="stat-card-label">Итог за период</div><div class="stat-card-value ${s.cardNet>=0?'is-pos':'is-neg'}">${fmtAmt(s.cardNet,true)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Всего (= е-кошелёк)</div><div class="stat-card-value ${totalBeznal>=0?'is-pos':'is-neg'}">${fmtAmt(totalBeznal,true)}</div></div>`;

  document.getElementById('p2count').textContent = `${txns.length} операций`;

  const sorted = [...txns].sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  let run = 0;
  const withRun = sorted.map(t => { run += t.amount; return { ...t, run }; });

  document.getElementById('p2body').innerHTML = [...withRun].reverse().map(t => `<tr>
    <td style="white-space:nowrap;color:var(--muted)">${fmtDate(t.date)}</td>
    <td><span class="tag ${t.type==='income'?'tag-income':'tag-expense'}">${t.type==='income'?'↑ Приход':'↓ Расход'}</span></td>
    <td class="${t.amount>=0?'amt-pos':'amt-neg'}" style="font-weight:500">${fmtAmt(t.amount,true)}</td>
    <td style="color:var(--muted);font-size:11px">${fmtAmt(t.run,true)}</td>
    <td style="color:var(--muted)">${t.comment||'—'}</td>
    <td><button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')">✎</button></td>
  </tr>`).join('');
}

// ── Page 5 — Cash ─────────────────────────────────
function renderP5() {
  fillYearSel('f5year'); fillMonthSel('f5month', 'f5year');
  const search = document.getElementById('f5search').value.toLowerCase();
  const year   = document.getElementById('f5year').value;
  const month  = document.getElementById('f5month').value;

  let txns = opsState.txns.filter(t => !t._deleted && t.way === 'Наличный');
  if (month)  txns = txns.filter(t => t.date.startsWith(month));
  else if (year) txns = txns.filter(t => t.date.startsWith(year));
  if (search) txns = txns.filter(t =>
    (t.comment||'').toLowerCase().includes(search) ||
    (t.items||[]).some(i => (i.name||'').toLowerCase().includes(search))
  );

  const s = calcSummary(txns);
  const totalCash = opsState.txns.filter(t => !t._deleted && t.way === 'Наличный').reduce((a,t) => a+t.amount, 0);

  document.getElementById('p5stats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Приход</div><div class="stat-card-value is-pos">+${fmtAmt(s.cashIn)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Расход</div><div class="stat-card-value is-neg">−${fmtAmt(Math.abs(s.cashEx))}</div></div>
    <div class="stat-card"><div class="stat-card-label">Итог за период</div><div class="stat-card-value ${s.cashNet>=0?'is-pos':'is-neg'}">${fmtAmt(s.cashNet,true)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Всего (= факт. нал)</div><div class="stat-card-value ${totalCash>=0?'is-pos':'is-neg'}">${fmtAmt(totalCash,true)}</div></div>`;

  document.getElementById('p5count').textContent = `${txns.length} операций`;

  const sorted = [...txns].sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  let run = 0;
  const withRun = sorted.map(t => { run += t.amount; return { ...t, run }; });

  document.getElementById('p5body').innerHTML = [...withRun].reverse().map(t => `<tr>
    <td style="white-space:nowrap;color:var(--muted)">${fmtDate(t.date)}</td>
    <td><span class="tag ${t.type==='income'?'tag-income':'tag-expense'}">${t.type==='income'?'↑ Приход':'↓ Расход'}</span></td>
    <td class="${t.amount>=0?'amt-pos':'amt-neg'}" style="font-weight:500">${fmtAmt(t.amount,true)}</td>
    <td style="color:var(--muted);font-size:11px">${fmtAmt(t.run,true)}</td>
    <td style="color:var(--muted)">${t.comment||'—'}</td>
    <td><button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')">✎</button></td>
  </tr>`).join('');
}

// ── Page 3 — By month ─────────────────────────────
function renderP3() {
  fillYearSel('f3year');
  const filterYear = document.getElementById('f3year').value;
  let months = getMonths();
  if (filterYear) months = months.filter(m => m.startsWith(filterYear));

  let html = '';
  for (const m of [...months].reverse()) {
    const txns = txnsByMonth(m); if (!txns.length) continue;
    const s = calcSummary(txns);
    const netCls = s.net >= 0 ? 'is-pos' : 'is-neg';

    const byDay = {};
    for (const t of txns) { if (!byDay[t.date]) byDay[t.date] = []; byDay[t.date].push(t); }

    let dayRows = '';
    for (const day of Object.keys(byDay).sort().reverse()) {
      const dayTxns = byDay[day];
      const daySum  = dayTxns.reduce((a,t) => a+t.amount, 0);
      const dt      = new Date(day + 'T12:00:00');
      dayRows += `<div class="day-label">${DAYS_SHORT[dt.getDay()]} ${dt.getDate()} ${MONTHS_RU_GEN[dt.getMonth()]} — итог: <span style="color:${daySum>=0?'var(--green)':'var(--red)'}">${fmtAmt(daySum,true)}</span></div>`;
      dayRows += dayTxns.map(t => `
        <div class="txn-row-inline">
          <span class="tag ${t.type==='income'?'tag-income':'tag-expense'}">${t.type==='income'?'↑ Приход':'↓ Расход'}</span>
          <span class="tag ${t.way==='Наличный'?'tag-cash':'tag-card'}">${t.way}</span>
          <span class="${t.amount>=0?'amt-pos':'amt-neg'}" style="font-weight:500;font-size:12px;min-width:88px;flex-shrink:0">${fmtAmt(t.amount,true)}</span>
          <span class="txn-comment">${t.comment||'—'}</span>
          <button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')">✎</button>
        </div>`).join('');
    }

    html += `<div class="month-block" id="mb_${m}">
      <div class="month-header" onclick="toggleMonth('${m}')">
        <div class="month-name">${monthLabel(m)}</div>
        <div class="month-stats">
          <div class="month-stat">↑ <span style="color:var(--green)">${fmtAmt(s.income)}</span></div>
          <div class="month-stat">↓ <span style="color:var(--red)">${fmtAmt(Math.abs(s.expense))}</span></div>
          <div class="month-stat">= <span class="${netCls==='is-pos'?'amt-pos':'amt-neg'}">${fmtAmt(s.net,true)}</span></div>
          <div class="month-chevron">▼</div>
        </div>
      </div>
      <div class="month-body">
        ${dayRows}
        <div class="month-summary">
          <span style="color:var(--muted2)">${monthLabel(m)} —</span>
          <span>приход: <span style="color:var(--green)">${fmtAmt(s.income,true)}</span></span>
          <span>расход: <span style="color:var(--red)">−${fmtAmt(Math.abs(s.expense))}</span></span>
          <span>итог: <span class="${netCls==='is-pos'?'amt-pos':'amt-neg'}">${fmtAmt(s.net,true)}</span></span>
        </div>
      </div>
    </div>`;
  }
  document.getElementById('p3body').innerHTML = html;
}
function toggleMonth(m) { document.getElementById('mb_' + m).classList.toggle('is-open'); }

// ── Page 4 — Current month ────────────────────────
function buildP4Sels() {
  const years = getYears(), yr = p4Month.slice(0,4), curM = p4Month.slice(0,7);
  const ysel = document.getElementById('p4yearsel'), msel = document.getElementById('p4monthsel');
  ysel.innerHTML = '';
  for (const y of years) { const o = document.createElement('option'); o.value = y; o.textContent = y; if (y===yr) o.selected=true; ysel.appendChild(o); }
  msel.innerHTML = '';
  const ms = getMonths().filter(m => m.startsWith(yr));
  for (const m of ms) { const o = document.createElement('option'); o.value = m; o.textContent = MONTHS_RU[+m.slice(5)-1]; if (m===curM) o.selected=true; msel.appendChild(o); }
}
function p4YearChange() {
  const y = document.getElementById('p4yearsel').value;
  const ms = getMonths().filter(m => m.startsWith(y));
  if (!ms.length) return;
  p4Month = ms[ms.length-1];
  const msel = document.getElementById('p4monthsel'); msel.innerHTML = '';
  for (const m of ms) { const o = document.createElement('option'); o.value = m; o.textContent = MONTHS_RU[+m.slice(5)-1]; if (m===p4Month) o.selected=true; msel.appendChild(o); }
  renderP4();
}
function p4MonthChange() { p4Month = document.getElementById('p4monthsel').value; renderP4(); }
function p4Prev() { let [y,m] = p4Month.split('-').map(Number); m--; if (m < 1)  { m = 12; y--; } p4Month = y + '-' + String(m).padStart(2,'0'); renderP4(); }
function p4Next() { let [y,m] = p4Month.split('-').map(Number); m++; if (m > 12) { m = 1;  y++; } p4Month = y + '-' + String(m).padStart(2,'0'); renderP4(); }

function renderP4() {
  buildP4Sels();
  const [y,mo] = p4Month.split('-').map(Number);
  const label = MONTHS_RU[mo-1] + ' ' + y;
  document.getElementById('p4label').textContent = label;

  const txns = txnsByMonth(p4Month);
  const s    = calcSummary(txns);

  document.getElementById('p4stats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Приход</div><div class="stat-card-value is-pos">+${fmtAmt(s.income)}</div><div class="stat-card-sub">Наличный +${fmtAmt(s.cashIn)} / Безналичный +${fmtAmt(s.cardIn)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Расход</div><div class="stat-card-value is-neg">−${fmtAmt(Math.abs(s.expense))}</div><div class="stat-card-sub">Наличный −${fmtAmt(Math.abs(s.cashEx))} / Безналичный −${fmtAmt(Math.abs(s.cardEx))}</div></div>
    <div class="stat-card"><div class="stat-card-label">Безнал / Нал</div><div class="stat-card-value is-neu" style="font-size:13px">${fmtAmt(s.cardNet,true)}</div><div class="stat-card-sub">Нал: ${fmtAmt(s.cashNet,true)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Итог месяца</div><div class="stat-card-value ${s.net>=0?'is-pos':'is-neg'}">${fmtAmt(s.net,true)}</div><div class="stat-card-sub">${txns.length} операций</div></div>`;

  document.getElementById('p4count').textContent = `${txns.length} операций за ${label}`;

  const sorted = [...txns].sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  let cashRun=0, cardRun=0;
  const withRun = sorted.map(t => {
    if (t.way==='Наличный') cashRun+=t.amount; else cardRun+=t.amount;
    return { ...t, cashRun, cardRun, totalRun: cashRun+cardRun };
  });

  document.getElementById('p4body').innerHTML = [...withRun].reverse().map(t => `<tr>
    <td style="white-space:nowrap;color:var(--muted)">${fmtDate(t.date)}</td>
    <td><span class="tag ${t.type==='income'?'tag-income':'tag-expense'}">${t.type==='income'?'↑ Приход':'↓ Расход'}</span></td>
    <td><span class="tag ${t.way==='Наличный'?'tag-cash':'tag-card'}">${t.way}</span></td>
    <td class="${t.amount>=0?'amt-pos':'amt-neg'}" style="font-weight:500;white-space:nowrap">${fmtAmt(t.amount,true)}</td>
    <td style="font-size:11px;color:var(--muted)">${fmtAmt(t.cashRun,true)}</td>
    <td style="font-size:11px;color:var(--muted)">${fmtAmt(t.cardRun,true)}</td>
    <td style="font-size:11px;font-weight:500;color:${t.totalRun>=0?'var(--green)':'var(--red)'}">${fmtAmt(t.totalRun,true)}</td>
    <td style="color:var(--muted)">${t.comment||'—'}</td>
    <td><button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')">✎</button></td>
  </tr>`).join('');
}

// ── Modal ─────────────────────────────────────────
function opsFillCatSel(selectedId) {
  const sel = document.getElementById('m-cat');
  sel.innerHTML = '<option value="">— без категории —</option>' +
    opsCats().map(c => `<option value="${c.id}" ${c.id===selectedId?'selected':''}>${opsCatDisplay(c)}</option>`).join('');
}
function opsOpenAddModal() {
  opsEditId = null;
  document.getElementById('ops-modal-title').textContent = 'Новая операция';
  document.getElementById('m-date').value    = new Date().toISOString().slice(0,10);
  document.getElementById('m-type').value    = 'expense';
  document.getElementById('m-way').value     = 'Безналичный';
  document.getElementById('m-amt').value     = '';
  document.getElementById('m-comment').value = '';
  opsFillCatSel('');
  opsLoadItems([], 'none');
  document.getElementById('m-del-btn').style.display = 'none';
  document.getElementById('ops-modal').classList.add('is-open');
}
function opsOpenEditModal(id) {
  const t = opsState.txns.find(t => String(t.id) === String(id)); if (!t) return;
  opsEditId = id;
  document.getElementById('ops-modal-title').textContent = 'Редактировать операцию';
  document.getElementById('m-date').value    = t.date;
  document.getElementById('m-type').value    = t.type;
  document.getElementById('m-way').value     = t.way;
  document.getElementById('m-amt').value     = Math.abs(t.amount);
  document.getElementById('m-comment').value = t.comment || '';
  opsFillCatSel(t.cat || '');
  opsLoadItems(t.items || [], t.itemsMode || 'none');
  document.getElementById('m-del-btn').style.display = 'block';
  document.getElementById('ops-modal').classList.add('is-open');
}
function opsCloseModal() {
  document.getElementById('ops-modal').classList.remove('is-open');
}
function opsSaveOp() {
  const date    = document.getElementById('m-date').value;   if (!date) return;
  const type    = document.getElementById('m-type').value;
  const way     = document.getElementById('m-way').value;
  const rawAmt  = parseFloat(document.getElementById('m-amt').value) || 0;
  const comment = document.getElementById('m-comment').value.trim();
  const cat     = document.getElementById('m-cat').value;
  const amount  = type === 'expense' ? -Math.abs(rawAmt) : Math.abs(rawAmt);
  const itemsMode = opsGetCurrentMode();
  const items   = itemsMode !== 'none' ? opsGetItems() : [];

  const now = new Date().toISOString();
  if (opsEditId) {
    const t = opsState.txns.find(t => String(t.id) === String(opsEditId));
    if (t) Object.assign(t, { date, type, way, amount, comment, cat, items, itemsMode: items.length ? itemsMode : undefined, _editedAt: now });
  } else {
    opsState.txns.push({ id: opsGenId(), date, type, way, amount, comment, cat, items, itemsMode: items.length ? itemsMode : undefined, _editedAt: now });
  }
  opsSave(); opsCloseModal(); opsReRenderCurrent();
  if (driveToken) driveDebouncedPush('ops');

  // Limit check: warn if category limit reached or exceeded
  if (cat && type === 'expense') {
    const catObj = opsCats().find(c => c.id === cat);
    if (catObj && catObj.limit > 0) {
      const monthKey   = date.slice(0, 7);
      const monthSpent = opsState.txns
        .filter(t => !t._deleted && t.type === 'expense' && t.cat === cat && t.date.startsWith(monthKey))
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      const pctOfLimit = monthSpent / catObj.limit * 100;
      if (monthSpent > catObj.limit) {
        showWarn(`✕ Лимит «${catObj.name}» превышен: ${fmtAmt(monthSpent)} / ${fmtAmt(catObj.limit)} руб`);
      } else if (pctOfLimit >= 80) {
        showWarn(`! «${catObj.name}»: ${Math.round(pctOfLimit)}% лимита (${fmtAmt(monthSpent)} / ${fmtAmt(catObj.limit)})`);
      }
    }
  }
}
function opsDeleteOp() {
  if (!opsEditId) return;
  appConfirm('Удалить операцию?').then(ok => {
    if (!ok) return;
    // Soft delete: mark as deleted and propagate via merge
    const t = opsState.txns.find(t => String(t.id) === String(opsEditId));
    if (t) { t._deleted = true; t._deletedAt = new Date().toISOString(); t._editedAt = t._deletedAt; }
    opsSave(); opsCloseModal(); opsReRenderCurrent();
    if (driveToken) driveDebouncedPush('ops');
  });
}

/* ══════════════════════════════════════════════════
   СОСТАВНЫЕ ПОЗИЦИИ (ITEMS)
══════════════════════════════════════════════════ */

function opsSetMode(mode) {
  // Update button active states
  ['none','detail','sum'].forEach(m => {
    const btn = document.getElementById('m-mode-' + m);
    if (btn) btn.classList.toggle('is-active', m === mode);
  });
  // Store in hidden attr on section
  document.getElementById('m-items-section').dataset.mode = mode;
  const sec    = document.getElementById('m-items-section');
  const amtFld = document.getElementById('m-amt');
  sec.style.display = mode === 'none' ? 'none' : '';
  amtFld.readOnly    = mode === 'sum';
  amtFld.style.color = mode === 'sum' ? 'var(--muted)' : '';
  if (mode === 'sum') opsRecalcItemsSum();
  opsUpdateItemsTotalLabel();
  // Update summary hint in <summary>
  const hint = document.getElementById('m-items-summary-hint');
  if (hint) {
    const items = opsGetItems();
    if (mode === 'none' || !items.length) hint.textContent = '';
    else hint.textContent = `· ${items.length} поз.`;
  }
}

function opsItemsModeChange() {
  // legacy shim — read from dataset
  const mode = document.getElementById('m-items-section').dataset.mode || 'none';
  opsSetMode(mode);
}

function opsGetCurrentMode() {
  return document.getElementById('m-items-section').dataset.mode || 'none';
}

function opsAddItem(name='', qty=1, price='') {
  const list = document.getElementById('m-items-list');
  const idx  = list.children.length;
  const row  = document.createElement('div');
  row.className = 'm-item-row';
  row.dataset.idx = idx;

  const nameI  = document.createElement('input'); nameI.placeholder = 'Название'; nameI.value = name; nameI.type = 'text';
  const qtyI   = document.createElement('input'); qtyI.placeholder = '1'; qtyI.value = qty; qtyI.type = 'number'; qtyI.min = '0'; qtyI.step = 'any';
  const priceI = document.createElement('input'); priceI.placeholder = '0.00'; priceI.value = price; priceI.type = 'number'; priceI.min = '0'; priceI.step = '0.01';
  const rem    = document.createElement('button'); rem.className = 'm-item-remove'; rem.textContent = '×'; rem.type = 'button';

  [qtyI, priceI].forEach(inp => inp.addEventListener('input', () => {
    if (opsGetCurrentMode() === 'sum') opsRecalcItemsSum();
    opsUpdateItemsTotalLabel();
  }));
  rem.addEventListener('click', () => { row.remove(); opsRecalcItemsSum(); opsUpdateItemsTotalLabel(); });

  row.append(nameI, qtyI, priceI, rem);
  list.appendChild(row);
  nameI.focus();
}

function opsGetItems() {
  return [...document.querySelectorAll('#m-items-list .m-item-row')].map(row => {
    const [nameI, qtyI, priceI] = row.querySelectorAll('input');
    return {
      name:  nameI.value.trim(),
      qty:   parseFloat(qtyI.value) || 1,
      price: parseFloat(priceI.value) || 0,
    };
  }).filter(i => i.name || i.price);
}

function opsRecalcItemsSum() {
  const mode = opsGetCurrentMode();
  if (mode !== 'sum') return;
  const total = opsGetItems().reduce((s,i) => s + i.qty * i.price, 0);
  document.getElementById('m-amt').value = total.toFixed(2);
}

function opsUpdateItemsTotalLabel() {
  const mode  = opsGetCurrentMode();
  const items = opsGetItems();
  const sum   = items.reduce((s,i) => s + i.qty * i.price, 0);
  const lbl   = document.getElementById('m-items-total-label');
  const hint  = document.getElementById('m-items-summary-hint');
  if (!lbl) return;
  if (mode === 'none' || !items.length) {
    lbl.textContent = '';
    if (hint) hint.textContent = '';
    return;
  }
  if (hint) hint.textContent = `· ${items.length} поз.`;
  const mainAmt = parseFloat(document.getElementById('m-amt').value) || 0;
  if (mode === 'detail') {
    const diff = mainAmt - sum;
    lbl.textContent = `Σ позиций: ${fmtAmt(sum)} · ${diff >= 0 ? 'остаток: +'+fmtAmt(diff) : 'превышение: '+fmtAmt(diff)}`;
    lbl.style.color = Math.abs(diff) < 0.01 ? 'var(--green)' : 'var(--amber)';
  } else {
    lbl.textContent = `Итого: ${fmtAmt(sum)}`;
    lbl.style.color = 'var(--muted)';
  }
}

function opsLoadItems(items, mode) {
  const list = document.getElementById('m-items-list');
  list.innerHTML = '';
  (items || []).forEach(i => opsAddItem(i.name, i.qty, i.price));
  // Open details if there are items
  const det = document.getElementById('m-items-details');
  if (det && items && items.length > 0) det.open = true;
  opsSetMode(mode || 'none');
}

// Expand/collapse detail row in table
function opsToggleItems(id) {
  const t = opsState.txns.find(t => String(t.id) === String(id));
  if (!t || !t.items || !t.items.length) return;
  const existing = document.getElementById(`txn-items-${id}`);
  if (existing) { existing.remove(); return; }

  const mainRow = document.querySelector(`tr[data-txnid="${id}"]`);
  if (!mainRow) return;
  const colspan = mainRow.querySelectorAll('td').length;

  const detailTr = document.createElement('tr');
  detailTr.className = 'txn-items-row';
  detailTr.id = `txn-items-${id}`;

  const fmtN = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const itemsTotal = t.items.reduce((s,i) => s + i.qty * i.price, 0);

  const rows = t.items.map(i => {
    const lineTotal = i.qty * i.price;
    return `<div class="txn-item-line">
      <span class="txn-item-name">${i.name || '—'}</span>
      <span class="txn-item-qty">${i.qty}×</span>
      <span class="txn-item-price">${fmtN(i.price)} руб</span>
      <span class="txn-item-total ${lineTotal>=0?'amt-pos':'amt-neg'}">${fmtN(lineTotal)}</span>
    </div>`;
  }).join('');

  const modeLabel = t.itemsMode === 'sum' ? 'Сборка (позиции → итог)' : 'Детализация (итог → позиции)';
  const diff = Math.abs(t.amount) - itemsTotal;

  detailTr.innerHTML = `<td colspan="${colspan}">
    <div class="txn-items-wrap">
      <div class="txn-items-header">
        <span>${modeLabel} · ${t.items.length} поз.</span>
        <span>Σ позиций: ${fmtN(itemsTotal)} руб${Math.abs(diff)>0.01 ? ' · разница: '+(diff>0?'+':'')+fmtN(diff) : ' ✓'}</span>
      </div>
      ${rows}
    </div>
  </td>`;

  mainRow.insertAdjacentElement('afterend', detailTr);
}
function opsOpenExportModal() { document.getElementById('ops-export-modal').classList.add('is-open'); }
function opsCloseExportModal() { document.getElementById('ops-export-modal').classList.remove('is-open'); }
function opsExportJSON() {
  const blob = new Blob([JSON.stringify(opsState, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finops_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}
function opsExportXLSX() {
  const sorted = [...opsState.txns.filter(t => !t._deleted)].sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const rows   = sorted.map(t => [fmtDateFull(t.date), t.type==='income'?'Приход':'Расход', t.way, t.amount, t.comment||'']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:28},{wch:10},{wch:14},{wch:12},{wch:60}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Операции');
  XLSX.writeFile(wb, `finops_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function opsImportFile(input) {
  const file = input.files[0]; if (!file) return;
  const name = file.name.toLowerCase();
  const r = new FileReader();
  if (name.endsWith('.json')) {
    r.onload = e => {
      try {
        const imp = JSON.parse(e.target.result);
        if (!imp.txns) throw new Error('bad format');
        // confirm removed - sandbox incompatible
        // migrate categories
        if (!imp.categories) imp.categories = OPS_DEFAULT_CATS;
        if (imp.catUseEmoji === undefined) imp.catUseEmoji = false;
        // auto-add unknown category IDs found in txns
        const knownIds = new Set(imp.categories.map(c => c.id));
        for (const t of imp.txns) {
          if (t.cat && !knownIds.has(t.cat)) {
            imp.categories.push({ id: t.cat, name: t.cat, color: '#6b7280', icon: '📦' });
            knownIds.add(t.cat);
          }
        }
        opsState = imp; opsSave(); opsReRenderCurrent();
      } catch(err) { showErr('Ошибка: ' + err.message); }
    };
    r.readAsText(file);
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    r.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type:'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1 });
        const ruM  = {'января':'01','февраля':'02','марта':'03','апреля':'04','мая':'05','июня':'06','июля':'07','августа':'08','сентября':'09','октября':'10','ноября':'11','декабря':'12'};
        const imported = [];
        for (const row of rows) {
          if (!row || row.length < 4) continue;
          const [dateRaw, typeRaw, wayRaw, amtRaw, commentRaw] = row;
          if (!dateRaw || amtRaw === undefined) continue;
          let date = '';
          if (typeof dateRaw === 'string') {
            const iso = dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (iso) { date = iso[0]; }
            else { const mm = dateRaw.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/); if (mm) { const mon = ruM[mm[2].toLowerCase()]||'01'; date = `${mm[3]}-${mon}-${mm[1].padStart(2,'0')}`; } }
          } else if (typeof dateRaw === 'number') {
            const d = XLSX.SSF.parse_date_code(dateRaw);
            if (d) date = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
          }
          if (!date) continue;
          const type    = String(typeRaw||'').toLowerCase().includes('приход') ? 'income' : 'expense';
          const wayStr  = String(wayRaw||'');
          const way     = wayStr.toLowerCase().includes('нал') ? 'Наличный' : 'Безналичный';
          const amount  = parseFloat(String(amtRaw).replace(',','.')) || 0;
          const comment = String(commentRaw||'').trim();
          imported.push({ id: opsGenId(), date, type, way, amount, comment });
        }
        if (!imported.length) { showErr('Не удалось распознать данные.'); return; }
        // confirm removed - sandbox incompatible
        opsState.txns.push(...imported);
        opsSave(); opsReRenderCurrent();
      } catch(err) { showErr('Ошибка: ' + err.message); }
    };
    r.readAsBinaryString(file);
  } else { showErr('Поддерживаются форматы: .json, .xlsx, .xls'); }
  input.value = '';
}

/* ══════════════════════════════════════════════════
   ╔══════════════════════════╗
   ║   APP 1 — ИНВЕНТАРИЗАЦИЯ ║
   ╚══════════════════════════╝
══════════════════════════════════════════════════ */

// ── Default data (used only for first-time init on fresh install) ──
// Список всех известных валют (только мета-данные — имена)
const INV_DEFAULT_CURRENCIES = [
  { code:'RUP', name:'Рубль ПМР'        },
  { code:'USD', name:'Доллар США'       },
  { code:'EUR', name:'Евро'             },
  { code:'MDL', name:'Лей РМ'          },
  { code:'RUB', name:'Рубль РФ'        },
  { code:'UAH', name:'Гривна Украины'  },
];

// Курсы валютных пар — APB Online 25.04.2026
// buy  = банк покупает у вас FROM (вы продаёте FROM → получаете TO)
// sell = банк продаёт вам FROM (вы покупаете FROM → отдаёте TO)
const INV_DEFAULT_PAIRS = [
  { from:'USD', to:'MDL', buy:16.5000, sell:18.5000 },
  { from:'USD', to:'RUB', buy:74.0000, sell:97.0000 },
  { from:'USD', to:'RUP', buy:16.3000, sell:16.3500 },
  { from:'EUR', to:'USD', buy:1.1550,  sell:1.1900  },
  { from:'EUR', to:'RUB', buy:85.5000, sell:110.5000},
  { from:'EUR', to:'RUP', buy:18.8000, sell:19.7000 },
  { from:'MDL', to:'RUP', buy:0.9450,  sell:1.0050  },
  { from:'UAH', to:'RUP', buy:0.3400,  sell:0.3750  },
  { from:'RUB', to:'RUP', buy:0.2040,  sell:0.2200  },
];

// Базовая валюта (валюта, в которой считается итог инвентаризации)
const INV_DEFAULT_BASE = 'RUP';

// Пустой набор блоков — пользователь создаёт сам через "Настройка блоков"
const INV_DEFAULT_SECTIONS = [];

// ── Storage ───────────────────────────────────────
function invLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem('finData')||'null');
    if (!raw) return invDefaultState();
    // migrate old state that has no sections/currencies
    if (!raw.sections) raw.sections = INV_DEFAULT_SECTIONS;
    // Migrate old currencies (array with rate/rateBuy) to new model
    if (!raw.pairs) {
      // Try to build pairs from old currency model
      if (raw.currencies && raw.currencies.length) {
        const base = 'RUP';
        const knownCodes = new Set(INV_DEFAULT_CURRENCIES.map(c => c.code));
        // Create currencies list from old data
        raw.currencyList = [];
        for (const c of raw.currencies) {
          // old: code RUB was ПМР base
          const newCode = c.code === 'RUB' ? 'RUP' : c.code;
          if (!raw.currencyList.find(x => x.code === newCode))
            raw.currencyList.push({ code: newCode, name: c.name });
          // Create pairs from old rates (TO = RUP)
          if (c.code !== 'RUB' && c.rate) {
            if (!raw.pairs) raw.pairs = [];
            const fromCode = c.code;
            raw.pairs.push({ from: fromCode, to: base, buy: c.rateBuy || c.rate, sell: c.rate });
          }
        }
      }
      if (!raw.pairs) raw.pairs = [...INV_DEFAULT_PAIRS];
      // Migrate block currency references: old RUB → RUP
      if (raw.sections) {
        for (const s of raw.sections) {
          if (s.currency === 'RUB') s.currency = 'RUP';
        }
      }
    }
    if (!raw.currencyList) raw.currencyList = INV_DEFAULT_CURRENCIES;
    if (!raw.baseCurrency) raw.baseCurrency = INV_DEFAULT_BASE;
    if (!raw.goals) raw.goals = [];
    // Remove legacy fields
    delete raw.currencies; delete raw.rates;
    return raw;
  } catch(e) { return invDefaultState(); }
}
function invDefaultState() {
  return {
    dates:[], sections: INV_DEFAULT_SECTIONS,
    currencyList: INV_DEFAULT_CURRENCIES,
    pairs: INV_DEFAULT_PAIRS,
    baseCurrency: INV_DEFAULT_BASE,
    goals:[]
  };
}
function invSaveState() {
  invState._lastModified = new Date().toISOString();
  localStorage.setItem('finData', JSON.stringify(invState));
}

let invState    = invLoad();
let invCurId    = null;
let invChartA   = null;
let invChartB   = null;
let invDashRows = [];

// ── Sections accessor (always use invState.sections) ─
function invSections() { return invState.sections || []; }

// ── Rates ─────────────────────────────────────────
// Accessors
function invPairs() { return invState.pairs || []; }
function invCurrencyList() { return invState.currencyList || INV_DEFAULT_CURRENCIES; }
function invBaseCurrency() { return invState.baseCurrency || 'RUP'; }

/**
 * Convert amount FROM → TO using Dijkstra on the currency graph.
 * direction: 'buy'  = банк покупает FROM у вас (вы "продаёте" FROM → получаете TO)
 *            'sell' = банк продаёт FROM вам    (вы "покупаете" FROM → отдаёте TO)
 * Returns conversion rate (result = amount * rate).
 * Returns null if no path found.
 */
function invConvertRate(from, to, direction) {
  if (from === to) return 1;
  const pairs = invPairs();

  // Build graph: node = currency code, edge weight = log(rate) for maximizing product
  // We want to find the path from→to that maximizes the final amount received.
  // For "how much TO do I get per 1 FROM":
  //   Direct pair (from→to) with direction 'buy': rate = pair.buy
  //   Reverse pair (to→from) direction 'sell': if I have FROM, bank sells me TO for FROM
  //     which means: 1 FROM / pair.sell (of TO/FROM) ... let's think carefully.
  //
  // APB table: USD/RUP buy=16.3 sell=16.35
  //   buy  means bank buys USD from you → you give 1 USD, get 16.3 RUP   → rate 16.3
  //   sell means bank sells USD to you  → you give 16.35 RUP, get 1 USD  → rate 1/16.35
  //
  // So: edgeRate(from, to, dir) =
  //   if pair exists (from→to): dir=buy → pair.buy; dir=sell → pair.sell
  //   if pair exists (to→from) (reverse):
  //     dir=buy means: I want FROM → I'm giving TO to bank, bank sells me FROM
  //       → bank sells (to→from) means: pair(to,from).sell rate means "per 1 TO, get X FROM"
  //       → edgeRate = 1 / pair(to,from).sell
  //     dir=sell means: I'm selling FROM to bank, bank pays me in TO
  //       → bank buys (to→from) means: pair(to,from).buy "per 1 TO, bank pays X FROM"
  //       → if bank buys 1 TO for X FROM, then per 1 FROM I get 1/X TO
  //       → edgeRate = 1 / pair(to,from).buy

  function edgeRate(a, b, dir) {
    const direct = pairs.find(p => p.from === a && p.to === b);
    if (direct) return dir === 'buy' ? direct.buy : direct.sell;
    const rev = pairs.find(p => p.from === b && p.to === a);
    if (rev) return dir === 'buy' ? 1 / rev.sell : 1 / rev.buy;
    return null;
  }

  // Dijkstra (maximize product → use log-sum = -log to minimize)
  const codes = [...new Set([...pairs.map(p=>p.from), ...pairs.map(p=>p.to)])];
  if (!codes.includes(from)) return null;
  if (!codes.includes(to))   return null;

  const dist = {}; // max log-product
  const prev = {};
  codes.forEach(c => { dist[c] = -Infinity; });
  dist[from] = 0;
  const visited = new Set();
  const queue   = new Set(codes);

  while (queue.size) {
    // pick unvisited with max dist
    let u = null;
    for (const c of queue) { if (u === null || dist[c] > dist[u]) u = c; }
    queue.delete(u);
    if (u === to) break;
    if (dist[u] === -Infinity) break;

    for (const c of codes) {
      if (visited.has(c)) continue;
      const r = edgeRate(u, c, direction);
      if (!r || r <= 0) continue;
      const nd = dist[u] + Math.log(r);
      if (nd > dist[c]) { dist[c] = nd; prev[c] = u; }
    }
    visited.add(u);
  }

  if (dist[to] === -Infinity) return null;
  return Math.exp(dist[to]);
}

/**
 * Get path details for conversion from→to.
 * Returns array of steps: { from, to, rate, direction, pairUsed }
 */
function invConvertPath(from, to, direction) {
  if (from === to) return [];
  const pairs = invPairs();

  function edgeRate(a, b, dir) {
    const direct = pairs.find(p => p.from === a && p.to === b);
    if (direct) return { rate: dir==='buy' ? direct.buy : direct.sell, pair: direct, reversed: false };
    const rev = pairs.find(p => p.from === b && p.to === a);
    if (rev) return { rate: dir==='buy' ? 1/rev.sell : 1/rev.buy, pair: rev, reversed: true };
    return null;
  }

  const codes = [...new Set([...pairs.map(p=>p.from), ...pairs.map(p=>p.to)])];
  const dist = {}; const prev = {}; const edges = {};
  codes.forEach(c => { dist[c] = -Infinity; });
  dist[from] = 0;
  const visited = new Set(); const queue = new Set(codes);
  while (queue.size) {
    let u = null;
    for (const c of queue) { if (u===null || dist[c]>dist[u]) u=c; }
    queue.delete(u);
    if (u===to) break; if (dist[u]===-Infinity) break;
    for (const c of codes) {
      if (visited.has(c)) continue;
      const e = edgeRate(u, c, direction);
      if (!e || e.rate<=0) continue;
      const nd = dist[u] + Math.log(e.rate);
      if (nd > dist[c]) { dist[c] = nd; prev[c] = u; edges[c] = e; }
    }
    visited.add(u);
  }

  if (dist[to] === -Infinity) return null;
  const path = [];
  let cur = to;
  while (prev[cur]) {
    const e = edges[cur];
    path.unshift({ from: prev[cur], to: cur, rate: e.rate, pair: e.pair, reversed: e.reversed });
    cur = prev[cur];
  }
  return path;
}

// Simplified helpers used throughout the app
function invRate(currencyCode) {
  // Sell rate: how much base you get per 1 unit of currencyCode (you sell currencyCode)
  if (currencyCode === invBaseCurrency()) return 1;
  const r = invConvertRate(currencyCode, invBaseCurrency(), 'buy');
  return r !== null ? r : 1;
}
function invRateBuy(currencyCode) {
  // Buy rate from the block perspective:
  // We have currencyCode in hand and want to know its value in base currency.
  // "buy" means bank buys FROM us → we give currency, get base.
  return invRate(currencyCode);
}
function invRateSell(currencyCode) {
  // Sell rate: how much base we must spend to GET 1 unit of currencyCode
  if (currencyCode === invBaseCurrency()) return 1;
  const r = invConvertRate(currencyCode, invBaseCurrency(), 'sell');
  return r !== null ? r : 1;
}

// Render dynamic rates in sidebar
function invRenderRates() { /* no-op: rates moved to modal */ }
function invUpdateRate(code, val) {
  // Legacy compat — no-op or partial
  if (invCurId) invRenderCurrent();
  else invShowDashboard();
}
function invUpdateRateBuy(code, val) { /* handled via pair editor */ }
function invLoadRates() { /* rates now shown in modal */ }

// ── Record helpers ────────────────────────────────
function invEmpty(dateStr, note='') {
  const secs = {};
  for (const s of invSections())
    secs[s.id] = s.ekosh ? { val:0 } : Object.fromEntries(s.noms.map(n => [n, 0]));
  return { id:dateStr, date:dateStr, note, secs };
}

function invCalc(rec) {
  const base = invBaseCurrency();
  let pmr=0, total=0;
  for (const sec of invSections()) {
    const rate = sec.currency === base ? 1 : (invConvertRate(sec.currency, base, 'buy') || 1);
    let secVal = sec.ekosh
      ? (rec.secs[sec.id]?.val || 0) * rate
      : sec.noms.reduce((a,n) => a + (rec.secs[sec.id]?.[n]||0)*n*rate, 0);
    if (sec.pmr) pmr += secVal;
    total += secVal;
  }
  return { pmr, total };
}

function invFmt(n) {
  if (!n && n!==0) return '—';
  return n.toLocaleString('ru-RU', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function invFmtShort(n) { return n.toLocaleString('ru-RU', { maximumFractionDigits:0 }); }

// ── Sidebar ───────────────────────────────────────
function invRenderSidebar() {
  const list   = document.getElementById('inv-date-list');
  const sorted = [...invState.dates].filter(r => !r._deleted).sort((a,b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map(rec => {
    const { pmr }  = invCalc(rec);
    const base     = invBaseCurrency();
    const active   = rec.id === invCurId ? 'is-active' : '';
    const d        = new Date(rec.date);
    const label    = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    return `<div class="sidebar-nav-item ${active}" onclick="invSelect('${rec.id}')">
      <div class="sidebar-nav-dot"></div>
      <div>
        <div>${label}</div>
        <div class="sidebar-nav-item-meta">${invFmtShort(pmr)} ${base}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Select date ───────────────────────────────────
function invSelect(id) {
  invCurId = id;
  document.getElementById('inv-dash-nav').classList.remove('is-active');
  invRenderSidebar();
  invRenderCurrent();
  closeSidebar();
}

function invRenderCurrent() {
  if (!invCurId) return;
  const rec    = invState.dates.find(r => r.id === invCurId && !r._deleted); if (!rec) return;
  const { pmr, total } = invCalc(rec);
  const base   = invBaseCurrency();
  const sorted = [...invState.dates].filter(r => !r._deleted).sort((a,b) => a.date.localeCompare(b.date));
  const idx    = sorted.findIndex(r => r.id === invCurId);
  let diff=null, diffCls='is-neu';
  if (idx > 0) { diff = pmr - invCalc(sorted[idx-1]).pmr; diffCls = diff>=0?'is-pos':'is-neg'; }

  const d = new Date(rec.date);
  const dateLabel = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });

  let html = `
  <div class="rec-topbar">
    <div>
      <div class="rec-topbar-date">${dateLabel}</div>
      <div class="rec-topbar-note" onclick="invEditNote('${rec.id}')" title="Нажми чтобы изменить">
        ${rec.note ? '📝 ' + rec.note : '<span style="color:var(--line2)">+ добавить заметку</span>'}
      </div>
    </div>
    <button class="btn btn-danger btn-sm" onclick="invDelete('${rec.id}')">Удалить</button>
  </div>
  <div class="inv-totals-bar">
    <div class="inv-total-cell"><div class="inv-total-label">Итог ${base} (PMR-блоки)</div><div class="inv-total-value is-neu">${invFmt(pmr)}</div></div>
    <div class="inv-total-cell"><div class="inv-total-label">Итог всё (в ${base})</div><div class="inv-total-value is-neu">${invFmt(total)}</div></div>
    <div class="inv-total-cell"><div class="inv-total-label">Изменение ${base}</div><div class="inv-total-value ${diffCls}">${diff!==null ? (diff>=0?'+':'')+invFmt(diff) : '—'}</div></div>
  </div>
  <div class="inv-grid">`;

  for (const sec of invSections()) {
    const rate = invConvertRate(sec.currency, base, 'buy') || 1;
    const curLabel = sec.currency !== base ? ` (${sec.currency})` : '';
    html += `<div class="inv-section">
      <div class="inv-section-header">
        <div class="inv-section-name">${sec.name}</div>
        <div class="inv-section-total" id="invST_${sec.id}"></div>
      </div>`;

    if (sec.ekosh) {
      const val = rec.secs[sec.id]?.val || 0;
      html += `<div class="ekosh-row">
        <span class="ekosh-label">Баланс${curLabel}</span>
        <input class="ekosh-input" type="number" step="0.01" value="${val}"
          oninput="invSetEkosh('${rec.id}','${sec.id}',this.value)"
          onchange="invSetEkosh('${rec.id}','${sec.id}',this.value)">
      </div>`;
    } else {
      for (const nom of sec.noms) {
        const qty    = rec.secs[sec.id]?.[nom] || 0;
        const rubVal = nom * qty * rate;
        const hasVal = qty > 0;
        html += `<div class="nom-row${hasVal?' has-value':''}" id="invNR_${sec.id}_${nom}">
          <span class="nom-label">${nom}</span>
          <div class="nom-qty-wrap">
            <button class="qty-btn" onclick="invAdj('${rec.id}','${sec.id}',${nom},-1)">−</button>
            <input class="qty-input" type="number" min="0" value="${qty}"
              oninput="invSetQty('${rec.id}','${sec.id}',${nom},this.value)"
              onchange="invSetQty('${rec.id}','${sec.id}',${nom},this.value)">
            <button class="qty-btn" onclick="invAdj('${rec.id}','${sec.id}',${nom},+1)">+</button>
          </div>
          <span class="nom-amount" id="invNA_${sec.id}_${nom}">${hasVal?invFmtShort(rubVal):''}</span>
        </div>`;
      }
    }
    html += `</div>`;
  }
  html += `</div>`;
  document.getElementById('inv-main-area').innerHTML = html;
  invUpdateSecTotals(rec);
}

// ── Update helpers ────────────────────────────────
function invUpdateSecTotals(rec) {
  const base = invBaseCurrency();
  for (const sec of invSections()) {
    const el = document.getElementById(`invST_${sec.id}`);
    if (!el) continue;
    if (sec.ekosh) {
      const val = rec.secs[sec.id]?.val || 0;
      const baseVal = sec.currency === base ? val : val * (invConvertRate(sec.currency, base, 'buy') || 1);
      el.innerHTML = val > 0 ? `<span>${invFmtShort(baseVal)} ${base}</span>` : '';
    } else {
      const totalQty = sec.noms.reduce((a,n) => a + (rec.secs[sec.id]?.[n]||0)*n, 0);
      if (totalQty > 0) {
        const baseVal = totalQty * (invConvertRate(sec.currency, base, 'buy') || 1);
        const baseStr = invFmtShort(baseVal) + ' ' + base;
        const curStr  = sec.currency !== base ? `${invFmtShort(totalQty)} ${sec.currency}` : '';
        el.innerHTML = curStr
          ? `<span title="По курсу покупки банка">${curStr} ≈ ${baseStr}</span>`
          : `<span>${baseStr}</span>`;
      } else {
        el.innerHTML = '';
      }
    }
  }
}

function invUpdateTotalsBar(rec) {
  const { pmr, total } = invCalc(rec);
  const sorted = [...invState.dates].filter(r => !r._deleted).sort((a,b) => a.date.localeCompare(b.date));
  const idx    = sorted.findIndex(r => r.id === invCurId);
  let diff=null, cls='is-neu';
  if (idx > 0) { diff = pmr - invCalc(sorted[idx-1]).pmr; cls = diff>=0?'is-pos':'is-neg'; }
  const cells = document.querySelectorAll('#inv-main-area .inv-total-value');
  if (cells[0]) cells[0].textContent = invFmt(pmr);
  if (cells[1]) cells[1].textContent = invFmt(total);
  if (cells[2]) { cells[2].textContent = diff!==null ? (diff>=0?'+':'')+invFmt(diff) : '—'; cells[2].className = `inv-total-value ${cls}`; }
}

function invUpdateNomRow(rec, secId, nom) {
  const sec  = invSections().find(s => s.id === secId);
  if (!sec) return;
  const base = invBaseCurrency();
  const rate = invConvertRate(sec.currency, base, 'buy') || 1;
  const qty  = rec.secs[secId]?.[nom] || 0;
  const row  = document.getElementById(`invNR_${secId}_${nom}`);
  const amtEl = document.getElementById(`invNA_${secId}_${nom}`);
  if (row) {
    row.className = 'nom-row' + (qty > 0 ? ' has-value' : '');
    const inp = row.querySelector('.qty-input');
    if (inp && document.activeElement !== inp) inp.value = qty;
  }
  if (amtEl) amtEl.textContent = qty > 0 ? invFmtShort(nom*qty*rate) : '';
}

function invAdj(recId, secId, nom, delta) {
  const rec = invState.dates.find(r => r.id === recId); if (!rec) return;
  rec.secs[secId][nom] = Math.max(0, (rec.secs[secId][nom]||0) + delta);
  rec._editedAt = new Date().toISOString();
  invSaveState(); invUpdateNomRow(rec,secId,nom); invUpdateTotalsBar(rec); invUpdateSecTotals(rec); invRenderSidebar();
  if (driveToken) driveDebouncedPush('inv');
}
function invSetQty(recId, secId, nom, val) {
  const rec = invState.dates.find(r => r.id === recId); if (!rec) return;
  rec.secs[secId][nom] = Math.max(0, parseInt(val)||0);
  rec._editedAt = new Date().toISOString();
  invSaveState(); invUpdateNomRow(rec,secId,nom); invUpdateTotalsBar(rec); invUpdateSecTotals(rec); invRenderSidebar();
  if (driveToken) driveDebouncedPush('inv');
}
function invSetEkosh(recId, secId, val) {
  const rec = invState.dates.find(r => r.id === recId); if (!rec) return;
  rec.secs[secId].val = parseFloat(val)||0;
  rec._editedAt = new Date().toISOString();
  invSaveState(); invUpdateTotalsBar(rec); invUpdateSecTotals(rec); invRenderSidebar();
  if (driveToken) driveDebouncedPush('inv');
}

// ── Note edit ─────────────────────────────────────
function invEditNote(recId) {
  const rec   = invState.dates.find(r => r.id === recId); if (!rec) return;
  const noteEl = document.querySelector('#inv-main-area .rec-topbar-note');
  noteEl.innerHTML = `<input class="note-edit-input" value="${rec.note||''}" placeholder="заметка..."
    onblur="invSaveNote('${recId}',this.value)"
    onkeydown="if(event.key==='Enter')this.blur()">`;
  noteEl.querySelector('input').focus();
}
function invSaveNote(recId, val) {
  const rec = invState.dates.find(r => r.id === recId); if (!rec) return;
  rec.note = val.trim(); rec._editedAt = new Date().toISOString(); invSaveState(); invRenderCurrent();
}

// ── Delete ────────────────────────────────────────
function invDelete(recId) {
  appConfirm('Удалить эту инвентаризацию?').then(ok => {
    if (!ok) return;
    // Soft delete to propagate via merge
    const rec = invState.dates.find(r => r.id === recId);
    if (rec) { rec._deleted = true; rec._deletedAt = new Date().toISOString(); rec._editedAt = rec._deletedAt; }
    invSaveState(); invCurId = null; invRenderSidebar();
    document.getElementById('inv-main-area').innerHTML = `<div class="empty-state"><div class="empty-state-glyph">—</div><div class="empty-state-text">Выбери дату или создай новую</div></div>`;
    if (driveToken) driveDebouncedPush('inv');
  });
}

// ── Modal ─────────────────────────────────────────
function invOpenNewModal() {
  document.getElementById('inv-new-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('inv-new-note').value = '';
  document.getElementById('inv-modal').classList.add('is-open');
}
function invCloseModal() { document.getElementById('inv-modal').classList.remove('is-open'); }
function invCreate() {
  const dateStr = document.getElementById('inv-new-date').value;
  if (!dateStr) { showErr('Выбери дату'); return; }
  if (invState.dates.find(r => r.id === dateStr && !r._deleted)) { showErr('Такая дата уже есть'); return; }
  const note   = document.getElementById('inv-new-note').value.trim();
  const sorted = [...invState.dates].filter(r => !r._deleted).sort((a,b) => b.date.localeCompare(a.date));
  let rec;
  if (sorted.length > 0) {
    rec = JSON.parse(JSON.stringify(sorted[0]));
    rec.id = dateStr; rec.date = dateStr; rec.note = note;
    // ensure all current sections exist in the copied record
    for (const sec of invSections()) {
      if (!rec.secs[sec.id]) {
        rec.secs[sec.id] = sec.ekosh ? { val:0 } : Object.fromEntries(sec.noms.map(n => [n, 0]));
      }
    }
  } else {
    rec = invEmpty(dateStr, note);
  }
  invState.dates.push({ ...rec, _editedAt: new Date().toISOString() }); invSaveState();
  invCloseModal(); invCurId = dateStr; invRenderSidebar(); invRenderCurrent();
}

// ── Export / Import ───────────────────────────────
function invExport() {
  const blob = new Blob([JSON.stringify(invState, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finance_inv_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}
function invImport(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const imp = JSON.parse(e.target.result);
      if (!imp.dates || !Array.isArray(imp.dates)) throw new Error('bad format');
      // confirm removed - sandbox incompatible
      // migrate: if no sections/currencies, add defaults
      if (!imp.sections)     imp.sections     = INV_DEFAULT_SECTIONS;
      if (!imp.currencyList) imp.currencyList = INV_DEFAULT_CURRENCIES;
      if (!imp.pairs)        imp.pairs        = [...INV_DEFAULT_PAIRS];
      if (!imp.baseCurrency) imp.baseCurrency = INV_DEFAULT_BASE;
      if (!imp.goals)        imp.goals        = [];
      delete imp.currencies; delete imp.rates;
      invState = imp; invSaveState(); invLoadRates(); invCurId = null;
      invRenderSidebar();
      invShowDashboard();
    } catch(err) { showErr('Ошибка чтения: ' + err.message); }
  };
  r.readAsText(file);
  input.value = '';
}

// ── Dashboard ─────────────────────────────────────
function invShowDashboard() {
  invCurId = null;
  document.querySelectorAll('#app-inv .sidebar-nav-item').forEach(el => el.classList.remove('is-active'));
  document.getElementById('inv-dash-nav').classList.add('is-active');

  const sorted = [...invState.dates].filter(r => !r._deleted).sort((a,b) => a.date.localeCompare(b.date));
  if (!sorted.length) {
    document.getElementById('inv-main-area').innerHTML = `<div class="empty-state"><div class="empty-state-glyph">—</div><div class="empty-state-text">Нет данных. Создай первую инвентаризацию.</div></div>`;
    return;
  }

  const base = invBaseCurrency();

  invDashRows = sorted.map((rec, i) => {
    const { pmr, total } = invCalc(rec);
    const prev  = i > 0 ? invCalc(sorted[i-1]).pmr : null;
    const diff  = prev !== null ? pmr - prev : null;
    // dynamic per-currency totals for non-base, non-ekosh sections
    const currencyTotals = {};
    for (const sec of invSections()) {
      if (sec.currency === base || sec.ekosh) continue;
      const raw = sec.noms.reduce((a,n) => a + (rec.secs[sec.id]?.[n]||0)*n, 0);
      if (!currencyTotals[sec.currency]) currencyTotals[sec.currency] = 0;
      currencyTotals[sec.currency] += raw;
    }
    return { rec, pmr, total, diff, currencyTotals };
  });

  const latest = invDashRows[invDashRows.length - 1];
  function fmtD(d) { return new Date(d).toLocaleDateString('ru-RU', { day:'numeric', month:'short' }); }

  // Build stat cards: base total + one per non-base currency + total wide
  const nonBaseCurs = invCurrencyList().filter(c => c.code !== base && (latest.currencyTotals[c.code] || 0) > 0);
  const curCards = nonBaseCurs.map(c => {
    const amt = latest.currencyTotals[c.code] || 0;
    const baseAmt = amt * (invConvertRate(c.code, base, 'buy') || 1);
    return `<div class="stat-card"><div class="stat-card-label">${c.name}</div><div class="stat-card-value ${amt>0?'is-pos':'is-neu'}">${amt.toLocaleString('ru-RU')} ${c.code}</div><div class="stat-card-sub">≈ ${invFmt(baseAmt)} ${base}</div></div>`;
  }).join('');

  const cards = `
    <div class="stat-card"><div class="stat-card-label">Текущий ${base}</div><div class="stat-card-value is-neu">${invFmt(latest.pmr)}</div><div class="stat-card-sub">${fmtD(latest.rec.date)}</div></div>
    ${curCards}
    <div class="stat-card stat-card-wide"><div class="stat-card-label">Общий итог (в ${base})</div><div class="stat-card-value is-neu" style="font-size:22px">${invFmt(latest.total)}</div><div class="stat-card-sub">${fmtD(latest.rec.date)}</div></div>`;

  const allLabels = invDashRows.map(r => fmtD(r.rec.date));
  const allPmr    = invDashRows.map(r => +r.pmr.toFixed(2));
  const allTotal  = invDashRows.map(r => +r.total.toFixed(2));
  const allDiff   = invDashRows.map(r => r.diff !== null ? +r.diff.toFixed(2) : null);

  const tableRows = [...invDashRows].reverse().map(r => {
    const d   = new Date(r.rec.date).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    let pHtml = '<span class="pill pill-neu">—</span>';
    if (r.diff !== null) pHtml = `<span class="pill ${r.diff>=0?'pill-pos':'pill-neg'}">${r.diff>=0?'+':''}${invFmt(r.diff)}</span>`;
    return `<tr onclick="invSelect('${r.rec.id}')">
      <td>${d}</td>
      <td style="font-family:var(--head);font-size:12px">${invFmt(r.pmr)}</td>
      <td style="color:var(--muted)">${invFmt(r.total)}</td>
      <td>${pHtml}</td>
      <td style="color:var(--muted);font-size:10px">${r.rec.note||''}</td>
    </tr>`;
  }).join('');

  document.getElementById('inv-main-area').innerHTML = `
  <div class="dash-wrap">
    <div class="dash-title">Главная</div>
    <div class="dash-sub">Актуально на ${fmtD(latest.rec.date)}</div>

    ${invRenderGoalsDash()}

    <div class="stat-grid stat-grid-4" style="margin-bottom:20px">${cards}</div>

    <div class="chart-block">
      <div class="chart-block-header">
        <div class="chart-block-title">ПМР и общий итог</div>
        <div class="chart-range-group" id="chart-range-main">
          <button class="chart-range-btn is-active" data-range="all" onclick="invSetRange(this,'main')">Все</button>
          <button class="chart-range-btn" data-range="12" onclick="invSetRange(this,'main')">12</button>
          <button class="chart-range-btn" data-range="6" onclick="invSetRange(this,'main')">6</button>
          <button class="chart-range-btn" data-range="3" onclick="invSetRange(this,'main')">3</button>
          <button class="chart-range-btn" data-range="pick" onclick="invOpenDatePicker(this,'main')" title="Выбрать точки на графике">⚙</button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="invChartA"></canvas></div>
    </div>

    <div class="chart-block">
      <div class="chart-block-header">
        <div class="chart-block-title">Изменение ПМР</div>
        <div class="chart-range-group" id="chart-range-diff">
          <button class="chart-range-btn is-active" data-range="all" onclick="invSetRange(this,'diff')">Все</button>
          <button class="chart-range-btn" data-range="12" onclick="invSetRange(this,'diff')">12</button>
          <button class="chart-range-btn" data-range="6" onclick="invSetRange(this,'diff')">6</button>
          <button class="chart-range-btn" data-range="3" onclick="invSetRange(this,'diff')">3</button>
          <button class="chart-range-btn" data-range="pick" onclick="invOpenDatePicker(this,'diff')" title="Выбрать точки на графике">⚙</button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="invChartB"></canvas></div>
    </div>

    <div class="tbl-wrap">
      <table class="history-table">
        <thead><tr><th>Дата</th><th>Итог ПМР</th><th>Итог всё</th><th>Изменение</th><th>Заметка</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>`;

  if (invChartA) { invChartA.destroy(); invChartA = null; }
  if (invChartB) { invChartB.destroy(); invChartB = null; }

  const cAcc   = cssVar('--acc');
  const cGreen = cssVar('--green');
  const cRed   = cssVar('--red');

  invChartA = new Chart(document.getElementById('invChartA'), {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        { label:'ПМР',  data:allPmr,   borderColor:cAcc,   backgroundColor:cAcc+'1a',   tension:0.3, fill:true,  pointBackgroundColor:cAcc,   pointRadius:5, pointHoverRadius:8 },
        { label:'Всё',  data:allTotal, borderColor:cGreen, backgroundColor:cGreen+'0d', tension:0.3, fill:false, borderDash:[4,3], pointBackgroundColor:cGreen, pointRadius:3 }
      ]
    },
    options: { ...getChartDefaults(),
      onClick(evt, els) { if (!els.length) return; const r = (invChartA._rows||invDashRows)[els[0].index]; if(r) invSelect(r.rec.id); },
      onHover(evt, els) { evt.native.target.style.cursor = els.length?'pointer':'default'; }
    }
  });
  invChartA._rows = invDashRows;

  const diffColors = allDiff.map(v => v===null ? 'transparent' : v>=0 ? cGreen+'a6' : cRed+'a6');
  invChartB = new Chart(document.getElementById('invChartB'), {
    type: 'bar',
    data: { labels:allLabels, datasets:[{ label:'Изменение', data:allDiff.map(v=>v??0), backgroundColor:diffColors, borderColor:diffColors, borderWidth:1, borderRadius:3 }] },
    options: { ...getChartDefaults(),
      plugins: { ...getChartDefaults().plugins, legend:{ display:false } },
      onClick(evt, els) { if (!els.length) return; const r = (invChartB._rows||invDashRows)[els[0].index]; if(r) invSelect(r.rec.id); },
      onHover(evt, els) { evt.native.target.style.cursor = els.length?'pointer':'default'; }
    }
  });
  invChartB._rows = invDashRows;

  // Restore saved filter state
  _invRestoreChartState();
}

function _invRestoreChartState() {
  for (const chart of ['main', 'diff']) {
    const range  = _invChartPicked[chart + 'Range'] || 'all';
    const picked = _invChartPicked[chart];
    const rangeGroup = document.getElementById('chart-range-' + chart);

    // Restore active button highlight
    if (rangeGroup) {
      rangeGroup.querySelectorAll('.chart-range-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.range === range);
      });
    }

    // Apply filter
    if (range === 'pick' && picked && picked.length) {
      const pickSet = new Set(picked);
      _invApplyChartFilter(chart, invDashRows.filter(r => pickSet.has(r.rec.id)));
    } else if (range !== 'all' && range !== 'pick') {
      const n = parseInt(range);
      const cutoff = new Date(Date.now() - n*30*24*3600*1000).toISOString().slice(0,10);
      _invApplyChartFilter(chart, invDashRows.filter(r => r.rec.date >= cutoff));
    }
    // 'all' = no filter needed, charts already show all data
  }
}

// Stores picked date IDs per chart
const INV_CHART_STATE_KEY = 'finInvChartState';

function _invChartStateSave() {
  try {
    localStorage.setItem(INV_CHART_STATE_KEY, JSON.stringify({
      main: _invChartPicked.main,
      diff: _invChartPicked.diff,
      mainRange: _invChartPicked.mainRange || 'all',
      diffRange: _invChartPicked.diffRange || 'all',
    }));
  } catch(e) {}
}

function _invChartStateLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(INV_CHART_STATE_KEY) || 'null');
    if (s) {
      _invChartPicked.main      = s.main      || null;
      _invChartPicked.diff      = s.diff      || null;
      _invChartPicked.mainRange = s.mainRange || 'all';
      _invChartPicked.diffRange = s.diffRange || 'all';
    }
  } catch(e) {}
}

const _invChartPicked = { main: null, diff: null, mainRange: 'all', diffRange: 'all' };
_invChartStateLoad();

function invSetRange(btn, chart) {
  btn.parentElement.querySelectorAll('.chart-range-btn').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  _invChartPicked[chart] = null;
  _invChartPicked[chart + 'Range'] = btn.dataset.range;
  _invChartStateSave();
  const n = btn.dataset.range === 'all' ? null : parseInt(btn.dataset.range);
  const cutoff = n ? new Date(Date.now() - n*30*24*3600*1000).toISOString().slice(0,10) : null;
  const filtered = cutoff ? invDashRows.filter(r => r.rec.date >= cutoff) : invDashRows;
  _invApplyChartFilter(chart, filtered);
}

function invOpenDatePicker(btn, chart) {
  btn.parentElement.querySelectorAll('.chart-range-btn').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  document.getElementById('inv-date-picker-popup')?.remove();
  const pickedSet = new Set(_invChartPicked[chart] || invDashRows.map(r => r.rec.id));
  const popup = document.createElement('div');
  popup.id = 'inv-date-picker-popup';
  popup.style.cssText = 'position:fixed;z-index:800;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--radius);padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);max-height:320px;overflow-y:auto;min-width:230px;font-size:11px;';
  const rect = btn.getBoundingClientRect();
  popup.style.top   = Math.min(rect.bottom + 6, window.innerHeight - 340) + 'px';
  popup.style.right = (window.innerWidth - rect.right) + 'px';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;';
  hdr.innerHTML = '<span>Точки на графике</span>';
  const btns = document.createElement('span');
  btns.style.cssText = 'display:flex;gap:8px;';
  const allBtn = document.createElement('span');
  allBtn.textContent = 'Все'; allBtn.style.cssText = 'cursor:pointer;color:var(--acc2);';
  allBtn.onclick = () => invPickAll(chart, true);
  const noneBtn = document.createElement('span');
  noneBtn.textContent = 'Снять'; noneBtn.style.cssText = 'cursor:pointer;color:var(--muted);';
  noneBtn.onclick = () => invPickAll(chart, false);
  btns.append(allBtn, noneBtn);
  hdr.appendChild(btns);
  popup.appendChild(hdr);

  // Rows
  const rows = [...invDashRows].reverse();
  rows.forEach(r => {
    const d = new Date(r.rec.date).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'2-digit'});
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--line);';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = r.rec.id; cb.checked = pickedSet.has(r.rec.id);
    cb.style.cssText = 'accent-color:var(--acc);width:14px;height:14px;flex-shrink:0;';
    cb.addEventListener('change', () => invPickChange(chart));
    const dateSpan = document.createElement('span');
    dateSpan.style.flex = '1'; dateSpan.textContent = d;
    const valSpan = document.createElement('span');
    valSpan.style.cssText = 'color:var(--muted);font-size:10px;';
    valSpan.textContent = r.pmr ? r.pmr.toLocaleString('ru-RU',{maximumFractionDigits:0}) : '';
    label.append(cb, dateSpan, valSpan);
    popup.appendChild(label);
  });

  // Close button
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:10px;';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-primary btn-sm'; closeBtn.style.width = '100%';
  closeBtn.textContent = 'Закрыть';
  closeBtn.onclick = () => popup.remove();
  footer.appendChild(closeBtn);
  popup.appendChild(footer);

  document.body.appendChild(popup);
  setTimeout(() => {
    document.addEventListener('click', function onOut(e) {
      if (!popup.contains(e.target) && e.target !== btn) { popup.remove(); document.removeEventListener('click', onOut); }
    });
  }, 80);
}

function invPickAll(chart, val) {
  document.querySelectorAll('#inv-date-picker-popup input[type=checkbox]').forEach(cb => { cb.checked = val; });
  const checked = val ? invDashRows.map(r => r.rec.id) : [];
  _invChartPicked[chart] = checked.length ? checked : null;
  _invChartPicked[chart + 'Range'] = 'pick';
  _invChartStateSave();
  if (checked.length) _invApplyChartFilter(chart, val ? invDashRows : []);
}

function invPickChange(chart) {
  const checked = [...document.querySelectorAll('#inv-date-picker-popup input[type=checkbox]:checked')].map(c => c.value);
  _invChartPicked[chart] = checked.length ? checked : null;
  _invChartPicked[chart + 'Range'] = 'pick';
  _invChartStateSave();
  const picked = new Set(checked);
  _invApplyChartFilter(chart, invDashRows.filter(r => picked.has(r.rec.id)));
}

function _invApplyChartFilter(chart, filtered) {
  function fmtD(d) { return new Date(d).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}); }
  const labels = filtered.map(r => fmtD(r.rec.date));
  const cGreen = cssVar('--green'), cRed = cssVar('--red');
  if (chart === 'main' && invChartA) {
    invChartA.data.labels = labels;
    invChartA.data.datasets[0].data = filtered.map(r => +r.pmr.toFixed(2));
    invChartA.data.datasets[1].data = filtered.map(r => +r.total.toFixed(2));
    invChartA._rows = filtered; invChartA.update();
  }
  if (chart === 'diff' && invChartB) {
    const diffs  = filtered.map(r => r.diff !== null ? +r.diff.toFixed(2) : 0);
    const colors = filtered.map(r => r.diff===null?'transparent':r.diff>=0?cGreen+'a6':cRed+'a6');
    invChartB.data.labels = labels;
    invChartB.data.datasets[0].data = diffs;
    invChartB.data.datasets[0].backgroundColor = colors;
    invChartB.data.datasets[0].borderColor = colors;
    invChartB._rows = filtered; invChartB.update();
  }
}


/* ══════════════════════════════════════════════════
   INV: CONFIG — БЛОКИ И ВАЛЮТЫ
══════════════════════════════════════════════════ */

// ── Config modal ─────────────────────────────────
function invOpenConfig() {
  invRenderConfigBlocks();
  invRenderConfigCurrencies();
  document.getElementById('inv-config-modal').classList.add('is-open');
}
function invCloseConfig() {
  document.getElementById('inv-config-modal').classList.remove('is-open');
  invRenderRates();
  if (invCurId) invRenderCurrent(); else invShowDashboard();
}

function invRenderConfigCurrencies() {
  const el = document.getElementById('cfg-currencies');
  const base = invBaseCurrency();
  el.innerHTML = `
    <div style="font-size:9px;color:var(--muted);margin-bottom:8px;">Базовая валюта: <b style="color:var(--acc2)">${base}</b> — управляется через кнопку <b>₽ Курсы</b></div>
    ` + invCurrencyList().map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:5px;">
      <span style="font-family:var(--head);font-size:9px;font-weight:700;color:${c.code===base?'var(--amber)':'var(--acc2)'};width:40px;">${c.code}</span>
      <span style="flex:1;font-size:11px;color:var(--muted)">${c.name}</span>
      ${c.code === base ? '<span class="tag tag-cash" style="font-size:8px;">BASE</span>' : ''}
      <button class="btn btn-sm" onclick="invOpenCurrencyModal('${c.code}')">✎</button>
    </div>`).join('');
}

function invRenderConfigBlocks() {
  const el = document.getElementById('cfg-blocks');
  el.innerHTML = invSections().map((sec, i) => `
    <div class="cfg-block-row" data-id="${sec.id}" draggable="true"
         style="display:flex;align-items:center;gap:8px;padding:7px 10px;
                background:var(--bg3);border:1px solid var(--line);
                border-radius:var(--radius-sm);margin-bottom:5px;
                cursor:default;user-select:none;transition:opacity .15s,background .15s;">
      <span class="cfg-drag-handle"
            style="cursor:grab;color:var(--muted2);font-size:14px;padding:0 2px;flex-shrink:0;
                   touch-action:none;"
            title="Перетащи для изменения порядка">⠿</span>
      <span style="font-size:9px;color:var(--muted2);width:16px;text-align:right;flex-shrink:0;">${i+1}</span>
      <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sec.name}</span>
      <span class="tag tag-neutral" style="flex-shrink:0;">${sec.ekosh ? 'эл.' : 'нал.'}</span>
      <span style="font-size:9px;color:var(--muted);width:32px;flex-shrink:0;">${sec.currency}</span>
      ${sec.pmr
        ? '<span class="tag tag-income" style="font-size:8px;flex-shrink:0;">ПМР</span>'
        : '<span style="width:32px;flex-shrink:0;"></span>'}
      <button class="btn btn-sm" style="flex-shrink:0;" onclick="invOpenBlockModal('${sec.id}')">✎</button>
    </div>`).join('');

  invInitBlockDnD(el);
}

// ── Drag-and-drop для блоков (desktop + touch) ────
let _dnd = { dragId: null, touchY: 0, touchEl: null, placeholder: null };

function invInitBlockDnD(container) {
  // Desktop HTML5 DnD
  container.querySelectorAll('.cfg-block-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      _dnd.dragId = row.dataset.id;
      row.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      container.querySelectorAll('.cfg-block-row').forEach(r => r.style.outline = '');
      _dnd.placeholder && _dnd.placeholder.remove();
      _dnd.placeholder = null;
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (row.dataset.id === _dnd.dragId) return;
      // Show drop indicator
      container.querySelectorAll('.cfg-block-row').forEach(r => r.style.outline = '');
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      row.style.outline = after
        ? '2px solid transparent'
        : '2px solid transparent';
      row.style.borderTop    = after ? '' : '2px solid var(--acc)';
      row.style.borderBottom = after ? '2px solid var(--acc)' : '';
    });
    row.addEventListener('dragleave', () => {
      row.style.borderTop = '';
      row.style.borderBottom = '';
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.style.borderTop = '';
      row.style.borderBottom = '';
      if (!_dnd.dragId || row.dataset.id === _dnd.dragId) return;
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      _invReorder(_dnd.dragId, row.dataset.id, after);
    });
  });

  // Touch DnD
  container.querySelectorAll('.cfg-drag-handle').forEach(handle => {
    const row = handle.closest('.cfg-block-row');
    handle.addEventListener('touchstart', e => {
      _dnd.dragId  = row.dataset.id;
      _dnd.touchEl = row;
      _dnd.touchY  = e.touches[0].clientY;
      row.style.opacity = '0.5';
      row.style.boxShadow = '0 4px 20px ' + cssVar('--acc');
      e.preventDefault();
    }, { passive: false });

    handle.addEventListener('touchmove', e => {
      if (!_dnd.dragId) return;
      e.preventDefault();
      const cy = e.touches[0].clientY;
      // Find which row we're over
      const rows = [...container.querySelectorAll('.cfg-block-row')];
      container.querySelectorAll('.cfg-block-row').forEach(r => {
        r.style.borderTop = ''; r.style.borderBottom = '';
      });
      for (const r of rows) {
        if (r.dataset.id === _dnd.dragId) continue;
        const rect = r.getBoundingClientRect();
        if (cy >= rect.top && cy <= rect.bottom) {
          const after = cy > rect.top + rect.height / 2;
          r.style.borderTop    = after ? '' : '2px solid var(--acc)';
          r.style.borderBottom = after ? '2px solid var(--acc)' : '';
          _dnd._touchTarget = { id: r.dataset.id, after };
          break;
        }
      }
    }, { passive: false });

    handle.addEventListener('touchend', () => {
      if (!_dnd.dragId) return;
      _dnd.touchEl && (_dnd.touchEl.style.opacity = '');
      _dnd.touchEl && (_dnd.touchEl.style.boxShadow = '');
      container.querySelectorAll('.cfg-block-row').forEach(r => {
        r.style.borderTop = ''; r.style.borderBottom = '';
      });
      if (_dnd._touchTarget) {
        _invReorder(_dnd.dragId, _dnd._touchTarget.id, _dnd._touchTarget.after);
      }
      _dnd = { dragId: null, touchY: 0, touchEl: null, placeholder: null, _touchTarget: null };
    });
  });
}

function _invReorder(fromId, toId, after) {
  const secs = invState.sections;
  const fromIdx = secs.findIndex(s => s.id === fromId);
  const toIdx   = secs.findIndex(s => s.id === toId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = secs.splice(fromIdx, 1);
  const newIdx  = secs.findIndex(s => s.id === toId);
  secs.splice(after ? newIdx + 1 : newIdx, 0, moved);
  invSaveState();
  invRenderConfigBlocks();
  if (driveToken) driveDebouncedPush('inv');
}

// ── Currency modal ────────────────────────────────
function invOpenCurrencyModal(code) {
  const isEdit = !!code;
  document.getElementById('inv-currency-modal-title').textContent = isEdit ? 'Редактировать валюту' : 'Новая валюта';
  document.getElementById('cur-del-btn').style.display = isEdit && code !== invBaseCurrency() ? '' : 'none';
  document.getElementById('cur-edit-code').value = code || '';
  if (isEdit) {
    const cur = invCurrencyList().find(c => c.code === code);
    document.getElementById('cur-code').value = cur ? cur.code : code;
    document.getElementById('cur-code').disabled = true;
    document.getElementById('cur-name').value = cur ? cur.name : '';
  } else {
    document.getElementById('cur-code').value = '';
    document.getElementById('cur-code').disabled = false;
    document.getElementById('cur-name').value = '';
  }
  document.getElementById('inv-currency-modal').classList.add('is-open');
}
function invCloseCurrencyModal() {
  document.getElementById('cur-code').disabled = false;
  document.getElementById('inv-currency-modal').classList.remove('is-open');
}
function invSaveCurrency() {
  const editCode = document.getElementById('cur-edit-code').value;
  const code = document.getElementById('cur-code').value.trim().toUpperCase();
  const name = document.getElementById('cur-name').value.trim();
  if (!code || !name) { showInlineErr('cur-name', 'Заполни код и название'); return; }
  if (!invState.currencyList) invState.currencyList = [];
  if (!editCode && invState.currencyList.find(c => c.code === code)) { showInlineErr('cur-code', `Валюта ${code} уже существует`); return; }
  if (editCode) {
    const cur = invState.currencyList.find(c => c.code === editCode);
    if (cur) { cur.name = name; }
  } else {
    invState.currencyList.push({ code, name });
  }
  invSaveState();
  invCloseCurrencyModal();
  invRenderConfigCurrencies();
}
function invDeleteCurrency() {
  const code = document.getElementById('cur-edit-code').value;
  if (code === invBaseCurrency()) return;
  const usedBy = invSections().filter(s => s.currency === code);
  if (usedBy.length) { showErr(`Валюта ${code} используется блоком "${usedBy[0].name}". Сначала измени блок.`); return; }
  appConfirm(`Удалить валюту ${code}? Также удалятся все пары с ней.`).then(ok => {
    if (!ok) return;
    invState.currencyList = invState.currencyList.filter(c => c.code !== code);
    invState.pairs = invState.pairs.filter(p => p.from !== code && p.to !== code);
    invSaveState();
    invCloseCurrencyModal();
    invRenderConfigCurrencies();
  });
}

// ── Block modal ───────────────────────────────────
function invOpenBlockModal(secId) {
  const isEdit = !!secId;
  document.getElementById('inv-block-modal-title').textContent = isEdit ? 'Редактировать блок' : 'Новый блок';
  document.getElementById('blk-del-btn').style.display = isEdit ? '' : 'none';
  document.getElementById('blk-edit-id').value = secId || '';

  // Fill currency select
  const curSel = document.getElementById('blk-currency');
  curSel.innerHTML = invCurrencyList().map(c => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');

  if (isEdit) {
    const sec = invSections().find(s => s.id === secId);
    document.getElementById('blk-name').value = sec.name;
    document.getElementById('blk-type').value = sec.ekosh ? 'electronic' : 'cash';
    document.getElementById('blk-currency').value = sec.currency;
    document.getElementById('blk-pmr').value = sec.pmr ? '1' : '0';
    document.getElementById('blk-noms').value = sec.noms.join(', ');
  } else {
    document.getElementById('blk-name').value = '';
    document.getElementById('blk-type').value = 'cash';
    document.getElementById('blk-currency').value = invBaseCurrency();
    document.getElementById('blk-pmr').value = '1';
    document.getElementById('blk-noms').value = '500, 200, 100, 50, 25, 10, 5, 1';
  }
  invBlockTypeChange();
  document.getElementById('inv-block-modal').classList.add('is-open');
}
function invCloseBlockModal() { document.getElementById('inv-block-modal').classList.remove('is-open'); }

function invBlockTypeChange() {
  const t = document.getElementById('blk-type').value;
  document.getElementById('blk-noms-section').style.display = t === 'cash' ? '' : 'none';
}

function invSaveBlock() {
  const editId = document.getElementById('blk-edit-id').value;
  const name   = document.getElementById('blk-name').value.trim();
  const type   = document.getElementById('blk-type').value;
  const cur    = document.getElementById('blk-currency').value;
  const pmr    = document.getElementById('blk-pmr').value === '1';
  const nomsRaw = document.getElementById('blk-noms').value;
  const noms   = type === 'cash'
    ? nomsRaw.split(',').map(s => parseInt(s.trim())).filter(n => n > 0).sort((a,b) => b-a)
    : [];
  if (!name) { showInlineErr('blk-name', 'Введи название блока'); return; }
  if (type === 'cash' && noms.length === 0) { showInlineErr('blk-noms', 'Добавь хотя бы один номинал'); return; }

  if (editId) {
    const sec = invState.sections.find(s => s.id === editId);
    if (sec) {
      sec.name = name; sec.ekosh = type === 'electronic'; sec.currency = cur; sec.pmr = pmr; sec.noms = noms;
      // Update existing records to have new noms
      for (const rec of invState.dates) {
        if (!rec.secs[editId]) rec.secs[editId] = sec.ekosh ? { val:0 } : {};
        if (!sec.ekosh) {
          for (const n of noms) if (!(n in rec.secs[editId])) rec.secs[editId][n] = 0;
        }
      }
    }
  } else {
    // Generate unique id
    const id = 'sec_' + Date.now();
    const newSec = { id, name, currency: cur, pmr, ekosh: type === 'electronic', noms };
    invState.sections.push(newSec);
    // Add to all existing records
    for (const rec of invState.dates) {
      rec.secs[id] = newSec.ekosh ? { val:0 } : Object.fromEntries(noms.map(n => [n, 0]));
    }
  }
  invSaveState();
  invCloseBlockModal();
  invRenderConfigBlocks();
  if (driveToken) driveDebouncedPush('inv');
}

function invDeleteBlock() {
  const secId = document.getElementById('blk-edit-id').value;
  const sec = invSections().find(s => s.id === secId);
  if (!sec) return;
  appConfirm(`Удалить блок "${sec.name}"? Все данные этого блока во всех записях будут удалены.`).then(ok => {
    if (!ok) return;
    invState.sections = invState.sections.filter(s => s.id !== secId);
    for (const rec of invState.dates) { delete rec.secs[secId]; }
    invSaveState();
    invCloseBlockModal();
    invRenderConfigBlocks();
    if (driveToken) driveDebouncedPush('inv');
  });
}

/* ══════════════════════════════════════════════════
   КАТЕГОРИИ — renderP6, управление
══════════════════════════════════════════════════ */
let chart6Inst = null;

function opsResetP6() {
  document.getElementById('f6year').value  = '';
  document.getElementById('f6month').value = '';
  document.getElementById('f6type').value  = 'expense';
  document.getElementById('f6chart').value = 'doughnut';
  renderP6();
}

function renderP6() {
  fillYearSel('f6year'); fillMonthSel('f6month', 'f6year');
  const year      = document.getElementById('f6year').value;
  const month     = document.getElementById('f6month').value;
  const type      = document.getElementById('f6type').value;
  const chartType = document.getElementById('f6chart').value;

  let txns = opsState.txns.filter(t => !t._deleted);
  if (month)      txns = txns.filter(t => t.date.startsWith(month));
  else if (year)  txns = txns.filter(t => t.date.startsWith(year));
  if (type)       txns = txns.filter(t => t.type === type);

  // Keep f1cat in sync
  const f1cat = document.getElementById('f1cat');
  if (f1cat) {
    const cur = f1cat.value;
    f1cat.innerHTML = '<option value="">Все категории</option>' +
      '<option value="__none__"' + (cur==='__none__'?' selected':'') + '>— без категории</option>' +
      opsCats().map(c => `<option value="${c.id}" ${c.id===cur?'selected':''}>${opsCatDisplay(c)}</option>`).join('');
  }

  // Group by category
  const groups = {};
  for (const t of txns) {
    const cid = t.cat || '__none__';
    if (!groups[cid]) groups[cid] = { count: 0, sum: 0 };
    groups[cid].count++;
    groups[cid].sum += Math.abs(t.amount);
  }
  const total  = Object.values(groups).reduce((s, g) => s + g.sum, 0);
  const sorted = Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum);

  // Avg per month: how many distinct months are in the current filtered set
  const monthsInPeriod = Math.max(1, [...new Set(txns.map(t => t.date.slice(0, 7)))].length);

  // Previous period comparison — only when a specific month is selected
  let prevGroups = null;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const prevMonth = new Date(y, m - 2, 1).toISOString().slice(0, 7);
    let prevTxns = opsState.txns.filter(t => !t._deleted && t.date.startsWith(prevMonth));
    if (type) prevTxns = prevTxns.filter(t => t.type === type);
    prevGroups = {};
    for (const t of prevTxns) {
      const cid = t.cat || '__none__';
      prevGroups[cid] = (prevGroups[cid] || 0) + Math.abs(t.amount);
    }
  }
  const hasTrend = prevGroups !== null;

  // Limit context: expenses per category for the displayed month (or current calendar month)
  const limitMonthKey = month || new Date().toISOString().slice(0, 7);
  const limitExpenses = {};
  for (const t of opsState.txns.filter(t => !t._deleted && t.type === 'expense' && t.date.startsWith(limitMonthKey))) {
    const cid = t.cat || '__none__';
    limitExpenses[cid] = (limitExpenses[cid] || 0) + Math.abs(t.amount);
  }

  // Chart
  const labels = sorted.map(([id]) => id === '__none__' ? '— без категории' : (opsCat(id).icon + ' ' + opsCat(id).name));
  const data   = sorted.map(([, g]) => +g.sum.toFixed(2));
  const colors = sorted.map(([id]) => id === '__none__' ? '#6b7280' : opsCat(id).color);
  if (chart6Inst) { chart6Inst.destroy(); chart6Inst = null; }
  const cd = getChartDefaults();
  chart6Inst = new Chart(document.getElementById('chart-cat'), {
    type: chartType,
    data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 2 }] },
    options: { ...cd,
      plugins: { ...cd.plugins,
        legend: { display: false },
        tooltip: { ...cd.plugins.tooltip,
          callbacks: { label: ctx => ` ${fmtAmt(ctx.raw)} (${total > 0 ? (ctx.raw / total * 100).toFixed(1) : 0}%)` }
        }
      },
      ...(chartType === 'bar' ? {} : { cutout: chartType === 'doughnut' ? '60%' : undefined })
    }
  });

  // Legend — with optional trend badge
  document.getElementById('p6-legend').innerHTML = sorted.map(([id, g]) => {
    const cat = id === '__none__' ? { name: 'Без категории', color: '#6b7280', icon: '📦' } : opsCat(id);
    const pct = total > 0 ? (g.sum / total * 100).toFixed(1) : '0';
    const dispName = id === '__none__' ? 'Без категории' : opsCatDisplay(cat);
    let trendBadge = '';
    if (hasTrend) {
      const prev = prevGroups[id] || 0;
      if (prev > 0) {
        const diff  = g.sum - prev;
        const pct2  = Math.abs((diff / prev * 100)).toFixed(0);
        const isBad = type === 'income' ? diff < 0 : diff > 0;
        const color = isBad ? 'var(--red)' : 'var(--green)';
        trendBadge = `<span style="font-size:9px;color:${color};flex-shrink:0;">${diff > 0 ? '↑' : '↓'}${pct2}%</span>`;
      }
    }
    const catLimitL  = (id !== '__none__' && cat.limit) ? +cat.limit : 0;
    const lSpentL    = limitExpenses[id] || 0;
    let legendLimit  = '';
    if (catLimitL > 0) {
      const lPct  = lSpentL / catLimitL * 100;
      const lOver = lSpentL > catLimitL;
      const lNear = !lOver && lPct >= 80;
      const lCol  = lOver ? 'var(--red)' : lNear ? 'var(--amber)' : 'var(--green)';
      legendLimit = `<div style="height:2px;background:var(--line2);border-radius:2px;margin-top:3px;overflow:hidden;">
        <div style="width:${Math.min(lPct, 100).toFixed(1)}%;height:100%;background:${lCol};border-radius:2px;"></div>
      </div>`;
    }
    return `<div style="display:flex;flex-direction:column;padding:5px 8px;background:var(--bg2);
                         border-radius:var(--radius-sm);border-left:3px solid ${cat.color};cursor:pointer;"
                 onclick="document.getElementById('f1cat').value='${id}';opsNav('op-p1')">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dispName}</span>
        ${trendBadge}
        <span style="font-size:10px;color:var(--muted);flex-shrink:0;">${pct}%</span>
        <span style="font-size:11px;font-weight:600;flex-shrink:0;">${fmtAmt(g.sum)}</span>
      </div>
      ${legendLimit}
    </div>`;
  }).join('');

  // Table — with Ср/мес, Тренд (optional), expand button, total row
  const thead = document.querySelector('#op-p6 table thead tr');
  if (thead) {
    thead.innerHTML = `<th>Категория</th><th style="text-align:center">Кол-во</th><th>Сумма</th><th style="color:var(--muted2)">Ср/мес</th>${hasTrend ? '<th>Тренд</th>' : ''}<th>%</th><th style="width:24px;"></th>`;
  }

  const bodyRows = sorted.map(([id, g]) => {
    const cat      = id === '__none__' ? { name: 'Без категории', color: '#6b7280', icon: '📦' } : opsCat(id);
    const pct      = total > 0 ? (g.sum / total * 100).toFixed(1) : '0';
    const dispName = id === '__none__' ? 'Без категории' : opsCatDisplay(cat);
    const avg      = fmtAmt(g.sum / monthsInPeriod);
    let trendCell  = '';
    if (hasTrend) {
      const prev = prevGroups[id] || 0;
      if (prev > 0) {
        const diff  = g.sum - prev;
        const pct2  = Math.abs((diff / prev * 100)).toFixed(0);
        const isBad = type === 'income' ? diff < 0 : diff > 0;
        const color = isBad ? 'var(--red)' : 'var(--green)';
        trendCell = `<td style="font-size:10px;color:${color};white-space:nowrap;">${diff > 0 ? '↑' : '↓'}${pct2}%</td>`;
      } else {
        trendCell = `<td style="font-size:9px;color:var(--amber);">new</td>`;
      }
    }
    const safeId     = id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const catLimit   = (id !== '__none__' && cat.limit) ? +cat.limit : 0;
    const limitSpent = limitExpenses[id] || 0;
    let limitBar     = '';
    if (catLimit > 0) {
      const lPct  = limitSpent / catLimit * 100;
      const lOver = limitSpent > catLimit;
      const lNear = !lOver && lPct >= 80;
      const lCol  = lOver ? 'var(--red)' : lNear ? 'var(--amber)' : 'var(--green)';
      const lW    = Math.min(lPct, 100).toFixed(1);
      const lIcon = lOver ? ' ✕' : lNear ? ' !' : '';
      limitBar = `<div style="margin-top:3px;">
        <div style="height:3px;background:var(--line2);border-radius:2px;overflow:hidden;">
          <div style="width:${lW}%;height:100%;background:${lCol};border-radius:2px;"></div>
        </div>
        <div style="font-size:9px;color:${lCol};margin-top:1px;">${fmtAmt(limitSpent)} / ${fmtAmt(catLimit)}${lIcon}</div>
      </div>`;
    }
    return `<tr data-p6catid="${id}">
      <td style="cursor:pointer" onclick="document.getElementById('f1cat').value='${safeId}';opsNav('op-p1')">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${cat.color};display:inline-block;flex-shrink:0;"></span>
          ${dispName}
        </span>
        ${limitBar}
      </td>
      <td style="color:var(--muted);text-align:center">${g.count}</td>
      <td style="font-weight:500">${fmtAmt(g.sum)}</td>
      <td style="color:var(--muted2);font-size:11px;">${avg}</td>
      ${trendCell}
      <td style="color:var(--muted)">${pct}%</td>
      <td><button class="row-edit-btn" title="Последние операции" onclick="p6ToggleTxns('${safeId}',event)" style="font-size:10px;color:var(--muted2);">▸</button></td>
    </tr>`;
  }).join('');

  const totalRow = `<tr style="border-top:2px solid var(--line2);">
    <td style="color:var(--muted);font-size:11px;font-style:italic;">Итого</td>
    <td style="color:var(--muted);text-align:center">${txns.length}</td>
    <td style="font-weight:700">${fmtAmt(total)}</td>
    <td style="color:var(--muted2);font-size:11px;">${fmtAmt(total / monthsInPeriod)}</td>
    ${hasTrend ? '<td>—</td>' : ''}
    <td style="color:var(--muted)">100%</td>
    <td></td>
  </tr>`;

  document.getElementById('p6body').innerHTML = bodyRows + totalRow;
}

function p6ToggleTxns(catId, event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const elId = 'p6-txns-' + catId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const existing = document.getElementById(elId);
  if (existing) { existing.remove(); btn.textContent = '▸'; return; }
  btn.textContent = '▾';

  const year  = document.getElementById('f6year').value;
  const month = document.getElementById('f6month').value;
  const type  = document.getElementById('f6type').value;
  let txns = opsState.txns.filter(t => !t._deleted && (t.cat || '__none__') === catId);
  if (month)     txns = txns.filter(t => t.date.startsWith(month));
  else if (year) txns = txns.filter(t => t.date.startsWith(year));
  if (type)      txns = txns.filter(t => t.type === type);
  const recent = [...txns].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))).slice(0, 5);

  const row     = btn.closest('tr');
  const colspan = row.querySelectorAll('td').length;
  const detailTr = document.createElement('tr');
  detailTr.id = elId;
  detailTr.style.background = 'var(--bg2)';

  const rows = recent.map(t => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--line);">
      <span style="color:var(--muted);font-size:10px;white-space:nowrap;min-width:58px;">${fmtDate(t.date)}</span>
      <span class="tag ${t.type === 'income' ? 'tag-income' : 'tag-expense'}" style="font-size:9px;">${t.type === 'income' ? '↑' : '↓'}</span>
      <span class="tag ${t.way === 'Наличный' ? 'tag-cash' : 'tag-card'}" style="font-size:9px;">${t.way === 'Наличный' ? 'нал' : 'безнал'}</span>
      <span class="${t.amount >= 0 ? 'amt-pos' : 'amt-neg'}" style="font-size:11px;font-weight:500;min-width:72px;flex-shrink:0;">${fmtAmt(t.amount, true)}</span>
      <span style="font-size:11px;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.comment || '—'}</span>
      <button class="row-edit-btn" onclick="opsOpenEditModal('${t.id}')" style="flex-shrink:0;">✎</button>
    </div>`).join('');

  const more     = txns.length - recent.length;
  const moreLink = more > 0
    ? `<div style="text-align:center;font-size:10px;color:var(--acc2);padding:6px 0;cursor:pointer;"
           onclick="document.getElementById('f1cat').value='${catId}';opsNav('op-p1')">ещё ${more} →</div>`
    : '';

  detailTr.innerHTML = `<td colspan="${colspan}" style="padding:4px 12px 8px;">${rows}${moreLink}</td>`;
  row.insertAdjacentElement('afterend', detailTr);
}

// ── Управление категориями ────────────────────────
function opsCatConfig() {
  document.getElementById('cat-config-modal').classList.add('is-open');
  opsCatConfigRender();
}
function opsCatConfigClose() { document.getElementById('cat-config-modal').classList.remove('is-open'); }
let _catDnd = { fromId: null, touchTarget: null };

function opsCatConfigRender() {
  const el = document.getElementById('cat-config-list');
  el.innerHTML = opsCats().map(c => `
    <div class="cfg-cat-row" data-cid="${c.id}" draggable="false"
         style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg3);
                border-radius:var(--radius-sm);margin-bottom:5px;border-left:3px solid ${c.color};">
      <span class="cat-drag-handle" style="cursor:grab;color:var(--muted2);font-size:14px;padding:0 2px;flex-shrink:0;touch-action:none;" title="Перетащи">⠿</span>
      <input type="color" value="${c.color}" style="width:28px;height:24px;border:none;background:none;cursor:pointer;padding:0;flex-shrink:0;"
             onchange="opsCatUpdateColor('${c.id}',this.value)">
      <span style="font-size:14px;cursor:pointer;min-width:20px;flex-shrink:0;" onclick="opsCatEditIcon('${c.id}')" title="Изменить иконку">${c.icon}</span>
      <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name}</span>
      <input type="text" inputmode="numeric" value="${c.limit || ''}" placeholder="лимит"
             title="Лимит расходов в месяц (оставь пустым — без лимита)"
             style="width:68px;font-size:10px;text-align:right;flex-shrink:0;padding:3px 5px;"
             class="filter-input"
             onchange="opsCatUpdateLimit('${c.id}', this.value)">
      <button class="btn btn-sm" onclick="opsCatEditName('${c.id}','${c.name.replace(/'/g,"\\'")}')">✎</button>
      <button class="btn btn-sm btn-danger" onclick="opsCatDelete('${c.id}')">✕</button>
    </div>`).join('');

  el.querySelectorAll('.cfg-cat-row').forEach(row => {
    const handle = row.querySelector('.cat-drag-handle');
    handle.addEventListener('mousedown', () => row.setAttribute('draggable','true'));
    document.addEventListener('mouseup', () => row.setAttribute('draggable','false'), { once: true });
    row.addEventListener('dragstart', e => {
      _catDnd.fromId = row.dataset.cid;
      setTimeout(() => row.style.opacity = '0.4', 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = ''; row.setAttribute('draggable','false');
      el.querySelectorAll('.cfg-cat-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      _catDnd.fromId = null;
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (!_catDnd.fromId || row.dataset.cid === _catDnd.fromId) return;
      el.querySelectorAll('.cfg-cat-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      const rect = row.getBoundingClientRect();
      row.style[e.clientY > rect.top + rect.height/2 ? 'borderBottom':'borderTop'] = '2px solid var(--acc)';
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) { row.style.borderTop=''; row.style.borderBottom=''; }
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.style.borderTop=''; row.style.borderBottom='';
      if (!_catDnd.fromId || row.dataset.cid === _catDnd.fromId) return;
      const rect = row.getBoundingClientRect();
      _opsCatReorder(_catDnd.fromId, row.dataset.cid, e.clientY > rect.top + rect.height/2);
    });
    handle.addEventListener('touchstart', e => {
      _catDnd.fromId = row.dataset.cid; row.style.opacity = '0.5'; e.preventDefault();
    }, { passive: false });
    handle.addEventListener('touchmove', e => {
      if (!_catDnd.fromId) return; e.preventDefault();
      const cy = e.touches[0].clientY;
      el.querySelectorAll('.cfg-cat-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      _catDnd.touchTarget = null;
      [...el.querySelectorAll('.cfg-cat-row[data-cid]')].forEach(r => {
        if (r.dataset.cid === _catDnd.fromId) return;
        const rect = r.getBoundingClientRect();
        if (cy >= rect.top && cy <= rect.bottom) {
          const after = cy > rect.top + rect.height/2;
          r.style[after ? 'borderBottom':'borderTop'] = '2px solid var(--acc)';
          _catDnd.touchTarget = { id: r.dataset.cid, after };
        }
      });
    }, { passive: false });
    handle.addEventListener('touchend', () => {
      row.style.opacity = '';
      el.querySelectorAll('.cfg-cat-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      if (_catDnd.touchTarget) _opsCatReorder(_catDnd.fromId, _catDnd.touchTarget.id, _catDnd.touchTarget.after);
      _catDnd = { fromId: null, touchTarget: null };
    });
  });

  const cb = document.getElementById('cat-emoji-toggle');
  const lbl = document.getElementById('cat-emoji-label');
  if (cb) { cb.checked = opsState.catUseEmoji === true; if (lbl) lbl.textContent = cb.checked ? 'вкл' : 'выкл'; }
}

function _opsCatReorder(fromId, toId, after) {
  const cats = opsState.categories;
  const fi = cats.findIndex(c => c.id === fromId);
  if (fi < 0) return;
  const [moved] = cats.splice(fi, 1);
  const ti = cats.findIndex(c => c.id === toId);
  if (ti < 0) { cats.splice(fi, 0, moved); return; }
  cats.splice(after ? ti+1 : ti, 0, moved);
  opsSave(); opsCatConfigRender();
}
function opsCatUpdateColor(id, color) {
  const c = opsCats().find(c=>c.id===id); if(c) { c.color=color; opsSave(); opsCatConfigRender(); }
}
function opsCatUpdateLimit(id, value) {
  const c = opsCats().find(c => c.id === id); if (!c) return;
  const n = parseFloat(value);
  c.limit = (!value || isNaN(n) || n <= 0) ? undefined : n;
  opsSave();
  if (driveToken) driveDebouncedPush('ops');
}
function opsCatEditIcon(id) {
  const c = opsCats().find(c=>c.id===id); if(!c) return;
  appPrompt('Эмодзи для категории:', c.icon).then(icon => {
    if (icon !== null) { c.icon = icon.trim() || c.icon; opsSave(); opsCatConfigRender(); }
  });
}
function opsCatEditName(id, name) {
  appPrompt('Название категории:', name).then(newName => {
    if (newName !== null && newName.trim()) {
      const c = opsCats().find(c=>c.id===id); if(c) { c.name=newName.trim(); opsSave(); opsCatConfigRender(); }
    }
  });
}
function opsCatDelete(id) {
  const cat = opsCats().find(c=>c.id===id);
  const label = cat ? cat.name : id;
  appConfirm(`Удалить категорию "${label}"? У операций с ней она будет сброшена.`).then(ok => {
    if (!ok) return;
    opsState.txns.forEach(t => { if(t.cat===id) t.cat=''; });
    opsState.categories = opsCats().filter(c=>c.id!==id);
    opsSave(); opsCatConfigRender();
  });
}
function opsCatAdd() {
  appPrompt('Название новой категории:', '').then(name => {
    if (!name?.trim()) return;
    const id = 'cat_' + Date.now();
    opsCats().push({ id, name:name.trim(), color:'#6366f1', icon:'📌' });
    opsSave(); opsCatConfigRender();
    if (driveToken) driveDebouncedPush('ops');
  });
}

/* ══════════════════════════════════════════════════
   ШАБЛОНЫ ОПЕРАЦИЙ
══════════════════════════════════════════════════ */

function opsTpls() { return opsState.templates || (opsState.templates = []); }

function opsTplOpenModal() {
  opsTplRender();
  document.getElementById('tpl-modal').classList.add('is-open');
}
function opsTplCloseModal() {
  document.getElementById('tpl-modal').classList.remove('is-open');
}

function opsTplRender() {
  const list = opsTpls();
  const el = document.getElementById('tpl-list');
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding:24px 0;">Шаблонов нет.<br>Открой форму операции и нажми «💾 Шаблон»</div>';
    return;
  }
  el.innerHTML = list.map(t => {
    const cat = t.cat ? opsCat(t.cat) : null;
    const borderColor = cat ? cat.color : 'var(--line2)';
    const typeTag = t.type === 'income'
      ? '<span class="tag tag-income" style="font-size:9px;">↑ Приход</span>'
      : '<span class="tag tag-expense" style="font-size:9px;">↓ Расход</span>';
    const wayTag = t.way === 'Наличный'
      ? '<span class="tag tag-cash" style="font-size:9px;">нал</span>'
      : '<span class="tag tag-card" style="font-size:9px;">безнал</span>';
    const amtPart = t.amount ? `<span style="font-size:10px;color:var(--text);font-weight:500;">${fmtAmt(Math.abs(t.amount))} руб</span>` : '';
    const catPart = cat ? `<span style="font-size:10px;color:var(--muted);">${opsCatDisplay(cat)}</span>` : '';
    const meta = [typeTag, wayTag, amtPart, catPart].filter(Boolean).join(' ');
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;
                         background:var(--bg3);border-radius:var(--radius-sm);
                         margin-bottom:5px;border-left:3px solid ${borderColor};">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${t.name}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${meta}</div>
        ${t.comment ? `<div style="font-size:10px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.comment}</div>` : ''}
      </div>
      <button class="btn btn-sm btn-primary" onclick="opsTplApply('${t.id}')">Применить</button>
      <button class="btn btn-sm btn-danger" onclick="opsTplDelete('${t.id}')">✕</button>
    </div>`;
  }).join('');
}

function opsTplApply(id) {
  const t = opsTpls().find(t => t.id === id);
  if (!t) return;
  opsTplCloseModal();
  const opsModalOpen = document.getElementById('ops-modal').classList.contains('is-open');
  if (!opsModalOpen) {
    opsEditId = null;
    document.getElementById('ops-modal-title').textContent = 'Новая операция';
    document.getElementById('m-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('m-del-btn').style.display = 'none';
  }
  document.getElementById('m-type').value    = t.type;
  document.getElementById('m-way').value     = t.way;
  document.getElementById('m-amt').value     = t.amount ? Math.abs(t.amount) : '';
  document.getElementById('m-comment').value = t.comment || '';
  opsFillCatSel(t.cat || '');
  opsLoadItems(t.items || [], t.itemsMode || 'none');
  if (!opsModalOpen) document.getElementById('ops-modal').classList.add('is-open');
}

function opsTplDelete(id) {
  appConfirm('Удалить шаблон?').then(ok => {
    if (!ok) return;
    opsState.templates = opsTpls().filter(t => t.id !== id);
    opsSave(); opsTplRender();
    if (driveToken) driveDebouncedPush('ops');
  });
}

function opsTplSaveFromModal() {
  const type      = document.getElementById('m-type').value;
  const way       = document.getElementById('m-way').value;
  const amount    = parseFloat(document.getElementById('m-amt').value) || 0;
  const comment   = document.getElementById('m-comment').value.trim();
  const cat       = document.getElementById('m-cat').value;
  const itemsMode = opsGetCurrentMode();
  const items     = itemsMode !== 'none' ? opsGetItems() : [];
  const defName   = comment || (cat ? opsCat(cat).name : '') || (type === 'income' ? 'Приход' : 'Расход');
  appPrompt('Название шаблона:', defName).then(name => {
    if (!name?.trim()) return;
    opsState.templates.push({ id: 'tpl_' + Date.now(), name: name.trim(), type, way, amount, cat, comment, items, itemsMode });
    opsSave();
    showOk('✓ Шаблон сохранён: ' + name.trim());
    if (driveToken) driveDebouncedPush('ops');
  });
}

/* ══════════════════════════════════════════════════
   БЫСТРЫЙ ВВОД
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   DIFF ИНВЕНТАРИЗАЦИЙ
══════════════════════════════════════════════════ */
function invOpenDiff() {
  const modal = document.getElementById('inv-diff-modal');
  const sorted = [...invState.dates].filter(r => !r._deleted).sort((a,b) => b.date.localeCompare(a.date));
  if (sorted.length < 2) { showErr('Нужно минимум 2 записи для сравнения'); return; }

  const selA = document.getElementById('diff-sel-a');
  const selB = document.getElementById('diff-sel-b');
  const opts = sorted.map(r => {
    const d = new Date(r.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
    return `<option value="${r.id}">${d}</option>`;
  }).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  selB.selectedIndex = 1;
  modal.classList.add('is-open');
  invRenderDiff();
}
function invCloseDiff() { document.getElementById('inv-diff-modal').classList.remove('is-open'); }

function invRenderDiff() {
  const idA = document.getElementById('diff-sel-a').value;
  const idB = document.getElementById('diff-sel-b').value;
  const recA = invState.dates.find(r=>r.id===idA);
  const recB = invState.dates.find(r=>r.id===idB);
  if (!recA || !recB || idA === idB) {
    document.getElementById('inv-diff-body').innerHTML =
      '<div style="color:var(--muted);text-align:center;padding:20px;">Выбери две разные записи</div>';
    return;
  }

  const { pmr:pmrA, total:totalA } = invCalc(recA);
  const { pmr:pmrB, total:totalB } = invCalc(recB);
  const pmrDiff   = pmrA - pmrB;
  const totalDiff = totalA - totalB;
  const dA = new Date(recA.date).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const dB = new Date(recB.date).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});

  let rows = '';
  const base = invBaseCurrency();
  for (const sec of invSections()) {
    const rate = sec.currency === base ? 1 : (invConvertRate(sec.currency, base, 'buy') || 1);
    let valA, valB;
    if (sec.ekosh) {
      valA = (recA.secs[sec.id]?.val || 0) * rate;
      valB = (recB.secs[sec.id]?.val || 0) * rate;
    } else {
      valA = sec.noms.reduce((s,n) => s + (recA.secs[sec.id]?.[n]||0)*n*rate, 0);
      valB = sec.noms.reduce((s,n) => s + (recB.secs[sec.id]?.[n]||0)*n*rate, 0);
    }
    const diff = valA - valB;
    if (!sec.ekosh) {
      // Per-nom breakdown
      for (const nom of sec.noms) {
        const qA = recA.secs[sec.id]?.[nom] || 0;
        const qB = recB.secs[sec.id]?.[nom] || 0;
        const dq = qA - qB;
        if (dq === 0) continue;
        const dr = dq * nom * rate;
        rows += `<tr>
          <td style="color:var(--muted);font-size:11px;">${sec.name}</td>
          <td style="font-size:11px;">${nom} ${sec.currency}</td>
          <td style="color:var(--muted)">${qB}</td>
          <td style="color:var(--muted)">${qA}</td>
          <td class="${dq>0?'amt-pos':'amt-neg'}" style="font-weight:600">${dq>0?'+':''}${dq}</td>
          <td class="${dr>0?'amt-pos':'amt-neg'}" style="font-size:10px">${dr>0?'+':''}${invFmtShort(dr)} ${base}</td>
        </tr>`;
      }
    } else if (diff !== 0) {
      rows += `<tr>
        <td style="color:var(--muted);font-size:11px;">${sec.name}</td>
        <td style="font-size:11px;">баланс</td>
        <td style="color:var(--muted)">${invFmt(valB)}</td>
        <td style="color:var(--muted)">${invFmt(valA)}</td>
        <td class="${diff>0?'amt-pos':'amt-neg'}" style="font-weight:600">${diff>0?'+':''}${invFmt(diff)}</td>
        <td></td>
      </tr>`;
    }
  }

  document.getElementById('inv-diff-body').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px;">
      <div class="stat-card">
        <div class="stat-card-label">${dB} → ${base}</div>
        <div class="stat-card-value is-neu" style="font-size:14px">${invFmt(pmrB)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${dA} → ${base}</div>
        <div class="stat-card-value is-neu" style="font-size:14px">${invFmt(pmrA)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Δ ${base}</div>
        <div class="stat-card-value ${pmrDiff>=0?'is-pos':'is-neg'}" style="font-size:14px">${pmrDiff>=0?'+':''}${invFmt(pmrDiff)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${dB} → Всё</div>
        <div class="stat-card-value is-neu" style="font-size:14px">${invFmt(totalB)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${dA} → Всё</div>
        <div class="stat-card-value is-neu" style="font-size:14px">${invFmt(totalA)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Δ Всё</div>
        <div class="stat-card-value ${totalDiff>=0?'is-pos':'is-neg'}" style="font-size:14px">${totalDiff>=0?'+':''}${invFmt(totalDiff)}</div>
      </div>
    </div>
    ${rows ? `
    <div class="tbl-wrap">
      <div class="tbl-header"><div class="tbl-caption">Изменения по номиналам</div></div>
      <table><thead><tr>
        <th>Блок</th><th>Номинал</th><th>${dB}</th><th>${dA}</th><th>Δ кол-во</th><th>Δ ${base}</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>` :
    `<div style="color:var(--muted);text-align:center;padding:20px;">Изменений между записями не обнаружено</div>`}`;
}

/* ══════════════════════════════════════════════════
   ЦЕЛИ ИНВЕНТАРИЗАЦИИ
══════════════════════════════════════════════════ */

function invGoals() { return invState.goals || []; }

const GOAL_SWATCHES = [
  { label:'Акцент',  value:'var(--acc)',   dynamic: true },
  { label:'Зелёный', value:'var(--green)', dynamic: true },
  { label:'Красный', value:'var(--red)',   dynamic: true },
  { label:'Синий',   value:'var(--blue)',  dynamic: true },
  { label:'Янтарь',  value:'var(--amber)', dynamic: true },
  { label:'Фиолет',  value:'#7c6af7',  dynamic: false },
  { label:'Бирюза',  value:'#3ecf8e',  dynamic: false },
  { label:'Оранж',   value:'#f97316',  dynamic: false },
  { label:'Розовый', value:'#ec4899',  dynamic: false },
  { label:'Инди',    value:'#6366f1',  dynamic: false },
  { label:'Мокко',   value:'#c9956b',  dynamic: false },
];

function invGoalColor(stored) {
  if (!stored) return cssVar('--acc') || '#808080';
  if (stored.startsWith('var(--')) {
    const varName = stored.slice(4, -1);
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#808080';
  }
  return stored;
}

function invRenderGoalSwatches() {
  const picker = document.getElementById('goal-color-picks');
  if (!picker) return;
  [...picker.querySelectorAll('.goal-swatch')].forEach(s => s.remove());

  const makeLabel = (text) => {
    const l = document.createElement('span');
    l.style.cssText = 'font-size:9px;color:var(--muted2);align-self:center;white-space:nowrap;';
    l.textContent = text;
    l.className = 'goal-swatch';
    return l;
  };

  picker.appendChild(makeLabel('Тема:'));
  GOAL_SWATCHES.filter(s => s.dynamic).forEach(sw => {
    const s = document.createElement('span');
    s.className = 'goal-swatch';
    s.title = sw.label + ' (меняется с темой)';
    s.style.cssText = `width:22px;height:22px;border-radius:50%;background:${sw.value};cursor:pointer;flex-shrink:0;border:2px solid transparent;transition:border-color .15s;display:inline-block;position:relative;`;
    s.innerHTML = `<span style="position:absolute;inset:3px;border-radius:50%;border:1.5px solid rgba(255,255,255,.4);pointer-events:none;"></span>`;
    s.onmouseover = () => s.style.borderColor = 'var(--text)';
    s.onmouseout  = () => s.style.borderColor = 'transparent';
    s.onclick     = () => {
      document.getElementById('goal-color').value = invGoalColor(sw.value);
      document.getElementById('goal-color-var').value = sw.value;
    };
    picker.appendChild(s);
  });

  picker.appendChild(makeLabel('Статичные:'));
  GOAL_SWATCHES.filter(s => !s.dynamic).forEach(sw => {
    const s = document.createElement('span');
    s.className = 'goal-swatch';
    s.title = sw.label;
    s.style.cssText = `width:22px;height:22px;border-radius:50%;background:${sw.value};cursor:pointer;flex-shrink:0;border:2px solid transparent;transition:border-color .15s;display:inline-block;`;
    s.onmouseover = () => s.style.borderColor = 'var(--text)';
    s.onmouseout  = () => s.style.borderColor = 'transparent';
    s.onclick     = () => {
      document.getElementById('goal-color').value = sw.value;
      document.getElementById('goal-color-var').value = '';
    };
    picker.appendChild(s);
  });
}

function invOpenGoals() {
  const sel = document.getElementById('goal-currency');
  sel.innerHTML = invCurrencyList().map(c =>
    `<option value="${c.code}">${c.code} — ${c.name}</option>`
  ).join('');
  invCancelEditGoal();
  invRenderGoalSwatches();
  invRenderGoalsList();
  document.getElementById('inv-goals-modal').classList.add('is-open');
}
function invCloseGoals() {
  document.getElementById('inv-goals-modal').classList.remove('is-open');
}

function invSaveGoal() {
  const name    = document.getElementById('goal-name').value.trim();
  const amount  = parseFloat(document.getElementById('goal-amount').value) || 0;
  const cur     = document.getElementById('goal-currency').value;
  const colorVar = document.getElementById('goal-color-var').value;
  const color   = colorVar || document.getElementById('goal-color').value;
  const editId  = document.getElementById('goal-edit-id').value;
  if (!name)   { showInlineErr('goal-name', 'Введи название цели'); return; }
  if (!amount) { showInlineErr('goal-amount', 'Введи сумму цели'); return; }
  if (!invState.goals) invState.goals = [];
  if (editId) {
    const g = invState.goals.find(g => g.id === editId);
    if (g) Object.assign(g, { name, amount, currency: cur, color });
  } else {
    invState.goals.push({ id: 'g_' + Date.now(), name, amount, currency: cur, color });
  }
  invSaveState();
  if (driveToken) driveDebouncedPush('inv');
  invCancelEditGoal();
  invRenderGoalsList();
  if (!invCurId) invShowDashboard();
}

function invEditGoal(id) {
  const g = invGoals().find(g => g.id === id);
  if (!g) return;
  document.getElementById('goal-name').value     = g.name;
  document.getElementById('goal-amount').value   = g.amount;
  document.getElementById('goal-currency').value = g.currency;
  document.getElementById('goal-color').value    = invGoalColor(g.color);
  document.getElementById('goal-color-var').value = g.color.startsWith('var(') ? g.color : '';
  document.getElementById('goal-edit-id').value  = id;
  document.getElementById('goal-form-label').textContent  = 'Редактировать цель';
  document.getElementById('goal-save-btn').textContent    = '\u2713 Сохранить изменения';
  document.getElementById('goal-cancel-edit-btn').style.display = '';
  document.getElementById('goal-form-label').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function invCancelEditGoal() {
  document.getElementById('goal-name').value    = '';
  document.getElementById('goal-amount').value  = '';
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-color-var').value = '';
  document.getElementById('goal-form-label').textContent = 'Новая цель';
  document.getElementById('goal-save-btn').textContent   = '+ Добавить цель';
  document.getElementById('goal-cancel-edit-btn').style.display = 'none';
}

function invDeleteGoal(id) {
  appConfirm('Удалить цель?').then(ok => {
    if (!ok) return;
    invState.goals = invGoals().filter(g => g.id !== id);
    invSaveState();
    if (driveToken) driveDebouncedPush('inv');
    invRenderGoalsList();
    if (!invCurId) invShowDashboard();
  });
}

// ── Goal progress — правильная логика ────────────────────────────────────────
//
// Для каждого актива (валюта A) и цели (валюта T):
//   1. Найти ВСЕ пути A→T и выбрать лучший (максимум результата)
//   2. current = Σ(units_A × bestRate(A→T))
//   3. pct = current / targetAmount × 100
//
// Это правильно, т.к. EUR→USD напрямую может быть выгоднее EUR→RUP→USD.
// base-валюта используется только как ПРОМЕЖУТОЧНАЯ в графе, а не как
// обязательная точка конвертации.
//
// Покупка: вы продаёте FROM банку (вы отдаёте актив, получаете целевую валюту)

function invCalcGoalProgress(goal) {
  const latest = [...invState.dates].filter(r => !r._deleted)
    .sort((a,b) => b.date.localeCompare(a.date))[0];
  const base      = invBaseCurrency();
  const targetCur = goal.currency;
  const targetAmt = goal.amount;

  const empty = { current:0, pct:0, targetCur, targetAmt,
    assetBreakdown:[], globalStrategies:[], base };
  if (!latest) return empty;

  const assetBreakdown = [];
  let totalInTarget = 0;

  for (const sec of invSections()) {
    let units = sec.ekosh
      ? (latest.secs[sec.id]?.val || 0)
      : sec.noms.reduce((a,n) => a + (latest.secs[sec.id]?.[n]||0)*n, 0);
    if (units === 0) continue;

    const srcCur = sec.currency;

    if (srcCur === targetCur) {
      // Уже в целевой валюте
      totalInTarget += units;
      assetBreakdown.push({
        secName: sec.name, currency: srcCur, units,
        bestResult: units, bestRate: 1,
        paths: [{ steps:[], totalRate:1, amountResult:units, label:'уже в целевой валюте' }],
        isTarget: true
      });
      continue;
    }

    // Найти все пути srcCur → targetCur
    // Направление: мы «продаём» srcCur (отдаём банку) — buy direction на каждом шаге
    const allPaths = _findAllPathsDirected(srcCur, targetCur, 4);

    if (!allPaths.length) {
      // Путь не найден
      assetBreakdown.push({
        secName: sec.name, currency: srcCur, units,
        bestResult: 0, bestRate: 0,
        paths: [],
        isTarget: false,
        noPath: true
      });
      continue;
    }

    const rankedPaths = allPaths.map(p => ({
      steps: p.path,
      totalRate: p.totalRate,
      amountResult: units * p.totalRate
    }));

    const best = rankedPaths[0];
    totalInTarget += best.amountResult;

    assetBreakdown.push({
      secName: sec.name, currency: srcCur, units,
      bestResult: best.amountResult,
      bestRate: best.totalRate,
      paths: rankedPaths.slice(0, 3),
      isTarget: false
    });
  }

  const pct = targetAmt > 0 ? Math.min(100, (totalInTarget / targetAmt) * 100) : 0;
  const remain = Math.max(0, targetAmt - totalInTarget);

  return {
    current: totalInTarget,
    pct,
    targetCur,
    targetAmt,
    remain,
    assetBreakdown,
    base
  };
}

/**
 * Find all paths from `from` → `to` using DFS.
 * At each hop we "sell" the current currency to the bank → use 'buy' rate.
 * (bank buys FROM from us, we receive TO)
 *
 * Edge logic for edge(A → B):
 *   direct pair (A/B): rate = pair.buy  (bank buys A from us, pays B)
 *   reverse pair (B/A): rate = 1/pair.sell  (bank sells A to us for B → per 1A we spend pair.sell B,
 *                                            so per 1 of our A we get 1/pair.sell of... wait no)
 *
 * Clearer: we HAVE currency A, want B.
 *   Direct pair A/B exists: bank buys A at pair.buy → we get pair.buy units of B per 1A ✓
 *   Reverse pair B/A exists: bank sells B to us. "sell" = price in A per 1B.
 *     So for 1A we get 1/pair.sell of B. ✓
 */
function _findAllPathsDirected(from, to, maxHops) {
  const pairs = invPairs();
  const results = [];

  function edgeRate(a, b) {
    const direct = pairs.find(p => p.from === a && p.to === b);
    if (direct) return { rate: direct.buy, pair: direct, reversed: false,
      label: `${direct.from}/${direct.to} покупка ×${direct.buy}` };
    const rev = pairs.find(p => p.from === b && p.to === a);
    if (rev) return { rate: 1 / rev.sell, pair: rev, reversed: true,
      label: `${rev.from}/${rev.to} обратная продажа ×${(1/rev.sell).toFixed(6)}` };
    return null;
  }

  function dfs(cur, path, rateProduct, visited) {
    if (path.length > maxHops) return;
    if (cur === to && path.length > 0) {
      results.push({ path: [...path], totalRate: rateProduct });
      return;
    }
    // All neighbours
    const neighbours = new Set();
    for (const p of pairs) {
      if (p.from === cur && !visited.has(p.to))   neighbours.add(p.to);
      if (p.to   === cur && !visited.has(p.from)) neighbours.add(p.from);
    }
    for (const next of neighbours) {
      const e = edgeRate(cur, next);
      if (!e || e.rate <= 0) continue;
      visited.add(next);
      path.push({ from: cur, to: next, rate: e.rate, label: e.label, pair: e.pair, reversed: e.reversed });
      dfs(next, path, rateProduct * e.rate, visited);
      path.pop();
      visited.delete(next);
    }
  }

  dfs(from, [], 1, new Set([from]));
  results.sort((a, b) => b.totalRate - a.totalRate);
  return results;
}

let _goalDnd = { fromId: null, touchTarget: null };

function invInitGoalDnD(container) {
  container.querySelectorAll('.goal-card[data-gid]').forEach(card => {
    const handle = card.querySelector('.goal-drag-handle');
    if (!handle) return;

    // Enable draggable only when pointer is on handle
    handle.addEventListener('mousedown', () => { card.setAttribute('draggable', 'true'); });
    document.addEventListener('mouseup', () => { card.setAttribute('draggable', 'false'); }, { once: true });

    card.addEventListener('dragstart', e => {
      if (!card.getAttribute('draggable') || card.getAttribute('draggable') === 'false') {
        e.preventDefault(); return;
      }
      _goalDnd.fromId = card.dataset.gid;
      // Delay opacity so browser can grab screenshot first
      setTimeout(() => { card.style.opacity = '0.45'; }, 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '';
      card.setAttribute('draggable', 'false');
      container.querySelectorAll('.goal-card').forEach(c => { c.style.borderTop=''; c.style.borderBottom=''; });
      _goalDnd.fromId = null;
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (!_goalDnd.fromId || card.dataset.gid === _goalDnd.fromId) return;
      container.querySelectorAll('.goal-card').forEach(c => { c.style.borderTop=''; c.style.borderBottom=''; });
      const rect = card.getBoundingClientRect();
      card.style[e.clientY > rect.top + rect.height/2 ? 'borderBottom':'borderTop'] = '2px solid var(--acc)';
    });
    card.addEventListener('dragleave', e => {
      // Only clear if leaving the card entirely (not entering a child)
      if (!card.contains(e.relatedTarget)) {
        card.style.borderTop=''; card.style.borderBottom='';
      }
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.style.borderTop=''; card.style.borderBottom='';
      if (!_goalDnd.fromId || card.dataset.gid === _goalDnd.fromId) return;
      const rect = card.getBoundingClientRect();
      _invGoalReorder(_goalDnd.fromId, card.dataset.gid, e.clientY > rect.top + rect.height/2);
    });

    // Touch DnD
    handle.addEventListener('touchstart', e => {
      _goalDnd.fromId = card.dataset.gid;
      card.style.opacity = '0.5';
      card.style.boxShadow = '0 4px 16px rgba(0,0,0,.3)';
      e.preventDefault();
    }, { passive: false });
    handle.addEventListener('touchmove', e => {
      if (!_goalDnd.fromId) return;
      e.preventDefault();
      const cy = e.touches[0].clientY;
      container.querySelectorAll('.goal-card').forEach(c => { c.style.borderTop=''; c.style.borderBottom=''; });
      _goalDnd.touchTarget = null;
      [...container.querySelectorAll('.goal-card[data-gid]')].forEach(c => {
        if (c.dataset.gid === _goalDnd.fromId) return;
        const r = c.getBoundingClientRect();
        if (cy >= r.top && cy <= r.bottom) {
          const after = cy > r.top + r.height/2;
          c.style[after ? 'borderBottom':'borderTop'] = '2px solid var(--acc)';
          _goalDnd.touchTarget = { id: c.dataset.gid, after };
        }
      });
    }, { passive: false });
    handle.addEventListener('touchend', () => {
      card.style.opacity = ''; card.style.boxShadow = '';
      container.querySelectorAll('.goal-card').forEach(c => { c.style.borderTop=''; c.style.borderBottom=''; });
      if (_goalDnd.touchTarget) {
        _invGoalReorder(_goalDnd.fromId, _goalDnd.touchTarget.id, _goalDnd.touchTarget.after);
      }
      _goalDnd = { fromId: null, touchTarget: null };
    });
  });
}

function _invGoalReorder(fromId, toId, after) {
  const goals = invState.goals;
  const fi = goals.findIndex(g => g.id === fromId);
  if (fi < 0) return;
  const [moved] = goals.splice(fi, 1);
  const ti = goals.findIndex(g => g.id === toId);
  if (ti < 0) { goals.splice(fi, 0, moved); return; } // rollback
  goals.splice(after ? ti+1 : ti, 0, moved);
  invSaveState();
  if (driveToken) driveDebouncedPush('inv');
  invRenderGoalsList();
  // Also refresh dashboard if visible
  if (!invCurId) invShowDashboard();
}

function invRenderGoalsList() {
  const goals = invGoals();
  const el = document.getElementById('inv-goals-list');
  if (!goals.length) {
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px 0;font-size:12px;">Целей пока нет — добавь первую ниже</div>';
    return;
  }

  const fmtN = (n, d=4) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
  const fmtC = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

  el.innerHTML = goals.map(g => {
    const { current, pct, targetCur, targetAmt, remain, assetBreakdown } = invCalcGoalProgress(g);
    const col = g.color;
    const isDynamic = g.color.startsWith('var(');

    // ── Per-asset section ──────────────────────────────────────────
    let assetsHtml = '';
    if (assetBreakdown.length) {
      assetsHtml = `
      <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;">
        <div style="font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);margin-bottom:6px;">
          Активы → ${targetCur}
          <span style="font-size:8px;text-transform:none;letter-spacing:0;color:var(--muted);margin-left:6px;">(лучший курс для каждого блока)</span>
        </div>
        ${assetBreakdown.map(a => {
          if (a.isTarget) {
            return `<div style="padding:5px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
              <span style="font-size:10px;color:var(--muted)">${a.secName} <span style="color:var(--muted2);font-size:9px;">(уже ${a.currency})</span></span>
              <b style="font-size:11px;color:var(--green)">${fmtC(a.units)} ${targetCur}</b>
            </div>`;
          }
          if (a.noPath) {
            return `<div style="padding:5px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
              <span style="font-size:10px;color:var(--muted)">${a.secName}</span>
              <span style="font-size:10px;color:var(--red)">нет пути ${a.currency}→${targetCur}</span>
            </div>`;
          }

          const best = a.paths[0];
          // Steps for best path
          const stepsHtml = best.steps.map((s, si) => {
            const amtBefore = si === 0 ? a.units : (a.units * best.steps.slice(0,si).reduce((r,x)=>r*x.rate,1));
            const amtAfter  = amtBefore * s.rate;
            return `<div style="font-size:9px;color:var(--muted2);padding-left:10px;line-height:1.8;">
              <span style="color:var(--muted)">${s.from}→${s.to}</span>
              ${fmtN(amtBefore,4)} × ${fmtN(s.rate,6)} = <b style="color:var(--text)">${fmtN(amtAfter,4)}</b>
              <span style="color:var(--muted2);font-size:8px;margin-left:4px;">${s.label}</span>
            </div>`;
          }).join('');

          // Alt paths (collapsed)
          const altPaths = a.paths.slice(1);
          const altHtml = altPaths.length ? `
            <div style="margin-top:4px;padding-left:10px;">
              ${altPaths.map((ap, ai) => {
                const pathStr = [a.currency, ...ap.steps.map(s=>s.to)].join('→');
                const diff = ap.amountResult - best.amountResult;
                return `<div style="font-size:9px;color:var(--muted2);line-height:1.7;">
                  <span style="color:var(--muted2)">· ${pathStr}</span>
                  = ${fmtC(ap.amountResult)} ${targetCur}
                  <span style="color:var(--red);font-size:8px;">(−${fmtC(Math.abs(diff))})</span>
                </div>`;
              }).join('')}
            </div>` : '';

          return `<div style="padding:5px 0;border-bottom:1px solid var(--line);">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
              <span style="font-size:10px;color:var(--muted)">${a.secName}
                <span style="color:var(--muted2);font-size:9px;">${fmtC(a.units)} ${a.currency}</span>
              </span>
              <span style="font-size:11px;">
                <b style="color:var(--green)">${fmtC(best.amountResult)} ${targetCur}</b>
                <span style="color:var(--muted2);font-size:9px;margin-left:4px;">×${fmtN(best.totalRate,6)}</span>
              </span>
            </div>
            ${stepsHtml}
            ${altHtml}
          </div>`;
        }).join('')}
        <div style="display:flex;justify-content:flex-end;padding-top:6px;">
          <span style="font-size:11px;font-weight:600;color:var(--green)">${fmtC(current)} ${targetCur} итого</span>
        </div>
      </div>`;
    }

    return `
    <div class="goal-card" data-gid="${g.id}" draggable="false" style="border-left:4px solid ${col};">
      <div class="goal-card-header">
        <span class="goal-drag-handle" style="cursor:grab;color:var(--muted2);font-size:14px;padding:2px 8px 2px 0;flex-shrink:0;touch-action:none;">⠿</span>
        <div style="flex:1;min-width:0;">
          <div class="goal-card-name">${g.name}${isDynamic?' <span style="font-size:8px;color:var(--muted2);">[тема]</span>':''}</div>
          <div class="goal-card-target">Цель: ${fmtC(targetAmt)} ${targetCur}</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:5px;flex-shrink:0;">
          <div class="goal-pct" style="color:${col}">${pct.toFixed(1)}%</div>
          <button class="btn btn-sm" onclick="invEditGoal('${g.id}')" style="margin-top:2px;">✎</button>
          <button class="btn btn-sm btn-danger" onclick="invDeleteGoal('${g.id}')" style="margin-top:2px;">✕</button>
        </div>
      </div>
      <div class="goal-progress-wrap">
        <div class="goal-progress-bar" style="width:${pct.toFixed(1)}%;background:${col};"></div>
      </div>
      <div class="goal-progress-labels">
        <span>Сейчас: <b style="color:${col}">${fmtC(current)} ${targetCur}</b></span>
        <span>Осталось: ${fmtC(remain ?? Math.max(0, targetAmt - current))} ${targetCur}</span>
      </div>
      ${assetsHtml}
    </div>`;
  }).join('');
  invInitGoalDnD(el);
}

function invRenderGoalsDash() {
  const goals = invGoals();
  if (!goals.length) return '';
  const base = invBaseCurrency();
  return `
  <div style="margin-bottom:20px;">
    <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
      <span>Финансовые цели</span>
      <button class="btn btn-sm" onclick="invOpenGoals()">⚙ Управление</button>
    </div>
    ${goals.map(g => {
      const { current, pct, targetCur, targetAmt } = invCalcGoalProgress(g);
      const fmtC = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
      const col  = g.color;
      return `
      <div class="goal-card" style="border-left:4px solid ${col};margin-bottom:8px;">
        <div class="goal-card-header">
          <div style="flex:1;min-width:0;">
            <div class="goal-card-name">${g.name}</div>
            <div class="goal-card-target">${fmtC(targetAmt)} ${targetCur}</div>
          </div>
          <div class="goal-pct" style="color:${col}">${pct.toFixed(1)}%</div>
        </div>
        <div class="goal-progress-wrap">
          <div class="goal-progress-bar" style="width:${pct.toFixed(1)}%;background:${col};"></div>
        </div>
        <div class="goal-progress-labels">
          <span style="color:${col};font-weight:600;">${fmtC(current)} ${targetCur}</span>
          <span>из ${fmtC(targetAmt)} ${targetCur}</span>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ══════════════════════════════════════════════════
   SERVICE WORKER (offline cache)
══════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  const swCode = `
const CACHE = 'finance-v1';
const URLS = [
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Unbounded:wght@300;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://accounts.google.com/gsi/client',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok && e.request.url.startsWith('https://')) {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
    }
    return res;
  }).catch(() => new Response('', {status:503}))));
});`;
  const blob = new Blob([swCode], { type:'application/javascript' });
  navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(()=>{});
}

/* ══════════════════════════════════════════════════
   КУРСЫ — отдельная модалка
══════════════════════════════════════════════════ */
function invOpenRatesModal() {
  invRenderRatesModalBody();
  document.getElementById('inv-rates-modal').classList.add('is-open');
}
function invRenderRatesModalBody() {
  const body = document.getElementById('inv-rates-modal-body');
  const pairs = invPairs();
  const base  = invBaseCurrency();
  const curList = invCurrencyList();
  const curName = code => (curList.find(c=>c.code===code)||{name:code}).name;

  body.innerHTML = `
    <!-- Базовая валюта -->
    <div style="margin-bottom:14px;">
      <div style="font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:7px;">Базовая валюта (итог инвентаризации)</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        ${curList.map(c=>`
          <button class="btn btn-sm${base===c.code?' btn-primary':''}"
            onclick="invSetBaseCurrency('${c.code}');invRenderRatesModalBody();"
            style="font-size:10px;">${c.code} — ${c.name}</button>`).join('')}
      </div>
    </div>

    <!-- Пояснение -->
    <div style="padding:8px 10px;background:var(--bg3);border:1px solid var(--line);border-radius:var(--radius-sm);margin-bottom:12px;font-size:10px;color:var(--muted);line-height:1.6;">
      <b style="color:var(--text)">Покупка</b> — вы <b>продаёте</b> исходную валюту банку и получаете целевую.<br>
      <b style="color:var(--text)">Продажа</b> — вы <b>покупаете</b> исходную валюту у банка, отдаёте целевую.<br>
      <span style="color:var(--muted2);">Пример USD/RUP: покупка 16.30 → отдаёте 1 USD, получаете 16.30 RUP. Продажа 16.35 → отдаёте 16.35 RUP, получаете 1 USD.</span>
    </div>

    <!-- Таблица пар с DnD -->
    <div style="font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:8px;padding-top:4px;border-top:1px solid var(--line);">
      Курсы пар
      <span style="font-size:8px;color:var(--muted2);text-transform:none;letter-spacing:0;margin-left:8px;">⠿ тяни для сортировки</span>
    </div>

    <!-- Заголовок колонок -->
    <div style="display:grid;grid-template-columns:20px 1fr 90px 90px 30px;gap:4px;align-items:center;padding:0 0 5px;border-bottom:1px solid var(--line);margin-bottom:4px;">
      <span></span>
      <span style="font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);">Пара</span>
      <span style="font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--green);text-align:right;" title="Вы продаёте исходную валюту банку">↑ Покупка</span>
      <span style="font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);text-align:right;" title="Вы покупаете исходную валюту у банка">↓ Продажа</span>
      <span></span>
    </div>

    <div id="rates-pairs-list">
      ${pairs.map((p,i) => _renderPairRow(p, i, curName)).join('')}
    </div>

    <!-- Кнопки -->
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="btn btn-sm btn-primary" onclick="invToggleAddPairForm()">+ Добавить пару</button>
      <button class="btn btn-sm" onclick="invRatesModalAddCurrency()">+ Добавить валюту</button>
    </div>

    <!-- Форма новой пары -->
    <div id="inv-add-pair-form" style="display:none;margin-top:12px;padding:12px;background:var(--bg3);border:1px solid var(--line2);border-radius:var(--radius-sm);">
      <div style="font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Новая валютная пара</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-size:8px;color:var(--muted2);margin-bottom:3px;">Исходная</div>
          <select class="filter-input" id="np-from" style="width:100%;font-size:11px;">
            ${curList.map(c=>`<option value="${c.code}">${c.code}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:8px;color:var(--muted2);margin-bottom:3px;">Целевая</div>
          <select class="filter-input" id="np-to" style="width:100%;font-size:11px;">
            ${curList.map(c=>`<option value="${c.code}"${c.code===base?' selected':''}>${c.code}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:8px;color:var(--green);margin-bottom:3px;">↑ Покупка</div>
          <input class="rate-field" type="number" id="np-buy" step="0.0001" placeholder="0.0000"
            style="width:100%;text-align:right;" inputmode="decimal">
        </div>
        <div>
          <div style="font-size:8px;color:var(--blue);margin-bottom:3px;">↓ Продажа</div>
          <input class="rate-field" type="number" id="np-sell" step="0.0001" placeholder="0.0000"
            style="width:100%;text-align:right;" inputmode="decimal">
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-primary" onclick="invSaveNewPair()">✓ Добавить</button>
        <button class="btn btn-sm" onclick="document.getElementById('inv-add-pair-form').style.display='none'">Отмена</button>
      </div>
    </div>`;

  // Init DnD after render
  _initPairDnD();
}

function _renderPairRow(p, i, curName) {
  if (!curName) {
    const cl = invCurrencyList();
    curName = code => (cl.find(c=>c.code===code)||{name:code}).name;
  }
  return `<div class="pair-row" data-idx="${i}"
    style="display:grid;grid-template-columns:20px 1fr 90px 90px 30px;gap:4px;align-items:center;
           padding:5px 0;border-bottom:1px solid var(--line);user-select:none;">
    <span class="pair-drag-handle"
      style="cursor:grab;color:var(--muted2);font-size:13px;text-align:center;touch-action:none;"
      title="Перетащи для сортировки">⠿</span>
    <div>
      <span style="font-family:var(--head);font-size:9px;font-weight:700;color:var(--acc2);">${p.from}/${p.to}</span>
      <span style="font-size:9px;color:var(--muted);margin-left:5px;">${curName(p.from)} / ${curName(p.to)}</span>
    </div>
    <input type="number" step="0.0001" value="${p.buy}" inputmode="decimal"
      style="width:100%;text-align:right;background:var(--bg3);border:1px solid var(--line2);
             color:var(--green);font-family:var(--mono);font-size:11px;padding:4px 6px;
             border-radius:var(--radius-sm);outline:none;"
      onfocus="this.style.borderColor='var(--acc)'" onblur="this.style.borderColor='var(--line2)'"
      onchange="invUpdatePair(${i},'buy',this.value)"
      title="Банк покупает ${p.from} у вас">
    <input type="number" step="0.0001" value="${p.sell}" inputmode="decimal"
      style="width:100%;text-align:right;background:var(--bg3);border:1px solid var(--line2);
             color:var(--blue);font-family:var(--mono);font-size:11px;padding:4px 6px;
             border-radius:var(--radius-sm);outline:none;"
      onfocus="this.style.borderColor='var(--acc)'" onblur="this.style.borderColor='var(--line2)'"
      onchange="invUpdatePair(${i},'sell',this.value)"
      title="Банк продаёт ${p.from} вам">
    <button class="btn btn-sm btn-danger" onclick="invDeletePair(${i})"
      style="padding:3px 6px;font-size:11px;" title="Удалить пару">✕</button>
  </div>`;
}

function invToggleAddPairForm() {
  const f = document.getElementById('inv-add-pair-form');
  if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
}

// ── Pair DnD ──────────────────────────────────────
let _pairDnd = { fromIdx: null, touchTarget: null };

function _initPairDnD() {
  const list = document.getElementById('rates-pairs-list');
  if (!list) return;

  list.querySelectorAll('.pair-row').forEach(row => {
    const handle = row.querySelector('.pair-drag-handle');
    if (!handle) return;

    // Desktop
    handle.addEventListener('mousedown', () => { row.setAttribute('draggable','true'); });
    document.addEventListener('mouseup', () => { row.setAttribute('draggable','false'); }, { once: true });

    row.addEventListener('dragstart', e => {
      _pairDnd.fromIdx = parseInt(row.dataset.idx);
      setTimeout(() => { row.style.opacity = '0.4'; }, 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      row.setAttribute('draggable','false');
      list.querySelectorAll('.pair-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      _pairDnd.fromIdx = null;
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const idx = parseInt(row.dataset.idx);
      if (idx === _pairDnd.fromIdx) return;
      list.querySelectorAll('.pair-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      const rect = row.getBoundingClientRect();
      row.style[e.clientY > rect.top + rect.height/2 ? 'borderBottom':'borderTop'] = '2px solid var(--acc)';
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) { row.style.borderTop=''; row.style.borderBottom=''; }
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.style.borderTop=''; row.style.borderBottom='';
      const toIdx = parseInt(row.dataset.idx);
      if (_pairDnd.fromIdx === null || toIdx === _pairDnd.fromIdx) return;
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height/2;
      _reorderPair(_pairDnd.fromIdx, toIdx, after);
    });

    // Touch
    handle.addEventListener('touchstart', e => {
      _pairDnd.fromIdx = parseInt(row.dataset.idx);
      row.style.opacity = '0.5';
      row.style.boxShadow = '0 4px 16px rgba(0,0,0,.4)';
      e.preventDefault();
    }, { passive: false });
    handle.addEventListener('touchmove', e => {
      if (_pairDnd.fromIdx === null) return;
      e.preventDefault();
      const cy = e.touches[0].clientY;
      list.querySelectorAll('.pair-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      _pairDnd.touchTarget = null;
      list.querySelectorAll('.pair-row').forEach(r => {
        if (parseInt(r.dataset.idx) === _pairDnd.fromIdx) return;
        const rect = r.getBoundingClientRect();
        if (cy >= rect.top && cy <= rect.bottom) {
          const after = cy > rect.top + rect.height/2;
          r.style[after ? 'borderBottom':'borderTop'] = '2px solid var(--acc)';
          _pairDnd.touchTarget = { idx: parseInt(r.dataset.idx), after };
        }
      });
    }, { passive: false });
    handle.addEventListener('touchend', () => {
      row.style.opacity = ''; row.style.boxShadow = '';
      list.querySelectorAll('.pair-row').forEach(r => { r.style.borderTop=''; r.style.borderBottom=''; });
      if (_pairDnd.touchTarget) {
        _reorderPair(_pairDnd.fromIdx, _pairDnd.touchTarget.idx, _pairDnd.touchTarget.after);
      }
      _pairDnd = { fromIdx: null, touchTarget: null };
    });
  });
}

function _reorderPair(fromIdx, toIdx, after) {
  const pairs = invState.pairs;
  if (fromIdx < 0 || fromIdx >= pairs.length) return;
  const [moved] = pairs.splice(fromIdx, 1);
  let newIdx = pairs.findIndex((_, i) => i === (fromIdx < toIdx ? toIdx-1 : toIdx));
  if (newIdx < 0) newIdx = pairs.length;
  pairs.splice(after ? newIdx+1 : newIdx, 0, moved);
  invSaveState();
  invRenderRatesModalBody();
}

function invSetBaseCurrency(code) {
  invState.baseCurrency = code;
  invSaveState();
  if (invCurId) invRenderCurrent(); else invShowDashboard();
}
function invUpdatePair(idx, field, val) {
  const p = invState.pairs[idx];
  if (!p) return;
  p[field] = parseFloat(val) || 0;
  invSaveState();
  if (invCurId) invRenderCurrent(); else invShowDashboard();
}
function invDeletePair(idx) {
  appConfirm('Удалить эту валютную пару?').then(ok => {
    if (!ok) return;
    invState.pairs.splice(idx, 1);
    invSaveState();
    invRenderRatesModalBody();
  });
}
function invSaveNewPair() {
  const from = document.getElementById('np-from').value;
  const to   = document.getElementById('np-to').value;
  const buy  = parseFloat(document.getElementById('np-buy').value) || 0;
  const sell = parseFloat(document.getElementById('np-sell').value) || 0;
  if (from === to) { showInlineErr('np-to', 'Исходная и целевая валюта не могут совпадать'); return; }
  if (!buy || !sell) { showInlineErr('np-sell', 'Введи оба курса'); return; }
  if (!invState.pairs) invState.pairs = [];
  const exists = invState.pairs.find(p => p.from===from && p.to===to);
  if (exists) { showInlineErr('np-to', `Пара ${from}/${to} уже существует`); return; }
  invState.pairs.push({ from, to, buy, sell });
  invSaveState();
  invRenderRatesModalBody();
}
function invRatesModalAddCurrency() {
  invCloseRatesModal();
  invOpenCurrencyModal();
}
function invCloseRatesModal() {
  document.getElementById('inv-rates-modal').classList.remove('is-open');
}

/* ══════════════════════════════════════════════════
   КАТЕГОРИИ — эмодзи-тоггл, экспорт/импорт
══════════════════════════════════════════════════ */
function opsCatIconOf(cat) {
  return opsState.catUseEmoji === true ? cat.icon : '';
}

function opsCatEmojiToggle(val) {
  opsState.catUseEmoji = val;
  opsSave();
  document.getElementById('cat-emoji-label').textContent = val ? 'вкл' : 'выкл';
  opsCatConfigRender();
}

function opsCatExport() {
  const blob = new Blob([JSON.stringify(opsCats(), null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `finance_cats_${new Date().toISOString().slice(0,10)}.json`; a.click();
}

function opsCatImport(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const cats = JSON.parse(e.target.result);
      if (!Array.isArray(cats)) throw new Error('bad format');
      // confirm removed - sandbox incompatible
      opsState.categories = cats; opsSave(); opsCatConfigRender();
    } catch(err) { showErr('Ошибка: ' + err.message); }
  };
  r.readAsText(file); input.value = '';
}

// (Drive push for opsCatAdd is handled inside the function itself)

/* ══════════════════════════════════════════════════
   БЫСТРЫЙ ВВОД — переработка
══════════════════════════════════════════════════ */
// Overwrite quickInputSubmit completely
quickInputSubmit = function() {
  const inp = document.getElementById('quick-input');
  const raw = inp.value.trim();
  const hint = document.getElementById('quick-input-hint');
  if (!raw) return;

  let _hintTimer = null;
  function showHint(msg, color) {
    clearTimeout(_hintTimer);
    hint.style.color = color;
    hint.textContent = msg;
    hint.style.display = 'block';
    _hintTimer = setTimeout(() => { hint.style.display = 'none'; hint.textContent = ''; }, 3000);
  }

  let str = raw, type = 'expense', way = 'Безналичный', cat = '', amount = 0, comment = '';

  // Знак и сумма: без знака или + → приход, - → расход
  const amtMatch = str.match(/^([+\-]?)(\d+(?:[.,]\d+)?)/);
  if (!amtMatch) {
    showHint('⚠ Не найдена сумма. Формат: [+/-][сумма] [нал|безнал] [коммент]', 'var(--red)');
    return;
  }
  type = amtMatch[1] === '-' ? 'expense' : 'income';
  amount = parseFloat(amtMatch[2].replace(',','.'));
  str = str.slice(amtMatch[0].length).trim();

  // Способ
  const wayM = str.match(/^(нал(?:\.|ичн\w*)?|безнал(?:\.|ичн\w*)?)\s*/i);
  if (wayM) {
    way = wayM[1].toLowerCase().startsWith('нал') ? 'Наличный' : 'Безналичный';
    str = str.slice(wayM[0].length).trim();
  }

  // Нечёткий поиск категории по первому слову
  const words = str.split(/\s+/);
  if (words.length > 1) {
    const w = words[0].toLowerCase();
    const found = opsCats().find(c =>
      c.name.toLowerCase().startsWith(w) || w.startsWith(c.name.toLowerCase().slice(0,3))
    );
    if (found) { cat = found.id; words.shift(); }
  }
  comment = words.join(' ');

  const date = new Date().toISOString().slice(0,10);
  const finalAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
  opsState.txns.push({ id: opsGenId(), date, type, way, amount: finalAmount, comment, cat, _editedAt: new Date().toISOString() });
  opsSave(); opsReRenderCurrent();
  if (driveToken) driveDebouncedPush('ops');

  const catName = cat ? opsCats().find(c=>c.id===cat)?.name : '';
  showHint(`✓ ${type==='income'?'+':'−'}${amount} · ${way==='Наличный'?'нал':'безнал'}${catName?' · '+catName:''}${comment?' · '+comment:''}`, 'var(--green)');
  inp.value = '';
};

// ── Mobile quick input ────────────────────────────
function qiToggle() {
  const bar = document.getElementById('qi-bar');
  const btn = document.getElementById('qi-toggle-btn');
  const inp = document.getElementById('qi-mobile-input');
  const isOpen = bar.classList.toggle('is-visible');
  btn.classList.toggle('is-active', isOpen);
  if (isOpen) { setTimeout(() => inp.focus(), 60); }
}
function qiClose() {
  document.getElementById('qi-bar').classList.remove('is-visible');
  document.getElementById('qi-toggle-btn').classList.remove('is-active');
}
function qiMobileSubmit() {
  const mobileInp = document.getElementById('qi-mobile-input');
  // Temporarily point quick-input to mobile input value
  const desktopInp = document.getElementById('quick-input');
  const saved = desktopInp.value;
  desktopInp.value = mobileInp.value;
  quickInputSubmit();
  // quickInputSubmit clears desktopInp, read result
  mobileInp.value = '';
  desktopInp.value = saved;
  qiClose();
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
// Ops: determine default month
const opsMonths = getMonths();
if (opsMonths.length) p4Month = opsMonths[opsMonths.length - 1];
renderP1();

// Inv: load sidebar + show dashboard by default
invLoadRates();
invRenderSidebar();
invShowDashboard();
