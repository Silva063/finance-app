/* ══════════════════════════════════════════════════
   snapshot.js — архив точек сохранения
   Локальное хранение снимков (localStorage) +
   синхронизация с Google Drive (папка FinanceApp/snapshots/).
   Позволяет откатиться к любому предыдущему состоянию.
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   SNAPSHOT ARCHIVE ENGINE
   Точки сохранения — локально (localStorage) + Google Drive
   Drive: папка FinanceApp/snapshots/
══════════════════════════════════════════════════ */

const SNAP_LS_KEY       = 'finSnapshots';
const SNAP_DRIVE_FOLDER = 'snapshots';
const SNAP_MAX_LOCAL    = 50;
let   snapDriveFolderId = null;

// ── Storage ───────────────────────────────────────
function snapLoadAll() {
  try { const s = localStorage.getItem(SNAP_LS_KEY); if (s) return JSON.parse(s); } catch(e) {}
  return [];
}
function snapSaveAll(list) {
  try { localStorage.setItem(SNAP_LS_KEY, JSON.stringify(list)); } catch(e) {
    snapStatus('Ошибка: localStorage переполнен', 'err');
  }
}

// ── Modal ─────────────────────────────────────────
function snapOpenModal() {
  const drvBtn  = document.getElementById('snap-drive-btn');
  const syncBtn = document.getElementById('snap-sync-list-btn');
  if (drvBtn)  drvBtn.disabled  = !driveToken;
  if (syncBtn) syncBtn.disabled = !driveToken;
  snapRenderList();
  document.getElementById('snap-modal').classList.add('is-open');
}
function snapCloseModal() {
  document.getElementById('snap-modal').classList.remove('is-open');
}

// ── Status line ───────────────────────────────────
function snapStatus(msg, type = 'info') {
  const el = document.getElementById('snap-create-status');
  if (!el) return;
  const colors = { ok:'var(--green)', err:'var(--red)', warn:'var(--amber)', info:'var(--muted)' };
  el.style.color = colors[type] || 'var(--muted)';
  el.textContent = msg;
}

// ── Build payload ─────────────────────────────────
function snapBuildPayload(label) {
  return {
    id:        'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    label:     label,
    createdAt: new Date().toISOString(),
    ops:       JSON.parse(JSON.stringify(opsState)),
    inv:       JSON.parse(JSON.stringify(invState)),
  };
}

// ── Create ────────────────────────────────────────
async function snapCreate(withDrive) {
  const inp   = document.getElementById('snap-label-input');
  const label = (inp.value || '').trim() ||
    ('Точка ' + new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }));

  const list = snapLoadAll();
  if (list.length >= SNAP_MAX_LOCAL) {
    snapStatus(`Лимит ${SNAP_MAX_LOCAL} точек — удали старые`, 'warn'); return;
  }

  const payload = snapBuildPayload(label);
  const dataKey = SNAP_LS_KEY + '_data_' + payload.id;
  try { localStorage.setItem(dataKey, JSON.stringify(payload)); } catch(e) {
    snapStatus('Ошибка: localStorage переполнен', 'err'); return;
  }

  const meta = { id: payload.id, label: payload.label, createdAt: payload.createdAt, onDrive: false, driveName: null };
  list.unshift(meta);
  snapSaveAll(list);
  inp.value = '';

  if (withDrive) {
    if (!driveToken) { snapStatus('Нет Drive — сохранено только локально', 'warn'); snapRenderList(); return; }
    snapStatus('Загрузка на Drive…', 'info');
    try {
      await snapEnsureFolder();
      const fname = 'snap_' + payload.id + '.json';
      await snapUploadFile(fname, payload);
      meta.onDrive = true; meta.driveName = fname;
      snapSaveAll(list);
      snapStatus('✓ Сохранено локально и на Drive', 'ok');
    } catch(e) { snapStatus('Локально ОК, Drive ошибка: ' + e.message, 'warn'); }
  } else {
    snapStatus('✓ Сохранено локально', 'ok');
  }

  snapRenderList();
  syncLog('◈ Точка сохранения: ' + label, 'ok');
}

// ── Restore ───────────────────────────────────────
async function snapRestore(id) {
  // confirm removed - proceed

  let payload = null;
  try { const s = localStorage.getItem(SNAP_LS_KEY + '_data_' + id); if (s) payload = JSON.parse(s); } catch(e) {}

  if (!payload) {
    const meta = snapLoadAll().find(s => s.id === id);
    if (meta && meta.onDrive && meta.driveName && driveToken) {
      snapStatus('Загрузка с Drive…', 'info');
      try { payload = await snapDownloadFile(meta.driveName); }
      catch(e) { snapStatus('Ошибка Drive: ' + e.message, 'err'); return; }
    }
  }

  if (!payload) { showErr('Данные не найдены ни локально, ни на Drive.'); return; }

  if (payload.ops) { opsState = payload.ops; opsSave(); opsReRenderCurrent(); }
  if (payload.inv) { invState = payload.inv; invSaveState(); invLoadRates(); invCurId = null; invRenderSidebar(); }

  snapStatus('✓ Восстановлено: ' + payload.label, 'ok');
  syncLog('◈ Восстановлена точка: ' + payload.label, 'ok');
  snapCloseModal();
}

// ── Delete ────────────────────────────────────────
async function snapDelete(id) {
  const list = snapLoadAll();
  const meta = list.find(s => s.id === id);
  if (!meta) return;
  // confirm removed - proceed

  try { localStorage.removeItem(SNAP_LS_KEY + '_data_' + id); } catch(e) {}

  if (meta.onDrive && meta.driveName && driveToken) {
    try { await snapDeleteFile(meta.driveName); } catch(e) {}
  }

  snapSaveAll(list.filter(s => s.id !== id));
  snapRenderList();
  syncLog('◈ Удалена точка: ' + meta.label, 'info');
}

// ── Upload to Drive (for local-only items) ────────
async function snapUploadToDrive_byId(id) {
  const list = snapLoadAll();
  const meta = list.find(s => s.id === id);
  if (!meta || !driveToken) return;
  let payload = null;
  try { const s = localStorage.getItem(SNAP_LS_KEY + '_data_' + id); if (s) payload = JSON.parse(s); } catch(e) {}
  if (!payload) { showErr('Локальные данные не найдены'); return; }
  snapStatus('Загрузка на Drive…', 'info');
  try {
    await snapEnsureFolder();
    const fname = 'snap_' + payload.id + '.json';
    await snapUploadFile(fname, payload);
    meta.onDrive = true; meta.driveName = fname;
    snapSaveAll(list);
    snapStatus('✓ Загружено на Drive', 'ok');
    snapRenderList();
  } catch(e) { snapStatus('Ошибка Drive: ' + e.message, 'err'); }
}

// ── Download to local (for Drive-only items) ──────
async function snapDownloadToLocal(id) {
  const list = snapLoadAll();
  const meta = list.find(s => s.id === id);
  if (!meta || !meta.onDrive || !driveToken) return;
  snapStatus('Загрузка с Drive…', 'info');
  try {
    const payload = await snapDownloadFile(meta.driveName);
    if (!payload) { snapStatus('Файл не найден на Drive', 'warn'); return; }
    localStorage.setItem(SNAP_LS_KEY + '_data_' + id, JSON.stringify(payload));
    snapStatus('✓ Скачано локально', 'ok');
    snapRenderList();
  } catch(e) { snapStatus('Ошибка Drive: ' + e.message, 'err'); }
}

// ── Sync list from Drive ──────────────────────────
async function snapSyncListFromDrive() {
  if (!driveToken) { showErr('Сначала войди в Google Drive'); return; }
  const btn = document.getElementById('snap-sync-list-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  snapStatus('Сканирование Drive…', 'info');
  try {
    await snapEnsureFolder();
    const q   = `'${snapDriveFolderId}' in parents and mimeType='application/json' and trashed=false`;
    const r   = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=200`,
      { headers: { Authorization: 'Bearer ' + driveToken } });
    if (!r.ok) throw new Error('Drive list ' + r.status);
    const data  = await r.json();
    const files = (data.files || []).filter(f => f.name.startsWith('snap_'));

    const list = snapLoadAll();
    let added = 0;
    for (const f of files) {
      if (list.find(s => s.driveName === f.name)) {
        const existing = list.find(s => s.driveName === f.name);
        existing.onDrive = true;
        continue;
      }
      try {
        const payload = await snapDownloadFileById(f.id);
        if (!payload) continue;
        list.push({ id: payload.id || f.name.replace('.json',''), label: payload.label || f.name,
          createdAt: payload.createdAt || f.modifiedTime, onDrive: true, driveName: f.name });
        added++;
      } catch(e) {}
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    snapSaveAll(list);
    snapStatus(`✓ Drive: ${files.length} файлов${added ? ', добавлено ' + added : ''}`, 'ok');
    snapRenderList();
  } catch(e) {
    snapStatus('Ошибка: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = !driveToken; btn.textContent = '☁ Список с Drive'; }
  }
}

// ── Render list ───────────────────────────────────
function snapRenderList() {
  const list      = snapLoadAll();
  const container = document.getElementById('snap-list');
  const countEl   = document.getElementById('snap-count-label');
  if (!container) return;
  if (countEl) countEl.textContent = list.length ? list.length + ' точек' : '';

  if (!list.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px 0;">Точек сохранения нет</div>';
    return;
  }

  container.innerHTML = list.map(meta => {
    const hasLocal = !!localStorage.getItem(SNAP_LS_KEY + '_data_' + meta.id);
    const dt = meta.createdAt
      ? new Date(meta.createdAt).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    let badges = '';
    if (hasLocal && meta.onDrive) badges = '<span class="snap-badge snap-badge-drive">Local + Drive</span>';
    else if (hasLocal)            badges = '<span class="snap-badge snap-badge-local-only">Только Local</span>';
    else if (meta.onDrive)        badges = '<span class="snap-badge snap-badge-drive">Только Drive</span>';

    let actions = '';
    if (hasLocal && !meta.onDrive && driveToken)
      actions += `<button class="btn btn-sm" title="Загрузить на Drive" onclick="snapUploadToDrive_byId('${meta.id}')">☁↑</button>`;
    if (meta.onDrive && !hasLocal && driveToken)
      actions += `<button class="btn btn-sm" title="Скачать с Drive" onclick="snapDownloadToLocal('${meta.id}')">☁↓</button>`;
    actions += `<button class="btn btn-sm btn-primary" onclick="snapRestore('${meta.id}')">↺ Загрузить</button>`;
    actions += `<button class="btn btn-sm btn-danger" onclick="snapDelete('${meta.id}')">✕</button>`;

    return `<div class="snap-item">
      <div class="snap-item-info">
        <div class="snap-item-label" title="${meta.label}">${meta.label}</div>
        <div class="snap-item-meta">${dt}</div>
      </div>
      <div class="snap-item-badges">${badges}</div>
      <div class="snap-item-actions">${actions}</div>
    </div>`;
  }).join('');
}

// ── Drive helpers (own subfolder) ─────────────────
async function snapEnsureFolder() {
  if (snapDriveFolderId) return;
  await driveEnsureFolder(); // ensure parent FinanceApp folder
  const q = `name='${SNAP_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and '${driveFolderId}' in parents and trashed=false`;
  let r = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  if (!r.ok) throw new Error('snapFolder check ' + r.status);
  let d = await r.json();
  if (d.files && d.files.length) { snapDriveFolderId = d.files[0].id; return; }
  r = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + driveToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SNAP_DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder', parents: [driveFolderId] })
  });
  if (!r.ok) throw new Error('snapFolder create ' + r.status);
  d = await r.json();
  snapDriveFolderId = d.id;
}

async function snapUploadFile(fname, data) {
  let existingId = null;
  const q = `name='${fname}' and '${snapDriveFolderId}' in parents and trashed=false`;
  const chk = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  if (chk.ok) { const cd = await chk.json(); if (cd.files && cd.files.length) existingId = cd.files[0].id; }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(existingId ? {} : { name: fname, parents: [snapDriveFolderId] })], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const url    = existingId ? `${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart` : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;
  const method = existingId ? 'PATCH' : 'POST';
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + driveToken }, body: form });
  if (r.status === 401) { driveClearToken(); driveToken = null; throw new Error('Токен истёк'); }
  if (!r.ok) throw new Error('snap upload ' + r.status);
}

async function snapDownloadFile(fname) {
  await snapEnsureFolder();
  const q = `name='${fname}' and '${snapDriveFolderId}' in parents and trashed=false`;
  const chk = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  if (!chk.ok) throw new Error('snap search ' + chk.status);
  const cd = await chk.json();
  if (!cd.files || !cd.files.length) return null;
  return snapDownloadFileById(cd.files[0].id);
}

async function snapDownloadFileById(fileId) {
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  if (!r.ok) throw new Error('snap download ' + r.status);
  return r.json();
}

async function snapDeleteFile(fname) {
  await snapEnsureFolder();
  const q = `name='${fname}' and '${snapDriveFolderId}' in parents and trashed=false`;
  const chk = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  if (!chk.ok) return;
  const cd = await chk.json();
  if (!cd.files || !cd.files.length) return;
  await fetch(`${DRIVE_API}/files/${cd.files[0].id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + driveToken } });
}
