#!/usr/bin/env node
/**
 * Тест времени намаза (без браузера и без сети): node scripts/test-prayer.mjs  (npm run test:prayer)
 *   prayer/times.ts  — сверка с фикстурой Python-эталона (scripts/fixtures/prayer-reference.json, создаёт
 *                      tools/prayer/make_fixture.py из ours() в tools/prayer/compare_dumk.py): 5 мест × 12 дней
 *                      × 6 времён, расхождений 0. Так JS (adhan-js) и Python (adhanpy) сверены между собой,
 *                      а Python сверен с таблицами ДУМК (исследование 13). Таблиц ДУМК здесь нет и не будет.
 *                    — результат не зависит от часового пояса телефона (дочерние процессы с TZ=…);
 *                    — поправки ±3/±5 по широте 48°; у всех 168 мест времена по порядку и ровно на минуте.
 *   prayer/day.ts    — день и время по UTC+5, состояние дня (до таң, таң–восход, восход–бесін, после құптан),
 *                      обратный отсчёт (вверх до минуты), «урок после намаза» (окно 40 мин, не восход), подписи.
 *   prayer/places.ts — список мест (168, id уникальны, Астана по умолчанию совпадает), поиск kk/ru/латиница,
 *                      ближайшее место, своя точка (≈ 1 км), оговорка точности, проверка сохранённого.
 *   Мир (владелец 20.11.2026: «Мы мировое приложение»):
 *   prayer/methods.ts — метод по стране, подпись метода; сверка с опубликованными таблицами (fixtures/prayer-official.json:
 *                      Узбекистан — Ташкент, Самарканд, Нукус; Мекка — Умм аль-Кура; Стамбул — Диянет; Каир; Куала-Лумпур —
 *                      JAKIM) — расхождения печатаются, допуск — у набора;
 *   prayer/day.ts    — день и время в поясе места (Стамбул, Нью-Йорк с переходом на летнее время, Etc/GMT-5);
 *   места Узбекистана — places-uz.json (176, все центры вилоятов, ru и uz, в границах);
 *   prayer/world.ts  — свёртка = Python (ключи шардов совпадают на всех ~34 тыс. мест), поиск по миру (Самарканд,
 *                      Samarqand, Стамбул, Istanbul, Мекка), ближайшее по плиткам (Ташкент → Ташкент и метод УМУз,
 *                      Стамбул → Стамбул и Диянет), склонение по сетке ≈ точному.
 *   Официальное время КЗ/УЗ (владелец 20.11.2026: «бери из официальных источников… один в один»):
 *   prayer/official.ts — пункт для места (id, своя точка ≤ 25 км → id ближайшего, координат нет), разбор и проверка
 *                      ответа сервера, подпись «По данным …»; fixtures/prayer-official-tables.json (16 городов КЗ — таблицы
 *                      ДУМК, принятые server/prayer.py; 14 центров вилоятов УЗ — правило УМУз в точке региона):
 *                      показываемое время = таблица во все дни года (0 мин), сколько расходится свой расчёт — печатается.
 * Модули — TypeScript; свои импорты — с расширением .ts (node ≥ 22.18 снимает типы сам).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { временаДня, поправкиДУМК, КЛЮЧИ_ВРЕМЁН } = await import('../src/prayer/times.ts');
const day = await import('../src/prayer/day.ts');
const places = await import('../src/prayer/places.ts');

const ФИКСТУРА = JSON.parse(fs.readFileSync(path.join(корень, 'scripts', 'fixtures', 'prayer-reference.json'), 'utf8'));
const ДАННЫЕ_МЕСТ = JSON.parse(fs.readFileSync(path.join(корень, 'src', 'prayer', 'places-kz.json'), 'utf8'));
const ДАННЫЕ_УЗ = JSON.parse(fs.readFileSync(path.join(корень, 'src', 'prayer', 'places-uz.json'), 'utf8'));
const methods = await import('../src/prayer/methods.ts');
const world = await import('../src/prayer/world.ts');
const ОФИЦИАЛЬНЫЕ = JSON.parse(fs.readFileSync(path.join(корень, 'scripts', 'fixtures', 'prayer-official.json'), 'utf8'));

// Дочерний режим: напечатать расчёт фикстуры как JSON (для проверки часовых поясов).
if (process.argv[2] === '--вывод') {
  const итог = {};
  for (const [id, [ш, д]] of Object.entries(ФИКСТУРА.места)) {
    for (const день of ФИКСТУРА.дни) итог[id + ' ' + день] = временаДня({ широта: ш, долгота: д }, день);
  }
  process.stdout.write(JSON.stringify(итог));
  process.exit(0);
}

let проверок = 0;
function тест(имя, ф) {
  ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}
const М = 60_000;
/** Момент UTC для «ЧЧ:ММ» дня РК. */
const вРК = (день, чм) => Date.parse(`${день}T${чм}:00+05:00`);

console.log('times — сверка с Python-эталоном');
тест('фикстура: 5 мест × 12 дней × 6 времён — JS = Python, расхождений 0', () => {
  const расхождения = [];
  let значений = 0;
  for (const [id, [ш, д]] of Object.entries(ФИКСТУРА.места)) {
    for (const день of ФИКСТУРА.дни) {
      const в = временаДня({ широта: ш, долгота: д }, день);
      for (const к of КЛЮЧИ_ВРЕМЁН) {
        значений += 1;
        const js = day.чч_мм(в[к]);
        const py = ФИКСТУРА.времена[id][день][к];
        if (js !== py) расхождения.push(`${id} ${день} ${к}: JS ${js}, Python ${py}`);
      }
    }
  }
  assert.equal(значений, 360);
  assert.deepEqual(расхождения, []);
});
тест('точки фикстуры = точки этих мест в places-kz.json', () => {
  const список = places.разобратьМеста(ДАННЫЕ_МЕСТ);
  for (const [id, [ш, д]] of Object.entries(ФИКСТУРА.места)) {
    const м = список.find((х) => х.id === id);
    assert.ok(м, id);
    assert.deepEqual([м.широта, м.долгота], [ш, д], id);
  }
});
тест('часовой пояс телефона не влияет (7 поясов, в т. ч. UTC−11 и UTC+14)', () => {
  const скрипт = fileURLToPath(import.meta.url);
  const выводы = ['UTC', 'Asia/Almaty', 'Europe/Moscow', 'America/New_York', 'Pacific/Pago_Pago', 'Pacific/Kiritimati', 'Asia/Tokyo'].map((tz) =>
    execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', скрипт, '--вывод'], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }),
  );
  for (const в of выводы) assert.equal(в, выводы[0]);
});
тест('поправки ДУМК: южнее 48° — −3/+3, на 48° и севернее — −5/+5; таң и құптан без поправок', () => {
  assert.deepEqual(поправкиДУМК(47.99), { fajr: 0, sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3, isha: 0 });
  assert.deepEqual(поправкиДУМК(48), { fajr: 0, sunrise: -5, dhuhr: 5, asr: 5, maghrib: 5, isha: 0 });
});
тест('все 168 мест × 4 дня: шесть времён по порядку, ровно на минуте, в сутках РК', () => {
  const список = places.разобратьМеста(ДАННЫЕ_МЕСТ);
  for (const м of список) {
    for (const день of ['2026-03-20', '2026-06-21', '2026-09-23', '2026-12-21']) {
      const в = временаДня(м, день);
      for (const к of КЛЮЧИ_ВРЕМЁН) {
        assert.equal(в[к] % М, 0, `${м.id} ${день} ${к}: не на минуте`);
        assert.equal(day.деньРК(в[к]), день, `${м.id} ${день} ${к}: другой день`);
      }
      for (let i = 1; i < КЛЮЧИ_ВРЕМЁН.length; i++) assert.ok(в[КЛЮЧИ_ВРЕМЁН[i - 1]] < в[КЛЮЧИ_ВРЕМЁН[i]], `${м.id} ${день}: порядок`);
    }
  }
});
тест('неверный день — ошибка', () => {
  assert.throws(() => временаДня({ широта: 51.18, долгота: 71.45 }, '2026-1-1'));
});

console.log('day — сутки РК, состояние, отсчёт');
тест('деньРК и чч_мм — по UTC+5, полночь РК = 19:00 UTC', () => {
  assert.equal(day.деньРК(Date.parse('2026-11-18T18:59:59.999Z')), '2026-11-18');
  assert.equal(day.деньРК(Date.parse('2026-11-18T19:00:00Z')), '2026-11-19');
  assert.equal(day.чч_мм(Date.parse('2026-11-19T00:59:00Z')), '05:59');
  assert.equal(day.чч_мм(Date.parse('2026-11-18T19:00:00Z')), '00:00');
});
тест('сдвигДня: через месяц, год, 29 февраля', () => {
  assert.equal(day.сдвигДня('2026-01-31', 1), '2026-02-01');
  assert.equal(day.сдвигДня('2026-12-31', 1), '2027-01-01');
  assert.equal(day.сдвигДня('2028-02-28', 1), '2028-02-29');
  assert.equal(day.сдвигДня('2026-03-01', -1), '2026-02-28');
});
тест('поясНеРК: только смещение −300 мин — Казахстан', () => {
  assert.equal(day.поясНеРК(-300), false);
  assert.equal(day.поясНеРК(-180), true);
  assert.equal(day.поясНеРК(0), true);
});

const астана = ФИКСТУРА.места.astana;
const сегодня = временаДня({ широта: астана[0], долгота: астана[1] }, '2026-11-19');
const завтра = временаДня({ широта: астана[0], долгота: астана[1] }, '2026-11-20');
тест('состояние: до таң — следующий таң, текущего блока нет, фаза — құптан', () => {
  const с = day.состояниеДня(вРК('2026-11-19', '03:00'), сегодня, завтра);
  assert.equal(с.завтра, false);
  assert.equal(с.следующий.ключ, 'fajr');
  assert.equal(с.текущий, null);
  assert.equal(с.фаза, 'isha');
  assert.equal(с.виды.fajr, 'следующий');
  assert.equal(с.виды.isha, 'впереди');
});
тест('состояние: таң…восход — текущий таң, следующий бесін, есть момент восхода; восход не «следующий»', () => {
  const с = day.состояниеДня(сегодня.fajr + 10 * М, сегодня, завтра);
  assert.equal(с.текущий, 'fajr');
  assert.equal(с.следующий.ключ, 'dhuhr');
  assert.equal(с.восход, сегодня.sunrise);
  assert.equal(с.виды.sunrise, 'впереди');
  assert.equal(с.виды.fajr, 'сейчас');
});
тест('состояние: восход…бесін — текущего нет (восход не намаз), фаза — восход', () => {
  const с = day.состояниеДня(сегодня.sunrise + М, сегодня, завтра);
  assert.equal(с.текущий, null);
  assert.equal(с.фаза, 'sunrise');
  assert.equal(с.восход, null);
  assert.equal(с.виды.sunrise, 'прошёл');
  assert.equal(с.виды.dhuhr, 'следующий');
});
тест('состояние: ровно в начале бесін — текущий бесін, следующий екінті', () => {
  const с = day.состояниеДня(сегодня.dhuhr, сегодня, завтра);
  assert.equal(с.текущий, 'dhuhr');
  assert.equal(с.следующий.ключ, 'asr');
  assert.equal(с.виды.fajr, 'прошёл');
});
тест('состояние: после начала құптан — сетка завтрашняя, следующий — завтрашний таң', () => {
  const с = day.состояниеДня(сегодня.isha + М, сегодня, завтра);
  assert.equal(с.завтра, true);
  assert.equal(с.сетка.день, '2026-11-20');
  assert.equal(с.следующий.ключ, 'fajr');
  assert.equal(с.следующий.момент, завтра.fajr);
  assert.equal(с.следующий.завтра, true);
  assert.equal(Object.values(с.виды).filter((в) => в === 'следующий').length, 1);
});
тест('ровно один «следующий» в каждую минуту суток, и это не восход', () => {
  for (let т = вРК('2026-11-19', '00:00'); т < вРК('2026-11-20', '00:00'); т += М) {
    const с = day.состояниеДня(т, сегодня, завтра);
    const следующие = Object.entries(с.виды).filter(([, в]) => в === 'следующий').map(([к]) => к);
    assert.deepEqual(следующие, [с.следующий.ключ]);
    assert.notEqual(с.следующий.ключ, 'sunrise');
    assert.ok(с.следующий.момент > т);
  }
});
тест('обратный отсчёт: вверх до минуты, ведущий ноль при часах; kk', () => {
  assert.equal(day.обратныйОтсчёт(1, 'ru'), 'через 1 мин');
  assert.equal(day.обратныйОтсчёт(М, 'ru'), 'через 1 мин');
  assert.equal(day.обратныйОтсчёт(М + 1, 'ru'), 'через 2 мин');
  assert.equal(day.обратныйОтсчёт(38 * М, 'ru'), 'через 38 мин');
  assert.equal(day.обратныйОтсчёт(72 * М, 'ru'), 'через 1 ч 12 мин');
  assert.equal(day.обратныйОтсчёт(65 * М, 'ru'), 'через 1 ч 05 мин');
  assert.equal(day.обратныйОтсчёт(65 * М, 'kk'), '1 сағ 05 мин қалды');
  assert.equal(day.обратныйОтсчёт(38 * М, 'kk'), '38 мин қалды');
});
тест('обратный отсчёт полностью (для диктора): склонения', () => {
  assert.equal(day.обратныйОтсчётПолностью(72 * М, 'ru'), 'через 1 час 12 минут');
  assert.equal(day.обратныйОтсчётПолностью(21 * М, 'ru'), 'через 21 минуту');
  assert.equal(day.обратныйОтсчётПолностью(2 * 60 * М + 3 * М, 'ru'), 'через 2 часа 3 минуты');
  assert.equal(day.обратныйОтсчётПолностью(5 * 60 * М, 'ru'), 'через 5 часов');
  assert.equal(day.обратныйОтсчётПолностью(11 * М, 'ru'), 'через 11 минут');
  assert.equal(day.обратныйОтсчётПолностью(65 * М, 'kk'), '1 сағат 5 минут қалды');
});
тест('урок после намаза: окно 10–40 мин от начала намаза (не в первые минуты); восход — нет; до таң — нет', () => {
  assert.equal(day.приглашениеПослеНамаза(сегодня.dhuhr, сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(сегодня.dhuhr + 9 * М, сегодня), null);
  assert.deepEqual(day.приглашениеПослеНамаза(сегодня.dhuhr + 10 * М, сегодня), { ключ: 'dhuhr', начало: сегодня.dhuhr, прошлоМин: 10 });
  assert.equal(day.приглашениеПослеНамаза(сегодня.dhuhr + 40 * М, сегодня)?.ключ, 'dhuhr');
  assert.equal(day.приглашениеПослеНамаза(сегодня.dhuhr + 41 * М, сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(сегодня.dhuhr - М, сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(сегодня.fajr, сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(сегодня.sunrise + 15 * М, сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(вРК('2026-11-19', '03:00'), сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(сегодня.isha + 5 * М, сегодня), null);
  assert.equal(day.приглашениеПослеНамаза(сегодня.isha + 15 * М, сегодня)?.ключ, 'isha');
  assert.equal(day.приглашениеПослеНамаза(сегодня.fajr + 20 * М, сегодня)?.ключ, 'fajr');
});
тест('после начала құптан: сегодняшнее начало құптан для строки «Сейчас — Иша»; днём — нет', () => {
  assert.equal(day.состояниеДня(сегодня.isha + 5 * М, сегодня, завтра).иша, сегодня.isha);
  assert.equal(day.состояниеДня(сегодня.asr + 5 * М, сегодня, завтра).иша, null);
});
тест('час по UTC+5 (не по поясу телефона)', () => {
  assert.equal(day.часРК(вРК('2026-11-19', '00:30')), 0);
  assert.equal(day.часРК(вРК('2026-11-19', '18:05')), 18);
  assert.equal(day.часРК(вРК('2026-11-19', '23:59')), 23);
});
тест('подписи дня: сегодня/завтра/дата, ru и kk; короткая — день недели и дд.мм', () => {
  assert.equal(day.подписьДня('2026-11-19', 'ru', '2026-11-19'), 'Сегодня, 19 ноября');
  assert.equal(day.подписьДня('2026-11-20', 'ru', '2026-11-19'), 'Завтра, 20 ноября');
  assert.equal(day.подписьДня('2026-11-21', 'ru', '2026-11-19'), '21 ноября');
  assert.equal(day.подписьДня('2026-11-19', 'kk', '2026-11-19'), 'Бүгін, 19 қараша');
  assert.equal(day.подписьДня('2027-01-01', 'kk', '2026-12-31'), 'Ертең, 1 қаңтар');
  assert.equal(day.датаДня('2026-11-20', 'ru'), '20 ноября');
  assert.equal(day.датаДня('2027-01-01', 'kk'), '1 қаңтар');
  assert.deepEqual(day.короткийДень('2026-11-20', 'ru'), { деньНедели: 'пт', число: '20', дата: '20.11' });
  assert.deepEqual(day.короткийДень('2026-12-01', 'kk'), { деньНедели: 'сс', число: '1', дата: '01.12' });
  assert.equal(day.короткийДень('2026-11-21', 'kk').деньНедели, 'сб');
});
тест('названия: шесть блоков; kk как у ДУМК (Күн шығуы), восход — не намаз; арабские не пустые', () => {
  assert.deepEqual(КЛЮЧИ_ВРЕМЁН.map((к) => day.НАЗВАНИЯ[к].kk), ['Таң', 'Күн шығуы', 'Бесін', 'Екінті', 'Ақшам', 'Құптан']);
  assert.deepEqual(КЛЮЧИ_ВРЕМЁН.map((к) => day.НАЗВАНИЯ[к].ru), ['Фаджр', 'Восход', 'Зухр', 'Аср', 'Магриб', 'Иша']);
  assert.equal(day.ЭТО_НАМАЗ.sunrise, false);
  for (const к of КЛЮЧИ_ВРЕМЁН) assert.match(day.НАЗВАНИЯ[к].ar, /^[؀-ۿ]+$/);
});

console.log('places — список, поиск, ближайшее');
const список = places.разобратьМеста(ДАННЫЕ_МЕСТ);
тест('168 мест, id уникальны, все в РК, склонение 4–14°', () => {
  assert.equal(список.length, 168);
  assert.equal(new Set(список.map((м) => м.id)).size, 168);
  for (const м of список) {
    assert.ok(places.этоМесто(м), м.id);
    assert.ok(м.склонение >= 4 && м.склонение <= 14, м.id);
    assert.ok(м.область, м.id);
  }
});
тест('Астана по умолчанию = запись списка (без загрузки списка)', () => {
  assert.equal(ДАННЫЕ_МЕСТ.поУмолчанию, places.МЕСТО_ПО_УМОЛЧАНИЮ.id);
  const а = список.find((м) => м.id === 'astana');
  assert.deepEqual(а, places.МЕСТО_ПО_УМОЛЧАНИЮ);
});
тест('в данных нет внешних адресов и таблиц ДУМК (только места)', () => {
  const текст = JSON.stringify(ДАННЫЕ_МЕСТ);
  assert.doesNotMatch(текст, /https?:\/\//);
  assert.doesNotMatch(текст, /fajr|isha|imsak|Таң \d/);
});
тест('поиск: начало названия, kk/ru без учёта казахских букв, латиница', () => {
  const ид = (з, я = 'ru') => places.найтиМеста(список, з, я).map((м) => м.id);
  assert.equal(ид('алм')[0], 'almaty');
  assert.equal(ид('караганда')[0], 'karaganda');
  assert.equal(ид('Қарағанды', 'kk')[0], 'karaganda');
  assert.equal(ид('Караганды', 'kk')[0], 'karaganda');
  assert.equal(ид('орал')[0], 'uralsk');
  assert.equal(ид('петропавл')[0], 'petropavlovsk');
  assert.equal(ид('усть')[0], 'ust-kamenogorsk');
  assert.equal(ид('өскемен', 'kk')[0], 'ust-kamenogorsk');
  assert.equal(ид('almaty')[0], 'almaty');
  assert.deepEqual(ид('   '), []);
  assert.deepEqual(ид('xyzq'), []);
  assert.ok(places.найтиМеста(список, 'а', 'ru', 5).length === 5);
});
тест('ближайшее место и расстояние', () => {
  const к = places.ближайшееМесто(список, { широта: 50.97, долгота: 71.35 });
  assert.equal(к.место.id, 'kosshy');
  assert.ok(к.км < 2);
  const а = places.ближайшееМесто(список, { широта: 43.238, долгота: 76.945 });
  assert.equal(а.место.id, 'almaty');
  const км = places.расстояниеКм({ широта: 51.1801, долгота: 71.44598 }, { широта: 43.25249, долгота: 76.9115 });
  assert.ok(км > 960 && км < 980, String(км));
});
тест('вКазахстане (для оговорок): Москва, Стамбул — нет; в РК — да', () => {
  const проверить = (ш, д) => places.вКазахстане({ широта: ш, долгота: д }, places.ближайшееМесто(список, { широта: ш, долгота: д }).км);
  assert.equal(проверить(55.75, 37.62), false);
  assert.equal(проверить(41.01, 28.97), false);
  assert.equal(проверить(51.13, 71.43), true);
  assert.equal(проверить(49.95, 82.6), true);
});
тест('своя точка: координаты ≈ 1 км, подпись «≈ город», склонение ближайшего', () => {
  const б = places.ближайшееМесто(список, { широта: 51.23456, долгота: 71.98765 });
  const т = places.своёМесто({ широта: 51.23456, долгота: 71.98765 }, б);
  assert.equal(т.вид, 'точка');
  assert.equal(т.широта, 51.23);
  assert.equal(т.долгота, 71.99);
  assert.equal(т.ru, '≈ ' + б.место.ru);
  assert.equal(т.склонение, б.место.склонение);
  assert.ok(places.этоМесто(т));
});
тест('оговорка точности: по умолчанию нет нигде (Кызылорда сверена); включается списком областей', () => {
  const кз = список.find((м) => м.id === 'kyzylorda');
  assert.equal(places.оговоркаТочности(кз), null);
  assert.equal(places.оговоркаТочности(кз, ['Кызылординская область']), 'до3мин');
  assert.equal(places.оговоркаТочности(places.МЕСТО_ПО_УМОЛЧАНИЮ, ['Кызылординская область']), null);
});
тест('сохранённое место: мусор отбрасывается; место любой страны — да; старое место РК без страны — да', () => {
  assert.equal(places.этоМесто(null), false);
  assert.equal(places.этоМесто({ id: 'x' }), false);
  assert.equal(places.этоМесто({ ...places.МЕСТО_ПО_УМОЛЧАНИЮ, широта: 'a' }), false);
  assert.equal(places.этоМесто({ ...places.МЕСТО_ПО_УМОЛЧАНИЮ, широта: 21.42, долгота: 39.83, страна: 'SA', пояс: 'Asia/Riyadh' }), true);
  assert.equal(places.этоМесто({ ...places.МЕСТО_ПО_УМОЛЧАНИЮ, широта: 91 }), false);
  assert.equal(places.этоМесто({ ...places.МЕСТО_ПО_УМОЛЧАНИЮ, страна: 'Узбекистан' }), false);
  const { страна: _с, пояс: _п, ...старое } = places.МЕСТО_ПО_УМОЛЧАНИЮ;
  assert.equal(places.этоМесто(старое), true);
  assert.equal(places.этоМесто({ ...places.МЕСТО_ПО_УМОЛЧАНИЮ, вид: 'другое' }), false);
});

// ───────────────────────── мир (владелец 20.11.2026) ─────────────────────────
console.log('methods — метод по стране и подпись');
тест('метод по стране: KZ — ДУМК, UZ — УМУз, TR — Диянет, SA — Умм аль-Кура, нет в таблице — MWL', () => {
  assert.equal(methods.методСтраны('KZ').id, 'dumk');
  assert.equal(methods.методСтраны('UZ').id, 'umuz');
  assert.equal(methods.методСтраны('TR').id, 'diyanet');
  assert.equal(methods.методСтраны('SA').id, 'ummalqura');
  assert.equal(methods.методСтраны('MY').id, 'jakim');
  assert.equal(methods.методСтраны('FR').id, 'mwl');
  assert.equal(methods.методСтраны(undefined).id, 'mwl');
  for (const [страна, id] of Object.entries(methods.МЕТОД_СТРАНЫ)) assert.ok(methods.МЕТОДЫ[id], страна);
});
тест('KZ по умолчанию = прежний ДУМК: временаДня без опций = с { страна: KZ, мазхаб: hanafi }', () => {
  const а = временаДня({ широта: 43.25, долгота: 76.91 }, '2026-11-20');
  assert.deepEqual(временаДня({ широта: 43.25, долгота: 76.91 }, '2026-11-20', { страна: 'KZ', мазхаб: 'hanafi' }), а);
  const ш = временаДня({ широта: 43.25, долгота: 76.91 }, '2026-11-20', { страна: 'KZ', мазхаб: 'shafi' });
  assert.ok(ш.asr < а.asr, 'шафиитский аср раньше ханафитского');
  for (const к of ['fajr', 'sunrise', 'dhuhr', 'maghrib', 'isha']) assert.equal(ш[к], а[к], к);
});
тест('шафиитский аср (тень = предмет) раньше ханафитского (тень = 2 предмета) в Алматы на 25–80 мин, остальное то же', () => {
  // Владелец 28.11.2026: выбор асра — на первом экране; шафиитский — свой расчёт (adhan Madhab.Shafi, коэффициент тени 1).
  for (const день of ['2026-11-27', '2026-03-20', '2026-06-21']) {
    const х = временаДня({ широта: 43.25249, долгота: 76.9115 }, день, { страна: 'KZ', мазхаб: 'hanafi' });
    const ш = временаДня({ широта: 43.25249, долгота: 76.9115 }, день, { страна: 'KZ', мазхаб: 'shafi' });
    const разница = (х.asr - ш.asr) / 60_000;
    assert.ok(разница >= 25 && разница <= 80, `${день}: разница ${разница} мин`);
    assert.ok(ш.asr > х.dhuhr, `${день}: шафиитский аср после зухра`);
    if (день === '2026-11-27') console.log(`    Алматы ${день}: аср ханафитский ${day.чч_мм(х.asr, 'Asia/Almaty')}, шафиитский ${day.чч_мм(ш.asr, 'Asia/Almaty')}`);
  }
});
тест('подпись метода: ДУМК (±1 мин), УМУз (уточняется), стандарт MWL; аср — отдельной меткой', () => {
  const п = (с, я = 'ru') => methods.подписьМетода(methods.методСтраны(с), я);
  assert.equal(п('KZ'), 'Расчёт по методу ДУМК (±1 мин)');
  assert.equal(п('KZ', 'kk'), 'ҚМДБ әдісімен есептелді (±1 мин)');
  assert.equal(п('UZ'), 'Расчёт по методу Управления мусульман Узбекистана (уточняется)');
  assert.equal(п('KG'), 'Расчёт по стандарту Центральной Азии (15°/15°)');
  assert.equal(п('TR'), 'Расчёт по методу Диянет (Турция) (±1 мин)');
  assert.equal(п('FR'), 'Расчёт по методу Всемирной исламской лиги (MWL)');
  assert.equal(methods.подписьАсра('hanafi', 'ru'), 'аср: ханафитский');
  assert.equal(methods.подписьАсра('shafi', 'ru'), 'аср: шафиитский');
  assert.equal(methods.подписьАсра('shafi', 'kk'), 'екінті: шафиғи');
});
тест('сверка с опубликованными таблицами (UZ, SA, TR, EG, MY): в пределах допуска набора', () => {
  const расхождения = [];
  const худшее = {};
  for (const н of ОФИЦИАЛЬНЫЕ.наборы) {
    let макс = 0;
    let всего = 0;
    let точно = 0;
    for (const [день, ряд] of н.строки) {
      const в = временаДня({ широта: н.точка[0], долгота: н.точка[1] }, день, { страна: н.страна, мазхаб: н.мазхаб });
      for (const [к, чм] of Object.entries(ряд)) {
        const наше = day.чч_мм(в[к], н.пояс);
        const мин = (х) => Number(х.slice(0, 2)) * 60 + Number(х.slice(3));
        const р = мин(наше) - мин(чм);
        всего += 1;
        if (р === 0) точно += 1;
        макс = Math.max(макс, Math.abs(р));
        if (р !== 0) расхождения.push(`${н.id} ${день} ${к}: наше ${наше}, таблица ${чм} (${р > 0 ? '+' : ''}${р})`);
      }
    }
    худшее[н.id] = макс;
    console.log(`    ${н.id}: ${всего} значений, точно ${точно}, наибольшее расхождение ${макс} мин (допуск ${н.допуск})`);
  }
  for (const р of расхождения) console.log('      ' + р);
  for (const н of ОФИЦИАЛЬНЫЕ.наборы) assert.ok(худшее[н.id] <= н.допуск, `${н.id}: ${худшее[н.id]} мин > допуска ${н.допуск}`);
});
тест('полярные широты: нет восхода/заката — ошибка расчёта, а не неверное время (Тромсё, 21.12)', () => {
  assert.throws(() => временаДня({ широта: 69.65, долгота: 18.96 }, '2026-12-21', { страна: 'NO' }));
  const в = временаДня({ широта: 59.33, долгота: 18.06 }, '2026-06-21', { страна: 'SE' }); // Стокгольм летом — правило высоких широт
  for (let i = 1; i < КЛЮЧИ_ВРЕМЁН.length; i++) assert.ok(в[КЛЮЧИ_ВРЕМЁН[i - 1]] < в[КЛЮЧИ_ВРЕМЁН[i]]);
});

console.log('day — пояс места');
тест('Стамбул UTC+3, Нью-Йорк — летнее время (EDT −4 → EST −5 1.11.2026), Etc/GMT-5 = UTC+5', () => {
  const т = Date.parse('2026-11-01T05:30:00Z');
  assert.equal(day.чч_мм(т, 'Europe/Istanbul'), '08:30');
  assert.equal(day.смещениеПояса('America/New_York', Date.parse('2026-10-31T12:00:00Z')), -240);
  assert.equal(day.смещениеПояса('America/New_York', Date.parse('2026-11-02T12:00:00Z')), -300);
  assert.equal(day.деньРК(Date.parse('2026-11-01T03:30:00Z'), 'America/New_York'), '2026-10-31');
  assert.equal(day.смещениеПояса('Etc/GMT-5', т), 300);
  assert.equal(day.смещениеПояса('Asia/Kolkata', т), 330);
  assert.equal(day.чч_мм(т), day.чч_мм(т, 'Asia/Tashkent'));
  assert.equal(day.подписьСмещения(330), 'UTC+5:30');
  assert.equal(day.подписьСмещения(-240), 'UTC−4');
  assert.equal(day.подписьСмещения(0), 'UTC');
  assert.equal(day.поясОтличается('Europe/Istanbul', т, 180), false);
  assert.equal(day.поясОтличается('Europe/Istanbul', т, 300), true);
});

console.log('места Узбекистана');
const список_уз = places.разобратьМеста(ДАННЫЕ_УЗ);
тест('176 мест: id уникальны, в границах УЗ, ru и uz (оʻ/gʻ — U+02BB), страна UZ, пояс Asia/Tashkent', () => {
  assert.equal(список_уз.length, 176);
  assert.equal(new Set(список_уз.map((м) => м.id)).size, 176);
  for (const м of список_уз) {
    assert.ok(м.широта >= 37.1 && м.широта <= 45.6 && м.долгота >= 55.9 && м.долгота <= 73.2, м.id);
    assert.ok(м.ru && м.uz && м.kk, м.id);
    assert.doesNotMatch(м.uz, /['’‘`]/, м.id);
    assert.doesNotMatch(м.ru, /[A-Za-z]/, м.id);
    assert.equal(м.страна, 'UZ');
    assert.equal(м.пояс, 'Asia/Tashkent');
    assert.ok(м.склонение > 3 && м.склонение < 9, м.id);
    assert.ok(м.область?.uz, м.id);
  }
  const центры = список_уз.filter((м) => ['столица', 'центр вилоята'].includes(м.тип)).map((м) => м.uz).sort();
  assert.deepEqual(центры, ['Andijon', 'Buxoro', 'Fargʻona', 'Guliston', 'Jizzax', 'Namangan', 'Navoiy', 'Nukus', 'Nurafshon', 'Qarshi', 'Samarqand', 'Termiz', 'Toshkent', 'Urganch']);
});
тест('поиск по своим спискам: Самарканд = Samarqand = Samarkand; Ташкент, Toshkent; Бухара = Buxoro; Fargʻona', () => {
  const все = [...список, ...список_уз];
  const ид = (з, я = 'ru') => places.найтиМеста(все, з, я)[0]?.id;
  assert.equal(ид('Самарканд'), 'samarqand');
  assert.equal(ид('Samarqand'), 'samarqand');
  assert.equal(ид('samarkand'), 'samarqand');
  assert.equal(ид('Ташкент'), 'toshkent');
  assert.equal(ид('Toshkent'), 'toshkent');
  assert.equal(ид('Бухара'), 'buxoro');
  assert.equal(ид('Buxoro'), 'buxoro');
  assert.equal(ид('Fargʻona'), 'fargona');
  assert.equal(ид("farg'ona"), 'fargona');
  assert.equal(ид('Нукус', 'kk'), 'nukus');
  assert.equal(ид('Алматы'), 'almaty');
});
тест('геолокация в Ташкенте → Ташкент, метод УМУз; Шахимардан (эксклав) — пояс УЗ', () => {
  const все = [...список, ...список_уз];
  const б = places.ближайшееМесто(все, { широта: 41.30, долгота: 69.24 });
  assert.equal(б.место.id, 'toshkent');
  assert.ok(б.км < 10);
  assert.equal(methods.методСтраны(б.место.страна).id, 'umuz');
  const т = places.своёМесто({ широта: 41.3, долгота: 69.24 }, б);
  assert.equal(т.страна, 'UZ');
  assert.equal(т.пояс, 'Asia/Tashkent');
  assert.equal(список_уз.find((м) => м.uz === 'Shohimardon').пояс, 'Asia/Tashkent');
});

console.log('world — данные мира (public/prayer)');
const манифест = fs.readFileSync(path.join(корень, 'src', 'prayer', 'world.generated.ts'), 'utf8');
const файлМира = /мир: '([^']+)'/.exec(манифест)[1];
const индекс = world.разобратьИндекс(JSON.parse(fs.readFileSync(path.join(корень, 'public', файлМира), 'utf8')));
const кэшШардов = new Map();
const шард = (п) => {
  if (!индекс.шарды[п]) return null;
  if (!кэшШардов.has(п)) кэшШардов.set(п, world.разобратьШард(индекс, п, JSON.parse(fs.readFileSync(path.join(корень, 'public', 'prayer', индекс.шарды[п]), 'utf8'))));
  return кэшШардов.get(п);
};
function искать(запрос, предел = 20) {
  for (let i = 0; i < 4; i++) {
    const р = world.найтиВМире(индекс, запрос, шард, предел);
    if (!р.нужныШарды.length) return р.места;
    for (const п of р.нужныШарды) шард(п);
  }
  return world.найтиВМире(индекс, запрос, шард, предел).места;
}
тест('индекс: ≥ 30 тыс. мест, без KZ и UZ, шарды и плитки существуют, сумма файлов = манифест', () => {
  assert.ok(индекс.мест > 30000, String(индекс.мест));
  const коды = индекс.страны.map((с) => с[0]);
  assert.ok(!коды.includes('KZ') && !коды.includes('UZ'));
  for (const ф of [...Object.values(индекс.шарды).map((ф) => 'prayer/' + ф), ...Object.values(индекс.плитки).map((ф) => 'prayer/' + ф)])
    assert.ok(fs.existsSync(path.join(корень, 'public', ф)), ф);
  const байт = Number(/байт: (\d+)/.exec(манифест)[1]);
  let сумма = 0;
  const обход = (п) => {
    for (const з of fs.readdirSync(п, { withFileTypes: true })) з.isDirectory() ? обход(path.join(п, з.name)) : (сумма += fs.statSync(path.join(п, з.name)).size);
  };
  обход(path.join(корень, 'public', 'prayer'));
  assert.equal(сумма, байт);
  assert.ok(байт <= 3_000_000, String(байт));
});
тест('свёртка JS = Python: каждое место лежит в шарде по свёртке своего английского имени', () => {
  let мест = 0;
  for (const п of Object.keys(индекс.шарды)) {
    for (const м of шард(п).места) {
      if (!м) continue;
      мест += 1;
      assert.equal(world.префиксШарда(world.свернуть(м.en)), п, `${м.en} в шарде ${п}`);
    }
    for (const [ключ] of шард(п).ключи) assert.equal(world.префиксШарда(ключ), п, `ключ ${ключ} в шарде ${п}`);
  }
  assert.equal(мест, индекс.мест);
  assert.equal(world.свернуть('Самарканд'), world.свернуть('Samarkand'));
  assert.equal(world.свернуть('Samarqand'), world.свернуть('Samarkand'));
  assert.equal(world.свернуть('Мекка'), world.свернуть('Mecca'));
  assert.equal(world.свернуть('İstanbul'), 'istanbul');
});
тест('поиск по миру: Стамбул, Istanbul, Мекка, Mecca, Makkah, Бишкек, Kazan; у мест — страна, пояс, регион', () => {
  const первый = (з) => искать(з)[0];
  const ст = первый('Стамбул');
  assert.equal(ст.en, 'Istanbul');
  assert.equal(ст.страна, 'TR');
  assert.equal(ст.пояс, 'Europe/Istanbul');
  assert.equal(первый('Istanbul').en, 'Istanbul');
  assert.equal(первый('istan').en, 'Istanbul', 'с начала имени, крупный город первым');
  // GeoNames называет Мекку «Makkah» (и Медину — «Madinah»); по «Mecca» и «Мекка» — тоже она.
  assert.equal(первый('Мекка').en, 'Makkah');
  assert.equal(первый('Mecca').ru, 'Мекка');
  assert.equal(первый('Makkah').страна, 'SA');
  assert.equal(первый('Медина').en, 'Madinah');
  assert.equal(первый('Бишкек').страна, 'KG');
  assert.equal(первый('Казань').en, 'Kazan');
  assert.ok(первый('Лондон').область?.ru, 'регион');
  assert.deepEqual(искать('щщщщщ'), []);
  assert.deepEqual(искать('с'), [], 'мир — с двух букв');
});
тест('ближайшее по плиткам: Стамбул → место в Стамбуле (Диянет), Мекка → Мекка; Сидней, Аляска; склонение по сетке', () => {
  const плитки = (т) => Object.fromEntries(world.плиткиВокруг(т).filter((к) => индекс.плитки[к]).map((к) => [к, JSON.parse(fs.readFileSync(path.join(корень, 'public', 'prayer', индекс.плитки[к]), 'utf8'))]));
  const найти = (т) => {
    const б = world.ближайшееВПлитках(т, плитки(т));
    return { ...б, место: шард(б.шард).места[б.номер] };
  };
  const ст = найти({ широта: 41.01, долгота: 28.97 });
  assert.equal(ст.место.область?.ru, 'Istanbul', ст.место.en); // ближайшее — район Стамбула (Eminönü), это верно
  assert.ok(ст.км < 3);
  assert.equal(methods.методСтраны(ст.место.страна).id, 'diyanet');
  assert.equal(найти({ широта: 21.42, долгота: 39.83 }).место.ru, 'Мекка');
  assert.equal(найти({ широта: -33.87, долгота: 151.2 }).место.страна, 'AU');
  assert.equal(найти({ широта: 64.84, долгота: -147.72 }).место.страна, 'US');
  assert.deepEqual(world.плиткиВокруг({ широта: 1, долгота: 179 }).filter((к) => к.endsWith('_-18')).length, 3, 'через 180°');
  // склонение: Астана по сетке ≈ точному WMM (10,1°), Стамбул ≈ +6°
  assert.ok(Math.abs(world.склонениеВТочке(индекс, 51.18, 71.45) - 10.1) < 1.5);
  assert.ok(Math.abs(world.склонениеВТочке(индекс, 41.01, 28.97) - 6) < 1.5);
});

// ───────────── официальное время КЗ/УЗ ─────────────
const official = await import('../src/prayer/official.ts');
const ТАБЛИЦЫ = JSON.parse(fs.readFileSync(path.join(корень, 'scripts', 'fixtures', 'prayer-official-tables.json'), 'utf8'));
/** Ответ сервера (server/prayer.py ответ_таблицы) из сжатой фикстуры. */
function ответСервера(src, id, запись, год = ТАБЛИЦЫ.год) {
  const дни = запись.дни.split(' ').map((д) => [0, 4, 8, 12, 16, 20].map((i) => д.slice(i, i + 2) + ':' + д.slice(i + 2, i + 4)));
  return { src, place: id, year: год, start: `${год}-01-01`, offset: 300, days: дни, point: запись.точка, method: запись.метод, updated: '2026-11-20', checked: '2026-11-20', sha: 'a'.repeat(64) };
}

тест('официальный пункт: место КЗ/УЗ → id; своя точка ≤ 25 км → id ближайшего; мир и далёкая точка — нет', () => {
  assert.deepEqual(official.пунктОфициальный({ id: 'almaty', вид: 'место', страна: 'KZ' }), { src: 'dumk', id: 'almaty', км: 0 });
  assert.deepEqual(official.пунктОфициальный({ id: 'toshkent', вид: 'место', страна: 'UZ' }), { src: 'umuz', id: 'toshkent', км: 0 });
  assert.deepEqual(official.пунктОфициальный({ id: 'astana', вид: 'место' }), { src: 'dumk', id: 'astana', км: 0 }, 'старое место без страны — РК');
  assert.equal(official.пунктОфициальный({ id: 'istanbul', вид: 'место', страна: 'TR' }), null);
  assert.deepEqual(official.пунктОфициальный({ id: 'точка', вид: 'точка', страна: 'KZ', ближайшее: { id: 'almaty', км: 12 } }), { src: 'dumk', id: 'almaty', км: 12 });
  assert.equal(official.пунктОфициальный({ id: 'точка', вид: 'точка', страна: 'KZ', ближайшее: { id: 'almaty', км: 40 } }), null);
  assert.equal(official.пунктОфициальный({ id: 'точка', вид: 'точка', страна: 'KZ' }), null);
  // геолокация в КЗ → ближайшее место списка на устройстве → только его id (координаты в запрос не попадают)
  const список = places.разобратьМеста(ДАННЫЕ_МЕСТ);
  const б = places.ближайшееМесто(список, { широта: 43.2389, долгота: 76.8897 });
  const п = official.пунктОфициальный(places.своёМесто({ широта: 43.2389, долгота: 76.8897 }, б));
  assert.equal(п.id, 'almaty');
  assert.deepEqual(Object.keys(п).sort(), ['id', 'src', 'км']);
});

тест('ответ сервера: проверка формы (365 дней, ЧЧ:ММ, порядок, offset, sha) — кривое не принимаем', () => {
  const хорошо = ответСервера('dumk', 'almaty', ТАБЛИЦЫ.kz.almaty);
  const т = official.разобратьТаблицу(хорошо, 'dumk', 'almaty', 2026);
  assert.ok(т && т.дни.length === 365 && т.точка.name === 'Алматы қаласы' && т.метод === 'table');
  const испортить = (ф) => {
    const к = structuredClone(хорошо);
    ф(к);
    return official.разобратьТаблицу(к, 'dumk', 'almaty', 2026);
  };
  assert.equal(испортить((к) => к.days.pop()), null, '364 дня');
  assert.equal(испортить((к) => (к.days[3][2] = '9:05')), null, 'не ЧЧ:ММ');
  assert.equal(испортить((к) => (к.days[3][1] = '04:00')), null, 'восход раньше фаджра');
  assert.equal(испортить((к) => (к.offset = 360)), null, 'другой пояс');
  assert.equal(испортить((к) => (к.place = 'astana')), null, 'не тот пункт');
  assert.equal(испортить((к) => (к.sha = 'x')), null, 'нет sha');
  assert.equal(official.разобратьТаблицу('<html>', 'dumk', 'almaty', 2026), null, 'страница вместо JSON');
  assert.equal(official.разобратьТаблицу(хорошо, 'umuz', 'almaty', 2026), null, 'не тот источник');
  assert.equal(official.подписьОфициального('dumk', '2026-11-20', 'ru'), 'По данным ДУМК · обновлено 20.11.2026');
  assert.equal(official.подписьОфициального('umuz', '2026-11-20', 'ru'), 'По правилу Управления мусульман Узбекистана · обновлено 20.11.2026');
  assert.equal(official.подписьОфициального('dumk', '2026-11-20', 'kk'), 'ҚМДБ деректері бойынша · 20.11.2026 жаңартылды');
});

тест('официальная таблица = показываемое время: 16 городов КЗ и 14 вилоятов УЗ × 365 дней × 6 (0 мин); свой расчёт — сколько расходится', () => {
  const всеМеста = [...places.разобратьМеста(ДАННЫЕ_МЕСТ), ...places.разобратьМеста(ДАННЫЕ_УЗ)];
  const мин = (х) => Number(х.slice(0, 2)) * 60 + Number(х.slice(3));
  let значений = 0;
  for (const [src, набор] of [['dumk', ТАБЛИЦЫ.kz], ['umuz', ТАБЛИЦЫ.uz]]) {
    for (const [id, запись] of Object.entries(набор)) {
      const место = всеМеста.find((м) => м.id === id);
      assert.ok(место, id);
      const т = official.разобратьТаблицу(ответСервера(src, id, запись), src, id, 2026);
      assert.ok(т, id + ': таблица разобрана');
      let наиб = 0;
      let точно = 0;
      for (let i = 0; i < 365; i++) {
        const день = day.сдвигДня('2026-01-01', i);
        const в = official.временаИзТаблицы(т, день);
        const р = временаДня(место, день, { страна: место.страна });
        КЛЮЧИ_ВРЕМЁН.forEach((к, j) => {
          // показываем чч_мм(момент, пояс места) — должно быть ровно строкой таблицы
          assert.equal(day.чч_мм(в[к], место.пояс), т.дни[i][j], `${id} ${день} ${к}`);
          значений += 1;
          const д = Math.abs(мин(day.чч_мм(р[к], место.пояс)) - мин(т.дни[i][j]));
          наиб = Math.max(наиб, Math.min(д, 1440 - д));
          if (д === 0) точно += 1;
        });
        assert.equal(day.деньРК(в.fajr, место.пояс), день, `${id} ${день}: день места`);
      }
      console.log(`    ${src} ${id} (${т.точка.name}): свой расчёт — точно ${((100 * точно) / 2190).toFixed(1)} %, наибольшее расхождение ${наиб} мин`);
      assert.ok(наиб <= 10, `${id}: свой расчёт расходится с таблицей на ${наиб} мин — больше предела сервера`);
    }
  }
  assert.equal(значений, 30 * 365 * 6);
});

console.log(`OK: ${проверок} проверок`);
