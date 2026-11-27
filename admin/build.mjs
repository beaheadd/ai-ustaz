#!/usr/bin/env node
/**
 * Сборка админки AI Ustaz (admin/ → server/admin_static/) без новых зависимостей: TypeScript и terser — те, что уже
 * стоят в app/node_modules. Каждый .ts, достижимый из admin/src/main.ts (вместе с общими модулями приложения:
 * quran/loader.ts, tajweed.ts, mushaf.ts, hadith/loader.ts, манифесты), — отдельный ES-модуль js/<путь>.js.
 * Владелец 27.11.2026: «Создай админ панель…». docs/дизайн/12-админка-и-статистика.md.
 *
 * Что кладёт в server/admin_static/ (вне git; копия уходит в batr-world aiustaz/server/admin_static/ и на сервер в
 * /opt/mugalim/server/admin_static/, nginx отдаёт её на https://aiustaz.pro/admin/):
 *   index.html, styles.css, tajweed.css (цвета из app/src/quran/tajweed.ts — светлые и ночные), js/…,
 *   files/audio-sources.json (content/audio-sources.json), files/pending-hadith.json (content/hadith/на-проверку-устаза.json),
 *   version.json {commit, built}.
 * Шрифт Корана — тот же файл, что в сборке приложения (/aiustaz/assets/AmiriQuran_400Regular.<md5>.ttf).
 * Запуск (из корня mugalim): node admin/build.mjs [папка-выхода]
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(корень, 'app', 'package.json'));
const ts = require('typescript');
const { minify } = require('terser');
const выход = path.resolve(process.argv[2] ?? path.join(корень, 'server', 'admin_static'));

fs.rmSync(выход, { recursive: true, force: true });
fs.mkdirSync(path.join(выход, 'js'), { recursive: true });
fs.mkdirSync(path.join(выход, 'files'), { recursive: true });

// 1. Модули: обход импортов от main.ts, транспиляция, .ts → .js, минификация.
const очередь = [path.join(корень, 'admin', 'src', 'main.ts')];
const сделано = new Set();
let байт = 0;
while (очередь.length) {
  const файл = очередь.pop();
  if (сделано.has(файл)) continue;
  сделано.add(файл);
  const исходник = fs.readFileSync(файл, 'utf8');
  for (const м of исходник.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/g)) {
    if (!м[1].startsWith('.')) throw new Error(`${файл}: внешний импорт ${м[1]} — в админке не нужен`);
    очередь.push(path.resolve(path.dirname(файл), м[1]));
  }
  const { outputText, diagnostics } = ts.transpileModule(исходник, {
    fileName: файл,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, rewriteRelativeImportExtensions: true, verbatimModuleSyntax: false },
  });
  if (diagnostics?.length) throw new Error(`${файл}: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')}`);
  const код = (await minify(outputText, { module: true, compress: true, mangle: true, format: { comments: false } })).code;
  const куда = path.join(выход, 'js', path.relative(корень, файл).replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(куда), { recursive: true });
  fs.writeFileSync(куда, код);
  байт += Buffer.byteLength(код);
}

// 2. Цвета таджвида — из того же модуля, что в приложении (без импортов: грузим в node).
const tajweed = ts.transpileModule(fs.readFileSync(path.join(корень, 'app', 'src', 'quran', 'tajweed.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const врем = path.join(выход, '.tajweed.mjs');
fs.writeFileSync(врем, tajweed);
const т = await import(pathToFileURL(врем).href);
fs.rmSync(врем);
const правило = (тема) => т.КОДЫ_ТАДЖВИДА.map((к) => `.аяты[data-таджвид="true"] .т-${к}, .т-${к}.образец { color: ${т.ЦВЕТА_ТАДЖВИДА[тема][к]}; }`).join('\n');
fs.writeFileSync(path.join(выход, 'tajweed.css'),
  `/* Цвета таджвида — app/src/quran/tajweed.ts ЦВЕТА_ТАДЖВИДА (СГЕНЕРИРОВАНО admin/build.mjs) */\n${правило('страница')}\n` +
  `@media (prefers-color-scheme: dark) {\n${правило('ночь')}\n}\n`);

// 3. Шрифт Корана — путь файла в сборке приложения (Expo: md5 содержимого в имени).
const шрифт = path.join(корень, 'app', 'node_modules', '@expo-google-fonts', 'amiri-quran', '400Regular', 'AmiriQuran_400Regular.ttf');
const md5 = crypto.createHash('md5').update(fs.readFileSync(шрифт)).digest('hex');
const стили = fs.readFileSync(path.join(корень, 'admin', 'styles.css'), 'utf8')
  .replace('/aiustaz/assets/AmiriQuran_400Regular.ttf', `/aiustaz/assets/AmiriQuran_400Regular.${md5}.ttf`);
fs.writeFileSync(path.join(выход, 'styles.css'), стили);

// 4. Страница, данные, версия.
let коммит = 'local';
try {
  коммит = execFileSync('git', ['-C', корень, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // не git — «local»
}
fs.writeFileSync(path.join(выход, 'index.html'), fs.readFileSync(path.join(корень, 'admin', 'index.html'), 'utf8').replaceAll('{{версия}}', коммит));
fs.copyFileSync(path.join(корень, 'content', 'audio-sources.json'), path.join(выход, 'files', 'audio-sources.json'));
fs.copyFileSync(path.join(корень, 'content', 'hadith', 'на-проверку-устаза.json'), path.join(выход, 'files', 'pending-hadith.json'));
fs.writeFileSync(path.join(выход, 'version.json'), JSON.stringify({ commit: коммит, built: new Date().toISOString().slice(0, 10) }) + '\n');
console.log(`Админка: ${сделано.size} модулей, JS ${(байт / 1024).toFixed(1)} КБ → ${path.relative(корень, выход) || выход}`);
