/* ══════════════════════════════════════════════════
   utils.js — вспомогательные утилиты UI
   Toast-уведомления и кастомный confirm-диалог.
   Загружается ПЕРВЫМ, до остальных модулей.
══════════════════════════════════════════════════ */

/* ── Toast / Confirm utilities (no alert/confirm needed) ── */
function showToast(msg, type, dur) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-'+type : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),320); }, dur||2800);
}
function showErr(msg)  { showToast(msg, 'err',  3200); }
function showOk(msg)   { showToast(msg, 'ok',   2400); }
function showWarn(msg) { showToast(msg, 'warn', 3500); }

// Drop-in confirm replacement — returns a Promise<boolean>
function appConfirm(msg) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `<div class="confirm-box">
      <div class="confirm-msg">${msg}</div>
      <div class="confirm-actions">
        <button class="btn btn-sm" id="cf-no">Отмена</button>
        <button class="btn btn-sm btn-danger" id="cf-yes">Подтвердить</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const cleanup = ok => { ov.remove(); resolve(ok); };
    ov.querySelector('#cf-yes').onclick = () => cleanup(true);
    ov.querySelector('#cf-no').onclick  = () => cleanup(false);
    ov.addEventListener('click', e => { if (e.target===ov) cleanup(false); });
  });
}

// Drop-in prompt replacement — returns a Promise<string|null>
function appPrompt(msg, defaultVal) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `<div class="confirm-box">
      <div class="confirm-msg">${msg}</div>
      <input id="ap-input" class="filter-input" type="text" value="${(defaultVal||'').replace(/"/g,'&quot;')}"
        style="width:100%;margin-bottom:14px;font-size:13px;">
      <div class="confirm-actions">
        <button class="btn btn-sm" id="ap-cancel">Отмена</button>
        <button class="btn btn-sm btn-primary" id="ap-ok">OK</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('#ap-input');
    inp.focus(); inp.select();
    const cleanup = val => { ov.remove(); resolve(val); };
    ov.querySelector('#ap-ok').onclick     = () => cleanup(inp.value);
    ov.querySelector('#ap-cancel').onclick = () => cleanup(null);
    inp.addEventListener('keydown', e => { if(e.key==='Enter') cleanup(inp.value); if(e.key==='Escape') cleanup(null); });
    ov.addEventListener('click', e => { if(e.target===ov) cleanup(null); });
  });
}
function showInlineErr(anchorId, msg) {
  // Remove existing
  const old = document.getElementById('inline-err-' + anchorId);
  if (old) old.remove();
  const anchor = document.getElementById(anchorId);
  if (!anchor) { showErr(msg); return; }
  const el = document.createElement('div');
  el.className = 'inline-err';
  el.id = 'inline-err-' + anchorId;
  el.textContent = msg;
  anchor.parentNode.insertBefore(el, anchor.nextSibling);
  setTimeout(() => el.remove(), 3500);
}
