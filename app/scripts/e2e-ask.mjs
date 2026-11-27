#!/usr/bin/env node
/**
 * Сквозной тест «Спросить AI Ustaz» (Playwright, Chromium): центр нижнего меню, экран вопросов, ответы с источниками.
 * Владелец 20.11.2026: «AI Ustaz — значок посередине нижнего меню … задавать свои вопросы … только с нашей базы данных».
 * Сервер подменён (page.route '/api/ask/v1') — тест проверяет приложение, а не сервер (server/tests).
 *
 * Сценарии:
 *   1. aiustaz.pro (412×800): круг AI Ustaz в центре меню → #/ask; пусто — эмблема, границы («Это не фетва»), 4 примера;
 *      пример → в запросе ровно { q, lang }; ответ ИИ — текст и «Кратко по нашей базе — ИИ, сверьте с источниками»;
 *      источник «справка»; источник «коран» 2:43 — аят из своей копии Tanzil (dist/quran) побайтно, «Открыть 2:43 в
 *      Коране» → сура у аята 43; «к-имаму» — шаблон «личный вопрос … имаму … AI Ustaz фетв не даёт» (текст сервера
 *      не показываем); ответ с арабским письмом в тексте — шаблон; хадис без степени — отброшен; 429 — строка «подождите
 *      минуту»; переписка переживает переход по разделам и исчезает после перезагрузки; в localStorage — ничего о вопросах;
 *   2. 360×640: поле и «Отправить» над меню, нет горизонтальной прокрутки; kk — подписи по-казахски;
 *   3. не свой домен (127.0.0.1 без флага): поле выключено, «AI Ustaz отвечает на нашем отдельном сайте», запросов нет.
 * И всё время: нет ошибок в консоли, запросов на чужие адреса.
 * Запуск (из app/, после npm run build:web): node scripts/e2e-ask.mjs. Из e2e.mjs: import { спроситьСквозной }.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { данныеКорана } from './e2e-quran.mjs';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const АРАБСКИЙ = /[؀-ۿ]/;
const ПРОГРЕСС = (язык) => ({ версия: 1, язык, предупреждениеПоказано: true, пояснениеМикрофонаПоказано: true, согласиеПроверкиГолосом: false, уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-17' } }, дниЗанятий: ['2026-11-17'] });

const и = (х) => ({ id: 's1', вид: 'справка', заголовок: 'Что такое AI Ustaz', ссылка: null, текст: 'Бесплатное приложение без рекламы.', арабский: null, источник: 'Справка AI Ustaz', степень: null, кто_оценил: null, черновик: false, версия: '1', ...х });
const ОТВЕТЫ = {
  'Что такое AI Ustaz?': { вид: 'ответ', режим: 'ии', текст: 'AI Ustaz — бесплатный наставник по чтению Корана.', черновик: false, источники: [и()] },
  'Где в Коране о намазе и закяте?': { вид: 'ответ', режим: 'поиск', текст: 'Вот что есть в нашей базе:', черновик: true, источники: [и({ id: 'q-2-43', вид: 'коран', заголовок: 'Сура аль-Бакара, аят 43', ссылка: '2:43', текст: '', источник: 'Tanzil Uthmani v1.1', черновик: true })] },
  'Мой намаз действителен?': { вид: 'к-имаму', режим: 'поиск', текст: 'Ваш намаз недействителен', черновик: false, источники: [] },
  'Проверка арабского': { вид: 'ответ', режим: 'ии', текст: 'Сказано: بِسْمِ ٱللَّهِ', черновик: false, источники: [и({ id: 's2' })] },
  'Проверка хадиса': { вид: 'ответ', режим: 'поиск', текст: 'Вот что есть:', черновик: false, источники: [и({ id: 'h-без-степени', вид: 'хадис', ссылка: 'сборник, №', степень: null, кто_оценил: null })] },
};

let проверок = 0;
function проверить(условие, что) {
  проверок += 1;
  if (!условие) throw new Error('[AI Ustaz] НЕ ВЫПОЛНЕНО: ' + что);
  console.log('  ✓ ' + что);
}

async function страница(браузер, база, { ширина = 412, высота = 800, язык = 'ru' } = {}) {
  const к = await браузер.newContext({ viewport: { width: ширина, height: высота }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  await к.addInitScript((п) => {
    if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(п)); try { localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); } catch {} // лист первого выбора чтеца — свой тест (e2e-download.mjs)
  }, ПРОГРЕСС(язык));
  const стр = await к.newPage();
  const проблемы = [];
  const запросы = [];
  let лимит = false;
  стр.on('console', (с) => с.type() === 'error' && !/status of 429/.test(с.text()) && проблемы.push('консоль: ' + с.text()));
  стр.on('pageerror', (о) => проблемы.push('исключение: ' + о.message));
  стр.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('чужой адрес: ' + u);
  });
  await стр.route('**/api/ask/v1', async (м) => {
    const тело = JSON.parse(м.request().postData() ?? '{}');
    запросы.push(тело);
    if (лимит) return м.fulfill({ status: 429, contentType: 'application/json', body: '{"ошибка":"rate"}' });
    await м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ОТВЕТЫ[тело.q] ?? { вид: 'нет-в-базе', режим: 'поиск', текст: '', источники: [], черновик: false }) });
  });
  const э = (id) => стр.getByTestId(id).first();
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const текст = async (id) => (await э(id).innerText()).trim();
  const ответов = () => стр.locator('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').count();
  const спросить = async (q) => {
    const было = await ответов();
    await э('устаз-поле').fill(q);
    await э('устаз-отправить').click();
    await стр.waitForFunction((б) => document.querySelectorAll('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').length > б || document.querySelector('[data-testid="устаз-ошибка"]'), было, { timeout: 8000 });
    const все = await стр.locator('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').allInnerTexts();
    return все[все.length - 1];
  };
  const безПроблем = (что) => проверить(проблемы.length === 0, что + (проблемы.length ? ': ' + проблемы.join('; ') : ''));
  return { к, стр, э, есть, текст, спросить, запросы, безПроблем, включитьЛимит: () => (лимит = true) };
}

export async function спроситьСквозной(браузер, порт, папка = path.join(корень, 'dist')) {
  проверок = 0;
  const данные = данныеКорана(папка);
  const свой = `http://aiustaz.pro:${порт}`;

  console.log('\n══ AI Ustaz: центр меню, вопросы, источники (aiustaz.pro, 412×800) ══');
  {
    const с = await страница(браузер, свой);
    await с.стр.goto(свой + '/aiustaz/index.html#/');
    await с.э('нижнее-меню').waitFor({ timeout: 15000 });
    await с.э('меню-устаз').click();
    await с.э('устаз-пусто').waitFor();
    проверить((await с.стр.evaluate(() => location.hash)) === '#/ask' && (await с.стр.title()) === 'AI Ustaz', 'центр меню → #/ask, заголовок «AI Ustaz»');
    проверить(/Отвечаю только по нашей проверенной базе/.test(await с.текст('устаз-границы')) && /Это не фетва/.test(await с.текст('устаз-границы')), 'границы: «Отвечаю только по нашей проверенной базе … Это не фетва»');
    проверить((await с.стр.getByTestId(/^устаз-пример-/).count()) === 4, '4 примера вопроса');

    await с.э('устаз-пример-1').click();
    await с.стр.waitForFunction(() => document.querySelector('[data-testid="устаз-ответ-1-текст"]'), null, { timeout: 8000 });
    проверить(JSON.stringify(с.запросы[0]) === JSON.stringify({ q: 'Что такое AI Ustaz?', lang: 'ru' }), 'пример → запрос ровно { q, lang } (без истории, идентификаторов, координат)');
    const о1 = await с.текст('устаз-ответ-1');
    проверить(/бесплатный наставник/.test(о1) && /Кратко по нашей базе — ИИ, сверьте с источниками/.test(о1) && (await с.есть('устаз-источник-s1')), 'ответ ИИ: текст, пометка «ИИ, сверьте с источниками», источник «О приложении»');

    const о2 = await с.спросить('Где в Коране о намазе и закяте?');
    await с.стр.waitForFunction(() => document.querySelector('[data-testid="устаз-аят-2-43"]'), null, { timeout: 10000 });
    const аят = await с.стр.evaluate(() => document.querySelector('[data-testid="устаз-аят-2-43"]').textContent);
    проверить(аят === данные.сура(2).аяты[42].текст, 'источник «Коран 2:43»: аят из своей копии Tanzil побайтно (правило 1)');
    проверить(/Найдено в нашей базе/.test(await с.текст('устаз-ответ-3')) && /Черновик — проверяет устаз/.test(await с.текст('устаз-ответ-3')), 'режим поиска — «Найдено в нашей базе», плашка «черновик» (правило 11)');
    void о2;

    const о3 = await с.спросить('Мой намаз действителен?');
    проверить(/личный вопрос фикха/.test(о3) && /имаму/.test(о3) && /фетв не даёт/.test(о3) && !/недействител/.test(о3), '«к-имаму» — наш шаблон («личный вопрос … имаму … фетв не даёт»), текст сервера не показан (правило 5)');
    const о4 = await с.спросить('Проверка арабского');
    проверить(!АРАБСКИЙ.test(о4) && /Вот что есть в нашей базе/.test(о4), 'текст ответа с арабским письмом — заменён шаблоном (правило 1)');
    await с.спросить('Проверка хадиса');
    проверить(!(await с.есть('устаз-источник-h-без-степени')), 'хадис без степени и того, кто её дал, — не показан (правило 2)');
    const о6 = await с.спросить('Как варить плов?');
    проверить(/пока нет ответа/.test(о6), '«нет-в-базе» — «В нашей базе пока нет ответа…»');

    // Переход к аяту из ответа и назад — переписка на месте.
    await с.э('устаз-открыть-2-43').click();
    await с.стр.waitForFunction(() => location.hash === '#/quran/sura?n=2&a=43', null, { timeout: 5000 });
    await с.э('коран-аят-2-43-текст').waitFor({ timeout: 10000 });
    проверить(true, '«Открыть 2:43 в Коране» → сура 2 у аята 43');
    await с.стр.goBack();
    await с.э('устаз-ответ-1').waitFor({ timeout: 5000 });
    проверить((await с.стр.locator('[data-testid^="устаз-вопрос-"]').count()) === 6, '«назад» из Корана — переписка на месте (6 вопросов)');
    await с.э('меню-главная').click();
    await с.э('меню-устаз').click();
    await с.э('устаз-ответ-1').waitFor({ timeout: 5000 });
    проверить(true, 'переход по разделам — переписка сохраняется (в памяти страницы)');
    const ключи = await с.стр.evaluate(() => Object.keys(localStorage).map((к) => к + '=' + localStorage.getItem(к)).join('\n'));
    проверить(!/плов|намаз действител|AI Ustaz\?/.test(ключи) && Object.keys(await с.стр.evaluate(() => ({ ...localStorage }))).every((к) => к.startsWith('aiustaz:')), 'в localStorage нет вопросов и ответов');
    с.включитьЛимит();
    await с.спросить('Ещё один вопрос');
    проверить(/подождите минуту/.test(await с.текст('устаз-ошибка')), '429 — «Слишком много вопросов подряд — подождите минуту»');
    await с.стр.reload();
    await с.э('устаз-пусто').waitFor({ timeout: 10000 });
    проверить(true, 'после перезагрузки переписки нет');
    с.безПроблем('aiustaz.pro: без ошибок и чужих запросов');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: 360×640, kk ══');
  {
    const с = await страница(браузер, свой, { ширина: 360, высота: 640, язык: 'kk' });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    const р = await с.стр.evaluate(() => {
      const р_ = (id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
      return { поле: р_('устаз-поле'), кнопка: р_('устаз-отправить'), меню: р_('нижнее-меню'), круг: р_('круг-устаза'), лишнее: document.documentElement.scrollWidth - innerWidth };
    });
    проверить(р.поле.bottom <= р.круг.top + 2 && р.кнопка.bottom <= р.меню.top && р.кнопка.width >= 48 && р.лишнее <= 1, `360: поле и «Жіберу» над меню и кругом AI Ustaz (низ поля ${р.поле.bottom.toFixed(0)} ≤ верх круга ${р.круг.top.toFixed(0)}), без горизонтальной прокрутки`);
    проверить(/пәтуа емес/.test(await с.текст('устаз-границы')) && (await с.текст('меню-устаз')) === 'AI Ustaz', 'kk: «Бұл пәтуа емес», подпись меню «AI Ustaz»');
    await с.спросить('Мой намаз действителен?');
    проверить(JSON.stringify(с.запросы[0]) === JSON.stringify({ q: 'Мой намаз действителен?', lang: 'kk' }) && /имамға|имамына/.test(await с.текст('устаз-к-имаму')), 'kk: lang=kk, «к-имаму» по-казахски');
    с.безПроблем('360 kk: без ошибок');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: не свой домен — выключено ══');
  {
    const база = `http://127.0.0.1:${порт}`;
    const с = await страница(браузер, база);
    await с.стр.goto(база + '/aiustaz/index.html#/ask');
    await с.э('устаз-выключено').waitFor({ timeout: 15000 });
    проверить(/aiustaz\.pro/.test(await с.текст('устаз-выключено')) && (await с.стр.evaluate(() => document.querySelector('[data-testid="устаз-поле"]').readOnly || document.querySelector('[data-testid="устаз-поле"]').disabled)), 'не свой домен: поле выключено, «AI Ustaz отвечает на нашем отдельном сайте aiustaz.pro»');
    await с.э('устаз-пример-1').click({ force: true });
    await с.стр.waitForTimeout(400);
    проверить(с.запросы.length === 0, 'не свой домен: запросов к /api/ask нет');
    с.безПроблем('не свой домен: без ошибок');
    await с.к.close();
  }
  console.log(`\nAI Ustaz: ${проверок} проверок пройдено.`);
  return проверок;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch({ args: [`--host-resolver-rules=MAP aiustaz.pro 127.0.0.1`] });
  try {
    await спроситьСквозной(браузер, сервер.порт);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
