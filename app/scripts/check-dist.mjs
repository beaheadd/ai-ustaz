#!/usr/bin/env node
/**
 * Проверка веб-сборки app/dist перед выкладкой в batr-world/web/public/aiustaz/.
 *
 * Проверяет (любая ошибка → код выхода 1):
 *  1. Нет растровых файлов (png jpg jpeg webp gif ico bmp avif tif tiff) — .gitignore batr-world
 *     их отбрасывает, в выкладке они бы потерялись. УЗКОЕ ИСКЛЮЧЕНИЕ (владелец 19.11.2026: TWA и установка на экран):
 *     PNG-значки приложения — только в pwa/, только имена из scripts/pwa.mjs (<вид>.<md5>.png), не больше пяти,
 *     каждый ≤ 128 КБ, вместе ≤ 320 КБ, размер картинки — как в имени. В batr-world для них нужно исключение
 *     `!web/public/aiustaz/pwa/*.png` в .gitignore (без него п. 5 — предупреждение здесь; tools/release-batr.sh
 *     выкладку не пропустит). Манифест pwa/manifest.<md5>.json: ссылка в index.html, scope и start_url в /aiustaz/,
 *     standalone, значки 192/512/maskable/monochrome существуют и нужного размера; apple-touch-icon 180×180.
 *  2. У всех файлов, кроме index.html, metadata.json и privacy.html, в имени есть хэш содержимого
 *     (service worker batr.kz кэширует файлы по URL навсегда); у assets/ хэш = md5 содержимого.
 *     Карт исходников (.map) в сборке нет.
 *  3. Пути в index.html (src/href) начинаются с /aiustaz/ (или data:); есть <script> бандла;
 *     есть Content-Security-Policy (scripts/after-export.mjs); нет неподставленных меток %ИМЯ%,
 *     есть <html lang="ru|kk"> и <title>; <meta charset="utf-8"> — в первых 1024 байтах.
 *  4. Нет внешних URL http(s) в index.html и бандле, кроме разрешённых строк (ниже, с причиной)
 *     и URL из текстов лицензий (src/legal/licenses.json). Это строки в коде, не запросы;
 *     запросы наружу дополнительно запрещает CSP.
 *  5. Пути сборки не попадают под .gitignore batr-world: встроенный список правил +, если рядом
 *     есть репозиторий batr-world (переменная BATR_WORLD или /home/user/batr-world), точная
 *     проверка `git check-ignore` (только чтение).
 *  6. Размер: бюджет JS и всей сборки (переменные MUGALIM_БЮДЖЕТ_JS_КБ, MUGALIM_БЮДЖЕТ_ВСЕГО_КБ).
 *  7. Проверка голосом: метка <meta name="aiustaz-speech-check" content="on|off"> (scripts/after-export.mjs).
 *     «on» (сборка с EXPO_PUBLIC_SPEECH_CHECK=1) — ошибка, если не сказано MUGALIM_TARGET=own-domain:
 *     на batr.kz проверка голосом запрещена (QML). Код страницы и сам выключает её на batr.kz (speech/flag.ts).
 *     Адрес сервиса — относительный /api/speech/… (не http(s), п. 4 его не трогает; CSP connect-src 'self');
 *     абсолютных адресов речевого сервиса в бандле быть не должно.
 *  8. Видео и аудио партнёров (решение владельца 19.11.2026; content/media.json):
 *     — свои файлы — только в media/ с расширением аудио/видео и хэшем в имени (относительные пути из данных);
 *     — ссылки https://www.youtube.com/watch?v=… — только как текст в данных (кнопка «Смотреть на YouTube»
 *       открывает внешнее приложение); встраивания нет: ни youtube.com/embed, ни youtube-nocookie, ни ytimg,
 *       ни <iframe; CSP: frame-src 'none', media-src только 'self' (+ blob: для своей записи), без youtube;
 *     — метка <meta name="aiustaz-media-preview" content="on|off">: «on» (сборка с EXPO_PUBLIC_MEDIA_PREVIEW=1,
 *       видео без разрешения авторов) — ошибка, если не сказано MUGALIM_TARGET=preview.
 *  9. Полный Коран для показа (решение владельца 19.11.2026; tools/quran/build_quran.py → app/public/quran → dist/quran):
 *     — индекс из манифеста src/quran/manifest.generated.ts есть, его sha256 = манифесту; 114 файлов сур из индекса есть,
 *       sha256 каждого = индексу, хэш в имени = началу sha256; других файлов в quran/ нет;
 *     — в каждом файле — блок копирайта Tanzil (условие Tanzil: в каждом производном файле);
 *     — текста Корана нет в JS-чанках: ни один арабский отрезок JS длиной ≥ 25 символов не входит в текст сур 2–114,
 *       кроме отрезков аль-Фатихи (чанк fatiha-demo по замыслу; 1:1 дословно есть и в 27:30). Суры грузятся fetch'ем
 *       по одной (src/quran/data.ts).
 * Запуск: npm run check:dist  [папка-сборки=dist]
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ИМЯ_ЗНАЧКА, ИМЯ_МАНИФЕСТА, ПАПКА_PWA, ПРЕДЕЛ_ЗНАЧКА, ПРЕДЕЛ_ЗНАЧКОВ, ЗНАЧКИ_PWA } from './pwa.mjs';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const папка = path.resolve(корень, process.argv[2] ?? 'dist');
const БАЗА = '/aiustaz/';
const ПУТЬ_В_BATR = 'web/public/aiustaz/';
// Бюджет JS — все чанки вместе (сырые байты; основной чанк ≈ 880 КБ, gzip всей сборки ≈ 320 КБ).
// 19.11.2026: 1200 → 1250 КБ — задача владельца расширила приложение (время намаза, кибла, дизайн-система,
// главная). Поднял интегратор после сжатия Terser в два прохода (−20 КБ); ждёт подтверждения ведущего/владельца.
// Владелец 19.11.2026: полный Коран, плеер, запись. Плеер чтения кари: 1250 → 1282 КБ — измеренный прирост +30 111 байт
// (29,4 КБ) + запас 2,6 КБ. Мерили сборкой копии дерева: <МиниПлеер /> в App.tsx против той же сборки с одним src/quran/data
// (данные Корана — не плеер, их учитывают экраны): 1 287 701 → 1 317 812 байт JS. Состав: audio/core 10,2 КБ, мини-плеер
// 7,4, тексты ru+kk 5,2, sources 2,5, player 2,2, audio-sources.json 1,5, web 1,3. Пока экран плеер не подключил, в бандле его нет.
// Владелец 19.11.2026: полный Коран, плеер, запись. Запись и проверка любого аята: 1282 → 1300 КБ — измеренный прирост
// +17 969 байт (17,5 КБ) + запас 0,5 КБ. Мерили сборкой копии дерева (база — та же сборка с мини-плеером, src/quran/data и
// src/quran/text, их учитывают плеер и экраны): <ПанельЧтенияАята> с quran-check (части аята, kinds) — 1 320 132 → 1 336 625
// (+16 493); правки уроков (speech/answer, check, fields — uthmani_from и слово замечания; RecordPanel, VoiceCheck) —
// 1 318 656 → 1 320 132 (+1 476). Пока экран #/quran/check панель не подключил, в бандле только +1 476.
// Владелец 19.11.2026: полный Коран, плеер, запись. Экраны Корана (список 114 сур, сура, #/quran/check, мини-плеер в App,
// маршруты с query n/a/p, глубокая ссылка): 1300 → 1340 КБ — измеренный прирост +34 879 байт (34,1 КБ) + запас 5,9 КБ.
// Мерили сборкой копии дерева: база — то же дерево с мини-плеером в App.tsx, <ПанельЧтенияАята> и src/quran/data, но без
// экранов Корана (прежние routes/navigation/Screen/QuranScreen/HomeScreen) — 1 336 649 → 1 364 060 байт (+27 411: экраны,
// поиск, «Продолжить чтение», маршруты); плюс данные Корана (quran/data + loader + манифест, +7 468 — их по договорённости
// учитывает первый экран чтения, в базах плеера и записи они уже были). Текста Корана в JS нет (п. 9) — только fetch.
// Владелец 19.11.2026: полный Коран, плеер, запись. Правки по ревью (финал): 1340 → 1350 КБ — измеренный прирост
// +17 026 байт (16,6 КБ) + запас 1,3 КБ. Мерили сборкой копии дерева: база — то же дерево без правок ревью (те же файлы
// других агентов) — 1 364 060 байт, с правками — 1 381 086. Состав: <ТекстАята> (знак остановки не отрывается от слова),
// размер арабского текста А−/А+, свёрнутый мини-плеер и значок «по кругу», кружок-кнопка аята, ссылки и поиск по
// синонимам в списке сур, «Весь аят» и текущая часть в панели записи, фокус и live-регионы, состояние «файл не найден».
// Владелец 19.11.2026: установка приложения (ветка install-pwa, слита с Кораном): +33 641 байт JS — экран #/install (ru + kk,
// шаги для Android, iPhone, встроенных браузеров), строка на главной и в «Ещё», шесть значков: 1350 → 1383 КБ.
const БЮДЖЕТ_JS_КБ = Number(process.env.MUGALIM_БЮДЖЕТ_JS_КБ ?? 1383);
// Владелец 19.11.2026: полный Коран, плеер, запись. Всего 3000 → 4688 КБ — ровно на измеренный прирост от полного
// Корана: dist/quran 1 726 219 байт (114 сур + индекс; текст 1,33 МБ + блок условий Tanzil в каждом файле ≈ 160 КБ)
// + JS 2017 байт (запись источника «tanzil-phonetic» в sources.json); сборка HEAD d7a3d70 — 1 465 455 байт, с Кораном —
// 3 193 691 (+1 728 236 байт = 1688 КБ). JS-бюджет не менялся (1249 из 1250 КБ). Плеер и запись добавят своё отдельно.
// Плеер чтения кари: всего 4688 → 4718 КБ — тот же прирост JS (+30 111 байт); аудиофайлов в сборке нет (п. 1: медиа — только media/).
// Запись и проверка аята: всего 4718 → 4736 КБ — тот же прирост JS (+17 969 байт); записей голоса в сборке нет.
// Экраны Корана: всего 4736 → 4770 КБ — тот же прирост JS (+34 879 байт); новых статических файлов нет.
// Установка приложения: значки pwa/, манифест, privacy.html и тот же прирост JS — всего 4770 → ВСЕГО_ПОСЛЕ_ЗАМЕРА КБ.
const БЮДЖЕТ_ВСЕГО_КБ = Number(process.env.MUGALIM_БЮДЖЕТ_ВСЕГО_КБ ?? 4930);

const РАСТР = /\.(png|jpe?g|webp|gif|ico|bmp|avif|tiff?)$/i;
/** Свои видео и аудио партнёров (content/media.json → файл_видео, аудио.файл) — только в media/. */
const МЕДИА = /\.(m4a|mp3|ogg|opus|webm|mp4|wav)$/i;
const ВСТРАИВАНИЕ = /youtube\.com\/embed|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|<iframe/i;
// privacy.html — политика конфиденциальности для Google Play: нужен постоянный адрес
// https://aiustaz.pro/aiustaz/privacy.html (владелец 19.11.2026: «подготовить файлы, чтобы загрузить на Play Market»).
// На aiustaz.pro SW нет, nginx отдаёт её с no-cache; на batr.kz её может закэшировать SW сайта — для Play адрес aiustaz.pro.
const БЕЗ_ХЭША = new Set(['index.html', 'metadata.json', 'privacy.html']);
const ХЭШ_В_ИМЕНИ = /[.-]([0-9a-f]{20,})\.[a-z0-9]+$/i;

/** Разрешённые URL-строки в коде зависимостей: префикс → почему это не запрос. */
const РАЗРЕШЁННЫЕ_URL = [
  ['http://www.w3.org/', 'пространства имён XML/SVG/MathML (react-dom, значок SVG) — не загружаются'],
  ['https://react.dev/errors/', 'ссылка в тексте ошибки React (production) — только текст'],
  ['https://expo.dev', 'expo-asset: адрес по умолчанию для ассетов-чисел; на вебе ассеты — строки, ветка не используется'],
  ['https://classic-assets.eascdn.net/~assets/', 'expo-asset: ветка только для Expo Go (ExponentKernel); на вебе не выполняется'],
  ['https://aiustaz.pro/', 'свой домен AI Ustaz: ссылка «ставить с aiustaz.pro» на экране установки (#/install) — переход по нажатию, не загрузка'],
  ['https://www.youtube.com/watch?v=', 'content/media.json: ссылка на урок учителя — текст для кнопки «Смотреть на YouTube» (внешнее приложение); не загрузка, не встраивание'],
];
/** Точные строки (не префиксы): схемы без адреса и фиктивные базы для new URL(). */
const ТОЧНЫЕ_URL = new Map([
  ['http://', 'схема без адреса (разбор URL)'],
  ['https://', 'схема без адреса (разбор URL)'],
  ['https://e', "expo-asset: фиктивная база new URL(путь, 'https://e') для разбора имени файла"],
  ['http://tanzil.net/updates/', 'блок копирайта Tanzil (content/sources.json) — по условиям Tanzil воспроизводится дословно; только текст'],
]);

/** Встроенная копия опасных правил .gitignore batr-world (на случай, если репозитория рядом нет). */
const ЗАПРЕТНЫЕ_КАТАЛОГИ = new Set([
  'node_modules', 'dist', 'data', 'logs', 'backups', '.venv', 'venv', 'env', '__pycache__', '.vite',
  '.claude', '.pytest_cache', '.mypy_cache', '.ruff_cache', 'educat-export',
]);
const ЗАПРЕТНЫЕ_ИМЕНА = [
  /\.(log|tmp|bak|old|orig|swp|db|db-wal|db-shm|sqlite3?|dump|key|pem|p8|p12|token|keystore|jks|aab|apk|zip|npz|onnx|pt|pth|mp4|mov|avi|env|tsbuildinfo|py[cod])$/i,
  /secret/i, /credential/i, /signing/i, /^\.env/i, /^nul$/i, /^id_rsa/i, /^id_ed25519/i, /^batr_vps/i,
  /^service-account.*\.json$/i, /^thumbs\.db$/i, /^\.ds_store$/i, /^world\.env$/i,
];

const ошибки = [];
const предупреждения = [];
const ошибка = (т) => ошибки.push(т);

if (!fs.existsSync(path.join(папка, 'index.html'))) {
  console.error(`Нет ${path.relative(корень, папка)}/index.html — сначала npm run export:web`);
  process.exit(1);
}

const файлы = обойти(папка).map((абс) => ({ абс, отн: path.relative(папка, абс).split(path.sep).join('/') }));

// 1–2. Растровые файлы, хэши, карты.
for (const { абс, отн } of файлы) {
  const имя = path.basename(отн);
  if (РАСТР.test(имя) && !(отн.startsWith(ПАПКА_PWA + '/') && отн.split('/').length === 2 && ИМЯ_ЗНАЧКА.test(имя)))
    ошибка(`растровый файл (потеряется в batr-world): ${отн}` + (РАСТР.test(имя) && отн.startsWith(ПАПКА_PWA + '/') ? ' — в pwa/ только значки <вид>.<md5>.png из scripts/pwa.mjs' : ''));
  if (имя.endsWith('.map')) ошибка(`карта исходников в сборке: ${отн}`);
  if (МЕДИА.test(имя) && !отн.startsWith('media/')) ошибка(`медиафайл вне media/: ${отн}`);
  if (отн.startsWith('media/') && !МЕДИА.test(имя)) ошибка(`в media/ — только аудио и видео: ${отн}`);
  if (БЕЗ_ХЭША.has(отн)) continue;
  const хэш = имя.match(ХЭШ_В_ИМЕНИ)?.[1];
  if (!хэш) {
    ошибка(`нет хэша в имени (SW закэширует навсегда): ${отн}`);
    continue;
  }
  if (отн.startsWith('assets/')) {
    const md5 = crypto.createHash('md5').update(fs.readFileSync(абс)).digest('hex');
    if (md5 !== хэш.toLowerCase()) ошибка(`хэш в имени не совпадает с md5 содержимого: ${отн}`);
  }
}

// 3. index.html.
const html = fs.readFileSync(path.join(папка, 'index.html'), 'utf8');
const ссылки = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)].map((м) => м[1]);
for (const с of ссылки) {
  if (с.startsWith('data:') || с.startsWith('#')) continue;
  if (!с.startsWith(БАЗА)) ошибка(`путь в index.html не от ${БАЗА}: ${с}`);
  else if (!файлы.some((ф) => БАЗА + ф.отн === с.split(/[?#]/)[0])) ошибка(`index.html ссылается на несуществующий файл: ${с}`);
}
if (!/<script[^>]+src="\/aiustaz\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js"/i.test(html)) ошибка('в index.html нет <script> основного бандла /aiustaz/_expo/static/js/web/index-<хэш>.js');
if (!html.includes('http-equiv="Content-Security-Policy"')) ошибка('в index.html нет CSP (запускать сборку через npm run export:web)');
// Значок вкладки — только встроенный SVG; PNG — только apple-touch-icon из pwa/ (ниже, п. 1, исключение 19.11.2026).
if (/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="\/aiustaz\/[^"]+\.(png|ico)"/i.test(html)) ошибка('растровый значок вкладки в index.html');
for (const м of html.matchAll(/%[A-Z_]+%/g)) ошибка(`неподставленная метка шаблона в index.html: ${м[0]}`);
{
  // Кодировку браузер ищет в первых 1024 байтах (если сервер не прислал charset) — иначе кириллица в чанках «поедет».
  const позиция = Buffer.from(html, 'utf8').indexOf(Buffer.from('<meta charset="utf-8"'));
  if (позиция < 0 || позиция > 1000) ошибка(`<meta charset="utf-8"> не в первых 1024 байтах index.html (байт ${позиция})`);
}
if (!/<html[^>]*\slang="(ru|kk)"/i.test(html)) ошибка('в index.html нет <html lang="ru"> (язык из app.json)');
if (!/<title>[^<%]+<\/title>/i.test(html)) ошибка('в index.html нет заголовка <title> (из app.json)');

// 1б. PWA: значки (исключение из п. 1) и манифест.
const pwaЗначки = {};
{
  let сумма = 0;
  for (const { абс, отн } of файлы) {
    if (!отн.startsWith(ПАПКА_PWA + '/') || !РАСТР.test(отн)) continue;
    const м = path.basename(отн).match(ИМЯ_ЗНАЧКА);
    if (!м) continue;
    const байты = fs.readFileSync(абс);
    сумма += байты.length;
    if (байты.length > ПРЕДЕЛ_ЗНАЧКА) ошибка(`значок больше ${ПРЕДЕЛ_ЗНАЧКА / 1024} КБ: ${отн}`);
    const png = байты.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const ширина = png ? байты.readUInt32BE(16) : 0;
    const высота = png ? байты.readUInt32BE(20) : 0;
    const нужно = ЗНАЧКИ_PWA.find((з) => з.вид === м[1]).размер;
    if (!png || ширина !== нужно || высота !== нужно) ошибка(`значок ${отн}: нужен PNG ${нужно}×${нужно}, а это ${png ? ширина + '×' + высота : 'не PNG'}`);
    if (crypto.createHash('md5').update(байты).digest('hex') !== м[2]) ошибка(`хэш в имени значка не совпадает с md5 содержимого: ${отн}`);
    if (pwaЗначки[м[1]]) ошибка(`два значка ${м[1]} в ${ПАПКА_PWA}/`);
    pwaЗначки[м[1]] = '/aiustaz/' + отн;
  }
  if (сумма > ПРЕДЕЛ_ЗНАЧКОВ) ошибка(`значки PWA вместе ${кбЗначков(сумма)} КБ — больше ${ПРЕДЕЛ_ЗНАЧКОВ / 1024} КБ`);
  for (const з of ЗНАЧКИ_PWA) if (!pwaЗначки[з.вид]) ошибка(`нет значка ${з.вид} в ${ПАПКА_PWA}/ (node tools/icons/make-icons.mjs)`);
  const манифесты = файлы.filter((ф) => ф.отн.startsWith(ПАПКА_PWA + '/') && ИМЯ_МАНИФЕСТА.test(path.basename(ф.отн)));
  if (манифесты.length !== 1) ошибка(`в ${ПАПКА_PWA}/ должен быть ровно один manifest.<md5>.json, найдено ${манифесты.length}`);
  else {
    const м = манифесты[0];
    if (!html.includes(`<link rel="manifest" href="/aiustaz/${м.отн}"`)) ошибка(`index.html не ссылается на манифест /aiustaz/${м.отн}`);
    let ман = null;
    try {
      ман = JSON.parse(fs.readFileSync(м.абс, 'utf8'));
    } catch (е) {
      ошибка(`манифест ${м.отн} — не JSON: ${е.message}`);
    }
    if (ман) {
      if (ман.scope !== '/aiustaz/' || !String(ман.start_url).startsWith('/aiustaz/') || ман.id !== '/aiustaz/') ошибка('манифест: scope, id и start_url — в /aiustaz/');
      if (ман.display !== 'standalone') ошибка('манифест: display standalone');
      if (!ман.name || !ман.short_name) ошибка('манифест: нет name/short_name');
      for (const з of ЗНАЧКИ_PWA.filter((з) => з.purpose)) {
        const есть = (ман.icons ?? []).some((и) => и.src === pwaЗначки[з.вид] && и.sizes === `${з.размер}x${з.размер}` && и.purpose === з.purpose);
        if (!есть) ошибка(`манифест: нет значка ${з.вид} (${з.размер}, ${з.purpose})`);
      }
    }
  }
  if (pwaЗначки['apple-touch-icon-180'] && !html.includes(`<link rel="apple-touch-icon" sizes="180x180" href="${pwaЗначки['apple-touch-icon-180']}"`))
    ошибка('index.html: нет <link rel="apple-touch-icon" sizes="180x180"> на значок из pwa/');
  for (const мета of ['apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'apple-mobile-web-app-status-bar-style'])
    if (!html.includes(`<meta name="${мета}"`)) ошибка(`index.html: нет <meta name="${мета}"> (scripts/after-export.mjs)`);
  if ((html.match(/<meta name="theme-color" media=/g) ?? []).length !== 2) ошибка('index.html: нужны два theme-color (светлая и тёмная)');
}
function кбЗначков(б) {
  return (б / 1024).toFixed(0);
}

// 4. Внешние URL.
const urlЛицензий = new Set();
const путьЛицензий = path.join(корень, 'src', 'legal', 'licenses.json');
if (fs.existsSync(путьЛицензий)) {
  for (const п of JSON.parse(fs.readFileSync(путьЛицензий, 'utf8'))) {
    for (const т of п.тексты ?? []) for (const u of найтиURL(т.текст)) urlЛицензий.add(u);
  }
}
const встреченоРазрешённых = new Map();
for (const { абс, отн } of файлы) {
  if (!/\.(html|js|css|json|svg|txt)$/i.test(отн)) continue;
  const текст = fs.readFileSync(абс, 'utf8');
  for (const u of найтиURL(текст)) {
    const точное = ТОЧНЫЕ_URL.get(u);
    if (точное) {
      встреченоРазрешённых.set(u, точное);
      continue;
    }
    const правило = РАЗРЕШЁННЫЕ_URL.find(([префикс]) => u.startsWith(префикс));
    if (правило) {
      встреченоРазрешённых.set(правило[0], правило[1]);
      continue;
    }
    if (urlЛицензий.has(u) || [...urlЛицензий].some((л) => л.startsWith(u) || u.startsWith(л))) continue;
    ошибка(`внешний URL в ${отн}: ${u}`);
  }
}

// 5. .gitignore batr-world.
for (const { отн } of файлы) {
  const части = отн.split('/');
  const каталоги = части.slice(0, -1);
  const имя = части[части.length - 1];
  const плохойКаталог = каталоги.find((к) => ЗАПРЕТНЫЕ_КАТАЛОГИ.has(к));
  if (плохойКаталог) ошибка(`каталог «${плохойКаталог}» отбрасывается .gitignore batr-world: ${отн}`);
  if (ЗАПРЕТНЫЕ_ИМЕНА.some((р) => р.test(имя))) ошибка(`имя файла под .gitignore batr-world: ${отн}`);
}
const batr = process.env.BATR_WORLD ?? '/home/user/batr-world';
let проверкаGit = 'не выполнялась (нет репозитория batr-world рядом)';
if (fs.existsSync(path.join(batr, '.git')) && fs.existsSync(path.join(batr, '.gitignore'))) {
  const пути = файлы.map((ф) => ПУТЬ_В_BATR + ф.отн);
  let вывод = '';
  try {
    вывод = execFileSync('git', ['-C', batr, 'check-ignore', '--no-index', '--stdin'], { input: пути.join('\n') + '\n', encoding: 'utf8' });
  } catch (е) {
    // код 1 = ни один путь не игнорируется; другое — настоящая ошибка
    if (е.status !== 1) ошибка(`git check-ignore в ${batr} завершился с ошибкой: ${е.message}`);
    вывод = е.stdout ?? '';
  }
  const игнорируемые = вывод.split('\n').filter(Boolean);
  // Значки PWA (исключение 19.11.2026): пока в batr-world/.gitignore нет `!web/public/aiustaz/pwa/*.png` — предупреждение
  // (сборка для aiustaz.pro годна); выкладку в batr-world (tools/release-batr.sh) без исключения не пропустит своя проверка.
  const значкиPwa = игнорируемые.filter((п) => п.startsWith(ПУТЬ_В_BATR + ПАПКА_PWA + '/') && ИМЯ_ЗНАЧКА.test(path.basename(п)));
  for (const п of игнорируемые) if (!значкиPwa.includes(п)) ошибка(`batr-world/.gitignore отбросит: ${п}`);
  if (значкиPwa.length)
    предупреждения.push(`batr-world/.gitignore отбросит значки PWA (${значкиPwa.length}) — добавьте в batr-world/.gitignore строку \`!${ПУТЬ_В_BATR}${ПАПКА_PWA}/*.png\` до выкладки`);
  проверкаGit = `git check-ignore в ${batr}: ${игнорируемые.length ? 'есть отброшенные' : 'все пути попадут в git'}`;
}

// 6. Размер.
let всего = 0;
let js = 0;
let jsGzip = 0;
for (const { абс, отн } of файлы) {
  const размер = fs.statSync(абс).size;
  всего += размер;
  if (отн.endsWith('.js')) {
    js += размер;
    jsGzip += zlib.gzipSync(fs.readFileSync(абс), { level: 9 }).length;
  }
}
const кб = (б) => (б / 1024).toFixed(0);
if (js / 1024 > БЮДЖЕТ_JS_КБ) ошибка(`JS ${кб(js)} КБ больше бюджета ${БЮДЖЕТ_JS_КБ} КБ`);
if (всего / 1024 > БЮДЖЕТ_ВСЕГО_КБ) ошибка(`сборка ${кб(всего)} КБ больше бюджета ${БЮДЖЕТ_ВСЕГО_КБ} КБ`);
if (js / 1024 > БЮДЖЕТ_JS_КБ * 0.8) предупреждения.push(`JS близко к бюджету: ${кб(js)} из ${БЮДЖЕТ_JS_КБ} КБ`);

// 8. Видео и аудио партнёров: без встраивания YouTube, CSP закрыта, предпросмотр — не для batr.kz.
for (const { абс, отн } of файлы) {
  if (!/\.(html|js|css|json|svg|txt)$/i.test(отн)) continue;
  const м = fs.readFileSync(абс, 'utf8').match(ВСТРАИВАНИЕ);
  if (м) ошибка(`встраивание YouTube/iframe в ${отн}: «${м[0]}» — только ссылка youtube.com/watch во внешнее приложение`);
}
{
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '';
  const директива = (имя) => csp.split(';').map((ч) => ч.trim()).find((ч) => ч.startsWith(имя + ' ')) ?? '';
  if (/youtube|google/i.test(csp)) ошибка('CSP открыта для youtube/google — видео партнёров только ссылкой или своим файлом');
  if (директива('frame-src') !== "frame-src 'none'") ошибка(`CSP: нужен frame-src 'none', сейчас «${директива('frame-src')}»`);
  if (!/^media-src 'self'( blob:)?$/.test(директива('media-src'))) ошибка(`CSP: media-src только 'self' (+ blob:), сейчас «${директива('media-src')}»`);
}
const ПРЕДПРОСМОТР_РАЗРЕШЁН = process.env.MUGALIM_TARGET === 'preview';
const меткаПредпросмотра = html.match(/<meta name="aiustaz-media-preview" content="(on|off)"/)?.[1];
if (!меткаПредпросмотра) ошибка('в index.html нет метки aiustaz-media-preview (запускать сборку через npm run export:web)');
else if (меткаПредпросмотра === 'on' && !ПРЕДПРОСМОТР_РАЗРЕШЁН)
  ошибка('сборка с предпросмотром видео и аудио без разрешения авторов (EXPO_PUBLIC_MEDIA_PREVIEW=1) — только для владельца, не для batr.kz. Для batr.kz соберите без флага; для показа владельцу — MUGALIM_TARGET=preview');

// 9. Полный Коран для показа: файлы dist/quran по манифесту, sha256, условия Tanzil, Корана нет в JS.
const ПАПКА_КОРАНА = path.join(папка, 'quran');
let строкаКорана = 'нет папки quran/';
{
  const путьМанифеста = path.join(корень, 'src', 'quran', 'manifest.generated.ts');
  const манифест = fs.existsSync(путьМанифеста) ? fs.readFileSync(путьМанифеста, 'utf8') : '';
  const индексМ = манифест.match(/индекс: '([^']+)'/)?.[1];
  const shaМ = манифест.match(/sha256Индекса: '([0-9a-f]{64})'/)?.[1];
  const sha = (б) => crypto.createHash('sha256').update(б).digest('hex');
  if (!индексМ || !shaМ) ошибка('нет src/quran/manifest.generated.ts (python3 -I -B tools/quran/build_quran.py)');
  else if (!fs.existsSync(path.join(папка, индексМ))) ошибка(`нет индекса Корана ${индексМ} в сборке (app/public/quran → dist/quran)`);
  else {
    const байтыИндекса = fs.readFileSync(path.join(папка, индексМ));
    if (sha(байтыИндекса) !== shaМ) ошибка(`sha256 ${индексМ} ≠ манифесту`);
    const индекс = JSON.parse(байтыИндекса.toString('utf8'));
    const нужные = new Set([индексМ]);
    let байт = байтыИндекса.length;
    const тексты = [];
    const фатиха = [];
    if (индекс.суры?.length !== 114) ошибка(`в индексе Корана ${индекс.суры?.length} сур, нужно 114`);
    for (const з of индекс.суры ?? []) {
      нужные.add(з.файл);
      const п = path.join(папка, з.файл);
      if (!fs.existsSync(п)) {
        ошибка(`нет файла суры ${з.файл}`);
        continue;
      }
      const б = fs.readFileSync(п);
      байт += б.length;
      const хэш = sha(б);
      if (хэш !== з.sha256) ошибка(`sha256 ${з.файл} ≠ индексу`);
      if (!path.basename(з.файл).includes('.' + хэш.slice(0, 20) + '.')) ошибка(`хэш в имени ${з.файл} ≠ началу sha256`);
      const д = JSON.parse(б.toString('utf8'));
      if (!/PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK/.test(д.копирайт ?? '')) ошибка(`в ${з.файл} нет блока условий Tanzil`);
      for (const а of д.аяты ?? []) (д.сура === 1 ? фатиха : тексты).push(а.текст);
    }
    for (const { отн } of файлы) if (отн.startsWith('quran/') && !нужные.has(отн)) ошибка(`лишний файл в quran/: ${отн}`);
    const коран = тексты.join('\n');
    const текстФатихи = фатиха.join('\n');
    for (const { абс, отн } of файлы) {
      if (!отн.endsWith('.js')) continue;
      for (const м of fs.readFileSync(абс, 'utf8').matchAll(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF ]{25,}/g)) {
        const отрезок = м[0].trim();
        // аль-Фатиха (чанк fatiha-demo) разрешена; 1:1 дословно входит и в 27:30 — поэтому сначала сверяем с ней.
        if (отрезок.length >= 25 && !текстФатихи.includes(отрезок) && коран.includes(отрезок)) {
          ошибка(`текст Корана (сура 2–114) в JS-чанке ${отн}: «${отрезок.slice(0, 40)}…» — только статические файлы quran/`);
          break;
        }
      }
    }
    строкаКорана = `${индекс.суры?.length ?? 0} сур + индекс, ${кб(байт)} КБ, sha256 сверены, условия Tanzil в каждом файле`;
  }
}

// 7. Проверка голосом.
const СВОЙ_ДОМЕН = process.env.MUGALIM_TARGET === 'own-domain';
const меткаПроверки = html.match(/<meta name="aiustaz-speech-check" content="(on|off)"/)?.[1];
if (!меткаПроверки) ошибка('в index.html нет метки aiustaz-speech-check (запускать сборку через npm run export:web)');
else if (меткаПроверки === 'on' && !СВОЙ_ДОМЕН)
  ошибка('сборка с проверкой голосом (EXPO_PUBLIC_SPEECH_CHECK=1) — только для своего домена, не для batr.kz. Для batr.kz соберите без флага; для своего домена — MUGALIM_TARGET=own-domain');
for (const { абс, отн } of файлы) {
  if (!отн.endsWith('.js')) continue;
  if (/https?:\/\/[^"'`\s]*\/api\/speech/i.test(fs.readFileSync(абс, 'utf8'))) ошибка(`абсолютный адрес речевого сервиса в ${отн} — только относительный /api/speech/…`);
}

// Итог.
console.log(`Сборка: ${path.relative(корень, папка)} — файлов ${файлы.length}, всего ${кб(всего)} КБ; JS ${кб(js)} КБ (gzip ≈ ${кб(jsGzip)} КБ)`);
for (const { абс, отн } of файлы) console.log(`  ${отн}  ${кб(fs.statSync(абс).size)} КБ`);
console.log(`batr-world .gitignore: ${проверкаGit}`);
console.log(`Коран (dist/quran): ${строкаКорана}`);
console.log(`Проверка голосом: ${меткаПроверки === 'on' ? 'ВКЛЮЧЕНА в сборке' + (СВОЙ_ДОМЕН ? ' (MUGALIM_TARGET=own-domain)' : '') : 'выключена (сборка для batr.kz)'}`);
console.log(`Предпросмотр видео и аудио партнёров: ${меткаПредпросмотра === 'on' ? 'ВКЛЮЧЁН (только для владельца' + (ПРЕДПРОСМОТР_РАЗРЕШЁН ? ', MUGALIM_TARGET=preview)' : ')') : 'выключен'}`);
if (встреченоРазрешённых.size) {
  console.log('Разрешённые URL-строки в коде (не запросы):');
  for (const [п, причина] of встреченоРазрешённых) console.log(`  ${п} — ${причина}`);
}
for (const п of предупреждения) console.log(`ПРЕДУПРЕЖДЕНИЕ: ${п}`);
if (ошибки.length) {
  console.error(`\nОШИБКИ (${ошибки.length}):`);
  for (const о of ошибки) console.error(`  ✗ ${о}`);
  process.exit(1);
}
console.log(
  меткаПредпросмотра === 'on'
    ? '\nOK: сборка ПРЕДПРОСМОТРА для владельца (видео без разрешения авторов) — НЕ выкладывать в batr-world'
    : меткаПроверки === 'on'
      ? '\nOK: сборка для СВОЕГО домена (проверка голосом включена) — НЕ выкладывать в batr-world'
      : '\nOK: сборка готова к выкладке в batr-world/web/public/aiustaz/',
);

function обойти(каталог) {
  return fs.readdirSync(каталог, { withFileTypes: true }).flatMap((з) => {
    const п = path.join(каталог, з.name);
    return з.isDirectory() ? обойти(п) : [п];
  });
}

function найтиURL(текст) {
  return [...текст.matchAll(/https?:\/\/[^\s"'`<>()\\{}[\],;]*/gi)].map((м) => м[0].replace(/[.:]+$/, ''));
}
