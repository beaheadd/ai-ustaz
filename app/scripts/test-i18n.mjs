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
 *  7. Владелец 28.11.2026: ar, tr, id, ur — ленивые словари src/i18n/locales/lang-<язык>.json (общий + словари экранов
 *     по имени — второй аргумент создатьСловарь). У каждого словаря экрана с именем — все ключи ru на всех 8 языках,
 *     непустые строки, те же подстановки, без лишних ключей; словарь без перевода целиком (новый, чужой ветки) —
 *     ПРЕДУПРЕЖДЕНИЕ (типы разрешают: показывается en), частично — ошибка. ar/ur — арабское письмо (ar — без урдуских
 *     ی ک ہ ے; ur — без арабских ي ك), без кириллицы; tr/id — без кириллицы, апостроф ASCII '.
 *  8. Владелец 28.11.2026: «про Казахстан много не должно быть» — на главной, в первом входе, карточке намаза, чате,
 *     хадисе, «Ещё» и «О приложении» нет ДУМК / ҚМДБ / QMDB / SAMK / muftyat / Imam AI ни на одном языке
 *     («Разработано в Казахстане» — только «О приложении»; подробности ведомства — «Время намаза» → «Как считаем»).
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

// ── 7. Новые языки: ленивые словари ──
const НОВЫЕ = ['ar', 'tr', 'id', 'ur'];
const ЛОКАЛИ = Object.fromEntries(
  НОВЫЕ.map((я) => [я, JSON.parse(fs.readFileSync(path.join(ИСХОДНИКИ, 'i18n', 'locales', `lang-${я}.json`), 'utf8'))]),
);
const предупреждения = [];
const АРАБСКОЕ = /[\u0600-\u06FF]/;
// Строки без букв языка (бренд, числа, подстановки, родные названия языков) — письмо не проверяем.
const БЕЗ_БУКВ_МОЖНО = /^(AI Ustaz|Google Play|Русский|Қазақша|Oʻzbekcha|English|Türkçe|Bahasa Indonesia)$/;
function проверитьНовый(где, с, язык) {
  const без = с.replace(/\{[^{}]+\}/g, '');
  if (КИРИЛЛИЦА.test(без) && !/^(Русский|Қазақша)$/.test(с)) ошибка(где, `кириллица в ${язык}: «${с}»`);
  if (язык === 'tr' || язык === 'id') {
    if (/[’ʼ]/.test(без)) ошибка(где, `апостроф в ${язык} — ASCII ': «${с}»`);
    if (/[«»]/.test(без)) ошибка(где, `кавычки в ${язык} — “…”: «${с}»`);
  }
  if ((язык === 'ar' || язык === 'ur') && /\p{L}/u.test(без) && !АРАБСКОЕ.test(без) && !БЕЗ_БУКВ_МОЖНО.test(с.trim())) {
    ошибка(где, `в ${язык} нет арабского письма: «${с}»`);
  }
  if (язык === 'ar' && /[\u06CC\u06A9\u06C1\u06D2\u06BA\u0679\u0688\u0691]/.test(без) && с !== 'اردو') ошибка(где, `урдуские буквы в ar: «${с}»`);
  if (язык === 'ur' && /[\u064A\u0643]/.test(без) && с !== 'العربية') ошибка(где, `арабские ي/ك в ur (нужны ی/ک): «${с}»`);
}
for (const я of НОВЫЕ) {
  const л = ЛОКАЛИ[я];
  assert.ok(л.общий && л.словари, `lang-${я}.json: общий и словари`);
  сравнить(`i18n/locales/lang-${я}.json (общий)`, ru, л.общий, я);
  for (const [к, с] of Object.entries(л.общий)) проверитьНовый(`lang-${я} общий «${к}»`, с, я);
}

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
const имена = new Map();
for (const файл of файлы(ИСХОДНИКИ)) {
  const текст = fs.readFileSync(файл, 'utf8');
  if (!текст.includes('создатьСловарь')) continue;
  const ист = ts.createSourceFile(файл, текст, ts.ScriptTarget.Latest, true, файл.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const где = path.relative(КОРЕНЬ, файл);
  ts.forEachChild(ист, function обход(у) {
    if (ts.isCallExpression(у) && ts.isIdentifier(у.expression) && у.expression.text === 'создатьСловарь' && у.arguments.length >= 1) {
      const сл = объект(у.arguments[0]);
      const имя = у.arguments[1] && ts.isStringLiteral(у.arguments[1]) ? у.arguments[1].text : null;
      if (!сл) {
        // словарь из переменной (audio/texts.ts) — проверяется там, где объявлен (ниже)
        if (имя) имена.set(имя, где);
        return;
      }
      словарей++;
      for (const язык of ['ru', 'kk', 'uz', 'en']) if (!сл[язык]) ошибка(где, `нет блока ${язык}`);
      if (сл.ru && сл.kk) сравнить(где, сл.ru, сл.kk, 'kk');
      if (сл.ru && сл.uz) сравнить(где, сл.ru, сл.uz, 'uz');
      if (сл.ru && сл.en) сравнить(где, сл.ru, сл.en, 'en');
      if (имя) {
        if (имена.has(имя)) ошибка(где, `имя словаря «${имя}» уже занято (${имена.get(имя)})`);
        имена.set(имя, где);
      }
      for (const язык of НОВЫЕ) {
        const блок = сл[язык] ?? (имя ? ЛОКАЛИ[язык].словари[имя] : undefined);
        if (!блок) {
          предупреждения.push(`${где}: нет перевода ${язык} (${имя ? 'имени «' + имя + '» нет в lang-' + язык + '.json' : 'словарь без имени'}) — показывается en`);
          continue;
        }
        if (сл.ru) сравнить(`${где} [${язык}]`, сл.ru, блок, язык);
        for (const [к, с] of Object.entries(блок)) if (typeof с === 'string') проверитьНовый(`${где} [${язык}] «${к}»`, с, язык);
      }
    }
    ts.forEachChild(у, обход);
  });
}
// Тексты плеера (audio/texts.ts) — словарь из переменных.
const { ТЕКСТЫ_ПЛЕЕРА, языкПлеера, названиеДляСессии } = await import('../src/audio/texts.ts');
сравнить('audio/texts.ts', ТЕКСТЫ_ПЛЕЕРА.ru, ТЕКСТЫ_ПЛЕЕРА.kk, 'kk');
сравнить('audio/texts.ts', ТЕКСТЫ_ПЛЕЕРА.ru, ТЕКСТЫ_ПЛЕЕРА.uz, 'uz');
сравнить('audio/texts.ts', ТЕКСТЫ_ПЛЕЕРА.ru, ТЕКСТЫ_ПЛЕЕРА.en, 'en');
for (const я of НОВЫЕ) {
  const блок = ЛОКАЛИ[я].словари['components/quran/PlayerBar'];
  if (!блок) ошибка('audio/texts.ts', `нет перевода ${я} (lang-${я}.json «components/quran/PlayerBar»)`);
  else сравнить(`audio/texts.ts [${я}]`, ТЕКСТЫ_ПЛЕЕРА.ru, блок, я);
}
// Лишние словари в lang-*.json (имя не встречается в коде) — ошибка: переименовали экран и забыли перевод.
for (const я of НОВЫЕ) for (const имя of Object.keys(ЛОКАЛИ[я].словари)) if (!имена.has(имя)) ошибка(`lang-${я}.json`, `словарь «${имя}» не найден в коде`);
assert.equal(языкПлеера('ar'), 'en');
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
assert.match(индекс, /en: 'en', ar: 'ar'/, 'ЯЗЫК_HTML.en = en');
assert.match(индекс, /\{ код: 'en', название: 'English' \}/, 'ЯЗЫКИ: English');
assert.ok(индекс.includes("return код === 'ru' || код === 'kk' || код === 'uz' || код === 'en' || код === 'ar' || код === 'tr' || код === 'id' || код === 'ur' ? код : null;"), 'языкБраузера знает 8 языков');
assert.ok(индекс.includes("if (код === 'in') return 'id';"), 'языкБраузера: старый код in → id');
for (const [код, имя] of [['ar', 'العربية'], ['tr', 'Türkçe'], ['id', 'Bahasa Indonesia'], ['ur', 'اردو']]) {
  assert.ok(индекс.includes(`{ код: '${код}', название: '${имя}' }`), `ЯЗЫКИ: ${имя}`);
  assert.ok(индекс.includes(`${код}: '${код}'`), `ЯЗЫК_HTML.${код}`);
}
const языкБраузера = (тег) => {
  // та же логика, что в i18n/index.tsx (файл с JSX — node его не импортирует; сверяем текст функции)
  const код = (тег ?? '').toLowerCase().split(/[-_]/)[0];
  if (код === 'in') return 'id';
  return ['ru', 'kk', 'uz', 'en', 'ar', 'tr', 'id', 'ur'].includes(код) ? код : null;
};
assert.equal(языкБраузера('ar-SA'), 'ar');
assert.equal(языкБраузера('tr-TR'), 'tr');
assert.equal(языкБраузера('in-ID'), 'id');
assert.equal(языкБраузера('id'), 'id');
assert.equal(языкБраузера('ur-PK'), 'ur');
const { справаНалево, основной, ВСЕ_ЯЗЫКИ } = await import('../src/i18n/languages.ts');
assert.deepEqual([...ВСЕ_ЯЗЫКИ], ['ru', 'kk', 'uz', 'en', 'ar', 'tr', 'id', 'ur']);
assert.ok(справаНалево('ar') && справаНалево('ur') && !справаНалево('tr') && !справаНалево('id') && !справаНалево('ru'));
assert.equal(основной('ar'), 'en');
assert.equal(основной('kk'), 'kk');
проверок += 20;
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
const { МЕТОДЫ, подписьМетода, подписьАсра } = await import('../src/prayer/methods.ts');
for (const м of Object.values(МЕТОДЫ)) проверитьEn(`prayer/methods.ts ${м.id}`, м.ведомство.en);
assert.equal(подписьМетода(МЕТОДЫ.dumk, 'en'), 'Calculated by the SAMK method (±1 min)');
for (const я of ['ru', 'kk', 'uz', 'en']) for (const м of ['hanafi', 'shafi']) assert.ok(подписьАсра(м, я).length > 4, `подписьАсра ${м} ${я}`);
assert.equal(подписьАсра('shafi', 'en'), "Asr: Shafi'i");
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

// ── 5б. ar, tr, id, ur: намазы, даты, отсчёт, методы, кибла, суры ──
{
  const { НАЗВАНИЯ: Н, датаДня: д, подписьДня: пд, обратныйОтсчёт: оо, обратныйОтсчётПолностью: оп, короткийДень } = await import('../src/prayer/day.ts');
  assert.deepEqual(Object.values(Н).map((н) => н.tr), ['İmsak', 'Güneş', 'Öğle', 'İkindi', 'Akşam', 'Yatsı']);
  assert.deepEqual(Object.values(Н).map((н) => н.id), ['Subuh', 'Terbit', 'Zuhur', 'Asar', 'Magrib', 'Isya']);
  assert.deepEqual(Object.values(Н).map((н) => н.ur), ['فجر', 'طلوع آفتاب', 'ظہر', 'عصر', 'مغرب', 'عشاء']);
  assert.deepEqual(Object.values(Н).map((н) => н.ar), ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء']);
  assert.equal(д('2026-11-20', 'tr'), '20 Kasım');
  assert.equal(д('2026-11-20', 'ar'), '20 نوفمبر');
  assert.equal(пд('2026-11-20', 'id', '2026-11-20'), 'Hari ini, 20 November');
  assert.equal(оо(65 * 60_000, 'tr'), '1 sa 05 dk sonra');
  assert.equal(оо(65 * 60_000, 'ar'), 'بعد 1 س 05 د');
  assert.equal(оп(2 * 60 * 60_000 + 3 * 60_000, 'ar'), 'بعد ساعتين و3 دقائق');
  assert.equal(оп(61 * 60_000, 'ur'), '1 گھنٹہ 1 منٹ باقی');
  assert.equal(короткийДень('2026-11-20', 'id').деньНедели, 'Jum');
  for (const я of НОВЫЕ) {
    assert.ok(подписьМетода(МЕТОДЫ.diyanet, я).length > 5);
    for (const м of Object.values(МЕТОДЫ)) assert.ok(м.ведомство[я]?.trim(), `ведомство ${м.id} ${я}`);
    assert.ok(румб(0, я).length >= 2);
    assert.ok(подписьАсра('hanafi', я).length > 3);
  }
  // Владелец 28.11.2026: на главной и в первом входе — без имени ведомства.
  for (const я of ['ru', 'kk', 'uz', 'en', ...НОВЫЕ]) {
    const к = подписьМетода(МЕТОДЫ.dumk, я, { кратко: true });
    if (/ДУМК|ҚМДБ|QMDB|SAMK|Казахстан|Kazakh|كازاخستان|قازقستان/.test(к)) ошибка('prayer/methods.ts', `кратко ${я}: «${к}»`);
    const о = подписьОфициального('dumk', '2026-11-20', я, { кратко: true });
    if (/ДУМК|ҚМДБ|QMDB|SAMK|Казахстан|Kazakh|كازاخستان|قازقستان/.test(о)) ошибка('prayer/official.ts', `кратко ${я}: «${о}»`);
  }
  // названиеСуры/словоАятов (ar: «سورة الفاتحة (1)», «7 آيات») — screens/quran/common.ts импортирует хранилище без
  // расширения (node не грузит); проверяет e2e ar (scripts/e2e-langs.mjs).
  проверок += 30;
}

// ── 8. Нейтрально о Казахстане (владелец 28.11.2026) ──
{
  const ВИДНЫЕ = ['screens/HomeScreen', 'screens/OnboardingScreen', 'components/prayer/PrayerCard', 'screens/AskScreen', 'screens/HadithItemScreen', 'screens/MoreScreen', 'screens/AboutScreen', 'components/info/Roadmap'];
  const ЗАПРЕТ = /ДУМК|ҚМДБ|QMDB|SAMK|muftyat|Imam AI/;
  const СТРАНА = /Казахстан|Қазақстан|Qozogʻiston|Kazakhstan|Kazakistan|كازاخستان|قازقستان/;
  const тексты = (имя) => {
    const tsx = path.join(ИСХОДНИКИ, имя + '.tsx');
    const файл = fs.existsSync(tsx) ? tsx : path.join(ИСХОДНИКИ, имя + '.ts');
    const ист = ts.createSourceFile(файл, fs.readFileSync(файл, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let сл = null;
    ts.forEachChild(ист, function о(у) {
      if (ts.isCallExpression(у) && ts.isIdentifier(у.expression) && у.expression.text === 'создатьСловарь') сл = объект(у.arguments[0]);
      ts.forEachChild(у, о);
    });
    return [сл.ru, сл.kk, сл.uz, сл.en, ...НОВЫЕ.map((я) => ЛОКАЛИ[я].словари[имя] ?? {})];
  };
  // Где страна — по делу: место хранения данных (сервер в РК) в «О приложении» и «Разработано в Казахстане».
  const СТРАНА_МОЖНО = { 'screens/AboutScreen': ['разработано', 'приватность1'] };
  for (const имя of ВИДНЫЕ) {
    for (const блок of тексты(имя)) {
      for (const [к, с] of Object.entries(блок)) {
        проверок++;
        if (ЗАПРЕТ.test(с)) ошибка(имя, `«${к}»: ведомство на видном месте (владелец 28.11.2026 — нейтрально): «${с}»`);
        if (СТРАНА.test(с) && !(СТРАНА_МОЖНО[имя] ?? []).includes(к)) ошибка(имя, `«${к}»: Казахстан на видном месте: «${с}»`);
      }
    }
  }
  for (const блок of тексты('screens/AboutScreen')) assert.ok(СТРАНА.test(блок['разработано'] ?? ''), '«Разработано в Казахстане» — в «О приложении» на всех языках');
}

for (const п of предупреждения) console.warn('ПРЕДУПРЕЖДЕНИЕ: ' + п);

if (ошибки.length) {
  console.error(`ОШИБКИ (${ошибки.length}):\n  - ` + ошибки.join('\n  - '));
  process.exit(1);
}
console.log(`OK: переводы интерфейса — общий словарь и ${словарей} словарей экранов, ${проверок} проверок`);
