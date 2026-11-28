/**
 * «Во весь экран» в режиме «Страницами» — выбор человека, только на устройстве (как вид чтения, quran/readingView.ts).
 *
 * Владелец 28.11.2026 (снимок 412×915, «как книга»): «шрифт очень мелкий, шрифт нужно увеличить. Возможно, за счёт
 * сокращения футера, шапки… чтобы шрифт увеличился и чтобы больше места освободить». Во весь экран шапка экрана суры и
 * нижняя полоса страницы спрятаны, лист — на всю высоту, кегль подбирается заново (screens/quran/MushafPages.tsx).
 *
 * Контракт:
 *   useВесьЭкранСтраниц() → boolean; установитьВесьЭкранСтраниц(вкл, браузер = false).
 *   браузер = true — ещё и Fullscreen API (document.documentElement.requestFullscreen) — только по явному нажатию
 *     человека (кнопка ⤢): прячет и строку адреса Android Chrome. Не на iOS/iPadOS (Safari и PWA с экрана «Домой» —
 *     без него: там API нет или он ведёт себя иначе) и не там, где document.fullscreenEnabled = false. Ошибка — молча
 *     (режим всё равно включён: панели спрятаны). Выход из полноэкранного браузером (кнопка «Назад», Esc) — выход и
 *     из режима. Выключение режима — выход из полноэкранного, если мы в него входили.
 *   Хранение: localStorage «aiustaz:quran-pages-full.v1» = { версия: 1, вкл } (в try/catch: приватный режим — до
 *   перезагрузки). При следующем открытии режим включён, но без Fullscreen API (нужно нажатие). Нативно — в памяти.
 * Без импортов кода, кроме React.
 */
import { useSyncExternalStore } from 'react';

const КЛЮЧ = 'aiustaz:quran-pages-full.v1';

let сейчас: boolean | null = null;
let браузерМы = false;
const слушатели = new Set<() => void>();

function текущий(): boolean {
  if (сейчас === null) {
    try {
      const с = globalThis.localStorage?.getItem(КЛЮЧ);
      const д = с ? (JSON.parse(с) as { версия?: unknown; вкл?: unknown } | null) : null;
      сейчас = !!д && д.версия === 1 && д.вкл === true;
    } catch {
      сейчас = false;
    }
  }
  return сейчас;
}

type Док = { fullscreenEnabled?: boolean; fullscreenElement?: unknown; exitFullscreen?: () => Promise<void>; documentElement?: { requestFullscreen?: (о?: { navigationUI?: string }) => Promise<void> }; addEventListener?: (т: string, ф: () => void) => void };
const док = (): Док | null => (typeof document !== 'undefined' ? (document as unknown as Док) : null);

/** iPhone, iPod и iPad (в том числе iPadOS, который называет себя Macintosh, но с касанием). */
function этоIOS(): boolean {
  const н = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  if (!н) return false;
  if (н.standalone !== undefined) return true;
  return /iPad|iPhone|iPod/.test(н.userAgent ?? '') || (/Macintosh/.test(н.userAgent ?? '') && (н.maxTouchPoints ?? 0) > 1);
}

let слушаемЭкран = false;
function слушатьЭкран(): void {
  const д = док();
  if (слушаемЭкран || !д?.addEventListener) return;
  слушаемЭкран = true;
  // Браузер вышел из полноэкранного сам («Назад», Esc) — выходим и из режима.
  д.addEventListener('fullscreenchange', () => {
    if (док()?.fullscreenElement) return;
    if (браузерМы) {
      браузерМы = false;
      if (текущий()) сохранить(false);
    }
  });
}

function сохранить(вкл: boolean): void {
  if (текущий() === вкл) return;
  сейчас = вкл;
  try {
    globalThis.localStorage?.setItem(КЛЮЧ, JSON.stringify({ версия: 1, вкл }));
  } catch {
    // приватный режим или переполнено — выбор живёт до перезагрузки
  }
  for (const ф of [...слушатели]) ф();
}

export function установитьВесьЭкранСтраниц(вкл: boolean, браузер = false): void {
  const д = док();
  if (вкл && браузер && д && д.fullscreenEnabled && !д.fullscreenElement && д.documentElement?.requestFullscreen && !этоIOS()) {
    слушатьЭкран();
    браузерМы = true;
    // Синхронно из нажатия: браузер разрешает полноэкранный только из жеста.
    void д.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
      браузерМы = false;
    });
  }
  if (!вкл && браузерМы && д?.fullscreenElement && д.exitFullscreen) {
    браузерМы = false;
    void д.exitFullscreen().catch(() => undefined);
  }
  сохранить(вкл);
}

/** Уход с экрана суры: выйти из полноэкранного браузера (режим помним). */
export function выйтиИзПолноэкранного(): void {
  const д = док();
  if (браузерМы && д?.fullscreenElement && д.exitFullscreen) {
    браузерМы = false;
    void д.exitFullscreen().catch(() => undefined);
  }
}

function подписаться(ф: () => void): () => void {
  слушатели.add(ф);
  return () => {
    слушатели.delete(ф);
  };
}

export function useВесьЭкранСтраниц(): boolean {
  return useSyncExternalStore(подписаться, текущий, текущий);
}
