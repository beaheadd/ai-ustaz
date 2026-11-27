#!/usr/bin/env node
/**
 * Доводка веб-экспорта (запускается из `npm run export:web` после `expo export`).
 *
 * Делает три вещи:
 * 1) вставляет в dist/index.html Content-Security-Policy (meta), которая
 * запрещает браузеру ЛЮБЫЕ внешние запросы — скрипты, стили, шрифты, картинки, звук,
 * fetch/XHR/WebSocket только с того же сайта. Это страховка правила «без аналитики,
 * трекеров и внешних запросов»: даже если зависимость попробует сходить в сеть, браузер не даст.
 * В шаблон public/index.html политика не вшита, чтобы не мешать дев-серверу (HMR, eval).
 * connect-src 'self' пропускает только свой адрес — в том числе /api/speech/… своего домена (проверка голосом).
 * 2) ставит метку сборки <meta name="aiustaz-speech-check" content="on|off"> — была ли сборка с флагом
 *    проверки голосом (EXPO_PUBLIC_SPEECH_CHECK=1 в том же окружении, что и `expo export`). check-dist не
 *    пропустит сборку «on» для batr.kz (проверка голосом — только на своём домене, QML).
 * 3) ставит метку <meta name="aiustaz-media-preview" content="on|off"> — была ли сборка с флагом предпросмотра
 *    видео и аудио партнёров без разрешения авторов (EXPO_PUBLIC_MEDIA_PREVIEW=1, только для владельца).
 *    check-dist не пропустит «on» без MUGALIM_TARGET=preview (на batr.kz — никогда).
 * 4) ставит <link rel="preload" as="font" type="font/woff2" crossorigin> на оба начертания Inter (имена с хэшем —
 *    из dist/assets): шрифт интерфейса начинает грузиться вместе с JS, а не после его выполнения (CSP font-src 'self').
 * 5) PWA и экран «Домой» (владелец 19.11.2026: «TWA приложение для загрузки из сайта и объяснение в APPLE»):
 *    из значков dist/pwa/*.<md5>.png (рисует tools/icons/make-icons.mjs в app/public/pwa, Expo копирует) собирает
 *    манифест dist/pwa/manifest.<md5>.json (scripts/pwa.mjs) и ставит в <head>: <link rel="manifest">,
 *    <link rel="apple-touch-icon" sizes="180x180">, apple-mobile-web-app-capable / -title / -status-bar-style,
 *    mobile-web-app-capable, два <meta name="theme-color"> (светлая и тёмная — фон экрана) вместо одного от Expo.
 *    Помечены data-aiustaz-pwa — повторный запуск заменяет их. Манифест — того же сайта (CSP default-src 'self').
 * 6) Уведомления о времени намаза (владелец 20.11.2026): в dist/push-sw.js (service worker из app/public, только push и
 *    notificationclick, без кэша) подставляет адреса значков: __ЗНАЧОК__ → /aiustaz/pwa/icon-192.<md5>.png,
 *    __ЗНАЧОК_МОНО__ → /aiustaz/pwa/icon-mono-512.<md5>.png. CSP worker-src 'self' — только этот worker своего сайта
 *    (регистрирует его app/src/notify/push.ts и только на aiustaz.pro).
 * 7) Без сети (владелец 27.11.2026: «пусть все суры и другая информация сохраняются… пользоваться офлайн»): пишет список
 *    файлов сборки dist/offline/files.<sha256[:20]>.json — { версия, оболочка: [JS, шрифты, значки], группы: { коран,
 *    зикры, махраджи, хадисы, намаз: { файлы, байт } } } (адреса от /aiustaz/) — и подставляет его адрес в push-sw.js
 *    (__ОФЛАЙН__). Worker кэширует оболочку при установке, группы — по просьбе страницы (src/offline/offline.ts).
 * media-src 'self' blob: https://cdn.islamic.network — видео и аудио партнёров только со своего сервера (относительные
 * пути media/…); чтение Корана — аудио AlQuran Cloud (владелец 27.11.2026, условия: учебное использование, стриминг)
 * и своя запись; YouTube не встраивается (frame-src 'none'), а открывается ссылкой во внешнем приложении.
 *
 * Контракт: node scripts/after-export.mjs [папка-сборки=dist]; повторный запуск ничего не меняет.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ИМЯ_МАНИФЕСТА, ПАПКА_PWA, ЦВЕТ_ТЕМЫ_СВЕТЛАЯ, ЦВЕТ_ТЕМЫ_ТЁМНАЯ, найтиЗначки, построитьМанифест } from './pwa.mjs';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const папка = path.resolve(корень, process.argv[2] ?? 'dist');
const файл = path.join(папка, 'index.html');

export const ПОЛИТИКА = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // react-native-web вставляет стили через <style>
  "img-src 'self' data: blob:", // значок — встроенный SVG (data:)
  "font-src 'self' data:",
  // Своя запись (object URL); видео и аудио партнёров — только свои файлы media/…; чтение Корана — ТОЛЬКО CDN AlQuran
  // Cloud (владелец 27.11.2026; их условия: стриминг для учебного использования; src/audio/sources.ts РАЗРЕШЁННЫЕ_CDN).
  "media-src 'self' blob: https://cdn.islamic.network",
  "connect-src 'self'",
  "worker-src 'self'", // только /aiustaz/push-sw.js (уведомления о времени намаза, 20.11.2026; регистрируется лишь на aiustaz.pro)
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const html = fs.readFileSync(файл, 'utf8');
if (html.includes('http-equiv="Content-Security-Policy"')) {
  console.log('CSP уже есть в', path.relative(корень, файл));
} else {
  const мета = `<meta http-equiv="Content-Security-Policy" content="${ПОЛИТИКА}" />`;
  if (!/<meta charset="utf-8"\s*\/?>/i.test(html)) throw new Error('В index.html нет <meta charset="utf-8"> — шаблон public/index.html изменён?');
  const новый = html.replace(/(<meta charset="utf-8"\s*\/?>)/i, `$1\n    ${мета}`);
  fs.writeFileSync(файл, новый);
  console.log('CSP добавлена в', path.relative(корень, файл));
}

export const МЕТКА_ПРОВЕРКИ = 'aiustaz-speech-check';
const проверка = process.env.EXPO_PUBLIC_SPEECH_CHECK === '1' ? 'on' : 'off';
{
  const текущий = fs.readFileSync(файл, 'utf8');
  const мета = `<meta name="${МЕТКА_ПРОВЕРКИ}" content="${проверка}" />`;
  const образец = new RegExp(`<meta name="${МЕТКА_ПРОВЕРКИ}"[^>]*>`);
  const новый = образец.test(текущий) ? текущий.replace(образец, мета) : текущий.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/i, `$1\n    ${мета}`);
  if (!новый.includes(мета)) throw new Error('не удалось поставить метку проверки голосом в index.html');
  fs.writeFileSync(файл, новый);
  console.log(`Проверка голосом в сборке: ${проверка === 'on' ? 'ВКЛЮЧЕНА (только для своего домена, не batr.kz)' : 'выключена'}`);
}

export const МЕТКА_ПРЕДПРОСМОТРА = 'aiustaz-media-preview';
const предпросмотр = process.env.EXPO_PUBLIC_MEDIA_PREVIEW === '1' ? 'on' : 'off';
{
  const текущий = fs.readFileSync(файл, 'utf8');
  const мета = `<meta name="${МЕТКА_ПРЕДПРОСМОТРА}" content="${предпросмотр}" />`;
  const образец = new RegExp(`<meta name="${МЕТКА_ПРЕДПРОСМОТРА}"[^>]*>`);
  const новый = образец.test(текущий) ? текущий.replace(образец, мета) : текущий.replace(/(<meta name="aiustaz-speech-check"[^>]*>)/i, `$1\n    ${мета}`);
  if (!новый.includes(мета)) throw new Error('не удалось поставить метку предпросмотра медиа в index.html');
  fs.writeFileSync(файл, новый);
  console.log(`Предпросмотр видео и аудио партнёров: ${предпросмотр === 'on' ? 'ВКЛЮЧЁН (только для владельца, не batr.kz)' : 'выключен'}`);
}

export const МЕТКА_ПРЕДЗАГРУЗКИ = 'aiustaz-preload';
{
  const текущий = fs.readFileSync(файл, 'utf8');
  const ресурсы = path.join(папка, 'assets');
  const шрифты = fs.existsSync(ресурсы) ? fs.readdirSync(ресурсы).filter((и) => /^inter-(400|600)\.[0-9a-f]+\.woff2$/.test(и)).sort() : [];
  if (шрифты.length !== 2) throw new Error(`ожидались 2 файла Inter woff2 в dist/assets, найдено: ${шрифты.join(', ') || 'ни одного'}`);
  const ссылки = шрифты.map((и) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/aiustaz/assets/${и}" data-${МЕТКА_ПРЕДЗАГРУЗКИ} />`).join('\n    ');
  const без = текущий.replace(new RegExp(`\\s*<link rel="preload"[^>]*data-${МЕТКА_ПРЕДЗАГРУЗКИ}[^>]*>`, 'g'), '');
  const новый = без.replace(/(<meta name="aiustaz-media-preview"[^>]*>)/i, `$1\n    ${ссылки}`);
  if (!шрифты.every((и) => новый.includes(и))) throw new Error('не удалось поставить preload шрифтов в index.html');
  fs.writeFileSync(файл, новый);
  console.log('Предзагрузка шрифтов интерфейса:', шрифты.join(', '));
}

export const МЕТКА_PWA = 'aiustaz-pwa';
{
  const папкаPwa = path.join(папка, ПАПКА_PWA);
  if (!fs.existsSync(папкаPwa)) throw new Error(`нет ${ПАПКА_PWA}/ в сборке — значки лежат в app/public/pwa (node tools/icons/make-icons.mjs)`);
  for (const и of fs.readdirSync(папкаPwa)) if (ИМЯ_МАНИФЕСТА.test(и)) fs.unlinkSync(path.join(папкаPwa, и));
  const значки = найтиЗначки(fs.readdirSync(папкаPwa));
  const json = JSON.stringify(построитьМанифест(значки), null, 2) + '\n';
  const имяМанифеста = `manifest.${crypto.createHash('md5').update(json).digest('hex')}.json`;
  fs.writeFileSync(path.join(папкаPwa, имяМанифеста), json);
  const д = `data-${МЕТКА_PWA}`;
  const теги = [
    `<link rel="manifest" href="/aiustaz/${ПАПКА_PWA}/${имяМанифеста}" ${д} />`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/aiustaz/${ПАПКА_PWA}/${значки['apple-touch-icon-180']}" ${д} />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" ${д} />`,
    `<meta name="mobile-web-app-capable" content="yes" ${д} />`,
    `<meta name="apple-mobile-web-app-title" content="AI Ustaz" ${д} />`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default" ${д} />`,
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${ЦВЕТ_ТЕМЫ_СВЕТЛАЯ}" ${д} />`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${ЦВЕТ_ТЕМЫ_ТЁМНАЯ}" ${д} />`,
  ];
  const текущий = fs.readFileSync(файл, 'utf8');
  const без = текущий
    .replace(new RegExp(`\\s*<(?:link|meta)[^>]*${д}[^>]*>`, 'g'), '')
    .replace(/\s*<meta name="theme-color"[^>]*>/g, ''); // одиночный theme-color от Expo (app.json) — заменяем парой
  const после = /(<meta name="aiustaz-media-preview"[^>]*>)/i;
  if (!после.test(без)) throw new Error('не нашёл место для тегов PWA в index.html');
  const новый = без.replace(после, `$1\n    ${теги.join('\n    ')}`);
  fs.writeFileSync(файл, новый);
  console.log('PWA:', `${ПАПКА_PWA}/${имяМанифеста};`, 'значки:', Object.values(значки).join(', '));
}

export const ФАЙЛ_SW = 'push-sw.js';
{
  const путь = path.join(папка, ФАЙЛ_SW);
  if (!fs.existsSync(путь)) throw new Error(`нет ${ФАЙЛ_SW} в сборке — он лежит в app/public/${ФАЙЛ_SW}`);
  const значки = найтиЗначки(fs.readdirSync(path.join(папка, ПАПКА_PWA)));
  const текст = fs.readFileSync(путь, 'utf8');
  const новый = текст
    .replace(/'(__ЗНАЧОК__|\/aiustaz\/pwa\/icon-192\.[0-9a-f]{32}\.png)'/, `'/aiustaz/${ПАПКА_PWA}/${значки['icon-192']}'`)
    .replace(/'(__ЗНАЧОК_МОНО__|\/aiustaz\/pwa\/icon-mono-512\.[0-9a-f]{32}\.png)'/, `'/aiustaz/${ПАПКА_PWA}/${значки['icon-mono-512']}'`);
  if (новый.includes('__ЗНАЧОК')) throw new Error(`не удалось подставить значки в ${ФАЙЛ_SW}`);
  fs.writeFileSync(путь, новый);
  console.log(`Service worker уведомлений: ${ФАЙЛ_SW} — значки ${значки['icon-192']}, ${значки['icon-mono-512']}`);
}

// 7. Список файлов для работы без сети (владелец 27.11.2026).
export const ПАПКА_ОФЛАЙН = 'offline';
export const ГРУППЫ_ОФЛАЙН = { коран: ['quran/'], зикры: ['dhikr/'], махраджи: ['makharij/', 'makharij-index/'], хадисы: ['hadith/'], намаз: ['prayer/'], учимсяНамазу: ['namaz/'] };
export const ОБОЛОЧКА_ОФЛАЙН = ['_expo/', 'assets/', 'pwa/'];
{
  const все = [];
  (function обойти(п) {
    for (const и of fs.readdirSync(п, { withFileTypes: true })) {
      const полный = path.join(п, и.name);
      if (и.isDirectory()) обойти(полный);
      else все.push({ отн: path.relative(папка, полный).split(path.sep).join('/'), байт: fs.statSync(полный).size });
    }
  })(папка);
  const адрес = (отн) => '/aiustaz/' + отн;
  const оболочка = все.filter((ф) => ОБОЛОЧКА_ОФЛАЙН.some((н) => ф.отн.startsWith(н))).map((ф) => адрес(ф.отн)).sort();
  const группы = {};
  for (const [имя, начала] of Object.entries(ГРУППЫ_ОФЛАЙН)) {
    const ф = все.filter((ф) => начала.some((н) => ф.отн.startsWith(н))).sort((а, б) => (а.отн < б.отн ? -1 : 1));
    группы[имя] = { файлы: ф.map((х) => адрес(х.отн)), байт: ф.reduce((с, х) => с + х.байт, 0) };
  }
  const тело = { оболочка, группы };
  const версия = crypto.createHash('sha256').update(JSON.stringify(тело)).digest('hex').slice(0, 20);
  const текст = JSON.stringify({ версия, ...тело });
  const имя = `files.${crypto.createHash('sha256').update(текст).digest('hex').slice(0, 20)}.json`;
  const папкаОфлайн = path.join(папка, ПАПКА_ОФЛАЙН);
  fs.rmSync(папкаОфлайн, { recursive: true, force: true });
  fs.mkdirSync(папкаОфлайн, { recursive: true });
  fs.writeFileSync(path.join(папкаОфлайн, имя), текст);
  const путьSW = path.join(папка, ФАЙЛ_SW);
  const sw = fs.readFileSync(путьSW, 'utf8');
  const новый = sw.replace(/'(__ОФЛАЙН__|\/aiustaz\/offline\/files\.[0-9a-f]{20}\.json)'/, `'/aiustaz/${ПАПКА_ОФЛАЙН}/${имя}'`);
  if (новый.includes('__ОФЛАЙН__')) throw new Error(`не удалось подставить список офлайн в ${ФАЙЛ_SW}`);
  fs.writeFileSync(путьSW, новый);
  const мб = (б) => (б / 1048576).toFixed(1) + ' МБ';
  console.log(`Без сети: ${ПАПКА_ОФЛАЙН}/${имя} — оболочка ${оболочка.length} файлов, ` + Object.entries(группы).map(([и, г]) => `${и} ${г.файлы.length} (${мб(г.байт)})`).join(', '));
}
