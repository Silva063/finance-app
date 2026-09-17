/* ══════════════════════════════════════════════════
   АВТОКАТЕГОРИЗАЦИЯ ПО КОММЕНТАРИЮ

   Учится на уже введённых операциях: строит индекс
   «основа слова → категория» по тем транзакциям, где
   категория проставлена руками. Никаких настроек —
   поправили категорию и сохранили, значит в следующий
   раз автомат ответит правильно.
══════════════════════════════════════════════════ */

const AC_MIN_WORD  = 3;     // слова короче — шум («на», «за», «до»)
const AC_STEM_LEN  = 5;     // русский склоняется суффиксами: «шериф/шерифе/шерифа» → «шериф»
const AC_VOWELS    = 'аеиоуыэюяьй';
const AC_MIN_SCORE = 0.45;  // ниже — доказательств слишком мало
const AC_MIN_LEAD  = 1.35;  // во сколько раз лидер должен опережать второго
const AC_RARE_N    = 3;     // основа, встреченная реже, весит пропорционально меньше

// Частые слова, которые встречаются в любых категориях и только мешают
const AC_STOP = new Set([
  'для','что','как','это','был','была','было','были','если','или','при','без',
  'над','под','его','ему','она','они','там','тут','уже','еще','ещё','чтобы',
  'тоже','также','себе','себя','всё','все','мне','мой','моя','наш','две','три',
  'руб','рублей','штук','шт','дом','раз'
]);

let opsAcIndex = null;

// Сбрасывается при любом изменении состояния — opsSave() вызывается
// на всех путях, включая merge с Drive и восстановление снапшота.
function opsAcInvalidate() { opsAcIndex = null; }

function opsAcNorm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// «шерифе» → «шериф», «маршрутке» → «маршр», «обеда» → «обед».
// Обрезка + снятие одной концевой гласной покрывает почти всё словоизменение
// без полноценного стеммера.
function opsAcStem(w) {
  let s = w.length > AC_STEM_LEN ? w.slice(0, AC_STEM_LEN) : w;
  if (s.length > AC_MIN_WORD && AC_VOWELS.includes(s[s.length - 1])) s = s.slice(0, -1);
  return s;
}

function opsAcStems(text) {
  const out = [];
  for (const w of opsAcNorm(text).split(' ')) {
    if (w.length < AC_MIN_WORD) continue;
    if (AC_STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue;           // голые числа ничего не говорят о категории
    out.push(opsAcStem(w));
  }
  return out;
}

// Индекс строится отдельно для приходов и расходов: «зарплата» не должна
// всплывать в расходах, а «такси» — в приходах.
function opsAcBuildIndex() {
  const idx = {
    income:  { stems: new Map(), phrases: new Map() },
    expense: { stems: new Map(), phrases: new Map() }
  };

  for (const t of opsState.txns) {
    if (t._deleted || !t.cat || !t.comment) continue;
    const bucket = idx[t.type];
    if (!bucket) continue;

    const phrase = opsAcNorm(t.comment);
    if (phrase) {
      const p = bucket.phrases.get(phrase) || {};
      p[t.cat] = (p[t.cat] || 0) + 1;
      bucket.phrases.set(phrase, p);
    }

    // одно и то же слово внутри комментария не должно голосовать дважды
    for (const stem of new Set(opsAcStems(t.comment))) {
      let e = bucket.stems.get(stem);
      if (!e) { e = { cats: {}, total: 0 }; bucket.stems.set(stem, e); }
      e.cats[t.cat] = (e.cats[t.cat] || 0) + 1;
      e.total++;
    }
  }

  opsAcIndex = idx;
  return idx;
}

function opsAcTop(counts) {
  let best = null, bestN = 0, secondN = 0;
  for (const k in counts) {
    if (counts[k] > bestN) { secondN = bestN; best = k; bestN = counts[k]; }
    else if (counts[k] > secondN) { secondN = counts[k]; }
  }
  return { best, bestN, secondN };
}

/**
 * Предсказывает категорию по тексту комментария.
 * Возвращает id категории или null, если уверенности не хватает.
 */
function opsAcPredict(comment, type) {
  const text = opsAcNorm(comment);
  if (!text || text.length < AC_MIN_WORD) return null;

  const idx = opsAcIndex || opsAcBuildIndex();
  const bucket = idx[type];
  if (!bucket) return null;

  // Точное совпадение с уже виденным комментарием — самый сильный сигнал
  const exact = bucket.phrases.get(text);
  if (exact) {
    const { best } = opsAcTop(exact);
    if (best && opsCats().some(c => c.id === best)) return best;
  }

  const score = {};
  for (const stem of new Set(opsAcStems(text))) {
    const e = bucket.stems.get(stem);
    if (!e) continue;
    // редкая основа знает меньше, чем часто встречавшаяся
    const weight = Math.min(1, e.total / AC_RARE_N);
    for (const cat in e.cats) {
      score[cat] = (score[cat] || 0) + (e.cats[cat] / e.total) * weight;
    }
  }

  const { best, bestN, secondN } = opsAcTop(score);
  if (!best || bestN < AC_MIN_SCORE) return null;
  if (secondN > 0 && bestN / secondN < AC_MIN_LEAD) return null;   // два кандидата вровень — молчим
  if (!opsCats().some(c => c.id === best)) return null;            // категорию могли удалить
  return best;
}

/* ── Подключение к модалке операции ─────────────── */

let opsAcTouched = false;   // категорию выбрали руками — не перетираем
let opsAcFilled  = false;   // текущее значение селекта поставил автомат
let opsAcTimer   = null;

// Вызывается при открытии модалки. hasCat=true для существующей операции
// с уже проставленной категорией — это осознанный выбор, трогать нельзя.
function opsAcReset(hasCat) {
  clearTimeout(opsAcTimer);
  opsAcTouched = !!hasCat;
  opsAcFilled  = false;
  const badge = document.getElementById('m-cat-auto');
  const sug   = document.getElementById('m-cat-suggest');
  if (badge) badge.hidden = true;
  if (sug)   sug.hidden   = true;
}

// Пользователь сам полез в селект — автомат замолкает до конца редактирования
function opsAcTouch() {
  opsAcTouched = true;
  opsAcFilled  = false;
  const badge = document.getElementById('m-cat-auto');
  const sug   = document.getElementById('m-cat-suggest');
  if (badge) badge.hidden = true;
  if (sug)   sug.hidden   = true;
}

function opsAcOnComment() {
  clearTimeout(opsAcTimer);
  opsAcTimer = setTimeout(opsAcRun, 250);
}

function opsAcRun() {
  const sel   = document.getElementById('m-cat');
  const badge = document.getElementById('m-cat-auto');
  const sug   = document.getElementById('m-cat-suggest');
  const inp   = document.getElementById('m-comment');
  const typeEl = document.getElementById('m-type');
  if (!sel || !badge || !sug || !inp || !typeEl) return;

  const guess = opsAcPredict(inp.value, typeEl.value);

  if (!guess) {
    // комментарий стёрли или он перестал что-либо напоминать —
    // убираем за собой только то, что подставили сами
    if (opsAcFilled && !opsAcTouched) { sel.value = ''; opsAcFilled = false; }
    badge.hidden = true;
    sug.hidden   = true;
    return;
  }

  if (!opsAcTouched) {
    sel.value    = guess;
    opsAcFilled  = true;
    badge.hidden = false;
    sug.hidden   = true;
  } else if (guess !== sel.value) {
    // выбрано руками и автомат не согласен — предлагаем, но не меняем
    sug.textContent  = '↳ похоже на: ' + opsCat(guess).name;
    sug.dataset.cat  = guess;
    sug.hidden       = false;
    badge.hidden     = true;
  } else {
    sug.hidden = true;   // автомат согласен с ручным выбором — молчим
  }
}

// Клик по подсказке «похоже на: …»
function opsAcApply() {
  const sug = document.getElementById('m-cat-suggest');
  const sel = document.getElementById('m-cat');
  if (!sug || !sel || !sug.dataset.cat) return;
  sel.value = sug.dataset.cat;
  sug.hidden = true;
  const badge = document.getElementById('m-cat-auto');
  if (badge) badge.hidden = true;
  opsAcTouched = true;   // применили осознанно
  opsAcFilled  = false;
}
