/* ══════════════════════════════════════════════════
   theme.js — настройка внешнего вида
   CSS-переменные, пресеты тем, импорт/экспорт,
   сохранение в localStorage.
   При запуске автоматически восстанавливает тему.
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   ТЕМА — настройки интерфейса
══════════════════════════════════════════════════ */

const THEME_VARS = [
  { key:'--bg',        label:'Фон основной',       group:'Фоны' },
  { key:'--bg2',       label:'Фон панелей',         group:'Фоны' },
  { key:'--bg3',       label:'Фон элементов',       group:'Фоны' },
  { key:'--bg4',       label:'Фон акцентных эл.',   group:'Фоны' },
  { key:'--line',      label:'Линии основные',       group:'Линии' },
  { key:'--line2',     label:'Линии второстепенные', group:'Линии' },
  { key:'--acc',       label:'Акцент основной',      group:'Акценты' },
  { key:'--acc2',      label:'Акцент светлый',       group:'Акценты' },
  { key:'--text',      label:'Текст основной',       group:'Текст' },
  { key:'--muted',     label:'Текст приглушённый',   group:'Текст' },
  { key:'--muted2',    label:'Текст тёмный',         group:'Текст' },
  { key:'--green',     label:'Зелёный (доход)',      group:'Семантика' },
  { key:'--red',       label:'Красный (расход)',     group:'Семантика' },
  { key:'--amber',     label:'Жёлтый (предупр.)',    group:'Семантика' },
  { key:'--blue',      label:'Синий (инфо)',         group:'Семантика' },
];

const THEME_PRESETS = [
  {
    id: 'dark',
    name: 'Тёмная (по умолчанию)',
    dots: ['#0f0f10','#7c6af7','#3ecf8e','#e8e8f0'],
    vars: {
      '--bg':'#0f0f10','--bg2':'#18181c','--bg3':'#22222a','--bg4':'#2a2a35',
      '--line':'#2e2e38','--line2':'#3a3a48',
      '--acc':'#7c6af7','--acc2':'#a390ff',
      '--text':'#e8e8f0','--muted':'#7b7b90','--muted2':'#555568',
      '--green':'#3ecf8e','--red':'#f87171','--amber':'#fbbf24','--blue':'#60a5fa',
      '--green-bg':'#0d2e1e','--red-bg':'#2e0d0d','--amber-bg':'#1e1e0d','--blue-bg':'#0d1e2e',
    }
  },
  {
    id: 'light',
    name: 'Светлая',
    dots: ['#f5f5f7','#5b4fcf','#16a85a','#1a1a2e'],
    vars: {
      '--bg':'#f5f5f7','--bg2':'#ffffff','--bg3':'#ebebf0','--bg4':'#dddde8',
      '--line':'#d0d0dc','--line2':'#b8b8cc',
      '--acc':'#5b4fcf','--acc2':'#7c6af7',
      '--text':'#1a1a2e','--muted':'#6b6b80','--muted2':'#9898aa',
      '--green':'#16a85a','--red':'#dc2626','--amber':'#d97706','--blue':'#2563eb',
      '--green-bg':'#dcfce7','--red-bg':'#fee2e2','--amber-bg':'#fef3c7','--blue-bg':'#dbeafe',
    }
  },
  {
    id: 'midnight',
    name: 'Полночь',
    dots: ['#060612','#a78bfa','#34d399','#f8fafc'],
    vars: {
      '--bg':'#060612','--bg2':'#0d0d1f','--bg3':'#14142b','--bg4':'#1c1c38',
      '--line':'#1e1e3a','--line2':'#2a2a50',
      '--acc':'#a78bfa','--acc2':'#c4b5fd',
      '--text':'#f8fafc','--muted':'#94a3b8','--muted2':'#64748b',
      '--green':'#34d399','--red':'#f87171','--amber':'#fbbf24','--blue':'#93c5fd',
      '--green-bg':'#022c22','--red-bg':'#2d0000','--amber-bg':'#1c1500','--blue-bg':'#001a3a',
    }
  },
  {
    id: 'slate',
    name: 'Сланец',
    dots: ['#0f172a','#38bdf8','#4ade80','#e2e8f0'],
    vars: {
      '--bg':'#0f172a','--bg2':'#1e293b','--bg3':'#263348','--bg4':'#2d3f57',
      '--line':'#334155','--line2':'#475569',
      '--acc':'#38bdf8','--acc2':'#7dd3fc',
      '--text':'#e2e8f0','--muted':'#94a3b8','--muted2':'#64748b',
      '--green':'#4ade80','--red':'#f87171','--amber':'#fb923c','--blue':'#60a5fa',
      '--green-bg':'#052e16','--red-bg':'#2d0000','--amber-bg':'#1c0a00','--blue-bg':'#001233',
    }
  },
  {
    id: 'mocha',
    name: 'Мокко',
    dots: ['#1c1410','#c9956b','#86c083','#f0e8df'],
    vars: {
      '--bg':'#1c1410','--bg2':'#26201a','--bg3':'#302822','--bg4':'#3d342c',
      '--line':'#3a2e25','--line2':'#4d3f33',
      '--acc':'#c9956b','--acc2':'#e0b590',
      '--text':'#f0e8df','--muted':'#9e8e80','--muted2':'#6b5c50',
      '--green':'#86c083','--red':'#d47a7a','--amber':'#d4a84b','--blue':'#7aaccf',
      '--green-bg':'#112010','--red-bg':'#2a1010','--amber-bg':'#1e1500','--blue-bg':'#0d1e2a',
    }
  },
];

const THEME_STORAGE_KEY = 'finTheme';

function themeLoad() {
  try { return JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || 'null') || {}; }
  catch { return {}; }
}

function themeApply(vars) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
    // Update acc-glow when acc changes
    if (k === '--acc') {
      const r = parseInt(v.slice(1,3),16), g = parseInt(v.slice(3,5),16), b = parseInt(v.slice(5,7),16);
      root.style.setProperty('--acc-glow', `rgba(${r},${g},${b},.08)`);
    }
  }
  // Refresh charts so they pick up new CSS vars
  themeRefreshCharts();
}

function themeRefreshCharts() {
  // Only refresh if functions are already defined (not during initial load)
  if (typeof renderP1 === 'function') {
    try { renderP1(); } catch(e) {}
  }
  if (typeof invChartA !== 'undefined' && invChartA && typeof invShowDashboard === 'function') {
    try { invShowDashboard(); } catch(e) {}
  }
}

function themeSave(vars) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(vars));
}

function themeGetCurrentVars() {
  const style = getComputedStyle(document.documentElement);
  const out = {};
  for (const v of THEME_VARS) out[v.key] = style.getPropertyValue(v.key).trim();
  return out;
}

function themeDetectPreset() {
  const cur = themeGetCurrentVars();
  for (const p of THEME_PRESETS) {
    if (THEME_VARS.every(v => !p.vars[v.key] || p.vars[v.key] === cur[v.key])) return p.id;
  }
  return null;
}

// ── Пользовательская тема — quick pickers + live preview ─
const THEME_QUICK_VARS = [
  { key:'--bg',   label:'Фон',         hint:'основной фон страницы' },
  { key:'--bg2',  label:'Панели',      hint:'сайдбар, топбар' },
  { key:'--acc',  label:'Акцент',      hint:'кнопки, активные элементы' },
  { key:'--text', label:'Текст',       hint:'основной цвет текста' },
  { key:'--green',label:'Доход',       hint:'цвет дохода / позитив' },
  { key:'--red',  label:'Расход',      hint:'цвет расхода / негатив' },
];

// Temporary state for the preview (doesn't apply to app until "Применить")
let _themeCustomDraft = {};

function themeInitCustom() {
  const style = getComputedStyle(document.documentElement);
  _themeCustomDraft = {};
  for (const v of THEME_QUICK_VARS) {
    _themeCustomDraft[v.key] = style.getPropertyValue(v.key).trim() || '#000000';
  }
  themeRenderQuickPickers();
  themeRenderPreview();
}

function themeRenderQuickPickers() {
  document.getElementById('theme-quick-pickers').innerHTML = THEME_QUICK_VARS.map(v => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
      <input type="color" class="theme-color-input"
             value="${_themeCustomDraft[v.key] || '#000000'}"
             data-key="${v.key}"
             oninput="themeCustomPickerChange('${v.key}', this.value)"
             title="${v.hint}">
      <div style="flex:1;">
        <div style="font-size:11px;color:var(--text);">${v.label}</div>
        <div style="font-size:9px;color:var(--muted2);">${v.hint}</div>
      </div>
    </div>`).join('');
}

function themeCustomPickerChange(key, val) {
  _themeCustomDraft[key] = val;
  themeRenderPreview();
}

function themeRenderPreview() {
  const d = _themeCustomDraft;
  const bg    = d['--bg']    || '#0f0f10';
  const bg2   = d['--bg2']   || '#18181c';
  const acc   = d['--acc']   || '#7c6af7';
  const text  = d['--text']  || '#e8e8f0';
  const green = d['--green'] || '#3ecf8e';
  const red   = d['--red']   || '#f87171';

  // Derive secondary colors from primaries
  const muted  = blendHex(text, bg, 0.45);
  const line   = blendHex(bg2, bg, 0.5);
  const bg3    = blendHex(bg2, bg, 0.35);

  document.getElementById('theme-preview-box').innerHTML = `
  <div style="background:${bg2};padding:8px 10px;border-bottom:1px solid ${line};display:flex;align-items:center;gap:7px;">
    <span style="color:${acc};font-size:11px;font-family:var(--head);letter-spacing:.1em;">◈ ФИНАНСЫ</span>
    <span style="flex:1"></span>
    <span style="width:8px;height:8px;border-radius:50%;background:${green};display:inline-block;"></span>
  </div>
  <div style="display:flex;height:130px;">
    <div style="background:${bg2};width:72px;border-right:1px solid ${line};padding:8px 6px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
      <div style="background:${acc}22;border-left:2px solid ${acc};padding:4px 6px;border-radius:2px;font-size:8px;color:${acc};">Операции</div>
      <div style="padding:4px 6px;font-size:8px;color:${muted};">Безналич.</div>
      <div style="padding:4px 6px;font-size:8px;color:${muted};">Наличные</div>
      <div style="padding:4px 6px;font-size:8px;color:${muted};">По месяц.</div>
      <div style="flex:1"></div>
      <div style="background:${acc};border-radius:3px;padding:4px 6px;font-size:8px;color:#fff;text-align:center;">+ Операция</div>
    </div>
    <div style="background:${bg};flex:1;padding:8px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px;">
        <div style="background:${bg2};border:1px solid ${line};border-radius:4px;padding:6px 8px;">
          <div style="font-size:7px;color:${muted};margin-bottom:3px;letter-spacing:.1em;">ДОХОД</div>
          <div style="font-size:11px;color:${green};font-family:var(--head);">+12 450</div>
        </div>
        <div style="background:${bg2};border:1px solid ${line};border-radius:4px;padding:6px 8px;">
          <div style="font-size:7px;color:${muted};margin-bottom:3px;letter-spacing:.1em;">РАСХОД</div>
          <div style="font-size:11px;color:${red};font-family:var(--head);">−8 320</div>
        </div>
      </div>
      <div style="background:${bg2};border:1px solid ${line};border-radius:4px;overflow:hidden;">
        ${[
          ['15 апр', 'Зарплата',   '+5 000', green, 'Безнал.'],
          ['14 апр', 'Продукты',   '−1 240', red,   'Нал.'],
          ['13 апр', 'Перевод',    '+3 200', green, 'Безнал.'],
        ].map(([date,label,amt,color,tag]) => `
          <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid ${line};">
            <span style="font-size:8px;color:${muted};width:30px;">${date}</span>
            <span style="flex:1;font-size:9px;color:${text};">${label}</span>
            <span style="font-size:8px;background:${bg3};color:${muted};padding:1px 5px;border-radius:10px;">${tag}</span>
            <span style="font-size:9px;color:${color};font-weight:600;">${amt}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

// Blend two hex colors: 0=color1, 1=color2
function blendHex(hex1, hex2, t) {
  try {
    const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const [r1,g1,b1] = p(hex1.trim());
    const [r2,g2,b2] = p(hex2.trim());
    const r = Math.round(r1*(1-t) + r2*t);
    const g = Math.round(g1*(1-t) + g2*t);
    const b = Math.round(b1*(1-t) + b2*t);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex1; }
}

function themeApplyCustom() {
  const d = _themeCustomDraft;
  const bg    = d['--bg'];
  const bg2   = d['--bg2'];
  const acc   = d['--acc'];
  const text  = d['--text'];
  const green = d['--green'];
  const red   = d['--red'];

  // Auto-derive the rest
  const vars = {
    '--bg':    bg,
    '--bg2':   bg2,
    '--bg3':   blendHex(bg2, bg, 0.35),
    '--bg4':   blendHex(bg2, bg, 0.6),
    '--line':  blendHex(bg2, bg, 0.5),
    '--line2': blendHex(bg2, bg, 0.75),
    '--acc':   acc,
    '--acc2':  blendHex(acc, '#ffffff', 0.25),
    '--text':  text,
    '--muted': blendHex(text, bg, 0.45),
    '--muted2':blendHex(text, bg, 0.65),
    '--green': green,
    '--red':   red,
    '--amber': d['--amber'] || '#fbbf24',
    '--blue':  d['--blue']  || '#60a5fa',
    '--green-bg': blendHex(green, bg, 0.85),
    '--red-bg':   blendHex(red,   bg, 0.85),
    '--amber-bg': blendHex(d['--amber'] || '#fbbf24', bg, 0.85),
    '--blue-bg':  blendHex(d['--blue']  || '#60a5fa', bg, 0.85),
  };
  themeApply(vars);
  themeSave(vars);
  themeRenderPresets();
  themeRenderVars();
}

function themeOpenModal() {
  themeRenderPresets();
  themeRenderVars();
  themeInitCustom();
  document.getElementById('theme-modal').classList.add('is-open');
}
function themeCloseModal() {
  document.getElementById('theme-modal').classList.remove('is-open');
}

function themeRenderPresets() {
  const active = themeDetectPreset();
  document.getElementById('theme-presets').innerHTML = THEME_PRESETS.map(p => `
    <div class="theme-swatch ${p.id === active ? 'is-active' : ''}" onclick="themeApplyPreset('${p.id}')">
      <div class="theme-swatch-preview">
        ${p.dots.map(d => `<div class="theme-swatch-dot" style="background:${d}"></div>`).join('')}
      </div>
      <span class="theme-swatch-label">${p.name}</span>
      ${p.id === active ? '<span class="theme-swatch-check">✓</span>' : ''}
    </div>`).join('');
}

function themeRenderVars() {
  const style = getComputedStyle(document.documentElement);
  let lastGroup = null;
  let html = '';
  for (const v of THEME_VARS) {
    if (v.group !== lastGroup) {
      if (lastGroup !== null) html += '</div>';
      html += `<div style="font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);
                           margin:10px 0 4px;">${v.group}</div><div>`;
      lastGroup = v.group;
    }
    const val = style.getPropertyValue(v.key).trim() || '#000000';
    html += `<div class="theme-var-row">
      <span class="theme-var-key">${v.key}</span>
      <span class="theme-var-label">${v.label}</span>
      <input type="color" class="theme-color-input" value="${val}"
        data-key="${v.key}"
        oninput="themeOnColorChange('${v.key}', this.value)">
    </div>`;
  }
  if (lastGroup !== null) html += '</div>';
  document.getElementById('theme-vars').innerHTML = html;

  // Toggle arrow on details open
  const det = document.querySelector('#theme-modal details');
  if (det) {
    det.addEventListener('toggle', () => {
      document.getElementById('theme-advanced-arrow').style.transform =
        det.open ? 'rotate(90deg)' : '';
    });
  }
}

function themeOnColorChange(key, val) {
  const patch = { [key]: val };
  const root = document.documentElement;
  root.style.setProperty(key, val);
  if (key === '--acc') {
    const r = parseInt(val.slice(1,3),16), g = parseInt(val.slice(3,5),16), b = parseInt(val.slice(5,7),16);
    root.style.setProperty('--acc-glow', `rgba(${r},${g},${b},.08)`);
  }
  // persist
  const saved = themeLoad();
  saved[key] = val;
  themeSave(saved);
  themeRenderPresets();
  // lightweight chart color update (no full re-render)
  themeUpdateChartColors();
}

function themeUpdateChartColors() {
  const cd = getChartDefaults();
  // Update all Chart.js instances
  for (const inst of [
    typeof chart1Inst !== 'undefined' && chart1Inst,
    typeof invChartA  !== 'undefined' && invChartA,
    typeof invChartB  !== 'undefined' && invChartB,
  ]) {
    if (!inst) continue;
    try {
      inst.options.plugins.legend.labels.color  = cd.plugins.legend.labels.color;
      inst.options.plugins.tooltip.backgroundColor = cd.plugins.tooltip.backgroundColor;
      inst.options.plugins.tooltip.borderColor     = cd.plugins.tooltip.borderColor;
      inst.options.plugins.tooltip.titleColor      = cd.plugins.tooltip.titleColor;
      inst.options.plugins.tooltip.bodyColor       = cd.plugins.tooltip.bodyColor;
      if (inst.options.scales?.x) {
        inst.options.scales.x.ticks.color = cd.scales.x.ticks.color;
        inst.options.scales.x.grid.color  = cd.scales.x.grid.color;
        inst.options.scales.y.ticks.color = cd.scales.y.ticks.color;
        inst.options.scales.y.grid.color  = cd.scales.y.grid.color;
      }
      inst.update('none'); // no animation for live preview
    } catch(e) {}
  }
  // Also update dataset colors for known charts
  const cGreen = cssVar('--green'), cRed = cssVar('--red'), cAcc = cssVar('--acc');
  if (typeof chart1Inst !== 'undefined' && chart1Inst?.data?.datasets?.length >= 2) {
    chart1Inst.data.datasets[0].backgroundColor = cGreen + '8c';
    chart1Inst.data.datasets[0].borderColor      = cGreen;
    chart1Inst.data.datasets[1].backgroundColor  = cRed + '8c';
    chart1Inst.data.datasets[1].borderColor       = cRed;
    chart1Inst.update('none');
  }
  if (typeof invChartA !== 'undefined' && invChartA?.data?.datasets?.length >= 2) {
    invChartA.data.datasets[0].borderColor      = cAcc;
    invChartA.data.datasets[0].backgroundColor  = cAcc + '1a';
    invChartA.data.datasets[0].pointBackgroundColor = cAcc;
    invChartA.data.datasets[1].borderColor      = cGreen;
    invChartA.data.datasets[1].pointBackgroundColor = cGreen;
    invChartA.update('none');
  }
  if (typeof invChartB !== 'undefined' && invChartB?.data?.datasets?.[0]) {
    const rows = invChartB._rows || [];
    const colors = rows.map(r => r.diff===null ? 'transparent' : r.diff>=0 ? cGreen+'a6' : cRed+'a6');
    if (colors.length) {
      invChartB.data.datasets[0].backgroundColor = colors;
      invChartB.data.datasets[0].borderColor      = colors;
      invChartB.update('none');
    }
  }
}

function themeApplyPreset(id) {
  const preset = THEME_PRESETS.find(p => p.id === id);
  if (!preset) return;
  themeApply(preset.vars);
  themeSave(preset.vars);
  themeRenderPresets();
  themeRenderVars();
  // sync custom builder pickers to new preset values
  if (document.getElementById('theme-quick-pickers')) themeInitCustom();
}

function themeReset() {
  // confirm removed - proceed
  localStorage.removeItem(THEME_STORAGE_KEY);
  themeApplyPreset('dark');
}

function themeExport() {
  const vars = themeGetCurrentVars();
  const blob = new Blob([JSON.stringify(vars, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finance_theme_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function themeImport(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const vars = JSON.parse(e.target.result);
      if (typeof vars !== 'object') throw new Error('bad format');
      themeApply(vars);
      themeSave(vars);
      themeRenderPresets();
      themeRenderVars();
    } catch(err) { showErr('Ошибка: ' + err.message); }
  };
  r.readAsText(file);
  input.value = '';
}

// ── Restore theme on load ─────────────────────────
(function() {
  const saved = themeLoad();
  if (Object.keys(saved).length) themeApply(saved);
})();
