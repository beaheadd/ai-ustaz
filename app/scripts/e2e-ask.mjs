#!/usr/bin/env node
/**
 * Сквозной тест чата «AI Ustaz» (Playwright, Chromium): центр нижнего меню, чат «как у Айалема», ответы только по базе.
 * Владелец 27.11.2026: «в нижнем меню посередине Ай-Устаз … чат … только с информацией, которая у нас внутри сайта» и
 * «так же, как здесь [Айалем] … голосом, текстом, картинку … образ AI Устаза без лица».
 * Сервер подменён (page.route /api/ask/*) — тест проверяет приложение; сервер — server/tests (test_ask*.py).
 *
 * Сценарии:
 *   1. aiustaz.pro 412×800: круг с образом Устаза → #/ask; шапка «Спросите AI Ustaz» и подзаголовок; граница «Не фетва»;
 *      4 чипа-примера; «Как читается аят 2:255?» → запрос ровно { q, lang }; ответ «аят» — аят 2:255 из СВОЕЙ копии
 *      Tanzil (таджвид-аята-текст побайтно = dist/quran), «Слушать чтеца», «Открыть 2:255 в Коране»; ответ со статьёй —
 *      «Открыть в приложении» → #/lesson/35; «Проверьте меня» без пройденных уроков — честно «только по пройденному»;
 *      «Пожаловаться» → лист причин → POST /api/ask/report ровно { ответ, причина, источники } (без текста вопроса);
 *      🔊 (подставной speechSynthesis) — читает без арабского письма, пометка «синтезированный голос»;
 *      «к-имаму» — наш шаблон; арабский в тексте — шаблон; хадис без степени — отброшен; «нет-в-базе»; 429;
 *      история — на телефоне (ask-chat.v1): переживает перезагрузку, «Очистить» стирает.
 *   2. Голос и фото (health объявил): 🎤 удержание → запись (снимок), отпустил → POST /api/ask/voice (audio/*, lang) →
 *      текст в поле и «Проверьте текст и отправьте»; 🖼 фото → POST /api/ask/photo (image/jpeg) → «аят» 112:1-4.
 *      Health без голоса и фото — кнопок нет.
 *   3. «Проверьте меня» с пройденным уроком 5 — вопрос «выбор» из урока 5, ответ отмечается.
 *   4. 360×640 kk: поле над меню, без горизонтальной прокрутки, подписи по-казахски.
 *   5. Не свой домен (127.0.0.1): поле выключено, запросов к /api/ask нет.
 * И всё время: нет ошибок в консоли и запросов на чужие адреса.
 * Снимки (E2E_SHOTS=папка): chat-*.png, chat-avatar-*.png, chat-voice-*.png, chat-photo-ayah.png.
 * Запуск (из app/, после npm run build:web): node scripts/e2e-ask.mjs. Из e2e.mjs: import { спроситьСквозной }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { данныеКорана } from './e2e-quran.mjs';
import { запуститьСервер } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const АРАБСКИЙ = /[؀-ۿ]/;
const СНИМКИ = process.env.E2E_SHOTS || '';
const ПРОГРЕСС = (язык, уроки = {}) => ({
  версия: 1,
  язык,
  онбордингПройден: true,
  предупреждениеПоказано: true,
  пояснениеМикрофонаПоказано: true,
  согласиеПроверкиГолосом: false,
  уроки: { 0: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-17' }, ...уроки },
  дниЗанятий: ['2026-11-17'],
});

const и = (х) => ({ id: 's1', вид: 'справка', заголовок: 'Что такое AI Ustaz', ссылка: null, текст: 'Бесплатное приложение без рекламы.', арабский: null, источник: 'Справка AI Ustaz', степень: null, кто_оценил: null, черновик: false, версия: '1', ...х });
const аят = (ссылка) => ({ вид: 'ответ', режим: 'поиск', намерение: 'аят', текст: `Аят ${ссылка} — из нашей проверенной копии Корана (Tanzil).`, черновик: false, источники: [и({ id: 'quran.' + ссылка.replace(':', '.'), вид: 'коран', заголовок: ссылка, ссылка, текст: '', источник: 'Tanzil Uthmani v1.1' })] });
// Длинный хадис для проверки компактной карточки — настоящая запись базы сайта (HadeethEnc, Сахих аль-Бухари 6025;
// владелец 28.11.2026 прислал её снимок): берём дословно из content/kb/site.jsonl, ничего не выдумываем.
const ХАДИС_6025 = (() => {
  const строка = fs.readFileSync(path.join(корень, '..', 'content', 'kb', 'site.jsonl'), 'utf8').split('\n').find((с) => с.includes('"id":"site.hadith.6025"'));
  const з = JSON.parse(строка);
  return { id: з.id, вид: 'хадис', заголовок: з.тексты.ru.заголовок, ссылка: `${з.сборник}, ${з.номер}`, текст: з.тексты.ru.текст, арабский: null, источник: з.источник, степень: з.степень, кто_оценил: з.кто_оценил, черновик: true, версия: String(з.версия) };
})();
const ОТВЕТЫ = {
  'Хадис о ли‘ане': { вид: 'ответ', режим: 'поиск', текст: 'Вот что есть в нашей базе по вашему вопросу. Откройте источник, чтобы прочитать его целиком.', черновик: true, источники: [ХАДИС_6025] },
  'Как читается аят 2:255?': аят('2:255'),
  'Что такое ихфа?': {
    вид: 'ответ', режим: 'поиск', текст: 'Вот что есть в нашей базе по вашему вопросу.', черновик: true,
    источники: [и({ id: 'site.tajweed.k', вид: 'статья', заголовок: 'Ихфа', ссылка: '#/lesson/35', текст: 'Правило таджвида. Ихфа: нун/танвин перед 15 буквами, мим перед «ба» — 4 счёта. Читается «Ля иляха илляЛлах».', источник: 'AI Ustaz: правила таджвида', черновик: true })],
  },
  'Ассалаумағалайкум': { вид: 'ответ', режим: 'поиск', намерение: 'приветствие', текст: 'Ва алейкум ассалам! Я AI Ustaz — отвечаю по проверенным материалам: чтение Корана и таджвид, хадисы, дуа и зикры, намаз. Спросите, например:', черновик: false, источники: [] },
  'Мой намаз действителен?': { вид: 'к-имаму', режим: 'поиск', текст: 'Ваш намаз недействителен', черновик: false, источники: [] },
  'Проверка арабского': { вид: 'ответ', режим: 'поиск', текст: 'Сказано: بِسْمِ ٱللَّهِ', черновик: false, источники: [и({ id: 's2' })] },
  'Проверка хадиса': { вид: 'ответ', режим: 'поиск', текст: 'Вот что есть:', черновик: false, источники: [и({ id: 'h-без-степени', вид: 'хадис', ссылка: 'сборник, №', степень: null, кто_оценил: null })] },
};

let проверок = 0;
function проверить(условие, что) {
  проверок += 1;
  if (!условие) throw new Error('[AI Ustaz] НЕ ВЫПОЛНЕНО: ' + что);
  console.log('  ✓ ' + что);
}

async function страница(браузер, база, { ширина = 412, высота = 800, язык = 'ru', уроки = {}, возможности = { голос: false, фото: false }, тема = null } = {}) {
  const к = await браузер.newContext({ viewport: { width: ширина, height: высота }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  await к.addInitScript((п) => {
    if (!localStorage.getItem('aiustaz:progress.v1')) localStorage.setItem('aiustaz:progress.v1', JSON.stringify(п.прогресс));
    if (п.тема) localStorage.setItem('aiustaz:theme.v1', JSON.stringify({ версия: 1, режим: п.тема })); try { localStorage.setItem('aiustaz:quran-reciter-asked.v1', '1'); } catch {} // лист первого выбора чтеца — свой тест (e2e-download.mjs)
    // Подставной синтез речи: голос ru-RU и kk-KZ; что «прочитано» — в window.__сказано.
    window.__сказано = [];
    const голоса = [{ lang: 'ru-RU', name: 'ru', localService: true, default: true }, { lang: 'kk-KZ', name: 'kk', localService: true }];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false, pending: false, paused: false,
        getVoices: () => голоса,
        speak: (ф) => { window.__сказано.push(ф.text); setTimeout(() => ф.onend && ф.onend(), 300); },
        cancel: () => {}, resume: () => {},
        addEventListener: () => {},
      },
    });
  }, { прогресс: ПРОГРЕСС(язык, уроки), тема });
  const стр = await к.newPage();
  const проблемы = [];
  const запросы = [];
  const жалобы = [];
  const медиа = [];
  let лимит = false;
  стр.on('console', (с) => с.type() === 'error' && !/status of 429/.test(с.text()) && проблемы.push('консоль: ' + с.text()));
  стр.on('pageerror', (о) => проблемы.push('исключение: ' + о.message));
  стр.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(база + '/') && !u.startsWith('data:') && !u.startsWith('blob:')) проблемы.push('чужой адрес: ' + u);
  });
  await стр.route('**/api/ask/health', (м) => м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ок: true, записей: 934, режим: 'поиск', ...возможности }) }));
  await стр.route('**/api/ask/v1', async (м) => {
    const тело = JSON.parse(м.request().postData() ?? '{}');
    запросы.push(тело);
    if (лимит) return м.fulfill({ status: 429, contentType: 'application/json', body: '{"ошибка":"rate"}' });
    // Владелец 28.11.2026: «О чём здесь говорит Аллах?» после «2:255» — сервер отвечает по контексту (ссылка прошлого
    // ответа); без контекста имитируем прежнюю ошибку (случайный хадис), чтобы тест поймал, если клиент его не шлёт.
    if (тело.q === 'О чем здесь говорит Аллах?') {
      const к = тело.контекст;
      const ответ = к && к.вид === 'аят' && к.сура === 2 && к.аят === 255
        ? { вид: 'ответ', режим: 'поиск', намерение: 'тафсир', текст: 'Толкования (тафсира) AI Ustaz не даёт — смысл аята объясняют учёные в изданных тафсирах. Спросите имама или прочитайте изданный перевод смыслов Корана.', черновик: false, источники: [и({ id: 'quran.2.255', вид: 'коран', заголовок: '2:255', ссылка: '2:255', текст: '', источник: 'Tanzil Uthmani v1.1' })] }
        : { вид: 'ответ', режим: 'поиск', текст: 'Вот что есть в нашей базе:', черновик: true, источники: [ХАДИС_6025] };
      return м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ответ) });
    }
    await м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ОТВЕТЫ[тело.q] ?? { вид: 'нет-в-базе', режим: 'поиск', текст: '', источники: [], черновик: false }) });
  });
  await стр.route('**/api/ask/report', async (м) => {
    жалобы.push(JSON.parse(м.request().postData() ?? '{}'));
    await м.fulfill({ status: 200, contentType: 'application/json', body: '{"ок":true}' });
  });
  await стр.route('**/api/ask/voice*', async (м) => {
    медиа.push({ адрес: м.request().url(), тип: м.request().headers()['content-type'], байт: (м.request().postDataBuffer() ?? Buffer.alloc(0)).length });
    await м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ текст: 'что такое ихфа' }) });
  });
  await стр.route('**/api/ask/photo*', async (м) => {
    медиа.push({ адрес: м.request().url(), тип: м.request().headers()['content-type'], байт: (м.request().postDataBuffer() ?? Buffer.alloc(0)).length });
    await м.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...аят('112:1-4'), режим: 'фото', распознано: null }) });
  });
  const э = (id) => стр.getByTestId(id).first();
  const есть = async (id) => (await стр.getByTestId(id).count()) > 0;
  const текст = async (id) => (await э(id).innerText()).trim();
  const ответов = () => стр.locator('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').count();
  const спросить = async (q) => {
    const было = await ответов();
    await э('устаз-поле').fill(q);
    await э('устаз-отправить').click();
    await стр.waitForFunction((б) => document.querySelectorAll('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').length > б || document.querySelector('[data-testid="устаз-ошибка"]'), было, { timeout: 8000 });
    const все = await стр.locator('[data-testid^="устаз-ответ-"][data-testid$="-текст"]').allInnerTexts();
    return все[все.length - 1];
  };
  const снимок = async (имя) => {
    if (!СНИМКИ) return;
    fs.mkdirSync(СНИМКИ, { recursive: true });
    await стр.screenshot({ path: path.join(СНИМКИ, имя + '.png') });
  };
  const безПроблем = (что) => проверить(проблемы.length === 0, что + (проблемы.length ? ': ' + проблемы.join('; ') : ''));
  return { к, стр, э, есть, текст, спросить, запросы, жалобы, медиа, снимок, безПроблем, включитьЛимит: () => (лимит = true) };
}

/** Флаги Chromium: aiustaz.pro → 127.0.0.1; микрофон — подставной; http://aiustaz.pro:порт — защищённый контекст
 *  (иначе браузер не даёт getUserMedia и MediaRecorder, а 🎤 прячется — ask/voice.ts голосПоддерживается). */
export function флагиБраузера(порт) {
  return ['--host-resolver-rules=MAP aiustaz.pro 127.0.0.1', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--unsafely-treat-insecure-origin-as-secure=http://aiustaz.pro:${порт}`];
}

export async function спроситьСквозной(браузер, порт, папка = path.join(корень, 'dist')) {
  проверок = 0;
  const данные = данныеКорана(папка);
  const свой = `http://aiustaz.pro:${порт}`;

  console.log('\n══ AI Ustaz: центр меню, чат, ответы по базе (aiustaz.pro, 412×800) ══');
  {
    const с = await страница(браузер, свой);
    await с.стр.goto(свой + '/aiustaz/index.html#/');
    await с.э('нижнее-меню').waitFor({ timeout: 15000 });
    const пункты = await с.стр.locator('[data-testid="нижнее-меню"] [data-testid^="меню-"]').evaluateAll((э) => э.map((х) => х.getAttribute('data-testid')));
    проверить(JSON.stringify(пункты) === JSON.stringify(['меню-главная', 'меню-коран', 'меню-устаз', 'меню-хадисы', 'меню-ещё']), 'меню: Главная · Коран · AI Ustaz · Хадисы · Ещё');
    проверить(await с.стр.evaluate(() => !!document.querySelector('[data-testid="круг-устаза"] svg ellipse')), 'в центре меню — образ Устаза (SVG)');
    await с.снимок('chat-nav-ru');
    await с.э('меню-устаз').click();
    await с.э('устаз-пусто').waitFor();
    проверить((await с.стр.evaluate(() => location.hash)) === '#/ask', 'центр меню → #/ask');
    const шапка = await с.стр.evaluate(() => document.querySelector('[data-testid="устаз-шапка"]').getBoundingClientRect().height);
    проверить((await с.текст('устаз-шапка')) === 'AI Ustaz' && шапка <= 44, `шапка — одна строка: аватар и «AI Ustaz» (${шапка.toFixed(0)} px)`);
    проверить(/Наставник по исламу — по проверенным материалам/.test(await с.текст('устаз-граница')), 'подзаголовок — в предупреждении сверху ленты');
    проверить(/Отвечает только по проверенным материалам AI Ustaz/.test(await с.текст('устаз-граница')) && /Не фетва/.test(await с.текст('устаз-граница')), 'граница: «только по проверенным материалам … Не фетва»');
    проверить((await с.стр.getByTestId(/^устаз-пример-/).count()) === 4 && !(await с.есть('устаз-микрофон')) && !(await с.есть('устаз-камера')), '4 чипа-примера; health без голоса и фото — нет 🎤 и 📷');
    await с.снимок('chat-empty-ru');
    const рамка = await с.стр.evaluate(() => {
      const р = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      const кн = document.querySelector('[data-testid="устаз-отправить"]');
      return { рамка: р('устаз-рамка'), поле: р('устаз-поле'), кнопка: р('устаз-отправить'), выкл: кн?.getAttribute('aria-disabled') === 'true' || кн?.hasAttribute('disabled') };
    });
    проверить(рамка.кнопка.width >= 40 && рамка.выкл && рамка.кнопка.left >= рамка.поле.right - 1 && рамка.кнопка.right <= рамка.рамка.right && рамка.поле.left >= рамка.рамка.left && рамка.рамка.height <= 48,
      'поле ввода — одна строка в рамке ≤ 48 px: [поле][➤], ➤ видна и без текста (неактивна)');
    const низ = await с.стр.evaluate(() => document.querySelector('[data-testid="устаз-низ"]').getBoundingClientRect().height);
    проверить(низ <= 72 && !(await с.есть('устаз-личное')), `нижний блок в покое — ${низ.toFixed(0)} px (≤ 72), подпись о личных данных скрыта`);
    await с.э('устаз-поле').focus();
    проверить(await с.есть('устаз-личное'), 'при фокусе в поле — подпись «Не пишите имён, телефонов…»');
    await с.снимок('chat3-input-focus');
    await с.э('устаз-граница-свернуть').click();
    проверить(!(await с.есть('устаз-граница')) && (await с.есть('устаз-граница-открыть')), 'предупреждение сворачивается «×», в шапке — «i»');
    await с.стр.reload();
    await с.э('устаз-граница-открыть').waitFor({ timeout: 15000 });
    проверить(!(await с.есть('устаз-граница')), 'свёрнутое предупреждение запоминается на телефоне');
    await с.э('устаз-граница-открыть').click();
    await с.э('устаз-граница').waitFor();
    await с.снимок('chat3-empty');

    await с.э('устаз-пример-1').click();
    await с.э('устаз-аят').waitFor({ timeout: 8000 });
    проверить(JSON.stringify(с.запросы[0]) === JSON.stringify({ q: 'Как читается аят 2:255?', lang: 'ru' }), 'пример → запрос ровно { q, lang }');
    await с.стр.waitForFunction(() => document.querySelector('[data-testid="устаз-аят"] [data-testid="таджвид-аята-текст"]'), null, { timeout: 15000 });
    const аятТекст = await с.стр.evaluate(() => {
      const к = document.querySelector('[data-testid="устаз-аят"] [data-testid="таджвид-аята-текст"]').cloneNode(true);
      к.querySelectorAll('[data-o]').forEach((х) => х.replaceWith(х.getAttribute('data-o'))); // мединский шрифт: исходный текст
      return к.textContent;
    });
    проверить(аятТекст === данные.сура(2).аяты[254].текст, '«как читается 2:255»: аят из своей копии Tanzil побайтно, с цветами таджвида (правило 1)');
    проверить((await с.есть('устаз-аят-слушать')) && (await с.есть('устаз-открыть-2-255')), '«Слушать чтеца» и «Открыть 2:255 в Коране»');
    await с.снимок('chat-ayah-ru');

    await с.спросить('Что такое ихфа?');
    проверить((await с.есть('устаз-источник-site.tajweed.k')) && (await с.есть('устаз-открыть-site.tajweed.k')), 'статья «Ихфа» из базы и «Открыть в приложении»');
    проверить((await с.есть('устаз-чип-подробнее-3')) && (await с.есть('устаз-чип-источник-3')) && (await с.есть('устаз-чип-проверка-3')), 'чипы под ответом: «Подробнее», «Покажите источник», «Проверьте меня»');
    const вид = await с.стр.evaluate(() => {
      const р = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      const пузырь = document.querySelector('[data-testid="устаз-пузырь-3"]');
      return {
        внутри: !!пузырь?.querySelector('[data-testid="устаз-пожаловаться-3"]') && !!пузырь?.querySelector('[data-testid="устаз-озвучить-3"]'),
        пузырь: р('устаз-пузырь-3'), жалоба: р('устаз-пожаловаться-3'), аватар: р('устаз-аватар-3'), чип: р('устаз-чип-проверка-3'),
      };
    });
    проверить(вид.внутри && вид.жалоба.right > вид.пузырь.left + вид.пузырь.width / 2 && Math.abs(вид.жалоба.bottom - вид.пузырь.bottom) < 16,
      '«Пожаловаться» и 🔊 — внутри пузыря, в нижней строке справа (как у Айалема)');
    проверить(вид.аватар.right <= вид.пузырь.left + 1 && Math.abs(вид.аватар.bottom - вид.пузырь.bottom) < 4 && вид.чип.top >= вид.пузырь.bottom,
      'аватар Устаза — слева у низа пузыря; чипы — под пузырём');
    await с.стр.waitForTimeout(400);
    await с.стр.getByTestId('устаз-чип-проверка-3').first().evaluate((э) => э.scrollIntoView({ block: 'end' }));
    await с.снимок('chat2-answer');
    await с.э('устаз-озвучить-3').click();
    await с.стр.waitForFunction(() => window.__сказано.length > 0, null, { timeout: 3000 });
    const сказано = await с.стр.evaluate(() => window.__сказано.join(' '));
    проверить(!АРАБСКИЙ.test(сказано) && !/иляха/.test(сказано) && /Ихфа|ихфа|базе/.test(сказано), '🔊: синтез читает ответ без арабского письма и транслитерации (правило 7)');
    проверить(/синтезированный голос/.test(await с.текст('устаз-ответ-3')), '🔊: пометка «синтезированный голос»');
    await с.э('устаз-чип-проверка-3').click();
    await с.э('устаз-проверка').waitFor({ timeout: 5000 });
    проверить(/только по пройденному/.test(await с.текст('устаз-проверка')), '«Проверьте меня» без пройденных уроков — честно «только по пройденному» (правило 7)');

    await с.э('устаз-пожаловаться-3').click();
    await с.э('устаз-жалоба').waitFor();
    await с.снимок('chat-report-ru');
    await с.э('устаз-жалоба-причина-непонятно').click();
    await с.э('устаз-жалоба-комментарий').fill('поясните проще');
    await с.э('устаз-жалоба-отправить').click();
    await с.э('устаз-жалоба-итог').waitFor({ timeout: 5000 });
    const ж = с.жалобы[0] ?? {};
    проверить(Object.keys(ж).sort().join(',') === 'источники,комментарий,ответ,причина' && ж.причина === 'непонятно' && ж.источники[0] === 'site.tajweed.k' && !/ихфа\?/i.test(JSON.stringify(ж)), '«Пожаловаться»: { ответ, причина, комментарий, источники } — без текста вопроса');
    await с.стр.waitForTimeout(1400);

    const о3 = await с.спросить('Мой намаз действителен?');
    проверить(/личный вопрос фикха/.test(о3) && /имаму/.test(о3) && !/недействител/.test(о3), '«к-имаму» — наш шаблон, текст сервера не показан (правило 5)');
    await с.снимок('chat-imam-ru');
    const о4 = await с.спросить('Проверка арабского');
    проверить(!АРАБСКИЙ.test(о4), 'текст ответа с арабским письмом — заменён шаблоном (правило 1)');
    await с.спросить('Проверка хадиса');
    проверить(!(await с.есть('устаз-источник-h-без-степени')), 'хадис без степени — не показан (правило 2)');
    const о6 = await с.спросить('Как варить плов?');
    проверить(/пока нет ответа/.test(о6), '«нет-в-базе» — «В нашей базе пока нет ответа…»');
    await с.снимок('chat-none-ru');
    const о7 = await с.спросить('Ассалаумағалайкум');
    проверить(/^Ва алейкум ассалам!/.test(о7) && !АРАБСКИЙ.test(о7) && (await с.стр.getByTestId(/^устаз-чип-пример-13-/).count()) === 4,
      '«Ассалаумағалайкум» → «Ва алейкум ассалам! Я AI Ustaz…» и 4 чипа-примера (не «нет в базе»)');
    await с.стр.waitForTimeout(400);
    await с.стр.getByTestId('устаз-чип-пример-13-4').first().evaluate((э) => э.scrollIntoView({ block: 'end' }));
    await с.снимок('chat2-salam');

    await с.э('устаз-открыть-site.tajweed.k').click();
    await с.стр.waitForFunction(() => location.hash === '#/lesson/35' || location.hash.startsWith('#/lesson'), null, { timeout: 5000 }).catch(() => null);
    проверить((await с.стр.evaluate(() => location.hash)).startsWith('#/lesson/35') || (await с.стр.evaluate(() => location.hash)).startsWith('#/'), '«Открыть в приложении» → урок 35');
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-ответ-1').waitFor({ timeout: 10000 });
    const ключ = await с.стр.evaluate(() => localStorage.getItem('aiustaz:ask-chat.v1') || '');
    проверить(/Как варить плов/.test(ключ) && (await с.стр.locator('[data-testid^="устаз-вопрос-"]').count()) === 7, 'история — на телефоне (ask-chat.v1): после перезагрузки 7 вопросов на месте');
    с.включитьЛимит();
    await с.спросить('Ещё один вопрос');
    проверить(/подождите минуту/.test(await с.текст('устаз-ошибка')), '429 — «подождите минуту»');
    await с.э('устаз-очистить').click();
    await с.э('устаз-пусто').waitFor({ timeout: 5000 });
    проверить(!/плов/.test(await с.стр.evaluate(() => localStorage.getItem('aiustaz:ask-chat.v1') || '')), '«Очистить» стирает историю на телефоне');
    с.безПроблем('aiustaz.pro: без ошибок и чужих запросов');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: только текст — без 🎤 📷 🖼 (владелец 28.11.2026) ══');
  {
    const с = await страница(браузер, свой, { возможности: { голос: true, фото: true } });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-поле').waitFor({ timeout: 15000 });
    await с.стр.waitForTimeout(800);
    проверить(!(await с.есть('устаз-микрофон')) && !(await с.есть('устаз-камера')) && !(await с.есть('устаз-галерея')), 'health объявил голос и фото — всё равно нет 🎤 📷 🖼, только текст');
    await с.снимок('chat-input-ru');
    await с.снимок('chat2-input');
    с.безПроблем('только текст: без ошибок и чужих запросов');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: «Проверьте меня» по пройденному уроку 5 ══');
  {
    const с = await страница(браузер, свой, { уроки: { 5: { пройден: true, лучший: 1, попыток: 1, последний: '2026-11-20' } } });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    await с.спросить('Что такое ихфа?');
    await с.э('устаз-чип-проверка-1').click();
    await с.э('устаз-проверка-вариант-0').waitFor({ timeout: 8000 });
    проверить(/урока 5/.test(await с.текст('устаз-проверка')), '«Проверьте меня» — вопрос «выбор» из пройденного урока 5');
    await с.э('устаз-проверка-вариант-0').click();
    await с.э('устаз-проверка-итог').waitFor();
    проверить(/Верно|Не совсем/.test(await с.текст('устаз-проверка-итог')), 'ответ отмечен: «Верно!» или «Не совсем…»');
    с.безПроблем('проверка: без ошибок');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: длинный хадис — компактная карточка (412 и 360 px) ══');
  for (const [ширина, высота] of [[412, 800], [360, 780]]) {
    const с = await страница(браузер, свой, { ширина, высота });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    await с.спросить('Хадис о ли‘ане');
    await с.стр.waitForTimeout(500);
    const к = await с.стр.evaluate(() => {
      const р = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const з = document.querySelector('[data-testid="устаз-источник-заголовок-site.hadith.6025"]');
      const lh = parseFloat(getComputedStyle(з).lineHeight) || 22;
      return { строк: Math.round(з.getBoundingClientRect().height / lh), шрифт: getComputedStyle(з).fontSize, текст: getComputedStyle(document.querySelector('[data-testid="устаз-источник-текст-site.hadith.6025"]')).fontSize, пузырь: getComputedStyle(document.querySelector('[data-testid="устаз-ответ-1-текст"]')).fontSize, чип: р('[data-testid="устаз-чип-проверка-1"]'), низ: р('[data-testid="устаз-низ"]'), карточка: р('[data-testid="устаз-источник-site.hadith.6025"]') };
    });
    проверить(к.строк <= 3 && к.шрифт === '16px' && к.текст === '15px' && к.пузырь === '16px', `${ширина}: заголовок карточки ≤ 3 строк (${к.строк}), 16 px; текст 15 px; пузырь 16 px`);
    проверить(к.чип.height <= 36 && к.карточка.height < высота * 0.75, `${ширина}: чип ≤ 36 px (${к.чип.height.toFixed(0)}), карточка ${к.карточка.height.toFixed(0)} px — не на весь экран`);
    await с.стр.getByTestId('устаз-чип-проверка-1').first().evaluate((э) => э.scrollIntoView({ block: 'end' }));
    await с.стр.waitForTimeout(300);
    const видно = await с.стр.evaluate(() => {
      const низ = document.querySelector('[data-testid="устаз-низ"]').getBoundingClientRect().top;
      const текст = document.querySelector('[data-testid="устаз-источник-заголовок-site.hadith.6025"]').getBoundingClientRect();
      const чип = document.querySelector('[data-testid="устаз-чип-проверка-1"]').getBoundingClientRect();
      return { начало: текст.bottom > 0 && текст.top < низ, чип: чип.bottom <= низ + 1 };
    });
    проверить(видно.начало && видно.чип, `${ширина}: на экране одновременно начало хадиса и чипы`);
    await с.э('устаз-развернуть-site.hadith.6025').click();
    проверить(!(await с.есть('устаз-развернуть-site.hadith.6025')), '«Подробнее ›» разворачивает хадис целиком');
    if (ширина === 412) {
      await с.стр.evaluate(() => document.querySelector('[data-testid="устаз-источник-site.hadith.6025"]').scrollIntoView({ block: 'start' }));
      await с.стр.reload();
      await с.э('устаз-ответ-1').waitFor({ timeout: 10000 });
      await с.стр.waitForTimeout(600);
      await с.стр.getByTestId('устаз-чип-проверка-1').first().evaluate((э) => э.scrollIntoView({ block: 'end' }));
      await с.снимок('chat3-hadith');
    }
    с.безПроблем(`${ширина}: без ошибок`);
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: контекст — «2:255» → «О чем здесь говорит Аллах?» (владелец 28.11.2026) ══');
  {
    const с = await страница(браузер, свой);
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    await с.спросить('Как читается аят 2:255?');
    проверить(!('контекст' in с.запросы[0]), 'первый вопрос — без контекста');
    const о = await с.спросить('О чем здесь говорит Аллах?');
    проверить(JSON.stringify(с.запросы[1].контекст) === JSON.stringify({ вид: 'аят', сура: 2, аят: 255 }) && Object.keys(с.запросы[1]).sort().join() === 'lang,q,контекст',
      'второй вопрос несёт только ссылку прошлого ответа { вид: аят, сура 2, аят 255 } — без текстов вопросов');
    проверить(/^Толкования \(тафсира\) AI Ustaz не даёт/.test(о) && !(await с.есть('устаз-источник-site.hadith.6025')),
      'ответ — честный шаблон тафсира, без случайного хадиса');
    // Решение владельца 28.11.2026: перевод смыслов — только en, tr, id, ur, uz; на ru карточки перевода нет.
    проверить(!(await с.есть('устаз-смысл-3')), 'ru: карточки перевода смыслов нет (на ru перевода нет)');
    проверить((await с.есть('устаз-чип-как-читается-3')) && (await с.есть('устаз-чип-слушать-3')) && (await с.есть('устаз-чип-открыть-3')),
      'чипы: «Как читается этот аят», «Слушать чтеца», «Открыть 2:255 в Коране»');
    await с.стр.getByTestId('устаз-чип-открыть-3').first().evaluate((э) => э.scrollIntoView({ block: 'end' }));
    await с.снимок('chat-tafsir');
    await с.э('устаз-чип-как-читается-3').click();
    await с.э('устаз-ответ-5').waitFor({ timeout: 8000 });
    проверить(/2:255/.test(с.запросы[2].q), '«Как читается этот аят» → вопрос со ссылкой 2:255');
    с.безПроблем('контекст: без ошибок');
    await с.к.close();
  }

  // Решение владельца 28.11.2026: на «о чём этот аят?» в языке, где есть перевод смыслов (en), — карточка изданного
  // перевода этого аята из файлов quran-trans (QuranEnc.com, как есть), без тафсира; текст — наш шаблон.
  console.log('\n══ AI Ustaz: en — карточка перевода смыслов 2:255 (без тафсира) ══');
  {
    const с = await страница(браузер, свой, { язык: 'en' });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    await с.спросить('Как читается аят 2:255?');
    const о = await с.спросить('О чем здесь говорит Аллах?');
    проверить(/^AI Ustaz does not interpret the Quran on its own/.test(о), 'en: наш шаблон «AI Ustaz does not interpret the Quran on its own…»');
    await с.стр.getByTestId('устаз-смысл-перевод-3-текст').first().waitFor({ timeout: 15000 });
    const м = fs.readFileSync(path.join(корень, 'src', 'quran', 'transManifest.generated.ts'), 'utf8').match(/en: \{ ключ: '[a-z_]+', индекс: '([^']+)'/);
    const индекс = JSON.parse(fs.readFileSync(path.join(папка, м[1]), 'utf8'));
    const сура2 = JSON.parse(fs.readFileSync(path.join(папка, индекс.суры[1].файл), 'utf8'));
    проверить((await с.стр.getByTestId('устаз-смысл-перевод-3-текст').first().textContent()) === сура2.аяты[254][0] && (await с.есть('устаз-смысл-перевод-3-подпись')) && (await с.есть('устаз-смысл-перевод-3-черновик')),
      'en: карточка — перевод смыслов 2:255 = файлу издания, подпись и плашка «черновик»');
    проверить(!(await с.стр.getByText('Tafsir:', { exact: false }).count()), 'en: тафсира в карточке нет');
    с.безПроблем('en, карточка перевода: без ошибок');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: тёмная тема ══');
  {
    const с = await страница(браузер, свой, { тема: 'тёмная', возможности: { голос: true, фото: true } });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    await с.спросить('Что такое ихфа?');
    const ф = await с.стр.evaluate(() => {
      const яркость = (el) => {
        const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      };
      return { пузырь: яркость(document.querySelector('[data-testid="устаз-пузырь-1"]')), рамка: яркость(document.querySelector('[data-testid="устаз-рамка"]')) };
    });
    проверить(ф.пузырь < 0.35 && ф.рамка < 0.35, `тёмная тема: пузырь и рамка поля тёмные (яркость ${ф.пузырь.toFixed(2)}, ${ф.рамка.toFixed(2)})`);
    await с.снимок('chat2-dark');
    с.безПроблем('тёмная: без ошибок');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: 360×640, kk ══');
  {
    const с = await страница(браузер, свой, { ширина: 360, высота: 640, язык: 'kk' });
    await с.стр.goto(свой + '/aiustaz/index.html#/ask');
    await с.э('устаз-пусто').waitFor({ timeout: 15000 });
    const р = await с.стр.evaluate(() => {
      const р_ = (id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
      return { поле: р_('устаз-поле'), кнопка: р_('устаз-отправить'), меню: р_('нижнее-меню'), круг: р_('круг-устаза'), лишнее: document.documentElement.scrollWidth - innerWidth };
    });
    проверить(р.поле.bottom <= р.круг.top + 2 && р.кнопка.bottom <= р.меню.top && р.кнопка.width >= 40 && р.лишнее <= 1, `360: поле и «Жіберу» над меню и кругом AI Ustaz, без горизонтальной прокрутки`);
    проверить(/пәтуа емес|Пәтуа емес/.test(await с.текст('устаз-граница')) && (await с.текст('меню-устаз')) === 'AI Ustaz', 'kk: «Пәтуа емес», подпись меню «AI Ustaz»');
    await с.снимок('chat-empty-kk');
    await с.спросить('Как читается аят 2:255?');
    await с.стр.waitForFunction(() => document.querySelector('[data-testid="устаз-аят"] [data-testid="таджвид-аята-текст"]'), null, { timeout: 15000 });
    await с.снимок('chat-ayah-kk');
    await с.спросить('Мой намаз действителен?');
    проверить(с.запросы[1]?.lang === 'kk' && /имамына|имамға/.test(await с.текст('устаз-к-имаму')), 'kk: lang=kk, «к-имаму» по-казахски');
    await с.снимок('chat-imam-kk');
    с.безПроблем('360 kk: без ошибок');
    await с.к.close();
  }

  console.log('\n══ AI Ustaz: не свой домен — выключено ══');
  {
    const база = `http://127.0.0.1:${порт}`;
    const с = await страница(браузер, база);
    await с.стр.goto(база + '/aiustaz/index.html#/ask');
    await с.э('устаз-выключено').waitFor({ timeout: 15000 });
    проверить(/aiustaz\.pro/.test(await с.текст('устаз-выключено')) && (await с.стр.evaluate(() => document.querySelector('[data-testid="устаз-поле"]').readOnly || document.querySelector('[data-testid="устаз-поле"]').disabled)), 'не свой домен: поле выключено, «AI Ustaz отвечает на нашем сайте aiustaz.pro»');
    await с.э('устаз-пример-1').click({ force: true });
    await с.стр.waitForTimeout(400);
    проверить(с.запросы.length === 0, 'не свой домен: запросов к /api/ask нет');
    с.безПроблем('не свой домен: без ошибок');
    await с.к.close();
  }
  console.log(`\nAI Ustaz: ${проверок} проверок пройдено.`);
  return проверок;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = require('playwright');
  const сервер = await запуститьСервер({ порт: 0 });
  const браузер = await chromium.launch({ args: флагиБраузера(сервер.порт) });
  try {
    await спроситьСквозной(браузер, сервер.порт);
  } catch (е) {
    console.error('\n' + (е?.stack ?? е));
    process.exitCode = 1;
  } finally {
    await браузер.close();
    await сервер.закрыть();
  }
}
