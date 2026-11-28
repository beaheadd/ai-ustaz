/*
 * AI Ustaz — service worker: уведомления о времени намаза и работа без сети. Область — только /aiustaz/, регистрируется
 * только на aiustaz.pro (app/src/offline/offline.ts и app/src/notify/push.ts; на batr.kz у сайта свой service worker со
 * scope «/» — там наш не ставим).
 *
 * 1) Уведомления (владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту»;
 *    docs/дизайн/07-уведомления.md): показывает уведомление из push (текст собирает сервер AI Ustaz — server/push.py) и
 *    по нажатию открывает приложение (#/prayer, #/qibla или #/notifications). Значки — эмблема-фонарь (pwa/icon-192) и
 *    монохромный значок (pwa/icon-mono-512): имена с хэшем подставляет scripts/after-export.mjs. Звука от себя нет;
 *    текст Корана в уведомлениях не показываем (правило 9).
 * 2) Без сети (владелец 27.11.2026: «пусть все суры и другая информация сохраняются, чтобы не грузить заново каждый
 *    раз и чтобы можно было пользоваться офлайн»). Список файлов сборки — offline/files.<хэш>.json (адрес подставляет
 *    after-export): «оболочка» (JS, шрифты, значки) кэшируется при установке worker'а; группы данных (коран, зикры,
 *    махраджи, хадисы, намаз) — по сообщению «докачать» со страницы (с ходом загрузки) и по мере открытия.
 *    Кэшируются ТОЛЬКО свои файлы с хэшем в имени (они не меняются) — cache-first; index.html — сеть, при её отсутствии
 *    сохранённая копия. Остальное (api/, media/, аудио кари, privacy.html) — мимо worker'а, как раньше. Ничего не
 *    отправляет и не хранит, кроме этих файлов; внешних адресов нет (scripts/check-dist.mjs, п. 10).
 * 3) Скачанное чтение кари (владелец 27.11.2026: «кнопка „Скачать“ по каждому аяту… без интернета слушать»): страница
 *    (src/audio/download.ts) кладёт файлы аятов своего зеркала /aiustaz-audio/… в кэш «aiustaz-аудио-v1»; worker отдаёт
 *    их оттуда (с Range — перемотка и Safari), не скачанные — из сети как раньше. Сам аудио не кэширует и этот кэш при
 *    обновлении не чистит (удаляет только человек: «Ещё» → «Скачанное чтение»).
 */
'use strict';

const ЗНАЧОК = '__ЗНАЧОК__';
const ЗНАЧОК_МОНО = '__ЗНАЧОК_МОНО__';
const ОБЛАСТЬ = '/aiustaz/';
const АДРЕСА = { prayer: '#/prayer', qibla: '#/qibla', notifications: '#/notifications' };
const КНОПКИ = new Set(['prayer', 'qibla']);
const ОФЛАЙН = '__ОФЛАЙН__';
const СТРАНИЦА = ОБЛАСТЬ + 'index.html';
const КЭШ_ФАЙЛОВ = 'aiustaz-файлы-v1';
const КЭШ_СТРАНИЦЫ = 'aiustaz-страница-v1';
const С_ХЭШЕМ = /^\/aiustaz\/(?:_expo|assets|pwa|quran|quran-words|quran-trans|fonts|hadith|dhikr|makharij|makharij-index|prayer|offline)\/[^?#]*[.-][0-9a-f]{16,}\.[a-z0-9]+$/i;
const ПОТОКОВ = 4;
const КЭШ_АУДИО = 'aiustaz-аудио-v1';
const АУДИО = /^\/aiustaz-audio\/\d+\/[a-z]{2}\.[a-z0-9-]+\/\d+\.mp3$/;

// ── Без сети ──

let списокОбещание = null;

/** Список файлов сборки (offline/files.<хэш>.json): из кэша, иначе из сети. */
function список() {
  if (!списокОбещание) {
    списокОбещание = (async () => {
      const кэш = await caches.open(КЭШ_ФАЙЛОВ);
      let ответ = await кэш.match(ОФЛАЙН);
      if (!ответ) {
        ответ = await fetch(ОФЛАЙН, { cache: 'no-cache', credentials: 'omit' });
        if (!ответ.ok) throw new Error('нет списка');
        await кэш.put(ОФЛАЙН, ответ.clone());
      }
      return ответ.json();
    })().catch((ошибка) => {
      списокОбещание = null;
      throw ошибка;
    });
  }
  return списокОбещание;
}

/** Ждёт ли новый worker (не этот) своей очереди — тогда долгие загрузки этого worker'а надо прервать. */
function заменяют() {
  const ждёт = self.registration && self.registration.waiting;
  return !!ждёт && ждёт !== self.serviceWorker;
}

/** Положить в кэш недостающие файлы (по ПОТОКОВ сразу); ход(готово) — после каждого файла. */
async function положить(кэш, адреса, ход) {
  let готово = 0;
  const очередь = [];
  for (const а of адреса) {
    if (await кэш.match(а)) готово += 1;
    else очередь.push(а);
  }
  if (ход) ход(готово);
  let ошибок = 0;
  async function поток() {
    while (очередь.length) {
      // Новая версия приложения уже ждёт (нажали «Обновить»): докачку прерываем, иначе новый worker ждёт её конца и
      // после перезагрузки остаётся старая версия. Недокачанное догрузит новый worker (offline.ts просит снова).
      if (заменяют()) break;
      const а = очередь.shift();
      try {
        const ответ = await fetch(а, { credentials: 'omit' });
        if (ответ.ok) await кэш.put(а, ответ);
        else ошибок += 1;
      } catch (_) {
        ошибок += 1;
      }
      готово += 1;
      if (ход) ход(готово);
    }
  }
  await Promise.all(Array.from({ length: ПОТОКОВ }, поток));
  return ошибок;
}

async function состояние() {
  const с = await список();
  const кэш = await caches.open(КЭШ_ФАЙЛОВ);
  const есть = new Set((await кэш.keys()).map((з) => new URL(з.url).pathname));
  const группы = {};
  for (const [имя, г] of Object.entries(с.группы)) {
    группы[имя] = { есть: г.файлы.filter((ф) => есть.has(ф)).length, всего: г.файлы.length, байт: г.байт };
  }
  return { тип: 'состояние', группы, оболочка: с.оболочка.every((ф) => есть.has(ф)) };
}

async function докачать(группа, порт) {
  try {
    const с = await список();
    const г = с.группы[группа];
    if (!г) throw new Error('нет группы');
    const кэш = await caches.open(КЭШ_ФАЙЛОВ);
    await положить(кэш, г.файлы, (готово) => порт && порт.postMessage({ тип: 'ход', группа, готово, всего: г.файлы.length }));
    const итог = (await состояние()).группы[группа];
    if (порт) порт.postMessage({ тип: 'готово', группа, ...итог });
  } catch (_) {
    if (порт) порт.postMessage({ тип: 'ошибка', группа });
  }
}

self.addEventListener('install', (событие) => {
  self.skipWaiting();
  событие.waitUntil(
    (async () => {
      try {
        const с = await список();
        await положить(await caches.open(КЭШ_ФАЙЛОВ), с.оболочка);
        const страница = await fetch(СТРАНИЦА, { cache: 'no-cache', credentials: 'omit' });
        if (страница.ok) await (await caches.open(КЭШ_СТРАНИЦЫ)).put(СТРАНИЦА, страница);
      } catch (_) {
        // нет сети при установке — оболочка докачается по мере открытия
      }
    })(),
  );
});

self.addEventListener('activate', (событие) => {
  событие.waitUntil(
    (async () => {
      // Старые кэши и файлы прежних сборок (имена с другим хэшем) — удалить.
      for (const имя of await caches.keys()) if (имя.startsWith('aiustaz-') && имя !== КЭШ_ФАЙЛОВ && имя !== КЭШ_СТРАНИЦЫ && имя !== КЭШ_АУДИО) await caches.delete(имя);
      try {
        const с = await список();
        const нужны = new Set([ОФЛАЙН, ...с.оболочка, ...Object.values(с.группы).flatMap((г) => г.файлы)]);
        const кэш = await caches.open(КЭШ_ФАЙЛОВ);
        for (const з of await кэш.keys()) if (!нужны.has(new URL(з.url).pathname)) await кэш.delete(з);
      } catch (_) {
        // нет списка — чистим в следующий раз
      }
      await self.clients.claim();
    })(),
  );
});

async function страница(запрос) {
  const кэш = await caches.open(КЭШ_СТРАНИЦЫ);
  try {
    const ответ = await fetch(запрос);
    if (ответ.ok && ответ.type === 'basic') await кэш.put(СТРАНИЦА, ответ.clone());
    return ответ;
  } catch (ошибка) {
    const сохранённая = await кэш.match(СТРАНИЦА);
    if (сохранённая) return сохранённая;
    throw ошибка;
  }
}

async function файл(запрос, путь) {
  const кэш = await caches.open(КЭШ_ФАЙЛОВ);
  const есть = await кэш.match(путь);
  if (есть) return есть;
  const ответ = await fetch(запрос);
  if (ответ.ok && ответ.type === 'basic') await кэш.put(путь, ответ.clone());
  return ответ;
}

/** Скачанный аят из кэша (Range → 206 с куском), иначе — сеть, как без worker'а. */
async function аудио(запрос, путь) {
  const есть = await (await caches.open(КЭШ_АУДИО)).match(путь);
  if (!есть) return fetch(запрос);
  const диапазон = /^bytes=(\d*)-(\d*)$/.exec(запрос.headers.get('range') || '');
  if (!диапазон) return есть;
  const тело = await есть.blob();
  const размер = тело.size;
  const начало = диапазон[1] === '' ? Math.max(0, размер - Number(диапазон[2] || 0)) : Number(диапазон[1]);
  const конец = диапазон[1] !== '' && диапазон[2] !== '' ? Math.min(Number(диапазон[2]), размер - 1) : размер - 1;
  if (начало >= размер || начало > конец) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + размер } });
  return new Response(тело.slice(начало, конец + 1), {
    status: 206,
    headers: {
      'Content-Type': есть.headers.get('content-type') || 'audio/mpeg',
      'Content-Range': 'bytes ' + начало + '-' + конец + '/' + размер,
      'Content-Length': String(конец - начало + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (событие) => {
  const запрос = событие.request;
  if (запрос.method !== 'GET') return;
  const адрес = new URL(запрос.url);
  if (адрес.origin === self.location.origin && АУДИО.test(адрес.pathname)) {
    событие.respondWith(аудио(запрос, адрес.pathname));
    return;
  }
  if (адрес.origin !== self.location.origin || !адрес.pathname.startsWith(ОБЛАСТЬ)) return;
  if (адрес.pathname === СТРАНИЦА || адрес.pathname === ОБЛАСТЬ) событие.respondWith(страница(запрос));
  else if (С_ХЭШЕМ.test(адрес.pathname)) событие.respondWith(файл(запрос, адрес.pathname));
});

self.addEventListener('message', (событие) => {
  const данные = событие.data || {};
  const порт = событие.ports && событие.ports[0];
  if (!порт) return;
  if (данные.тип === 'состояние') событие.waitUntil(состояние().then((р) => порт.postMessage(р), () => порт.postMessage({ тип: 'ошибка' })));
  else if (данные.тип === 'докачать' && typeof данные.группа === 'string') событие.waitUntil(докачать(данные.группа, порт));
});

// ── Уведомления ──

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
      lang: д.lang === 'kk' ? 'kk' : д.lang === 'uz' ? 'uz-Latn' : д.lang === 'en' ? 'en' : 'ru',
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
