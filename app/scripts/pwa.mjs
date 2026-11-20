/**
 * Манифест веб-приложения AI Ustaz (PWA) и правила для значков — общий модуль для after-export.mjs, check-dist.mjs
 * и тестов (test-install.mjs, e2e-install.mjs).
 *
 * Контракт:
 *   ПАПКА_PWA = 'pwa' — единственная папка сборки, где разрешены растровые файлы (PNG-значки; check-dist);
 *   ЗНАЧКИ_PWA — какие значки должны быть: { вид, размер, purpose, образец имени <вид>.<md5>.png };
 *   найтиЗначки(файлы) → { [вид]: имя файла } (из списка имён в dist/pwa или app/public/pwa; бросает, если чего-то нет);
 *   построитьМанифест(значки, база='/aiustaz/') → объект манифеста (scope /aiustaz/, start_url ?source=pwa, id,
 *     display standalone, ru, цвета токенов: фон «слоновая кость» #F7F2E8, тема — изумруд #0F4C45);
 *   ЦВЕТ_ТЕМЫ_СВЕТЛАЯ / ЦВЕТ_ТЕМЫ_ТЁМНАЯ — <meta name="theme-color"> (фон экрана, app/src/theme/tokens.ts).
 * Манифест — JSON с md5 содержимого в имени (pwa/manifest.<md5>.json): SW batr.kz кэширует по URL навсегда;
 * .json, а не .webmanifest — у любого nginx верный тип application/json. Для установки service worker не нужен: Chrome
 * ставит приложение и без него. С 20.11.2026 есть push-sw.js — только для уведомлений о времени намаза и только на
 * aiustaz.pro (на batr.kz его не регистрируем: там свой SW со scope «/»; app/src/notify/push.ts).
 * Решение владельца 19.11.2026: TWA и установка на экран «Домой» (aiustaz.pro).
 */

export const ПАПКА_PWA = 'pwa';
export const ЦВЕТ_ФОНА = '#F7F2E8';
export const ЦВЕТ_БРЕНДА = '#0F4C45';
export const ЦВЕТ_ТЕМЫ_СВЕТЛАЯ = '#F7F2E8';
export const ЦВЕТ_ТЕМЫ_ТЁМНАЯ = '#0C1715';
/** Предел размера одного PNG-значка и всех вместе (check-dist), байт. */
export const ПРЕДЕЛ_ЗНАЧКА = 128 * 1024;
export const ПРЕДЕЛ_ЗНАЧКОВ = 320 * 1024;

export const ЗНАЧКИ_PWA = [
  { вид: 'icon-192', размер: 192, purpose: 'any' },
  { вид: 'icon-512', размер: 512, purpose: 'any' },
  { вид: 'icon-maskable-512', размер: 512, purpose: 'maskable' },
  { вид: 'icon-mono-512', размер: 512, purpose: 'monochrome' },
  { вид: 'apple-touch-icon-180', размер: 180, purpose: null },
];

export const ИМЯ_ЗНАЧКА = /^(icon-192|icon-512|icon-maskable-512|icon-mono-512|apple-touch-icon-180)\.([0-9a-f]{32})\.png$/;
export const ИМЯ_МАНИФЕСТА = /^manifest\.([0-9a-f]{32})\.json$/;

export function найтиЗначки(файлы) {
  const найдено = {};
  for (const ф of файлы) {
    const м = ф.match(ИМЯ_ЗНАЧКА);
    if (!м) continue;
    if (найдено[м[1]]) throw new Error(`два значка ${м[1]}: ${найдено[м[1]]} и ${ф} — перерисуйте: node tools/icons/make-icons.mjs`);
    найдено[м[1]] = ф;
  }
  const нет = ЗНАЧКИ_PWA.filter((з) => !найдено[з.вид]).map((з) => з.вид);
  if (нет.length) throw new Error(`нет значков PWA: ${нет.join(', ')} (нарисовать: node tools/icons/make-icons.mjs)`);
  return найдено;
}

export function построитьМанифест(значки, база = '/aiustaz/') {
  const адрес = (вид) => `${база}${ПАПКА_PWA}/${значки[вид]}`;
  return {
    id: база,
    name: 'AI Ustaz',
    short_name: 'AI Ustaz',
    description: 'Бесплатный тренер правильного чтения Корана по методике «Муаллим сани». Без рекламы. Прототип.',
    lang: 'ru',
    dir: 'ltr',
    start_url: `${база}?source=pwa`,
    scope: база,
    display: 'standalone',
    orientation: 'portrait',
    background_color: ЦВЕТ_ФОНА,
    theme_color: ЦВЕТ_БРЕНДА,
    categories: ['education', 'books'],
    icons: ЗНАЧКИ_PWA.filter((з) => з.purpose).map((з) => ({ src: адрес(з.вид), sizes: `${з.размер}x${з.размер}`, type: 'image/png', purpose: з.purpose })),
  };
}
