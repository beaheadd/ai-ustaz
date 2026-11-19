#!/usr/bin/env node
/**
 * Проверка веб-сборки app/dist перед выкладкой в batr-world/web/public/aiustaz/.
 *
 * Проверяет (любая ошибка → код выхода 1):
 *  1. Нет растровых файлов (png jpg jpeg webp gif ico bmp avif tif tiff) — .gitignore batr-world
 *     их отбрасывает, в выкладке они бы потерялись.
 *  2. У всех файлов, кроме index.html и metadata.json, в имени есть хэш содержимого
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

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const папка = path.resolve(корень, process.argv[2] ?? 'dist');
const БАЗА = '/aiustaz/';
const ПУТЬ_В_BATR = 'web/public/aiustaz/';
// Бюджет JS — все чанки вместе (сырые байты; основной чанк ≈ 880 КБ, gzip всей сборки ≈ 320 КБ).
// 19.11.2026: 1200 → 1250 КБ — задача владельца расширила приложение (время намаза, кибла, дизайн-система,
// главная). Поднял интегратор после сжатия Terser в два прохода (−20 КБ); ждёт подтверждения ведущего/владельца.
const БЮДЖЕТ_JS_КБ = Number(process.env.MUGALIM_БЮДЖЕТ_JS_КБ ?? 1250);
// Владелец 19.11.2026: полный Коран, плеер, запись. Всего 3000 → 4688 КБ — ровно на измеренный прирост от полного
// Корана: dist/quran 1 726 219 байт (114 сур + индекс; текст 1,33 МБ + блок условий Tanzil в каждом файле ≈ 160 КБ)
// + JS 2017 байт (запись источника «tanzil-phonetic» в sources.json); сборка HEAD d7a3d70 — 1 465 455 байт, с Кораном —
// 3 193 691 (+1 728 236 байт = 1688 КБ). JS-бюджет не менялся (1249 из 1250 КБ). Плеер и запись добавят своё отдельно.
const БЮДЖЕТ_ВСЕГО_КБ = Number(process.env.MUGALIM_БЮДЖЕТ_ВСЕГО_КБ ?? 4688);

const РАСТР = /\.(png|jpe?g|webp|gif|ico|bmp|avif|tiff?)$/i;
/** Свои видео и аудио партнёров (content/media.json → файл_видео, аудио.файл) — только в media/. */
const МЕДИА = /\.(m4a|mp3|ogg|opus|webm|mp4|wav)$/i;
const ВСТРАИВАНИЕ = /youtube\.com\/embed|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|<iframe/i;
const БЕЗ_ХЭША = new Set(['index.html', 'metadata.json']);
const ХЭШ_В_ИМЕНИ = /[.-]([0-9a-f]{20,})\.[a-z0-9]+$/i;

/** Разрешённые URL-строки в коде зависимостей: префикс → почему это не запрос. */
const РАЗРЕШЁННЫЕ_URL = [
  ['http://www.w3.org/', 'пространства имён XML/SVG/MathML (react-dom, значок SVG) — не загружаются'],
  ['https://react.dev/errors/', 'ссылка в тексте ошибки React (production) — только текст'],
  ['https://expo.dev', 'expo-asset: адрес по умолчанию для ассетов-чисел; на вебе ассеты — строки, ветка не используется'],
  ['https://classic-assets.eascdn.net/~assets/', 'expo-asset: ветка только для Expo Go (ExponentKernel); на вебе не выполняется'],
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
  if (РАСТР.test(имя)) ошибка(`растровый файл (потеряется в batr-world): ${отн}`);
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
if (/<link[^>]+rel="[^"]*icon[^"]*"[^>]+href="\/aiustaz\/[^"]+\.(png|ico)"/i.test(html)) ошибка('растровый значок в index.html');
for (const м of html.matchAll(/%[A-Z_]+%/g)) ошибка(`неподставленная метка шаблона в index.html: ${м[0]}`);
{
  // Кодировку браузер ищет в первых 1024 байтах (если сервер не прислал charset) — иначе кириллица в чанках «поедет».
  const позиция = Buffer.from(html, 'utf8').indexOf(Buffer.from('<meta charset="utf-8"'));
  if (позиция < 0 || позиция > 1000) ошибка(`<meta charset="utf-8"> не в первых 1024 байтах index.html (байт ${позиция})`);
}
if (!/<html[^>]*\slang="(ru|kk)"/i.test(html)) ошибка('в index.html нет <html lang="ru"> (язык из app.json)');
if (!/<title>[^<%]+<\/title>/i.test(html)) ошибка('в index.html нет заголовка <title> (из app.json)');

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
  for (const п of игнорируемые) ошибка(`batr-world/.gitignore отбросит: ${п}`);
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
