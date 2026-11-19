/**
 * Конфигурация Metro для AI Ustaz.
 *
 * - Папка данных уроков /content (корень репозитория, вне app/) подключена через
 *   watchFolders; импорт в коде — по алиасу `@content/...` (tsconfig paths,
 *   Expo включает их в Metro по умолчанию), например:
 *     import версия from '@content/version.json';
 * - Плоские пути ассетов при веб-экспорте — scripts/metro-asset-paths.js
 *   (причина: .gitignore batr-world отбрасывает каталоги node_modules/, dist/ …).
 * - Минификатор пишет не-ASCII как есть (UTF-8), а не \uXXXX: кириллица и арабский в уроках
 *   иначе раздуваются в 3 раза (бюджет check-dist). Скрипты и чанки декодируются по кодировке
 *   страницы — <meta charset="utf-8"> в public/index.html; nginx batr не добавляет charset к .js.
 *   Целостность аятов в рантайме дополнительно сверяется по sha256 (engine/lessonEngine.ts).
 * - Terser: compress.passes 2 и ecma 2020 — минус ~20 КБ JS (бюджет check-dist 1200 КБ на все чанки).
 *   ES2020 не сужает круг браузеров: бандл после Babel уже содержит ?. и ?? (19.11.2026).
 */
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const корень = __dirname;
const папкаКонтента = path.resolve(корень, '..', 'content');

const конфиг = getDefaultConfig(корень);

конфиг.watchFolders = [...(конфиг.watchFolders || []), папкаКонтента];
конфиг.transformer.assetPlugins = [
  ...(конфиг.transformer.assetPlugins || []),
  path.resolve(корень, 'scripts', 'metro-asset-paths.js'),
];

конфиг.transformer.minifierConfig = {
  ...(конфиг.transformer.minifierConfig || {}),
  output: { ...((конфиг.transformer.minifierConfig || {}).output || {}), ascii_only: false },
  // Сжатие в два прохода и синтаксис ES2020 (бандл и так содержит ?. и ??): JS сборки −20 КБ (19.11.2026).
  compress: { ...((конфиг.transformer.minifierConfig || {}).compress || {}), passes: 2, ecma: 2020 },
  ecma: 2020,
};

module.exports = конфиг;
