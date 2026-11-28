/**
 * Тест перевода смыслов и тафсира — чистая часть (src/quran/translation.ts) и данные сборки (app/public/quran-trans).
 * Владелец 28.11.2026: «Нам нужно теперь добавить перевод каждого аята!».
 *   изданиеДляЯзыка — свой язык, ar без перевода, тафсир без запаса; разбор переключателя (translationPref.ts);
 *   проверитьИндексПеревода / проверитьСуруПеревода — чужой ключ, не 114 сур, неверное имя файла, HTML, пустая строка;
 *   данные — каждый индекс манифеста проходит проверку, sha256 сур = индексу, каждая сура проходит проверку.
 * Запуск: npm run test:trans
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const т = await import('../src/quran/translation.ts');
const { переводВклИз } = await import('../src/quran/translationPref.ts');
const { МАНИФЕСТ_ПЕРЕВОДОВ: М } = await import('../src/quran/transManifest.generated.ts');

let проверок = 0;
function тест(имя, ф) {
  ф();
  проверок++;
  console.log('  ✓ ' + имя);
}

тест('решение владельца 28.11.2026: перевод только en, tr, id, ur, uz; ru, kk, ar — нет; тафсира нет', () => {
  for (const я of ['en', 'tr', 'id', 'ur', 'uz']) assert.equal(т.изданиеДляЯзыка(М, 'перевод', я)?.свой, true, я);
  for (const я of ['ru', 'kk', 'ar']) assert.equal(т.изданиеДляЯзыка(М, 'перевод', я), null, я);
  for (const я of ['ru', 'kk', 'uz', 'en', 'tr', 'id', 'ur', 'ar']) assert.equal(т.изданиеДляЯзыка(М, 'тафсир', я), null, я);
  assert.deepEqual(Object.keys(М.переводы).sort(), ['en', 'id', 'tr', 'ur', 'uz']);
  assert.deepEqual(Object.keys(М.тафсиры), []);
});

тест('переключатель «Перевод»: по умолчанию вкл, выкл — только { версия: 1, вкл: false }', () => {
  assert.equal(переводВклИз(null), true);
  assert.equal(переводВклИз({ версия: 1, вкл: false }), false);
  assert.equal(переводВклИз({ версия: 2, вкл: false }), true);
  assert.equal(переводВклИз({ версия: 1, вкл: 'нет' }), true);
});

const sha = (с) => crypto.createHash('sha256').update(с, 'utf8').digest('hex');
const папка = path.join(корень, 'public');
for (const [вид, таблица] of [['переводы', М.переводы], ['тафсиры', М.тафсиры]]) {
  for (const [язык, з] of Object.entries(таблица)) {
    тест(`${вид} ${язык} (${з.ключ}): индекс и 114 сур проходят проверку, sha256 = индексу`, () => {
      const текст = fs.readFileSync(path.join(папка, з.индекс), 'utf8');
      assert.equal(sha(текст), з.sha256Индекса);
      const индекс = т.проверитьИндексПеревода(JSON.parse(текст), з);
      assert.ok(индекс);
      assert.equal(индекс.язык, язык);
      for (let н = 1; н <= 114; н++) {
        const с = fs.readFileSync(path.join(папка, индекс.суры[н - 1].файл), 'utf8');
        assert.equal(sha(с), индекс.суры[н - 1].sha256);
        assert.ok(т.проверитьСуруПеревода(JSON.parse(с), индекс, н), `${з.ключ} ${н}`);
      }
      // Порча: чужой ключ, не 114 сур, неверное имя файла.
      const сырые = JSON.parse(текст);
      assert.equal(т.проверитьИндексПеревода({ ...сырые, ключ: 'чужой' }, з), null);
      assert.equal(т.проверитьИндексПеревода({ ...сырые, суры: сырые.суры.slice(1) }, з), null);
      assert.equal(т.проверитьИндексПеревода({ ...сырые, суры: [{ ...сырые.суры[0], файл: 'quran/001.json' }, ...сырые.суры.slice(1)] }, з), null);
      const сура = JSON.parse(fs.readFileSync(path.join(папка, индекс.суры[0].файл), 'utf8'));
      assert.equal(т.проверитьСуруПеревода({ ...сура, аяты: [['<b>x</b>', null], ...сура.аяты.slice(1)] }, индекс, 1), null);
      assert.equal(т.проверитьСуруПеревода({ ...сура, аяты: [['', null], ...сура.аяты.slice(1)] }, индекс, 1), null);
      assert.equal(т.проверитьСуруПеревода({ ...сура, аяты: сура.аяты.slice(1) }, индекс, 1), null);
      assert.equal(т.проверитьСуруПеревода(сура, индекс, 2), null);
    });
  }
}
console.log(`\nOK: перевод смыслов — ${проверок} проверок`);
