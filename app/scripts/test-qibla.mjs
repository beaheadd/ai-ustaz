#!/usr/bin/env node
/**
 * Тест киблы и компаса (без браузера): node scripts/test-qibla.mjs  (npm run test:qibla)
 *   qibla/qibla.ts   — направление на Каабу по большому кругу: города РК против нашего прототипа (±0,01°)
 *                      и геодезии WGS84 (geographiclib 2.0, ≤ 0,2°; prayer-proto/README.md §4); расстояние, румбы;
 *                      курс из события ориентации (Android — полная матрица при любом наклоне и повороте экрана,
 *                      iOS — webkitCompassHeading), склонение, поворот «правее/левее», совпадение ≤ 5°, сглаживание;
 *                      солнце: истинный полдень (азимут 180°), солнце в стороне киблы, «солнце над Каабой»;
 *   qibla/compass.ts — подписка с поддельным окном: iOS (разрешение), Android (absolute), «компаса нет» по таймауту.
 * Модули — TypeScript: node ≥ 22.18 снимает типы сам. compass.ts импортирует './qibla' без расширения (так нужно
 * Metro) — для node ниже ставится крошечный хук разрешения: относительный путь без расширения → '.ts'.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(путь, контекст, дальше) {
  if (/^\\.\\.?\\//.test(путь) && !/\\.[cm]?[jt]sx?$/.test(путь)) {
    try { return await дальше(путь + '.ts', контекст); } catch {}
  }
  return дальше(путь, контекст);
}`),
);

const к = await import('../src/qibla/qibla.ts');
const { запроситьДоступКомпаса, слушатьКомпас, нуженЗапросРазрешения, естьСобытияОриентации } = await import('../src/qibla/compass.ts');

let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}
const разн = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Точки — как в прототипе (prayer-proto/test.mjs); «наш» — значения README §4, WGS84 — geographiclib 2.0 (Inverse azi1).
const ГОРОДА = {
  Алматы: { т: [43.238293, 76.945465], наш: 246.66, wgs: 246.79, км: 4195 },
  Астана: { т: [51.133333, 71.433333], наш: 231.5, wgs: 231.62, км: 4288 },
  Шымкент: { т: [42.368009, 69.612769], наш: 239.3, wgs: 239.43, км: 3618 },
  Ақтау: { т: [43.635379, 51.169135], наш: 206.61, wgs: 206.7, км: 2683 },
  Петропавл: { т: [54.862222, 69.140833], наш: 225.14, wgs: 225.24, км: 4450 },
  Өскемен: { т: [49.948325, 82.627848], наш: 245.53, wgs: 245.65, км: 4895 },
  Орал: { т: [51.204019, 51.370537], наш: 201.13, wgs: 201.2, км: 3460 },
};

console.log('кибла: направление и расстояние');
await тест('7 городов РК: большой круг = прототип (±0,01°) и WGS84 (≤ 0,2°), расстояние до Каабы (±1 км)', () => {
  for (const [имя, { т: [ш, д], наш, wgs, км }] of Object.entries(ГОРОДА)) {
    const а = к.направлениеКиблы(ш, д);
    assert.ok(Math.abs(а - наш) <= 0.01, `${имя}: ${а} против ${наш}`);
    assert.ok(Math.abs(а - wgs) <= 0.2, `${имя}: ${а} против WGS84 ${wgs}`);
    assert.ok(Math.abs(к.расстояниеДоКаабыКм(ш, д) - км) <= 1, `${имя}: ${к.расстояниеДоКаабыКм(ш, д)} км`);
  }
});
await тест('Астана по умолчанию (GeoNames 51.1801, 71.44598) — 231,5°; Алматы ≠ «259–260°» из задания', () => {
  assert.equal(Math.round(к.направлениеКиблы(51.1801, 71.44598)), 231);
  assert.equal(Math.round(к.направлениеКиблы(43.25249, 76.9115)), 247);
  assert.ok(Math.abs(к.направлениеКиблы(к.КААБА.широта + 1, к.КААБА.долгота) - 180) < 1e-9); // точно севернее Каабы — строго на юг
});
await тест('румбы ru/kk', () => {
  assert.equal(к.румб(246.66), 'запад-юго-запад');
  assert.equal(к.румб(231.5), 'юго-запад');
  assert.equal(к.румб(231.5, 'kk'), 'оңтүстік-батыс');
  assert.equal(к.румб(359), 'север');
  assert.equal(к.румб(201.13), 'юг-юго-запад');
});

console.log('компас: курс из события');
// Углы Эйлера из матрицы — как WebKit (WebCoreMotionManager.mm) и W3C (Z-X'-Y'')
function углыИзМатрицы(R) {
  let z, x, y;
  if (R[8] > 0) {
    z = Math.atan2(-R[1], R[4]);
    x = Math.asin(R[7]);
    y = Math.atan2(-R[6], R[8]);
  } else {
    z = Math.atan2(R[1], -R[4]);
    x = -Math.asin(R[7]);
    x += x >= 0 ? -Math.PI : Math.PI;
    y = Math.atan2(R[6], -R[8]);
  }
  const г = (r) => (r * 180) / Math.PI;
  return { alpha: к.норм360(г(z)), beta: г(x), gamma: г(y) };
}
const умн = (A, B) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
const Rz = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const Rx = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const Ry = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const рад = (г) => (г * Math.PI) / 180;

await тест('Android: курс верха экрана при любом наклоне, крене и повороте экрана (6 × 6 × 4), телефон стоит — камера', () => {
  for (const курс of [0, 37, 90, 181, 231.5, 359]) {
    for (const [наклон, крен] of [[0, 0], [20, 0], [0, 25], [35, -30], [-20, 40], [50, 10]]) {
      for (const экран of [0, 90, 180, 270]) {
        const R = умн(умн(умн(Rz(рад(-курс)), Rx(рад(наклон))), Ry(рад(крен))), Rz(рад(экран)));
        const р = к.курсИзСобытия({ ...углыИзМатрицы(R), absolute: true }, экран);
        assert.ok(р && разн(р.курс, курс) < 1e-6, `курс ${курс} наклон ${наклон} крен ${крен} экран ${экран}: ${р?.курс}`);
        assert.equal(р.вертикально, false);
        assert.equal(р.источник, 'android');
      }
    }
  }
  const R = умн(Rz(рад(-120)), Rx(рад(90)));
  const р = к.курсИзСобытия({ ...углыИзМатрицы(R), absolute: true }, 0);
  assert.ok(р.вертикально && разн(р.курс, 120) < 1e-6, String(р.курс));
  const Q = умн(умн(Rz(1), Rx(0.3)), Ry(-0.4));
  const у = углыИзМатрицы(Q);
  к.матрицаИзУглов(у.alpha, у.beta, у.gamma).forEach((v, i) => assert.ok(Math.abs(v - Q[i]) < 1e-9));
});
await тест('iOS: webkitCompassHeading + поворот экрана, точность; относительное событие — не компас', () => {
  assert.deepEqual(к.курсИзСобытия({ webkitCompassHeading: 350, webkitCompassAccuracy: 10, beta: 5 }, 90), { курс: 80, точность: 10, источник: 'ios', вертикально: false });
  assert.equal(к.курсИзСобытия({ webkitCompassHeading: 10, webkitCompassAccuracy: -1 }, 0).точность, null);
  assert.equal(к.курсИзСобытия({ webkitCompassHeading: 10, beta: 80 }, 0).вертикально, true);
  assert.equal(к.курсИзСобытия({ alpha: 10, beta: 0, gamma: 0, absolute: false }, 0), null);
  assert.equal(к.курсИзСобытия({ alpha: null, absolute: true }, 0), null);
  assert.equal(к.курсИзСобытия(null, 0), null);
  assert.equal(к.уголЭкрана({ screen: { orientation: { angle: 270 } } }), 270);
  assert.equal(к.уголЭкрана({ orientation: -90 }), 270);
  assert.equal(к.уголЭкрана({}), 0);
  assert.equal(к.уголЭкрана(undefined), 0);
});
await тест('склонение, стрелка, «правее/левее», совпадение ≤ 5°, опора юг/север', () => {
  assert.equal(к.истинныйКурс(355, 10), 5);
  assert.equal(к.уголСтрелки(231.5, 231.5), 0);
  assert.equal(к.уголСтрелки(231.5, 0), 231.5);
  assert.deepEqual(к.поворот(200, 231.5), { градусы: 32, сторона: 'вправо' });
  assert.deepEqual(к.поворот(260, 231.5), { градусы: 29, сторона: 'влево' });
  assert.deepEqual(к.поворот(10, 350), { градусы: 20, сторона: 'влево' }); // через север
  assert.deepEqual(к.поворот(231.4, 231.5), { градусы: 0, сторона: 'прямо' });
  assert.deepEqual(к.поворот(180, 231.5), { градусы: 52, сторона: 'вправо' }); // «лицом на юг — вправо на 52°»
  assert.equal(к.совпадает(231.5, 227), true);
  assert.equal(к.совпадает(231.5, 236.4), true);
  assert.equal(к.совпадает(231.5, 237), false);
  assert.equal(к.совпадает(2, 358), true);
  assert.equal(к.опораДляПоворота(231.5), 180);
  assert.equal(к.опораДляПоворота(45), 0);
  // без поправки на склонение стрелка в Астане ошиблась бы на 10° — проверяем, что поправка в нужную сторону:
  // телефон смотрит на магнитный курс 221,4°, склонение +10,1° → истинный 231,5° = кибла → совпало
  assert.equal(к.совпадает(231.5, к.истинныйКурс(221.4, 10.1)), true);
  assert.equal(к.совпадает(231.5, 221.4), false);
});
await тест('сглаживание через 0°/360° и разброс', () => {
  const с = к.новыйСглаживатель(0.5);
  let v;
  for (const курс of [355, 5, 355, 5, 355, 5]) v = с.добавить(курс);
  assert.ok(разн(v, 0) < 5, String(v));
  assert.ok(с.разброс() > 4 && с.разброс() < 6, String(с.разброс()));
  const ровно = к.новыйСглаживатель();
  for (let i = 0; i < 30; i++) ровно.добавить(231);
  assert.ok(ровно.разброс() < 1e-6);
});

console.log('солнце: ориентиры без компаса');
const АЛМАТЫ = ГОРОДА.Алматы.т;
const АСТАНА = ГОРОДА.Астана.т;
await тест('истинный полдень: азимут 180° (±0,1°), Алматы 21.06.2026 — 11:53–11:55 по РК (зухр ДУМК 11:57 = полдень + 3 мин)', () => {
  for (const [ш, д] of [АЛМАТЫ, АСТАНА, ГОРОДА.Ақтау.т, ГОРОДА.Петропавл.т]) {
    for (const день of ['2026-01-15', '2026-06-21', '2026-11-19']) {
      const п = к.истинныйПолдень(ш, д, день);
      assert.equal(к.деньРК(п), день);
      const аз = к.положениеСолнца(ш, д, п).азимут;
      assert.ok(Math.abs(аз - 180) < 0.1, `${ш},${д} ${день}: азимут ${аз}`);
    }
  }
  const п = к.истинныйПолдень(...АЛМАТЫ, '2026-06-21');
  assert.ok(['11:53', '11:54', '11:55'].includes(к.чч_ммРК(п)), к.чч_ммРК(п));
});
await тест('солнце в стороне киблы: азимут = кибла (±0,3°), после полудня; зимой на севере — до заката или null', () => {
  for (const [ш, д] of [АЛМАТЫ, АСТАНА, ГОРОДА.Шымкент.т, ГОРОДА.Орал.т]) {
    const кибла = к.направлениеКиблы(ш, д);
    const р = к.солнцеВСторонеКиблы(ш, д, кибла, '2026-06-21');
    assert.ok(р, 'летом солнце проходит киблу');
    const аз = к.положениеСолнца(ш, д, р.момент).азимут;
    assert.ok(разн(аз, кибла) < 0.3, `азимут ${аз} против ${кибла}`);
    assert.ok(р.момент > к.истинныйПолдень(ш, д, '2026-06-21') && р.высота > 5);
  }
  const з = к.солнцеВСторонеКиблы(...ГОРОДА.Петропавл.т, к.направлениеКиблы(...ГОРОДА.Петропавл.т), '2026-12-21');
  assert.ok(з === null || з.высота < 15, 'зимой на севере солнце у киблы низко или уже село');
  assert.equal(к.солнцеВСторонеКиблы(...АСТАНА, 45, '2026-06-21'), null);
});
await тест('солнце сейчас: у полудня на юге, над горизонтом; ночью ниже горизонта', () => {
  const полдень = к.истинныйПолдень(...АСТАНА, '2026-11-19');
  assert.ok(к.положениеСолнца(...АСТАНА, полдень).высота > 15);
  const ночь = new Date(Date.UTC(2026, 10, 19, 19)); // 00:00 по РК
  assert.ok(к.положениеСолнца(...АСТАНА, ночь).высота < -30);
});
await тест('«солнце над Каабой»: 2026 — 28.05 14:18 и 15.07 14:27 по РК; 2027 — 28.05 и 16.07; ближайшее — только за неделю', () => {
  const [май, июль] = к.солнцеНадКаабой(2026);
  assert.equal(`${к.деньРК(май)} ${к.чч_ммРК(май)}`, '2026-05-28 14:18');
  assert.equal(`${к.деньРК(июль)} ${к.чч_ммРК(июль)}`, '2026-07-15 14:27');
  const [май27, июль27] = к.солнцеНадКаабой(2027);
  assert.equal(май27.toISOString().slice(0, 16), '2027-05-28T09:18');
  assert.equal(июль27.toISOString().slice(0, 16), '2027-07-16T09:27');
  assert.equal(к.ближайшееСолнцеНадКаабой(new Date(Date.UTC(2026, 4, 25, 6))).toISOString(), май.toISOString());
  assert.equal(к.ближайшееСолнцеНадКаабой(new Date(Date.UTC(2026, 6, 10, 6))).toISOString(), июль.toISOString());
  assert.equal(к.ближайшееСолнцеНадКаабой(new Date(Date.UTC(2026, 10, 19, 6))), null);
  assert.equal(к.ближайшееСолнцеНадКаабой(new Date(Date.UTC(2026, 4, 28, 10))), null); // уже прошло
});
await тест('время РК: день меняется в полночь UTC+5', () => {
  assert.equal(к.деньРК(new Date('2026-11-19T18:59:00Z')), '2026-11-19');
  assert.equal(к.деньРК(new Date('2026-11-19T19:00:00Z')), '2026-11-20');
  assert.equal(к.чч_ммРК(new Date('2026-11-19T19:05:40Z')), '00:05');
});

console.log('компас: подписка (поддельное окно)');
const событие = (тип, поля) => Object.assign(new Event(тип), поля);
await тест('iOS: кнопка только на сенсорном экране; разрешение только через requestPermission; курс = webkitCompassHeading + склонение; после стопа тихо', async () => {
  const окно = new EventTarget();
  окно.DeviceOrientationEvent = { requestPermission: async () => 'granted' };
  окно.screen = { orientation: { angle: 0 } };
  assert.equal(нуженЗапросРазрешения(окно), false, 'без сенсорного экрана (ноутбук, новый Chrome) кнопки нет');
  окно.navigator = { maxTouchPoints: 5 };
  assert.equal(нуженЗапросРазрешения(окно), true);
  assert.equal(await запроситьДоступКомпаса(окно), 'разрешено');
  окно.DeviceOrientationEvent.requestPermission = async () => 'denied';
  assert.equal(await запроситьДоступКомпаса(окно), 'отказ');
  окно.DeviceOrientationEvent.requestPermission = async () => {
    throw new Error('NotAllowedError');
  };
  assert.equal(await запроситьДоступКомпаса(окно), 'отказ');
  const данные = [];
  const стоп = слушатьКомпас(окно, (д) => данные.push(д), { склонение: 10.1, таймаутМс: 50 });
  окно.dispatchEvent(событие('deviceorientation', { webkitCompassHeading: 221.4, webkitCompassAccuracy: 12, alpha: 30, beta: 3, gamma: 1 }));
  assert.equal(данные.length, 1);
  assert.ok(разн(данные[0].курсИстинный, 231.5) < 1e-9 && данные[0].точность === 12 && данные[0].источник === 'ios');
  стоп();
  окно.dispatchEvent(событие('deviceorientation', { webkitCompassHeading: 0 }));
  assert.equal(данные.length, 1);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(данные.length, 1, 'таймер снят');
});
await тест('Android: deviceorientationabsolute; относительное deviceorientation игнорируется', async () => {
  const окно = new EventTarget();
  окно.ondeviceorientationabsolute = null;
  окно.DeviceOrientationEvent = function () {};
  окно.screen = { orientation: { angle: 0 } };
  assert.equal(нуженЗапросРазрешения(окно), false);
  assert.equal(естьСобытияОриентации(окно), true);
  assert.equal(await запроситьДоступКомпаса(окно), 'разрешено');
  const данные = [];
  const стоп = слушатьКомпас(окно, (д) => данные.push(д), { склонение: 5.2 });
  окно.dispatchEvent(событие('deviceorientation', { alpha: 100, beta: 0, gamma: 0, absolute: false }));
  assert.equal(данные.length, 0);
  окно.dispatchEvent(событие('deviceorientationabsolute', { alpha: 360 - 241.46, beta: 0, gamma: 0, absolute: true }));
  assert.equal(данные.length, 1);
  assert.ok(разн(данные[0].курсИстинный, 246.66) < 1e-6, String(данные[0].курсИстинный));
  стоп();
});
await тест('нет компаса: за таймаут ни одного абсолютного курса; позже пришёл — «есть»; нет класса — «нет-датчика»', async () => {
  const окно = new EventTarget();
  окно.DeviceOrientationEvent = function () {};
  const данные = [];
  const стоп = слушатьКомпас(окно, (д) => данные.push(д), { таймаутМс: 20 });
  окно.dispatchEvent(событие('deviceorientation', { alpha: 10, beta: 0, gamma: 0, absolute: false }));
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(данные, [{ состояние: 'нет-компаса' }]);
  окно.dispatchEvent(событие('deviceorientation', { alpha: 10, beta: 0, gamma: 0, absolute: true }));
  assert.equal(данные.at(-1).состояние, 'есть');
  стоп();
  assert.equal(await запроситьДоступКомпаса({}), 'нет-датчика');
  assert.equal(естьСобытияОриентации({}), false);
  assert.equal(нуженЗапросРазрешения(null), false);
});

console.log(`\nOK: кибла и компас — ${проверок} проверок`);
