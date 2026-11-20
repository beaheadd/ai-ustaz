#!/usr/bin/env node
/**
 * Проверка переводов интерфейса: ru (источник), kk, uz и en (черновики для редактора-носителя).
 *
 * Владелец 20.11.2026: «Потом нужно добавить узбекский язык» (латиница); «Казахский, русский, узбекский, английский.
 * 4 языка должно быть для старта». typecheck ловит пропуск ключа в kk/uz/en; этот тест — то, чего typecheck не видит:
 *  1. Общий словарь (src/i18n/ru.ts, kk.ts, uz.ts, en.ts): у каждого ключа ru есть непустой kk, uz и en, подстановки {имя} те же.
 *  2. Все локальные словари экранов (создатьСловарь({ ru, kk, uz, en }) в src/**): те же ключи, непустые строки (если
 *     ru не пустой), те же подстановки {имя}. Словари разбираются компилятором TypeScript (без запуска React Native).
 *  3. uz — латиница: без кириллицы, кроме разрешённого (названия языков в переключателе; казахские буквы «қ», «ғ» как
 *     звуки; названия каналов). «ʻ» (U+02BB) в oʻ/gʻ, а не апостроф ' или ’; тутук белгиси — «ʼ» (U+02BC), не ’.
 *  3а. en — без кириллицы (кроме названий языков), апостроф — ASCII ' (не ’ и не узбекские ʻ ʼ, кроме «Oʻzbekcha»),
 *     кавычки — “…”, не «…».
 *  4. Онбординг и подсказки языка: языкБраузера('uz-UZ') = 'uz', 'en-US' = 'en'; ЯЗЫК_HTML.uz = 'uz-Latn', en = 'en'.
 *  5. Названия намазов uz и en, подписи официального времени, плеер en, названия сур en (Tanzil).
 * Запуск: npm run test:i18n
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const КОРЕНЬ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ИСХОДНИКИ = path.join(КОРЕНЬ, 'src');
let проверок = 0;
const ошибки = [];
const ошибка = (где, что) => ошибки.push(`${где}: ${что}`);

const подстановки = (с) => [...с.matchAll(/\{([^{}]+)\}/g)].map((м) => м[1]).sort().join(',');
// Кириллица в uz допустима только в этих строках (по смыслу — не узбекский текст).
const КИРИЛЛИЦА_МОЖНО = [
  /^Русский$/, /^Қазақша$/, /^Рус$/, // названия языков и кнопка «Рус» (перейти на русский)
  /«Ұстаз Еркінбек Шоқай»/, // название канала партнёра — как у автора
];
const КИРИЛЛИЦА = /[а-яёәіңғүұқөһ]/i;

function проверитьUz(где, с) {
  if (КИРИЛЛИЦА.test(с.replace(/\{[^{}]+\}/g, '')) && !КИРИЛЛИЦА_МОЖНО.some((р) => р.test(с))) ошибка(где, `кириллица в uz: «${с}»`);
  // оʻ/gʻ — только U+02BB; ' (U+0027) и ’ (U+2019) после o/g — ошибка; ‘ (U+2018) — тоже.
  if (/[oOgG]['’‘ʼ]/.test(с)) ошибка(где, `oʻ/gʻ не через U+02BB: «${с}»`);
  if (/[A-Za-zʻ]’[A-Za-z]/.test(с)) ошибка(где, `тутук белгиси — U+02BC, не ’: «${с}»`);
}

// Кириллица в en — только названия языков в переключателе и кнопка «Рус» (перейти на русский).
const КИРИЛЛИЦА_EN_МОЖНО = [/^Русский$/, /^Қазақша$/, /^Рус$/];
function проверитьEn(где, с) {
  const без = с.replace(/\{[^{}]+\}/g, '');
  if (КИРИЛЛИЦА.test(без) && !КИРИЛЛИЦА_EN_МОЖНО.some((р) => р.test(с))) ошибка(где, `кириллица в en: «${с}»`);
  if (/[’ʼ]/.test(без) || (/ʻ/.test(без) && с !== 'Oʻzbekcha')) ошибка(где, `апостроф в en — ASCII ', не ’/ʻ/ʼ: «${с}»`);
  if (/[«»„]/.test(без)) ошибка(где, `кавычки в en — “…”: «${с}»`);
}

function сравнить(где, ru, перевод, язык) {
  for (const ключ of Object.keys(ru)) {
    проверок++;
    const р = ru[ключ];
    const п = перевод[ключ];
    if (typeof п !== 'string') {
      ошибка(где, `нет ключа «${ключ}» в ${язык}`);
      continue;
    }
    if (р.trim() && !п.trim()) ошибка(где, `пустая строка «${ключ}» в ${язык}`);
    // kk-плеер: транслитерации сур на kk нет — «{сура}-сүре» вместо «{имя}» (названиеДляСессии передаёт и имя, и сура).
    const осознанно = где === 'audio/texts.ts' && язык === 'kk' && (ключ === 'название' || ключ === 'бисмилла');
    if (!осознанно && подстановки(р) !== подстановки(п)) ошибка(где, `подстановки «${ключ}» в ${язык}: {${подстановки(п)}} ≠ ru {${подстановки(р)}}`);
    if (язык === 'uz') проверитьUz(`${где} «${ключ}»`, п);
    if (язык === 'en') проверитьEn(`${где} «${ключ}»`, п);
  }
  for (const ключ of Object.keys(перевод)) if (!(ключ in ru)) ошибка(где, `лишний ключ «${ключ}» в ${язык}`);
}

// ── 1. Общий словарь ──
const { ru } = await import('../src/i18n/ru.ts');
const { kk } = await import('../src/i18n/kk.ts');
const { uz } = await import('../src/i18n/uz.ts');
const { en } = await import('../src/i18n/en.ts');
сравнить('i18n/kk.ts', ru, kk, 'kk');
сравнить('i18n/uz.ts', ru, uz, 'uz');
сравнить('i18n/en.ts', ru, en, 'en');

// ── 2. Локальные словари экранов ──
function значение(узел) {
  if (ts.isStringLiteral(узел) || ts.isNoSubstitutionTemplateLiteral(узел)) return узел.text;
  if (ts.isParenthesizedExpression(узел)) return значение(узел.expression);
  if (ts.isBinaryExpression(узел) && узел.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const а = значение(узел.left);
    const б = значение(узел.right);
    return а == null || б == null ? null : а + б;
  }
  return null;
}
function объект(узел) {
  if (!узел || !ts.isObjectLiteralExpression(узел)) return null;
  const итог = {};
  for (const св of узел.properties) {
    if (!ts.isPropertyAssignment(св)) return null;
    const имя = ts.isIdentifier(св.name) || ts.isStringLiteral(св.name) ? св.name.text : null;
    if (имя == null) return null;
    итог[имя] = значение(св.initializer) ?? объект(св.initializer);
  }
  return итог;
}
function файлы(папка) {
  return fs.readdirSync(папка, { withFileTypes: true }).flatMap((з) =>
    з.isDirectory() ? файлы(path.join(папка, з.name)) : /\.tsx?$/.test(з.name) ? [path.join(папка, з.name)] : [],
  );
}
let словарей = 0;
for (const файл of файлы(ИСХОДНИКИ)) {
  const текст = fs.readFileSync(файл, 'utf8');
  if (!текст.includes('создатьСловарь(')) continue;
  const ист = ts.createSourceFile(файл, текст, ts.ScriptTarget.Latest, true, файл.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const где = path.relative(КОРЕНЬ, файл);
  ts.forEachChild(ист, function обход(у) {
    if (ts.isCallExpression(у) && ts.isIdentifier(у.expression) && у.expression.text === 'создатьСловарь' && у.arguments.length === 1) {
      const сл = объект(у.arguments[0]);
      if (!сл) return; // словарь из переменной (audio/texts.ts) — проверяется там, где объявлен (ниже)
      словарей++;
      for (const язык of ['ru', 'kk', 'uz', 'en']) if (!сл[язык]) ошибка(где, `нет блока ${язык}`);
      if (сл.ru && сл.kk) сравнить(где, сл.ru, сл.kk, 'kk');
      if (сл.ru && сл.uz) сравнить(где, сл.ru, сл.uz, 'uz');
      if (сл.ru && сл.en) сравнить(где, сл.ru, сл.en, 'en');
    }
    ts.forEachChild(у, обход);
  });
}
// Тексты плеера (audio/texts.ts) — словарь из переменных.
const { ТЕКСТЫ_ПЛЕЕРА, языкПлеера, названиеДляСессии } = await import('../src/audio/texts.ts');
сравнить('audio/texts.ts', ТЕКСТЫ_ПЛЕЕРА.ru, ТЕКСТЫ_ПЛЕЕРА.kk, 'kk');
сравнить('audio/texts.ts', ТЕКСТЫ_ПЛЕЕРА.ru, ТЕКСТЫ_ПЛЕЕРА.uz, 'uz');
сравнить('audio/texts.ts', ТЕКСТЫ_ПЛЕЕРА.ru, ТЕКСТЫ_ПЛЕЕРА.en, 'en');
assert.equal(языкПлеера('uz'), 'uz');
assert.equal(языкПлеера('en'), 'en');
assert.equal(названиеДляСессии({ язык: 'en', сура: 2, аят: 255, бисмилла: false, повтор: 1, из: 1, транслит: 'Al-Baqara' }), 'Surah Al-Baqara · ayah 255');
assert.equal(названиеДляСессии({ язык: 'en', сура: 2, аят: 255, бисмилла: false, повтор: 1, из: 1, транслит: null }), 'Surah 2 · ayah 255');
проверок += 3;
const сессия = { язык: 'uz', сура: 2, аят: 255, бисмилла: false, повтор: 1, из: 1 };
assert.equal(названиеДляСессии({ ...сессия, транслит: 'Baqara' }), 'Baqara surasi · 255-oyat');
assert.equal(названиеДляСессии({ ...сессия, транслит: null }), '2-sura · 255-oyat');
проверок += 3;
assert.ok(словарей >= 40, `найдено словарей экранов: ${словарей} (ожидалось ≥ 40)`);

// ── 4. Язык браузера, <html lang>, порядок переключателя ──
const индекс = fs.readFileSync(path.join(ИСХОДНИКИ, 'i18n', 'index.tsx'), 'utf8');
assert.match(индекс, /uz: 'uz-Latn'/, 'ЯЗЫК_HTML.uz = uz-Latn');
assert.match(индекс, /\{ код: 'uz', название: 'Oʻzbekcha' \}/, 'ЯЗЫКИ: Oʻzbekcha');
assert.match(индекс, /en: 'en' \}/, 'ЯЗЫК_HTML.en = en');
assert.match(индекс, /\{ код: 'en', название: 'English' \}/, 'ЯЗЫКИ: English');
assert.ok(индекс.includes("код === 'ru' || код === 'kk' || код === 'uz' || код === 'en' ? код : null"), 'языкБраузера знает en');
const языкБраузера = (тег) => {
  // та же логика, что в i18n/index.tsx (файл с JSX — node его не импортирует; сверяем текст функции)
  const код = (тег ?? '').toLowerCase().split(/[-_]/)[0];
  return код === 'ru' || код === 'kk' || код === 'uz' || код === 'en' ? код : null;
};
assert.ok(индекс.includes("const код = (тег ?? '').toLowerCase().split(/[-_]/)[0];"), 'языкБраузера: разбор тега');
assert.equal(языкБраузера('uz-UZ'), 'uz');
assert.equal(языкБраузера('uz-Latn-UZ'), 'uz');
assert.equal(языкБраузера('en-US'), 'en');
assert.equal(языкБраузера('en'), 'en');
assert.equal(языкБраузера('de-DE'), null);
проверок += 10;

// ── 5. Названия намазов uz (prayer/day.ts) ──
const { НАЗВАНИЯ, датаДня } = await import('../src/prayer/day.ts');
assert.deepEqual(
  Object.fromEntries(Object.entries(НАЗВАНИЯ).map(([к, н]) => [к, н.uz])),
  { fajr: 'Bomdod', sunrise: 'Quyosh', dhuhr: 'Peshin', asr: 'Asr', maghrib: 'Shom', isha: 'Xufton' },
);
assert.equal(датаДня('2026-11-20', 'uz'), '20-noyabr');
const { подписьОфициального } = await import('../src/prayer/official.ts');
assert.equal(подписьОфициального('umuz', '2026-11-20', 'uz'), 'Oʻzbekiston musulmonlari idorasi qoidasi boʻyicha · 20.11.2026 yangilandi');
assert.equal(подписьОфициального('dumk', '2026-11-20', 'uz'), 'QMDB maʼlumotlari boʻyicha · 20.11.2026 yangilandi');
проверок += 4;

// ── 5а. en: названия намазов, даты, подписи времени, метод, отсчёт, кибла ──
assert.deepEqual(
  Object.fromEntries(Object.entries(НАЗВАНИЯ).map(([к, н]) => [к, н.en])),
  { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' },
);
for (const [к, н] of Object.entries(НАЗВАНИЯ)) проверитьEn(`prayer/day.ts ${к}`, н.en + ' ' + н.послеEn);
assert.equal(датаДня('2026-11-20', 'en'), '20 November');
const { подписьДня, обратныйОтсчёт, обратныйОтсчётПолностью } = await import('../src/prayer/day.ts');
assert.equal(подписьДня('2026-11-20', 'en', '2026-11-20'), 'Today, 20 November');
assert.equal(обратныйОтсчёт(65 * 60_000, 'en'), 'in 1 h 05 min');
assert.equal(обратныйОтсчётПолностью(61 * 60_000, 'en'), 'in 1 hour 1 minute');
assert.equal(подписьОфициального('umuz', '2026-11-20', 'en'), 'Per the Muslim Board of Uzbekistan rule · updated 20.11.2026');
assert.equal(подписьОфициального('dumk', '2026-11-20', 'en'), 'Per SAMK data · updated 20.11.2026');
const { МЕТОДЫ, подписьМетода } = await import('../src/prayer/methods.ts');
for (const м of Object.values(МЕТОДЫ)) проверитьEn(`prayer/methods.ts ${м.id}`, м.ведомство.en);
assert.equal(подписьМетода(МЕТОДЫ.dumk, 'hanafi', 'en'), 'Calculated by the SAMK method (±1 min)');
const { румб } = await import('../src/qibla/qibla.ts');
assert.equal(румб(231.5, 'en'), 'southwest');
const { ПРАВИЛА_ТАДЖВИДА } = await import('../src/quran/tajweed.ts');
for (const [к, п] of Object.entries(ПРАВИЛА_ТАДЖВИДА)) проверитьEn(`quran/tajweed.ts ${к}`, п.en);
const { названиеМеста } = await import('../src/prayer/places.ts');
assert.equal(названиеМеста({ kk: 'Шымкент', ru: 'Шымкент' }, 'en'), 'Shymkent');
assert.equal(названиеМеста({ kk: 'Өскемен', ru: 'Усть-Каменогорск' }, 'en'), 'Ust-Kamenogorsk');
assert.equal(названиеМеста({ kk: 'Мекке', ru: 'Мекка', en: 'Mecca' }, 'en'), 'Mecca');
проверок += 13;

// ── 6. Названия сур en — транслитерация Tanzil (tname) в индексе Корана ──
const папкаКорана = path.join(КОРЕНЬ, 'public', 'quran');
const файлИндекса = fs.readdirSync(папкаКорана).find((ф) => /^index\.[0-9a-f]{20}\.json$/.test(ф));
const индексКорана = JSON.parse(fs.readFileSync(path.join(папкаКорана, файлИндекса), 'utf8'));
assert.equal(индексКорана.суры.length, 114);
for (const с of индексКорана.суры) {
  проверок++;
  if (typeof с.транслит.en !== 'string' || !с.транслит.en.trim()) ошибка('индекс Корана', `нет названия en у суры ${с.сура}`);
  else if (КИРИЛЛИЦА.test(с.транслит.en) || /[’«»]/.test(с.транслит.en)) ошибка('индекс Корана', `en суры ${с.сура}: «${с.транслит.en}»`);
}
assert.equal(индексКорана.суры[0].транслит.en, 'Al-Faatiha');
assert.equal(индексКорана.суры[113].транслит.en, 'An-Naas');

if (ошибки.length) {
  console.error(`ОШИБКИ (${ошибки.length}):\n  - ` + ошибки.join('\n  - '));
  process.exit(1);
}
console.log(`OK: переводы интерфейса — общий словарь и ${словарей} словарей экранов, ${проверок} проверок`);
