#!/usr/bin/env node
/**
 * Сквозной тест «Учимся намазу» (Playwright, Chromium). Владелец 27.11.2026: «Учимся намазу нужно собрать по ханафи».
 *   1. ru: вход с главной (плитка «Учимся намазу») → оглавление: разделов = манифесту, плашка «черновик», итог «к имаму
 *      или в ДУМК»; каждый раздел открывается, заголовок = данным, плашка есть, пункты/таблица/«ждёт устаза» = данным;
 *      шаги 2 ракаатов: «Шаг n из N», ‹ › по всем шагам, арабский каждого текста = данным побайтно (lang="ar"),
 *      произношение = данным; «Назад» → оглавление; «Ещё» → «Учимся намазу», «Готовим» больше нет;
 *   2. kk, uz, en: заголовок, текст шага и смысл на языке интерфейса = данным;
 *   3. 360×640 (kk): оглавление, все разделы и длинный шаг — без горизонтальной прокрутки;
 * и всё время: нет ошибок в консоли, запросов на другие адреса, нарушений CSP, чужих ключей localStorage.
 * Запуск (из app/, после npm run export:web): node scripts/e2e-namaz.mjs. Из e2e.mjs: import { намазСквозной }.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ВРЕМЯ = '2026-11-26T15:13:00+05:00';
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
});
const ТЕЛЕФОН = (ширина, высота) => ({
  viewport: { width: ширина, height: высота },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});
const ЗАГОЛОВКИ = { ru: 'Учимся намазу', kk: 'Намаз оқып үйрену', uz: 'Namozni oʻrganish', en: 'Learn salah' };

/** Раздел из сборки (dist/<файл из манифеста>). */
export function данныеНамаза(папка) {
  const манифест = fs.readFileSync(path.join(корень, 'src', 'namaz', 'manifest.generated.ts'), 'utf8');
  const файл = манифест.match(/файл: '([^']+)'/)[1];
  const разделов = Number(манифест.match(/разделов: (\d+)/)[1]);
  return { набор: JSON.parse(fs.readFileSync(path.join(папка, файл), 'utf8')), разделов };
}

let проверок = 0;

async function новаяСтраница(браузер, база, { ширина = 412, высота = 800, язык = 'ru', контекст: прежний = null } = {}) {
  const контекст = прежний ?? (await браузер.newContext({ ...ТЕЛЕФОН(ширина, высота), locale: 'ru-RU', timezoneId: 'Asia/Almaty' }));
  if (!прежний) {
    await контекст.addInitScript(
      ({ прогресс }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        // about:blank (глубокая ссылка «с нуля») — хранилища нет: пропускаем.
        if (location.protocol.startsWith('http') && !localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс)); try { localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); } catch {} // лист первого выбора чтеца — свой тест (e2e-download.mjs)
      },
      { прогресс: ПРОГРЕСС(язык) },
    );
  }
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
  return { контекст, стр, проблемы };
}

function помощники(стр, проблемы, имя) {
  const э = (id) => стр.getByTestId(id).first();
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const текстЭ = async (id) => (await э(id).innerText()).trim();
  const сырой = (id) => стр.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null, id);
  const хэш = () => стр.evaluate(() => location.hash);
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error(`[намаз: ${имя}] НЕ ВЫПОЛНЕНО: ${что}`);
    console.log(`  ✓ ${что}`);
  };
  const экран = async (id, адрес) => {
    await э(id).waitFor({ timeout: 15000 });
    if (адрес) await стр.waitForFunction((а) => location.hash === а, адрес, { timeout: 5000 });
  };
  const ждатьТекст = (id, текст) =>
    стр.waitForFunction(([id, т]) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() === т, [id, текст], { timeout: 5000 }).then(
      () => true,
      () => false,
    );
  const безПроблем = async (что) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    const ключи = await стр.evaluate(() => Object.keys(localStorage));
    for (const к of ключи) if (!к.startsWith('aiustaz:')) проблемы.push('чужой ключ в localStorage: ' + к);
    проверить(проблемы.length === 0, что + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const безГоризонтальнойПрокрутки = async (где) => {
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    проверить(лишнее <= 1, `${где}: нет горизонтальной прокрутки (лишние ${лишнее} px)`);
  };
  return { э, есть, текстЭ, сырой, хэш, проверить, экран, ждатьТекст, безПроблем, безГоризонтальнойПрокрутки };
}

export async function намазСквозной(браузер, база) {
  const папка = process.env.DIST ? path.resolve(process.env.DIST) : path.join(корень, 'dist');
  const { набор, разделов } = данныеНамаза(папка);
  const адрес = (хэш) => база + '/aiustaz/index.html' + хэш;
  const номерШагов = набор.разделы.findIndex((р) => р.шаги) + 1;
  const шаги = набор.разделы[номерШагов - 1].шаги;

  console.log('\n══ «Учимся намазу»: вход с главной, разделы, шаги (ru, 412×800) ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база);
    const п = помощники(стр, проблемы, 'ru');
    await стр.goto(адрес('#/'));
    await п.экран('экран-главная', '#/');
    await п.э('главная-раздел-намаз').click();
    await п.экран('экран-учимся-намазу', '#/namaz');
    await п.э('намаз-разделы').waitFor({ timeout: 15000 });
    п.проверить(набор.разделы.length === разделов, `в файле ${разделов} разделов = манифесту`);
    п.проверить((await стр.locator('[data-testid^="намаз-раздел-"]').count()) === разделов, `в оглавлении ${разделов} разделов`);
    п.проверить(await п.есть('намаз-черновик'), 'плашка «Черновик» в оглавлении');
    п.проверить((await п.текстЭ('намаз-итог')).includes('ДУМК'), 'внизу — «вопросы о своём намазе — к имаму или в ДУМК» (без фетв)');
    for (let i = 1; i <= разделов; i++) {
      await стр.goto(адрес(`#/namaz/section?n=${i}`));
      await п.экран('экран-раздел-намаза', `#/namaz/section?n=${i}`);
      await п.э('намаз-черновик').waitFor({ timeout: 15000 });
      const р = набор.разделы[i - 1];
      const заголовок = await стр.evaluate(() => document.querySelector('[role="heading"][aria-level="1"], h1')?.textContent?.trim());
      п.проверить(заголовок === р.название.ru, `раздел ${i} «${р.название.ru}» открылся, плашка черновика есть`);
      if (р.группы) п.проверить((await п.сырой('намаз-пункт-0-0')) === р.группы[0].пункты[0].ru, `раздел ${i}: первый пункт = данным`);
      if (р.таблица) п.проверить((await стр.locator('[data-testid^="намаз-строка-"]').count()) === р.таблица.строки.length, `раздел ${i}: строк таблицы ${р.таблица.строки.length}`);
      if (р.ждёт_устаза) п.проверить((await п.сырой('намаз-ждёт-устаза'))?.includes(р.ждёт_устаза.ru), `раздел ${i}: пометка «ждёт устаза»`);
    }
    // Шаги: ‹ › и тексты побайтно.
    await стр.goto(адрес(`#/namaz/section?n=${номерШагов}`));
    await п.экран('экран-раздел-намаза', `#/namaz/section?n=${номерШагов}`);
    await п.э('намаз-шаг-позиция').waitFor({ timeout: 15000 });
    п.проверить((await п.текстЭ('намаз-шаг-позиция')) === `Шаг 1 из ${шаги.length}`, `«Шаг 1 из ${шаги.length}»`);
    п.проверить((await стр.getByTestId('намаз-шаг-пред').first().getAttribute('aria-disabled')) === 'true', 'на первом шаге «назад» недоступна');
    for (let n = 1; n <= шаги.length; n++) {
      const ш = шаги[n - 1];
      п.проверить((await п.ждатьТекст('намаз-шаг-заголовок', `${n}. ${ш.заголовок.ru}`)), `шаг ${n}: «${ш.заголовок.ru}»`);
      for (const ид of ш.тексты ?? []) {
        const т = набор.тексты[ид];
        const ar = await стр.evaluate((ид) => [...document.querySelectorAll(`[data-testid="намаз-текст-${ид}-арабский"] [lang="ar"]`)].map((е) => е.textContent), ид);
        п.проверить(ar.length === т.ar.length && ar.every((а, i) => а === т.ar[i]), `шаг ${n}: арабский «${ид}» = данным побайтно`);
        п.проверить((await п.сырой(`намаз-текст-${ид}-произношение`)) === т.произношение.ru, `шаг ${n}: произношение «${ид}» = данным`);
      }
      if (n < шаги.length) {
        await п.э('намаз-шаг-след').click();
        await стр.waitForFunction((а) => location.hash === а, `#/namaz/section?n=${номерШагов}&a=${n + 1}`, { timeout: 5000 });
      }
    }
    п.проверить((await стр.getByTestId('намаз-шаг-след').first().getAttribute('aria-disabled')) === 'true', 'на последнем шаге «вперёд» недоступна');
    await п.э('намаз-шаг-пред').click();
    п.проверить(await п.ждатьТекст('намаз-шаг-позиция', `Шаг ${шаги.length - 1} из ${шаги.length}`), '‹ — на шаг назад');
    // Глубокая ссылка на шаг «с нуля» → «Назад» ведёт в оглавление (стек [главная, учимсяНамазу, раздел]).
    await стр.goto('about:blank');
    await стр.goto(адрес(`#/namaz/section?n=${номерШагов}&a=3`));
    await п.экран('экран-раздел-намаза', `#/namaz/section?n=${номерШагов}&a=3`);
    await п.э('кнопка-назад').click();
    await п.экран('экран-учимся-намазу', '#/namaz');
    // «Ещё» → «Учимся намазу».
    await стр.goto(адрес('#/more'));
    await п.экран('экран-ещё', '#/more');
    await п.э('ещё-намаз').click();
    await п.экран('экран-учимся-намазу', '#/namaz');
    п.проверить(!(await п.есть('ещё-готовим')), '«Ещё»: «Готовим» больше нет');
    await п.безПроблем('ru: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }

  for (const язык of ['kk', 'uz', 'en']) {
    console.log(`\n══ «Учимся намазу»: ${язык} ══`);
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { язык });
    const п = помощники(стр, проблемы, язык);
    await стр.goto(адрес('#/namaz'));
    await п.экран('экран-учимся-намазу', '#/namaz');
    await п.э('намаз-разделы').waitFor({ timeout: 15000 });
    const h1 = await стр.evaluate(() => document.querySelector('[role="heading"][aria-level="1"], h1')?.textContent?.trim());
    п.проверить(h1 === ЗАГОЛОВКИ[язык], `${язык}: заголовок «${ЗАГОЛОВКИ[язык]}»`);
    await стр.goto(адрес(`#/namaz/section?n=${номерШагов}&a=4`));
    await п.экран('экран-раздел-намаза', `#/namaz/section?n=${номерШагов}&a=4`);
    await п.э('намаз-шаг-текст').waitFor({ timeout: 15000 });
    п.проверить((await п.сырой('намаз-шаг-текст')) === шаги[3].текст[язык], `${язык}: текст шага 4 = данным`);
    const ид = шаги[3].тексты[0];
    п.проверить((await п.сырой(`намаз-текст-${ид}-перевод`)) === набор.тексты[ид].перевод[язык], `${язык}: смысл «${ид}» = данным`);
    await п.безПроблем(`${язык}: нет ошибок, чужих запросов и нарушений CSP`);
    await контекст.close();
  }

  console.log('\n══ «Учимся намазу»: 360×640 — без горизонтальной прокрутки ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { ширина: 360, высота: 640, язык: 'kk' });
    const п = помощники(стр, проблемы, '360');
    for (const хэш of ['#/namaz', ...набор.разделы.map((_, i) => `#/namaz/section?n=${i + 1}`), `#/namaz/section?n=${номерШагов}&a=14`]) {
      await стр.goto(адрес(хэш));
      await п.э('намаз-черновик').waitFor({ timeout: 15000 });
      await стр.waitForTimeout(150);
      await п.безГоризонтальнойПрокрутки(хэш);
    }
    await п.безПроблем('360: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }
  return проверок;
}

// Запуск напрямую.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch();
  try {
    const н = await намазСквозной(браузер, сервер.адрес);
    console.log(`\nOK: «Учимся намазу» — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
