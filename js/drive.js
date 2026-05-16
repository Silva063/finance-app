/* ══════════════════════════════════════════════════
   drive.js — синхронизация с Google Drive
   Использует Google Identity Services (GIS) + Drive API v3.
   Файлы хранятся в папке «FinanceApp» на Drive пользователя.
══════════════════════════════════════════════════ */

const DRIVE_CLIENT_ID   = '31541329185-u7jo8cqp5pafvir6h1mq42riaq2t9buu.apps.googleusercontent.com';

const DRIVE_SCOPE       = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API         = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FOLDER_NAME = 'FinanceApp';
const DRIVE_OPS_FILE    = 'finance_ops_data.json';
const DRIVE_INV_FILE    = 'finance_inv_data.json';

let driveToken       = null;
let driveTokenClient = null;
let driveFolderId    = null;
let driveFileMeta    = {};

// ── Client ID ─────────────────────────────────────
function driveLoadClientId() {
  return DRIVE_CLIENT_ID;
}

// ── Token cache (survives page reload via localStorage, TTL 50 min) ──
const DRIVE_TOKEN_TTL = 50 * 60 * 1000; // 50 minutes in ms
function driveSaveToken(tok) {
  try {
    localStorage.setItem('driveAccessToken', tok);
    localStorage.setItem('driveAccessTokenTs', Date.now().toString());
  } catch(e) {}
}
function driveRestoreToken() {
  try {
    const tok = localStorage.getItem('driveAccessToken');
    const ts  = parseInt(localStorage.getItem('driveAccessTokenTs') || '0', 10);
    if (!tok) return null;
    if (Date.now() - ts > DRIVE_TOKEN_TTL) { driveClearToken(); return null; }
    return tok;
  } catch(e) { return null; }
}
function driveClearToken() {
  try {
    localStorage.removeItem('driveAccessToken');
    localStorage.removeItem('driveAccessTokenTs');
  } catch(e) {}
}

// ── Status indicator ──────────────────────────────
function driveSetStatus(state, label) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  dot.className = 'sync-dot';
  if (state) { dot.classList.add('is-' + state); lbl.classList.add('is-active'); }
  else { lbl.classList.remove('is-active'); }
  lbl.textContent = label || 'Drive';
  // Mirror status on mobile bottom nav sync dot
  const mDot = document.getElementById('mnav-sync-dot');
  if (mDot) {
    mDot.style.background = state === 'ok' ? 'var(--green)'
      : state === 'warn'    ? 'var(--amber)'
      : state === 'error'   ? 'var(--red)'
      : state === 'loading' ? 'var(--acc)'
      : 'var(--line2)';
  }
}

// ── Log helper ────────────────────────────────────
function syncLog(msg, cls = 'info') {
  const log = document.getElementById('sync-log');
  if (!log) return;
  const ts  = new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const el  = document.createElement('span');
  el.className = 'sync-log-entry ' + cls;
  el.textContent = `[${ts}] ${msg}`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ── Modal ─────────────────────────────────────────
function driveOpenModal() {
  driveRefreshModalState();
  document.getElementById('drive-modal').classList.add('is-open');
}
function driveCloseModal() {
  document.getElementById('drive-modal').classList.remove('is-open');
}
function driveRefreshModalState() {
  const authed = !!driveToken;
  const panelOut = document.getElementById('drive-panel-out');
  const panelIn  = document.getElementById('drive-panel-in');
  if (panelOut) panelOut.style.display = authed ? 'none' : '';
  if (panelIn)  panelIn.style.display  = authed ? '' : 'none';
  document.getElementById('drive-signout-btn').style.display = authed ? '' : 'none';
  const emailEl = document.getElementById('drive-user-email');
  if (emailEl) emailEl.textContent = window.driveUserEmail || '—';
  _driveUpdateFileMeta();
}

function _driveUpdateFileMeta() {
  const fmt = ts => ts ? new Date(ts).toLocaleString('ru-RU') : 'нет данных';
  const opsEl = document.getElementById('drive-ops-ts');
  const invEl = document.getElementById('drive-inv-ts');
  if (opsEl) opsEl.textContent = fmt(driveFileMeta.ops?.modifiedTime);
  if (invEl) invEl.textContent = fmt(driveFileMeta.inv?.modifiedTime);
}

// ── Build / reuse token client ────────────────────
function _buildTokenClient(clientId, onSuccess) {
  driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: async (resp) => {
      if (resp.error || !resp.access_token) {
        syncLog('Ошибка авторизации: ' + (resp.error || 'нет токена'), 'err');
        driveSetStatus('error', 'Ошибка');
        driveClearToken();
        return;
      }
      driveToken = resp.access_token;
      driveSaveToken(driveToken);
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: 'Bearer ' + driveToken } });
        const u = await r.json();
        window.driveUserEmail = u.email || '—';
      } catch(e) { window.driveUserEmail = '—'; }
      driveSetStatus('loading', 'Синк...');
      driveRefreshModalState();
      await _driveStartupSync();
      driveRefreshModalState();
      if (onSuccess) onSuccess();
    }
  });
}

// ── Sign in (explicit, shows Google popup) ────────
function driveSignIn() {
  _buildTokenClient(DRIVE_CLIENT_ID);
  driveTokenClient.requestAccessToken({ prompt: 'select_account' });
}

// ── Sign out ──────────────────────────────────────
function driveSignOut() {
  if (driveToken) {
    try { google.accounts.oauth2.revoke(driveToken); } catch(e) {}
  }
  driveToken = null;
  driveFolderId = null;
  driveFileMeta = {};
  window.driveUserEmail = null;
  driveClearToken();
  driveSetStatus('', 'Drive');
  syncLog('Выполнен выход', 'info');
  driveRefreshModalState();
}

// ── Silent re-auth on page load ───────────────────
// Tries to get a fresh token without any UI.
// Works when Google session is active in browser.
async function driveSilentAuth(clientId) {
  return new Promise((resolve) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: '',          // empty = no consent screen if already granted
      callback: async (resp) => {
        if (resp.error || !resp.access_token) { resolve(false); return; }
        driveToken = resp.access_token;
        driveSaveToken(driveToken);
        try {
          const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: 'Bearer ' + driveToken } });
          const u = await r.json();
          window.driveUserEmail = u.email || '—';
        } catch(e) { window.driveUserEmail = '—'; }
        resolve(true);
      }
    });
    tc.requestAccessToken({ prompt: '' });
  });
}

// ── Drive API helpers ─────────────────────────────
async function driveAPI(path, opts = {}) {
  const base = opts._upload ? DRIVE_UPLOAD_API : DRIVE_API;
  delete opts._upload;
  const r = await fetch(base + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + driveToken, ...(opts.headers || {}) }
  });
  if (r.status === 401) {
    // Token expired — clear and mark for re-auth
    driveClearToken(); driveToken = null;
    driveSetStatus('warn', 'Войди снова');
    driveRefreshModalState();
    throw new Error('Токен истёк — нажми "Войти через Google"');
  }
  if (!r.ok) { const e = await r.text(); throw new Error(`Drive API ${r.status}: ${e}`); }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

async function driveEnsureFolder() {
  if (driveFolderId) return driveFolderId;
  const res = await driveAPI(`/files?q=${encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )}&fields=files(id,name)`);
  if (res.files && res.files.length > 0) {
    driveFolderId = res.files[0].id;
    syncLog(`Папка найдена: ${DRIVE_FOLDER_NAME}`, 'info');
    return driveFolderId;
  }
  const folder = await driveAPI('/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  driveFolderId = folder.id;
  syncLog(`Папка создана: ${DRIVE_FOLDER_NAME}`, 'ok');
  return driveFolderId;
}

async function driveFetchFileMeta() {
  await driveEnsureFolder();
  for (const [key, fname] of [['ops', DRIVE_OPS_FILE], ['inv', DRIVE_INV_FILE]]) {
    const res = await driveAPI(`/files?q=${encodeURIComponent(
      `name='${fname}' and '${driveFolderId}' in parents and trashed=false`
    )}&fields=files(id,name,modifiedTime)`);
    driveFileMeta[key] = res.files?.length ? res.files[0] : null;
  }
}

async function driveUploadFile(fname, data) {
  const key = fname.includes('ops') ? 'ops' : 'inv';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const form = new FormData();
  const meta = driveFileMeta[key]?.id
    ? JSON.stringify({ name: fname })
    : JSON.stringify({ name: fname, parents: [driveFolderId] });
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file', blob);
  const method = driveFileMeta[key]?.id ? 'PATCH' : 'POST';
  const path   = driveFileMeta[key]?.id
    ? `/files/${driveFileMeta[key].id}?uploadType=multipart&fields=id,modifiedTime`
    : `/files?uploadType=multipart&fields=id,modifiedTime`;
  const r = await fetch(DRIVE_UPLOAD_API + path, {
    method,
    headers: { Authorization: 'Bearer ' + driveToken },
    body: form
  });
  if (r.status === 401) {
    driveClearToken(); driveToken = null;
    driveSetStatus('warn', 'Войди снова'); driveRefreshModalState();
    throw new Error('Токен истёк');
  }
  if (!r.ok) throw new Error(`Upload ${r.status}`);
  const m = await r.json();
  driveFileMeta[key] = { id: m.id, modifiedTime: m.modifiedTime };
  _driveUpdateFileMeta();
}

async function driveDownloadFile(key) {
  // Always fetch fresh meta — file may have changed on another device
  await driveFetchFileMeta();
  if (!driveFileMeta[key]) return null;
  const r = await fetch(`${DRIVE_API}/files/${driveFileMeta[key].id}?alt=media`,
    { headers: { Authorization: 'Bearer ' + driveToken } });
  if (r.status === 401) { driveClearToken(); driveToken = null; throw new Error('Токен истёк'); }
  if (!r.ok) throw new Error(`Download ${r.status}`);
  return r.json();
}

// ── Timestamp helpers ─────────────────────────────
function opsTouch() { opsState._lastModified = new Date().toISOString(); opsSave(); }
function invTouch() { invState._lastModified = new Date().toISOString(); invSaveState(); }

// ══════════════════════════════════════════════════
// УМНЫЙ MERGE — не теряет данные при конфликте
// ══════════════════════════════════════════════════
//
// Логика:
//  • Каждая транзакция/инвентаризация имеет уникальный id.
//  • При синке читаем REMOTE, объединяем с LOCAL по id.
//  • Для одинакового id — побеждает запись с более поздней
//    датой _editedAt (или date для txn без явной метки).
//  • nextId = max(local, remote) + guard, чтобы не было дублей.
//  • Настройки (categories, blocks, currencies, rates…) берём
//    из более свежей стороны — они меняются реже.
//  • Результат merge пишем и локально и на Drive.
//
// Удаление: помечаем запись _deleted:true + _deletedAt timestamp,
//  но физически она остаётся в массиве (soft delete).
//  UI их не показывает, merge распространяет флаг.

// ── Merge helpers ─────────────────────────────────

/**
 * Merge two ops states. Returns new merged state.
 * Never drops a transaction that exists on either side.
 */
function _mergeOps(local, remote) {
  // Pick "settings carrier" — whichever side is newer
  const localTs  = new Date(local._lastModified  || 0).getTime();
  const remoteTs = new Date(remote._lastModified || 0).getTime();
  const settingsSrc = remoteTs > localTs ? remote : local;

  const localTxns  = local.txns  || [];
  const remoteTxns = remote.txns || [];
  console.log(`[merge-ops] local:${localTxns.length} remote:${remoteTxns.length}`);
  console.log(`[merge-ops] local ids:`,  localTxns.map(t => String(t.id)));
  console.log(`[merge-ops] remote ids:`, remoteTxns.map(t => String(t.id)));

  // Build id→txn map, merge
  const map = new Map();
  // Remote first, then local — local wins on equal timestamp
  const allTxns = [...remoteTxns, ...localTxns];
  for (const t of allTxns) {
    const key = String(t.id);
    if (!map.has(key)) {
      map.set(key, t);
    } else {
      // Conflict on same id: pick newer _editedAt, else keep existing (local wins)
      const existing = map.get(key);
      const existingTs = new Date(existing._editedAt || existing.date || 0).getTime();
      const incomingTs = new Date(t._editedAt        || t.date        || 0).getTime();
      if (incomingTs > existingTs) map.set(key, t);
    }
  }

  // Sort by date desc, then by id string desc (stable order)
  const merged = [...map.values()].sort((a, b) =>
    b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))
  );

  // nextId kept for backward compat with old numeric ids
  const maxNumericId = merged.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
  const nextId = Math.max(
    Number(local.nextId  || 1),
    Number(remote.nextId || 1),
    maxNumericId + 1
  );

  return {
    ...settingsSrc,
    txns:   merged,
    nextId: nextId,
    _lastModified: new Date().toISOString(),
  };
}

/**
 * Merge two inv states. Inv records are identified by their id.
 * Within a record, values (qty map) are merged by taking the
 * version with later _editedAt.
 */
function _mergeInv(local, remote) {
  const localTs  = new Date(local._lastModified  || 0).getTime();
  const remoteTs = new Date(remote._lastModified || 0).getTime();
  const settingsSrc = remoteTs > localTs ? remote : local;

  // inv uses .dates array (each record has .id = dateStr, .date, .secs, …)
  const localRecs  = local.dates  || [];
  const remoteRecs = remote.dates || [];

  const map = new Map();
  for (const r of [...remoteRecs, ...localRecs]) {
    const key = String(r.id);
    if (!map.has(key)) {
      map.set(key, r);
    } else {
      const existing   = map.get(key);
      const existTs    = new Date(existing._editedAt || existing.date || 0).getTime();
      const incomingTs = new Date(r._editedAt        || r.date        || 0).getTime();
      if (incomingTs > existTs) map.set(key, r);
    }
  }

  const merged = [...map.values()].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );

  return {
    ...settingsSrc,
    dates: merged,
    _lastModified: new Date().toISOString(),
  };
}

// ── Debounce: merge-then-push on auto-save ────────
// Now reads remote FIRST, merges, then writes back.
// This prevents the "PC overwrites phone" scenario.
const DEBOUNCE_MS = 2500;
const _debounceTimers = {};
let   _syncInFlight   = {};

function driveDebouncedPush(app) {
  if (!driveToken) return;
  if (_debounceTimers[app]) { clearTimeout(_debounceTimers[app]); }
  driveSetStatus('loading', 'Ожидание...');
  _debounceTimers[app] = setTimeout(async () => {
    delete _debounceTimers[app];
    if (_syncInFlight[app]) { driveDebouncedPush(app); return; }
    _syncInFlight[app] = true;
    const btn = document.getElementById(app + '-sync-btn');
    if (btn) btn.classList.add('is-syncing');
    try {
      await driveEnsureFolder();
      if (app === 'ops') {
        // Read remote, merge, write merged
        const remote = await driveDownloadFile('ops').catch(() => null);
        if (remote && remote.txns) {
          const merged = _mergeOps(opsState, remote);
          const added  = merged.txns.length - opsState.txns.length;
          opsState = merged;
          opsSave();
          if (added > 0) { opsReRenderCurrent(); syncLog(`⇄ Финучёт: подтянуто ${added} записей с Drive`, 'ok'); }
        } else {
          opsState._lastModified = new Date().toISOString();
          opsSave();
        }
        await driveUploadFile(DRIVE_OPS_FILE, opsState);
        syncLog('↑ Финучёт: синхронизировано с Drive', 'ok');
      } else {
        const remote = await driveDownloadFile('inv').catch(() => null);
        if (remote && remote.dates) {
          const merged = _mergeInv(invState, remote);
          const added  = merged.dates.length - (invState.dates || []).length;
          invState = merged;
          invSaveState();
          if (added > 0) { invLoadRates(); invCurId = null; invRenderSidebar(); syncLog(`⇄ Инвентаризация: подтянуто ${added} записей с Drive`, 'ok'); }
        } else {
          invState._lastModified = new Date().toISOString();
          invSaveState();
        }
        await driveUploadFile(DRIVE_INV_FILE, invState);
        syncLog('↑ Инвентаризация: синхронизировано с Drive', 'ok');
      }
      driveSetStatus('ok', 'Drive ✓');
      await driveFetchFileMeta();
      _driveUpdateFileMeta();
    } catch(e) {
      syncLog('Ошибка автосинка: ' + e.message, 'err');
      driveSetStatus('error', 'Ошибка');
    } finally {
      _syncInFlight[app] = false;
      if (btn) btn.classList.remove('is-syncing');
    }
  }, DEBOUNCE_MS);
}

// ── Core merge-sync (manual button) ──────────────
async function _syncOne(key, label) {
  syncLog(`Синхронизация: ${label}...`, 'info');
  const remoteExists = !!driveFileMeta[key];
  const fname = key === 'ops' ? DRIVE_OPS_FILE : DRIVE_INV_FILE;

  if (!remoteExists) {
    // Nothing on Drive yet — just push
    if (key === 'ops') {
      opsState._lastModified = new Date().toISOString(); opsSave();
      await driveUploadFile(fname, opsState);
    } else {
      invState._lastModified = new Date().toISOString(); invSaveState();
      await driveUploadFile(fname, invState);
    }
    syncLog(`↑ ${label}: первая загрузка на Drive`, 'ok');
    return;
  }

  // Download remote
  const remote = await driveDownloadFile(key);
  if (!remote) { syncLog(`${label}: файл на Drive пуст`, 'warn'); return; }

  if (key === 'ops') {
    const before  = opsState.txns.length;
    const merged  = _mergeOps(opsState, remote);
    const delta   = merged.txns.length - before;
    opsState = merged;
    opsSave();
    opsReRenderCurrent();
    await driveUploadFile(fname, opsState);
    syncLog(`⇄ ${label}: merge завершён (+${delta} с Drive), загружено`, 'ok');
  } else {
    const before  = (invState.dates || []).length;
    const merged  = _mergeInv(invState, remote);
    const delta   = merged.dates.length - before;
    invState = merged;
    invSaveState();
    invLoadRates();
    invCurId = null;
    invRenderSidebar();
    await driveUploadFile(fname, invState);
    syncLog(`⇄ ${label}: merge завершён (+${delta} с Drive), загружено`, 'ok');
  }
}

async function driveSyncApp(app) {
  if (!driveToken) { driveOpenModal(); return; }
  if (_debounceTimers[app]) { clearTimeout(_debounceTimers[app]); delete _debounceTimers[app]; }
  const btn = document.getElementById(app + '-sync-btn');
  if (btn) btn.classList.add('is-syncing');
  driveSetStatus('loading', 'Синк...');
  try {
    await driveEnsureFolder();
    await driveFetchFileMeta();
    await _syncOne(app, app === 'ops' ? 'Финучёт' : 'Инвентаризация');
    driveSetStatus('ok', 'Drive ✓');
    _driveUpdateFileMeta();
  } catch(e) {
    syncLog('Ошибка: ' + e.message, 'err');
    driveSetStatus('error', 'Ошибка');
  } finally {
    if (btn) btn.classList.remove('is-syncing');
  }
}

async function driveSyncAll() {
  if (!driveToken) { syncLog('Не авторизован', 'err'); return; }
  ['ops','inv'].forEach(k => { if (_debounceTimers[k]) { clearTimeout(_debounceTimers[k]); delete _debounceTimers[k]; } });
  driveSetStatus('loading', 'Синк...');
  try {
    await driveEnsureFolder();
    await driveFetchFileMeta();
    await _syncOne('ops', 'Финучёт');
    await _syncOne('inv', 'Инвентаризация');
    driveSetStatus('ok', 'Drive ✓');
    _driveUpdateFileMeta();
  } catch(e) {
    syncLog('Ошибка: ' + e.message, 'err');
    driveSetStatus('error', 'Ошибка');
  }
}

async function drivePushAll() {
  if (!driveToken) { syncLog('Не авторизован', 'err'); return; }
  driveSetStatus('loading', 'Загрузка...');
  try {
    await driveEnsureFolder();
    opsState._lastModified = new Date().toISOString(); opsSave();
    invState._lastModified = new Date().toISOString(); invSaveState();
    await driveUploadFile(DRIVE_OPS_FILE, opsState);
    syncLog('↑ Финучёт: загружено на Drive', 'ok');
    await driveUploadFile(DRIVE_INV_FILE, invState);
    syncLog('↑ Инвентаризация: загружено на Drive', 'ok');
    driveSetStatus('ok', 'Drive ✓');
  } catch(e) {
    syncLog('Ошибка: ' + e.message, 'err');
    driveSetStatus('error', 'Ошибка');
  }
}

async function drivePullAll() {
  if (!driveToken) { syncLog('Не авторизован', 'err'); return; }
  // confirm removed - proceed
  driveSetStatus('loading', 'Загрузка...');
  try {
    await driveEnsureFolder();
    await driveFetchFileMeta();
    if (driveFileMeta.ops) {
      const d = await driveDownloadFile('ops');
      if (d) { opsState = d; opsSave(); opsReRenderCurrent(); syncLog('↓ Финучёт: получено с Drive', 'ok'); }
    } else { syncLog('Финучёт: файл на Drive не найден', 'warn'); }
    if (driveFileMeta.inv) {
      const d = await driveDownloadFile('inv');
      if (d) { invState = d; invSaveState(); invLoadRates(); invCurId = null; invRenderSidebar(); syncLog('↓ Инвентаризация: получено с Drive', 'ok'); }
    } else { syncLog('Инвентаризация: файл на Drive не найден', 'warn'); }
    driveSetStatus('ok', 'Drive ✓');
    _driveUpdateFileMeta();
  } catch(e) {
    syncLog('Ошибка: ' + e.message, 'err');
    driveSetStatus('error', 'Ошибка');
  }
}

// ── Auto-restore on page load ─────────────────────
// Strategy:
//   1. Cached token → validate → merge-sync immediately
//   2. clientId saved → silent GIS re-auth → merge-sync
//   3. Otherwise → wait for user to click "Войти"
async function driveAutoRestore() {
  const clientId = driveLoadClientId();

  // Step 1: probe cached token
  const cached = driveRestoreToken();
  if (cached && clientId) {
    driveToken = cached;
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { Authorization: 'Bearer ' + cached } });
      if (r.ok) {
        const u = await r.json();
        window.driveUserEmail = u.email || '—';
        driveSetStatus('ok', 'Drive ✓');
        driveRefreshModalState();
        await _driveStartupSync();
        return;
      }
    } catch(e) {}
    driveToken = null;
    driveClearToken();
  }

  // Step 2: silent GIS re-auth
  if (!clientId) return;
  try {
    if (typeof google === 'undefined' || !google.accounts) {
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (typeof google !== 'undefined' && google.accounts) { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
    }
    const ok = await driveSilentAuth(clientId);
    if (ok) {
      driveSetStatus('ok', 'Drive ✓');
      driveRefreshModalState();
      await _driveStartupSync();
    }
  } catch(e) { /* silent — user can manually sign in */ }
}

// ── Startup merge-sync ────────────────────────────
// Runs once after login/token-restore. Merges both apps
// with Drive silently. Shows indicator but no alert on success.
async function _driveStartupSync() {
  driveSetStatus('loading', 'Проверка Drive...');
  try {
    await driveEnsureFolder();
    await driveFetchFileMeta();
    _driveUpdateFileMeta();

    const hasOps = !!driveFileMeta['ops'];
    const hasInv = !!driveFileMeta['inv'];
    if (hasOps || hasInv) {
      driveSetStatus('loading', 'Синхронизация...');
    }

    let mergedAnything = false;

    // Merge ops
    if (driveFileMeta['ops']) {
      try {
        const remote = await fetch(`${DRIVE_API}/files/${driveFileMeta['ops'].id}?alt=media`,
          { headers: { Authorization: 'Bearer ' + driveToken } });
        if (remote.ok) {
          const remoteData = await remote.json();
          if (remoteData && remoteData.txns) {
            const before = opsState.txns.filter(t => !t._deleted).length;
            const merged = _mergeOps(opsState, remoteData);
            const after  = merged.txns.filter(t => !t._deleted).length;
            if (after !== before || merged.txns.length !== opsState.txns.length) {
              opsState = merged;
              opsSave();
              opsReRenderCurrent();
              mergedAnything = true;
              syncLog(`⇄ Финучёт: подтянуто с Drive при старте (+${Math.max(0, after - before)})`, 'ok');
            }
            // Always push merged result back so Drive is also up to date
            await driveUploadFile(DRIVE_OPS_FILE, opsState);
          }
        }
      } catch(e) { syncLog('Старт-синк ops: ' + e.message, 'warn'); }
    }

    // Merge inv
    if (driveFileMeta['inv']) {
      try {
        const remote = await fetch(`${DRIVE_API}/files/${driveFileMeta['inv'].id}?alt=media`,
          { headers: { Authorization: 'Bearer ' + driveToken } });
        if (remote.ok) {
          const remoteData = await remote.json();
          if (remoteData && remoteData.dates) {
            const before = (invState.dates || []).filter(r => !r._deleted).length;
            const merged = _mergeInv(invState, remoteData);
            const after  = merged.dates.filter(r => !r._deleted).length;
            if (after !== before || merged.dates.length !== (invState.dates || []).length) {
              invState = merged;
              invSaveState();
              invLoadRates();
              invCurId = null;
              invRenderSidebar();
              mergedAnything = true;
              syncLog(`⇄ Инвентаризация: подтянуто с Drive при старте (+${Math.max(0, after - before)})`, 'ok');
            }
            await driveUploadFile(DRIVE_INV_FILE, invState);
          }
        }
      } catch(e) { syncLog('Старт-синк inv: ' + e.message, 'warn'); }
    }

    await driveFetchFileMeta();
    _driveUpdateFileMeta();

    if (mergedAnything) {
      driveSetStatus('ok', 'Drive ✓ синк');
      setTimeout(() => driveSetStatus('ok', 'Drive ✓'), 3000);
    } else {
      driveSetStatus('ok', 'Drive ✓');
    }
  } catch(e) {
    syncLog('Старт-синк: ' + e.message, 'warn');
    driveSetStatus('ok', 'Drive ✓'); // still connected, just sync failed
  }
}

window.addEventListener('load', () => { driveAutoRestore(); });
