/**
 * Тест пословных таймингов чтения (src/quran/wordTimings.ts; данные — tools/quran_words/build_words.py).
 * Владелец 27.11.2026: «выделение именно слов, которые читают».
 *   чистые функции — развернуть (формат файла → мс), словоПоВремени (паузы, края, бинарный поиск);
 *   загрузчик — sha256 сверяется, кэш, чужая сура / битый файл → null;
 *   данные — если есть app/public/quran-words: каждое издание манифеста, каждая сура, число слов каждого аята = числу
 *     слов нашей копии (src/quran/text.ts словаАята), начала не убывают.
 * Запуск: npm run test:words
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const т = await import('../src/quran/wordTimings.ts');
const { МАНИФЕСТ_СЛОВ } = await import('../src/quran/wordsManifest.generated.ts');
const текстМ = await import('../src/quran/text.ts');
const { МАНИФЕСТ_КОРАНА } = await import('../src/quran/manifest.generated.ts');

let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок++;
  console.log('  ✓ ' + имя);
}
const sha = async (с) => crypto.createHash('sha256').update(с, 'utf8').digest('hex');

await тест('развернуть: сантисекунды [начало, длит, пауза, длит] → мс', () => {
  assert.deepEqual(т.развернуть([10, 50, 5, 40, 0, 30]), [[100, 600], [650, 1050], [1050, 1350]]);
  assert.deepEqual(т.развернуть([]), []);
});

await тест('словоПоВремени: до первого -1, в паузе — предыдущее, после конца — последнее', () => {
  const с = т.развернуть([10, 50, 5, 40, 0, 30]);
  assert.equal(т.словоПоВремени(с, 0), -1);
  assert.equal(т.словоПоВремени(с, 99), -1);
  assert.equal(т.словоПоВремени(с, 100), 0);
  assert.equal(т.словоПоВремени(с, 620), 0, 'пауза 600–650 — предыдущее слово');
  assert.equal(т.словоПоВремени(с, 650), 1);
  assert.equal(т.словоПоВремени(с, 1100), 2);
  assert.equal(т.словоПоВремени(с, 99999), 2);
  assert.equal(т.словоПоВремени([], 5), -1);
  assert.equal(т.словоПоВремени(с, NaN), -1);
  const много = Array.from({ length: 200 }, (_, i) => [i * 100, i * 100 + 90]);
  for (const i of [0, 1, 57, 199]) assert.equal(т.словоПоВремени(много, i * 100 + 95), i);
});

await тест('загрузчик: sha256 сверяется, кэш, чужая сура и битый файл — null', async () => {
  const сура = JSON.stringify({ формат: 1, издание: 'x.test', сура: 1, аяты: [[0, 10, 0, 20], null] }) + '\n';
  const битая = JSON.stringify({ формат: 1, издание: 'x.test', сура: 5, аяты: [] }) + '\n';
  const индекс = JSON.stringify({
    формат: 1,
    издание: 'x.test',
    суры: { 1: { файл: 'quran-words/x.test/001.a.json', sha256: await sha(сура) }, 2: { файл: 'quran-words/x.test/002.b.json', sha256: '00' }, 3: { файл: 'quran-words/x.test/003.c.json', sha256: await sha(битая) } },
  });
  const файлы = { '/b/quran-words/x.test/index.json': индекс, '/b/quran-words/x.test/001.a.json': сура, '/b/quran-words/x.test/002.b.json': сура, '/b/quran-words/x.test/003.c.json': битая };
  const запросы = [];
  const з = т.создатьЗагрузчикСлов({
    манифест: { формат: 1, издания: { 'x.test': { индекс: 'quran-words/x.test/index.json', sha256Индекса: await sha(индекс) } } },
    база: '/b',
    получить: async (а) => (запросы.push(а), файлы[а] ?? null),
    sha256: sha,
  });
  const с1 = await з.таймингиСуры('x.test', 1);
  assert.deepEqual(с1.аят(1), [[0, 100], [100, 300]]);
  assert.equal(с1.аят(2), null);
  assert.equal(с1.аят(9), null);
  assert.equal(await з.таймингиСуры('x.test', 1), с1, 'кэш');
  assert.equal(запросы.length, 2, 'индекс и сура — по одному запросу');
  assert.equal(await з.таймингиСуры('x.test', 2), null, 'sha256 не сошёлся');
  assert.equal(await з.таймингиСуры('x.test', 3), null, 'в файле другая сура');
  assert.equal(await з.таймингиСуры('x.test', 4), null, 'суры нет в индексе');
  assert.equal(await з.таймингиСуры('нет.такого', 1), null, 'издания нет');
  assert.equal(т.естьТайминги({ формат: 1, издания: {} }, 'x'), false);
});

const папка = path.join(корень, 'public');
const изданий = Object.keys(МАНИФЕСТ_СЛОВ.издания);
if (изданий.length) {
  await тест(`данные (${изданий.join(', ')}): число слов каждого аята = нашей копии, начала не убывают`, async () => {
    const индексСур = JSON.parse(fs.readFileSync(path.join(папка, МАНИФЕСТ_КОРАНА.индекс), 'utf8'));
    const слов = {};
    for (const з of индексСур.суры) {
      const с = JSON.parse(fs.readFileSync(path.join(папка, з.файл), 'utf8'));
      слов[с.сура] = с.аяты.map((а) => текстМ.словаАята(а.текст).length);
    }
    for (const издание of изданий) {
      const з = т.создатьЗагрузчикСлов({
        манифест: МАНИФЕСТ_СЛОВ,
        база: папка,
        получить: async (а) => (fs.existsSync(а) ? fs.readFileSync(а, 'utf8') : null),
        sha256: sha,
      });
      let с_таймингом = 0;
      for (let н = 1; н <= 114; н++) {
        const с = await з.таймингиСуры(издание, н);
        assert.ok(с, `${издание} сура ${н} загрузилась`);
        слов[н].forEach((число, i) => {
          const а = с.аят(i + 1);
          if (!а) return;
          с_таймингом++;
          assert.equal(а.length, число, `${издание} ${н}:${i + 1} — слов ${а.length}, у нас ${число}`);
          for (let k = 1; k < а.length; k++) assert.ok(а[k][0] >= а[k - 1][0] && а[k][1] >= а[k][0], `${издание} ${н}:${i + 1} слово ${k + 1}`);
        });
      }
      assert.ok(с_таймингом > 5500, `${издание}: аятов с таймингом ${с_таймингом}`); // аш-Шатри: 317 аятов не прошли полную проверку (суры 10, 17, 41, 59 — другой файл)
    }
  });
} else {
  console.log('  — данных таймингов в сборке нет (МАНИФЕСТ_СЛОВ пуст) — проверка данных пропущена');
}

console.log(`\nOK: ${проверок} проверок`);
