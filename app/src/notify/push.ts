/**
 * Уведомления о времени намаза — связь с браузером и своим сервером: service worker, PushManager, /api/push/….
 *
 * Владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту». docs/дизайн/07-уведомления.md.
 *
 * Контракт (все функции исключений не бросают — итог строкой):
 *   естьВБраузере() → { sw, push, уведомления } — для notify/support.ts.
 *   разрешение() → 'granted' | 'denied' | 'default' | 'нет' — Notification.permission.
 *   включить(данные) → ИтогВключения — вызывать ТОЛЬКО из нажатия (системный запрос разрешения), после пояснения:
 *     запрос разрешения → service worker /aiustaz/push-sw.js (scope /aiustaz/) → публичный ключ GET /api/push/key →
 *     PushManager.subscribe (userVisibleOnly) → POST /api/push/subscribe { subscription, lang, city, items } (у пункта —
 *     off: смещение пояса места в минутах, владелец 20.11.2026: время намаза для любой страны).
 *   обновить(данные) → ИтогВключения — то же без запроса разрешения (уже 'granted'): при открытии приложения и смене
 *     города/настроек; подписки нет — подписаться заново (разрешение уже есть, окна не будет).
 *   выключить() → 'выключено' | 'нет-сети' — отписка в браузере, POST /api/push/unsubscribe (сервер удаляет подписку и
 *     расписание сразу), service worker снимается.
 *   проверить() → 'отправлено' | 'нет-подписки' | 'часто' | 'нет-сети' | 'ошибка' — POST /api/push/test.
 *   данные = { язык, город, пункты } — пункты из notify/schedule.ts; КООРДИНАТ НЕТ.
 * Адреса относительные (/api/push/…, CSP connect-src 'self'): только свой домен aiustaz.pro; без cookie и Referer.
 * Service worker — только на своём домене (на batr.kz у сайта свой SW со scope «/»: наш там не регистрируем — экран и
 * синхронизация вызывают эти функции только при поддержкаУведомлений() === 'можно').
 */
import type { ПунктРасписания } from './schedule';
import type { ЕстьВБраузере } from './support';

export const АДРЕС_SW = '/aiustaz/push-sw.js';
export const ОБЛАСТЬ_SW = '/aiustaz/';
const API = '/api/push/';
const ТАЙМАУТ_МС = 15_000;

export type ДанныеРасписания = { язык: 'ru' | 'kk'; город: string; пункты: readonly ПунктРасписания[] };
export type ИтогВключения = 'включено' | 'отказ' | 'закрыто' | 'нет-поддержки' | 'нет-сети' | 'ошибка' | 'нет-разрешения';

type Окно = typeof globalThis & { PushManager?: unknown; Notification?: { permission: string; requestPermission: () => Promise<string> } };

function окно(): Окно | null {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' ? (window as Окно) : null;
}

export function естьВБраузере(): ЕстьВБраузере {
  const о = окно();
  if (!о) return { sw: false, push: false, уведомления: false };
  return { sw: 'serviceWorker' in navigator, push: 'PushManager' in о, уведомления: 'Notification' in о };
}

export function разрешение(): 'granted' | 'denied' | 'default' | 'нет' {
  const п = окно()?.Notification?.permission;
  return п === 'granted' || п === 'denied' || п === 'default' ? п : 'нет';
}

async function запрос(путь: string, тело?: unknown): Promise<Response> {
  const отмена = new AbortController();
  const таймер = setTimeout(() => отмена.abort(), ТАЙМАУТ_МС);
  try {
    return await fetch(API + путь, {
      method: тело === undefined ? 'GET' : 'POST',
      headers: тело === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: тело === undefined ? undefined : JSON.stringify(тело),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: отмена.signal,
    });
  } finally {
    clearTimeout(таймер);
  }
}

function изBase64url(строка: string): Uint8Array<ArrayBuffer> {
  const б = строка.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (строка.length % 4)) % 4);
  const сырое = atob(б);
  const байты = new Uint8Array(new ArrayBuffer(сырое.length));
  for (let i = 0; i < сырое.length; i++) байты[i] = сырое.charCodeAt(i);
  return байты;
}

function тотЖеКлюч(подписка: PushSubscription, ключ: Uint8Array): boolean {
  const был = подписка.options?.applicationServerKey;
  if (!был) return true; // браузер не сообщает ключ — не трогаем
  const б = new Uint8Array(был);
  return б.length === ключ.length && б.every((х, i) => х === ключ[i]);
}

async function регистрация(): Promise<ServiceWorkerRegistration> {
  const sw = navigator.serviceWorker;
  const есть = await sw.getRegistration(ОБЛАСТЬ_SW);
  if (!есть || !(есть.active || есть.waiting || есть.installing)?.scriptURL.endsWith(АДРЕС_SW)) {
    await sw.register(АДРЕС_SW, { scope: ОБЛАСТЬ_SW, updateViaCache: 'none' });
  }
  // subscribe() нужен активный worker: ждём готовности (не дольше 10 с).
  return await Promise.race([
    sw.ready,
    new Promise<never>((_, нет) => setTimeout(() => нет(new Error('sw-timeout')), 10_000)),
  ]);
}

async function подписка(рег: ServiceWorkerRegistration): Promise<PushSubscription | 'нет-сети' | 'ошибка'> {
  let ответ: Response;
  try {
    ответ = await запрос('key');
  } catch {
    return 'нет-сети';
  }
  if (!ответ.ok) return 'ошибка';
  const { key } = (await ответ.json().catch(() => ({}))) as { key?: string };
  if (typeof key !== 'string' || key.length < 80) return 'ошибка';
  const ключ = изBase64url(key);
  let п = await рег.pushManager.getSubscription();
  if (п && !тотЖеКлюч(п, ключ)) {
    await п.unsubscribe().catch(() => false); // ключ сервера сменился — старая подписка недействительна
    п = null;
  }
  return п ?? (await рег.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ключ }));
}

async function отправить(п: PushSubscription, данные: ДанныеРасписания): Promise<ИтогВключения> {
  const json = п.toJSON();
  const тело = {
    subscription: { endpoint: json.endpoint, keys: json.keys, expirationTime: json.expirationTime ?? null },
    lang: данные.язык,
    city: данные.город,
    items: данные.пункты,
  };
  try {
    const ответ = await запрос('subscribe', тело);
    return ответ.ok ? 'включено' : 'ошибка';
  } catch {
    return 'нет-сети';
  }
}

async function подписатьИОтправить(данные: ДанныеРасписания): Promise<ИтогВключения> {
  try {
    const рег = await регистрация();
    const п = await подписка(рег);
    if (typeof п === 'string') return п;
    return await отправить(п, данные);
  } catch {
    return 'ошибка';
  }
}

export async function включить(данные: ДанныеРасписания): Promise<ИтогВключения> {
  const о = окно();
  const есть = естьВБраузере();
  if (!о || !есть.sw || !есть.push || !есть.уведомления || !о.Notification) return 'нет-поддержки';
  if (о.Notification.permission === 'denied') return 'отказ';
  if (о.Notification.permission !== 'granted') {
    let ответ: string;
    try {
      ответ = await о.Notification.requestPermission();
    } catch {
      return 'ошибка';
    }
    if (ответ === 'denied') return 'отказ';
    if (ответ !== 'granted') return 'закрыто';
  }
  return подписатьИОтправить(данные);
}

export async function обновить(данные: ДанныеРасписания): Promise<ИтогВключения> {
  const есть = естьВБраузере();
  if (!есть.sw || !есть.push || !есть.уведомления) return 'нет-поддержки';
  if (разрешение() !== 'granted') return 'нет-разрешения';
  return подписатьИОтправить(данные);
}

async function текущаяПодписка(): Promise<{ рег: ServiceWorkerRegistration | undefined; п: PushSubscription | null }> {
  if (!естьВБраузере().sw) return { рег: undefined, п: null };
  const рег = await navigator.serviceWorker.getRegistration(ОБЛАСТЬ_SW).catch(() => undefined);
  const п = рег ? await рег.pushManager.getSubscription().catch(() => null) : null;
  return { рег, п };
}

export async function выключить(): Promise<'выключено' | 'нет-сети'> {
  try {
    const { рег, п } = await текущаяПодписка();
    let итог: 'выключено' | 'нет-сети' = 'выключено';
    if (п) {
      const endpoint = п.endpoint;
      await п.unsubscribe().catch(() => false);
      try {
        const ответ = await запрос('unsubscribe', { endpoint });
        if (!ответ.ok && ответ.status >= 500) итог = 'нет-сети';
      } catch {
        итог = 'нет-сети'; // в браузере отписка уже есть: push-сервис ответит серверу 410, и он удалит данные сам
      }
    }
    await рег?.unregister().catch(() => false);
    return итог;
  } catch {
    return 'выключено';
  }
}

export async function проверить(): Promise<'отправлено' | 'нет-подписки' | 'часто' | 'нет-сети' | 'ошибка'> {
  try {
    const { п } = await текущаяПодписка();
    if (!п) return 'нет-подписки';
    const ответ = await запрос('test', { endpoint: п.endpoint });
    if (ответ.ok) return 'отправлено';
    if (ответ.status === 404 || ответ.status === 410) return 'нет-подписки';
    if (ответ.status === 429) return 'часто';
    return 'ошибка';
  } catch {
    return 'нет-сети';
  }
}
