#!/usr/bin/env node
/**
 * Тест хадисов аль-Бухари из HadeethEnc.com (без браузера): node scripts/test-hadith.mjs  (npm run test:hadith)
 * Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!».
 *   данные    — app/public/hadith: манифест src/hadith/manifest.generated.ts → индекс → заголовки ru/en/uz и порции
 *               ar/ru/en/uz (sha256 и хэш в имени); ни одного хадиса из content/hadith/на-проверку-устаза.json без
 *               одобрения; русский перевод у каждого полный; ссылка на страницу HadeethEnc у каждой записи;
 *               dist/hadith (если сборка есть) — побайтно те же файлы;
 *   loader.ts — проверки формы (настоящие файлы проходят; номер с пропуском, чужая ссылка, лишний хадис в порции —
 *               нет), выбор перевода (ru; en/uz — свой или русский; kk — русский), поиск по номеру и словам,
 *               дерево разделов, арабский текст другой редакции (hadeeth_ar);
 *   сеть      — общий загрузчик (src/quran/loader.ts создатьЗагрузчик().загрузитьФайл) с подменённой сетью:
 *               индекс хадисов с подменённым символом — «не прошло сверку»; нет связи — не кэшируется, «Повторить».
 * Модули — TypeScript без импортов: node ≥ 22.18 снимает типы сам.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const репозиторий = path.resolve(корень, '..');
const ПАПКА = path.join(корень, 'public', 'hadith');
const { МАНИФЕСТ_ХАДИСОВ: М } = await import('../src/hadith/manifest.generated.ts');
const Л = await import('../src/hadith/loader.ts');
const { создатьЗагрузчик } = await import('../src/quran/loader.ts');
const { МАНИФЕСТ_КОРАНА } = await import('../src/quran/manifest.generated.ts');

const sha256 = (с) => crypto.createHash('sha256').update(с, 'utf8').digest('hex');
let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}
const прочитать = (файл) => fs.readFileSync(path.join(корень, 'public', файл), 'utf8');

console.log('Данные (app/public/hadith)');
const индексТекст = прочитать(М.индекс);
const сырой = JSON.parse(индексТекст);
const индекс = Л.проверитьИндекс(сырой, М);
const наПроверку = JSON.parse(fs.readFileSync(path.join(репозиторий, 'content', 'hadith', 'на-проверку-устаза.json'), 'utf8'));
const одобрено = JSON.parse(fs.readFileSync(path.join(репозиторий, 'content', 'hadith', 'одобрено.json'), 'utf8')).хадисы;

await тест('манифест → индекс: sha256 содержимого и хэш в имени; форма индекса проходит проверку', () => {
  assert.equal(sha256(индексТекст), М.sha256Индекса);
  assert.match(М.индекс, new RegExp(`^hadith/index\\.${М.sha256Индекса.slice(0, 20)}\\.json$`));
  assert.ok(индекс, 'проверитьИндекс вернул null');
  assert.equal(индекс.хадисов, М.хадисов);
  assert.ok(М.хадисов > 500, 'хадисов меньше 500');
  assert.equal(индекс.издатель, 'HadeethEnc.com');
  assert.match(индекс.условия, /No modification, addition, or deletion of the content/);
});

const файлыИндекса = [...Object.values(индекс.заголовки), ...Object.values(индекс.порции).flat().filter(Boolean)];
await тест(`заголовки и порции (${файлыИндекса.length} файлов): sha256 = индексу, хэш в имени, лишних файлов нет`, () => {
  for (const ф of файлыИндекса) {
    assert.equal(sha256(прочитать(ф.файл)), ф.sha256, ф.файл);
    assert.ok(ф.файл.includes('.' + ф.sha256.slice(0, 20) + '.'), ф.файл);
  }
  const все = new Set(файлыИндекса.map((ф) => ф.файл).concat(М.индекс));
  const обойти = (п) => fs.readdirSync(п, { withFileTypes: true }).flatMap((з) => (з.isDirectory() ? обойти(path.join(п, з.name)) : [path.join(п, з.name)]));
  for (const абс of обойти(ПАПКА)) assert.ok(все.has('hadith/' + path.relative(ПАПКА, абс).split(path.sep).join('/')), 'лишний файл ' + абс);
});

const порции = new Map();
for (const я of ['ar', 'ru', 'en', 'uz']) {
  индекс.порции[я].forEach((ф, ч) => {
    if (!ф) return;
    const п = Л.проверитьПорцию(JSON.parse(прочитать(ф.файл)), я, ч, индекс);
    assert.ok(п, `порция ${я}/${ч} не прошла проверку формы`);
    for (const [id, з] of п) порции.set(я + ':' + id, з);
  });
}
await тест('каждая порция проходит проверку формы; у каждого хадиса — арабская запись и полный русский перевод', () => {
  for (const х of индекс.хадисы) {
    const ar = порции.get('ar:' + х.id);
    const ru = порции.get('ru:' + х.id);
    assert.ok(ar && ru, '#' + х.id);
    for (const п of ['title', 'hadeeth', 'explanation', 'grade', 'attribution']) assert.ok(ru[п].trim(), `#${х.id} ru.${п} пусто`);
    assert.ok(ar.hadeeth.trim() && /[؀-ۿ]/.test(ar.hadeeth), `#${х.id} арабский текст`);
    assert.equal(ru.link, `https://hadeethenc.com/ru/browse/hadith/${х.id}`);
    for (const я of х.языки) assert.ok(порции.get(я + ':' + х.id), `#${х.id}: нет записи ${я}`);
  }
});

await тест(`ждут устаза (${наПроверку.всего}): ни один не опубликован без одобрения; причины — акыда, правило 5, цитата Корана`, () => {
  const ids = new Set(индекс.хадисы.map((х) => х.id));
  assert.equal(наПроверку.хадисы.length, наПроверку.всего);
  assert.ok(наПроверку.всего > 0);
  for (const з of наПроверку.хадисы) {
    if (!одобрено[String(з.id)]) assert.ok(!ids.has(з.id), `#${з.id} опубликован без одобрения`);
    assert.ok(з.причины.length > 0 && з.ссылка === `https://hadeethenc.com/ru/browse/hadith/${з.id}`);
  }
  // Ни один показанный хадис не отнесён к акыде (корень 3 HadeethEnc), если не одобрен.
  const путьВАкыду = (к) => Л.путьКатегории(индекс, к).some((п) => п.id === 3);
  for (const х of индекс.хадисы) if (!одобрено[String(х.id)]) assert.ok(!х.категории.some(путьВАкыду), `#${х.id} из акыды`);
  assert.equal(Object.keys(одобрено).length, Object.keys(индекс.одобрено).length);
});

await тест('dist/hadith (если сборка есть) — побайтно те же файлы', () => {
  const dist = path.join(корень, 'dist', 'hadith');
  if (!fs.existsSync(dist)) return;
  for (const ф of [М.индекс, ...файлыИндекса.map((ф) => ф.файл)]) {
    assert.ok(fs.readFileSync(path.join(корень, 'dist', ф)).equals(fs.readFileSync(path.join(корень, 'public', ф))), ф);
  }
});

console.log('Проверки формы (loader.ts)');
await тест('индекс: номер с пропуском, повтор id, хадис без ru, чужой манифест — не проходит', () => {
  const копия = () => JSON.parse(индексТекст);
  let к = копия();
  к.хадисы[1].n = 5;
  assert.equal(Л.проверитьИндекс(к, М), null);
  к = копия();
  к.хадисы[1].id = к.хадисы[0].id;
  assert.equal(Л.проверитьИндекс(к, М), null);
  к = копия();
  к.хадисы[0].языки = ['en'];
  assert.equal(Л.проверитьИндекс(к, М), null);
  assert.equal(Л.проверитьИндекс(копия(), { ...М, хадисов: М.хадисов + 1 }), null);
  к = копия();
  к.порции.ru[0].файл = к.порции.ru[0].файл.replace(/\.[0-9a-f]{20}\./, '.00000000000000000000.');
  assert.equal(Л.проверитьИндекс(к, М), null);
});
await тест('порция: чужая ссылка, лишний или пропавший хадис, пустой заголовок — не проходит', () => {
  const ф = индекс.порции.ru[0];
  const копия = () => JSON.parse(прочитать(ф.файл));
  let к = копия();
  к.хадисы[0].link = 'https://example.com/x';
  assert.equal(Л.проверитьПорцию(к, 'ru', 0, индекс), null);
  к = копия();
  к.хадисы.pop();
  assert.equal(Л.проверитьПорцию(к, 'ru', 0, индекс), null);
  к = копия();
  к.хадисы[0].title = '';
  assert.equal(Л.проверитьПорцию(к, 'ru', 0, индекс), null);
  assert.equal(Л.проверитьПорцию(копия(), 'ru', 1, индекс), null, 'не та порция');
  assert.equal(Л.проверитьПорцию(копия(), 'en', 0, индекс), null, 'не тот язык');
});
await тест('заголовки ru/en/uz проходят проверку; переставленные — нет', () => {
  for (const я of ['ru', 'en', 'uz']) {
    const з = Л.проверитьЗаголовки(JSON.parse(прочитать(индекс.заголовки[я].файл)), я, индекс);
    assert.ok(з && з.size === индекс.хадисы.filter((х) => х.языки.includes(я)).length, я);
  }
  const к = JSON.parse(прочитать(индекс.заголовки.ru.файл));
  [к.заголовки[0], к.заголовки[1]] = [к.заголовки[1], к.заголовки[0]];
  assert.equal(Л.проверитьЗаголовки(к, 'ru', индекс), null);
});

console.log('Перевод, поиск, разделы');
await тест('языкПеревода: ru → ru; kk → ru (запасной); en/uz — свой или ru (запасной); языкЗаголовков kk → ru', () => {
  assert.deepEqual(Л.языкПеревода('ru', ['ru', 'en']), { язык: 'ru', запасной: false });
  assert.deepEqual(Л.языкПеревода('kk', ['ru', 'en', 'uz']), { язык: 'ru', запасной: true });
  assert.deepEqual(Л.языкПеревода('en', ['ru', 'en']), { язык: 'en', запасной: false });
  assert.deepEqual(Л.языкПеревода('en', ['ru']), { язык: 'ru', запасной: true });
  assert.deepEqual(Л.языкПеревода('uz', ['ru', 'uz']), { язык: 'uz', запасной: false });
  assert.deepEqual(Л.языкПеревода('uz', ['ru', 'en']), { язык: 'ru', запасной: true });
  assert.equal(Л.языкЗаголовков('kk'), 'ru');
  assert.equal(Л.языкЗаголовков('uz'), 'uz');
});
const заголовкиRu = Л.проверитьЗаголовки(JSON.parse(прочитать(индекс.заголовки.ru.файл)), 'ru', индекс);
await тест('поиск: номер по порядку и номер HadeethEnc; слова без регистра (ё = е); пусто → ничего', () => {
  const пятый = индекс.хадисы[4];
  assert.deepEqual(Л.найти(индекс, [заголовкиRu], '5').map((х) => х.id).includes(пятый.id), true);
  assert.deepEqual(Л.найти(индекс, [заголовкиRu], String(пятый.id)).map((х) => х.id).includes(пятый.id), true);
  assert.deepEqual(Л.найти(индекс, [заголовкиRu], '  '), []);
  const заголовок = заголовкиRu.get(пятый.id).заголовок;
  const слово = заголовок.split(/[\s«»,.!?:;"()—-]+/).find((с) => с.length >= 6);
  const найдено = Л.найти(индекс, [заголовкиRu], слово.toUpperCase().replace(/е/g, 'ё'));
  assert.ok(найдено.some((х) => х.id === пятый.id), 'по слову «' + слово + '»');
  for (const х of найдено) assert.ok(заголовкиRu.get(х.id).заголовок.toLowerCase().replace(/ё/g, 'е').includes(слово.toLowerCase().replace(/ё/g, 'е')));
  assert.deepEqual(Л.найти(индекс, [заголовкиRu], 'qqqzzzxxx'), []);
});
await тест('разделы: корни — у родителя 0; у каждого хадиса путь раздела от корня; хадисыКатегории — по номеру', () => {
  const корни = Л.подкатегории(индекс, 0);
  assert.ok(корни.length >= 3 && корни.every((к) => к.родитель === 0));
  assert.ok(!корни.some((к) => к.id === 3), 'корня «акыда» нет среди опубликованных');
  for (const х of индекс.хадисы) for (const к of х.категории) assert.equal(Л.путьКатегории(индекс, к)[0].родитель, 0);
  const к = индекс.хадисы[0].категории[0];
  const список = Л.хадисыКатегории(индекс, к);
  assert.ok(список.length >= 1 && список.every((х, i) => i === 0 || х.n > список[i - 1].n));
  assert.equal(Л.названиеКатегории(Л.категория(индекс, к), 'kk'), Л.категория(индекс, к).название.ru);
});
await тест('арабский текст: hadeeth_ar перевода другой редакции, иначе hadeeth арабской выгрузки', () => {
  let другой = 0;
  for (const х of индекс.хадисы) {
    const ar = порции.get('ar:' + х.id);
    const ru = порции.get('ru:' + х.id);
    assert.equal(Л.арабскийТекст(ar, ru), ru.hadeeth_ar ?? ar.hadeeth);
    if (ru.hadeeth_ar !== undefined) {
      другой += 1;
      assert.notEqual(ru.hadeeth_ar, ar.hadeeth);
    }
  }
  console.log(`      (перевод ru по другой редакции арабского текста: ${другой})`);
});

console.log('Сеть (общий загрузчик, подменённая сеть)');
await тест('индекс хадисов с подменённым символом — «не прошло сверку»; нет связи — не кэшируется, «Повторить» загружает', async () => {
  let режим = 'подмена';
  const получить = async (адрес) => {
    if (режим === 'нет') throw new Error('offline');
    const текст = fs.readFileSync(path.join(корень, 'public', адрес.replace(/^\/aiustaz\//, '')), 'utf8');
    return { ok: true, status: 200, text: async () => (режим === 'подмена' ? текст.replace('Сахих', 'Сахиx') : текст), тип: 'application/json' };
  };
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: МАНИФЕСТ_КОРАНА, получить, sha256 });
  const проверка = (с) => Л.проверитьИндекс(с, М);
  let р = await з.загрузитьФайл('хадисы:индекс', М.индекс, М.sha256Индекса, проверка);
  assert.deepEqual(р, { ок: false, причина: 'не-прошло-сверку' });
  режим = 'нет';
  р = await з.загрузитьФайл('хадисы:индекс', М.индекс, М.sha256Индекса, проверка);
  assert.deepEqual(р, { ок: false, причина: 'нет-связи' });
  режим = 'как есть';
  р = await з.загрузитьФайл('хадисы:индекс', М.индекс, М.sha256Индекса, проверка);
  assert.ok(р.ок && р.данные.хадисов === М.хадисов);
  assert.ok(з.изКэша('хадисы:индекс'));
});

console.log(`\nOK: хадисы аль-Бухари (HadeethEnc) — ${индекс.хадисов} хадисов, ${файлыИндекса.length + 1} файлов, ${проверок} проверок`);
