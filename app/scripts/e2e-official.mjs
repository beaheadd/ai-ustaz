#!/usr/bin/env node
/**
 * Сквозной тест официального времени намаза Казахстана и Узбекистана (Playwright, сборка приложения).
 *
 * Решение владельца 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… чтобы с местными один
 * в один у нас время было. А остальные по такой методологии можно считать.» Клиент — prayer/official.ts,
 * prayer/officialStore.ts; сервер — server/prayer.py (здесь подменён: page.route отдаёт таблицы из
 * scripts/fixtures/prayer-official-tables.json в форме ответа сервера).
 *   1. https://aiustaz.pro, Алматы, 20.11.2026 09:00: один GET /api/prayer/official?src=dumk&place=almaty&year=2026 (только
 *      src, place, year — координат нет, без cookie); подпись «По данным ДУМК · обновлено 20.11.2026»; шесть блоков и
 *      неделя (8 дней) = таблица минута в минуту; «Как считаем» — откуда таблица и что уходит только пункт; после
 *      перезагрузки — из памяти телефона, второго запроса нет. Снимок 412×800.
 *   2. Ташкент — то же с src=umuz: «По правилу Управления мусульман Узбекистана · обновлено 20.11.2026». Снимок 412×800.
 *   3. Нет сети (запрос обрывается) — свой расчёт, подпись «Расчёт по методу ДУМК (±1 мин)», времена = расчёт.
 *   4. Сервер ещё не скачал (404 not_ready) — свой расчёт; шафиитский аср — свой расчёт (таблицы ведомств — ханафитские).
 *   5. Геолокация рядом с Алматы (своя точка, 3 км) — спрашивается place=almaty, координат в адресе нет.
 *   6. https://batr.kz — запросов к /api/prayer/ нет, свой расчёт.
 * И всё время: ни исключений, ни запросов на другие адреса, ни нарушений CSP, ни горизонтальной прокрутки.
 * Снимки — SHOTS_OFFICIAL=папка (или SCREENSHOTS). Запуск (из app/, после сборки): node scripts/e2e-official.mjs
 * (DIST=папка сборки); из scripts/e2e.mjs — официальноеСквозной(браузер) (E2E_OFFICIAL=0 — пропустить).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЗАГЛУШКА_BATR } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const places = await import('../src/prayer/places.ts');
const { временаДня, КЛЮЧИ_ВРЕМЁН } = await import('../src/prayer/times.ts');
const { чч_мм, сдвигДня } = await import('../src/prayer/day.ts');
const ТАБЛИЦЫ = JSON.parse(fs.readFileSync(path.join(корень, 'scripts', 'fixtures', 'prayer-official-tables.json'), 'utf8'));
const МЕСТА = [
  ...places.разобратьМеста(JSON.parse(fs.readFileSync(path.join(корень, 'src', 'prayer', 'places-kz.json'), 'utf8'))),
  ...places.разобратьМеста(JSON.parse(fs.readFileSync(path.join(корень, 'src', 'prayer', 'places-uz.json'), 'utf8'))),
];
const место = (id) => МЕСТА.find((м) => м.id === id);
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };
const ПРОГРЕСС = { версия: 1, язык: 'ru', предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки: {}, дниЗанятий: [] };
const ДЕНЬ = '2026-11-20';
const СЕЙЧАС = new Date(`${ДЕНЬ}T09:00:00+05:00`);

/** Ответ сервера (server/prayer.py ответ_таблицы) из сжатой фикстуры: день — 24 цифры ЧЧММ × 6. */
function ответСервера(src, id) {
  const запись = (src === 'dumk' ? ТАБЛИЦЫ.kz : ТАБЛИЦЫ.uz)[id];
  const дни = запись.дни.split(' ').map((д) => [0, 4, 8, 12, 16, 20].map((i) => д.slice(i, i + 2) + ':' + д.slice(i + 2, i + 4)));
  return { src, place: id, year: ТАБЛИЦЫ.год, start: `${ТАБЛИЦЫ.год}-01-01`, offset: 300, days: дни, point: запись.точка, method: запись.метод, updated: '2026-11-20', checked: '2026-11-20', sha: 'b'.repeat(64) };
}
const строкаДня = (src, id, день) => ответСервера(src, id).days[Math.round((Date.parse(день) - Date.parse(`${ТАБЛИЦЫ.год}-01-01`)) / 86_400_000)];

/**
 * @returns число пройденных проверок; бросает Error при первой неудаче
 */
export async function официальноеСквозной(браузер, { снимки = process.env.SHOTS_OFFICIAL ?? process.env.SCREENSHOTS ?? null, папка = process.env.DIST ?? path.join(корень, 'dist') } = {}) {
  let проверок = 0;
  if (снимки) fs.mkdirSync(снимки, { recursive: true });
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[официальное время] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };

  async function открыть({ сайт = 'https://aiustaz.pro', место: м, аср = 'hanafi', сервер = 'таблица', путь = '#/prayer' }) {
    const контекст = await браузер.newContext({ viewport: { width: 412, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', colorScheme: 'light', timezoneId: 'Asia/Almaty' });
    await контекст.addInitScript(
      ({ прогресс, место, аср }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        try {
          if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс)); try { localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); } catch {} // лист первого выбора чтеца — свой тест (e2e-download.mjs)
          if (!localStorage.getItem('aiustaz:prayer-place.v1')) localStorage.setItem('aiustaz:prayer-place.v1', JSON.stringify({ версия: 1, место }));
          localStorage.setItem('aiustaz:prayer-asr.v1', JSON.stringify({ версия: 1, мазхаб: аср }));
        } catch {}
      },
      { прогресс: ПРОГРЕСС, место: м, аср },
    );
    const api = [];
    await контекст.route(сайт + '/**', async (маршрут) => {
      const запрос = маршрут.request();
      const адрес = new URL(запрос.url());
      const п = decodeURIComponent(адрес.pathname);
      if (п.startsWith('/api/prayer/')) {
        api.push({ путь: п, параметры: Object.fromEntries(адрес.searchParams), заголовки: запрос.headers(), метод: запрос.method() });
        if (сервер === 'нет-сети') return маршрут.abort('internetdisconnected');
        const { src, place, year } = Object.fromEntries(адрес.searchParams);
        const есть = сервер === 'таблица' && year === String(ТАБЛИЦЫ.год) && (src === 'dumk' ? ТАБЛИЦЫ.kz : ТАБЛИЦЫ.uz)?.[place];
        if (!есть) return маршрут.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ошибка: 'not_ready' }) });
        return маршрут.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"' + 'b'.repeat(32) + '"', 'Cache-Control': 'public, max-age=86400' }, body: JSON.stringify(ответСервера(src, place)) });
      }
      const ф = п.startsWith('/aiustaz/') ? path.resolve(папка, '.' + п.slice('/aiustaz'.length)) : null;
      if (ф && ф.startsWith(path.resolve(папка) + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
        return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
      return маршрут.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ЗАГЛУШКА_BATR });
    });
    const стр = await контекст.newPage();
    await стр.clock.setFixedTime(СЕЙЧАС);
    const проблемы = [];
    стр.on('request', (з) => {
      const u = з.url();
      if (!u.startsWith(сайт + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
    });
    стр.on('console', (с) => {
      // «Failed to load resource» — так браузер сам пишет об оборванном запросе и ответе 404 (сценарии 3–4), это не ошибка кода
      if (с.type() === 'error' && !/Failed to load resource/.test(с.text())) проблемы.push('ошибка в консоли: ' + с.text());
    });
    стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
    await стр.goto(сайт + '/aiustaz/index.html' + путь);
    await стр.getByTestId('карточка-намаза').first().waitFor({ state: 'visible', timeout: 20000 });
    return { контекст, стр, проблемы, api };
  }
  const текст = async (стр, id) => (await стр.getByTestId(id).first().innerText()).trim();
  const ждатьПодпись = async (стр, начало, мс = 8000) => {
    const до = Date.now() + мс;
    while (Date.now() < до) {
      if ((await текст(стр, 'намаз-подпись')).startsWith(начало)) return true;
      await стр.waitForTimeout(100);
    }
    return false;
  };
  const безПроблем = async (стр, проблемы, где) => {
    for (const н of await стр.evaluate(() => window.__csp ?? [])) проблемы.push('нарушение CSP: ' + н);
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
    проверить(проблемы.length === 0, где + ': без исключений, чужих запросов, CSP и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const снимок = async (стр, имя) => {
    if (!снимки) return;
    await стр.evaluate(() => window.scrollTo(0, 0));
    await стр.waitForTimeout(300);
    await стр.screenshot({ path: path.join(снимки, имя + '.png') });
  };
  async function шестьИзТаблицы(стр, src, id, где) {
    const строка = строкаДня(src, id, ДЕНЬ);
    const на = [];
    for (const к of КЛЮЧИ_ВРЕМЁН) на.push(await текст(стр, 'намаз-время-' + к));
    проверить(JSON.stringify(на) === JSON.stringify(строка), `${где}: шесть блоков = таблица ${ДЕНЬ}: ${на.join(' ')}`);
    let неделя = 0;
    for (let i = 0; i < 8; i++) {
      const д = сдвигДня(ДЕНЬ, i);
      const с = строкаДня(src, id, д);
      for (const [j, к] of КЛЮЧИ_ВРЕМЁН.entries()) if ((await текст(стр, `неделя-${д}-${к}`)) === с[j]) неделя += 1;
    }
    проверить(неделя === 48, `${где}: неделя — 8 дней × 6 = таблица (${неделя} из 48)`);
  }
  const запросы = (api) => api.filter((з) => з.путь === '/api/prayer/official');

  // ── 1. Алматы на aiustaz.pro ──
  console.log('1. aiustaz.pro, Алматы: таблица ДУМК, «По данным ДУМК», без координат, из памяти после перезагрузки');
  {
    const { контекст, стр, проблемы, api } = await открыть({ место: место('almaty') });
    проверить(await ждатьПодпись(стр, 'По данным ДУМК'), `подпись: «${await текст(стр, 'намаз-подпись')}»`);
    проверить((await текст(стр, 'намаз-подпись')) === 'По данным ДУМК · обновлено 20.11.2026', 'подпись с датой обновления');
    проверить((await текст(стр, 'намаз-подпись-аср')) === '· аср: ханафитский', 'рядом — «аср: ханафитский» (таблица ДУМК — ханафитская)');
    проверить(await стр.getByTestId('намаз-черновик').count() > 0, 'плашка «Черновик» осталась (правило 11: проверяет устаз)');
    const з = запросы(api);
    проверить(з.length === 1 && з[0].метод === 'GET', `один GET /api/prayer/official (${з.length})`);
    проверить(JSON.stringify(Object.keys(з[0].параметры).sort()) === '["place","src","year"]' && з[0].параметры.src === 'dumk' && з[0].параметры.place === 'almaty' && з[0].параметры.year === '2026', `в запросе только src=dumk, place=almaty, year=2026: ${JSON.stringify(з[0].параметры)}`);
    проверить(!/43\.|76\.|lat|lon|широт/i.test(JSON.stringify(з[0].параметры)) && !з[0].заголовки.cookie && !з[0].заголовки.referer, 'координат, cookie и Referer нет');
    await шестьИзТаблицы(стр, 'dumk', 'almaty', 'Алматы');
    const м = await текст(стр, 'намаз-метод-текст');
    проверить(/официальной таблицы ДУМК на 2026 год для пункта «Алматы қаласы»/.test(м), '«Как считаем»: официальная таблица ДУМК, пункт ДУМК');
    проверить((await стр.getByTestId('намаз-метод-официально').innerText()).includes('ваши координаты не отправляются'), '«Как считаем»: уходит только пункт списка');
    await безПроблем(стр, проблемы, 'Алматы');
    await снимок(стр, 'алматы-по-данным-думк-412x800');
    await стр.reload();
    await стр.getByTestId('карточка-намаза').first().waitFor();
    проверить(await ждатьПодпись(стр, 'По данным ДУМК', 3000), 'после перезагрузки — сразу «По данным ДУМК» (таблица на телефоне)');
    await стр.waitForTimeout(500);
    проверить(запросы(api).length === 1, 'второго запроса нет — таблица на год не качается повторно');
    const хранится = await стр.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('aiustaz:prayer-official.v1') || '{}').таблицы || {}));
    проверить(JSON.stringify(хранится) === '["dumk:almaty:2026"]', `в памяти телефона: ${хранится.join(', ')}`);
    await стр.goto('https://aiustaz.pro/aiustaz/index.html#/');
    await стр.getByTestId('карточка-намаза').first().waitFor();
    // На главной с 26.11.2026 — только ряд времён и отсчёт (подпись источника — на экране «Время намаза»).
    await стр.waitForFunction((ф) => document.querySelector('[data-testid="намаз-время-fajr"]')?.textContent === ф, строкаДня('dumk', 'almaty', ДЕНЬ)[0], { timeout: 5000 });
    проверить((await текст(стр, 'намаз-время-fajr')) === строкаДня('dumk', 'almaty', ДЕНЬ)[0], 'главная: фаджр = таблица ДУМК');
    await контекст.close();
  }

  // ── 2. Ташкент ──
  console.log('2. aiustaz.pro, Ташкент: «По правилу Управления мусульман Узбекистана»');
  {
    const { контекст, стр, проблемы, api } = await открыть({ место: место('toshkent') });
    проверить(await ждатьПодпись(стр, 'По правилу Управления'), `подпись: «${await текст(стр, 'намаз-подпись')}»`);
    проверить((await текст(стр, 'намаз-подпись')) === 'По правилу Управления мусульман Узбекистана · обновлено 20.11.2026', 'подпись УМУз с датой');
    const з = запросы(api);
    проверить(з.length === 1 && з[0].параметры.src === 'umuz' && з[0].параметры.place === 'toshkent', 'один запрос: src=umuz, place=toshkent');
    await шестьИзТаблицы(стр, 'umuz', 'toshkent', 'Ташкент');
    проверить(/правилу Управления мусульман Узбекистана для пункта «Тошкент»/.test(await текст(стр, 'намаз-метод-текст')), '«Как считаем»: правило УМУз в пункте их списка');
    await безПроблем(стр, проблемы, 'Ташкент');
    await снимок(стр, 'ташкент-по-данным-умуз-412x800');
    await контекст.close();
  }

  // ── 3. Нет сети ──
  console.log('3. Нет сети — свой расчёт');
  {
    const м = место('almaty');
    const { контекст, стр, проблемы, api } = await открыть({ место: м, сервер: 'нет-сети' });
    await стр.waitForTimeout(800);
    проверить(запросы(api).length === 1, 'запрос был и оборвался');
    проверить((await текст(стр, 'намаз-подпись')) === 'Расчёт по методу ДУМК (±1 мин)', `подпись — расчёт: «${await текст(стр, 'намаз-подпись')}»`);
    const р = временаДня(м, ДЕНЬ, { страна: 'KZ' });
    const на = [];
    for (const к of КЛЮЧИ_ВРЕМЁН) на.push(await текст(стр, 'намаз-время-' + к));
    проверить(JSON.stringify(на) === JSON.stringify(КЛЮЧИ_ВРЕМЁН.map((к) => чч_мм(р[к]))), `шесть блоков = свой расчёт: ${на.join(' ')}`);
    await безПроблем(стр, проблемы, 'нет сети');
    await контекст.close();
  }

  // ── 4. Сервер ещё не скачал; шафиитский аср ──
  console.log('4. 404 not_ready и шафиитский аср — свой расчёт');
  {
    const { контекст, стр, проблемы } = await открыть({ место: место('samarqand'), сервер: 'не-готово' });
    await стр.waitForTimeout(800);
    проверить((await текст(стр, 'намаз-подпись')).startsWith('Расчёт по методу Управления мусульман Узбекистана'), 'Самарканд, таблицы ещё нет — «Расчёт по методу УМУз»');
    await безПроблем(стр, проблемы, '404 not_ready');
    await контекст.close();
  }
  {
    const { контекст, стр, проблемы, api } = await открыть({ место: место('almaty'), аср: 'shafi' });
    await стр.waitForTimeout(800);
    const п = await текст(стр, 'намаз-подпись');
    const аср = await текст(стр, 'намаз-подпись-аср');
    проверить(п.startsWith('Расчёт по методу ДУМК') && аср === '· аср: шафиитский', `шафиитский аср — свой расчёт: «${п} ${аср}»`);
    проверить(запросы(api).length <= 1, 'таблица могла скачаться, но для шафиитского асра не показывается');
    await безПроблем(стр, проблемы, 'шафиитский аср');
    await контекст.close();
  }

  // ── 5. Своя точка рядом с Алматы ──
  console.log('5. Геолокация рядом с Алматы — спрашиваем только id ближайшего места');
  {
    const список = МЕСТА.filter((м) => м.страна === 'KZ');
    const т = { широта: 43.2389, долгота: 76.8897 };
    const точка = places.своёМесто(т, places.ближайшееМесто(список, т));
    const { контекст, стр, проблемы, api } = await открыть({ место: точка });
    проверить(await ждатьПодпись(стр, 'По данным ДУМК'), 'своя точка в 4 км от Алматы — «По данным ДУМК»');
    const з = запросы(api);
    проверить(з.length === 1 && з[0].параметры.place === 'almaty' && !/43\.2|76\.8/.test(JSON.stringify(з[0])), 'в запросе — almaty, координат точки нет');
    await безПроблем(стр, проблемы, 'своя точка');
    await контекст.close();
  }

  // ── 6. batr.kz ──
  console.log('6. batr.kz — к /api/prayer/ не ходим');
  {
    const { контекст, стр, проблемы, api } = await открыть({ сайт: 'https://batr.kz', место: место('almaty') });
    await стр.waitForTimeout(800);
    проверить(запросы(api).length === 0, 'запросов к /api/prayer/official нет');
    проверить((await текст(стр, 'намаз-подпись')) === 'Расчёт по методу ДУМК (±1 мин)', 'подпись — расчёт');
    await безПроблем(стр, проблемы, 'batr.kz');
    await контекст.close();
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const браузер = await chromium.launch();
  try {
    const n = await официальноеСквозной(браузер);
    console.log(`OK: официальное время — ${n} проверок`);
  } finally {
    await браузер.close();
  }
}
