#!/usr/bin/env node
/**
 * Значки приложения AI Ustaz (PWA, экран «Домой» iPhone, Android TWA) — PNG: мечеть, полумесяц и звезда
 * (владелец 20.11.2026, вариант «А»; до этого — эмблема «фонарь-шырақ»).
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
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const здесь = path.dirname(fileURLToPath(import.meta.url));
const корень = path.resolve(здесь, '..', '..');

export const ЦВЕТА = { плитка: '#0F4C45', фонарь: '#F7F2E8', свет: '#E3A73F', сияние: '#F4C35E' };


// Владелец 20.11.2026: «Для нашего приложения придумай другой, нарисуй другой логотип… мечеть, звезда, луна… чтобы было
// понятно, что ассоциация с мусульманским миром» → выбран вариант «А» («А лучше делай её»): купол и два минарета,
// золотой полумесяц со звездой в ночном небе. Рисунок свой (не копия чужих значков); эмблема-фонарь в приложении остаётся.
// Сетка рисунка — 512 × 512.
const ЗОЛОТО = ['#F6D58A', '#D9A441'];
const КОСТЬ = ['#FFFDF7', '#E9DFC9'];

/** Мечеть, полумесяц и звезда (сетка 512). монохром — белый силуэт (двери и окна вырезаны), без неба и земли. */
function мечеть({ монохром = false, небо = true, ид = 'м' } = {}) {
  const з = монохром ? '#FFFFFF' : `url(#${ид}-з)`;
  const к = монохром ? '#FFFFFF' : `url(#${ид}-к)`;
  const звезда5 = 'M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.363,0.118 L0.588,0.809 L0,0.382 L-0.588,0.809 L-0.363,0.118 L-0.951,-0.309 L-0.2245,-0.309 Z';
  const проёмы = 'M230 422 V372 A26 26 0 0 1 282 372 V422 Z M170 400 V366 A12 12 0 0 1 194 366 V400 Z M318 400 V366 A12 12 0 0 1 342 366 V400 Z';
  const силуэт = `
    <path d="M180 80 A60 60 0 1 0 180 184 A48 48 0 1 1 180 80 Z" fill="${з}"/>
    <path d="${звезда5}" transform="translate(205 112) scale(17)" fill="${з}"/>
    <g fill="${к}">
      <rect x="96" y="222" width="26" height="200" rx="3"/><rect x="89" y="252" width="40" height="9" rx="3"/><path d="M93 224 L109 176 L125 224 Z"/>
      <rect x="390" y="222" width="26" height="200" rx="3"/><rect x="383" y="252" width="40" height="9" rx="3"/><path d="M387 224 L403 176 L419 224 Z"/>
      <path d="M160 304 C160 238 214 210 240 188 C250 179 254 170 256 156 C258 170 262 179 272 188 C298 210 352 238 352 304 Z"/>
      <rect x="168" y="300" width="176" height="20" rx="4"/>
      <rect x="132" y="318" width="248" height="104" rx="4"/>
    </g>
    <circle cx="109" cy="170" r="5" fill="${з}"/><circle cx="403" cy="170" r="5" fill="${з}"/>
    <line x1="256" y1="158" x2="256" y2="134" stroke="${з}" stroke-width="5" stroke-linecap="round"/><circle cx="256" cy="128" r="7" fill="${з}"/>`;
  if (монохром) {
    return `<defs><mask id="${ид}-пр" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/><path d="${проёмы}" fill="#000"/></mask></defs><g mask="url(#${ид}-пр)">${силуэт}</g>`;
  }
  const грд = (имя, [а, б]) => `<linearGradient id="${ид}-${имя}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${а}"/><stop offset="1" stop-color="${б}"/></linearGradient>`;
  const defs = `<defs>${грд('з', ЗОЛОТО)}${грд('к', КОСТЬ)}<linearGradient id="${ид}-н" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#136B5F"/><stop offset="1" stop-color="#0A3B35"/></linearGradient><radialGradient id="${ид}-с" cx=".5" cy=".38" r=".55"><stop offset="0" stop-color="#F4C35E" stop-opacity=".28"/><stop offset="1" stop-color="#F4C35E" stop-opacity="0"/></radialGradient></defs>`;
  const звёзды = [[70, 70, 3, .7], [420, 60, 2.5, .6], [460, 150, 3, .7], [60, 200, 2, .5], [340, 40, 2, .55], [470, 250, 2, .45]]
    .map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`).join('');
  const фон = небо ? `<rect width="512" height="512" fill="url(#${ид}-н)"/><rect width="512" height="512" fill="url(#${ид}-с)"/>${звёзды}` : '';
  const детали = `<path d="${проёмы}" fill="#0E5148"/><path d="M248 372 A8 8 0 0 1 264 372" stroke="url(#${ид}-з)" stroke-width="3" fill="none"/>`;
  const земля = небо ? `<path d="M0 418 C120 404 392 404 512 418 V512 H0 Z" fill="#0A3530"/><path d="M0 418 C120 404 392 404 512 418" stroke="url(#${ид}-з)" stroke-width="3" fill="none" opacity=".8"/>` : '';
  return `${defs}${фон}${силуэт}${детали}${земля}`;
}

/**
 * SVG значка размера размер×размер.
 * вид: 'any' (скругление 22 %, прозрачные углы) | 'maskable' (во весь квадрат, рисунок в безопасной зоне — круг 80 %) |
 *      'apple' (во весь квадрат) | 'mono' (прозрачный фон, белый силуэт) | 'прозрачный' (цветной рисунок без неба — баннер Play);
 * доля — масштаб рисунка (для 'прозрачный' и 'mono').
 */
export function svgЗначка(размер, вид = 'any', доля) {
  const м = размер / 512;
  if (вид === 'mono' || вид === 'прозрачный') {
    const д = доля ?? 0.82;
    const с = (512 * (1 - д)) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${размер}" height="${размер}" viewBox="0 0 ${размер} ${размер}"><g transform="scale(${м}) translate(${с} ${с}) scale(${д})">${мечеть({ монохром: вид === 'mono', небо: false })}</g></svg>`;
  }
  if (вид === 'maskable') {
    const д = 0.8;
    const с = (512 * (1 - д)) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${размер}" height="${размер}" viewBox="0 0 ${размер} ${размер}"><g transform="scale(${м})"><rect width="512" height="512" fill="#0F4C45"/><g transform="translate(${с} ${с}) scale(${д})">${мечеть({ ид: 'мм' })}</g></g></svg>`;
  }
  const клип = вид === 'any' ? `<defs><clipPath id="угл"><rect width="512" height="512" rx="${512 * 0.22}"/></clipPath></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${размер}" height="${размер}" viewBox="0 0 ${размер} ${размер}">${клип}<g transform="scale(${м})"${вид === 'any' ? ' clip-path="url(#угл)"' : ''}>${мечеть()}</g></svg>`;
}

export const ЗНАЧКИ = [
  { имя: 'icon-192', размер: 192, вид: 'any' },
  { имя: 'icon-512', размер: 512, вид: 'any' },
  { имя: 'icon-maskable-512', размер: 512, вид: 'maskable' },
  { имя: 'icon-mono-512', размер: 512, вид: 'mono' },
  { имя: 'apple-touch-icon-180', размер: 180, вид: 'apple' },
];

/**
 * Сжать PNG через pngquant (палитра 256 цветов с дизерингом; градиенты неба без полос): иначе 512 px — ~210 КБ при лимите
 * check-dist 128 КБ на значок. Нет pngquant (apt-get install pngquant) — ошибка: без сжатия check-dist не пропустит сборку.
 */
export function сжать(png) {
  const р = spawnSync('pngquant', ['--quality=80-98', '--speed', '1', '--strip', '-'], { input: png, maxBuffer: 1 << 26 });
  if (р.error || р.status !== 0) throw new Error('pngquant не сработал (apt-get install pngquant): ' + (р.error?.message ?? р.stderr?.toString()));
  return р.stdout;
}

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
      const png = сжать(await вPNG(браузер, svgЗначка(з.размер, з.вид), з.размер));
      const md5 = crypto.createHash('md5').update(png).digest('hex');
      const имя = `${з.имя}.${md5}.png`;
      fs.writeFileSync(path.join(папка, имя), png);
      console.log(`${имя}  ${(png.length / 1024).toFixed(1)} КБ`);
    }
  } finally {
    await браузер.close();
  }
}
