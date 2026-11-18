/**
 * Конфигурация Metro для AI Ustaz.
 *
 * - Папка данных уроков /content (корень репозитория, вне app/) подключена через
 *   watchFolders; импорт в коде — по алиасу `@content/...` (tsconfig paths,
 *   Expo включает их в Metro по умолчанию), например:
 *     import версия from '@content/version.json';
 * - Плоские пути ассетов при веб-экспорте — scripts/metro-asset-paths.js
 *   (причина: .gitignore batr-world отбрасывает каталоги node_modules/, dist/ …).
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

module.exports = конфиг;
