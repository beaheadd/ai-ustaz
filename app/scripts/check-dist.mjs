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
const БЮДЖЕТ_JS_КБ = Number(process.env.MUGALIM_БЮДЖЕТ_JS_КБ ?? 1200);
const БЮДЖЕТ_ВСЕГО_КБ = Number(process.env.MUGALIM_БЮДЖЕТ_ВСЕГО_КБ ?? 3000);

const РАСТР = /\.(png|jpe?g|webp|gif|ico|bmp|avif|tiff?)$/i;
const БЕЗ_ХЭША = new Set(['index.html', 'metadata.json']);
const ХЭШ_В_ИМЕНИ = /[.-]([0-9a-f]{20,})\.[a-z0-9]+$/i;

/** Разрешённые URL-строки в коде зависимостей: префикс → почему это не запрос. */
const РАЗРЕШЁННЫЕ_URL = [
  ['http://www.w3.org/', 'пространства имён XML/SVG/MathML (react-dom, значок SVG) — не загружаются'],
  ['https://react.dev/errors/', 'ссылка в тексте ошибки React (production) — только текст'],
  ['https://expo.dev', 'expo-asset: адрес по умолчанию для ассетов-чисел; на вебе ассеты — строки, ветка не используется'],
  ['https://classic-assets.eascdn.net/~assets/', 'expo-asset: ветка только для Expo Go (ExponentKernel); на вебе не выполняется'],
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
console.log(`Проверка голосом: ${меткаПроверки === 'on' ? 'ВКЛЮЧЕНА в сборке' + (СВОЙ_ДОМЕН ? ' (MUGALIM_TARGET=own-domain)' : '') : 'выключена (сборка для batr.kz)'}`);
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
console.log(меткаПроверки === 'on' ? '\nOK: сборка для СВОЕГО домена (проверка голосом включена) — НЕ выкладывать в batr-world' : '\nOK: сборка готова к выкладке в batr-world/web/public/aiustaz/');

function обойти(каталог) {
  return fs.readdirSync(каталог, { withFileTypes: true }).flatMap((з) => {
    const п = path.join(каталог, з.name);
    return з.isDirectory() ? обойти(п) : [п];
  });
}

function найтиURL(текст) {
  return [...текст.matchAll(/https?:\/\/[^\s"'`<>()\\{}[\],;]*/gi)].map((м) => м[0].replace(/[.:]+$/, ''));
}
