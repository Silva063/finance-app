/* ══════════════════════════════════════════════════
   СВАЙП ПО СТРОКЕ ОПЕРАЦИИ (только тач)

   Влево  — удалить (мягко, с тостом «Отменить»)
   Вправо — открыть редактирование

   Работает через делегирование на document: цепляемся
   за любой элемент с data-txnid, поэтому годится и для
   строк таблиц, и для inline-строк месяца. Мышь не
   трогаем совсем — на десктопе поведение прежнее.
══════════════════════════════════════════════════ */

const SW_SLOP    = 12;   // пока сдвиг меньше — не решаем, свайп это или скролл
const SW_TRIGGER = 64;   // с этого сдвига жест сработает
const SW_MAX     = 96;   // дальше строка не едет

let swCur = null;

function swRowOf(el) {
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.txnid) return el;
    el = el.parentElement;
  }
  return null;
}

function swPaint(s) {
  const armed = Math.abs(s.dx) >= SW_TRIGGER;
  s.row.style.transform = 'translateX(' + s.dx + 'px)';
  s.row.classList.toggle('is-swipe-del',  s.dx < 0);
  s.row.classList.toggle('is-swipe-edit', s.dx > 0);
  s.row.classList.toggle('is-swipe-armed', armed);
}

function swClear(s, instant) {
  const row = s.row;
  row.classList.remove('is-swiping', 'is-swipe-del', 'is-swipe-edit', 'is-swipe-armed');
  if (instant) row.style.transform = '';
  else {
    row.style.transform = '';
    // transform снимаем без класса is-swiping — сработает CSS-переход
  }
}

document.addEventListener('touchstart', e => {
  swCur = null;
  if (e.touches.length !== 1) return;
  const tgt = e.target;
  // по интерактивным элементам внутри строки свайп не начинаем
  if (tgt.closest && tgt.closest('button, a, input, select, textarea, label')) return;
  const row = swRowOf(tgt);
  if (!row || !row.dataset.txnid) return;
  const t = e.touches[0];
  swCur = { row, id: row.dataset.txnid, x0: t.clientX, y0: t.clientY, dx: 0, axis: null };
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (!swCur || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - swCur.x0;
  const dy = t.clientY - swCur.y0;

  if (!swCur.axis) {
    if (Math.abs(dx) < SW_SLOP && Math.abs(dy) < SW_SLOP) return;
    // вертикальное движение отдаём странице — скролл важнее жеста
    swCur.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (swCur.axis === 'y') { swCur = null; return; }
    swCur.row.classList.add('is-swiping');
  }

  if (e.cancelable) e.preventDefault();
  swCur.dx = Math.max(-SW_MAX, Math.min(SW_MAX, dx));
  swPaint(swCur);
}, { passive: false });

function swEnd() {
  const s = swCur;
  swCur = null;
  if (!s || s.axis !== 'x') { if (s) swClear(s); return; }

  const del  = s.dx <= -SW_TRIGGER;
  const edit = s.dx >=  SW_TRIGGER;

  if (!del && !edit) { swClear(s); return; }

  if (edit) {
    swClear(s);
    opsOpenEditModal(s.id);
    return;
  }

  // Удаление: доводим строку до края, потом убираем — перерисовка снесёт узел
  s.row.classList.remove('is-swiping');
  s.row.style.transform = 'translateX(-110%)';
  s.row.style.opacity = '0';
  setTimeout(() => opsSoftDelete(s.id), 160);
}

document.addEventListener('touchend',    swEnd, { passive: true });
document.addEventListener('touchcancel', () => { if (swCur) swClear(swCur); swCur = null; }, { passive: true });

/* ── Подсказка о жесте на тач-устройствах ───────── */
// Показываем один раз: дальше жест либо освоен, либо не нужен.
function swHintInit() {
  if (!('ontouchstart' in window)) return;
  try { if (localStorage.getItem('finSwipeHintSeen')) return; } catch (e) {}
  const cap = document.querySelector('#op-p1 .tbl-header');
  if (!cap) return;
  const hint = document.createElement('div');
  hint.className = 'swipe-hint';
  hint.textContent = '← смахните строку: влево — удалить, вправо — изменить';
  cap.appendChild(hint);
  const hide = () => {
    hint.remove();
    try { localStorage.setItem('finSwipeHintSeen', '1'); } catch (e) {}
    document.removeEventListener('touchend', onSwipeDone);
  };
  const onSwipeDone = () => { if (swCur === null) setTimeout(hide, 400); };
  document.addEventListener('touchend', onSwipeDone, { once: true, passive: true });
  setTimeout(hide, 12000);
}
document.addEventListener('DOMContentLoaded', () => setTimeout(swHintInit, 600));
