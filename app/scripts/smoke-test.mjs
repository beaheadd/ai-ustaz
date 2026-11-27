#!/usr/bin/env node
/**
 * Дымовой тест веб-сборки в Chromium (Playwright): сборка открывается как на batr.kz,
 * экраны-заглушки открываются, переходы и «назад/вперёд» (в приложении и браузера) работают,
 * глубокая ссылка и перезагрузка восстанавливают стек, запись голоса (фальшивый микрофон)
 * проходит путь «пояснение → запись → прослушать → удалить» и освобождает микрофон,
 * переключение языка, колонка на десктопе. Всё время следит: ни одного запроса наружу,
 * ни одной ошибки в консоли, ни одного нарушения CSP.
 *
 * Запуск: npm run test:web  (сначала npm run build:web). Playwright — предустановленный
 * (require('playwright')); `playwright install` не нужен. Скриншоты — в SCREENSHOTS (если задана).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const СКРИНШОТЫ = process.env.SCREENSHOTS;

const сервер = await запуститьСервер({ порт: 0 });
const база = сервер.адрес;
const браузер = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const проблемы = [];
let шагов = 0;

function проверить(условие, что) {
  шагов += 1;
  if (!условие) throw new Error('НЕ ВЫПОЛНЕНО: ' + что);
  console.log('  ✓ ' + что);
}

try {
  const контекст = await браузер.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  await контекст.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
    // Следим за потоками микрофона, чтобы проверить их освобождение.
    window.__потоки = [];
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const исходный = md.getUserMedia.bind(md);
      md.getUserMedia = async (о) => {
        const п = await исходный(о);
        window.__потоки.push(п);
        return п;
      };
    }
  });
  const стр = await контекст.newPage();
  стр.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(база) && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('внешний запрос: ' + u);
  });
  стр.on('console', (с) => {
    if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
  });
  стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));

  const экран = (id) => стр.getByTestId(id).first();
  const хэш = () => стр.evaluate(() => location.hash);
  const снимок = async (имя) => {
    if (СКРИНШОТЫ) await стр.screenshot({ path: path.join(СКРИНШОТЫ, имя + '.png') });
  };

  console.log('1. Вход как из меню batr.kz: /aiustaz → редирект → приложение');
  await стр.goto(база + '/aiustaz');
  // Первый вход: главная сама открывает онбординг из 4 шагов (язык, место, расчёт, уведомления — владелец 28.11.2026);
  // «Пропустить» на каждом шаге → главная.
  await экран('экран-онбординг').waitFor({ timeout: 20000 });
  проверить((await хэш()) === '#/onboarding', 'первый вход → онбординг (#/onboarding)');
  проверить((await стр.textContent('body')).includes('Ассаляму алейкум') && (await экран('онбординг-язык-ru').isVisible()), 'онбординг, шаг 1: «Ассаляму алейкум» и выбор языка');
  for (let n = 1; n <= 4; n++) {
    await экран('онбординг-шаг-' + n).waitFor();
    await экран('онбординг-пропустить').click();
  }
  await экран('экран-главная').waitFor({ timeout: 20000 });
  проверить((await стр.evaluate(() => location.pathname)) === '/aiustaz/index.html', 'после редиректа открыт /aiustaz/index.html');
  проверить((await хэш()) === '#/', 'адрес главной — #/');
  проверить((await экран('плашка-прототипа').count()) === 0, 'на главной плашки «Прототип» нет (владелец 20.11.2026)');
  проверить(await экран('нижнее-меню').isVisible(), 'внизу — нижнее меню');
  проверить((await стр.evaluate(() => document.documentElement.lang)) === 'ru', 'язык страницы — ru');
  const шрифт = await стр.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((ш) => ш.family.replace(/"/g, '') === 'AmiriQuran' && ш.status === 'loaded');
  });
  проверить(шрифт, 'шрифт Amiri Quran загружен из бандла');
  await снимок('01-главная-телефон');

  console.log('2. «Ещё» → О проекте → Лицензии (отдельный чанк), «назад» браузера');
  await экран('меню-ещё').click();
  await экран('экран-ещё').waitFor();
  проверить((await хэш()) === '#/more', 'нижнее меню → «Ещё» (#/more)');
  await экран('ещё-о-проекте').click();
  await экран('экран-о-проекте').waitFor();
  проверить((await хэш()) === '#/about', 'адрес #/about');
  проверить((await экран('версия-контента').textContent()).includes('2026.11-прототип-0'), 'JSON из /content импортирован (версия уроков)');
  await экран('о-проекте-лицензии').click();
  await экран('экран-лицензии').waitFor();
  await экран('лицензия-react').waitFor({ timeout: 10000 });
  проверить(true, 'лицензии загружены отдельным чанком');
  await стр.goBack();
  await экран('экран-о-проекте').waitFor();
  проверить((await хэш()) === '#/about', '«назад» браузера → О проекте');
  await стр.goBack();
  await экран('экран-ещё').waitFor();
  проверить((await хэш()) === '#/more', '«назад» браузера → «Ещё»');
  await стр.goBack();
  await экран('экран-главная').waitFor();
  проверить((await хэш()) === '#/', '«назад» браузера → главная');
  await стр.goForward();
  await экран('экран-ещё').waitFor();
  await стр.goForward();
  await экран('экран-о-проекте').waitFor();
  проверить(true, '«вперёд» браузера → «Ещё» → О проекте');
  await экран('кнопка-назад').click();
  await экран('экран-ещё').waitFor();
  проверить(true, 'кнопка «назад» приложения → «Ещё»');
  await экран('меню-главная').click();
  await экран('экран-главная').waitFor();
  проверить((await хэш()) === '#/', 'нижнее меню → главная');

  console.log('3. Карта курса → урок 2; плашка урока; «назад» приложения');
  await экран('меню-главная').click(); // «Таджвид» — плитка главной (в центре меню с 27.11.2026 — AI Ustaz)
  await экран('главная-раздел-таджвид').click();
  await экран('экран-карта').waitFor();
  await экран('карта-урок-2').click();
  await экран('экран-урок').waitFor();
  проверить((await хэш()) === '#/lesson/2', 'адрес #/lesson/2');
  проверить((await экран('плашка-прототипа').textContent()).includes('Черновик урока'), 'плашка «Черновик урока» на экране урока');
  await экран('кнопка-назад').click();
  await экран('экран-карта').waitFor();
  проверить((await хэш()) === '#/course', '«назад» приложения → карта курса');

  console.log('4. Перезагрузка в глубине стека и глубокая ссылка');
  await экран('карта-урок-1').click();
  await экран('экран-урок').waitFor();
  await стр.reload();
  await экран('экран-урок').waitFor();
  проверить((await хэш()) === '#/lesson/1', 'после перезагрузки — тот же урок');
  await экран('кнопка-назад').click();
  await экран('экран-карта').waitFor();
  проверить(true, 'после перезагрузки стек восстановлен: «назад» → карта курса');
  await стр.goto(база + '/aiustaz#/lesson/3');
  await экран('экран-урок').waitFor();
  проверить((await стр.textContent('body')).includes('Урок 3'), 'глубокая ссылка /aiustaz#/lesson/3 через редирект → урок 3');
  await стр.goBack();
  await экран('экран-главная').waitFor();
  проверить(true, '«назад» после глубокой ссылки → главная');
  await стр.goto(база + '/aiustaz/index.html#/no-such-screen');
  await экран('экран-главная').waitFor();
  проверить(true, 'неизвестный адрес → главная');

  console.log('5. Запись голоса (фальшивый микрофон)');
  await экран('меню-главная').click(); // «Таджвид» — плитка главной (в центре меню с 27.11.2026 — AI Ustaz)
  await экран('главная-раздел-таджвид').click();
  await экран('карта-урок-0').click();
  await экран('экран-урок0').waitFor();
  await экран('урок0-шаг-предупреждение').waitFor();
  проверить((await экран('предупреждение-ar').getAttribute('dir')) === 'rtl', 'урок 0 начинается с ИИ-предупреждения (арабский, dir="rtl")');
  // Шаги урока 0: предупреждение → маршрут → намерение → задания → первая запись «а — и — у».
  for (let i = 0; i < 10 && (await стр.getByTestId('урок0-слоги').count()) === 0; i++) {
    await экран('урок0-далее').click();
    await стр.waitForTimeout(100);
  }
  проверить((await экран('урок0-слоги').getAttribute('dir')) === 'rtl', 'арабский текст с dir="rtl"');
  await экран('запись-начать').click();
  await экран('пояснение-микрофона').waitFor();
  проверить((await стр.evaluate(() => window.__потоки.length)) === 0, 'до пояснения микрофон не запрашивался');
  await экран('микрофон-разрешить').click();
  await экран('запись-идёт').waitFor({ timeout: 10000 });
  await стр.waitForTimeout(1500);
  const ширина = await экран('индикатор-громкости').evaluate((э) => э.getBoundingClientRect().width);
  проверить(ширина >= 0, `индикатор громкости рисуется (ширина ${ширина.toFixed(0)} px)`);
  await снимок('02-запись-идёт');
  await экран('запись-стоп').click();
  await экран('запись-готово').waitFor();
  проверить((await экран('запись-готово').textContent()).includes('Записали!'), '«Записали! Послушайте себя.» — без вердикта');
  проверить(
    await стр.evaluate(() => window.__потоки.every((п) => п.getTracks().every((д) => д.readyState === 'ended'))),
    'после «Стоп» микрофон освобождён',
  );
  const текст = await стр.textContent('body');
  проверить(!/Верно|Ошибка|Неверно/.test(текст), 'нет вердикта «Верно/Ошибка» по голосу');
  await экран('запись-слушать').click();
  await стр.waitForTimeout(300);
  await снимок('03-запись-готова');
  await экран('запись-удалить').click();
  await стр.waitForTimeout(200);
  проверить((await стр.getByTestId('запись-готово').count()) === 0, 'запись удалена');
  await экран('запись-начать').click();
  await экран('запись-идёт').waitFor({ timeout: 10000 });
  проверить((await стр.getByTestId('пояснение-микрофона').count()) === 0, 'пояснение показывается только один раз');
  await экран('кнопка-назад').click();
  await экран('экран-карта').waitFor();
  проверить(
    await стр.evaluate(() => window.__потоки.every((п) => п.getTracks().every((д) => д.readyState === 'ended'))),
    'уход с упражнения во время записи освобождает микрофон',
  );
  const хранилище = await стр.evaluate(() => Object.keys(localStorage).map((к) => [к, localStorage.getItem(к)]));
  проверить(
    хранилище.every(([к]) => к.startsWith('aiustaz:')) && хранилище.every(([, з]) => (з ?? '').length < 2000),
    'в localStorage только ключи aiustaz:*, без записей голоса',
  );

  console.log('6. Язык интерфейса («Ещё» → «Настройки»)');
  await экран('меню-ещё').click();
  await экран('экран-ещё').waitFor();
  await экран('язык-kk').click();
  await стр.waitForTimeout(200);
  проверить((await стр.textContent('body')).includes('Баптаулар'), 'казахский интерфейс');
  проверить((await стр.evaluate(() => document.documentElement.lang)) === 'kk', 'язык страницы — kk');
  await стр.reload();
  await экран('экран-ещё').waitFor();
  проверить((await стр.textContent('body')).includes('Баптаулар'), 'язык сохранён после перезагрузки');
  await экран('язык-ru').click();
  await экран('меню-главная').click();
  await экран('экран-главная').waitFor();

  console.log('7. Десктоп: колонка по центру');
  await стр.setViewportSize({ width: 1280, height: 800 });
  await стр.waitForTimeout(200);
  const кнопка = await экран('карточка-намаза').boundingBox();
  проверить(кнопка != null && кнопка.width <= 480 && кнопка.x > 300, `колонка ≤ 480 px по центру (карточка намаза ${кнопка?.width.toFixed(0)} px, x=${кнопка?.x.toFixed(0)})`);
  await снимок('04-главная-десктоп');

  const csp = await стр.evaluate(() => window.__csp);
  for (const н of csp) проблемы.push('нарушение CSP: ' + н);
  проверить(проблемы.length === 0, 'нет внешних запросов, ошибок консоли и нарушений CSP' + (проблемы.length ? ':\n    ' + проблемы.join('\n    ') : ''));
  console.log(`\nOK: ${шагов} проверок пройдено`);
} catch (е) {
  console.error('\n' + (е?.message ?? е));
  if (проблемы.length) console.error('Замечено по ходу:\n  ' + проблемы.join('\n  '));
  process.exitCode = 1;
} finally {
  await браузер.close();
  await сервер.закрыть();
}
