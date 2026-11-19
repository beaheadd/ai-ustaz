#!/usr/bin/env node
/**
 * Значки приложения AI Ustaz (PWA, экран «Домой» iPhone, Android TWA) — PNG из эмблемы «фонарь-шырақ».
 *
 * Назначение: нарисовать значки из той же геометрии, что эмблема в приложении (app/src/design/emblem.ts, вариант
 * «значок» — силуэт и звезда-свет; docs/дизайн/03-дизайн-система.md §8), без лиц и без надписей, и положить их в
 * app/public/pwa/ с md5 содержимого в имени (сервис-воркер batr.kz кэширует файлы по URL навсегда — check-dist
 * требует хэш в имени). Манифест из них собирает app/scripts/after-export.mjs.
 *
 * Контракт:
 *   node tools/icons/make-icons.mjs [папка=app/public/pwa]
 *     → icon-192.<md5>.png, icon-512.<md5>.png      — purpose any: изумрудная плитка со скруглёнными углами;
 *       icon-maskable-512.<md5>.png                   — purpose maskable: плитка во весь квадрат, фонарь в безопасной зоне (круг 80 %);
 *       icon-mono-512.<md5>.png                       — purpose monochrome: белый силуэт на прозрачном, окно-звезда вырезано;
 *       apple-touch-icon-180.<md5>.png                — iPhone: непрозрачный квадрат (углы iOS скругляет сама).
 *     Старые PNG этой папки удаляются; печатает имена. Повторный запуск на той же машине даёт те же байты.
 *   import { svgЗначка, ЦВЕТА } from './make-icons.mjs' — SVG-строка значка (для графики Google Play, twa/play/).
 * Цвета — app/src/theme/tokens.ts: изумруд «акцент» #0F4C45 (плитка), слоновая кость «фон» #F7F2E8 (фонарь),
 * «свет» #E3A73F (окно-звезда), «сияние» #F4C35E (мягкий свет).
 * Playwright — require('playwright'), chromium.launch() (предустановлен; `playwright install` не нужен).
 * После перерисовки значков поменяются имена — обновите twa/twa-manifest.json (тест npm run test:install сверит).
 * Решение владельца 19.11.2026: «TWA приложение для загрузки из сайта и объяснение в APPLE, чтобы добавить на рабочий стол».
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const здесь = path.dirname(fileURLToPath(import.meta.url));
const корень = path.resolve(здесь, '..', '..');

export const ЦВЕТА = { плитка: '#0F4C45', фонарь: '#F7F2E8', свет: '#E3A73F', сияние: '#F4C35E' };

const { ЭМБЛЕМА, ГРАДИЕНТЫ } = await import(pathToFileURL(path.join(корень, 'app/src/design/emblem.ts')).href);

/** Фигуры эмблемы «значок» → SVG (сетка 120). маска — для монохромного: всё белое, окно вырезано. */
function фонарь({ монохром = false, ид = 'з' } = {}) {
  const роль = (р) => (монохром ? '#FFFFFF' : { основа: ЦВЕТА.фонарь, свет: ЦВЕТА.свет, сияние: ЦВЕТА.сияние, тон: ЦВЕТА.плитка, бумага: ЦВЕТА.фонарь, тихо: ЦВЕТА.фонарь }[р]);
  const фигура = (ф) => {
    const заливка = !ф.заливка ? 'none' : ф.заливка === 'url:сияние' ? `url(#${ид}-сияние)` : роль(ф.заливка);
    const обводка = ф.обводка ? ` stroke="${роль(ф.обводка)}" stroke-width="${ф.толщина}" stroke-linecap="round" stroke-linejoin="round"` : '';
    const пр = ф.прозрачность != null ? ` opacity="${ф.прозрачность}"` : '';
    if (ф.вид === 'круг') return `<circle cx="${ф.cx}" cy="${ф.cy}" r="${ф.r}" fill="${заливка}"${обводка}${пр}/>`;
    if (ф.вид === 'прямоугольник') return `<rect x="${ф.x}" y="${ф.y}" width="${ф.ширина}" height="${ф.высота}" rx="${ф.rx ?? 0}" fill="${заливка}"${обводка}${пр}/>`;
    return `<path d="${ф.d}" fill="${заливка}"${обводка}${пр}/>`;
  };
  const фигуры = ЭМБЛЕМА.значок;
  const тело = фигуры.filter((ф) => ф.слой === 'тело').map(фигура).join('');
  const звезда = фигуры.find((ф) => ф.слой === 'свет');
  if (монохром) {
    return `<defs><mask id="${ид}-окно" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><rect width="120" height="120" fill="#fff"/><path d="${звезда.d}" fill="#000"/></mask></defs><g mask="url(#${ид}-окно)">${тело}</g>`;
  }
  const г = ГРАДИЕНТЫ.значок.сияние;
  const остановки = г.остановки.map(([с, , н]) => `<stop offset="${с}" stop-color="${ЦВЕТА.сияние}" stop-opacity="${н * 0.75}"/>`).join('');
  const сияние = фигуры.filter((ф) => ф.слой === 'сияние').map(фигура).join('');
  return `<defs><radialGradient id="${ид}-сияние" gradientUnits="userSpaceOnUse" cx="${г.cx}" cy="${г.cy}" r="${г.r}">${остановки}</radialGradient></defs>${сияние}${тело}${фигура(звезда)}`;
}

/**
 * SVG значка размера размер×размер.
 * вид: 'any' (плитка со скруглением 22 %, прозрачные углы) | 'maskable' (во весь квадрат) | 'apple' (во весь квадрат) |
 *      'mono' (прозрачный фон, белый силуэт) | 'прозрачный' (цветной фонарь без плитки — баннер Play); доля — высота фонаря от стороны.
 */
export function svgЗначка(размер, вид = 'any', доля) {
  const д = доля ?? (вид === 'maskable' ? 0.58 : вид === 'mono' ? 0.62 : 0.7);
  const масштаб = (размер * д) / 120;
  const сдвиг = (размер - 120 * масштаб) / 2;
  const фон =
    вид === 'mono' || вид === 'прозрачный'
      ? ''
      : вид === 'any'
        ? `<rect width="${размер}" height="${размер}" rx="${размер * 0.22}" fill="${ЦВЕТА.плитка}"/>`
        : `<rect width="${размер}" height="${размер}" fill="${ЦВЕТА.плитка}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${размер}" height="${размер}" viewBox="0 0 ${размер} ${размер}">${фон}<g transform="translate(${сдвиг} ${сдвиг}) scale(${масштаб})">${фонарь({ монохром: вид === 'mono' })}</g></svg>`;
}

export const ЗНАЧКИ = [
  { имя: 'icon-192', размер: 192, вид: 'any' },
  { имя: 'icon-512', размер: 512, вид: 'any' },
  { имя: 'icon-maskable-512', размер: 512, вид: 'maskable' },
  { имя: 'icon-mono-512', размер: 512, вид: 'mono' },
  { имя: 'apple-touch-icon-180', размер: 180, вид: 'apple' },
];

/** Отрисовать SVG в PNG (Playwright, Chromium); прозрачный фон сохраняется. */
export async function вPNG(браузер, svg, ширина, высота = ширина) {
  const стр = await браузер.newPage({ viewport: { width: ширина, height: высота }, deviceScaleFactor: 1 });
  await стр.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await стр.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: ширина, height: высота } });
  await стр.close();
  return png;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const папка = path.resolve(process.argv[2] ?? path.join(корень, 'app/public/pwa'));
  fs.mkdirSync(папка, { recursive: true });
  for (const и of fs.readdirSync(папка)) if (/\.png$/i.test(и)) fs.unlinkSync(path.join(папка, и));
  const { chromium } = createRequire(import.meta.url)('playwright');
  const браузер = await chromium.launch();
  try {
    for (const з of ЗНАЧКИ) {
      const png = await вPNG(браузер, svgЗначка(з.размер, з.вид), з.размер);
      const md5 = crypto.createHash('md5').update(png).digest('hex');
      const имя = `${з.имя}.${md5}.png`;
      fs.writeFileSync(path.join(папка, имя), png);
      console.log(`${имя}  ${(png.length / 1024).toFixed(1)} КБ`);
    }
  } finally {
    await браузер.close();
  }
}
