#!/usr/bin/env node
/**
 * Плеер чтения кари в настоящем браузере (Playwright, Chromium): node scripts/e2e-audio.mjs  (часть npm run test:audio)
 *
 * Зачем: «слушать, и когда экран выключен» (владелец 19.11.2026) держится на поведении НАСТОЯЩЕГО <audio> и
 * Media Session — смена src по `ended`, blob предзагрузки под CSP, обработчики экрана блокировки. Здесь ровно
 * модули приложения src/audio/core.ts, web.ts, texts.ts (типы снимает node:module stripTypeScriptTypes, без сборки)
 * собраны так же, как в src/audio/player.ts, только источник — ТЕСТОВЫЙ: короткие синусоидальные тоны, которые
 * тест сам генерирует (WAV 8 кГц, НЕ Коран и не голос). Тестовый источник существует только в этом файле;
 * content/audio-sources.json и сборка его не знают.
 *
 * Сервер — node:http на 127.0.0.1 (порт 0) с CSP приложения (scripts/after-export.mjs ПОЛИТИКА) и Range-ответами.
 * Проверяется:
 *   1. нажатие «Слушать» (настоящий жест) → бисмилла → аяты 1…3 по `ended` → «стоп» в конце отрезка; аяты 2 и 3 —
 *      из blob предзагрузки (media-src 'self' blob:), запросы предзагрузки — без cookie;
 *   2. Media Session: обработчики play, pause, previoustrack, nexttrack, stop, seekto; metadata «Сура 114 · аят 2»,
 *      «Тестовый тон», «AI Ustaz» — ни одной арабской буквы; playbackState; setPositionState с длительностью тона;
 *   3. повтор аята ×3 — три проигрыша одного файла без смены src; отрезок по кругу 1→2→1→2 до «стоп» с экрана блокировки;
 *   4. действия экрана блокировки на длинном тоне: pause/play/nexttrack/previoustrack/seekto/stop;
 *   5. файла нет (404) → «нет-файла», без падения; «Повторить» после появления файла — играет;
 *   6. localStorage — только aiustaz:quran-player.v1 { версия, сура, аят, повторАята };
 *   7. модули плеера не заводят таймеров (в фоне их душат); ни одного запроса на чужой адрес, ни одной ошибки CSP.
 * Выключенный экран headless-браузер не изображает: на телефоне это проверяется руками (docs/дизайн/05, §2.3.1).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ───────────────────────── Фикстуры: тоны (не Коран) ─────────────────────────
/** WAV PCM 16 бит, моно: синус частоты гц длительностью сек, тихо, с плавными краями. */
function тон(сек, гц, дискр = 8000) {
  const n = Math.round(сек * дискр);
  const б = Buffer.alloc(44 + n * 2);
  б.write('RIFF', 0);
  б.writeUInt32LE(36 + n * 2, 4);
  б.write('WAVEfmt ', 8);
  б.writeUInt32LE(16, 16);
  б.writeUInt16LE(1, 20);
  б.writeUInt16LE(1, 22);
  б.writeUInt32LE(дискр, 24);
  б.writeUInt32LE(дискр * 2, 28);
  б.writeUInt16LE(2, 32);
  б.writeUInt16LE(16, 34);
  б.write('data', 36);
  б.writeUInt32LE(n * 2, 40);
  const край = Math.min(200, n / 4);
  for (let i = 0; i < n; i++) {
    const огибающая = Math.min(1, i / край, (n - 1 - i) / край);
    б.writeInt16LE(Math.round(Math.sin((2 * Math.PI * гц * i) / дискр) * 2000 * огибающая), 44 + i * 2);
  }
  return б;
}
const три = (н) => String(н).padStart(3, '0');
const ФАЙЛЫ = new Map();
ФАЙЛЫ.set('/aiustaz-audio/test/bismillah.wav', тон(0.3, 330));
for (const [сура, аятов, сек] of [[114, 6, 0.35], [113, 2, 0.35], [112, 4, 0.35], [2, 4, 2.5]])
  for (let а = 1; а <= аятов; а++) ФАЙЛЫ.set(`/aiustaz-audio/test/${три(сура)}${три(а)}.wav`, тон(сек, 400 + а * 60));
// 113:3 нет — проверка 404 (появляется позже для «Повторить»).

// ───────────────────────── Модули плеера (как есть, без типов) ─────────────────────────
function модуль(имя) {
  const исходник = fs.readFileSync(path.join(корень, 'src', 'audio', имя + '.ts'), 'utf8');
  const js = stripTypeScriptTypes(исходник, { mode: 'strip' });
  assert.ok(!/^\s*import\s+(?!type\b)/m.test(js.replace(/^\s*import\s+type[^;]*;/gm, '')), `${имя}.ts: импорт кода — модуль должен быть без импортов`);
  return js;
}
const МОДУЛИ = { core: модуль('core'), web: модуль('web'), texts: модуль('texts') };

const ПОЛИТИКА = (() => {
  const текст = fs.readFileSync(path.join(корень, 'scripts', 'after-export.mjs'), 'utf8');
  const м = текст.match(/export const ПОЛИТИКА = \[([\s\S]*?)\]\.join\('; '\)/);
  assert.ok(м, 'нет ПОЛИТИКА в after-export.mjs');
  return [...м[1].matchAll(/"([^"]+)"/g)].map((х) => х[1]).join('; ');
})();

const СТРАНИЦА = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${ПОЛИТИКА}">
<title>Плеер — тест</title></head><body>
<button id="тон-114">114: 1–3, бисмилла</button>
<button id="повтор-112">112:2 ×3</button>
<button id="круг-113">113: 1–2 по кругу</button>
<button id="длинный-2">2: 1–4</button>
<button id="нет-113">113:3 (нет файла)</button>
<script type="module" src="/aiustaz/harness.js"></script>
</body></html>`;

const СТЕНД = `
import { создатьПлеер } from './audio/core.js';
import { зависимостиВеба } from './audio/web.js';
import { названиеДляСессии } from './audio/texts.js';

// ТЕСТОВЫЙ источник: тоны, сгенерированные тестом. Разрешение — только здесь (в приложении: content/audio-sources.json).
const источник = { id: 'test-tone', кари: { ru: 'Тестовый тон', kk: 'Сынақ үні', ar: null }, база: '/aiustaz-audio/test',
  шаблон: '{sura3}{aya3}.wav', бисмилла: 'bismillah.wav', разрешено: true, датаРазрешения: '2026-11-19', условия: 'тест',
  атрибуция: { ru: 'Тест', kk: 'Тест' } };
const веб = зависимостиВеба();
const журнал = { снимки: [], проигрыши: [] };
let элемент = null;
const плеер = создатьПлеер({
  ...веб,
  источник: () => источник,
  подписи: (сура, ш, из) => ({
    название: названиеДляСессии({ язык: 'ru', сура, аят: ш.вид === 'аят' ? ш.аят : 1, транслит: null,
      бисмилла: ш.вид === 'бисмилла', повтор: ш.вид === 'аят' ? ш.повтор : 1, из }),
    исполнитель: источник.кари.ru,
    альбом: 'AI Ustaz',
  }),
  создатьЭлемент: () => {
    элемент = веб.создатьЭлемент();
    элемент.addEventListener('playing', () => {
      const т = плеер.снимок().текущий;
      журнал.проигрыши.push({ src: элемент.src, аят: т && т.аят, повтор: т && т.повтор, бисмилла: !!(т && т.бисмилла) });
    });
    return элемент;
  },
});
плеер.подписаться(() => {
  const с = плеер.снимок();
  журнал.снимки.push({ состояние: с.состояние, ошибка: с.ошибка ?? null, сура: с.текущий?.сура ?? null, аят: с.текущий?.аят ?? null,
    повтор: с.текущий?.повтор ?? null, бисмилла: с.текущий?.бисмилла ?? null });
});
const кнопки = {
  'тон-114': { сура: 114, сАята: 1, поАят: 3, бисмиллаПеред: true },
  'повтор-112': { сура: 112, сАята: 2, поАят: 2, повторАята: 3 },
  'круг-113': { сура: 113, сАята: 1, поАят: 2, повторАята: 1, повторОтрезка: true, бисмиллаПеред: false },
  'длинный-2': { сура: 2, сАята: 1, поАят: 4, повторАята: 1, бисмиллаПеред: false },
  'нет-113': { сура: 113, сАята: 3, поАят: 3, повторАята: 1 },
};
for (const [id, запрос] of Object.entries(кнопки))
  document.getElementById(id).addEventListener('click', () => плеер.играть(запрос)); // синхронно из жеста
window.тест = { плеер, журнал, элемент: () => элемент, сброс: () => { журнал.снимки.length = 0; журнал.проигрыши.length = 0; } };
document.body.dataset.готово = '1';
`;

// ───────────────────────── Сервер ─────────────────────────
const запросы = [];
let есть113_3 = false;
const сервер = http.createServer((з, о) => {
  const адрес = new URL(з.url ?? '/', 'http://x');
  запросы.push({ путь: адрес.pathname, cookie: з.headers.cookie ?? null, range: з.headers.range ?? null, referer: з.headers.referer ?? null });
  const путь = decodeURIComponent(адрес.pathname);
  if (путь === '/aiustaz/harness.html') return отдать(о, 200, 'text/html; charset=utf-8', СТРАНИЦА, { 'content-security-policy': ПОЛИТИКА });
  if (путь === '/aiustaz/harness.js') return отдать(о, 200, 'application/javascript; charset=utf-8', СТЕНД);
  const м = путь.match(/^\/aiustaz\/audio\/(core|web|texts)\.js$/);
  if (м) return отдать(о, 200, 'application/javascript; charset=utf-8', МОДУЛИ[м[1]]);
  if (путь === '/aiustaz-audio/test/113003.wav' && есть113_3) return медиа(з, о, тон(0.35, 700));
  if (ФАЙЛЫ.has(путь)) return медиа(з, о, ФАЙЛЫ.get(путь));
  отдать(о, 404, 'text/plain; charset=utf-8', 'нет');
});
function отдать(о, код, тип, тело, заголовки = {}) {
  о.writeHead(код, { 'content-type': тип, 'cache-control': 'no-store', ...заголовки });
  о.end(тело);
}
function медиа(з, о, б) {
  const r = /^bytes=(\d*)-(\d*)$/.exec(з.headers.range ?? '');
  if (!r) {
    о.writeHead(200, { 'content-type': 'audio/wav', 'content-length': б.length, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
    return о.end(б);
  }
  const с = r[1] ? Number(r[1]) : 0;
  const по = r[2] ? Math.min(Number(r[2]), б.length - 1) : б.length - 1;
  о.writeHead(206, { 'content-type': 'audio/wav', 'content-length': по - с + 1, 'content-range': `bytes ${с}-${по}/${б.length}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
  о.end(б.subarray(с, по + 1));
}
await new Promise((р) => сервер.listen(0, '127.0.0.1', р));
const ИСТОК = `http://127.0.0.1:${сервер.address().port}`;

// ───────────────────────── Браузер ─────────────────────────
const НАБЛЮДАТЕЛЬ = () => {
  const мс = navigator.mediaSession;
  const з = { действия: {}, позиции: [], метаданные: [], состояния: [], таймеры: [] };
  window.__мс = з;
  for (const имя of ['setTimeout', 'setInterval']) {
    const исх = window[имя];
    window[имя] = function (...а) {
      з.таймеры.push(String(new Error().stack));
      return исх.apply(this, а);
    };
  }
  if (!мс) return;
  const исхДействие = мс.setActionHandler.bind(мс);
  мс.setActionHandler = (д, ф) => {
    з.действия[д] = ф;
    return исхДействие(д, ф);
  };
  const исхПозиция = мс.setPositionState?.bind(мс);
  if (исхПозиция)
    мс.setPositionState = (с) => {
      з.позиции.push(с);
      return исхПозиция(с);
    };
  const прото = Object.getPrototypeOf(мс);
  for (const [поле, куда] of [['metadata', 'метаданные'], ['playbackState', 'состояния']]) {
    const оп = Object.getOwnPropertyDescriptor(прото, поле);
    Object.defineProperty(мс, поле, {
      configurable: true,
      get: () => оп.get.call(мс),
      set: (в) => {
        з[куда].push(поле === 'metadata' ? (в ? { title: в.title, artist: в.artist, album: в.album, artwork: в.artwork.length } : null) : в);
        оп.set.call(мс, в);
      },
    });
  }
};

let проверок = 0;
async function тест(имя, ф) {
  await ф();
  проверок += 1;
  console.log('  ✓ ' + имя);
}

const браузер = await chromium.launch();
const ошибкиКонсоли = [];
const чужие = [];
let код = 0;
try {
  const контекст = await браузер.newContext({ locale: 'ru-RU' });
  const страница = await контекст.newPage();
  страница.on('console', (с) => {
    if (с.type() !== 'error') return;
    // Ожидаемо: 404 файла 113:3 (проверка «нет-файла»).
    if (/Failed to load resource: the server responded with a status of 404/.test(с.text())) return;
    ошибкиКонсоли.push(с.text());
  });
  страница.on('pageerror', (е) => ошибкиКонсоли.push('исключение: ' + е.message));
  страница.on('request', (з) => {
    const u = з.url();
    if (!u.startsWith(ИСТОК + '/') && !u.startsWith('blob:') && !u.startsWith('data:')) чужие.push(u);
  });
  await страница.addInitScript(НАБЛЮДАТЕЛЬ);
  await страница.goto(ИСТОК + '/aiustaz/harness.html');
  await страница.waitForSelector('body[data-готово="1"]');
  const жд = (условие, арг, мс = 20000) => страница.waitForFunction(условие, арг, { timeout: мс, polling: 50 });

  console.log('Плеер в Chromium (тестовые тоны, не Коран)');
  await тест('до нажатия — ничего не грузится и не играет; Media Session есть', async () => {
    assert.equal(запросы.filter((з) => з.путь.startsWith('/aiustaz-audio/')).length, 0);
    assert.equal(await страница.evaluate(() => 'mediaSession' in navigator && typeof MediaMetadata === 'function'), true);
    assert.equal(await страница.evaluate(() => window.тест.плеер.снимок().состояние), 'стоп');
  });

  await тест('нажатие «Слушать» → бисмилла → 1 → 2 → 3 по `ended` одного <audio> → «стоп»; 2 и 3 — из blob предзагрузки', async () => {
    await страница.click('#тон-114');
    await жд(() => window.тест.журнал.снимки.some((с) => с.аят === 3) && window.тест.плеер.снимок().состояние === 'стоп');
    const { проигрыши, снимки } = await страница.evaluate(() => window.тест.журнал);
    assert.deepEqual(проигрыши.map((п) => (п.бисмилла ? 'б' : String(п.аят))), ['б', '1', '2', '3']);
    assert.match(проигрыши[0].src, /\/aiustaz-audio\/test\/bismillah\.wav$/, 'первый файл — прямой адрес (предзагрузки ещё не было)');
    for (const п of проигрыши.slice(1)) assert.match(п.src, /^blob:/, `аят ${п.аят} — из предзагрузки`);
    assert.ok(!снимки.some((с) => с.состояние === 'пауза' || с.состояние === 'ошибка'), 'между аятами нет ложной паузы');
    assert.equal(снимки.at(-1).состояние, 'стоп');
    const предзагрузки = запросы.filter((з) => /\/11400[123]\.wav$/.test(з.путь));
    assert.ok(предзагрузки.length >= 3);
    assert.ok(предзагрузки.every((з) => з.cookie == null && з.referer == null), 'без cookie и referrer');
  });

  await тест('Media Session: шесть действий, metadata без арабского (сура и аят, кари, AI Ustaz), playbackState, позиция', async () => {
    const мс = await страница.evaluate(() => ({ ...window.__мс, действия: Object.keys(window.__мс.действия).sort() }));
    assert.deepEqual(мс.действия, ['nexttrack', 'pause', 'play', 'previoustrack', 'seekto', 'stop']);
    const заголовки = мс.метаданные.filter(Boolean).map((м) => м.title);
    assert.deepEqual([...new Set(заголовки)], ['Сура 114 · бисмилла', 'Сура 114 · аят 1', 'Сура 114 · аят 2', 'Сура 114 · аят 3']);
    for (const м of мс.метаданные.filter(Boolean)) {
      assert.equal(м.artist, 'Тестовый тон');
      assert.equal(м.album, 'AI Ustaz');
      assert.equal(м.artwork, 0, 'без обложки (растр запрещён)');
      assert.ok(!/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(м.title + м.artist + м.album), 'правило 9');
    }
    assert.equal(мс.метаданные.at(-1), null, 'после «стоп» подписи убраны');
    assert.ok(мс.состояния.includes('playing'));
    assert.equal(мс.состояния.at(-1), 'none');
    assert.ok(мс.позиции.some((п) => Math.abs(п.duration - 0.35) < 0.05 && п.playbackRate === 1), JSON.stringify(мс.позиции.slice(0, 3)));
    assert.equal(await страница.evaluate(() => navigator.mediaSession.metadata), null);
  });

  await тест('повтор аята ×3: три проигрыша одного файла без смены src, затем «стоп»', async () => {
    await страница.evaluate(() => window.тест.сброс());
    await страница.click('#повтор-112');
    await жд(() => window.тест.журнал.проигрыши.length >= 3 && window.тест.плеер.снимок().состояние === 'стоп');
    const { проигрыши } = await страница.evaluate(() => window.тест.журнал);
    assert.deepEqual(проигрыши.map((п) => `${п.аят}.${п.повтор}`), ['2.1', '2.2', '2.3']);
    assert.equal(new Set(проигрыши.map((п) => п.src)).size, 1, 'тот же файл');
    const заголовки = await страница.evaluate(() => window.__мс.метаданные.filter(Boolean).map((м) => м.title));
    assert.ok(заголовки.includes('Сура 112 · аят 2 (повтор 3 из 3)'));
  });

  await тест('отрезок по кругу 1→2→1→2…; «стоп» с экрана блокировки', async () => {
    await страница.evaluate(() => window.тест.сброс());
    await страница.click('#круг-113');
    await жд(() => window.тест.журнал.проигрыши.length >= 5);
    await страница.evaluate(() => window.__мс.действия.stop({ action: 'stop' }));
    const { проигрыши } = await страница.evaluate(() => window.тест.журнал);
    assert.deepEqual(проигрыши.slice(0, 5).map((п) => п.аят), [1, 2, 1, 2, 1]);
    assert.equal(await страница.evaluate(() => window.тест.плеер.снимок().состояние), 'стоп');
    assert.equal(await страница.evaluate(() => window.тест.элемент().paused), true);
  });

  await тест('экран блокировки на длинном тоне: pause → play → nexttrack → previoustrack → seekto → stop', async () => {
    await страница.evaluate(() => window.тест.сброс());
    await страница.click('#длинный-2');
    await жд(() => window.тест.плеер.снимок().состояние === 'играет');
    const действие = (д, детали = {}) => страница.evaluate(([д, детали]) => window.__мс.действия[д]({ action: д, ...детали }), [д, детали]);
    await действие('pause');
    assert.deepEqual(await страница.evaluate(() => [window.тест.плеер.снимок().состояние, window.тест.элемент().paused, navigator.mediaSession.playbackState]), ['пауза', true, 'paused']);
    await действие('play');
    await жд(() => window.тест.плеер.снимок().состояние === 'играет');
    await действие('nexttrack');
    await жд(() => window.тест.плеер.снимок().текущий?.аят === 2 && window.тест.плеер.снимок().состояние === 'играет');
    await действие('previoustrack');
    await жд(() => window.тест.плеер.снимок().текущий?.аят === 1 && window.тест.плеер.снимок().состояние === 'играет');
    await действие('seekto', { seekTime: 1.5 });
    const позиция = await страница.evaluate(() => window.тест.элемент().currentTime);
    assert.ok(позиция >= 1.4 && позиция < 2.5, String(позиция));
    await действие('stop');
    assert.equal(await страница.evaluate(() => window.тест.плеер.снимок().состояние), 'стоп');
    assert.equal(await страница.evaluate(() => navigator.mediaSession.playbackState), 'none');
  });

  await тест('файла нет (404) → «нет-файла» без падения; файл появился → «Повторить» играет', async () => {
    await страница.evaluate(() => window.тест.сброс());
    await страница.click('#нет-113');
    await жд(() => window.тест.плеер.снимок().состояние === 'ошибка');
    assert.equal(await страница.evaluate(() => window.тест.плеер.снимок().ошибка), 'нет-файла');
    есть113_3 = true;
    await страница.evaluate(() => window.тест.плеер.продолжить());
    await жд(() => window.тест.журнал.проигрыши.some((п) => п.аят === 3) && window.тест.плеер.снимок().состояние === 'стоп');
  });

  await тест('localStorage — только aiustaz:quran-player.v1 с номерами (без записей и персональных данных)', async () => {
    const хр = await страница.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((к) => [к, localStorage.getItem(к)])));
    assert.deepEqual(Object.keys(хр), ['aiustaz:quran-player.v1']);
    assert.deepEqual(JSON.parse(хр['aiustaz:quran-player.v1']), { версия: 1, сура: 113, аят: 3, повторАята: 1 });
  });

  await тест('модули плеера не заводят таймеров; запросов на чужие адреса нет; ошибок консоли и CSP нет', async () => {
    const таймеры = await страница.evaluate(() => window.__мс.таймеры);
    assert.deepEqual(таймеры.filter((с) => /\/aiustaz\/(audio\/|harness)/.test(с)), []);
    assert.deepEqual(чужие, []);
    assert.deepEqual(ошибкиКонсоли, []);
  });
  console.log(`\nOK: ${проверок} проверок в Chromium`);
} catch (е) {
  код = 1;
  console.error(е);
} finally {
  await браузер.close();
  сервер.close();
}
process.exit(код);
