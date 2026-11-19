#!/usr/bin/env node
/**
 * Тест полного Корана для показа (без браузера): node scripts/test-quran.mjs  (npm run test:quran)
 *   данные    — app/public/quran: манифест src/quran/manifest.generated.ts → индекс → 114 сур, sha256 и хэш в имени,
 *               6236 аятов; dist/quran (если сборка есть) — побайтно те же файлы;
 *   text.ts   — разборАята: токены = куски строки (join(' ') === текст на всех 6236 аятах), знаки ۖ ۗ ۚ ۛ ۙ ۘ ۜ ۞ ۩,
 *               номера слов, части по разрешённым остановкам покрывают все слова ровно один раз, не делят по ۙ ۛ ۜ;
 *   loader.ts — загрузка с подменённой сетью: кэш, «нет связи» без кэширования и «Повторить», 5xx/404, подмена
 *               символа в аяте и в индексе → «не прошло сверку», проверки формы суры (номер, аяты, бисмилла);
 *   HTTP      — если есть dist: тестовый сервер как на batr.kz (scripts/serve-test.mjs), настоящий fetch:
 *               индекс и сура грузятся с /aiustaz/quran/…; несуществующий файл (batr.kz отдаёт свой index.html) —
 *               «не прошло сверку», а не текст;
 *   шрифт     — Amiri Quran (@expo-google-fonts/amiri-quran) содержит глиф для КАЖДОГО символа текста Корана, бисмиллы
 *               и имён сур (в т.ч. ۖ ۗ ۚ ۛ ۞ ۩), а также цифры ٠–٩ и ۝ — шрифт полный, не подмножество.
 * Модули — TypeScript без импортов: node ≥ 22.18 снимает типы сам.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ПАПКА = path.join(корень, 'public', 'quran');
const { МАНИФЕСТ_КОРАНА: М } = await import('../src/quran/manifest.generated.ts');
const текстМ = await import('../src/quran/text.ts');
const { разборАята, словаАята, числоСлов, остановкиАята, частиПоОстановкам, ЗНАКИ, ОСТАНОВКИ_ДЛЯ_ЧАСТЕЙ } = текстМ;
const { создатьЗагрузчик, проверитьСуру, проверитьИндекс, нетСвязи } = await import('../src/quran/loader.ts');

const sha256 = (с) => crypto.createHash('sha256').update(с, 'utf8').digest('hex');
let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}
const прочитать = (файл) => fs.readFileSync(path.join(корень, 'public', файл), 'utf8');

// ───────────────────────── Данные ─────────────────────────
console.log('Данные (app/public/quran)');
const индексТекст = прочитать(М.индекс);
const индекс = JSON.parse(индексТекст);
const суры = индекс.суры.map((з) => ({ запись: з, данные: JSON.parse(прочитать(з.файл)) }));
const всеАяты = суры.flatMap((с) => с.данные.аяты.map((а) => ({ сура: с.данные.сура, ...а })));

await тест('манифест → индекс: sha256 содержимого и хэш в имени', () => {
  assert.equal(sha256(индексТекст), М.sha256Индекса);
  assert.match(М.индекс, new RegExp(`^quran/index\\.${М.sha256Индекса.slice(0, 20)}\\.json$`));
  assert.equal(М.сур, 114);
  assert.equal(М.аятов, 6236);
});
await тест('114 сур, 6236 аятов; у каждой суры файл с sha256 = индексу и хэшем в имени', () => {
  assert.equal(суры.length, 114);
  assert.equal(всеАяты.length, 6236);
  for (const { запись } of суры) {
    assert.equal(sha256(прочитать(запись.файл)), запись.sha256, запись.файл);
    assert.ok(запись.файл.startsWith(`quran/${String(запись.сура).padStart(3, '0')}.${запись.sha256.slice(0, 20)}`));
  }
  const лишние = fs.readdirSync(ПАПКА).filter((и) => !индекс.суры.some((з) => з.файл === 'quran/' + и) && 'quran/' + и !== М.индекс);
  assert.deepEqual(лишние, []);
});
await тест('бисмилла: у 112 сур, кроме 1 и 9; блок условий Tanzil в каждом файле', () => {
  for (const { данные } of суры) {
    if (данные.сура === 1 || данные.сура === 9) assert.equal(данные.бисмилла, null);
    else assert.ok(typeof данные.бисмилла === 'string' && данные.бисмилла.length > 0);
    assert.match(данные.копирайт, /PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK/);
    assert.match(данные.копирайт, /CHANGING IT IS NOT ALLOWED/);
    assert.equal(данные.копирайт, индекс.копирайт);
  }
});
await тест('транслитерация: ru — строка (черновик), kk — пока null; сура 1 — «аль-Фатиха», имя — арабское из Tanzil', () => {
  assert.equal(индекс.статусТранслита, 'черновик');
  assert.deepEqual(индекс.суры[0].транслит, { ru: 'аль-Фатиха', kk: null });
  assert.equal(индекс.суры[0].имя, 'الفاتحة');
  assert.ok(индекс.суры.every((з) => typeof з.транслит.ru === 'string' && з.транслит.kk === null));
});
await тест('dist/quran (если есть сборка) — те же файлы побайтно', () => {
  const dist = path.join(корень, 'dist', 'quran');
  if (!fs.existsSync(dist)) return console.log('    (сборки нет — пропуск)');
  assert.deepEqual(fs.readdirSync(dist).sort(), fs.readdirSync(ПАПКА).sort());
  for (const и of fs.readdirSync(ПАПКА)) assert.ok(fs.readFileSync(path.join(dist, и)).equals(fs.readFileSync(path.join(ПАПКА, и))), и);
});

// ───────────────────────── text.ts ─────────────────────────
console.log('text.ts — слова и знаки');
const аят = (с, а) => суры[с - 1].данные.аяты[а - 1].текст;
await тест('токены — куски строки: join(" ") === текст на всех 6236 аятах; слова нумеруются с 1 подряд', () => {
  let слов = 0;
  for (const а of всеАяты) {
    const т = разборАята(а.текст);
    assert.equal(т.map((х) => х.текст).join(' '), а.текст);
    const номера = т.filter((х) => х.вид === 'слово').map((х) => х.номерСлова);
    assert.deepEqual(номера, номера.map((_, i) => i + 1));
    слов += номера.length;
    assert.equal(числоСлов(а.текст), номера.length);
  }
  assert.ok(слов > 77000 && слов < 79000, 'слов во всём Коране ≈ 77–78 тыс.: ' + слов);
});
await тест('2:2 — две ۛ (муанака) токенами; 1:1 — 4 слова без знаков', () => {
  const т = разборАята(аят(2, 2));
  const знаки = т.filter((х) => х.вид === 'знак');
  assert.deepEqual(знаки.map((х) => [х.знак, х.послеСлова]), [['муанака', 4], ['муанака', 5]]);
  assert.deepEqual(словаАята(аят(1, 1)).length, 4);
  assert.equal(разборАята(аят(1, 1)).some((х) => х.вид === 'знак'), false);
});
await тест('۞ — только в начале аята (послеСлова 0), ۩ — только в конце; все 9 видов знаков встречаются', () => {
  const виды = new Set();
  for (const а of всеАяты) {
    const т = разборАята(а.текст);
    т.forEach((х, i) => {
      if (х.вид !== 'знак') return;
      виды.add(х.знак);
      if (х.знак === 'хизб') assert.ok(i === 0 && х.послеСлова === 0, `${а.сура}:${а.аят}`);
      if (х.знак === 'саджда') assert.equal(i, т.length - 1, `${а.сура}:${а.аят}`);
    });
  }
  assert.equal(виды.size, Object.keys(ЗНАКИ).length);
});
await тест('ۜ внутри слова не отделяется (2 таких слова), отдельным токеном — сакта', () => {
  const внутри = всеАяты.flatMap((а) => словаАята(а.текст).filter((с) => с.includes('ۜ')));
  assert.equal(внутри.length, 2);
});
await тест('части по остановкам ۘ ۗ ۖ ۚ покрывают все слова ровно один раз; ۙ ۛ ۜ не делят', () => {
  assert.deepEqual([...ОСТАНОВКИ_ДЛЯ_ЧАСТЕЙ].sort(), ['джаиз', 'кыля', 'лязим', 'сыля']);
  let частей = 0;
  for (const а of всеАяты) {
    const ч = частиПоОстановкам(а.текст);
    const т = разборАята(а.текст);
    let ждём = 1;
    for (const п of ч) {
      assert.equal(п.словоС, ждём);
      assert.ok(п.слов >= 1);
      ждём += п.слов;
      const слова = т.slice(п.токенС, п.токенПо + 1).filter((х) => х.вид === 'слово');
      assert.equal(слова.length, п.слов, `${а.сура}:${а.аят} часть ${п.номер}`);
      if (п.знакВКонце) assert.ok(ОСТАНОВКИ_ДЛЯ_ЧАСТЕЙ.has(п.знакВКонце));
    }
    assert.equal(ждём - 1, числоСлов(а.текст));
    for (const о of остановкиАята(а.текст)) assert.ok(!['ля', 'муанака', 'сакта'].includes(о.знак));
    частей += ч.length;
  }
  assert.ok(частей > 6236);
  // 2:282 — самый длинный аят: несколько частей
  assert.ok(частиПоОстановкам(аят(2, 282)).length > 5);
});

// ───────────────────────── loader.ts ─────────────────────────
console.log('loader.ts — загрузка, кэш, сверка');
function сеть(подмены = {}) {
  const журнал = [];
  const состояние = { офлайн: false, статус: null };
  const получить = async (адрес) => {
    журнал.push(адрес);
    if (состояние.офлайн) throw new TypeError('Failed to fetch');
    if (состояние.статус) return { ok: false, status: состояние.статус, text: async () => '' };
    const отн = адрес.replace(/^\/aiustaz\//, '');
    if (подмены[отн] !== undefined) return { ok: true, status: 200, text: async () => подмены[отн] };
    const п = path.join(корень, 'public', отн);
    if (!fs.existsSync(п)) return { ok: false, status: 404, text: async () => 'нет' };
    return { ok: true, status: 200, text: async () => fs.readFileSync(п, 'utf8') };
  };
  return { журнал, состояние, получить };
}
await тест('индекс и сура 2: адрес /aiustaz/quran/…, 286 аятов с номером суры; второй раз — из кэша', async () => {
  const с = сеть();
  const з = создатьЗагрузчик({ база: '/aiustaz/', манифест: М, получить: с.получить, sha256 });
  const р = await з.загрузитьСуру(2);
  assert.equal(р.ок, true);
  assert.equal(р.данные.аяты.length, 286);
  assert.deepEqual(р.данные.аяты[254], { сура: 2, аят: 255, текст: аят(2, 255) });
  assert.equal(р.данные.имя, 'البقرة');
  assert.deepEqual(с.журнал, ['/aiustaz/' + М.индекс, '/aiustaz/' + индекс.суры[1].файл]);
  await з.загрузитьСуру(2);
  await з.загрузитьИндексСур();
  assert.equal(с.журнал.length, 2, 'повторно в сеть не ходит');
  assert.equal(з.сураИзКэша(2).аяты.length, 286);
  assert.equal(з.сураИзКэша(3), null);
  assert.equal(з.индексИзКэша().суры.length, 114);
  assert.equal(з.адрес('quran/x.json'), '/aiustaz/quran/x.json');
});
await тест('все 114 сур загружаются и проходят сверку: 6236 аятов, текст = файлу', async () => {
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: М, получить: сеть().получить, sha256 });
  let аятов = 0;
  for (let н = 1; н <= 114; н++) {
    const р = await з.загрузитьСуру(н);
    assert.equal(р.ок, true, 'сура ' + н);
    аятов += р.данные.аяты.length;
    assert.equal(р.данные.бисмилла, суры[н - 1].данные.бисмилла);
  }
  assert.equal(аятов, 6236);
});
await тест('нет сети → «нет-связи», не кэшируется; сеть вернулась → «Повторить» загружает', async () => {
  const с = сеть();
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: М, получить: с.получить, sha256 });
  с.состояние.офлайн = true;
  const р1 = await з.загрузитьСуру(1);
  assert.deepEqual(р1, { ок: false, причина: 'нет-связи' });
  assert.equal(нетСвязи(р1.причина), true);
  с.состояние.офлайн = false;
  const р2 = await з.загрузитьСуру(1);
  assert.equal(р2.ок, true);
  assert.equal(р2.данные.аяты.length, 7);
});
await тест('503 → «сбой-сервера» (как нет связи); 404 → «нет-файла»; номер 0 и 115 — без запроса', async () => {
  const с = сеть();
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: М, получить: с.получить, sha256 });
  с.состояние.статус = 503;
  assert.deepEqual(await з.загрузитьИндексСур(), { ок: false, причина: 'сбой-сервера' });
  с.состояние.статус = 404;
  assert.deepEqual(await з.загрузитьИндексСур(), { ок: false, причина: 'нет-файла' });
  assert.equal(нетСвязи('нет-файла'), false);
  const до = с.журнал.length;
  assert.deepEqual(await з.загрузитьСуру(0), { ок: false, причина: 'нет-файла' });
  assert.deepEqual(await з.загрузитьСуру(115), { ок: false, причина: 'нет-файла' });
  assert.equal(с.журнал.length, до);
});
await тест('подмена одного символа в аяте → «не-прошло-сверку», текст не отдаётся', async () => {
  const запись = индекс.суры[1];
  const а = аят(2, 255);
  const испорченный = прочитать(запись.файл).replace(а, а.slice(0, 3) + '\u0640' + а.slice(3)); // лишний татвиль
  assert.notEqual(испорченный, прочитать(запись.файл));
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: М, получить: сеть({ [запись.файл]: испорченный }).получить, sha256 });
  assert.deepEqual(await з.загрузитьСуру(2), { ок: false, причина: 'не-прошло-сверку' });
  assert.equal(з.сураИзКэша(2), null);
  assert.equal((await з.загрузитьСуру(1)).ок, true, 'другие суры грузятся');
});
await тест('подмена индекса → ни одна сура не загружается', async () => {
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: М, получить: сеть({ [М.индекс]: индексТекст.replace('"аятов":7', '"аятов":8') }).получить, sha256 });
  assert.deepEqual(await з.загрузитьСуру(1), { ок: false, причина: 'не-прошло-сверку' });
});
await тест('BATR отдаёт свой index.html (200) вместо файла → «не-прошло-сверку»', async () => {
  const з = создатьЗагрузчик({ база: '/aiustaz', манифест: М, получить: сеть({ [индекс.суры[0].файл]: '<!doctype html><html></html>' }).получить, sha256 });
  assert.deepEqual(await з.загрузитьСуру(1), { ок: false, причина: 'не-прошло-сверку' });
});
await тест('проверитьСуру: номер, имя, число и номера аятов, бисмилла, перевод строки — иначе null', () => {
  const з = индекс.суры[1];
  const д = суры[1].данные;
  const копия = () => JSON.parse(JSON.stringify(д));
  assert.ok(проверитьСуру(копия(), з, М));
  const плохие = [
    (х) => (х.сура = 3),
    (х) => (х.имя = 'سورة'),
    (х) => х.аяты.pop(),
    (х) => ([х.аяты[0], х.аяты[1]] = [х.аяты[1], х.аяты[0]]),
    (х) => (х.бисмилла = null),
    (х) => (х.аяты[5].текст = х.аяты[5].текст + '\n'),
    (х) => (х.аяты[5].текст = ''),
    (х) => (х.источник = 'другое'),
    (х) => (х.копия = 'фонетика'),
    (х) => (х.sha256Источника = '0'.repeat(64)),
    (х) => delete х.копирайт,
  ];
  for (const испортить of плохие) {
    const х = копия();
    испортить(х);
    assert.equal(проверитьСуру(х, з, М), null, испортить.toString());
  }
  const ф = JSON.parse(JSON.stringify(суры[0].данные));
  ф.бисмилла = 'بِسْمِ';
  assert.equal(проверитьСуру(ф, индекс.суры[0], М), null, 'у суры 1 бисмиллы-атрибута нет');
});
await тест('проверитьИндекс: 114 записей подряд, сумма аятов, имя файла = номер и начало sha256', () => {
  assert.ok(проверитьИндекс(JSON.parse(индексТекст), М));
  const плохие = [
    (х) => х.суры.pop(),
    (х) => (х.суры[3].сура = 5),
    (х) => (х.суры[3].аятов += 1),
    (х) => (х.суры[3].файл = х.суры[3].файл.replace('004.', '005.')),
    (х) => (х.суры[3].sha256 = 'f'.repeat(64)),
    (х) => (х.суры[3].транслит = null),
    (х) => (х.sha256Источника = '0'.repeat(64)),
  ];
  for (const испортить of плохие) {
    const х = JSON.parse(индексТекст);
    испортить(х);
    assert.equal(проверитьИндекс(х, М), null, испортить.toString());
  }
});

// ───────────────────────── HTTP (dist + тестовый сервер как на batr.kz) ─────────────────────────
if (fs.existsSync(path.join(корень, 'dist', 'quran')) && fs.existsSync(path.join(корень, 'dist', 'index.html'))) {
  console.log('HTTP — dist через тестовый сервер (как batr.kz)');
  const { запуститьСервер } = await import('./serve-test.mjs');
  const сервер = await запуститьСервер({ порт: 0 });
  try {
    await тест('настоящий fetch: индекс (application/json) и сура 114 грузятся с /aiustaz/quran/…; пропавший файл — сверка не пройдена', async () => {
      const ответ = await fetch(`${сервер.адрес}/aiustaz/${М.индекс}`);
      assert.equal(ответ.status, 200);
      assert.match(ответ.headers.get('content-type') ?? '', /application\/json/);
      const з = создатьЗагрузчик({ база: `${сервер.адрес}/aiustaz`, манифест: М, получить: (а) => fetch(а), sha256 });
      const р = await з.загрузитьСуру(114);
      assert.equal(р.ок, true);
      assert.equal(р.данные.аяты.length, 6);
      const чужой = { ...М, индекс: 'quran/index.00000000000000000000.json' };
      const з2 = создатьЗагрузчик({ база: `${сервер.адрес}/aiustaz`, манифест: чужой, получить: (а) => fetch(а), sha256 });
      const р2 = await з2.загрузитьИндексСур();
      assert.equal(р2.ок, false);
      assert.equal(р2.причина, 'не-прошло-сверку');
    });
  } finally {
    await сервер.закрыть();
  }
} else {
  console.log('HTTP — пропуск (нет dist: npm run build:web)');
}

// ───────────────────────── Шрифт Amiri Quran ─────────────────────────
console.log('Шрифт Amiri Quran');
function символыCmap(байты) {
  const д = new DataView(байты.buffer, байты.byteOffset, байты.byteLength);
  const таблиц = д.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < таблиц; i++) {
    const тег = String.fromCharCode(...байты.subarray(12 + 16 * i, 16 + 16 * i));
    if (тег === 'cmap') cmap = д.getUint32(12 + 16 * i + 8);
  }
  assert.ok(cmap > 0, 'нет таблицы cmap');
  const набор = new Set();
  for (let i = 0; i < д.getUint16(cmap + 2); i++) {
    const с = cmap + д.getUint32(cmap + 4 + 8 * i + 4);
    const формат = д.getUint16(с);
    if (формат === 4) {
      const сегх2 = д.getUint16(с + 6);
      const сег = сегх2 / 2;
      const концы = с + 14, начала = с + 16 + сегх2, дельты = с + 16 + 2 * сегх2, смещения = с + 16 + 3 * сегх2;
      for (let к = 0; к < сег; к++) {
        const нач = д.getUint16(начала + 2 * к), кон = д.getUint16(концы + 2 * к);
        const дельта = д.getInt16(дельты + 2 * к), см = д.getUint16(смещения + 2 * к);
        for (let код = нач; код <= кон && код !== 0xffff; код++) {
          let глиф;
          if (см === 0) глиф = (код + дельта) & 0xffff;
          else {
            глиф = д.getUint16(смещения + 2 * к + см + 2 * (код - нач));
            if (глиф) глиф = (глиф + дельта) & 0xffff;
          }
          if (глиф) набор.add(код);
        }
      }
    } else if (формат === 12) {
      const групп = д.getUint32(с + 12);
      for (let к = 0; к < групп; к++) {
        const нач = д.getUint32(с + 16 + 12 * к), кон = д.getUint32(с + 20 + 12 * к);
        for (let код = нач; код <= кон; код++) набор.add(код);
      }
    }
  }
  return набор;
}
const путьШрифта = path.join(корень, 'node_modules', '@expo-google-fonts', 'amiri-quran', '400Regular', 'AmiriQuran_400Regular.ttf');
await тест('Amiri Quran рисует каждый символ текста Корана, бисмиллы и имён сур (в т.ч. ۖ ۗ ۚ ۛ ۘ ۙ ۜ ۞ ۩), ٠–٩ и ۝', () => {
  const есть = символыCmap(fs.readFileSync(путьШрифта));
  const нужно = new Set();
  for (const { данные } of суры) {
    for (const с of данные.имя + (данные.бисмилла ?? '')) нужно.add(с.codePointAt(0));
    for (const а of данные.аяты) for (const с of а.текст) нужно.add(с.codePointAt(0));
  }
  for (const с of '٠١٢٣٤٥٦٧٨٩۝ۖۗۚۛۘۙۜ۞۩') нужно.add(с.codePointAt(0));
  const нет = [...нужно].filter((к) => !есть.has(к)).map((к) => 'U+' + к.toString(16).toUpperCase().padStart(4, '0'));
  assert.deepEqual(нет, [], 'нет глифов: ' + нет.join(' '));
  assert.ok(нужно.size >= 80, 'символов: ' + нужно.size);
});

console.log(`\nOK: ${проверок} проверок`);
