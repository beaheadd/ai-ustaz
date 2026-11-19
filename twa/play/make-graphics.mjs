#!/usr/bin/env node
/**
 * Графика для Google Play Console (AI Ustaz, pro.aiustaz.app) — PNG, рисует Playwright (Chromium).
 *
 * Назначение: значок 512×512 (32-бит с альфа-каналом), баннер (feature graphic) 1024×500 (ru, kk, en) и снимки
 * экрана телефона 1080×1920 из НАСТОЯЩЕЙ собранной веб-версии (app/dist; окно 360×640, масштаб 3): ru — главная с
 * временем намаза, урок, запись голоса (урок 0, кнопка «Проверить» на aiustaz.pro), «Таджвид», «Ещё» с ИИ-предупреждением;
 * kk — главная и «Таджвид». Страницы отдаются как https://aiustaz.pro (page.route из папки сборки — без сети),
 * время зафиксировано (19.11.2026 13:20 по Алматы), микрофон — поддельный (флаги Chromium).
 * Без лиц, без текста Корана на баннере и значке (эмблема-фонарь, tools/icons/make-icons.mjs). Растры в git НЕ кладём.
 *
 * Запуск (из корня репозитория, после `npm run build:web` в app/):
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON twa/play/make-graphics.mjs [папка-вывода]
 *   (по умолчанию — ./play-graphics/, вне app/; DIST=папка — другая сборка)
 * Список файлов — twa/play/graphics.md.
 * Решение владельца 19.11.2026: «Сразу нужно подготовить файлы, чтобы загрузить на Play Market».
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ЦВЕТА, svgЗначка } from '../../tools/icons/make-icons.mjs';

const здесь = path.dirname(fileURLToPath(import.meta.url));
const корень = path.resolve(здесь, '..', '..');
const вывод = path.resolve(process.argv[2] ?? path.join(корень, 'play-graphics'));
const папкаСборки = path.resolve(process.env.DIST ?? path.join(корень, 'app', 'dist'));
const { chromium } = createRequire(import.meta.url)('playwright');

const САЙТ = 'https://aiustaz.pro';
const КЛЮЧ = 'aiustaz:progress.v1';
const ТИПЫ = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ВРЕМЯ = new Date('2026-11-19T13:20:00+05:00');
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const шрифт = (вес) => pathToFileURL(path.join(корень, 'app', 'src', 'assets', 'fonts', `inter-${вес}.woff2`)).href;

if (!fs.existsSync(path.join(папкаСборки, 'index.html'))) throw new Error(`нет ${папкаСборки}/index.html — сначала npm run build:web в app/`);
fs.mkdirSync(вывод, { recursive: true });

/** PNG через <canvas>.toDataURL: Chrome всегда кодирует RGBA (32 бита) — так требует Play для значка. */
async function svgВPNG32(браузер, svg, ш, в) {
  const стр = await браузер.newPage({ viewport: { width: ш, height: в }, deviceScaleFactor: 1 });
  await стр.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  const данные = await стр.evaluate(
    async ({ svg, ш, в }) => {
      const картинка = new Image();
      картинка.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await картинка.decode();
      const холст = document.createElement('canvas');
      холст.width = ш;
      холст.height = в;
      холст.getContext('2d').drawImage(картинка, 0, 0, ш, в);
      return холст.toDataURL('image/png').split(',')[1];
    },
    { svg, ш, в },
  );
  await стр.close();
  return Buffer.from(данные, 'base64');
}

const ТЕКСТЫ_БАННЕРА = {
  ru: { строка1: 'Учимся читать Коран правильно', строка2: 'По методике «Муаллим сани» · время намаза · кибла', строка3: 'Бесплатно · без рекламы' },
  kk: { строка1: 'Құранды дұрыс оқуды үйренеміз', строка2: '«Муаллим сани» әдістемесі · намаз уақыты · құбыла', строка3: 'Тегін · жарнамасыз' },
  en: { строка1: 'Learn to read the Quran correctly', строка2: '“Muallim Sani” method · prayer times · qibla', строка3: 'Free · no ads' },
};

/** Баннер 1024×500: изумруд, фонарь со светом слева, название и две строки справа (Inter). Без лиц и без арабского. */
function htmlБаннера(т) {
  const фонарь = svgЗначка(420, 'прозрачный', 0.86);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(${шрифт(400)})}
@font-face{font-family:Inter;font-weight:600;src:url(${шрифт(600)})}
html,body{margin:0;width:1024px;height:500px;overflow:hidden}
body{background:radial-gradient(circle at 250px 270px, rgba(244,195,94,.38) 0, rgba(244,195,94,.12) 150px, rgba(244,195,94,0) 260px), ${ЦВЕТА.плитка};font-family:Inter,sans-serif;color:${ЦВЕТА.фонарь};position:relative}
.фонарь{position:absolute;left:40px;top:40px;width:420px;height:420px}
.текст{position:absolute;left:470px;right:48px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:14px}
h1{margin:0;font-weight:600;font-size:72px;letter-spacing:-1px;line-height:1}
.с1{font-weight:600;font-size:32px;line-height:1.2}
.с2{font-size:22px;line-height:1.35;color:#A9C7C0}
.с3{display:inline-block;align-self:flex-start;margin-top:6px;padding:6px 14px;border-radius:999px;background:${ЦВЕТА.свет};color:#0B3B36;font-weight:600;font-size:20px}
.линия{position:absolute;left:470px;top:84px;width:120px;height:3px;background:${ЦВЕТА.свет};border-radius:2px}
</style></head><body>
<div class="фонарь">${фонарь}</div>
<div class="линия"></div>
<div class="текст"><h1>AI Ustaz</h1><div class="с1">${т.строка1}</div><div class="с2">${т.строка2}</div><div class="с3">${т.строка3}</div></div>
</body></html>`;
}

/** Снимки экрана: 360×640 × 3 = 1080×1920. */
async function снимки(браузер) {
  const готово = [];
  async function страница(язык) {
    const контекст = await браузер.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_ANDROID, locale: 'ru-RU', colorScheme: 'light' });
    await контекст.addInitScript(
      ({ ключ, язык }) => {
        try {
          if (!localStorage.getItem(ключ))
            localStorage.setItem(ключ, JSON.stringify({ версия: 1, язык, предупреждениеПоказано: true, пояснениеМикрофонаПоказано: true, согласиеПроверкиГолосом: false, уроки: { 0: { пройден: true, лучший: 1, попыток: 1 } }, дниЗанятий: [] }));
          // Строка «Поставить на телефон» на главной — для витрины Play лишняя (там приложение уже установлено).
          localStorage.setItem('aiustaz:install-hint.v1', JSON.stringify({ скрыта: true }));
        } catch {}
      },
      { ключ: КЛЮЧ, язык },
    );
    await контекст.route(САЙТ + '/**', async (маршрут) => {
      const п = decodeURIComponent(new URL(маршрут.request().url()).pathname);
      if (п.startsWith('/api/')) return маршрут.abort();
      const ф = п.startsWith('/aiustaz/') ? path.resolve(папкаСборки, '.' + п.slice('/aiustaz'.length)) : null;
      if (ф && ф.startsWith(папкаСборки + path.sep) && fs.existsSync(ф) && fs.statSync(ф).isFile())
        return маршрут.fulfill({ status: 200, contentType: ТИПЫ[path.extname(ф)] ?? 'application/octet-stream', body: fs.readFileSync(ф) });
      return маршрут.fulfill({ status: 404, body: '' });
    });
    const стр = await контекст.newPage();
    await стр.clock.setFixedTime(ВРЕМЯ);
    return { контекст, стр };
  }
  const э = (стр, id) => стр.getByTestId(id).first();
  const снять = async (стр, имя) => {
    await стр.waitForTimeout(500);
    const файл = path.join(вывод, имя);
    await стр.screenshot({ path: файл });
    готово.push(файл);
  };
  const открыть = async (стр, хэш, id) => {
    await стр.goto('about:blank'); // новая загрузка: смена одного #хэша не перезагружает страницу (урок спросил бы «Выйти?»)
    await стр.goto(`${САЙТ}/aiustaz/index.html?source=twa${хэш}`);
    await э(стр, id).waitFor({ timeout: 20000 });
  };

  for (const язык of ['ru', 'kk']) {
    const { контекст, стр } = await страница(язык);
    await открыть(стр, '#/', 'главная-начать');
    await снять(стр, `screenshot-${язык}-1-home.png`);
    await открыть(стр, '#/course', 'экран-карта');
    await снять(стр, `screenshot-${язык}-${язык === 'ru' ? 4 : 2}-tajweed.png`);
    if (язык === 'ru') {
      // Урок 1: задание «найди букву» (после теории и знакомства — шесть «Далее»).
      await открыть(стр, '#/lesson/1', 'урок-начать');
      await э(стр, 'урок-начать').click();
      for (let i = 0; i < 12 && !(await стр.getByTestId('вариант-0').count()); i++) {
        await э(стр, 'урок-далее').click();
        await стр.waitForTimeout(150);
      }
      await снять(стр, 'screenshot-ru-2-lesson.png');
      // «Ещё» с раскрытым ИИ-предупреждением (QML: всегда доступно в меню).
      await открыть(стр, '#/more', 'ещё-предупреждение');
      await э(стр, 'ещё-предупреждение').click();
      await э(стр, 'ещё-текст-предупреждения').waitFor({ timeout: 10000 });
      await э(стр, 'ещё-предупреждение').evaluate((у) => у.scrollIntoView({ block: 'start' }));
      await снять(стр, 'screenshot-ru-5-more-ai-notice.png');
    }
    await контекст.close();
  }
  // Запись голоса: урок 0 → «а — и — у» → «Записать» → «Стоп» → «Записали!» и «Проверить» (aiustaz.pro).
  {
    const { контекст, стр } = await страница('ru');
    await контекст.grantPermissions(['microphone'], { origin: САЙТ });
    await открыть(стр, '#/lesson0', 'экран-урок0');
    for (let i = 0; i < 14 && !(await стр.getByTestId('урок0-слоги').count()); i++) {
      if (await стр.getByTestId('урок0-шаг-маршрут').count()) await стр.locator('[data-testid^="урок0-маршрут-"]').first().click();
      for (let в = 0; в < 6 && (await э(стр, 'урок0-далее').getAttribute('aria-disabled')) === 'true' && (await стр.getByTestId('вариант-' + в).count()); в++) {
        await э(стр, 'вариант-' + в).click();
        await стр.waitForTimeout(150);
      }
      await э(стр, 'урок0-далее').click();
      await стр.waitForTimeout(150);
    }
    await э(стр, 'запись-начать').click();
    await э(стр, 'запись-идёт').waitFor({ timeout: 10000 });
    await стр.waitForTimeout(1500);
    await э(стр, 'запись-стоп').click();
    await э(стр, 'запись-готово').waitFor({ timeout: 10000 });
    // На aiustaz.pro под записью — «Проверить» (проверка голосом, только мягкие подсказки): в кадр вместе с «Записали!».
    const кнопка = (await стр.getByTestId('проверить-запись').count()) ? 'проверить-запись' : 'запись-готово';
    await э(стр, кнопка).evaluate((у) => у.scrollIntoView({ block: 'center' }));
    await снять(стр, 'screenshot-ru-3-voice.png');
    await контекст.close();
  }
  return готово;
}

const браузер = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  const значок = await svgВPNG32(браузер, svgЗначка(512, 'maskable', 0.66), 512, 512);
  fs.writeFileSync(path.join(вывод, 'icon-512.png'), значок);
  for (const [язык, т] of Object.entries(ТЕКСТЫ_БАННЕРА)) {
    const стр = await браузер.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await стр.setContent(htmlБаннера(т));
    await стр.evaluate(() => document.fonts.ready);
    await стр.waitForTimeout(200);
    await стр.screenshot({ path: path.join(вывод, `feature-graphic-1024x500-${язык}.png`) });
    await стр.close();
  }
  const файлы = await снимки(браузер);
  console.log(['icon-512.png', ...Object.keys(ТЕКСТЫ_БАННЕРА).map((я) => `feature-graphic-1024x500-${я}.png`), ...файлы.map((ф) => path.basename(ф))].map((и) => '  ' + path.join(вывод, и)).join('\n'));
} finally {
  await браузер.close();
}
