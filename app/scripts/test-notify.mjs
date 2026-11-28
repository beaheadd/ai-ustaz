#!/usr/bin/env node
/**
 * Тест уведомлений о времени намаза (без браузера и сети): node scripts/test-notify.mjs  (npm run test:notify)
 * Владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту».
 *   notify/schedule.ts — расписание на 30 дней тем же расчётом ДУМК (prayer/times.ts): окно (сейчас; +30 сут], смена суток
 *                        по Алматы (UTC+5, не по поясу телефона), пятница и суббота, восход выключен по умолчанию,
 *                        напоминание за N мин (время в пункте — время намаза), «следующий» (после иши — фаджр завтра,
 *                        восход следующим не бывает), не больше 12 пунктов в сутки, правило сервера time = at + before
 *                        (server/push.py), в данных нет координат; сохранённые настройки (кривое — по умолчанию).
 *   notify/support.ts  — где можно включить: aiustaz.pro, batr.kz, iPhone не с экрана «Домой», iOS < 16.4, Instagram.
 *   public/push-sw.js  — service worker в песочнице node:vm: push → showNotification (значки, tag, кнопки, тихое),
 *                        мусор не показывает; нажатие → окно /aiustaz/index.html#/prayer|#/qibla; fetch — только свои файлы (без сети, 27.11.2026).
 *   Тексты примера на экране = формат сервера (server/push.py ТЕКСТЫ).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { временаДня } = await import('../src/prayer/times.ts');
const р = await import('../src/notify/schedule.ts');
const { поддержкаУведомлений } = await import('../src/notify/support.ts');
const { определитьСреду } = await import('../src/install/platform.ts');

let проверок = 0;
function тест(имя, тело) {
  тело();
  проверок += 1;
  console.log('  ✓ ' + имя);
}

const АЛМАТЫ = { широта: 43.25667, долгота: 76.92861 };
const времена = (день) => временаДня(АЛМАТЫ, день);
const мс = (строка) => Date.parse(строка); // '2026-11-20T09:00:00+05:00'
const ДЕНЬ = 86_400_000;

тест('30 дней: окно (сейчас; +30 сут], по возрастанию, ровно на минуте, без координат', () => {
  const сейчас = мс('2026-11-20T09:00:00+05:00'); // пятница, после фаджра и восхода
  const п = р.собратьРасписание({ сейчас, времена, намазы: р.НАМАЗЫ_ПО_УМОЛЧАНИЮ, заранее: 0 });
  assert.ok(п.every((х) => х.at > сейчас && х.at <= сейчас + 30 * ДЕНЬ && х.at % 60_000 === 0));
  assert.deepEqual(п.map((х) => х.at), [...п.map((х) => х.at)].sort((а, б) => а - б));
  assert.equal(п.length, 5 * 30, `5 намазов × 30 суток (сегодня: зухр…иша, через 30 сут — фаджр): ${п.length}`);
  assert.equal(п[0].key, 'dhuhr');
  assert.ok(!п.some((х) => х.key === 'sunrise'), 'восход по умолчанию выключен');
  const json = JSON.stringify(п);
  assert.ok(!/43\.2|76\.9|широт|долгот|lat|lon/i.test(json), 'в данных нет координат');
  assert.ok(json.length < 64 * 1024 * 0.6, `размер ${json.length} байт — далеко от предела сервера 64 КБ`);
});

тест('время = расчёт ДУМК по Алматы (UTC+5), правило сервера time = at + before', () => {
  const сейчас = мс('2026-11-20T00:30:00+05:00');
  const сегодня = времена('2026-11-20');
  const п = р.собратьРасписание({ сейчас, времена, намазы: { ...р.НАМАЗЫ_ПО_УМОЛЧАНИЮ, sunrise: true }, заранее: 10 });
  const первые = п.filter((х) => р.деньРК(х.at + х.before * 60_000) === '2026-11-20');
  assert.equal(первые.length, 12, 'в сутки: 6 времён × (в момент + напоминание)');
  for (const х of п) assert.equal(х.time, р.чч_мм(х.at + х.before * 60_000));
  const аср = первые.find((х) => х.key === 'asr' && х.before === 0);
  assert.equal(аср.at, сегодня.asr);
  assert.deepEqual(аср.next, { key: 'maghrib', time: р.чч_мм(сегодня.maghrib) });
  const напоминание = первые.find((х) => х.key === 'asr' && х.before === 10);
  assert.equal(напоминание.at, сегодня.asr - 10 * 60_000);
  assert.equal(напоминание.next, undefined);
  // после фаджра следующий — зухр (восход не «следующий намаз»), после восхода — тоже зухр
  assert.equal(первые.find((х) => х.key === 'fajr' && !х.before).next.key, 'dhuhr');
  assert.equal(первые.find((х) => х.key === 'sunrise' && !х.before).next.key, 'dhuhr');
  // после иши — фаджр завтра
  assert.deepEqual(первые.find((х) => х.key === 'isha' && !х.before).next, { key: 'fajr', time: р.чч_мм(времена('2026-11-21').fajr) });
  for (const [д, n] of Object.entries(п.reduce((а, х) => ({ ...а, [р.деньРК(х.at + х.before * 60_000)]: (а[р.деньРК(х.at + х.before * 60_000)] ?? 0) + 1 }), {})))
    assert.ok(n <= 12, `${д}: ${n} пунктов`);
});

тест('пояс места (владелец 20.11.2026, мир): Нью-Йорк — летнее время в расписании, off у каждого пункта; РК — off 300', () => {
  const НЬЮ_ЙОРК = { широта: 40.71, долгота: -74.01 };
  const сейчас = мс('2026-10-25T12:00:00-04:00'); // за неделю до перехода на зимнее время (1.11.2026)
  const п = р.собратьРасписание({
    сейчас,
    времена: (д) => временаДня(НЬЮ_ЙОРК, д, { страна: 'US', мазхаб: 'hanafi' }),
    намазы: р.НАМАЗЫ_ПО_УМОЛЧАНИЮ,
    заранее: 0,
    пояс: 'America/New_York',
  });
  const смещения = new Set(п.map((х) => х.off));
  assert.deepEqual([...смещения].sort(), [-240, -300]);
  for (const х of п) {
    const местное = new Date(х.at + х.off * 60_000).toISOString().slice(11, 16);
    assert.equal(х.time, местное, 'time = at + off (правило сервера)');
    assert.equal(х.time, р.чч_мм(х.at, 'America/New_York'));
  }
  const зухр = п.filter((х) => х.key === 'dhuhr').map((х) => х.time);
  assert.ok(зухр.every((т) => т >= '11:30' && т <= '13:30'), 'зухр около полудня и до, и после перехода: ' + зухр.join(' '));
  const рк = р.собратьРасписание({ сейчас: мс('2026-11-20T00:30:00+05:00'), времена, намазы: р.НАМАЗЫ_ПО_УМОЛЧАНИЮ, заранее: 0 });
  assert.ok(рк.every((х) => х.off === 300));
});

тест('сутки — по Алматы, а не по поясу телефона: 23:50 по UTC+5 — ещё «сегодня»', () => {
  const сейчас = мс('2026-11-20T23:50:00+05:00'); // = 18:50 UTC
  assert.equal(р.деньРК(сейчас), '2026-11-20');
  const п = р.собратьРасписание({ сейчас, времена, намазы: р.НАМАЗЫ_ПО_УМОЛЧАНИЮ, заранее: 0, дней: 1 });
  assert.equal(п[0].key, 'fajr');
  assert.equal(р.деньРК(п[0].at), '2026-11-21');
  assert.equal(п[0].at, времена('2026-11-21').fajr);
});

тест('пятница и суббота: зухр пятницы и субботы в расписании (текст «Джума» добавляет сервер по дню)', () => {
  const сейчас = мс('2026-11-20T06:00:00+05:00');
  const п = р.собратьРасписание({ сейчас, времена, намазы: { fajr: false, sunrise: false, dhuhr: true, asr: false, maghrib: false, isha: false }, заранее: 0, дней: 2 });
  const дни = п.map((х) => new Date(х.at + 5 * 3_600_000).getUTCDay());
  assert.deepEqual(дни, [5, 6], 'пятница (5) и суббота (6)');
  assert.ok(п.every((х) => х.key === 'dhuhr'));
});

тест('напоминание за 5/15/30 мин и выбор времён', () => {
  const сейчас = мс('2026-11-20T09:00:00+05:00');
  for (const n of [5, 15, 30]) {
    const п = р.собратьРасписание({ сейчас, времена, намазы: { fajr: false, sunrise: false, dhuhr: false, asr: true, maghrib: false, isha: false }, заранее: n, дней: 1 });
    const сегодня = времена('2026-11-20');
    assert.deepEqual(п.slice(0, 2).map((х) => [х.at, х.before]), [[сегодня.asr - n * 60_000, n], [сегодня.asr, 0]]);
  }
  // напоминание, которое уже прошло, не шлём, а сам намаз — шлём
  const сегодня = времена('2026-11-20');
  const п = р.собратьРасписание({ сейчас: сегодня.asr - 5 * 60_000, времена, намазы: { fajr: false, sunrise: false, dhuhr: false, asr: true, maghrib: false, isha: false }, заранее: 10, дней: 1 });
  assert.deepEqual([п[0].at, п[0].before], [сегодня.asr, 0]);
  assert.equal(р.концаРасписания([]), null);
  assert.equal(р.концаРасписания(п), Math.max(...п.map((х) => х.at)));
});

тест('сохранённые настройки: по умолчанию выключено, восход выключен, мусор → по умолчанию', () => {
  assert.equal(р.ПО_УМОЛЧАНИЮ.включено, false);
  assert.equal(р.ПО_УМОЛЧАНИЮ.намазы.sunrise, false);
  assert.deepEqual(р.разобратьНастройки(null), р.ПО_УМОЛЧАНИЮ);
  assert.deepEqual(р.разобратьНастройки({ версия: 2, включено: true }), р.ПО_УМОЛЧАНИЮ);
  const н = р.разобратьНастройки({ версия: 1, включено: true, намазы: { asr: false, sunrise: 'да' }, заранее: 7, отправлено: 'x', до: 5 });
  assert.equal(н.включено, true);
  assert.equal(н.намазы.asr, false);
  assert.equal(н.намазы.sunrise, false);
  assert.equal(н.заранее, 0);
  assert.equal(н.отправлено, null);
  assert.equal(н.до, 5);
});

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphone16: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (Linux; Android 14; SM-A546B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 Instagram 356.0.0.41.101 Android',
  компьютер: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};
const ВСЁ = { sw: true, push: true, уведомления: true };

тест('где можно: aiustaz.pro — да; batr.kz и localhost — пояснение «на aiustaz.pro»', () => {
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.android, хост: 'aiustaz.pro' }), ВСЁ), 'можно');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.компьютер, хост: 'www.aiustaz.pro' }), ВСЁ), 'можно');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.android, хост: 'batr.kz' }), ВСЁ), 'batr');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.android, хост: 'analytics.batr.kz' }), ВСЁ), 'batr');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.android, хост: '127.0.0.1' }), ВСЁ), 'batr');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.android, хост: 'aiustaz.pro' }), { ...ВСЁ, push: false }), 'нет-поддержки');
});

тест('iPhone: не с экрана «Домой» — объяснить; с экрана «Домой» — можно; iOS 16.3 — нельзя; Instagram — нельзя', () => {
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.iphone, хост: 'aiustaz.pro', касаний: 5 }), { sw: true, push: false, уведомления: false }), 'ios-домой');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.iphone, хост: 'aiustaz.pro', автономно: true }), ВСЁ), 'можно');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.iphone16, хост: 'aiustaz.pro', автономно: true }), ВСЁ), 'ios-старый');
  assert.equal(поддержкаУведомлений(определитьСреду({ ua: UA.instagram, хост: 'aiustaz.pro' }), ВСЁ), 'нет-поддержки');
});

// ───────────── service worker в песочнице ─────────────
const кодSW = fs.readFileSync(path.join(корень, 'public', 'push-sw.js'), 'utf8');
function песочница() {
  const обработчики = {};
  const показано = [];
  const открыто = [];
  const навигация = [];
  const окна = [];
  const self = {
    location: { origin: 'https://aiustaz.pro' },
    addEventListener: (имя, ф) => {
      обработчики[имя] = ф;
    },
    skipWaiting: () => Promise.resolve(),
    registration: { showNotification: async (заголовок, параметры) => показано.push({ заголовок, параметры }) },
    clients: {
      claim: async () => {},
      matchAll: async () => окна,
      openWindow: async (адрес) => открыто.push(адрес),
    },
  };
  // Кэш и сеть — заглушки: в песочнице проверяем только, что worker перехватывает (offline — scripts/e2e-offline.mjs).
  const кэш = { match: async () => undefined, put: async () => {}, keys: async () => [], delete: async () => true };
  const caches = { open: async () => кэш, keys: async () => [], delete: async () => true };
  const fetch = async () => ({ ok: false, type: 'basic', clone() { return this; }, json: async () => ({}) });
  vm.runInNewContext(кодSW, { self, URL, Date, Number, Array, Object, Set, JSON, console, caches, fetch, Promise });
  const ждать = async (событие) => {
    const обещания = [];
    событие.waitUntil = (п) => обещания.push(п);
    return { событие, готово: () => Promise.all(обещания) };
  };
  return { обработчики, показано, открыто, навигация, окна, ждать };
}
const данные = (объект) => ({ json: () => (typeof объект === 'string' ? JSON.parse(объект) : объект) });

тест('SW: уведомления и без сети (27.11.2026) — install, activate, fetch, message, push, notificationclick; без импорта и внешних адресов', () => {
  const п = песочница();
  assert.deepEqual(Object.keys(п.обработчики).sort(), ['activate', 'fetch', 'install', 'message', 'notificationclick', 'push']);
  assert.ok(!/importScripts|XMLHttpRequest|indexedDB|https?:\/\//.test(кодSW.replace(/\/\*[\s\S]*?\*\//g, '')));
});

тест('SW fetch: перехватывает только свои GET в /aiustaz/ — index.html и файлы с хэшем; api, media, чужие — мимо', () => {
  const п = песочница();
  const перехвачен = (url, метод = 'GET') => {
    let да = false;
    п.обработчики.fetch({ request: { url, method: метод, mode: 'cors' }, respondWith: () => (да = true) });
    return да;
  };
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/index.html'), true);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/'), true);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/quran/002.8ccaa993c357af391b0d.json'), true);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/_expo/static/js/web/index-0123456789abcdef0123456789abcdef.js'), true);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/hadith/ru/001.0123456789abcdef0123.json'), true);
  assert.equal(перехвачен('https://aiustaz.pro/api/push/key'), false);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/media/lesson.mp4'), false);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/privacy.html'), false);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/push-sw.js'), false);
  assert.equal(перехвачен('https://batr.kz/aiustaz/quran/002.8ccaa993c357af391b0d.json'), false);
  assert.equal(перехвачен('https://aiustaz.pro/aiustaz/quran/002.8ccaa993c357af391b0d.json', 'POST'), false);
});

const НАГРУЗКА = {
  v: 1,
  kind: 'prayer',
  title: 'Аср · 14:39',
  body: 'Алматы',
  tag: 'aiustaz-asr-2026-11-20',
  url: '#/prayer',
  actions: [{ action: 'prayer', title: 'Время намаза' }, { action: 'qibla', title: 'Кибла' }, { action: 'evil', title: 'x' }],
  silent: false,
  lang: 'ru',
  ts: 1795167540000,
};

for (const [имя, ф] of Object.entries({
  'SW: push → уведомление с эмблемой, значком, тегом и двумя кнопками': async () => {
    const п = песочница();
    const { событие, готово } = await п.ждать({ data: данные(НАГРУЗКА) });
    п.обработчики.push(событие);
    await готово();
    assert.equal(п.показано.length, 1);
    const { заголовок, параметры } = п.показано[0];
    assert.equal(заголовок, 'Аср · 14:39');
    assert.equal(параметры.body, НАГРУЗКА.body);
    assert.equal(параметры.tag, 'aiustaz-asr-2026-11-20');
    assert.equal(параметры.icon, '__ЗНАЧОК__', 'исходник: метку подставит after-export');
    assert.equal(параметры.badge, '__ЗНАЧОК_МОНО__');
    assert.equal(параметры.silent, false);
    assert.equal(параметры.renotify, false);
    assert.equal(параметры.timestamp, НАГРУЗКА.ts);
    assert.deepEqual(параметры.actions.map((к) => к.action), ['prayer', 'qibla'], 'чужая кнопка отброшена');
    assert.deepEqual({ ...параметры.data }, { адрес: '#/prayer' });
  },
  'SW: тихое «обновите время», чужой адрес → #/prayer, мусор не показывается': async () => {
    const п = песочница();
    for (const д of [{ ...НАГРУЗКА, kind: 'refresh', silent: true, url: '#/notifications', actions: [] }, { ...НАГРУЗКА, url: 'https://evil.kz/' }, { title: '' }, 'не json']) {
      const { событие, готово } = await п.ждать({ data: { json: () => (typeof д === 'string' ? JSON.parse(д) : д) } });
      п.обработчики.push(событие);
      await готово();
    }
    assert.equal(п.показано.length, 2);
    assert.equal(п.показано[0].параметры.silent, true);
    assert.equal(п.показано[0].параметры.data.адрес, '#/notifications');
    assert.equal(п.показано[1].параметры.data.адрес, '#/prayer');
  },
  'SW: нажатие — новое окно /aiustaz/index.html#/prayer; кнопка «Кибла» — #/qibla; открытое окно — фокус и переход': async () => {
    const п = песочница();
    let закрыто = 0;
    const уведомление = { data: { адрес: '#/prayer' }, close: () => (закрыто += 1) };
    let { событие, готово } = await п.ждать({ notification: уведомление, action: '' });
    п.обработчики.notificationclick(событие);
    await готово();
    assert.deepEqual(п.открыто, ['https://aiustaz.pro/aiustaz/index.html#/prayer']);
    ({ событие, готово } = await п.ждать({ notification: уведомление, action: 'qibla' }));
    п.обработчики.notificationclick(событие);
    await готово();
    assert.equal(п.открыто[1], 'https://aiustaz.pro/aiustaz/index.html#/qibla');
    let фокус = 0;
    const переходы = [];
    п.окна.push({ url: 'https://aiustaz.pro/aiustaz/index.html#/', focus: async () => (фокус += 1), navigate: async (а) => переходы.push(а) });
    ({ событие, готово } = await п.ждать({ notification: уведомление, action: 'prayer' }));
    п.обработчики.notificationclick(событие);
    await готово();
    assert.equal(фокус, 1);
    assert.deepEqual(переходы, ['https://aiustaz.pro/aiustaz/index.html#/prayer']);
    assert.equal(п.открыто.length, 2, 'новое окно не открывали');
    assert.equal(закрыто, 3);
  },
})) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}

тест('пример на экране = формат текстов сервера (server/push.py)', () => {
  const сервер = fs.readFileSync(path.join(корень, '..', 'server', 'push.py'), 'utf8');
  const экран = fs.readFileSync(path.join(корень, 'src', 'screens', 'NotificationsScreen.tsx'), 'utf8');
  // Владелец 28.11.2026: как Sajda — заголовок «Намаз · время», текст — только место.
  assert.ok(сервер.includes('        текст = город\n'), 'server/push.py: текст уведомления — только место');
  assert.ok(!сервер.includes("'наступило'") && !сервер.includes("'следующий'"), 'server/push.py: без «Наступило…» и «Следующий…»');
  assert.equal((экран.match(/примерТекст: '\{город\}'/g) || []).length, 4, 'экран: пример — только место (ru, kk, uz, en)');
});

тест('лицензии сервера: экран «Лицензии» = server/requirements.txt, тексты в licenses/server', () => {
  const пакеты = JSON.parse(fs.readFileSync(path.join(корень, 'src', 'legal', 'server-licenses.json'), 'utf8'));
  // requirements.txt — API; requirements-asr.txt — служба распознавания речи чата (владелец 27.11.2026); не-pip
  // зависимости сервера (веса Whisper, Tesseract) — тоже на экране, но без версии pip.
  const треб = ['requirements.txt', 'requirements-asr.txt'].map((ф) => fs.readFileSync(path.join(корень, '..', 'server', ф), 'utf8')).join('\n');
  const версии = Object.fromEntries([...треб.matchAll(/^([a-z0-9-]+)(?:\[[a-z]+\])?==([0-9.]+)/gim)].map((м) => [м[1].toLowerCase(), м[2]]));
  const неPip = new Set(['whisper-weights', 'tesseract']);
  assert.deepEqual(Object.fromEntries(пакеты.filter((п) => !неPip.has(п.пакет)).map((п) => [п.пакет, п.версия])), версии);
  assert.equal(пакеты.find((п) => п.пакет === 'pywebpush').лицензия, 'MPL-2.0');
  const тексты = fs.readdirSync(path.join(корень, '..', 'licenses', 'server'));
  for (const п of пакеты.filter((п) => п.пакет !== 'http-ece')) assert.ok(тексты.some((т) => т.startsWith(п.пакет + '-')), 'нет текста лицензии ' + п.пакет);
});

console.log(`OK: ${проверок} проверок`);
