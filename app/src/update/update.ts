/**
 * Новая версия на сайте → полоса «Вышло обновление AI Ustaz» с кнопкой «Обновить» (components: update/UpdateBar.tsx).
 *
 * Владелец 28.11.2026: «Каждый раз, когда выходит обновление, как на batr.kz выводи кнопку „Обновить“ на приложение,
 * чтобы не приходилось закрывать, заново заходить».
 *
 * Как приложение знает свой коммит: scripts/after-export.mjs ставит в index.html <meta name="aiustaz-commit"
 * content="<git rev-parse HEAD>"> (или MUGALIM_COMMIT). Выпуск (tools/release-batr.sh) собирает из того же чистого
 * коммита и кладёт рядом /aiustaz/version.json { source, branch, commit, note }. Старая открытая вкладка держит старый
 * index.html — значит и старую метку; сервер отвечает новым коммитом → полоса.
 *
 * Когда спрашиваем version.json (cache: 'no-store', только свой адрес, без cookie): через ПАУЗА_СТАРТА_МС после запуска,
 * при возвращении во вкладку (visibilitychange, не чаще раза в ЧАЩЕ_НЕ_МС) и каждые ИНТЕРВАЛ_МС, пока вкладка видна.
 * Без сети (navigator.onLine = false) не спрашиваем; ошибка сети или не-JSON — тихо, без сообщений.
 * На batr.kz страницей управляет worker сайта BATR (scope «/», web/public/sw.js): всё, кроме навигации и /api/, он отдаёт
 * cache-first — version.json застрял бы в его кэше навсегда. Поэтому перед запросом, если страницей управляет чужой
 * worker, убираем из CacheStorage только свою запись /aiustaz/version.json (убратьЧужуюКопию) — его кэш не растёт.
 *
 * «Обновить» (обновитьПриложение): registration.update() у нашего service worker'а (public/push-sw.js: новая сборка —
 * новые байты; install — skipWaiting и докачка новой оболочки, activate — clients.claim и чистка старых файлов) и
 * fetch текущей страницы с cache: 'reload' — запрос идёт через fetch-обработчик worker'а (index.html — сеть, ответ
 * кладётся в кэш «aiustaz-страница-v1») и обновляет HTTP-кэш браузера; затем location.reload(). Новый index.html ссылается
 * на JS с новым хэшем в имени — его в кэше нет, worker берёт его из сети. localStorage и кэш скачанного чтения
 * «aiustaz-аудио-v1» не трогаем. Работает и во вкладке, и в установленном приложении (standalone) — ветвлений нет.
 *
 * «×» — скрыть до следующей другой версии: ключ aiustaz:update-dismissed.v1 = коммит, который скрыли (без личных данных).
 *
 * Где проверяем: веб, есть метка коммита, сайт aiustaz.pro или batr.kz; на 127.0.0.1 и прочих — только с тестовым
 * флагом localStorage «aiustaz:update-test» = «1» (scripts/e2e-update.mjs). Нативно — нет (там обновляет магазин).
 *
 * Контракт:
 *   коммитСборки() → строка | null; можноПроверять() → boolean;
 *   разобратьВерсию(json) → коммит | null; другаяВерсия(свой, серверный) → boolean;
 *   запуститьПроверку(приНовой) → отписка; скрытьВерсию(коммит); скрытаВерсия() → коммит | null;
 *   обновитьПриложение() → Promise<void> (в конце — перезагрузка страницы).
 */
import { Platform } from 'react-native';
import { видХоста } from '../install/platform';
import { АДРЕС_SW, ОБЛАСТЬ_SW } from '../notify/push';

export const АДРЕС_ВЕРСИИ = ОБЛАСТЬ_SW + 'version.json';
export const МЕТКА_КОММИТА = 'aiustaz-commit';
export const КЛЮЧ_ТЕСТА_ОБНОВЛЕНИЯ = 'aiustaz:update-test';
export const КЛЮЧ_СКРЫТО = 'aiustaz:update-dismissed.v1';
const ПАУЗА_СТАРТА_МС = 3000;
const ИНТЕРВАЛ_МС = 10 * 60 * 1000;
const ЧАЩЕ_НЕ_МС = 60 * 1000;
const ОТВЕТ_МС = 10_000;
const ЖДАТЬ_WORKER_МС = 5000;
const КОММИТ = /^[0-9a-f]{7,40}$/;

let кэшКоммита: string | null | undefined;

/** Коммит этой сборки из <meta name="aiustaz-commit"> (ставит after-export); нет метки (дев-сервер) — null. */
export function коммитСборки(): string | null {
  if (кэшКоммита !== undefined) return кэшКоммита;
  let к: string | null = null;
  try {
    const з = document.querySelector(`meta[name="${МЕТКА_КОММИТА}"]`)?.getAttribute('content')?.trim().toLowerCase() ?? '';
    к = КОММИТ.test(з) ? з : null;
  } catch {
    к = null;
  }
  кэшКоммита = к;
  return к;
}

function хранилище(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function можноПроверять(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined' || typeof fetch !== 'function') return false;
  if (!коммитСборки()) return false;
  const вид = видХоста(window.location?.hostname);
  if (вид === 'свой' || вид === 'batr') return true;
  try {
    return хранилище()?.getItem(КЛЮЧ_ТЕСТА_ОБНОВЛЕНИЯ) === '1';
  } catch {
    return false;
  }
}

/** { commit: '<sha>' } → коммит строчными буквами; всё прочее — null. */
export function разобратьВерсию(данные: unknown): string | null {
  if (!данные || typeof данные !== 'object') return null;
  const к = (данные as { commit?: unknown }).commit;
  if (typeof к !== 'string') return null;
  const з = к.trim().toLowerCase();
  return КОММИТ.test(з) ? з : null;
}

/** Разные ли коммиты (короткий и полный одного коммита — одинаковые). */
export function другаяВерсия(свой: string, серверный: string): boolean {
  const а = свой.toLowerCase();
  const б = серверный.toLowerCase();
  return !(а.startsWith(б) || б.startsWith(а));
}

export function скрытаВерсия(): string | null {
  try {
    return хранилище()?.getItem(КЛЮЧ_СКРЫТО) ?? null;
  } catch {
    return null;
  }
}

export function скрытьВерсию(коммит: string): void {
  try {
    хранилище()?.setItem(КЛЮЧ_СКРЫТО, коммит);
  } catch {
    // хранилище недоступно — полоса скроется до перезагрузки
  }
}

/** Чужой worker (batr.kz) отдал бы version.json из своего кэша — убрать только эту запись. */
async function убратьЧужуюКопию(): Promise<void> {
  try {
    const управляет = navigator.serviceWorker?.controller?.scriptURL;
    if (!управляет || управляет.endsWith(АДРЕС_SW) || typeof caches === 'undefined') return;
    const адрес = new URL(АДРЕС_ВЕРСИИ, window.location.href).href;
    for (const имя of await caches.keys()) await (await caches.open(имя)).delete(адрес, { ignoreVary: true, ignoreSearch: true });
  } catch {
    // нет доступа к кэшу — спросим как есть
  }
}

/** Коммит на сервере или null (нет сети, не тот ответ, долго). */
async function коммитСервера(): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  await убратьЧужуюКопию();
  const стоп = typeof AbortController === 'function' ? new AbortController() : null;
  const таймер = стоп ? setTimeout(() => стоп.abort(), ОТВЕТ_МС) : null;
  try {
    const ответ = await fetch(АДРЕС_ВЕРСИИ, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: стоп?.signal });
    if (!ответ.ok || !(ответ.headers.get('content-type') ?? '').includes('json')) return null;
    return разобратьВерсию(await ответ.json());
  } catch {
    return null;
  } finally {
    if (таймер) clearTimeout(таймер);
  }
}

/**
 * Проверки по расписанию; приНовой(коммит) — когда на сервере другой коммит и его не скрывали «×».
 * Возвращает отписку (таймеры и обработчик visibilitychange).
 */
export function запуститьПроверку(приНовой: (коммит: string) => void): () => void {
  if (!можноПроверять()) return () => {};
  const свой = коммитСборки() as string;
  let последняя = 0;
  let идёт = false;
  const проверить = async () => {
    if (идёт || document.visibilityState === 'hidden') return;
    идёт = true;
    последняя = Date.now();
    try {
      const серверный = await коммитСервера();
      if (серверный && другаяВерсия(свой, серверный) && скрытаВерсия() !== серверный) приНовой(серверный);
    } finally {
      идёт = false;
    }
  };
  const старт = setTimeout(() => void проверить(), ПАУЗА_СТАРТА_МС);
  const интервал = setInterval(() => void проверить(), ИНТЕРВАЛ_МС);
  const приВидимости = () => {
    if (document.visibilityState === 'visible' && Date.now() - последняя >= ЧАЩЕ_НЕ_МС) void проверить();
  };
  document.addEventListener('visibilitychange', приВидимости);
  return () => {
    clearTimeout(старт);
    clearInterval(интервал);
    document.removeEventListener('visibilitychange', приВидимости);
  };
}

function неДольше<Т>(обещание: Promise<Т>, мс: number): Promise<Т | null> {
  return Promise.race([обещание.catch(() => null), new Promise<null>((готово) => setTimeout(() => готово(null), мс))]);
}

/** Обновить worker и сохранённую страницу, затем перезагрузить. Данные пользователя и скачанное аудио остаются. */
export async function обновитьПриложение(): Promise<void> {
  try {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const рег = sw ? await неДольше(sw.getRegistration(ОБЛАСТЬ_SW), ЖДАТЬ_WORKER_МС) : null;
    const страница = window.location.pathname + window.location.search;
    await неДольше(
      Promise.all([
        рег ? рег.update() : Promise.resolve(),
        fetch(страница, { cache: 'reload', credentials: 'same-origin' }).then((о) => о.text()),
      ]),
      ЖДАТЬ_WORKER_МС,
    );
  } catch {
    // что-то не вышло — всё равно перезагружаем: index.html у сайта и у worker'а — из сети
  }
  window.location.reload();
}
