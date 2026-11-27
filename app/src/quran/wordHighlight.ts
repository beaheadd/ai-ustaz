/**
 * Пословная подсветка чтения: слово, которое сейчас звучит, — жёлтым маркером внутри подсвеченного аята.
 *
 * Владелец 28.11.2026: «когда выйдет вот этот жёлтый, который вместе двигается с чтецом, выделение именно слов, которые
 * читают»; «можно общий выделить аят, а внутри, именно где он читает, можно жёлтым выделять».
 *
 * Данные — пословные тайминги quran-align (Collin Fair, CC BY 4.0; quran/wordTimings.ts): есть у ar.husary, ar.alafasy,
 * ar.shaatree и не у всех аятов. «Не уверен — не подсвечиваем» (правило 7): нет издания, нет аята, бисмилла, нет связи,
 * сверка sha256 не сошлась — только подсветка аята, без жёлтого.
 *
 * Как рисуем (слабый Android): текст аята не перерисовывается. Слова — уже отдельные узлы: группа «слово + его знаки
 * остановки» (quran/text.ts группыТокенов; ТекстАята и ПотокМусхафа рисуют их span[data-group], группа i — слово i+1,
 * в т. ч. в «Страницами»). Пока кари читает, requestAnimationFrame берёт currentTime плеера (плеер.времяМс), ищет слово
 * (словоПоВремени) и, только когда слово сменилось, меняет стиль ОДНОГО узла: фон, скругление, box-shadow (без сдвига
 * строк — раскладка не меняется). Пауза — слово остаётся (проверка раз в 400 мс: текст мог перерисоваться); стоп и
 * смена аята — снято. Анимации нет (reduce motion не касается).
 *
 * Контракт:
 *   useПодсветкаСлов({ тёмная }) — один раз на экране суры (оба режима); тёмная — тёмная поверхность чтения (цвет маркера);
 *   useПодсветкаСловВкл() → boolean; установитьПодсветкуСлов(вкл) — настройка в меню вида (по умолчанию вкл.);
 *     хранение: localStorage «aiustaz:quran-words.v1» = { версия: 1, вкл } (только на устройстве; try/catch);
 *   таймингиСлов(издание, сура) — загрузка с кэшем (для «Скачать суру» — заодно в кэш без сети).
 *   Узел текущего слова помечен data-word-now (для тестов), цвет — ЦВЕТ_СЛОВА.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { плеер, useПлеер } from '../audio/player';
import { sha256Hex } from '../engine/lessonEngine';
import { базаСборки } from './data';
import { МАНИФЕСТ_СЛОВ } from './wordsManifest.generated';
import { создатьЗагрузчикСлов, естьТайминги, словоПоВремени, type ОтрезокСлова, type ТаймингиСуры } from './wordTimings';

const ВЕБ = Platform.OS === 'web';
const КЛЮЧ = 'aiustaz:quran-words.v1';

/** Тёплый жёлтый маркер: на бумаге/светлом — плотнее, на тёмном — прозрачнее (светлый текст остаётся читаемым). */
export const ЦВЕТ_СЛОВА = { светлая: 'rgba(255, 196, 0, 0.42)', тёмная: 'rgba(255, 196, 40, 0.30)' } as const;

// ── Настройка ──
let вклСейчас: boolean | null = null;
const слушатели = new Set<() => void>();
function вкл(): boolean {
  if (вклСейчас === null) {
    try {
      const с = globalThis.localStorage?.getItem(КЛЮЧ);
      const д = с ? (JSON.parse(с) as { версия?: unknown; вкл?: unknown }) : null;
      вклСейчас = д && д.версия === 1 ? д.вкл !== false : true;
    } catch {
      вклСейчас = true;
    }
  }
  return вклСейчас;
}
export function установитьПодсветкуСлов(новое: boolean): void {
  if (вкл() === новое) return;
  вклСейчас = новое;
  try {
    globalThis.localStorage?.setItem(КЛЮЧ, JSON.stringify({ версия: 1, вкл: новое }));
  } catch {
    // приватный режим — выбор живёт до перезагрузки
  }
  for (const ф of [...слушатели]) ф();
}
function подписаться(ф: () => void) {
  слушатели.add(ф);
  return () => {
    слушатели.delete(ф);
  };
}
export function useПодсветкаСловВкл(): boolean {
  return useSyncExternalStore(подписаться, вкл, вкл);
}

// ── Загрузка таймингов ──
async function получить(адрес: string): Promise<string | null> {
  try {
    const ответ = await fetch(адрес, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    return ответ.ok ? await ответ.text() : null;
  } catch {
    return null;
  }
}
const загрузчик = создатьЗагрузчикСлов({ манифест: МАНИФЕСТ_СЛОВ, база: базаСборки(), получить, sha256: async (т) => sha256Hex(т) });
export function таймингиСлов(издание: string, сура: number): Promise<ТаймингиСуры | null> {
  return естьТайминги(МАНИФЕСТ_СЛОВ, издание) ? загрузчик.таймингиСуры(издание, сура) : Promise.resolve(null);
}

// ── Рисование ──
function узелСлова(сура: number, аят: number, номер: number): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const аятУзел =
    document.querySelector<HTMLElement>(`[data-testid="экран-сура"] [data-ayah="${сура}:${аят}"]`) ??
    document.querySelector<HTMLElement>(`[data-testid="коран-аят-${сура}-${аят}-текст"]`);
  return аятУзел?.querySelectorAll<HTMLElement>('[data-group]')[номер] ?? null;
}
function покрасить(э: HTMLElement, тёмная: boolean) {
  const ц = тёмная ? ЦВЕТ_СЛОВА.тёмная : ЦВЕТ_СЛОВА.светлая;
  э.style.backgroundColor = ц;
  э.style.borderRadius = '6px';
  // Подложка чуть шире слова — тенью, без отступов: строки не сдвигаются.
  э.style.boxShadow = `0 0 0 2px ${ц}`;
  э.setAttribute('data-word-now', '');
}
function снять(э: HTMLElement) {
  э.style.backgroundColor = '';
  э.style.borderRadius = '';
  э.style.boxShadow = '';
  э.removeAttribute('data-word-now');
}

/** Пословная подсветка на экране суры (оба режима). Без таймингов — ничего не делает. */
export function useПодсветкаСлов({ тёмная }: { тёмная: boolean }): void {
  const снимок = useПлеер();
  const включено = useПодсветкаСловВкл();
  const тек = снимок.состояние !== 'стоп' && снимок.состояние !== 'ошибка' ? снимок.текущий : null;
  const издание = снимок.источник?.cdn?.издание ?? null;
  const годится = ВЕБ && включено && !!тек && !тек.бисмилла && !!издание && естьТайминги(МАНИФЕСТ_СЛОВ, издание);
  const сура = тек?.сура ?? 0;
  const аят = тек?.аят ?? 0;
  const идёт = снимок.состояние === 'играет';

  useEffect(() => {
    if (!годится || !издание) return;
    let живой = true;
    let кадр = 0;
    let таймер: ReturnType<typeof setInterval> | null = null;
    let отрезки: ОтрезокСлова[] | null = null;
    let узел: HTMLElement | null = null;
    let номер = -2;
    const применить = () => {
      const мс = плеер.времяМс();
      if (!отрезки || мс === null) return;
      const н = словоПоВремени(отрезки, мс);
      if (н === номер && (!узел || узел.isConnected)) return;
      номер = н;
      const новый = н >= 0 ? узелСлова(сура, аят, н) : null;
      if (новый === узел) return;
      if (узел) снять(узел);
      узел = новый;
      if (узел) покрасить(узел, тёмная);
    };
    const цикл = () => {
      if (!живой) return;
      применить();
      // Узел мог перерисоваться (смена вида, переворот листа) — проверка isConnected в применить.
      if (узел && !узел.isConnected) номер = -2;
      кадр = requestAnimationFrame(цикл);
    };
    void таймингиСлов(издание, сура).then((т) => {
      if (!живой || !т) return;
      отрезки = т.аят(аят);
      if (!отрезки) return;
      применить();
      // Играет — каждый кадр; пауза — редко: слово остаётся, а перерисованный текст (смена вида) получает его снова.
      if (идёт) кадр = requestAnimationFrame(цикл);
      else таймер = setInterval(применить, 400);
    });
    return () => {
      живой = false;
      cancelAnimationFrame(кадр);
      if (таймер) clearInterval(таймер);
      if (узел) снять(узел);
    };
  }, [годится, издание, сура, аят, идёт, тёмная]);
}
