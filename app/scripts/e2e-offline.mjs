#!/usr/bin/env node
/**
 * Сквозной тест работы без сети (Playwright, Chromium, настоящий service worker).
 *
 * Владелец 27.11.2026: «пусть все суры и другая информация сохраняются, чтобы не грузить заново каждый раз и чтобы можно
 * было пользоваться офлайн». Worker — public/push-sw.js (он же уведомления), страница — src/offline/offline.ts.
 *
 * Сервер — scripts/serve-test.mjs на 127.0.0.1 (localhost — безопасный контекст, worker разрешён). На 127.0.0.1 worker
 * регистрируется только с тестовым флагом localStorage «aiustaz:sw-test» = «1» (в проде — только aiustaz.pro).
 *   1. первый заход с сетью: worker активен и управляет страницей; фоном докачаны Коран, зикры, махраджи, «Учимся намазу» целиком
 *      (сообщение «состояние»: есть = всего); оболочка в кэше;
 *   2. без сети (context.setOffline): перезагрузка — главная; «Коран» — список сур; суры 114 и 2 открываются; зикры и
 *      «Как произносить буквы» открываются; хадисы, которые не скачивали, — понятное «Нет связи»;
 *   3. с сетью «Скачать хадисы для офлайн» → ход → «Хадисы сохранены»; снова без сети — раздел и хадис открываются;
 *   4. ни ошибок в консоли (кроме сетевых без сети), ни запросов на другой адрес.
 * Запуск: node scripts/e2e-offline.mjs (после npm run export:web). Из e2e.mjs — офлайнСквозной(браузер, база).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { данныеХадисов } from './e2e-hadith.mjs';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const ПРОГРЕСС = {
  версия: 1,
  язык: 'ru',
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
};

export async function офлайнСквозной(браузер, база, папкаСборки = process.env.DIST ?? new URL('../dist', import.meta.url).pathname) {
  let проверок = 0;
  const проверить = (условие, что) => {
    if (!условие) throw new Error('ПРОВАЛ: ' + что);
    проверок += 1;
    console.log('  ✓ ' + что);
  };
  const адрес = (хэш) => база + '/aiustaz/index.html' + хэш;
  const контекст = await браузер.newContext({ viewport: { width: 412, height: 800 }, locale: 'ru-RU', timezoneId: 'Asia/Almaty', serviceWorkers: 'allow' });
  await контекст.addInitScript((прогресс) => {
    try {
      localStorage.setItem('aiustaz:sw-test', '1');
      if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс)); try { localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); } catch {} // лист первого выбора чтеца — свой тест (e2e-download.mjs)
    } catch {}
  }, ПРОГРЕСС);
  const стр = await контекст.newPage();
  const чужие = [];
  стр.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) чужие.push(u);
  });
  const ждать = (id, мс = 20000) => стр.getByTestId(id).first().waitFor({ timeout: мс });
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const состояние = () =>
    стр.evaluate(
      () =>
        new Promise((готово) => {
          const к = new MessageChannel();
          к.port1.onmessage = (е) => готово(е.data);
          navigator.serviceWorker.controller.postMessage({ тип: 'состояние' }, [к.port2]);
          setTimeout(() => готово(null), 10000);
        }),
    );

  try {
    console.log('1. Первый заход с сетью: worker и фоновая докачка');
    await стр.goto(адрес('#/'));
    await ждать('экран-главная');
    await стр.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    const рег = await стр.evaluate(async () => {
      const р = await navigator.serviceWorker.getRegistration('/aiustaz/');
      return { область: р?.scope, адрес: р?.active?.scriptURL };
    });
    проверить(рег.адрес?.endsWith('/aiustaz/push-sw.js') && рег.область?.endsWith('/aiustaz/'), `worker /aiustaz/push-sw.js управляет страницей (${рег.область})`);
    let с = null;
    for (let i = 0; i < 120; i++) {
      с = await состояние();
      const г = с?.группы ?? {};
      if (['коран', 'зикры', 'махраджи', 'учимсяНамазу'].every((и) => г[и] && г[и].есть === г[и].всего) && с.оболочка) break;
      await стр.waitForTimeout(1000);
    }
    const г = с?.группы ?? {};
    проверить(с?.оболочка === true, 'оболочка приложения (JS, шрифты, значки) в кэше');
    for (const и of ['коран', 'зикры', 'махраджи', 'учимсяНамазу']) проверить(г[и] && г[и].всего > 0 && г[и].есть === г[и].всего, `фоном докачано: ${и} — ${г[и]?.есть} из ${г[и]?.всего}`);
    проверить((г.хадисы?.есть ?? 0) < (г.хадисы?.всего ?? 1), 'хадисы сами не качаются (≈7 МБ — по кнопке)');

    console.log('2. Без сети');
    await контекст.setOffline(true);
    await стр.reload();
    await ждать('экран-главная');
    проверить(true, 'без сети: главная открывается (index.html и JS из кэша)');
    await стр.goto(адрес('#/quran'));
    await ждать('коран-список');
    проверить(true, 'без сети: «Коран» — список сур');
    for (const [сура, аят] of [
      [114, 1],
      [2, 255],
    ]) {
      await стр.goto(адрес(`#/quran/sura?n=${сура}&a=${аят}`));
      await ждать('экран-сура');
      await стр.waitForFunction(([с_, а_]) => !!document.querySelector(`[data-ayah="${с_}:${а_}"], [data-testid="коран-аят-${с_}-${а_}"]`), [сура, аят], { timeout: 20000 });
      проверить(!(await есть('коран-нет-связи')), `без сети: сура ${сура}, аят ${аят} открывается`);
    }
    await стр.goto(адрес('#/dhikr'));
    await ждать('зикры-список');
    проверить(true, 'без сети: зикры открываются');
    await стр.goto(адрес('#/namaz/section?n=4&a=2'));
    await ждать('намаз-шаг-заголовок');
    проверить(true, 'без сети: «Учимся намазу» открывается (раздел шагов)');
    await стр.goto(адрес('#/makharij'));
    await стр.waitForFunction(() => !!document.querySelector('[data-testid^="махрадж-буква-"]'), null, { timeout: 20000 });
    проверить(true, 'без сети: «Как произносить буквы» открываются');
    await стр.goto(адрес('#/hadith'));
    await ждать('хадисы-нет-связи');
    проверить(true, 'без сети: хадисы, которые не скачивали, — понятное «Нет связи»');

    console.log('3. «Скачать хадисы для офлайн»');
    await контекст.setOffline(false);
    await стр.reload();
    await ждать('офлайн-хадисы-скачать');
    проверить((await стр.getByTestId('офлайн-хадисы-скачать').first().innerText()).includes('МБ'), 'кнопка с размером в МБ');
    await стр.getByTestId('офлайн-хадисы-скачать').first().click();
    await ждать('офлайн-хадисы-готово', 120000);
    проверить(true, '«Хадисы сохранены — открываются без интернета»');
    await контекст.setOffline(true);
    await стр.reload();
    await ждать('хадисы-разделы');
    проверить(!(await есть('хадисы-нет-связи')), 'без сети: раздел «Хадисы» открывается');
    const { индекс } = данныеХадисов(папкаСборки);
    const первый = индекс.хадисы[0].id;
    await стр.goto(адрес(`#/hadith/item?n=${первый}`));
    await ждать('хадис-перевод');
    проверить(!(await есть('хадисы-нет-связи')), `без сети: хадис № ${первый} открывается с переводом`);
    проверить(чужие.length === 0, `ни одного запроса на другой адрес (${чужие.slice(0, 3).join(', ')})`);
  } finally {
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
    const н = await офлайнСквозной(браузер, сервер.адрес);
    console.log(`\nOK: без сети — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
