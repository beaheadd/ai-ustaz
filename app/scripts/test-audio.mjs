#!/usr/bin/env node
/**
 * Тест плеера чтения кари без браузера: node scripts/test-audio.mjs  (npm run test:audio — вместе с e2e-audio.mjs)
 *   данные   — content/audio-sources.json: аль-Афаси «разрешено: false», база пустая → играть нечем, причина
 *              «нет разрешения» на любом хосте; аудиофайлов Корана в app/public и content нет;
 *   sources  — форма и правило показа: разрешено строго true + дата + условия + база на своём домене; batr.kz —
 *              «не на этом сайте»; без HTMLAudioElement — «не поддерживается»; кривые записи отбрасываются;
 *   очередь  — АЯТОВ_В_СУРЕ = индексу сур (6236), нормализация, бисмилла (не у сур 1 и 9, только с аята 1),
 *              повтор аята ×N, отрезок по кругу, «следующий»/«предыдущий», предзагрузка пропускает повторы;
 *   тексты   — ru и kk с одинаковыми ключами; подпись Media Session без арабских букв (правило 9);
 *   ядро     — с поддельным <audio> и Media Session: смена src по `ended`, blob предзагрузки, повтор без смены src,
 *              конец суры → «стоп», pause перед ended — не пауза, пауза ОС, NotAllowedError → пауза, ошибки сети/файла и
 *              «Повторить», устаревшие отказы play(), кАяту, повтор ×5 запоминается, хранилище с исключениями, сессия
 *              без части действий, setPositionState, ни одного таймера (в фоне их душат).
 * Модули — TypeScript без импортов кода (только `import type`): node ≥ 22.18 снимает типы сам.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const репо = path.resolve(корень, '..');
const ядро = await import('../src/audio/core.ts');
const источники = await import('../src/audio/sources.ts');
const тексты = await import('../src/audio/texts.ts');
const веб = await import('../src/audio/web.ts');
const {
  АЯТОВ_В_СУРЕ, аятовВСуре, нормализоватьОчередь, первыйШаг, шагПослеКонца, шагВперёд, шагНазад, следующийФайл,
  адресАята, адресШага, создатьПлеер, ошибкаПоКоду, КЛЮЧ_ХРАНИЛИЩА, ПОВТОРЫ_АЯТА,
} = ядро;
const { проверитьИсточникиЧтения, выбратьИсточник, можноИграть } = источники;
const { ТЕКСТЫ_ПЛЕЕРА, названиеДляСессии, ЕСТЬ_АРАБСКИЙ } = тексты;

let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}
const тик = () => new Promise((р) => setImmediate(р));

// ───────────────────────── Данные ─────────────────────────
console.log('Данные (content/audio-sources.json)');
const сырые = JSON.parse(fs.readFileSync(path.join(репо, 'content', 'audio-sources.json'), 'utf8'));
const ИСТОЧНИКИ = проверитьИсточникиЧтения(сырые);

await тест('аль-Афаси: одна запись, разрешено false, база пустая, шаблон {sura3}{aya3}.mp3, kk-имя есть', () => {
  assert.equal(ИСТОЧНИКИ.length, 1);
  const [а] = ИСТОЧНИКИ;
  assert.equal(а.id, 'alafasy');
  assert.equal(а.разрешено, false);
  assert.equal(а.база, '');
  assert.equal(а.шаблон, '{sura3}{aya3}.mp3');
  assert.equal(а.кари.ru, 'Мишари Рашид аль-Афаси');
  assert.ok(а.кари.kk.length > 0);
  assert.equal(можноИграть(а), false);
  assert.ok(!JSON.stringify(сырые).includes('://'), 'внешних адресов в данных нет');
});
await тест('без разрешения играть нечем на любом хосте: причина «нет-разрешения»', () => {
  for (const хост of ['batr.kz', 'aiustaz.kz', '127.0.0.1', 'localhost', ''])
    assert.deepEqual(выбратьИсточник(ИСТОЧНИКИ, { хост, естьЗвук: true }), { источник: null, причина: 'нет-разрешения' });
});
await тест('аудиофайлов Корана в app/public, app/src и content нет', () => {
  const аудио = /\.(mp3|m4a|ogg|oga|opus|wav|flac|aac|weba|webm)$/i;
  const обойти = (п) => (fs.existsSync(п) ? fs.readdirSync(п, { withFileTypes: true }).flatMap((з) => (з.isDirectory() ? обойти(path.join(п, з.name)) : [path.join(п, з.name)])) : []);
  const найдено = ['app/public', 'app/src', 'content'].flatMap((п) => обойти(path.join(репо, п))).filter((ф) => аудио.test(ф));
  assert.deepEqual(найдено, []);
});

// ───────────────────────── Источники ─────────────────────────
console.log('Источники (src/audio/sources.ts)');
const разрешённый = {
  id: 'test-qari',
  кари: { ru: 'Кари (тест)', kk: 'Қари (тест)', ar: null },
  база: '/aiustaz-audio/test',
  шаблон: '{sura3}{aya3}.mp3',
  бисмилла: 'bismillah.mp3',
  разрешено: true,
  дата_разрешения: '2026-11-19',
  условия: 'тестовая запись',
  атрибуция: { ru: 'Тест', kk: 'Тест' },
};
await тест('разрешённый источник играет на своём домене; на batr.kz и его поддоменах — «не-на-этом-сайте»; без <audio> — «не-поддерживается»', () => {
  const [и] = проверитьИсточникиЧтения({ источники: [разрешённый] });
  assert.ok(можноИграть(и));
  assert.equal(выбратьИсточник([и], { хост: 'aiustaz.kz', естьЗвук: true }).источник, и);
  for (const хост of ['batr.kz', 'www.batr.kz', 'BATR.KZ.', 'analytics.batr.kz'])
    assert.equal(выбратьИсточник([и], { хост, естьЗвук: true }).причина, 'не-на-этом-сайте', хост);
  assert.equal(выбратьИсточник([и], { хост: 'aiustaz.kz', естьЗвук: false }).причина, 'не-поддерживается');
});
await тест('кривые записи отбрасываются; разрешение — строго true с датой и условиями', () => {
  const варианты = [
    { база: 'https://cdn.example.com/a' },
    { база: '//cdn.example.com/a' },
    { база: '/aiustaz-audio/../x' },
    { база: '/aiustaz/audio' },
    { база: 'aiustaz-audio' },
    { шаблон: '{sura3}.mp3' },
    { шаблон: '{sura3}{aya3}.wav' },
    { шаблон: '../{sura3}{aya3}.mp3' },
    { бисмилла: '../b.mp3' },
    { кари: { ru: 'x', kk: '' } },
    { id: 'Плохой id' },
  ];
  for (const в of варианты) assert.deepEqual(проверитьИсточникиЧтения({ источники: [{ ...разрешённый, ...в }] }), [], JSON.stringify(в));
  for (const в of [{ разрешено: 'true' }, { разрешено: 1 }, { дата_разрешения: null }, { дата_разрешения: '19.11.2026' }, { условия: '' }, { база: '' }]) {
    const [и] = проверитьИсточникиЧтения({ источники: [{ ...разрешённый, ...в }] });
    assert.ok(и, JSON.stringify(в));
    assert.equal(можноИграть(и), false, JSON.stringify(в));
  }
  assert.deepEqual(проверитьИсточникиЧтения(null), []);
  assert.equal(проверитьИсточникиЧтения({ источники: [разрешённый, разрешённый] }).length, 1, 'повтор id отброшен');
});

// ───────────────────────── Очередь ─────────────────────────
console.log('Очередь (src/audio/core.ts)');
await тест('АЯТОВ_В_СУРЕ = индексу сур app/public/quran (114 сур, 6236 аятов)', () => {
  const ман = fs.readFileSync(path.join(корень, 'src', 'quran', 'manifest.generated.ts'), 'utf8');
  const индекс = JSON.parse(fs.readFileSync(path.join(корень, 'public', ман.match(/индекс: '([^']+)'/)[1]), 'utf8'));
  assert.equal(АЯТОВ_В_СУРЕ.length, 114);
  assert.equal(АЯТОВ_В_СУРЕ.reduce((а, б) => а + б, 0), 6236);
  assert.deepEqual([...АЯТОВ_В_СУРЕ], индекс.суры.map((с) => с.аятов));
  assert.equal(аятовВСуре(0), 0);
  assert.equal(аятовВСуре(115), 0);
  assert.equal(аятовВСуре(2.5), 0);
});
await тест('нормализоватьОчередь: по умолчанию вся сура, бисмилла только с аята 1, повтор 1…9; неверное — null', () => {
  assert.deepEqual(нормализоватьОчередь({ сура: 2 }), { сура: 2, сАята: 1, поАят: 286, повторАята: 1, повторОтрезка: false, бисмиллаПеред: true });
  assert.deepEqual(нормализоватьОчередь({ сура: 2, сАята: 255 }, 3), { сура: 2, сАята: 255, поАят: 286, повторАята: 3, повторОтрезка: false, бисмиллаПеред: false });
  assert.equal(нормализоватьОчередь({ сура: 1, повторАята: 50 }).повторАята, 9);
  assert.equal(нормализоватьОчередь({ сура: 1, повторАята: 0 }).повторАята, 1);
  for (const з of [{ сура: 0 }, { сура: 115 }, { сура: 1, сАята: 8 }, { сура: 1, сАята: 0 }, { сура: 2, сАята: 5, поАят: 4 }, { сура: 2, поАят: 287 }, { сура: 2, сАята: 1.5 }])
    assert.equal(нормализоватьОчередь(з), null, JSON.stringify(з));
});
function пройти(о, бисмилла, предел = 50) {
  const путь = [];
  let ш = первыйШаг(о, бисмилла);
  while (ш && путь.length < предел) {
    путь.push(ш.вид === 'бисмилла' ? 'б' : `${ш.аят}.${ш.повтор}`);
    ш = шагПослеКонца(о, ш);
  }
  return путь.join(' ');
}
await тест('порядок: бисмилла → аяты → конец суры; не у сур 1 и 9 и не с середины', () => {
  assert.equal(пройти(нормализоватьОчередь({ сура: 114 }), true), 'б 1.1 2.1 3.1 4.1 5.1 6.1');
  assert.equal(пройти(нормализоватьОчередь({ сура: 114 }), false), '1.1 2.1 3.1 4.1 5.1 6.1', 'у источника бисмилла не отдельно');
  assert.equal(пройти(нормализоватьОчередь({ сура: 1 }), true), '1.1 2.1 3.1 4.1 5.1 6.1 7.1', 'у суры 1 бисмилла — аят 1:1');
  assert.equal(пройти(нормализоватьОчередь({ сура: 9, поАят: 3 }), true), '1.1 2.1 3.1');
  assert.equal(пройти(нормализоватьОчередь({ сура: 114, сАята: 4 }), true), '4.1 5.1 6.1');
  assert.equal(пройти(нормализоватьОчередь({ сура: 114, бисмиллаПеред: false }), true), '1.1 2.1 3.1 4.1 5.1 6.1');
});
await тест('повтор аята ×3 и отрезок по кругу (для заучивания)', () => {
  assert.equal(пройти(нормализоватьОчередь({ сура: 112, сАята: 1, поАят: 2, повторАята: 3 }), false), '1.1 1.2 1.3 2.1 2.2 2.3');
  assert.equal(пройти(нормализоватьОчередь({ сура: 112, сАята: 2, поАят: 3, повторОтрезка: true }), false, 7), '2.1 3.1 2.1 3.1 2.1 3.1 2.1');
  assert.equal(пройти(нормализоватьОчередь({ сура: 112, сАята: 2, поАят: 2, повторОтрезка: true, повторАята: 2 }), false, 5), '2.1 2.2 2.1 2.2 2.1');
});
await тест('«следующий»/«предыдущий»; предзагрузка — ближайший ДРУГОЙ файл', () => {
  const о = нормализоватьОчередь({ сура: 2, сАята: 5, поАят: 7, повторАята: 3 });
  assert.deepEqual(шагВперёд(о, { вид: 'аят', аят: 5, повтор: 2 }), { вид: 'аят', аят: 6, повтор: 1 });
  assert.equal(шагВперёд(о, { вид: 'аят', аят: 7, повтор: 1 }), null, 'в конце отрезка без круга — дальше нет');
  assert.deepEqual(шагВперёд({ ...о, повторОтрезка: true }, { вид: 'аят', аят: 7, повтор: 1 }), { вид: 'аят', аят: 5, повтор: 1 });
  assert.deepEqual(шагНазад(о, { вид: 'аят', аят: 6, повтор: 3 }), { вид: 'аят', аят: 5, повтор: 1 });
  assert.deepEqual(шагНазад(о, { вид: 'аят', аят: 5, повтор: 3 }), { вид: 'аят', аят: 5, повтор: 1 }, 'на первом — этот же сначала');
  assert.deepEqual(следующийФайл(о, { вид: 'аят', аят: 5, повтор: 1 }), { вид: 'аят', аят: 6, повтор: 1 }, 'повторы того же файла пропущены');
  assert.equal(следующийФайл(о, { вид: 'аят', аят: 7, повтор: 1 }), null);
  assert.equal(следующийФайл({ ...о, поАят: 5, повторОтрезка: true }, { вид: 'аят', аят: 5, повтор: 1 }), null, 'отрезок из одного аята');
});
await тест('адресАята: база + шаблон {sura3}{aya3}; бисмилла — свой файл', () => {
  assert.equal(адресАята({ база: '/aiustaz-audio/alafasy', шаблон: '{sura3}{aya3}.mp3' }, 2, 255), '/aiustaz-audio/alafasy/002255.mp3');
  assert.equal(адресАята({ база: '/a', шаблон: 's{sura3}a{aya3}.m4a' }, 114, 6), '/a/s114a006.m4a');
  const и = { база: '/a', шаблон: '{sura3}{aya3}.mp3', бисмилла: 'bismillah.mp3' };
  assert.equal(адресШага(и, нормализоватьОчередь({ сура: 2 }), { вид: 'бисмилла' }), '/a/bismillah.mp3');
});

// ───────────────────────── Тексты ─────────────────────────
console.log('Тексты (src/audio/texts.ts)');
await тест('ru и kk — одинаковые ключи, непустые; причина без разрешения — «Аудио появится после разрешения кари»', () => {
  assert.deepEqual(Object.keys(ТЕКСТЫ_ПЛЕЕРА.kk).sort(), Object.keys(ТЕКСТЫ_ПЛЕЕРА.ru).sort());
  for (const я of ['ru', 'kk']) for (const [к, в] of Object.entries(ТЕКСТЫ_ПЛЕЕРА[я])) assert.ok(в.trim(), `${я}.${к}`);
  assert.equal(ТЕКСТЫ_ПЛЕЕРА.ru['причина.нет-разрешения'], 'Аудио появится после разрешения кари');
  for (const я of ['ru', 'kk']) for (const в of Object.values(ТЕКСТЫ_ПЛЕЕРА[я])) assert.ok(!ЕСТЬ_АРАБСКИЙ.test(в));
});
await тест('подпись Media Session: сура и аят, транслит или номер, повтор; арабских букв нет никогда (правило 9)', () => {
  const б = { сура: 2, аят: 255, транслит: 'аль-Бакара', бисмилла: false, повтор: 1, из: 1 };
  assert.equal(названиеДляСессии({ ...б, язык: 'ru' }), 'Сура аль-Бакара · аят 255');
  assert.equal(названиеДляСессии({ ...б, язык: 'ru', транслит: null }), 'Сура 2 · аят 255');
  assert.equal(названиеДляСессии({ ...б, язык: 'ru', повтор: 2, из: 3 }), 'Сура аль-Бакара · аят 255 (повтор 2 из 3)');
  assert.equal(названиеДляСессии({ ...б, язык: 'kk', транслит: null }), '2-сүре · 255-аят');
  assert.equal(названиеДляСессии({ ...б, язык: 'ru', бисмилла: true, аят: 1 }), 'Сура аль-Бакара · бисмилла');
  assert.equal(названиеДляСессии({ ...б, язык: 'ru', транслит: 'البقرة' }), 'Сура 2 · аят 255', 'арабское имя не берём');
  for (let с = 1; с <= 114; с++) assert.ok(!ЕСТЬ_АРАБСКИЙ.test(названиеДляСессии({ ...б, сура: с, аят: 1, язык: 'kk', транслит: null })));
});

// ───────────────────────── Ядро с подделками ─────────────────────────
console.log('Ядро плеера (поддельный <audio> и Media Session)');

class ПоддельныйЗвук {
  constructor() {
    Object.assign(this, { src: '', currentTime: 0, duration: NaN, paused: true, ended: false, playbackRate: 1, preload: '', error: null });
    this.слушатели = new Map();
    this.журнал = [];
    this.отказ = null; // имя ошибки следующего play()
  }
  addEventListener(т, ф) {
    if (!this.слушатели.has(т)) this.слушатели.set(т, []);
    this.слушатели.get(т).push(ф);
  }
  событие(т) {
    for (const ф of this.слушатели.get(т) ?? []) ф();
  }
  play() {
    this.журнал.push('play ' + this.src);
    if (this.отказ) {
      const имя = this.отказ;
      this.отказ = null;
      return Promise.reject(Object.assign(new Error(имя), { name: имя }));
    }
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }
  pause() {
    this.журнал.push('pause');
    this.paused = true;
  }
  load() {
    this.журнал.push('load');
  }
  removeAttribute(и) {
    if (и === 'src') this.src = '';
  }
  /** Браузер: метаданные пришли и звук пошёл. */
  пошло(длительность = 4.2) {
    this.duration = длительность;
    this.событие('loadedmetadata');
    this.событие('playing');
  }
  /** Браузер: файл доигран — pause (ended уже true), потом ended. */
  доиграно() {
    this.currentTime = this.duration;
    this.paused = true;
    this.ended = true;
    this.событие('pause');
    this.событие('ended');
  }
}

class ПоддельнаяСессия {
  constructor({ безДействий = [] } = {}) {
    this.metadata = null;
    this.playbackState = 'none';
    this.обработчики = new Map();
    this.позиции = [];
    this.безДействий = new Set(безДействий);
  }
  setActionHandler(д, ф) {
    if (this.безДействий.has(д)) throw new TypeError(`The provided value '${д}' is not a valid enum value`);
    this.обработчики.set(д, ф);
  }
  setPositionState(с) {
    if (с.position > с.duration) throw new TypeError('position > duration');
    this.позиции.push(с);
  }
}

function создать({ источник = { id: 'test-qari', база: '/aiustaz-audio/test', шаблон: '{sura3}{aya3}.mp3', бисмилла: 'bismillah.mp3', кари: { ru: 'Кари (тест)' } }, сессия = new ПоддельнаяСессия(), хранилище = new Map(), вСети = true, элемент = true } = {}) {
  const звук = элемент ? new ПоддельныйЗвук() : null;
  const загрузки = [];
  const освобождено = [];
  const хр = хранилище instanceof Map ? { прочитать: (к) => хранилище.get(к) ?? null, записать: (к, з) => хранилище.set(к, з) } : хранилище;
  const п = создатьПлеер({
    источник: () => источник,
    создатьЭлемент: () => звук,
    сессия: () => сессия,
    метаданные: (д) => ({ ...д }),
    подписи: (сура, ш, из) => ({
      название: названиеДляСессии({ язык: 'ru', сура, аят: ш.вид === 'аят' ? ш.аят : 1, транслит: сура === 2 ? 'аль-Бакара' : null, бисмилла: ш.вид === 'бисмилла', повтор: ш.вид === 'аят' ? ш.повтор : 1, из }),
      исполнитель: источник?.кари?.ru ?? '',
      альбом: 'AI Ustaz',
    }),
    хранилище: хр,
    предзагрузить: (адрес) =>
      new Promise((готово) => {
        загрузки.push({ адрес, готово });
      }),
    освободить: (url) => освобождено.push(url),
    вСети: () => вСети,
  });
  return { п, звук, сессия, хранилище, загрузки, освобождено };
}

// Таймеры в фоне душат: ядро не должно их заводить. На время тестов ядра setTimeout/setInterval — ловушка.
const настоящие = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval };
let таймеров = 0;
globalThis.setTimeout = (...а) => {
  таймеров += 1;
  return настоящие.setTimeout(...а);
};
globalThis.setInterval = (...а) => {
  таймеров += 1;
  return настоящие.setInterval(...а);
};

await тест('нет источника → «нет-источника»; нет <audio> → «не-поддерживается»; ничего не играет', () => {
  const а = создать({ источник: null });
  assert.equal(а.п.играть({ сура: 1 }), false);
  assert.equal(а.п.снимок().состояние, 'ошибка');
  assert.equal(а.п.снимок().ошибка, 'нет-источника');
  assert.equal(а.п.снимок().текущий, null);
  assert.deepEqual(а.звук.журнал, []);
  а.п.стоп();
  assert.equal(а.п.снимок().состояние, 'стоп');
  const б = создать({ элемент: false });
  assert.equal(б.п.играть({ сура: 1 }), false);
  assert.equal(б.п.снимок().ошибка, 'не-поддерживается');
});

await тест('играть: бисмилла → аят 1 по `ended` (blob предзагрузки), play() синхронно из нажатия, Media Session', async () => {
  const { п, звук, сессия, загрузки } = создать();
  const снимки = [];
  п.подписаться(() => снимки.push(п.снимок()));
  assert.equal(п.играть({ сура: 2, поАят: 3 }), true);
  assert.equal(звук.src, '/aiustaz-audio/test/bismillah.mp3');
  assert.deepEqual(звук.журнал, ['play /aiustaz-audio/test/bismillah.mp3'], 'play() — в том же вызове (жест)');
  assert.equal(звук.preload, 'auto');
  assert.equal(п.снимок().состояние, 'загрузка');
  assert.deepEqual(п.снимок().текущий, { сура: 2, аят: 1, повтор: 1, из: 1, бисмилла: true });
  assert.deepEqual([...сессия.обработчики.keys()].sort(), ['nexttrack', 'pause', 'play', 'previoustrack', 'seekto', 'stop']);
  assert.deepEqual(сессия.metadata, { title: 'Сура аль-Бакара · бисмилла', artist: 'Кари (тест)', album: 'AI Ustaz' });
  assert.equal(сессия.playbackState, 'playing');
  звук.пошло(3);
  assert.equal(п.снимок().состояние, 'играет');
  assert.deepEqual(сессия.позиции.at(-1), { duration: 3, playbackRate: 1, position: 0 });
  assert.deepEqual(загрузки.map((з) => з.адрес), ['/aiustaz-audio/test/002001.mp3'], 'предзагрузка следующего файла');
  загрузки[0].готово('blob:аят-1');
  await тик();
  звук.доиграно();
  assert.equal(п.снимок().состояние, 'загрузка', 'pause перед ended — не пауза');
  assert.equal(звук.src, 'blob:аят-1', 'следующий аят — из предзагрузки, без ожидания сети');
  assert.equal(звук.журнал.at(-1), 'play blob:аят-1');
  assert.deepEqual(п.снимок().текущий, { сура: 2, аят: 1, повтор: 1, из: 1, бисмилла: false });
  assert.equal(сессия.metadata.title, 'Сура аль-Бакара · аят 1');
  assert.ok(снимки.length >= 3);
  assert.ok(!снимки.some((с) => с.состояние === 'пауза'));
});

await тест('предзагрузка не успела → прямой адрес; ответ 404 (null) → прямой адрес; держим не больше двух blob', async () => {
  const { п, звук, загрузки, освобождено } = создать();
  п.играть({ сура: 2, сАята: 10, поАят: 13 });
  звук.пошло();
  звук.доиграно(); // предзагрузка 2:11 ещё в пути
  assert.equal(звук.src, '/aiustaz-audio/test/002011.mp3');
  загрузки[0].готово('blob:поздно-11'); // пришла поздно, но файл тот же — пригодится? нет: уже играет прямой адрес
  await тик();
  звук.пошло();
  assert.equal(загрузки.at(-1).адрес, '/aiustaz-audio/test/002012.mp3');
  загрузки.at(-1).готово(null); // 404 / не audio/*
  await тик();
  звук.доиграно();
  assert.equal(звук.src, '/aiustaz-audio/test/002012.mp3');
  assert.ok(освобождено.includes('blob:поздно-11'), 'ненужный blob освобождён');
  звук.пошло();
  загрузки.at(-1).готово('blob:13');
  await тик();
  звук.доиграно();
  assert.equal(звук.src, 'blob:13');
  звук.пошло();
  звук.доиграно(); // конец отрезка
  assert.equal(п.снимок().состояние, 'стоп');
  assert.ok(освобождено.includes('blob:13'), 'после остановки blob освобождён');
});

await тест('повтор аята ×3: тот же файл сначала без смены src; подпись «повтор 2 из 3»; конец суры → стоп', async () => {
  const { п, звук, сессия, хранилище } = создать();
  п.играть({ сура: 114, сАята: 5, повторАята: 3 });
  const src = звук.src;
  assert.equal(src, '/aiustaz-audio/test/114005.mp3');
  звук.пошло();
  звук.доиграно();
  assert.equal(звук.src, src);
  assert.equal(звук.currentTime, 0);
  assert.deepEqual(п.снимок().текущий, { сура: 114, аят: 5, повтор: 2, из: 3, бисмилла: false });
  assert.equal(сессия.metadata.title, 'Сура 114 · аят 5 (повтор 2 из 3)');
  звук.пошло();
  звук.доиграно();
  звук.пошло();
  звук.доиграно();
  assert.equal(звук.src, '/aiustaz-audio/test/114006.mp3');
  for (let i = 0; i < 3; i++) {
    звук.пошло();
    звук.доиграно();
  }
  const с = п.снимок();
  assert.equal(с.состояние, 'стоп', 'после последнего аята суры — остановка, следующая сура не начинается');
  assert.equal(с.текущий, null);
  assert.equal(сессия.metadata, null);
  assert.equal(сессия.playbackState, 'none');
  assert.equal(звук.src, '');
  assert.deepEqual(п.последнийАят(), { сура: 114, аят: 6 });
  assert.deepEqual(JSON.parse(хранилище.get(КЛЮЧ_ХРАНИЛИЩА)), { версия: 1, сура: 114, аят: 6, повторАята: 3 });
});

await тест('пауза ОС (звонок, наушники) → «пауза»; Media Session play/pause/next/prev/seekto/stop', () => {
  const { п, звук, сессия } = создать();
  п.играть({ сура: 2, сАята: 254, поАят: 256 });
  звук.пошло(10);
  звук.paused = true;
  звук.событие('pause');
  assert.equal(п.снимок().состояние, 'пауза');
  assert.equal(сессия.playbackState, 'paused');
  сессия.обработчики.get('play')({ action: 'play' });
  assert.equal(звук.журнал.at(-1), 'play /aiustaz-audio/test/002254.mp3');
  звук.пошло(10);
  assert.equal(п.снимок().состояние, 'играет');
  сессия.обработчики.get('pause')({ action: 'pause' });
  assert.equal(п.снимок().состояние, 'пауза');
  assert.equal(звук.журнал.at(-1), 'pause');
  сессия.обработчики.get('nexttrack')({ action: 'nexttrack' });
  assert.equal(п.снимок().текущий.аят, 255);
  assert.equal(п.снимок().состояние, 'пауза', 'на паузе «следующий» не включает звук');
  сессия.обработчики.get('play')({});
  звук.пошло(12);
  сессия.обработчики.get('previoustrack')({});
  assert.equal(п.снимок().текущий.аят, 254);
  assert.equal(звук.журнал.at(-1), 'play /aiustaz-audio/test/002254.mp3');
  звук.пошло(12);
  сессия.обработчики.get('seekto')({ seekTime: 5 });
  assert.equal(звук.currentTime, 5);
  assert.deepEqual(сессия.позиции.at(-1), { duration: 12, playbackRate: 1, position: 5 });
  сессия.обработчики.get('seekto')({ seekTime: 99 });
  assert.equal(звук.currentTime, 12, 'перемотка не дальше конца');
  сессия.обработчики.get('stop')({});
  assert.equal(п.снимок().состояние, 'стоп');
});

await тест('NotAllowedError (браузер не дал играть без жеста) → «пауза», не ошибка; AbortError старого файла не трогает новый', async () => {
  const { п, звук } = создать();
  звук.отказ = 'NotAllowedError';
  п.играть({ сура: 1 });
  await тик();
  assert.equal(п.снимок().состояние, 'пауза');
  assert.equal(п.снимок().ошибка, undefined);
  п.продолжить();
  звук.пошло();
  assert.equal(п.снимок().состояние, 'играет');
  звук.отказ = 'AbortError';
  п.следующий();
  await тик();
  assert.equal(п.снимок().состояние, 'загрузка');
  звук.пошло();
  assert.equal(п.снимок().состояние, 'играет');
});

await тест('ошибки: код 4 в сети — «нет-файла», офлайн — «нет-связи», код 2 — «нет-связи», 3 — «не-поддерживается»; «Повторить» — тот же аят заново', () => {
  assert.equal(ошибкаПоКоду(4, true), 'нет-файла');
  assert.equal(ошибкаПоКоду(4, false), 'нет-связи');
  assert.equal(ошибкаПоКоду(2, true), 'нет-связи');
  assert.equal(ошибкаПоКоду(3, true), 'не-поддерживается');
  assert.equal(ошибкаПоКоду(1, true), null);
  const { п, звук } = создать({ вСети: false });
  п.играть({ сура: 2, сАята: 7, поАят: 8 });
  звук.error = { code: 4 };
  звук.событие('error');
  assert.equal(п.снимок().состояние, 'ошибка');
  assert.equal(п.снимок().ошибка, 'нет-связи');
  assert.deepEqual(п.снимок().текущий.аят, 7, 'аят на месте — можно повторить');
  звук.error = null;
  п.продолжить();
  assert.equal(звук.журнал.at(-1), 'play /aiustaz-audio/test/002007.mp3');
  assert.equal(п.снимок().состояние, 'загрузка');
  звук.пошло();
  assert.equal(п.снимок().состояние, 'играет');
});

await тест('кАяту вне отрезка расширяет отрезок; «следующий» в конце без круга — нет; с кругом — к началу', () => {
  const { п, звук } = создать();
  п.играть({ сура: 2, сАята: 10, поАят: 12 });
  звук.пошло();
  assert.equal(п.кАяту(5), true);
  assert.equal(п.снимок().очередь.сАята, 5);
  assert.equal(звук.src, '/aiustaz-audio/test/002005.mp3');
  assert.equal(п.кАяту(287), false);
  assert.equal(п.кАяту(12), true);
  звук.пошло();
  assert.equal(п.снимок().можноВперёд, false);
  assert.equal(п.следующий(), false);
  п.установитьПовторОтрезка(true);
  assert.equal(п.снимок().можноВперёд, true);
  assert.equal(п.следующий(), true);
  assert.equal(п.снимок().текущий.аят, 5);
  assert.equal(п.предыдущий(), true);
  assert.equal(п.снимок().текущий.аят, 5, 'на первом аяте — сначала');
  п.стоп();
  assert.equal(п.кАяту(3), false, 'без очереди — нечего');
});

await тест('повтор ×1/×3/×5 запоминается на устройстве (новый плеер читает его и последний аят)', () => {
  assert.deepEqual([...ПОВТОРЫ_АЯТА], [1, 3, 5]);
  const хранилище = new Map();
  const а = создать({ хранилище });
  а.п.играть({ сура: 36, сАята: 9 });
  а.звук.пошло();
  а.п.установитьПовтор(5);
  assert.equal(а.п.снимок().текущий.из, 5);
  assert.equal(а.п.снимок().повторАята, 5);
  const б = создать({ хранилище });
  assert.equal(б.п.снимок().повторАята, 5);
  assert.deepEqual(б.п.последнийАят(), { сура: 36, аят: 9 });
  б.п.играть({ сура: 1 });
  assert.equal(б.п.снимок().очередь.повторАята, 5, 'повтор берётся из выбора человека');
  хранилище.set(КЛЮЧ_ХРАНИЛИЩА, '{испорчено');
  assert.equal(создать({ хранилище }).п.последнийАят(), null);
  хранилище.set(КЛЮЧ_ХРАНИЛИЩА, JSON.stringify({ версия: 1, сура: 1, аят: 99, повторАята: 'x' }));
  assert.equal(создать({ хранилище }).п.последнийАят(), null);
});

await тест('хранилище бросает исключения (приватный режим) — плеер работает, просто не помнит', () => {
  const плохое = { прочитать() { throw new Error('SecurityError'); }, записать() { throw new Error('QuotaExceededError'); } };
  const { п, звук } = создать({ хранилище: плохое });
  assert.equal(п.играть({ сура: 1 }), true);
  звук.пошло();
  звук.доиграно();
  assert.equal(п.снимок().текущий.аят, 2);
  assert.deepEqual(п.последнийАят(), { сура: 1, аят: 2 }, 'в памяти страницы помним');
});

await тест('Media Session: нет вовсе — играет; часть действий неизвестна браузеру — остальные заданы; неверная позиция не роняет', () => {
  const а = создать({ сессия: null });
  assert.equal(а.п.играть({ сура: 1 }), true);
  а.звук.пошло();
  assert.equal(а.п.снимок().состояние, 'играет');
  const сессия = new ПоддельнаяСессия({ безДействий: ['stop', 'seekto'] });
  const б = создать({ сессия });
  б.п.играть({ сура: 1 });
  assert.deepEqual([...сессия.обработчики.keys()].sort(), ['nexttrack', 'pause', 'play', 'previoustrack']);
  б.звук.duration = NaN;
  б.звук.событие('durationchange');
  assert.equal(сессия.позиции.length, 0, 'без длительности позиция не задаётся');
  б.звук.duration = 2;
  б.звук.currentTime = 3;
  б.звук.событие('seeked');
  assert.deepEqual(сессия.позиции.at(-1), { duration: 2, playbackRate: 1, position: 2 }, 'позиция прижата к длительности');
});

await тест('снимок стабилен между изменениями (useSyncExternalStore); отписка работает', () => {
  const { п, звук } = создать();
  const с1 = п.снимок();
  assert.equal(п.снимок(), с1);
  let вызовов = 0;
  const отписаться = п.подписаться(() => (вызовов += 1));
  п.играть({ сура: 1 });
  assert.ok(вызовов > 0);
  assert.notEqual(п.снимок(), с1);
  const с2 = п.снимок();
  assert.equal(п.снимок(), с2);
  отписаться();
  const было = вызовов;
  звук.пошло();
  assert.equal(вызовов, было);
});

await тест('ядро не заводит ни одного таймера (в фоне их душат — всё по событиям <audio>)', () => {
  assert.equal(таймеров, 0);
});
globalThis.setTimeout = настоящие.setTimeout;
globalThis.setInterval = настоящие.setInterval;

// ───────────────────────── Веб-зависимости ─────────────────────────
console.log('Веб-зависимости (src/audio/web.ts) в node');
await тест('без window: нет <audio>, нет Media Session; предзагрузка берёт только audio/*', async () => {
  const з = веб.зависимостиВеба();
  assert.equal(веб.естьЗвукВеба(), false);
  assert.equal(з.создатьЭлемент(), null);
  assert.equal(з.хранилище.прочитать('x'), null);
  const настоящийFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    assert.equal(await веб.предзагрузитьФайл('/aiustaz-audio/x/001001.mp3'), null, 'index.html сайта вместо файла не играем');
    globalThis.fetch = async () => new Response('нет', { status: 404, headers: { 'content-type': 'audio/mpeg' } });
    assert.equal(await веб.предзагрузитьФайл('/a'), null);
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    assert.equal(await веб.предзагрузитьФайл('/a'), null);
    let запрос;
    globalThis.fetch = async (u, о) => {
      запрос = { u, о };
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    };
    const url = await веб.предзагрузитьФайл('/aiustaz-audio/x/001001.mp3');
    assert.match(url, /^blob:/);
    assert.deepEqual(запрос.о, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    з.освободить(url);
  } finally {
    globalThis.fetch = настоящийFetch;
  }
});

console.log(`\nOK: ${проверок} проверок`);
