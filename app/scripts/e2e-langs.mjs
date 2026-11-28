#!/usr/bin/env node
/**
 * Сквозной тест языков ar, tr, id, ur (владелец 28.11.2026: «Нужно добавить языки наиболее мусульманских стран
 * сначала. Арабский…» → «Арабский + Турецкий + Индонезийский + Урду»). Playwright, Chromium, телефон 360×780.
 *
 * Сценарии:
 *   1. ar — главная: <html lang="ar" dir="rtl">, ленивый чанк lang-ar загружен (один, других языков нет), шапка и
 *      нижнее меню зеркальны («Главная» справа, «Ещё» слева), намазы по-арабски (الفجر…), «Рус» нет, нет кириллицы в
 *      видимом тексте главной, без прокрутки вбок; «Ещё» → кнопка «назад» справа и стрелка отражена;
 *   2. ar — хадис: заголовок и текст = арабской выгрузке HadeethEnc побайтно, перевода, разъяснения и пользы нет;
 *      список — арабские заголовки (titles-ar);
 *   3. ar — сура аль-Фатиха: заголовок «سورة الفاتحة (1)», текст Корана справа налево (dir=rtl);
 *   4. ar — зикр: только арабский текст (нет произношения и перевода);
 *   5. ar — первый вход с телефоном ar-SA: онбординг по-арабски, 8 языков (выбран العربية), «تخطٍّ» ×4 → главная;
 *   6. ar — чат на aiustaz.pro (ответы сервера подменены page.route): интерфейс по-арабски, в запросе lang: 'en'
 *      (база и классификатор сервера — ru/kk/uz/en; отчёт);
 *   7. tr, id, ur — дым: lang (и dir для ur), намазы (İmsak / Subuh / فجر), хадис — свой перевод HadeethEnc
 *      побайтно (или en с пометкой), урок «Учимся намазу» — «Перевод на ваш язык готовится»; ur — шрифт насталик в стеке.
 * И всё время: нет ошибок в консоли, запросов на другие адреса, нарушений CSP, горизонтальной прокрутки.
 *
 * Снимки 360×780 (LANG_SHOTS=папка): lang-<язык>-home.png, lang-<язык>-hadith.png, lang-ar-sura.png, lang-ar-chat.png.
 * Запуск (из app/, после npm run export:web): node scripts/e2e-langs.mjs. Из e2e.mjs: import { языкиСквозной }.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { запуститьСервер } from './serve-test.mjs';
import { данныеХадисов } from './e2e-hadith.mjs';
import { флагиБраузера } from './e2e-ask.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ВРЕМЯ = '2026-11-21T12:40:00+05:00';
const КИРИЛЛИЦА = /[а-яёәіңғүұқөһ]/i;
const ПРОГРЕСС = (язык) => ({
  версия: 1,
  язык,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  онбордингПройден: true,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } },
  дниЗанятий: ['2026-11-20'],
});
const ТЕЛЕФОН = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' };

let проверок = 0;

async function страница(браузер, база, { язык, прогресс = true, локаль = 'ru-RU' }) {
  const контекст = await браузер.newContext({ ...ТЕЛЕФОН, locale: локаль, timezoneId: 'Asia/Almaty' });
  await контекст.addInitScript(
    ({ прогресс }) => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (е) => window.__csp.push(е.blockedURI + ' ' + е.violatedDirective));
      if (прогресс && !localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
      try {
        localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); // лист первого выбора чтеца — свой тест (e2e-download.mjs)
      } catch {}
    },
    { прогресс: прогресс ? ПРОГРЕСС(язык) : null },
  );
  const стр = await контекст.newPage();
  await стр.clock.setFixedTime(new Date(ВРЕМЯ));
  const проблемы = [];
  const чанки = [];
  стр.on('request', (з) => {
    const u = з.url();
    if (/\/lang-(ar|tr|id|ur)-[0-9a-f]+\.js$/.test(u)) чанки.push(u.match(/lang-(ar|tr|id|ur)/)[1]);
    if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
  });
  стр.on('console', (с) => {
    if (с.type() === 'error') проблемы.push('ошибка в консоли: ' + с.text());
  });
  стр.on('pageerror', (о) => проблемы.push('исключение на странице: ' + о.message));
  return { контекст, стр, проблемы, чанки };
}

function помощники(стр, проблемы, имя, папкаСнимков) {
  const э = (id) => стр.getByTestId(id).first();
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const сырой = (id) => стр.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null, id);
  const рамка = (id) => стр.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()?.toJSON() ?? null, id);
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error(`[языки: ${имя}] НЕ ВЫПОЛНЕНО: ${что}`);
    console.log(`  ✓ ${что}`);
  };
  const безПроблем = async (что) => {
    const csp = await стр.evaluate(() => window.__csp ?? []);
    for (const н of csp) проблемы.push('нарушение CSP: ' + н);
    проверить(проблемы.length === 0, что + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  const безГоризонтальнойПрокрутки = async (где) => {
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    проверить(лишнее <= 1, `${где}: нет горизонтальной прокрутки (лишние ${лишнее} px)`);
  };
  const html = () => стр.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  const снимок = async (файл) => {
    if (!папкаСнимков) return;
    await стр.waitForTimeout(400);
    await стр.screenshot({ path: path.join(папкаСнимков, файл + '.png') });
  };
  return { э, есть, сырой, рамка, проверить, безПроблем, безГоризонтальнойПрокрутки, html, снимок };
}

export async function языкиСквозной(браузер, база, { папка = process.env.DIST ? path.resolve(process.env.DIST) : path.join(корень, 'dist'), папкаСнимков = process.env.LANG_SHOTS, браузерСХостом = null } = {}) {
  проверок = 0;
  if (папкаСнимков) fs.mkdirSync(папкаСнимков, { recursive: true });
  const данные = данныеХадисов(папка);
  const { индекс } = данные;
  const адрес = (х) => база + '/aiustaz/index.html' + х;
  const хадисСПереводом = (я) => индекс.хадисы.find((х) => х.языки.includes(я));
  const хадисБезПеревода = (я) => индекс.хадисы.find((х) => !х.языки.includes(я) && х.языки.includes('en'));

  // ── 1–4. ar ──
  console.log('\n══ Арабский (ar): справа налево, главная, хадис, сура, зикр (360×780) ══');
  {
    const { контекст, стр, проблемы, чанки } = await страница(браузер, база, { язык: 'ar' });
    const п = помощники(стр, проблемы, 'ar', папкаСнимков);
    await стр.goto(адрес('#/'));
    await п.э('экран-главная').waitFor({ timeout: 20000 });
    await п.э('нижнее-меню').waitFor();
    const h = await п.html();
    п.проверить(h.lang === 'ar' && h.dir === 'rtl', `<html lang="${h.lang}" dir="${h.dir}">`);
    п.проверить(JSON.stringify([...new Set(чанки)]) === '["ar"]', `загружен только чанк словарей ar (${чанки.join(', ')})`);
    const язык = await п.сырой('главная-язык');
    п.проверить(язык?.includes('عربي'), `глобус в шапке: «${язык}»`);
    const меню = await стр.evaluate(() =>
      [...document.querySelectorAll('[data-testid="нижнее-меню"] [data-testid^="меню-"]')].map((э) => ({ id: э.getAttribute('data-testid'), x: э.getBoundingClientRect().x })),
    );
    const x = Object.fromEntries(меню.map((м) => [м.id, м.x]));
    п.проверить(x['меню-главная'] > x['меню-коран'] && x['меню-коран'] > x['меню-устаз'] && x['меню-хадисы'] > x['меню-ещё'], 'нижнее меню зеркально: «Главная» справа, «Ещё» слева');
    const подписьМеню = await стр.evaluate(() => document.querySelector('[data-testid="нижнее-меню"]').innerText);
    п.проверить(/الرئيسية/.test(подписьМеню) && /القرآن/.test(подписьМеню) && /الأحاديث/.test(подписьМеню), 'подписи меню по-арабски (الرئيسية · القرآن · الأحاديث)');
    const кибла = await п.рамка('главная-кибла');
    п.проверить(кибла && кибла.x < 180, `шапка зеркальна: компас и город — слева (x ${Math.round(кибла?.x)})`);
    const текст = await стр.evaluate(() => document.querySelector('[data-testid="экран-главная"]').innerText);
    п.проверить(/الفجر/.test(текст) && /الظهر/.test(текст) && /العصر/.test(текст), 'намазы по-арабски: الفجر · الظهر · العصر');
    const цифры = await стр.evaluate(() => document.querySelector('[data-testid="экран-главная"]').innerText.match(/\d{2}:\d{2}/g) ?? []);
    п.проверить(цифры.length >= 6, `время — западными цифрами (${цифры.slice(0, 3).join(', ')}…)`);
    п.проверить(!КИРИЛЛИЦА.test(текст), 'на главной нет кириллицы');
    п.проверить(!/ДУМК|SAMK|muftyat|كازاخستان/.test(текст), 'на главной нет имени ведомства и страны (владелец 28.11.2026: нейтрально)');
    await п.безГоризонтальнойПрокрутки('ar, главная');
    await п.снимок('lang-ar-home');

    // «Ещё» → «О приложении»: кнопка «назад» справа, стрелка отражена; «Разработано в Казахстане» — здесь.
    await п.э('меню-ещё').click();
    await п.э('экран-ещё').waitFor({ timeout: 10000 });
    await стр.goto(адрес('#/about'));
    await п.э('кнопка-назад').waitFor({ timeout: 10000 });
    const назад = await п.рамка('кнопка-назад');
    п.проверить(назад && назад.x + назад.width / 2 > 180, `кнопка «رجوع» — справа (x ${Math.round(назад?.x)})`);
    const отражено = await стр.evaluate(() => getComputedStyle(document.querySelector('[data-testid="кнопка-назад"] svg').parentElement).transform);
    п.проверить(/matrix\(-1/.test(отражено), `стрелка «назад» отражена (${отражено})`);
    п.проверить((await п.сырой('о-проекте-разработано')) === 'طُوِّر في كازاخستان.', '«О приложении»: «طُوِّر في كازاخستان.»');

    // Хадис: только арабский текст выгрузки.
    const х = индекс.хадисы[0];
    await стр.goto(адрес(`#/hadith/item?n=${х.id}`));
    await п.э('хадис-арабский').waitFor({ timeout: 15000 });
    const ar = данные.запись('ar', х.id);
    const заголовкиAr = JSON.parse(fs.readFileSync(path.join(папка, индекс.заголовки.ar.файл), 'utf8')).заголовки;
    const заголовок = заголовкиAr.find((з) => з[0] === х.id)[1];
    п.проверить((await п.сырой('хадис-арабский')) === ar.hadeeth, 'хадис: арабский текст = выгрузке ar побайтно');
    п.проверить((await п.сырой('хадис-заголовок')) === заголовок, 'хадис: заголовок = title арабской выгрузки (titles-ar)');
    п.проверить((await п.сырой('хадис-такхридж')) === ar.attribution, 'хадис: такхридж = выгрузке ar');
    п.проверить(!(await п.есть('хадис-перевод')) && !(await п.есть('хадис-разъяснение')) && !(await п.есть('хадис-польза')), 'перевода, разъяснения и пользы на другом языке нет');
    const ссылка = await стр.evaluate(() => document.querySelector('[data-testid="хадис-источник"]')?.getAttribute('href'));
    п.проверить(ссылка === ar.link, `ссылка HadeethEnc — арабская страница (${ссылка})`);
    await п.безГоризонтальнойПрокрутки('ar, хадис');
    await п.снимок('lang-ar-hadith');
    await стр.goto(адрес('#/hadith'));
    await п.э('экран-хадисы').waitFor({ timeout: 15000 });

    // Сура аль-Фатиха.
    await стр.goto(адрес('#/quran/sura?n=1'));
    await п.э('сура-назад').waitFor({ timeout: 15000 });
    await стр.waitForFunction(() => document.title.includes('سورة الفاتحة'), null, { timeout: 15000 }).catch(() => undefined);
    const заголовокСуры = await стр.evaluate(() => document.title);
    п.проверить(заголовокСуры.includes('سورة الفاتحة (1)'), `заголовок суры: «${заголовокСуры}»`);
    const направлениеКорана = await стр.evaluate(() => [...document.querySelectorAll('[lang="ar"]')].every((э) => (э.closest('[dir]')?.getAttribute('dir') ?? 'rtl') === 'rtl'));
    п.проверить(направлениеКорана, 'текст Корана — справа налево (dir=rtl)');
    await п.безГоризонтальнойПрокрутки('ar, сура');
    await п.снимок('lang-ar-sura');

    // Зикр: только арабский текст.
    await стр.goto(адрес('#/dhikr/item?n=1'));
    await п.э('зикр-арабский').waitFor({ timeout: 15000 });
    п.проверить(!(await п.есть('зикр-произношение')) && !(await п.есть('зикр-перевод')), 'зикр: только арабский текст — нет произношения и перевода');
    await п.безПроблем('ar: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }

  // ── 5. ar — первый вход с телефоном ar-SA ──
  console.log('\n══ Арабский: первый вход, язык телефона ar-SA ══');
  {
    const { контекст, стр, проблемы } = await страница(браузер, база, { язык: null, прогресс: false, локаль: 'ar-SA' });
    const п = помощники(стр, проблемы, 'ar, онбординг', папкаСнимков);
    await стр.goto(адрес('#/'));
    await п.э('онбординг-язык-ar').waitFor({ timeout: 20000 });
    const h = await п.html();
    п.проверить(h.lang === 'ar' && h.dir === 'rtl', 'язык телефона ar-SA → интерфейс сразу по-арабски, dir=rtl');
    const языки = await стр.evaluate(() => [...document.querySelectorAll('[data-testid^="онбординг-язык-"]')].map((э) => э.getAttribute('data-testid').slice(15)));
    п.проверить(JSON.stringify(языки) === JSON.stringify(['kk', 'ru', 'uz', 'en', 'ar', 'tr', 'id', 'ur']), `шаг «Язык»: 8 языков (${языки.join(', ')})`);
    п.проверить((await стр.getByTestId('онбординг-язык-ar').getAttribute('aria-checked')) === 'true', 'выбран العربية');
    const заголовок = await стр.evaluate(() => document.body.innerText);
    п.проверить(/السلام عليكم/.test(заголовок) && /اختر اللغة/.test(заголовок), 'шаг 1: «السلام عليكم», «اختر اللغة»');
    await п.безГоризонтальнойПрокрутки('ar, онбординг');
    for (let i = 0; i < 4; i++) {
      await стр.getByText('تخطٍّ', { exact: true }).first().click();
      await стр.waitForTimeout(250);
    }
    await п.э('экран-главная').waitFor({ timeout: 10000 });
    п.проверить(true, '«تخطٍّ» ×4 → главная');
    await п.безПроблем('ar, онбординг: нет ошибок, чужих запросов и нарушений CSP');
    await контекст.close();
  }

  // ── 6. ar — чат на aiustaz.pro ──
  if (браузерСХостом) {
    console.log('\n══ Арабский: чат AI Ustaz (aiustaz.pro, ответы подменены) ══');
    const порт = new URL(база).port;
    const свой = `http://aiustaz.pro:${порт}`;
    const { контекст, стр, проблемы } = await страница(браузерСХостом, свой, { язык: 'ar' });
    const п = помощники(стр, проблемы, 'ar, чат', папкаСнимков);
    const запросы = [];
    await стр.route('**/api/stats/**', (м) => м.fulfill({ status: 204, body: '' }));
    await стр.route('**/api/content/config', (м) => м.fulfill({ status: 404, body: '' }));
    await стр.route('**/api/ask/health', (м) => м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ок: true, записей: 934, режим: 'поиск' }) }));
    await стр.route('**/api/ask/v1', async (м) => {
      запросы.push(JSON.parse(м.request().postData() ?? '{}'));
      await м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ вид: 'нет-в-базе', режим: 'поиск', текст: 'Our base has no answer to this question yet.', источники: [], черновик: false }) });
    });
    await стр.goto(свой + '/aiustaz/index.html#/ask');
    await п.э('устаз-пусто').waitFor({ timeout: 20000 });
    const шапка = await стр.evaluate(() => document.querySelector('[data-testid="устаз-шапка"]')?.innerText ?? '');
    п.проверить(/اسأل AI Ustaz/.test(шапка), `шапка чата по-арабски: «${шапка.split('\n')[0]}»`);
    await п.э('устаз-поле').fill('ما هو الإخفاء؟');
    await п.э('устаз-отправить').click();
    await стр.waitForFunction(() => document.querySelectorAll('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').length > 0, null, { timeout: 8000 });
    п.проверить(запросы.length === 1 && запросы[0].lang === 'en', `запрос к серверу — lang: '${запросы[0]?.lang}' (база сервера ru/kk/uz/en; ответ — по-английски)`);
    await п.безГоризонтальнойПрокрутки('ar, чат');
    await п.снимок('lang-ar-chat');
    await контекст.close();
  }

  // ── 7. tr, id, ur — дым ──
  const ОЖИДАНИЕ = {
    tr: { намаз: ['İmsak', 'Öğle', 'İkindi'], меню: 'Ana sayfa', dir: 'ltr' },
    id: { намаз: ['Subuh', 'Zuhur', 'Asar'], меню: 'Beranda', dir: 'ltr' },
    ur: { намаз: ['فجر', 'ظہر', 'عصر'], меню: 'ہوم', dir: 'rtl' },
  };
  for (const [я, о] of Object.entries(ОЖИДАНИЕ)) {
    console.log(`\n══ ${я}: главная, хадис HadeethEnc, «Перевод готовится» (360×780) ══`);
    const { контекст, стр, проблемы, чанки } = await страница(браузер, база, { язык: я });
    const п = помощники(стр, проблемы, я, папкаСнимков);
    await стр.goto(адрес('#/'));
    await п.э('экран-главная').waitFor({ timeout: 20000 });
    const h = await п.html();
    п.проверить(h.lang === я && h.dir === о.dir, `<html lang="${h.lang}" dir="${h.dir}">`);
    п.проверить(JSON.stringify([...new Set(чанки)]) === JSON.stringify([я]), `загружен только чанк словарей ${я}`);
    const текст = await стр.evaluate(() => document.querySelector('[data-testid="экран-главная"]').innerText);
    п.проверить(о.намаз.every((н) => текст.includes(н)), `намазы: ${о.намаз.join(' · ')}`);
    const меню = await стр.evaluate(() => document.querySelector('[data-testid="нижнее-меню"]').innerText);
    п.проверить(меню.includes(о.меню), `меню: «${о.меню}»`);
    п.проверить(!КИРИЛЛИЦА.test(текст), 'на главной нет кириллицы');
    if (я === 'ur') {
      const шрифт = await стр.evaluate(() => getComputedStyle(document.querySelector('[data-testid="экран-главная"] [dir="rtl"]') ?? document.body).fontFamily);
      п.проверить(/Nastaliq/i.test(шрифт), `урду — системный насталик в стеке шрифта (${шрифт.slice(0, 60)}…)`);
      const меню2 = await стр.evaluate(() => [...document.querySelectorAll('[data-testid="нижнее-меню"] [data-testid^="меню-"]')].map((э) => э.getBoundingClientRect().x));
      п.проверить(меню2[0] > меню2[меню2.length - 1], 'ur: нижнее меню зеркально');
    }
    await п.безГоризонтальнойПрокрутки(`${я}, главная`);
    await п.снимок(`lang-${я}-home`);

    const х = хадисСПереводом(я);
    await стр.goto(адрес(`#/hadith/item?n=${х.id}`));
    await п.э('хадис-перевод').waitFor({ timeout: 15000 });
    const пер = данные.запись(я, х.id);
    п.проверить((await п.сырой('хадис-перевод')) === пер.hadeeth && (await п.сырой('хадис-заголовок')) === пер.title, `хадис #${х.id}: перевод ${я} HadeethEnc побайтно`);
    п.проверить(!(await п.есть('хадис-нет-перевода')), 'свой перевод — без пометки «нет перевода»');
    await п.безГоризонтальнойПрокрутки(`${я}, хадис`);
    await п.снимок(`lang-${я}-hadith`);
    const без = хадисБезПеревода(я);
    if (без) {
      await стр.goto(адрес(`#/hadith/item?n=${без.id}`));
      await п.э('хадис-перевод').waitFor({ timeout: 15000 });
      п.проверить((await п.сырой('хадис-перевод')) === данные.запись('en', без.id).hadeeth && (await п.есть('хадис-нет-перевода')), `хадис #${без.id} без перевода ${я}: английский HadeethEnc и пометка`);
    }
    await стр.goto(адрес('#/namaz/section?n=1'));
    await п.э('перевод-готовится').waitFor({ timeout: 15000 });
    п.проверить(true, '«Учимся намазу»: английский текст и строка «Перевод на ваш язык готовится»');
    await п.безПроблем(`${я}: нет ошибок, чужих запросов и нарушений CSP`);
    await контекст.close();
  }
  return проверок;
}

// Запуск напрямую.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch();
  const сХостом = await chromium.launch({ args: флагиБраузера(new URL(сервер.адрес).port) });
  try {
    const н = await языкиСквозной(браузер, сервер.адрес, { браузерСХостом: сХостом });
    console.log(`\nOK: языки ar, tr, id, ur — ${н} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сХостом.close();
    await сервер.закрыть();
  }
}
