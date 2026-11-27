#!/usr/bin/env node
/**
 * Сквозной тест: своё зеркало аудио, «Скачать аят» / «Скачать суру», прослушивание без сети, «Скачанное чтение»,
 * выбор чтеца при первом заходе на «Коран» с прослушиванием аль-Фатихи (Playwright, Chromium, настоящий service worker).
 *
 * Владелец 27.11.2026: «Весь Коран нам нужно скачать на наши сервера, из наших серверов отдавать… кнопка „Скачать“ по
 * каждому аяту. Человек, если скачивает, то он может в любое время без интернета слушать»; «Когда человек только заходит
 * на Коран, нужно поставить выбор чтеца. Рядом должно быть воспроизведение. Аль-Фатиху можешь поставить».
 *
 * Сервер — scripts/serve-test.mjs на 127.0.0.1 с подделкой зеркала /aiustaz-audio/: editions.json — только аль-Хусари
 * (128/ar.husary), файлы — ТЕСТОВЫЕ ТОНЫ (не Коран). CDN AlQuran Cloud — page.route, тоже тоны. Флаги localStorage:
 * «aiustaz:audio-mirror-test» (спрашивать список зеркала на 127.0.0.1) и «aiustaz:sw-test» (service worker).
 *   1. первый заход на «Коран» (без worker'а): лист «Выберите чтеца» — семь чтецов, у каждого ▶; ▶ Айюба → 1:1 с CDN
 *      (…/ar.muhammadayyoub/1.mp3), ▶ Хусари → 1:1 со своего зеркала (/aiustaz-audio/128/ar.husary/1.mp3), Айюб
 *      замолкает; повторное ▶ — пауза; выбор Айюба → «Выбрать» → на устройстве ayyub, лист больше не появляется; сура
 *      играет Айюбом; снимки audio-reciter-ru;
 *   2. kk — лист по-казахски (черновик), «Пропустить» — чтец по умолчанию; снимок audio-reciter-kk;
 *   3. с worker'ом: Хусари; сура 112 → меню ⚙ → «Скачать суру» → «Сура скачана» (5 файлов: бисмилла 1:1 и 112:1–4, только
 *      свой домен); аят 113:1 → «Скачать аят» → «Аят скачан» (+ 6226.mp3); у чтеца без зеркала (Айюб) кнопок нет;
 *   4. без сети (context.setOffline): сура 112 открывается, «Слушать» — звучит из кэша worker'а (подсветка 112:1 → 112:2);
 *   5. «Ещё» → «Скачанное чтение: Хусари — 6 аятов» → «Удалить» → пусто; снимки audio-dl-*;
 *   6. ни ошибок в консоли (кроме сетевых без сети), ни нарушений CSP, ни чужих запросов (кроме media CDN).
 * Запуск: node scripts/e2e-download.mjs (после npm run export:web). Снимки — DOWNLOAD_SHOTS=папка (360×780).
 * Из e2e.mjs — загрузкаСквозной(браузер).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { тон } from './e2e-quran.mjs';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
});
const СПИСОК = JSON.stringify({ version: 1, editions: [{ edition: 'ar.husary', bitrate: 128, count: 6236, bytes: 1, published: '2026-11-27T00:00:00Z' }] });
const ФАЙЛ = /^\/aiustaz-audio\/128\/ar\.husary\/(\d+)\.mp3$/;

/** Что сервер зеркала отдал (путь) — запросы <audio> и service worker'а видны здесь надёжнее, чем в событиях страницы. */
const отдано = [];

/** Подделка зеркала: список и тоны 0,6 с (частота от номера аята), НЕ Коран. */
function зеркало(путь) {
  отдано.push(путь);
  if (путь === '/aiustaz-audio/editions.json') return { тип: 'application/json', тело: Buffer.from(СПИСОК) };
  const м = ФАЙЛ.exec(путь);
  if (!м || Number(м[1]) < 1 || Number(м[1]) > 6236) return null;
  return { тип: 'audio/wav', тело: тон(0.6, 300 + (Number(м[1]) % 40) * 20) };
}

export async function загрузкаСквозной(браузер, { папкаСнимков = process.env.DOWNLOAD_SHOTS } = {}) {
  const сервер = await запуститьСервер({ порт: 0, аудио: зеркало });
  const база = сервер.адрес;
  let проверок = 0;
  const проверить = (условие, что) => {
    if (!условие) throw new Error('ПРОВАЛ: ' + что);
    проверок += 1;
    console.log('  ✓ ' + что);
  };
  const адрес = (хэш) => база + '/aiustaz/index.html' + хэш;
  const снимок = async (стр, имя) => {
    if (!папкаСнимков) return;
    await стр.evaluate(() => document.fonts.ready);
    await стр.screenshot({ path: path.join(папкаСнимков, имя + '.png') });
  };

  async function контекст({ язык = 'ru', sw = false } = {}) {
    const к = await браузер.newContext({ viewport: { width: 360, height: 780 }, locale: язык === 'kk' ? 'kk-KZ' : 'ru-RU', timezoneId: 'Asia/Almaty', serviceWorkers: sw ? 'allow' : 'block' });
    await к.addInitScript(
      ({ прогресс, sw }) => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
        try {
          localStorage.setItem('aiustaz:audio-mirror-test', '1');
          if (sw) localStorage.setItem('aiustaz:sw-test', '1');
          if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
        } catch {}
      },
      { прогресс: ПРОГРЕСС(язык), sw },
    );
    const cdn = [];
    await к.route(/^https:\/\/cdn\.islamic\.network\//, async (маршрут) => {
      const u = маршрут.request().url();
      const м = /\/quran\/audio\/\d+\/ar\.[a-z0-9-]+\/(\d+)\.mp3$/.exec(u);
      if (!м) return маршрут.abort();
      cdn.push(u);
      await маршрут.fulfill({ status: 200, contentType: 'audio/wav', body: тон(0.6, 300 + Number(м[1]) * 20) });
    });
    const стр = await к.newPage();
    const свои = [];
    const чужие = [];
    const ошибки = [];
    let офлайн = false;
    стр.on('request', (з) => {
      const u = з.url();
      if (u.startsWith(база + '/aiustaz-audio/')) свои.push(u.slice(база.length));
      else if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('https://cdn.islamic.network/quran/audio/')) чужие.push(u);
    });
    стр.on('console', (с) => {
      if (с.type() !== 'error') return;
      const т = с.text();
      if (офлайн && /Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(т)) return;
      ошибки.push(т);
    });
    стр.on('pageerror', (е) => ошибки.push(String(е)));
    const э = (id) => стр.getByTestId(id).first();
    const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
    const нажат = (id) => э(id).getAttribute('aria-pressed');
    return {
      к,
      стр,
      э,
      есть,
      нажат,
      cdn,
      свои,
      итог: async (где) => {
        const csp = await стр.evaluate(() => window.__csp ?? []);
        проверить(!ошибки.length, `${где}: ошибок в консоли нет` + (ошибки.length ? ' — ' + ошибки.join(' | ') : ''));
        проверить(!csp.length, `${где}: нарушений CSP нет` + (csp.length ? ' — ' + csp.join(' | ') : ''));
        проверить(!чужие.length, `${где}: чужих запросов нет` + (чужие.length ? ' — ' + чужие.join(' | ') : ''));
      },
      сеть: async (есть) => {
        офлайн = !есть;
        await к.setOffline(!есть);
      },
    };
  }

  try {
    console.log('1. Первый заход на «Коран»: выбор чтеца с прослушиванием аль-Фатихи');
    {
      const р = await контекст();
      await р.стр.goto(адрес('#/quran'));
      await р.э('чтец-первый').waitFor({ timeout: 20000 });
      const чтецы = await р.стр.evaluate(() =>
        [...document.querySelectorAll('[data-testid="чтец-первый"] [data-testid^="чтец-"]')].map((е) => е.getAttribute('data-testid')).filter((id) => /^чтец-[a-z-]+$/.test(id) && !/первый|выбор|атрибуция/.test(id)),
      );
      проверить(чтецы.join() === 'чтец-husary,чтец-husary-mujawwad,чтец-abdulbasit,чтец-ayyub,чтец-suwayd,чтец-shatri,чтец-alafasy-cdn', `лист «Выберите чтеца»: семь чтецов (${чтецы.join(', ')})`);
      for (const id of чтецы) проверить(await р.есть(id + '-слушать'), `у ${id} — кнопка ▶ «Послушать»`);
      проверить((await р.нажат('чтец-husary')) === 'true', 'по умолчанию отмечен аль-Хусари');
      проверить(/муджаввад/.test(await р.э('чтец-husary-mujawwad').innerText()) && /муратталь/.test(await р.э('чтец-ayyub').innerText()), 'стиль чтения: муджаввад / муратталь');
      await снимок(р.стр, 'audio-reciter-ru');

      await р.э('чтец-ayyub-слушать').click();
      await р.стр.waitForFunction(() => document.querySelector('[data-testid="чтец-ayyub-слушать"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
      await р.стр.waitForTimeout(300);
      проверить(р.cdn.includes('https://cdn.islamic.network/quran/audio/128/ar.muhammadayyoub/1.mp3'), '▶ Айюба → аль-Фатиха 1:1 с CDN (…/128/ar.muhammadayyoub/1.mp3: зеркала Айюба нет)');
      // Фатиха идёт аят за аятом: тон 0,6 с → 1:2.
      const дождатьсяCdn = async (u, мс = 6000) => {
        for (let i = 0; i < мс / 100; i++) {
          if (р.cdn.includes(u)) return true;
          await р.стр.waitForTimeout(100);
        }
        return false;
      };
      проверить(await дождатьсяCdn('https://cdn.islamic.network/quran/audio/128/ar.muhammadayyoub/2.mp3'), 'Фатиха Айюба продолжается: 1:2');

      await р.э('чтец-husary-слушать').click();
      await р.стр.waitForFunction(() => document.querySelector('[data-testid="чтец-husary-слушать"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
      await р.стр.waitForTimeout(300);
      проверить(отдано.includes('/aiustaz-audio/128/ar.husary/1.mp3'), '▶ Хусари → 1:1 со своего зеркала (/aiustaz-audio/128/ar.husary/1.mp3)');
      проверить((await р.нажат('чтец-ayyub-слушать')) === 'false', 'Айюб замолк — звучит один чтец');
      await р.э('чтец-husary-слушать').click();
      проверить((await р.нажат('чтец-husary-слушать')) === 'false', 'повторное ▶ — пауза');

      await р.э('чтец-ayyub').click();
      проверить((await р.нажат('чтец-ayyub')) === 'true' && (await р.нажат('чтец-husary')) === 'false', 'нажатие на строку — отмечен Айюб');
      await р.э('чтец-первый-выбрать').click();
      await р.э('чтец-первый').waitFor({ state: 'detached', timeout: 3000 });
      const хран = await р.стр.evaluate(() => [localStorage.getItem('aiustaz:quran-reciter.v1'), localStorage.getItem('aiustaz:quran-reciter-asked.v1')]);
      проверить(хран[0] === 'ayyub' && хран[1] === '1', `«Выбрать» — на устройстве чтец ${хран[0]}, лист отмечен (${хран[1]})`);
      await р.стр.reload();
      await р.э('экран-коран').waitFor({ timeout: 20000 });
      await р.стр.waitForTimeout(500);
      проверить(!(await р.есть('чтец-первый')), 'повторный заход — листа нет');
      await р.стр.goto(адрес('#/quran/sura?n=112'));
      await р.э('сура-слушать').waitFor({ timeout: 15000 });
      const до = р.cdn.length;
      await р.э('сура-слушать').click();
      await р.стр.waitForTimeout(800);
      проверить(р.cdn.slice(до).some((u) => /\/ar\.muhammadayyoub\//.test(u)), 'сура играет выбранным чтецом (Айюб)');
      await р.итог('выбор чтеца');
      await р.к.close();
    }

    console.log('2. kk: лист по-казахски, «Пропустить»');
    {
      const р = await контекст({ язык: 'kk' });
      await р.стр.goto(адрес('#/quran'));
      await р.э('чтец-первый').waitFor({ timeout: 20000 });
      const т = await р.э('чтец-первый').innerText();
      проверить(/Қариды таңдаңыз/.test(т) && /Таңдау/.test(т), 'kk: «Қариды таңдаңыз», «Таңдау»');
      await снимок(р.стр, 'audio-reciter-kk');
      await р.э('чтец-первый-пропустить').click();
      await р.э('чтец-первый').waitFor({ state: 'detached', timeout: 3000 });
      const хран = await р.стр.evaluate(() => [localStorage.getItem('aiustaz:quran-reciter.v1'), localStorage.getItem('aiustaz:quran-reciter-asked.v1')]);
      проверить(хран[0] === null && хран[1] === '1', '«Пропустить» — чтец по умолчанию (не записан), лист больше не покажется');
      await р.итог('kk');
      await р.к.close();
    }

    console.log('3. Скачать суру и аят (своё зеркало, service worker)');
    const р = await контекст({ sw: true });
    await р.стр.addInitScript(() => {
      try {
        localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1');
      } catch {}
    });
    await р.стр.goto(адрес('#/quran/sura?n=112'));
    await р.э('сура-слушать').waitFor({ timeout: 20000 });
    await р.стр.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    проверить(true, 'service worker управляет страницей');
    await р.стр.reload();
    await р.э('сура-слушать').waitFor({ timeout: 20000 });
    await р.э('сура-вид').click();
    await р.э('сура-меню').waitFor({ timeout: 3000 });
    await р.э('скачать-суру-кнопка').waitFor({ timeout: 5000 });
    await снимок(р.стр, 'audio-dl-sura-before');
    await р.э('скачать-суру-кнопка').click();
    await р.э('скачать-суру-готово').waitFor({ timeout: 15000 });
    const вКэше = () =>
      р.стр.evaluate(async () => (await (await caches.open('aiustaz-аудио-v1')).keys()).map((з) => new URL(з.url).pathname).sort());
    let кэш = await вКэше();
    const ждём112 = ['1', '6222', '6223', '6224', '6225'].map((н) => '/aiustaz-audio/128/ar.husary/' + н + '.mp3').sort();
    проверить(JSON.stringify(кэш) === JSON.stringify(ждём112), `«Скачать суру» 112 → в кэше 5 файлов: бисмилла и 112:1–4 (${кэш.length})`);
    проверить(/скачана/.test(await р.э('скачать-суру-готово').innerText()), '«Сура скачана — слушается без интернета»');
    await снимок(р.стр, 'audio-dl-sura');
    проверить(р.cdn.length === 0, 'скачивание — только со своего домена (к CDN ни одного запроса)');
    await р.стр.keyboard.press('Escape');

    await р.стр.goto(адрес('#/quran/sura?n=113'));
    await р.э('коран-аят-113-1-текст').waitFor({ timeout: 15000 });
    await р.э('коран-аят-113-1-текст').click();
    await р.э('сура-действия').waitFor({ timeout: 3000 });
    await р.э('действия-скачать').click();
    await р.э('действия-скачано').waitFor({ timeout: 10000 });
    кэш = await вКэше();
    проверить(кэш.includes('/aiustaz-audio/128/ar.husary/6226.mp3') && кэш.length === 6, `«Скачать аят» 113:1 → +6226.mp3 (бисмилла уже есть), всего ${кэш.length}`);
    await снимок(р.стр, 'audio-dl-ayah');
    await р.стр.keyboard.press('Escape');

    // У чтеца без зеркала скачивать нельзя.
    await р.стр.evaluate(() => localStorage.setItem('aiustaz:quran-reciter.v1', 'ayyub'));
    await р.стр.reload();
    await р.э('коран-аят-113-2-текст').waitFor({ timeout: 15000 });
    await р.э('коран-аят-113-2-текст').click();
    await р.э('сура-действия').waitFor({ timeout: 3000 });
    проверить(!(await р.есть('действия-скачать')) && !(await р.есть('действия-скачано')), 'Айюб (нет зеркала): кнопки «Скачать аят» нет');
    await р.стр.keyboard.press('Escape');
    await р.стр.evaluate(() => localStorage.setItem('aiustaz:quran-reciter.v1', 'husary'));

    console.log('4. Без сети: скачанная сура звучит');
    await р.сеть(false);
    await р.стр.goto(адрес('#/quran/sura?n=112'));
    await р.э('сура-слушать').waitFor({ timeout: 20000 });
    const отданоДо = отдано.length;
    await р.э('сура-слушать').click();
    await р.стр.waitForFunction(() => document.querySelector('[aria-current="true"]')?.getAttribute('data-testid') === 'коран-аят-112-2', null, { timeout: 15000 });
    проверить(true, 'без сети: «Слушать» — 112:1 отзвучал, подсвечен 112:2 (файлы из кэша)');
    проверить(отдано.length === отданоДо, 'без сети сервер зеркала не спрашивали — звучит скачанное из кэша service worker\'а');
    await р.стр.evaluate(() => document.querySelector('[data-testid="сура-слушать"]')?.click());
    await р.сеть(true);

    console.log('5. «Ещё» → «Скачанное чтение» → «Удалить»');
    await р.стр.goto(адрес('#/more'));
    await р.э('скачанное-ar.husary').waitFor({ timeout: 15000 });
    await р.э('скачанное').scrollIntoViewIfNeeded();
    const строка = await р.э('скачанное-ar.husary').innerText();
    проверить(/Махмуд Халил аль-Хусари: 6 аятов, [\d.]+ МБ/.test(строка), `«Скачанное чтение»: «${строка.split('\n')[0]}»`);
    await снимок(р.стр, 'audio-dl-more');
    await р.э('скачанное-ar.husary-удалить').click();
    await р.э('скачанное-ar.husary').waitFor({ state: 'detached', timeout: 5000 });
    проверить((await вКэше()).length === 0 && /пока нет/.test(await р.э('скачанное').innerText()), '«Удалить» — кэш пуст, «Скачанного чтения пока нет»');
    await р.итог('скачивание');
    await р.к.close();
  } finally {
    await сервер.закрыть();
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { chromium } = require('playwright');
  const браузер = await chromium.launch();
  try {
    const н = await загрузкаСквозной(браузер);
    console.log(`\nOK: ${н} проверок`);
  } finally {
    await браузер.close();
  }
}
