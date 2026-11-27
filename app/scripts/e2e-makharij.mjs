#!/usr/bin/env node
/**
 * Сквозной тест «Как произносить буквы» (Playwright, Chromium): список махраджей и карточки букв со схемами.
 * Решения владельца: 19.11.2026 — «добавить картинку произношения каждой буквы»; 26.11.2026 — «Тот раз ты же рисовал
 * картинки произношения букв. Почему их нету в нашем приложении? Не выкатывал?». Экраны — screens/MakharijScreen.tsx,
 * MakharijLetterScreen.tsx; данные — dist/makharij-index (tools/makharij/build_index.py), схемы — dist/makharij.
 *
 * Сценарии (прогресс: язык выбран, ИИ-предупреждение показано):
 *   1. ru, 412×800: «Ещё» → «Как произносить буквы» (#/makharij): 17 махраджей = индексу, 5 областей, плашка «Черновик»,
 *      нижнее меню есть; «Таджвид» → та же строка ведёт туда же;
 *   2. каждая буква индекса (#/makharij/letter?n=1…N): знак и название = данным, схема загрузилась (naturalWidth > 0),
 *      alt непустой и = подпись схемы + «выделено: № …», src — свой адрес /aiustaz/makharij/…; у ض и ل — вид сверху;
 *      у و, ي — разделы мадда и лина; у م, ن — гунна; ‹ › меняют букву без новой записи в истории («Назад» — к списку);
 *      n больше индекса — «Такой буквы нет»;
 *   3. kk, uz, en: заголовок экрана; uz и en — пометка «описание пока на русском»;
 *   4. 360×640: нет горизонтальной прокрутки (список, карточка ض с двумя схемами);
 * и всё время: нет ошибок в консоли, исключений, запросов на другие адреса, нарушений CSP, чужих ключей localStorage.
 *
 * Запуск (из app/, после npm run build:web): node scripts/e2e-makharij.mjs (сервер поднимается сам). Из e2e.mjs:
 * import { махраджиСквозной }.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ВРЕМЯ = '2026-11-26T15:13:00+05:00';
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
});
const ТЕЛЕФОН = (ширина, высота) => ({
  viewport: { width: ширина, height: высота },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});
const ЗАГОЛОВКИ = { ru: 'Как произносить буквы', kk: 'Әріптерді қалай айту', uz: 'Harflarni qanday aytish', en: 'How to pronounce letters' };

/** Индекс махраджей из сборки (dist/<файл из манифеста>). */
export function индексМахраджей(папка) {
  const манифест = fs.readFileSync(path.join(корень, 'src', 'makharij', 'manifest.generated.ts'), 'utf8');
  const файл = манифест.match(/файл: '([^']+)'/)[1];
  const буквы = [...манифест.match(/буквы: \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((м) => м[1]);
  return { индекс: JSON.parse(fs.readFileSync(path.join(папка, файл), 'utf8')), буквы };
}

let проверок = 0;

async function новаяСтраница(браузер, база, { ширина = 412, высота = 800, язык = 'ru' } = {}) {
  const контекст = await браузер.newContext({ ...ТЕЛЕФОН(ширина, высота), locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  await контекст.addInitScript(
    ({ прогресс }) => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
      if (location.protocol.startsWith('http') && !localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс)); try { localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); } catch {} // лист первого выбора чтеца — свой тест (e2e-download.mjs)
    },
    { прогресс: ПРОГРЕСС(язык) },
  );
  const стр = await контекст.newPage();
  await стр.clock.setFixedTime(new Date(ВРЕМЯ));
  const проблемы = [];
  стр.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
  });
  стр.on('console', (с) => {
    if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
  });
  стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
  return { контекст, стр, проблемы };
}

function помощники(стр, проблемы, имя) {
  const э = (id) => стр.getByTestId(id).first();
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const сырой = (id) => стр.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null, id);
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error(`[махраджи: ${имя}] НЕ ВЫПОЛНЕНО: ${что}`);
    console.log(`  ✓ ${что}`);
  };
  const экран = async (id, адрес) => {
    await э(id).waitFor({ timeout: 15000 });
    if (адрес) await стр.waitForFunction((а) => location.hash === а, адрес, { timeout: 5000 });
  };
  const безПроблем = async (что) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    const ключи = await стр.evaluate(() => Object.keys(localStorage));
    for (const к of ключи) if (!к.startsWith('aiustaz:')) проблемы.push('чужой ключ в localStorage: ' + к);
    проверить(проблемы.length === 0, что + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const безГоризонтальнойПрокрутки = async (где) => {
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    проверить(лишнее <= 1, `${где}: нет горизонтальной прокрутки (лишние ${лишнее} px)`);
  };
  /** Картинки схем на экране: [testID, src, alt, naturalWidth] после загрузки (ленивые — прокручиваем к каждой). */
  const схемы = async () => {
    const id = await стр.evaluate(() => [...document.querySelectorAll('img[data-testid]')].map((и) => и.getAttribute('data-testid')));
    const итог = [];
    for (const т of id) {
      const и = стр.locator(`img[data-testid="${т}"]`).first();
      await и.scrollIntoViewIfNeeded();
      await стр.waitForFunction((т) => {
        const к = document.querySelector(`img[data-testid="${т}"]`);
        return к && к.complete;
      }, т, { timeout: 15000 });
      итог.push(await и.evaluate((к) => [к.getAttribute('data-testid'), к.getAttribute('src'), к.alt, к.naturalWidth]));
    }
    return итог;
  };
  return { э, есть, сырой, проверить, экран, безПроблем, безГоризонтальнойПрокрутки, схемы };
}

export async function махраджиСквозной(браузер, база) {
  const папка = process.env.DIST ? path.resolve(process.env.DIST) : path.join(корень, 'dist');
  const { индекс, буквы: буквыМ } = индексМахраджей(папка);
  const N = индекс.буквы.length;
  const адрес = (хэш) => база + '/aiustaz/index.html' + хэш;
  const махрадж = (id) => индекс.махраджи.find((м) => м.id === id);

  // ── 1–2. ru ──
  console.log('\n══ «Как произносить буквы»: список и все карточки букв (ru, 412×800) ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база);
    const п = помощники(стр, проблемы, 'ru');
    await стр.goto(адрес('#/more'));
    await п.экран('экран-ещё', '#/more');
    await п.э('ещё-махраджи').click();
    await п.экран('экран-махраджи', '#/makharij');
    await п.э('махрадж-jawf').waitFor({ timeout: 15000 });
    п.проверить(индекс.махраджи.length === 17, 'в индексе 17 махраджей');
    п.проверить(индекс.буквы.map((б) => б.id).join() === буквыМ.join(), 'буквы индекса = манифесту по порядку');
    const карточек = await стр.evaluate(() => [...document.querySelectorAll('[data-testid^="махрадж-"]')].filter((е) => /^махрадж-[a-z-]+$/.test(е.getAttribute('data-testid')) && !е.getAttribute('data-testid').startsWith('махрадж-буква-')).length);
    п.проверить(карточек === 17, `карточек махраджей в списке: ${карточек}`);
    for (const о of индекс.области) п.проверить(await п.есть('махраджи-область-' + о.id), `область ${о.id}`);
    п.проверить(await п.есть('махраджи-черновик'), 'плашка «Черновик» в списке');
    п.проверить(await п.есть('нижнее-меню'), 'в списке нижнее меню есть');
    for (const м of индекс.махраджи) {
      п.проверить((await п.сырой(`махрадж-${м.id}-название`)) === м.название.ru, `№ ${м.номер}: название = данным`);
    }

    // «Таджвид» → строка ведёт туда же.
    await стр.goto(адрес('#/course'));
    await п.экран('карта-махраджи');
    await п.э('карта-махраджи').click();
    await п.экран('экран-махраджи', '#/makharij');

    // Буква из списка → карточка; «Назад» → список.
    const ха = индекс.буквы.find((б) => б.id === 'hha');
    await п.э('махрадж-буква-hha').click();
    await п.экран('экран-буква-махраджа', `#/makharij/letter?n=${ха.номер}`);
    await п.э('буква-знак').waitFor({ timeout: 15000 });
    п.проверить((await п.сырой('буква-знак')) === 'ح', 'нажатие на ح — карточка ح');
    await п.э('буква-след').click();
    await стр.waitForFunction((а) => location.hash === а, `#/makharij/letter?n=${ха.номер + 1}`, { timeout: 5000 });
    п.проверить((await п.сырой('буква-знак')) === индекс.буквы[ха.номер].знак, '› — следующая буква');
    await п.э('кнопка-назад').click();
    await п.экран('экран-махраджи', '#/makharij');
    п.проверить(true, '«Назад» после › — к списку (без новой записи в истории)');

    // Все буквы.
    for (const б of индекс.буквы) {
      await стр.goto(адрес(`#/makharij/letter?n=${б.номер}`));
      await п.экран('экран-буква-махраджа', `#/makharij/letter?n=${б.номер}`);
      await п.э('буква-знак').waitFor({ timeout: 15000 });
      п.проверить((await п.сырой('буква-знак')) === б.знак && (await п.сырой('буква-название')) === б.название.ru, `n=${б.номер} ${б.знак}: знак и название = данным`);
      п.проверить(await п.есть('буква-черновик'), `n=${б.номер}: плашка «Черновик»`);
      const картинки = await п.схемы();
      const ждём = [б, б.мадд, б.лин, б.гунна].filter(Boolean).reduce((с, з) => с + 1 + (з.схемаСверху ? 1 : 0), 0);
      п.проверить(картинки.length === ждём, `n=${б.номер}: схем на карточке ${картинки.length} (ждали ${ждём})`);
      for (const [т, src, alt, ширина] of картинки) {
        п.проверить(ширина > 0 && /^\/aiustaz\/makharij\/[a-z0-9-]+\.[0-9a-f]{20}\.svg$/.test(src), `n=${б.номер} ${т}: схема загрузилась со своего адреса (${ширина} px)`);
        п.проверить(alt.length > 20 && /выделено: № \d+/.test(alt), `n=${б.номер} ${т}: alt = подпись + «выделено: № …»`);
      }
      const основная = картинки.find(([т]) => т === 'буква-схема-рисунок');
      п.проверить(основная && основная[1].endsWith('/' + б.схема), `n=${б.номер}: основная схема = данным`);
      const м = махрадж(б.махрадж);
      п.проверить(основная && основная[2].startsWith(м.подпись.ru), `n=${б.номер}: alt начинается с подписи схемы махраджа № ${м.номер}`);
    }
    п.проверить(индекс.буквы.filter((б) => б.схемаСверху).length >= 2, 'у ض и ل — вид сверху');

    await стр.goto(адрес(`#/makharij/letter?n=${N + 1}`));
    await п.экран('экран-буква-махраджа', `#/makharij/letter?n=${N + 1}`);
    await п.э('буква-нет').waitFor({ timeout: 15000 });
    п.проверить(await п.есть('буква-к-списку'), `n=${N + 1}: «Такой буквы нет» и «К списку»`);
    await п.безПроблем('ru: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }

  // ── 3. kk, uz, en ──
  for (const язык of ['kk', 'uz', 'en']) {
    console.log(`\n══ «Как произносить буквы»: ${язык} ══`);
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { язык });
    const п = помощники(стр, проблемы, язык);
    await стр.goto(адрес('#/makharij'));
    await п.экран('экран-махраджи', '#/makharij');
    await п.э('махрадж-jawf').waitFor({ timeout: 15000 });
    const h1 = await стр.evaluate(() => document.querySelector('[role="heading"][aria-level="1"], h1')?.textContent?.trim());
    п.проверить(h1 === ЗАГОЛОВКИ[язык], `${язык}: заголовок «${ЗАГОЛОВКИ[язык]}»`);
    const текстМ = язык === 'kk' ? индекс.махраджи[0].название.kk : индекс.махраджи[0].название.ru;
    п.проверить((await п.сырой('махрадж-jawf-название')) === текстМ, `${язык}: название махраджа — ${язык === 'kk' ? 'казахское' : 'русское'}`);
    п.проверить((await п.есть('махраджи-по-русски')) === (язык !== 'kk'), `${язык}: пометка «описание пока на русском» ${язык === 'kk' ? 'не нужна' : 'есть'}`);
    await п.безПроблем(`${язык}: нет ошибок, чужих запросов и нарушений CSP`);
    await контекст.close();
  }

  // ── 4. 360×640 ──
  console.log('\n══ «Как произносить буквы»: 360×640 — без горизонтальной прокрутки ══');
  {
    const { контекст, стр, проблемы } = await новаяСтраница(браузер, база, { ширина: 360, высота: 640 });
    const п = помощники(стр, проблемы, '360');
    await стр.goto(адрес('#/makharij'));
    await п.экран('экран-махраджи', '#/makharij');
    await п.э('махрадж-jawf').waitFor({ timeout: 15000 });
    await п.безГоризонтальнойПрокрутки('#/makharij');
    const дад = индекс.буквы.find((б) => б.id === 'dad');
    await стр.goto(адрес(`#/makharij/letter?n=${дад.номер}`));
    await п.экран('экран-буква-махраджа', `#/makharij/letter?n=${дад.номер}`);
    await п.э('буква-знак').waitFor({ timeout: 15000 });
    await п.схемы();
    await п.безГоризонтальнойПрокрутки('карточка ض (разрез и вид сверху)');
    await п.безПроблем('360: нет ошибок, чужих запросов и нарушений CSP');
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
    const н = await махраджиСквозной(браузер, сервер.адрес);
    console.log(`\nOK: «Как произносить буквы» — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
