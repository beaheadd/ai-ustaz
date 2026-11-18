/**
 * Плагин ассетов Metro: плоские пути файлов в веб-экспорте.
 *
 * Назначение. По умолчанию `expo export` кладёт ассеты по пути исходника:
 *   dist/assets/node_modules/@expo-google-fonts/.../AmiriQuran_400Regular.<md5>.ttf
 * Сборка копируется в batr-world/web/public/aiustaz/, а .gitignore batr-world
 * отбрасывает любые каталоги node_modules/, dist/, data/, logs/ … — файл потерялся бы.
 * Поэтому при экспорте все ассеты кладутся плоско: /aiustaz/assets/<имя>.<md5>.<расш>.
 * Коллизий нет: в имени всегда md5 содержимого (Expo добавляет его для веба).
 *
 * Контракт (Metro `transformer.assetPlugins`): функция (данныеАссета) => данныеАссета.
 * Меняет только `httpServerLocation` и только при экспорте (`?export_path=`);
 * дев-сервер (`?unstable_path=`) не трогает. Один и тот же путь получают и бандл,
 * и запись файла (Expo CLI persistMetroAssets) — ссылки согласованы.
 * Файл на CommonJS: Metro загружает плагины через require().
 */
'use strict';

module.exports = function плоскиеПутиАссетов(ассет) {
  const путь = ассет.httpServerLocation;
  if (typeof путь === 'string' && путь.includes('?export_path=')) {
    // '/assets?export_path=/aiustaz/assets/node_modules/a/b' → '/assets?export_path=/aiustaz/assets'
    ассет.httpServerLocation = путь.replace(/(\?export_path=.*?\/assets)(\/.*)?$/, '$1');
  }
  return ассет;
};
