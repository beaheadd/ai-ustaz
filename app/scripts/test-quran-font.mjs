#!/usr/bin/env node
/**
 * Тест шрифта «Мединский мусхаф» (KFGQPC HAFS Uthmanic Script 3.0) и подстройки показа — без браузера и без пакетов:
 *   node scripts/test-quran-font.mjs  (npm run test:quran-font)
 *
 * Владелец 28.11.2026: выбор шрифта Корана, мединский — по умолчанию; «Да, с подстройкой» (src/quran/displayKfgqpc.ts —
 * ждёт проверки устаза). Что проверяем:
 *   файл     — app/public/fonts/… = WOFF Комплекса побайтно (sha256 из src/quran/kfgqpcFont.ts и content/sources.json),
 *              хэш в имени; нативный TTF = TTF из архива Комплекса (sha256 из sources.json);
 *   исходный — копия Tanzil для показа (content/quran/quran-uthmani-marks.xml) по-прежнему = эталону sha256
 *              (tools/quran/quran_common.py ЭТАЛОН_SHA256_ПОКАЗА), и public/quran — те же 6236 аятов: подстройка
 *              ничего не трогает в данных; подстроенная строка ≠ исходной (в аятах с сукуном и т. п.), исходный
 *              отрезок по карте смещений восстанавливается побайтно (копирование, «Сообщить об ошибке»);
 *   заглушки — по всем 6236 аятам и бисмилле после подстройки: каждый символ есть в cmap шрифта, нет U+25CC,
 *              каждый комбинирующий знак (\p{Mn}) отображается в глиф-ЗНАК (класс 3 в GDEF), а не в глиф-основу —
 *              так в шрифте устроены заглушки U+06DF и U+06EB (широкая чёрная точка в пунктирном кружке); нет татвиля
 *              перед ٰ (надстрочный алиф падает на строку). Контроль: БЕЗ подстройки тот же тест находит эти места;
 *   таджвид  — цвета режут ИСХОДНУЮ строку, подстройка — к каждому куску: склейка подстроенных кусков = подстройке всей
 *              строки на всех аятах с разметкой (индексы не съезжают), в т. ч. 2:2 ٱلْكِتَـٰبُ и 1:3 ٱلرَّحْمَـٰنِ;
 *              то же для групп «слово + знаки остановки» (quran/text.ts диапазоныГрупп); кускиДляKfgqpc — мадд на «ـٰ»
 *              (≈ 5,8 тыс. мест) берёт букву перед собой, чтобы цвет не потерялся: склейка та же, цветной кусок не
 *              начинается со знака.
 * HarfBuzz-проверка той же подстройки (формирование всех 6236 аятов, ни одного .notdef и пунктирного кружка) сделана
 * при подключении шрифта (uharfbuzz 0.57, 28.11.2026); этот тест повторяет её смысл без зависимостей — по cmap и GDEF.
 * Модули — TypeScript без импортов: node ≥ 22.18 снимает типы сам.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const репозиторий = path.resolve(корень, '..');
const { ШРИФТ_KFGQPC } = await import('../src/quran/kfgqpcFont.ts');
const д = await import('../src/quran/displayKfgqpc.ts');
const вид = await import('../src/quran/quranScript.ts');
const { МАНИФЕСТ_КОРАНА: М } = await import('../src/quran/manifest.generated.ts');
const { МАНИФЕСТ_ТАДЖВИДА: МТ } = await import('../src/quran/tajweedManifest.generated.ts');
const тм = await import('../src/quran/tajweed.ts');
const { диапазоныГрупп } = await import('../src/quran/text.ts');

const sha = (б) => crypto.createHash('sha256').update(б).digest('hex');
let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}
const код = (с) => 'U+' + с.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

// ───────────────────────── WOFF: таблицы, cmap, GDEF ─────────────────────────
function таблицыWoff(б) {
  assert.equal(б.subarray(0, 4).toString('latin1'), 'wOFF', 'не WOFF');
  const н = б.readUInt16BE(12);
  const т = {};
  for (let i = 0; i < н; i++) {
    const з = 44 + 20 * i;
    const тег = б.subarray(з, з + 4).toString('latin1');
    const смещ = б.readUInt32BE(з + 4), сжато = б.readUInt32BE(з + 8), было = б.readUInt32BE(з + 12);
    const кусок = б.subarray(смещ, смещ + сжато);
    т[тег] = сжато < было ? zlib.inflateSync(кусок) : Buffer.from(кусок);
    assert.equal(т[тег].length, было, тег);
  }
  return т;
}
function картаCmap(cmap) {
  const карта = new Map();
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const с = cmap.readUInt32BE(4 + 8 * i + 4);
    const формат = cmap.readUInt16BE(с);
    if (формат === 4) {
      const сегх2 = cmap.readUInt16BE(с + 6);
      const концы = с + 14, начала = с + 16 + сегх2, дельты = с + 16 + 2 * сегх2, смещения = с + 16 + 3 * сегх2;
      for (let к = 0; к < сегх2 / 2; к++) {
        const нач = cmap.readUInt16BE(начала + 2 * к), кон = cmap.readUInt16BE(концы + 2 * к);
        const дельта = cmap.readInt16BE(дельты + 2 * к), см = cmap.readUInt16BE(смещения + 2 * к);
        for (let к2 = нач; к2 <= кон && к2 !== 0xffff; к2++) {
          let г = см === 0 ? (к2 + дельта) & 0xffff : cmap.readUInt16BE(смещения + 2 * к + см + 2 * (к2 - нач));
          if (см !== 0 && г) г = (г + дельта) & 0xffff;
          if (г && !карта.has(к2)) карта.set(к2, г);
        }
      }
    } else if (формат === 12) {
      for (let к = 0; к < cmap.readUInt32BE(с + 12); к++) {
        const нач = cmap.readUInt32BE(с + 16 + 12 * к), кон = cmap.readUInt32BE(с + 20 + 12 * к), г0 = cmap.readUInt32BE(с + 24 + 12 * к);
        for (let к2 = нач; к2 <= кон; к2++) if (!карта.has(к2)) карта.set(к2, г0 + к2 - нач);
      }
    }
  }
  return карта;
}
function классыGdef(gdef) {
  const с = gdef.readUInt16BE(4);
  const классы = new Map();
  const формат = gdef.readUInt16BE(с);
  if (формат === 1) {
    const начало = gdef.readUInt16BE(с + 2), н = gdef.readUInt16BE(с + 4);
    for (let i = 0; i < н; i++) классы.set(начало + i, gdef.readUInt16BE(с + 6 + 2 * i));
  } else {
    for (let i = 0; i < gdef.readUInt16BE(с + 2); i++) {
      const з = с + 4 + 6 * i;
      for (let г = gdef.readUInt16BE(з); г <= gdef.readUInt16BE(з + 2); г++) классы.set(г, gdef.readUInt16BE(з + 4));
    }
  }
  return классы;
}

const путьWoff = path.join(корень, 'public', ШРИФТ_KFGQPC.файл);
const байтыWoff = fs.readFileSync(путьWoff);
const таблицы = таблицыWoff(байтыWoff);
const cmap = картаCmap(таблицы.cmap);
const классы = классыGdef(таблицы.GDEF);
const ЗНАК = /\p{Mn}/u;

/** Что в строке шрифт нарисует неверно: нет в cmap, U+25CC, знак → глиф-основа (заглушка), татвиль перед ٰ. */
function плохоеВСтроке(с) {
  const плохие = [];
  for (const з of с) {
    const к = з.codePointAt(0);
    const г = cmap.get(к);
    if (к === 0x25cc) плохие.push('U+25CC');
    else if (г === undefined) плохие.push('нет в cmap ' + код(з));
    else if (ЗНАК.test(з) && классы.get(г) !== 3) плохие.push('заглушка ' + код(з));
  }
  if (с.includes('ـٰ')) плохие.push('татвиль перед ٰ');
  return плохие;
}

// ───────────────────────── Данные Корана ─────────────────────────
const прочитать = (файл) => fs.readFileSync(path.join(корень, 'public', файл), 'utf8');
const индекс = JSON.parse(прочитать(М.индекс));
const суры = индекс.суры.map((з) => JSON.parse(прочитать(з.файл)));
const аяты = суры.flatMap((с) => с.аяты.map((а) => ({ ключ: `${с.сура}:${а.аят}`, сура: с.сура, аят: а.аят, текст: а.текст })));
// Имена сур — не текст Корана: картуш и список рисуются Amiri Quran (в KFGQPC нет U+0622 из «آل عمران»).
const строкиПоказа = [...аяты.map((а) => [а.ключ, а.текст]), ...суры.filter((с) => с.бисмилла).map((с) => [`${с.сура}:бисмилла`, с.бисмилла])];

console.log('Шрифт «Мединский мусхаф» (KFGQPC Hafs 3.0)');
await тест('файл веба = WOFF Комплекса побайтно (sha256, размер, хэш в имени); нативный TTF = TTF из архива Комплекса', () => {
  assert.equal(sha(байтыWoff), ШРИФТ_KFGQPC.sha256);
  assert.equal(байтыWoff.length, ШРИФТ_KFGQPC.байт);
  assert.ok(path.basename(ШРИФТ_KFGQPC.файл).includes('.' + ШРИФТ_KFGQPC.sha256.slice(0, 20) + '.'));
  const источник = JSON.parse(fs.readFileSync(path.join(репозиторий, 'content', 'sources.json'), 'utf8')).источники.find((и) => и.id === 'kfgqpc-hafs');
  assert.ok(источник, 'запись kfgqpc-hafs в content/sources.json');
  const woff = источник.выгрузки.find((в) => в.вид === 'woff');
  const ttf = источник.выгрузки.find((в) => в.вид === 'ttf');
  assert.equal(woff.sha256, ШРИФТ_KFGQPC.sha256);
  assert.equal(sha(fs.readFileSync(path.join(репозиторий, ttf.путь))), ttf.sha256);
  assert.ok(fs.existsSync(path.join(репозиторий, 'licenses', 'fonts', 'KFGQPC-Hafs-EULA.txt')));
  const лишние = fs.readdirSync(path.join(корень, 'public', 'fonts')).filter((и) => 'fonts/' + и !== ШРИФТ_KFGQPC.файл);
  assert.deepEqual(лишние, []);
});
await тест('выбор шрифта: два варианта, по умолчанию «мединский»; неверное — не шрифт', () => {
  assert.deepEqual([...вид.ШРИФТЫ_КОРАНА], ['мединский', 'классический']);
  assert.equal(вид.ШРИФТ_КОРАНА_ПО_УМОЛЧАНИЮ, 'мединский');
  assert.equal(вид.выборШрифтаКорана(), 'мединский'); // в node нет localStorage — по умолчанию
  assert.ok(вид.этоШрифтКорана('классический') && !вид.этоШрифтКорана('amiri') && !вид.этоШрифтКорана(null));
});

console.log('Исходный текст не меняется');
await тест('копия Tanzil для показа = эталону sha256 (ЭТАЛОН_SHA256_ПОКАЗА); public/quran — 6236 аятов', () => {
  const эталон = fs.readFileSync(path.join(репозиторий, 'tools', 'quran', 'quran_common.py'), 'utf8').match(/ЭТАЛОН_SHA256_ПОКАЗА = '([0-9a-f]{64})'/)?.[1];
  assert.ok(эталон);
  assert.equal(sha(fs.readFileSync(path.join(репозиторий, 'content', 'quran', 'quran-uthmani-marks.xml'))), эталон);
  assert.equal(аяты.length, 6236);
  assert.equal(аяты.length, М.аятов);
});
await тест('подстроенная строка ≠ исходной; исходная после подстройки та же; отрезки по карте смещений = исходным побайтно', () => {
  const до = sha(JSON.stringify(аяты));
  let изменено = 0;
  for (const а of аяты) {
    const п = д.подстроитьДляKfgqpc(а.текст);
    if (п !== а.текст) изменено += 1;
    const { текст, исходные } = д.подстроитьСКартой(а.текст);
    assert.equal(текст, п, а.ключ);
    assert.equal(исходные.length, текст.length + 1);
    assert.equal(д.исходныйОтрезок(а.текст, 0, текст.length), а.текст, а.ключ + ': целиком');
    // По словам: отрезок подстроенного слова → исходное слово.
    let п0 = 0;
    for (const слово of а.текст.split(' ')) {
      const длина = д.подстроитьДляKfgqpc(слово).length;
      assert.equal(д.исходныйОтрезок(а.текст, п0, п0 + длина), слово, а.ключ + ': ' + слово);
      п0 += длина + 1;
    }
  }
  assert.equal(sha(JSON.stringify(аяты)), до, 'данные не изменились');
  assert.ok(изменено > 6000, 'подстроено аятов: ' + изменено);
  // 1:2 — сукун меняется на сукун мединского письма; строка Tanzil остаётся с U+0652.
  const а12 = аяты.find((а) => а.ключ === '1:2').текст;
  assert.ok(а12.includes('ْ') && !д.подстроитьДляKfgqpc(а12).includes('ْ') && д.подстроитьДляKfgqpc(а12).includes('ۡ'));
  assert.equal(д.подстроитьДляKfgqpc('بِسْمِ'), 'بِسۡمِ');
  // Только пять правил: другие знаки и татвиль не перед ٰ — как есть.
  assert.equal(д.подстроитьДляKfgqpc('بِـَٔايَـٰتِ'), 'بِـَٔايَٰتِ');
  assert.equal(Object.keys(д.ЗАМЕНЫ_KFGQPC).length, 4);
});

console.log('Заглушки после подстройки (все 6236 аятов и бисмилла)');
await тест('после подстройки: каждый символ в cmap, нет U+25CC, каждый знак — глиф-знак (GDEF 3), нет татвиля перед ٰ', () => {
  const плохие = [];
  for (const [ключ, с] of строкиПоказа) for (const п of плохоеВСтроке(д.подстроитьДляKfgqpc(с))) плохие.push(ключ + ' ' + п);
  assert.deepEqual(плохие.slice(0, 20), [], `плохих мест: ${плохие.length}`);
  // Знак конца аята и арабские цифры (MushafView) — тоже в шрифте.
  for (const з of '۝٠١٢٣٤٥٦٧٨٩') assert.ok(cmap.has(з.codePointAt(0)), код(з));
});
await тест('контроль: БЕЗ подстройки тест находит заглушки U+06DF и U+06EB и татвиль перед ٰ (шрифт рисовал бы неверно)', () => {
  const счёт = new Map();
  for (const [, с] of строкиПоказа) for (const п of плохоеВСтроке(с)) счёт.set(п, (счёт.get(п) ?? 0) + 1);
  assert.ok((счёт.get('заглушка U+06DF') ?? 0) > 3000, 'U+06DF: ' + счёт.get('заглушка U+06DF'));
  assert.ok((счёт.get('заглушка U+06EB') ?? 0) >= 1);
  assert.ok((счёт.get('татвиль перед ٰ') ?? 0) > 1000);
  // Сукун U+0652 шрифт рисует круглым «ноликом» (знак непроизносимой буквы в мусхафе Медины) — глиф U+0652 ≠ U+06E1.
  assert.notEqual(cmap.get(0x0652), cmap.get(0x06e1));
});

console.log('Таджвид: куски режут исходную строку, подстройка — к каждому куску');
await тест('склейка подстроенных кусков цвета = подстройке всей строки на всех аятах с разметкой; 2:2 и 1:3', () => {
  const индексТ = JSON.parse(прочитать(МТ.индекс));
  let аятовСЦветами = 0;
  const проверитьАят = (текст, отрезки, ключ) => {
    const куски = тм.кускиТекста(текст, отрезки);
    assert.equal(куски.map((к) => к.текст).join(''), текст, ключ + ': склейка исходных');
    assert.equal(куски.map((к) => д.подстроитьДляKfgqpc(к.текст)).join(''), д.подстроитьДляKfgqpc(текст), ключ + ': склейка подстроенных');
    for (const к of куски) if (к.код) assert.equal(плохоеВСтроке(д.подстроитьДляKfgqpc(к.текст)).length, 0, ключ);
    // Для мединского — куски, где мадд на «ـٰ» берёт букву перед собой: склейка та же, цветной кусок не начинается со знака.
    const сБуквой = д.кускиДляKfgqpc(куски);
    assert.equal(сБуквой.map((к) => к.текст).join(''), текст, ключ + ': склейка кусков для мединского');
    assert.equal(сБуквой.map((к) => д.подстроитьДляKfgqpc(к.текст)).join(''), д.подстроитьДляKfgqpc(текст), ключ);
    сБуквой.forEach((к, i) => {
      if (к.код && /^\p{M}/u.test(д.подстроитьДляKfgqpc(к.текст)) && !(i > 0 && сБуквой[i - 1].код)) throw new Error(ключ + ': цветной кусок начинается со знака');
      if (к.текст.startsWith('\u0640\u0670') && к.код && !(i > 0 && сБуквой[i - 1].код)) throw new Error(ключ + ': ـٰ не взял букву');
    });
    перенесено += куски.length - сБуквой.length + сБуквой.filter((к, i) => к.текст !== куски[i]?.текст).length > 0 ? 1 : 0;
  };
  let перенесено = 0;
  for (const з of индексТ.суры) {
    const р = JSON.parse(прочитать(з.файл));
    const сура = суры[з.сура - 1];
    сура.аяты.forEach((а, i) => {
      const о = тм.разобратьРазметку(р.аяты[i]);
      if (!о || !тм.отрезкиВерны(а.текст, о)) return;
      проверитьАят(а.текст, о, `${з.сура}:${а.аят}`);
      аятовСЦветами += 1;
      // Группы «слово + знаки остановки» — так же.
      const г = диапазоныГрупп(а.текст).map(([с, по]) => д.подстроитьДляKfgqpc(а.текст.slice(с, по)));
      assert.equal(г.join(' '), д.подстроитьДляKfgqpc(а.текст));
    });
  }
  assert.ok(аятовСЦветами > 6000, 'аятов с разметкой: ' + аятовСЦветами);
  assert.ok(перенесено > 2000, 'аятов, где мадд на «ـٰ» взял букву: ' + перенесено);
  // 2:2 ٱلْكِتَـٰبُ и 1:3 ٱلرَّحْمَـٰنِ: татвиль и его ٰ — в одном куске, в подстроенном куске татвиля нет.
  for (const [с, а, начало] of [[2, 2, '\u0671\u0644\u0652\u0643'], [1, 3, '\u0671\u0644\u0631']]) {
    const текст = суры[с - 1].аяты[а - 1].текст;
    const слово = текст.split(' ').find((с2) => с2.startsWith(начало) && с2.includes('\u0640\u0670'));
    assert.ok(слово, `${с}:${а}: слово ${начало}… с татвилем перед ٰ`);
    const р = JSON.parse(прочитать(индексТ.суры[с - 1].файл));
    const куски = тм.кускиТекста(текст, тм.разобратьРазметку(р.аяты[а - 1]));
    const сТатвилем = куски.filter((к) => к.текст.includes('ـٰ'));
    assert.ok(сТатвилем.length > 0 && куски.every((к) => !к.текст.startsWith('ٰ')), `${с}:${а}: ٰ не начинает кусок`);
    assert.ok(сТатвилем.every((к) => !д.подстроитьДляKfgqpc(к.текст).includes('ـٰ')));
  }
});

console.log(`\nOK: ${проверок} проверок`);
