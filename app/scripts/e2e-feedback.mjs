#!/usr/bin/env node
/**
 * Сквозной тест «Сообщить об ошибке» (Playwright, сборка приложения; сервер подменён page.route — server/feedback.py
 * проверяет pytest). Владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“. И написать, какая там
 * ошибка… Любой человек увидел ошибку, нажал, он попадает к нам и обрабатывает». Клиент — src/feedback/.
 *   1. https://aiustaz.pro, 360×780, ru: хадис → выделили часть перевода → чип «⚠ Ошибка» рядом с выделением (в окне) →
 *      лист (чанк FeedbackSheet грузится только сейчас): цитата = выделенному, «Где: Хадис № …», раздел «Хадис» выбран;
 *      «Что не так?» короче 5 символов — подсказка, запроса нет; отправка → POST /api/feedback без cookie, только
 *      разрешённые поля (cat, text, route, quote, ref, contact, ver, lang, theme, dev), route '#/hadith/item?n=…',
 *      ref 'hadith:…', ver — коммит сборки из <meta>, без строки браузера → «Спасибо! Мы проверим и исправим».
 *   2. «Ещё» → «Сообщить об ошибке»: лист без цитаты, раздел «Интерфейс», контакта нет (поле пустое) — его нет в запросе.
 *   3. ⚙ суры (#/quran/sura?n=2&a=255) → «Сообщить об ошибке» → ref '2:255', раздел «Коран / таджвид»; лист действий
 *      аята → «Сообщить об ошибке в этом аяте» → ref '2:7'; ⚙ хадиса → ref 'hadith:…'.
 *   4. Без сети: «Нет связи — попробуйте позже», текст остался; сеть вернулась — ушло. 429 — «Слишком много…».
 *   5. kk: чип «⚠ Қате», лист «Қате туралы хабарлау», «Рақмет! Тексеріп, түзетеміз.».
 *   6. Компьютер 1280×800: двойной щелчок по слову — чип; в полях листа выделение чип не вызывает.
 *   7. https://batr.kz: чип и лист есть, но формы нет — «Отправить можно на aiustaz.pro» и ссылка на это же место;
 *      запросов /api/feedback нет.
 * И всё время: ни исключений, ни запросов на чужие адреса, ни горизонтальной прокрутки на 360 px.
 * SHOTS_FEEDBACK=папка — снимки 360×780: feedback-chip.png, feedback-sheet.png, feedback-success.png (+ feedback-kk-sheet.png).
 * Запуск (из app/, после сборки): node scripts/e2e-feedback.mjs (DIST=папка сборки); из e2e.mjs — сообщитьСквозной(браузер)
 * (E2E_FEEDBACK=0 — пропустить).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЗАГЛУШКА_BATR } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };
const ПРОГРЕСС = (язык) => ({ версия: 1, язык, предупреждениеПоказано: true, пояснениеМикрофонаПоказано: false, согласиеПроверкиГолосом: false, уроки: {}, дниЗанятий: [], онбордингПройден: true });
const ПОЛЯ = ['cat', 'text', 'route', 'quote', 'ref', 'contact', 'ver', 'lang', 'theme', 'dev'];
const ТЕЛЕФОН = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };

export async function сообщитьСквозной(браузер, { папка = process.env.DIST ?? path.join(корень, 'dist'), снимки = process.env.SHOTS_FEEDBACK ?? null } = {}) {
  let проверок = 0;
  const проверить = (условие, что) => {
    проверок += 1;
    if (!условие) throw new Error('[ошибка] НЕ ВЫПОЛНЕНО: ' + что);
    console.log('  ✓ ' + что);
  };
  if (снимки) fs.mkdirSync(снимки, { recursive: true });
  const индекс = JSON.parse(fs.readFileSync(path.join(папка, 'hadith', fs.readdirSync(path.join(папка, 'hadith')).find((ф) => /^index\.[0-9a-f]{20}\.json$/.test(ф))), 'utf8'));
  const хадис = индекс.хадисы[0].id;
  const коммит = /name="aiustaz-commit" content="([0-9a-f]+)"/.exec(fs.readFileSync(path.join(папка, 'index.html'), 'utf8'))?.[1] ?? '';

  async function открыть({ сайт = 'https://aiustaz.pro', путь = '#/', язык = 'ru', профиль = ТЕЛЕФОН, ответ = () => 200 } = {}) {
    const контекст = await браузер.newContext({ ...профиль, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
    await контекст.addInitScript(({ прогресс }) => {
      try {
        if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(прогресс));
        localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1');
        localStorage.setItem('aiustaz:stats-off.v1', '1');
      } catch {}
    }, { прогресс: ПРОГРЕСС(язык) });
    const журнал = { сообщения: [], чанки: [] };
    await контекст.route(сайт + '/**', async (маршрут) => {
      const запрос = маршрут.request();
      const п = decodeURIComponent(new URL(запрос.url()).pathname);
      if (п === '/api/feedback') {
        журнал.сообщения.push({ тело: JSON.parse(запрос.postData() ?? 'null'), заголовки: await запрос.allHeaders(), метод: запрос.method() });
        const код = ответ(журнал.сообщения.length);
        return маршрут.fulfill({ status: код, contentType: 'application/json', body: JSON.stringify(код === 200 ? { ок: true } : { ошибка: 'rate' }) });
      }
      if (п.startsWith('/api/')) return маршрут.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const ф = п.startsWith('/aiustaz/') ? path.resolve(папка, '.' + п.slice('/aiustaz'.length)) : null;
      if (ф && ф.startsWith(path.resolve(папка) + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
        return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
      return маршрут.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ЗАГЛУШКА_BATR });
    });
    const стр = await контекст.newPage();
    const проблемы = [];
    стр.on('request', (з) => {
      const u = з.url();
      if (/\/FeedbackSheet-[0-9a-f]+\.js$/.test(u)) журнал.чанки.push(u);
      if (!u.startsWith(сайт + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('запрос на другой адрес: ' + u);
    });
    стр.on('pageerror', (о) => проблемы.push('исключение: ' + о.message));
    await стр.goto(сайт + '/aiustaz/index.html' + путь);
    return { контекст, стр, журнал, проблемы };
  }
  const э = (стр, id) => стр.getByTestId(id).first();
  const текст = async (стр, id) => (await э(стр, id).innerText()).trim();
  const безПроблем = async (стр, проблемы, где) => {
    const лишнее = await стр.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (лишнее > 1) проблемы.push(`горизонтальная прокрутка: ${лишнее} px`);
    проверить(проблемы.length === 0, где + ': без исключений, чужих запросов и горизонтальной прокрутки' + (проблемы.length ? ':\n      ' + проблемы.join('\n      ') : ''));
  };
  /** Выделить первые n символов текста элемента (как пальцем: системное выделение). */
  const выделить = (стр, id, n = 48) =>
    стр.evaluate(([id, n]) => {
      const эл = document.querySelector(`[data-testid="${id}"]`);
      эл.scrollIntoView({ block: 'center' });
      const обход = document.createTreeWalker(эл, NodeFilter.SHOW_TEXT);
      const узел = обход.nextNode();
      const д = document.createRange();
      д.setStart(узел, 0);
      д.setEnd(узел, Math.min(n, узел.length));
      const в = document.getSelection();
      в.removeAllRanges();
      в.addRange(д);
      return { текст: в.toString().replace(/\s+/g, ' ').trim(), низ: д.getBoundingClientRect().bottom, верх: д.getBoundingClientRect().top };
    }, [id, n]);
  const ждать = async (стр, условие, мс = 6000) => {
    const до = Date.now() + мс;
    while (Date.now() < до) {
      if (условие()) return true;
      await стр.waitForTimeout(100);
    }
    return условие();
  };
  const снимок = async (стр, имя) => {
    if (!снимки) return;
    await стр.waitForTimeout(250);
    await стр.screenshot({ path: path.join(снимки, имя) });
  };

  // 1. Выделение в хадисе → чип → лист → отправка.
  console.log('\n══ «Сообщить об ошибке»: выделение в хадисе (aiustaz.pro, 360×780) ══');
  {
    const { контекст, стр, журнал, проблемы } = await открыть({ путь: '#/hadith/item?n=' + хадис });
    await э(стр, 'хадис-перевод').waitFor({ timeout: 20000 });
    проверить((await стр.getByTestId('ошибка-чип').count()) === 0, 'без выделения чипа нет');
    const в = await выделить(стр, 'хадис-перевод');
    await э(стр, 'ошибка-чип').waitFor({ timeout: 5000 });
    const ч = await э(стр, 'ошибка-чип').boundingBox();
    проверить(ч && ч.x >= 0 && ч.x + ч.width <= 360 && ч.y >= 0 && ч.y + ч.height <= 780, 'чип «⚠ Ошибка» — в окне');
    проверить(Math.abs(ч.y - в.низ) < 70 || Math.abs(в.верх - (ч.y + ч.height)) < 70, 'чип — рядом с выделением');
    проверить((await текст(стр, 'ошибка-чип')) === '⚠ Ошибка', 'надпись «⚠ Ошибка»');
    проверить(журнал.чанки.length === 0, 'до нажатия лист не загружен (отдельный чанк)');
    await снимок(стр, 'feedback-chip.png');
    // Прокрутка: чип едет за выделением.
    await стр.evaluate(() => {
      let эл = document.querySelector('[data-testid="хадис-перевод"]');
      while (эл && !(эл.scrollHeight > эл.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(эл).overflowY))) эл = эл.parentElement;
      if (эл) эл.scrollTop += 80;
    });
    await стр.waitForTimeout(300);
    const ч2 = await э(стр, 'ошибка-чип').boundingBox();
    проверить(ч2 && Math.abs(ч.y - ч2.y - 80) <= 4, `прокрутили на 80 px — чип за выделением (${Math.round(ч.y)} → ${Math.round(ч2?.y ?? -1)})`);
    await э(стр, 'ошибка-чип').click();
    await э(стр, 'ошибка-лист').waitFor({ timeout: 10000 });
    проверить(журнал.чанки.length === 1, 'чанк FeedbackSheet загружен при открытии');
    проверить((await стр.getByTestId('ошибка-чип').count()) === 0, 'чип ушёл');
    проверить((await текст(стр, 'ошибка-цитата')) === в.текст, `цитата = выделенному («${в.текст.slice(0, 30)}…»)`);
    проверить(/^Где: Хадис № \d+$/.test(await текст(стр, 'ошибка-где')), 'где: ' + (await текст(стр, 'ошибка-где')));
    проверить((await э(стр, 'ошибка-раздел-hadith').getAttribute('aria-checked')) === 'true', 'раздел «Хадис» выбран по экрану');
    проверить((await э(стр, 'ошибка-контакт').inputValue()) === '', 'контакт по умолчанию пуст');
    await э(стр, 'ошибка-текст').fill('Ош');
    await э(стр, 'ошибка-отправить').click();
    проверить(await стр.getByText('Напишите хотя бы 5 символов').isVisible(), 'короче 5 символов — подсказка');
    проверить(журнал.сообщения.length === 0, 'и запроса нет');
    await э(стр, 'ошибка-раздел-translation').click();
    проверить((await э(стр, 'ошибка-раздел-translation').getAttribute('aria-checked')) === 'true', 'раздел можно сменить («Перевод»)');
    await э(стр, 'ошибка-текст').fill('В переводе пропущено слово «только».');
    await э(стр, 'ошибка-контакт').fill('@brat_test');
    проверить((await текст(стр, 'ошибка-счёт')) === '36 / 1000', 'счётчик символов');
    await э(стр, 'ошибка-цитата').scrollIntoViewIfNeeded();
    await снимок(стр, 'feedback-sheet.png');
    await безПроблем(стр, проблемы, 'лист открыт');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor({ timeout: 5000 });
    проверить((await текст(стр, 'ошибка-спасибо')).includes('Спасибо! Мы проверим и исправим.'), '«Спасибо! Мы проверим и исправим.»');
    const с = журнал.сообщения[0];
    проверить(журнал.сообщения.length === 1 && с.метод === 'POST' && !с.заголовки.cookie, 'POST /api/feedback, один, без cookie');
    проверить(Object.keys(с.тело).every((к) => ПОЛЯ.includes(к)), 'только разрешённые поля: ' + Object.keys(с.тело).join(', '));
    проверить(с.тело.cat === 'translation' && с.тело.text === 'В переводе пропущено слово «только».' && с.тело.quote === в.текст, 'раздел, текст и цитата');
    проверить(с.тело.route === '#/hadith/item?n=' + хадис && с.тело.ref === 'hadith:' + хадис, `экран ${с.тело.route}, место ${с.тело.ref}`);
    проверить(с.тело.contact === '@brat_test', 'контакт — только тот, что оставили');
    проверить(с.тело.ver === коммит && /^[0-9a-f]{7,40}$/.test(с.тело.ver), 'версия — коммит сборки из <meta>');
    проверить(с.тело.lang === 'ru' && с.тело.theme === 'light' && с.тело.dev === 'phone', 'язык ru, тема light, устройство phone');
    проверить(!/Mozilla|Pixel|Android/.test(JSON.stringify(с.тело)), 'строки браузера нет');
    await снимок(стр, 'feedback-success.png');
    await э(стр, 'ошибка-готово-закрыть').click();
    проверить((await стр.getByTestId('ошибка-лист').count()) === 0, '«Закрыть» — лист закрыт');
    await безПроблем(стр, проблемы, 'хадис');

    // 2. «Ещё» → «Сообщить об ошибке».
    console.log('\n══ «Сообщить об ошибке»: из «Ещё», ⚙ суры, лист аята, ⚙ хадиса ══');
    await стр.evaluate(() => { location.hash = '#/more'; });
    await э(стр, 'ещё-ошибка').click();
    await э(стр, 'ошибка-лист').waitFor();
    проверить((await стр.getByTestId('ошибка-цитата').count()) === 0, '«Ещё»: лист без цитаты');
    проверить((await э(стр, 'ошибка-раздел-ui').getAttribute('aria-checked')) === 'true', '«Ещё»: раздел «Интерфейс»');
    await э(стр, 'ошибка-текст').fill('Не нашёл, где поменять размер шрифта перевода.');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor();
    const с2 = журнал.сообщения[1].тело;
    проверить(с2.route === '#/more' && !('ref' in с2) && !('quote' in с2) && !('contact' in с2) && с2.cat === 'ui', '«Ещё»: #/more, без места, цитаты и контакта');
    await стр.keyboard.press('Escape');
    проверить((await стр.getByTestId('ошибка-лист').count()) === 0, 'Escape закрывает лист');

    // 3. ⚙ суры.
    await стр.evaluate(() => { location.hash = '#/quran/sura?n=2&a=255'; });
    await э(стр, 'сура-вид').waitFor({ timeout: 20000 });
    await стр.waitForTimeout(500);
    await э(стр, 'сура-вид').click();
    await э(стр, 'сура-ошибка').click();
    await э(стр, 'ошибка-лист').waitFor();
    проверить((await стр.getByTestId('сура-меню').count()) === 0, '⚙ суры → меню закрыто, лист открыт');
    проверить((await э(стр, 'ошибка-раздел-quran').getAttribute('aria-checked')) === 'true', 'сура: раздел «Коран / таджвид»');
    await э(стр, 'ошибка-текст').fill('В таджвиде аята мадд 2 счёта, должно быть 4.');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor();
    проверить(журнал.сообщения[2].тело.ref === '2:255' && журнал.сообщения[2].тело.route === '#/quran/sura?n=2&a=255', 'сура: место 2:255');
    await э(стр, 'ошибка-закрыть').click();
    // Лист действий аята.
    await стр.evaluate(() => { location.hash = '#/quran/sura?n=2&a=7'; });
    await стр.waitForTimeout(800);
    const аят = стр.locator('[data-testid="коран-аят-2-7"]').first();
    await аят.waitFor({ timeout: 20000 });
    await аят.click();
    await э(стр, 'действия-ошибка').waitFor({ timeout: 5000 });
    await э(стр, 'действия-ошибка').click();
    await э(стр, 'ошибка-лист').waitFor();
    проверить((await стр.getByTestId('сура-действия').count()) === 0, 'лист аята закрыт, открыт лист сообщения');
    await э(стр, 'ошибка-текст').fill('Проверьте цвет иддгама в этом аяте.');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor();
    проверить(журнал.сообщения[3].тело.ref === '2:7', 'лист аята: место 2:7');
    await э(стр, 'ошибка-закрыть').click();
    // ⚙ хадиса.
    await стр.evaluate((id) => { location.hash = '#/hadith/item?n=' + id; }, хадис);
    await э(стр, 'хадис-меню-кнопка').waitFor({ timeout: 20000 });
    await э(стр, 'хадис-меню-кнопка').click();
    проверить((await э(стр, 'хадис-меню-кнопка').getAttribute('aria-expanded')) === 'true', '⚙ хадиса раскрыто (aria-expanded)');
    await э(стр, 'хадис-ошибка').click();
    await э(стр, 'ошибка-лист').waitFor();
    await э(стр, 'ошибка-текст').fill('Степень хадиса указана иначе, чем в сборнике.');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor();
    проверить(журнал.сообщения[4].тело.ref === 'hadith:' + хадис && журнал.сообщения[4].тело.cat === 'hadith', '⚙ хадиса: место hadith:' + хадис);
    await э(стр, 'ошибка-закрыть').click();
    await безПроблем(стр, проблемы, 'меню и «Ещё»');
    await контекст.close();
  }

  // 4. Без сети и лимит.
  console.log('\n══ «Сообщить об ошибке»: без сети, 429 ══');
  {
    const { контекст, стр, журнал, проблемы } = await открыть({ путь: '#/more', ответ: (n) => (n === 1 ? 429 : 200) });
    await э(стр, 'ещё-ошибка').click();
    await э(стр, 'ошибка-лист').waitFor({ timeout: 10000 });
    await э(стр, 'ошибка-текст').fill('Кнопка «Обновить» перекрывает заголовок.');
    await контекст.setOffline(true);
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-итог').waitFor();
    проверить((await текст(стр, 'ошибка-итог')) === 'Нет связи — попробуйте позже. Текст остался здесь.', 'без сети — «Нет связи — попробуйте позже»');
    проверить((await э(стр, 'ошибка-текст').inputValue()) === 'Кнопка «Обновить» перекрывает заголовок.', 'текст остался в поле');
    проверить(журнал.сообщения.length === 0, 'без сети запроса нет');
    await контекст.setOffline(false);
    await э(стр, 'ошибка-отправить').click();
    await стр.getByText('Слишком много сообщений подряд').waitFor({ timeout: 5000 });
    проверить(true, '429 — «Слишком много сообщений подряд…»');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor({ timeout: 5000 });
    проверить(журнал.сообщения.length === 2, 'сеть вернулась — отправлено');
    await безПроблем(стр, проблемы, 'без сети');
    await контекст.close();
  }

  // 5. Казахский.
  console.log('\n══ «Сообщить об ошибке»: kk ══');
  {
    const { контекст, стр, журнал, проблемы } = await открыть({ путь: '#/hadith/item?n=' + хадис, язык: 'kk' });
    await э(стр, 'хадис-перевод').waitFor({ timeout: 20000 });
    await выделить(стр, 'хадис-перевод', 30);
    await э(стр, 'ошибка-чип').waitFor({ timeout: 5000 });
    проверить((await текст(стр, 'ошибка-чип')) === '⚠ Қате', 'kk: чип «⚠ Қате»');
    await э(стр, 'ошибка-чип').click();
    await э(стр, 'ошибка-лист').waitFor({ timeout: 10000 });
    проверить(await стр.getByText('Қате туралы хабарлау').first().isVisible(), 'kk: «Қате туралы хабарлау»');
    проверить(await стр.getByText('Құран / тәжуид').isVisible() && await стр.getByText('Сізбен қалай байланысуға болады (қаласаңыз)').isVisible(), 'kk: разделы и «контакт (қаласаңыз)»');
    await снимок(стр, 'feedback-kk-sheet.png');
    await э(стр, 'ошибка-текст').fill('Аудармада бір сөз жоқ.');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor({ timeout: 5000 });
    проверить((await текст(стр, 'ошибка-спасибо')).includes('Рақмет! Тексеріп, түзетеміз.'), 'kk: «Рақмет! Тексеріп, түзетеміз.»');
    проверить(журнал.сообщения[0].тело.lang === 'kk', 'kk: lang kk');
    await безПроблем(стр, проблемы, 'kk');
    await контекст.close();
  }

  // 6. Компьютер: двойной щелчок по слову; в полях листа выделение чип не вызывает.
  console.log('\n══ «Сообщить об ошибке»: компьютер 1280×800 ══');
  {
    const { контекст, стр, журнал, проблемы } = await открыть({ путь: '#/hadith/item?n=' + хадис, профиль: { viewport: { width: 1280, height: 800 } } });
    await э(стр, 'хадис-перевод').waitFor({ timeout: 20000 });
    await э(стр, 'хадис-перевод').dblclick({ position: { x: 40, y: 10 } });
    await э(стр, 'ошибка-чип').waitFor({ timeout: 5000 });
    проверить(true, 'двойной щелчок по слову — чип');
    await э(стр, 'ошибка-чип').click();
    await э(стр, 'ошибка-лист').waitFor({ timeout: 10000 });
    await э(стр, 'ошибка-текст').fill('Проверка выделения в поле');
    await э(стр, 'ошибка-текст').selectText();
    await стр.waitForTimeout(400);
    проверить((await стр.getByTestId('ошибка-чип').count()) === 0, 'выделение в поле листа — без чипа');
    await э(стр, 'ошибка-отправить').click();
    await э(стр, 'ошибка-спасибо').waitFor({ timeout: 5000 });
    проверить(журнал.сообщения[0].тело.dev === 'desktop', 'компьютер: dev desktop');
    await безПроблем(стр, проблемы, 'компьютер');
    await контекст.close();
  }

  // 7. batr.kz — без отправки.
  console.log('\n══ «Сообщить об ошибке»: batr.kz ══');
  {
    const { контекст, стр, журнал, проблемы } = await открыть({ сайт: 'https://batr.kz', путь: '#/hadith/item?n=' + хадис });
    await э(стр, 'хадис-перевод').waitFor({ timeout: 20000 });
    await выделить(стр, 'хадис-перевод');
    await э(стр, 'ошибка-чип').waitFor({ timeout: 5000 });
    await э(стр, 'ошибка-чип').click();
    await э(стр, 'ошибка-не-свой').waitFor({ timeout: 10000 });
    проверить((await текст(стр, 'ошибка-не-свой')).includes('aiustaz.pro'), 'batr.kz: «Отправить можно на aiustaz.pro»');
    проверить((await стр.getByTestId('ошибка-текст').count()) === 0 && (await стр.getByTestId('ошибка-отправить').count()) === 0, 'batr.kz: формы нет');
    const [открыто] = await Promise.all([
      контекст.waitForEvent('page', { timeout: 5000 }).catch(() => null),
      э(стр, 'ошибка-на-сайт').click(),
    ]);
    const адрес = открыто ? открыто.url() : '';
    if (открыто) await открыто.close();
    проверить(адрес === 'https://aiustaz.pro/aiustaz/#/hadith/item?n=' + хадис, 'batr.kz: «Открыть на aiustaz.pro» — это же место: ' + адрес);
    await стр.evaluate(() => { location.hash = '#/more'; });
    await стр.waitForTimeout(300);
    проверить((await стр.getByTestId('ошибка-лист').count()) === 0, 'сменили экран — лист закрылся');
    await э(стр, 'ещё-ошибка').click();
    await э(стр, 'ошибка-не-свой').waitFor();
    проверить(журнал.сообщения.length === 0, 'batr.kz: запросов /api/feedback нет');
    await безПроблем(стр, проблемы, 'batr.kz');
    await контекст.close();
  }
  return проверок;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { chromium } = require('playwright');
  const браузер = await chromium.launch();
  try {
    const n = await сообщитьСквозной(браузер);
    console.log(`\nOK: «Сообщить об ошибке» — ${n} проверок`);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
  }
}
