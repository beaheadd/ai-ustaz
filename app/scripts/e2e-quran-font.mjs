/**
 * Сквозной тест шрифта Корана (Playwright, Chromium; вызывает scripts/e2e.mjs, E2E_FONT=0 — пропустить).
 *
 * Владелец 28.11.2026: «Поставь выбор шрифта, по умолчанию — этот. Пусть наш тоже будет»; «Да, с подстройкой».
 * Проверяет на телефоне 412×800:
 *   1. по умолчанию текст суры — шрифтом KFGQPCHafs («Мединский мусхаф»); файл шрифта не грузится, пока Коран не показан
 *      (главная), и грузится со своего адреса /aiustaz/fonts/…; document.fonts.check — все знаки подстроенного текста
 *      покрыты шрифтом; нет заглушек: ширина слова со знаком U+06DF (قَالُوا۟) после подстройки = ширине без знака, а без
 *      подстройки — шире (контроль); тексты аятов на экране (исходный, data-o) = Tanzil побайтно;
 *   2. копирование выделенного аята — исходный текст Tanzil, а не подстроенный; «Сообщить об ошибке» — тоже;
 *   3. ⚙ суры → «Классический» → AmiriQuran, без data-o; выбор сохранён (aiustaz:quran-script.v1) и держится после
 *      перезагрузки; «Ещё» → тот же выбор; назад к «Мединский»;
 *   4. «Страницами»: страница 2 мединским шрифтом помещается в лист (scrollHeight ≤ clientHeight), огласовки не
 *      обрезаны (строка ≥ 1,7 кегля);
 *   5. цвета таджвида: куски цвета с подстройкой внутри (data-t > data-o), склейка исходных = Tanzil, мадд на «ـٰ» —
 *      цветной кусок начинается с буквы, а не со знака.
 * Снимки (SCREENSHOTS): font-sura-madinah.png, font-setting.png, font-page-tajweed-madinah.png.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const СЕМЕЙСТВО = 'KFGQPCHafs';
let проверок = 0;

const ПРОГРЕСС = {
  версия: 1,
  язык: 'ru',
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  онбордингПройден: true,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-17' } },
  дниЗанятий: ['2026-11-17'],
};

function данныеКорана(папка) {
  const п = (ф) => JSON.parse(fs.readFileSync(path.join(папка, ф), 'utf8'));
  const индексФайл = fs.readdirSync(path.join(папка, 'quran')).find((и) => /^index\.[0-9a-f]{20}\.json$/.test(и));
  const индекс = п('quran/' + индексФайл);
  return { сура: (н) => п(индекс.суры[н - 1].файл) };
}

export async function шрифтКоранаСквозной(браузер, база, { папка = path.join(корень, 'dist'), папкаСнимков = process.env.SCREENSHOTS } = {}) {
  проверок = 0;
  const данные = данныеКорана(папка);
  const адрес = (х) => база + '/aiustaz/index.html' + х;
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error(`[шрифт Корана] НЕ ВЫПОЛНЕНО: ${что}`);
    console.log(`  ✓ ${что}`);
  };
  const новая = async (доп = {}) => {
    const контекст = await браузер.newContext({ viewport: { width: 412, height: 800 }, deviceScaleFactor: папкаСнимков ? 2 : 1, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
    await контекст.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: база });
    await контекст.addInitScript(
      ({ п, доп }) => {
        if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(п));
        localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1');
        for (const [к, з] of Object.entries(доп)) if (!localStorage.getItem(к)) localStorage.setItem(к, з);
      },
      { п: ПРОГРЕСС, доп },
    );
    const стр = await контекст.newPage();
    const проблемы = [];
    const шрифтов = [];
    стр.on('pageerror', (е) => проблемы.push('исключение: ' + е.message));
    стр.on('console', (м) => м.type() === 'error' && проблемы.push('консоль: ' + м.text()));
    стр.on('request', (з) => {
      const у = new URL(з.url());
      if (у.origin !== new URL(база).origin) проблемы.push('чужой запрос: ' + з.url());
      if (/\/fonts\/kfgqpc-hafs-/.test(у.pathname)) шрифтов.push(у.pathname);
    });
    return { контекст, стр, проблемы, шрифтов };
  };
  const снимок = async (стр, имя) => {
    if (!папкаСнимков) return;
    await стр.evaluate(() => document.fonts.ready);
    await стр.waitForTimeout(400);
    await стр.screenshot({ path: path.join(папкаСнимков, имя + '.png') });
  };
  const шрифтГотов = (стр) => стр.waitForFunction((с) => document.fonts.check(`28px ${с}`), СЕМЕЙСТВО, { timeout: 15000 });
  const семействоАята = (стр, ид) => стр.evaluate((ид) => getComputedStyle(document.querySelector(`[data-testid="${ид}"]`)).fontFamily, ид);

  // ── 1–2. По умолчанию — мединский; заглушек нет; копирование — исходный текст ──
  console.log('\n══ Шрифт Корана: по умолчанию «Мединский мусхаф» (412×800) ══');
  {
    const { контекст, стр, проблемы, шрифтов } = await новая();
    await стр.goto(адрес('#/'));
    await стр.getByTestId('главная-разделы').first().waitFor({ timeout: 20000 });
    await стр.waitForTimeout(800);
    проверить(шрифтов.length === 0, 'на главной (без текста Корана) файл мединского шрифта не запрашивается — загрузка ленивая');
    await стр.goto(адрес('#/quran/sura?n=2'));
    await стр.getByTestId('коран-аят-2-2-текст').first().waitFor({ timeout: 20000 });
    await шрифтГотов(стр);
    await стр.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="коран-аят-2-2-текст"]')).opacity === '1', null, { timeout: 8000 });
    проверить((await семействоАята(стр, 'коран-аят-2-2-текст')) === СЕМЕЙСТВО, 'текст суры по умолчанию — шрифтом KFGQPCHafs («Мединский мусхаф»)');
    проверить(шрифтов.length >= 1 && шрифтов.every((п) => /^\/aiustaz\/fonts\/kfgqpc-hafs-3\.0\.[0-9a-f]{20}\.woff$/.test(п)), `шрифт — со своего адреса: ${шрифтов[0]}`);
    const р = await стр.evaluate((с) => {
      const аяты = [...document.querySelectorAll('[data-testid^="коран-аят-2-"][data-testid$="-текст"]')];
      const покрыто = аяты.every((е) => document.fonts.check(`28px ${с}`, е.textContent));
      // Заглушки: в шрифте U+06DF и U+06EB — широкие глифы-основы. Подстроенное слово со знаком той же ширины, что без знака.
      const к = document.createElement('canvas').getContext('2d');
      к.font = `40px ${с}`;
      const ш = (т) => к.measureText(т).width;
      const безЗнака = ш('قَالُوا');
      return {
        покрыто,
        аятов: аяты.length,
        подстроено: ш('قَالُواْ') - безЗнака,
        бездПодстройки: ш('قَالُوا۟') - безЗнака,
        ишмам: ш('تَأْمَ۬نَّا') - ш('تَأْمَنَّا'),
        ишмамБез: ш('تَأْمَ۫نَّا') - ш('تَأْمَنَّا'),
        исходные: аяты.map((е) => [Number(е.getAttribute('data-testid').split('-')[3]), ...[(ИСХОДНЫЙ_В_СТРАНИЦЕ(е))]]),
        подстроенных: document.querySelectorAll('[data-testid^="коран-аят-2-"] [data-o]').length,
      };
      function ИСХОДНЫЙ_В_СТРАНИЦЕ(е) {
        const к2 = е.cloneNode(true);
        к2.querySelectorAll('[data-o]').forEach((х) => х.replaceWith(х.getAttribute('data-o')));
        return к2.textContent;
      }
    }, СЕМЕЙСТВО);
    проверить(р.покрыто && р.аятов >= 5, `document.fonts.check: все знаки ${р.аятов} аятов на экране (подстроенный текст) покрыты шрифтом`);
    // Заглушка шрифта шириной 1442/2048 кегля (≈ 28 px при 40 px); знак после подстройки — нулевой ширины (ишмам — знак с
    // небольшим сдвигом соседей, но не заглушка).
    проверить(Math.abs(р.подстроено) < 0.5 && Math.abs(р.ишмам) < р.ишмамБез / 3, `нет заглушек: знак после подстройки не шире заглушки (۟ → ${р.подстроено.toFixed(2)} px, ишмам → ${р.ишмам.toFixed(2)} px)`);
    проверить(р.бездПодстройки > 10 && р.ишмамБез > 10, `контроль: без подстройки U+06DF и U+06EB шире на ${р.бездПодстройки.toFixed(0)} и ${р.ишмамБез.toFixed(0)} px (заглушка)`);
    const сура2 = данные.сура(2);
    const плохие = р.исходные.filter(([а, т]) => т !== сура2.аяты[а - 1].текст);
    проверить(р.подстроенных > 0 && плохие.length === 0, `исходный текст аятов на экране (data-o) = Tanzil побайтно (${р.исходные.length} аятов; подстроенных кусков ${р.подстроенных})`);
    // Копирование: весь аят 2:2 → в буфере исходный Tanzil.
    const копия = await стр.evaluate(() => {
      const е = document.querySelector('[data-testid="коран-аят-2-2-текст"]');
      const д = document.createRange();
      д.selectNodeContents(е);
      const в = getSelection();
      в.removeAllRanges();
      в.addRange(д);
      const dt = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      const видимый = е.textContent;
      // Часть: со второго знака первого подстроенного куска до конца аята.
      const кусок = е.querySelector('[data-o]');
      const д2 = document.createRange();
      д2.setStart(кусок.firstChild, 0);
      д2.setEnd(е.lastChild, е.lastChild.childNodes.length);
      в.removeAllRanges();
      в.addRange(д2);
      const dt2 = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt2, bubbles: true, cancelable: true }));
      в.removeAllRanges();
      return { весь: dt.getData('text/plain'), часть: dt2.getData('text/plain'), видимый };
    });
    проверить(копия.весь.trim() === сура2.аяты[1].текст && копия.видимый !== сура2.аяты[1].текст, 'копирование 2:2 — исходный текст Tanzil (на экране — подстроенный для шрифта)');
    проверить(сура2.аяты[1].текст.endsWith(копия.часть.trim()) && копия.часть.trim().length > 10, 'копирование части аята — исходный отрезок Tanzil');
    // «Сообщить об ошибке» по выделению — цитата исходным текстом.
    await стр.evaluate(() => {
      const е = document.querySelector('[data-testid="коран-аят-2-2-текст"]');
      const д = document.createRange();
      д.selectNodeContents(е);
      getSelection().removeAllRanges();
      getSelection().addRange(д);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const чип = стр.getByTestId('ошибка-чип').first();
    if (await чип.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) {
      await чип.click();
      await стр.getByTestId('ошибка-лист').first().waitFor({ timeout: 8000 });
      const цитата = await стр.getByTestId('ошибка-цитата').first().innerText().catch(() => '');
      проверить(цитата.replace(/[«»"]/g, '').trim() === сура2.аяты[1].текст, '«Сообщить об ошибке» по выделению — цитата исходным текстом Tanzil');
      await стр.keyboard.press('Escape');
    } else проверить(false, 'чип «⚠ Ошибка» у выделения Корана');
    await стр.evaluate(() => getSelection().removeAllRanges());
    await снимок(стр, 'font-sura-madinah');
    проверить(проблемы.length === 0, 'без ошибок и чужих запросов' + (проблемы.length ? ': ' + проблемы.join('; ') : ''));
    await контекст.close();
  }

  // ── 3. Переключение и сохранение ──
  console.log('\n══ Шрифт Корана: ⚙ суры → «Классический», сохранение, «Ещё» ══');
  {
    const { контекст, стр, проблемы } = await новая();
    await стр.goto(адрес('#/quran/sura?n=2'));
    await стр.getByTestId('коран-аят-2-2-текст').first().waitFor({ timeout: 20000 });
    await шрифтГотов(стр);
    await стр.getByTestId('сура-вид').first().click();
    await стр.getByTestId('шрифт-корана').first().scrollIntoViewIfNeeded();
    проверить((await стр.getByTestId('шрифт-мединский').first().getAttribute('aria-checked')) === 'true', '⚙ суры: «Шрифт Корана» — выбран «Мединский мусхаф»');
    await снимок(стр, 'font-setting');
    await стр.getByTestId('шрифт-классический').first().click();
    await стр.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="коран-аят-2-2-текст"]')).fontFamily === 'AmiriQuran', null, { timeout: 5000 });
    проверить((await стр.locator('[data-testid^="коран-аят-2-"] [data-o]').count()) === 0, '«Классический» → AmiriQuran, текст без подстройки (нет data-o)');
    проверить(JSON.parse(await стр.evaluate(() => localStorage.getItem('aiustaz:quran-script.v1'))).шрифт === 'классический', 'выбор сохранён: aiustaz:quran-script.v1 = «классический»');
    await стр.reload();
    await стр.getByTestId('коран-аят-2-2-текст').first().waitFor({ timeout: 20000 });
    await стр.waitForTimeout(500);
    проверить((await семействоАята(стр, 'коран-аят-2-2-текст')) === 'AmiriQuran', 'после перезагрузки — «Классический»');
    await стр.goto(адрес('#/more'));
    await стр.getByTestId('ещё-шрифт-корана').first().scrollIntoViewIfNeeded();
    проверить((await стр.getByTestId('ещё-шрифт-корана').locator('[aria-checked="true"]').innerText()).trim() === 'Классический', '«Ещё» → «Настройки»: тот же выбор «Классический»');
    await стр.getByTestId('ещё-шрифт-корана').getByText('Мединский мусхаф').click();
    проверить(JSON.parse(await стр.evaluate(() => localStorage.getItem('aiustaz:quran-script.v1'))).шрифт === 'мединский', '«Ещё» → «Мединский мусхаф» — сохранён');
    проверить(проблемы.length === 0, 'без ошибок и чужих запросов' + (проблемы.length ? ': ' + проблемы.join('; ') : ''));
    await контекст.close();
  }

  // ── 4. «Страницами» и 5. цвета таджвида ──
  console.log('\n══ Шрифт Корана: «Страницами» помещается; цвета таджвида ══');
  {
    const { контекст, стр, проблемы } = await новая({ 'aiustaz:quran-view.v1': JSON.stringify({ версия: 1, вид: 'таджвид', ночьЦвета: false, режим: 'страницы' }) });
    await стр.goto(адрес('#/quran/sura?n=2'));
    await стр.getByTestId('мусхаф-страница-текст').first().waitFor({ timeout: 20000 });
    await шрифтГотов(стр);
    await стр.waitForSelector('[data-testid="мусхаф-страница-текст"] [data-t] [data-o]', { state: 'attached', timeout: 15000 });
    await стр.waitForTimeout(1500);
    const м = await стр.evaluate(() => {
      const э = document.querySelector('[data-testid="мусхаф-страница-текст"]');
      const т = э.querySelector('[data-testid^="мусхаф-текст-"]');
      const с = getComputedStyle(т);
      return { ff: с.fontFamily, кегль: parseFloat(с.fontSize), строка: parseFloat(с.lineHeight), sh: э.scrollHeight, ch: э.clientHeight };
    });
    проверить(м.ff === СЕМЕЙСТВО && м.sh <= м.ch + 1, `«Страницами»: страница 2 мединским шрифтом помещается в лист (${м.sh} ≤ ${м.ch} px, кегль ${м.кегль})`);
    проверить(м.строка >= м.кегль * 1.7, `межстрочный ${м.строка} px ≥ 1,7 кегля — огласовки сверху и снизу не обрезаются (метрики KFGQPC: 2400 + 1200 на 2048)`);
    const ц = await стр.evaluate(() => {
      const аяты = [...document.querySelectorAll('[data-testid="мусхаф-страница"] [data-ayah]')];
      const исх = аяты.map((е) => {
        const к = е.cloneNode(true);
        к.querySelectorAll('[data-end]').forEach((х) => х.remove());
        к.querySelectorAll('[data-o]').forEach((х) => х.replaceWith(х.getAttribute('data-o')));
        return [е.getAttribute('data-ayah'), к.textContent];
      });
      const сЗнака = [...document.querySelectorAll('[data-testid="мусхаф-страница"] [data-t]')].filter((е) => /^\p{M}/u.test(е.textContent)).length;
      return { исх, цветных: document.querySelectorAll('[data-testid="мусхаф-страница"] [data-t]').length, сЗнака };
    });
    const сура2 = данные.сура(2);
    проверить(ц.исх.length >= 5 && ц.исх.every(([к, т]) => т === сура2.аяты[Number(к.split(':')[1]) - 1].текст), `цвета таджвида с мединским: исходный текст ${ц.исх.length} аятов страницы = Tanzil (куски цвета ${ц.цветных})`);
    проверить(ц.сЗнака === 0, 'ни один цветной кусок не начинается со знака (мадд на «ـٰ» взял букву перед собой — цвет не теряется)');
    await снимок(стр, 'font-page-tajweed-madinah');
    проверить(проблемы.length === 0, 'без ошибок и чужих запросов' + (проблемы.length ? ': ' + проблемы.join('; ') : ''));
    await контекст.close();
  }
  return проверок;
}

// Запуск отдельно: node scripts/e2e-quran-font.mjs (после npm run build:web).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = require('playwright');
  const { запуститьСервер } = await import('./serve-test.mjs');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch();
  try {
    const н = await шрифтКоранаСквозной(браузер, сервер.адрес);
    console.log(`\nOK: ${н} проверок`);
  } catch (е) {
    console.error(е?.stack ?? е);
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
