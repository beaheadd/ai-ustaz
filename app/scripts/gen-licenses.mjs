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
 *   <репозиторий>/licenses/app-web-bundle.txt — сводный текст для людей и аудита.
 * Запуск: npm run licenses  (после изменения зависимостей; результат коммитить).
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
const ИМЕНА_ЛИЦЕНЗИЙ = /^(licen[sc]e|copying|notice)([._-].*)?$/i;

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
  if (безТекста.length) console.log(`Без файла лицензии (только поле license): ${безТекста.join(', ')}`);
  const копилефт = список.filter((з) => /GPL|AGPL|LGPL|SSPL|CC-BY-NC|NPL/i.test(з.лицензия));
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
