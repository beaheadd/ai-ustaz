/*
 * AI Ustaz — service worker уведомлений о времени намаза. Область — только /aiustaz/, регистрируется только на aiustaz.pro
 * (app/src/notify/push.ts; на batr.kz у сайта свой service worker со scope «/» — там наш не ставим).
 * Владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту». docs/дизайн/07-уведомления.md.
 *
 * Делает ровно две вещи: показывает уведомление из push (текст собирает сервер AI Ustaz — server/push.py) и по нажатию
 * открывает приложение (#/prayer, #/qibla или #/notifications). НЕ кэширует ничего, НЕ перехватывает запросы (обработчика
 * fetch нет), чужие пути не трогает — это проверяет scripts/check-dist.mjs (узкое исключение из правила «хэш в имени»).
 * Значки — эмблема-фонарь (pwa/icon-192) и монохромный значок для строки состояния (pwa/icon-mono-512): имена с хэшем
 * подставляет scripts/after-export.mjs. Звука от себя нет — системный звук уведомлений (без музыки; запись азана кари —
 * только по договору, будущая опция). Текст Корана в уведомлениях не показываем (правило 9).
 */
'use strict';

const ЗНАЧОК = '__ЗНАЧОК__';
const ЗНАЧОК_МОНО = '__ЗНАЧОК_МОНО__';
const ОБЛАСТЬ = '/aiustaz/';
const АДРЕСА = { prayer: '#/prayer', qibla: '#/qibla', notifications: '#/notifications' };
const КНОПКИ = new Set(['prayer', 'qibla']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (событие) => событие.waitUntil(self.clients.claim()));

function строка(значение, предел) {
  return typeof значение === 'string' ? значение.slice(0, предел) : '';
}

/** Полезная нагрузка сервера → заголовок и параметры showNotification (всё лишнее отбрасывается). */
function разобрать(данные) {
  let д = null;
  try {
    д = данные ? данные.json() : null;
  } catch (_) {
    д = null;
  }
  if (!д || typeof д !== 'object') return null;
  const заголовок = строка(д.title, 120);
  if (!заголовок) return null;
  const адрес = Object.values(АДРЕСА).includes(д.url) ? д.url : АДРЕСА.prayer;
  const кнопки = Array.isArray(д.actions)
    ? д.actions
        .filter((к) => к && КНОПКИ.has(к.action) && typeof к.title === 'string')
        .slice(0, 2)
        .map((к) => ({ action: к.action, title: строка(к.title, 40) }))
    : [];
  return {
    заголовок,
    параметры: {
      body: строка(д.body, 240),
      tag: строка(д.tag, 80) || 'aiustaz',
      icon: ЗНАЧОК,
      badge: ЗНАЧОК_МОНО,
      lang: д.lang === 'kk' ? 'kk' : д.lang === 'uz' ? 'uz-Latn' : 'ru',
      dir: 'ltr',
      silent: д.silent === true,
      renotify: false,
      requireInteraction: false,
      timestamp: Number.isFinite(д.ts) ? д.ts : Date.now(),
      actions: кнопки,
      data: { адрес },
    },
  };
}

self.addEventListener('push', (событие) => {
  const у = разобрать(событие.data);
  if (!у) return;
  событие.waitUntil(self.registration.showNotification(у.заголовок, у.параметры));
});

self.addEventListener('notificationclick', (событие) => {
  событие.notification.close();
  const данные = событие.notification.data || {};
  const хэш = КНОПКИ.has(событие.action) ? АДРЕСА[событие.action] : Object.values(АДРЕСА).includes(данные.адрес) ? данные.адрес : АДРЕСА.prayer;
  const цель = new URL(ОБЛАСТЬ + 'index.html' + хэш, self.location.origin).href;
  событие.waitUntil(
    (async () => {
      const окна = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const окно of окна) {
        if (new URL(окно.url).pathname.startsWith(ОБЛАСТЬ) && 'focus' in окно) {
          await окно.focus();
          try {
            await окно.navigate(цель);
          } catch (_) {
            // окно не под этим worker'ом — оставляем его как есть, оно уже на экране
          }
          return;
        }
      }
      await self.clients.openWindow(цель);
    })(),
  );
});
