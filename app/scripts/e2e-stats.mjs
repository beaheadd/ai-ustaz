#!/usr/bin/env node
/**
 * Сквозной тест своей статистики и настроек содержимого из админки (Playwright, сборка приложения).
 *
 * Владелец 27.11.2026: «Создай админ панель… статистика… сколько человек зашло, какие страницы смотрели, сколько времени…
 * хадисы… добавляли, убирали, отключали». Клиент — src/stats/stats.ts, src/content/remoteConfig.ts; сервер подменён
 * page.route (server/stats.py, server/content_admin.py проверяются pytest).
 *   1. https://aiustaz.pro: при запуске GET /api/content/config (без cookie); POST /api/stats/e — только разрешённые поля
 *      (v, sid, sess, lang, dev, os, st, ref, ver, ev), без cookie, без строки браузера; sid — случайный, тот же после
 *      перезагрузки; события: открытие, экраны '' → quran → quran/sura n=2; через 30 с — пульс с секундами.
 *   2. Настройки из админки: скрытый хадис — «Такого хадиса в разделе нет»; проверенный устазом — «Проверил устаз: …»
 *      без плашки «Черновик».
 *   3. «Ещё» → «Анонимная статистика» — выключить: дальше запросов /api/stats/ нет (и после перезагрузки).
 *   4. «Не отслеживать» (globalPrivacyControl) — запросов /api/stats/ нет.
 *   5. https://batr.kz — ни /api/stats/, ни /api/content/.
 * И всё время: ни исключений, ни запросов на другие адреса, ни горизонтальной прокрутки.
 * Запуск (из app/, после сборки): node scripts/e2e-stats.mjs (DIST=папка сборки); из e2e.mjs — статистикаСквозной(браузер)
 * (E2E_STATS=0 — пропустить).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЗАГЛУШКА_BATR } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };
const ПРОГРЕСС = { версия: 1, язык: 'ru', предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки: {}, дниЗанятий: [], онбордингПройден: true };
const ПОЛЯ = ['v', 'sid', 'sess', 'lang', 'dev', 'os', 'st', 'ref', 'ver', 'ev'];

export async function статистикаСквозной(браузер, { папка = process.env.DIST ?? path.join(корень, 'dist') } = {}) {
  let проверок = 0;
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[статистика] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };
  const индекс = JSON.parse(fs.readFileSync(path.join(папка, 'hadith', fs.readdirSync(path.join(папка, 'hadith')).find((ф) => /^index\.[0-9a-f]{20}\.json$/.test(ф))), 'utf8'));
  const свободные = индекс.хадисы.filter((х) => !индекс.одобрено[String(х.id)]);
  const скрытый = свободные[0].id;
  const проверенный = свободные[1].id;
  const НАСТРОЙКИ = { формат: 1, версия: 3, sha256: 'c'.repeat(64), чтецы: { включены: null, поУмолчанию: null }, хадисы: { скрыты: [скрытый], проверены: { [String(проверенный)]: ['Устаз Тест', '2026-11-27'] } } };

  async function открыть({ сайт = 'https://aiustaz.pro', путь = '', gpc = false, контекст: готовый = null } = {}) {
    const контекст = готовый ?? (await браузер.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' }));
    const журнал = { статистика: [], настройки: [] };
    if (!готовый) {
      await контекст.addInitScript(({ прогресс, gpc }) => {
        try {
          if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
        } catch {}
        if (gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
      }, { прогресс: ПРОГРЕСС, gpc });
    }
    await контекст.unroute('**/*').catch(() => undefined);
    await контекст.route(сайт + '/**', async (маршрут) => {
      const запрос = маршрут.request();
      const п = decodeURIComponent(new URL(запрос.url()).pathname);
      if (п === '/api/stats/e') {
        журнал.статистика.push({ тело: JSON.parse(запрос.postData() ?? 'null'), заголовки: await запрос.allHeaders(), метод: запрос.method() });
        return маршрут.fulfill({ status: 204, body: '' });
      }
      if (п === '/api/content/config') {
        журнал.настройки.push(await запрос.allHeaders());
        return маршрут.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(НАСТРОЙКИ) });
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
    стр.on('pageerror', (о) => проблемы.push('исключение: ' + о.message));
    await стр.clock.install({ time: new Date('2026-11-27T10:00:00+05:00') });
    await стр.goto(сайт + '/aiustaz/index.html' + путь);
    await стр.getByTestId('экран-главная').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    return { контекст, стр, журнал, проблемы };
  }
  const события = (ж) => ж.статистика.flatMap((з) => з.тело.ev);
  const подождать = async (стр, условие, мс = 6000) => {
    const до = Date.now() + мс;
    while (Date.now() < до) {
      if (условие()) return true;
      await стр.waitForTimeout(100);
    }
    return условие();
  };
  const безПроблем = async (стр, проблемы, где) => {
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
    проверить(проблемы.length === 0, где + ': без исключений, чужих запросов и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };

  // 1. aiustaz.pro
  {
    const { контекст, стр, журнал, проблемы } = await открыть();
    проверить(await подождать(стр, () => журнал.настройки.length > 0), 'при запуске — GET /api/content/config');
    проверить(!журнал.настройки[0].cookie, 'настройки — без cookie');
    проверить(await подождать(стр, () => события(журнал).some((е) => е.t === 'v')), 'первый просмотр экрана отправлен');
    const первый = журнал.статистика[0];
    проверить(первый.метод === 'POST' && !первый.заголовки.cookie, 'POST /api/stats/e без cookie');
    проверить(Object.keys(первый.тело).every((к) => ПОЛЯ.includes(к)), 'только разрешённые поля: ' + Object.keys(первый.тело).join(', '));
    проверить(/^[A-Za-z0-9_-]{16,32}$/.test(первый.тело.sid) && /^[A-Za-z0-9_-]{16,32}$/.test(первый.тело.sess), 'id устройства и сеанса — случайные строки');
    проверить(первый.тело.lang === 'ru' && первый.тело.dev === 'phone' && первый.тело.os === 'android', 'язык ru, телефон, android — без строки браузера');
    проверить(!JSON.stringify(первый.тело).includes('Mozilla') && !JSON.stringify(первый.тело).includes('Pixel'), 'строки браузера в событиях нет');
    проверить(первый.тело.ev[0].t === 'o', 'первое событие — открытие');
    await стр.evaluate(() => { location.hash = '#/quran'; });
    await стр.evaluate(() => { location.hash = '#/quran/sura?n=2'; });
    проверить(await подождать(стр, () => события(журнал).some((е) => е.t === 'v' && е.s === 'quran/sura' && е.n === 2)), 'экран quran/sura с номером 2');
    const до = журнал.статистика.length;
    await стр.clock.runFor(31_000);
    проверить(await подождать(стр, () => события(журнал).some((е) => е.t === 'b' && е.d >= 25 && е.d <= 60)), 'через 30 с — пульс с секундами');
    проверить(журнал.статистика.length > до, 'пульс ушёл отдельным запросом');
    const sid = первый.тело.sid;
    await стр.reload();
    await подождать(стр, () => журнал.статистика.some((з) => з.тело.sid === sid && з !== первый && з.тело.ev.some((е) => е.t === 'v' && е.s === 'quran/sura')));
    проверить(журнал.статистика.every((з) => з.тело.sid === sid), 'после перезагрузки — тот же анонимный id устройства');
    await безПроблем(стр, проблемы, 'aiustaz.pro');

    // 2. Настройки из админки: скрытый и проверенный хадисы.
    // Под нагрузкой полного прогона настройки после перезагрузки приходят позже — ждём их, а не время.
    await подождать(стр, () => журнал.настройки.length >= 2, 15000);
    await стр.evaluate((id) => { location.hash = '#/hadith/item?n=' + id; }, скрытый);
    const нетХадиса = await стр.getByTestId('хадис-нет').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
    if (!нетХадиса) console.log('    отладка: ' + (await стр.evaluate(() => location.hash + ' | настройки: ' + (localStorage.getItem('aiustaz:content-config.v1') || '—').slice(0, 200) + ' | ' + document.body.innerText.slice(0, 300))));
    проверить(нетХадиса, `скрытый в админке хадис ${скрытый} — «Такого хадиса в разделе нет»`);
    await стр.evaluate((id) => { location.hash = '#/hadith/item?n=' + id; }, проверенный);
    const есть = await стр.getByTestId('хадис-одобрено').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
    if (!есть) console.log('    отладка: ' + (await стр.evaluate(() => location.hash + ' | ' + document.body.innerText.slice(0, 400))));
    проверить(есть, `проверенный устазом в админке хадис ${проверенный} — «Проверил устаз»`);
    проверить((await стр.getByTestId('хадис-одобрено').first().innerText()).includes('Устаз Тест'), 'имя устаза из админки');
    проверить((await стр.getByTestId('хадис-черновик').count()) === 0, 'у проверенного нет плашки «Черновик»');

    // 3. Выключить статистику в «Ещё».
    await стр.evaluate(() => { location.hash = '#/more'; });
    await стр.getByTestId('ещё-статистика-вкл').first().waitFor({ state: 'visible', timeout: 20000 });
    await стр.getByTestId('ещё-статистика-вкл').first().click();
    проверить(await стр.getByTestId('ещё-статистика-выкл').first().isVisible(), '«Ещё» → «Анонимная статистика» выключена');
    const после = журнал.статистика.length;
    await стр.evaluate(() => { location.hash = '#/quran'; });
    await стр.clock.runFor(61_000);
    await стр.reload();
    await стр.waitForTimeout(1500);
    await стр.evaluate(() => { location.hash = '#/dhikr'; });
    await стр.waitForTimeout(800);
    проверить(журнал.статистика.length === после, 'после выключения (и перезагрузки) — запросов статистики нет');
    await контекст.close();
  }

  // 4. «Не отслеживать».
  {
    const { контекст, стр, журнал } = await открыть({ gpc: true });
    await стр.evaluate(() => { location.hash = '#/quran'; });
    await стр.waitForTimeout(1500);
    проверить(журнал.статистика.length === 0, 'globalPrivacyControl — статистика не отправляется');
    await контекст.close();
  }

  // 5. batr.kz.
  {
    const { контекст, стр, журнал, проблемы } = await открыть({ сайт: 'https://batr.kz' });
    await стр.evaluate(() => { location.hash = '#/quran'; });
    await стр.waitForTimeout(1500);
    проверить(журнал.статистика.length === 0 && журнал.настройки.length === 0, 'batr.kz — ни статистики, ни настроек содержимого');
    await безПроблем(стр, проблемы, 'batr.kz');
    await контекст.close();
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { chromium } = require('playwright');
  const браузер = await chromium.launch();
  try {
    const n = await статистикаСквозной(браузер);
    console.log(`OK: статистика — ${n} проверок`);
  } finally {
    await браузер.close();
  }
}
