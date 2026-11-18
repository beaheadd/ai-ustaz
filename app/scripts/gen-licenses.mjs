#!/usr/bin/env node
/**
 * Генератор списка лицензий для экрана «Лицензии» и папки licenses/ (CLAUDE.md:
 * «каждую новую зависимость добавлять в экран „Лицензии“ и licenses/»).
 *
 * Как: делает пробный веб-экспорт с source maps во временную папку, берёт из карт
 * все файлы node_modules, реально попавшие в бандл, и для каждого пакета читает
 * package.json (имя, версия, лицензия) и файлы LICENSE…, LICENCE…, COPYING…, NOTICE….
 * Шрифт Amiri Quran идёт ассетом — его пакет добавляется по ассетам экспорта.
 *
 * Выход:
 *   app/src/legal/licenses.json            — для экрана (грузится отдельным чанком);
 *   <репозиторий>/licenses/app-web-bundle.txt — сводный текст для людей и аудита;
 *   app/src/content/licenses.generated.json — прямые зависимости из package.json
 *     (dependencies и devDependencies) с установленной версией и лицензией из
 *     node_modules/<пакет>/package.json. Без URL и текстов (короткий список для экрана).
 * Запуск: npm run licenses  (после изменения зависимостей; результат коммитить).
 *         node scripts/gen-licenses.mjs --direct — только прямые зависимости, без пробного экспорта.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const репозиторий = path.resolve(корень, '..');
const выходJSON = path.join(корень, 'src', 'legal', 'licenses.json');
const выходTXT = path.join(репозиторий, 'licenses', 'app-web-bundle.txt');
const выходПрямые = path.join(корень, 'src', 'content', 'licenses.generated.json');
const ИМЕНА_ЛИЦЕНЗИЙ = /^(licen[sc]e|copying|notice)([._-].*)?$/i;
const КОПИЛЕФТ = /GPL|AGPL|LGPL|SSPL|CC-BY-NC|NPL/i;
/**
 * Запасные тексты лицензий для пакетов, у которых в npm нет файла LICENSE (MIT требует приложить
 * copyright и текст разрешения к коду). Файлы — в licenses/upstream/, источник с тегом — в их шапке
 * (строки «# …»; в бандл идёт только текст лицензии). Пакет → файл.
 */
const ЗАПАСНЫЕ_ТЕКСТЫ = {
  '@react-native/js-polyfills': 'react-native-LICENSE.txt',
  '@react-native/normalize-colors': 'react-native-LICENSE.txt',
  'metro-runtime': 'metro-LICENSE.txt',
};

// 0. Прямые зависимости (быстро, без экспорта).
{
  const манифест = JSON.parse(fs.readFileSync(path.join(корень, 'package.json'), 'utf8'));
  const прямые = [];
  for (const [поле, вид] of [
    ['dependencies', 'приложение'],
    ['devDependencies', 'сборка'],
  ]) {
    for (const [имя, диапазон] of Object.entries(манифест[поле] ?? {})) {
      const файл = path.join(корень, 'node_modules', ...имя.split('/'), 'package.json');
      if (!fs.existsSync(файл)) {
        console.error(`Нет node_modules/${имя}: выполните npm install`);
        process.exitCode = 1;
        continue;
      }
      const pkg = JSON.parse(fs.readFileSync(файл, 'utf8'));
      const лицензия = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'не указана';
      прямые.push({ пакет: имя, версия: pkg.version, диапазон: String(диапазон), лицензия, вид });
    }
  }
  прямые.sort((а, б) => (а.вид === б.вид ? а.пакет.localeCompare(б.пакет) : а.вид === 'приложение' ? -1 : 1));
  fs.mkdirSync(path.dirname(выходПрямые), { recursive: true });
  fs.writeFileSync(выходПрямые, JSON.stringify(прямые, null, 1) + '\n');
  console.log(`Прямых зависимостей: ${прямые.length}. JSON: ${path.relative(репозиторий, выходПрямые)}`);
  const плохие = прямые.filter((з) => КОПИЛЕФТ.test(з.лицензия));
  if (плохие.length) {
    console.error('ВНИМАНИЕ: прямые зависимости с лицензиями, требующими решения владельца:', плохие.map((з) => `${з.пакет} (${з.лицензия})`).join(', '));
    process.exitCode = 1;
  }
  if (process.argv.includes('--direct')) process.exit(process.exitCode ?? 0);
}

const врем = fs.mkdtempSync(path.join(os.tmpdir(), 'aiustaz-licenses-'));
try {
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--source-maps', '--output-dir', врем], {
    cwd: корень,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_OFFLINE: '1', CI: '1' },
  });

  // 1. Исходники из source maps → каталоги пакетов.
  const пакеты = new Map(); // каталог пакета → true
  const папкаJS = path.join(врем, '_expo', 'static', 'js', 'web');
  for (const файл of fs.readdirSync(папкаJS).filter((ф) => ф.endsWith('.map'))) {
    const карта = JSON.parse(fs.readFileSync(path.join(папкаJS, файл), 'utf8'));
    // Metro пишет индексную карту (sections); пути — от корня проекта, с ведущим «/».
    const источники = [...(карта.sources ?? []), ...(карта.sections ?? []).flatMap((с) => с.map?.sources ?? [])];
    for (const источник of источники) {
      const абсолютный = fs.existsSync(источник) ? источник : path.join(корень, источник);
      const каталог = каталогПакета(path.normalize(абсолютный));
      if (каталог) пакеты.set(каталог, true);
    }
  }
  // 2. Ассеты (шрифт) — по их исходным путям в node_modules.
  for (const ф of ['@expo-google-fonts/amiri-quran']) {
    const каталог = path.join(корень, 'node_modules', ф);
    if (fs.existsSync(каталог)) пакеты.set(каталог, true);
  }

  const записи = new Map();
  for (const каталог of пакеты.keys()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(каталог, 'package.json'), 'utf8'));
    const ключ = `${pkg.name}@${pkg.version}`;
    if (записи.has(ключ)) continue;
    const тексты = fs
      .readdirSync(каталог)
      .filter((ф) => ИМЕНА_ЛИЦЕНЗИЙ.test(ф) && fs.statSync(path.join(каталог, ф)).isFile())
      .sort()
      .map((ф) => ({ файл: ф, текст: fs.readFileSync(path.join(каталог, ф), 'utf8').trim() }));
    if (тексты.length === 0 && ЗАПАСНЫЕ_ТЕКСТЫ[pkg.name]) {
      const файл = path.join(репозиторий, 'licenses', 'upstream', ЗАПАСНЫЕ_ТЕКСТЫ[pkg.name]);
      const строки = fs.readFileSync(файл, 'utf8').split('\n');
      const источник = (строки[0] ?? '').replace(/^#\s*Источник:\s*/, '').split(' ')[0];
      тексты.push({
        файл: `licenses/upstream/${ЗАПАСНЫЕ_ТЕКСТЫ[pkg.name]} (${источник}; в npm-пакете файла нет)`,
        текст: строки.filter((с) => !с.startsWith('#')).join('\n').trim(),
      });
    }
    const лицензия = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'не указана';
    записи.set(ключ, { пакет: pkg.name, версия: pkg.version, лицензия, тексты });
  }

  const список = [...записи.values()].sort((а, б) => а.пакет.localeCompare(б.пакет));
  const безТекста = список.filter((з) => з.тексты.length === 0).map((з) => `${з.пакет}@${з.версия}`);

  fs.mkdirSync(path.dirname(выходJSON), { recursive: true });
  fs.writeFileSync(выходJSON, JSON.stringify(список, null, 1) + '\n');

  fs.mkdirSync(path.dirname(выходTXT), { recursive: true });
  const шапка = [
    'AI Ustaz — веб-приложение (app/): сторонние пакеты, попавшие в бандл, и их лицензии.',
    'Файл создан scripts/gen-licenses.mjs (не править руками; перегенерировать после смены зависимостей).',
    '',
  ];
  const тело = список.map((з) =>
    [
      '='.repeat(78),
      `${з.пакет}@${з.версия} — ${з.лицензия}`,
      '='.repeat(78),
      ...(з.тексты.length ? з.тексты.map((т) => `--- ${т.файл} ---\n${т.текст}\n`) : ['(файла лицензии в пакете нет — см. поле license в package.json)\n']),
    ].join('\n'),
  );
  fs.writeFileSync(выходTXT, [...шапка, ...тело].join('\n') + '\n');

  console.log(`Пакетов в бандле: ${список.length}. JSON: ${path.relative(репозиторий, выходJSON)}; TXT: ${path.relative(репозиторий, выходTXT)}`);
  for (const з of список) console.log(`  ${з.пакет}@${з.версия}  ${з.лицензия}`);
  if (безТекста.length) {
    console.error(`НЕТ ТЕКСТА ЛИЦЕНЗИИ (добавьте в licenses/upstream/ и ЗАПАСНЫЕ_ТЕКСТЫ): ${безТекста.join(', ')}`);
    process.exitCode = 1;
  }
  const копилефт = список.filter((з) => КОПИЛЕФТ.test(з.лицензия));
  if (копилефт.length) {
    console.error('ВНИМАНИЕ: лицензии, требующие решения владельца:', копилефт.map((з) => `${з.пакет} (${з.лицензия})`).join(', '));
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(врем, { recursive: true, force: true });
}

/** Каталог пакета по пути файла внутри node_modules (учитывает @scope и вложенные node_modules). */
function каталогПакета(файл) {
  const части = файл.split(path.sep);
  const i = части.lastIndexOf('node_modules');
  if (i < 0 || i + 1 >= части.length) return null;
  const длина = части[i + 1].startsWith('@') ? 2 : 1;
  const каталог = части.slice(0, i + 1 + длина).join(path.sep);
  return fs.existsSync(path.join(каталог, 'package.json')) ? каталог : null;
}
