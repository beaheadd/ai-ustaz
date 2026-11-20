#!/usr/bin/env node
/**
 * Сквозной тест уведомлений о времени намаза (Playwright, Chromium). Владелец 20.11.2026: «правильные, красивые
 * уведомления время намаза приходило к клиенту». docs/дизайн/07-уведомления.md.
 *   1. https://aiustaz.pro (страницы отдаёт page.route из папки сборки; сервер /api/push/ подменён; PushManager,
 *      Notification и service worker подменены — без сети и FCM), Android 412×800, ru:
 *      «Ещё» → «Уведомления о намазе» → переключатель → СНАЧАЛА наше пояснение (координаты не уходят, где хранится,
 *      как отключить), системного запроса и запросов к /api/push/ до «Разрешить» нет → «Разрешить» → один запрос
 *      разрешения → worker /aiustaz/push-sw.js в области /aiustaz/ → ключ GET /api/push/key → subscribe с этим ключом
 *      (userVisibleOnly) → POST /api/push/subscribe: только subscription, lang, city, items; город строкой, координат
 *      нет; 30 дней, восхода нет, время = момент по UTC+5; «Проверить уведомление» → POST /api/push/test;
 *      выключили Аср / «за 10 мин» — новое расписание; колокольчик на главной (включено) не меняет высоту карточки;
 *      открытие приложения заново — расписание отправляется снова; выключение — отписка в браузере,
 *      POST /api/push/unsubscribe, worker снят;
 *   2. отказ в разрешении — инструкция, как включить в настройках; подписки и запросов на сервер нет;
 *   3. https://batr.kz — в «Ещё» вместо строки пояснение «уведомления — на aiustaz.pro», экран — ссылка на aiustaz.pro,
 *      колокольчика нет, worker не регистрируется, запросов к /api/push/ нет;
 *   4. iPhone Safari не с экрана «Домой» — объяснение и кнопка «Как добавить на экран „Домой“» → #/install;
 *   5. казахский (черновик): заголовок «Намаз хабарландырулары»;
 *   6. настоящий service worker (полный Chromium, если есть): регистрация /aiustaz/push-sw.js под CSP сборки,
 *      push через DevTools → уведомление «Аср · 14:39» с эмблемой, монохромным значком, тегом и двумя кнопками.
 * И всё время: ни ошибок в консоли, ни запросов на другой адрес, ни нарушений CSP, ни горизонтальной прокрутки.
 * Снимки 412×800 (ru и kk) — SHOTS_NOTIFY=папка (или SCREENSHOTS).
 * Запуск (из app/, после сборки): node scripts/e2e-notify.mjs; из scripts/e2e.mjs — уведомленияСквозной(браузер)
 * (E2E_NOTIFY=0 — пропустить).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЗАГЛУШКА_BATR } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const КЛЮЧ = 'aiustaz:progress.v1';
const прогресс = (язык) => ({ версия: 1, язык, предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки: {}, дниЗанятий: [] });
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
};
const ТЕЛЕФОН = { viewport: { width: 412, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
/** Публичный VAPID-ключ для теста: несжатая точка (65 байт, 0x04…), base64url. */
const КЛЮЧ_VAPID = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const ДЕНЬ = 86_400_000;

/** Подмена Notification, PushManager и service worker (состояние — в sessionStorage, переживает перезагрузку). */
function подменаPush({ ответ }) {
  const ss = window.sessionStorage;
  const читать = (к, д) => {
    try {
      return JSON.parse(ss.getItem('__e2e_' + к)) ?? д;
    } catch {
      return д;
    }
  };
  const писать = (к, з) => ss.setItem('__e2e_' + к, JSON.stringify(з));
  window.__push = { запросов: 0, регистраций: [], подписок: 0, отписок: 0, снятий: 0, ключ: null, userVisibleOnly: null };
  class Уведомление {
    static get permission() {
      return читать('разрешение', 'default');
    }
    static async requestPermission() {
      window.__push.запросов += 1;
      писать('разрешение', ответ);
      return ответ;
    }
  }
  window.Notification = Уведомление;
  window.PushManager = function PushManager() {};
  const сделатьПодписку = (адрес, ключ) => ({
    endpoint: адрес,
    options: { applicationServerKey: new Uint8Array(ключ).buffer },
    toJSON() {
      return { endpoint: адрес, expirationTime: null, keys: { p256dh: 'BPq' + 'x'.repeat(84), auth: 'a'.repeat(22) } };
    },
    async unsubscribe() {
      window.__push.отписок += 1;
      писать('подписка', null);
      return true;
    },
  });
  const pushManager = {
    async getSubscription() {
      const п = читать('подписка', null);
      return п ? сделатьПодписку(п.адрес, п.ключ) : null;
    },
    async subscribe(о) {
      window.__push.подписок += 1;
      const ключ = Array.from(new Uint8Array(о.applicationServerKey));
      window.__push.ключ = ключ;
      window.__push.userVisibleOnly = о.userVisibleOnly;
      const адрес = 'https://fcm.googleapis.com/fcm/send/e2e-' + Date.now();
      писать('подписка', { адрес, ключ });
      return сделатьПодписку(адрес, ключ);
    },
  };
  const регистрация = () =>
    читать('рег', null)
      ? {
          scope: location.origin + '/aiustaz/',
          active: { scriptURL: location.origin + '/aiustaz/push-sw.js' },
          pushManager,
          async unregister() {
            window.__push.снятий += 1;
            писать('рег', null);
            return true;
          },
        }
      : undefined;
  const sw = {
    async register(адрес, о) {
      window.__push.регистраций.push([адрес, о?.scope ?? null]);
      писать('рег', true);
      return регистрация();
    },
    async getRegistration() {
      return регистрация();
    },
    get ready() {
      return new Promise((готово) => {
        const т = setInterval(() => {
          const р = регистрация();
          if (р) {
            clearInterval(т);
            готово(р);
          }
        }, 20);
      });
    },
    controller: null,
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(Navigator.prototype, 'serviceWorker', { configurable: true, get: () => sw });
}

/**
 * @returns число пройденных проверок; бросает Error при первой неудаче
 */
export async function уведомленияСквозной(браузер, { снимки = process.env.SHOTS_NOTIFY ?? process.env.SCREENSHOTS ?? null, папка = process.env.DIST ?? path.join(корень, 'dist') } = {}) {
  let проверок = 0;
  if (снимки) fs.mkdirSync(снимки, { recursive: true });
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[уведомления] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };

  async function открыть({ сайт, профиль = { ...ТЕЛЕФОН, userAgent: UA.android }, язык = 'ru', путь = '#/', ответ = 'granted', подменить = true }) {
    const контекст = await браузер.newContext({ ...профиль, locale: 'ru-RU', colorScheme: 'light' });
    await контекст.addInitScript(
      ({ ключ, значение }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        try {
          if (!localStorage.getItem(ключ)) localStorage.setItem(ключ, JSON.stringify(значение));
        } catch {}
      },
      { ключ: КЛЮЧ, значение: прогресс(язык) },
    );
    if (подменить) await контекст.addInitScript(подменаPush, { ответ });
    const api = [];
    await контекст.route(сайт + '/**', async (маршрут) => {
      const запрос = маршрут.request();
      const п = decodeURIComponent(new URL(запрос.url()).pathname);
      if (п.startsWith('/api/push/')) {
        let тело = null;
        try {
          тело = запрос.postData() ? JSON.parse(запрос.postData()) : null;
        } catch {
          тело = 'не JSON';
        }
        api.push({ путь: п, метод: запрос.method(), тело, заголовки: запрос.headers() });
        if (п === '/api/push/key') return маршрут.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: КЛЮЧ_VAPID }) });
        return маршрут.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ок: true }) });
      }
      const ф = п.startsWith('/aiustaz/') ? path.resolve(папка, '.' + п.slice('/aiustaz'.length)) : null;
      if (ф && ф.startsWith(path.resolve(папка) + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
        return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
      return маршрут.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ЗАГЛУШКА_BATR });
    });
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
    return { контекст, стр, проблемы, api };
  }
  const ждать = (стр, id, мс = 15000) => стр.getByTestId(id).first().waitFor({ state: 'visible', timeout: мс });
  const есть = async (стр, id) => (await стр.getByTestId(id).count()) > 0;
  const текст = (стр, id) => стр.getByTestId(id).first().innerText();
  const снимок = async (стр, имя, весь = false) => {
    if (!снимки) return;
    await стр.waitForTimeout(250);
    await стр.screenshot({ path: path.join(снимки, `уведомления-${имя}.png`), fullPage: весь });
  };
  const безПроблем = async (стр, проблемы, где) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
    проверить(проблемы.length === 0, где + ': без ошибок, чужих запросов, CSP и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const push = (стр) => стр.evaluate(() => ({ ...window.__push }));
  const подписки = (api) => api.filter((з) => з.путь === '/api/push/subscribe');
  const ждатьЗапросов = async (стр, api, путь, n, мс = 8000) => {
    const до = Date.now() + мс;
    while (api.filter((з) => з.путь === путь).length < n && Date.now() < до) await стр.waitForTimeout(100);
    return api.filter((з) => з.путь === путь).length >= n;
  };
  const чч_мм = (мс) => new Date(мс + 5 * 3_600_000).toISOString().slice(11, 16);

  /** Проверка тела подписки: только нужные поля, без координат, правило времени сервера. */
  function проверитьТело(тело, { город, язык, без = [], заранее = 0 }, где) {
    проверить(JSON.stringify(Object.keys(тело).sort()) === JSON.stringify(['city', 'items', 'lang', 'subscription']), `${где}: в теле только subscription, lang, city, items`);
    проверить(тело.city === город && тело.lang === язык, `${где}: город строкой «${тело.city}», язык ${тело.lang}`);
    проверить(/^https:\/\/fcm\.googleapis\.com\//.test(тело.subscription.endpoint) && тело.subscription.keys?.p256dh && тело.subscription.keys?.auth, `${где}: подписка браузера (endpoint push-сервиса и ключи)`);
    const json = JSON.stringify(тело);
    проверить(!/51\.1|71\.4|43\.2|76\.9|lat|lon|широт|долгот|coord/i.test(json), `${где}: координат в теле нет`);
    const сейчас = Date.now();
    const п = тело.items;
    // off — смещение пояса места (владелец 20.11.2026: время намаза для любой страны); у мест РК — 300 (UTC+5).
    const плохие = п.filter((х) => Object.keys(х).some((к) => !['at', 'key', 'time', 'before', 'next', 'off'].includes(к)) || х.off !== 300 || х.time !== чч_мм(х.at + х.before * 60_000) || х.at <= сейчас - 120_000 || х.at > сейчас + 30 * ДЕНЬ + 60_000);
    проверить(плохие.length === 0, `${где}: ${п.length} пунктов — поля at/key/time/before/next/off, off = 300 и время = момент по UTC+5, только будущее и не дальше 30 дней` + (плохие.length ? ' — плохие: ' + JSON.stringify(плохие.slice(0, 2)) : ''));
    проверить(!п.some((х) => х.key === 'sunrise'), `${где}: восхода нет (выключен по умолчанию)`);
    for (const к of без) проверить(!п.some((х) => х.key === к), `${где}: ${к} выключен — его нет`);
    const напоминаний = п.filter((х) => х.before > 0);
    if (заранее) проверить(напоминаний.length > 0 && напоминаний.every((х) => х.before === заранее), `${где}: напоминания за ${заранее} мин (${напоминаний.length})`);
    else проверить(напоминаний.length === 0, `${где}: без напоминаний заранее`);
    const намазов = 5 - без.length;
    проверить(п.filter((х) => !х.before).length >= намазов * 29 && п.filter((х) => !х.before).length <= намазов * 30 + 1, `${где}: ${намазов} намазов × 30 дней (${п.filter((х) => !х.before).length})`);
  }

  // ── 1. aiustaz.pro: включение, расписание, проверка, настройки, главная, повторное открытие, выключение ──
  console.log('1. aiustaz.pro, Android: пояснение → разрешение → подписка → расписание без координат → выключение');
  {
    const сайт = 'https://aiustaz.pro';
    const { контекст, стр, проблемы, api } = await открыть({ сайт, путь: '#/more' });
    await ждать(стр, 'экран-ещё');
    await ждать(стр, 'ещё-уведомления');
    проверить((await текст(стр, 'ещё-уведомления')).includes('Уведомления о намазе') && (await текст(стр, 'ещё-уведомления')).includes('Выключены'), '«Ещё» → Настройки: строка «Уведомления о намазе · Выключены»');
    проверить(!(await есть(стр, 'ещё-уведомления-batr')), 'на aiustaz.pro нет пояснения «уведомления — на aiustaz.pro»');
    await стр.getByTestId('ещё-уведомления').first().click();
    await ждать(стр, 'экран-уведомления');
    проверить((await стр.evaluate(() => location.hash)) === '#/notifications', 'адрес экрана — #/notifications');
    проверить((await стр.title()).includes('Уведомления о намазе'), 'заголовок «Уведомления о намазе»');
    проверить((await стр.getByTestId('уведомления-переключатель').first().getAttribute('aria-checked')) === 'false', 'переключатель — role=switch, выключен');
    for (const к of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) проверить((await стр.getByTestId('уведомления-намаз-' + к).first().getAttribute('aria-checked')) === 'true', `«${к}» выбран по умолчанию`);
    проверить((await стр.getByTestId('уведомления-намаз-sunrise').first().getAttribute('aria-checked')) === 'false', 'восход по умолчанию выключен');
    await снимок(стр, 'выключено-ru', true);
    await стр.getByTestId('уведомления-переключатель').first().click();
    await ждать(стр, 'уведомления-пояснение');
    const пояснение = await текст(стр, 'уведомления-пояснение');
    проверить(/Координаты не уходят/.test(пояснение) && /Казахстане/.test(пояснение) && /удалятся с сервера сразу/.test(пояснение) && /Аср · 14:39/.test(пояснение), 'пояснение до системного запроса: что придёт, координаты не уходят, где хранится, как отключить');
    проверить((await push(стр)).запросов === 0 && api.length === 0, 'до «Разрешить» — ни системного запроса, ни запросов к серверу');
    await снимок(стр, 'пояснение-ru');
    await стр.getByTestId('уведомления-разрешить').first().click();
    await ждать(стр, 'уведомления-итог');
    проверить((await текст(стр, 'уведомления-итог')).includes('Уведомления включены'), 'итог: «Уведомления включены. Расписание на 30 дней отправлено.»');
    const п1 = await push(стр);
    проверить(п1.запросов === 1, 'системный запрос разрешения — ровно один, по нажатию');
    проверить(JSON.stringify(п1.регистраций) === JSON.stringify([['/aiustaz/push-sw.js', '/aiustaz/']]), `service worker: /aiustaz/push-sw.js, область /aiustaz/ (${JSON.stringify(п1.регистраций)})`);
    проверить(api[0]?.путь === '/api/push/key' && api[0].метод === 'GET', 'публичный ключ — GET /api/push/key (свой домен)');
    проверить(Buffer.from(п1.ключ).toString('base64url') === КЛЮЧ_VAPID && п1.userVisibleOnly === true, 'PushManager.subscribe: ключ сервера, userVisibleOnly');
    const с1 = подписки(api);
    проверить(с1.length === 1 && с1[0].метод === 'POST', 'расписание — один POST /api/push/subscribe');
    проверить(!с1[0].заголовки.cookie && !с1[0].заголовки.referer, 'без cookie и Referer');
    проверитьТело(с1[0].тело, { город: 'Астана', язык: 'ru' }, 'подписка');
    проверить((await стр.getByTestId('уведомления-переключатель').first().getAttribute('aria-checked')) === 'true', 'переключатель включён');
    проверить((await текст(стр, 'уведомления-состояние')).includes('Расписание на 30 дней — до'), 'строка состояния «Расписание на 30 дней — до …»');
    await снимок(стр, 'включено-ru', true);
    await снимок(стр, 'включено-ru-экран');

    await стр.getByTestId('уведомления-проверить').first().click();
    await ждать(стр, 'уведомления-итог');
    await стр.waitForFunction(() => document.querySelector('[data-testid="уведомления-итог"]')?.textContent.includes('Отправили'));
    const тест = api.filter((з) => з.путь === '/api/push/test');
    проверить(тест.length === 1 && тест[0].тело.endpoint === с1[0].тело.subscription.endpoint && Object.keys(тест[0].тело).length === 1, '«Проверить уведомление» → POST /api/push/test только с адресом подписки → «Отправили»');

    await стр.getByTestId('уведомления-намаз-asr').first().click();
    проверить(await ждатьЗапросов(стр, api, '/api/push/subscribe', 2), 'выключили Аср — новое расписание отправлено само');
    проверитьТело(подписки(api)[1].тело, { город: 'Астана', язык: 'ru', без: ['asr'] }, 'без асра');
    await стр.getByTestId('заранее-10').first().click();
    проверить(await ждатьЗапросов(стр, api, '/api/push/subscribe', 3), '«Напомнить за 10 мин» — новое расписание');
    проверитьТело(подписки(api)[2].тело, { город: 'Астана', язык: 'ru', без: ['asr'], заранее: 10 }, 'за 10 мин');
    await стр.getByTestId('уведомления-намаз-asr').first().click();
    await ждатьЗапросов(стр, api, '/api/push/subscribe', 4);
    await стр.getByTestId('заранее-0').first().click();
    await ждатьЗапросов(стр, api, '/api/push/subscribe', 5);
    await безПроблем(стр, проблемы, 'aiustaz.pro, включение');

    // Главная: колокольчик у следующего намаза (включено) — высоту карточки не меняет.
    await стр.goto(сайт + '/aiustaz/index.html#/');
    await стр.reload(); // новое открытие приложения (смена только hash — не перезагрузка)
    await ждать(стр, 'карточка-намаза');
    проверить(await ждатьЗапросов(стр, api, '/api/push/subscribe', 6), 'открытие приложения заново — расписание отправлено снова (обновление при каждом открытии)');
    проверитьТело(подписки(api)[5].тело, { город: 'Астана', язык: 'ru' }, 'при открытии');
    await ждать(стр, 'намаз-колокол');
    const колокол = стр.getByTestId('намаз-колокол').first();
    проверить(/включены/.test((await колокол.getAttribute('aria-label')) ?? ''), `колокольчик: «${await колокол.getAttribute('aria-label')}»`);
    const к = await колокол.boundingBox();
    проверить(к.width >= 48 && к.height >= 48, `цель касания колокольчика ${к.width}×${к.height} ≥ 48`);
    const высотаС = await стр.getByTestId('карточка-намаза').first().evaluate((э) => э.getBoundingClientRect().height);
    // Та же главная без колокольчика (свой адрес теста не aiustaz.pro): высота карточки — та же.
    const { контекст: к2, стр: с2 } = await открыть({ сайт: 'https://example.test', путь: '#/' });
    await ждать(с2, 'карточка-намаза');
    await с2.waitForTimeout(300);
    проверить(!(await есть(с2, 'намаз-колокол')), 'не на aiustaz.pro колокольчика нет');
    const высотаБез = await с2.getByTestId('карточка-намаза').first().evaluate((э) => э.getBoundingClientRect().height);
    await к2.close();
    проверить(Math.abs(высотаС - высотаБез) < 0.5, `колокольчик не меняет высоту карточки намаза (${высотаС.toFixed(1)} = ${высотаБез.toFixed(1)} px)`);
    const текстРяда = await стр.getByTestId('намаз-отсчёт').first().boundingBox();
    проверить(текстРяда.x + текстРяда.width <= к.x + 12 || текстРяда.y >= к.y + к.height - 8, 'колокольчик не наезжает на отсчёт');
    await снимок(стр, 'главная-колокол');
    await колокол.click();
    await ждать(стр, 'экран-уведомления');
    проверить(true, 'колокольчик ведёт на #/notifications');

    await стр.getByTestId('уведомления-переключатель').first().click();
    await ждать(стр, 'уведомления-итог');
    await стр.waitForFunction(() => document.querySelector('[data-testid="уведомления-итог"]')?.textContent.includes('выключены'));
    const п2 = await push(стр);
    const отписка = api.filter((з) => з.путь === '/api/push/unsubscribe');
    проверить(п2.отписок === 1 && п2.снятий === 1, 'выключение: отписка в браузере и worker снят');
    проверить(отписка.length === 1 && отписка[0].тело.endpoint?.startsWith('https://fcm.googleapis.com/') && Object.keys(отписка[0].тело).length === 1, 'POST /api/push/unsubscribe — сервер удаляет подписку и расписание сразу');
    проверить((await текст(стр, 'уведомления-итог')).includes('Подписка и расписание удалены с сервера'), 'итог: «Подписка и расписание удалены с сервера»');
    const всего = подписки(api).length;
    await стр.reload();
    await ждать(стр, 'экран-уведомления');
    await стр.waitForTimeout(2000);
    проверить(подписки(api).length === всего, 'выключено — при открытии расписание не отправляется');
    const хранилище = await стр.evaluate(() => Object.entries(localStorage).filter(([к]) => к.includes('notify')));
    проверить(хранилище.length === 1 && !/endpoint|fcm|51\.1|71\.4/.test(хранилище[0][1]), 'на устройстве — только настройки (aiustaz:notify.v1), без адреса подписки и координат');
    await безПроблем(стр, проблемы, 'aiustaz.pro, выключение');
    await контекст.close();
  }

  // ── 2. Отказ в разрешении ──
  console.log('2. Отказ в разрешении: инструкция, как включить; подписки нет');
  {
    const { контекст, стр, проблемы, api } = await открыть({ сайт: 'https://aiustaz.pro', путь: '#/notifications', ответ: 'denied' });
    await ждать(стр, 'уведомления-переключатель');
    await стр.getByTestId('уведомления-переключатель').first().click();
    await стр.getByTestId('уведомления-разрешить').first().click();
    await ждать(стр, 'уведомления-отказ');
    const т = await текст(стр, 'уведомления-отказ');
    проверить(/Браузер запретил уведомления/.test(т) && /Android, Chrome/.test(т) && /iPhone/.test(т) && /Компьютер/.test(т), 'отказ: инструкция для Android/Chrome, приложения, iPhone и компьютера');
    const п = await push(стр);
    проверить(п.подписок === 0 && п.регистраций.length === 0 && api.length === 0, 'при отказе — ни worker, ни подписки, ни запросов к серверу');
    await снимок(стр, 'отказ-ru');
    await стр.reload();
    await ждать(стр, 'уведомления-переключатель');
    await стр.getByTestId('уведомления-переключатель').first().click();
    await ждать(стр, 'уведомления-отказ');
    проверить(!(await есть(стр, 'уведомления-пояснение')) && (await push(стр)).запросов === 0, 'браузер уже запретил — сразу инструкция, без повторного запроса');
    await безПроблем(стр, проблемы, 'отказ');
    await контекст.close();
  }

  // ── 3. batr.kz ──
  console.log('3. batr.kz: уведомления — на aiustaz.pro');
  {
    const { контекст, стр, проблемы, api } = await открыть({ сайт: 'https://batr.kz', путь: '#/more' });
    await ждать(стр, 'экран-ещё');
    await ждать(стр, 'ещё-уведомления-batr');
    проверить((await текст(стр, 'ещё-уведомления-batr')).includes('на aiustaz.pro') && !(await есть(стр, 'ещё-уведомления')), 'batr.kz: в «Ещё» пояснение «… — на aiustaz.pro», строки нет');
    await стр.goto('https://batr.kz/aiustaz/index.html#/notifications');
    await ждать(стр, 'уведомления-batr');
    проверить((await стр.getByTestId('уведомления-открыть-сайт').first().getAttribute('href')) === 'https://aiustaz.pro/aiustaz/#/notifications', 'экран на batr.kz: ссылка на aiustaz.pro');
    проверить(!(await есть(стр, 'уведомления-переключатель')), 'batr.kz: переключателя нет');
    await стр.goto('https://batr.kz/aiustaz/index.html#/');
    await ждать(стр, 'карточка-намаза');
    await стр.waitForTimeout(400);
    проверить(!(await есть(стр, 'намаз-колокол')), 'batr.kz: колокольчика на главной нет');
    const п = await push(стр);
    проверить(п.регистраций.length === 0 && api.length === 0, 'batr.kz: worker не регистрируется, запросов к /api/push/ нет');
    await безПроблем(стр, проблемы, 'batr.kz');
    await контекст.close();
  }

  // ── 4. iPhone не с экрана «Домой» ──
  console.log('4. iPhone Safari не с экрана «Домой»');
  {
    const { контекст, стр, проблемы } = await открыть({ сайт: 'https://aiustaz.pro', профиль: { ...ТЕЛЕФОН, userAgent: UA.iphone }, путь: '#/notifications' });
    await ждать(стр, 'уведомления-ios');
    проверить(/только приложению на экране «Домой»/.test(await текст(стр, 'уведомления-ios')), 'iPhone: «присылает уведомления сайтов только приложению на экране „Домой“»');
    await снимок(стр, 'iphone-ru');
    await стр.getByTestId('уведомления-ios-установка').first().click();
    await ждать(стр, 'экран-установка');
    проверить((await стр.evaluate(() => location.hash)) === '#/install', 'кнопка → #/install (как добавить на экран «Домой»)');
    await безПроблем(стр, проблемы, 'iPhone');
    await контекст.close();
  }

  // ── 5. Казахский ──
  console.log('5. Казахский (черновик)');
  {
    const { контекст, стр, проблемы, api } = await открыть({ сайт: 'https://aiustaz.pro', язык: 'kk', путь: '#/notifications' });
    await ждать(стр, 'уведомления-переключатель');
    проверить((await стр.title()).includes('Намаз хабарландырулары'), 'kk: «Намаз хабарландырулары»');
    await стр.getByTestId('уведомления-переключатель').first().click();
    await ждать(стр, 'уведомления-пояснение');
    await снимок(стр, 'пояснение-kk');
    await стр.getByTestId('уведомления-разрешить').first().click();
    await ждать(стр, 'уведомления-итог');
    проверитьТело(подписки(api)[0].тело, { город: 'Астана', язык: 'kk' }, 'kk');
    await снимок(стр, 'включено-kk', true);
    await снимок(стр, 'включено-kk-экран');
    await безПроблем(стр, проблемы, 'kk');
    await контекст.close();
  }

  // ── 6. Настоящий service worker и push через DevTools ──
  console.log('6. Настоящий service worker: push → уведомление');
  let полный = null;
  try {
    полный = await chromium.launch({ channel: 'chromium' });
  } catch {
    console.log('  – пропущено: нет полного Chromium (channel chromium) — headless shell не показывает уведомления');
  }
  if (полный) {
    try {
      const контекст = await полный.newContext({ ...ТЕЛЕФОН, userAgent: UA.android });
      await контекст.grantPermissions(['notifications'], { origin: 'https://aiustaz.pro' });
      await контекст.route('https://aiustaz.pro/**', async (маршрут) => {
        const п = decodeURIComponent(new URL(маршрут.request().url()).pathname);
        const ф = п.startsWith('/aiustaz/') ? path.resolve(папка, '.' + п.slice('/aiustaz'.length)) : null;
        if (ф && ф.startsWith(path.resolve(папка) + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
          return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
        return маршрут.fulfill({ status: 404, body: '' });
      });
      const стр = await контекст.newPage();
      const ошибки = [];
      стр.on('pageerror', (о) => ошибки.push(о.message));
      await стр.addInitScript(() => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
      });
      await стр.goto('https://aiustaz.pro/aiustaz/index.html#/');
      const рег = await стр.evaluate(async () => {
        const р = await navigator.serviceWorker.register('/aiustaz/push-sw.js', { scope: '/aiustaz/', updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        return { область: р.scope, активен: !!р.active };
      });
      проверить(рег.активен && рег.область === 'https://aiustaz.pro/aiustaz/', 'настоящий worker /aiustaz/push-sw.js активен в области /aiustaz/ под CSP сборки (worker-src self)');
      const cdp = await контекст.newCDPSession(стр);
      let ид = null;
      cdp.on('ServiceWorker.workerRegistrationUpdated', (е) => {
        for (const р of е.registrations) if (р.scopeURL === 'https://aiustaz.pro/aiustaz/' && !р.isDeleted) ид = р.registrationId;
      });
      await cdp.send('ServiceWorker.enable');
      for (let i = 0; i < 50 && ид === null; i++) await стр.waitForTimeout(50);
      const нагрузка = { v: 1, kind: 'prayer', title: 'Аср · 14:39', body: 'Наступило время намаза · Алматы. Следующий — Магриб в 16:28', tag: 'aiustaz-asr-2026-11-20', url: '#/prayer', actions: [{ action: 'prayer', title: 'Время намаза' }, { action: 'qibla', title: 'Кибла' }], silent: false, lang: 'ru', ts: Date.now() };
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'https://aiustaz.pro', registrationId: String(ид), data: JSON.stringify(нагрузка) });
      let показано = [];
      for (let i = 0; i < 40 && !показано.length; i++) {
        await стр.waitForTimeout(100);
        показано = await стр.evaluate(async () => {
          const р = await navigator.serviceWorker.getRegistration('/aiustaz/');
          return (await р.getNotifications()).map((н) => ({ title: н.title, body: н.body, icon: н.icon, badge: н.badge, tag: н.tag, actions: н.actions.map((а) => а.title), silent: н.silent }));
        });
      }
      const н = показано[0];
      проверить(показано.length === 1 && н.title === 'Аср · 14:39' && н.body === нагрузка.body && н.tag === нагрузка.tag, `push → уведомление «${н?.title}» — «${н?.body}»`);
      проверить(/\/aiustaz\/pwa\/icon-192\.[0-9a-f]{32}\.png$/.test(н.icon) && /\/aiustaz\/pwa\/icon-mono-512\.[0-9a-f]{32}\.png$/.test(н.badge), 'значок — эмблема-фонарь (icon-192), badge — монохромный (icon-mono-512)');
      проверить(JSON.stringify(н.actions) === JSON.stringify(['Время намаза', 'Кибла']) && н.silent === false, 'кнопки «Время намаза» и «Кибла», звук — системный');
      const csp = await стр.evaluate(() => window.__csp);
      проверить(csp.length === 0 && ошибки.length === 0, 'настоящий worker: без нарушений CSP и ошибок');
      await контекст.close();
    } finally {
      await полный.close();
    }
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const браузер = await chromium.launch();
  try {
    const n = await уведомленияСквозной(браузер);
    console.log(`OK: уведомления — ${n} проверок`);
  } finally {
    await браузер.close();
  }
}
