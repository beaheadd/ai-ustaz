#!/usr/bin/env node
/**
 * Сквозной тест аккаунта (Playwright, сборка приложения + НАСТОЯЩИЕ server/account.py и admin.py на временной базе —
 * scripts/e2e-account-server.py). Владелец 28.11.2026: «создай вход, чтобы кто хочет, мог заходить входом, и у него
 * прогресс сохраняется. И с другого устройства он также может зайти с сохраненным прогрессом. И тогда ты смело можешь
 * сделать мне вход на мой аккаунт»; «Google авторизация»; «Код четырёхзначный сделай».
 *   1. Телефон А (360×780, ru, aiustaz.pro): первая строка «Ещё» — «Войти и сохранить прогресс»; до открытия экрана —
 *      ни запросов /api/account/, ни чанка account; на экране — что хранится, где, как удалить; без «16+» кода нет;
 *      почта → код (4 цифры, одно поле, вход сразу после 4-й цифры) → «Готово», «Синхронизировано: только что»;
 *      cookie HttpOnly на /api/account; прогресс А (урок 1, зикр 5 раз, закладка 2:255, тёмная тема) — на сервере.
 *   2. Телефон Б (второй контекст, свой урок 2): вход той же почтой → урок 1, счёт зикра 5, закладка, тема — на Б;
 *      +3 на Б и +2 на А → «Синхронизировать сейчас» → на обоих 10 и оба урока; история чата и id статистики — не на сервере.
 *   3. Владелец (почта из списка админов): «Ещё» → «Админ-панель» → /admin/ открывается уже вошедшим, без второго кода.
 *   4. Google (GIS подменён): до нажатия ни одного запроса на accounts.google.com; нажали — скрипт загрузился, кнопка
 *      Google → вход; та же почта по коду — тот же аккаунт.
 *   5. «Скачать мои данные» — файл с почтой и документами; «Выйти на всех устройствах»; «Удалить аккаунт» на А → на Б
 *      вход закончился, на сервере аккаунта нет, на устройстве данные остались.
 *   6. batr.kz: строки входа нет, запросов /api/account/ нет.
 * И всё время: ни исключений, ни чужих адресов (кроме подменённого accounts.google.com в п. 4), ни горизонтальной прокрутки.
 * SHOTS_ACCOUNT=папка — снимки 360×780: account-login.png, account-code.png, account-signed-in.png, account-more-admin.png.
 * Нужен PostgreSQL (MUGALIM_TEST_PG) и python3 с пакетами сервера; без MUGALIM_TEST_PG — пропуск с пометкой.
 * Запуск (из app/, после сборки): node scripts/e2e-account.mjs; из e2e.mjs — аккаунтСквозной(браузер) (E2E_ACCOUNT=0 — пропустить).
 */
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЗАГЛУШКА_BATR } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };
const ТЕЛЕФОН = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };
const ДЕНЬ = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const ПРОГРЕСС = (уроки = {}) => ({ версия: 1, язык: 'ru', предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки, дниЗанятий: [ДЕНЬ], онбордингПройден: true });
const УРОК = { пройден: true, лучший: 1, попыток: 1, последний: ДЕНЬ };

function свободныйПорт() {
  return new Promise((готово) => {
    const с = net.createServer();
    с.listen(0, '127.0.0.1', () => {
      const п = с.address().port;
      с.close(() => готово(п));
    });
  });
}

export async function аккаунтСквозной(браузер, { папка = process.env.DIST ?? path.join(корень, 'dist'), снимки = process.env.SHOTS_ACCOUNT ?? null } = {}) {
  if (!process.env.MUGALIM_TEST_PG) {
    console.log('  — пропуск: нет MUGALIM_TEST_PG (нужен временный PostgreSQL для server/account.py)');
    return 0;
  }
  let проверок = 0;
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[ошибка] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };
  if (снимки) fs.mkdirSync(снимки, { recursive: true });
  // Админка (п. 3) — из server/admin_static: нет сборки — собрать (вне git, node admin/build.mjs).
  if (!fs.existsSync(path.join(корень, '..', 'server', 'admin_static', 'index.html'))) execFileSync('node', [path.join(корень, '..', 'admin', 'build.mjs')], { stdio: 'inherit' });
  const порт = await свободныйПорт();
  const сервер = spawn(process.env.MUGALIM_PYTHON ?? 'python3', [path.join(корень, 'scripts', 'e2e-account-server.py'), String(порт)], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  const адрес = `http://127.0.0.1:${порт}`;
  try {
    for (let и = 0; и < 100; и += 1) {
      try {
        if ((await fetch(адрес + '/__test/health')).ok) break;
      } catch {
        // ещё поднимается
      }
      await new Promise((р) => setTimeout(р, 200));
    }
    const кодИз = async (почта) => (await (await fetch(адрес + '/__test/code?email=' + encodeURIComponent(почта))).text()).trim();
    const состояние = async (почта) => (await fetch(адрес + '/__test/state?email=' + encodeURIComponent(почта))).json();

    async function открыть({ сайт = 'https://aiustaz.pro', путь = '#/more', прогресс = ПРОГРЕСС(), локальное = {}, gis = false } = {}) {
      const контекст = await браузер.newContext({ ...ТЕЛЕФОН, locale: 'ru-RU', timezoneId: 'Asia/Almaty', acceptDownloads: true });
      await контекст.addInitScript(({ прогресс, локальное }) => {
        try {
          if (!localStorage.getItem('aiustaz:progress.v1')) {
            localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
            for (const [к, з] of Object.entries(локальное)) localStorage.setItem('aiustaz:' + к, typeof з === 'string' ? з : JSON.stringify(з));
          }
          localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1');
          localStorage.setItem('aiustaz:stats-off.v1', '1');
        } catch {}
      }, { прогресс, локальное });
      const журнал = { аккаунт: [], google: [], чанки: [] };
      if (gis) {
        // Подмена Google Identity Services: кнопка «Google (тест)» берёт ID token, подписанный тестовыми ключами сервера.
        await контекст.route('https://accounts.google.com/**', (м) => {
          журнал.google.push(м.request().url());
          if (!м.request().url().startsWith('https://accounts.google.com/gsi/client')) return м.fulfill({ status: 404, body: '' });
          return м.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `window.google={accounts:{id:{initialize:function(o){window.__gis=o},prompt:function(){},renderButton:function(el,o){var b=document.createElement('button');b.textContent='Google (тест)';b.setAttribute('data-testid','gis-кнопка');b.onclick=function(){fetch('/__test/google-token?email=g.user%40example.org').then(function(r){return r.text()}).then(function(t){window.__gis.callback({credential:t})})};el.appendChild(b)}}}};`,
          });
        });
      }
      await контекст.route(сайт + '/**', async (маршрут) => {
        const запрос = маршрут.request();
        const u = new URL(запрос.url());
        const п = decodeURIComponent(u.pathname);
        if (п.startsWith('/api/') || п.startsWith('/__test/') || п.startsWith('/admin')) {
          if (п.startsWith('/api/account/')) журнал.аккаунт.push(запрос.method() + ' ' + п);
          if (сайт !== 'https://aiustaz.pro' && п.startsWith('/api/')) return маршрут.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
          try {
            const ответ = await маршрут.fetch({ url: адрес + u.pathname + u.search, headers: await запрос.allHeaders() });
            return await маршрут.fulfill({ response: ответ });
          } catch {
            return undefined; // контекст закрыт, пока шёл запрос (уход со страницы шлёт синхронизацию) — не важно
          }
        }
        const ф = п.startsWith('/aiustaz/') ? path.resolve(папка, '.' + п.slice('/aiustaz'.length)) : null;
        if (ф && ф.startsWith(path.resolve(папка) + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
          return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
        return маршрут.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ЗАГЛУШКА_BATR });
      });
      const стр = await контекст.newPage();
      const проблемы = [];
      стр.on('request', (з) => {
        const адресЗапроса = з.url();
        if (/\/account-[0-9a-f]+\.js$/.test(адресЗапроса)) журнал.чанки.push(адресЗапроса);
        if (gis && адресЗапроса.startsWith('https://accounts.google.com/')) return;
        if (!адресЗапроса.startsWith(сайт + '/') && !адресЗапроса.startsWith('data:') && !адресЗапроса.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + адресЗапроса);
      });
      стр.on('pageerror', (о) => проблемы.push('исключение: ' + о.message));
      стр.on('console', (с) => {
        if (с.type() === 'error' && /Content Security Policy|Refused to/i.test(с.text())) проблемы.push('CSP: ' + с.text());
      });
      await стр.goto(сайт + '/aiustaz/index.html' + путь);
      return { контекст, стр, журнал, проблемы };
    }
    const э = (стр, id) => стр.getByTestId(id).first();
    const безПроблем = async (стр, проблемы, где) => {
      const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
      проверить(проблемы.length === 0, где + ': без исключений, чужих запросов, CSP и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
    };
    const снимок = async (стр, имя) => {
      if (!снимки) return;
      await стр.waitForTimeout(300);
      await стр.screenshot({ path: path.join(снимки, имя) });
    };
    const ls = (стр, ключ) => стр.evaluate((к) => JSON.parse(localStorage.getItem('aiustaz:' + к) ?? 'null'), ключ);
    const ждать = async (стр, условие, мс = 8000) => {
      const до = Date.now() + мс;
      while (Date.now() < до) {
        if (await условие()) return true;
        await стр.waitForTimeout(150);
      }
      return условие();
    };
    async function войти(стр, почта) {
      await э(стр, 'ещё-вход').click();
      await э(стр, 'аккаунт-почта').waitFor({ timeout: 15000 });
      await э(стр, 'аккаунт-16').click();
      await э(стр, 'аккаунт-почта').fill(почта);
      await э(стр, 'аккаунт-получить-код').click();
      await э(стр, 'аккаунт-код').waitFor({ timeout: 8000 });
      await э(стр, 'аккаунт-код').fill(await кодИз(почта));
      await э(стр, 'аккаунт-почта-вошли').waitFor({ timeout: 8000 });
    }
    const ПОЧТА = 'brat@example.org';

    // ── 1. Телефон А: вход по коду ──
    console.log('\n══ Аккаунт: вход по коду на телефоне А (aiustaz.pro, 360×780) ══');
    const А = await открыть({
      прогресс: ПРОГРЕСС({ 1: УРОК }),
      локальное: {
        'dhikr.v1': { версия: 1, счёт: { tahlil: { текущий: 5, день: ДЕНЬ, всего: 5 } }, избранное: ['tahlil'] },
        'quran-bookmark.v1': { версия: 1, сура: 2, аят: 255 },
        'theme.v1': { версия: 1, режим: 'тёмная' },
        'ask-history.v1': [{ вопрос: 'личный вопрос' }],
      },
    });
    {
      const { стр, журнал, проблемы } = А;
      await э(стр, 'экран-ещё').waitFor({ timeout: 20000 });
      const первая = await стр.evaluate(() => {
        const экран = document.querySelector('[data-testid="экран-ещё"]');
        const строки = [...экран.querySelectorAll('[data-testid^="ещё-"]')];
        return строки[0]?.getAttribute('data-testid');
      });
      проверить(первая === 'ещё-вход', '«Ещё»: первая строка — «Войти и сохранить прогресс»');
      проверить((await э(стр, 'ещё-вход').innerText()).includes('Войти и сохранить прогресс'), 'надпись строки входа');
      проверить(журнал.аккаунт.length === 0 && журнал.чанки.length === 0, 'до открытия экрана — ни запросов /api/account/, ни чанка account');
      await э(стр, 'ещё-вход').click();
      await э(стр, 'аккаунт-почта').waitFor({ timeout: 15000 });
      проверить(журнал.чанки.length === 1, 'экран входа — отдельный чанк account');
      const текст = await э(стр, 'экран-аккаунт').innerText();
      проверить(текст.includes('Что хранится') && текст.includes('Казахстан') && текст.includes('Удалить аккаунт') && текст.includes('История чата'), 'экран входа: что хранится, где (сервер в Казахстане), как удалить');
      проверить((await стр.getByTestId('аккаунт-google').count()) === 1, 'кнопка «Войти через Google» есть (client ID задан на сервере)');
      await снимок(стр, 'account-login.png');
      await э(стр, 'аккаунт-почта').fill(ПОЧТА);
      await э(стр, 'аккаунт-получить-код').click();
      await э(стр, 'аккаунт-ошибка').waitFor({ timeout: 3000 });
      проверить((await э(стр, 'аккаунт-ошибка').innerText()).includes('16'), 'без «Мне 16 лет или больше» код не запрашивается');
      проверить(!журнал.аккаунт.includes('POST /api/account/start'), 'запроса кода без 16+ не было');
      await э(стр, 'аккаунт-16').click();
      await э(стр, 'аккаунт-получить-код').click();
      await э(стр, 'аккаунт-код').waitFor({ timeout: 8000 });
      const поле = await э(стр, 'аккаунт-код').evaluate((у) => ({ inputmode: у.getAttribute('inputmode'), ac: у.getAttribute('autocomplete'), max: у.getAttribute('maxlength'), фокус: document.activeElement === у }));
      проверить(поле.inputmode === 'numeric' && поле.ac === 'one-time-code' && поле.max === '4' && поле.фокус, 'поле кода: inputmode numeric, autocomplete one-time-code, 4 цифры, в фокусе');
      проверить((await э(стр, 'экран-аккаунт').innerText()).includes(ПОЧТА), '«Код отправлен на …» с почтой');
      await снимок(стр, 'account-code.png');
      const код = await кодИз(ПОЧТА);
      проверить(/^\d{4}$/.test(код), 'в письме — 4 цифры');
      await э(стр, 'аккаунт-код').pressSequentially(код, { delay: 30 });
      await э(стр, 'аккаунт-почта-вошли').waitFor({ timeout: 8000 });
      проверить(!журнал.аккаунт.some((з) => з === 'POST /api/account/verify' && false) && журнал.аккаунт.includes('POST /api/account/verify'), 'после 4-й цифры — вход сам, без кнопки');
      проверить(await ждать(стр, async () => (await э(стр, 'аккаунт-статус').innerText()).includes('только что')), '«Синхронизировано: только что»');
      проверить((await э(стр, 'аккаунт-готово').innerText()).includes('Готово'), '«Готово! Прогресс сохраняется в аккаунте.»');
      const куки = await А.контекст.cookies('https://aiustaz.pro/api/account/me');
      const кука = куки.find((к) => к.name === 'aiustaz_account');
      проверить(кука && кука.httpOnly && кука.secure && кука.path === '/api/account' && кука.sameSite === 'Lax', 'cookie aiustaz_account: HttpOnly, Secure, SameSite=Lax, Path=/api/account');
      проверить((await стр.evaluate(() => document.cookie)) === '', 'из JS cookie не видна');
      const с = await состояние(ПОЧТА);
      проверить(с.документы.progress?.data?.уроки?.['1']?.п === true, 'на сервере — урок 1 с телефона А');
      проверить(JSON.stringify(с.документы.dhikr?.data ?? {}).includes('tahlil') && с.документы.quran?.data?.закладка?.[0]?.аят === 255, 'на сервере — счёт зикра и закладка 2:255');
      проверить(с.документы.settings?.data?.тема?.[0] === 'тёмная', 'на сервере — тема');
      const всё = JSON.stringify(с);
      проверить(!всё.includes('личный вопрос') && !всё.includes('sid'), 'история чата и id статистики на сервер не ушли');
      проверить(!с.документы.zakat, 'суммы закята не ушли (выключатель выключен)');
      await снимок(стр, 'account-signed-in.png');
      await безПроблем(стр, проблемы, 'вход на А');
    }

    // ── 2. Телефон Б ──
    console.log('\n══ Аккаунт: прогресс на втором телефоне ══');
    const Б = await открыть({ прогресс: ПРОГРЕСС({ 2: УРОК }) });
    {
      const { стр, проблемы } = Б;
      await э(стр, 'экран-ещё').waitFor({ timeout: 20000 });
      await войти(стр, ПОЧТА);
      проверить(await ждать(стр, async () => !!(await ls(стр, 'progress.v1'))?.уроки?.['1']), 'на Б появился урок 1 с телефона А');
      const п = await ls(стр, 'progress.v1');
      проверить(п.уроки['2'] && п.уроки['1'], 'урок 2 самого Б тоже на месте (объединение)');
      проверить((await ls(стр, 'quran-bookmark.v1'))?.аят === 255, 'закладка 2:255 — на Б');
      проверить((await ls(стр, 'theme.v1'))?.режим === 'тёмная', 'тёмная тема — на Б');
      await стр.goto('https://aiustaz.pro/aiustaz/index.html#/dhikr/item?n=1');
      await э(стр, 'зикр-текущий').waitFor({ timeout: 15000 });
      проверить((await э(стр, 'зикр-текущий').innerText()).trim() === '5', 'счётчик зикра на Б — 5 (с телефона А)');
      for (let и = 0; и < 3; и += 1) await э(стр, 'зикр-нажать').click();
      проверить((await э(стр, 'зикр-текущий').innerText()).trim() === '8', 'на Б +3 → 8');
      await безПроблем(стр, проблемы, 'вход на Б');
    }
    {
      // А: +2, потом синхронизация на обоих — 10 и там и там.
      const { стр } = А;
      await стр.goto('https://aiustaz.pro/aiustaz/index.html#/dhikr/item?n=1');
      await э(стр, 'зикр-текущий').waitFor({ timeout: 15000 });
      for (let и = 0; и < 2; и += 1) await э(стр, 'зикр-нажать').click();
      await стр.goto('https://aiustaz.pro/aiustaz/index.html#/account');
      await э(стр, 'аккаунт-синхронизировать').waitFor({ timeout: 15000 });
      await Б.стр.goto('https://aiustaz.pro/aiustaz/index.html#/account');
      await э(Б.стр, 'аккаунт-синхронизировать').waitFor({ timeout: 15000 });
      for (const у of [Б, А, Б, А]) {
        await э(у.стр, 'аккаунт-синхронизировать').click();
        await у.стр.waitForTimeout(700);
      }
      const счёт = async (у) => (await ls(у.стр, 'dhikr.v1'))?.счёт?.tahlil?.текущий;
      проверить(await ждать(А.стр, async () => (await счёт(А)) === 10 && (await счёт(Б)) === 10), `зикр: 5 + 3 на Б + 2 на А = 10 на обоих (А ${await счёт(А)}, Б ${await счёт(Б)})`);
      проверить(!!(await ls(А.стр, 'progress.v1'))?.уроки?.['2'], 'урок 2 с телефона Б — на А');
      await А.стр.goto('https://aiustaz.pro/aiustaz/index.html#/dhikr/item?n=1');
      await э(А.стр, 'зикр-текущий').waitFor({ timeout: 15000 });
      проверить((await э(А.стр, 'зикр-текущий').innerText()).trim() === '10', 'экран счётчика на А — 10');
    }

    // ── 3. Владелец → админ-панель без второго кода ──
    console.log('\n══ Аккаунт владельца: «Ещё» → «Админ-панель» ══');
    {
      const { контекст, стр, проблемы } = await открыть();
      await э(стр, 'экран-ещё').waitFor({ timeout: 20000 });
      await войти(стр, 'owner@example.org');
      await стр.goto('https://aiustaz.pro/aiustaz/index.html#/more');
      await э(стр, 'ещё-админка').waitFor({ timeout: 8000 });
      проверить((await э(стр, 'ещё-аккаунт').innerText()).includes('owner@example.org'), '«Ещё»: строка «Аккаунт» с почтой');
      проверить((await э(стр, 'ещё-админка').innerText()).includes('Админ-панель'), '«Ещё»: «Админ-панель» для почты владельца');
      await снимок(стр, 'account-more-admin.png');
      await безПроблем(стр, проблемы, '«Ещё» владельца');
      await Promise.all([стр.waitForURL(/\/admin\/$/, { timeout: 15000 }), э(стр, 'ещё-админка').click()]);
      await стр.waitForSelector('.кто', { timeout: 15000 });
      проверить((await стр.locator('.кто').innerText()).includes('владелец') && (await стр.locator('#код').count()) === 0, 'админка открылась уже вошедшим (владелец), без второго кода');
      const куки = await контекст.cookies('https://aiustaz.pro/api/admin/me');
      проверить(куки.some((к) => к.name === 'aiustaz_admin' && к.httpOnly && к.path === '/api/admin' && к.sameSite === 'Strict'), 'cookie админки — своя: Path=/api/admin, SameSite=Strict');
      await контекст.close();
    }
    {
      // Обычный человек: «Админ-панели» нет.
      проверить((await Б.стр.goto('https://aiustaz.pro/aiustaz/index.html#/more'), await э(Б.стр, 'ещё-аккаунт').waitFor({ timeout: 8000 }), (await Б.стр.getByTestId('ещё-админка').count()) === 0), 'у обычного аккаунта «Админ-панели» нет');
    }

    // ── 4. Google ──
    console.log('\n══ Аккаунт: «Войти через Google» (GIS подменён) ══');
    {
      const { контекст, стр, журнал, проблемы } = await открыть({ gis: true, путь: '#/account' });
      await э(стр, 'аккаунт-google').waitFor({ timeout: 15000 });
      await стр.waitForTimeout(500);
      проверить(журнал.google.length === 0, 'до нажатия — ни одного запроса на accounts.google.com');
      проверить(await стр.evaluate(() => ![...document.scripts].some((с) => с.src.includes('accounts.google.com'))), 'скрипта Google на странице нет');
      await э(стр, 'аккаунт-google').click();
      проверить(журнал.google.length === 0, 'без «16+» скрипт Google не грузится');
      await э(стр, 'аккаунт-16').click();
      await э(стр, 'аккаунт-google').click();
      await стр.getByTestId('gis-кнопка').waitFor({ timeout: 8000 });
      проверить(журнал.google.length === 1 && журнал.google[0].startsWith('https://accounts.google.com/gsi/client'), 'по нажатию — один скрипт …/gsi/client (CSP пропустила)');
      await стр.getByTestId('gis-кнопка').click();
      await э(стр, 'аккаунт-почта-вошли').waitFor({ timeout: 8000 });
      проверить((await э(стр, 'аккаунт-почта-вошли').innerText()).includes('g.user@example.org'), 'вошли через Google: почта из ID token');
      await безПроблем(стр, проблемы, 'Google');
      await контекст.close();
      // Та же почта кодом — тот же аккаунт (Google привязан).
      const В = await открыть();
      await э(В.стр, 'экран-ещё').waitFor({ timeout: 20000 });
      await войти(В.стр, 'g.user@example.org');
      проверить((await состояние('g.user@example.org')).есть, 'код на ту же почту — тот же аккаунт');
      await В.контекст.close();
    }

    // ── 5. Мои данные, выход везде, удаление ──
    console.log('\n══ Аккаунт: «Скачать мои данные», выход, удаление ══');
    {
      const { стр, проблемы } = А;
      await стр.goto('https://aiustaz.pro/aiustaz/index.html#/account');
      await э(стр, 'аккаунт-скачать').waitFor({ timeout: 15000 });
      const [загрузка] = await Promise.all([стр.waitForEvent('download', { timeout: 8000 }), э(стр, 'аккаунт-скачать').click()]);
      const данные = JSON.parse(fs.readFileSync(await загрузка.path(), 'utf8'));
      проверить(загрузка.suggestedFilename() === 'aiustaz-my-data.json' && данные.аккаунт.email === ПОЧТА && данные.документы.progress, '«Скачать мои данные»: файл с почтой и документами');
      await э(стр, 'аккаунт-удалить').click();
      await э(стр, 'аккаунт-удалить-да').click();
      await э(стр, 'аккаунт-почта').waitFor({ timeout: 8000 });
      проверить(!(await состояние(ПОЧТА)).есть, 'аккаунт удалён на сервере сразу');
      проверить(!!(await ls(стр, 'progress.v1'))?.уроки?.['1'], 'на устройстве прогресс остался');
      проверить((await ls(стр, 'account.v1')) === null && (await ls(стр, 'account-sync.v1')) === null, 'отметки входа и синхронизации на устройстве убраны');
      await безПроблем(стр, проблемы, 'удаление на А');
      // На Б вход закончился сам при следующей синхронизации.
      await Б.стр.goto('https://aiustaz.pro/aiustaz/index.html#/account');
      await э(Б.стр, 'аккаунт-синхронизировать').click();
      await э(Б.стр, 'аккаунт-почта').waitFor({ timeout: 8000 });
      await Б.стр.goto('https://aiustaz.pro/aiustaz/index.html#/more');
      await э(Б.стр, 'ещё-вход').waitFor({ timeout: 8000 });
      проверить(true, 'на Б после удаления — снова «Войти и сохранить прогресс»');
      // «Выйти на всех устройствах»: два входа одной почты, выход везде — оба вышли.
      await войти(Б.стр, 'two@example.org');
      const Г = await открыть();
      await э(Г.стр, 'экран-ещё').waitFor({ timeout: 20000 });
      await войти(Г.стр, 'two@example.org');
      await э(Г.стр, 'аккаунт-выйти-везде').click();
      await э(Г.стр, 'аккаунт-почта').waitFor({ timeout: 8000 });
      await э(Б.стр, 'аккаунт-синхронизировать').click();
      await э(Б.стр, 'аккаунт-почта').waitFor({ timeout: 8000 });
      проверить(true, '«Выйти на всех устройствах» — вышли и на втором телефоне');
      await Г.контекст.close();
      await А.контекст.close();
      await Б.контекст.close();
    }

    // ── 6. batr.kz ──
    console.log('\n══ Аккаунт: batr.kz ══');
    {
      const { контекст, стр, журнал, проблемы } = await открыть({ сайт: 'https://batr.kz' });
      await э(стр, 'экран-ещё').waitFor({ timeout: 20000 });
      проверить((await стр.getByTestId('ещё-вход').count()) === 0 && журнал.аккаунт.length === 0, 'batr.kz: строки входа нет, запросов /api/account/ нет');
      await безПроблем(стр, проблемы, 'batr.kz');
      await контекст.close();
    }
  } finally {
    сервер.kill('SIGTERM');
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const браузер = await chromium.launch();
  try {
    const n = await аккаунтСквозной(браузер);
    console.log(`\nаккаунт: всё верно (${n} проверок)`);
  } catch (е) {
    console.error(е?.stack ?? е);
    process.exitCode = 1;
  } finally {
    await браузер.close();
  }
}
