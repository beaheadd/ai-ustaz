#!/usr/bin/env node
/**
 * Сквозной тест полосы «Вышло обновление AI Ustaz» → «Обновить» (Playwright, Chromium; src/update/).
 *
 * Владелец 28.11.2026: «Каждый раз, когда выходит обновление, как на batr.kz выводи кнопку „Обновить“ на приложение,
 * чтобы не приходилось закрывать, заново заходить».
 *
 * Две сборки на одном адресе: A — app/dist (или DIST), B — её копия во временной папке: главный чанк переименован (новый
 * хэш в имени, как у настоящей новой сборки), after-export перезапущен с MUGALIM_COMMIT=B (метка коммита, список офлайн,
 * новые байты push-sw.js). Перед ними — переключатель (свой маленький прокси): «выпуск» = отдавать B; /aiustaz/version.json
 * отдаёт сам прокси ({ commit } — как tools/release-batr.sh). На 127.0.0.1 проверка — только с флагом «aiustaz:update-test».
 * Время — page.clock (10 минут проматываются, не ждутся).
 *   1. Вкладка без worker'а, 360×780: тот же коммит — полосы нет; запрос version.json без кэша; другой коммит и
 *      возвращение во вкладку (visibilitychange) — полоса над экраном, нижнее меню не закрыто; «×» — скрыта, после
 *      перезагрузки той же версии — нет; выпуск B и 10 минут — снова есть; «Обновить» → открыта сборка B (метка, новый
 *      чанк), полосы нет, прогресс на месте. UPDATE_SHOT=путь.png — снимок полосы.
 *   2. С service worker'ом (как установленное приложение на aiustaz.pro): worker A и оболочка в кэше, «скачанный» аят в
 *      «aiustaz-аудио-v1»; выпуск B → полоса → «Обновить» → сборка B; новый worker: в кэше список офлайн B, старого
 *      чанка нет, сохранённая страница — B; аят в кэше аудио и прогресс на месте; без сети открывается B, полосы нет.
 *   3. Без флага на 127.0.0.1 — ни одного запроса version.json; без сети — запросов нет, полосы и ошибок нет; kk-текст.
 *   4. Как на batr.kz: страницей управляет worker сайта (scope «/», статика cache-first — копия логики batr-world sw.js);
 *      version.json попал в его кэш, но следующая проверка всё равно доходит до сервера, полоса появляется, записи не копятся.
 *   Всё время: ни ошибок в консоли (кроме сетевых без сети), ни запросов на другой адрес.
 * Запуск: node scripts/e2e-update.mjs (после npm run export:web). Из e2e.mjs — обновлениеСквозной(браузер).
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
});
const ЧАНК = /\/aiustaz\/(_expo\/static\/js\/web\/index-)([0-9a-f]{32})\.js/;
const коммитИз = (html) => /<meta name="aiustaz-commit" content="([0-9a-f]+)"/.exec(html)?.[1] ?? null;

/**
 * Worker «сайта BATR» (как batr-world/web/public/sw.js, scope «/»): навигация — сеть, всё прочее своего сайта, кроме /api/,
 * — cache-first с записью в свой кэш. Без уборки version.json застрял бы в нём навсегда.
 */
const ЧУЖОЙ_SW = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { e.respondWith(fetch(req, { cache: 'reload' })); return; }
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const c = res.clone(); caches.open('world-v7').then((k) => k.put(req, c)); }
    return res;
  })));
});
`;

/** Сборка B: копия A с новым именем главного чанка и меткой коммитB (after-export сам пересоберёт список и worker). */
function собратьВторую(папкаA, коммитB) {
  const папкаB = fs.mkdtempSync(path.join(os.tmpdir(), 'aiustaz-update-'));
  fs.cpSync(папкаA, папкаB, { recursive: true });
  const файл = path.join(папкаB, 'index.html');
  const html = fs.readFileSync(файл, 'utf8');
  const м = ЧАНК.exec(html);
  if (!м) throw new Error('в index.html нет главного чанка _expo/static/js/web/index-<хэш>.js');
  const новыйХэш = crypto.createHash('md5').update(коммитB + м[2]).digest('hex');
  const старое = `${м[1]}${м[2]}.js`;
  const новое = `${м[1]}${новыйХэш}.js`;
  fs.renameSync(path.join(папкаB, старое), path.join(папкаB, новое));
  fs.writeFileSync(файл, html.split(старое).join(новое));
  execFileSync(process.execPath, [path.join(корень, 'scripts', 'after-export.mjs'), папкаB], { env: { ...process.env, MUGALIM_COMMIT: коммитB }, stdio: 'pipe' });
  return { папкаB, чанкA: '/aiustaz/' + старое, чанкB: '/aiustaz/' + новое };
}

/** Прокси перед двумя тестовыми серверами: какая сборка «на проде» и что в version.json — переключается из теста. */
async function переключатель(папкаA, папкаB) {
  const а = await запуститьСервер({ порт: 0, папка: папкаA });
  const б = await запуститьСервер({ порт: 0, папка: папкаB });
  const с = { сборка: 'A', версия: null, запросыВерсии: [] };
  const сервер = http.createServer((запрос, ответ) => {
    const путь = new URL(запрос.url ?? '/', 'http://локально').pathname;
    if (путь === '/aiustaz/version.json' && с.версия) {
      с.запросыВерсии.push({ кэш: String(запрос.headers['cache-control'] ?? ''), cookie: запрос.headers.cookie ?? '' });
      ответ.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      ответ.end(JSON.stringify({ source: 'beaheadd/mugalim', branch: 'main', commit: с.версия, note: 'тест' }));
      return;
    }
    if (путь === '/batr-sw.js') {
      ответ.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
      ответ.end(ЧУЖОЙ_SW);
      return;
    }
    if (путь === '/aiustaz/version.json') с.запросыВерсии.push({ кэш: String(запрос.headers['cache-control'] ?? '') });
    const цель = с.сборка === 'A' ? а.порт : б.порт;
    const к = http.request({ host: '127.0.0.1', port: цель, path: запрос.url, method: запрос.method, headers: запрос.headers }, (о) => {
      ответ.writeHead(о.statusCode ?? 502, о.headers);
      о.pipe(ответ);
    });
    к.on('error', () => ответ.writeHead(502).end());
    запрос.pipe(к);
  });
  await new Promise((готово) => сервер.listen(0, '127.0.0.1', готово));
  return {
    с,
    адрес: `http://127.0.0.1:${сервер.address().port}`,
    закрыть: async () => {
      await new Promise((з) => сервер.close(() => з()));
      await а.закрыть();
      await б.закрыть();
    },
  };
}

export async function обновлениеСквозной(браузер, { папкаСборки = process.env.DIST ?? path.join(корень, 'dist'), снимок = process.env.UPDATE_SHOT } = {}) {
  let проверок = 0;
  const проверить = (условие, что) => {
    if (!условие) throw new Error('ПРОВАЛ: ' + что);
    проверок += 1;
    console.log('  ✓ ' + что);
  };
  const коммитA = коммитИз(fs.readFileSync(path.join(папкаСборки, 'index.html'), 'utf8'));
  if (!коммитA) throw new Error('в сборке нет <meta name="aiustaz-commit"> — npm run export:web');
  const коммитB = crypto.createHash('sha1').update('сборка B ' + коммитA).digest('hex');
  const коммитC = crypto.createHash('sha1').update('сборка C ' + коммитA).digest('hex');
  const { папкаB, чанкA, чанкB } = собратьВторую(папкаСборки, коммитB);
  const п = await переключатель(папкаСборки, папкаB);
  const база = п.адрес;
  const адрес = (хэш) => база + '/aiustaz/index.html' + хэш;

  async function открыть({ язык = 'ru', sw = false, свой = true, флаг = true, ширина = 360, высота = 780 } = {}) {
    // sw — разрешить worker'ы в браузере; свой — и наш push-sw.js (флаг aiustaz:sw-test; без него — как на batr.kz).
    const к = await браузер.newContext({ viewport: { width: ширина, height: высота }, locale: язык === 'kk' ? 'kk-KZ' : 'ru-RU', timezoneId: 'Asia/Almaty', serviceWorkers: sw ? 'allow' : 'block' });
    await к.addInitScript(
      ({ прогресс, sw, флаг }) => {
        try {
          if (флаг) localStorage.setItem('aiustaz:update-test', '1');
          if (sw) localStorage.setItem('aiustaz:sw-test', '1');
          else localStorage.removeItem('aiustaz:sw-test');
          localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1');
          if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
        } catch {}
      },
      { прогресс: ПРОГРЕСС(язык), sw: sw && свой, флаг },
    );
    const стр = await к.newPage();
    await стр.clock.install();
    const ошибки = [];
    const чужие = [];
    let офлайн = false;
    стр.on('request', (з) => {
      const u = з.url();
      if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) чужие.push(u);
    });
    стр.on('console', (с) => {
      if (с.type() !== 'error') return;
      if (офлайн && /Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(с.text())) return;
      ошибки.push(с.text());
    });
    стр.on('pageerror', (е) => ошибки.push(String(е)));
    return {
      к,
      стр,
      полоса: () => стр.getByTestId('обновление'),
      есть: async () => (await стр.getByTestId('обновление').count()) > 0,
      метка: () => стр.evaluate(() => document.querySelector('meta[name="aiustaz-commit"]')?.getAttribute('content') ?? null),
      чанк: () => стр.evaluate(() => [...document.scripts].map((s) => new URL(s.src || location.href).pathname).find((p) => /\/index-[0-9a-f]{32}\.js$/.test(p)) ?? null),
      прогресс: () => стр.evaluate(() => JSON.parse(localStorage.getItem('aiustaz:progress.v1') ?? 'null')),
      сеть: async (есть) => {
        офлайн = !есть;
        await к.setOffline(!есть);
      },
      итог: (где) => {
        проверить(!ошибки.length, `${где}: ошибок в консоли нет` + (ошибки.length ? ' — ' + ошибки.join(' | ') : ''));
        проверить(!чужие.length, `${где}: запросов на другой адрес нет` + (чужие.length ? ' — ' + чужие.join(' | ') : ''));
      },
    };
  }
  /** Дождаться ещё одного запроса version.json (после старта или по таймеру). */
  const ждатьЗапрос = async (было, стр, мс = 15000) => {
    for (let т = 0; т < мс; т += 100) {
      if (п.с.запросыВерсии.length > было) {
        await стр.waitForTimeout(300); // ответ разобран, React отрисовал
        return true;
      }
      await стр.waitForTimeout(100);
    }
    return false;
  };
  /** Повторять проверку в странице (async), пока не вернёт истинное значение; итог — это значение или false. */
  const пока = async (стр, функция, арг, мс) => {
    for (let т = 0; т < мс; т += 500) {
      const з = await стр.evaluate(функция, арг).catch(() => false);
      if (з) return з;
      await стр.waitForTimeout(500);
    }
    return false;
  };
  const вернутьсяВоВкладку = (стр) => стр.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const нажатьИДождаться = async (стр, id) => {
    await Promise.all([стр.waitForEvent('load', { timeout: 30000 }), стр.getByTestId(id).first().click()]);
    await стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
  };

  try {
    console.log('1. Вкладка без worker\'а (360×780)');
    п.с.сборка = 'A';
    п.с.версия = коммитA;
    {
      const о = await открыть();
      const { стр } = о;
      let было = п.с.запросыВерсии.length;
      await стр.goto(адрес('#/'));
      await стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      проверить(await ждатьЗапрос(было, стр), 'после запуска приложение спросило /aiustaz/version.json');
      проверить(/no-cache/.test(п.с.запросыВерсии.at(-1).кэш) && !п.с.запросыВерсии.at(-1).cookie, `запрос без кэша и без cookie (Cache-Control: ${п.с.запросыВерсии.at(-1).кэш})`);
      проверить((await о.метка()) === коммитA && !(await о.есть()), `тот же коммит (${коммитA.slice(0, 7)}) — полосы нет`);

      п.с.версия = коммитC;
      было = п.с.запросыВерсии.length;
      await вернутьсяВоВкладку(стр);
      await стр.waitForTimeout(500);
      проверить(п.с.запросыВерсии.length === было, 'возвращение во вкладку чаще раза в минуту — без запроса');
      await стр.clock.fastForward(61_000);
      await вернутьсяВоВкладку(стр);
      проверить(await ждатьЗапрос(было, стр), 'вернулись во вкладку через минуту — спросили снова');
      await о.полоса().first().waitFor({ timeout: 5000 });
      const текст = (await о.полоса().first().innerText()).replace(/\u00a0/g, ' ');
      проверить(текст.includes('Вышло обновление AI Ustaz') && текст.includes('Обновить'), `другой коммит — полоса «Вышло обновление AI Ustaz» и «Обновить»`);
      const бп = await о.полоса().first().boundingBox();
      const бэ = await стр.getByTestId('экран-главная').first().boundingBox();
      const бм = await стр.getByTestId('нижнее-меню').first().boundingBox();
      проверить(бп && бэ && бм && бп.y < 20 && бп.y + бп.height <= бэ.y + 1, `полоса вверху над экраном (y ${Math.round(бп?.y)}–${Math.round((бп?.y ?? 0) + (бп?.height ?? 0))}, экран с ${Math.round(бэ?.y)})`);
      проверить(бм.y + бм.height <= 781 && бп.y + бп.height < бм.y, `нижнее меню на месте и не закрыто (y ${Math.round(бм.y)}, высота ${Math.round(бм.height)})`);
      проверить(бп.x >= 0 && бп.x + бп.width <= 360 && (await стр.evaluate(() => document.documentElement.scrollWidth)) <= 360, `полоса в ширину экрана 360 без горизонтальной прокрутки (высота ${Math.round(бп.height)})`);
      if (снимок) {
        await стр.evaluate(() => document.fonts.ready);
        await стр.screenshot({ path: снимок });
        console.log('    снимок: ' + снимок);
      }

      await стр.getByTestId('обновление-скрыть').first().click();
      проверить(!(await о.есть()), '«×» — полоса скрыта');
      проверить((await стр.evaluate(() => localStorage.getItem('aiustaz:update-dismissed.v1'))) === коммитC, 'запомнено: скрыта именно эта версия (только коммит)');
      было = п.с.запросыВерсии.length;
      await стр.reload();
      await стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      проверить((await ждатьЗапрос(было, стр)) && !(await о.есть()), 'после перезагрузки та же версия — полосы нет (скрыта до следующей)');

      п.с.сборка = 'B';
      п.с.версия = коммитB;
      было = п.с.запросыВерсии.length;
      await стр.clock.fastForward('10:01');
      проверить(await ждатьЗапрос(было, стр), 'через 10 минут спросили сами (вкладка видна)');
      await о.полоса().first().waitFor({ timeout: 5000 });
      проверить(true, 'вышла следующая версия — полоса снова есть');
      const прогрессДо = await о.прогресс();
      await нажатьИДождаться(стр, 'обновление-обновить');
      проверить((await о.метка()) === коммитB, `«Обновить» → открыта новая сборка (коммит ${коммитB.slice(0, 7)})`);
      проверить((await о.чанк()) === чанкB, `загружен новый JS (${path.basename(чанкB)})`);
      было = п.с.запросыВерсии.length;
      проверить((await ждатьЗапрос(было, стр)) && !(await о.есть()), 'после обновления версия совпала — полосы нет');
      проверить(JSON.stringify(await о.прогресс()) === JSON.stringify(прогрессДо), 'прогресс (localStorage) на месте');
      о.итог('вкладка');
      await о.к.close();
    }

    console.log('2. С service worker\'ом (как установленное приложение на aiustaz.pro)');
    п.с.сборка = 'A';
    п.с.версия = коммитA;
    {
      const о = await открыть({ sw: true, ширина: 412, высота: 800 });
      const { стр } = о;
      const было = п.с.запросыВерсии.length;
      await стр.goto(адрес('#/'));
      await стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      await стр.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      const оболочка = await пока(стр, async (чанк) => !!(await (await caches.open('aiustaz-файлы-v1')).match(чанк)) && !!(await (await caches.open('aiustaz-страница-v1')).match('/aiustaz/index.html')), чанкA, 30000);
      проверить(оболочка === true, 'worker A управляет страницей, оболочка и страница в кэше');
      await ждатьЗапрос(было, стр);
      проверить(!(await о.есть()), 'тот же коммит — полосы нет');
      const АЯТ = '/aiustaz-audio/128/ar.husary/1.mp3';
      await стр.evaluate(async (а) => (await caches.open('aiustaz-аудио-v1')).put(а, new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } })), АЯТ);
      const прогрессДо = await о.прогресс();

      п.с.сборка = 'B';
      п.с.версия = коммитB;
      await стр.clock.fastForward('10:01');
      await о.полоса().first().waitFor({ timeout: 15000 });
      проверить(true, 'выпуск B — полоса «Вышло обновление»');
      await нажатьИДождаться(стр, 'обновление-обновить');
      проверить((await о.метка()) === коммитB && (await о.чанк()) === чанкB, `«Обновить» → сборка B (коммит ${коммитB.slice(0, 7)}, ${path.basename(чанкB)})`);
      const списокB = /'(\/aiustaz\/offline\/files\.[0-9a-f]{20}\.json)'/.exec(fs.readFileSync(path.join(папкаB, 'push-sw.js'), 'utf8'))[1];
      let новый = await пока(
        стр,
        async ([список, старый]) => {
          const ф = await caches.open('aiustaz-файлы-v1');
          const с = await (await caches.open('aiustaz-страница-v1')).match('/aiustaz/index.html');
          const м = /aiustaz-commit" content="([0-9a-f]+)"/.exec(с ? await с.text() : '');
          return !!(await ф.match(список)) && !(await ф.match(старый)) && м ? м[1] : false;
        },
        [списокB, чанкA],
        // Новый worker докачивает всю офлайн-оболочку (с таймингами слов — сотни файлов): под нагрузкой полного
        // прогона это дольше минуты.
        180000,
      );
      if (новый !== коммитB && (await стр.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting))) {
        // Изредка (Chromium, под нагрузкой) старый worker не отпускает вкладку и новый остаётся «ждущим», хотя страница
        // уже B. Человек этого не видит: сборка новая, а старые файлы почистятся, когда вкладка закроется. Проверяем
        // именно это — закрыли вкладку (ушли со страницы) и открыли снова, — и пишем в лог, что так было.
        console.log('    заметка: новый worker ждал старый — проверяем после закрытия вкладки');
        await стр.goto('about:blank');
        await стр.waitForTimeout(1500);
        await стр.goto(адрес('#/'));
        новый = await пока(
          стр,
          async ([список, старый]) => {
            const ф = await caches.open('aiustaz-файлы-v1');
            const с = await (await caches.open('aiustaz-страница-v1')).match('/aiustaz/index.html');
            const м = /aiustaz-commit" content="([0-9a-f]+)"/.exec(с ? await с.text() : '');
            return !!(await ф.match(список)) && !(await ф.match(старый)) && м ? м[1] : false;
          },
          [списокB, чанкA],
          60000,
        );
      }
      if (новый !== коммитB) {
        console.log('    отладка: ' + JSON.stringify(await стр.evaluate(async ([список, старый]) => {
          const ф = await caches.open('aiustaz-файлы-v1');
          const с = await (await caches.open('aiustaz-страница-v1')).match('/aiustaz/index.html');
          const т = с ? await с.text() : '';
          const рег = await navigator.serviceWorker.getRegistration();
          return { список: !!(await ф.match(список)), старый: !!(await ф.match(старый)), метка: (/aiustaz-commit" content="([0-9a-f]+)"/.exec(т) || [])[1] || null,
            ключей: (await ф.keys()).length, активный: рег?.active?.scriptURL, ждёт: !!рег?.waiting, ставится: !!рег?.installing, кэши: await caches.keys() };
        }, [списокB, чанкA])));
      }
      проверить(новый === коммитB, 'новый worker: список офлайн B в кэше, старого чанка нет, сохранённая страница — B');
      проверить(await стр.evaluate(async (а) => !!(await (await caches.open('aiustaz-аудио-v1')).match(а)), АЯТ), 'скачанное чтение (aiustaz-аудио-v1) не удалено');
      проверить(JSON.stringify(await о.прогресс()) === JSON.stringify(прогрессДо), 'прогресс (localStorage) на месте');
      await о.сеть(false);
      await стр.reload();
      await стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      проверить((await о.метка()) === коммитB && (await о.чанк()) === чанкB, 'без сети открывается уже новая сборка B (из кэша worker\'а)');
      await стр.clock.fastForward('10:01');
      await вернутьсяВоВкладку(стр);
      await стр.waitForTimeout(500);
      проверить(!(await о.есть()), 'без сети — полосы и сообщений нет');
      await о.сеть(true);
      о.итог('с worker\'ом');
      await о.к.close();
    }

    console.log('3. Без флага, без сети, kk');
    п.с.сборка = 'B';
    п.с.версия = коммитC;
    {
      const о = await открыть({ флаг: false });
      const было = п.с.запросыВерсии.length;
      await о.стр.goto(адрес('#/'));
      await о.стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      await о.стр.waitForTimeout(4000);
      await о.стр.clock.fastForward('10:01');
      await о.стр.waitForTimeout(300);
      проверить(п.с.запросыВерсии.length === было && !(await о.есть()), '127.0.0.1 без тестового флага — ни одного запроса version.json, полосы нет');
      о.итог('без флага');
      await о.к.close();
    }
    {
      const о = await открыть();
      await о.стр.goto(адрес('#/'));
      await о.стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      await о.сеть(false);
      const было = п.с.запросыВерсии.length;
      await о.стр.clock.fastForward('10:01');
      await вернутьсяВоВкладку(о.стр);
      await о.стр.waitForTimeout(500);
      проверить(п.с.запросыВерсии.length === было && !(await о.есть()), 'без сети — запросов нет, полосы нет');
      await о.сеть(true);
      о.итог('без сети');
      await о.к.close();
    }
    {
      const о = await открыть({ язык: 'kk' });
      await о.стр.goto(адрес('#/'));
      await о.полоса().first().waitFor({ timeout: 15000 });
      const т = (await о.полоса().first().innerText()).replace(/\u00a0/g, ' ');
      проверить(т.includes('AI Ustaz жаңартылды') && т.includes('Жаңарту'), 'kk: «AI Ustaz жаңартылды» и «Жаңарту» (черновик)');
      о.итог('kk');
      await о.к.close();
    }

    console.log('4. batr.kz: страницей управляет worker сайта (cache-first для статики)');
    п.с.сборка = 'A';
    п.с.версия = коммитA;
    {
      const о = await открыть({ sw: true, свой: false, ширина: 412, высота: 800 });
      const { стр } = о;
      await стр.goto(адрес('#/'));
      await стр.getByTestId('экран-главная').first().waitFor({ timeout: 20000 });
      await стр.evaluate(() => navigator.serviceWorker.register('/batr-sw.js', { scope: '/' }));
      await стр.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      await стр.clock.fastForward(61_000);
      await вернутьсяВоВкладку(стр);
      const вКэше = await пока(стр, async () => !!(await (await caches.open('world-v7')).match('/aiustaz/version.json')), null, 15000);
      проверить(вКэше && !(await о.есть()), 'worker «сайта» положил version.json (тот же коммит) в свой кэш, полосы нет');
      п.с.версия = коммитC;
      const было = п.с.запросыВерсии.length;
      await стр.clock.fastForward(61_000);
      await вернутьсяВоВкладку(стр);
      проверить(await ждатьЗапрос(было, стр), 'следующая проверка дошла до сервера, а не до кэша чужого worker\'а');
      await о.полоса().first().waitFor({ timeout: 5000 });
      проверить(true, 'новая версия видна и при worker\'е сайта BATR — полоса есть');
      const ключи = await стр.evaluate(async () => (await (await caches.open('world-v7')).keys()).map((з) => new URL(з.url).pathname).filter((п_) => п_.endsWith('version.json')));
      проверить(ключи.length <= 1, `в кэше чужого worker'а не копятся записи version.json (${ключи.length})`);
      о.итог('batr.kz');
      await о.к.close();
    }
  } finally {
    await п.закрыть();
    fs.rmSync(папкаB, { recursive: true, force: true });
  }
  return проверок;
}

// Запуск напрямую.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const браузер = await chromium.launch();
  try {
    const н = await обновлениеСквозной(браузер);
    console.log(`\nOK: обновление — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
  }
}
