#!/usr/bin/env node
/**
 * Сквозной тест перевода смыслов (Playwright, Chromium). Владелец 28.11.2026: «Нам нужно теперь добавить перевод каждого
 * аята!»; «Нужна функция, чтобы можно было включить перевод и видеть каждый аят сразу с переводом! Если выключить — только
 * арабский». Решение владельца 28.11.2026: только издания из официального списка QuranEnc — en, tr, id, ur, uz; без
 * тафсира; на ru, kk, ar перевода нет. Данные — dist/quran-trans (tools/quran_trans/build_translations.py), манифест
 * src/quran/transManifest.generated.ts; экраны — SuraScreen, AyahActions, components/quran/AyahMeaning.
 *
 * Сценарии (360×780):
 *   1. en, сура 1 «аят за аятом»: под каждым из 7 аятов перевод = файлу издания побайтно (текст Корана — Tanzil как был);
 *      подпись «Translation of the meanings: … · QuranEnc.com · version …», ссылка на страницу издания, плашка «черновик»;
 *      сноски свёрнуты — «Translator's footnotes» раскрывает их = файлу; переключатель «Перевод» в шапке (role=switch,
 *      aria-checked); снимок trans-en-sura.png;
 *   2. переключатель: выкл — ни одного перевода, только арабский; aiustaz:quran-trans.v1 = { вкл: false }; после
 *      перезагрузки — выкл; в ⚙ — строка перевода (выкл); вкл — снова под каждым аятом; trans-toggle.png;
 *   3. лист аята (en, 1:2): вверху — перевод = файлу с подписью; кнопка «Перевод» → арабский аят = Tanzil побайтно,
 *      «не сам Коран», перевод; тафсира нет нигде; «‹» — назад к действиям; trans-sheet-meaning.png;
 *   4. «Страницами» (tr): на странице мусхафа ни переключателя, ни переводов; нажатие на 1:2 → лист с переводом tr = файлу;
 *      снимок trans-page-sheet.png;
 *   5. uz: 2:255 — перевод Мансура = файлу; ur — lang="ur", dir="rtl";
 *   6. ru, kk, ar: ни переключателя «Перевод», ни переводов под аятами, ни перевода и кнопки «Перевод» в листе аята;
 *      снимок trans-ru-none.png;
 * и всё время: нет ошибок в консоли, исключений, запросов на другие адреса, нарушений CSP, чужих ключей localStorage,
 * горизонтальной прокрутки на 360 px.
 * Запуск (из app/, после npm run build:web): node scripts/e2e-trans.mjs (DIST=папка сборки; SHOTS_TRANS=папка — снимки).
 * Из e2e.mjs: import { переводСквозной } (E2E_TRANS=0 — пропустить).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ВРЕМЯ = '2026-11-28T15:13:00+05:00';
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: {},
  дниЗанятий: [],
  онбордингПройден: true,
});
const ТЕЛЕФОН = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' };

/** Издания из манифеста и файлы сур из сборки. */
export function данныеПереводов(папка) {
  const м = fs.readFileSync(path.join(корень, 'src', 'quran', 'transManifest.generated.ts'), 'utf8');
  const блок = (имя) => м.split(имя + ': {')[1]?.split('\n  },')[0] ?? '';
  const издания = (имя) =>
    Object.fromEntries([...блок(имя).matchAll(/(\w{2}): \{ ключ: '([a-z0-9_]+)', индекс: '([^']+)'/g)].map(([, я, ключ, индекс]) => [я, { ключ, индекс: JSON.parse(fs.readFileSync(path.join(папка, индекс), 'utf8')) }]));
  const переводы = издания('переводы');
  const тафсиры = издания('тафсиры');
  const сура = (и, н) => JSON.parse(fs.readFileSync(path.join(папка, и.индекс.суры[н - 1].файл), 'utf8'));
  const коран = (н) => {
    const qi = JSON.parse(fs.readFileSync(path.join(папка, 'quran', fs.readdirSync(path.join(папка, 'quran')).find((ф) => /^index\.[0-9a-f]{20}\.json$/.test(ф))), 'utf8'));
    return JSON.parse(fs.readFileSync(path.join(папка, qi.суры[н - 1].файл), 'utf8'));
  };
  return { переводы, тафсиры, сура, коран };
}

export async function переводСквозной(браузер, база, { папка = process.env.DIST ? path.resolve(process.env.DIST) : path.join(корень, 'dist'), снимки = process.env.SHOTS_TRANS ?? null } = {}) {
  let проверок = 0;
  if (снимки) fs.mkdirSync(снимки, { recursive: true });
  const д = данныеПереводов(папка);
  const адрес = (хэш) => база + '/aiustaz/index.html' + хэш;

  async function открыть({ язык = 'ru', вид = null } = {}) {
    const контекст = await браузер.newContext({ ...ТЕЛЕФОН, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
    await контекст.addInitScript(
      ({ прогресс, вид }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        try {
          if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
          localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1');
          localStorage.setItem('aiustaz:stats-off.v1', '1');
          if (вид && !sessionStorage.getItem('вид-поставлен')) {
            localStorage.setItem('aiustaz:quran-view.v1', JSON.stringify(вид));
            sessionStorage.setItem('вид-поставлен', '1');
          }
        } catch {}
      },
      { прогресс: ПРОГРЕСС(язык), вид },
    );
    const стр = await контекст.newPage();
    await стр.clock.setFixedTime(new Date(ВРЕМЯ));
    const проблемы = [];
    стр.on('request', (з) => {
      const u = з.url();
      if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
    });
    стр.on('console', (с) => {
      if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
    });
    стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
    const э = (id) => стр.getByTestId(id).first();
    const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
    // Исходный текст: куски, подстроенные для мединского шрифта, — <span data-o="исходный"> (quran/originalText.ts).
    const сырой = (id) =>
      стр.evaluate((id) => {
        const е = document.querySelector(`[data-testid="${id}"]`);
        if (!е) return null;
        const к = е.cloneNode(true);
        к.querySelectorAll('[data-o]').forEach((х) => х.replaceWith(х.getAttribute('data-o')));
        return к.textContent;
      }, id);
    const проверить = (условие, что) => {
      проверок += 1;
      if (!условие) throw new Error(`[перевод: ${язык}] НЕ ВЫПОЛНЕНО: ${что}`);
      console.log(`  ✓ ${что}`);
    };
    const безПроблем = async (что) => {
      const csp = await стр.evaluate(() => window.__csp ?? []);
      for (const н of csp) проблемы.push('нарушение CSP: ' + н);
      const ключи = await стр.evaluate(() => Object.keys(localStorage));
      for (const к of ключи) if (!к.startsWith('aiustaz:')) проблемы.push('чужой ключ в localStorage: ' + к);
      const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (лишнее > 1) проблемы.push(`горизонтальная прокрутка ${лишнее} px`);
      проверить(проблемы.length === 0, что + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
    };
    const снимок = async (имя) => {
      if (!снимки) return;
      await стр.waitForTimeout(250);
      await стр.screenshot({ path: path.join(снимки, имя) });
      console.log(`  📷 ${имя}`);
    };
    const переводовНаЭкране = () => стр.evaluate(() => document.querySelectorAll('[data-testid^="коран-аят-"][data-testid$="-перевод"]').length);
    return { контекст, стр, э, есть, сырой, проверить, безПроблем, снимок, переводовНаЭкране };
  }

  const en = д.переводы.en;
  const ф1 = д.сура(en, 1);
  const к1 = д.коран(1);

  // ── 1–3. en: перевод под аятами, сноски, переключатель, лист аята ──
  console.log('\n══ Перевод смыслов под аятами: en, сура 1, переключатель «Перевод», лист аята ══');
  {
    const с = await открыть({ язык: 'en' });
    await с.стр.goto(адрес('#/quran/sura?n=1'));
    await с.э('коран-аят-1-7-перевод').waitFor({ timeout: 15000 });
    for (let а = 1; а <= 7; а++) {
      с.проверить((await с.сырой(`коран-аят-1-${а}-перевод`)) === ф1.аяты[а - 1][0], `1:${а}: перевод под аятом = файлу ${en.ключ} побайтно`);
      с.проверить((await с.сырой(`коран-аят-1-${а}-текст`)) === к1.аяты[а - 1].текст, `1:${а}: текст Корана — Tanzil как был`);
    }
    const подпись = (await с.сырой('сура-перевод-подпись')) ?? '';
    с.проверить(подпись.startsWith('Translation of the meanings: ') && подпись.includes('QuranEnc.com') && подпись.includes('version ' + en.индекс.версия), `подпись над аятами: «${подпись.slice(0, 100)}…»`);
    const ссылка = await с.стр.evaluate(() => document.querySelector('[data-testid="сура-перевод-подпись-ссылка"]')?.getAttribute('href'));
    с.проверить(ссылка === 'https://' + en.индекс.ссылка, `ссылка на страницу издания: ${ссылка}`);
    с.проверить(await с.есть('сура-перевод-черновик'), 'плашка «черновик» у перевода');
    const сноска = ф1.аяты.findIndex((а) => а[1]);
    с.проверить(сноска >= 0, 'у Saheeh International в суре 1 есть сноски');
    const ид = `коран-аят-1-${сноска + 1}-перевод`;
    с.проверить(!(await с.есть(ид + '-сноски-текст')), `1:${сноска + 1}: сноски свёрнуты`);
    await с.э(ид + '-сноски').click();
    с.проверить((await с.сырой(ид + '-сноски-текст')) === ф1.аяты[сноска][1], `1:${сноска + 1}: «Translator's footnotes» — текст = файлу`);
    await с.э(ид + '-сноски').click();
    const переключатель = с.э('сура-перевод');
    с.проверить((await переключатель.getAttribute('role')) === 'switch' && (await переключатель.getAttribute('aria-checked')) === 'true', 'переключатель «Перевод» в шапке: switch, включён по умолчанию');
    await с.снимок('trans-en-sura.png');
    await переключатель.click();
    await с.стр.waitForFunction(() => !document.querySelector('[data-testid$="-перевод"][data-testid^="коран-аят-"]'), null, { timeout: 5000 });
    с.проверить((await с.переводовНаЭкране()) === 0 && !(await с.есть('сура-перевод-подпись')), 'выкл — только арабский: переводов и подписи нет');
    с.проверить(JSON.parse(await с.стр.evaluate(() => localStorage.getItem('aiustaz:quran-trans.v1'))).вкл === false, 'выбор помнится: aiustaz:quran-trans.v1 = { вкл: false }');
    await с.стр.reload();
    await с.э('коран-аят-1-7-текст').waitFor({ timeout: 15000 });
    await с.стр.waitForTimeout(400);
    с.проверить((await с.переводовНаЭкране()) === 0 && (await с.э('сура-перевод').getAttribute('aria-checked')) === 'false', 'после перезагрузки — выкл');
    await с.э('сура-вид').click();
    с.проверить((await с.э('вид-перевод').getAttribute('aria-checked')) === 'false', '⚙: строка перевода под аятами — выкл');
    await с.э('вид-перевод').click();
    await с.стр.keyboard.press('Escape');
    await с.э('коран-аят-1-7-перевод').waitFor({ timeout: 5000 });
    с.проверить((await с.переводовНаЭкране()) === 7, 'вкл из ⚙ — снова перевод под каждым из 7 аятов');
    await с.снимок('trans-toggle.png');

    await с.э('коран-аят-1-2-номер').click();
    await с.э('сура-действия').waitFor({ timeout: 5000 });
    await с.э('действия-перевод-текст').waitFor({ timeout: 8000 });
    с.проверить((await с.сырой('действия-перевод-текст')) === ф1.аяты[1][0] && (await с.есть('действия-перевод-подпись')) && (await с.есть('действия-перевод-черновик')), 'лист аята 1:2: перевод вверху = файлу, подпись и плашка');
    с.проверить(((await с.сырой('действия-смысл')) ?? '').includes('Translation of the meanings') && !/tafsir/i.test((await с.сырой('сура-действия')) ?? ''), 'кнопка «Перевод» (без тафсира)');
    await с.э('действия-смысл').click();
    await с.э('смысл-аята').waitFor({ timeout: 5000 });
    с.проверить((await с.сырой('смысл-аята-арабский')) === к1.аяты[1].текст, '«Перевод»: арабский аят = Tanzil побайтно');
    с.проверить(/not the Quran itself/.test((await с.сырой('смысл-аята-не-коран')) ?? ''), 'пометка «…not the Quran itself»');
    await с.э('смысл-перевод-текст').waitFor({ timeout: 5000 });
    с.проверить((await с.сырой('смысл-перевод-текст')) === ф1.аяты[1][0], '«Перевод»: перевод смыслов = файлу');
    с.проверить(!(await с.стр.locator('[data-testid*="тафсир"]').count()) && !/tafsir/i.test((await с.сырой('сура-действия')) ?? ''), 'тафсира нет');
    await с.снимок('trans-sheet-meaning.png');
    await с.э('действия-смысл-назад').click();
    await с.э('действия-слушать').waitFor({ timeout: 3000 });
    с.проверить(true, '«‹» — назад к действиям аята');
    await с.безПроблем('en: без ошибок, чужих запросов, CSP и горизонтальной прокрутки');
    await с.контекст.close();
  }

  // ── 4. «Страницами» (tr) ──
  console.log('\n══ «Страницами» (как книга), tr: страница мусхафа не меняется, перевод — в листе аята ══');
  {
    const tr = д.переводы.tr;
    const фt = д.сура(tr, 1);
    const с = await открыть({ язык: 'tr', вид: { версия: 1, вид: 'обычный', ночьЦвета: false, режим: 'страницы' } });
    await с.стр.goto(адрес('#/quran/sura?n=1'));
    await с.стр.waitForFunction(() => document.querySelector('[data-ayah="1:2"]'), null, { timeout: 15000 });
    с.проверить(!(await с.есть('сура-перевод')) && (await с.переводовНаЭкране()) === 0 && !(await с.есть('сура-перевод-подпись')), 'на странице мусхафа нет ни переключателя, ни переводов');
    await с.стр.locator('[data-ayah="1:2"]').first().click();
    await с.э('сура-действия').waitFor({ timeout: 5000 });
    await с.э('действия-перевод-текст').waitFor({ timeout: 8000 });
    с.проверить((await с.сырой('действия-перевод-текст')) === фt.аяты[1][0], `нажатие на 1:2 → лист действий с переводом ${tr.ключ} = файлу`);
    с.проверить(((await с.сырой('действия-перевод-подпись')) ?? '').startsWith('Meal: '), 'tr: подпись «Meal: … · QuranEnc.com»');
    await с.снимок('trans-page-sheet.png');
    await с.безПроблем('«Страницами»: без ошибок');
    await с.контекст.close();
  }

  // ── 5. uz, ur ──
  for (const [язык, сура, аят] of [['uz', 2, 255], ['ur', 1, 1]]) {
    console.log(`\n══ Перевод смыслов: ${язык}, ${сура}:${аят} ══`);
    const и = д.переводы[язык];
    const ф = д.сура(и, сура);
    const с = await открыть({ язык });
    await с.стр.goto(адрес(`#/quran/sura?n=${сура}&a=${аят}`));
    await с.э(`коран-аят-${сура}-${аят}-перевод`).waitFor({ timeout: 15000 });
    с.проверить((await с.сырой(`коран-аят-${сура}-${аят}-перевод`)) === ф.аяты[аят - 1][0], `${язык}: ${сура}:${аят} — перевод ${и.ключ} = файлу`);
    const атр = await с.стр.evaluate((id) => { const э = document.querySelector(`[data-testid="${id}"]`); return [э?.getAttribute('lang'), э?.getAttribute('dir')]; }, `коран-аят-${сура}-${аят}-перевод`);
    с.проверить(атр[0] === язык && атр[1] === (язык === 'ur' ? 'rtl' : 'ltr'), `${язык}: lang="${атр[0]}", dir="${атр[1]}"`);
    await с.безПроблем(`${язык}: без ошибок`);
    await с.контекст.close();
  }

  // ── 6. ru, kk, ar: перевода нет ──
  for (const язык of ['ru', 'kk', 'ar']) {
    console.log(`\n══ ${язык}: перевода нет (решение владельца 28.11.2026) ══`);
    const с = await открыть({ язык });
    await с.стр.goto(адрес('#/quran/sura?n=1'));
    await с.э('коран-аят-1-7-текст').waitFor({ timeout: 15000 });
    await с.стр.waitForTimeout(400);
    с.проверить(!(await с.есть('сура-перевод')) && (await с.переводовНаЭкране()) === 0 && !(await с.есть('сура-перевод-подпись')), `${язык}: ни переключателя «Перевод», ни перевода под аятами`);
    if (язык === 'ru') await с.снимок('trans-ru-none.png');
    await с.э('сура-вид').click();
    с.проверить(!(await с.есть('вид-перевод')), `${язык}: в ⚙ строки перевода нет`);
    await с.стр.keyboard.press('Escape');
    await с.э('коран-аят-1-2-номер').click();
    await с.э('сура-действия').waitFor({ timeout: 5000 });
    await с.стр.waitForTimeout(300);
    с.проверить(!(await с.есть('действия-перевод')) && !(await с.есть('действия-смысл')), `${язык}: в листе аята нет ни перевода, ни кнопки «Перевод»`);
    await с.безПроблем(`${язык}: без ошибок`);
    await с.контекст.close();
  }
  return проверок;
}

// Запуск напрямую.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch();
  try {
    const н = await переводСквозной(браузер, сервер.адрес);
    console.log(`\nOK: перевод смыслов — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
