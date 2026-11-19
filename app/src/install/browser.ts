/**
 * Установка AI Ustaz — связь с браузером: событие beforeinstallprompt (кнопка «Установить» в Chrome, Edge,
 * Samsung Internet), appinstalled, чтение среды (userAgent, display-mode, ?source=), копирование ссылки.
 *
 * Контракт:
 *   прочитатьСреду() → Среда (install/platform.ts) — на устройстве; нативно (Android/iOS-приложение) — «установлено».
 *   естьПредложение() → пришло ли beforeinstallprompt (Chrome готов поставить приложение).
 *   предложитьУстановку() → Promise<'принято' | 'отклонено' | 'недоступно'> — показать системное окно Chrome
 *     (вызывать из обработчика нажатия). Событие одноразовое: после ответа его нет.
 *   подписаться(слушатель) → отписаться() — для useSyncExternalStore (событие, appinstalled).
 *   версия() → число, растёт при каждом изменении (снимок для useSyncExternalStore).
 *   скопировать(текст) → Promise<boolean> — navigator.clipboard, запасной путь — выделение и execCommand('copy')
 *     (во встроенных браузерах соцсетей clipboard часто закрыт).
 * Слушатели ставятся при загрузке модуля (его подключают экраны при старте): Chrome присылает beforeinstallprompt
 * сразу после загрузки страницы, до того как человек откроет экран установки. preventDefault — без всплывающей
 * полоски Chrome: предлагаем сами, спокойно (строка на главной и экран #/install).
 * На batr.kz (видХоста → 'batr') ссылки на манифест и apple-mobile-web-app-capable убираются: ставить приложение
 * нужно с aiustaz.pro (там проверка голосом, QML); с batr.kz Chrome не должен предлагать установку.
 * Ничего не отправляет и не сохраняет. Решение владельца 19.11.2026 (TWA и установка на экран «Домой»).
 */
import { определитьСреду, видХоста, type Среда } from './platform';

type СобытиеУстановки = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let отложенное: СобытиеУстановки | null = null;
let установленоСейчас = false;
let номер = 0;
const слушатели = new Set<() => void>();

function оповестить() {
  номер += 1;
  for (const с of слушатели) с();
}

const веб = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function';

if (веб) {
  window.addEventListener('beforeinstallprompt', (е) => {
    е.preventDefault();
    отложенное = е as СобытиеУстановки;
    оповестить();
  });
  window.addEventListener('appinstalled', () => {
    отложенное = null;
    установленоСейчас = true;
    оповестить();
  });
  if (видХоста(window.location?.hostname) === 'batr') {
    for (const э of document.querySelectorAll('link[rel="manifest"], meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')) э.remove();
  }
}

export function подписаться(слушатель: () => void): () => void {
  слушатели.add(слушатель);
  return () => {
    слушатели.delete(слушатель);
  };
}

export function версия(): number {
  return номер;
}

export function естьПредложение(): boolean {
  return отложенное !== null;
}

function автономно(): boolean {
  try {
    const режим = (м: string) => window.matchMedia?.(`(display-mode: ${м})`).matches === true;
    return режим('standalone') || режим('fullscreen') || режим('minimal-ui') || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function прочитатьСреду(): Среда {
  if (!веб) return определитьСреду({ ua: '', автономно: true });
  let источник: string | null = null;
  try {
    источник = new URLSearchParams(window.location.search).get('source');
  } catch {
    источник = null;
  }
  return определитьСреду({
    ua: navigator.userAgent ?? '',
    касаний: navigator.maxTouchPoints ?? 0,
    автономно: установленоСейчас || автономно(),
    источник,
    реферер: document.referrer ?? '',
    хост: window.location?.hostname ?? '',
  });
}

export async function предложитьУстановку(): Promise<'принято' | 'отклонено' | 'недоступно'> {
  const е = отложенное;
  if (!е) return 'недоступно';
  отложенное = null;
  try {
    await е.prompt();
    const { outcome } = await е.userChoice;
    return outcome === 'accepted' ? 'принято' : 'отклонено';
  } catch {
    return 'недоступно';
  } finally {
    оповестить();
  }
}

export async function скопировать(текст: string): Promise<boolean> {
  if (!веб) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(текст);
      return true;
    }
  } catch {
    // clipboard закрыт (встроенный браузер, нет https) — запасной путь ниже
  }
  try {
    const поле = document.createElement('textarea');
    поле.value = текст;
    поле.setAttribute('readonly', '');
    поле.style.position = 'fixed';
    поле.style.opacity = '0';
    document.body.appendChild(поле);
    поле.select();
    поле.setSelectionRange(0, текст.length);
    const ок = document.execCommand('copy');
    поле.remove();
    return ок;
  } catch {
    return false;
  }
}
