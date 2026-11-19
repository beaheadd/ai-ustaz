#!/usr/bin/env node
/**
 * Сквозной тест установки AI Ustaz на экран «Домой» (Playwright, Chromium, подмена userAgent).
 *   0. index.html: <link rel="manifest">, apple-touch-icon 180, apple-mobile-web-app-*, два theme-color; манифест —
 *      валидный JSON (scope/start_url/id в /aiustaz/, standalone), значки отдаются сервером и нужных размеров (PNG);
 *   1. Android Chrome на https://aiustaz.pro (страницы отдаёт page.route из папки сборки — без сети): на главной —
 *      одна узкая строка «Поставить AI Ustaz на телефон»; «Ещё» — первая строка «Установить приложение»; Chrome
 *      прислал beforeinstallprompt (событие подставляет тест) → кнопка «Установить» → системное окно (prompt) →
 *      «Готово»; строка на главной больше не показывается; без события — шаги ⋮ → «Установить приложение»;
 *      «Google Play — скоро» без ссылки;
 *   2. iPhone Safari: «Поделиться» → «На экран „Домой“» → «Добавить» — три шага, у каждого SVG-значок, растров нет;
 *      про отдельную память приложения на iPhone; строки на главной нет на 127.0.0.1 (только aiustaz.pro);
 *   3. Instagram (Android): «Откройте ссылку в браузере», «Скопировать ссылку» → в буфере https://aiustaz.pro/aiustaz/#/install;
 *   4. компьютер 1280×800: «Откройте на телефоне», адрес aiustaz.pro; на главной строки нет;
 *   5. https://batr.kz (эмуляция): «Ставьте с aiustaz.pro», ссылка на https://aiustaz.pro/aiustaz/#/install; в DOM нет
 *      <link rel="manifest"> (Chrome не предлагает ставить с batr.kz);
 *   6. запуск как приложение (?source=pwa) — «Приложение уже установлено», в «Ещё» — «Уже установлено»;
 *   7. казахский (черновик): заголовок «Қолданбаны орнату», шаги на казахском;
 * и всё время: ни ошибок в консоли, ни запросов на другой адрес, ни нарушений CSP, ни горизонтальной прокрутки.
 * Снимки 412×800 (ru и kk, светлая): Android, iPhone, Instagram — SHOTS_INSTALL=папка (или SCREENSHOTS).
 *
 * Запуск (из app/, после сборки): node scripts/e2e-install.mjs  (сервер serve-test.mjs на app/dist или DIST=папка)
 * Из scripts/e2e.mjs: установкаСквозной(браузер, адрес) (E2E_INSTALL=0 — пропустить).
 * Решение владельца 19.11.2026: «TWA приложение для загрузки из сайта и объяснение в APPLE, чтобы добавить на рабочий стол».
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЗАГЛУШКА_BATR, запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const КЛЮЧ = 'aiustaz:progress.v1';
const АДРЕС = 'https://aiustaz.pro/aiustaz/#/install';
const прогресс = (язык) => ({ версия: 1, язык, предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки: {}, дниЗанятий: [] });
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  instagram:
    'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Instagram 356.0.0.41.101 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546B; a54x; s5e8835; ru_RU; 659203856)',
};
const ТЕЛЕФОН = { viewport: { width: 412, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

/**
 * @param браузер Chromium из Playwright
 * @param база адрес тестового сервера (http://127.0.0.1:порт)
 * @returns число пройденных проверок; бросает Error при первой неудаче
 */
export async function установкаСквозной(браузер, база, { снимки = process.env.SHOTS_INSTALL ?? process.env.SCREENSHOTS ?? null, папка = process.env.DIST ?? path.join(корень, 'dist') } = {}) {
  let проверок = 0;
  if (снимки) fs.mkdirSync(снимки, { recursive: true });
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[установка] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };

  /** Контекст: профиль, язык, адрес сайта (база теста, https://aiustaz.pro или https://batr.kz — через page.route). */
  async function открыть({ профиль, язык = 'ru', сайт = база, путь = '#/', событие = false, разрешения = [] }) {
    const контекст = await браузер.newContext({ ...профиль, locale: 'ru-RU', colorScheme: 'light', permissions: разрешения });
    await контекст.addInitScript(
      ({ ключ, значение, событие }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        try {
          if (!localStorage.getItem(ключ)) localStorage.setItem(ключ, JSON.stringify(значение));
        } catch {}
        window.__окно = 0;
        if (событие) {
          // Как Chrome: beforeinstallprompt вскоре после загрузки; prompt() — системное окно, ответ «accepted».
          window.addEventListener('load', () =>
            setTimeout(() => {
              const е = new Event('beforeinstallprompt', { cancelable: true });
              е.prompt = async () => {
                window.__окно += 1;
              };
              е.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
              window.dispatchEvent(е);
              window.__отменено = е.defaultPrevented;
            }, 50),
          );
        }
      },
      { ключ: КЛЮЧ, значение: прогресс(язык), событие },
    );
    if (сайт !== база) {
      await контекст.route(сайт + '/**', async (маршрут) => {
        const п = decodeURIComponent(new URL(маршрут.request().url()).pathname);
        const ф = п.startsWith('/aiustaz/') ? path.resolve(папка, '.' + п.slice('/aiustaz'.length)) : null;
        if (ф && ф.startsWith(path.resolve(папка) + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
          return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
        return маршрут.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ЗАГЛУШКА_BATR });
      });
    }
    const стр = await контекст.newPage();
    const проблемы = [];
    стр.on('request', (з) => {
      const u = з.url();
      if (!u.startsWith(сайт + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
    });
    стр.on('console', (с) => {
      if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
    });
    стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
    await стр.goto(сайт + '/aiustaz/index.html' + путь);
    return { контекст, стр, проблемы };
  }
  const ждать = (стр, id, мс = 15000) => стр.getByTestId(id).first().waitFor({ state: 'visible', timeout: мс });
  const есть = async (стр, id) => (await стр.getByTestId(id).count()) > 0;
  const текст = (стр, id) => стр.getByTestId(id).first().innerText();
  const снимок = async (стр, имя) => {
    if (!снимки) return;
    await стр.waitForTimeout(250);
    await стр.screenshot({ path: path.join(снимки, `установка-${имя}.png`) });
  };
  const безПроблем = async (стр, проблемы, где) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
    const растры = await стр.evaluate(() => [...document.querySelectorAll('img')].map((и) => и.src).filter((s) => !s.startsWith('data:image/svg')));
    if (растры.length) проблемы.push('растровые картинки на экране: ' + растры.join(', '));
    проверить(проблемы.length === 0, где + ': без ошибок, чужих запросов, CSP, растров и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const вЕщё = async (стр) => {
    await стр.getByTestId('меню-ещё').first().click();
    await ждать(стр, 'экран-ещё');
  };

  // ── 0. index.html, манифест, значки ──
  console.log('0. index.html: manifest, apple-touch-icon; манифест и значки');
  {
    const html = await (await fetch(база + '/aiustaz/index.html')).text();
    const манифестАдрес = html.match(/<link rel="manifest" href="([^"]+)"/)?.[1];
    const apple = html.match(/<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)"/)?.[1];
    проверить(!!манифестАдрес && /^\/aiustaz\/pwa\/manifest\.[0-9a-f]{32}\.json$/.test(манифестАдрес), `index.html: <link rel="manifest" href="${манифестАдрес}">`);
    проверить(!!apple && /^\/aiustaz\/pwa\/apple-touch-icon-180\.[0-9a-f]{32}\.png$/.test(apple), 'index.html: apple-touch-icon 180×180 из pwa/');
    for (const м of ['<meta name="apple-mobile-web-app-capable" content="yes"', '<meta name="apple-mobile-web-app-title" content="AI Ustaz"', '<meta name="apple-mobile-web-app-status-bar-style" content="default"', '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F2E8"', '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0C1715"'])
      проверить(html.includes(м), 'index.html: ' + м.replace('<meta ', ''));
    const ман = await (await fetch(база + манифестАдрес)).json();
    проверить(ман.scope === '/aiustaz/' && ман.id === '/aiustaz/' && ман.start_url === '/aiustaz/?source=pwa' && ман.display === 'standalone' && ман.name === 'AI Ustaz', 'манифест: scope/id /aiustaz/, start_url ?source=pwa, standalone, «AI Ustaz»');
    const размерPNG = async (адрес) => {
      const о = await fetch(база + адрес);
      const б = Buffer.from(await о.arrayBuffer());
      return { тип: о.headers.get('content-type'), png: б.subarray(1, 4).toString() === 'PNG', ш: б.readUInt32BE(16), в: б.readUInt32BE(20) };
    };
    for (const и of ман.icons) {
      const р = await размерPNG(и.src);
      проверить(р.png && р.тип === 'image/png' && `${р.ш}x${р.в}` === и.sizes, `значок ${и.purpose} ${и.sizes}: PNG ${р.ш}×${р.в}`);
    }
    проверить(['any', 'maskable', 'monochrome'].every((п) => ман.icons.some((и) => и.purpose === п)) && ман.icons.some((и) => и.sizes === '192x192'), 'манифест: значки 192 и 512, any + maskable + monochrome');
    const а = await размерPNG(apple);
    проверить(а.png && а.ш === 180 && а.в === 180, 'apple-touch-icon: PNG 180×180');
  }

  // ── 1. Android Chrome на aiustaz.pro ──
  console.log('1. Android Chrome, https://aiustaz.pro: строка на главной, «Ещё», кнопка «Установить»');
  {
    const сайт = 'https://aiustaz.pro';
    const { контекст, стр, проблемы } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.android }, сайт, событие: true });
    await ждать(стр, 'экран-главная');
    await ждать(стр, 'главная-установка');
    проверить((await текст(стр, 'главная-установка')).includes('Поставить AI Ustaz на телефон'), 'главная (aiustaz.pro, Android): одна узкая строка «Поставить AI Ustaz на телефон»');
    const высота = await стр.getByTestId('главная-установка').first().evaluate((э) => э.getBoundingClientRect().height);
    проверить(высота <= 64, `строка на главной узкая: ${Math.round(высота)} px`);
    await стр.waitForFunction(() => window.__отменено !== undefined);
    проверить(await стр.evaluate(() => window.__отменено === true), 'beforeinstallprompt перехвачен (preventDefault — без всплывающей полоски Chrome)');
    await вЕщё(стр);
    const первая = await стр.evaluate(() => {
      const экран = document.querySelector('[data-testid="экран-ещё"]');
      return [...экран.querySelectorAll('[data-testid^="ещё-"]')][0]?.getAttribute('data-testid');
    });
    проверить(первая === 'ещё-установка', `«Ещё»: первая строка — «Установить приложение» (${первая})`);
    await стр.getByTestId('ещё-установка').first().click();
    await ждать(стр, 'экран-установка');
    проверить((await стр.evaluate(() => location.hash)) === '#/install', 'адрес экрана — #/install');
    await ждать(стр, 'установка-установить');
    проверить(await есть(стр, 'установка-сценарий-кнопка'), 'Android + beforeinstallprompt → кнопка «Установить»');
    проверить(await есть(стр, 'установка-play'), '«Google Play — скоро»');
    проверить((await стр.locator('[data-testid="установка-play"] a').count()) === 0, 'Google Play — без ссылки');
    await снимок(стр, 'android-ru');
    await стр.getByTestId('установка-установить').first().click();
    await ждать(стр, 'установка-итог');
    проверить((await стр.evaluate(() => window.__окно)) === 1, 'нажатие «Установить» → системное окно Chrome (prompt) один раз');
    проверить((await текст(стр, 'установка-итог')).includes('Готово'), 'ответ «Установить» → «Готово: значок появится на экране»');
    await безПроблем(стр, проблемы, 'Android, установка');
    await стр.goto(сайт + '/aiustaz/index.html#/');
    await ждать(стр, 'экран-главная');
    await стр.waitForTimeout(400);
    проверить(!(await есть(стр, 'главная-установка')), 'после экрана установки строки на главной больше нет (одноразовая)');
    await контекст.close();
  }
  {
    const сайт = 'https://aiustaz.pro';
    const { контекст, стр, проблемы } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.android }, сайт });
    await ждать(стр, 'главная-установка');
    await стр.getByTestId('главная-установка-скрыть').first().click();
    проверить(!(await есть(стр, 'главная-установка')), 'строка на главной: «×» скрывает её');
    await стр.reload();
    await ждать(стр, 'экран-главная');
    await стр.waitForTimeout(400);
    проверить(!(await есть(стр, 'главная-установка')), 'скрытая строка не возвращается после перезагрузки');
    await стр.goto(сайт + '/aiustaz/index.html#/install');
    await ждать(стр, 'установка-android');
    проверить(await есть(стр, 'установка-сценарий-android-меню'), 'Android без beforeinstallprompt → шаги меню');
    проверить((await текст(стр, 'установка-шаги')).includes('⋮') && (await текст(стр, 'установка-шаги')).includes('Установить приложение'), 'шаги: ⋮ → «Установить приложение»');
    проверить((await стр.locator('[data-testid="установка-шаги"] svg').count()) >= 3, 'у каждого шага — SVG-значок');
    await безПроблем(стр, проблемы, 'Android, без события');
    await контекст.close();
  }

  // ── 2. iPhone Safari ──
  console.log('2. iPhone Safari: «Поделиться» → «На экран „Домой“» → «Добавить»');
  for (const язык of ['ru', 'kk']) {
    const { контекст, стр, проблемы } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.iphone }, язык, путь: '#/install' });
    await ждать(стр, 'установка-ios');
    проверить(await есть(стр, 'установка-сценарий-ios-safari'), `iPhone Safari (${язык}) → пошаговое объяснение`);
    const шаги = await текст(стр, 'установка-шаги');
    if (язык === 'ru') проверить(шаги.includes('«Поделиться»') && шаги.includes('На экран „Домой“') && шаги.includes('«Добавить»'), 'три шага: «Поделиться» → «На экран „Домой“» → «Добавить»');
    else проверить(шаги.includes('«Бөлісу»') && шаги.includes('«Қосу»') && (await стр.title()).includes('Қолданбаны орнату'), 'kk (черновик): «Бөлісу» → «„Үй“ экранына» → «Қосу», заголовок «Қолданбаны орнату»');
    for (let i = 1; i <= 3; i++) проверить((await стр.locator(`[data-testid="установка-шаг-${i}"] svg`).count()) === 1, `шаг ${i}: нарисованный SVG-значок (${язык})`);
    проверить(await есть(стр, 'установка-ios-хранилище'), 'про отдельную память приложения на iPhone');
    проверить(!(await есть(стр, 'установка-play')), 'на iPhone строки Google Play нет');
    await снимок(стр, 'iphone-' + язык);
    await безПроблем(стр, проблемы, 'iPhone Safari ' + язык);
    if (язык === 'ru') {
      await стр.goto(база + '/aiustaz/index.html#/');
      await ждать(стр, 'экран-главная');
      await стр.waitForTimeout(400);
      проверить(!(await есть(стр, 'главная-установка')), 'на 127.0.0.1 (не aiustaz.pro) строки на главной нет');
    }
    await контекст.close();
  }

  // ── Снимки Android kk ──
  if (снимки) {
    const { контекст, стр } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.android }, язык: 'kk', путь: '#/install', событие: true });
    await ждать(стр, 'установка-установить');
    await снимок(стр, 'android-kk');
    await контекст.close();
  }

  // ── 3. Instagram ──
  console.log('3. Instagram (Android): открыть в браузере, скопировать ссылку');
  for (const язык of ['ru', 'kk']) {
    const { контекст, стр, проблемы } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.instagram }, язык, путь: '#/install', разрешения: ['clipboard-read', 'clipboard-write'] });
    await ждать(стр, 'установка-встроенный');
    const т = await текст(стр, 'установка-встроенный');
    проверить(т.includes('Instagram') && (язык === 'ru' ? т.includes('Chrome') && т.includes('Safari') : т.includes('Chrome')), `Instagram (${язык}): «откройте в Chrome/Safari»`);
    проверить((await текст(стр, 'установка-адрес')) === АДРЕС, 'адрес для копирования — ' + АДРЕС);
    await снимок(стр, 'instagram-' + язык);
    if (язык === 'ru') {
      await стр.getByTestId('установка-скопировать').first().click();
      await ждать(стр, 'установка-скопировано');
      проверить((await текст(стр, 'установка-скопировано')).includes('скопирована'), '«Скопировать ссылку» → «Ссылка скопирована»');
      проверить((await стр.evaluate(() => navigator.clipboard.readText())) === АДРЕС, 'в буфере обмена — ' + АДРЕС);
    }
    await безПроблем(стр, проблемы, 'Instagram ' + язык);
    await контекст.close();
  }

  // ── 4. Компьютер ──
  console.log('4. Компьютер: «Откройте на телефоне»');
  {
    const { контекст, стр, проблемы } = await открыть({ профиль: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, сайт: 'https://aiustaz.pro', путь: '#/install' });
    await ждать(стр, 'установка-компьютер');
    проверить((await текст(стр, 'установка-компьютер')).includes('на телефоне') && (await текст(стр, 'установка-адрес')).includes('aiustaz.pro'), 'компьютер: «Откройте на телефоне» и адрес aiustaz.pro');
    await стр.goto('https://aiustaz.pro/aiustaz/index.html#/');
    await ждать(стр, 'экран-главная');
    await стр.waitForTimeout(400);
    проверить(!(await есть(стр, 'главная-установка')), 'на компьютере строки на главной нет');
    await безПроблем(стр, проблемы, 'компьютер');
    await контекст.close();
  }

  // ── 5. batr.kz ──
  console.log('5. https://batr.kz (эмуляция): ставить с aiustaz.pro');
  {
    const { контекст, стр, проблемы } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.android }, сайт: 'https://batr.kz', путь: '#/install', событие: true });
    await ждать(стр, 'установка-batr');
    проверить((await текст(стр, 'установка-batr')).includes('aiustaz.pro') && (await текст(стр, 'установка-batr')).includes('проверка голосом'), 'batr.kz: «Ставьте с aiustaz.pro — там проверка голосом»');
    const ссылка = await стр.getByTestId('установка-открыть-сайт').first().evaluate((э) => (э.closest('a') ?? э).getAttribute('href'));
    проверить(ссылка === АДРЕС, 'ссылка «Открыть aiustaz.pro» → ' + АДРЕС);
    проверить(!(await есть(стр, 'установка-установить')), 'на batr.kz кнопки «Установить» нет');
    проверить((await стр.locator('link[rel="manifest"]').count()) === 0, 'на batr.kz <link rel="manifest"> убран из страницы (Chrome не предложит установку)');
    await безПроблем(стр, проблемы, 'batr.kz');
    await контекст.close();
  }

  // ── 6. Уже установлено ──
  console.log('6. Запуск как приложение (?source=pwa)');
  {
    const { контекст, стр, проблемы } = await открыть({ профиль: { ...ТЕЛЕФОН, userAgent: UA.android }, путь: '?source=pwa#/install' });
    await ждать(стр, 'установка-установлено');
    проверить((await текст(стр, 'установка-установлено')).includes('Приложение уже установлено'), '?source=pwa → «Приложение уже установлено»');
    await вЕщё(стр);
    проверить((await текст(стр, 'ещё-установка')).includes('Уже установлено'), '«Ещё»: «Уже установлено на этом телефоне»');
    await безПроблем(стр, проблемы, 'установлено');
    await контекст.close();
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch();
  try {
    const n = await установкаСквозной(браузер, сервер.адрес);
    console.log(`OK: установка — ${n} проверок`);
  } catch (е) {
    console.error(е?.stack ?? е);
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
